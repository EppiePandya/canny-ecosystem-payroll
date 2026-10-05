import type { TypedSupabaseClient } from "../types";

export async function getEmployeesWithSalaryByEmployeeCodes({
  supabase,
  employeeCodes,
}: {
  supabase: TypedSupabaseClient;
  employeeCodes: string[];
}) {
  if (!employeeCodes.length) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      is_active,
      company_id,
      employee_salary_assignment (
        id,
        effective_date,
        monthly_ctc,
        basic_percent,
        basic_amount,
        is_pro_rata,
        use_payment_template,
        template_id,
        employee_salary_components (
          *,
          payment_fields (*)
        ),
        employee_salary_statutory_components (
          *,
          pf:employee_provident_fund (*),
          esi:employee_state_insurance (*),
          pt:professional_tax (*),
          bonus:statutory_bonus (*),
          lwf:labour_welfare_fund (*)
        ),
        payment_templates (
          id,
          name,
          payment_template_versions (
            id,
            monthly_ctc,
            basic_percent,
            basic_amount,
            effective_date,
            is_pro_rata,
            payment_template_components (
              *,
              payment_fields (*)
            ),
            payment_statutory_components (
              *,
              pf:employee_provident_fund (*),
              esi:employee_state_insurance (*),
              pt:professional_tax (*),
              bonus:statutory_bonus (*),
              lwf:labour_welfare_fund (*)
            )
          )
        )
      )
    `,
    )
    .in("employee_code", employeeCodes)
    .order("effective_date", {
      referencedTable: "employee_salary_assignment",
      ascending: false,
    });

  if (error) {
    console.error("getEmployeesWithSalaryByEmployeeCodes Error:", error);
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
}

export async function getSalaryStatutoryComponentsByAssignmentId({
  supabase,
  assignmentId,
}: {
  supabase: TypedSupabaseClient;
  assignmentId: string;
}) {
  const { data, error } = await supabase
    .from("employee_salary_statutory_components")
    .select(
      `
      *,
      pf:employee_provident_fund (*),
      esi:employee_state_insurance (*),
      pt:professional_tax (*),
      bonus:statutory_bonus (*),
      lwf:labour_welfare_fund (*)
    `,
    )
    .eq("employee_salary_assignment_id", assignmentId)
    .maybeSingle();

  if (error) {
    console.error("getSalaryStatutoryComponentsByAssignmentId Error:", error);
  }

  return { data, error };
}

export async function getCompanySalaryFields({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const [
    paymentFields,
    pfConfigs,
    esiConfigs,
    ptConfigs,
    bonusConfigs,
    lwfConfigs,
  ] = await Promise.all([
    supabase
      .from("payment_fields")
      .select("id, name, display_name, type, calculation_type, formula, is_pro_rata, fixed_type, is_overtime, consider_for_epf, consider_for_esic, consider_for_bonus")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("employee_provident_fund")
      .select("id, epf_number")
      .eq("company_id", companyId),
    supabase
      .from("employee_state_insurance")
      .select("id, esi_number")
      .eq("company_id", companyId),
    supabase
      .from("professional_tax")
      .select("id, state")
      .eq("company_id", companyId),
    supabase
      .from("statutory_bonus")
      .select("id, name")
      .eq("company_id", companyId),
    supabase
      .from("labour_welfare_fund")
      .select("id, state")
      .eq("company_id", companyId),
  ]);

  return {
    paymentFields: paymentFields.data || [],
    pfConfigs: pfConfigs.data || [],
    esiConfigs: esiConfigs.data || [],
    ptConfigs: ptConfigs.data || [],
    bonusConfigs: bonusConfigs.data || [],
    lwfConfigs: lwfConfigs.data || [],
    error:
      paymentFields.error ||
      pfConfigs.error ||
      esiConfigs.error ||
      ptConfigs.error ||
      bonusConfigs.error ||
      lwfConfigs.error,
  };
}

export async function getSalaryComponentsDetails({
  supabase,
  paymentFieldIds,
  pfId,
  esiId,
  esiIds,
  ptIds,
  bonusId,
  lwfId,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  paymentFieldIds: string[];
  pfId?: string | null;
  esiId?: string | null;
  esiIds?: string[];
  ptIds?: string[];
  bonusId?: string | null;
  lwfId?: string | null;
  companyId: string;
}) {
  const queries: any[] = [];

  if (paymentFieldIds.length > 0) {
    queries.push(
      supabase.from("payment_fields").select("*").in("id", paymentFieldIds),
    );
  } else {
    queries.push(Promise.resolve({ data: [] }));
  }

  queries.push(
    pfId
      ? supabase
          .from("employee_provident_fund")
          .select("*")
          .eq("id", pfId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  );

  if (esiIds && esiIds.length > 0) {
    queries.push(
      supabase.from("employee_state_insurance").select("*").in("id", esiIds),
    );
  } else {
    queries.push(
      esiId
        ? supabase
            .from("employee_state_insurance")
            .select("*")
            .eq("id", esiId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    );
  }

  queries.push(
    ptIds && ptIds.length > 0
      ? supabase.from("professional_tax").select("*").in("id", ptIds)
      : Promise.resolve({ data: [] }),
  );
  queries.push(
    bonusId
      ? supabase
          .from("statutory_bonus")
          .select("*")
          .eq("id", bonusId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  );
  queries.push(
    lwfId
      ? supabase
          .from("labour_welfare_fund")
          .select("*")
          .eq("id", lwfId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  );
  queries.push(
    supabase.from("holiday_config").select("*").eq("company_id", companyId),
  );

  const [paymentFields, pf, esi, pt, bonus, lwf, holidayConfig] =
    await Promise.all(queries);

  return {
    paymentFields: paymentFields.data || [],
    pf: pf.data,
    esi: Array.isArray(esi.data) ? esi.data[0] : esi.data,
    esis: Array.isArray(esi.data) ? esi.data : esi.data ? [esi.data] : [],
    pts: pt.data || [],
    bonus: bonus.data,
    lwf: lwf.data,
    holidayConfig: holidayConfig.data || [],
    error:
      paymentFields.error ||
      pf.error ||
      esi.error ||
      pt.error ||
      bonus.error ||
      lwf.error ||
      holidayConfig.error,
  };
}
