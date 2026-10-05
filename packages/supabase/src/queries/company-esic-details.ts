import { MID_QUERY_LIMIT } from "../constant";
import type { TypedSupabaseClient } from "../types";

export async function getCompanyEsicDetailsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "esic_site_name",
    "esic_id_number::text",
    "company_id",
    "created_at",
  ] as const;

  const { data, error } = await supabase
    .from("company_esic_details")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(MID_QUERY_LIMIT)
    .returns<any[]>();

  if (error) {
    console.error("getCompanyEsicDetailsByCompanyId Error", error);
  }

  return { data, error };
}

export async function getCompanyEsicDetailById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { data, error } = await supabase
    .from("company_esic_details")
    .select("id, esic_site_name, esic_id_number::text, company_id, created_at")
    .eq("id", id)
    .single<any>();

  if (error) {
    console.error("getCompanyEsicDetailById Error", error);
  }

  return { data, error };
}
