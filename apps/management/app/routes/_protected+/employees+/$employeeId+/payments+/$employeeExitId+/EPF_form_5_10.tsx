import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  getEmployeeBankDetailsById,
  getEmployeeById,
  getEmployeeExitById,
  getEmployeeWorkDetailsByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { formatPdfDate, wrapText } from "@canny_ecosystem/utils";
import {
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_NAME,
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
    supabase: supabase as any,
    id: exitId,
  });

  if (!exit) {
    throw new Response("Exit not found", { status: 404 });
  }

  const { data: employee } = await getEmployeeById({
    supabase: supabase as any,
    id: employeeId,
  });

  if (!employee) {
    throw new Response("Employee not found", { status: 404 });
  }

  const { data: employeebankdetails } = await getEmployeeBankDetailsById({
    supabase: supabase as any,
    id: employeeId,
  });

  const { data: workDetails } = await getEmployeeWorkDetailsByEmployeeId({
    supabase: supabase as any,
    employeeId,
  });

  const { data, error } = await getExitPdfTemplateByName({
    supabase: supabase as any,
    fileName: "EPF_Form_5_10.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
    x: 120,
    y: 506,
    size: 11,
    font,
  });

  const addressLines = wrapText(CANNY_MANAGEMENT_SERVICES_ADDRESS, 45);

  let startY = 490;
  const gap = 12;

  addressLines.forEach((line, index) => {
    page.drawText(line, {
      x: 120,
      y: startY - index * gap,
      size: 11,
      font,
    });
  });

  page.drawText(`${employee.first_name} ${employee.last_name} `, {
    x: 192,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(`${employee.middle_name} ${employee.last_name} `, {
    x: 320,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(employee.date_of_birth), {
    x: 440,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(employee.gender, {
    x: 520,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate((workDetails as any)?.[0]?.start_date), {
    x: 570,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(`${employeebankdetails?.account_number ?? ""} `, {
    x: 110,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(`${employeebankdetails?.account_number ?? ""} `, {
    x: 110,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(`${employee.first_name} ${employee.last_name} `, {
    x: 192,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(`${employee.middle_name} ${employee.last_name} `, {
    x: 320,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(employee.gender, {
    x: 455,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(exit.last_working_day), {
    x: 505,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(addressLines?.[0] ?? "", {
    x: 570,
    y: 197,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();

  const fileName = `EPF_form_5_10_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename = "${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
