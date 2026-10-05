import type { TypedSupabaseClient } from "../types";

export async function upsertEmployeeSalaryAssignment({
  supabase,
  assignment,
  components,
}: {
  supabase: TypedSupabaseClient;
  assignment: any;
  components?: any[];
}) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { status: 401, error: new Error("Unauthorized") };
  }

  const assignmentToSave = { ...assignment };
  if (
    (assignmentToSave.basic_amount === undefined || assignmentToSave.basic_amount === null) &&
    assignmentToSave.monthly_ctc !== undefined &&
    assignmentToSave.basic_percent !== undefined
  ) {
    assignmentToSave.basic_amount = Math.round(
      (Number(assignmentToSave.monthly_ctc) * Number(assignmentToSave.basic_percent)) / 100,
    );
  }

  let { data: savedAssignment, error: assignmentError } = await supabase
    .from("employee_salary_assignment")
    .upsert(assignmentToSave)
    .select("id")
    .single();

  if (assignmentError) {
    const errMsg = assignmentError.message || "";
    if (
      errMsg.includes("calculation_direction") ||
      errMsg.includes("basic_formula")
    ) {
      delete assignmentToSave.calculation_direction;
      delete assignmentToSave.basic_formula;
      const retry = await supabase
        .from("employee_salary_assignment")
        .upsert(assignmentToSave)
        .select("id")
        .single();
      savedAssignment = retry.data;
      assignmentError = retry.error;
    }
  }

  if (assignmentError) {
    console.error("upsertEmployeeSalaryAssignment Error", assignmentError);
    return { status: 400, error: assignmentError };
  }

  const assignmentId = (savedAssignment as any).id;

  if (components) {
    const { error: syncError } = await syncEmployeeComponents({
      supabase,
      assignmentId,
      components,
    });

    if (syncError) {
      return { status: 400, error: syncError };
    }
  }

  return { status: 200, data: savedAssignment, error: null };
}

import { convertToNull } from "@canny_ecosystem/utils";

export async function deleteAllEmployeeComponents({
  supabase,
  assignmentId,
}: {
  supabase: TypedSupabaseClient;
  assignmentId: string;
}) {
  const { error } = await supabase
    .from("employee_salary_components")
    .delete()
    .eq("employee_salary_assignment_id", assignmentId);

  if (error) {
    console.error("error deleting all employee components", error);
  }
}

export async function removeOldEmployeeComponents({
  supabase,
  assignmentId,
  components,
}: {
  supabase: TypedSupabaseClient;
  assignmentId: string;
  components: any[];
}) {
  const componentIds = components.map((c) => c.id).filter(Boolean);

  const { data: existingComponents, error: fetchError } = await supabase
    .from("employee_salary_components")
    .select("id")
    .eq("employee_salary_assignment_id", assignmentId);

  if (fetchError) {
    console.error("error fetching existing components", fetchError);
    return { status: 400, error: fetchError };
  }

  const existingComponentIds = existingComponents.map((c) => c.id);

  const componentsToDelete = existingComponentIds.filter(
    (id) => !componentIds.includes(id),
  );

  if (componentsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("employee_salary_components")
      .delete()
      .eq("employee_salary_assignment_id", assignmentId)
      .in("id", componentsToDelete);

    if (deleteError) {
      console.error("error deleting old employee components", deleteError);
    }
  }
}

export async function createEmployeeComponents({
  supabase,
  assignmentId,
  components,
}: {
  supabase: TypedSupabaseClient;
  assignmentId: string;
  components: any[];
}) {
  const insertData = components.map(({ id, ...rest }) => ({
    ...rest,
    employee_salary_assignment_id: assignmentId,
  }));

  const { error, status } = await supabase
    .from("employee_salary_components")
    .insert(insertData);

  if (error) {
    console.error("createEmployeeComponents Error", error);
  }

  return { status, error };
}

export async function updateEmployeeComponents({
  supabase,
  components,
}: {
  supabase: TypedSupabaseClient;
  components: any[];
}) {
  const updateDataArray = components.map((data) => {
    return convertToNull(data);
  });

  const { error, status } = await supabase
    .from("employee_salary_components")
    .upsert(updateDataArray, {
      onConflict: "id",
    });

  if (error) {
    console.error("updateEmployeeComponents Error", error);
  }

  return { status, error };
}

export async function syncEmployeeComponents({
  supabase,
  assignmentId,
  components,
}: {
  supabase: TypedSupabaseClient;
  assignmentId: string;
  components: any[];
}) {
  const toUpdate = components.filter((c) => c.id);
  const toCreate = components.filter((c) => !c.id);

  let status = 200;
  let error = null;

  await removeOldEmployeeComponents({
    supabase,
    assignmentId,
    components,
  });

  if (toUpdate.length > 0) {
    const { error: updateError, status: updateStatus } =
      await updateEmployeeComponents({
        supabase,
        components: toUpdate.map((c) => ({
          ...c,
          employee_salary_assignment_id: assignmentId,
        })),
      });

    if (updateError) {
      console.error("Error updating components:", updateError);
      status = updateStatus || 500;
      error = updateError;
    }
  }

  if (toCreate.length > 0) {
    const { error: createError, status: createStatus } =
      await createEmployeeComponents({
        supabase,
        assignmentId,
        components: toCreate,
      });

    if (createError) {
      console.error("Error creating components:", createError);
      status = createStatus || 500;
      error = createError;
    }
  }

  return { status, error };
}

export async function deleteEmployeeSalaryAssignment({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { error, status } = await supabase
    .from("employee_salary_assignment")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteEmployeeSalaryAssignment Error", error);
  }

  return { status, error };
}
export async function deleteEmployeeSalaryAssignments({
  supabase,
  ids,
}: {
  supabase: TypedSupabaseClient;
  ids: string[];
}) {
  const { error, status } = await supabase
    .from("employee_salary_assignment")
    .delete()
    .in("id", ids);

  if (error) {
    console.error("deleteEmployeeSalaryAssignments Error", error);
  }

  return { status, error };
}
