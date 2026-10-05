import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getEmployeeSalaryAssignmentsByEmployeeId } from "@canny_ecosystem/supabase/queries";
import { defer, type LoaderFunctionArgs } from "@remix-run/node";
import { Await, Link, useLoaderData, useParams } from "@remix-run/react";
import { Suspense, useState } from "react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SalaryAssignmentTable } from "@/components/employees/salary/salary-assignment-table";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  const employeeId = params.employeeId as string;

  const assignmentsPromise = getEmployeeSalaryAssignmentsByEmployeeId({
    supabase: supabase as any,
    employeeId,
  });

  return defer({
    assignmentsPromise,
    env,
  });
}

export default function EmployeeSalaryListingPage() {
  const { employeeId } = useParams();
  const { assignmentsPromise, env } = useLoaderData<typeof loader>();
  const [searchString, setSearchString] = useState("");

  return (
    <div className="p-4 h-full flex flex-col gap-4 overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between pb-4">
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
              placeholder="Search by date, CTC or template"
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              className="pl-8 h-10 w-full focus-visible:ring-0 shadow-none border-input"
            />
          </div>
          <Link
            to={`/employees/${employeeId}/salary/new`}
            className={cn(
              buttonVariants({ variant: "primary-outline" }),
              "flex items-center gap-1",
            )}
          >
            <span>Add</span>
            <span className="hidden md:flex">Salary</span>
          </Link>
        </div>
      </div>

      <Suspense fallback={<LoadingSpinner className="mt-20" />}>
        <Await resolve={assignmentsPromise}>
          {(resolvedData) => (
            <SalaryAssignmentTable
              data={resolvedData?.data as any}
              error={resolvedData?.error as any}
              searchString={searchString}
              env={env}
            />
          )}
        </Await>
      </Suspense>
    </div>
  );
}
