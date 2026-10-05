import { Button } from "@canny_ecosystem/ui/button";
import { TableHead, TableHeader, TableRow } from "@canny_ecosystem/ui/table";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { flexRender } from "@tanstack/react-table";

type Props = {
  table?: any;
  className?: string;
  loading?: boolean;
};

export const paymentFieldsColumnIdArray = [
  "name",
  "display_name",
  "amount",
  "type",
  "calculation_type",
  "fixed_type",
  "display_order",
  "consider_for_epf",
  "consider_for_esic",
  "is_pro_rata",
  "is_overtime",
];

export function DataTableHeader({ table, className }: Props) {
  return (
    <TableHeader className={className}>
      {table?.getHeaderGroups().map((headerGroup: any) => (
        <TableRow
          key={headerGroup.id}
          className="h-[45px] hover:bg-transparent"
        >
          {headerGroup.headers.map((header: any) => (
            <TableHead
              key={header.id}
              className={cn(
                "px-4 py-2",
                header.id === "actions" &&
                  "sticky right-0 min-w-20 max-w-20 bg-card z-10",
              )}
            >
              <Button
                className="p-0 hover:bg-transparent space-x-2 disabled:opacity-100"
                variant="ghost"
                disabled
              >
                <span className="capitalize text-xs font-semibold">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </span>
              </Button>
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}
