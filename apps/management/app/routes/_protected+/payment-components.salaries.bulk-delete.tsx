import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { deleteEmployeeSalaryAssignments } from "@canny_ecosystem/supabase/mutations";
import { type ActionFunctionArgs, json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();
  const idsString = formData.get("ids") as string;

  if (!idsString) {
    return json({ error: "No IDs provided" }, { status: 400, headers });
  }

  const ids = idsString.split(",");

  const { error } = await deleteEmployeeSalaryAssignments({
    supabase: supabase as any,
    ids,
  });

  if (error) {
    console.error("Bulk Delete Error:", error);
    return json({ error: error.message }, { status: 500, headers });
  }

  return json({ success: true, count: ids.length }, { headers });
}
