import type { ActionFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { json, useLoaderData } from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import {
  isGoodStatus,
  PaymentTemplateUnifiedSchema,
} from "@canny_ecosystem/utils";
import { upsertUnifiedPaymentTemplate } from "@canny_ecosystem/supabase/mutations";
import { ErrorBoundary } from "@/components/error-boundary";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { PaymentTemplateForm } from "@/components/payment-template/payment-template-form";

export { loader } from "./update-payment-template";

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
      templateVersionsData: { ...values, id: undefined },
      templateComponentsData: components?.map((c: any) => ({
        ...c,
        id: undefined,
      })),
      statutoryComponentsData: statutory,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Increment added successfully (new version created)",
        error: null,
      });

    return json(
      {
        status: "error",
        message: "Failed to add increment",
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

export default function AddIncrementPage() {
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
  } = useLoaderData<any>();

  if (error) return <ErrorBoundary error={error} message="Failed to load" />;

  return (
    <PaymentTemplateForm
      updateValues={data}
      isIncrement={true}
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
