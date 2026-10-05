import type {
  LetterDatabaseRow,
  InferredType,
  TypedSupabaseClient,
} from "../types";
export type LetterDataType = Pick<
  LetterDatabaseRow,
  | "id"
  | "company_id"
  | "subject"
  | "letter_type"
  | "created_at"
  | "letter_name"
  | "is_pdf"
  | "font_size"
>;

export async function getLettersByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "letter_type",
    "letter_name",
    "subject",
    "content",
    "include_signatuory",
    "include_employee_signature",
    "include_letter_header",
    "include_letter_footer",
    "created_at",
    "company_id",
    "is_pdf",
    "font_size",
  ] as const;

  const { data, error } = await supabase
    .from("letter")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<LetterDataType[]>();

  if (error) {
    console.error("getLettersByCompanyId Error", error);
    return { data: null, error };
  }

  const mappedData = data?.map((item: any) => ({
    ...item,
    include_salary_structure: Boolean(item.content?.includes("${salaryStructure}")),
  }));

  return { data: mappedData, error: null };
}

export async function getLetterById({
  supabase,
  letterId,
}: {
  supabase: TypedSupabaseClient;
  letterId: string;
}) {
  const columns = [
    "id",
    "letter_type",
    "letter_name",
    "subject",
    "content",
    "include_signatuory",
    "include_employee_signature",
    "include_letter_header",
    "include_letter_footer",
    "created_at",
    "company_id",
    "is_pdf",
    "font_size",
  ] as const;

  const { data, error } = await supabase
    .from("letter")
    .select(columns.join(","))
    .eq("id", letterId)
    .single()
    .returns<InferredType<LetterDatabaseRow, (typeof columns)[number]>>();

  if (error || !data) {
    console.error("getLetterById Error", error);
    return { data: null, error: error ?? new Error("Letter not found") };
  }

  const mappedData = {
    ...data,
    include_salary_structure: Boolean((data as any).content?.includes("${salaryStructure}")),
  };

  return { data: mappedData, error: null };
}

export async function getEmployeeLettersByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const { data, error } = await supabase
    .from("employee_letter")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getEmployeeLettersByEmployeeId Error", error);
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
}

