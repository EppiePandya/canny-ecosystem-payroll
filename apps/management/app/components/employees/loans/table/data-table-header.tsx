import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { TableHead, TableHeader, TableRow } from "@canny_ecosystem/ui/table";
import { cn } from "@canny_ecosystem/ui/utils/cn";

type Props = {
  table?: any;
  className?: string;
  loading?: boolean;
};

// make sure the order is same as header order
export const loanDataArray = [
  { id: "select", width: "min-w-12 max-w-12" },
  { id: "loan_name", width: "min-w-32 max-w-32" },
  { id: "amount" },
  { id: "received_amount" },
  { id: "deductions", width: "min-w-28 max-w-28" },
  { id: "monthly_installment" },
  { id: "number_of_months" },
  { id: "reimbursement", width: "min-w-28 max-w-28" },
  { id: "is_paid" },
  { id: "loan_date", width: "min-w-28 max-w-28" },
];

export function DataTableHeader({ table, className, loading }: Props) {
  const columnName = (id: string) =>
    loading ||
    table?.getAllLeafColumns()?.find((col: any) => {
      return col.id === id;
    })?.columnDef?.header;

  return (
    <TableHeader className={cn("sticky top-0 z-10 bg-card", className)}>
      <TableRow className="h-[45px] hover:bg-transparent bg-card border-b">
        {loanDataArray?.map((item) => {
          if (item.id === "select") {
            return (
              <TableHead
                key={item.id}
                className={cn(
                  "px-4 py-2 sticky left-0 bg-card z-10 min-w-24 max-w-24",
                  item?.width,
                )}
              >
                <Checkbox
                  checked={
                    table?.getIsAllPageRowsSelected() ||
                    (table?.getIsSomePageRowsSelected() && "indeterminate")
                  }
                  onCheckedChange={(value) => {
                    table?.toggleAllPageRowsSelected(!!value);
                  }}
                />
              </TableHead>
            );
          }
          return (
            <TableHead
              key={item.id}
              className={cn("px-4 py-2  min-w-24 max-w-24", item?.width)}
            >
              <Button
                className="p-0 hover:bg-transparent space-x-2 disabled:opacity-100 text-xs font-bold uppercase text-muted-foreground whitespace-nowrap"
                variant="ghost"
                disabled={true}
              >
                <span>{columnName(item.id)}</span>
              </Button>
            </TableHead>
          );
        })}
        <TableHead className="sticky right-0 min-w-20 max-w-20 bg-card z-10" />
      </TableRow>
    </TableHeader>
  );
}
