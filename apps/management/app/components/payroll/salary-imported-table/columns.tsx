import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import type { ColumnDef } from "@tanstack/react-table";

import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { replaceUnderscore } from "@canny_ecosystem/utils";

const getHighlightKey = (rowOriginal: any, fieldConfigs: FieldConfig[]) => {
  const hasCode =
    fieldConfigs.some((f) => f.key === "employee_code") &&
    rowOriginal?.employee_code;
  if (hasCode) return "employee_code";

  const hasUan =
    fieldConfigs.some((f) => f.key === "uan_no") &&
    (rowOriginal?.uan_no || rowOriginal?.uan_number);
  if (hasUan) return "uan_no";

  return "employee_name";
};

export const ImportedDataColumns = (
  fieldConfigs: FieldConfig[],
): ColumnDef<any>[] => [
  {
    id: "select",
    header: ({ table }) => {
      const rows = table.getRowModel().rows;
      const selectableRows = rows.filter(
        (r) => !r.original?.has_error && !r.original?.is_disabled,
      );
      const allSelectableSelected =
        selectableRows.length > 0 &&
        selectableRows.every((r) => r.getIsSelected());
      const someSelectableSelected = selectableRows.some((r) =>
        r.getIsSelected(),
      );

      return (
        <div className="flex items-center justify-center px-1">
          <Checkbox
            checked={
              allSelectableSelected ||
              (someSelectableSelected && !allSelectableSelected
                ? "indeterminate"
                : false)
            }
            onCheckedChange={(value) => {
              for (const r of selectableRows) {
                r.toggleSelected(!!value);
              }
            }}
            aria-label="Select all"
            className="translate-y-[2px]"
          />
        </div>
      );
    },
    cell: ({ row }) => {
      const isDisabled = Boolean(
        row.original?.has_error || row.original?.is_disabled,
      );

      return (
        <div className="flex items-center justify-center px-1">
          <Checkbox
            checked={row.getIsSelected()}
            disabled={isDisabled}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className={cn(
              "translate-y-[2px]",
              isDisabled && "opacity-40 cursor-not-allowed",
            )}
          />
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "sr_no",
    header: "Sr No.",
    cell: ({ row }) => {
      const hasError = Boolean(
        row.original?.has_error || row.original?.is_disabled,
      );

      return (
        <div className="flex items-center gap-1.5 truncate">
          <p className="truncate">{row.index + 1}</p>
          {hasError && (
            <span
              title={
                row.original?.error_message ||
                "This row has an error and is disabled for mutations"
              }
              className="inline-flex shrink-0"
            >
              <Icon
                name="exclaimation-triangle"
                size="xs"
                className="text-destructive"
              />
            </span>
          )}
        </div>
      );
    },
  },
  ...fieldConfigs.map((field) => ({
    accessorKey: field.key,
    header: replaceUnderscore(field.key) ?? "",
    cell: ({ row }: { row: { original: any } }) => {
      const key = field.key;
      const isNewEmployee = row.original?.is_new_employee;
      const highlightKey = getHighlightKey(row.original, fieldConfigs);
      const shouldHighlight = isNewEmployee && key === highlightKey;

      const rawVal = row.original?.[key as keyof any];
      const value: any =
        rawVal !== undefined && rawVal !== null && rawVal !== ""
          ? rawVal
          : key === "uan_number"
            ? row.original?.uan_no
            : key === "uan_no"
              ? row.original?.uan_number
              : key === "esic_number"
                ? row.original?.esic_no
                : key === "esic_no"
                  ? row.original?.esic_number
                  : undefined;
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
            : value !== undefined && value !== null && value !== ""
              ? value
              : "--";

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
];
