import { useLoaderData, useNavigate } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import * as XLSX from "xlsx";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCompanyById,
  getLocationById,
  getPayrollById,
  getPrimaryLocationByCompanyId,
  getSalaryEntriesForSalaryRegisterAndAll,
} from "@canny_ecosystem/supabase/queries";
import {
  defaultMonth,
  defaultYear,
  getMonthNameFromNumber,
  replaceUnderscore,
  roundToNearest,
} from "@canny_ecosystem/utils";
import { useSalaryEntriesStore } from "@/store/salary-entries";
import {
  SalaryRegisterHTML,
  generateSalaryRegisterPdf,
  parseEmployeeComponents,
  type SalaryRegisterDataType,
} from "@/components/employees/pdf/salary-register-pdf";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const payrollId = params.payrollId as string;
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);
  const locationId = url.searchParams.get("location");

  const { data: payroll } = await getPayrollById({ payrollId, supabase });
  const { data: employeeCompanyData } = await getCompanyById({
    supabase,
    id: companyId,
  });

  let employeesCompanyLocationData = null;
  if (locationId) {
    const { data: loc } = await getLocationById({ supabase, id: locationId });
    employeesCompanyLocationData = loc;
  }
  if (!employeesCompanyLocationData) {
    const { data: primaryLoc } = await getPrimaryLocationByCompanyId({
      supabase,
      companyId,
    });
    employeesCompanyLocationData = primaryLoc;
  }

  const { data: payrollDataAndOthers } =
    await getSalaryEntriesForSalaryRegisterAndAll({
      supabase,
      payrollId,
      month: payroll?.month ?? defaultMonth,
      year: payroll?.year ?? defaultYear,
    });

  return {
    data: {
      employeeCompanyData,
      employeesCompanyLocationData,
      payrollDataAndOthers,
      payroll,
    },
    payrollId,
  };
}

