import { useState, useEffect, useMemo } from "react";
import { useImportStoreForDailyAttendance } from "@/store/import";
import { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { useNavigate } from "@remix-run/react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { createDailyAttendancesFromImportedData } from "@canny_ecosystem/supabase/mutations";
import { isGoodStatus } from "@canny_ecosystem/utils";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { CreateUnmatchedEmployeePanel } from "./create-unmatched-employee-panel";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";

export function EmployeeDailyAttendanceImportData({
  env,
  session,
  intent,
  companyId,
  matchingKey = "employee_code",
  onBack,
}: {
  env: SupabaseEnv;
  session?: Session | null;
  intent?: string;
  companyId: string;
  matchingKey?: string;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env, session });
  const { importData, setImportData } = useImportStoreForDailyAttendance();

  const [searchString, setSearchString] = useState("");
  const [tableData, setTableData] = useState(importData?.data || []);
  const [isImporting, setIsImporting] = useState(false);

  const [enhancedData, setEnhancedData] = useState<any[]>(
    importData?.data || [],
  );
  const [showUnmatchedView, setShowUnmatchedView] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set());

  const formatExcelID = (val: any) => {
    if (val === undefined || val === null || val === "") return "";

    if (typeof val === "number") {
      if (val > 1000000) {
        return BigInt(Math.round(val)).toString();
      }
      return String(val);
    }

    const strVal = String(val).trim();
    const num = Number(strVal);
    if (!isNaN(num) && strVal.length > 0) {
      if (num > 1000000) {
        return BigInt(Math.round(num)).toString();
      }
    }
    return strVal;
  };

  useEffect(() => {
    let active = true;
    async function fetchDetails() {
      const identifiers = Array.from(
        new Set(
          importData?.data
            ?.map((d: any) => String(d[matchingKey] || "").trim())
            .filter(Boolean),
        ),
      );

      if (identifiers.length === 0) return;

      let allEmps: any[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("employees")
          .select(
            "id, employee_code, first_name, middle_name, last_name, employee_statutory_details(uan_number), work_details(site_id, sites(name))",
          )
          .eq("company_id", companyId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error || !data || data.length === 0) break;
        allEmps = [...allEmps, ...data];
        if (data.length < pageSize) break;
        page++;
      }

      let allSites: any[] = [];
      const { data: sitesData } = await supabase
        .from("sites")
        .select("id, name")
        .eq("company_id", companyId);
      allSites = sitesData || [];

      if (allEmps.length === 0 || !active) return;

      const getWords = (val: any) => {
        if (!val) return [];
        let s = String(val).toLowerCase();
        s = s.replace(/\bnull\b/g, "");
        s = s.replace(/\b(mr|mrs|ms)\b/g, " ");
        return s
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 0)
          .sort();
      };

      const getEmployeeSiteNames = (emp: any): string[] => {
        if (!emp.work_details) return [];
        const wds = Array.isArray(emp.work_details)
          ? emp.work_details
          : [emp.work_details];
        return wds
          .map((wd: any) => {
            if (!wd) return null;
            if (typeof wd.sites === "string") return wd.sites;
            if (wd.sites?.name) return wd.sites.name;
            if (Array.isArray(wd.sites) && wd.sites[0]?.name)
              return wd.sites[0].name;
            if (wd.site?.name) return wd.site.name;
            return null;
          })
          .filter(Boolean);
      };

      const normalizeSiteName = (name: any) => {
        return String(name || "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]/g, "");
      };

      const isSiteMatch = (sheetName: string, siteNames: string[]) => {
        if (!sheetName || siteNames.length === 0) return false;
        const normalizedSheet = normalizeSiteName(sheetName);
        if (!normalizedSheet) return false;

        return siteNames.some((siteName) => {
          const normalizedSite = normalizeSiteName(siteName);
          if (!normalizedSite) return false;
          return (
            normalizedSheet === normalizedSite ||
            normalizedSheet.includes(normalizedSite) ||
            normalizedSite.includes(normalizedSheet)
          );
        });
      };

      const isSheetNameASite = (sheetName: string) => {
        if (!sheetName) return false;
        const allSiteNames = allSites.map((s) => s.name).filter(Boolean);
        return isSiteMatch(sheetName, allSiteNames);
      };

      const wordsMatch = (inputWords: string[], targetWords: string[]) => {
        if (inputWords.length === 0 || targetWords.length === 0) return false;

        const inputSet = new Set(inputWords);
        const targetSet = new Set(targetWords);

        const common = inputWords.filter((w) => targetSet.has(w));
        const inputLeftovers = inputWords.filter((w) => !targetSet.has(w));
        const targetLeftovers = targetWords.filter((w) => !inputSet.has(w));

        if (inputLeftovers.length === 0 && targetLeftovers.length === 0)
          return true;

        const minCommon = Math.min(inputWords.length, targetWords.length, 2);
        if (common.length < minCommon) return false;

        if (inputLeftovers.length <= 1 && targetLeftovers.length <= 1) {
          if (inputLeftovers.length === 0 || targetLeftovers.length === 0)
            return true;
          const w1 = inputLeftovers[0];
          const w2 = targetLeftovers[0];
          return (
            (w1.length === 1 && w2.startsWith(w1)) ||
            (w2.length === 1 && w1.startsWith(w2))
          );
        }
        return false;
      };

      const normalize = (val: any) =>
        String(val || "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]/g, "");

      let currentSiteName: string | null = null;

      const newEnhanced = importData?.data?.map((item: any) => {
        const rawName = (item as any).employee_name || "";
        const normalizedRawName = normalizeSiteName(rawName);

        // 1. Check if the row's Name column matches any database site name
        const nameMatchingSite = allSites.find((s) => {
          const normalizedSite = normalizeSiteName(s.name);
          return (
            normalizedSite &&
            normalizedRawName &&
            (normalizedRawName === normalizedSite ||
              normalizedRawName.includes(normalizedSite) ||
              normalizedSite.includes(normalizedRawName))
          );
        });

        // 2. Check if any cell in the raw row matches any database site name
        let cellMatchingSiteName: string | null = null;
        const rawRow = (item as any).raw_row || {};
        const cells = Object.values(rawRow).map((v) => String(v || "").trim());
        for (const cell of cells) {
          if (!cell) continue;
          const normalizedCell = normalizeSiteName(cell);
          const matchedSite = allSites.find((s) => {
            const normalizedSite = normalizeSiteName(s.name);
            return (
              normalizedSite &&
              normalizedCell &&
              (normalizedCell === normalizedSite ||
                normalizedCell.includes(normalizedSite) ||
                normalizedSite.includes(normalizedCell))
            );
          });
          if (matchedSite) {
            cellMatchingSiteName = matchedSite.name;
            break;
          }
        }

        // If we found a site name in this row, update currentSiteName
        if (nameMatchingSite) {
          currentSiteName = nameMatchingSite.name;
        } else if (cellMatchingSiteName) {
          currentSiteName = cellMatchingSiteName;
        }

        // A row is a site header if the name matches a site name AND it has no code/UAN
        const isCodeEmpty =
          !(item as any).employee_code ||
          String((item as any).employee_code).trim() === "";
        const isUanEmpty =
          !(item as any).uan_number ||
          String((item as any).uan_number).trim() === "";
        const isSiteHeader = !!nameMatchingSite && isCodeEmpty && isUanEmpty;

        if (isSiteHeader) {
          return {
            ...item,
            is_site_header: true,
            is_new_employee: false,
            is_missing_matching_key: false,
          };
        }

        const itemRawName = String(item.employee_name || "").trim();
        const itemCode = normalize(item.employee_code);
        const itemUan = normalize(item.uan_number);
        const itemWords = getWords(itemRawName);
        const sheetName = item.sheet_name;
        const activeSite = currentSiteName || sheetName;

        const matchingVal = String(item[matchingKey] || "").trim();
        const isMissingMatchingKey =
          !matchingVal ||
          matchingVal === "null" ||
          matchingVal === "undefined" ||
          matchingVal === "-";

        let matchedData: any = null;
        if (matchingKey === "employee_code") {
          const itemCode = normalize(item.employee_code);
          matchedData = allEmps?.find(
            (e) => itemCode && normalize(e.employee_code) === itemCode,
          );
        } else if (matchingKey === "uan_number") {
          const itemUan = normalize(item.uan_number);
          matchedData = allEmps?.find((e) => {
            const uan = !Array.isArray(e.employee_statutory_details)
              ? e.employee_statutory_details?.uan_number
              : Array.isArray(e.employee_statutory_details) &&
                e.employee_statutory_details.length > 0
                ? e.employee_statutory_details[0].uan_number
                : null;
            return itemUan && normalize(uan) === itemUan;
          });
        } else if (matchingKey === "employee_name") {
          if (itemWords.length >= 1) {
            let candidates = allEmps
              ?.map((e) => {
                const dbWords = getWords(
                  `${e.first_name} ${e.middle_name || ""} ${e.last_name || ""}`,
                );

                if (itemWords.length === 0 || dbWords.length === 0) return null;

                const inputSet = new Set(itemWords);
                const targetSet = new Set(dbWords);

                const common = itemWords.filter((w) => targetSet.has(w));
                const inputLeftovers = itemWords.filter(
                  (w) => !targetSet.has(w),
                );
                const targetLeftovers = dbWords.filter((w) => !inputSet.has(w));

                const isExact =
                  inputLeftovers.length === 0 && targetLeftovers.length === 0;
                if (isExact) {
                  return { employee: e, score: 0 };
                }

                const minCommon = Math.min(itemWords.length, dbWords.length, 2);
                const w1 = inputLeftovers[0];
                const w2 = targetLeftovers[0];
                const hasInitialMatch =
                  inputLeftovers.length === 1 &&
                  targetLeftovers.length === 1 &&
                  w1 &&
                  w2 &&
                  ((w1.length === 1 && w2.startsWith(w1)) ||
                    (w2.length === 1 && w1.startsWith(w2)));

                const adjustedMinCommon = hasInitialMatch ? 1 : minCommon;
                if (common.length < adjustedMinCommon) return null;

                if (inputLeftovers.length <= 1 && targetLeftovers.length <= 1) {
                  if (
                    inputLeftovers.length === 0 ||
                    targetLeftovers.length === 0
                  ) {
                    const leftoversCount =
                      inputLeftovers.length + targetLeftovers.length;
                    return { employee: e, score: 10 + leftoversCount };
                  }
                  const w1 = inputLeftovers[0];
                  const w2 = targetLeftovers[0];
                  if (
                    (w1.length === 1 && w2.startsWith(w1)) ||
                    (w2.length === 1 && w1.startsWith(w2))
                  ) {
                    return { employee: e, score: 5 };
                  }
                }
                return null;
              })
              .filter((c): c is { employee: any; score: number } => c !== null);

            if (candidates && candidates.length > 0) {
              if (activeSite && isSheetNameASite(activeSite)) {
                const siteFiltered = candidates.filter((c) => {
                  const candidateSiteNames = getEmployeeSiteNames(c.employee);
                  if (candidateSiteNames.length === 0) return true;
                  return isSiteMatch(activeSite, candidateSiteNames);
                });
                if (siteFiltered.length > 0) {
                  candidates = siteFiltered;
                }

                candidates.sort((a, b) => {
                  const aSiteNames = getEmployeeSiteNames(a.employee);
                  const bSiteNames = getEmployeeSiteNames(b.employee);
                  const aMatch =
                    aSiteNames.length > 0 &&
                    isSiteMatch(activeSite, aSiteNames);
                  const bMatch =
                    bSiteNames.length > 0 &&
                    isSiteMatch(activeSite, bSiteNames);

                  if (aMatch && !bMatch) return -1;
                  if (!aMatch && bMatch) return 1;

                  return a.score - b.score;
                });
              } else {
                candidates.sort((a, b) => a.score - b.score);
              }

              if (candidates.length > 0) {
                matchedData = candidates[0].employee;
              }
            }
          }
        }

        // Fallback to code/UAN matching if name matching failed
        if (!matchedData) {
          const itemCode = normalize(item.employee_code);
          const itemUan = normalize(item.uan_number);
          if (itemCode) {
            matchedData = allEmps?.find(
              (e) => itemCode && normalize(e.employee_code) === itemCode,
            );
          }
          if (!matchedData && itemUan) {
            matchedData = allEmps?.find((e) => {
              const uan = !Array.isArray(e.employee_statutory_details)
                ? e.employee_statutory_details?.uan_number
                : Array.isArray(e.employee_statutory_details) &&
                  e.employee_statutory_details.length > 0
                  ? e.employee_statutory_details[0].uan_number
                  : null;
              return itemUan && normalize(uan) === itemUan;
            });
          }
        }

        // Fallback to name matching if code/uan match failed and name is available
        if (!matchedData && itemRawName) {
          if (itemWords.length >= 1) {
            let candidates = allEmps
              ?.map((e) => {
                const dbWords = getWords(
                  `${e.first_name} ${e.middle_name || ""} ${e.last_name || ""}`,
                );

                if (itemWords.length === 0 || dbWords.length === 0) return null;

                const inputSet = new Set(itemWords);
                const targetSet = new Set(dbWords);

                const common = itemWords.filter((w) => targetSet.has(w));
                const inputLeftovers = itemWords.filter(
                  (w) => !targetSet.has(w),
                );
                const targetLeftovers = dbWords.filter((w) => !inputSet.has(w));

                const isExact =
                  inputLeftovers.length === 0 && targetLeftovers.length === 0;
                if (isExact) {
                  return { employee: e, score: 0 };
                }

                const minCommon = Math.min(itemWords.length, dbWords.length, 2);
                const w1 = inputLeftovers[0];
                const w2 = targetLeftovers[0];
                const hasInitialMatch =
                  inputLeftovers.length === 1 &&
                  targetLeftovers.length === 1 &&
                  w1 &&
                  w2 &&
                  ((w1.length === 1 && w2.startsWith(w1)) ||
                    (w2.length === 1 && w1.startsWith(w2)));

                const adjustedMinCommon = hasInitialMatch ? 1 : minCommon;
                if (common.length < adjustedMinCommon) return null;

                if (inputLeftovers.length <= 1 && targetLeftovers.length <= 1) {
                  if (
                    inputLeftovers.length === 0 ||
                    targetLeftovers.length === 0
                  ) {
                    const leftoversCount =
                      inputLeftovers.length + targetLeftovers.length;
                    return { employee: e, score: 10 + leftoversCount };
                  }
                  const w1 = inputLeftovers[0];
                  const w2 = targetLeftovers[0];
                  if (
                    (w1.length === 1 && w2.startsWith(w1)) ||
                    (w2.length === 1 && w1.startsWith(w2))
                  ) {
                    return { employee: e, score: 5 };
                  }
                }
                return null;
              })
              .filter((c): c is { employee: any; score: number } => c !== null);

            if (candidates && candidates.length > 0) {
              if (activeSite && isSheetNameASite(activeSite)) {
                const siteFiltered = candidates.filter((c) => {
                  const candidateSiteNames = getEmployeeSiteNames(c.employee);
                  if (candidateSiteNames.length === 0) return true;
                  return isSiteMatch(activeSite, candidateSiteNames);
                });
                if (siteFiltered.length > 0) {
                  candidates = siteFiltered;
                }

                candidates.sort((a, b) => {
                  const aSiteNames = getEmployeeSiteNames(a.employee);
                  const bSiteNames = getEmployeeSiteNames(b.employee);
                  const aMatch =
                    aSiteNames.length > 0 &&
                    isSiteMatch(activeSite, aSiteNames);
                  const bMatch =
                    bSiteNames.length > 0 &&
                    isSiteMatch(activeSite, bSiteNames);

                  if (aMatch && !bMatch) return -1;
                  if (!aMatch && bMatch) return 1;

                  return a.score - b.score;
                });
              } else {
                candidates.sort((a, b) => a.score - b.score);
              }

              if (candidates.length > 0) {
                matchedData = candidates[0].employee;
              }
            }
          }
        }

        const name = matchedData
          ? `${matchedData.first_name} ${matchedData.middle_name || ""} ${matchedData.last_name || ""}`
            .replace(/\s+/g, " ")
            .trim()
          : item.employee_name || "Unknown";
        const code = formatExcelID(
          matchedData ? matchedData.employee_code : item.employee_code,
        );

        const matchedUan =
          matchedData && "employee_statutory_details" in matchedData
            ? !Array.isArray(matchedData.employee_statutory_details)
              ? matchedData.employee_statutory_details?.uan_number
              : matchedData.employee_statutory_details.length > 0
                ? matchedData.employee_statutory_details[0].uan_number
                : null
            : null;

        const uan = formatExcelID(item.uan_number || matchedUan);

        const sheetEmployeeName = item.employee_name || "";

        return {
          ...item,
          sheet_employee_name: sheetEmployeeName,
          employee_id: matchedData?.id || undefined,
          employee_name: name,
          employee_code: code,
          uan_number: uan,
          is_new_employee: !matchedData,
          is_missing_matching_key: !matchedData && isMissingMatchingKey,
        };
      });

      if (newEnhanced) setEnhancedData(newEnhanced);
    }
    fetchDetails();
    return () => {
      active = false;
    };
  }, [importData, supabase, refreshTrigger, matchingKey]);

  const unmatchedEmployees = useMemo(() => {
    const isValidIdentifier = (val: any) => {
      if (!val) return false;
      const s = String(val).trim().toLowerCase();
      return (
        s !== "" &&
        s !== "null" &&
        s !== "undefined" &&
        s !== "n/a" &&
        s !== "-" &&
        s !== "new" &&
        s !== "new employee" &&
        s !== "new_employee"
      );
    };

    const unmatched = (enhancedData || [])
      .filter((item) => item.is_new_employee && !item.is_site_header)
      .reduce((acc: any[], current) => {
        const hasMatch = acc.some((item) => {
          if (
            isValidIdentifier(item.employee_code) &&
            isValidIdentifier(current.employee_code) &&
            item.employee_code === current.employee_code
          ) {
            return true;
          }
          if (
            isValidIdentifier(item.uan_number) &&
            isValidIdentifier(current.uan_number) &&
            item.uan_number === current.uan_number
          ) {
            return true;
          }
          if (
            isValidIdentifier(item.employee_name) &&
            isValidIdentifier(current.employee_name) &&
            item.employee_name.toLowerCase().trim() !== "unknown" &&
            item.employee_name.toLowerCase().trim() ===
            current.employee_name.toLowerCase().trim()
          ) {
            return true;
          }
          return false;
        });
        if (!hasMatch) {
          acc.push(current);
        }
        return acc;
      }, []);

    return unmatched.filter((emp) => {
      const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
      return !skippedKeys.has(key);
    });
  }, [enhancedData, skippedKeys]);

  const handleSkip = (emp: any) => {
    const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
    setSkippedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleSkipAll = () => {
    setSkippedKeys((prev) => {
      const next = new Set(prev);
      unmatchedEmployees.forEach((emp) => {
        const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
        next.add(key);
      });
      return next;
    });
  };

  const missingMatchingKeyEmployees = useMemo(() => {
    const missing = (enhancedData || [])
      .filter((item) => {
        const keyVal = item[matchingKey]
          ? String(item[matchingKey]).trim()
          : "";
        return (
          item.is_missing_matching_key ||
          !keyVal ||
          keyVal === "null" ||
          keyVal === "undefined"
        );
      })
      .reduce((acc: any[], current) => {
        const identifier =
          current.sheet_name || current.employee_name || "Unknown";
        if (
          !acc.some(
            (item) => (item.sheet_name || item.employee_name) === identifier,
          )
        ) {
          acc.push(current);
        }
        return acc;
      }, []);

    return missing.filter((emp) => {
      const key = `missing-${emp.sheet_name || emp.employee_name || ""}`;
      return !skippedKeys.has(key);
    });
  }, [enhancedData, matchingKey, skippedKeys]);

  const handleSkipAllMissingKey = () => {
    setSkippedKeys((prev) => {
      const next = new Set(prev);
      missingMatchingKeyEmployees.forEach((emp) => {
        const key = `missing-${emp.sheet_name || emp.employee_name || ""}`;
        next.add(key);
      });
      return next;
    });
    toast({
      title: "Records Skipped",
      description: `Skipped all ${missingMatchingKeyEmployees.length} employee(s) with missing ${matchingKey.replace("_", " ")}.`,
      variant: "default",
    });
  };

  useEffect(() => {
    const filteredData = (enhancedData || [])
      .filter((item: any) => !item.is_site_header)
      .filter((item: any) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== "avatar" &&
            String(value).toLowerCase().includes(searchString.toLowerCase()),
        ),
      );
    setTableData(filteredData);
  }, [searchString, enhancedData]);

  const handleFinalImport = async () => {
    if (unmatchedEmployees.length > 0) {
      setShowUnmatchedView(true);
      toast({
        title: "Unmatched Employees Detected",
        description: `Please register all ${unmatchedEmployees.length} new employee(s) before completing the daily attendance import.`,
        variant: "warning",
      });
      return;
    }

    const rawData =
      enhancedData && enhancedData.length > 0
        ? enhancedData
        : importData?.data || [];

    const dataToImport = rawData.filter((item: any) => {
      if (item.is_site_header) return false;
      const keyVal = item[matchingKey] ? String(item[matchingKey]).trim() : "";
      const isMissingKey =
        item.is_missing_matching_key ||
        !keyVal ||
        keyVal === "null" ||
        keyVal === "undefined";
      if (isMissingKey) return false;

      const key = `${item.employee_code || ""}-${item.uan_number || ""}-${item.employee_name || ""}`;
      if (skippedKeys.has(key)) return false;
      const missingKeyStr = `missing-${item.sheet_name || item.employee_name || ""}`;
      if (skippedKeys.has(missingKeyStr)) return false;

      return true;
    });

    if (!dataToImport || dataToImport.length === 0) {
      toast({
        title: "No Records to Import",
        description:
          "All records were either skipped or missing matching identifiers.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);

    const { error, status } = await createDailyAttendancesFromImportedData({
      data: dataToImport,
      supabase,
      intent,
      companyId,
    });

    setIsImporting(false);

    if (error) {
      console.error(error);
      toast({
        title: "Error",
        description: error.message ?? "Failed to import details",
        variant: "destructive",
      });
    } else if (isGoodStatus(status)) {
      toast({
        title: "Success",
        description: "Daily attendances imported successfully",
        variant: "success",
      });
      clearCacheEntry(cacheKeyPrefix.attendance);
      clearCacheEntry(cacheKeyPrefix.attendance_report);
      navigate("/time-tracking/attendance");
    }
  };

  const pivotedData = useMemo(() => {
    const employees = new Map<string, any>();

    tableData.forEach((rec: any) => {
      const keyVal = rec[matchingKey] ? String(rec[matchingKey]).trim() : "";
      const isMissingKey =
        !keyVal || keyVal === "null" || keyVal === "undefined";
      const identifier = !isMissingKey
        ? keyVal
        : `missing-${rec.sheet_name || rec.employee_name || "unknown"}`;

      if (!employees.has(identifier)) {
        employees.set(identifier, {
          employee_code: rec.employee_code,
          uan_number: rec.uan_number,
          employee_name: rec.employee_name || "",
          sheet_name: rec.sheet_name || "",
          total_overtime: 0,
          is_new_employee: rec.is_new_employee,
          is_missing_matching_key: rec.is_missing_matching_key || isMissingKey,
          days: {},
        });
      }

      const emp = employees.get(identifier);
      emp.days[rec.date] = rec.present;
      const otVal = parseFloat(rec.overtime_hours) || 0;
      emp.total_overtime += otVal;
    });

    return Array.from(employees.values()).map((emp) => ({
      ...emp,
      overtime_hours:
        emp.total_overtime > 0 ? String(emp.total_overtime) : "0",
    }));
  }, [tableData, matchingKey]);

  const daysHeader = useMemo(() => {
    const dates = new Set<string>();
    importData?.data?.forEach((rec: any) => {
      dates.add(rec.date);
    });
    return Array.from(dates);
  }, [importData]);

  return (
    <section className="p-4 relative">
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background/80",
          isImporting ? "block" : "hidden",
        )}
      >
        <LoadingSpinner className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0" />
      </div>
      <div className="w-full flex items-center justify-between pb-4">
        <div className="w-full flex justify-between items-center">
          <div className="relative w-[30rem]">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Icon
                name="magnifying-glass"
                size="sm"
                className="text-gray-400"
              />
            </div>
            <Input
              placeholder="Search Records"
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              className="pl-8 h-10 w-full focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant={"outline"}
              className="w-24 h-10"
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  setImportData({ data: [] });
                  navigate("/time-tracking/attendance");
                }
              }}
            >
              Back
            </Button>
            <Button
              variant={"default"}
              className="w-24 h-10"
              onClick={handleFinalImport}
            >
              Import
            </Button>
          </div>
        </div>
      </div>

      {missingMatchingKeyEmployees.length > 0 && (
        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 font-bold text-sm">
              !
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">
                Missing{" "}
                {matchingKey === "employee_code"
                  ? "Employee Code"
                  : matchingKey === "uan_number"
                    ? "UAN Number"
                    : "Employee Name"}{" "}
                in Sheet ({missingMatchingKeyEmployees.length})
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                The following staff (
                {missingMatchingKeyEmployees
                  .map((e) => e.employee_name || e.sheet_name)
                  .join(", ")}
                ) do not have a {matchingKey.replace("_", " ")} in the uploaded
                file and will be skipped during import.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-950/50 font-semibold"
              onClick={handleSkipAllMissingKey}
            >
              Skip Missing Records
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border h-[calc(100vh-230px)] min-h-[450px] overflow-auto shadow-sm">
        <Table className="relative">
          <TableHeader className="sticky top-0 bg-secondary z-30 shadow-sm">
            <TableRow>
              <TableHead className="w-[50px] bg-secondary sticky left-0 z-40 border-r">
                Sr.No.
              </TableHead>
              <TableHead className="min-w-[120px] bg-secondary sticky left-[50px] z-40 border-r">
                Employee Code
              </TableHead>
              <TableHead className="min-w-[150px] bg-secondary sticky left-[170px] z-40 border-r">
                UAN Number
              </TableHead>
              <TableHead className="min-w-[150px] bg-secondary sticky left-[320px] z-40 border-r">
                Employee Name
              </TableHead>
              <TableHead className="min-w-[80px] bg-secondary border-r text-center">
                OT Hrs
              </TableHead>
              {daysHeader.map((dateStr) => (
                <TableHead
                  key={dateStr}
                  className="text-center px-2 min-w-[40px] border-l"
                >
                  {new Date(dateStr).getDate()}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pivotedData.length ? (
              pivotedData.map((row: any, i: number) => {
                const isNewEmployee = row.is_new_employee;
                const isMissingKey = row.is_missing_matching_key;
                const highlightKey = matchingKey;
                return (
                  <TableRow
                    key={i}
                    className={cn(
                      isMissingKey && "bg-amber-500/5 hover:bg-amber-500/10",
                    )}
                  >
                    <TableCell className="text-center bg-card sticky left-0 z-20 border-r text-xs">
                      {i + 1}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-medium bg-card sticky left-[50px] z-20 border-r text-xs",
                        isNewEmployee &&
                        highlightKey === "employee_code" &&
                        "text-amber-800 dark:text-amber-400 font-semibold italic",
                        isMissingKey &&
                        highlightKey === "employee_code" &&
                        "text-rose-600 dark:text-rose-400 font-semibold italic",
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span>
                          {row.employee_code ||
                            (isMissingKey && highlightKey === "employee_code"
                              ? "Missing Code"
                              : "-")}
                        </span>
                        {isNewEmployee && highlightKey === "employee_code" && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0"
                            title="Unmatched New Employee"
                          />
                        )}
                        {isMissingKey && highlightKey === "employee_code" && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"
                            title="Missing Employee Code in Sheet (Will be skipped)"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "bg-card sticky left-[170px] z-20 border-r text-xs truncate max-w-[150px]",
                        isNewEmployee &&
                        highlightKey === "uan_number" &&
                        "text-amber-800 dark:text-amber-400 font-semibold italic",
                        isMissingKey &&
                        highlightKey === "uan_number" &&
                        "text-rose-600 dark:text-rose-400 font-semibold italic",
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span>
                          {row.uan_number ||
                            (isMissingKey && highlightKey === "uan_number"
                              ? "Missing UAN"
                              : "-")}
                        </span>
                        {isNewEmployee && highlightKey === "uan_number" && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0"
                            title="Unmatched New Employee"
                          />
                        )}
                        {isMissingKey && highlightKey === "uan_number" && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"
                            title="Missing UAN Number in Sheet (Will be skipped)"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="bg-card sticky left-[320px] z-20 border-r text-xs">
                      <div className="flex flex-col gap-0.5 max-w-[150px]">
                        <span
                          className={cn(
                            "font-medium truncate flex items-center gap-1.5",
                            isNewEmployee &&
                            highlightKey === "employee_name" &&
                            "text-amber-800 dark:text-amber-400 font-semibold italic",
                            isMissingKey &&
                            highlightKey === "employee_name" &&
                            "text-rose-600 dark:text-rose-400 font-semibold italic",
                          )}
                        >
                          {row.employee_name || "-"}
                          {isNewEmployee &&
                            highlightKey === "employee_name" && (
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0"
                                title="Unmatched New Employee"
                              />
                            )}
                          {isMissingKey && highlightKey === "employee_name" && (
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"
                              title="Missing Employee Name in Sheet (Will be skipped)"
                            />
                          )}
                        </span>
                        {row.sheet_employee_name &&
                          row.sheet_employee_name !== row.employee_name && (
                            <span
                              className="text-[10px] text-muted-foreground italic truncate"
                              title={row.sheet_employee_name}
                            >
                              {row.sheet_employee_name}
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-primary text-xs border-r">
                      {row.overtime_hours}
                    </TableCell>
                    {daysHeader.map((dateStr) => {
                      const rawStatus = row.days[dateStr];
                      const status = String(rawStatus || "").toUpperCase();
                      return (
                        <TableCell
                          key={dateStr}
                          className={cn(
                            "text-center p-1 border-l text-[10px] font-bold",
                            status === "P" && "text-blue-500 bg-blue-500/10",
                            status === "A" && "text-red-500 bg-red-500/10",
                            (status === "WOF" ||
                              status === "(WOF)" ||
                              status === "WO") &&
                            "text-orange-500 bg-orange-500/10",
                            status === "H" &&
                            "text-purple-500 bg-purple-500/10",
                            (status === "CL" ||
                              status === "EL" ||
                              status === "ML" ||
                              status === "PL") &&
                            "text-emerald-500 bg-emerald-500/10",
                          )}
                        >
                          {status || "-"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={daysHeader.length + 5}
                  className="h-64 text-center"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner />
                    <p className="text-muted-foreground animate-pulse font-medium">
                      AI is Analyzing your spreadsheet...
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      This usually takes 3-5 seconds
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showUnmatchedView && unmatchedEmployees.length > 0 && (
        <Dialog open={showUnmatchedView} onOpenChange={setShowUnmatchedView}>
          <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] p-6 overflow-hidden flex flex-col">
            <CreateUnmatchedEmployeePanel
              unmatchedList={unmatchedEmployees}
              companyId={companyId}
              supabase={supabase}
              existingMatchedEmployeeIds={(enhancedData || [])
                .map((item: any) => item.employee_id)
                .filter((id): id is string => Boolean(id))}
              onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
              onClose={() => setShowUnmatchedView(false)}
              onSkip={handleSkip}
              onSkipAll={handleSkipAll}
            />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
