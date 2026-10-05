import type { TypedSupabaseClient } from "../types";

export async function getExitPdfTemplateByName({
  supabase,
  fileName,
}: {
  supabase: TypedSupabaseClient;
  fileName: string;
}) {
  const { data, error } = await supabase.storage
    .from("canny-ecosystem")
    .download(`exits-pdf/${fileName}`);

  if (error) {
    console.error("getExitPdfTemplateByName Error", error);
  }

  return { data, error };
}
