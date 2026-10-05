import { MID_QUERY_LIMIT } from "../constant";
import type { CompanyPrefixDatabaseRow, TypedSupabaseClient } from "../types";

export type CompanyPrefixWithSite = CompanyPrefixDatabaseRow & {
  site: { id: string; name: string } | null;
};

export async function getCompanyPrefixesByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "name",
    "site_id",
    "company_id",
    "site:sites!site_id(id, name)",
    "created_at",
    "is_default",
  ] as const;

  const { data, error } = await supabase
    .from("company_prefix")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(MID_QUERY_LIMIT)
    .returns<CompanyPrefixWithSite[]>();

  if (error) {
    console.error("getCompanyPrefixesByCompanyId Error", error);
  }

  return { data, error };
}
