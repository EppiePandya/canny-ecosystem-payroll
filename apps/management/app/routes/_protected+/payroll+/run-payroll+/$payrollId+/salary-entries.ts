import { cacheKeyPrefix } from "@/constant";
import { clientCaching } from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getSalaryEntriesByPayrollId } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import type { ClientLoaderFunctionArgs } from "@remix-run/react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);

  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = (page - 1) * limit;

  const searchQuery = url.searchParams.get("search") ?? undefined;
  const siteIds = url.searchParams.get("siteIds")?.split(",").filter(Boolean);
  const departmentIds = url.searchParams
    .get("departmentIds")
    ?.split(",")
    .filter(Boolean);
  const projectIds = url.searchParams
    .get("projectIds")
    ?.split(",")
    .filter(Boolean);
  const esicIds = url.searchParams.get("esicIds")?.split(",").filter(Boolean);
  const sortField = url.searchParams.get("sortField") ?? undefined;
  const sortOrder =
    (url.searchParams.get("sortOrder") as "asc" | "desc") ?? "asc";

  const month = Number(url.searchParams.get("month"));
  const year = Number(url.searchParams.get("year"));

  const result = await getSalaryEntriesByPayrollId({
    supabase,
    payrollId: params.payrollId!,
    month,
    year,
    companyId,
    offset,
    limit,
    searchQuery,
    siteIds,
    departmentIds,
    projectIds,
    esicIds,
    sortField,
    sortOrder,
  });

  return json(result);
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  const url = new URL(args.request.url);
  return clientCaching(
    `${cacheKeyPrefix.run_payroll_client_id}${args.params.payrollId
    }${url.searchParams.toString()}`,
    args,
  );
}

clientLoader.hydrate = true;
