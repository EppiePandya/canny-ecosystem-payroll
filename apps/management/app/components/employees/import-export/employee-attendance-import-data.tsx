import { useImportStoreForEmployeeAttendance } from "@/store/import";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { getEmployeeIdsByIdentifiers } from "@canny_ecosystem/supabase/queries";
import type {
  EmployeeMonthlyAttendanceDatabaseInsert,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { useNavigate } from "@remix-run/react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import {
  duplicationTypeArray,
  transformStringArrayIntoOptions,
} from "@canny_ecosystem/utils";

import { useState, useEffect, useMemo } from "react";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix, recentlyAddedFilter } from "@/constant";
import { ImportedDataTable } from "../imported-attendance-table/imported-data-table";
import { ImportedDataColumns } from "../imported-attendance-table/columns";
import {
  createEmployeeAttendanceImportedData,
  getEmployeeAttendanceConflicts,
} from "@canny_ecosystem/supabase/mutations";
import { isGoodStatus } from "@canny_ecosystem/utils";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { CreateUnmatchedEmployeePanel } from "./create-unmatched-employee-panel";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";

export function EmployeeAttendanceImportData({
  env,
  intent,
  companyId,
  matchingKey = "employee_code",
  onBack,
}: {
  env: SupabaseEnv;
  intent?: string;
  companyId: string;
  matchingKey?: string;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env });
  const { importData } = useImportStoreForEmployeeAttendance();

  const [searchString, setSearchString] = useState("");
  const [enrichedData, setEnrichedData] = useState<any[]>(
    importData.data || [],
  );
  const [displayedData, setDisplayedData] = useState<any[]>(
    importData.data || [],
  );
  const [isImporting, setIsImporting] = useState(false);
  const [conflictingIndices, setConflictingIndices] = useState<number[]>([]);
  const [importType, setImportType] = useState<string>(intent || "skip");
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

    async function fetchEmployeeDetails() {
      const identifiers = Array.from(
        new Set(
          importData?.data
            ?.map((d) => String((d as any)[matchingKey] || "").trim())
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

      const getNormalizedWords = (val: any) => {
        if (!val) return [];
        let s = String(val).toLowerCase();
        s = s.replace(/\bnull\b/g, "");
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
          .map((wd: any) => wd?.sites?.name || wd?.site?.name)
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

      const newEnrichedData = importData.data?.map((item) => {
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

        const itemCode = normalize((item as any).employee_code);
        const itemUan = normalize((item as any).uan_number);
        const itemNameWords = getNormalizedWords((item as any).employee_name);
        const sheetName = (item as any).sheet_name;
        const activeSite = currentSiteName || sheetName;

        let matchedData: any = null;
        if (matchingKey === "employee_code") {
          const itemCode = normalize((item as any).employee_code);
          matchedData = allEmps?.find(
            (e) => itemCode && normalize(e.employee_code) === itemCode,
          );
        } else if (matchingKey === "uan_number") {
          const itemUan = normalize((item as any).uan_number);
          matchedData = allEmps?.find((e) => {
            const statutoryDetails = Array.isArray(e.employee_statutory_details)
              ? e.employee_statutory_details[0]
              : e.employee_statutory_details;
            const uan = statutoryDetails?.uan_number;
            return itemUan && normalize(uan) === itemUan;
          });
        } else if (matchingKey === "employee_name") {
          const itemNameWords = getNormalizedWords((item as any).employee_name);
          if (itemNameWords.length > 0) {
            let candidates = allEmps
              ?.map((e) => {
                const dbWords = getNormalizedWords(
                  `${e.first_name} ${e.middle_name || ""} ${e.last_name || ""}`,
                );

                if (itemNameWords.length === 0 || dbWords.length === 0)
                  return null;

                const inputSet = new Set(itemNameWords);
                const targetSet = new Set(dbWords);

                const common = itemNameWords.filter((w) => targetSet.has(w));
                const inputLeftovers = itemNameWords.filter(
                  (w) => !targetSet.has(w),
                );
                const targetLeftovers = dbWords.filter((w) => !inputSet.has(w));

                const isExact =
                  inputLeftovers.length === 0 && targetLeftovers.length === 0;
                if (isExact) {
                  return { employee: e, score: 0 };
                }

                const minCommon = Math.min(
                  itemNameWords.length,
                  dbWords.length,
                  2,
                );
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
                candidates = candidates.filter((c) => {
                  const candidateSiteNames = getEmployeeSiteNames(c.employee);
                  if (candidateSiteNames.length === 0) return true;
                  return isSiteMatch(activeSite, candidateSiteNames);
                });

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
          const itemCode = normalize((item as any).employee_code);
          const itemUan = normalize((item as any).uan_number);
          if (itemCode) {
            matchedData = allEmps?.find(
              (e) => itemCode && normalize(e.employee_code) === itemCode,
            );
          }
          if (!matchedData && itemUan) {
            matchedData = allEmps?.find((e) => {
              const statutoryDetails = Array.isArray(
                e.employee_statutory_details,
              )
                ? e.employee_statutory_details[0]
                : e.employee_statutory_details;
              const uan = statutoryDetails?.uan_number;
              return itemUan && normalize(uan) === itemUan;
            });
          }
        }

        // Fallback to name matching if code/uan match failed and name is available
        if (!matchedData && (item as any).employee_name) {
          const itemNameWords = getNormalizedWords((item as any).employee_name);
          if (itemNameWords.length > 0) {
            let candidates = allEmps
              ?.map((e) => {
                const dbWords = getNormalizedWords(
                  `${e.first_name} ${e.middle_name || ""} ${e.last_name || ""}`,
                );

                if (itemNameWords.length === 0 || dbWords.length === 0)
                  return null;

                const inputSet = new Set(itemNameWords);
                const targetSet = new Set(dbWords);

                const common = itemNameWords.filter((w) => targetSet.has(w));
                const inputLeftovers = itemNameWords.filter(
                  (w) => !targetSet.has(w),
                );
                const targetLeftovers = dbWords.filter((w) => !inputSet.has(w));

                const isExact =
                  inputLeftovers.length === 0 && targetLeftovers.length === 0;
                if (isExact) {
                  return { employee: e, score: 0 };
                }

                const minCommon = Math.min(
                  itemNameWords.length,
                  dbWords.length,
                  2,
                );
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
                candidates = candidates.filter((c) => {
                  const candidateSiteNames = getEmployeeSiteNames(c.employee);
                  if (candidateSiteNames.length === 0) return true;
                  return isSiteMatch(activeSite, candidateSiteNames);
                });

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

        const sheetEmployeeName = (item as any).employee_name || "";

        return {
          ...item,
          sheet_employee_name: sheetEmployeeName,
          employee_id: matchedData?.id || undefined,
          employee_name: matchedData
            ? `${matchedData.first_name} ${matchedData.middle_name || ""} ${matchedData.last_name || ""}`
                .replace(/\s+/g, " ")
                .trim()
            : (item as any).employee_name || "Unknown",
          employee_code: formatExcelID(
            matchedData
              ? matchedData.employee_code
              : (item as any).employee_code,
          ),
          uan_number: formatExcelID(
            (item as any).uan_number ||
              (matchedData && "employee_statutory_details" in matchedData
                ? Array.isArray(matchedData.employee_statutory_details)
                  ? (matchedData.employee_statutory_details[0] as any)
                      ?.uan_number
                  : (matchedData.employee_statutory_details as any)?.uan_number
                : undefined),
          ),
          is_new_employee: !matchedData,
        };
      });

      if (newEnrichedData) {
        setEnrichedData(newEnrichedData);
      }
    }

    fetchEmployeeDetails();

    return () => {
      active = false;
    };
  }, [importData.data, supabase, refreshTrigger]);

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

    const unmatched = enrichedData
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
  }, [enrichedData, skippedKeys]);

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
      for (const emp of unmatchedEmployees) {
        const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    async function checkConflicts() {
      if (!enrichedData || enrichedData.length === 0) return;

      const { conflictingIndices: conflicts, error } =
        await getEmployeeAttendanceConflicts({
          supabase,
          importedData: enrichedData,
          companyId,
        });

      if (!error && active && conflicts) {
        setConflictingIndices(conflicts);
      }
    }

    checkConflicts();
    return () => {
      active = false;
    };
  }, [refreshTrigger, supabase, companyId]);

  useEffect(() => {
    const filteredData = enrichedData
      ?.filter((item) => !item.is_site_header)
      ?.filter((item) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== "avatar" &&
            String(value).toLowerCase().includes(searchString.toLowerCase()),
        ),
      );
    setDisplayedData(filteredData);
  }, [searchString, enrichedData]);

  const handleFinalImport = async () => {
    if (unmatchedEmployees.length > 0) {
      setShowUnmatchedView(true);
      toast({
        title: "Unmatched Employees Detected",
        description: `Please register all ${unmatchedEmployees.length} new employee(s) before completing the attendance import.`,
        variant: "warning",
      });
      return;
    }

    setIsImporting(true);

    let skippedCount = 0;
    let conflictCount = 0;
    const updatedData = enrichedData
      .map((item: any, idx: number) => {
        if (item.is_site_header) {
          return null;
        }
        const employeeId = item.employee_id;

        if (!employeeId) {
          skippedCount++;
          return null;
        }

        if (conflictingIndices.includes(idx)) {
          conflictCount++;
        }

        const {
          employee_code,
          uan_number,
          employee_name,
          sheet_name,
          is_new_employee,
          isConflicting,
          employee_id,
          sheet_employee_name,
          raw_row,
          is_site_header,
          is_missing_matching_key,
          avatar,
          ...rest
        } = item;
        return {
          ...rest,
          employee_id: employeeId,
        };
      })
      .filter((item): item is any => item !== null);

    if (updatedData.length === 0) {
      setIsImporting(false);
      toast({
        title: "Import Failed",
        description:
          "No matching employees found. Please ensure all employees in your file are already added to the system with matching Codes or UANs.",
        variant: "destructive",
      });
      return;
    }

    const { error, status } = await createEmployeeAttendanceImportedData({
      data: updatedData as unknown as EmployeeMonthlyAttendanceDatabaseInsert[],
      supabase,
      intent: importType,
    });

    setIsImporting(false);

    if (error) {
      toast({
        title: "Error",
        description: JSON.stringify(error) ?? "Failed to import details",
        variant: "destructive",
      });
    }

    if (isGoodStatus(status)) {
      let descriptionMessage = "";
      let variant: "success" | "warning" = "success";

      if (importType === "skip") {
        const newlyImported = updatedData.length - conflictCount;
        if (newlyImported === 0) {
          descriptionMessage =
            conflictCount === 1
              ? "Attendance for this employee already exists for this month."
              : "Attendance for these employees already exists for this month.";
          variant = "warning";
        } else {
          descriptionMessage = `Successfully imported ${newlyImported} record(s).`;
          if (conflictCount > 0) {
            descriptionMessage +=
              " Attendance for other employee(s) already exists for this month.";
            variant = "warning";
          }
        }
      } else {
        descriptionMessage = `Successfully imported ${updatedData.length} record(s).`;
      }

      if (skippedCount > 0) {
        descriptionMessage += ` ${skippedCount} row(s) were skipped because the employee profile does not exist in the database.`;
        variant = "warning";
      }

      toast({
        title: "Import Complete",
        description:
          descriptionMessage || "All attendance records imported successfully.",
        variant,
      });
      clearCacheEntry(cacheKeyPrefix.attendance);
      clearCacheEntry(cacheKeyPrefix.attendance_report);
      navigate(
        `/time-tracking/attendance?recently_added=${recentlyAddedFilter[0]}`,
      );
    }
  };

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
        <div className="w-full  flex justify-between items-center">
          <div className="relative w-[30rem] ">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Icon
                name="magnifying-glass"
                size="sm"
                className="text-gray-400"
              />
            </div>
            <Input
              placeholder="Search Employees"
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              className="pl-8 h-10 w-full focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-4">
            <Combobox
              className={cn(
                "w-52 h-10",
                intent !== "update" && conflictingIndices?.length > 0
                  ? "flex"
                  : "hidden",
              )}
              options={transformStringArrayIntoOptions(
                duplicationTypeArray as unknown as string[],
              )}
              value={importType}
              onChange={(value: string) => {
                setImportType(value);
              }}
              placeholder={"Select Import Type"}
            />
            {onBack && (
              <Button variant="outline" className="w-24 h-10" onClick={onBack}>
                Back
              </Button>
            )}
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
      <ImportedDataTable
        data={displayedData as any}
        columns={ImportedDataColumns}
        conflictingIndex={conflictingIndices}
        matchingKey={matchingKey}
      />

      {showUnmatchedView && unmatchedEmployees.length > 0 && (
        <Dialog open={showUnmatchedView} onOpenChange={setShowUnmatchedView}>
          <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] p-6 overflow-hidden flex flex-col">
            <CreateUnmatchedEmployeePanel
              unmatchedList={unmatchedEmployees}
              companyId={companyId}
              supabase={supabase}
              existingMatchedEmployeeIds={enrichedData
                ?.map((item) => item.employee_id)
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
