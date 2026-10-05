import type { TypedSupabaseClient } from "../types";

export async function getEmployeeStatutoryComponentsByAssignmentId({
  supabase,
  assignmentId,
}: {
  supabase: TypedSupabaseClient;
  assignmentId: string;
}) {
  const { data: mapping, error } = await supabase
    .from("employee_salary_statutory_components")
    .select("*")
    .eq("employee_salary_assignment_id", assignmentId)
    .maybeSingle();

  if (error || !mapping) {
    if (error) {
      console.error(
        "getEmployeeStatutoryComponentsByAssignmentId Mapping Error",
        error,
      );
    }
    return { data: null, error };
  }

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
