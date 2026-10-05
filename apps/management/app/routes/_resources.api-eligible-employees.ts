import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getOnlyEmployeesBySiteId } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const url = new URL(request.url);
  const siteId = url.searchParams.get("siteId");
  const payrollId = url.searchParams.get("payrollId");

  if (!siteId || !payrollId) {
    return json([]);
  }

  try {
    const { data: employees, error: employeeError } =
      await getOnlyEmployeesBySiteId({
        supabase,
        siteId,
      });

    if (employeeError) {
      console.error("Error fetching employees for site:", employeeError);
      return json([]);
    }
    const filteredEmployees = (employees || []).map((emp) => {
      const name = `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`.trim() || "Unnamed Employee";
      const code = emp.employee_code ? ` (${emp.employee_code})` : "";
      return {
        label: `${name}${code}`,
        value: emp.id,
      };
    });

    return json(filteredEmployees);
  } catch (error) {
    console.error(
      "Unexpected error in eligible-employees resource route:",
      error,
    );
    return json([]);
  }
}
