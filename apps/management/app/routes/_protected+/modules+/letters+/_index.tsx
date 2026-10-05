import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { useUser } from "@/utils/user";
import type { LetterDataType } from "@canny_ecosystem/supabase/queries";
import { getLettersByCompanyId } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { defer, json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  Link,
  Outlet,
  useLoaderData,
} from "@remix-run/react";
import { Suspense, useState } from "react";
import { LetterTableWrapper } from "@/components/letter/letter-table-wrapper";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const company = await getCompanyIdOrFirstCompany(request, supabase);

  try {
    const lettersPromise: Promise<{
      data: LetterDataType[] | null;
      error: any;
    }> = getLettersByCompanyId({
      supabase,
      companyId: company.companyId,
    });

    return defer<{
      lettersPromise: typeof lettersPromise;
      error: null;
    }>({
      lettersPromise,
      error: null,
    });
  } catch (error) {
    return json(
      {
        lettersPromise: null,
        error,
      },
      { status: 500 },
    );
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(`${cacheKeyPrefix.letters}`, args);
}

clientLoader.hydrate = true;

export default function LettersPage() {
  const { role } = useUser();
  const { lettersPromise, error } = useLoaderData<typeof loader>();
  const [searchString, setSearchString] = useState("");

  if (error) {
    clearExactCacheEntry(`${cacheKeyPrefix.letters}`);
    return (
      <ErrorBoundary error={error} message="Failed to load sites fields" />
    );
  }

  return (
    <section className="py-4 px-4">
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
              placeholder="Search Letters"
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              className="pl-8 h-10 w-full focus-visible:ring-0 shadow-none"
            />
          </div>
          <Link
            to={"/modules/letters/create-letter"}
            className={cn(
              buttonVariants({ variant: "primary-outline" }),
              "flex items-center gap-1",
              !hasPermission(
                role,
                `${createRole}:${attribute.letters}`,
              ) && "hidden",
            )}
          >
            <span>Add</span>
            <span className="hidden md:flex justify-end">Letter</span>
          </Link>
        </div>
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <Await resolve={lettersPromise}>
          {(resolvedData: Awaited<typeof lettersPromise>) => {
            if (!resolvedData) {
              clearExactCacheEntry(`${cacheKeyPrefix.letters}`);
              return <ErrorBoundary message="Failed to load letters" />;
            }
            return (
              <LetterTableWrapper
                data={resolvedData?.data as LetterDataType[] | null}
                error={resolvedData?.error}
                searchString={searchString}
              />
            );
          }}
        </Await>
      </Suspense>
      <Outlet />
    </section>
  );
}
