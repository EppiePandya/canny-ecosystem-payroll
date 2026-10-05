import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getEmployeeAddressesByEmployeeId,
  getEmployeeById,
  getEmployeeExitById,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_PLACE,
} from "@/constant";
import { formatPdfDate } from "@canny_ecosystem/utils";
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

  const { data: addresses } = await getEmployeeAddressesByEmployeeId({
    supabase,
    employeeId,
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const { data, error } = await getExitPdfTemplateByName({
    supabase,
    fileName: "gratuity-form-L.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 110,
    y: 605,
    size: 11,
    font,
  });

  page.drawText(addresses?.[0]?.address_line_1 ?? "", {
    x: 80,
    y: 590,
    size: 11,
    font,
  });

  // 2. Address in full address
  page.drawText(addresses?.[0]?.city ?? "", {
    x: 210,
    y: 590,
    size: 11,
    font,
  });
  // 2. Address in full address
  page.drawText(addresses?.[0]?.state ?? "", {
    x: 290,
    y: 590,
    size: 11,
    font,
  });
  // 2. Address in full address
  page.drawText(addresses?.[0]?.pincode ?? "", {
    x: 330,
    y: 590,
    size: 11,
    font,
  });

  // 2. Address in full address
  page.drawText(addresses?.[0]?.address_line_2 ?? "", {
    x: 370,
    y: 590,
    size: 11,
    font,
  });

  // Last field – place
  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
    x: 162,
    y: 490,
    size: 11,
    font,
  });

  // Last field – place
  page.drawText(CANNY_MANAGEMENT_SERVICES_PLACE, {
    x: 162,
    y: 473,
    size: 11,
    font,
  });

  // Last field – place
  page.drawText(CANNY_MANAGEMENT_SERVICES_PLACE, {
    x: 107,
    y: 186,
    size: 11,
    font,
  });

  // Last field – Current date (dd/MM/yyyy)
  page.drawText(formatPdfDate(new Date()), {
    x: 107,
    y: 167,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `gratuity-form-L_${employee.first_name}_${employee.last_name}.pdf`;
  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
