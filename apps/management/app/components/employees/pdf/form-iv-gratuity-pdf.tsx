import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type FormIVGratuityEmployeeData = {
  employeeCode: string;
  name: string;
  department: string;
  postHeld: string;
  establishmentName: string;
  establishmentAddress: string;
  reasonForLeaving: string;
  lastDrawnSalary: string | number;
  totalServicePeriod: string;
  amountClaimed: string | number;
  address: string;
  date: string;
};

export function FormIVGratuityPage({ emp }: { emp: FormIVGratuityEmployeeData }) {
  return (
    <div className="border border-black p-6 text-[10px] bg-white font-sans max-w-4xl mx-auto my-4 shadow-sm space-y-4">
      <div className="text-center pb-2 border-b border-black">
        <h2 className="font-bold text-xs">FORM IV (GRATUITY)</h2>
        <p className="italic text-[9px]">[See sub-rule (1) of rule 7]</p>
        <p className="font-bold text-[10px] mt-1">Application for Gratuity by an Employee</p>
      </div>

      <div className="space-y-2 text-[9px]">
        <div>To, <br /><span className="font-bold">{emp.establishmentName}</span><br />{emp.establishmentAddress}</div>
        <p className="mt-4">Sir,</p>
        <p>I beg to apply for payment of gratuity to which I am entitled under sub-section (1) of section 4 of the Payment of Gratuity Act, 1972.</p>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div><span className="font-bold">Name:</span> {emp.name}</div>
          <div><span className="font-bold">Employee Code:</span> {emp.employeeCode}</div>
          <div><span className="font-bold">Department:</span> {emp.department}</div>
          <div><span className="font-bold">Post Held:</span> {emp.postHeld}</div>
          <div><span className="font-bold">Reason for Leaving:</span> {emp.reasonForLeaving}</div>
          <div><span className="font-bold">Last Drawn Salary:</span> {emp.lastDrawnSalary}</div>
          <div><span className="font-bold">Total Service:</span> {emp.totalServicePeriod}</div>
          <div><span className="font-bold">Amount Claimed:</span> {emp.amountClaimed}</div>
        </div>
      </div>

      <div className="flex justify-between pt-8 text-[9px]">
        <div>Date: {emp.date || "--"}</div>
        <div>Signature / Thumb Impression of Applicant</div>
      </div>
    </div>
  );
}

export async function generateFormIVGratuityPdf(employees: FormIVGratuityEmployeeData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const emp of employees) {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 30,
      y: 30,
      width: width - 60,
      height: height - 60,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    let y = height - 50;
    page.drawText("FORM IV - APPLICATION FOR GRATUITY", {
      x: width / 2 - 120,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    page.drawText(`To: ${emp.establishmentName || ""}`, { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
    y -= 25;

    const fields = [
      ["Employee Code", emp.employeeCode],
      ["Name of Employee", emp.name],
      ["Department", emp.department],
      ["Post Held", emp.postHeld],
      ["Reason for Leaving", emp.reasonForLeaving],
      ["Last Drawn Salary", String(emp.lastDrawnSalary || "")],
      ["Total Service Period", emp.totalServicePeriod],
      ["Amount Claimed", String(emp.amountClaimed || "")],
      ["Address", emp.address],
    ];

    for (const [lbl, val] of fields) {
      page.drawText(`${lbl}:`, { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(String(val || "--"), { x: 180, y, size: 8, font, color: rgb(0, 0, 0) });
      y -= 18;
    }

    page.drawText("Signature / Thumb impression of Applicant", {
      x: width - 230,
      y: 60,
      size: 8,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
}
