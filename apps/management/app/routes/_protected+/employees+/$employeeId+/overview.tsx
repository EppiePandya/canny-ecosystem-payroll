import {
  type EmployeeAddress,
  EmployeeAddressesCard,
} from "@/components/employees/employee/addresses-card";
import { EmployeeBankDetailsCard } from "@/components/employees/employee/bank-details-card";
import { EmployeeDetailsCard } from "@/components/employees/employee/details-card";
import {
  type EmployeeGuardian,
  EmployeeGuardiansCard,
} from "@/components/employees/employee/guardians-card";
import { EmployeePageHeader } from "@/components/employees/employee/page-header";
import { EmployeeStatutoryCard } from "@/components/employees/employee/statutory-card";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import {
  getEmployeeAddressesByEmployeeId,
  getEmployeeBankDetailsById,
  getEmployeeById,
  getEmployeeGuardiansByEmployeeId,
  getEmployeeStatutoryDetailsById,
  getEmployeeWorkDetailsByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import { getEmployeeProfileCompleteness } from "@canny_ecosystem/utils";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { defer, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import { type ReactNode, Suspense, useEffect } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });

  const employeeId = params.employeeId ?? "";

  try {
    const employeePromise = getEmployeeById({
      supabase,
      id: employeeId ?? "",
    });

    const employeeStatutoryDetailsPromise = getEmployeeStatutoryDetailsById({
      supabase,
      id: employeeId ?? "",
    });

    const employeeBankDetailsPromise = getEmployeeBankDetailsById({
      supabase,
      id: employeeId ?? "",
    });

    const employeeAddressesPromise = getEmployeeAddressesByEmployeeId({
      supabase,
      employeeId: employeeId ?? "",
    });

    const employeeGuardiansPromise = getEmployeeGuardiansByEmployeeId({
      supabase,
      employeeId: employeeId ?? "",
    });

    const employeeWorkDetailsPromise = getEmployeeWorkDetailsByEmployeeId({
      supabase,
      employeeId: employeeId ?? "",
    });

    const env = {
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    };

    const headerInfoPromise = Promise.all([
      employeePromise,
      employeeStatutoryDetailsPromise,
      employeeBankDetailsPromise,
      employeeWorkDetailsPromise,
      employeeAddressesPromise,
      employeeGuardiansPromise,
    ]);

    return defer({
      headerInfoPromise,
      employeeStatutoryDetailsPromise,
      employeeBankDetailsPromise,
      employeeAddressesPromise,
      employeeGuardiansPromise,
      env,
      error: null,
    });
  } catch (error) {
    return defer({
      error,
      env: null,
      headerInfoPromise: null,
      employeeStatutoryDetailsPromise: null,
      employeeBankDetailsPromise: null,
      employeeAddressesPromise: null,
      employeeGuardiansPromise: null,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(
    `${cacheKeyPrefix.employee_overview}${args.params.employeeId}`,
    args,
  );
}

clientLoader.hydrate = true;

export default function EmployeeIndex() {
  const {
    error,
    env,
    headerInfoPromise,
    employeeStatutoryDetailsPromise,
    employeeBankDetailsPromise,
    employeeAddressesPromise,
    employeeGuardiansPromise,
  } = useLoaderData<typeof loader>();
  const { employeeId } = useParams();

  if (error) {
    clearExactCacheEntry(`${cacheKeyPrefix.employee_overview}${employeeId}`);
    return (
      <ErrorBoundary error={error} message="Failed to load employee details" />
    );
  }

  return (
    <div className="w-full py-6 flex flex-col gap-8">
      <Suspense fallback={<LoadingSpinner />}>
        <Await resolve={headerInfoPromise}>
          {(resolvedData) => {
            if (!resolvedData || !env) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_overview}${employeeId}`,
              );
              return <ErrorBoundary message="Failed to load employee" />;
            }
            const [
              resolvedEmployee,
              resolvedStatutory,
              resolvedBank,
              resolvedWork,
              resolvedAddresses,
              resolvedGuardians,
            ] = resolvedData;

            if (!resolvedEmployee) {
              return <ErrorBoundary message="Failed to load employee" />;
            }

            const statutory = resolvedStatutory?.data;
            const bank = resolvedBank?.data;
            const work = (resolvedWork?.data as any)?.[0];
            const addresses = resolvedAddresses?.data || [];
            const guardians = resolvedGuardians?.data || [];

            const { isIncomplete, missingFields } =
              getEmployeeProfileCompleteness({
                employee_statutory_details: statutory,
                employee_bank_details: bank,
                work_details: work,
                employee_addresses: addresses as any[],
                employee_guardians: guardians as any[],
                first_name: resolvedEmployee.data?.first_name,
                middle_name: resolvedEmployee.data?.middle_name,
                last_name: resolvedEmployee.data?.last_name,
                primary_mobile_number:
                  resolvedEmployee.data?.primary_mobile_number,
              });

            return (
              <>
                <CommonWrapper
                  error={resolvedEmployee.error}
                  Component={
                    <EmployeePageHeader
                      employee={resolvedEmployee.data as any}
                      env={env}
                      isIncomplete={isIncomplete}
                      missingFields={missingFields}
                    />
                  }
                />
                <CommonWrapper
                  error={resolvedEmployee.error}
                  Component={
                    <EmployeeDetailsCard employee={resolvedEmployee.data!} />
                  }
                />
              </>
            );
          }}
        </Await>
      </Suspense>

      <Suspense fallback={<LoadingSpinner />}>
        <Await resolve={employeeStatutoryDetailsPromise}>
          {(resolvedData) => {
            if (!resolvedData) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_overview}${employeeId}`,
              );
              return (
                <ErrorBoundary message="Failed to load employee statutory details" />
              );
            }
            return (
              <CommonWrapper
                error={resolvedData.error}
                Component={
                  <EmployeeStatutoryCard
                    employeeStatutory={resolvedData.data}
                  />
                }
              />
            );
          }}
        </Await>
      </Suspense>

      <Suspense fallback={<LoadingSpinner />}>
        <Await resolve={employeeBankDetailsPromise}>
          {(resolvedData) => {
            if (!resolvedData) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_overview}${employeeId}`,
              );
              return (
                <ErrorBoundary message="Failed to load employee bank details" />
              );
            }
            return (
              <CommonWrapper
                error={resolvedData.error}
                Component={
                  <EmployeeBankDetailsCard bankDetails={resolvedData.data} />
                }
              />
            );
          }}
        </Await>
      </Suspense>

      <Suspense fallback={<LoadingSpinner />}>
        <Await resolve={employeeAddressesPromise}>
          {(resolvedData) => {
            if (!resolvedData) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_overview}${employeeId}`,
              );
              return (
                <ErrorBoundary message="Failed to load employee addresses" />
              );
            }
            return (
              <CommonWrapper
                error={resolvedData.error}
                Component={
                  <EmployeeAddressesCard
                    employeeAddresses={resolvedData.data as EmployeeAddress[]}
                  />
                }
              />
            );
          }}
        </Await>
      </Suspense>

      <Suspense fallback={<LoadingSpinner />}>
        <Await resolve={employeeGuardiansPromise}>
          {(resolvedData) => {
            if (!resolvedData) {
              clearExactCacheEntry(
                `${cacheKeyPrefix.employee_overview}${employeeId}`,
              );
              return (
                <ErrorBoundary message="Failed to load employee guardians details" />
              );
            }
            return (
              <CommonWrapper
                error={resolvedData.error}
                Component={
                  <EmployeeGuardiansCard
                    employeeGuardians={resolvedData.data as EmployeeGuardian[]}
                  />
                }
              />
            );
          }}
        </Await>
      </Suspense>
    </div>
  );
}

export function CommonWrapper({
  Component,
  error,
}: {
  Component: ReactNode;
  error: any;
}) {
  const { toast } = useToast();
  const { employeeId } = useParams();

  useEffect(() => {
    if (error) {
      clearExactCacheEntry(`${cacheKeyPrefix.employee_overview}${employeeId}`);
      toast({
        title: "Error",
        description: error?.message || "Failed to load employee details",
        variant: "destructive",
      });
    }
  }, [error]);

  return Component;
}