export default function SalaryRegister() {
  const { data, payrollId } = useLoaderData<typeof loader>();
  const { selectedRows } = useSalaryEntriesStore();
  const navigate = useNavigate();
  const { isDocument } = useIsDocument();

  const selectedIds = new Set(selectedRows.map((emp: any) => emp.employee?.id));

  const updatedData = {
    ...data,
    payrollDataAndOthers: data?.payrollDataAndOthers?.filter((emp: any) => {
      if (selectedIds.size > 0 && !selectedIds.has(emp.employee?.id)) return false;
      return true;
    }),
  };

  function transformData(data: any): SalaryRegisterDataType {
    const company = data?.employeeCompanyData;
    const location = data?.employeesCompanyLocationData;

    const companyData = {
      name: company?.name,
      address_line_1: location?.address_line_1,
      address_line_2: location?.address_line_2,
      city: location?.city,
      state: location?.state,
      pincode: location?.pincode,
    };

    const preferredEarningOrder = ["BASIC", "DA", "VDA", "PH WAGES", "PH WAGE", "HRA"];
    const preferredDeductionOrder = ["PF", "ESIC", "PT"];

    const cleanUpper = (s: string) =>
      String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    const employeeData: any[] = (data.payrollDataAndOthers || []).map((emp: any) => {
      const earningFields = new Map<string, true>();
      const deductionFields = new Map<string, true>();
      const earningsMap: Record<string, number> = {};
      const deductionsMap: Record<string, number> = {};

      const rawSe = emp.salary_entries;
      const se = Array.isArray(rawSe) ? rawSe[0] : rawSe;
      const fieldValues = se?.salary_field_values || [];

      let netPay: number | null = null;
      let actualWages: number | null = null;
      let totalDeductions: number | null = null;

      const hasIndividualEarnings = fieldValues.some((entry: any) => {
        const name = entry?.payroll_fields?.name || entry?.name || "";
        const type = (entry?.payroll_fields?.type || entry?.type || "").toLowerCase();
        const c = cleanUpper(name);
        return (
          (type === "earning" || type.includes("earning")) &&
          !["ACTUALWAGES", "ACTUALWAGE", "NETPAY", "NETSALARY", "GROSS", "GROSSSALARY", "GROSSWAGES", "GROSSINCOME"].includes(c)
        );
      });

      for (const entry of fieldValues) {
        const name = entry?.payroll_fields?.name || entry?.name;
        const type = (entry?.payroll_fields?.type || entry?.type || "earning").toLowerCase();
        if (!name) continue;
        const c = cleanUpper(name);

        if (c === "NETPAY" || c === "NETSALARY") {
          netPay = Number(entry?.amount || 0);
          continue;
        }

        if (
          c === "TOTALDEDUCTIONS" ||
          c === "TOTALDED" ||
          c === "TOTALDEDUCTION"
        ) {
          totalDeductions = Number(entry?.amount || 0);
          continue;
        }

        if (
          c === "ACTUALWAGES" ||
          c === "ACTUALWAGE" ||
          c === "GROSS" ||
          c === "GROSSSALARY" ||
          c === "GROSSWAGES" ||
          c === "GROSSINCOME"
        ) {
          actualWages = Number(entry?.amount || 0);
          if (hasIndividualEarnings) {
            continue;
          }
        }

        if (type === "deduction") {
          if (!deductionFields.has(name)) deductionFields.set(name, true);
          deductionsMap[name] = Number(entry?.amount || 0);
        } else {
          if (!earningFields.has(name)) earningFields.set(name, true);
          earningsMap[name] = Number(entry?.amount || 0);
        }
      }

      const orderedEarnings = preferredEarningOrder.filter((f) =>
        earningFields.has(f),
      );
      const remainingEarnings = [...earningFields.keys()].filter(
        (f) => !preferredEarningOrder.includes(f),
      );
      const orderedDeductions = preferredDeductionOrder.filter((f) =>
        deductionFields.has(f),
      );
      const remainingDeductions = [...deductionFields.keys()].filter(
        (f) => !preferredDeductionOrder.includes(f),
      );

      const earnings = [...orderedEarnings, ...remainingEarnings].map(
        (name) => ({ name, amount: earningsMap[name] }),
      );
      const deductions = [...orderedDeductions, ...remainingDeductions].map(
        (name) => ({ name, amount: deductionsMap[name] }),
      );

      const dept = emp?.employee?.work_details?.department;
      const departmentName =
        (typeof dept === "object" ? dept?.name : dept) || "";
      const pos = emp?.employee?.work_details?.position;
      const positionName =
        (typeof pos === "object" ? pos?.name : pos) || "";

      return {
        employeeData: {
          first_name: emp?.employee?.first_name || "",
          middle_name: emp?.employee?.middle_name || "",
          last_name: emp?.employee?.last_name || "",
          employee_code: emp?.employee?.employee_code || "",
        },
        employeeProjectAssignmentData: {
          position: positionName,
          department: departmentName,
          date_of_joining: emp?.employee?.work_details?.start_date || "",
        },
        employeeStatutoryDetails: {
          pf_number: emp.employee?.employee_statutory_details?.pf_number || "",
          esic_number:
            emp.employee?.employee_statutory_details?.esic_number || "",
          uan_number:
            emp.employee?.employee_statutory_details?.uan_number || "",
        },
        attendance: {
          working_days: emp?.working_days ?? 26,
          weekly_off: 4,
          paid_holidays: emp?.paid_holidays ?? 0,
          paid_days: emp?.present_days ?? 0,
          paid_leaves: emp?.paid_leaves ?? 0,
          casual_leaves: emp?.casual_leaves ?? 0,
          absents: emp?.absent_days ?? 0,
        },
        bankDetails: {
          bank: emp.employee?.employee_bank_details?.bank_name,
          account_number: emp.employee?.employee_bank_details?.account_number,
        },
        earnings,
        deductions,
        monthly_ctc: emp?.salary_entries?.monthly_ctc,
        netPay: netPay ?? emp?.net_pay ?? emp?.net_salary,
        actualWages: actualWages ?? emp?.actual_wages,
        totalDeductions: totalDeductions ?? emp?.total_deductions,
      };
    });

    return {
      month: getMonthNameFromNumber(
        data.payrollDataAndOthers?.[0]?.month ?? data.payroll?.month ?? defaultMonth,
      ),
      year:
        data.payrollDataAndOthers?.[0]?.year ?? data.payroll?.year ?? defaultYear,
      companyData,
      employeeData,
    };
  }

  const slipData = transformData(updatedData);

  if (!isDocument) return <div>Loading...</div>;

  const handleOpenChange = () => {
    navigate(`/payroll/payroll-history/${payrollId}`);
  };

  const handleDownloadPDF = async () => {
    if (!slipData?.employeeData?.length) return;
    try {
      const pdfBytes = await generateSalaryRegisterPdf(slipData);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Salary_Register_${slipData.month}_${slipData.year}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate Salary Register PDF:", err);
    }
  };

  const handleDownloadExcel = () => {
    if (!slipData?.employeeData?.length) return;

    try {
      const earningFieldsSet = new Set<string>();
      const deductionFieldsSet = new Set<string>();

      slipData.employeeData.forEach((emp: any) => {
        emp.earnings?.forEach((e: any) => earningFieldsSet.add(e.name));
        emp.deductions?.forEach((d: any) => deductionFieldsSet.add(d.name));
      });

      const uniqueEarnings = Array.from(earningFieldsSet);
      const uniqueDeductions = Array.from(deductionFieldsSet);

      const rows = slipData.employeeData.map((emp: any, idx: number) => {
        const c = parseEmployeeComponents(emp);
        const gross = c.grossSalary;
        const totalDed = c.totalDeductions;
        const net = c.netPay;

        const row: Record<string, any> = {
          "Sr No.": idx + 1,
          "Emp Code": emp.employeeData?.employee_code || "",
          "Employee Name": `${emp.employeeData?.first_name || ""} ${emp.employeeData?.last_name || ""}`.trim(),
          "Designation": replaceUnderscore(emp.employeeProjectAssignmentData?.position || ""),
          "Department": emp.employeeProjectAssignmentData?.department || "",
          "PF No": emp.employeeStatutoryDetails?.pf_number || "",
          "ESI No": emp.employeeStatutoryDetails?.esic_number || "",
          "UAN No": emp.employeeStatutoryDetails?.uan_number || "",
          "Working Days": emp.attendance?.working_days || 0,
          "Paid Days": emp.attendance?.paid_days || 0,
        };

        uniqueEarnings.forEach((name) => {
          const found = emp.earnings.find((e: any) => e.name === name);
          row[name] = found ? found.amount : 0;
        });

        row["Gross Income"] = roundToNearest(gross);

        uniqueDeductions.forEach((name) => {
          const found = emp.deductions.find((d: any) => d.name === name);
          row[name] = found ? found.amount : 0;
        });

        row["Total Deductions"] = roundToNearest(totalDed);
        row["Net Pay"] = roundToNearest(net);
        row["Bank Name"] = emp.bankDetails?.bank || "";
        row["Account Number"] = emp.bankDetails?.account_number || "";

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Salary Register");
      XLSX.writeFile(
        wb,
        `Salary_Register_${slipData.month}_${slipData.year}.xlsx`,
      );
    } catch (err) {
      console.error("Failed to export Excel:", err);
    }
  };

  return (
    <Dialog defaultOpen={true} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-[95vw] lg:max-w-7xl h-[92vh] border border-gray-200 rounded-lg p-0 flex flex-col overflow-hidden bg-background"
        disableIcon={true}
      >
        <div className="flex justify-between items-center px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <div className="text-sm font-semibold">
            Salary Register - {slipData.month} {slipData.year}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print Register
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadExcel}>
              Download Excel
            </Button>
            <Button size="sm" onClick={handleDownloadPDF}>
              Download PDF
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4">
          <div className="shadow-md rounded bg-white overflow-hidden p-2">
            <SalaryRegisterHTML data={slipData} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
