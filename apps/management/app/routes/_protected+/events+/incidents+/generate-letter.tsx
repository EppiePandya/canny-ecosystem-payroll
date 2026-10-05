import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getIncidentsById,
  getCompanyById,
} from "@canny_ecosystem/supabase/queries";
import { generateIncidentLetterPdf } from "@/components/incident/incident-letter-document";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const incidentId = url.searchParams.get("incidentId");

    if (!incidentId) {
      return json(
        { success: false, message: "Incident ID is required" },
        { status: 400 },
      );
    }

    const { supabase } = getSupabaseWithHeaders({ request });

    const { data: incident, error: incidentError } = await getIncidentsById({
      supabase: supabase as any,
      incidentId,
    });

    if (incidentError || !incident) {
      return json(
        { success: false, message: "Incident not found" },
        { status: 404 },
      );
    }

    const { data: company, error: companyError } = await getCompanyById({
      supabase: supabase as any,
      id: incident.company_id,
    });

    if (companyError || !company) {
      console.error("Company Fetch Error:", companyError);
    }

    const pdfBuffer = await generateIncidentLetterPdf(
      incident as any,
      company?.name || "The Company",
    );

    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=incident_${incidentId}.pdf`,
      },
    });
  } catch (error) {
    console.error("Generate Incident Letter Error:", error);
    return json(
      {
        success: false,
        message: "Something went wrong while generating the incident letter",
      },
      { status: 500 },
    );
  }
}
