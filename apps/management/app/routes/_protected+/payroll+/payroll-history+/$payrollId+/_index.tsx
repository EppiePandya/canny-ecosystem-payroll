import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";

import { SalaryEntryComponent } from "@/components/payroll/salary-entry/salary-entry-component";
import { cacheKeyPrefix } from "@/constant";
import {
  clearCacheEntry,
  clearExactCacheEntry,
  clientCaching,
} from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { updatePayroll } from "@canny_ecosystem/supabase/mutations";
import {
  getLocationsByCompanyId,
  getPayrollById,
  getProjectNamesByCompanyId,
  getSalaryEntriesByPayrollId,
  getSiteNamesByCompanyId,
  getDepartmentsByCompanyId,
  getCompanyById,
  getPrimaryLocationByCompanyId,
  getCompanyEsicDetailsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type {
  PayrollDatabaseRow,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  defaultMonth,
  defaultYear,
  isGoodStatus,
} from "@canny_ecosystem/utils";

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  json,
  useActionData,
  useLoaderData,
  useParams,
  useSearchParams,
  useRevalidator,
} from "@remix-run/react";
import { Suspense, useEffect } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const payrollId = params.payrollId;
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  try {
    const { data: allSiteData, error: siteError } =
      await getSiteNamesByCompanyId({
        supabase,
        companyId,
      });
    if (siteError) throw siteError;

    const { data: allProjectData, error: projectError } =
      await getProjectNamesByCompanyId({
        supabase,
        companyId,
      });
    if (projectError) throw projectError;

    const allProjectOptions = (allProjectData || []).map((projectData) => ({
      label: String(projectData.name ?? "").toLowerCase(),
      value: String(projectData.id ?? ""),
    })) as { label: string; value: string }[];

    const allSiteOptions = (allSiteData || []).map((siteData) => ({
      label: String(siteData.name ?? "").toLowerCase(),
      value: String(siteData.id ?? ""),
      pseudoLabel: siteData?.projects?.name,
    })) as { label: string; value: string; pseudoLabel?: string }[];

    const { data: allLocationData, error: locationError } =
      await getLocationsByCompanyId({
        supabase,
        companyId,
      });
    if (locationError) throw locationError;

    const allLocationOptions = (allLocationData || []).map((locationData) => ({
      label: String(locationData.name ?? "").toLowerCase(),
      value: String(locationData.id ?? ""),
    })) as { label: string; value: string }[];

    const { data: allDepartmentData, error: departmentError } =
      await getDepartmentsByCompanyId({
        supabase,
        companyId,
      });
    if (departmentError) throw departmentError;

    const allDepartmentOptions = (allDepartmentData || []).map((deptData) => ({
      label: String(deptData.name ?? "").toLowerCase(),
      value: String(deptData.id ?? ""),
    })) as { label: string; value: string }[];

    const { data: allEsicData, error: esicError } =
      await getCompanyEsicDetailsByCompanyId({
        supabase,
        companyId,
      });
    if (esicError) throw esicError;

    const allEsicOptions = (allEsicData || []).map((esicData) => ({
      label: String(esicData.esic_site_name ?? "").toLowerCase(),
      pseudoLabel: esicData.esic_id_number,
      value: String(esicData.id ?? ""),
    })) as { label: string; value: string; pseudoLabel?: string }[];

    const { data: payrollData, error } = await getPayrollById({
      supabase,
      payrollId: payrollId ?? "",
    });
    if (error || !payrollData) {
      clearExactCacheEntry(`${cacheKeyPrefix.payroll_history_id}${payrollId}`);
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const offset = (page - 1) * limit;

    const siteIdsParam = url.searchParams.get("siteIds");
    const siteIds = siteIdsParam
      ? siteIdsParam.split(",").filter(Boolean)
      : undefined;

    const departmentIdsParam = url.searchParams.get("departmentIds");
    const departmentIds = departmentIdsParam
      ? departmentIdsParam.split(",").filter(Boolean)
      : undefined;

    const projectIdsParam = url.searchParams.get("projectIds");
    const projectIds = projectIdsParam
      ? projectIdsParam.split(",").filter(Boolean)
      : undefined;

    const esicIdsParam = url.searchParams.get("esicIds");
    const esicIds = esicIdsParam
      ? esicIdsParam.split(",").filter(Boolean)
      : undefined;

    const searchQuery = url.searchParams.get("search") || undefined;
    const sortField = url.searchParams.get("sortField") || undefined;
    const sortOrder =
      (url.searchParams.get("sortOrder") as "asc" | "desc") || "asc";

    const salaryEntriesPromise = getSalaryEntriesByPayrollId({
      supabase,
      payrollId: payrollId ?? "",
      month: payrollData?.month ?? defaultMonth,
      year: payrollData?.year ?? defaultYear,
      companyId,
      offset,
      limit,
      siteIds,
      departmentIds,
      projectIds,
      esicIds,
      searchQuery,
      sortField,
      sortOrder,
    });

    const { data: holidayConfig } = await supabase
      .from("holiday_config")
      .select("type, multiplier, working_days, use_attendance_working_days")
      .eq("company_id", companyId);

    const { data: companyData } = await getCompanyById({
      supabase,
      id: companyId,
    });

    const { data: companyLocation } = await getPrimaryLocationByCompanyId({
      supabase,
      companyId,
    });

    return defer({
      payrollData,
      companyData,
      companyLocation:
        companyLocation ||
        (allLocationData && allLocationData.length > 0
          ? allLocationData[0]
          : null),
      salaryEntriesPromise,
      allSiteOptions,
      allLocationOptions,
      allProjectOptions,
      allDepartmentOptions,
      allEsicOptions,
      holidayConfig: (holidayConfig as any) || [],
      error: null,
      env,
    });
  } catch (error) {
    console.error("Payroll Id Index Error", error);
    return defer({
      payrollData: null,
      companyData: null,
      companyLocation: null,
      salaryEntriesPromise: Promise.resolve({ data: null, error: null }),
      allSiteOptions: [],
      allLocationOptions: [],
      allProjectOptions: [],
      allDepartmentOptions: [],
      allEsicOptions: [],
      holidayConfig: [],
      error,
      env: null,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return args.serverLoader();
}

clientLoader.hydrate = true;

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = params.payrollId;
    const parsedData = JSON.parse(formData.get("data") as string);

    const data = {
      id: (parsedData.id ?? payrollId) as PayrollDatabaseRow["id"],
      status: parsedData.status as PayrollDatabaseRow["status"],
      run_date: new Date().toISOString() as PayrollDatabaseRow["run_date"],
      total_employees:
        parsedData.total_employees as PayrollDatabaseRow["total_employees"],
      total_net_amount:
        parsedData.total_net_amount as PayrollDatabaseRow["total_net_amount"],
    };

    const { status, error } = await updatePayroll({ supabase, data });
    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Payroll updated successfully",
        error: null,
      });
    }
    return json(
      { status: "error", message: "Payroll update failed", error },
      { status: 500 },
    );
  } catch (error) {
    console.error("Payroll Id Action error", error);
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
        data: null,
      },
      { status: 500 },
    );
  }
}

