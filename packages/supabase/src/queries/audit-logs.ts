import type { TypedSupabaseClient, InferredType, AuditLogDatabaseRow } from "../types";

export async function getAuditLogs({
  supabase,
  tableName,
  recordId,
  limit = 50,
  offset = 0,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  tableName?: string;
  recordId?: string;
  limit?: number;
  offset?: number;
  companyId?: string;
}) {
  const columns = [
    "id",
    "table_name",
    "action",
    "record_id",
    "old_data",
    "new_data",
    "changed_by_id",
    "changed_by_email",
    "company_id",
    "changed_at",
  ] as const;

  let query = supabase
    .from("audit_logs")
    .select(columns.join(","), { count: "exact" })
    .order("changed_at", { ascending: false });

  if (tableName && tableName !== "ALL_TABLES") {
    query = query.eq("table_name", tableName);
  }
  if (recordId) {
    query = query.eq("record_id", recordId);
  }
  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error, count } = await query
    .range(offset, offset + limit - 1)
    .returns<InferredType<AuditLogDatabaseRow, (typeof columns)[number]>[]>();

  if (error) {
    console.error("getAuditLogs Error:", error);
  }

  return {
    data: data || [],
    error,
    count: count || 0,
  };
}
