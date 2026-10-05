import { cn } from "@canny_ecosystem/ui/utils/cn";
import { TableBody, TableCell, TableRow } from "@canny_ecosystem/ui/table";
import {
  flexRender,
  getCoreRowModel,
  type Row,
  useReactTable,
} from "@tanstack/react-table";
import { AttendanceTableHeader } from "./attendance-table-header";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@canny_ecosystem/ui/button";
import { useAttendanceStore } from "@/store/attendance";
import { ExportBar } from "../export-bar";

import { useSearchParams } from "@remix-run/react";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useInView } from "react-intersection-observer";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import {
  getMonthlyAttendanceByCompanyId,
  type AttendanceDataType,
} from "@canny_ecosystem/supabase/queries";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import {
  defaultMonth,
  defaultYear,
  getMonthName,
} from "@canny_ecosystem/utils";
import { months } from "@canny_ecosystem/utils/constant";
import { AttendanceComponent } from "../attendance-component";
import { getDailyAttendanceColumns } from "./daily-columns";

interface DataTableProps {
  columns: any;
  data: AttendanceDataType[];
  noFilters?: boolean;
  hasNextPage: boolean;
  count: number;
  pageSize: number;
  filters?: any;
  companyId: string;
  env: SupabaseEnv;
  query?: string | null;
  isDailyView?: boolean;
  companyName?: any;
  companyAddress?: any;
}

