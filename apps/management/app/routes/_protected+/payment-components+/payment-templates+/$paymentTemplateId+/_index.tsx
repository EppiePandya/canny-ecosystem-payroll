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
import { getPaymentFieldsByCompanyId } from "@canny_ecosystem/supabase/queries";
import { upsertUnifiedPaymentTemplate } from "@canny_ecosystem/supabase/mutations";
import { getUnifiedPaymentTemplateById } from "@canny_ecosystem/supabase/queries";
import { PaymentTemplateForm } from "@/components/payment-template/payment-template-form";
import { useLoaderData } from "@remix-run/react";
import { ErrorBoundary } from "@/components/error-boundary";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(user?.role!, `${createRole}:${attribute.paymentComponent}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );

  const paymentTemplateId = params.paymentTemplateId;

  if (!paymentTemplateId) {
    throw new Response("Payment Template ID is required", { status: 400 });
  }

  const [paymentFieldsPromise, templateDetailsPromise] = await Promise.all([
    getPaymentFieldsByCompanyId({ supabase: supabase as any, companyId }),
    getUnifiedPaymentTemplateById({
      supabase: supabase as any,
      id: paymentTemplateId,
    }),
  ]);

  const { data: paymentFieldsData, error: fieldsError } = paymentFieldsPromise;
  const { data: updateValues, error: templateError } = templateDetailsPromise;

  if (fieldsError || templateError || !updateValues) {
    throw new Response("Failed to load required data", { status: 500 });
  }

  const paymentFieldsOptions =
    paymentFieldsData?.map((field: any) => ({
      label: field.display_name || field.name,
      value: field.id!,
    })) || [];

  return json({
    companyId,
    paymentFieldsOptions,
    paymentFieldsData: paymentFieldsData || [],
    updateValues,
  });
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(
      request,
      supabase as any,
    );
    const paymentTemplateId = params.paymentTemplateId;

    if (!paymentTemplateId) {
      return json(
        { status: "error", message: "Template ID is missing", error: null },
        { status: 400 },
      );
    }

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

    const { template, values, components } = submission.value;

    const { status, error } = await upsertUnifiedPaymentTemplate({
      supabase: supabase as any,
      templateData: {
        ...template,
        id: paymentTemplateId,
        company_id: companyId,
      } as any,
      templateVersionsData: values,
      templateComponentsData: components,
    });

    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Payment Template updated successfully",
        error: null,
      });
    }

    return json(
      {
        status: "error",
        message: "Payment Template update failed",
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

export default function UpdatePaymentTemplate() {
  const { paymentFieldsOptions, paymentFieldsData, updateValues } =
    useLoaderData<typeof loader>();

  return (
    <PaymentTemplateForm
      updateValues={updateValues as any}
      paymentFieldsOptions={paymentFieldsOptions as any}
      paymentFieldsData={paymentFieldsData as any}
    />
  );
}

export function ErrorBoundaryComponent() {
  return (
    <ErrorBoundary message="An error occurred while loading the update template page." />
  );
}
