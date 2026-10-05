import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHead,
} from "@canny_ecosystem/ui/table";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useSearchParams } from "@remix-run/react";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { getActiveSalaryAssignments } from "@canny_ecosystem/supabase/queries";

import { useSalariesStore } from "@/store/salaries";
import { ExportBar } from "../import-export/export-bar";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  count: number;
  hasNextPage: boolean;
  query?: string | null;
  filters?: any;
  pageSize: number;
  companyId: string;
  env: any;
}

export function DataTable<TData, TValue>({
  columns,
  data: initialData,
  count,
  query,
  filters,
  pageSize,
  hasNextPage: initialHasNextPage,
  companyId,
  env,
}: DataTableProps<TData, TValue>) {
  const [data, setData] = useState(initialData);
  const [from, setFrom] = useState(pageSize);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [searchParams] = useSearchParams();
  const { supabase } = useSupabase({ env });
  const { ref, inView } = useInView();
  const parentRef = useRef<HTMLDivElement>(null);

  const { rowSelection, setRowSelection, setSelectedRows, selectedRows } =
    useSalariesStore();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
    getRowId: (row: any) => {
      return row.employee_salary_assignment?.[0]?.id || row.id;
    },
  });

  useEffect(() => {
    const currentlySelectedRows = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);
    setSelectedRows(currentlySelectedRows);
  }, [rowSelection]);

  const loadMore = async () => {
    const to = from + pageSize;
    const sortParam = searchParams.get("sort");

    try {
      const { data: newData, meta } = await getActiveSalaryAssignments({
        supabase,
        companyId,
        params: {
          from,
          to,
          filters,
          searchQuery: query ?? undefined,
          sort: sortParam?.split(":") as [string, "asc" | "desc"],
        },
      });
      if (newData) {
        setData((prev) => [...prev, ...newData] as TData[]);
      }
      setFrom(to + 1);
      setHasNextPage((meta?.count ?? count) > to);
    } catch {
      setHasNextPage(false);
    }
  };

  useEffect(() => {
    if (inView && hasNextPage) {
      loadMore();
    }
  }, [inView]);

  useEffect(() => {
    setData(initialData);
    setFrom(pageSize);
    setHasNextPage(initialHasNextPage);
  }, [initialData]);

  const filterString = JSON.stringify({ query, filters });

  useEffect(() => {
    setRowSelection({});
    setSelectedRows([]);
  }, [filterString, setRowSelection, setSelectedRows]);

  return (
    <div className="border rounded">
      <div
        ref={parentRef}
        className="relative overflow-auto rounded"
        style={{
          maxHeight: "calc(100dvh - 250px)",
          minHeight: "400px",
        }}
      >
        <table className="w-full bg-card shadow text-sm">
          <TableHeader className="sticky top-0 z-10 bg-card border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "px-4 py-2.5 font-medium text-muted-foreground",
                      header.id === "actions" &&
                        "sticky right-0 bg-card z-20 w-10",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {data.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/30 transition-colors border-b last:border-0"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-4 py-2.5",
                        cell.column.id === "actions" &&
                          "sticky right-0 bg-card z-10",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-64 text-center text-muted-foreground"
                >
                  No salaries found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
        {hasNextPage && (
          <div ref={ref} className="flex justify-center p-4">
            <Spinner className="mr-2" />
            <span className="text-sm text-muted-foreground">
              Loading more...
            </span>
          </div>
        )}
      </div>
      {selectedRows.length > 0 && (
        <ExportBar
          rows={selectedRows.length}
          selectedRows={selectedRows}
          onCancel={() => setRowSelection({})}
          supabase={supabase}
        />
      )}
    </div>
  );
}
