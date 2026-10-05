import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { LAZY_LOADING_LIMIT } from "@canny_ecosystem/supabase/constant";
import { months } from "@canny_ecosystem/utils/constant";
import {
  defaultMonth,
  defaultYear,
  previousMonth,
  previousMonthYear,
  parseMonthNumber,
} from "@canny_ecosystem/utils";

import { getDailyAttendanceColumns } from "@/components/attendance/table/daily-columns";
import {
  getMonthlyAttendanceByCompanyId,
  getCompanyNameByCompanyId,
  getPrimaryLocationByCompanyId,
  getSiteNamesByCompanyId,
  getHolidayConfigsByCompanyId,
  getProjectNamesByCompanyId,
  getEmployeesWithoutAttendance,
} from "@canny_ecosystem/supabase/queries";

import {
  upsertHolidayConfig,
  deleteHolidayConfigById,
} from "@canny_ecosystem/supabase/mutations";
import type { EmployeeMonthlyAttendanceDatabaseUpdate } from "@canny_ecosystem/supabase/types";

import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { parseWithZod } from "@conform-to/zod";
import { HolidayConfigSchema } from "@canny_ecosystem/utils";

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  redirect,
  useLoaderData,
  useSearchParams,
} from "@remix-run/react";
import { Tabs, TabsList, TabsTrigger } from "@canny_ecosystem/ui/tabs";
import { AttendanceTable } from "@/components/attendance/table/attendance-table";
import { attendanceColumns } from "@/components/attendance/table/columns";
import { HolidayConfigCards } from "@/components/attendance/holiday-config-cards";

