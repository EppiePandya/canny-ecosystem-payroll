import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCompanyById,
  getEmployeeAddressesByEmployeeId,
  getEmployeeById,
  getEmployeeExitById,
  getEmployeeWorkDetailsByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { formatPdfDate } from "@canny_ecosystem/utils";
import { CANNY_MANAGEMENT_SERVICES_PLACE } from "@/constant";
import { getExitPdfTemplateByName } from "@canny_ecosystem/supabase/media";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });

  const employeeId = params.employeeId!;
  const exitId = params.employeeExitId!;

  const { data: exit } = await getEmployeeExitById({
    supabase,
    id: exitId,
  });

  if (!exit) throw new Response("Exit data not found", { status: 404 });

  const { data: employee } = await getEmployeeById({
    supabase,
    id: employeeId,
  });
  if (!employee) throw new Response("Employee not found", { status: 404 });

  const { data: addresses } = await getEmployeeAddressesByEmployeeId({
    supabase,
    employeeId,
  });

  const { data: workDetails } = await getEmployeeWorkDetailsByEmployeeId({
    supabase,
    employeeId,
  });

  const { data: company } = await getCompanyById({
    supabase,
    id: employee.company_id!,
  });

  const workDetailForThisExit = workDetails?.find(
    (wd) => wd.employee_id === exit.employee_id,
  );

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const { data, error } = await getExitPdfTemplateByName({
    supabase,
    fileName: "gratuity-form-I.pdf",
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
    x: 191,
    y: 598,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(exit.last_working_day), {
    x: 191,
    y: 542,
    size: 11,
    font,
  });

  //1.Name in full
  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 191,
    y: 478,
    size: 11,
    font,
  });

  // 2. Address in full
  page.drawText(addresses?.[0]?.address_line_1 ?? "", {
    x: 193,
    y: 460,
    size: 11,
    font,
  });

  // 2. Address in full address
  page.drawText(addresses?.[0]?.city ?? "", {
    x: 315,
    y: 460,
    size: 11,
    font,
  });
  // 2. Address in full address
  page.drawText(addresses?.[0]?.state ?? "", {
    x: 395,
    y: 460,
    size: 11,
    font,
  });
  // 2. Address in full address
  page.drawText(addresses?.[0]?.pincode ?? "", {
    x: 430,
    y: 460,
    size: 11,
    font,
  });
  // 2. Address in full address
  page.drawText(addresses?.[0]?.address_line_2 ?? "", {
    x: 160,
    y: 443,
    size: 11,
    font,
  });

  // 3.
  page.drawText(company?.name, {
    x: 320,
    y: 428,
    size: 11,
    font,
  });

  // 5. Date of appointment
  page.drawText(formatPdfDate(workDetailForThisExit?.start_date), {
    x: 193,
    y: 393,
    size: 11,
    font,
  });

  // 6. Date and cause of termination
  page.drawText(formatPdfDate(exit.last_working_day), {
    x: 280,
    y: 378,
    size: 11,
    font,
  });

  //  exit reason
  page.drawText(formatPdfDate(exit.pf_exit_reason), {
    x: 340,
    y: 275,
    size: 11,
    font,
  });

  // Last field – place
  page.drawText(CANNY_MANAGEMENT_SERVICES_PLACE, {
    x: 107,
    y: 98,
    size: 11,
    font,
  });

  // Last field – Current date (dd/MM/yyyy)
  page.drawText(formatPdfDate(new Date()), {
    x: 107,
    y: 80,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `gratuity-form-i_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
