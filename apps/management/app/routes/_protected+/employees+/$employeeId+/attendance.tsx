import AttendanceComponent from "@/components/employees/attendance/attendance-component";
import { AttendanceComponent as AttendanceCalendar } from "@/components/attendance/attendance-component";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { getMonthNameFromNumber } from "@canny_ecosystem/utils";
import { FilterList } from "@/components/employees/salary/filter-list";
import { SalaryFilter } from "@/components/employees/salary/salary-filter";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clientCaching } from "@/utils/cache";
import {
  type DashboardFilters,
  getAttendanceByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { EmployeeMonthlyAttendanceDatabaseRow } from "@canny_ecosystem/supabase/types";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  Outlet,
  useLoaderData,
  useParams,
  useSearchParams,
} from "@remix-run/react";
import { Suspense } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  try {
    const url = new URL(request.url);
    const employeeId = params.employeeId!;
    const searchParams = new URLSearchParams(url.searchParams);
    const { supabase } = getSupabaseWithHeaders({ request });

    const filters = {
      year: searchParams.get("year") ?? undefined,
    };

    const attendancePromise = getAttendanceByEmployeeId({
      employeeId: employeeId,
      supabase,
      filters,
    });

    return defer({
      attendancePromise: attendancePromise as any,
      filters,
      env,
      error: null,
    });
  } catch (error) {
    return defer({
      attendancePromise: null,
      error,
      env,
      filters: {},
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  const url = new URL(args.request.url);
  return clientCaching(
    `${cacheKeyPrefix.attendance}${
      args.params.employeeId
    }${url.searchParams.toString()}`,
    args,
  );
}

clientLoader.hydrate = true;

export default function EmployeeAttendance() {
  const { attendancePromise, error, filters, env } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const dailyId = searchParams.get("daily_attendance_id");

  const { employeeId } = useParams();

  if (error) {
    return (
      <ErrorBoundary
        error={error}
        message="Failed to load Employee Attendance"
      />
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Await resolve={attendancePromise}>
        {({ data, error }) => {
          if (error) {
            clearCacheEntry(`${cacheKeyPrefix.attendance}${employeeId}`);

            return (
              <ErrorBoundary
                error={error}
                message="Failed to load Employee Attendance"
              />
            );
          }

          return (
            <section className="py-4 flex flex-col gap-4">
              <div className="flex justify-end">
                <div className="flex justify-between gap-3">
                  <FilterList
                    filters={filters as unknown as DashboardFilters}
                  />
                  <SalaryFilter />
                </div>
              </div>
              {(data?.length ?? 0) > 0 ? (
                <div className="flex-1 w-full grid gap-6 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2 justify-start auto-rows-min">
                  {data.map(
                    (
                      attendance: EmployeeMonthlyAttendanceDatabaseRow,
                      index: number,
                    ) => (
                      <AttendanceComponent
                        key={index.toString()}
                        attendanceData={attendance}
                      />
                    ),
                  )}
                </div>
              ) : (
                <div className="h-full w-full flex justify-center items-center text-xl">
                  No Attendance Data Found
                </div>
              )}
              <Outlet />

              {(() => {
                if (!dailyId) return null;
                const selectedAttendance = data?.find(
                  (a: any) => a.id === dailyId,
                );
                if (!selectedAttendance) return null;

                const month = selectedAttendance.month;
                const year = selectedAttendance.year;

                return (
                  <Dialog
                    open={!!dailyId}
                    onOpenChange={(open) => {
                      if (!open) {
                        searchParams.delete("daily_attendance_id");
                        setSearchParams(searchParams, {
                          preventScrollReset: true,
                        });
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
                                {getMonthNameFromNumber(month)} {year}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full border">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                                <span className="text-[10px] font-medium">
                                  present
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full border">
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
                                <span className="text-[10px] font-medium">
                                  absent
                                </span>
                              </div>
                            </div>
                          </div>
                        </DialogHeader>

                        <AttendanceCalendar
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
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}
