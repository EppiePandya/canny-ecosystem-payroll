import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useEffect, useMemo, useState } from "react";
import type { EmployeeDailyAttendanceDatabaseRow } from "@canny_ecosystem/supabase/types";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { getDailyAttendanceByMonthlyId } from "@canny_ecosystem/supabase/queries";
import { LoadingSpinner } from "@/components/loading-spinner";

import { getMonthName } from "@canny_ecosystem/utils";
import { DialogTitle } from "@canny_ecosystem/ui/dialog";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const AttendanceComponent = ({
  attendanceId,
  initialData = [],
  month: propMonth,
  year: propYear,
  env,
  employeeName,
}: {
  attendanceId?: string;
  initialData?: EmployeeDailyAttendanceDatabaseRow[];
  month: number;
  year: number;
  env: any;
  employeeName?: string;
}) => {
  const { supabase } = useSupabase({ env });
  const [attendanceData, setAttendanceData] =
    useState<EmployeeDailyAttendanceDatabaseRow[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const month = propMonth - 1;
  const year = propYear;

  useEffect(() => {
    async function fetchData() {
      if (!attendanceId) return;
      setIsLoading(true);
      const { data } = await getDailyAttendanceByMonthlyId({
        supabase,
        attendanceId,
      });
      if (data) setAttendanceData(data);
      setIsLoading(false);
    }
    fetchData();
  }, [attendanceId, supabase]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, EmployeeDailyAttendanceDatabaseRow>();
    if (attendanceData) {
      for (const entry of attendanceData) {
        if (entry.date) {
          map.set(entry.date, entry);
        }
      }
    }
    return map;
  }, [attendanceData]);

  const minDateStr = useMemo(() => {
    if (!attendanceData || attendanceData.length === 0) return null;
    const validDates = attendanceData
      .map((d) => d.date)
      .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (validDates.length === 0) return null;
    return validDates.reduce(
      (min, cur) => (cur < min ? cur : min),
      validDates[0],
    );
  }, [attendanceData]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const totalEmptyFirstDays = useMemo(() => {
    if (!minDateStr) return firstDayOfMonth;
    const minDate = new Date(minDateStr);
    const firstOfMonth = new Date(year, month, 1);
    const diffTime = firstOfMonth.getTime() - minDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > firstDayOfMonth) {
      const extraWeeks = Math.ceil((diffDays - firstDayOfMonth) / 7);
      return firstDayOfMonth + extraWeeks * 7;
    }
    return firstDayOfMonth;
  }, [minDateStr, firstDayOfMonth, year, month]);

  const emptyFirstDays = Array.from(
    { length: totalEmptyFirstDays },
    (_, i) => i,
  );
  const emptyLastDays = Array.from(
    {
      length: (7 - ((totalEmptyFirstDays + daysInMonth) % 7)) % 7,
    },
    (_, i) => i,
  );

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const currentDate = new Date(year, month, i + 1);
    currentDate.setHours(12, 0, 0, 0);
    return {
      day: i + 1,
      fullDate: currentDate.toISOString().split("T")[0],
    };
  });

  const monthText = useMemo(() => {
    // 1. Calculate months from the visual grid range
    const monthsSet = new Set<number>();
    monthsSet.add(Number(propMonth));

    if (minDateStr) {
      const minDate = new Date(minDateStr);
      monthsSet.add(minDate.getMonth() + 1);
    }

    // 2. Also check loaded attendance data
    if (attendanceData && attendanceData.length > 0) {
      for (const entry of attendanceData) {
        if (entry.date) {
          monthsSet.add(new Date(entry.date).getMonth() + 1);
        }
      }
    }

    const sortedMonths = Array.from(monthsSet).sort((a, b) => a - b);
    if (sortedMonths.length > 1) {
      return `${getMonthName(sortedMonths[0])} - ${getMonthName(sortedMonths[sortedMonths.length - 1])}`;
    }
    return getMonthName(propMonth);
  }, [attendanceData, propMonth, minDateStr]);

  const displayHeader = useMemo(() => {
    if (!employeeName) return null;

    return (
      <div>
        <DialogTitle className="text-2xl font-bold tracking-tight">
          Attendance Calendar
        </DialogTitle>
        <p className="text-muted-foreground mt-1">
          Viewing records for{" "}
          <span className="text-foreground font-semibold uppercase">
            {employeeName}
          </span>{" "}
          — {monthText} {year}
        </p>
      </div>
    );
  }, [employeeName, monthText, year]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20 h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      {displayHeader}
      <div className="w-full mx-auto relative group/calendar mt-6">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-transparent to-primary/10 rounded-xl blur-lg opacity-25" />

        <div className="relative border border-muted-foreground/20 rounded-xl bg-card overflow-hidden shadow-2xl">
          <div className="grid grid-cols-7 bg-muted/30 border-b border-muted-foreground/10">
            {weekDays.map((day) => (
              <div
                key={day}
                className="py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {emptyFirstDays?.map((val) => {
              const dayOffset = val - totalEmptyFirstDays;
              const currentDate = new Date(year, month, 1);
              currentDate.setDate(currentDate.getDate() + dayOffset);
              currentDate.setHours(12, 0, 0, 0);
              const fullDate = currentDate.toISOString().split("T")[0];
              const entry = attendanceMap.get(fullDate);

              return (
                <div
                  key={`empty-start-${val}`}
                  className={cn(
                    "h-20 md:h-24 border-b border-r border-muted-foreground/10 p-1.5 flex flex-col justify-between transition-all duration-300 relative last:border-r-0",
                    entry ? "text-foreground bg-card" : "bg-muted/5 opacity-40",
                  )}
                  style={
                    !entry
                      ? {
                          backgroundImage:
                            "radial-gradient(circle at 2px 2px, rgba(128,128,128,0.05) 1px, transparent 0)",
                          backgroundSize: "12px 12px",
                        }
                      : {}
                  }
                >
                  <div className="flex justify-between items-start">
                    <span className="text-sm p-1 rounded-md text-muted-foreground/50">
                      {currentDate.getDate()}
                    </span>
                    {entry && (
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full animate-pulse shadow-sm",
                            entry.holiday
                              ? "bg-yellow-400 shadow-yellow-400/50"
                              : entry.present
                                ? "bg-blue-500 shadow-blue-500/50"
                                : "bg-red-500 shadow-red-500/50",
                          )}
                        />
                      </div>
                    )}
                  </div>
                  {entry && (
                    <div className="flex flex-col gap-1.5 overflow-hidden">
                      <div
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border truncate font-medium",
                          entry.holiday
                            ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                            : entry.present
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20",
                        )}
                      >
                        {entry.holiday
                          ? entry.holiday_type || "holiday"
                          : entry.present
                            ? "present"
                            : "absent"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {days?.map((date) => {
              const entry = attendanceMap.get(date.fullDate);

              return (
                <div
                  key={date.fullDate}
                  className={cn(
                    "h-20 md:h-24 border-b border-r border-muted-foreground/10 p-1.5 flex flex-col justify-between transition-all duration-300 relative last:border-r-0 text-foreground",
                  )}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={cn("text-sm p-1 rounded-md transition-all")}
                    >
                      {date.day}
                    </span>

                    {entry && (
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full animate-pulse shadow-sm",
                            entry.holiday
                              ? "bg-yellow-400 shadow-yellow-400/50"
                              : entry.present
                                ? "bg-blue-500 shadow-blue-500/50"
                                : "bg-red-500 shadow-red-500/50",
                          )}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 overflow-hidden">
                    {entry && (
                      <>
                        <div
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border truncate font-medium",
                            entry.holiday
                              ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              : entry.present
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                : "bg-red-500/10 text-red-500 border-red-500/20",
                          )}
                        >
                          {(() => {
                            if (entry.holiday) {
                              const type = entry.holiday_type || "Holiday";
                              return type.toLowerCase();
                            }
                            return entry.present ? "present" : "absent";
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {emptyLastDays?.map((val) => {
              const currentDate = new Date(year, month + 1, val + 1);
              currentDate.setHours(12, 0, 0, 0);
              const fullDate = currentDate.toISOString().split("T")[0];
              const entry = attendanceMap.get(fullDate);

              return (
                <div
                  key={`empty-end-${val}`}
                  className={cn(
                    "h-20 md:h-24 border-b border-r border-muted-foreground/10 p-1.5 flex flex-col justify-between transition-all duration-300 relative last:border-r-0",
                    entry ? "text-foreground bg-card" : "bg-muted/5 opacity-40",
                  )}
                  style={
                    !entry
                      ? {
                          backgroundImage:
                            "radial-gradient(circle at 2px 2px, rgba(128,128,128,0.05) 1px, transparent 0)",
                          backgroundSize: "12px 12px",
                        }
                      : {}
                  }
                >
                  <div className="flex justify-between items-start">
                    <span className="text-sm p-1 rounded-md text-muted-foreground/50">
                      {currentDate.getDate()}
                    </span>
                    {entry && (
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full animate-pulse shadow-sm",
                            entry.holiday
                              ? "bg-yellow-400 shadow-yellow-400/50"
                              : entry.present
                                ? "bg-blue-500 shadow-blue-500/50"
                                : "bg-red-500 shadow-red-500/50",
                          )}
                        />
                      </div>
                    )}
                  </div>
                  {entry && (
                    <div className="flex flex-col gap-1.5 overflow-hidden">
                      <div
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border truncate font-medium",
                          entry.holiday
                            ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                            : entry.present
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20",
                        )}
                      >
                        {entry.holiday
                          ? entry.holiday_type || "holiday"
                          : entry.present
                            ? "present"
                            : "absent"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
