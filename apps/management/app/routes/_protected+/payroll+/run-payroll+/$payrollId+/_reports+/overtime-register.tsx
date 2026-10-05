import { useLoaderData, useNavigate } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  type EmployeeWorkDetailsDataType,
  getCompanyById,
  getPrimaryLocationByCompanyId,
  getSalaryEntriesForSalaryRegisterAndAll,
} from "@canny_ecosystem/supabase/queries";
import {
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_NAME,
} from "@/constant";
import type {
  CompanyDatabaseRow,
  EmployeeDatabaseRow,
  EmployeeStatutoryDetailsDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import {
  getMonthNameFromNumber,
  replaceUnderscore,
  formatNumber,
} from "@canny_ecosystem/utils";
import { useSalaryEntriesStore } from "@/store/salary-entries";

type DataType = {
  month: string;
  year: number;
  companyData: CompanyDatabaseRow & LocationDatabaseRow;
  employeeData: {
    attendance: {
      working_days: number;
      weekly_off: number;
      paid_holidays: number;
      paid_days: number;
      paid_leaves: number;
      casual_leaves: number;
      absents: number;
    };
    employeeData: EmployeeDatabaseRow;
    employeeProjectAssignmentData: {
      position: string;
      department: string;
    };
    employeeStatutoryDetails: EmployeeStatutoryDetailsDatabaseRow;
    earnings: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
  }[];
};

export function OvertimeRegisterHTML({ data }: { data: DataType }) {
  if (!data?.employeeData?.length) {
    return (
      <div className="p-8 text-center text-neutral-500">
        No overtime records found for this payroll.
      </div>
    );
  }

  return (
    <div className="p-6 bg-white text-black font-sans text-xs min-w-[900px]">
      <div className="flex justify-between items-start border-b pb-4 mb-4">
        <div>
          <h1 className="text-base font-bold uppercase">{data.companyData?.name || "Company"}</h1>
          <p className="text-neutral-600 text-[11px]">
            {data.companyData?.address_line_1} {data.companyData?.city} {data.companyData?.state}
          </p>
          <p className="font-bold mt-1 text-sm">
            OVERTIME REGISTER - {data.month} {data.year}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-[11px]">{CANNY_MANAGEMENT_SERVICES_NAME}</p>
          <p className="text-neutral-600 text-[10px] max-w-xs">{CANNY_MANAGEMENT_SERVICES_ADDRESS}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-neutral-400 text-[10px]">
          <thead>
            <tr className="bg-neutral-100 border-b border-neutral-400 font-bold">
              <th className="border border-neutral-400 p-1 text-center w-8">#</th>
              <th className="border border-neutral-400 p-1 text-left min-w-[140px]">Employee</th>
              <th className="border border-neutral-400 p-1 text-left min-w-[110px]">Designation</th>
              <th className="border border-neutral-400 p-1 text-center w-20">Days Worked</th>
              <th className="border border-neutral-400 p-1 text-center w-24">OT Hours</th>
              <th className="border border-neutral-400 p-1 text-right min-w-[90px]">OT Rate</th>
              <th className="border border-neutral-400 p-1 text-right min-w-[100px] bg-blue-50">OT Earnings</th>
              <th className="border border-neutral-400 p-1 text-left min-w-[100px]">Sign / Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.employeeData.map((emp, i) => {
              const otEarning = emp.earnings.find((e) => e.name.toLowerCase().includes("overtime") || e.name.toLowerCase().includes("ot"))?.amount || 0;

              return (
                <tr key={i} className="border-b border-neutral-300 hover:bg-neutral-50">
                  <td className="border border-neutral-300 p-1 text-center">{i + 1}</td>
                  <td className="border border-neutral-300 p-1">
                    <div className="font-bold">{emp.employeeData.first_name} {emp.employeeData.last_name}</div>
                    <div className="text-neutral-500 text-[9px]">{emp.employeeData.employee_code}</div>
                  </td>
                  <td className="border border-neutral-300 p-1">
                    <div>{replaceUnderscore(emp.employeeProjectAssignmentData?.position || "")}</div>
                    <div className="text-neutral-500 text-[9px]">{emp.employeeProjectAssignmentData?.department}</div>
                  </td>
                  <td className="border border-neutral-300 p-1 text-center">
                    {emp.attendance?.paid_days || 0}
                  </td>
                  <td className="border border-neutral-300 p-1 text-center font-semibold">
                    --
                  </td>
                  <td className="border border-neutral-300 p-1 text-right">
                    --
                  </td>
                  <td className="border border-neutral-300 p-1 text-right font-bold text-blue-800 bg-blue-50/50">
                    ₹{formatNumber(otEarning)}
                  </td>
                  <td className="border border-neutral-300 p-1 text-[9px] text-neutral-400">
                    Signature
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const payrollId = params.payrollId as string;
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const { data: employeeCompanyData } = await getCompanyById({
    supabase,
    id: companyId,
  });
  const { data: employeesCompanyLocationData } =
    await getPrimaryLocationByCompanyId({ supabase, companyId });

  const { data: payrollDataAndOthers } =
    await getSalaryEntriesForSalaryRegisterAndAll({
      supabase,
      payrollId,
      month: 1,
      year: 2026,
    });

  return {
    data: {
      employeeCompanyData,
      employeesCompanyLocationData,
      payrollDataAndOthers,
    },
    payrollId,
  };
}

export default function OvertimeRegister() {
  const { data, payrollId } = useLoaderData<typeof loader>();
  const { selectedRows } = useSalaryEntriesStore();
  const navigate = useNavigate();
  const { isDocument } = useIsDocument();

  const selectedIds = new Set(selectedRows.map((emp: any) => emp.employee?.id));

  const updatedData = {
    ...data,
    payrollDataAndOthers: data?.payrollDataAndOthers?.filter((emp: any) => {
      return selectedIds.has(emp.employee?.id);
    }),
  };

  function transformData(data: any) {
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

    const attendanceData =
      data?.payrollDataAndOthers?.[0]?.salary_entries?.[0] || {};

    const employeeData = (data?.payrollDataAndOthers || []).map((emp: any) => {
      const earnings: any[] = [];
      const deductions: any[] = [];

      for (const entry of emp.salary_entries || []) {
        const entryItem = {
          name: entry.field_name || "Earning",
          amount: entry.amount || 0,
        };

        if (entry.type === "earning") {
          earnings.push(entryItem);
        } else if (entry.type === "deduction") {
          deductions.push(entryItem);
        }
      }

      return {
        employeeData: {
          first_name: emp?.first_name,
          middle_name: emp?.middle_name,
          last_name: emp?.last_name,
          employee_code: emp?.employee_code,
        },
        employeeProjectAssignmentData: {
          position: emp.work_details?.position || "",
          department: emp.work_details?.department || "",
        },
        employeeStatutoryDetails: {
          pf_number: emp.employee_statutory_details?.pf_number || "",
          esic_number: emp.employee_statutory_details?.esic_number || "",
          uan_number: emp.employee_statutory_details?.uan_number || "",
        },
        attendance: {
          working_days:
            emp?.salary_entries?.[0]?.monthly_attendance?.working_days ?? 0,
          weekly_off: 5,
          paid_holidays:
            emp?.salary_entries?.[0]?.monthly_attendance?.paid_holidays ?? 0,
          paid_days:
            emp?.salary_entries?.[0]?.monthly_attendance?.present_days ?? 0,
          paid_leaves:
            emp?.salary_entries?.[0]?.monthly_attendance?.paid_leaves ?? 0,
          casual_leaves:
            emp?.salary_entries?.[0]?.monthly_attendance?.casual_leaves ?? 0,
          absents:
            emp?.salary_entries?.[0]?.monthly_attendance?.absent_days ?? 0,
        },
        earnings,
        deductions,
      };
    });

    return {
      month: getMonthNameFromNumber(attendanceData?.monthly_attendance?.month || 1),
      year: attendanceData?.monthly_attendance?.year || 2026,
      companyData,
      employeeData,
    };
  }

  const slipData = transformData(updatedData);

  if (!isDocument) return <div>Loading...</div>;

  const handleOpenChange = () => {
    navigate(`/payroll/run-payroll/${payrollId}`);
  };

  return (
    <Dialog defaultOpen={true} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-6xl h-[92vh] border border-gray-200 rounded-lg p-0 flex flex-col overflow-hidden bg-background"
        disableIcon={true}
      >
        <div className="flex justify-between items-center px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <div className="text-sm font-semibold">
            Overtime Register - {slipData.month} {slipData.year}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print Register
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4">
          <div className="shadow-md rounded bg-white overflow-hidden">
            <OvertimeRegisterHTML data={slipData as unknown as DataType} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
