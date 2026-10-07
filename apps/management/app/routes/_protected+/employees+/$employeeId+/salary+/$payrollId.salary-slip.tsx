import { useLoaderData, useNavigate } from "@remix-run/react";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  defaultMonth,
  defaultYear,
  getMonthNameFromNumber,
  resolveSalarySlipBreakdown,
} from "@canny_ecosystem/utils";
import { SalarySlipPDF, generateSalarySlipPdf } from "@/components/employees/pdf/salary-slip-pdf";

import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCompanyById,
  getCompanyConfigByCompanyId,
  getEmployeeStatutoryDetailsById,
  getEmployeeWorkDetailsByEmployeeIdForOthers,
  getLocationsByCompanyId,
  getPayrollById,
  getPrimaryLocationByCompanyId,
  getSalaryEntriesByPayrollAndEmployeeId,
} from "@canny_ecosystem/supabase/queries";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const payrollId = params.payrollId as string;
  const employeeId = params.employeeId as string;
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const { data: payroll } = await getPayrollById({ payrollId, supabase });

  const effectiveCompanyId = payroll?.company_id || companyId;

  const { data: employeeCompanyData } = await getCompanyById({
    supabase,
    id: effectiveCompanyId,
  });
  const { data: employeeCompanyConfig } = await getCompanyConfigByCompanyId({
    supabase,
    companyId: effectiveCompanyId,
  });
  const { data: payrollData } = await getSalaryEntriesByPayrollAndEmployeeId({
    supabase,
    payrollId,
    employeeId,
  });

  const { data: employeeProjectAssignmentData } =
    await getEmployeeWorkDetailsByEmployeeIdForOthers({
      supabase,
      employeeId,
      month: payroll?.month ?? defaultMonth,
      year: payroll?.year ?? defaultYear,
    });
  let { data: employeeCompanyLocationData } =
    await getPrimaryLocationByCompanyId({ supabase, companyId: effectiveCompanyId });

  if (!employeeCompanyLocationData) {
    const { data: anyLoc } = await getLocationsByCompanyId({
      supabase,
      companyId: effectiveCompanyId,
    });
    if (anyLoc && anyLoc.length > 0) {
      employeeCompanyLocationData = anyLoc[0];
    }
  }

  const { data: employeeStatutoryDetails } =
    await getEmployeeStatutoryDetailsById({ supabase, id: employeeId });

  const { data: holidayConfig } = await supabase
    .from("holiday_config")
    .select("type, multiplier, working_days, use_attendance_working_days")
    .eq("company_id", effectiveCompanyId as any);

  return {
    data: {
      employeeCompanyData,
      employeeCompanyConfig,
      employeeCompanyLocationData,
      employeeProjectAssignmentData,
      employeeStatutoryDetails,
      payrollData,
      holidayConfig: (holidayConfig as any) || [],
    },
    payrollId,
    employeeId,
  };
}

