import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getPaymentTemplateDetailsById } from "@canny_ecosystem/supabase/queries";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });

  const templateId = params.templateId;

  if (!templateId) {
    throw new Response("Template ID is required", { status: 400 });
  }

  const { data, error } = await getPaymentTemplateDetailsById({
    supabase: supabase as any,
    templateId,
  });

  if (error) {
    console.error("API Payment Template Fetch Error:", error);
    throw new Response("Failed to fetch template", { status: 500 });
  }

  return json({ template: data });
}
