import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getEmployeeById,
  getEmployeeExitById,
  getEmployeeStatutoryDetailsById,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { formatPdfDate } from "@canny_ecosystem/utils";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_PLACE,
} from "@/constant";
import { getExitPdfTemplateByName } from "@canny_ecosystem/supabase/media";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });

  const employeeId = params.employeeId!;
  const exitId = params.employeeExitId!;

  if (!exitId) {
    throw new Response("Exit ID missing", { status: 400 });
  }

  const { data: exit } = await getEmployeeExitById({
    supabase,
    id: exitId,
  });

  if (!exit) {
    throw new Response("Exit not found", { status: 404 });
  }

  const { data: employee } = await getEmployeeById({
    supabase,
    id: employeeId,
  });
  if (!employee) throw new Response("Employee not found", { status: 404 });

  const { data: statutory } = await getEmployeeStatutoryDetailsById({
    supabase,
    id: employeeId,
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const { data, error } = await getExitPdfTemplateByName({
    supabase,
    fileName: "LSM.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  //Name
  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 390,
    y: 1442,
    size: 22,
    font,
  });

  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
    x: 330,
    y: 1396,
    size: 22,
    font,
  });

  page.drawText(CANNY_MANAGEMENT_SERVICES_PLACE, {
    x: 155,
    y: 1343,
    size: 22,
    font,
  });

  page.drawText(formatPdfDate(statutory?.pf_number), {
    x: 390,
    y: 1295,
    size: 22,
    font,
  });

  page.drawText(formatPdfDate(exit?.last_working_day), {
    x: 820,
    y: 1294,
    size: 22,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `LSM_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
