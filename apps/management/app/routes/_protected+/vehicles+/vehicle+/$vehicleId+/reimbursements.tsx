import { columns } from "@/components/reimbursements/table/columns";
import { ReimbursementsTable } from "@/components/reimbursements/table/reimbursements-table";
import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clientCaching } from "@/utils/cache";
import { getReimbursementsByVehicleId } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { defer, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  useLoaderData,
} from "@remix-run/react";
import { Suspense } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const vehicleId = params.vehicleId;

    const reimbursementPromise = getReimbursementsByVehicleId({
      supabase,
      vehicleId: vehicleId ?? "",
    });

    return defer({
      reimbursementPromise: reimbursementPromise as any,
      vehicleId,
      env,
    });
  } catch (error) {
    console.error("Reimbursement Error in vehicle loader:", error);
    return defer({
      reimbursementPromise: Promise.resolve({ data: [] }),
      vehicleId: "",
      env,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  const url = new URL(args.request.url);

  return clientCaching(
    `${cacheKeyPrefix.vehicle_overview}_reimbursements_${
      args.params.vehicleId
    }${url.searchParams.toString()}`,
    args,
  );
}

clientLoader.hydrate = true;

export default function VehicleReimbursementsIndex() {
  const { reimbursementPromise, vehicleId, env } = useLoaderData<typeof loader>();
  const { toast } = useToast();

  return (
    <section className="py-4" key={reimbursementPromise}>
      <Suspense fallback={<LoadingSpinner />}>
        <Await
          resolve={reimbursementPromise}
          errorElement={
            <div>
              Error loading reimbursements. Please try again later.
            </div>
          }
        >
          {({ data, error }) => {
            if (error) {
              clearCacheEntry(
                `${cacheKeyPrefix.vehicle_overview}_reimbursements_${vehicleId}`
              );
              toast({
                variant: "destructive",
                title: "Error",
                description:
                  "Failed to load reimbursements. Please try again.",
              });
              return null;
            }

            return (
              <ReimbursementsTable
                data={data}
                noFilters={true}
                columns={columns({ reimbursementFor: "payee" })}
                hasNextPage={false}
                pageSize={100}
                env={env}
                vehicleId={vehicleId}
              />
            );
          }}
        </Await>
      </Suspense>
    </section>
  );
}
