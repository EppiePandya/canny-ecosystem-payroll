import type { TypedSupabaseClient } from "../types";

export type PaymentTemplateVersionsType = {
  id: string;
  template_id: string;
  monthly_ctc: number | null;
  basic_percent: number | null;
  basic_amount: number | null;
  calculation_direction: string | null;
  is_pro_rata: boolean;
  effective_date: string | null;
  created_at: string | null;
};

export async function getPaymentTemplateVersionsByTemplateId({
  supabase,
  templateId,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("payment_template_versions")
    .select("*")
    .eq("template_id", templateId)
    .lte("effective_date", today)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle<PaymentTemplateVersionsType>();

  if (error) {
    if (error.code !== "PGRST116") {
      console.error("getPaymentTemplateVersionsByTemplateId Error", error);
    }
  }
  return { data, error };
}

export async function getPaymentTemplateVersionsFullByTemplateId({
  supabase,
  templateId,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
}) {
  const { data, error } = await supabase
    .from("payment_template_versions")
    .select(`
      *,
      payment_template_components(
        *,
        payment_fields(*)
      ),
      payment_statutory_components(
        *,
        pf:employee_provident_fund (*),
        esi:employee_state_insurance (*),
        pt:professional_tax (*),
        bonus:statutory_bonus (*),
        lwf:labour_welfare_fund (*)
      )
    `)
    .eq("template_id", templateId)
    .order("effective_date", { ascending: false });

  if (error) {
    console.error("getPaymentTemplateVersionsFullByTemplateId Error", error);
  }

  return { data, error };
}
