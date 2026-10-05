import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { type ActionFunctionArgs, json } from "@remix-run/node";
import JSZip from "jszip";

function getDocumentLabel(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const { supabase } = getSupabaseWithHeaders({ request });

    const employeeIdsRaw = formData.get("employeeIds") as string;
    const documentTypesRaw = formData.get("documentTypes") as string;

    if (!employeeIdsRaw || !documentTypesRaw) {
      return json(
        { success: false, message: "Missing required parameters" },
        { status: 400 },
      );
    }

    const employeeIds = employeeIdsRaw.split(",").filter(Boolean);
    const documentTypes = documentTypesRaw.split(",").filter(Boolean);

    if (employeeIds.length === 0 || documentTypes.length === 0) {
      return json(
        { success: false, message: "Empty parameters passed" },
        { status: 400 },
      );
    }

    // 1. Fetch employee details in batches of 100 to prevent PostgREST URL length limit (414)
    const employees: Array<{
      id: string;
      employee_code: string | null;
      first_name: string | null;
      middle_name: string | null;
      last_name: string | null;
    }> = [];

    const ID_CHUNK_SIZE = 100;
    for (let i = 0; i < employeeIds.length; i += ID_CHUNK_SIZE) {
      const chunk = employeeIds.slice(i, i + ID_CHUNK_SIZE);
      const { data, error: employeeError } = await supabase
        .from("employees")
        .select("id, employee_code, first_name, middle_name, last_name")
        .in("id", chunk);

      if (employeeError) {
        console.error("Failed to fetch employee chunk:", employeeError);
        return json(
          {
            success: false,
            message: `Failed to fetch employee details: ${employeeError.message}`,
          },
          { status: 500 },
        );
      }
      if (data) {
        employees.push(...data);
      }
    }

    if (employees.length === 0) {
      return json(
        { success: false, message: "No selected employees found" },
        { status: 404 },
      );
    }

    // 2. Fetch employee documents metadata for selected employees in batches of 100
    const documents: Array<{
      employee_id: string;
      document_type: string;
      url: string;
    }> = [];

    for (let i = 0; i < employeeIds.length; i += ID_CHUNK_SIZE) {
      const chunk = employeeIds.slice(i, i + ID_CHUNK_SIZE);
      const { data, error: docsError } = await supabase
        .from("employee_documents")
        .select("employee_id, document_type, url")
        .in("employee_id", chunk);

      if (docsError) {
        console.error("Failed to query employee documents chunk:", docsError);
        return json(
          {
            success: false,
            message: `Failed to query employee documents: ${docsError.message}`,
          },
          { status: 500 },
        );
      }
      if (data) {
        documents.push(...data);
      }
    }

    const normalizeType = (str: string) =>
      str
        .toLowerCase()
        .trim()
        .replace(/[\s-]+/g, "_");

    const targetTypesSet = new Set(documentTypes.map(normalizeType));

    const matchedDocs = (documents || []).filter((doc) => {
      if (!doc.document_type || !doc.url) return false;
      return targetTypesSet.has(normalizeType(doc.document_type));
    });

    if (matchedDocs.length === 0) {
      return json(
        { success: false, message: "No documents found for selected criteria" },
        { status: 404 },
      );
    }

    // 3. Batch fetch files in chunks to avoid socket / memory overload
    const fetchedFiles: Array<{
      employeeId: string;
      documentType: string;
      url: string;
      data: Uint8Array;
    }> = [];

    const CHUNK_SIZE = 10;
    for (let i = 0; i < matchedDocs.length; i += CHUNK_SIZE) {
      const chunk = matchedDocs.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map(async (doc) => {
          try {
            const encodedUrl = encodeURI(doc.url);
            const res = await fetch(encodedUrl, {
              signal: AbortSignal.timeout(20000),
            });
            if (!res.ok) {
              throw new Error(`HTTP error ${res.status}`);
            }
            const buffer = await res.arrayBuffer();
            return {
              employeeId: doc.employee_id,
              documentType: doc.document_type,
              url: doc.url,
              data: new Uint8Array(buffer),
            };
          } catch (err) {
            console.error(`Failed to fetch document: ${doc.url}`, err);
            return null;
          }
        }),
      );
      for (const res of results) {
        if (res) fetchedFiles.push(res);
      }
    }

    if (fetchedFiles.length === 0) {
      return json(
        { success: false, message: "Failed to download selected documents" },
        { status: 404 },
      );
    }

    // 4. Build ZIP file structure
    const zip = new JSZip();

    for (const employee of employees) {
      const empDocs = fetchedFiles.filter((f) => f.employeeId === employee.id);
      if (empDocs.length === 0) continue;

      const employeeName =
        [employee.first_name, employee.middle_name, employee.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        employee.employee_code ||
        "Employee";

      const folderName = (
        employee.employee_code
          ? `${employeeName} - ${employee.employee_code}`
          : employeeName
      )
        .replace(/[<>:"/\\|?*]+/g, "_")
        .trim();

      for (let idx = 0; idx < empDocs.length; idx++) {
        const doc = empDocs[idx];
        const extension = doc.url.split("?")[0].split(".").pop() || "pdf";
        const documentLabel = getDocumentLabel(doc.documentType);
        const fileName = `${employeeName} - ${documentLabel}${
          empDocs.filter((d) => d.documentType === doc.documentType).length > 1
            ? `_${idx + 1}`
            : ""
        }.${extension}`
          .replace(/[<>:"/\\|?*]+/g, "_")
          .trim();

        zip.file(`${folderName}/${fileName}`, doc.data);
      }
    }

    if (Object.keys(zip.files).length === 0) {
      return json(
        { success: false, message: "No valid documents collected into ZIP" },
        { status: 404 },
      );
    }

    const zipBuffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    });

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="employee_documents.zip"',
        "Content-Length": String(zipBuffer.byteLength),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Download Bulk Documents Error:", error);
    return json(
      {
        success: false,
        message: "Something went wrong while downloading documents",
      },
      { status: 500 },
    );
  }
}
