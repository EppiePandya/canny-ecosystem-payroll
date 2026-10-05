import * as XLSX from "xlsx";
import saveAs from "file-saver";
import { useState, useEffect, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  formatDateTime,
  roundToNearest,
  formatDateToDash,
} from "@canny_ecosystem/utils";
import type {
  PayrollDatabaseRow,
  SupabaseEnv,
  TypedSupabaseClient,
} from "@canny_ecosystem/supabase/types";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  getEmployeeStatutoryDetailsById,
  getEmployeeStateInsuranceByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { useCompanyId } from "@/utils/company";
import { Label } from "@canny_ecosystem/ui/label";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";

export const prepareEsiFormatWorkbook = async ({
  data,
  supabase,
  payrollMonth,
  payrollYear,
}: {
  data: any[];
  supabase: TypedSupabaseClient;
  payrollMonth: number;
  payrollYear: number;
}) => {
  const statutoryDetailsResults = await Promise.all(
    data.map(({ employee_id }) =>
      getEmployeeStatutoryDetailsById({ id: employee_id, supabase }),
    ),
  );

  const updatedData = data.map((entry, index) => ({
    ...entry,
    statutoryDetails: statutoryDetailsResults[index]?.data || null,
  }));

  const filteredData = updatedData.filter((formatData) => {
    const hasEsicNumber = !!formatData?.statutoryDetails?.esic_number;
    const esiDeduction = Number(formatData?.esi_amount || 0);
    const days = Number(formatData?.days || 0);

    if (!hasEsicNumber) return false;

    if (days > 0 && esiDeduction === 0) return false;

    return true;
  });

  const extractedData = filteredData.map((formatData) => {
    // Check if esic_exit_date falls within the PREVIOUS payroll month.
    //
    // Business logic:
    //   - Employee leaves in April (any day) → April payroll ESIC is normal (code 0)
    //   - May payroll → 0 working days (code 11); esic_exit_date is set to a May date
    //   - June payroll → esic_exit_date (May) === previous month (May) → code 2 + last_day
    const esicExitDateStr = formatData?.employees?.esic_exit_date;
    let isEsicExit = false;
    if (esicExitDateStr) {
      const exitDate = new Date(esicExitDateStr);
      const prevMonth = payrollMonth === 1 ? 12 : payrollMonth - 1;
      const prevYear = payrollMonth === 1 ? payrollYear - 1 : payrollYear;
      isEsicExit =
        exitDate.getMonth() + 1 === prevMonth &&
        exitDate.getFullYear() === prevYear;
    }

    return {
      wages: roundToNearest(formatData?.amount),
      ip_number: (formatData?.statutoryDetails?.esic_number || "")
        .toString()
        .trim(),
      ip_name: `${formatData?.employees?.first_name || ""} ${formatData?.employees?.middle_name || ""
        } ${formatData?.employees?.last_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase(),
      days: Number(formatData.days || 0),
      // Reason code 2 = ESIC exit in this month; 11 = zero days not exiting yet; 0 = normal
      code: isEsicExit ? "2" : formatData.days === 0 ? "11" : "0",
      last_day: isEsicExit ? formatDateToDash(esicExitDateStr) : "",
    };
  });

  const headers = [
    "IP Number",
    "IP Name",
    "No Of Days for which wages paid/payable during the month",
    "Total Monthly Wages",
    "Reason Code for Zero workings days(numeric only:provide 0 for all other reasons)",
    "Last Working Day",
  ];

  const dataRows = [headers];

  for (const emp of extractedData) {
    dataRows.push([
      emp.ip_number,
      emp.ip_name,
      emp.days,
      emp.wages,
      emp.code,
      emp.last_day,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(dataRows);

  const columnWidths = [20, 30, 30, 20, 20, 20].map((w) => ({ wch: w }));
  worksheet["!cols"] = columnWidths;

  for (let col = 0; col < headers.length; col++) {
    const cellAddress = XLSX.utils.encode_cell({ c: col, r: 0 });
    const cell = worksheet[cellAddress];
    if (cell) {
      cell.s = {
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF999999" },
        },
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true },
        border: {
          bottom: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        },
      };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  workbook.Workbook = {
    Views: [{ RTL: false }],
    CalcPr: { calcMode: "auto" },
  };

  const buffer = XLSX.write(workbook, {
    bookType: "biff8",
    type: "array",
    cellStyles: true,
    cellDates: true,
    bookSST: false,
  });

  return new Blob([buffer], {
    type: "application/vnd.ms-excel",
  });
};

export const DownloadEsiFormat = ({
  env,
  data,
  payrollData,
}: {
  env: SupabaseEnv;
  data: any[];
  payrollData: Omit<PayrollDatabaseRow, "created_at"> & {
    site?: { name: string } | null;
    project?: { name: string } | null;
  };
}) => {
  const { supabase } = useSupabase({ env });
  const { companyId } = useCompanyId();
  const [esiList, setEsiList] = useState<any[]>([]);
  const [selectedEsiId, setSelectedEsiId] = useState<string>("");
  const [selectedEsiFields, setSelectedEsiFields] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const earningFields = useMemo(() => {
    const fields = new Set<string>();
    for (const emp of data) {
      const fieldValues = emp.salary_entries?.salary_field_values || [];
      for (const f of fieldValues) {
        if (f.payroll_fields?.type === "earning" && f.payroll_fields?.name) {
          fields.add(f.payroll_fields.name);
        }
      }
    }
    return Array.from(fields).sort();
  }, [data]);

  useEffect(() => {
    const initialSelected: string[] = [];
    for (const emp of data) {
      const fieldValues = emp.salary_entries?.salary_field_values || [];
      for (const f of fieldValues) {
        if (f.payroll_fields?.type === "earning" && f.payroll_fields?.name) {
          const name = f.payroll_fields.name;
          if (!initialSelected.includes(name)) {
            if (
              name.toLowerCase().includes("basic") ||
              f.consider_for_esic === true ||
              f.payroll_fields?.consider_for_esic === true
            ) {
              initialSelected.push(name);
            }
          }
        }
      }
    }
    setSelectedEsiFields(initialSelected);
  }, [data]);

  useEffect(() => {
    if (!companyId) return;

    const fetchEsiList = async () => {
      setLoading(true);
      try {
        const { data: esiData, error } =
          await getEmployeeStateInsuranceByCompanyId({
            supabase,
            companyId,
          });
        if (error) throw error;
        setEsiList(esiData || []);

        const defaultEsi =
          esiData?.find((e: any) => e.is_default) || esiData?.[0];
        if (defaultEsi) {
          setSelectedEsiId(String(defaultEsi.id));
        }
      } catch (err) {
        console.error("Error fetching ESI list:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEsiList();
  }, [companyId, supabase]);

  function transformSalaryData(data: any[], selectedEsi?: any) {
    return data.map((emp: any) => {
      const earnings =
        emp.salary_entries?.salary_field_values
          ?.filter(
            (e: {
              amount: number;
              payroll_fields: { type: string; name: string };
            }) =>
              e.payroll_fields.type === "earning" &&
              selectedEsiFields.includes(e.payroll_fields.name),
          )
          ?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) ||
        0;

      const isEsiField = (e: any) =>
        ["ESI", "ESIC"].includes(
          e?.payroll_fields?.name?.toString()?.trim()?.toUpperCase(),
        );

      const esiField =
        emp.salary_entries?.salary_field_values?.find(isEsiField);

      const esi_amount = Number(esiField?.amount || 0);

      return {
        amount: Number(earnings),
        esi_amount: Number(esi_amount),
        days: Math.round(
          Number(emp?.present_days || 0) +
          Number(emp?.paid_holidays || 0) +
          Number(emp?.paid_leaves || 0) +
          Number(emp?.casual_leaves || 0),
        ),
        employee_id: emp.employee?.id,
        employees: {
          company_id: emp.employee?.company_id,
          employee_code: emp.employee?.employee_code,
          first_name: emp.employee?.first_name,
          middle_name: emp.employee?.middle_name,
          last_name: emp.employee?.last_name,
          end_date: emp.employee?.work_details?.end_date,
          esic_exit_date: emp.employee?.employee_exit?.esic_exit_date ?? null,
        },
      };
    });
  }

  const generateEsiFormatExcel = async () => {
    const selectedEsi = esiList.find((e) => String(e.id) === selectedEsiId);

    // Payroll month/year — the month these employees are being paid for
    const payrollMonth = payrollData.month ?? new Date().getMonth() + 1;
    const payrollYear = payrollData.year ?? new Date().getFullYear();

    // 1. Transform existing payroll data
    const transformedPayrollData = transformSalaryData(data, selectedEsi);

    // 2. Fetch esic_exit_date for all employees in payroll via employee_exit
    const payrollEmployeeIds = transformedPayrollData.map(
      (emp: any) => emp.employee_id,
    );

    const { data: exitRecords } = await supabase
      .from("employee_exit")
      .select("employee_id, esic_exit_date")
      .in("employee_id", payrollEmployeeIds)
      .not("esic_exit_date", "is", null);

    // Map employee_id -> esic_exit_date
    const esicExitMap = new Map<string, string>();
    for (const rec of exitRecords ?? []) {
      if (rec.esic_exit_date) {
        esicExitMap.set(rec.employee_id, rec.esic_exit_date);
      }
    }

    // Attach esic_exit_date to transformed payroll data
    const transformedPayrollDataWithExit = transformedPayrollData.map(
      (emp: any) => ({
        ...emp,
        employees: {
          ...emp.employees,
          esic_exit_date: esicExitMap.get(emp.employee_id) ?? null,
        },
      }),
    );

    // 3. Fetch all active employees registered under this company and selected ESIC ID
    let esicEmployees: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let esicEmployeesError = null;

    while (true) {
      const { data: pageData, error } = await supabase
        .from("employees")
        .select(`
          id,
          company_id,
          first_name,
          middle_name,
          last_name,
          employee_code,
          is_active,
          work_details!work_details_employee_id_fkey(
            end_date
          ),
          employee_statutory_details!inner(
            esic_id,
            esic_number
          ),
          employee_exit(
            esic_exit_date
          )
        `)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .eq("employee_statutory_details.esic_id", selectedEsiId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        esicEmployeesError = error;
        break;
      }
      if (!pageData || pageData.length === 0) break;
      esicEmployees = [...esicEmployees, ...pageData];
      if (pageData.length < pageSize) break;
      page++;
    }

    if (esicEmployeesError) {
      console.error("Error fetching ESIC employees:", esicEmployeesError);
    }

    const transformedMissingData: any[] = [];
    if (esicEmployees) {
      const existingEmployeeIds = new Set(
        transformedPayrollDataWithExit.map((emp: any) => emp.employee_id),
      );

      for (const emp of esicEmployees) {
        if (!existingEmployeeIds.has(emp.id)) {
          const workDetails = emp.work_details;
          const workDetail = Array.isArray(workDetails)
            ? workDetails[0]
            : workDetails;

          // Get esic_exit_date from employee_exit relation
          const empExit = Array.isArray(emp.employee_exit)
            ? emp.employee_exit[0]
            : emp.employee_exit;

          transformedMissingData.push({
            amount: 0,
            esi_amount: 0,
            days: 0,
            employee_id: emp.id,
            employees: {
              company_id: emp.company_id,
              employee_code: emp.employee_code,
              first_name: emp.first_name,
              middle_name: emp.middle_name,
              last_name: emp.last_name,
              end_date: workDetail?.end_date || null,
              esic_exit_date: empExit?.esic_exit_date ?? null,
            },
          });
        }
      }
    }

    const finalData = [
      ...transformedPayrollDataWithExit,
      ...transformedMissingData,
    ];

    const blob = await prepareEsiFormatWorkbook({
      data: finalData,
      supabase,
      payrollMonth,
      payrollYear,
    });
    if (!blob) return;
    saveAs(blob, `Esi-Format ${formatDateTime(Date.now())}.xls`);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn("w-full flex items-center justify-start  gap-2")}
      >
        <Icon name="import" />
        <p>Download ESI Format</p>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>ESI Format</AlertDialogTitle>
          <AlertDialogDescription>
            Configure your ESI rule and eligible earning components before
            generating the ESI Excel.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-semibold">ESI Rule / Policy</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground py-2">
                Loading ESI configurations...
              </div>
            ) : esiList.length === 0 ? (
              <div className="text-sm text-destructive py-2">
                No ESI configurations found for this company. Please configure
                ESI settings first.
              </div>
            ) : (
              <Select value={selectedEsiId} onValueChange={setSelectedEsiId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select ESI Rule" />
                </SelectTrigger>
                <SelectContent>
                  {esiList.map((esi) => (
                    <SelectItem key={esi.id} value={String(esi.id)}>
                      {esi.esi_number ? `${esi.esi_number} ` : ""}
                      (Employee:{" "}
                      {((esi.employee_contribution || 0.0075) * 100).toFixed(2)}
                      %, Employer:{" "}
                      {((esi.employer_contribution || 0.0325) * 100).toFixed(2)}
                      %{esi.is_default ? " - Default" : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <Label className="text-sm font-semibold">
              ESI-Eligible Earning Fields
            </Label>
            {earningFields.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No earning fields found in payroll data.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-1">
                {earningFields.map((field) => {
                  const isChecked = selectedEsiFields.includes(field);
                  return (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        id={`field-${field}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedEsiFields((prev) => [...prev, field]);
                          } else {
                            setSelectedEsiFields((prev) =>
                              prev.filter((f) => f !== field),
                            );
                          }
                        }}
                      />
                      <label
                        htmlFor={`field-${field}`}
                        className="text-sm font-medium leading-none cursor-pointer select-none"
                      >
                        {field}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "default" }))}
            onClick={generateEsiFormatExcel}
            disabled={
              !selectedEsiId || loading || selectedEsiFields.length === 0
            }
          >
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
