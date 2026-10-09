import { useImportStoreForSalaryPayroll } from "@/store/import";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  getEmployeeIdsByEmployeeCodes,
  getEmployeeIdsByEsicNumber,
  getEmployeeIdsByUanNumber,
  getMonthlyAttendanceByEmployeeIds,
} from "@canny_ecosystem/supabase/queries";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useSubmit, useNavigation, useNavigate } from "@remix-run/react";
import { LoadingSpinner } from "@/components/loading-spinner";

import { useState, useEffect, useMemo } from "react";
import { ImportedDataTable } from "../salary-imported-table/imported-data-table";
import {
  ImportedDataColumns,
  sortPayrollFieldConfigs,
} from "../salary-imported-table/columns";
import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { CreateUnmatchedEmployeePanel } from "@/components/employees/import-export/create-unmatched-employee-panel";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";

const isValidIdentifier = (val: any) => {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  return (
    s !== "" &&
    s !== "null" &&
    s !== "undefined" &&
    s !== "n/a" &&
    s !== "na" &&
    s !== "-" &&
    s !== "new" &&
    s !== "new employee" &&
    s !== "new_employee"
  );
};

export function SalaryPayrollImportData({
  env,
  fieldConfigs,
  payrollId,
  companyId,
  onBack,
}: {
  env: SupabaseEnv;
  fieldConfigs: FieldConfig[];
  payrollId?: string;
  companyId: string;
  onBack?: () => void;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env });
  const { importData } = useImportStoreForSalaryPayroll();

  const [searchString, setSearchString] = useState("");
  const [enrichedData, setEnrichedData] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [tableData, setTableData] = useState<any[]>([]);
  const [showUnmatchedView, setShowUnmatchedView] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function fetchEmployeeDetails() {
      if (!importData.data || importData.data.length === 0) return;

      const employeeCodes = importData.data
        .map((item: any) => String(item.employee_code || "").trim())
        .filter((code: string) => isValidIdentifier(code));
      const uanNumbers = importData.data
        .map((item: any) => String(item.uan_number || "").trim())
        .filter((uan: string) => isValidIdentifier(uan));
      const esicNumbers = importData.data
        .map((item: any) => String(item.esic_number || "").trim())
        .filter((esic: string) => isValidIdentifier(esic));

      if (
        uanNumbers.length === 0 &&
        employeeCodes.length === 0 &&
        esicNumbers.length === 0
      )
        return;

      let allEmps: any[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("employees")
          .select(
            "id, employee_code, first_name, middle_name, last_name, employee_statutory_details(uan_number, esic_number), work_details(site_id, sites(name))",
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

      let existingEmployeeIds = new Set<string>();
      if (payrollId) {
        const { data: existingEntries, error: existingEntriesError } =
          await supabase
            .from("salary_entries")
            .select("monthly_attendance(employee_id)")
            .eq("payroll_id", payrollId);

        if (!existingEntriesError && existingEntries) {
          for (const entry of existingEntries) {
            const ma = entry.monthly_attendance;
            if (ma) {
              if (Array.isArray(ma)) {
                if (ma[0]?.employee_id) {
                  existingEmployeeIds.add(ma[0].employee_id);
                }
              } else if (ma.employee_id) {
                existingEmployeeIds.add(ma.employee_id);
              }
            }
          }
        }
      }

      const normalize = (val: any) =>
        String(val || "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]/g, "");

      let currentSiteName: string | null = null;

      const newEnrichedData = importData.data.map((item: any) => {
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
            employee_id: null,
            has_existing_salary_entry: false,
          };
        }

        const itemCode = normalize(item.employee_code);
        const itemUan = normalize(item.uan_number);
        const itemEsic = normalize(item.esic_number);
        const sheetName = item.sheet_name;
        const activeSite = currentSiteName || sheetName;

        const matchedData = allEmps?.find((e) => {
          if (
            isValidIdentifier(item.employee_code) &&
            isValidIdentifier(e.employee_code) &&
            normalize(e.employee_code) === itemCode
          )
            return true;

          const statutoryDetails = Array.isArray(e.employee_statutory_details)
            ? e.employee_statutory_details[0]
            : e.employee_statutory_details;

          const uan = statutoryDetails?.uan_number;
          if (
            isValidIdentifier(item.uan_number) &&
            isValidIdentifier(uan) &&
            normalize(uan) === itemUan
          )
            return true;

          const esic = statutoryDetails?.esic_number;
          if (
            isValidIdentifier(item.esic_number) &&
            isValidIdentifier(esic) &&
            normalize(esic) === itemEsic
          )
            return true;

          return false;
        });

        // Fallback to name matching if code/uan/esic match failed and name is available
        let finalMatchedData = matchedData;
        if (!finalMatchedData && item.employee_name) {
          const itemNameWords = getNormalizedWords(item.employee_name);
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
                finalMatchedData = candidates[0].employee;
              }
            }
          }
        }

        const employeeId = finalMatchedData?.id || null;
        const hasExistingSalaryEntry = employeeId
          ? existingEmployeeIds.has(employeeId)
          : false;

        return {
          ...item,
          employee_name: finalMatchedData
            ? `${finalMatchedData.first_name} ${finalMatchedData.middle_name || ""} ${finalMatchedData.last_name || ""}`
                .replace(/\s+/g, " ")
                .trim()
            : item.employee_name || "Unknown",
          employee_code: finalMatchedData
            ? finalMatchedData.employee_code
            : item.employee_code,
          uan_number:
            item.uan_number ||
            (finalMatchedData &&
            "employee_statutory_details" in finalMatchedData
              ? Array.isArray(finalMatchedData.employee_statutory_details)
                ? (finalMatchedData.employee_statutory_details[0] as any)
                    ?.uan_number
                : (finalMatchedData.employee_statutory_details as any)
                    ?.uan_number
              : undefined),
          is_new_employee: !finalMatchedData,
          employee_id: employeeId,
          has_existing_salary_entry: hasExistingSalaryEntry,
        };
      });

      if (newEnrichedData && active) {
        setEnrichedData(newEnrichedData);
      }
    }

    fetchEmployeeDetails();

    return () => {
      active = false;
    };
  }, [importData.data, supabase, refreshTrigger, companyId, payrollId]);

  const unmatchedEmployees = useMemo(() => {
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
    const dataToFilter =
      enrichedData.length > 0 ? enrichedData : importData.data;
    const filteredData = dataToFilter
      ?.filter((item) => !item.is_site_header)
      ?.filter((item) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== "avatar" &&
            key !== "employee_id" &&
            key !== "is_new_employee" &&
            key !== "has_existing_salary_entry" &&
            String(value).toLowerCase().includes(searchString.toLowerCase()),
        ),
      );
    setTableData(filteredData);
  }, [searchString, enrichedData, importData]);

  useEffect(() => {
    if (navigation.state === "idle" && isImporting) {
      setIsImporting(false);
    }
  }, [navigation.state, isImporting]);

  const handleFinalImport = async () => {
    if (unmatchedEmployees.length > 0) {
      setShowUnmatchedView(true);
      toast({
        title: "Unmatched Employees Detected",
        description: `Please register all ${unmatchedEmployees.length} unmatched employee(s) before importing payroll.`,
        variant: "warning",
      });
      return;
    }

    setIsImporting(true);

    const isOverwrite = importData.intent === "overwrite";

    const updatedData = enrichedData
      .filter(
        (item) =>
          item.employee_id &&
          (isOverwrite || !item.has_existing_salary_entry) &&
          !item.is_site_header,
      )
      .map((item) => {
        const {
          employee_code,
          uan_number,
          esic_number,
          is_new_employee,
          sheet_name,
          has_existing_salary_entry,
          ...rest
        } = item;
        return rest;
      });

    const updatedCount = updatedData.length;
    const skippedCount = enrichedData.length - updatedCount;

    if (updatedCount === 0) {
      setIsImporting(false);
      toast({
        title: "Success",
        description: `Salary entries imported: 0 updated, ${skippedCount} skipped`,
        variant: "success",
      });
      const redirectUrl = payrollId
        ? `/payroll/run-payroll/${payrollId}`
        : "/payroll/run-payroll";
      navigate(redirectUrl);
      return;
    }

    const resolvedEmployeeIds = updatedData.map((item) => item.employee_id);
    const month = importData.data[0]?.month;
    const year = importData.data[0]?.year;

    if (month && year) {
      const { data: existingAttendance, error: attendanceError } =
        await getMonthlyAttendanceByEmployeeIds({
          supabase,
          employeeIds: resolvedEmployeeIds,
          month,
          year,
        });

      if (attendanceError) {
        setIsImporting(false);
        toast({
          title: "Error",
          description: "Failed to verify attendance data",
          variant: "destructive",
        });
        return;
      }

      const attendanceMap = new Map(
        existingAttendance?.map((a) => [a.employee_id, a.present_days]),
      );

      const invalidEntries = updatedData.filter((item) => {
        const systemPresentDays = attendanceMap.get(item.employee_id);
        const importedPresentDays = Number(item.present_days);
        return (
          systemPresentDays !== undefined &&
          systemPresentDays !== importedPresentDays
        );
      });

      if (invalidEntries.length > 0) {
        setIsImporting(false);
        toast({
          title: "Import Failed",
          description:
            "Attendance present day and your sheet present days are different. Update attendance.",
          variant: "destructive",
        });
        return;
      }
    }

    submit(
      {
        type:
          importData.intent === "overwrite"
            ? "salary-update-import"
            : "salary-import",
        title: importData.title!,
        salaryImportData: JSON.stringify(updatedData),
        skipped: skippedCount.toString(),
        updated: updatedCount.toString(),
        failedRedirect: payrollId
          ? `/payroll/run-payroll/${payrollId}`
          : "/payroll/run-payroll",
        different: payrollId ? "different" : "no",
        payrollId: payrollId ?? "",
      },
      {
        method: "POST",
        action: "/create-payroll",
      },
    );
  };

  return (
    <section className="px-4 relative">
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
          <div className="flex items-center gap-3">
            {onBack && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-xs gap-1.5 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
                onClick={onBack}
              >
                <Icon name="chevron-left" size="sm" />
                Back
              </Button>
            )}
            <div className="relative w-[30rem]">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Icon
                  name="magnifying-glass"
                  size="sm"
                  className="text-gray-400"
                />
              </div>
              <Input
                placeholder="Search Payroll"
                value={searchString}
                onChange={(e) => setSearchString(e.target.value)}
                className="pl-8 h-10 w-full focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant={"default"} onClick={handleFinalImport}>
              Import
            </Button>
          </div>
        </div>
      </div>

      <ImportedDataTable
        data={tableData}
        columns={ImportedDataColumns(sortPayrollFieldConfigs(fieldConfigs))}
        fieldConfigs={sortPayrollFieldConfigs(fieldConfigs)}
      />

      {showUnmatchedView && unmatchedEmployees.length > 0 && (
        <Dialog open={showUnmatchedView} onOpenChange={setShowUnmatchedView}>
          <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] p-6 overflow-hidden flex flex-col">
            <CreateUnmatchedEmployeePanel
              unmatchedList={unmatchedEmployees.map((emp) => ({
                employee_name: emp.employee_name || "Unknown",
                employee_code: emp.employee_code,
                uan_number: emp.uan_number,
              }))}
              companyId={companyId}
              supabase={supabase}
              existingMatchedEmployeeIds={(tableData || [])
                .map((item: any) => item.employee_id)
                .filter((id): id is string => Boolean(id))}
              onSuccess={() => {
                toast({
                  title: "Employee Registered",
                  description: "Updating payroll and re-matching...",
                  variant: "success",
                });
                setRefreshTrigger((prev) => prev + 1);
              }}
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
