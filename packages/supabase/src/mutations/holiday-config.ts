import type {
  HolidayConfigDatabaseInsert,
  HolidayConfigDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function upsertHolidayConfig({
  supabase,
  config,
}: {
  supabase: TypedSupabaseClient;
  config: HolidayConfigDatabaseInsert | HolidayConfigDatabaseUpdate;
}) {
  const { data, error } = await supabase
    .from("holiday_config")
    .upsert(config)
    .select()
    .single();

  if (error) {
    console.error("upsertHolidayConfig Error", error);
  }

  return { data, error };
}

export async function deleteHolidayConfigById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { error } = await supabase.from("holiday_config").delete().eq("id", id);

  if (error) {
    console.error("deleteHolidayConfigById Error", error);
  }

  return { error };
}
