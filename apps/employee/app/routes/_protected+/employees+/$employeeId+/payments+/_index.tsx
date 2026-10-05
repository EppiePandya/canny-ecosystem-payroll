import { EmployeeExitsCard } from "@/components/employees/exits/employee-exit-card";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { getEmployeeExitWithDeathExit } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { defer, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import { Suspense } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const employeeId = params.employeeId as string;

  try {
    // const paymentTemplateAssignmentPromise =
    //   getPaymentTemplateAssignmentByEmployeeId({
    //     supabase,
    //     employeeId,
    //   });
    // const paymentTemplateComponentsPromise =
    //   paymentTemplateAssignmentPromise.then((assignmentResult) => {
    //     if (assignmentResult.data?.template_id) {
    //       return getPaymentTemplateComponentsByTemplateId({
    //         supabase,
    //         templateId: assignmentResult.data.template_id,
    //       });
    //     }
    //     return { data: null, error: null };
    //   });
    const exitsPromise = getEmployeeExitWithDeathExit({
      supabase,
      employeeId,
    }).then((result) => {
      if (result.error) throw result.error;
      return result.data ?? [];
    });

    return defer({
      exitsPromise,
      error: null,
    });
  } catch (error) {
    return defer({
      error,

      exitsPromise: null,
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
  const { exitsPromise, error } = useLoaderData<typeof loader>();
  const { employeeId } = useParams();

  if (error) {
    clearExactCacheEntry(`${cacheKeyPrefix.employee_payments}${employeeId}`);
    return <ErrorBoundary error={error} message="Failed to load data" />;
  }

  return (
    <div className="w-full py-4 flex flex-col gap-8">
      <Suspense fallback={<LoadingSpinner className="h-1/4" />}>
        <Await resolve={exitsPromise}>
          {(resolvedData) => {
            if (!resolvedData) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_payments}${employeeId}`,
              );
              return <ErrorBoundary message="Failed to load link template" />;
            }
            return (
              <EmployeeExitsCard
                exitsData={resolvedData}
                employeeId={employeeId ?? ""}
              />
            );
          }}
        </Await>
      </Suspense>
    </div>
  );
}