import { Suspense, useMemo } from "react";
import { hasPermission, readRole } from "@canny_ecosystem/utils";
import { clearCacheEntry, clientCaching } from "@/utils/cache";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { attribute } from "@canny_ecosystem/utils/constant";
import { ErrorBoundary } from "@/components/error-boundary";
import { AttendanceSearchFilter } from "@/components/attendance/attendance-search-filter";
import { FilterList } from "@/components/attendance/filter-list";
import { AttendanceActions } from "@/components/attendance/attendance-actions";
import { LoadingSpinner } from "@/components/loading-spinner";
import type {
  CompanyDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { ImportAttendanceModal } from "@/components/employees/import-export/import-modal-attendance";
import { ImportDailyAttendanceModal } from "@/components/employees/import-export/import-modal-daily-attendance";
import { ImportUpdateAttendanceModal } from "@/components/employees/import-export/import-modal-update-attendance";
import { DailyAttendanceEditSheet } from "@/components/attendance/daily-attendance-edit-sheet";
import { ImportUpdateDailyAttendanceModal } from "@/components/employees/import-export/import-modal-update-daily-attendance";
import { generateAttendanceFilter } from "@/utils/ai/attendance";
import { MissingAttendanceModal } from "@/components/attendance/missing-attendance-modal";

const pageSize = LAZY_LOADING_LIMIT;

const getMonthNumber = parseMonthNumber;

export type DayType = { day: number; fullDate: string };

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  try {
    const url = new URL(request.url);
    const { supabase, headers } = getSupabaseWithHeaders({ request });
    const { user } = await getUserCookieOrFetchUser(request, supabase);

    if (!hasPermission(user?.role!, `${readRole}:${attribute.attendance}`))
      return safeRedirect(DEFAULT_ROUTE, { headers });

    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const { data: companyName } = await getCompanyNameByCompanyId({
      supabase,
      id: companyId,
    });
    const { data: companyAddress } = await getPrimaryLocationByCompanyId({
      supabase,
      companyId,
    });

    const searchParams = new URLSearchParams(url.searchParams);

    const filters = {
      month: searchParams.get("month") ?? undefined,
      year: searchParams.get("year") ?? undefined,
      name: searchParams.get("name") ?? undefined,
      project: searchParams.get("project") ?? undefined,
      site: searchParams.get("site") ?? undefined,
      recently_added: searchParams.get("recently_added") ?? undefined,
    };

    const attendancePromise = getMonthlyAttendanceByCompanyId({
      supabase,
      companyId,
      params: {
        from: 0,
        to: pageSize - 1,
        filters,
        searchQuery: filters.name,
        sort: searchParams.get("sort")?.split(":") as [string, "asc" | "desc"],
      },
    });

    const projectPromise = getProjectNamesByCompanyId({ supabase, companyId });

    const sitePromise = getSiteNamesByCompanyId({ supabase, companyId });

    const holidayConfigPromise = getHolidayConfigsByCompanyId({
      supabase,
      companyId,
    });

    const effectiveMonth = getMonthNumber(filters.month);
    const effectiveYear = filters.year
      ? Number(filters.year)
      : previousMonthYear;

    const remainingAttendancePromise = getEmployeesWithoutAttendance({
      supabase,
      companyId,
      month: effectiveMonth,
      year: effectiveYear,
      filters: {
        project: filters.project,
        site: filters.site,
      },
    });

    return defer({
      projectPromise,
      sitePromise,
      holidayConfigPromise,
      attendancePromise: attendancePromise as any,
      remainingAttendancePromise,
      filters,
      companyName,
      companyAddress,
      query: filters.name,
      env,
      companyId,
    });
  } catch (error) {
    console.error("Attendance Error in loader function:", error);
    return defer({
      attendancePromise: Promise.resolve({ data: [] }),
      projectPromise: Promise.resolve({ data: [] }),
      sitePromise: Promise.resolve({ data: [] }),
      holidayConfigPromise: Promise.resolve({ data: [] }),
      remainingAttendancePromise: Promise.resolve({ data: [] }),
      defaultPayDay: null,
      query: "",
      filters: null,
      companyId: "",
      companyName: null,
      companyAddress: null,
      env,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  const url = new URL(args.request.url);
  return clientCaching(
    `${cacheKeyPrefix.attendance}${url.searchParams.toString()}`,
    args,
  );
}

clientLoader.hydrate = true;

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { supabase, headers } = getSupabaseWithHeaders({ request });
    const url = new URL(request.url);
    const formData = await request.formData();
    const _action = formData.get("_action") as string;

    if (_action === "upsert-holiday-config") {
      const submission = parseWithZod(formData, {
        schema: HolidayConfigSchema,
      });

      if (submission.status !== "success") {
        return Response.json(submission.reply(), { headers });
      }

      const { data, error } = await upsertHolidayConfig({
        supabase,
        config: {
          ...submission.value,
          working_days: submission.value.use_attendance_working_days
            ? null
            : submission.value.working_days,
        } as any,
      });

      if (error) {
        return Response.json(
          submission.reply({
            formErrors: [error.message],
          }),
          { headers },
        );
      }

      return Response.json({ status: "success", data }, { headers });
    }

    if (_action === "delete-holiday-config") {
      const id = formData.get("id") as string;
      const { error } = await deleteHolidayConfigById({ supabase, id });
      return Response.json({ error }, { headers });
    }

    if (_action === "update-daily-attendance") {
      const attendance_id = formData.get("attendance_id") as string;
      const date = formData.get("date") as string;
      const val = formData.get("val") as string;
      const otVal = Number(formData.get("overtime_hours") || 0);

      if (!date) {
        // Direct monthly overtime hours update (OT column click)
        await supabase
          .from("monthly_attendance")
          .update({
            overtime_hours: otVal,
          })
          .eq("id", attendance_id);

        return Response.json({ success: true }, { headers });
      }

      if (val === "REMOVE") {
        await supabase
          .from("daily_attendance")
          .delete()
          .eq("attendance_id", attendance_id)
          .eq("date", date);
      } else {
        let present = false;
        let holiday = false;
        let holiday_type = null;

        if (val === "P") present = true;
        else if (val === "WOF") {
          holiday = true;
          holiday_type = "weekly";
        } else if (val === "PH") {
          holiday = true;
          holiday_type = "paid_holiday";
        } else if (val === "H") {
          holiday = true;
          holiday_type = null;
        } else if (val === "CL") {
          holiday = true;
          holiday_type = "casual_leave";
        } else if (val === "PL" || val === "EL" || val === "ML") {
          holiday = true;
          holiday_type = "paid_leave";
        } else if (val === "A") {
          present = false;
          holiday = false;
        }

        const { error: dailyError } = await supabase
          .from("daily_attendance")
          .upsert(
            {
              attendance_id,
              date,
              present,
              holiday,
              holiday_type,
              no_of_hours: 8,
              overtime_hours: otVal,
            },
            { onConflict: "attendance_id,date" },
          );

        if (dailyError) {
          console.error("Error upserting daily attendance:", dailyError);
        }
      }

      // Fetch current monthly overtime to preserve it if daily OT is 0
      const { data: existingMonthly } = await supabase
        .from("monthly_attendance")
        .select("overtime_hours")
        .eq("id", attendance_id)
        .single();
      const currentMonthlyOT = existingMonthly?.overtime_hours || 0;

      // Recalculate monthly
      const { data: allDaily } = await supabase
        .from("daily_attendance")
        .select("present, holiday, holiday_type, overtime_hours")
        .eq("attendance_id", attendance_id);
      if (allDaily) {
        const presents = allDaily.filter(
          (d: any) => d.present && d.holiday_type !== "weekly",
        ).length;
        const absents = allDaily.filter(
          (d: any) => !d.present && !d.holiday,
        ).length;
        const paidHolidays = allDaily.filter(
          (d: any) => d.holiday && d.holiday_type === "paid_holiday",
        ).length;
        const paidLeaves = allDaily.filter(
          (d: any) => d.holiday && d.holiday_type === "paid_leave",
        ).length;
        const casualLeaves = allDaily.filter(
          (d: any) => d.holiday && d.holiday_type === "casual_leave",
        ).length;
        const otHours = allDaily.reduce(
          (sum: number, d: any) => sum + Number(d.overtime_hours || 0),
          0,
        );

        await supabase
          .from("monthly_attendance")
          .update({
            present_days: presents,
            absent_days: absents,
            paid_holidays: paidHolidays,
            paid_leaves: paidLeaves,
            casual_leaves: casualLeaves,
            overtime_hours: otHours > 0 ? otHours : Number(currentMonthlyOT),
          } as EmployeeMonthlyAttendanceDatabaseUpdate)
          .eq("id", attendance_id);
      }

      return Response.json({ success: true }, { headers });
    }

    const prompt = formData.get("prompt") as string;

    const { object } = await generateAttendanceFilter({ input: prompt });

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(object)) {
      if (value !== null && value !== undefined && String(value)?.length) {
        searchParams.append(key, value.toString());
      }
    }

    url.search = searchParams.toString();

    return redirect(url.toString());
  } catch (error) {
    console.error("Attendance Error in action function:", error);

    const fallbackUrl = new URL(request.url);
    fallbackUrl.search = "";
    return redirect(fallbackUrl.toString());
  }
}

