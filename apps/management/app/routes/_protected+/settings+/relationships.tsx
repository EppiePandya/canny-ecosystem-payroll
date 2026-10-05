import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getRelationshipsByCompanyId } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import { defer, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  Outlet,
  useLoaderData,
} from "@remix-run/react";

import { Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { RelationshipsCard } from "@/components/relationships/relationships-card";
import { RelationshipWrapper } from "@/components/relationships/relationship-wrapper";
import { useUser } from "@/utils/user";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { LoadingSpinner } from "@/components/loading-spinner";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });

    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const relationshipsPromise = getRelationshipsByCompanyId({
      supabase,
      companyId,
    });

    return defer({
      relationshipsPromise,
      error: null,
    });
  } catch (error) {
    return defer({
      error,
      relationshipsPromise: null,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.relationships, args);
}

clientLoader.hydrate = true;

export default function Relationships() {
  const { relationshipsPromise, error } = useLoaderData<typeof loader>();

  if (error) {
    clearExactCacheEntry(cacheKeyPrefix.relationships);
    return (
      <ErrorBoundary error={error} message="Failed to load relationships" />
    );
  }

  return (
    <section className="py-4">
      <div className="w-full">
        <Suspense fallback={<LoadingSpinner className="my-20" />}>
          <Await resolve={relationshipsPromise}>
            {(resolvedData) => {
              if (!resolvedData) {
                clearExactCacheEntry(cacheKeyPrefix.relationships);
                return <ErrorBoundary message="Failed to load relationships" />;
              }
              return (
                <RelationshipWrapper
                  data={resolvedData.data as any}
                  error={resolvedData.error}
                />
              );
            }}
          </Await>
        </Suspense>
      </div>
      <Outlet />
    </section>
  );
}
