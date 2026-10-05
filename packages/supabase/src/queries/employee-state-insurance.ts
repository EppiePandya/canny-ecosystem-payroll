import { SINGLE_QUERY_LIMIT } from "../constant";
import type {
  EmployeeStateInsuranceDatabaseRow,
  InferredType,
  TypedSupabaseClient,
} from "../types";

export type EmployeeStateInsuranceDataType = Pick<
  EmployeeStateInsuranceDatabaseRow,
  | "id"
  | "company_id"
  | "esi_number"
  | "deduction_cycle"
  | "employee_contribution"
  | "employer_contribution"
  | "max_limit"
  | "is_default"
>;

export const getEmployeeStateInsuranceById = async ({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) => {
  const columns = [
    "id",
    "company_id",
    "esi_number",
    "deduction_cycle",
    "employee_contribution",
    "employer_contribution",
    "max_limit",
    "is_default",
  ] as const;

  const { data, error } = await supabase
    .from("employee_state_insurance")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<EmployeeStateInsuranceDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getEmployeeStateInsuranceById Error", error);
  }

  return { data, error };
};

export const getEmployeeStateInsuranceByESINumber = async ({
  supabase,
  esiNumber,
}: {
  supabase: TypedSupabaseClient;
  esiNumber: string;
}) => {
  const columns = [
    "id",
    "company_id",
    "esi_number",
    "deduction_cycle",
    "employee_contribution",
    "employer_contribution",
    "max_limit",
    "is_default",
  ] as const;

  const { data, error } = await supabase
    .from("employee_state_insurance")
    .select(columns.join(","))
    .eq("esi_number", esiNumber)
    .single<
      InferredType<EmployeeStateInsuranceDatabaseRow, (typeof columns)[number]>
    >();

  if (error) console.error("getEmployeeStateInsuranceByESINumber Error", error);

  return { data, error };
};

export const getEmployeeStateInsuranceByCompanyId = async ({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) => {
  const columns = [
    "id",
    "company_id",
    "esi_number",
    "deduction_cycle",
    "employee_contribution",
    "employer_contribution",
    "max_limit",
    "is_default",
  ] as const;

  const { data, error } = await supabase
    .from("employee_state_insurance")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<
      InferredType<
        EmployeeStateInsuranceDatabaseRow,
        (typeof columns)[number]
      >[]
    >();

  if (error) {
    console.error("getEmployeeStateInsuranceByCompanyId Error", error);
  }

  return { data, error };
};
