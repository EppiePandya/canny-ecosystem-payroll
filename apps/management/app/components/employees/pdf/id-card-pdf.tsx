import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { format } from "date-fns";
import { replaceUnderscore } from "@canny_ecosystem/utils";
import { CANNY_MANAGEMENT_SERVICES_ADDRESS } from "@/constant";

export async function generateIdCardsPdf(employees: any[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryRed = rgb(0.5, 0.04, 0); // #800b00
  const black = rgb(0, 0, 0);
  const darkGray = rgb(0.2, 0.2, 0.2);

  // Group employees in chunks of 2 (each employee produces a pair: Front & Back side by side, 2 pairs = 4 cards per page)
  const chunkSize = 2;
  for (let i = 0; i < employees.length; i += chunkSize) {
    const chunk = employees.slice(i, i + chunkSize);
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();

    const cardWidth = 170;
    const cardHeight = 260;
    const gapX = 40;
    const gapY = 50;

    const startX = (width - (cardWidth * 2 + gapX)) / 2;
    let startY = height - 80 - cardHeight;

    for (let empIdx = 0; empIdx < chunk.length; empIdx++) {
      const emp = chunk[empIdx];
      const currentY = startY - empIdx * (cardHeight + gapY);

      // --- CARD FRONT ---
      const frontX = startX;
      page.drawRectangle({
        x: frontX,
        y: currentY,
        width: cardWidth,
        height: cardHeight,
        borderWidth: 1,
        borderColor: black,
        color: rgb(1, 1, 1),
      });

      // Front Header
      page.drawText("CONTRACT EMPLOYEE", {
        x: frontX + 10,
        y: currentY + cardHeight - 15,
        size: 6,
        font: boldFont,
        color: primaryRed,
      });

      const companyTitle = (emp.companyName || "CANNY MANAGEMENT").toUpperCase();
      page.drawText(companyTitle.substring(0, 22), {
        x: frontX + 15,
        y: currentY + cardHeight - 30,
        size: 9,
        font: boldFont,
        color: primaryRed,
      });

      // Photo placeholder box
      const photoBoxSize = 65;
      const photoX = frontX + (cardWidth - photoBoxSize) / 2;
      const photoY = currentY + cardHeight - 105;
      page.drawRectangle({
        x: photoX,
        y: photoY,
        width: photoBoxSize,
        height: photoBoxSize,
        borderWidth: 1.5,
        borderColor: primaryRed,
        color: rgb(0.95, 0.95, 0.95),
      });

      // Employee details
      let detailY = currentY + cardHeight - 120;
      const drawDetail = (label: string, value: string) => {
        page.drawText(`${label}:`, {
          x: frontX + 12,
          y: detailY,
          size: 6.5,
          font: boldFont,
          color: black,
        });
        page.drawText((value || "--").substring(0, 22), {
          x: frontX + 65,
          y: detailY,
          size: 6.5,
          font,
          color: black,
        });
        detailY -= 12;
      };

      drawDetail("Emp Code", emp.employeeCode || "");
      drawDetail("Name", (emp.name || "").toUpperCase());
      drawDetail("Designation", replaceUnderscore(emp.designation || ""));
      drawDetail("DOJ", emp.dateOfJoining ? format(new Date(emp.dateOfJoining), "dd/MM/yyyy") : "--");
      drawDetail("DOB", emp.dateOfBirth ? format(new Date(emp.dateOfBirth), "dd/MM/yyyy") : "--");
      drawDetail("Phone", emp.mobileNumber || "--");
      drawDetail("Location", (emp.contractLocation || "").substring(0, 18));

      // --- CARD BACK ---
      const backX = startX + cardWidth + gapX;
      page.drawRectangle({
        x: backX,
        y: currentY,
        width: cardWidth,
        height: cardHeight,
        borderWidth: 1,
        borderColor: black,
        color: rgb(1, 1, 1),
      });

      page.drawText("TERMS & CONDITIONS", {
        x: backX + 15,
        y: currentY + cardHeight - 20,
        size: 7,
        font: boldFont,
        color: primaryRed,
      });

      const terms = [
        "1. This card is property of the company.",
        "2. Must be presented on demand.",
        "3. If found, please return to company address.",
        "4. Non-transferable identity document.",
      ];
      let termY = currentY + cardHeight - 38;
      for (const term of terms) {
        page.drawText(term, {
          x: backX + 12,
          y: termY,
          size: 5.5,
          font,
          color: darkGray,
        });
        termY -= 10;
      }

      // Address on back
      termY -= 10;
      page.drawText("Residential Address:", {
        x: backX + 12,
        y: termY,
        size: 6,
        font: boldFont,
        color: black,
      });
      termY -= 10;
      page.drawText((emp.address || "--").substring(0, 80), {
        x: backX + 12,
        y: termY,
        size: 5.5,
        font,
        color: darkGray,
        maxWidth: cardWidth - 24,
        lineHeight: 8,
      });

      // Issuer on back
      page.drawText("Company Address & Contact:", {
        x: backX + 12,
        y: currentY + 45,
        size: 5.5,
        font: boldFont,
        color: primaryRed,
      });
      page.drawText(CANNY_MANAGEMENT_SERVICES_ADDRESS.substring(0, 70), {
        x: backX + 12,
        y: currentY + 35,
        size: 4.8,
        font,
        color: darkGray,
        maxWidth: cardWidth - 24,
        lineHeight: 7,
      });

      page.drawText("Authorized Signatory", {
        x: backX + cardWidth - 75,
        y: currentY + 12,
        size: 5.5,
        font: boldFont,
        color: black,
      });
    }
  }

  return await pdfDoc.save();
}

export function IdCardPDF({ employees }: { employees: any[]; baseUrl?: string }) {
  return (
    <div className="space-y-6 p-4">
      {employees.map((emp, i) => (
        <div key={emp.id || i} className="flex gap-4 p-4 border rounded bg-white shadow-sm max-w-xl mx-auto">
          {/* Front */}
          <div className="w-[170px] h-[260px] border border-black rounded p-3 text-[9px] flex flex-col justify-between relative bg-white">
            <div>
              <div className="text-[7px] font-bold text-red-800">CONTRACT EMPLOYEE</div>
              <div className="text-[10px] font-bold text-red-800 text-center truncate">{emp.companyName}</div>
              <div className="w-16 h-16 border border-red-800 rounded mx-auto my-2 bg-neutral-100 flex items-center justify-center text-[8px] text-neutral-400">
                PHOTO
              </div>
              <div className="space-y-0.5 text-[8px]">
                <div><span className="font-bold">Code:</span> {emp.employeeCode}</div>
                <div><span className="font-bold">Name:</span> {emp.name}</div>
                <div><span className="font-bold">Desig:</span> {emp.designation}</div>
                <div><span className="font-bold">DOJ:</span> {emp.dateOfJoining}</div>
                <div><span className="font-bold">DOB:</span> {emp.dateOfBirth}</div>
                <div><span className="font-bold">Phone:</span> {emp.mobileNumber}</div>
              </div>
            </div>
          </div>
          {/* Back */}
          <div className="w-[170px] h-[260px] border border-black rounded p-3 text-[8px] flex flex-col justify-between relative bg-white">
            <div>
              <div className="font-bold text-red-800 text-[8px] mb-1">TERMS & CONDITIONS</div>
              <ul className="text-[6.5px] space-y-0.5 text-neutral-600 list-disc pl-3">
                <li>Card is property of company.</li>
                <li>Present upon demand.</li>
                <li>Non-transferable document.</li>
              </ul>
              <div className="mt-2 text-[7px]">
                <div className="font-bold">Address:</div>
                <div className="text-neutral-600 line-clamp-3">{emp.address}</div>
              </div>
            </div>
            <div className="text-[6px] text-right font-bold pt-2 border-t">Authorized Signatory</div>
          </div>
        </div>
      ))}
    </div>
  );
}
