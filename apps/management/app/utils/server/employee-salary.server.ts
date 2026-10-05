import type { TypedSupabaseClient } from "@canny_ecosystem/supabase/types";
import { getUnifiedPaymentTemplateById } from "@canny_ecosystem/supabase/queries";

export type SalaryComponent = {
  payment_field_id: string;
  amount: number;
  id?: string;
};

export async function getTemplateDefaults({
  supabase,
  templateId,
  monthlyCtc,
  basicPercent,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
  monthlyCtc: number;
  basicPercent: number;
}) {
  const { data: unifiedData, error } = await getUnifiedPaymentTemplateById({
    supabase,
    id: templateId,
  });

  if (error || !unifiedData) {
    return { components: [], error };
  }

  const components: SalaryComponent[] = [];
  const basicAmount = (monthlyCtc * basicPercent) / 100;

  const templateComponents = unifiedData.components || [];

  for (const tc of templateComponents) {
    let amount = tc.amount || 0;
    const paymentField = tc.payment_fields;

    if (paymentField?.calculation_type === "percentage_of_basic") {
      amount = (basicAmount * (tc.amount || 0)) / 100;
    }

    components.push({
      payment_field_id: tc.payment_field_id,
      amount: Math.round(amount),
    });
  }

  return { components, error: null };
}
