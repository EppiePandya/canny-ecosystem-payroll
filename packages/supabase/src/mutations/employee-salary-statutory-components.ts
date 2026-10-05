import { convertToNull } from "@canny_ecosystem/utils";
import type { TypedSupabaseClient } from "../types";

export async function upsertEmployeeSalaryStatutoryComponents({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: any;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { error, status } = await supabase
    .from("employee_salary_statutory_components")
    .upsert(convertToNull(data), {
      onConflict: "employee_salary_assignment_id",
    });

  if (error) {
    console.error("upsertEmployeeSalaryStatutoryComponents Error", error);
  }

  return { status, error };
}
