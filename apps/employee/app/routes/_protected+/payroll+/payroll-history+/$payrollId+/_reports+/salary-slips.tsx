import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCompanyById,
  getCompanyConfigByCompanyId,
  getLocationsByCompanyId,
  getPayrollById,
  getPrimaryLocationByCompanyId,
  getSalaryEntriesForSalaryRegisterAndAll,
} from "@canny_ecosystem/supabase/queries";
import {
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_NAME,
  EPFNO,
  numberToWordsIndian,
  SALARY_SLIP_TITLE,
} from "@/constant";
import {
  defaultMonth,
  defaultYear,
  formatDate,
  formatNumber,
  getMonthNameFromNumber,
  replaceUnderscore,
  resolveSalarySlipBreakdown,
  roundToNearest,
} from "@canny_ecosystem/utils";
import { useSalaryEntriesStore } from "@/store/salary-entries";
import { PDFDocument } from "pdf-lib";
import {
  generateSalarySlipPdf,
  SalarySlipPDF,
  sortEarnings,
  sortDeductions,
} from "@/components/employees/pdf/salary-slip-pdf";

export function SalarySlipsList({ data }: { data: any }) {
  if (!data?.employeeData?.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No salary slips to display.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.employeeData.map((emp: any, idx: number) => (
        <div
          key={idx}
          className="bg-white shadow-md rounded overflow-hidden break-inside-avoid print:shadow-none print:rounded-none"
        >
          <SalarySlipPDF
            data={{
              month: data.month,
              year: data.year,
              companyData: data.companyData,
              employee: emp,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const payrollId = params.payrollId as string;

  if (!payrollId) {
    return null;
  }

  const { supabase } = getSupabaseWithHeaders({ request });

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const { data: payroll } = await getPayrollById({
    payrollId,
    supabase,
  });

  const effectiveCompanyId = payroll?.company_id || companyId;

  const { data: employeeCompanyData } = await getCompanyById({
    supabase,
    id: effectiveCompanyId,
  });

  const { data: employeeCompanyConfig } = await getCompanyConfigByCompanyId({
    supabase,
    companyId: effectiveCompanyId,
  });

  const { data: primaryLoc } =
    await getPrimaryLocationByCompanyId({
      supabase,
      companyId: effectiveCompanyId,
    });
  let employeesCompanyLocationData = primaryLoc;
  if (!employeesCompanyLocationData) {
    const { data: anyLoc } = await getLocationsByCompanyId({
      supabase,
      companyId: effectiveCompanyId,
    });
    if (anyLoc && anyLoc.length > 0) {
      employeesCompanyLocationData = anyLoc[0];
    }
  }

  const { data: payrollDataAndOthers } =
    await getSalaryEntriesForSalaryRegisterAndAll({
      supabase,
      payrollId,
      month: payroll?.month ?? defaultMonth,
      year: payroll?.year ?? defaultYear,
    });

  const { data: holidayConfig } = await supabase
    .from("holiday_config")
    .select("type, multiplier, working_days, use_attendance_working_days")
    .eq("company_id", effectiveCompanyId as any);

  return {
    data: {
      employeeCompanyData,
      employeeCompanyConfig,
      employeesCompanyLocationData,
      payrollDataAndOthers,
      holidayConfig: (holidayConfig as any) || [],
      payroll,
    },
    payrollId,
  };
}

export default function SalarySlips() {
  const { data, payrollId } = useLoaderData<any>();
  const { selectedRows } = useSalaryEntriesStore();
  const navigate = useNavigate();
  const { isDocument } = useIsDocument();

  useEffect(() => {
    if (selectedRows && selectedRows.length > 0) {
      const isStale = selectedRows.some(
        (row: any) => row.payroll_id && row.payroll_id !== payrollId,
      );
      if (isStale) {
        useSalaryEntriesStore.getState().setSelectedRows([]);
        useSalaryEntriesStore.getState().setRowSelection({});
      }
    }
  }, [payrollId, selectedRows]);

  const selectedMap = new Map<string, any>();
  selectedRows.forEach((row: any) => {
    if (row.payroll_id && row.payroll_id !== payrollId) return;
    const empId = row.employee?.id || row.employee_id;
    if (empId) {
      selectedMap.set(empId, row);
    }
  });

  const hasMatchingSelectedRows = (data?.payrollDataAndOthers || []).some(
    (emp: any) => {
      const empId = emp.employee?.id || emp.employee_id;
      return selectedMap.has(empId);
    },
  );

  const filteredPayrollData = (data?.payrollDataAndOthers || []).filter(
    (emp: any) => {
      const empId = emp.employee?.id || emp.employee_id;
      if (hasMatchingSelectedRows && !selectedMap.has(empId)) return false;
      return true;
    },
  );

  const mergedPayrollData = filteredPayrollData.map((emp: any) => {
    const empId = emp.employee?.id || emp.employee_id;
    const storeRow = selectedMap.get(empId);
    if (!storeRow) return emp;

    return {
      ...emp,
      ...storeRow,
      employee: {
        ...emp.employee,
        ...storeRow.employee,
        work_details:
          emp.employee?.work_details || storeRow.employee?.work_details,
        employee_statutory_details:
          emp.employee?.employee_statutory_details ||
          storeRow.employee?.employee_statutory_details,
        employee_bank_details:
          emp.employee?.employee_bank_details ||
          storeRow.employee?.employee_bank_details,
        salary_assignment:
          emp.employee?.salary_assignment ||
          storeRow.employee?.salary_assignment,
      },
      salary_entries: storeRow.salary_entries || emp.salary_entries,
    };
  });

  const updatedData = {
    ...data,
    payrollDataAndOthers: mergedPayrollData,
  };

  function transformData(data: any) {
    const company = data?.employeeCompanyData;
    const config = data?.employeeCompanyConfig;
    const location = data?.employeesCompanyLocationData;

    const companyData = {
      name: company?.name,
      address_line_1: location?.address_line_1,
      address_line_2: location?.address_line_2,
      city: location?.city,
      state: location?.state,
      pincode: location?.pincode,
      company_salary_prefix: config?.company_salary_prefix || "",
      show_employer_contribution: config?.show_employer_contribution ?? false,
    };

    const employeeData: any[] = (data.payrollDataAndOthers || []).map(
      (emp: any) => {
        const { earnings, deductions, employerContributions, netPay, actualWages } =
          resolveSalarySlipBreakdown({
            salaryEntries: emp.salary_entries,
            attendance: {
              working_days: emp.working_days || 0,
              present_days: emp.present_days ?? emp.paid_days ?? 0,
              paid_leaves: emp.paid_leaves || 0,
              casual_leaves: emp.casual_leaves || 0,
              paid_holidays: emp.paid_holidays || 0,
              absent_days: emp.absent_days || 0,
              overtime_hours: emp.overtime_hours || 0,
            },
            assignment: emp.employee?.salary_assignment,
            holidayConfig: data?.holidayConfig || [],
            month: emp.month ?? data.payroll?.month,
          });

        const site = emp?.employee?.work_details?.sites?.name;
        const department = emp?.employee?.work_details?.departments?.name;

        return {
          employeeData: {
            first_name: emp?.employee?.first_name,
            middle_name: emp?.employee?.middle_name,
            last_name: emp?.employee?.last_name,
            employee_code: emp?.employee?.employee_code,
            date_of_joining:
              emp?.employee?.work_details?.start_date ||
              emp?.employee?.date_of_joining ||
              "",
          },
          employeeProjectAssignmentData: {
            position: emp?.employee?.work_details?.position || "",
            start_date: emp?.employee?.work_details?.start_date || "",
            site: site || "",
            location:
              emp?.employee?.work_details?.site?.company_locations?.name || "",
            project: emp?.employee?.work_details?.site?.projects?.name || "",
            department: department || "",
            project_assignment_location: {
              address_line_1:
                emp?.employee?.work_details?.sites?.company_locations
                  ?.address_line_1,
              address_line_2:
                emp?.employee?.work_details?.sites?.company_locations
                  ?.address_line_2,
              city: emp?.employee?.work_details?.sites?.company_locations?.city,
              state:
                emp?.employee?.work_details?.sites?.company_locations?.state,
              pincode:
                emp?.employee?.work_details?.sites?.company_locations?.pincode,
            },
          },
          employeeStatutoryDetails: {
            pf_number: emp.employee?.employee_statutory_details?.pf_number || "",
            esic_number:
              emp.employee?.employee_statutory_details?.esic_number || "",
            uan_number:
              emp.employee?.employee_statutory_details?.uan_number || "",
            pan_number:
              emp.employee?.employee_statutory_details?.pan_number || "",
          },
          attendance: {
            working_days: emp?.working_days ?? 26,
            weekly_off: 0,
            paid_holidays: emp?.paid_holidays ?? 0,
            paid_days: emp?.present_days ?? emp?.paid_days ?? 0,
            present_days: emp?.present_days ?? emp?.paid_days ?? 0,
            paid_leaves: emp?.paid_leaves ?? 0,
            casual_leaves: emp?.casual_leaves ?? 0,
            absents: emp?.absent_days ?? 0,
            lwp: emp?.absent_days ?? 0,
            overtime_hours: emp?.overtime_hours ?? 0,
          },
          bankDetails: {
            bank: emp.employee?.employee_bank_details?.bank_name,
            account_number: emp.employee?.employee_bank_details?.account_number,
          },
          earnings,
          deductions,
          employerContributions,
          netPay: netPay ?? emp?.net_pay ?? emp?.net_salary,
          actualWages: actualWages ?? emp?.actual_wages,
        };
      },
    );

    return {
      month: getMonthNameFromNumber(
        data.payrollDataAndOthers?.[0]?.month ??
          data.payroll?.month ??
          defaultMonth,
      ),
      year:
        data.payrollDataAndOthers?.[0]?.year ??
        data.payroll?.year ??
        defaultYear,
      companyData,
      employeeData,
    };
  }

  const slipData = transformData(updatedData);

  if (!isDocument) return <div>Loading...</div>;

  const handleOpenChange = () => {
    navigate(`/payroll/payroll-history/${payrollId}`);
  };

  const handleDownloadAll = async () => {
    try {
      const mergedPdf = await PDFDocument.create();
      for (const emp of slipData.employeeData) {
        const singleSlipBytes = await generateSalarySlipPdf({
          month: slipData.month,
          year: slipData.year,
          companyData: slipData.companyData,
          employee: emp,
        });
        const tempDoc = await PDFDocument.load(singleSlipBytes);
        const [page] = await mergedPdf.copyPages(tempDoc, [0]);
        mergedPdf.addPage(page);
      }
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salary_slips_${slipData.month}_${slipData.year}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    }
  };

  return (
    <Dialog defaultOpen={true} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-4xl h-[92vh] border border-gray-200 rounded-lg p-0 flex flex-col overflow-hidden bg-background"
        disableIcon={true}
      >
        <div className="flex justify-between items-center px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <div className="text-sm font-semibold">
            Salary Slips ({slipData.employeeData.length} Employee{slipData.employeeData.length !== 1 ? "s" : ""})
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print All
            </Button>
            <Button size="sm" onClick={handleDownloadAll}>
              Download All PDF
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-neutral-100 dark:bg-neutral-900">
          <div className="max-w-3xl mx-auto">
            <SalarySlipsList data={slipData} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
