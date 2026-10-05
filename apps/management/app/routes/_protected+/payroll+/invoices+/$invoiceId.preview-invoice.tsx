import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import {
  getCompanyById,
  getInvoiceById,
  getReimbursementEntriesByInvoiceIdForInvoicePreview,
  type EmployeeWorkDetailsDataType,
  getExitEntriesByInvoiceIdForInvoicePreview,
  getLocationById,
  getSalaryEntriesForInvoiceByInvoiceId,
  getUserById,
} from "@canny_ecosystem/supabase/queries";
import { updateInvoiceById } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type {
  CompanyDatabaseRow,
  EmployeeDatabaseRow,
  EmployeeStatutoryDetailsDatabaseRow,
  InvoiceDatabaseRow,
  LocationDatabaseRow,
  PayrollDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import {
  formatDateToSlash,
  getDefaultInvoiceSubject,
  getMonthNameFromNumber,
  hasPermission,
  updateRole,
} from "@canny_ecosystem/utils";
import {
  attribute,
  SUPABASE_LETTER_COMPONENTS_URL_PREFIX,
} from "@canny_ecosystem/utils/constant";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import {
  cacheKeyPrefix,
  CANNY_MANAGEMENT_SERVICES_GSTIN,
  CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER,
  CANNY_MANAGEMENT_SERVICES_PAN_NUMBER,
  CANNY_MANAGEMENT_SERVICES_NAME,
} from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import { EditableInvoiceToolbar } from "@/components/invoice/editable-preview/editable-invoice-toolbar";
import { EditableInvoiceDocument } from "@/components/invoice/editable-preview/editable-invoice-document";
import type { EditableInvoiceState } from "@/components/invoice/editable-preview/types";
import { calculateInvoiceTotals } from "@/components/invoice/editable-preview/calculator";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

type DataTypeForRegister = {
  month?: string;
  year?: number;
  payrollData: PayrollDatabaseRow;
  companyData: CompanyDatabaseRow & LocationDatabaseRow;
  employeeData: {
    attendance?: {
      working_days: number;
      weekly_off: number;
      paid_holidays: number;
      paid_days: number;
      paid_leaves: number;
      casual_leaves: number;
      absents: number;
    };
    employeeData: EmployeeDatabaseRow;
    employeeProjectAssignmentData?: EmployeeWorkDetailsDataType;
    employeeStatutoryDetails?: EmployeeStatutoryDetailsDatabaseRow;
    invoiceFields?: {
      name: string;
      amount: number;
    }[];
    earnings: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
  }[];
  invoiceDetails: InvoiceDatabaseRow & { payroll_data: any[] };
};

async function fetchAndEmbedImage(
  pdfDoc: PDFDocument,
  url: string,
): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    try {
      return await pdfDoc.embedPng(uint8);
    } catch {
      return await pdfDoc.embedJpg(uint8);
    }
  } catch (err) {
    console.error(`Failed to fetch or embed image from ${url}:`, err);
    return null;
  }
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: any,
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!word) continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function getInvoiceFilename(
  invoiceNumber: string | null | undefined,
  date: string | null | undefined,
): string {
  const invNum = (invoiceNumber || "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  let invDate = "";
  if (date) {
    try {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        invDate = `${day}-${month}-${year}`;
      }
    } catch {}
    if (!invDate) {
      const slash = formatDateToSlash(date);
      if (typeof slash === "string") {
        invDate = slash.replace(/\//g, "-");
      }
    }
  }

  const parts = ["invoice", invNum, invDate].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}

export async function generateInvoicePdfBytes(
  data: DataTypeForRegister,
  location: LocationDatabaseRow,
  type: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const details = data.invoiceDetails;
  const rawPayroll = Array.isArray(details?.payroll_data)
    ? details.payroll_data
    : typeof details?.payroll_data === "string"
      ? JSON.parse(details.payroll_data || "[]")
      : [];

  const metaItem = Array.isArray(rawPayroll)
    ? rawPayroll.find((item: any) => item?.field === "__meta__")
    : null;

  const parsedPayroll = [...rawPayroll]
    .filter((item: any) => item?.field !== "__meta__")
    .sort((a: any, b: any) => {
      const orderA =
        a?.order != null && a?.order !== "" ? Number(a.order) : Infinity;
      const orderB =
        b?.order != null && b?.order !== "" ? Number(b.order) : Infinity;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });

  const pdfTitle = getInvoiceFilename(details?.invoice_number, details?.date).replace(/\.pdf$/i, "");
  pdfDoc.setTitle(pdfTitle);

  const totals = calculateInvoiceTotals({
    payrollData: parsedPayroll,
    type,
    chargeAmount: Number(details?.charge_amount || 0),
    includeCgst: Boolean(details?.include_cgst),
    includeSgst: Boolean(details?.include_sgst),
    includeIgst: Boolean(details?.include_igst),
  });

  const margin = 40;
  const tableWidth = width - margin * 2; // 515.28

  // Letterhead Header (Top)
  if (details?.include_header) {
    const headerImage = await fetchAndEmbedImage(
      pdfDoc,
      `${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/letters-header.png`,
    );
    if (headerImage) {
      const headerDims = headerImage.scaleToFit(tableWidth, 75);
      page.drawImage(headerImage, {
        x: (width - headerDims.width) / 2,
        y: height - 12 - headerDims.height,
        width: headerDims.width,
        height: headerDims.height,
      });
    }
  }

  let y = height - 110;

  // Header Title
  const titleText = "Tax-Invoice";
  page.drawText(titleText, {
    x: width / 2 - boldFont.widthOfTextAtSize(titleText, 15) / 2,
    y,
    size: 15,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 24;

  // Invoice No & Date
  page.drawText(`Invoice no : ${details?.invoice_number || ""}`, {
    x: margin,
    y,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  const dateStr = `Date : ${details?.date ? formatDateToSlash(details.date) : ""}`;
  page.drawText(dateStr, {
    x: width - margin - boldFont.widthOfTextAtSize(dateStr, 9.5),
    y,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 16;

  // M/S. Company Details
  page.drawText("M/S.", {
    x: margin,
    y,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  const addressX = margin + 35;
  const addressWidth = tableWidth - 35;

  const drawUnderlinedLine = (text: string, isBold = false) => {
    if (text) {
      page.drawText(text, {
        x: addressX,
        y: y + 2,
        size: 9,
        font: isBold ? boldFont : font,
        color: rgb(0, 0, 0),
      });
    }
    page.drawLine({
      start: { x: addressX, y: y - 1 },
      end: { x: addressX + addressWidth, y: y - 1 },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
    y -= 12;
  };

  drawUnderlinedLine(data.companyData?.name || "Client", true);
  if (location?.address_line_1) {
    drawUnderlinedLine(location.address_line_1);
  }
  if (location?.address_line_2) {
    drawUnderlinedLine(location.address_line_2);
  }
  const cityState = [
    [location?.city, location?.pincode].filter(Boolean).join("-"),
    location?.state?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(", ");
  if (cityState) {
    drawUnderlinedLine(cityState);
  }
  drawUnderlinedLine(`GSTIN : ${location?.gst_number || ""}`, true);
  page.drawText(`Contact Person :- ${details?.user_id || ""}`, {
    x: addressX,
    y: y + 2,
    size: 9,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 10;

  // Table Geometry
  const tableTop = y;
  const colSrNoWidth = 44;
  const colAmountWidth = 85;
  const colPsWidth = 30;
  const colParticularsWidth =
    tableWidth - colSrNoWidth - colAmountWidth - colPsWidth;

  const xSrNo = margin;
  const xParticulars = xSrNo + colSrNoWidth;
  const xAmount = xParticulars + colParticularsWidth;
  const xPs = xAmount + colAmountWidth;
  const xRight = margin + tableWidth;

  const headerHeight = 18;

  // Header Row
  page.drawText("Sr No.", {
    x:
      xSrNo +
      (colSrNoWidth - boldFont.widthOfTextAtSize("Sr No.", 9.5)) / 2,
    y: tableTop - 12,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Particulars", {
    x:
      xParticulars +
      (colParticularsWidth - boldFont.widthOfTextAtSize("Particulars", 9.5)) / 2,
    y: tableTop - 12,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Amount Rs.", {
    x:
      xAmount +
      (colAmountWidth - boldFont.widthOfTextAtSize("Amount Rs.", 9.5)) / 2,
    y: tableTop - 12,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Ps", {
    x: xPs + (colPsWidth - boldFont.widthOfTextAtSize("Ps", 9.5)) / 2,
    y: tableTop - 12,
    size: 9.5,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  let curY = tableTop - headerHeight;

  // Header bottom line
  page.drawLine({
    start: { x: margin, y: curY },
    end: { x: xRight, y: curY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  curY -= 13;

  // Sr No 1
  page.drawText("1", {
    x: xSrNo + (colSrNoWidth - font.widthOfTextAtSize("1", 9.5)) / 2,
    y: curY,
    size: 9.5,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Subject Text (Properly wrapped line-by-line)
  if (details?.subject) {
    const rawLines = details.subject.split("\n");
    for (const rLine of rawLines) {
      const clean = rLine.replace(/^\*\*|\*\*$/g, "").trim();
      if (!clean) continue;
      const wrapped = wrapText(clean, colParticularsWidth - 12, 9, font);
      for (const wLine of wrapped) {
        page.drawText(wLine, {
          x: xParticulars + 6,
          y: curY,
          size: 9,
          font: font,
          color: rgb(0, 0, 0),
        });
        curY -= 13;
      }
    }
  }

  curY -= 6;

  // Left: Employee Count & Additional text
  const breakdownStartY = curY;
  const showEmployeeCount =
    (details as any)?.include_employee_count !== undefined
      ? Boolean((details as any).include_employee_count)
      : metaItem?.include_employee_count !== undefined
        ? Boolean(metaItem.include_employee_count)
        : type === "salary";

  if (showEmployeeCount) {
    const count =
      (details as any)?.employee_count !== undefined &&
      (details as any)?.employee_count !== null
        ? (details as any).employee_count
        : metaItem?.employee_count !== undefined &&
            metaItem?.employee_count !== null
          ? metaItem.employee_count
          : (data.employeeData?.length ?? 0);

    page.drawText(`Total Employees : ${count}`, {
      x: xParticulars + 6,
      y: breakdownStartY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }

  let addTextBottomY = breakdownStartY;
  if (details?.additional_text) {
    const rawParagraphs = String(details.additional_text).split("\n");
    let addY = showEmployeeCount ? breakdownStartY - 13 : breakdownStartY;
    for (const paragraph of rawParagraphs) {
      if (paragraph.trim() === "") {
        addY -= 7;
        continue;
      }
      const addLines = wrapText(
        paragraph,
        colParticularsWidth - 140,
        8.5,
        font,
      );
      for (const aLine of addLines) {
        page.drawText(aLine, {
          x: xParticulars + 6,
          y: addY,
          size: 8.5,
          font: font,
          color: rgb(0, 0, 0),
        });
        addY -= 11;
      }
    }
    addTextBottomY = addY;
  }

  // Right: Line Items Breakdown
  const breakdownLabelX = xParticulars + colParticularsWidth - 120;
  let itemY = breakdownStartY;

  const formatItemName = (name: string) => {
    const upper = (name || "").trim().toUpperCase();
    if (
      [
        "PF",
        "ESI",
        "EPF",
        "ESIC",
        "DA",
        "VDA",
        "HRA",
        "BONUS",
        "PT",
        "TDS",
      ].includes(upper)
    ) {
      return upper;
    }
    return name
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };

  for (const item of parsedPayroll) {
    page.drawText(formatItemName(item.field || ""), {
      x: breakdownLabelX,
      y: itemY,
      size: 9,
      font: font,
      color: rgb(0, 0, 0),
    });

    const amtStr = String(Math.round(Number(item.amount || 0)));
    page.drawText(amtStr, {
      x: xAmount + colAmountWidth - font.widthOfTextAtSize(amtStr, 9) - 10,
      y: itemY,
      size: 9,
      font: font,
      color: rgb(0, 0, 0),
    });

    page.drawText("0", {
      x: xPs + (colPsWidth - font.widthOfTextAtSize("0", 9)) / 2,
      y: itemY,
      size: 9,
      font: font,
      color: rgb(0, 0, 0),
    });

    itemY -= 14;
  }

  // Fixed/proportional bottom layout matching HTML
  const lowestItemY = Math.min(itemY, addTextBottomY);
  const totalsHeight = 84;
  const tableBottomY = Math.min(210, lowestItemY - totalsHeight - 15);
  const totalsTopY = tableBottomY + totalsHeight;
  const totalsGridLeftX = breakdownLabelX;

  // Statutory Details (Left Bottom)
  let statY = tableBottomY + 48;
  page.drawText(
    `HSN CODE NO. :- ${CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER}`,
    {
      x: xParticulars + 6,
      y: statY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    },
  );
  statY -= 14;
  page.drawText(
    `PAN NO. :- ${CANNY_MANAGEMENT_SERVICES_PAN_NUMBER}`,
    {
      x: xParticulars + 6,
      y: statY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    },
  );
  statY -= 14;
  page.drawText(
    `GSTIN :- ${CANNY_MANAGEMENT_SERVICES_GSTIN}`,
    {
      x: xParticulars + 6,
      y: statY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    },
  );
  statY -= 14;
  page.drawText(
    `TOTAL GSTIN AMOUNT :- ${Math.round(totals.totalGst)}`,
    {
      x: xParticulars + 6,
      y: statY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    },
  );

  // Totals Rows (Right Bottom)
  let tRowY = totalsTopY;
  const drawTotalRow = (
    label: string,
    amount: number,
    isBold = false,
    hasTopLine = true,
  ) => {
    if (hasTopLine) {
      page.drawLine({
        start: { x: xAmount, y: tRowY + 1 },
        end: { x: xRight, y: tRowY + 1 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
    }

    tRowY -= 14;
    page.drawText(label, {
      x: totalsGridLeftX - 6,
      y: tRowY + 3,
      size: 9,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });

    const amtStr = String(Math.round(amount));
    page.drawText(amtStr, {
      x:
        xAmount +
        colAmountWidth -
        (isBold ? boldFont : font).widthOfTextAtSize(amtStr, 9) -
        10,
      y: tRowY + 3,
      size: 9,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });

    page.drawText("0", {
      x:
        xPs +
        (colPsWidth - (isBold ? boldFont : font).widthOfTextAtSize("0", 9)) / 2,
      y: tRowY + 3,
      size: 9,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  };

  const chargeLabel =
    type === "reimbursement"
      ? "Reimbursement Charge"
      : type === "exit"
        ? "Exit Charge"
        : "Service Charge";
  drawTotalRow(
    `${chargeLabel} @ ${details?.charge_amount || 0}%`,
    totals.serviceCharge,
    false,
    false,
  );
  drawTotalRow("Total", totals.subtotal, true, true);
  drawTotalRow("C.G.S.T @ 9%", totals.cgst, false, true);
  drawTotalRow("S.G.S.T @ 9%", totals.sgst, false, true);
  drawTotalRow("I.G.S.T @ 18%", totals.igst, false, true);
  drawTotalRow("Grand Total", totals.grandTotal, true, true);

  // Full-width Bottom Line of Table Body (Under Grand Total)
  page.drawLine({
    start: { x: margin, y: tableBottomY },
    end: { x: xRight, y: tableBottomY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Rupees Row
  page.drawText(`Rupees :- ${totals.words}`, {
    x: margin + 6,
    y: tableBottomY - 14,
    size: 9,
    font: boldFont,
    color: rgb(0, 0, 0),
    maxWidth: tableWidth - 12,
  });

  const finalTableBottomY = tableBottomY - 20;
  page.drawLine({
    start: { x: margin, y: finalTableBottomY },
    end: { x: xRight, y: finalTableBottomY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Outer Table Box Lines & Continuous Vertical Column Dividers
  page.drawRectangle({
    x: margin,
    y: finalTableBottomY,
    width: tableWidth,
    height: tableTop - finalTableBottomY,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.8,
  });

  // Vertical Divider: Sr No
  page.drawLine({
    start: { x: xParticulars, y: tableTop },
    end: { x: xParticulars, y: tableBottomY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  // Vertical Divider: Particulars vs Amount Rs
  page.drawLine({
    start: { x: xAmount, y: tableTop },
    end: { x: xAmount, y: tableBottomY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  // Vertical Divider: Amount Rs vs Ps
  page.drawLine({
    start: { x: xPs, y: tableTop },
    end: { x: xPs, y: tableBottomY },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Notes & Payment Terms
  let noteY = finalTableBottomY - 14;
  page.drawText("Note :- Payment made only cross Cheque or DD favour of", {
    x: margin,
    y: noteY,
    size: 8.5,
    font,
    color: rgb(0, 0, 0),
  });
  noteY -= 12;
  page.drawText(`${CANNY_MANAGEMENT_SERVICES_NAME} `, {
    x: margin + 20,
    y: noteY,
    size: 9,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("payable at Ahmedabad", {
    x:
      margin +
      20 +
      boldFont.widthOfTextAtSize(`${CANNY_MANAGEMENT_SERVICES_NAME} `, 9),
    y: noteY,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  // Right Side: For. CANNY MANAGEMENT SERVICES PVT. LTD.
  const rightCompanyText = `For. ${CANNY_MANAGEMENT_SERVICES_NAME.toUpperCase()}`;
  const rightSigX =
    width - margin - boldFont.widthOfTextAtSize(rightCompanyText, 9.5);
  page.drawText(rightCompanyText, {
    x: rightSigX,
    y: noteY,
    size: 9,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  // Signatures Section
  const signatureY = noteY - 34;

  // Stamp & Signature Images
  if (details?.include_sign_stamp) {
    const stampImage = await fetchAndEmbedImage(
      pdfDoc,
      `${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/company-stamp.png`,
    );
    if (stampImage) {
      const stampDims = stampImage.scaleToFit(44, 44);
      page.drawImage(stampImage, {
        x: width - margin - 105,
        y: signatureY + 4,
        width: stampDims.width,
        height: stampDims.height,
      });
    }

    const signImage = await fetchAndEmbedImage(
      pdfDoc,
      `${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/signature.png`,
    );
    if (signImage) {
      const signDims = signImage.scaleToFit(65, 32);
      page.drawImage(signImage, {
        x: width - margin - 75,
        y: signatureY + 8,
        width: signDims.width,
        height: signDims.height,
      });
    }
  }

  page.drawLine({
    start: { x: margin, y: signatureY + 12 },
    end: { x: margin + 140, y: signatureY + 12 },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  page.drawText("Receiver's signature with seal", {
    x: margin,
    y: signatureY,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  const authSigText = "Authorized signature";
  const authSigX = width - margin - font.widthOfTextAtSize(authSigText, 9);
  page.drawText(authSigText, {
    x: authSigX,
    y: signatureY,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  // Letterhead Footer (Bottom)
  if (details?.include_header) {
    const footerImage = await fetchAndEmbedImage(
      pdfDoc,
      `${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/letters-footer.png`,
    );
    if (footerImage) {
      const footerScale = width / footerImage.width;
      const footerHeight = footerImage.height * footerScale;
      page.drawImage(footerImage, {
        x: 0,
        y: 0,
        width,
        height: footerHeight,
      });
    }
  }

  return await pdfDoc.save();
}

export async function getInvoicePreviewData({
  invoiceId,
  companyId,
  supabase,
}: {
  invoiceId: string;
  companyId: string;
  supabase: any;
}) {
  const { data: invoiceData, error: invoiceError } = await getInvoiceById({
    supabase,
    id: invoiceId,
  });

  if (invoiceError || !invoiceData) {
    throw new Error("Invoice not found");
  }

  const { data: userData } = await getUserById({
    supabase,
    userId: invoiceData.user_id || "",
  });

  const { data: employeeCompanyData } = await getCompanyById({
    supabase,
    id: invoiceData.company_id || companyId,
  });

  const { data: locationData } = await getLocationById({
    supabase,
    id: invoiceData.company_address_id || "",
  });

  let payrollDataAndOthers: any[] = [];
  if (invoiceData.type === "salary") {
    const { data: entries } = await getSalaryEntriesForInvoiceByInvoiceId({
      supabase,
      invoiceId,
    });
    payrollDataAndOthers = entries || [];
  } else if (invoiceData.type === "reimbursement") {
    const { data: entries } =
      await getReimbursementEntriesByInvoiceIdForInvoicePreview({
        supabase,
        invoiceId,
      });
    payrollDataAndOthers = entries || [];
  } else if (invoiceData.type === "exit") {
    const { data: entries } = await getExitEntriesByInvoiceIdForInvoicePreview({
      supabase,
      invoiceId,
    });
    payrollDataAndOthers = entries || [];
  }

  return {
    data: {
      invoiceData,
      employeeCompanyData,
      payrollDataAndOthers,
    },
    userData,
    locationData,
  };
}

export function transformDataForSalary(data: any, userData: any) {
  const company = data.employeeCompanyData;
  const location = data.locationData || data.employeesCompanyLocationData;
  const invoice = data.invoiceData;

  const companyData = {
    name: company?.name,
    address_line_1: location?.address_line_1,
    address_line_2: location?.address_line_2,
    city: location?.city,
    state: location?.state,
    pincode: location?.pincode,
  };

  const invoiceDetails = {
    invoice_number: invoice?.invoice_number,
    date: invoice?.date,
    subject: invoice?.subject,
    company_address_id: invoice?.company_address_id,
    payroll_data: invoice?.payroll_data,
    include_cgst: invoice?.include_cgst,
    include_sgst: invoice?.include_sgst,
    include_igst: invoice?.include_igst,
    include_charge: invoice?.include_charge,
    charge_amount: invoice?.charge_amount,
    include_header: invoice?.include_header,
    include_sign_stamp: invoice?.include_sign_stamp,
    type: invoice?.type,
    proof: invoice?.proof,
    additional_text: invoice?.additional_text,
    employee_count: (invoice as any)?.employee_count,
    include_employee_count: (invoice as any)?.include_employee_count,
    user_id: `${userData?.first_name ?? ""} ${userData?.last_name ?? ""}`,
  };

  const employeeData = (data?.payrollDataAndOthers || []).map((emp: any) => {
    const earnings: any[] = [];
    const deductions: any[] = [];

    for (const entry of emp?.salary_entries?.salary_field_values || []) {
      const name = entry?.payroll_fields?.name;
      const type = entry?.payroll_fields?.type ?? "earning";
      if (!name) continue;
      if (type === "deduction") {
        deductions.push({ name, amount: entry?.amount });
      } else {
        earnings.push({ name, amount: entry?.amount });
      }
    }

    return {
      employeeData: {
        first_name: emp?.employee?.first_name,
        middle_name: emp?.employee?.middle_name,
        last_name: emp?.employee?.last_name,
        employee_code: emp?.employee?.employee_code,
      },
      employeeProjectAssignmentData: {
        position: emp?.employee?.work_details?.position || "",
        department: emp?.employee?.work_details?.department || "",
        date_of_joining: emp?.employee?.work_details?.start_date || "",
      },
      employeeStatutoryDetails: {
        pf_number: emp?.employee?.employee_statutory_details?.pf_number || "",
        esic_number: emp?.employee?.employee_statutory_details?.esic_number || "",
        uan_number: emp?.employee?.employee_statutory_details?.uan_number || "",
      },
      attendance: {
        working_days: emp?.working_days ?? 0,
        weekly_off: 5,
        paid_holidays: emp?.paid_holidays ?? 0,
        paid_days: emp?.present_days ?? 0,
        paid_leaves: emp?.paid_leaves ?? 0,
        casual_leaves: emp?.casual_leaves ?? 0,
        absents: emp?.absent_days ?? 0,
      },
      earnings,
      deductions,
    };
  });

  return {
    month: getMonthNameFromNumber(data?.payrollDataAndOthers?.[0]?.month || 1),
    year: data?.payrollDataAndOthers?.[0]?.year || 2026,
    companyData,
    employeeData,
    invoiceDetails,
  };
}

export function transformReimbursementDataForPayroll(
  data: any,
  type: string,
  userData: any,
) {
  const company = data.employeeCompanyData;
  const location = data.locationData || data.employeesCompanyLocationData;
  const invoice = data.invoiceData;

  const companyData = {
    name: company?.name,
    address_line_1: location?.address_line_1,
    address_line_2: location?.address_line_2,
    city: location?.city,
    state: location?.state,
    pincode: location?.pincode,
  };

  const invoiceDetails = {
    invoice_number: invoice?.invoice_number,
    date: invoice?.date,
    subject: invoice?.subject,
    company_address_id: invoice?.company_address_id,
    payroll_data: invoice?.payroll_data,
    include_cgst: invoice?.include_cgst,
    include_sgst: invoice?.include_sgst,
    include_igst: invoice?.include_igst,
    include_charge: invoice?.include_charge,
    charge_amount: invoice?.charge_amount,
    include_header: invoice?.include_header,
    include_sign_stamp: invoice?.include_sign_stamp,
    type: invoice?.type,
    proof: invoice?.proof,
    additional_text: invoice?.additional_text,
    employee_count: (invoice as any)?.employee_count,
    include_employee_count: (invoice as any)?.include_employee_count,
    user_id: `${userData?.first_name ?? ""} ${userData?.last_name ?? ""}`,
  };

  const employeeData: any[] = [];
  if (type === "reimbursement") {
    for (const emp of data.payrollDataAndOthers || []) {
      const matchedAssignment = emp?.work_details;
      for (const entry of emp.reimbursements || []) {
        employeeData.push({
          employeeData: {
            first_name: emp?.first_name,
            middle_name: emp?.middle_name,
            last_name: emp?.last_name,
            employee_code: matchedAssignment?.employee_code,
          },
          invoiceFields: [
            {
              name: type.toUpperCase(),
              amount: entry?.amount,
            },
          ],
        });
      }
    }
  } else if (type === "exit") {
    for (const emp of data.payrollDataAndOthers || []) {
      const matchedAssignment = emp?.work_details;
      for (const entry of emp.employee_exit || []) {
        employeeData.push({
          employeeData: {
            first_name: emp?.first_name,
            middle_name: emp?.middle_name,
            last_name: emp?.last_name,
            employee_code: matchedAssignment?.employee_code,
          },
          invoiceFields: [
            {
              name: type.toUpperCase(),
              amount: entry.amount,
            },
          ],
        });
      }
    }
  }

  return {
    companyData,
    employeeData,
    invoiceDetails,
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const invoiceId = params.invoiceId as string;
  const url = new URL(request.url);
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  const canEdit = hasPermission(
    user?.role!,
    `${updateRole}:${attribute.invoice}`,
  );

  const previewData = await getInvoicePreviewData({
    invoiceId,
    companyId,
    supabase,
  });

  if (url.searchParams.get("pdf") === "true") {
    const { data, userData, locationData } = previewData;
    let registerData = [] as any;
    if (data?.invoiceData?.type === "salary") {
      registerData = transformDataForSalary(data, userData);
    } else if (
      data?.invoiceData?.type === "reimbursement" ||
      data?.invoiceData?.type === "exit"
    ) {
      registerData = transformReimbursementDataForPayroll(
        data,
        data?.invoiceData?.type,
        userData,
      );
    }

    const pdfBytes = await generateInvoicePdfBytes(
      registerData,
      locationData,
      data?.invoiceData?.type!,
    );

    const filename = getInvoiceFilename(
      data?.invoiceData?.invoice_number,
      data?.invoiceData?.date,
    );

    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  return json({
    ...previewData,
    canEdit,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const invoiceId = params.invoiceId as string;
  const { supabase } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.invoice}`)) {
    return json(
      {
        status: "error",
        message: "Unauthorized to update invoice",
        error: null,
      },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const invoiceNumber = formData.get("invoice_number") as string;
    const date = formData.get("date") as string;
    const subject = formData.get("subject") as string;
    const additionalText = formData.get("additional_text") as string;
    const userId = formData.get("user_id") as string;
    const payrollDataStr = formData.get("payroll_data") as string;
    const includeCharge = formData.get("include_charge") === "true";
    const chargeAmount = Number(formData.get("charge_amount") || 0);
    const includeCgst = formData.get("include_cgst") === "true";
    const includeSgst = formData.get("include_sgst") === "true";
    const includeIgst = formData.get("include_igst") === "true";
    const includeHeader = formData.get("include_header") === "true";
    const includeSignStamp = formData.get("include_sign_stamp") === "true";

    const updateData: any = {
      invoice_number: invoiceNumber,
      date: date,
      subject: subject,
      additional_text:
        additionalText && additionalText.trim() !== "" ? additionalText : null,
      payroll_data: payrollDataStr ? payrollDataStr : "[]",
      include_charge: includeCharge,
      charge_amount: chargeAmount,
      include_cgst: includeCgst,
      include_sgst: includeSgst,
      include_igst: includeIgst,
      include_header: includeHeader,
      include_sign_stamp: includeSignStamp,
    };

    if (userId) {
      updateData.user_id = userId;
    }

    const { error } = await updateInvoiceById({
      supabase,
      invoiceId,
      data: updateData,
    });

    if (error) {
      return json(
        {
          status: "error",
          message: error.message || "Failed to update invoice",
          error,
        },
        { status: 400 },
      );
    }

    clearExactCacheEntry(`${cacheKeyPrefix.payroll_invoice}`);

    return json({
      status: "success",
      message: "Invoice updated successfully",
      error: null,
    });
  } catch (error: any) {
    console.error("Error in preview-invoice action:", error);
    return json(
      {
        status: "error",
        message: error?.message || "An unexpected error occurred",
        error,
      },
      { status: 500 },
    );
  }
}

export async function generateInvoicePDFBuffer({
  invoiceId,
  supabase,
  companyId,
}: {
  invoiceId: string;
  supabase: any;
  companyId: string;
}): Promise<Buffer> {
  const result = await getInvoicePreviewData({
    invoiceId,
    companyId,
    supabase,
  });
  const { data, userData, locationData } = result;

  let registerData = [] as any;
  if (data?.invoiceData?.type === "salary") {
    registerData = transformDataForSalary(data, userData);
  } else if (
    data?.invoiceData?.type === "reimbursement" ||
    data?.invoiceData?.type === "exit"
  ) {
    registerData = transformReimbursementDataForPayroll(
      data,
      data?.invoiceData?.type,
      userData,
    );
  }

  const bytes = await generateInvoicePdfBytes(
    registerData,
    locationData,
    data?.invoiceData?.type!,
  );
  return Buffer.from(bytes);
}

export default function PreviewInvoice() {
  const { data, locationData, userData, canEdit } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { isDocument } = useIsDocument();
  const fetcher = useFetcher<any>();
  const { toast } = useToast();

  const invoice = data?.invoiceData;

  const [viewMode, setViewMode] = useState<"edit" | "pdf">("pdf");

  const initialInvoiceState: EditableInvoiceState = useMemo(() => {
    const rawPayroll = invoice?.payroll_data;
    const parsedPayroll = Array.isArray(rawPayroll)
      ? rawPayroll
      : typeof rawPayroll === "string"
        ? JSON.parse(rawPayroll || "[]")
        : [];

    const metaItem = parsedPayroll.find(
      (item: any) => item?.field === "__meta__",
    );

    const sortedPayroll = [...parsedPayroll]
      .filter((item: any) => item?.field !== "__meta__")
      .sort((a: any, b: any) => {
        const orderA =
          a?.order != null && a?.order !== "" ? Number(a.order) : Infinity;
        const orderB =
          b?.order != null && b?.order !== "" ? Number(b.order) : Infinity;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
      });

    const defaultEmployeeCount = data?.payrollDataAndOthers?.length ?? 0;
    const resolvedEmployeeCount =
      metaItem?.employee_count !== undefined && metaItem?.employee_count !== null
        ? metaItem.employee_count
        : defaultEmployeeCount;

    const resolvedIncludeEmployeeCount =
      metaItem?.include_employee_count !== undefined
        ? Boolean(metaItem.include_employee_count)
        : (invoice?.type as string) === "salary";

    return {
      id: invoice?.id,
      invoice_number: invoice?.invoice_number || "",
      date: invoice?.date || new Date().toISOString(),
      subject:
        invoice?.subject ||
        getDefaultInvoiceSubject(invoice?.type as string),
      additional_text: invoice?.additional_text || "",
      employee_count: resolvedEmployeeCount,
      include_employee_count: resolvedIncludeEmployeeCount,
      user_id:
        invoice?.user_id ||
        `${userData?.first_name ?? ""} ${userData?.last_name ?? ""}`.trim(),
      company_address_id: invoice?.company_address_id,
      company_id: invoice?.company_id,
      type: (invoice?.type as "salary" | "reimbursement" | "exit") || "salary",
      payroll_data: sortedPayroll,
      include_charge: Boolean(invoice?.include_charge),
      charge_amount: Number(invoice?.charge_amount || 0),
      include_cgst: Boolean(invoice?.include_cgst),
      include_sgst: Boolean(invoice?.include_sgst),
      include_igst: Boolean(invoice?.include_igst),
      include_header: Boolean(invoice?.include_header),
      include_sign_stamp: Boolean(invoice?.include_sign_stamp),
    };
  }, [invoice, userData]);

  const [invoiceState, setInvoiceState] =
    useState<EditableInvoiceState>(initialInvoiceState);

  useEffect(() => {
    setInvoiceState(initialInvoiceState);
  }, [initialInvoiceState]);

  const isDirty = useMemo(() => {
    return JSON.stringify(invoiceState) !== JSON.stringify(initialInvoiceState);
  }, [invoiceState, initialInvoiceState]);

  const isSaving =
    fetcher.state === "submitting" || fetcher.state === "loading";

  const handleStateChange = (updates: Partial<EditableInvoiceState>) => {
    setInvoiceState((prev) => ({ ...prev, ...updates }));
  };

  const handleReset = () => {
    setInvoiceState(initialInvoiceState);
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("invoice_number", invoiceState.invoice_number);
    formData.append("date", invoiceState.date);
    formData.append("subject", invoiceState.subject);
    formData.append("additional_text", invoiceState.additional_text || "");
    formData.append("user_id", invoiceState.user_id || "");
    const payrollToSave = [
      ...invoiceState.payroll_data.filter((item) => item.field !== "__meta__"),
    ];

    if (
      invoiceState.employee_count !== undefined ||
      invoiceState.include_employee_count !== undefined
    ) {
      payrollToSave.push({
        field: "__meta__",
        amount: 0,
        type: "meta",
        order: 99999,
        employee_count: invoiceState.employee_count,
        include_employee_count: invoiceState.include_employee_count,
      } as any);
    }

    formData.append("payroll_data", JSON.stringify(payrollToSave));
    formData.append("include_charge", String(invoiceState.include_charge));
    formData.append("charge_amount", String(invoiceState.charge_amount));
    formData.append("include_cgst", String(invoiceState.include_cgst));
    formData.append("include_sgst", String(invoiceState.include_sgst));
    formData.append("include_igst", String(invoiceState.include_igst));
    formData.append("include_header", String(invoiceState.include_header));
    formData.append(
      "include_sign_stamp",
      String(invoiceState.include_sign_stamp),
    );

    fetcher.submit(formData, { method: "POST" });
  };

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.status === "success") {
      toast({
        title: "Success",
        description: fetcher.data.message || "Invoice updated successfully",
        variant: "success",
      });
    } else if (fetcher.data.status === "error") {
      toast({
        title: "Error",
        description: fetcher.data.message || "Failed to update invoice",
        variant: "destructive",
      });
    }
  }, [fetcher.data, toast]);

  const filename = useMemo(() => {
    return getInvoiceFilename(invoiceState.invoice_number, invoiceState.date);
  }, [invoiceState.invoice_number, invoiceState.date]);

  const getExportRegisterData = () => {
    let registerData = [] as any;
    if (invoiceState.type === "salary") {
      registerData = transformDataForSalary(
        {
          ...data,
          invoiceData: { ...data?.invoiceData, ...invoiceState },
        },
        userData,
      );
    } else if (
      invoiceState.type === "reimbursement" ||
      invoiceState.type === "exit"
    ) {
      registerData = transformReimbursementDataForPayroll(
        {
          ...data,
          invoiceData: { ...data?.invoiceData, ...invoiceState },
        },
        invoiceState.type,
        userData,
      );
    }
    return registerData;
  };

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;

    async function updatePdfPreview() {
      setIsGeneratingPdf(true);
      try {
        const registerData = getExportRegisterData();
        const pdfBytes = await generateInvoicePdfBytes(
          registerData,
          locationData,
          invoiceState.type,
        );
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        if (isMounted) {
          currentUrl = url;
          setPdfBlobUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error("Failed to generate PDF preview:", err);
      } finally {
        if (isMounted) {
          setIsGeneratingPdf(false);
        }
      }
    }

    if (viewMode === "pdf") {
      updatePdfPreview();
    }

    return () => {
      isMounted = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [viewMode, invoiceState, locationData, userData, data]);

  const handleDownload = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (!pdfBlobUrl) return;
    const printWindow = window.open(pdfBlobUrl);
    if (printWindow) {
      printWindow.focus();
      printWindow.print();
    }
  };

  const handleClose = () => {
    navigate("/payroll/invoices");
  };

  if (!isDocument) return <div>Loading...</div>;

  return (
    <Dialog defaultOpen={true} onOpenChange={handleClose}>
      <DialogContent
        className="w-full max-w-5xl h-[92vh] max-h-[95vh] border border-neutral-200 dark:border-neutral-800 rounded-lg p-0 flex flex-col overflow-hidden bg-background"
        disableIcon={true}
      >
        <EditableInvoiceToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          state={invoiceState}
          onChange={handleStateChange}
          onSave={handleSave}
          onReset={handleReset}
          onClose={handleClose}
          onDownload={handleDownload}
          onPrint={handlePrint}
          isSaving={isSaving}
          isDirty={isDirty}
          canEdit={Boolean(canEdit)}
        />

        <div className="flex-1 w-full min-h-0 bg-neutral-100 dark:bg-neutral-900/50 flex flex-col overflow-hidden">
          {viewMode === "pdf" ? (
            isGeneratingPdf && !pdfBlobUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
                <Spinner className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating PDF Preview...</span>
              </div>
            ) : pdfBlobUrl ? (
              <object
                data={pdfBlobUrl}
                type="application/pdf"
                className="w-full h-full min-h-[500px] flex-1"
              >
                <iframe
                  src={pdfBlobUrl}
                  className="w-full h-full border-0"
                  title={filename.replace(/\.pdf$/i, "")}
                >
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                    <p className="text-muted-foreground text-sm">
                      Unable to preview PDF directly in browser.
                    </p>
                    <a
                      href={pdfBlobUrl}
                      download={filename}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
                    >
                      Open / Download PDF
                    </a>
                  </div>
                </iframe>
              </object>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
                <p className="text-sm">Failed to generate PDF preview.</p>
              </div>
            )
          ) : (
            <div className="flex-1 w-full overflow-y-auto min-h-0">
              <EditableInvoiceDocument
                state={invoiceState}
                onChange={handleStateChange}
                companyName={data?.employeeCompanyData?.name}
                location={locationData}
                employeeCount={
                  invoiceState.employee_count !== undefined &&
                  invoiceState.employee_count !== null
                    ? Number(invoiceState.employee_count)
                    : (data?.payrollDataAndOthers?.length ?? 0)
                }
                canEdit={Boolean(canEdit)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
