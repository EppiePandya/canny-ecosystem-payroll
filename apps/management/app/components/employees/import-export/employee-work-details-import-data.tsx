import { ImportedDataColumns } from "@/components/employees/imported-employee-details-table/columns";
import { ImportedDataTable } from "@/components/employees/imported-employee-details-table/imported-data-table";
import { cacheKeyPrefix } from "@/constant";
import { useImportStoreForEmployeeWorkDetails } from "@/store/import";
import { clearCacheEntry } from "@/utils/cache";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  createEmployeeWorkDetailsFromImportedData,
  getEmployeeWorkDetailsConflicts,
} from "@canny_ecosystem/supabase/mutations";
import {
  getEmployeeIdsByEmployeeCodes,
  getDepartmentsByCompanyId,
  getSitesByCompanyId,
  getProjectsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import type {
  EmployeeWorkDetailsDatabaseInsert,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { Button } from "@canny_ecosystem/ui/button";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  duplicationTypeArray,
  ImportEmployeeWorkDetailsDataSchema,
  isGoodStatus,
  transformStringArrayIntoOptions,
  isPlaceholder,
  normalizeSuperFuzzy,
} from "@canny_ecosystem/utils";
import { useNavigate } from "@remix-run/react";
import { LoadingSpinner } from "@/components/loading-spinner";

import { useState, useEffect } from "react";

export function EmployeeWorkDetailsImportData({
  env,
  conflictingIndices,
  companyId,
  mappedKeys,
}: {
  env: SupabaseEnv;
  conflictingIndices: number[];
  companyId: string;
  mappedKeys?: string[];
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env });

  const visibleColumns = ImportedDataColumns.filter((col) => {
    const accessorKey = (col as any).accessorKey;
    if (col.id === "actions" || accessorKey === "sr_no") return true;
    if (!accessorKey) return true;
    if (accessorKey === "employee_code") return true;
    return mappedKeys?.includes(accessorKey);
  });
  const { importData, setImportData } = useImportStoreForEmployeeWorkDetails();
  const [conflictingIndex, setConflictingIndex] =
    useState<number[]>(conflictingIndices);
  const [searchString, setSearchString] = useState("");
  const [importType, setImportType] = useState<string>("skip");
  const [tableData, setTableData] = useState(importData.data);
  const [finalData, setFinalData] =
    useState<EmployeeWorkDetailsDatabaseInsert[]>();
  const [isImporting, setIsImporting] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [deptRes, siteRes, projRes] = await Promise.all([
          getDepartmentsByCompanyId({ supabase, companyId }),
          getSitesByCompanyId({ supabase, companyId }),
          getProjectsByCompanyId({ supabase, companyId }),
        ]);
        if (deptRes.data) setDepartments(deptRes.data);
        if (siteRes.data) setSites(siteRes.data);
        if (projRes.data) setProjects(projRes.data);
      } catch (err) {
        console.error("Error fetching work details import context data:", err);
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchData();
  }, [supabase, companyId]);

  const validateImportData = (data: any[]) => {
    try {
      const result = ImportEmployeeWorkDetailsDataSchema.safeParse({ data });
      if (!result.success) {
        console.error("Employee Work Details Data validation error");
        return false;
      }
      return true;
    } catch (error) {
      console.error("Employee Work Details Data validation error:", error);

      return false;
    }
  };

  const fetchConflicts = async () => {
    try {
      const employeeCodes = importData.data!.map(
        (value: { employee_code: any }) => value.employee_code,
      );
      const { data: employees, error: idByCodeError } =
        await getEmployeeIdsByEmployeeCodes({
          supabase,
          employeeCodes,
        });

      if (idByCodeError) {
        throw idByCodeError;
      }

      const normalizeSuperFuzzy = (val: any) =>
        String(val || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const deptMap = new Map();
      (departments || []).forEach((d) => {
        const fuzzy = normalizeSuperFuzzy(d.name);
        if (fuzzy) deptMap.set(fuzzy, d.id);
      });

      const siteMap = new Map();
      (sites || []).forEach((s) => {
        const fuzzyName = normalizeSuperFuzzy(s.name);
        const fuzzyPrefix = normalizeSuperFuzzy(s.prefix);
        if (fuzzyName) siteMap.set(fuzzyName, s.id);
        if (fuzzyPrefix) siteMap.set(fuzzyPrefix, s.id);
      });

      const projectMap = new Map();
      (projects || []).forEach((p) => {
        const fuzzy = normalizeSuperFuzzy(p.name);
        if (fuzzy) projectMap.set(fuzzy, p.id);
      });

      const isPlaceholder = (val: any) => {
        const s = String(val || "")
          .trim()
          .toLowerCase();
        return (
          !s ||
          s === "--" ||
          s === "-" ||
          s === "." ||
          s === "n/a" ||
          s === "null" ||
          s === "undefined"
        );
      };

      const updatedData = importData
        .data!.filter((item: any) => {
          const hasEmployeeId = item.employee_code || item.uan_number;
          const hasAnyData = Object.values(item).some(
            (val) =>
              val !== null &&
              val !== undefined &&
              String(val).trim() !== "" &&
              String(val).trim() !== "--",
          );
          return hasEmployeeId && hasAnyData;
        })
        .map((item: any) => {
          const empRecord = employees?.find(
            (e: { employee_code: any }) =>
              e.employee_code === item.employee_code,
          );
          const employeeId = empRecord?.id;

          const cleanDeptInput = isPlaceholder(item.department)
            ? ""
            : normalizeSuperFuzzy(item.department);
          const cleanSiteInput = isPlaceholder(item.site)
            ? ""
            : normalizeSuperFuzzy(item.site);
          const cleanProjectInput = isPlaceholder(item.project)
            ? ""
            : normalizeSuperFuzzy(item.project);

          const deptId = deptMap.get(cleanDeptInput);
          const siteId = siteMap.get(cleanSiteInput);
          const projectId = projectMap.get(cleanProjectInput);

          return {
            ...item,
            ...(employeeId ? { employee_id: employeeId } : {}),
            ...(deptId ? { department_id: deptId } : {}),
            ...(siteId ? { site_id: siteId } : {}),
            ...(projectId ? { project_id: projectId } : {}),
            ...(empRecord
              ? {
                  first_name: empRecord.first_name,
                  middle_name: empRecord.middle_name,
                  last_name: empRecord.last_name,
                }
              : {}),
          };
        });

      setFinalData(updatedData);
      const { conflictingIndices, error } =
        await getEmployeeWorkDetailsConflicts({
          supabase,
          importedData: updatedData as EmployeeWorkDetailsDatabaseInsert[],
        });

      if (error) {
        throw error;
      }

      setConflictingIndex(conflictingIndices);
    } catch (err) {
      console.error("Employee Work Details Error fetching conflicts:", err);
    }
  };

  useEffect(() => {
    if (importData) {
      fetchConflicts();
    }
  }, [importData]);

  useEffect(() => {
    const filteredData = importData?.data.filter((item) =>
      Object.entries(item).some(
        ([key, value]) =>
          key !== "avatar" &&
          String(value).toLowerCase().includes(searchString.toLowerCase()),
      ),
    );
    setTableData(filteredData);
  }, [searchString, importData]);

  const handleFinalImport = async () => {
    if (validateImportData(importData.data)) {
      const missingSites = new Set<string>();
      const missingProjects = new Set<string>();
      const missingDepartments = new Set<string>();

      const isPlaceholder = (val: any) => {
        const s = String(val || "")
          .trim()
          .toLowerCase();
        return (
          !s ||
          s === "--" ||
          s === "-" ||
          s === "." ||
          s === "n/a" ||
          s === "null" ||
          s === "undefined"
        );
      };

      importData.data.forEach((item: any) => {
        if (!isPlaceholder(item.site) && !item.site_id)
          missingSites.add(item.site);
        if (!isPlaceholder(item.project) && !item.project_id)
          missingProjects.add(item.project);
        if (!isPlaceholder(item.department) && !item.department_id)
          missingDepartments.add(item.department);
      });

      const errorMessages = [];
      if (missingSites.size > 0) errorMessages.push("Sites");
      if (missingProjects.size > 0) errorMessages.push("Projects");
      if (missingDepartments.size > 0) errorMessages.push("Departments");

      if (errorMessages.length > 0) {
        toast({
          title: "Import Blocked",
          description: `Missing ${errorMessages.join(", ")} found. Please add the records highlighted in red before importing.`,
          variant: "destructive",
        });
        return;
      }

      setIsImporting(true);
      const { error, status } = await createEmployeeWorkDetailsFromImportedData(
        {
          data: finalData as EmployeeWorkDetailsDatabaseInsert[],
          import_type: importType,
          supabase,
        },
      );

      setIsImporting(false);

      if (error) {
        toast({
          title: "Error",
          description: JSON.stringify(error) ?? "Failed to import details",
          variant: "destructive",
        });
      }

      if (isGoodStatus(status)) {
        toast({
          title: "Success",
          description: "Details imported succesfully",
          variant: "success",
        });

        clearCacheEntry(cacheKeyPrefix.employees);
        clearCacheEntry(cacheKeyPrefix.employee_overview);
        clearCacheEntry(cacheKeyPrefix.employee_work_portfolio);
        navigate("/employees");
      }
    }
  };

  return (
    <section className="p-4 relative">
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background/80",
          isImporting || isLoadingData ? "block" : "hidden",
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
          <div className="flex items-center gap-3">
            <Combobox
              className={cn(
                "w-52 h-10",
                conflictingIndex?.length > 0 ? "flex" : "hidden",
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
            <Button
              variant={"default"}
              onClick={handleFinalImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <>
                  <LoadingSpinner className="mr-2 h-4 w-4" />
                  Processing...
                </>
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </div>
      </div>
      <input type="hidden" name="import_type" value={importType} />
      <input
        name="stringified_data"
        type="hidden"
        value={JSON.stringify(importData)}
      />
      <ImportedDataTable
        data={tableData}
        columns={visibleColumns}
        conflictingIndex={conflictingIndex}
      />
    </section>
  );
}
