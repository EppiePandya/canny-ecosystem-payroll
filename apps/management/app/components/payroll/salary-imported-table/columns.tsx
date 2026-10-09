import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@canny_ecosystem/ui/utils/cn";

import { ImportedSalaryPayrollOptionsDropdown } from "./imported-table-options";
import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { replaceUnderscore } from "@canny_ecosystem/utils";

export const isTotalDeductionsField = (key: string) => {
  const norm = String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (
    norm === "totaldeductions" ||
    norm === "totaldeduction" ||
    norm === "totalded" ||
    norm === "totded" ||
    norm === "totdeductions" ||
    norm === "totaldeductionamount"
  );
};

export const isNetPayField = (key: string) => {
  const norm = String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (
    norm === "netpay" ||
    norm === "netsalary" ||
    norm === "netamount" ||
    norm === "netpayable" ||
    norm === "net"
  );
};

export function sortPayrollFieldConfigs<T extends { key: string }>(
  configs: T[],
): T[] {
  const normalFields: T[] = [];
  const totalDeductionsFields: T[] = [];
  const netPayFields: T[] = [];

  for (const config of configs) {
    if (isTotalDeductionsField(config.key)) {
      totalDeductionsFields.push(config);
    } else if (isNetPayField(config.key)) {
      netPayFields.push(config);
    } else {
      normalFields.push(config);
    }
  }

  return [...normalFields, ...totalDeductionsFields, ...netPayFields];
}

const getHighlightKey = (rowOriginal: any, fieldConfigs: FieldConfig[]) => {
  const hasCode =
    fieldConfigs.some((f) => f.key === "employee_code") &&
    rowOriginal?.employee_code;
  if (hasCode) return "employee_code";

  const hasUan =
    fieldConfigs.some((f) => f.key === "uan_number") && rowOriginal?.uan_number;
  if (hasUan) return "uan_number";

  return "employee_name";
};

export const ImportedDataColumns = (
  fieldConfigs: FieldConfig[],
): ColumnDef<any>[] => {
  const sortedFieldConfigs = sortPayrollFieldConfigs(fieldConfigs);

  return [
    {
      accessorKey: "sr_no",
      header: "Sr No.",
      cell: ({ row }) => {
        return <p className="truncate ">{row.index + 1}</p>;
      },
    },
    ...sortedFieldConfigs.map((field) => ({
      accessorKey: field.key,
      header: replaceUnderscore(field.key) ?? "",
      cell: ({ row }: { row: { original: any } }) => {
        const key = field.key;
        const isNewEmployee = row.original?.is_new_employee;
        const highlightKey = getHighlightKey(row.original, sortedFieldConfigs);
      const shouldHighlight = isNewEmployee && key === highlightKey;

      const value: any = row.original?.[key as keyof any];
      const displayColor =
        typeof value === "object"
          ? value?.type === "earning"
            ? "text-green"
            : "text-destructive"
          : "";
      const displayValue =
        typeof value === "object" && value?.amount !== undefined
          ? Math.round(value.amount)
          : typeof value === "number"
            ? Math.round(value)
            : value ?? "--";

      return (
        <div className="flex items-center gap-1.5 min-w-0">
          <p
            className={cn(
              displayColor,
              shouldHighlight &&
                "text-amber-800 dark:text-amber-400 font-semibold italic",
            )}
          >
            {displayValue}
          </p>
          {shouldHighlight && (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0"
              title="Unmatched New Employee"
            />
          )}
        </div>
      );
    },
  })),

  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <ImportedSalaryPayrollOptionsDropdown
          key={JSON.stringify(row.original)}
          index={row.index}
          data={row.original}
          triggerChild={
            <DropdownMenuTrigger asChild>
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
