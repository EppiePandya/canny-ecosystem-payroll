import { CompanyDetailsWrapper } from "@/components/company/company-details-wrapper";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCompanyById,
  getCompanyConfigByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  useLoaderData,
} from "@remix-run/react";
import { Suspense, useEffect, useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const companyDetailsPromise = getCompanyById({ supabase, id: companyId! });
    const companyConfigPromise = getCompanyConfigByCompanyId({
      supabase,
      companyId: companyId!,
    });

    return defer({
      status: "success",
      message: "Company found",
      error: null,
      companyDetailsPromise,
      companyConfigPromise,
    });
  } catch (error) {
    return defer({
      status: "error",
      message: "Failed to get company",
      error,
      companyDetailsPromise: null,
      companyConfigPromise: null,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.general, args);
}

clientLoader.hydrate = true;

export default function SettingGeneral() {
  const { companyDetailsPromise, companyConfigPromise, error } =
    useLoaderData<typeof loader>();

  const [resetKey, setResetKey] = useState(Date.now());

  useEffect(() => {
    setResetKey(Date.now());
  }, [companyDetailsPromise]);

  if (error) {
    clearExactCacheEntry(cacheKeyPrefix.general);
    return (
      <ErrorBoundary error={error} message="Failed to load company details" />
    );
  }

  return (
    <section key={resetKey}>
      <div className="flex flex-col gap-6 w-full lg:w-2/3 py-4">
        <Suspense fallback={<LoadingSpinner className="my-20" />}>
          <Await resolve={companyDetailsPromise}>
            {(resolvedData) => {
              if (!resolvedData) {
                clearExactCacheEntry(cacheKeyPrefix.general);
                return (
                  <ErrorBoundary message="Failed to load company details" />
                );
              }
              return (
                <Await resolve={companyConfigPromise}>
                  {(resolvedConfig) => (
                    <CompanyDetailsWrapper
                      data={resolvedData.data}
                      error={resolvedData.error}
                      configData={resolvedConfig?.data ?? null}
                    />
                  )}
                </Await>
              );
            }}
          </Await>
        </Suspense>
      </div>
    </section>
  );
}
