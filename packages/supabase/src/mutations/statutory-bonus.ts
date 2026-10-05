import { convertToNull } from "@canny_ecosystem/utils";
import type {
  StatutoryBonusDatabaseInsert,
  StatutoryBonusDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createStatutoryBonus({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: StatutoryBonusDatabaseInsert;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const { error, status } = await supabase.from("statutory_bonus").insert(data);

  if (error) {
    console.error("createStatutoryBonus Error:", error);
  }

  return {
    status,
    error,
  };
}

export async function updateStatutoryBonus({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: StatutoryBonusDatabaseUpdate;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("statutory_bonus")
    .update(updateData)
    .eq("id", data.id!);

  if (error) {
    console.error("updateStatutoryBonus Error:", error);
  }

  return {
    status,
    error,
  };
}

export async function deleteStatutoryBonus({
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

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const { error, status } = await supabase
    .from("statutory_bonus")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteStatutoryBonus Error:", error);
  }

  return { status, error };
}

export async function upsertEmployeeYearlyBonusDetails({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: any[];
}) {
  const { error, status } = await supabase
    .from("employee_yearly_bonus_details")
    .upsert(data, { onConflict: "employee_id, payroll_id" });

  if (error) {
    console.error("upsertEmployeeYearlyBonusDetails Error:", error);
  }

  return { status, error };
}

export async function updateYearlyBonusStatus({
  supabase,
  ids,
  invoiceId,
  status: bonusStatus = true,
}: {
  supabase: TypedSupabaseClient;
  ids: string[];
  invoiceId?: string;
  status?: boolean;
}) {
  const updateData: any = { status: bonusStatus };
  if (invoiceId) {
    updateData.invoice_id = invoiceId;
  }

  const { error, status } = await supabase
    .from("employee_yearly_bonus_details")
    .update(updateData)
    .in("id", ids);

  if (error) {
    console.error("updateYearlyBonusStatus Error:", error);
  }

  return { status, error };
}
