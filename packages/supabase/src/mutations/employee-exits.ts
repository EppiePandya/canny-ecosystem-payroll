import { convertToNull, isGoodStatus } from "@canny_ecosystem/utils";
import type {
  EmployeeExitInsert,
  EmployeeExitUpdate,
  TypedSupabaseClient,
} from "../types";
import { getEmployeeExitById, getPayrollById } from "../queries";
import { updatePayroll } from "./payroll";
import { updateEmployee } from "./employees";

export const createEmployeeExit = async ({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeExitInsert;
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

  const { error, status } = await supabase.from("employee_exit").insert(data);
  if (error) {
    console.error("createExit Error:", error);
    return {
      status,
      error,
    };
  }

  if (data.employee_id) {
    const { error: empError } = await updateEmployee({
      supabase,
      data: {
        id: data.employee_id,
        is_active: false,
      },
      bypassAuth,
    });
    if (empError) {
      console.error(
        "Error setting employee as inactive on exit creation:",
        empError,
      );
    }
  }

  return {
    status,
    error,
  };
};

export const updateEmployeeExit = async ({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeExitUpdate;
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
    .from("employee_exit")
    .update(updateData)
    .eq("id", data.id!);
  if (error) {
    console.error("updateExit Error:", error);
  }

  return { status, error };
};

export const deleteEmployeeExit = async ({
  supabase,
  id,
  bypassAuth = true,
}: {
  supabase: TypedSupabaseClient;
  id: string;
  bypassAuth?: boolean;
}) => {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 401, error: "Unauthorized User" };
    }
  }

  const { error, status } = await supabase
    .from("employee_exit")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteEmployeeExit Error:", error);
  }

  return {
    status,
    error,
  };
};

export async function getExitsConflicts({
  supabase,
  importedData,
}: {
  supabase: TypedSupabaseClient;
  importedData: EmployeeExitInsert[];
}) {
  const employeeIds = [...new Set(importedData.map((emp) => emp.employee_id))];

  const query = supabase
    .from("employee_exit")
    .select(
      `
      employee_id
    `,
    )
    .or(
      [`employee_id.in.(${employeeIds.map((id) => id).join(",")})`].join(","),
    );

  const { data: conflictingRecords, error } = await query;

  if (error) {
    console.error("getExitsConflicts Error:", error);
    return { conflictingIndices: [], error };
  }

  const conflictingIndices = importedData.reduce(
    (indices: number[], record, index) => {
      const hasConflict = conflictingRecords?.some(
        (existing) => existing.employee_id === record.employee_id,
      );

      if (hasConflict) {
        indices.push(index);
      }
      return indices;
    },
    [],
  );

  return { conflictingIndices, error: null };
}

export async function createExitsFromImportedData({
  supabase,
  data,
  import_type,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeExitInsert[];
  import_type?: string;
}) {
  if (!data || data.length === 0) {
    return { status: "No data provided", error: null };
  }

  const identifiers = data.map((entry) => ({
    employee_id: entry.employee_id,
  }));

  const {
    data: existingRecords,
    error: existingError,
    status,
  } = await supabase
    .from("employee_exit")
    .select("employee_id")
    .in(
      "employee_id",
      identifiers.map((entry) => entry.employee_id).filter(Boolean),
    );
  if (existingError) {
    console.error("Error fetching existing records:", existingError);
    return { status, error: existingError };
  }

  const normalize = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const existingSets = {
    ids: new Set(existingRecords?.map((e) => normalize(e.employee_id)) || []),
  };

  if (import_type === "skip") {
    const newData = data.filter((entry) => {
      const hasConflict = existingSets.ids.has(normalize(entry.employee_id));

      return !hasConflict;
    });

    if (newData.length === 0) {
      return {
        status: 500,
        error: null,
      };
    }

    const BATCH_SIZE = 50;

    let insertStatus = 200;

    for (let i = 0; i < newData.length; i += BATCH_SIZE) {
      const batch = newData.slice(i, Math.min(i + BATCH_SIZE, newData.length));

      const { error: insertError, status } = await supabase
        .from("employee_exit")
        .insert(batch);
      if (insertError) {
        console.error("Error inserting batch:", insertError);
      }
      if (isGoodStatus(status)) {
        insertStatus = status;
      }
    }

    const employeeIds = [
      ...new Set(newData.map((item) => item.employee_id).filter(Boolean)),
    ];
    if (employeeIds.length > 0) {
      await supabase
        .from("employees")
        .update({ is_active: false })
        .in("id", employeeIds);
    }

    return {
      status: insertStatus,
      error: null,
    };
  }
  if (import_type === "overwrite") {
    const results = await Promise.all(
      data.map(async (record) => {
        const existingRecord = existingRecords?.find(
          (existing) =>
            normalize(existing.employee_id) === normalize(record.employee_id),
        );

        if (existingRecord) {
          const { error: updateError } = await supabase
            .from("employee_exit")
            .update(record)
            .eq("employee_id", existingRecord.employee_id!);

          return { type: "update", error: updateError };
        }

        const { error: insertError } = await supabase
          .from("employee_exit")
          .insert(record);

        return { type: "insert", error: insertError };
      }),
    );

    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      console.error("Errors during processing:", errors);
    }

    const employeeIds = [
      ...new Set(data.map((item) => item.employee_id).filter(Boolean)),
    ];
    if (employeeIds.length > 0) {
      await supabase
        .from("employees")
        .update({ is_active: false })
        .in("id", employeeIds);
    }

    return {
      status: 200,
      error: null,
    };
  }
  return {
    status: 402,
    error: new Error("Invalid import_type"),
  };
}

export async function updateExitsForPayrollCreation({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: { id: string; payroll_id: string }[];
}) {
  const results = await Promise.all(
    data.map((item) => {
      const { id, ...updateData } = item;
      return supabase.from("employee_exit").update(updateData).eq("id", id!);
    }),
  );

  const errors = results.filter((res) => res.error);
  const status = results.filter((res) => res.status);

  return { status, errors };
}

export const updateExitAndPayrollById = async ({
  supabase,
  data,
  bypassAuth = false,
  action,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeExitUpdate;
  bypassAuth?: boolean;
  action: string;
}) => {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const updateData = convertToNull(data);

  const { data: entryData } = await getEmployeeExitById({
    supabase,
    id: data.id ?? "",
  });
  const { data: payrollData } = await getPayrollById({
    supabase,
    payrollId: entryData?.payroll_id ?? "",
  });

  let totalNetAmount = payrollData?.total_net_amount!;
  let totalEmployees = payrollData?.total_employees!;
  if (action === "delete") {
    totalEmployees -= 1;
  }

  await updatePayroll({
    supabase,
    data: {
      id: payrollData?.id,
      total_net_amount: totalNetAmount,
      total_employees: totalEmployees,
    },
  });

  const { error, status } = await supabase
    .from("employee_exit")
    .update(updateData)
    .eq("id", data.id!);
  if (error) {
    console.error("updateExitAndPayroll Error:", error);
  }

  return { status, error };
};
