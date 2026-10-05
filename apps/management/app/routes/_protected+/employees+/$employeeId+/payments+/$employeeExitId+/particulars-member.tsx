import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getEmployeeById,
  getEmployeeExitById,
  getEmployeeStatutoryDetailsById,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { formatPdfDate } from "@canny_ecosystem/utils";
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
    fileName: "particulars-member.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 220,
    y: 713,
    size: 11,
    font,
  });

  page.drawText(`${employee.middle_name} ${employee.last_name}`, {
    x: 220,
    y: 690,
    size: 11,
    font,
  });

  page.drawText(statutory?.pf_number ?? "", {
    x: 220,
    y: 668,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(employee.date_of_birth), {
    x: 220,
    y: 620,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `particulars-member_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
