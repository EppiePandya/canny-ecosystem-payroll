import { formatDate } from "@canny_ecosystem/utils";
import { LetterHeader } from "@canny_ecosystem/ui/letter-header";
import { LetterFooter } from "@canny_ecosystem/ui/letter-footer";
import type { IncidentsDatabaseType } from "@canny_ecosystem/supabase/queries";
import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

type IncidentLetterDocumentProps = {
  data: IncidentsDatabaseType;
  companyName: string;
};

export function IncidentLetterDocument({
  data,
  companyName,
}: IncidentLetterDocumentProps) {
  const employeeName = data.employees
    ? [
        data.employees.first_name,
        data.employees.middle_name,
        data.employees.last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  const vehicleInfo = data.vehicles
    ? `${data.vehicles.name} (${data.vehicles.registration_number})`
    : null;

  return (
    <div className="bg-white text-black p-8 max-w-3xl mx-auto shadow-sm text-sm font-sans relative min-h-[1000px] flex flex-col justify-between">
      <div>
        <div className="mb-6">
          <LetterHeader />
        </div>

        <div className="space-y-4">
          <div className="text-right text-xs font-medium text-neutral-600">
            Date: {formatDate(new Date())}
          </div>

          <div className="text-center my-4">
            <h1 className="text-lg font-bold underline tracking-wide">
              INCIDENT REPORT
            </h1>
          </div>

          <div className="border border-neutral-200 rounded p-4 space-y-2 text-xs">
            <div className="flex">
              <span className="w-32 font-bold text-neutral-700">Title:</span>
              <span className="flex-1">{data.title}</span>
            </div>
            <div className="flex">
              <span className="w-32 font-bold text-neutral-700">Date:</span>
              <span className="flex-1">{formatDate(data.date)}</span>
            </div>
            {employeeName && (
              <div className="flex">
                <span className="w-32 font-bold text-neutral-700">
                  Employee Name:
                </span>
                <span className="flex-1">{employeeName}</span>
              </div>
            )}
            {vehicleInfo && (
              <div className="flex">
                <span className="w-32 font-bold text-neutral-700">Vehicle:</span>
                <span className="flex-1">{vehicleInfo}</span>
              </div>
            )}
            <div className="flex">
              <span className="w-32 font-bold text-neutral-700">Location:</span>
              <span className="flex-1">
                {data.location_type} - {data.location}
              </span>
            </div>
            <div className="flex">
              <span className="w-32 font-bold text-neutral-700">Category:</span>
              <span className="flex-1">{data.category}</span>
            </div>
            <div className="flex">
              <span className="w-32 font-bold text-neutral-700">Severity:</span>
              <span className="flex-1">{data.severity}</span>
            </div>
            <div className="flex">
              <span className="w-32 font-bold text-neutral-700">Status:</span>
              <span className="flex-1">{data.status}</span>
            </div>
          </div>

          {data.description && (
            <div className="border border-neutral-200 rounded p-4 text-xs">
              <div className="font-bold text-neutral-700 mb-1">Description:</div>
              <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">
                {data.description}
              </p>
            </div>
          )}

          {data.diagnosis && (
            <div className="border border-neutral-200 rounded p-4 text-xs">
              <div className="font-bold text-neutral-700 mb-1">Diagnosis:</div>
              <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">
                {data.diagnosis}
              </p>
            </div>
          )}

          {data.action_taken && (
            <div className="border border-neutral-200 rounded p-4 text-xs">
              <div className="font-bold text-neutral-700 mb-1">Action Taken:</div>
              <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">
                {data.action_taken}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-8">
            <div className="text-right">
              <p className="font-bold text-xs">Authorized Signatory,</p>
              <p className="font-bold text-xs">{companyName}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-neutral-200">
        <LetterFooter />
      </div>
    </div>
  );
}

export async function generateIncidentLetterPdf(
  data: IncidentsDatabaseType,
  companyName: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 50;

  // Title
  page.drawText("INCIDENT REPORT", {
    x: width / 2 - 70,
    y,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 25;

  page.drawText(`Date: ${formatDate(new Date())}`, {
    x: width - 150,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 20;

  // Fields
  const drawField = (label: string, value: string) => {
    page.drawText(`${label}:`, {
      x: 50,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(value || "--", {
      x: 170,
      y,
      size: 9,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 16;
  };

  drawField("Title", data.title || "");
  drawField("Date", formatDate(data.date));

  const employeeName = data.employees
    ? [
        data.employees.first_name,
        data.employees.middle_name,
        data.employees.last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  if (employeeName) drawField("Employee Name", employeeName);

  if (data.vehicles) {
    drawField(
      "Vehicle",
      `${data.vehicles.name} (${data.vehicles.registration_number})`,
    );
  }

  drawField("Location", `${data.location_type || ""} - ${data.location || ""}`);
  drawField("Category", data.category || "");
  drawField("Severity", data.severity || "");
  drawField("Status", data.status || "");

  y -= 10;
  if (data.description) {
    page.drawText("Description:", {
      x: 50,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 14;
    page.drawText(data.description.substring(0, 400), {
      x: 50,
      y,
      size: 8.5,
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: 495,
      lineHeight: 12,
    });
    y -= 40;
  }

  if (data.action_taken) {
    page.drawText("Action Taken:", {
      x: 50,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 14;
    page.drawText(data.action_taken.substring(0, 300), {
      x: 50,
      y,
      size: 8.5,
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: 495,
      lineHeight: 12,
    });
    y -= 40;
  }

  // Signatory
  y = Math.max(y, 100);
  page.drawText("Authorized Signatory,", {
    x: width - 200,
    y: y - 20,
    size: 9,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(companyName, {
    x: width - 200,
    y: y - 35,
    size: 9,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  return await pdfDoc.save();
}
