import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  processAllPendingDocuments,
  type DocumentSyncBatchResult,
} from "@/utils/automation/document-pipeline.server";

async function handleDocumentSync(request: Request): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);
  let employeeId = url.searchParams.get("employeeId") || undefined;

  if (request.method === "POST") {
    try {
      const formData = await request.clone().formData();
      const formEmpId = formData.get("employeeId")?.toString();
      if (formEmpId) {
        employeeId = formEmpId;
      }
    } catch {
      // not formdata or empty
    }
  }

  try {
    const result: DocumentSyncBatchResult = await processAllPendingDocuments({
      supabase,
      companyId,
      employeeIdFilter: employeeId,
    });

    return json<DocumentSyncBatchResult>(result);
  } catch (err: any) {
    console.error("Document sync API error:", err);
    return json<DocumentSyncBatchResult>(
      {
        success: false,
        message: `Sync failed: ${err.message || String(err)}`,
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        reports: [],
      },
      { status: 500 }
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return handleDocumentSync(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleDocumentSync(request);
}
