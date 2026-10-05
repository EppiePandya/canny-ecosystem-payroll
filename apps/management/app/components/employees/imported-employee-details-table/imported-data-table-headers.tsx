import { Button } from "@canny_ecosystem/ui/button";
import { TableHead, TableHeader, TableRow } from "@canny_ecosystem/ui/table";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { flexRender } from "@tanstack/react-table";

type Props = {
  table: any;
  className?: string;
};

export function ImportedDataTableHeader({ table, className }: Props) {
  return (
    <TableHeader className={className}>
      {table.getHeaderGroups().map((headerGroup: any) => (
        <TableRow
          key={headerGroup.id}
          className="h-[45px] hover:bg-transparent"
        >
          {headerGroup.headers.map((header: any) => {
            return (
              <TableHead
                key={header.id}
                className={cn(
                  "px-4 py-2 text-sm font-semibold whitespace-nowrap",
                  header.id === "actions" &&
                    "sticky right-0 min-w-20 max-w-20 bg-card z-10 border-l shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.1)]",
                )}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
