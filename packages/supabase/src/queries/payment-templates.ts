import type {
  InferredType,
  PaymentFieldDatabaseRow,
  PaymentTemplateDatabaseRow,
  TypedSupabaseClient,
} from "../types";
import { getPaymentTemplateVersionsByTemplateId } from "./payment-template-versions";
import { getPaymentStatutoryComponentsByTemplateId } from "./payment-statutory-components";
import { HARD_QUERY_LIMIT } from "../constant";

export async function getPaymentTemplatesByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = ["id", "name", "company_id"] as const;

  const { data, error } = await supabase
    .from("payment_templates")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: true })
    .returns<
      InferredType<PaymentTemplateDatabaseRow, (typeof columns)[number]>[]
    >();

  return { data, error };
}

export async function getPaymentTemplatesBasicByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = ["id", "name"] as const;

  const { data, error } = await supabase
    .from("payment_templates")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: true })
    .returns<
      InferredType<PaymentTemplateDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) {
    console.error("getPaymentTemplatesBasicByCompanyId Error", error);
  }

  return { data, error };
}

export async function getPaymentTemplatesWithDetailsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("payment_templates")
    .select(`
      id,
      name,
      company_id,
      payment_template_versions(
        id,
        monthly_ctc,
        basic_percent,
        basic_amount,
        calculation_direction,
        effective_date,
        is_pro_rata,
        created_at,
        payment_template_components(
          id,
          payment_field_id,
          amount,
          payment_fields(
            *
          )
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
    `)
    .eq("company_id", companyId)
    .lte("payment_template_versions.effective_date", today)
    .order("effective_date", {
      referencedTable: "payment_template_versions",
      ascending: false,
    })
    .limit(1, { referencedTable: "payment_template_versions" })
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getPaymentTemplatesWithDetailsByCompanyId Error", error);
  }

  return { data, error };
}

export async function getPaymentTemplateById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = ["id", "name", "company_id"] as const;

  const { data, error } = await supabase
    .from("payment_templates")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<PaymentTemplateDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getPaymentTemplateById Error", error);
  }

  return { data, error };
}

export async function getPaymentTemplateDetailsById({
  supabase,
  templateId,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("payment_templates")
    .select(`
      id,
      name,
      payment_template_versions(
        id,
        monthly_ctc,
        basic_percent,
        basic_amount,
        calculation_direction,
        effective_date,
        is_pro_rata,
        created_at,
        payment_template_components(
          id,
          payment_field_id,
          amount,
          payment_fields(
            *
          )
        ),
        payment_statutory_components(
          pf_id,
          esic_id,
          pt_id,
          statutory_bonus_id,
          labour_welfare_fund_id
        )
      )
    `)
    .eq("id", templateId)
    .lte("payment_template_versions.effective_date", today)
    .order("effective_date", {
      referencedTable: "payment_template_versions",
      ascending: false,
    })
    .limit(1, { referencedTable: "payment_template_versions" })
    .single();

  if (error) {
    console.error("getPaymentTemplateDetailsById Error", error);
  }

  return { data, error };
}

export async function getPaymentTemplateComponentsByTemplateId({
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
      payment_template_components(
        id,
        template_version_id,
        payment_field_id,
        amount,
        payment_fields(
          *
        )
      )
    `)
    .eq("template_id", templateId)
    .lte("effective_date", today)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) {
    console.error(
      "getPaymentTemplateComponentsByTemplateId Error",
      versionError,
    );
    return { data: null, error: versionError };
  }

  return { data: versionData?.payment_template_components || [], error: null };
}

export async function getPaymentTemplateComponentById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { data, error } = await supabase
    .from("payment_template_components")
    .select(`
      id,
      template_id,
      payment_field_id,
      amount,
      payment_fields(
        *
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("getPaymentTemplateComponentById Error", error);
  }

  return { data, error };
}

export async function getPaymentTemplateWithComponentsById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { data: template, error } = await getPaymentTemplateById({
    supabase,
    id,
  });

  if (!template) {
    return { data: null, error };
  }

  const { data: components, error: componentsError } =
    await getPaymentTemplateComponentsByTemplateId({
      supabase,
      templateId: template.id,
    });

  return {
    data: {
      ...template,
      payment_template_components: components ?? [],
    },
    error: error || componentsError,
  };
}

export async function getUnifiedPaymentTemplateById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { data: template, error: templateError } = await getPaymentTemplateById(
    { supabase, id },
  );

  if (templateError || !template) {
    return { data: null, error: templateError };
  }

  const { data: values, error: valuesError } =
    await getPaymentTemplateVersionsByTemplateId({
      supabase,
      templateId: id,
    });

  const { data: components, error: componentsError } =
    await getPaymentTemplateComponentsByTemplateId({
      supabase,
      templateId: id,
    });

  const { data: statutory, error: statutoryError } =
    await getPaymentStatutoryComponentsByTemplateId({
      supabase,
      templateId: id,
    });

  return {
    data: {
      template,
      values: values ?? null,
      components: components ?? [],
      statutory: statutory ?? null,
    },
    error: templateError || valuesError || componentsError || statutoryError,
  };
}

export type PaymentTemplateComponentType = {
  id?: string;
  template_id?: string;
  payment_field_id: string;
  amount: number;

  payment_fields: Pick<
    PaymentFieldDatabaseRow,
    | "id"
    | "name"
    | "display_name"
    | "amount"
    | "type"
    | "calculation_type"
    | "fixed_type"
    | "is_pro_rata"
    | "consider_for_epf"
    | "consider_for_esic"
    | "consider_for_bonus"
    | "is_overtime"
  > & { formula?: string | null };
};

export type PaymentTemplateWithComponentsType = {
  id: string;
  name: string;
  company_id: string;
  payment_template_components: PaymentTemplateComponentType[];
};
