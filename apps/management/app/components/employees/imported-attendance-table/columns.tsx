import type { ImportEmployeeAttendanceDataType } from "@canny_ecosystem/supabase/queries";
import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { ImportedEmployeeAttendanceOptionsDropdown } from "./imported-table-options";

const getHighlightKey = (rowOriginal: any, tableMeta?: any) => {
  if (tableMeta?.matchingKey) return tableMeta.matchingKey;
  if (rowOriginal?.employee_code) return "employee_code";
  if (rowOriginal?.uan_number) return "uan_number";
  return "employee_name";
};

export const ImportedDataColumns: ColumnDef<ImportEmployeeAttendanceDataType>[] =
  [
    {
      accessorKey: "sr_no",
      header: "Sr No.",
      cell: ({ row }) => {
        return <p className="truncate ">{row.index + 1}</p>;
      },
    },
    {
      accessorKey: "employee_code",
      header: "Employee Code",
      cell: ({ row, table }) => {
        const isNew = (row.original as any).is_new_employee;
        const highlightKey = getHighlightKey(row.original, table.options.meta);
        const shouldHighlight = isNew && highlightKey === "employee_code";
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <p
              className={cn(
                "truncate group-hover:text-primary",
                shouldHighlight &&
                  "text-amber-800 dark:text-amber-400 font-semibold italic",
              )}
            >
              {row.original.employee_code || "--"}
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
    },
    {
      accessorKey: "uan_number",
      header: "UAN Number",
      cell: ({ row, table }) => {
        const isNew = (row.original as any).is_new_employee;
        const highlightKey = getHighlightKey(row.original, table.options.meta);
        const shouldHighlight = isNew && highlightKey === "uan_number";
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <p
              className={cn(
                "truncate group-hover:text-primary",
                shouldHighlight &&
                  "text-amber-800 dark:text-amber-400 font-semibold italic",
              )}
            >
              {(row.original as any).uan_number || "--"}
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
    },
    {
      accessorKey: "employee_name",
      header: "Employee Name",
      cell: ({ row, table }) => {
        const isNew = row.original.is_new_employee;
        const highlightKey = getHighlightKey(row.original, table.options.meta);
        const shouldHighlight = isNew && highlightKey === "employee_name";
        return (
          <div className="flex flex-col gap-0.5 max-w-[150px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <p
                className={cn(
                  "truncate font-medium",
                  shouldHighlight &&
                    "text-amber-800 dark:text-amber-400 font-semibold italic",
                )}
              >
                {row.original.employee_name || "--"}
              </p>
              {shouldHighlight && (
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0"
                  title="Unmatched New Employee"
                />
              )}
            </div>
            {(row.original as any).sheet_employee_name &&
              (row.original as any).sheet_employee_name !==
                row.original.employee_name && (
                <span
                  className="text-[10px] text-muted-foreground italic truncate"
                  title={(row.original as any).sheet_employee_name}
                >
                  {(row.original as any).sheet_employee_name}
                </span>
              )}
          </div>
        );
      },
    },
    {
      accessorKey: "month",
      header: "Month",
      cell: ({ row }) => {
        return <p className="truncate ">{row.original?.month ?? "--"}</p>;
      },
    },
    {
      accessorKey: "year",
      header: "Year",
      cell: ({ row }) => {
        return <p className="truncate ">{row.original?.year ?? "--"}</p>;
      },
    },
    {
      accessorKey: "working_days",
      header: "Working Days",
      cell: ({ row }) => {
        return (
          <p className="truncate ">{row.original?.working_days ?? "--"}</p>
        );
      },
    },
    {
      accessorKey: "present_days",
      header: "Present Days",
      cell: ({ row }) => {
        return (
          <p className="truncate ">{row.original?.present_days ?? "--"}</p>
        );
      },
    },
    {
      accessorKey: "overtime_hours",
      header: "Overtime Hours",
      cell: ({ row }) => {
        return (
          <p className="truncate ">{row.original?.overtime_hours ?? "--"}</p>
        );
      },
    },
    {
      accessorKey: "absent_days",
      header: "Absent Days",
      cell: ({ row }) => {
        return <p className="truncate ">{row.original?.absent_days ?? "--"}</p>;
      },
    },
    {
      accessorKey: "paid_holidays",
      header: "Paid Holidays",
      cell: ({ row }) => {
        return (
          <p className="truncate ">{row.original?.paid_holidays ?? "--"}</p>
        );
      },
    },
    {
      accessorKey: "paid_leaves",
      header: "Paid Leaves",
      cell: ({ row }) => {
        return <p className="truncate ">{row.original?.paid_leaves ?? "--"}</p>;
      },
    },
    {
      accessorKey: "casual_leaves",
      header: "Casual Leaves",
      cell: ({ row }) => {
        return (
          <p className="truncate ">{row.original?.casual_leaves ?? "--"}</p>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        return (
          <ImportedEmployeeAttendanceOptionsDropdown
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
