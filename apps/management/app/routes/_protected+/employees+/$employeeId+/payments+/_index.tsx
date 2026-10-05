import { EmployeeExitsCard } from "@/components/employees/employee-exit/employee-exit-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";

import { getEmployeeExitWithDeathExit } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";

import { defer, json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  useLoaderData,
  useParams,
} from "@remix-run/react";

import { Suspense } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const employeeId = params.employeeId;

  if (!employeeId) {
    throw json({ message: "Employee id missing" }, { status: 400 });
  }

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  try {
    const exitsPromise = getEmployeeExitWithDeathExit({
      supabase,
      employeeId,
    }).then((result) => {
      if (result.error) {
        console.error("Supabase JOIN error 👉", result.error);
        throw new Error(result.error.message);
      }
      return result.data ?? [];
    });

    return defer({ exitsPromise, env });
  } catch (error: any) {
    console.error("Loader error 👉", error);
    return defer({
      exitsPromise: Promise.reject(error),
      env,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(
    `${cacheKeyPrefix.employee_payments}${args.params.employeeId}`,
    args,
  );
}
clientLoader.hydrate = true;

export default function Payments() {
  const { exitsPromise, env } = useLoaderData<typeof loader>();
  const { employeeId } = useParams();

  return (
    <div className="w-full py-4 flex flex-col gap-8">
      <Suspense fallback={<LoadingSpinner className="h-1/4" />}>
        <Await resolve={exitsPromise}>
          {(exitsArray: any[]) => {
            if (!exitsArray) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_payments}${employeeId}`,
              );
              return <div>Unable to load exits</div>;
            }

            return (
              <EmployeeExitsCard
                exitsData={exitsArray}
                employeeId={employeeId ?? ""}
                env={env}
              />
            );
          }}
        </Await>
      </Suspense>
    </div>
  );
}
