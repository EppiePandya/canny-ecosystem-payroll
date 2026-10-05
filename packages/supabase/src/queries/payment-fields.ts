import { HARD_QUERY_LIMIT } from "../constant";
import type {
  InferredType,
  PaymentFieldDatabaseRow,
  TypedSupabaseClient,
} from "../types";

export type PaymentFieldDataType = Pick<
  PaymentFieldDatabaseRow,
  | "id"
  | "calculation_type"
  | "company_id"
  | "consider_for_epf"
  | "consider_for_esic"
  | "consider_for_bonus"
  | "amount"
  | "is_pro_rata"
  | "name"
  | "display_name"
  | "type"
  | "is_overtime"
  | "fixed_type"
  | "display_order"
> & { formula?: string | null };

export async function getPaymentFieldById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "company_id",
    "name",
    "display_name",
    "amount",
    "calculation_type",
    "formula",
    "fixed_type",
    "display_order",
    "type",
    "consider_for_epf",
    "consider_for_esic",
    "consider_for_bonus",
    "is_pro_rata",
    "is_overtime",
  ] as const;

  const { data, error } = await supabase
    .from("payment_fields")
    .select(columns.join(","))
    .eq("id", id)
    .single<PaymentFieldDataType>();

  if (error) {
    console.error("getPaymentFieldById Error", error);
  }

  return { data, error };
}

export async function getPaymentFieldNamesByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = ["id", "name", "display_name"] as const;

  const { data, error } = await supabase
    .from("payment_fields")
    .select(`${columns.join(",")}`)
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<
      InferredType<PaymentFieldDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) {
    console.error("getPaymentFieldNamesByCompanyId Error", error);
  }

  return {
    data,
    error,
  };
}

export async function getPaymentFieldsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "company_id",
    "name",
    "display_name",
    "amount",
    "calculation_type",
    "formula",
    "fixed_type",
    "display_order",
    "type",
    "consider_for_epf",
    "consider_for_esic",
    "consider_for_bonus",
    "is_pro_rata",
    "is_overtime",
  ] as const;

  const { data, error } = await supabase
    .from("payment_fields")
    .select(`${columns.join(",")}`)
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<PaymentFieldDataType[]>();

  if (error) {
    console.error("getPaymentFieldsByCompanyId Error", error);
  }

  return {
    data,
    error,
  };
}
