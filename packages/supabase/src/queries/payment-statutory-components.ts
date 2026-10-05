import type { TypedSupabaseClient } from "../types";

export async function getPaymentStatutoryComponentsByTemplateId({
  supabase,
  templateId,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  const { data: versionData, error: versionError } = await supabase
    .from("payment_template_versions")
    .select(`
      id,
      payment_statutory_components(
        *
      )
    `)
    .eq("template_id", templateId)
    .lte("effective_date", today)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    versionError ||
    !versionData ||
    !versionData.payment_statutory_components
  ) {
    if (versionError) {
      console.error(
        "getPaymentStatutoryComponentsByTemplateId Error",
        versionError,
      );
    }
    return { data: null, error: versionError };
  }

  const mapping: any = versionData.payment_statutory_components;

  const [pf, esi, pt, bonus, lwf] = await Promise.all([
    mapping.pf_id
      ? supabase
          .from("employee_provident_fund")
          .select("*")
          .eq("id", mapping.pf_id)
          .maybeSingle()
      : null,

    mapping.esic_id
      ? supabase
          .from("employee_state_insurance")
          .select("*")
          .eq("id", mapping.esic_id)
          .maybeSingle()
      : null,

    mapping.pt_id
      ? supabase
          .from("professional_tax")
          .select("*")
          .eq("id", mapping.pt_id)
          .maybeSingle()
      : null,

    mapping.statutory_bonus_id
      ? supabase
          .from("statutory_bonus")
          .select("*")
          .eq("id", mapping.statutory_bonus_id)
          .maybeSingle()
      : null,

    mapping.labour_welfare_fund_id
      ? supabase
          .from("labour_welfare_fund")
          .select("*")
          .eq("id", mapping.labour_welfare_fund_id)
          .maybeSingle()
      : null,
  ]);

  return {
    data: {
      ...mapping,
      pf: pf?.data || null,
      esi: esi?.data || null,
      pt: pt?.data || null,
      bonus: bonus?.data || null,
      lwf: lwf?.data || null,
    },
    error: null,
  };
}
