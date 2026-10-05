import { HARD_QUERY_LIMIT } from "../constant";
import type {
  HolidayConfigDatabaseRow,
  InferredType,
  TypedSupabaseClient,
} from "../types";

export async function getHolidayConfigsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "company_id",
    "type",
    "multiplier",
    "created_at",
    "working_days",
    "use_attendance_working_days",
  ] as const;

  const { data, error } = await supabase
    .from("holiday_config")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(HARD_QUERY_LIMIT)
    .returns<
      InferredType<HolidayConfigDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) {
    console.error("getHolidayConfigsByCompanyId Error", error);
  }

  return { data, error };
}
