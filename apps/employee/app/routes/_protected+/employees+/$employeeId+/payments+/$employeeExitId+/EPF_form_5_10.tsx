import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  const { data: employeebankdetails } = await getEmployeeBankDetailsById({
    supabase,
    id: employeeId,
  });

  const { data: workDetails } = await getEmployeeWorkDetailsByEmployeeId({
    supabase,
    employeeId,
  });

  const workDetailForThisExit = workDetails?.find(
    (wd) => wd.employee_id === exit.employee_id,
  );

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const { data, error } = await getExitPdfTemplateByName({
    supabase,
    fileName: "EPF_Form_5_10.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  //for form 5
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

  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 192,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(`${employee.middle_name} ${employee.last_name}`, {
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

  page.drawText(formatPdfDate(workDetailForThisExit?.start_date), {
    x: 570,
    y: 370,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(employeebankdetails?.account_number), {
    x: 110,
    y: 370,
    size: 11,
    font,
  });

  //for form 10
  page.drawText(formatPdfDate(employeebankdetails?.account_number), {
    x: 110,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 192,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(`${employee.middle_name} ${employee.last_name}`, {
    x: 320,
    y: 197,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(employee.gender), {
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

  page.drawText(exit.pf_exit_reason, {
    x: 570,
    y: 197,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `EPF_form_5_10_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
