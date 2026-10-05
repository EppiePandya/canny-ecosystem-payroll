import { ImportedDataColumns } from "@/components/employees/imported-employee-details-table/columns";
import { ImportedDataTable } from "@/components/employees/imported-employee-details-table/imported-data-table";
import { cacheKeyPrefix } from "@/constant";
import { useImportStoreForEmployeeLoans } from "@/store/import";
import { clearCacheEntry } from "@/utils/cache";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  createEmployeeLoansFromImportedData,
  getEmployeeLoansConflicts,
} from "@canny_ecosystem/supabase/mutations";
import { getEmployeeIdsByEmployeeCodes } from "@canny_ecosystem/supabase/queries";
import type {
  EmployeeLoanDetailsDatabaseInsert,
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
  ImportEmployeeLoansDataSchema,
  isGoodStatus,
  transformStringArrayIntoOptions,
} from "@canny_ecosystem/utils";
import { useNavigate } from "@remix-run/react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useState, useEffect } from "react";

export function EmployeeLoansImportData({
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

  const { importData, setImportData } = useImportStoreForEmployeeLoans();
  const [conflictingIndex, setConflictingIndex] =
    useState<number[]>(conflictingIndices);
  const [searchString, setSearchString] = useState("");
  const [importType, setImportType] = useState<string>("skip");
  const [tableData, setTableData] = useState(importData.data);
  const [finalData, setFinalData] =
    useState<EmployeeLoanDetailsDatabaseInsert[]>();
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const validateImportData = (data: any[]) => {
    try {
      const result = ImportEmployeeLoansDataSchema.safeParse({ data });
      if (!result.success) {
        console.error("Employee Loans Data validation error", result.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Employee Loans Data validation error:", error);
      return false;
    }
  };

  const fetchConflicts = async () => {
    try {
      setIsLoadingData(true);
      const employeeCodes = importData
        .data!.map((value: any) => value.employee_code)
        .filter(Boolean);

      const { data: employees, error: idByCodeError } =
        await getEmployeeIdsByEmployeeCodes({
          supabase,
          employeeCodes,
        });

      if (idByCodeError) {
        throw idByCodeError;
      }

      const updatedData = importData
        .data!.filter((item: any) => item.employee_code)
        .map((item: any) => {
          const employeeId = employees?.find(
            (e: any) => e.employee_code === item.employee_code,
          )?.id;
          const { employee_code, ...restItem } = item;
          return {
            ...restItem,
            employee_id: employeeId,
            company_id: companyId,
          };
        })
        .filter((item: any) => item.employee_id);

      setFinalData(updatedData as EmployeeLoanDetailsDatabaseInsert[]);

      const { conflictingIndices, error } = await getEmployeeLoansConflicts({
        supabase,
        importedData: updatedData as EmployeeLoanDetailsDatabaseInsert[],
      });

      if (error) {
        throw error;
      }

      setConflictingIndex(conflictingIndices);
    } catch (err) {
      console.error("Employee Loans Error fetching conflicts:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (importData && importData.data.length > 0) {
      fetchConflicts();
    }
  }, [importData]);

  useEffect(() => {
    const filteredData = importData?.data.filter((item: any) =>
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
      setIsImporting(true);
      const { error, status } = await createEmployeeLoansFromImportedData({
        data: finalData as EmployeeLoanDetailsDatabaseInsert[],
        import_type: importType,
        supabase,
      });

      setIsImporting(false);

      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to import details",
          variant: "destructive",
        });
      }

      if (isGoodStatus(status)) {
        toast({
          title: "Success",
          description: "Details imported successfully",
          variant: "success",
        });

        clearCacheEntry(cacheKeyPrefix.employees);
        clearCacheEntry(cacheKeyPrefix.employee_overview);
        navigate("/employees");
      }
    } else {
      toast({
        title: "Validation Error",
        description:
          "Some fields are invalid, please check the schema requirements.",
        variant: "destructive",
      });
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
        <div className="w-full flex justify-between items-center">
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
              disabled={isImporting || isLoadingData}
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
