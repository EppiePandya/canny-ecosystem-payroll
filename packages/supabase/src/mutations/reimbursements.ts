import { convertToNull } from "@canny_ecosystem/utils";
import type {
  ReimbursementInsert,
  ReimbursementsUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createReimbursementsFromData({
  supabase,
  reimbursementsData,
  vehicleId,
}: {
  supabase: TypedSupabaseClient;
  reimbursementsData: ReimbursementInsert[];
  vehicleId?: string;
}) {
  const { data, error, status } = await supabase
    .from("reimbursements")
    .insert(reimbursementsData)
    .select();

  if (error) {
    console.error("createReimbursementsFromData Error:", error);
  }

  if (!error && data) {
    for (const reimbursement of data) {
      if (vehicleId) {
        await createReimbursementVehicle({
          supabase,
          reimbursementId: reimbursement.id,
          vehicleId,
        });
      } else if (
        reimbursement.type === "vehicle" ||
        reimbursement.type === "vehicle_related"
      ) {
        if (reimbursement.payee_id) {
          const { data: vehicle } = await supabase
            .from("vehicles")
            .select("id")
            .or(
              `owner_payee_id.eq.${reimbursement.payee_id},usage_payee_id.eq.${reimbursement.payee_id}`,
            )
            .limit(1)
            .maybeSingle();

          if (vehicle) {
            await createReimbursementVehicle({
              supabase,
              reimbursementId: reimbursement.id,
              vehicleId: vehicle.id,
            });
          }
        }
      }
    }
  }

  return { data, status, error };
}

export async function createReimbursementFromLoan({
  supabase,
  data,
  loanId,
}: {
  supabase: TypedSupabaseClient;
  data: ReimbursementInsert;
  loanId: string;
}) {
  const {
    data: createdData,
    error,
    status,
  } = await supabase.from("reimbursements").insert(data).select().single();

  if (error) {
    console.error("createReimbursementFromLoan Error:", error);
    return { status, error };
  }

  const { error: loanError } = await supabase
    .from("employee_loan_details")
    .update({ reimbursement_id: (createdData as any).id } as any)
    .eq("id", loanId as any);

  if (loanError) {
    console.error("Error linking reimbursement to loan:", loanError);
  }

  return { status, error };
}

export async function createReimbursementFromAdvance({
  supabase,
  data,
  advanceId,
}: {
  supabase: TypedSupabaseClient;
  data: ReimbursementInsert;
  advanceId: string;
}) {
  const {
    data: createdData,
    error,
    status,
  } = await supabase.from("reimbursements").insert(data).select().single();

  if (error) {
    console.error("createReimbursementFromAdvance Error:", error);
    return { status, error };
  }

  const { error: advanceError } = await supabase
    .from("employee_advance_details")
    .update({ reimbursement_id: (createdData as any).id } as any)
    .eq("id", advanceId as any);

  if (advanceError) {
    console.error("Error linking reimbursement to advance:", advanceError);
  }

  return { status, error };
}

export async function createReimbursementsFromImportedData({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: ReimbursementInsert[];
}) {
  const { error, status } = await supabase
    .from("reimbursements")
    .insert(data)
    .select();

  if (error) {
    console.error("createReimbursementsFromImportedData Error:", error);
  }

  return { status, error };
}

export async function updateReimbursementsById({
  reimbursementId,
  supabase,
  data,
}: {
  reimbursementId: string;
  supabase: TypedSupabaseClient;
  data: ReimbursementsUpdate;
}) {
  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("reimbursements")
    .update(updateData)
    .eq("id", reimbursementId ?? "");

  if (error) {
    console.error("updateReimbursementsById Error:", error);
  }

  return { error, status };
}

export async function deleteReimbursementById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  await supabase
    .from("employee_loan_details")
    .update({ reimbursement_id: null } as any)
    .eq("reimbursement_id", id as any);

  const { error, status } = await supabase
    .from("reimbursements")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteReimbursementById Error:", error);
    return { status, error };
  }

  if (status < 200 || status >= 300) {
    console.error(
      "deleteReimbursementById Unexpected Supabase status:",
      status,
    );
  }

  return { status, error: null };
}

export async function updateMultipleReimbursements({
  supabase,
  reimbursementsData,
}: {
  supabase: TypedSupabaseClient;
  reimbursementsData: ReimbursementsUpdate[];
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      status: 400,
      error: "No email found",
    };
  }

  for (const entry of reimbursementsData) {
    const updateObj: Partial<ReimbursementsUpdate> = {};
    if (entry.status?.length) updateObj.status = entry.status;
    if (entry.type?.length) updateObj.type = entry.type;

    if (Object.keys(updateObj).length === 0) continue;

    const { error, status } = await supabase
      .from("reimbursements")
      .update(updateObj)
      .eq("id", entry.id!);

    if (error) {
      console.error("Error updating entry:", error);
      return { error, status };
    }
  }

  return { error: null, status: 200 };
}

export async function deleteMultipleReimbursements({
  supabase,
  reimbursementIds,
}: {
  supabase: TypedSupabaseClient;
  reimbursementIds: string[];
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      status: 400,
      error: "No email found",
    };
  }

  if (!reimbursementIds || reimbursementIds.length === 0) {
    return {
      status: 500,
      error: { message: "No Reimbursements IDs provided" },
    };
  }

  await supabase
    .from("employee_loan_details")
    .update({ reimbursement_id: null } as any)
    .in("reimbursement_id", reimbursementIds as any[]);

  const { error, status } = await supabase
    .from("reimbursements")
    .delete()
    .in("id", reimbursementIds);

  if (error) {
    console.error("Error deleting reimbursements:", error);
    return { error, status };
  }

  return { error: null, status };
}

export async function createReimbursementVehicle({
  supabase,
  reimbursementId,
  vehicleId,
}: {
  supabase: TypedSupabaseClient;
  reimbursementId: string;
  vehicleId: string;
}) {
  const { data, error, status } = await supabase
    .from("reimbursement_vehicles")
    .insert({
      reimbursement_id: reimbursementId,
      vehicle_id: vehicleId,
    })
    .select();

  if (error) {
    console.error("createReimbursementVehicle Error:", error);
  }

  return { data, status, error };
}

