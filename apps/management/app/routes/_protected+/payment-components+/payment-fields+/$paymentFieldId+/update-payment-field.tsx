import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import CreatePaymentField from "../create-payment-field";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import {
  hasPermission,
  isGoodStatus,
  PaymentFieldSchema,
  updateRole,
  validateFormula,
  DERIVED_FORMULA_COMPONENTS,
} from "@canny_ecosystem/utils";
import {
  getPaymentFieldById,
  getPaymentFieldNamesByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { updatePaymentField } from "@canny_ecosystem/supabase/mutations";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";

export const UPDATE_PAYMENT_FIELD = "update-payment-field";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const paymentFieldId = params.paymentFieldId;
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.paymentFields}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  try {
    const { data, error } = await getPaymentFieldById({
      supabase,
      id: paymentFieldId || "",
    });

    if (error) throw error;

    const { data: allPaymentFields } = await getPaymentFieldNamesByCompanyId({
      supabase,
      companyId: data?.company_id ?? "",
    });

    return json({
      data,
      allPaymentFields: allPaymentFields ?? [],
      error,
    });
  } catch (error) {
    return json(
      {
        error,
        data: null,
        allPaymentFields: [],
      },
      { status: 500 },
    );
  }
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const submission = parseWithZod(formData, { schema: PaymentFieldSchema });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    if (
      submission.value.calculation_type === "variable" &&
      submission.value.formula
    ) {
      const { data: fieldNames } = await getPaymentFieldNamesByCompanyId({
        supabase,
        companyId: submission.value.company_id,
      });
      const componentNames = [
        ...(fieldNames ?? [])
          .filter((f: any) => f.id !== submission.value.id)
          .map((f: any) => f.display_name || f.name),
        ...DERIVED_FORMULA_COMPONENTS.map((c) => c.name),
      ];
      const { valid, error: formulaError } = validateFormula(
        submission.value.formula,
        componentNames,
      );
      if (!valid) {
        return json(
          {
            status: "error",
            message: `Invalid formula: ${formulaError}`,
            error: { message: `Invalid formula: ${formulaError}` },
          },
          { status: 400 },
        );
      }
    }

    const { status, error } = await updatePaymentField({
      supabase: supabase as any,
      data: submission.value as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Payment Field updated",
        error: null,
      });

    return json(
      {
        status: "error",
        message: "Payment Field update failed",
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

export default function UpdatePaymentField() {
  const { data, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const { paymentFieldId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!actionData) return;
    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.payment_fields);
      clearCacheEntry(
        `${cacheKeyPrefix.payment_field_report}${paymentFieldId}`,
      );
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate("/payment-components/payment-fields", {
        replace: true,
      });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description:
          actionData?.error?.message || "Payment Field update failed",
        variant: "destructive",
      });
    }
  }, [actionData, navigate, paymentFieldId, toast]);

  if (error) return <ErrorBoundary error={error} message="Failed to load" />;

  return <CreatePaymentField updateValues={data as any} />;
}
