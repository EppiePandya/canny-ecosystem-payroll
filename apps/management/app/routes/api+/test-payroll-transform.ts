import { transformPayrollExcelAttachment } from "@/utils/server/payroll-excel-transform.server";
import {
  type ActionFunctionArgs,
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
  json,
  unstable_parseMultipartFormData as parseMultipartFormData,
} from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    let filename = "spreadsheet.xlsx";
    let fileBuffer: Buffer | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (!body.base64) {
        return json(
          { success: false, error: "Missing base64 file data in request body" },
          { status: 400 },
        );
      }
      filename = body.filename || "spreadsheet.xlsx";
      fileBuffer = Buffer.from(body.base64, "base64");
    } else {
      const uploadHandler = createMemoryUploadHandler({
        maxPartSize: 50 * 1024 * 1024, // 50MB
      });
      const formData = await parseMultipartFormData(request, uploadHandler);
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return json(
          {
            success: false,
            error: "No file uploaded in form data under 'file'",
          },
          { status: 400 },
        );
      }

      const f = file as File;
      filename = f.name || "spreadsheet.xlsx";
      fileBuffer = Buffer.from(await f.arrayBuffer());
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return json(
        { success: false, error: "Uploaded file is empty" },
        { status: 400 },
      );
    }

    console.log(
      `[TestPayrollTransform] Processing file "${filename}" (${fileBuffer.length} bytes)...`,
    );

    const transformResult = await transformPayrollExcelAttachment(
      fileBuffer,
      filename,
    );

    // Format readable summary for email
    let emailSummaryText = "";
    if (transformResult.sheets && transformResult.sheets.length > 1) {
      const sheetSummaries = transformResult.sheets
        .map((s, idx) => {
          const attSummary =
            s.details.attendance && s.details.attendance.length > 0
              ? s.details.attendance.join(", ")
              : "None detected";
          const earnSummary =
            s.details.earnings.length > 0 ? s.details.earnings.join(", ") : "None";
          const grossSummary = s.details.grossCol || "Not detected";
          const dedSummary =
            s.details.deductions.length > 0
              ? s.details.deductions.join(", ")
              : "None";
          const netPaySummary = s.details.netPayCol || "Not detected";

          return (
            `[Sheet ${idx + 1}: "${s.sheetName}"]\n` +
            `Records Processed: ${s.recordsCount} (Total Rows: ${s.totalRows})\n` +
            `Headers: ${s.columns.join(", ")}\n` +
            `Attendance Data: ${attSummary}\n` +
            `Calculated Earnings: ${earnSummary}\n` +
            `Gross (Earned): ${grossSummary}\n` +
            `Calculated Deductions: ${dedSummary}\n` +
            `Net Pay: ${netPaySummary}\n` +
            `Last Row: ${s.lastRowText}`
          );
        })
        .join("\n\n");

      emailSummaryText = `File: ${transformResult.transformedFilename}\nTotal Sheets Processed: ${transformResult.sheets.length}\nTotal Records Processed Across All Sheets: ${transformResult.recordsCount}\n\n${sheetSummaries}`;
    } else {
      const attendanceSummary =
        transformResult.details.attendance &&
        transformResult.details.attendance.length > 0
          ? transformResult.details.attendance.join(", ")
          : "None detected";
      const earningsSummary =
        transformResult.details.earnings.length > 0
          ? transformResult.details.earnings.join(", ")
          : "None";
      const grossSummary = transformResult.details.grossCol || "Not detected";
      const deductionsSummary =
        transformResult.details.deductions.length > 0
          ? transformResult.details.deductions.join(", ")
          : "None";
      const netPaySummary = transformResult.details.netPayCol || "Not detected";

      emailSummaryText =
        `File: ${transformResult.transformedFilename}\n` +
        `Total Records Processed: ${transformResult.recordsCount} (Total Rows: ${transformResult.totalRows})\n` +
        `Headers Included: ${transformResult.columns.join(", ")}\n` +
        `Attendance Data: ${attendanceSummary}\n` +
        `Calculated Earnings: ${earningsSummary}\n` +
        `Gross (Earned): ${grossSummary}\n` +
        `Calculated Deductions: ${deductionsSummary}\n` +
        `Net Pay: ${netPaySummary}\n` +
        `Last Row: ${transformResult.lastRowText}`;
    }

    // Read the transformed buffer to extract preview rows for ALL sheets (all entries + total row)
    const sheetsData: Array<{
      sheetName: string;
      recordsCount: number;
      totalRows: number;
      columns: string[];
      details: any;
      previewRows: (string | number)[][];
    }> = [];

    if (transformResult.sheets && transformResult.sheets.length > 0) {
      for (const s of transformResult.sheets) {
        sheetsData.push({
          sheetName: s.sheetName,
          recordsCount: s.recordsCount,
          totalRows: s.totalRows,
          columns: s.columns,
          details: s.details,
          previewRows: s.previewRows || [],
        });
      }
    } else {
      sheetsData.push({
        sheetName: transformResult.details?.sheetName || "Transformed Payroll",
        recordsCount: transformResult.recordsCount,
        totalRows: transformResult.totalRows,
        columns: transformResult.columns,
        details: transformResult.details,
        previewRows: transformResult.previewRows || [],
      });
    }

    const firstSheetPreview = sheetsData[0]?.previewRows || [];

    return json({
      success: true,
      originalFilename: filename,
      transformedFilename: transformResult.transformedFilename,
      recordsCount: transformResult.recordsCount,
      totalRows: transformResult.totalRows,
      lastRowText: transformResult.lastRowText,
      columns: transformResult.columns,
      details: transformResult.details,
      emailSummaryText,
      previewRows: firstSheetPreview,
      sheets: sheetsData,
      base64Transformed: transformResult.transformedBuffer.toString("base64"),
    });
  } catch (err: any) {
    console.error("[TestPayrollTransform] Execution error:", err);
    return json(
      {
        success: false,
        error: err?.message || String(err),
      },
      { status: 400 },
    );
  }
}
