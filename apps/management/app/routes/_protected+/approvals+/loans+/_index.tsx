import { LoanSearchFilter } from "@/components/approvals/loans/loan-search-filter";
import { FilterList } from "@/components/approvals/loans/filter-list";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearCacheEntry, clientCaching } from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  LAZY_LOADING_LIMIT,
  MAX_QUERY_LIMIT,
} from "@canny_ecosystem/supabase/constant";
import {
  type EmployeeLoanFilters,
  getEmployeeLoansByCompanyId,
  getProjectNamesByCompanyId,
  getUsersEmail,
  getSiteNamesByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  Outlet,
  redirect,
  useLoaderData,
} from "@remix-run/react";
import { Suspense } from "react";
import { LoansTable } from "@/components/approvals/loans/table/loans-table";
import { columns } from "@/components/approvals/loans/table/columns";
import { hasPermission, readRole } from "@canny_ecosystem/utils";
import { safeRedirect } from "@/utils/server/http.server";
import { attribute } from "@canny_ecosystem/utils/constant";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { LoadingSpinner } from "@/components/loading-spinner";
import { LoanActions } from "@/components/approvals/loans/loan-actions";
import { generateLoanFilter } from "@/utils/ai/loan";

const pageSize = LAZY_LOADING_LIMIT;

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${readRole}:${attribute.approvals}`))
    return safeRedirect(DEFAULT_ROUTE, { headers });

  try {
    const url = new URL(request.url);
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const page = 0;

    const searchParams = new URLSearchParams(url.searchParams);
    const sortParam = searchParams.get("sort");
    const query = searchParams.get("name") ?? undefined;

    const filters: EmployeeLoanFilters = {
      loan_date_start: searchParams.get("loan_date_start") ?? undefined,
      loan_date_end: searchParams.get("loan_date_end") ?? undefined,
      is_paid: searchParams.get("is_paid") ?? undefined,
      name: query,
      project: searchParams.get("project") ?? undefined,
      site: searchParams.get("site") ?? undefined,
      in_reimbursement: searchParams.get("in_reimbursement") ?? undefined,
      start_month: searchParams.get("start_month") ?? undefined,
      start_year: searchParams.get("start_year") ?? undefined,
      end_month: searchParams.get("end_month") ?? undefined,
      end_year: searchParams.get("end_year") ?? undefined,
      year: searchParams.get("year") ?? undefined,
    };

    const hasFilters =
      filters &&
      Object.values(filters).some(
        (value) => value !== null && value !== undefined,
      );

    const loansPromise = getEmployeeLoansByCompanyId({
      supabase,
      companyId,
      params: {
        from: 0,
        to: hasFilters ? MAX_QUERY_LIMIT : page > 0 ? pageSize : pageSize - 1,
        filters,
        searchQuery: query ?? undefined,
        sort: sortParam?.split(":") as [string, "asc" | "desc"],
      },
    });

    const projectPromise = getProjectNamesByCompanyId({ supabase, companyId });

    const sitePromise = getSiteNamesByCompanyId({
      supabase,
      companyId,
    });

    return defer({
      loansPromise: loansPromise as any,
      projectPromise,
      sitePromise,
      query,
      filters,
      companyId,
      env,
    });
  } catch (error) {
    console.error("Loan Error in loader function:", error);

    return defer({
      loansPromise: Promise.resolve({ data: [] }),
      projectPromise: Promise.resolve({ data: [] }),
      sitePromise: Promise.resolve({ data: [] }),
      query: "",
      filters: null,
      companyId: "",
      env,
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const url = new URL(request.url);
    const formData = await request.formData();
    const prompt = formData.get("prompt") as string;

    const { object } = await generateLoanFilter({ input: prompt });

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(object)) {
      if (value !== null && value !== undefined && String(value)?.length) {
        searchParams.append(key, value.toString());
      }
    }

    url.search = searchParams.toString();

    return redirect(url.toString());
  } catch (error) {
    console.error("Loan Error in action function:", error);

    const fallbackUrl = new URL(request.url);
    fallbackUrl.search = "";
    return redirect(fallbackUrl.toString());
  }
}

export default function LoansIndex() {
  const {
    loansPromise,
    projectPromise,
    sitePromise,
    query,
    filters,
    companyId,
    env,
  } = useLoaderData<typeof loader>();

  const filterList = { ...filters, name: query };
  const noFilters = Object.values(filterList).every((value) => !value);

  return (
    <section className="p-4 overflow-hidden">
      <div className="w-full flex flex-row max-sm:flex-col max-sm:gap-y-3 items-center max-sm:items-start max-md:items-start justify-between pb-4 gap-2">
        <div className="flex w-[90%] max-sm:w-full flex-col md:flex-row items-start md:items-center gap-2">
          <Suspense fallback={<LoadingSpinner className="ml-14" />}>
            <Await resolve={projectPromise}>
              {(projectData) => (
                <Await resolve={sitePromise}>
                  {(siteData) => (
                    <LoanSearchFilter
                      projectArray={
                        projectData?.data?.length
                          ? projectData?.data?.map((project) => project!.name)
                          : []
                      }
                      siteArray={
                        siteData?.data?.length
                          ? siteData?.data?.map((site) => site!.name)
                          : []
                      }
                    />
                  )}
                </Await>
              )}
            </Await>
          </Suspense>
          <FilterList filters={filterList} />
        </div>
        <LoanActions isEmpty={!loansPromise} />
      </div>
      <Suspense fallback={<LoadingSpinner className="h-1/3" />}>
        <Await resolve={loansPromise}>
          {({ data, meta, error }) => {
            if (error) {
              return <div />;
            }

            const hasNextPage = Boolean(meta?.count > data?.length);

            return (
              <LoansTable
                data={data ?? []}
                columns={columns()}
                query={query}
                filters={filters}
                noFilters={noFilters}
                hasNextPage={hasNextPage}
                pageSize={pageSize}
                companyId={companyId}
                env={env}
              />
            );
          }}
        </Await>
      </Suspense>
      <Outlet />
    </section>
  );
}