export function AttendanceTable({
  columns: initialColumns,
  data: initialData,
  hasNextPage: initialHasNextPage,
  noFilters,
  pageSize,
  filters,
  count,
  query,
  env,
  companyId,
  isDailyView,
  companyName,
  companyAddress,
}: DataTableProps) {
  const {
    rowSelection,
    setSelectedRows,
    setRowSelection,
    setColumns,
    columnVisibility,
    setColumnVisibility,
  } = useAttendanceStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<AttendanceDataType[]>(initialData);
  const [from, setFrom] = useState(pageSize);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoading, setIsLoading] = useState(false);
  const { supabase } = useSupabase({ env });

  const { ref, inView } = useInView();

  const loadMoreEmployees = async () => {
    if (isLoading || !hasNextPage) return;
    setIsLoading(true);
    const formattedFrom = from;
    const to = formattedFrom + pageSize;
    const sortParam = searchParams.get("sort");

    try {
      const { data } = await getMonthlyAttendanceByCompanyId({
        supabase,
        companyId,
        params: {
          from: formattedFrom,
          to: to,
          filters,
          searchQuery: query ?? undefined,
          sort: sortParam?.split(":") as [string, "asc" | "desc"],
        },
      });

      if (data) {
        setData((prevData) => {
          const existingIds = new Set(prevData.map((e) => e.id));
          const filteredNewData = data.filter((e) => !existingIds.has(e.id));
          return [...prevData, ...filteredNewData] as AttendanceDataType[];
        });
      }
      setFrom(to + 1);
      setHasNextPage(count > to);
    } catch (error) {
      console.error("Error loading more employees:", error);
      setHasNextPage(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setData(initialData);
    setFrom(pageSize);
    setHasNextPage(initialHasNextPage);
  }, [initialData, initialHasNextPage, pageSize]);

  const effectiveMonth = filters?.month
    ? Number((months as any)[filters.month])
    : defaultMonth;
  const effectiveYear = filters?.year ? Number(filters.year) : defaultYear;

  const cycle = searchParams.get("cycle") || undefined;

  const filteredData = useMemo(() => {
    if (!isDailyView || !cycle) return data;

    const prevMonthYear =
      effectiveMonth === 1 ? effectiveYear - 1 : effectiveYear;
    const prevMonthNum = effectiveMonth === 1 ? 12 : effectiveMonth - 1;
    const prevMonthPrefix = `${prevMonthYear}-${prevMonthNum.toString().padStart(2, "0")}`;

    return data.filter((emp) => {
      const dailyRecords = emp.monthly_attendance?.daily_records || [];
      if (dailyRecords.length === 0) {
        return cycle === "1-31" || cycle === "1-30";
      }

      const hasPrevMonthRecord = dailyRecords.some(
        (r) => r.date && r.date.startsWith(prevMonthPrefix),
      );

      if (cycle === "21-20") {
        return hasPrevMonthRecord;
      } else if (cycle === "1-31" || cycle === "1-30") {
        return !hasPrevMonthRecord;
      }
      return true;
    });
  }, [data, isDailyView, cycle, effectiveMonth, effectiveYear]);

  const resolvedColumns = useMemo(() => {
    if (!isDailyView) return initialColumns;
    return getDailyAttendanceColumns({
      month: effectiveMonth,
      year: effectiveYear,
      data: filteredData,
      onEditClick: (attendanceId, date, currentValue) => {
        setSearchParams(
          (prev) => {
            prev.set("edit_daily_id", attendanceId);
            prev.set("edit_daily_date", date);
            prev.set(
              "edit_daily_val",
              currentValue === "-" ? "REMOVE" : currentValue,
            );
            return prev;
          },
          { preventScrollReset: true },
        );
      },
    });
  }, [
    isDailyView,
    initialColumns,
    effectiveMonth,
    effectiveYear,
    filteredData,
    setSearchParams,
  ]);

  const columns = resolvedColumns;

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      rowSelection,
      columnVisibility,
    },
  });

  useEffect(() => {
    setColumns(table.getAllLeafColumns());
  }, [columnVisibility, resolvedColumns]);

  useEffect(() => {
    if (inView && hasNextPage && !isLoading) {
      loadMoreEmployees();
    }
  }, [inView, hasNextPage, isLoading]);

  const selectedRowsData = table
    .getSelectedRowModel()
    .rows?.map((row) => row.original);

  useEffect(() => {
    const rowArray = [];
    for (const row of table.getSelectedRowModel().rows) {
      rowArray.push(row.original);
    }
    setSelectedRows(rowArray as unknown as AttendanceDataType[]);
  }, [rowSelection]);
  const { rows } = table.getRowModel();

  const tableLength = table.getRowModel().rows?.length;

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => 8,
    getScrollElement: () => parentRef.current,
    measureElement:
      typeof window !== "undefined" &&
      navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 1,
  });

  return (
    <div
      className={cn(
        "border rounded max-h-fit overflow-hidden",
        !tableLength && "border-none",
      )}
    >
      <div
        ref={parentRef}
        className={cn("relative rounded overflow-auto")}
        style={{
          maxHeight: `calc(100dvh - ${parentRef.current?.getBoundingClientRect().top ?? 0}px - 32px)`,
          minHeight: "20px",
        }}
      >
        <table className="w-full bg-card shadow text-sm">
          <AttendanceTableHeader
            table={table}
            className={cn("sticky z-10 top-0", !tableLength && "hidden")}
          />
          <TableBody
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {tableLength ? (
              rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index] as Row<any>;
                return (
                  <TableRow
                    data-index={virtualRow.index}
                    ref={(node) => rowVirtualizer.measureElement(node)}
                    key={row.id}
                    data-state={
                      (row.getIsSelected() &&
                        row.original?.monthly_attendance?.salary_entries
                          ?.invoice_id &&
                        "both") ||
                      (row.getIsSelected() && "selected")
                    }
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={cn(
                      "absolute flex cursor-default select-text",
                      row.original?.monthly_attendance?.salary_entries
                        ?.invoice_id && "bg-primary/20",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "py-2 table-cell",
                            cell.column.id.startsWith("day_") ||
                              cell.column.id === "ot_hours"
                              ? "min-w-24 max-w-24 px-2"
                              : "px-4 min-w-28 max-w-28",
                            cell.column.id === "select" &&
                              "sticky left-0 min-w-12 max-w-12 bg-card z-10",
                            cell.column.id === "employee_code" &&
                              "md:sticky md:left-12 min-w-32 max-w-32 md:bg-card md:z-10",
                            cell.column.id === "first_name" &&
                              "md:sticky md:left-44 min-w-48 max-w-48 md:bg-card md:z-10",
                            cell.column.id === "project_name" &&
                              "min-w-32 max-w-32",
                            cell.column.id === "site_name" &&
                              "min-w-32 max-w-32",
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
                );
              })
            ) : (
              <TableRow className={cn(!tableLength && "border-none")}>
                <TableCell
                  colSpan={columns.length}
                  className="h-80 bg-background grid place-items-center text-center tracking-wide text-xl capitalize"
                >
                  <div className="flex flex-col items-center gap-1">
                    <h2 className="text-xl">No Attendance Found.</h2>
                    <p
                      className={cn(
                        "text-muted-foreground",
                        !data?.length && noFilters && "hidden",
                      )}
                    >
                      Try another search, or adjusting the filters
                    </p>
                    <Button
                      variant="outline"
                      className={cn(
                        "mt-4",
                        !data?.length && noFilters && "hidden",
                      )}
                      onClick={() => {
                        setSearchParams();
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
        {hasNextPage && initialData?.length && (
          <div
            className="sticky left-0 flex items-center justify-center mt-6"
            ref={ref}
          >
            <div className="flex items-center space-x-2 px-6 py-5">
              <Spinner />
              <span className="text-sm text-[#606060]">Loading more...</span>
            </div>
          </div>
        )}
      </div>
      <ExportBar
        onCancel={() => table.resetRowSelection()}
        className={cn(!table.getSelectedRowModel().rows.length && "hidden")}
        rows={table.getSelectedRowModel().rows.length}
        data={selectedRowsData}
        columnVisibility={columnVisibility}
        isDailyView={isDailyView}
        companyName={companyName}
        companyAddress={companyAddress}
      />

      {(() => {
        const dailyId = searchParams.get("daily_attendance_id");
        if (!dailyId) return null;

        const selectedEmployee = data.find(
          (e) => e.monthly_attendance?.id === dailyId,
        );
        if (!selectedEmployee) return null;

        const month = selectedEmployee.monthly_attendance?.month;
        const year = selectedEmployee.monthly_attendance?.year;
        const employeeName = `${selectedEmployee.first_name} ${selectedEmployee.last_name}`;

        return (
          <Dialog
            open={!!dailyId}
            onOpenChange={(open) => {
              if (!open) {
                searchParams.delete("daily_attendance_id");
                setSearchParams(searchParams);
              }
            }}
          >
            <DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-transparent">
              <div className="bg-background rounded-2xl border p-6 shadow-2xl overflow-y-auto max-h-[95vh] w-full">
                <DialogHeader className="mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-2xl font-bold tracking-tight">
                        Attendance Calendar
                      </DialogTitle>
                      <p className="text-muted-foreground mt-1">
                        Viewing records for{" "}
                        <span className="text-foreground font-semibold uppercase">
                          {employeeName}
                        </span>{" "}
                        — {getMonthName(month)} {year}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full border">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                        <span className="text-[10px] font-medium">present</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full border">
                        <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
                        <span className="text-[10px] font-medium">absent</span>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <AttendanceComponent
                  attendanceId={dailyId}
                  month={month}
                  year={year}
                  env={env}
                />
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
