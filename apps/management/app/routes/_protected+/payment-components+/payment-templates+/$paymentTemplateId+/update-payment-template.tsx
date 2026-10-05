import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { json, useLoaderData } from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import {
  hasPermission,
  isGoodStatus,
  PaymentTemplateUnifiedSchema,
  updateRole,
} from "@canny_ecosystem/utils";
import {
  getUnifiedPaymentTemplateById,
  getPaymentFieldsByCompanyId,
  getEmployeeProvidentFundByCompanyId,
  getEmployeeStateInsuranceByCompanyId,
  getProfessionalTaxesByCompanyId,
  getStatutoryBonusByCompanyId,
  getLabourWelfareFundsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { upsertUnifiedPaymentTemplate } from "@canny_ecosystem/supabase/mutations";
import { ErrorBoundary } from "@/components/error-boundary";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { PaymentTemplateForm } from "@/components/payment-template/payment-template-form";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const paymentTemplateId = params.paymentTemplateId;
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(user?.role!, `${updateRole}:${attribute.paymentComponent}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  try {
    const [
      { data: templateData, error: templateError },
      { data: paymentFieldsData, error: fieldsError },
      { data: pfData },
      { data: esicData },
      { data: ptData },
      { data: bonusData },
      { data: lwfData },
    ] = await Promise.all([
      getUnifiedPaymentTemplateById({
        supabase,
        id: paymentTemplateId || "",
      }),
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

    if (templateError) throw templateError;
    if (fieldsError) throw fieldsError;

    const paymentFieldsOptions =
      paymentFieldsData?.map((field) => ({
        label: field.name,
        value: field.id!,
      })) || [];

    const pfOptions = (pfData || []).map((pf) => ({
      label: String(pf.epf_number ?? ""),
      value: String(pf.id ?? ""),
    })) as { label: string; value: string }[];

    const esicOptions = (esicData || []).map((esi) => ({
      label: String(esi.esi_number ?? ""),
      value: String(esi.id ?? ""),
    })) as { label: string; value: string }[];

    const ptOptions = (ptData || []).map((pt) => ({
      label: String(pt.state ?? ""),
      value: String(pt.id ?? ""),
    })) as { label: string; value: string }[];

    const bonusOptions = (bonusData || [])
      .filter((bonus) => bonus.payment_frequency === "monthly")
      .map((bonus) => ({
        label: String(bonus.name ?? ""),
        value: String(bonus.id ?? ""),
      })) as { label: string; value: string }[];

    const lwfOptions = (lwfData || []).map((lwf) => ({
      label: String(lwf.state ?? ""),
      value: String(lwf.id ?? ""),
    })) as { label: string; value: string }[];

    return json({
      data: templateData,
      paymentFieldsOptions,
      paymentFieldsData: paymentFieldsData || [],
      pfOptions,
      esicOptions,
      ptOptions,
      bonusOptions,
      lwfOptions,
      error: null,
    });
  } catch (error) {
    return json(
      {
        data: null,
        paymentFieldsOptions: [],
        paymentFieldsData: [],
        pfOptions: [],
        esicOptions: [],
        ptOptions: [],
        bonusOptions: [],
        lwfOptions: [],
        error,
      },
      { status: 500 },
    );
  }
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const paymentTemplateId = params.paymentTemplateId;
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
      templateData: {
        ...template,
        id: paymentTemplateId,
        company_id: companyId,
      } as any,
      templateVersionsData: { ...values, id: values?.id },
      templateComponentsData: components?.map((c: any) => ({
        ...c,
        template_version_id: c.template_version_id,
      })),
      statutoryComponentsData: statutory,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Payment Template updated",
        error: null,
      });

    return json(
      {
        status: "error",
        message: "Payment Template update failed",
        error,
      },
      { status: 500 },
    );
  } catch (error) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
      },
      { status: 500 },
    );
  }
}

export default function UpdatePaymentTemplate() {
  const {
    data,
    paymentFieldsOptions,
    paymentFieldsData,
    pfOptions,
    esicOptions,
    ptOptions,
    bonusOptions,
    lwfOptions,
    error,
  } = useLoaderData<typeof loader>();

  if (error) return <ErrorBoundary error={error} message="Failed to load" />;

  return (
    <PaymentTemplateForm
      updateValues={data}
      paymentFieldsOptions={paymentFieldsOptions as any}
      paymentFieldsData={paymentFieldsData as any}
      pfOptions={pfOptions as any}
      esicOptions={esicOptions as any}
      ptOptions={ptOptions as any}
      bonusOptions={bonusOptions as any}
      lwfOptions={lwfOptions as any}
    />
  );
}
