import { SalariesSearchFilter } from "@/components/salaries/salaries-search-filter";
import { FilterList } from "@/components/salaries/filter-list";
import { columns } from "@/components/salaries/table/columns";
import { DataTable } from "@/components/salaries/table/data-table";
import { useSalariesStore } from "@/store/salaries";
import { DeleteSalaryAssignments } from "@/components/salaries/delete-salary-assignments";
import { SalariesMenu } from "@/components/salaries/salaries-menu";
import { ImportEmployeeIncrementModal } from "@/components/employees/import-export/import-modal-increment";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { LAZY_LOADING_LIMIT } from "@canny_ecosystem/supabase/constant";
import { getActiveSalaryAssignments } from "@canny_ecosystem/supabase/queries";
import {
  getProjectNamesByCompanyId,
  getSiteNamesByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Await, defer, useLoaderData } from "@remix-run/react";
import { Suspense, useMemo } from "react";

const pageSize = LAZY_LOADING_LIMIT;

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  try {
    const url = new URL(request.url);
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const searchParams = url.searchParams;
    const sortParam = searchParams.get("sort");
    const query = searchParams.get("name") ?? null;

    const filters = {
      status: searchParams.get("status") ?? null,
      project: searchParams.get("project") ?? null,
      site: searchParams.get("site") ?? null,
      assignment_type: searchParams.get("assignment_type") ?? null,
      position: searchParams.get("position") ?? null,
      skill_level: searchParams.get("skill_level") ?? null,
    };

    const salariesPromise = getActiveSalaryAssignments({
      supabase: supabase as any,
      companyId,
      params: {
        from: 0,
        to: pageSize - 1,
        filters,
        searchQuery: query ?? undefined,
        sort: sortParam?.split(":") as [string, "asc" | "desc"],
      },
    });

    const projectPromise = getProjectNamesByCompanyId({
      supabase: supabase as any,
      companyId,
    });

    const sitePromise = getSiteNamesByCompanyId({
      supabase: supabase as any,
      companyId,
    });

    return defer({
      salariesPromise,
      projectPromise,
      sitePromise,
      query,
      filters,
      companyId,
      env,
    });
  } catch (error) {
    console.error("Salaries Error in loader:", error);
    return defer({
      salariesPromise: Promise.resolve({ data: [], meta: { count: 0 } }),
      projectPromise: Promise.resolve({ data: [] }),
      sitePromise: Promise.resolve({ data: [] }),
      query: "",
      filters: null,
      companyId: "",
      env,
    });
  }
}

export default function SalariesIndex() {
  const { selectedRows, rowSelection, setRowSelection } = useSalariesStore();
  const selectedCount = Object.keys(rowSelection).length;
  const selectedIds = selectedRows
    .map((row) => row.employee_salary_assignment?.[0]?.id)
    .filter(Boolean) as string[];
  const {
    salariesPromise,
    projectPromise,
    sitePromise,
    query,
    filters,
    companyId,
    env,
  } = useLoaderData<typeof loader>();
  const filterList = { ...filters, name: query };

  return (
    <section className="py-4 h-full overflow-hidden flex flex-col">
      <div className="w-full flex flex-row items-center justify-between pb-4 shrink-0 px-4">
        <div className="flex w-full lg:w-4/5 flex-col md:flex-row items-start md:items-center gap-2 mr-4">
          <Suspense fallback={<LoadingSpinner />}>
            <Await resolve={projectPromise}>
              {(projectData: any) => (
                <Await resolve={sitePromise}>
                  {(siteData: any) => (
                    <>
                      <SalariesSearchFilter
                        projectArray={
                          projectData?.data?.length
                            ? projectData?.data?.map((p: any) => p.name)
                            : []
                        }
                        siteArray={
                          siteData?.data?.length
                            ? siteData?.data?.map((s: any) => s.name)
                            : []
                        }
                      />
                      <FilterList filterList={filterList} />
                    </>
                  )}
                </Await>
              )}
            </Await>
          </Suspense>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <DeleteSalaryAssignments
              assignmentIds={selectedIds}
              isBulk
              onSuccess={() => setRowSelection({})}
            />
          )}
          <SalariesMenu />
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4">
        <Suspense fallback={<LoadingSpinner className="h-1/3" />}>
          <Await resolve={salariesPromise}>
            {({ data, meta, error }: any) => {
              if (error) return <div>Failed to load salaries</div>;

              const hasNextPage = Boolean(meta?.count > data?.length);
              const tableColumns = useMemo(() => columns(), []);

              return (
                <>
                  <DataTable
                    data={data ?? []}
                    columns={tableColumns}
                    count={meta?.count ?? 0}
                    query={query}
                    filters={filters}
                    hasNextPage={hasNextPage}
                    pageSize={pageSize}
                    companyId={companyId}
                    env={env}
                  />
                  <ImportEmployeeIncrementModal />
                </>
              );
            }}
          </Await>
        </Suspense>
      </div>
    </section>
  );
}
