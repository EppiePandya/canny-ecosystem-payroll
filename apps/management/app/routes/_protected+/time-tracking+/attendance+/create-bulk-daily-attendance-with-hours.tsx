import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders, getSupabaseWithSessionAndHeaders } from "@canny_ecosystem/supabase/server";
import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useSearchParams,
  useFetcher,
  useNavigation,
} from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import { safeRedirect } from "@/utils/server/http.server";
import {
  hasPermission,
  isGoodStatus,
  createRole,
  z,
} from "@canny_ecosystem/utils";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  getOnlyEmployeesBySiteId,
  getSiteNamesByCompanyId,
  getDepartmentsBySiteId,
} from "@canny_ecosystem/supabase/queries";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { cacheKeyPrefix, DEFAULT_ROUTE, recentlyAddedFilter } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry } from "@/utils/cache";
import { Button } from "@canny_ecosystem/ui/button";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Label } from "@canny_ecosystem/ui/label";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import { createDailyAttendancesFromImportedData } from "@canny_ecosystem/supabase/mutations";

export const ADD_DAILY_ATTENDANCES_WITH_HOURS_TAG =
  "Add_Daily_Attendance_With_Hours";

const BulkDailyAttendanceSchema = z.object({
  month: z.coerce.number(),
  year: z.coerce.number(),
  recordsJson: z.string(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${createRole}:${attribute.attendance}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const url = new URL(request.url);
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const searchParams = new URLSearchParams(url.searchParams);

  const { data: siteData } = await getSiteNamesByCompanyId({
    supabase,
    companyId,
  });

  const site = searchParams.get("site") ?? "";
  const department = searchParams.get("department") ?? "";

  let employeeData = null;
  let departmentData = null;

  if (site) {
    const { data: depts } = await getDepartmentsBySiteId({
      supabase,
      siteId: site,
    });
    departmentData = depts;

    const { data } = await getOnlyEmployeesBySiteId({ supabase, siteId: site });
    employeeData = data;
  }

  const siteOptions = siteData?.map((siteData) => ({
    label: siteData.name,
    pseudoLabel: siteData?.projects?.name,
    value: siteData.id,
  }));

  const departmentOptions =
    departmentData?.map((dept: any) => ({
      label: dept.name,
      value: dept.id,
    })) || [];

  if (site) {
    departmentOptions.push({
      label: "Other (No Department)",
      value: "other",
    });
  }

  return json({ siteOptions, departmentOptions, companyId, employeeData });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = await getSupabaseWithSessionAndHeaders({ request });
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: BulkDailyAttendanceSchema,
  });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const records = JSON.parse(submission.value.recordsJson);

  const data = Object.entries(records).flatMap(
    ([empId, days]: [string, any]) => {
      return Object.values(days).map((value: any) => {
        const presentValue = value.present === "PH" ? "P" : value.present;
        return {
          ...value,
          employee_id: empId,
          present: presentValue,
          target_month: submission.value.month,
          target_year: submission.value.year,
        };
      });
    },
  );

  const { status, error } = await createDailyAttendancesFromImportedData({
    supabase,
    data,
    companyId,
    intent: "update",
  });

  if (isGoodStatus(status)) {
    return json({
      status: "success",
      message: "Daily Attendance Saved Successfully",
      error: null,
    });
  }
  return json({
    status: "error",
    message: "Daily Attendance Save Failed",
    error,
  });
}

interface EmployeeRowProps {
  emp: any;
  idx: number;
  calendarDays: Date[];
  standardHours: number;
  employeeAttendance: Record<string, any>;
  activeCellDateStr: string | null;
  setActiveCell: (cell: { empId: string; dateStr: string } | null) => void;
  handleCellHoursChange: (empId: string, date: Date, hours: number) => void;
  handleCellStatusChange: (empId: string, date: Date, status: string) => void;
}

