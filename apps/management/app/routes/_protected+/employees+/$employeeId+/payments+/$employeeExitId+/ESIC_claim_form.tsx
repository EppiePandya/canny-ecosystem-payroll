import type { LoaderFunctionArgs } from "@remix-run/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

import {
  getEmployeeById,
  getEmployeeDeathExitByExitId,
  getEmployeeExitById,
  getEmployeeStatutoryDetailsById,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { formatPdfDate } from "@canny_ecosystem/utils";
import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";
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

  const { data: employee } = await getEmployeeById({
    supabase,
    id: employeeId,
  });

  if (!employee) {
    throw new Response("Employee not found", { status: 404 });
  }

  const { data: statutory } = await getEmployeeStatutoryDetailsById({
    supabase,
    id: employeeId,
  });

  const { data, error } = await getExitPdfTemplateByName({
    supabase,
    fileName: "ESIC_Claim_form.pdf",
  });

  if (error || !data) {
    throw new Response("PDF download failed", { status: 500 });
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawText(`${employee.first_name} ${employee.last_name}`, {
    x: 255,
    y: 648,
    size: 11,
    font,
  });

  page.drawText(statutory?.esic_number ?? "", {
    x: 440,
    y: 648,
    size: 11,
    font,
  });

  page.drawText(formatPdfDate(deathexit?.date_of_death), {
    x: 440,
    y: 630,
    size: 11,
    font,
  });

  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
    x: 172,
    y: 613,
    size: 11,
    font,
  });

  const finalPdf = await pdfDoc.save();
  const fileName = `ESIC_CLAIM_${employee.first_name}_${employee.last_name}.pdf`;

  return new Response(finalPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
