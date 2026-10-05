import { useState, useEffect } from "react";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCompanyById,
  getCompanyConfigByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Field, CheckboxField } from "@canny_ecosystem/ui/forms";
import { Button } from "@canny_ecosystem/ui/button";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { type LoaderFunctionArgs, json } from "@remix-run/node";
import {
  type ClientLoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
import { clientCaching, clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { ErrorBoundary } from "@/components/error-boundary";
import { hasPermission, updateRole } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useUser } from "@/utils/user";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    if (!companyId) {
      return json({
        company: null,
        companyConfig: null,
        contractor: null,
        contractorConfig: null,
        error: "No active company found",
      });
    }

    const { data: company } = await getCompanyById({ supabase, id: companyId });

    if (!company || company.company_type !== "sub_contractor") {
      return json({
        company,
        companyConfig: null,
        contractor: null,
        contractorConfig: null,
        error: "Company is not a subcontractor",
      });
    }

    const contractorId = company.contractor_id;
    if (!contractorId) {
      return json({
        company,
        companyConfig: null,
        contractor: null,
        contractorConfig: null,
        error: "No contractor company assigned to this subcontractor",
      });
    }

    const [contractorRes, contractorConfigRes, ownConfigRes] = await Promise.all([
      getCompanyById({ supabase, id: contractorId }),
      getCompanyConfigByCompanyId({ supabase, companyId: contractorId }),
      getCompanyConfigByCompanyId({ supabase, companyId }),
    ]);

    return json({
      company,
      companyConfig: ownConfigRes.data,
      contractor: contractorRes.data,
      contractorConfig: contractorConfigRes.data,
      error: null,
    });
  } catch (err: any) {
    return json({
      company: null,
      companyConfig: null,
      contractor: null,
      contractorConfig: null,
      error: err.message || "An unexpected error occurred",
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.settings, args);
}

clientLoader.hydrate = true;

export default function SubContractorConfig() {
  const { company, companyConfig, contractor, contractorConfig, error } =
    useLoaderData<typeof loader>();
  const { role } = useUser();
  const fetcher = useFetcher<any>();
  const { toast } = useToast();
  const [companySalaryPrefix, setCompanySalaryPrefix] = useState(
    companyConfig?.company_salary_prefix ?? "",
  );
  const [showEmployerContribution, setShowEmployerContribution] = useState(
    companyConfig?.show_employer_contribution ?? false,
  );

  useEffect(() => {
    setCompanySalaryPrefix(companyConfig?.company_salary_prefix ?? "");
    setShowEmployerContribution(
      companyConfig?.show_employer_contribution ?? false,
    );
  }, [companyConfig]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (
        fetcher.data.status === 200 ||
        fetcher.data.status === 201 ||
        fetcher.data.status === "success" ||
        !fetcher.data.error
      ) {
        toast({
          title: "Success",
          description: "Subcontractor configuration updated successfully",
        });
        clearExactCacheEntry(cacheKeyPrefix.settings);
        clearExactCacheEntry(cacheKeyPrefix.company_config);
        clearExactCacheEntry(cacheKeyPrefix.general);
      } else {
        toast({
          title: "Error",
          description:
            fetcher.data.error?.message || "Failed to update configuration",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, toast]);

  if (error) {
    clearExactCacheEntry(cacheKeyPrefix.settings);
    return (
      <div className="flex flex-col gap-6 w-full lg:w-2/3 py-4">
        <ErrorBoundary error={new Error(error)} message="Configuration Error" />
      </div>
    );
  }

  const canEdit = hasPermission(
    role,
    `${updateRole}:${attribute.settingGeneral}`,
  );

  return (
    <div className="flex flex-col gap-6 w-full lg:w-2/3 py-4 animate-in fade-in duration-300">
      <Card>
        <CardHeader className="max-sm:text-sm">
          <CardTitle>Main Contractor Details</CardTitle>
          <CardDescription className="max-sm:text-xs">
            View the parent contractor company details and automatic invoice
            prefix configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 items-center justify-center md:gap-x-8 gap-y-4">
            <Field
              labelProps={{ children: "Main Contractor Company" }}
              inputProps={{
                type: "text",
                value: contractor?.name
                  ? contractor.name.replaceAll("_", " ")
                  : "N/A",
                readOnly: true,
                className: "bg-muted cursor-not-allowed capitalize",
              }}
            />
            <Field
              labelProps={{ children: "Automatic Invoice Prefix" }}
              inputProps={{
                type: "text",
                value: contractorConfig?.invoice_prefix || "Not Configured",
                readOnly: true,
                className: "bg-muted cursor-not-allowed font-mono",
              }}
            />
          </div>
        </CardContent>
      </Card>

      {company?.id && (
        <fetcher.Form
          method="POST"
          action={`/${company.id}/update-company-config`}
        >
          <input type="hidden" name="company_id" value={company.id} />
          <input
            type="hidden"
            name="company_bonus_start_month"
            value={companyConfig?.company_bonus_start_month ?? ""}
          />
          <input
            type="hidden"
            name="company_bonus_end_month"
            value={companyConfig?.company_bonus_end_month ?? ""}
          />
          <input
            type="hidden"
            name="invoice_prefix"
            value={companyConfig?.invoice_prefix ?? ""}
          />

          <input
            type="hidden"
            name="show_employer_contribution"
            value={showEmployerContribution ? "true" : "false"}
          />

          <Card>
            <CardHeader className="max-sm:text-sm">
              <CardTitle>Sub Contractor Configuration</CardTitle>
              <CardDescription className="max-sm:text-xs">
                Configure salary slip display options for your subcontracted company.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6 space-y-6">
              <div className="space-y-2">
                <Field
                  labelProps={{ children: "Company Salary Prefix" }}
                  inputProps={{
                    name: "company_salary_prefix",
                    type: "text",
                    value: companySalaryPrefix,
                    onChange: (e) => setCompanySalaryPrefix(e.target.value),
                    placeholder: "e.g. Contracted at, Deputed at",
                    readOnly: !canEdit,
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Optional prefix words (e.g. &quot;Contracted at&quot;) to display before the company name on salary slips.
                </p>
              </div>

              <div className="pt-2 border-t space-y-2">
                <CheckboxField
                  labelProps={{
                    children: "Show Employer Contribution in Salary Slip",
                    className: "font-medium text-sm cursor-pointer",
                  }}
                  buttonProps={{
                    checked: showEmployerContribution,
                    onCheckedChange: (checked) =>
                      setShowEmployerContribution(!!checked),
                    disabled: !canEdit,
                  }}
                />
                <p className="text-xs text-muted-foreground pl-6">
                  Check this option if you want Employer Contribution details (like Employer PF, ESIC, etc.) to be visible on employee salary slips for this company.
                </p>
              </div>
            </CardContent>
            {canEdit && (
              <CardFooter className="border-t pt-4 flex justify-end">
                <Button
                  type="submit"
                  disabled={fetcher.state !== "idle"}
                >
                  {fetcher.state !== "idle" ? "Saving..." : "Save Configuration"}
                </Button>
              </CardFooter>
            )}
          </Card>
        </fetcher.Form>
      )}
    </div>
  );
}
