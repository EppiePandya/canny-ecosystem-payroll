import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getPaymentTemplatesWithDetailsByCompanyId } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  Link,
  useLoaderData,
} from "@remix-run/react";
import { Input } from "@canny_ecosystem/ui/input";
import { Suspense, useState } from "react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { ErrorBoundary } from "@/components/error-boundary";
import { PaymentTemplateTableWrapper } from "@/components/payment-template/payment-template-table-wrapper";
import { hasPermission, createRole } from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { LoadingSpinner } from "@/components/loading-spinner";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  try {
    const { companyId } = await getCompanyIdOrFirstCompany(
      request,
      supabase as any,
    );
    const paymentTemplatesPromise = getPaymentTemplatesWithDetailsByCompanyId({
      supabase: supabase as any,
      companyId,
    }).then(async (templates) => {
      if (!templates.data) return templates;

      const templatesWithDetails = await Promise.all(
        templates.data.map(async (template: any) => {
          const latestVersion = template.payment_template_versions?.[0];
          const statutoryData =
            latestVersion?.payment_statutory_components || null;
          const { count } = await (supabase as any)
            .from("employee_salary_assignment")
            .select("*", { count: "exact", head: true })
            .eq("template_id", template.id)
            .eq("use_payment_template", true);

          return {
            ...template,
            statutory: statutoryData,
            linked_employees_count: count || 0,
          };
        }),
      );
      return {
        ...templates,
        data: templatesWithDetails,
      };
    });

    return defer({
      paymentTemplatesPromise,
      error: null,
      env,
    });
  } catch (error) {
    return defer({
      paymentTemplatesPromise: Promise.resolve({
        data: null,
        error: null,
      } as any),
      error,
      env,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.payment_templates, args);
}

clientLoader.hydrate = true;

export default function PaymentTemplatesIndex() {
  const { role } = useUser();
  const { paymentTemplatesPromise, error, env } =
    useLoaderData<typeof loader>();

  const [searchString, setSearchString] = useState("");

  if (error) {
    clearExactCacheEntry(cacheKeyPrefix.payment_templates);
    return (
      <ErrorBoundary error={error} message="Failed to load payment templates" />
    );
  }

  return (
    <>
      <section className="p-4">
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
                placeholder="Search Templates"
                value={searchString}
                onChange={(e) => setSearchString(e.target.value)}
                className="pl-8 h-10 w-full focus-visible:ring-0 shadow-none"
              />
            </div>
            <Link
              to="create-payment-template"
              className={cn(
                buttonVariants({ variant: "primary-outline" }),
                "flex items-center gap-1",
                !hasPermission(
                  role,
                  `${createRole}:${attribute.paymentComponent}`,
                ) && "hidden",
              )}
            >
              <span>Add</span>
              <span className="hidden md:flex justify-end">Template</span>
            </Link>
          </div>
        </div>
        <Suspense fallback={<LoadingSpinner className="mt-20" />}>
          <Await resolve={paymentTemplatesPromise}>
            {(resolvedData) => {
              if (!resolvedData?.data) {
                clearExactCacheEntry(cacheKeyPrefix.payment_templates);
                return <ErrorBoundary message="Failed to load templates" />;
              }
              return (
                <PaymentTemplateTableWrapper
                  data={resolvedData?.data}
                  error={resolvedData?.error}
                  searchString={searchString}
                  env={env}
                />
              );
            }}
          </Await>
        </Suspense>
      </section>
    </>
  );
}