const EmployeeRow = React.memo(
  ({
    emp,
    idx,
    calendarDays,
    standardHours,
    employeeAttendance,
    activeCellDateStr,
    setActiveCell,
    handleCellHoursChange,
    handleCellStatusChange,
  }: EmployeeRowProps) => {
    const totals = useMemo(() => {
      const empData = employeeAttendance || {};
      let rawP = 0;
      let cl = 0;
      let ph = 0;
      let pl = 0;
      let absent = 0;
      let wof = 0;
      let h = 0;
      let totalHours = 0;
      let totalOT = 0;

      for (const att of Object.values(empData)) {
        const p = att.present;
        const hours = att.hours || 0;
        totalHours += hours;

        if (p === "P") {
          rawP++;
          if (hours > standardHours) {
            totalOT += hours - standardHours;
          }
        } else if (p === "CL") cl++;
        else if (p === "PH") ph++;
        else if (p === "PL") pl++;
        else if (p === "A") absent++;
        else if (p === "W" || p === "WO" || p === "WOF") wof++;
        else if (p === "H") h++;
      }

      const present = rawP;
      const totalPaid = present + cl + ph + pl;

      return {
        present,
        cl,
        ph,
        pl,
        absent,
        wof,
        h,
        totalPaid,
        totalHours,
        totalOT,
      };
    }, [employeeAttendance, standardHours]);

    const getStatus = (date: Date) => {
      const dateStr = date.toLocaleDateString("en-CA");
      return employeeAttendance?.[dateStr]?.present || "P";
    };

    const getHours = (date: Date) => {
      const dateStr = date.toLocaleDateString("en-CA");
      const record = employeeAttendance?.[dateStr];
      if (record) return record.hours;
      const isWeeklyOff = date.getDay() === 0;
      return isWeeklyOff ? 0 : standardHours;
    };

    return (
      <tr className="hover:bg-muted/30 transition-colors">
        <td
          style={{ backgroundColor: "hsl(var(--card))" }}
          className="px-3 py-2 border-r text-center text-muted-foreground sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[50px] min-w-[50px] max-w-[50px] outline outline-1 outline-card"
        >
          {idx + 1}
        </td>
        <td
          style={{ backgroundColor: "hsl(var(--card))" }}
          className="px-3 py-2 border-r font-semibold sticky left-[50px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] truncate w-[200px] min-w-[200px] max-w-[200px] outline outline-1 outline-card"
        >
          {[emp.first_name, emp.middle_name, emp.last_name]
            .filter(Boolean)
            .join(" ")}
        </td>
        <td
          style={{ backgroundColor: "hsl(var(--card))" }}
          className="px-3 py-2 border-r text-xs tracking-wider uppercase text-muted-foreground sticky left-[250px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[140px] min-w-[140px] max-w-[140px] truncate outline outline-1 outline-card"
        >
          {emp.employee_code}
        </td>
        {calendarDays.map((date, dIdx) => {
          const dateStr = date.toLocaleDateString("en-CA");
          const currentStatus = getStatus(date);
          const currentHours = getHours(date);
          const isCellActive = activeCellDateStr === dateStr;

          const displayCode =
            currentStatus === "W" ||
            currentStatus === "WO" ||
            currentStatus === "WOF"
              ? "WOF"
              : currentStatus;

          return (
            <td key={dIdx} className="p-0 border-r w-12 min-w-[48px] relative">
              <Popover
                open={isCellActive}
                onOpenChange={(open) => {
                  if (!open) {
                    setActiveCell(null);
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setActiveCell({ empId: emp.id, dateStr })}
                    className={cn(
                      "w-full h-10 text-center font-bold text-xs uppercase focus:outline-none focus:bg-primary/5 transition-all bg-transparent flex flex-col items-center justify-center cursor-pointer select-none py-1 gap-0.5",
                      currentStatus === "P"
                        ? "text-blue-600 dark:text-blue-400 hover:bg-blue-50/55 dark:hover:bg-blue-950/20"
                        : currentStatus === "A"
                          ? "text-red-500 dark:text-red-400 hover:bg-red-50/55 dark:hover:bg-red-950/20"
                          : currentStatus === "W" ||
                              currentStatus === "WO" ||
                              currentStatus === "WOF"
                            ? "text-orange-500 dark:text-orange-400 hover:bg-orange-50/55 dark:hover:bg-orange-950/20"
                            : currentStatus === "H" || currentStatus === "PH"
                              ? "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50/55 dark:hover:bg-yellow-950/20"
                              : "text-foreground hover:bg-muted/50",
                    )}
                  >
                    <span className="text-[11px] font-bold">
                      {currentHours}h
                    </span>
                    <span className="text-[8px] font-extrabold opacity-75 uppercase flex items-center justify-center gap-0.5">
                      {displayCode}
                      {currentHours > standardHours && (
                        <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 font-black border border-amber-500/30">
                          +{currentHours - standardHours}
                        </span>
                      )}
                    </span>
                  </button>
                </PopoverTrigger>

                {isCellActive && (
                  <PopoverContent
                    className="w-[180px] p-3 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl flex flex-col gap-3 text-left outline-none"
                    align="center"
                    sideOffset={4}
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Hours Worked
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="24"
                        autoFocus
                        className="w-full h-8 px-2 text-xs font-semibold border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        value={currentHours}
                        onChange={(e) => {
                          const h = Number(e.target.value) || 0;
                          handleCellHoursChange(emp.id, date, h);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Status Override
                      </label>
                      <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto">
                        {[
                          {
                            value: "P",
                            label: "Present",
                            code: "P",
                            color:
                              "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/30",
                          },
                          {
                            value: "A",
                            label: "Absent",
                            code: "A",
                            color:
                              "bg-red-500/10 text-red-500 dark:text-red-400 border-red-200/50 dark:border-red-900/30",
                          },
                          {
                            value: "WOF",
                            label: "Weekly Off",
                            code: "WOF",
                            color:
                              "bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-200/50 dark:border-orange-900/30",
                          },
                          {
                            value: "CL",
                            label: "Casual Leave",
                            code: "CL",
                            color:
                              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/30",
                          },
                          {
                            value: "PL",
                            label: "Paid Leave",
                            code: "PL",
                            color:
                              "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-900/30",
                          },
                          {
                            value: "PH",
                            label: "Paid Holiday",
                            code: "PH",
                            color:
                              "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-900/30",
                          },
                          {
                            value: "H",
                            label: "Holiday",
                            code: "H",
                            color:
                              "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-200/50 dark:border-yellow-900/30",
                          },
                        ].map((opt) => {
                          const isSelected =
                            currentStatus === opt.value ||
                            ((currentStatus === "W" ||
                              currentStatus === "WO") &&
                              opt.value === "WOF");
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                handleCellStatusChange(emp.id, date, opt.value);
                                setActiveCell(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-1 rounded-md text-xs font-semibold transition-all duration-100 hover:bg-muted text-left border border-transparent",
                                isSelected &&
                                  "bg-accent/80 border-accent-foreground/10 text-foreground",
                              )}
                            >
                              <span>{opt.label}</span>
                              <span
                                className={cn(
                                  "text-[8px] font-extrabold uppercase px-1 py-0.5 rounded border",
                                  opt.color,
                                )}
                              >
                                {opt.code}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                )}
              </Popover>
            </td>
          );
        })}
        <td className="px-2 py-2 border-r border-l-2 border-l-foreground/30 text-center font-bold">
          {totals.present}
        </td>
        <td className="px-2 py-2 border-r text-center font-bold">
          {totals.cl}
        </td>
        <td className="px-2 py-2 border-r text-center font-bold">
          {totals.ph}
        </td>
        <td className="px-2 py-2 border-r text-center font-bold">
          {totals.absent}
        </td>
        <td className="px-2 py-2 border-r text-center font-bold">
          {totals.wof}
        </td>
        <td className="px-2 py-2 border-r text-center font-bold">{totals.h}</td>
        <td className="px-2 py-2 border-r text-center font-bold text-blue-600 dark:text-blue-400">
          {totals.totalHours}
        </td>
        <td
          style={{ backgroundColor: "hsl(var(--card))" }}
          className="px-2 py-2 border-r text-center font-bold sticky right-[120px] z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[80px] w-[80px] outline outline-1 outline-card text-amber-500 font-semibold"
        >
          {totals.totalOT > 0 ? `${totals.totalOT}h` : "0"}
        </td>
        <td
          style={{ backgroundColor: "hsl(var(--card))" }}
          className="px-2 py-2 border-r text-center font-bold sticky right-0 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[120px] w-[120px] outline outline-1 outline-card"
        >
          {totals.totalPaid}
        </td>
      </tr>
    );
  },
);

export default function CreateBulkDailyAttendanceWithHours() {
  const { siteOptions, departmentOptions, employeeData } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fetcher = useFetcher();

  const selectedSite = searchParams.get("site") || "";
  const selectedDepartment = searchParams.get("department") || "";
  const payrollCycle =
    (searchParams.get("cycle") as "1-31" | "21-20") || "1-31";

  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [activeCell, setActiveCell] = useState<{
    empId: string;
    dateStr: string;
  } | null>(null);
  const [standardHours, setStandardHours] = useState<number>(8);
  const [prevStandardHours, setPrevStandardHours] = useState(8);

  useEffect(() => {
    if (standardHours !== prevStandardHours) {
      setLocalAttendances((prev) => {
        const next = { ...prev };
        for (const empId of Object.keys(next)) {
          next[empId] = { ...next[empId] };
          for (const dateStr of Object.keys(next[empId])) {
            const day = next[empId][dateStr];
            if (day.hours === prevStandardHours) {
              next[empId][dateStr] = {
                ...day,
                hours: standardHours,
              };
            }
          }
        }
        return next;
      });
      setPrevStandardHours(standardHours);
    }
  }, [standardHours, prevStandardHours]);

  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (parent) {
      const originalOverflow = parent.style.overflow;
      parent.style.overflow = "hidden";
      return () => {
        parent.style.overflow = originalOverflow;
      };
    }
  }, []);

  const [localAttendances, setLocalAttendances] = useState<
    Record<string, Record<string, any>>
  >({});

  const filteredEmployees = useMemo(() => {
    if (!employeeData) return [];
    let emps = employeeData;
    if (selectedDepartment) {
      if (selectedDepartment === "other") {
        emps = emps.filter((e) => !e.work_details?.department_id);
      } else {
        emps = emps.filter(
          (e) => e.work_details?.department_id === selectedDepartment,
        );
      }
    }
    return emps.sort((a, b) => a.first_name.localeCompare(b.first_name));
  }, [employeeData, selectedDepartment]);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIdx = month.getMonth();

    let startDate: Date;
    let endDate: Date;

    if (payrollCycle === "21-20") {
      startDate = new Date(year, monthIdx - 1, 21);
      endDate = new Date(year, monthIdx, 20);
    } else {
      startDate = new Date(year, monthIdx, 1);
      endDate = new Date(year, monthIdx + 1, 0);
    }

    const days: Date[] = [];
    let current = new Date(startDate);

    while (current <= endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [month, payrollCycle]);

  useEffect(() => {
    if (selectedSite) {
      const m = month.getMonth() + 1;
      const y = month.getFullYear();
      fetcher.load(
        `/api/attendance/daily?siteId=${selectedSite}&month=${m}&year=${y}`,
      );
    }
  }, [selectedSite, month]);

  const [dirtyEmployeeIds, setDirtyEmployeeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).status === "success") {
      const data = (fetcher.data as any).data || [];
      const mapping: Record<string, Record<string, any>> = {};

      for (const emp of filteredEmployees) {
        mapping[emp.id] = {};
      }

      for (const d of data) {
        if (mapping[d.employee_id]) {
          const regHours =
            d.no_of_hours !== undefined && d.no_of_hours !== null
              ? Number(d.no_of_hours)
              : d.present
                ? standardHours
                : 0;
          const otHours = Number(d.overtime_hours || 0);
          const totalHours = regHours + otHours;

          mapping[d.employee_id][d.date] = {
            date: d.date,
            present: d.present ? "P" : "A",
            hours: totalHours,
            overtime_hours: otHours,
          };
          if (d.holiday_type === "weekly") {
            mapping[d.employee_id][d.date].present = "W";
            mapping[d.employee_id][d.date].hours = totalHours;
          }
          if (d.holiday_type === "paid_holiday") {
            mapping[d.employee_id][d.date].present = "PH";
            mapping[d.employee_id][d.date].hours = totalHours;
          }
          if (d.holiday_type === "casual_leave") {
            mapping[d.employee_id][d.date].present = "CL";
            mapping[d.employee_id][d.date].hours = totalHours;
          }
          if (d.holiday_type === "paid_leave") {
            mapping[d.employee_id][d.date].present = "PL";
            mapping[d.employee_id][d.date].hours = totalHours;
          }
        }
      }

      for (const emp of filteredEmployees) {
        for (const date of calendarDays) {
          const dateStr = date.toLocaleDateString("en-CA");
          const isSelectedMonth = date.getMonth() === month.getMonth();

          if (
            !mapping[emp.id][dateStr] &&
            (isSelectedMonth || payrollCycle === "21-20")
          ) {
            const isWeeklyOff = date.getDay() === 0;
            mapping[emp.id][dateStr] = {
              date: dateStr,
              present: isWeeklyOff ? "W" : "P",
              hours: isWeeklyOff ? 0 : standardHours,
              overtime_hours: 0,
            };
          }
        }
      }

      setLocalAttendances(mapping);

      if (data.length === 0) {
        setDirtyEmployeeIds(new Set(filteredEmployees.map((e) => e.id)));
      } else {
        setDirtyEmployeeIds(new Set());
      }
    } else if (filteredEmployees.length > 0) {
      const mapping: Record<string, Record<string, any>> = {};
      for (const emp of filteredEmployees) {
        mapping[emp.id] = {};
        for (const date of calendarDays) {
          const dateStr = date.toLocaleDateString("en-CA");
          const isSelectedMonth = date.getMonth() === month.getMonth();

          if (isSelectedMonth || payrollCycle === "21-20") {
            const isWeeklyOff = date.getDay() === 0;
            mapping[emp.id][dateStr] = {
              date: dateStr,
              present: isWeeklyOff ? "W" : "P",
              hours: isWeeklyOff ? 0 : standardHours,
              overtime_hours: 0,
            };
          }
        }
      }
      setLocalAttendances(mapping);
      setDirtyEmployeeIds(new Set(filteredEmployees.map((e) => e.id)));
    }
  }, [fetcher.data, filteredEmployees, calendarDays, month, payrollCycle]);

  useEffect(() => {
    if (actionData && (actionData as any).status === "success") {
      clearCacheEntry(cacheKeyPrefix.attendance);
      clearCacheEntry(cacheKeyPrefix.attendance_report);
      toast({
        title: "Success",
        description: (actionData as any).message,
        variant: "success",
      });
      const monthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];
      navigate(
        `/time-tracking/attendance?view=daily&month=${monthNames[month.getMonth()]}&year=${month.getFullYear()}`,
      );
    } else if (actionData && (actionData as any).status === "error") {
      toast({
        title: "Validation Error",
        description: (actionData as any).message,
        variant: "destructive",
      });
    }
  }, [actionData]);

  const handleCellHoursChange = useCallback(
    (empId: string, date: Date, hours: number) => {
      const dateStr = date.toLocaleDateString("en-CA");
      setLocalAttendances((prev) => {
        const empData = prev[empId] || {};
        const current = empData[dateStr] || {
          date: dateStr,
          present: "P",
          hours: standardHours,
          overtime_hours: 0,
        };

        let nextPresent = current.present;
        if (
          hours > 0 &&
          (current.present === "A" ||
            current.present === "W" ||
            current.present === "WO" ||
            current.present === "WOF")
        ) {
          nextPresent = "P";
        } else if (hours === 0 && current.present === "P") {
          nextPresent = "A";
        }

        return {
          ...prev,
          [empId]: {
            ...empData,
            [dateStr]: {
              ...current,
              hours,
              present: nextPresent,
            },
          },
        };
      });
      setDirtyEmployeeIds((prev) => {
        const next = new Set(prev);
        next.add(empId);
        return next;
      });
    },
    [standardHours],
  );

  const handleCellStatusChange = useCallback(
    (empId: string, date: Date, status: string) => {
      const dateStr = date.toLocaleDateString("en-CA");
      setLocalAttendances((prev) => {
        const empData = prev[empId] || {};
        const current = empData[dateStr] || {
          date: dateStr,
          present: "P",
          hours: standardHours,
          overtime_hours: 0,
        };

        let nextHours = current.hours;
        if (status === "P" && current.hours === 0) {
          nextHours = standardHours;
        } else if (status !== "P" && status !== "PH" && status !== "H") {
          nextHours = 0;
        }

        return {
          ...prev,
          [empId]: {
            ...empData,
            [dateStr]: {
              ...current,
              present: status.toUpperCase(),
              hours: nextHours,
            },
          },
        };
      });
      setDirtyEmployeeIds((prev) => {
        const next = new Set(prev);
        next.add(empId);
        return next;
      });
    },
    [standardHours],
  );

  const SUBMIT_BUTTON_CLASS =
    "bg-[#3B82F6] text-slate-950 hover:bg-[#2563EB] font-bold rounded-lg px-6 py-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const recordsToSubmit = useMemo(() => {
    return Object.fromEntries(
      filteredEmployees
        .filter((emp) => dirtyEmployeeIds.has(emp.id))
        .map((emp) => [
          emp.id,
          Object.fromEntries(
            Object.entries(localAttendances[emp.id] || {}).map(
              ([date, att]: [string, any]) => {
                const dailyOT = Math.max(0, (att.hours || 0) - standardHours);
                const regularHours = Math.min(att.hours || 0, standardHours);
                return [
                  date,
                  {
                    ...att,
                    hours: regularHours,
                    overtime_hours: dailyOT,
                    employee_code: emp.employee_code?.trim(),
                  },
                ];
              },
            ),
          ),
        ]),
    );
  }, [filteredEmployees, dirtyEmployeeIds, localAttendances, standardHours]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full overflow-hidden bg-background text-foreground"
    >
      <header className="flex flex-row items-center justify-between px-6 py-4 border-b bg-card backdrop-blur-xl sticky top-0 z-30 gap-4 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <Icon name="arrow-left" />
          </Button>

          <div className="flex flex-col gap-1.5 w-48 shrink-0">
            <Combobox
              options={siteOptions || []}
              value={selectedSite}
              onChange={(val) =>
                setSearchParams((p) => {
                  if (val) p.set("site", val);
                  else p.delete("site");
                  p.delete("department");
                  return p;
                })
              }
              placeholder="Select Site"
            />
          </div>

          <div className="flex flex-col gap-1.5 w-48 shrink-0">
            <Combobox
              options={departmentOptions || []}
              value={selectedDepartment}
              onChange={(val) =>
                setSearchParams((p) => {
                  if (val) p.set("department", val);
                  else p.delete("department");
                  return p;
                })
              }
              placeholder="Select Department"
              disabled={!selectedSite}
            />
          </div>

          <div className="flex flex-col gap-1.5 w-40 shrink-0">
            <Combobox
              options={[
                { label: "Standard (1-31)", value: "1-31" },
                { label: "Cycle 21-20", value: "21-20" },
              ]}
              value={payrollCycle}
              onChange={(val) =>
                setSearchParams((p) => {
                  if (val) p.set("cycle", val);
                  else p.delete("cycle");
                  return p;
                })
              }
              placeholder="Select Cycle"
            />
          </div>

          <div className="flex items-center gap-2 bg-muted px-3 h-10 rounded-lg border shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              Duty Hrs:
            </span>
            <input
              type="number"
              min="1"
              max="24"
              className="w-10 h-6 text-center font-bold text-sm bg-transparent border-b focus:outline-none focus:border-primary text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={standardHours}
              onChange={(e) => setStandardHours(Number(e.target.value) || 8)}
            />
          </div>

          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <Icon name="chevron-left" size="xs" />
            </Button>
            <span className="text-xs font-bold w-24 text-center uppercase tracking-wider">
              {month.toLocaleString("default", {
                month: "short",
                year: "numeric",
              })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <Icon name="chevron-right" size="xs" />
            </Button>
          </div>
        </div>

        <Form method="post" className="shrink-0">
          <input type="hidden" name="month" value={month.getMonth() + 1} />
          <input type="hidden" name="year" value={month.getFullYear()} />
          <input
            type="hidden"
            name="recordsJson"
            value={JSON.stringify(recordsToSubmit)}
          />
          <button
            type="submit"
            className={SUBMIT_BUTTON_CLASS}
            disabled={
              filteredEmployees.length === 0 ||
              dirtyEmployeeIds.size === 0 ||
              isSubmitting
            }
          >
            {isSubmitting ? "Saving..." : "Submit"}
          </button>
        </Form>
      </header>

      <main className="flex-1 flex flex-col bg-muted/30 p-4 min-h-0 overflow-hidden">
        {filteredEmployees.length > 0 ? (
          <div className="flex-1 flex flex-col min-h-0 border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="flex-1 overflow-auto w-full">
              <table
                className="w-full text-sm text-left border-separate [&_th]:border-b [&_th]:border-border [&_td]:border-b [&_td]:border-border"
                style={{ borderSpacing: 0 }}
              >
                <thead className="text-xs uppercase bg-card text-muted-foreground sticky top-0 z-30 shadow-sm">
                  <tr>
                    <th
                      style={{ backgroundColor: "hsl(var(--card))" }}
                      className="px-3 py-3 border-r font-bold sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[50px] min-w-[50px] max-w-[50px]"
                    >
                      SL
                    </th>
                    <th
                      style={{ backgroundColor: "hsl(var(--card))" }}
                      className="px-3 py-3 border-r font-bold sticky left-[50px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[200px] min-w-[200px] max-w-[200px]"
                    >
                      Name
                    </th>
                    <th
                      style={{ backgroundColor: "hsl(var(--card))" }}
                      className="px-3 py-3 border-r font-bold sticky left-[250px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[140px] min-w-[140px] max-w-[140px]"
                    >
                      Employee Code
                    </th>
                    {calendarDays.map((date, idx) => (
                      <th
                        key={idx}
                        className="px-1 py-3 border-r font-bold text-center w-12 min-w-[48px]"
                      >
                        {date.getDate()}
                      </th>
                    ))}
                    <th
                      className="px-2 py-3 border-r border-l-2 border-l-foreground/30 text-center font-bold"
                      title="Present"
                    >
                      P
                    </th>
                    <th
                      className="px-2 py-3 border-r text-center font-bold"
                      title="Casual Leave"
                    >
                      CL
                    </th>
                    <th
                      className="px-2 py-3 border-r text-center font-bold"
                      title="Paid Holiday"
                    >
                      PH
                    </th>
                    <th
                      className="px-2 py-3 border-r text-center font-bold"
                      title="Absent"
                    >
                      A
                    </th>
                    <th
                      className="px-2 py-3 border-r text-center font-bold"
                      title="Weekly Off"
                    >
                      WO
                    </th>
                    <th
                      className="px-2 py-3 border-r text-center font-bold"
                      title="Holiday"
                    >
                      H
                    </th>
                    <th
                      className="px-2 py-3 border-r text-center font-bold"
                      title="Total Hours"
                    >
                      Total Hrs
                    </th>
                    <th
                      style={{ backgroundColor: "hsl(var(--card))" }}
                      className="px-2 py-3 border-r text-center font-bold sticky right-[120px] z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[80px] w-[80px]"
                    >
                      OT (Hrs)
                    </th>
                    <th
                      style={{ backgroundColor: "hsl(var(--card))" }}
                      className="px-2 py-3 border-r text-center font-bold sticky right-0 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[120px] w-[120px]"
                    >
                      Total Paid Days
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, idx) => (
                    <EmployeeRow
                      key={emp.id}
                      emp={emp}
                      idx={idx}
                      calendarDays={calendarDays}
                      standardHours={standardHours}
                      employeeAttendance={localAttendances[emp.id] || {}}
                      activeCellDateStr={
                        activeCell?.empId === emp.id ? activeCell.dateStr : null
                      }
                      setActiveCell={setActiveCell}
                      handleCellHoursChange={handleCellHoursChange}
                      handleCellStatusChange={handleCellStatusChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-card border flex items-center justify-center mb-6">
              <Icon name="person" size="lg" className="text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">No Employees Found</h3>
            <p className="text-muted-foreground max-w-xs text-sm">
              Please select a site and department to manage their daily
              attendance hours.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
