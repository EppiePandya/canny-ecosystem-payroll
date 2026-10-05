import { convertToNull } from "@canny_ecosystem/utils";
import type {
  EmployeeLoanDetailsDatabaseInsert,
  EmployeeLoanDetailsDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createEmployeeLoan({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeLoanDetailsDatabaseInsert;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { error, status } = await supabase
    .from("employee_loan_details")
    .insert({ ...data, is_paid: data.is_paid ?? false })
    .select()
    .single();

  if (error) console.error("createEmployeeLoan Error:", error);

  return { status, error };
}

export async function updateEmployeeLoanById({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeLoanDetailsDatabaseUpdate;
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
    .from("employee_loan_details")
    .update(updateData)
    .eq("id", data.id!);

  if (error) console.error("updateEmployeeLoanById Error:", error);

  return { status, error };
}

export async function deleteEmployeeLoanById({
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
    .from("employee_loan_details")
    .delete()
    .eq("id", id);

  if (error) console.error("deleteEmployeeLoanById Error:", error);

  return { status, error };
}

export async function getEmployeeLoansConflicts({
  supabase,
  importedData,
}: {
  supabase: TypedSupabaseClient;
  importedData: EmployeeLoanDetailsDatabaseInsert[];
}) {
  const employeeIds = [
    ...new Set(
      importedData.map((emp) => emp.employee_id).filter(Boolean) as string[],
    ),
  ];

  if (employeeIds.length === 0) {
    return { conflictingIndices: [], conflicts: [], error: null };
  }

  const { data, error } = await supabase
    .from("employee_loan_details")
    .select("employee_id, loan_name")
    .in("employee_id", employeeIds);

  if (error) {
    console.error("Error fetching employee loan conflicts:", error);
    return { conflictingIndices: [], conflicts: [], error };
  }

  const conflictingIndices = [];
  const conflicts = [];

  const normalize = (val: any) =>
    String(val || "")
      .trim()
      .toLowerCase();

  for (let i = 0; i < importedData.length; i++) {
    const record = importedData[i];
    const hasConflict = data?.some(
      (existing) =>
        existing.employee_id === record.employee_id &&
        normalize(existing.loan_name) === normalize(record.loan_name),
    );

    if (hasConflict) {
      conflictingIndices.push(i);
      conflicts.push({ index: i, type: "loan_name" });
    }
  }

  return { conflictingIndices, conflicts, error: null };
}

export async function createEmployeeLoansFromImportedData({
  supabase,
  data,
  import_type,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeLoanDetailsDatabaseInsert[];
  import_type?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: null };
  }

  const {
    conflictingIndices,
    conflicts,
    error: conflictError,
  } = await getEmployeeLoansConflicts({
    supabase,
    importedData: data,
  });

  if (conflictError) {
    return { status: 403, error: conflictError };
  }

  if (import_type === "skip") {
    const newData = data.filter(
      (_, index) => !conflictingIndices.includes(index),
    );

    if (newData.length === 0) {
      return {
        status: 404,
        error: { message: "No new entries added" },
      };
    }

    const QUERY_BATCH_SIZE = 50;
    for (let i = 0; i < newData.length; i += QUERY_BATCH_SIZE) {
      const batch = newData.slice(i, i + QUERY_BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("employee_loan_details")
        .insert(batch);
      if (insertError) {
        console.error("Error inserting batch (employee loans):", insertError);
        return { status: 400, error: insertError };
      }
    }

    return { status: 200, error: null };
  }

  if (import_type === "overwrite") {
    const QUERY_BATCH_SIZE = 50;
    for (let i = 0; i < data.length; i += QUERY_BATCH_SIZE) {
      const batch = data.slice(i, i + QUERY_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (record, batchIdx) => {
          const globalIndex = i + batchIdx;
          const conflict = conflicts.find((c) => c.index === globalIndex);

          if (conflict) {
            // Overwrite existing loan by employee_id and loan_name
            const { error: updateError } = await supabase
              .from("employee_loan_details")
              .update(record)
              .eq("employee_id", record.employee_id!)
              .ilike("loan_name", record.loan_name!);

            return { type: "update", error: updateError };
          }

          const { error: insertError } = await supabase
            .from("employee_loan_details")
            .insert(record);

          return { type: "insert", error: insertError };
        }),
      );

      const firstError = results.find((r) => r.error);
      if (firstError) {
        console.error(
          "Error during processing batch (employee loans):",
          firstError.error,
        );
        return { status: 400, error: firstError.error };
      }
    }

    return {
      status: 200,
      message: "Successfully processed updates and new insertions",
      error: null,
    };
  }

  return {
    status: 500,
    error: new Error("Invalid import_type"),
  };
}
