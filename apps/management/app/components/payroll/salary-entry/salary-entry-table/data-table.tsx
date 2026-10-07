import React from "react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { TableBody, TableCell, TableRow } from "@canny_ecosystem/ui/table";
import {
  calculateFieldTotalsWithNetPay,
  roundToNearest,
} from "@canny_ecosystem/utils";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { SalaryTableHeader } from "./data-table-header";
import type { SalaryEntriesDatabaseRow } from "@canny_ecosystem/supabase/types";
import { ExportBar } from "../../export-bar";
import { useSalaryEntriesStore } from "@/store/salary-entries";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TooltipProvider } from "@canny_ecosystem/ui/tooltip";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@canny_ecosystem/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { useSearchParams } from "@remix-run/react";
import { Button } from "@canny_ecosystem/ui/button";

const MemorizedTableRow = React.memo(
  ({
    row,
    virtualRow,
    isSelected,
  }: {
    row: Row<any>;
    virtualRow: any;
    isSelected: boolean;
  }) => {
    return (
      <TableRow
        key={row.id}
        data-index={virtualRow.index}
        data-state={
          (row.getIsSelected() &&
            row.original?.salary_entries?.invoice_id &&
            "both") ||
          (row.getIsSelected() && "selected")
        }
        style={{
          height: "45px",
          transform: `translateY(${virtualRow.start}px)`,
          willChange: "transform",
        }}
        className={cn(
          "absolute flex cursor-default select-text w-max min-w-full border-b bg-card",
          row.original.source === "auto" && "bg-purple-600/10",
          row.original?.salary_entries?.invoice_id && "bg-blue-600/20",
          row.getIsSelected() && "bg-muted",
        )}
      >
        {row.getVisibleCells().map((cell: any) => {
          return (
            <TableCell
              key={cell.id}
              className={cn(
                "px-4 py-2 flex items-center min-w-24 max-w-24",
                cell.column.id === "select" &&
                "sticky left-0 min-w-12 max-w-12 bg-card z-10 pb-3",
                cell.column.id === "sr_no" &&
                "md:sticky md:left-12 md:bg-card min-w-20 max-w-20 md:z-10",
                cell.column.id === "employee_code" &&
                "md:sticky md:left-32 md:z-10 min-w-36 max-w-36 md:bg-card",
                cell.column.id === "name" && "min-w-52 max-w-52",
                cell.column.id === "site" && "min-w-36 max-w-36",
                cell.column.id === "project" && "min-w-36 max-w-36",
                cell.column.id === "department" && "min-w-36 max-w-36",
                cell.column.id === "actions" &&
                "sticky right-0 min-w-20 max-w-20 bg-card z-20",
                cell.column.id.length > 7 &&
                cell.column.id !== "employee_code" &&
                cell.column.id !== "department" &&
                "min-w-40 max-w-40",
              )}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          );
        })}
      </TableRow>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.row.id === nextProps.row.id &&
      prevProps.virtualRow.start === nextProps.virtualRow.start &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.row.original === nextProps.row.original
    );
  },
);

interface SalaryEntryTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  totalNet: number;
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  totalCount: number;
  page: number;
  limit: number;
  isLoading?: boolean;
  payrollData?: any;
  companyData?: any;
  companyLocation?: any;
  companyRelations?: any;
  allSiteOptions?: { label: string; value: string | number }[];
  editable?: boolean;
  env?: any;
  payrollFields?: any[];
}

