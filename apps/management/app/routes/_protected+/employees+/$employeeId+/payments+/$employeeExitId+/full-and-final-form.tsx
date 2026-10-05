import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCompanyById,
  getEmployeeById,
  getEmployeeExitById,
  getEmployeeWorkDetailsByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";
import { getExitPdfTemplateByName } from "@canny_ecosystem/supabase/media";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });

  const employeeId = params.employeeId!;
  const exitId = params.employeeExitId!;

  const { data: exit } = await getEmployeeExitById({ supabase, id: exitId });
  if (!exit) throw new Response("Exit not found", { status: 404 });

  const { data: employee } = await getEmployeeById({
    supabase,
    id: employeeId,
  });
  if (!employee) throw new Response("Employee not found", { status: 404 });

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
    fileName: "gratuity-full-and-final-form.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawText(`${employee.first_name} ${employee.last_name}` || "", {
    x: 323,
    y: 605,
    size: 11,
    font,
  });

  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME || "", {
    x: 335,
    y: 500,
    size: 11,
    font,
  });

  page.drawText(company?.name || "", {
    x: 220,
    y: 470,
    size: 11,
    font,
  });

  page.drawText(`${employee.first_name} ${employee.last_name}` || "", {
    x: 405,
    y: 266,
    size: 11,
    font,
  });

  page.drawText(workDetailForThisExit?.position || "", {
    x: 405,
    y: 238,
    size: 11,
    font,
  });

  page.drawText(employee?.primary_mobile_number || "", {
    x: 405,
    y: 197,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `gratuity-full-and_final_form_${employee.first_name}_${employee.last_name}.pdf`;
  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
