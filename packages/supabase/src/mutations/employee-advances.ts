import { convertToNull } from "@canny_ecosystem/utils";
import type {
  EmployeeAdvanceDetailsDatabaseInsert,
  EmployeeAdvanceDetailsDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createEmployeeAdvance({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeAdvanceDetailsDatabaseInsert;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { error, status } = await supabase
    .from("employee_advance_details")
    .insert({ ...data, is_paid: data.is_paid ?? false })
    .select()
    .single();

  if (error) console.error("createEmployeeAdvance Error:", error);

  return { status, error };
}

export async function updateEmployeeAdvanceById({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeAdvanceDetailsDatabaseUpdate;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("employee_advance_details")
    .update(updateData)
    .eq("id", data.id!);

  if (error) console.error("updateEmployeeAdvanceById Error:", error);

  return { status, error };
}

export async function deleteEmployeeAdvanceById({
  supabase,
  id,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  id: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { error, status } = await supabase
    .from("employee_advance_details")
    .delete()
    .eq("id", id);

  if (error) console.error("deleteEmployeeAdvanceById Error:", error);

  return { status, error };
}
