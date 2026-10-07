import type { ColumnDef } from "@tanstack/react-table";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";

import {
  calculateNetAmountAfterEntryCreated,
  getMonthNameFromNumber,
  hasPermission,
  roundToNearest,
  deleteRole,
  updateRole,
  countWorkingDaysInMonth,
  isPhWagesComponent,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Link } from "@remix-run/react";

import { SalaryEntryDropdown } from "../salary-entry-dropdown";
import { SalaryEntrySheet } from "./salary-entry-sheet";
import { SalaryEntryAttendance } from "./salary-entry-attendance";
import { SalaryEntryFieldsSheet } from "./salary-entry-fields-sheet";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { IncompleteProfileTooltip } from "../../../employees/incomplete-profile-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";

import { WORKING_DAYS_MON_TO_SAT } from "@/constant";

export const salaryEntryColumns = ({
  data,
  editable = false,
  uniqueFields,
  page,
  limit,
  rowSelection,
  onSuccess,
}: {
  data: any;
  editable?: boolean;
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  page: number;
  limit: number;
  rowSelection?: Record<string, boolean>;
  onSuccess?: (updatedEntry: any) => void;
}): ColumnDef<any>[] => {
  return [
    {
      id: "select",
      cell: ({ row }) => (
        <Checkbox
          checked={rowSelection ? !!rowSelection[row.id] : row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "sr_no",
      accessorKey: "sr_no",
      header: "Sr No.",
      sortingFn: (a, b) => a.index - b.index,
      cell: ({ row }) => (
        <p className={cn("truncate")}>{(page - 1) * limit + row.index + 1}</p>
      ),
    },
    {
      id: "employee_code",
      accessorKey: "employee_code",
      header: "Employee Code",
      accessorFn: (row) => row.employee.employee_code,
      sortingFn: (a, b) =>
        String(a.getValue("employee_code") ?? "").localeCompare(
          String(b.getValue("employee_code") ?? ""),
        ),
      cell: ({ row }) => (
        <Link to={`/employees/${row.original.employee.id}`}>
          <p className="truncate text-primary cursor-pointer">
            {row.original?.employee.employee_code ?? "--"}
          </p>
        </Link>
      ),
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Employee Name",
      accessorFn: (row) => {
        const emp = row.employee;
        const nameParts = `${emp?.first_name ?? ""} ${emp?.middle_name ?? ""} ${emp?.last_name ?? ""}`.trim();
        return nameParts || emp?.name || emp?.employee_code || "N/A";
      },
      sortingFn: (a, b) =>
        String(a.getValue("name") ?? "").localeCompare(
          String(b.getValue("name") ?? ""),
        ),
      cell: ({ row }) => {
        const employee = row.original?.employee;
        const statutory = employee?.employee_statutory_details;
        const assignment = employee?.salary_assignment;
        const today = new Date().toISOString().split("T")[0];

        const hasActiveAssignment =
          assignment &&
          (!assignment.effective_date || assignment.effective_date <= today);

        const missingFields = [];
        if (!statutory?.uan_number) missingFields.push("UAN Number");
        if (!statutory?.esic_number) missingFields.push("ESIC Number");
        if (!hasActiveAssignment) missingFields.push("Salary Details");

        const fullNameParts = `${employee?.first_name ?? ""} ${
          employee?.middle_name ?? ""
        } ${employee?.last_name ?? ""}`.trim();
        const displayName = fullNameParts || employee?.name || employee?.employee_code || "N/A";

        return (
          <div className="flex items-center gap-2 group w-full overflow-hidden">
            <Link to={`/employees/${employee?.id}`} className="min-w-0">
              <p className="truncate capitalize w-52 text-primary cursor-pointer font-medium">
                {displayName}
              </p>
            </Link>
            <IncompleteProfileTooltip missingFields={missingFields} />
          </div>
        );
      },
    },
    {
      accessorKey: "site",
      header: "Site",
      accessorFn: (row) => row.employee?.work_details?.site?.name,
      sortingFn: (a, b) =>
        String(a.getValue("site") ?? "").localeCompare(
          String(b.getValue("site") ?? ""),
        ),
      cell: ({ row }) => (
        <Link to={`/employees/${row.original.employee.id}/work-portfolio`}>
          <p className="truncate text-primary cursor-pointer">
            {row.original.employee?.work_details?.site?.name ?? "--"}
          </p>
        </Link>
      ),
    },
    {
      accessorKey: "project",
      header: "Project",
      accessorFn: (row) => row.employee?.work_details?.project?.name,
      sortingFn: (a, b) =>
        String(a.getValue("project") ?? "").localeCompare(
          String(b.getValue("project") ?? ""),
        ),
      cell: ({ row }) => (
        <Link to={`/employees/${row.original.employee.id}/work-portfolio`}>
          <p className="truncate text-primary cursor-pointer">
            {row.original.employee?.work_details?.project?.name ?? "--"}
          </p>
        </Link>
      ),
    },
    {
      accessorKey: "department",
      header: "Department",
      accessorFn: (row) => row.employee?.work_details?.department?.name,
      sortingFn: (a, b) =>
        String(a.getValue("department") ?? "").localeCompare(
          String(b.getValue("department") ?? ""),
        ),
      cell: ({ row }) => (
        <Link to={`/employees/${row.original.employee.id}/work-portfolio`}>
          <p className="truncate text-primary cursor-pointer">
            {row.original.employee?.work_details?.department?.name ?? "--"}
          </p>
        </Link>
      ),
    },

    {
      id: "working_days",
      header: "W. Days",
      cell: ({ row }) => {
        const workingDayCount = countWorkingDaysInMonth({
          year: row.original.year,
          month: row.original.month,
          working_days: WORKING_DAYS_MON_TO_SAT,
        });

        return (
          <SalaryEntryAttendance
            payrollId={row.original.salary_entries.payroll_id}
            field="working_days"
            attendance={{ ...row.original, working_days: workingDayCount }}
            editable={editable}
            employee={row.original.employee}
            triggerChild={
              <p className="truncate text-primary cursor-pointer">
                {row.original.working_days ?? workingDayCount}
              </p>
            }
            onSuccess={onSuccess}
          />
        );
      },
    },

    {
      id: "present_days",
      header: "P. Days",
      accessorFn: (row) => row.present_days ?? 0,
      sortingFn: (a, b) =>
        Number(a.getValue("present_days") ?? 0) -
        Number(b.getValue("present_days") ?? 0),
      cell: ({ row }) => {
        const calculation = row.original.calculation;
        const adjustedDays =
          calculation?.adjustedPayableDays ?? row.original.present_days ?? 0;
        const breakdown = calculation?.payableDaysBreakdown ?? [];
        const baseDays = row.original.present_days ?? 0;

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SalaryEntryAttendance
                    payrollId={row.original.salary_entries.payroll_id}
                    attendance={row.original}
                    field="present_days"
                    editable={editable}
                    employee={row.original.employee}
                    triggerChild={
                      <div className="flex items-center gap-1 cursor-pointer">
                        <p className="truncate text-primary font-medium">
                          {baseDays}
                        </p>
                        {adjustedDays !== baseDays && (
                          <>
                            <p className="truncate text-green-600 font-bold">
                              {adjustedDays}
                            </p>
                          </>
                        )}
                      </div>
                    }
                    onSuccess={onSuccess}
                  />
                </div>
              </TooltipTrigger>
              {breakdown.length > 0 && (
                <TooltipContent className="p-3 min-w-[200px]">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold border-b pb-1">
                      Payable Days Breakdown
                    </p>
                    <div className="flex justify-between text-xs">
                      <span>Present Days</span>
                      <span>{baseDays}</span>
                    </div>
                    {breakdown.map((item: any) => (
                      <div
                        key={item.type}
                        className="flex justify-between text-xs text-green-600"
                      >
                        <span className="capitalize">
                          {item.type.replace("_", " ")} ({item.days} ×{" "}
                          {item.multiplier})
                        </span>
                        <span>+ {item.addedDays}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-bold border-t pt-1">
                      <span>Total Payable</span>
                      <span>{adjustedDays}</span>
                    </div>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: "paid_holidays",
      header: "Holidays",
      accessorFn: (row) => row.paid_holidays ?? 0,
      sortingFn: (a, b) =>
        Number(a.getValue("paid_holidays") ?? 0) -
        Number(b.getValue("paid_holidays") ?? 0),
      cell: ({ row }) => (
        <SalaryEntryAttendance
          payrollId={row.original.salary_entries.payroll_id}
          attendance={row.original}
          field="paid_holidays"
          editable={editable}
          employee={row.original.employee}
          triggerChild={
            <p className="truncate text-primary cursor-pointer">
              {row.original.paid_holidays ?? 0}
            </p>
          }
          onSuccess={onSuccess}
        />
      ),
    },
    {
      id: "paid_leaves",
      header: "P. Leaves",
      accessorFn: (row) => row.paid_leaves ?? 0,
      sortingFn: (a, b) =>
        Number(a.getValue("paid_leaves") ?? 0) -
        Number(b.getValue("paid_leaves") ?? 0),
      cell: ({ row }) => (
        <SalaryEntryAttendance
          payrollId={row.original.salary_entries.payroll_id}
          attendance={row.original}
          field="paid_leaves"
          editable={editable}
          employee={row.original.employee}
          triggerChild={
            <p className="truncate text-primary cursor-pointer">
              {row.original.paid_leaves ?? 0}
            </p>
          }
          onSuccess={onSuccess}
        />
      ),
    },
    {
      id: "casual_leaves",
      header: "C. Leaves",
      accessorFn: (row) => row.casual_leaves ?? 0,
      sortingFn: (a, b) =>
        Number(a.getValue("casual_leaves") ?? 0) -
        Number(b.getValue("casual_leaves") ?? 0),
      cell: ({ row }) => (
        <SalaryEntryAttendance
          payrollId={row.original.salary_entries.payroll_id}
          attendance={row.original}
          field="casual_leaves"
          editable={editable}
          employee={row.original.employee}
          triggerChild={
            <p className="truncate text-primary cursor-pointer">
              {row.original.casual_leaves ?? 0}
            </p>
          }
          onSuccess={onSuccess}
        />
      ),
    },

    {
      id: "overtime_hours",
      header: "OT Hours",
      accessorFn: (row) => row.overtime_hours ?? 0,
      sortingFn: (a, b) =>
        Number(a.getValue("overtime_hours") ?? 0) -
        Number(b.getValue("overtime_hours") ?? 0),
      cell: ({ row }) => (
        <SalaryEntryAttendance
          payrollId={row.original.salary_entries.payroll_id}
          attendance={row.original}
          field="overtime_hours"
          editable={editable}
          employee={row.original.employee}
          triggerChild={
            <p className="truncate text-primary cursor-pointer">
              {row.original.overtime_hours ?? 0}
            </p>
          }
          onSuccess={onSuccess}
        />
      ),
    },

    {
      id: "period",
      accessorKey: "period",
      header: "Period",
      accessorFn: (row) =>
        `${getMonthNameFromNumber(row.month, true)} ${row.year}`,
      cell: ({ row }) => (
        <p className="truncate">
          {getMonthNameFromNumber(row.original.month, true)} {row.original.year}
        </p>
      ),
    },
    {
      id: "monthly_ctc",
      accessorKey: "monthly_ctc",
      header: "Monthly CTC",
      accessorFn: (row) => row.calculation?.monthlyCtc ?? 0,
      sortingFn: (a, b) =>
        (a.original.calculation?.monthlyCtc ?? 0) -
        (b.original.calculation?.monthlyCtc ?? 0),
      cell: ({ row }) => (
        <SalaryEntrySheet
          triggerChild={
            <p className="truncate text-blue-600 font-medium cursor-pointer">
              {roundToNearest(row.original.calculation?.monthlyCtc ?? 0)}
            </p>
          }
          editable={editable}
          employee={row.original.employee}
          salaryEntry={{
            amount: row.original.calculation?.monthlyCtc ?? 0,
            id: row.original.salary_entries?.id,
          }}
          isMonthlyCtc={true}
          payrollId={row.original.salary_entries?.payroll_id}
          monthlyAttendanceId={row.original.id}
          salaryEntryId={
            row.original.source === "db"
              ? row.original.salary_entries?.id
              : undefined
          }
          onSuccess={onSuccess}
        />
      ),
    },

    ...uniqueFields.map((field) => {
      const isFieldNameMatch = (a?: string, b?: string) => {
        if (!a || !b) return false;
        const normA = a.trim().toLowerCase().replace(/_/g, " ");
        const normB = b.trim().toLowerCase().replace(/_/g, " ");
        return normA === normB;
      };

      return {
        id: field.name,
        accessorKey: field.name,
        header: field.name,
        accessorFn: (row: any) => {
          const isPh = isPhWagesComponent({ name: field.name });
          if (isPh) {
            const calcEarning = row.calculation?.earnings?.find((e: any) =>
              isFieldNameMatch(e.name, field.name) || isPhWagesComponent(e),
            );
            if (calcEarning?.amount !== undefined) return calcEarning.amount ?? 0;
          }

          const valObj = row.salary_entries?.salary_field_values?.find(
            (entry: any) =>
              isFieldNameMatch(entry.payroll_fields?.name, field.name),
          );
          if (valObj != null && valObj.amount != null) {
            return Number(valObj.amount);
          }

          const calcEarning = row.calculation?.earnings?.find((e: any) =>
            isFieldNameMatch(e.name, field.name),
          );
          if (calcEarning?.amount !== undefined) return calcEarning.amount ?? 0;

          const calcDeduction = row.calculation?.deductions?.find((d: any) =>
            isFieldNameMatch(d.name, field.name),
          );
          if (calcDeduction?.amount !== undefined) return calcDeduction.amount ?? 0;

          return 0;
        },
        sortingFn: (a: any, b: any) =>
          (a.getValue(field.name) ?? 0) - (b.getValue(field.name) ?? 0),
        cell: ({ row }: { row: { original: (typeof data)[0] } }) => {
          const isPh = isPhWagesComponent({ name: field.name });
          const valueObj = row.original.salary_entries?.salary_field_values?.find(
            (entry: any) =>
              isFieldNameMatch(entry.payroll_fields?.name, field.name),
          );

          let payrollFieldTemplate = valueObj?.payroll_fields;
          if (!payrollFieldTemplate) {
            for (const item of data) {
              const found = item.salary_entries?.salary_field_values?.find(
                (entry: any) =>
                  isFieldNameMatch(entry.payroll_fields?.name, field.name),
              );
              if (found?.payroll_fields) {
                payrollFieldTemplate = found.payroll_fields;
                break;
              }
            }
          }

          const calcComp =
            row.original.calculation?.earnings?.find((e: any) =>
              isFieldNameMatch(e.name, field.name) || (isPh && isPhWagesComponent(e)),
            ) ||
            row.original.calculation?.deductions?.find((d: any) =>
              isFieldNameMatch(d.name, field.name),
            );

          const isAuto =
            valueObj?.source === "auto" || (!valueObj && (payrollFieldTemplate || calcComp));
          const displayColor =
            valueObj?.payroll_fields?.type === "earning" || field.type === "earning"
              ? "text-green"
              : valueObj?.payroll_fields?.type === "deduction" || field.type === "deduction"
                ? "text-destructive"
                : payrollFieldTemplate?.type === "earning"
                  ? "text-green"
                  : payrollFieldTemplate?.type === "deduction"
                    ? "text-destructive"
                    : "";

          const displayValue = isPh && calcComp?.amount !== undefined
            ? calcComp.amount
            : (valueObj?.amount ?? calcComp?.amount ?? 0);

        return (
          <SalaryEntryFieldsSheet
            triggerChild={
              <p
                className={cn(
                  displayColor,
                  isAuto && !valueObj && "opacity-70 italic",
                  "cursor-pointer",
                )}
              >
                {roundToNearest(displayValue)}
              </p>
            }
            editable={editable}
            employee={row.original.employee}
            payrollId={row.original.salary_entries.payroll_id}
            monthlyAttendanceId={row.original.id}
            salaryEntryId={
              row.original.source === "db"
                ? row.original.salary_entries.id
                : undefined
            }
            uniqueFields={uniqueFields}
            salaryFieldValues={
              row.original.salary_entries?.salary_field_values || []
            }
            allRowsData={data}
            activeFieldName={field.name}
            onSuccess={onSuccess}
          />
        );
      },
    };
  }),

    {
      id: "net_amount",
      accessorKey: "net_amount",
      header: "Net Pay",
      sortingFn: (a, b) => {
        const isNetName = (str: string) => {
          const n = (str || "").toUpperCase().replace(/[^A-Z]/g, "");
          return (
            n === "NET" ||
            n === "NETPAY" ||
            n === "NETSALARY" ||
            n === "NETAMOUNT" ||
            n === "NETPAYABLE" ||
            n === "NETPAYABLEAMOUNT" ||
            n === "NETWAGE" ||
            n === "NETWAGES"
          );
        };
        const getNet = (emp: any) => {
          const sfvs = emp?.salary_entries?.salary_field_values;
          if (Array.isArray(sfvs) && sfvs.length > 0) {
            const netPayEntry = sfvs.find((entry: any) =>
              isNetName(entry.payroll_fields?.name || ""),
            );
            if (netPayEntry && netPayEntry.amount != null) {
              return Number(netPayEntry.amount);
            }
          }
          if (emp?.calculation?.netAmount !== undefined && emp?.calculation?.netAmount !== null) {
            return Number(emp.calculation.netAmount);
          }
          return calculateNetAmountAfterEntryCreated(emp);
        };
        return getNet(a.original) - getNet(b.original);
      },
      cell: ({ row }) => {
        const isNetName = (str: string) => {
          const n = (str || "").toUpperCase().replace(/[^A-Z]/g, "");
          return (
            n === "NET" ||
            n === "NETPAY" ||
            n === "NETSALARY" ||
            n === "NETAMOUNT" ||
            n === "NETPAYABLE" ||
            n === "NETPAYABLEAMOUNT" ||
            n === "NETWAGE" ||
            n === "NETWAGES"
          );
        };
        const sfvs = row.original.salary_entries?.salary_field_values;
        let displayVal: number | undefined = undefined;
        if (Array.isArray(sfvs) && sfvs.length > 0) {
          const netPayEntry = sfvs.find((entry: any) =>
            isNetName(entry.payroll_fields?.name || ""),
          );
          if (netPayEntry && netPayEntry.amount != null) {
            displayVal = Number(netPayEntry.amount);
          }
        }
        if (displayVal === undefined) {
          displayVal =
            row.original.calculation?.netAmount !== undefined &&
            row.original.calculation?.netAmount !== null
              ? Number(row.original.calculation.netAmount)
              : calculateNetAmountAfterEntryCreated(row.original);
        }
        return (
          <p className="truncate font-semibold text-foreground">
            {roundToNearest(displayVal)}
          </p>
        );
      },
    },

    {
      id: "actions",
      accessorKey: "actions",
      header: "",
      cell: ({ row }) => {
        const { role } = useUser();

        return (
          <SalaryEntryDropdown
            data={row.original}
            editable={editable}
            triggerChild={
              <DropdownMenuTrigger
                asChild
                className={cn(
                  "flex",
                  !hasPermission(role, `${updateRole}:${attribute.payroll}`) &&
                  !hasPermission(
                    role,
                    `${deleteRole}:${attribute.employees}`,
                  ) &&
                  "hidden",
                )}
              >
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <Icon name="dots-vertical" />
                </Button>
              </DropdownMenuTrigger>
            }
          />
        );
      },
    },
  ];
};