export default function SalarySlip() {
  const { data, payrollId, employeeId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { isDocument } = useIsDocument();

  if (!isDocument) return <div>Loading...</div>;

  const { earnings, deductions, employerContributions, netPay, actualWages } =
    resolveSalarySlipBreakdown({
      salaryEntries: data?.payrollData?.salary_entries,
      attendance: {
        working_days: data?.payrollData?.working_days || 0,
        present_days:
          data?.payrollData?.present_days ?? data?.payrollData?.paid_days ?? 0,
        paid_leaves: data?.payrollData?.paid_leaves || 0,
        casual_leaves: data?.payrollData?.casual_leaves || 0,
        paid_holidays: data?.payrollData?.paid_holidays || 0,
        absent_days: data?.payrollData?.absent_days || 0,
        overtime_hours: data?.payrollData?.overtime_hours || 0,
      },
      assignment: data?.payrollData?.employee?.salary_assignment,
      holidayConfig: data?.holidayConfig || [],
      month: data?.payrollData?.month,
    });

  const slipData = {
    month: getMonthNameFromNumber(data?.payrollData?.month),
    year: data?.payrollData?.year,
    companyData: {
      name: data?.employeeCompanyData?.name || "",
      address_line_1: data?.employeeCompanyLocationData?.address_line_1 || "",
      address_line_2: data?.employeeCompanyLocationData?.address_line_2 || "",
      city: data?.employeeCompanyLocationData?.city || "",
      state: data?.employeeCompanyLocationData?.state || "",
      pincode: data?.employeeCompanyLocationData?.pincode || "",
      company_salary_prefix: data?.employeeCompanyConfig?.company_salary_prefix || "",
      show_employer_contribution: data?.employeeCompanyConfig?.show_employer_contribution ?? false,
    },
    employee: {
      employeeData: {
        first_name: data?.payrollData?.employee?.first_name,
        middle_name: data?.payrollData?.employee?.middle_name,
        last_name: data?.payrollData?.employee?.last_name,
        employee_code: data?.payrollData?.employee?.employee_code,
        date_of_joining:
          data?.payrollData?.employee?.work_details?.start_date ||
          data?.payrollData?.employee?.date_of_joining ||
          data?.employeeProjectAssignmentData?.start_date ||
          "",
      },

      employeeProjectAssignmentData: {
        position: data?.employeeProjectAssignmentData?.position || "",
        start_date: data?.employeeProjectAssignmentData?.start_date || "",
        location:
          data?.employeeProjectAssignmentData?.sites?.company_locations?.name ||
          "",
        department:
          data?.employeeProjectAssignmentData?.departments?.name || "",
      },

      employeeStatutoryDetails: data?.employeeStatutoryDetails,
      attendance: {
        working_days: data?.payrollData?.working_days ?? 26,
        weekly_off: 0,
        paid_holidays: data?.payrollData?.paid_holidays ?? 0,
        paid_days:
          data?.payrollData?.present_days ?? data?.payrollData?.paid_days ?? 0,
        present_days:
          data?.payrollData?.present_days ?? data?.payrollData?.paid_days ?? 0,
        paid_leaves: data?.payrollData?.paid_leaves || 0,
        casual_leaves: data?.payrollData?.casual_leaves || 0,
        absents: data?.payrollData?.absent_days || 0,
        lwp: data?.payrollData?.absent_days || 0,
        overtime_hours: data?.payrollData?.overtime_hours || 0,
      },
      bankDetails: {
        bank:
          data?.payrollData?.employee?.employee_bank_details?.bank_name || "",
        account_number:
          data?.payrollData?.employee?.employee_bank_details?.account_number ||
          "",
      },
      earnings,
      deductions,
      employerContributions,
      netPay:
        netPay ??
        data?.payrollData?.net_pay ??
        data?.payrollData?.net_salary,
      actualWages: actualWages ?? data?.payrollData?.actual_wages,
    },
  };

  const handleDownload = async () => {
    try {
      const pdfBytes = await generateSalarySlipPdf(slipData as any);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salary_slip_${slipData.employee.employeeData.employee_code || "employee"}_${slipData.month}_${slipData.year}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    }
  };

  return (
    <Dialog
      defaultOpen
      onOpenChange={() => navigate(`/employees/${employeeId}/salary/slips`)}
    >
      <DialogContent
        className="w-full max-w-3xl h-[90vh] border border-gray-200 rounded-lg p-0 flex flex-col overflow-hidden bg-background"
        disableIcon
      >
        <div className="flex justify-between items-center px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <div className="text-sm font-semibold">Salary Slip Preview</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print
            </Button>
            <Button size="sm" onClick={handleDownload}>
              Download PDF
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-neutral-100 dark:bg-neutral-900">
          <div className="max-w-2xl mx-auto shadow-md rounded overflow-hidden">
            <SalarySlipPDF data={slipData} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
