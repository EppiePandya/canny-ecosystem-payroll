import { HARD_QUERY_LIMIT, SINGLE_QUERY_LIMIT } from "../constant";
import type {
  InferredType,
  PaymentTemplateAssignmentsDatabaseRow,
  TypedSupabaseClient,
} from "../types";

export async function getTemplateIdByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = ["template_id"] as const;

  const { data, error } = await supabase
    .from("payment_template_assignments")
    .select(columns.join(","))
    .order("created_at", { ascending: false })
    .eq("employee_id", employeeId)
    .maybeSingle<
      InferredType<
        Pick<PaymentTemplateAssignmentsDatabaseRow, "template_id">,
        (typeof columns)[number]
      >
    >();

  if (error) console.error("getTemplateIdByEmployeeId Error", error);

  return { data, error };
}

export async function getPaymentTemplateAssignmentByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = [
    "id",
    "template_id",
    "assignment_type",
    "employee_id",
    "site_id",
    "eligibility_option",
    "position",
    "skill_level",
    "effective_from",
    "effective_to",
    "is_active",
    "name",
  ] as const;

  const { data, error } = await supabase
    .from("payment_template_assignments")
    .select(columns.join(","))
    .order("created_at", { ascending: false })
    .eq("employee_id", employeeId)
    .maybeSingle<
      InferredType<
        PaymentTemplateAssignmentsDatabaseRow,
        (typeof columns)[number]
      >
    >();

  if (error)
    console.error("getPaymentTemplateAssignmentByEmployeeId Error", error);

  return { data, error };
}

export async function getPaymentTemplateAssignmentById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "template_id",
    "assignment_type",
    "employee_id",
    "site_id",
    "eligibility_option",
    "position",
    "skill_level",
    "effective_from",
    "effective_to",
    "is_active",
    "name",
  ] as const;

  const { data, error } = await supabase
    .from("payment_template_assignments")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<
        PaymentTemplateAssignmentsDatabaseRow,
        (typeof columns)[number]
      >
    >();

  if (error) console.error("getPaymentTemplateAssignmentById Error", error);

  return { data, error };
}

export type PaymentTemplateAssignmentsType = Pick<
  PaymentTemplateAssignmentsDatabaseRow,
  | "id"
  | "template_id"
  | "assignment_type"
  | "employee_id"
  | "site_id"
  | "eligibility_option"
  | "position"
  | "skill_level"
  | "effective_from"
  | "effective_to"
  | "is_active"
  | "name"
>;

export async function getPaymentTemplateAssignmentBySiteId({
  supabase,
  site_id,
}: {
  supabase: TypedSupabaseClient;
  site_id: string;
}) {
  const columns = [
    "id",
    "template_id",
    "assignment_type",
    "employee_id",
    "site_id",
    "eligibility_option",
    "position",
    "skill_level",
    "effective_from",
    "effective_to",
    "is_active",
    "name",
  ] as const;

  const { data, error } = await supabase
    .from("payment_template_assignments")
    .select(columns.join(","))
    .eq("site_id", site_id)
    .order("created_at", { ascending: false })
    .limit(SINGLE_QUERY_LIMIT)
    .single<
      InferredType<
        PaymentTemplateAssignmentsDatabaseRow,
        (typeof columns)[number]
      >
    >();

  if (error) console.error("getPaymentTemplateAssignmentBySiteId Error", error);

  return { data, error };
}

export async function getPaymentTemplateAssignmentBySiteAndPositionOrSkillType({
  supabase,
  site_id,
  position,
  skill_level,
}: {
  supabase: TypedSupabaseClient;
  site_id: string;
  position?: string;
  skill_level?: string;
}) {
  const columns = [
    "id",
    "template_id",
    "assignment_type",
    "employee_id",
    "site_id",
    "eligibility_option",
    "position",
    "skill_level",
    "effective_from",
    "effective_to",
    "is_active",
    "name",
  ] as const;

  let query = supabase
    .from("payment_template_assignments")
    .select(columns.join(","))
    .eq("site_id", site_id)
    .order("created_at", { ascending: false })
    .limit(SINGLE_QUERY_LIMIT);

  if (position) {
    query = query.eq("position", position);
  } else if (skill_level) {
    query = query.eq("skill_level", skill_level);
  }

  const { data, error } =
    await query.maybeSingle<
      InferredType<
        PaymentTemplateAssignmentsDatabaseRow,
        (typeof columns)[number]
      >
    >();

  if (error) {
    console.error(
      "getPaymentTemplateAssignmentBySiteAndPositionOrSkillType Error",
      error,
    );
  }

  return { data, error };
}

export async function getPaymentTemplateAssignmentsBySiteId({
  supabase,
  siteId,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
}) {
  const columns = [
    "id",
    "template_id",
    "assignment_type",
    "employee_id",
    "site_id",
    "eligibility_option",
    "position",
    "skill_level",
    "effective_from",
    "effective_to",
    "is_active",
    "name",
  ] as const;

  const { data, error } = await supabase
    .from("payment_template_assignments")
    .select(columns.join(","))
    .eq("site_id", siteId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<PaymentTemplateAssignmentsType[]>();

  if (error)
    console.error("getPaymentTemplateAssignmentsBySiteId Error", error);

  return { data, error };
}
