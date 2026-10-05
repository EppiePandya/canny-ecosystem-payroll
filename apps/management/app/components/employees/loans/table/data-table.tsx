import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@canny_ecosystem/ui/table";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { DataTableHeader } from "./data-table-header";
import { useLoanStore } from "@/store/loans";
import { useEffect, useState } from "react";
import type { LoanDataType } from "@canny_ecosystem/supabase/queries";
import { LoanExportBar } from "./loan-export-bar";

interface LoansDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  employeeName?: string;
  employeeCode?: string;
}

export function LoansDataTable<TData, TValue>({
  columns,
  data,
  employeeName,
  employeeCode,
}: LoansDataTableProps<TData, TValue>) {
  const { rowSelection, setRowSelection, setSelectedRows, selectedRows } =
    useLoanStore();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      rowSelection,
      columnVisibility,
    },
  });

  useEffect(() => {
    const rowArray = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);
    setSelectedRows(rowArray as LoanDataType[]);
  }, [rowSelection]);

  const tableLength = table.getRowModel().rows?.length;

  return (
    <div className="relative mb-8">
      <div
        className={cn(
          "relative border overflow-x-auto rounded",
          !tableLength && "border-none",
        )}
      >
        <div className="relative">
          <Table>
            <DataTableHeader
              table={table}
              className={cn(!tableLength && "hidden")}
            />
            <TableBody>
              {tableLength ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "relative h-[40px] md:h-[45px] cursor-default select-text",
                      (row.original as any)?.is_paid && "bg-primary/20",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "h-[60px] px-3 md:px-4 py-2 table-cell",
                            cell.column.id === "select" &&
                              "sticky left-0 min-w-12 max-w-12 bg-card z-10",
                            cell.column.id === "deductions" &&
                              "min-w-28 max-w-28",
                            cell.column.id === "reimbursement" &&
                              "min-w-28 max-w-28",
                            cell.column.id === "actions" &&
                              "sticky right-0 min-w-20 max-w-20 bg-card z-10",
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow className={cn(!tableLength && "border-none")}>
                  <TableCell
                    colSpan={columns.length}
                    className="h-80 bg-background grid place-items-center text-center tracking-wide text-xl capitalize"
                  >
                    No Loans Found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <LoanExportBar
        className={cn(!table.getSelectedRowModel().rows.length && "hidden")}
        rows={table.getSelectedRowModel().rows.length}
        data={selectedRows}
        columnVisibility={columnVisibility}
        onCancel={() => table.toggleAllRowsSelected(false)}
        employeeName={employeeName}
        employeeCode={employeeCode}
      />
    </div>
  );
}
