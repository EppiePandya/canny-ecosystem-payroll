import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getEmployeeById,
  getEmployeeDeathExitByExitId,
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

  const { data: deathexit } = await getEmployeeDeathExitByExitId({
    supabase,
    exitId,
  });

  const { data: statutory } = await getEmployeeStatutoryDetailsById({
    supabase,
    id: employeeId,
  });

  const { data: employee } = await getEmployeeById({
    supabase,
    id: employeeId,
  });
  if (!employee) throw new Response("Employee not found", { status: 404 });

  const __filename = fileURLToPath(import.meta.url);

  const __dirname = path.dirname(__filename);

  const { data, error } = await getExitPdfTemplateByName({
    supabase,
    fileName: "form_20_10D.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawText(`${employee.primary_mobile_number} `, {
    x: 940,
    y: 1555,
    size: 20,
    font,
  });

  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 600,
    y: 1100,
    size: 20,
    font,
  });

  page.drawText(`${employee.middle_name} ${employee.last_name}`, {
    x: 600,
    y: 1050,
    size: 20,
    font,
  });

  page.drawText(`${employee.marital_status} `, {
    x: 600,
    y: 960,
    size: 20,
    font,
  });

  page.drawText(formatPdfDate(statutory?.aadhaar_number), {
    x: 600,
    y: 880,
    size: 20,
    font,
  });

  page.drawText(formatPdfDate(statutory?.uan_number), {
    x: 600,
    y: 800,
    size: 20,
    font,
  });

  page.drawText(formatPdfDate(exit?.last_working_day), {
    x: 600,
    y: 650,
    size: 20,
    font,
  });

  page.drawText(formatPdfDate(deathexit.date_of_death), {
    x: 600,
    y: 275,
    size: 20,
    font,
  });

  page.drawText(deathexit.on_duty_esic ? "Yes" : "No", {
    x: 600,
    y: 198,
    size: 20,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `form_20_10D_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
