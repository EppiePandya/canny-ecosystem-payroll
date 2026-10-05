import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Link } from "@remix-run/react";
import type { AttendanceDataType } from "@canny_ecosystem/supabase/queries";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export const getDailyAttendanceColumns = ({
  month,
  year,
  data,
  onEditClick,
}: {
  month: number;
  year: number;
  data?: AttendanceDataType[];
  onEditClick?: (
    attendanceId: string,
    date: string,
    currentValue: string,
    currentOT?: number,
  ) => void;
}): ColumnDef<AttendanceDataType>[] => {
  const baseColumns: ColumnDef<AttendanceDataType>[] = [
    {
      id: "select",
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "employee_code",
      header: "Employee Code",
      cell: ({ row }) => (
        <Link
          to={`/employees/${row.original.id}/attendance`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80">
            {row.original?.employee_code ?? "--"}
          </p>
        </Link>
      ),
    },
    {
      accessorKey: "first_name",
      header: "Employee Name",
      cell: ({ row }) => (
        <Link
          to={`/employees/${row.original?.id}/attendance`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80">
            {row.original?.first_name ?? ""} {row.original?.middle_name ?? ""}{" "}
            {row.original?.last_name ?? ""}
          </p>
        </Link>
      ),
    },
    {
      enableSorting: false,
      accessorKey: "project_name",
      header: "Project",
      cell: ({ row }) => (
        <p className="truncate">
          {row.original?.work_details?.[0]?.projects?.name ??
            row.original?.work_details?.[0]?.sites?.projects?.name ??
            "--"}
        </p>
      ),
    },
    {
      enableSorting: false,
      accessorKey: "site_name",
      header: "Site",
      cell: ({ row }) => (
        <p className="truncate">
          {row.original?.work_details?.[0]?.sites?.name ?? "--"}
        </p>
      ),
    },
  ];

  // Find min and max date from daily_records across all employees to make it database-driven
  let minDateStr = "";
  let maxDateStr = "";
  if (data && Array.isArray(data)) {
    for (const emp of data) {
      const dailyRecords = emp.monthly_attendance?.daily_records || [];
      for (const r of dailyRecords) {
        if (r.date) {
          if (!minDateStr || r.date < minDateStr) minDateStr = r.date;
          if (!maxDateStr || r.date > maxDateStr) maxDateStr = r.date;
        }
      }
    }
  }

  let datesArray: Date[] = [];
  if (minDateStr && maxDateStr) {
    let curr = new Date(minDateStr);
    const end = new Date(maxDateStr);
    while (curr <= end) {
      datesArray.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
  } else {
    // Fallback to the calendar month (1 to 30/31) of the selected month/year if no database records are found
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      datesArray.push(new Date(year, month - 1, i));
    }
  }

  const dailyColumns: ColumnDef<AttendanceDataType>[] = datesArray.map(
    (date, i) => {
      const day = date.getDate();
      const mVal = date.getMonth() + 1;
      const yVal = date.getFullYear();

      const dateStr = `${day.toString().padStart(2, "0")}/${mVal.toString().padStart(2, "0")}/${yVal.toString().slice(-2)}`;
      const fullDateStr = `${yVal}-${mVal.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

      return {
        id: `day_${day}_${mVal}`,
        header: dateStr,
        enableSorting: false,
        cell: ({ row }) => {
          const dailyRecords = row.original?.monthly_attendance?.daily_records;
          if (!dailyRecords || !Array.isArray(dailyRecords)) {
            return (
              <p className="truncate text-center text-muted-foreground">-</p>
            );
          }

          const record = dailyRecords.find((r: any) => r.date === fullDateStr);

          const hasSalaryEntry =
            !!row.original?.monthly_attendance?.salary_entries;

          // Even if record doesn't exist, we allow editing to create it
          // Even if record doesn't exist, we allow editing to create it
          if (!record) {
            return (
              <div
                role="button"
                tabIndex={hasSalaryEntry ? -1 : 0}
                className={cn(
                  "truncate text-center text-muted-foreground p-2 -m-2 rounded transition-colors select-none focus:outline-none focus:bg-muted/60",
                  hasSalaryEntry
                    ? "cursor-default opacity-60"
                    : "cursor-pointer hover:bg-muted/60",
                )}
                onClick={() => {
                  if (hasSalaryEntry) return;
                  if (row.original?.monthly_attendance?.id && onEditClick) {
                    onEditClick(
                      row.original.monthly_attendance.id,
                      fullDateStr,
                      "-",
                      0,
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (hasSalaryEntry) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (row.original?.monthly_attendance?.id && onEditClick) {
                      onEditClick(
                        row.original.monthly_attendance.id,
                        fullDateStr,
                        "-",
                        0,
                      );
                    }
                  }
                }}
              >
                -
              </div>
            );
          }

          let label = "-";
          let colorClass = "text-muted-foreground";

          if (record.holiday) {
            const ht = record.holiday_type?.toLowerCase() || "";
            if (ht === "weekly" || ht === "wof" || ht === "week off") {
              label = "WOF";
              colorClass = "text-yellow-500 font-medium";
            } else if (ht === "casual_leave" || ht === "cl") {
              label = "CL";
              colorClass = "text-orange-500 font-medium";
            } else if (ht === "paid_leave" || ht === "pl") {
              label = "PL";
              colorClass = "text-orange-500 font-medium";
            } else if (ht === "sick_leave" || ht === "sl") {
              label = "SL";
              colorClass = "text-orange-500 font-medium";
            } else if (ht === "paid_holiday" || ht === "ph") {
              label = "PH";
              colorClass = "text-yellow-500 font-medium";
            } else {
              label = "H";
              colorClass = "text-yellow-500 font-medium";
            }
          } else if (record.present) {
            label = "P";
            colorClass = "text-blue-500 font-medium";
          } else {
            label = "A";
            colorClass = "text-red-500 font-medium";
          }

          const hours =
            record.no_of_hours !== undefined && record.no_of_hours !== null
              ? Number(record.no_of_hours)
              : 8;
          const ot = Number(record.overtime_hours || 0);

          return (
            <div
              role="button"
              tabIndex={hasSalaryEntry ? -1 : 0}
              className={cn(
                "truncate text-center p-2 -m-2 rounded transition-colors select-none focus:outline-none focus:bg-muted/60",
                colorClass,
                hasSalaryEntry
                  ? "cursor-default opacity-60"
                  : "cursor-pointer hover:bg-muted/60",
              )}
              onClick={() => {
                if (hasSalaryEntry) return;
                if (row.original?.monthly_attendance?.id && onEditClick) {
                  onEditClick(
                    row.original.monthly_attendance.id,
                    fullDateStr,
                    label,
                    ot,
                  );
                }
              }}
              onKeyDown={(e) => {
                if (hasSalaryEntry) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (row.original?.monthly_attendance?.id && onEditClick) {
                    onEditClick(
                      row.original.monthly_attendance.id,
                      fullDateStr,
                      label,
                      ot,
                    );
                  }
                }
              }}
            >
              {label}
            </div>
          );
        },
      };
    },
  );

  const otColumn: ColumnDef<AttendanceDataType> = {
    id: "ot_hours",
    header: "OT",
    enableSorting: false,
    cell: ({ row }) => {
      const hasSalaryEntry = !!row.original?.monthly_attendance?.salary_entries;
      const otHours = row.original?.monthly_attendance?.overtime_hours ?? 0;

      return (
        <div
          role="button"
          tabIndex={hasSalaryEntry ? -1 : 0}
          className={cn(
            "truncate text-center p-2 -m-2 rounded transition-colors select-none font-semibold focus:outline-none focus:bg-muted/60",
            hasSalaryEntry
              ? "cursor-default opacity-60"
              : "cursor-pointer hover:bg-muted/60 text-primary",
          )}
          onClick={() => {
            if (hasSalaryEntry) return;
            if (row.original?.monthly_attendance?.id && onEditClick) {
              onEditClick(
                row.original.monthly_attendance.id,
                "",
                "OT",
                otHours,
              );
            }
          }}
          onKeyDown={(e) => {
            if (hasSalaryEntry) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (row.original?.monthly_attendance?.id && onEditClick) {
                onEditClick(
                  row.original.monthly_attendance.id,
                  "",
                  "OT",
                  otHours,
                );
              }
            }
          }}
        >
          {otHours}
        </div>
      );
    },
  };

  return [...baseColumns, ...dailyColumns, otColumn];
};
