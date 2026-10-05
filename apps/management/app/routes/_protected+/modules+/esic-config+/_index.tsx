import { ErrorBoundary } from "@/components/error-boundary";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  Link,
  useLoaderData,
} from "@remix-run/react";
import { Suspense, useEffect, useState } from "react";
import { searchInObject } from "@canny_ecosystem/utils";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { getCompanyEsicDetailsByCompanyId } from "@canny_ecosystem/supabase/queries";
import { EsicConfigDataTable } from "@/components/sites/esic-config/table/data-table";
import { columns } from "@/components/sites/esic-config/table/columns";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!user) return safeRedirect(DEFAULT_ROUTE, { headers });

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  try {
    const esicPromise = getCompanyEsicDetailsByCompanyId({
      supabase,
      companyId,
    });

    return defer({
      esicPromise: esicPromise as any,
    });
  } catch (error) {
    console.error("ESIC Config Error in loader function:", error);
    return defer({
      esicPromise: Promise.resolve({ data: [] }),
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.esic_config, args);
}

clientLoader.hydrate = true;

export default function EsicConfig() {
  const { esicPromise } = useLoaderData<typeof loader>();

  return (
    <>
      <Suspense fallback={<LoadingSpinner className="h-1/3" />}>
        <Await resolve={esicPromise}>
          {({ data, error }) => {
            if (error) {
              clearExactCacheEntry(cacheKeyPrefix.esic_config);
              return (
                <ErrorBoundary
                  error={error}
                  message="Failed to load ESIC Config"
                />
              );
            }

            const [tableData, setTableData] = useState(data || []);
            const [searchString, setSearchString] = useState("");

            useEffect(() => {
              interface EsicItem {
                [key: string]: any;
              }
              const filteredData: EsicItem[] = (data || []).filter(
                (item: EsicItem) => searchInObject(item, searchString),
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
                        placeholder="Search ESIC Config"
                        value={searchString}
                        onChange={(e) => setSearchString(e.target.value)}
                        className="pl-8 h-10 w-full focus-visible:ring-0 shadow-none"
                      />
                    </div>

                    <Link
                      to={"create-esic-config"}
                      className={cn(
                        buttonVariants({ variant: "primary-outline" }),
                        "flex items-center gap-1",
                      )}
                    >
                      <span>Add</span>
                      <span className="hidden md:flex justify-end">
                        ESIC Config
                      </span>
                    </Link>
                  </div>
                </div>
                <EsicConfigDataTable data={tableData} columns={columns} />
              </section>
            );
          }}
        </Await>
      </Suspense>
    </>
  );
}
