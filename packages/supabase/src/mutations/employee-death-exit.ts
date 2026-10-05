import { convertToNull } from "@canny_ecosystem/utils";
import type {
  EmployeeDeathExitInsert,
  EmployeeDeathExitUpdate,
  TypedSupabaseClient,
} from "../types";

export const createEmployeeDeathExit = async ({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeDeathExitInsert;
  bypassAuth?: boolean;
}) => {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      throw new Error("User is not logged in");
    }
  }

  // 1. Find the employee_id for this exit
  const { data: exitRecord, error: exitError } = await supabase
    .from("employee_exit")
    .select("employee_id")
    .eq("id", data.exit_id!)
    .single();

  if (exitError || !exitRecord) {
    return {
      status: 400,
      error: exitError || new Error("Employee exit record not found"),
    };
  }

  const employeeId = exitRecord.employee_id;

  // 2. Check if any exit for this employee already has a death_exit entry
  const { data: existingDeathExit, error: checkError } = await supabase
    .from("employee_exit")
    .select("id, death_exit(exit_id)")
    .eq("employee_id", employeeId)
    .not("death_exit", "is", null);

  if (checkError) {
    console.error("Check existing death exit error:", checkError);
  }

  // Filter to check if any of the exits actually have a death_exit
  const alreadyHasDeath = existingDeathExit?.some(
    (ee: any) => ee.death_exit !== null,
  );

  if (alreadyHasDeath) {
    return {
      status: 400,
      error: new Error(
        "This employee already has a death exit record on another site exit.",
      ),
    };
  }

  const { error, status } = await supabase.from("death_exit").insert(data);
  if (error) {
    console.error("createExit Error:", error);
  }

  return {
    status,
    error,
  };
};

export const updateEmployeeDeathExit = async ({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeDeathExitUpdate;
  bypassAuth?: boolean;
}) => {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("death_exit")
    .update(updateData)
    .eq("exit_id", data.exit_id!);
  if (error) {
    console.error("updateExit Error:", error);
  }

  return { status, error };
};

export const deleteEmployeeDeathExit = async ({
  supabase,
  exitId,
}: {
  supabase: TypedSupabaseClient;
  exitId: string;
}) => {
  const { data: existing, error: findError } = await supabase
    .from("death_exit")
    .select("exit_id")
    .eq("exit_id", exitId)
    .single();

  if (findError || !existing) {
    throw new Error("Exit record not found or already deleted");
  }

  const { error: deleteError } = await supabase
    .from("death_exit")
    .delete()
    .eq("exit_id", exitId);

  if (deleteError) {
    console.error("deleteDeathEmployeeExit error:", deleteError);
    throw deleteError;
  }

  return { success: true };
};
