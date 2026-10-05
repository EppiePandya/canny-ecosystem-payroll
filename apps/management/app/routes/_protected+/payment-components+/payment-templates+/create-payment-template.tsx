import {
  isGoodStatus,
  createRole,
  hasPermission,
} from "@canny_ecosystem/utils";
import { PaymentTemplateUnifiedSchema } from "@canny_ecosystem/utils";
import { parseWithZod } from "@conform-to/zod";
import { json } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getPaymentFieldsByCompanyId,
  getEmployeeProvidentFundByCompanyId,
  getEmployeeStateInsuranceByCompanyId,
  getProfessionalTaxesByCompanyId,
  getStatutoryBonusByCompanyId,
  getLabourWelfareFundsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { upsertUnifiedPaymentTemplate } from "@canny_ecosystem/supabase/mutations";
import { PaymentTemplateForm } from "@/components/payment-template/payment-template-form";
import { useLoaderData } from "@remix-run/react";
import { ErrorBoundary } from "@/components/error-boundary";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(user?.role!, `${createRole}:${attribute.paymentComponent}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const [
    { data: paymentFieldsData, error },
    { data: pfData },
    { data: esicData },
    { data: ptData },
    { data: bonusData },
    { data: lwfData },
  ] = await Promise.all([
    getPaymentFieldsByCompanyId({
      supabase,
      companyId,
    }),
    getEmployeeProvidentFundByCompanyId({
      supabase,
      companyId,
    }),
    getEmployeeStateInsuranceByCompanyId({
      supabase,
      companyId,
    }),
    getProfessionalTaxesByCompanyId({
      supabase,
      companyId,
    }),
    getStatutoryBonusByCompanyId({
      supabase,
      companyId,
    }),
    getLabourWelfareFundsByCompanyId({
      supabase,
      companyId,
    }),
  ]);

  if (error) {
    throw new Response("Failed to load payment fields", { status: 500 });
  }

  const paymentFieldsOptions =
    paymentFieldsData?.map((field) => ({
      label: field.name,
      value: field.id!,
    })) || [];

  const pfOptions =
    pfData?.map((pf) => ({
      label: pf.epf_number,
      value: pf.id!,
    })) || [];

  const esicOptions =
    esicData?.map((esi) => ({
      label: esi.esi_number,
      value: esi.id!,
    })) || [];

  const ptOptions =
    ptData?.map((pt) => ({
      label: pt.state,
      value: pt.id!,
    })) || [];

  const bonusOptions =
    bonusData
      ?.filter((bonus) => bonus.payment_frequency === "monthly")
      .map((bonus) => ({
        label: bonus.name,
        value: bonus.id!,
      })) || [];

  const lwfOptions =
    lwfData?.map((lwf) => ({
      label: lwf.state,
      value: lwf.id!,
    })) || [];

  return json({
    companyId,
    paymentFieldsOptions,
    paymentFieldsData: paymentFieldsData || [],
    pfOptions,
    esicOptions,
    ptOptions,
    bonusOptions,
    lwfOptions,
  });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: PaymentTemplateUnifiedSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const { template, values, components, statutory } = submission.value;

    const { status, error } = await upsertUnifiedPaymentTemplate({
      supabase,
      templateData: { ...template, company_id: companyId } as any,
      templateVersionsData: values,
      templateComponentsData: components,
      statutoryComponentsData: statutory,
    });

    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Payment Template created successfully",
        error: null,
      });
    }

    return json(
      {
        status: "error",
        message: "Payment Template creation failed",
        error,
      },
      { status: 500 },
    );
  } catch (error: any) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error: error?.message || error,
      },
      { status: 500 },
    );
  }
}

export default function CreatePaymentTemplate() {
  const {
    paymentFieldsOptions,
    paymentFieldsData,
    pfOptions,
    esicOptions,
    ptOptions,
    bonusOptions,
    lwfOptions,
  } = useLoaderData<typeof loader>();

  return (
    <PaymentTemplateForm
      paymentFieldsOptions={paymentFieldsOptions as any}
      paymentFieldsData={paymentFieldsData as any}
      pfOptions={pfOptions}
      esicOptions={esicOptions}
      ptOptions={ptOptions}
      bonusOptions={bonusOptions}
      lwfOptions={lwfOptions}
    />
  );
}

export function ErrorBoundaryComponent() {
  return (
    <ErrorBoundary message="An error occurred while loading the create template page." />
  );
}
