import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { TableHead, TableHeader, TableRow } from "@canny_ecosystem/ui/table";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { flexRender } from "@tanstack/react-table";

type Props = {
  table?: any;
  className?: string;
  loading?: boolean;
  fieldConfigs: FieldConfig[];
  onDeleteColumn?: (colKey: string) => void;
};

const NON_DELETABLE_KEYS = new Set([
  "select",
  "sr_no",
  "employee_name",
  "employee_code",
  "uan_no",
  "esic_no",
  "working_days",
  "present_days",
  "gross",
  "deduction",
  "total_deductions",
  "total_deduction",
  "net_pay",
]);

export function ImportedDataTableHeader({
  table,
  className,
  loading,
  fieldConfigs,
  onDeleteColumn,
}: Props) {
  const ImportPayrollDataArray: string[] = ["select", "sr_no"];

  for (const { key } of fieldConfigs) {
    const lowerKey = key.toLowerCase();
    if (!ImportPayrollDataArray.includes(lowerKey)) {
      ImportPayrollDataArray.push(lowerKey);
    }
  }

  const getColDef = (id: string) =>
    table?.getAllLeafColumns()?.find((col: { id: string }) => {
      return col.id.toLowerCase() === id.toLowerCase();
    });

  return (
    <TableHeader className={className}>
      <TableRow className="h-[45px] hover:bg-transparent">
        {ImportPayrollDataArray?.map((id) => {
          const colDef = getColDef(id);
          const isSelect = id === "select";
          const canDelete =
            Boolean(onDeleteColumn) &&
            !NON_DELETABLE_KEYS.has(id.toLowerCase());

          if (isSelect) {
            return (
              <TableHead key={id} className="w-10 px-2 text-center">
                {colDef &&
                  flexRender(
                    colDef.columnDef.header,
                    colDef.getContext
                      ? colDef.getContext()
                      : { table, column: colDef },
                  )}
              </TableHead>
            );
          }

          const headerTitle =
            loading ||
            (typeof colDef?.columnDef?.header === "function"
              ? flexRender(
                  colDef.columnDef.header,
                  colDef.getContext
                    ? colDef.getContext()
                    : { table, column: colDef },
                )
              : colDef?.columnDef?.header);

          return (
            <TableHead key={id} className={cn("px-4 py-2 group/col relative")}>
              <div className="flex items-center justify-between gap-1.5">
                <Button
                  className={cn(
                    "p-0 hover:bg-transparent space-x-2 disabled:opacity-100 font-semibold text-xs tracking-tight",
                  )}
                  variant="ghost"
                  disabled={true}
                >
                  <span className="capitalize">{headerTitle}</span>
                </Button>

                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteColumn?.(id);
                    }}
                    className="opacity-0 group-hover/col:opacity-100 hover:text-destructive text-muted-foreground transition-opacity p-0.5 rounded cursor-pointer"
                    title={`Delete Column "${id}"`}
                    aria-label={`Delete Column ${id}`}
                  >
                    <Icon name="trash" size="xs" />
                  </button>
                )}
              </div>
            </TableHead>
          );
        })}
      </TableRow>
    </TableHeader>
  );
}