export default function HistoryPayrollId() {
  const {
    payrollData,
    companyData,
    companyLocation,
    salaryEntriesPromise,
    env,
    allSiteOptions,
    allLocationOptions,
    allProjectOptions,
    allDepartmentOptions,
    allEsicOptions,
    holidayConfig,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const revalidator = useRevalidator();
  const { payrollId } = useParams();
  const [searchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 100);
  const { toast } = useToast();

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearExactCacheEntry(cacheKeyPrefix.run_payroll);
        clearExactCacheEntry(
          `${cacheKeyPrefix.payroll_history_id}${payrollId}`,
        );
        clearExactCacheEntry(cacheKeyPrefix.payroll_history);
        toast({
          title: "Success",
          description: actionData?.message || "Payroll updated",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description:
            (actionData?.error as any)?.message ||
            actionData?.message ||
            "Payroll update failed",
          variant: "destructive",
        });
      }
      revalidator.revalidate();
    }
  }, [actionData]);

  if (!payrollData) {
    clearCacheEntry(`${cacheKeyPrefix.payroll_history_id}${payrollId}`);
    return (
      <ErrorBoundary
        error={null}
        message="Failed to load Payroll Data in Payroll History Id"
      />
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner className="my-20" />}>
      <Await resolve={salaryEntriesPromise}>
        {(resolved) => {
          const { data, error } = resolved;
          if (error || !data) {
            clearExactCacheEntry(
              `${cacheKeyPrefix.payroll_history_id}${payrollId}`,
            );
            return (
              <ErrorBoundary
                error={error}
                message="Failed to load Salary Entries in Payroll Histrory"
              />
            );
          }

          return (
            <SalaryEntryComponent
              payrollData={payrollData as any}
              companyData={companyData}
              companyLocation={companyLocation}
              data={data as any}
              noButtons={true}
              env={env as SupabaseEnv}
              fromWhere="payrollhistory"
              allLocationOptions={(allLocationOptions ?? []) as any}
              allSiteOptions={(allSiteOptions ?? []) as any}
              allProjectOptions={(allProjectOptions ?? []) as any}
              allDepartmentOptions={(allDepartmentOptions ?? []) as any}
              allEsicOptions={(allEsicOptions ?? []) as any}
              holidayConfig={holidayConfig}
              totalCount={(resolved as any).count ?? 0}
              page={page}
              limit={limit}
              isLoading={revalidator.state !== "idle"}
            />
          );
        }}
      </Await>
    </Suspense>
  );
}
