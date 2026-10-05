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
import React, { useEffect, useState, useMemo } from "react";
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

export const ADD_DAILY_ATTENDANCES_TAG = "Add_Daily_Attendance";

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
  const employeeIds = Object.keys(records);

  if (employeeIds.length > 0) {
    const { data: existingRecords, error: checkError } = await supabase
      .from("monthly_attendance")
      .select("id")
      .in("employee_id", employeeIds)
      .eq("month", submission.value.month)
      .eq("year", submission.value.year)
      .limit(1);

    if (existingRecords && existingRecords.length > 0) {
      return json({
        status: "error",
        message:
          "Attendance for these employees for this month already exists.",
        error: "ALREADY_EXISTS",
      });
    }
  }

  const data = Object.entries(records).flatMap(
    ([empId, days]: [string, any]) => {
      return Object.values(days).map((value: any) => {
        const presentValue = value.present === "PH" ? "P" : value.present;
        return {
          ...value,
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

export default function CreateBulkDailyAttendance() {
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

  const [localOvertime, setLocalOvertime] = useState<Record<string, number>>(
    {},
  );

  const handleOvertimeChange = (empId: string, value: string) => {
    const num = Number(value) || 0;
    setLocalOvertime((prev) => ({
      ...prev,
      [empId]: num,
    }));
  };

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
    // Sort by employee code or name
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

  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).status === "success") {
      const data = (fetcher.data as any).data || [];
      const monthlyData = (fetcher.data as any).monthlyData || [];
      const mapping: Record<string, Record<string, any>> = {};
      const otMapping: Record<string, number> = {};

      for (const emp of filteredEmployees) {
        mapping[emp.id] = {};
        const monthly = monthlyData.find((m: any) => m.employee_id === emp.id);
        otMapping[emp.id] = monthly ? monthly.overtime_hours || 0 : 0;
      }

      for (const d of data) {
        if (mapping[d.employee_id]) {
          mapping[d.employee_id][d.date] = {
            date: d.date,
            present: d.present ? "P" : "A",
            hours: d.no_of_hours || 8,
            overtime_hours: 0,
          };
          if (d.holiday_type === "weekly")
            mapping[d.employee_id][d.date].present = "W";
          if (d.holiday_type === "paid_holiday")
            mapping[d.employee_id][d.date].present = "PH";
          if (d.holiday_type === "casual_leave")
            mapping[d.employee_id][d.date].present = "CL";
          if (d.holiday_type === "paid_leave")
            mapping[d.employee_id][d.date].present = "PL";
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
            mapping[emp.id][dateStr] = {
              date: dateStr,
              present: date.getDay() === 0 ? "W" : "P",
              hours: 8,
              overtime_hours: 0,
            };
          }
        }
      }

      setLocalAttendances(mapping);
      setLocalOvertime(otMapping);
    } else if (filteredEmployees.length > 0) {
      const mapping: Record<string, Record<string, any>> = {};
      const otMapping: Record<string, number> = {};
      for (const emp of filteredEmployees) {
        mapping[emp.id] = {};
        otMapping[emp.id] = 0;
        for (const date of calendarDays) {
          const dateStr = date.toLocaleDateString("en-CA");
          const isSelectedMonth = date.getMonth() === month.getMonth();

          if (isSelectedMonth || payrollCycle === "21-20") {
            mapping[emp.id][dateStr] = {
              date: dateStr,
              present: date.getDay() === 0 ? "W" : "P",
              hours: 8,
              overtime_hours: 0,
            };
          }
        }
      }
      setLocalAttendances(mapping);
      setLocalOvertime(otMapping);
    }
  }, [fetcher.data, filteredEmployees, calendarDays, month, payrollCycle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawPayload = sessionStorage.getItem("imported_attendance_payload");
    if (!rawPayload) return;

    try {
      const payload = JSON.parse(rawPayload);
      const { month: targetMonth, year: targetYear, rows } = payload;

      if (targetMonth && targetYear) {
        const curM = month.getMonth() + 1;
        const curY = month.getFullYear();
        if (curM !== targetMonth || curY !== targetYear) {
          setMonth(new Date(targetYear, targetMonth - 1, 1));
        }
      }

      if (rows && Array.isArray(rows) && rows.length > 0 && filteredEmployees.length > 0) {
        let matchedCount = 0;

        const cleanStr = (s: any) => String(s || "").trim().toLowerCase();
        const normalizeCode = (c: any) =>
          cleanStr(c).replace(/^([a-z]+)0+(\d+)/i, "$1$2").replace(/[^a-z0-9]/g, "");
        const normalizeWords = (s: any) =>
          cleanStr(s)
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 0)
            .sort()
            .join(" ");

        setLocalAttendances((prev) => {
          const nextState = { ...prev };

          for (const row of rows) {
            const rowCode = cleanStr(row.employee_code);
            const rowUan = cleanStr(row.uan_number);
            const rowName = cleanStr(row.name);

            let matchedEmp: any = null;

            // Priority 1: Match by Employee Code
            if (rowCode) {
              const normRowCode = normalizeCode(rowCode);
              matchedEmp = filteredEmployees.find((emp: any) => {
                const empCode = cleanStr(emp.employee_code);
                const normEmpCode = normalizeCode(empCode);
                return (
                  normEmpCode &&
                  (normEmpCode === normRowCode ||
                    normEmpCode.includes(normRowCode) ||
                    normRowCode.includes(normEmpCode))
                );
              });
            }

            // Priority 2: Match by UAN Number
            if (!matchedEmp && rowUan) {
              const normRowUan = rowUan.replace(/[^0-9]/g, "");
              matchedEmp = filteredEmployees.find((emp: any) => {
                const empUan = cleanStr(
                  emp.employee_statutory_details?.uan_number ||
                    (emp as any).uan_number ||
                    (emp as any).uan
                );
                const normEmpUan = empUan.replace(/[^0-9]/g, "");
                return normEmpUan && normEmpUan === normRowUan;
              });
            }

            // Priority 3: Match by Employee Name
            if (!matchedEmp && rowName) {
              const normRowNameWords = normalizeWords(rowName);
              matchedEmp = filteredEmployees.find((emp: any) => {
                const fn = cleanStr(emp.first_name);
                const mn = cleanStr(emp.middle_name);
                const ln = cleanStr(emp.last_name);
                const fullEmpName = `${fn} ${mn} ${ln}`.trim();
                const normEmpNameWords = normalizeWords(fullEmpName);

                if (
                  normEmpNameWords &&
                  normRowNameWords &&
                  (normEmpNameWords === normRowNameWords ||
                    normEmpNameWords.includes(normRowNameWords) ||
                    normRowNameWords.includes(normEmpNameWords))
                ) {
                  return true;
                }
                if (fn && ln && normRowNameWords.includes(fn) && normRowNameWords.includes(ln)) {
                  return true;
                }
                return false;
              });
            }

            if (matchedEmp && matchedEmp.id) {
              matchedCount++;
              const empId = matchedEmp.id;
              const empAttendance = nextState[empId] ? { ...nextState[empId] } : {};

              for (const [dayNumStr, statusVal] of Object.entries(row.attendance || {})) {
                const dNum = parseInt(dayNumStr, 10);
                if (isNaN(dNum)) continue;

                const targetDateObj = calendarDays.find((cd) => cd.getDate() === dNum);
                if (targetDateObj) {
                  const dateStr = targetDateObj.toLocaleDateString("en-CA");
                  empAttendance[dateStr] = {
                    ...(empAttendance[dateStr] || {}),
                    date: dateStr,
                    present: statusVal,
                    hours: 8,
                    overtime_hours: 0,
                  };
                }
              }

              nextState[empId] = empAttendance;
            }
          }

          return nextState;
        });

        if (matchedCount > 0) {
          toast({
            title: "Attendance Auto-filled",
            description: `Auto-filled attendance values for ${matchedCount} employee(s) from email (Matched by Code > UAN > Name).`,
            variant: "success",
          });
        } else {
          toast({
            title: "Import Notice",
            description: `Parsed sheet with ${rows.length} rows, but no employees in the current site matched by Code, UAN, or Name. Select the matching site to view auto-filled data.`,
            variant: "destructive",
          });
        }

        sessionStorage.removeItem("imported_attendance_payload");
      }
    } catch (err) {
      console.error("Error applying imported attendance payload:", err);
    }
  }, [filteredEmployees, calendarDays, month]);

  useEffect(() => {
    if (actionData && (actionData as any).status === "success") {
      clearCacheEntry(cacheKeyPrefix.attendance);
      clearCacheEntry(cacheKeyPrefix.attendance_report);
      toast({
        title: "Success",
        description: (actionData as any).message,
        variant: "success",
      });
      navigate(
        `/time-tracking/attendance?recently_added=${recentlyAddedFilter[0]}`,
      );
    } else if (actionData && (actionData as any).status === "error") {
      toast({
        title: "Validation Error",
        description: (actionData as any).message,
        variant: "destructive",
      });
    }
  }, [actionData]);

  const handleCellChange = (empId: string, date: Date, value: string) => {
    const dateStr = date.toLocaleDateString("en-CA");
    setLocalAttendances((prev) => {
      const empData = prev[empId] || {};
      return {
        ...prev,
        [empId]: {
          ...empData,
          [dateStr]: {
            ...empData[dateStr],
            date: dateStr,
            present: value.toUpperCase(),
          },
        },
      };
    });
  };

  const getStatus = (empId: string, date: Date) => {
    const dateStr = date.toLocaleDateString("en-CA");
    return localAttendances[empId]?.[dateStr]?.present || "";
  };

  const calculateTotals = (empId: string) => {
    let rawP = 0;
    let cl = 0;
    let ph = 0;
    let pl = 0;
    let absent = 0;
    let wof = 0;
    let h = 0;

    for (const date of calendarDays) {
      const status = getStatus(empId, date);
      if (status === "P") rawP++;
      else if (status === "CL") cl++;
      else if (status === "PH") ph++;
      else if (status === "PL") pl++;
      else if (status === "A") absent++;
      else if (status === "W" || status === "WO" || status === "WOF") wof++;
      else if (status === "H") h++;
    }

    const present = rawP;
    const totalPaid = present + cl + ph + pl;

    return { present, cl, ph, pl, absent, wof, h, totalPaid };
  };

  const SUBMIT_BUTTON_CLASS =
    "bg-[#3B82F6] text-slate-950 hover:bg-[#2563EB] font-bold rounded-lg px-6 py-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const recordsToSubmit = Object.fromEntries(
    filteredEmployees.map((emp) => [
      emp.id,
      Object.fromEntries(
        Object.entries(localAttendances[emp.id] || {}).map(
          ([date, att]: [string, any], idx: number) => [
            date,
            {
              ...att,
              employee_code: emp.employee_code?.trim(),
              overtime_hours: idx === 0 ? localOvertime[emp.id] || 0 : 0,
            },
          ],
        ),
      ),
    ]),
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full overflow-hidden bg-background text-foreground"
    >
      <header className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-b bg-card backdrop-blur-xl sticky top-0 z-30 gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <Icon name="arrow-left" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Manual Attendance Entry
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
              Time Tracking Module
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1.5 w-48">
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

          <div className="flex flex-col gap-1.5 w-48">
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

          <div className="flex flex-col gap-1.5 w-40">
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

          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border">
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

          <Form method="post">
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
              disabled={filteredEmployees.length === 0}
            >
              Submit
            </button>
          </Form>
        </div>
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
                        className="px-1 py-3 border-r font-bold text-center w-10 min-w-[40px]"
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
                  {filteredEmployees.map((emp, idx) => {
                    const totals = calculateTotals(emp.id);
                    return (
                      <tr
                        key={emp.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
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
                          const currentStatus = getStatus(emp.id, date);
                          const isCellActive =
                            activeCell?.empId === emp.id &&
                            activeCell?.dateStr === dateStr;

                          const displayCode =
                            currentStatus === "W" ||
                            currentStatus === "WO" ||
                            currentStatus === "WOF"
                              ? "WOF"
                              : currentStatus;

                          return (
                            <td
                              key={dIdx}
                              className="p-0 border-r w-10 min-w-[40px] relative"
                            >
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
                                    onClick={() =>
                                      setActiveCell({ empId: emp.id, dateStr })
                                    }
                                    className={cn(
                                      "w-full h-10 text-center font-bold text-xs uppercase focus:outline-none focus:bg-primary/5 transition-all bg-transparent flex items-center justify-center cursor-pointer select-none",
                                      currentStatus === "P"
                                        ? "text-blue-600 dark:text-blue-400 hover:bg-blue-50/55 dark:hover:bg-blue-950/20"
                                        : currentStatus === "A"
                                          ? "text-red-500 dark:text-red-400 hover:bg-red-50/55 dark:hover:bg-red-950/20"
                                          : currentStatus === "W" ||
                                              currentStatus === "WO" ||
                                              currentStatus === "WOF"
                                            ? "text-orange-500 dark:text-orange-400 hover:bg-orange-50/55 dark:hover:bg-orange-950/20"
                                            : currentStatus === "H" ||
                                                currentStatus === "PH"
                                              ? "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50/55 dark:hover:bg-yellow-950/20"
                                              : "text-foreground hover:bg-muted/50",
                                    )}
                                  >
                                    {displayCode}
                                  </button>
                                </PopoverTrigger>

                                {isCellActive && (
                                  <PopoverContent
                                    className="w-[170px] p-1 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl flex flex-col gap-0.5 text-left outline-none"
                                    align="center"
                                    sideOffset={4}
                                  >
                                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-1 mb-1">
                                      Status
                                    </div>
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
                                            handleCellChange(
                                              emp.id,
                                              date,
                                              opt.value,
                                            );
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
                        <td className="px-2 py-2 border-r text-center font-bold">
                          {totals.h}
                        </td>
                        <td
                          style={{ backgroundColor: "hsl(var(--card))" }}
                          className="px-2 py-2 border-r text-center font-bold sticky right-[120px] z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[80px] w-[80px] outline outline-1 outline-card"
                        >
                          <input
                            type="number"
                            step="0.5"
                            className="w-16 h-8 text-center font-semibold text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background text-foreground"
                            min={0}
                            value={
                              localOvertime[emp.id] !== undefined &&
                              localOvertime[emp.id] !== 0
                                ? localOvertime[emp.id]
                                : ""
                            }
                            placeholder="0"
                            onChange={(e) =>
                              handleOvertimeChange(emp.id, e.target.value)
                            }
                          />
                        </td>
                        <td
                          style={{ backgroundColor: "hsl(var(--card))" }}
                          className="px-2 py-2 border-r text-center font-bold sticky right-0 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[120px] w-[120px] outline outline-1 outline-card"
                        >
                          {totals.totalPaid}
                        </td>
                      </tr>
                    );
                  })}
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
              Please select a site and department to manage their monthly
              attendance.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
