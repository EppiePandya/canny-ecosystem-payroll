import { convertToNull } from "@canny_ecosystem/utils";
import type { TypedSupabaseClient } from "../types";

export type PaymentTemplateVersionsDatabaseInsert = {
  template_id: string;
  monthly_ctc?: number;
  basic_percent?: number;
  basic_amount?: number;
  calculation_direction?: string;
  is_pro_rata?: boolean;
  effective_date?: string;
};

export type PaymentTemplateVersionsDatabaseUpdate =
  Partial<PaymentTemplateVersionsDatabaseInsert> & {
    id: string;
  };

export async function createPaymentTemplateVersions({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: PaymentTemplateVersionsDatabaseInsert;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const {
    data: supabaseData,
    error,
    status,
  } = await supabase
    .from("payment_template_versions")
    .insert({ ...data } as any)
    .select("id")
    .single();

  if (error) console.error("createPaymentTemplateVersions Error", error);

  return { data: supabaseData, status, error };
}

export async function updatePaymentTemplateVersions({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: PaymentTemplateVersionsDatabaseUpdate;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { id, ...rest } = data;

  const updateData = convertToNull(rest);
  const { error, status } = await supabase
    .from("payment_template_versions")
    .update(updateData)
    .eq("id", id);

  if (error) console.error("updatePaymentTemplateVersions Error", error);

  return { status, error };
}

export async function deletePaymentTemplateVersions({
  supabase,
  templateId,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { error, status } = await supabase
    .from("payment_template_versions")
    .delete()
    .eq("template_id", templateId);

  if (error) console.error("deletePaymentTemplateVersions Error", error);

  return { status, error };
}
