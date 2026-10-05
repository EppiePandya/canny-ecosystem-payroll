import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getAuditLogs } from "@canny_ecosystem/supabase/queries";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const url = new URL(request.url);
    let companyId = url.searchParams.get("companyId");
    if (!companyId) {
      const res = await getCompanyIdOrFirstCompany(request, supabase);
      companyId = res.companyId;
    }

    const logsRes = await getAuditLogs({
      supabase,
      limit: 30,
      companyId: companyId || undefined,
    });

    if (!logsRes.data || logsRes.data.length === 0) {
      return json({
        logs: [],
        lookups: { sites: {}, projects: {}, departments: {}, employees: {} },
      });
    }

    let lookups = { sites: {}, projects: {}, departments: {}, employees: {} };
    try {
      let sitesQuery = supabase.from("sites").select("id, name");
      let projectsQuery = supabase.from("projects").select("id, name");
      let deptsQuery = supabase.from("departments").select("id, name");
      let employeesQuery = supabase
        .from("employees")
        .select("id, first_name, last_name, employee_code");

      if (companyId) {
        sitesQuery = sitesQuery.eq("company_id", companyId);
        projectsQuery = projectsQuery.eq("company_id", companyId);
        deptsQuery = deptsQuery.eq("company_id", companyId);
        employeesQuery = employeesQuery.eq("company_id", companyId);
      }

      const [sitesRes, projectsRes, deptsRes, employeesRes] =
        await Promise.all([
          sitesQuery,
          projectsQuery,
          deptsQuery,
          employeesQuery,
        ]);

      lookups = {
        sites: Object.fromEntries(
          (sitesRes.data || []).map((s: any) => [s.id, s.name]),
        ),
        projects: Object.fromEntries(
          (projectsRes.data || []).map((p: any) => [p.id, p.name]),
        ),
        departments: Object.fromEntries(
          (deptsRes.data || []).map((d: any) => [d.id, d.name]),
        ),
        employees: Object.fromEntries(
          (employeesRes.data || []).map((e: any) => [
            e.id,
            `${e.first_name || ""} ${e.last_name || ""} (${e.employee_code || ""})`.trim(),
          ]),
        ),
      };
    } catch (lookupErr) {
      console.error("Changelog lookup fetch error:", lookupErr);
    }

    return json({
      logs: logsRes.data,
      lookups,
    });
  } catch (error) {
    console.error("Changelog fetch error:", error);
    return json({
      logs: [],
      lookups: { sites: {}, projects: {}, departments: {}, employees: {} },
    });
  }
}

