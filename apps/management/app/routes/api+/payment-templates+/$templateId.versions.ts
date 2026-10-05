import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getPaymentTemplateVersionsFullByTemplateId } from "@canny_ecosystem/supabase/queries";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const templateId = params.templateId;

  if (!templateId) {
    return json(
      { error: "Template ID is required", versions: [] },
      { status: 400 },
    );
  }

  const { data, error } = await getPaymentTemplateVersionsFullByTemplateId({
    supabase: supabase as any,
    templateId,
  });

  if (error) {
    console.error("API Payment Template Versions Error:", error);
    return json(
      { error: "Failed to fetch versions", versions: [] },
      { status: 500 },
    );
  }

  return json({ versions: data || [] });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { supabase } = getSupabaseWithHeaders({ request });
  const templateId = params.templateId;

  if (!templateId) {
    return json({ error: "Template ID is required" }, { status: 400 });
  }

  const formData = await request.formData();
  const versionId = formData.get("versionId") as string;

  if (!versionId) {
    return json({ error: "Version ID is required" }, { status: 400 });
  }

  const { count, error: countError } = await (supabase as any)
    .from("payment_template_versions")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);

  if (countError) {
    return json({ error: "Failed to count versions" }, { status: 500 });
  }

  if ((count ?? 0) <= 1) {
    return json(
      { error: "Cannot delete the only version of a payment template." },
      { status: 400 },
    );
  }

  const { error } = await (supabase as any)
    .from("payment_template_versions")
    .delete()
    .eq("id", versionId)
    .eq("template_id", templateId);

  if (error) {
    console.error("Delete Payment Template Version Error:", error);
    return json({ error: "Failed to delete version" }, { status: 500 });
  }

  return json({ success: true });
}