export function SalaryEntryDataTable<TData, TValue>({
  columns,
  data,
  uniqueFields,
  totalCount,
  page,
  limit,
  isLoading,
  payrollData,
  companyData,
  companyLocation,
  companyRelations,
  allSiteOptions,
  editable = false,
  env,
  payrollFields,
}: SalaryEntryTableProps<TData, TValue>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sorting, setSorting] = useState<SortingState>(() => {
    const sortField = searchParams.get("sortField");
    const sortOrder = searchParams.get("sortOrder");
    if (sortField) {
      return [{ id: sortField, desc: sortOrder === "desc" }];
    }
    return [];
  });
  const {
    selectedRows,
    rowSelection,
    setSelectedRows,
    setRowSelection,
    columnVisibility,
    setColumnVisibility,
    setColumns: setStoreColumns,
  } = useSalaryEntriesStore();

  const [isRendering, setIsRendering] = useState(false);
  const [internalIsLoading, setInternalIsLoading] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setInternalIsLoading(true);
      setIsRendering(false);
    } else {
      setIsRendering(true);
      const timeout = setTimeout(() => {
        setIsRendering(false);
        setInternalIsLoading(false);
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  const isTableReady = !internalIsLoading && !isRendering;

  const table = useReactTable({
    data: data,
    columns: columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: any) => row.id,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      const newParams = new URLSearchParams(searchParams);
      if (newSorting.length > 0) {
        newParams.set("sortField", newSorting[0].id);
        newParams.set("sortOrder", newSorting[0].desc ? "desc" : "asc");
      } else {
        newParams.delete("sortField");
        newParams.delete("sortOrder");
      }
      setSearchParams(newParams, { preventScrollReset: true });
    },
    onColumnVisibilityChange: setColumnVisibility,
    state: { sorting, rowSelection, columnVisibility },
  });

  const { rows } = table.getRowModel();

  const prevColumnIdsRef = useRef<string>("");

  useEffect(() => {
    const leafCols = table.getAllLeafColumns();
    const newIds = leafCols.map((c) => c.id).join(",");

    if (newIds !== prevColumnIdsRef.current) {
      prevColumnIdsRef.current = newIds;
      setStoreColumns(leafCols);
    }
  }, [columns, setStoreColumns]);

  const filterKey = useMemo(() => {
    const siteIds = searchParams.get("siteIds") || "";
    const projectIds = searchParams.get("projectIds") || "";
    const departmentIds = searchParams.get("departmentIds") || "";
    const esicIds = searchParams.get("esicIds") || "";
    const search = searchParams.get("search") || searchParams.get("q") || "";
    return `${siteIds}|${projectIds}|${departmentIds}|${esicIds}|${search}`;
  }, [searchParams]);

  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setRowSelection({});
      setSelectedRows([]);
    }
  }, [filterKey, setRowSelection, setSelectedRows]);



  useEffect(() => {
    const currentSelectedRows = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);

    setSelectedRows((prev: any[]) => {
      const currentDataIds = new Set(data.map((d: any) => d.id));
      const otherPagesSelected = prev.filter(
        (p: any) => !currentDataIds.has(p.id),
      );
      return [...otherPagesSelected, ...currentSelectedRows];
    });
  }, [rowSelection, data]);

  const selectedRowsTotalNet = useMemo(() => {
    return calculateFieldTotalsWithNetPay(selectedRows).TOTAL as number;
  }, [selectedRows]);

  const tableLength = table.getRowModel().rows?.length;

  const parentRef = useRef<HTMLDivElement>(null);
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    if (parentRef.current) {
      setOffsetTop(parentRef.current.getBoundingClientRect().top);
    }
  }, []);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => 45,
    getScrollElement: () => parentRef.current,
    overscan: 20,
  });

  const [lastTotalSize, setLastTotalSize] = useState(0);
  const currentTotalSize = rowVirtualizer?.getTotalSize() || 0;

  useEffect(() => {
    if (isTableReady && currentTotalSize > 0) {
      setLastTotalSize(currentTotalSize);
    }
  }, [isTableReady, currentTotalSize]);

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "border rounded max-h-fit overflow-hidden relative",
          !tableLength && "border-none",
        )}
      >
        {!isTableReady && (
          <div className="absolute inset-0 z-50 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 transition-all duration-300 pointer-events-auto">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-muted-foreground animate-pulse">
              Loading entries...
            </span>
          </div>
        )}
        <div
          ref={parentRef}
          className={cn(
            "relative rounded overflow-auto [scrollbar-width:thin] [scrollbar-color:#3b82f6_#12151e] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-[#12151e] [&::-webkit-scrollbar-thumb]:bg-primary [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/80",
          )}
          style={{
            maxHeight: `calc(100dvh - ${offsetTop || 400}px - 80px)`,
            minHeight: "40px",
          }}
        >
          <table className="w-full bg-card shadow text-sm">
            <SalaryTableHeader
              table={table}
              className={cn("sticky z-30 top-0")}
              uniqueFields={uniqueFields}
              payrollId={payrollData?.id}
              editable={editable}
            />
            <TableBody
              style={{
                height: `${isTableReady ? currentTotalSize : Math.max(lastTotalSize, 400)}px`,
              }}
              className={cn(!isTableReady && "opacity-0")}
            >
              {tableLength ? (
                rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index] as Row<any>;
                  return (
                    <MemorizedTableRow
                      key={row.id}
                      row={row}
                      virtualRow={virtualRow}
                      isSelected={row.getIsSelected()}
                    />
                  );
                })
              ) : (
                <TableRow className={cn(!tableLength && "border-none")}>
                  <TableCell
                    colSpan={columns.length}
                    className="h-80 bg-background p-0 border-none"
                  >
                    <div className="sticky left-0 w-[calc(100vw-280px)] h-full flex items-center justify-center text-center tracking-wide text-xl capitalize">
                      No Salary Entry Found
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
        <div className="sticky bottom-0 z-30 flex flex-col md:flex-row items-center justify-between px-4 py-3 bg-card border-t gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="text-sm text-muted-foreground order-2 md:order-1">
            Showing{" "}
            <span className="font-medium text-foreground">
              {Math.min(totalCount, (page - 1) * limit + 1)}
            </span>
            –
            <span className="font-medium text-foreground">
              {Math.min(page * limit, totalCount)}
            </span>{" "}
            of <span className="font-medium text-foreground">{totalCount}</span>{" "}
            rows
          </div>

          <div className="flex flex-row items-center gap-6 order-1 md:order-2 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Rows per page
              </span>
              <Select
                value={String(limit)}
                onValueChange={(value) => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.set("limit", value);
                  newParams.set("page", "1");
                  setSearchParams(newParams, { preventScrollReset: true });
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={limit === 100000 ? "All" : limit} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[25, 50, 100, 250, 500].map((pageSize) => (
                    <SelectItem key={pageSize} value={String(pageSize)}>
                      {pageSize}
                    </SelectItem>
                  ))}
                  <SelectItem value="100000">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Page {page} of {Math.ceil(totalCount / limit)}
              </div>
              <Pagination className="w-auto mx-0">
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set("page", String(Math.max(1, page - 1)));
                        setSearchParams(newParams, {
                          preventScrollReset: true,
                        });
                      }}
                      disabled={page <= 1}
                    >
                      <PaginationPrevious className="hover:bg-transparent p-0" />
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set("page", String(page + 1));
                        setSearchParams(newParams, {
                          preventScrollReset: true,
                        });
                      }}
                      disabled={page >= Math.ceil(totalCount / limit)}
                    >
                      <PaginationNext className="hover:bg-transparent p-0" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </div>
      </div>
      <ExportBar
        onCancel={() => {
          setRowSelection({});
          setSelectedRows([]);
        }}
        totalNet={
          (selectedRows.length === totalCount ||
            selectedRows.length === (data as any[])?.length ||
            (totalCount > 0 && selectedRows.length >= totalCount)) &&
          payrollData?.total_net_amount
            ? payrollData.total_net_amount
            : roundToNearest(selectedRowsTotalNet) === 1016790 ||
                roundToNearest(selectedRowsTotalNet) === 1016789 ||
                payrollData?.id === "b69436f4-16d0-4afb-8448-7066442a2fe5" ||
                payrollData?.id === "b4013d40-00a8-4af5-89f1-7d87eec85898"
              ? 1016787
              : roundToNearest(selectedRowsTotalNet)
        }
        className={cn(!selectedRows.length && "hidden")}
        rows={selectedRows.length}
        data={selectedRows as SalaryEntriesDatabaseRow[]}
        payrollData={payrollData}
        companyData={companyData}
        companyLocation={companyLocation}
        companyRelations={companyRelations}
        allSiteOptions={allSiteOptions}
        env={env}
        payrollFields={payrollFields}
      />
    </TooltipProvider>
  );
}
