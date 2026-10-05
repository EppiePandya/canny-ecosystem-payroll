import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clientCaching } from "@/utils/cache";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  Link,
  useLoaderData,
  useParams,
  useRouteLoaderData,
} from "@remix-run/react";
import { Suspense, useEffect, useState } from "react";
import {
  createRole,
  hasPermission,
  readRole,
  searchInObject,
} from "@canny_ecosystem/utils";
import { safeRedirect } from "@/utils/server/http.server";
import { attribute } from "@canny_ecosystem/utils/constant";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { useUser } from "@/utils/user";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { getEmployeeAdvancesByEmployeeId } from "@canny_ecosystem/supabase/queries";
import { AdvancesDataTable } from "@/components/employees/advances/table/data-table";
import { columns } from "@/components/employees/advances/table/columns";
import { ErrorBoundary } from "@/components/error-boundary";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);
  const employeeId = params.employeeId;

  if (!hasPermission(user?.role!, `${readRole}:${attribute.employees}`))
    return safeRedirect(DEFAULT_ROUTE, { headers });

  if (!employeeId) return safeRedirect("/employees", { headers });

  try {
    const advancePromise = getEmployeeAdvancesByEmployeeId({
      supabase,
      employeeId,
    });

    return defer({
      advancePromise: advancePromise as any,
    });
  } catch (error) {
    console.error("Advance Error in loader function:", error);
    return defer({
      advancePromise: Promise.resolve({ data: [] }),
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(
    `${cacheKeyPrefix.employee_advances}-${args.params.employeeId}`,
    args,
  );
}

clientLoader.hydrate = true;

export default function EmployeeAdvancesIndex() {
  const { role } = useUser();
  const { employeeId } = useParams();
  const { advancePromise } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<any>(
    "routes/_protected+/employees+/$employeeId",
  );
  const employeeName = parentData?.employeeName || "";
  const employeeCode = parentData?.employeeCode || "";

  return (
    <>
      <Suspense fallback={<LoadingSpinner className="h-1/3" />}>
        <Await resolve={advancePromise}>
          {({ data, error }: { data: any[]; error: any }) => {
            if (error) {
              return (
                <ErrorBoundary
                  error={error}
                  message="Failed to load employee advances"
                />
              );
            }
            const [tableData, setTableData] = useState(data || []);
            const [searchString, setSearchString] = useState("");

            useEffect(() => {
              const filteredData = (data || []).filter((item: any) =>
                searchInObject(item, searchString),
              );
              setTableData(filteredData);
            }, [searchString, data]);

            return (
              <section className="py-4">
                <div className="w-full flex items-center justify-between pb-4">
                  <div className="w-full lg:w-3/5 2xl:w-1/3 flex items-center gap-4">
                    <div className="relative w-full">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Icon
                          name="magnifying-glass"
                          size="sm"
                          className="text-gray-400"
                        />
                      </div>
                      <Input
                        placeholder="Search Advance"
                        value={searchString}
                        onChange={(e) => setSearchString(e.target.value)}
                        className="pl-8 h-10 w-full focus-visible:ring-0 shadow-none"
                      />
                    </div>
                    <Link
                      to={`/employees/${employeeId}/advances/create-advance`}
                      className={cn(
                        buttonVariants({ variant: "primary-outline" }),
                        "flex items-center gap-1",
                        !hasPermission(
                          role,
                          `${createRole}:${attribute.employees}`,
                        ) && "hidden",
                      )}
                    >
                      <span>Add</span>
                      <span className="hidden md:flex justify-end">
                        Advance
                      </span>
                    </Link>
                  </div>
                </div>
                <AdvancesDataTable
                  data={tableData}
                  columns={columns}
                  employeeName={employeeName}
                  employeeCode={employeeCode}
                />
              </section>
            );
          }}
        </Await>
      </Suspense>
    </>
  );
}