export default function Attendance() {
  const {
    attendancePromise,
    projectPromise,
    sitePromise,
    holidayConfigPromise,
    remainingAttendancePromise,
    query,
    filters,
    companyId,
    companyName,
    companyAddress,
    env,
  } = useLoaderData<typeof loader>();

  const noFilters = Object.values(filters ?? {}).every((value) => !value);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") || "monthly";

  const effectiveMonth = getMonthNumber(filters?.month);
  const effectiveYear = filters?.year
    ? Number(filters.year)
    : previousMonthYear;

  const dailyColumns = useMemo(
    () =>
      getDailyAttendanceColumns({
        month: effectiveMonth,
        year: effectiveYear,
        onEditClick: (attendanceId, date, currentValue, currentOT) => {
          setSearchParams(
            (prev) => {
              prev.set("edit_daily_id", attendanceId);
              prev.set("edit_daily_date", date);
              prev.set(
                "edit_daily_val",
                currentValue === "-" ? "REMOVE" : currentValue,
              );
              prev.set("edit_daily_ot", String(currentOT || 0));
              return prev;
            },
            { preventScrollReset: true },
          );
        },
      }),
    [effectiveMonth, effectiveYear, setSearchParams],
  );

  return (
    <section className="p-4 overflow-hidden">
      <Suspense
        fallback={
          <div className="h-32 w-full animate-pulse bg-muted rounded-lg mb-6" />
        }
      >
        <Await resolve={holidayConfigPromise}>
          {(configs) => (
            <HolidayConfigCards
              configs={configs?.data || []}
              companyId={companyId}
            />
          )}
        </Await>
      </Suspense>
      <div className="flex flex-col gap-4 pb-4">
        <div className="w-full flex flex-row max-sm:flex-col max-sm:gap-y-3 items-center justify-between max-sm:items-start max-md:items-start">
          <div className="flex w-[90%] max-sm:w-full flex-col items-start md:flex-row md:items-center gap-2 mr-4">
            <Suspense fallback={<LoadingSpinner className="mt-20" />}>
              <Await resolve={projectPromise}>
                {(projectData) => (
                  <Await resolve={sitePromise}>
                    {(siteData) => (
                      <AttendanceSearchFilter
                        projectArray={
                          projectData?.data?.map((project) => project!.name) ||
                          []
                        }
                        siteArray={
                          siteData?.data?.map((site) => site!.name) || []
                        }
                      />
                    )}
                  </Await>
                )}
              </Await>
            </Suspense>
            <FilterList filters={filters ?? undefined} />
          </div>
          <AttendanceActions
            companyName={companyName as unknown as CompanyDatabaseRow}
            companyAddress={companyAddress as unknown as LocationDatabaseRow}
            isDailyView={view === "daily"}
          />
        </div>
        {(() => {
          const monthName = filters?.month
            ? filters.month
            : Object.keys(months).find(
                (key) => (months as any)[key] === effectiveMonth,
              ) || "";
          const capitalizedMonthName =
            monthName.charAt(0).toUpperCase() + monthName.slice(1);

          return (
            <div className="flex flex-row max-sm:flex-col items-center justify-between gap-4 w-full">
              <Tabs
                value={view}
                onValueChange={(val) => {
                  const params = new URLSearchParams(searchParams);
                  params.set("view", val);
                  setSearchParams(params);
                }}
                className="w-fit"
              >
                <TabsList className="bg-muted/50 border border-white/5 h-9 p-1">
                  <TabsTrigger
                    value="monthly"
                    className="px-4 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground transition-all"
                  >
                    Monthly
                  </TabsTrigger>
                  <TabsTrigger
                    value="daily"
                    className="px-4 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground transition-all"
                  >
                    Daily
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Suspense
                fallback={
                  <div className="h-8 w-48 animate-pulse bg-muted rounded-full" />
                }
              >
                <Await resolve={remainingAttendancePromise}>
                  {(missingResult: any) => (
                    <MissingAttendanceModal
                      missingEmployees={missingResult?.data || []}
                      month={capitalizedMonthName}
                      year={String(effectiveYear)}
                      error={missingResult?.error}
                    />
                  )}
                </Await>
              </Suspense>
            </div>
          );
        })()}
      </div>

      {view === "monthly" ? (
        <Suspense fallback={<LoadingSpinner className="w-1/3 h-1/3" />}>
          <Await resolve={attendancePromise}>
            {({ data, count, error }: any) => {
              if (error) {
                clearCacheEntry(cacheKeyPrefix.attendance);
                return (
                  <ErrorBoundary
                    error={error}
                    message="Failed to load Attendance"
                  />
                );
              }

              const hasNextPage = Boolean(count > data?.length);
              return (
                <AttendanceTable
                  data={data as any[]}
                  hasNextPage={hasNextPage}
                  pageSize={pageSize}
                  query={query}
                  count={count ?? 0}
                  columns={attendanceColumns}
                  filters={filters ?? undefined}
                  noFilters={noFilters}
                  companyId={companyId}
                  env={env}
                  isDailyView={false}
                  companyName={companyName as unknown as CompanyDatabaseRow}
                  companyAddress={
                    companyAddress as unknown as LocationDatabaseRow
                  }
                />
              );
            }}
          </Await>
        </Suspense>
      ) : (
        <Suspense fallback={<LoadingSpinner className="w-1/3 h-1/3" />}>
          <Await resolve={attendancePromise}>
            {({ data, count, error }: any) => {
              if (error) {
                clearCacheEntry(cacheKeyPrefix.attendance);
                return (
                  <ErrorBoundary
                    error={error}
                    message="Failed to load Daily Attendance"
                  />
                );
              }

              const hasNextPage = Boolean(count > data?.length);
              return (
                <AttendanceTable
                  data={data as any[]}
                  hasNextPage={hasNextPage}
                  pageSize={pageSize}
                  query={query}
                  count={count ?? 0}
                  columns={dailyColumns}
                  filters={filters ?? undefined}
                  noFilters={noFilters}
                  companyId={companyId}
                  env={env}
                  isDailyView={true}
                  companyName={companyName as unknown as CompanyDatabaseRow}
                  companyAddress={
                    companyAddress as unknown as LocationDatabaseRow
                  }
                />
              );
            }}
          </Await>
        </Suspense>
      )}
      <ImportAttendanceModal />
      <ImportDailyAttendanceModal />
      <ImportUpdateAttendanceModal />
      <ImportUpdateDailyAttendanceModal />
      <DailyAttendanceEditSheet />
    </section>
  );
}
