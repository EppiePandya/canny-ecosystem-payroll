import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type FormIVEmployeeData = {
  slNo?: string | number;
  employeeCode: string;
  name: string;
  designation: string;
  natureOfWork: string;
  department: string;
  totalDaysWorked: string | number;
  totalOvertimeHours: string | number;
  basicPay: string | number;
  da: string | number;
  otherAllowances: string | number;
  totalGrossWages: string | number;
  overtimeEarnings: string | number;
  totalEarnings: string | number;
  pfDeduction: string | number;
  esiDeduction: string | number;
  otherDeductions: string | number;
  totalDeductions: string | number;
  netPay: string | number;
  signature: string;
  establishmentName: string;
  establishmentAddress: string;
  employerName: string;
  ownerName: string;
  employerPanTan: string;
  registrationNumber: string;
  month: string;
  year: string | number;
};

export function FormIVPage({ emp }: { emp: FormIVEmployeeData }) {
  return (
    <div className="border border-black p-4 text-[9px] bg-white font-sans max-w-4xl mx-auto my-4 shadow-sm">
      <div className="text-center pb-2 border-b border-black">
        <h2 className="font-bold text-xs">FORM IV</h2>
        <p className="italic text-[8px]">[See Rule 78 (1) (a) (i)]</p>
        <p className="font-bold text-[9px] mt-1">REGISTER OF WAGES, OVERTIME & DEDUCTIONS</p>
      </div>

      <div className="grid grid-cols-2 gap-1 my-2 text-[8px]">
        <div><span className="font-bold">Establishment:</span> {emp.establishmentName}</div>
        <div><span className="font-bold">Employer:</span> {emp.employerName}</div>
        <div><span className="font-bold">Month / Year:</span> {emp.month} - {emp.year}</div>
        <div><span className="font-bold">Registration:</span> {emp.registrationNumber}</div>
      </div>

      <table className="w-full border-collapse border border-black text-[8px]">
        <thead>
          <tr className="bg-neutral-100 border-b border-black font-bold">
            <th className="p-1 border-r border-black">Code</th>
            <th className="p-1 border-r border-black">Name</th>
            <th className="p-1 border-r border-black">Desig</th>
            <th className="p-1 border-r border-black text-center">Days</th>
            <th className="p-1 border-r border-black text-right">Gross</th>
            <th className="p-1 border-r border-black text-right">Deductions</th>
            <th className="p-1 text-right">Net Pay</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black">
            <td className="p-1 border-r border-black">{emp.employeeCode}</td>
            <td className="p-1 border-r border-black">{emp.name}</td>
            <td className="p-1 border-r border-black">{emp.designation}</td>
            <td className="p-1 border-r border-black text-center">{emp.totalDaysWorked || 0}</td>
            <td className="p-1 border-r border-black text-right">{emp.totalGrossWages || 0}</td>
            <td className="p-1 border-r border-black text-right">{emp.totalDeductions || 0}</td>
            <td className="p-1 text-right font-bold">{emp.netPay || 0}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export async function generateFormIVPdf(employees: FormIVEmployeeData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const emp of employees) {
    const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
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
    page.drawText("FORM IV - REGISTER OF WAGES & OVERTIME", {
      x: width / 2 - 120,
      y,
      size: 11,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 25;

    page.drawText(`Establishment: ${emp.establishmentName || ""}`, { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
    page.drawText(`Month/Year: ${emp.month || ""} ${emp.year || ""}`, { x: 450, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
    y -= 20;

    const fields = [
      ["Employee Code", emp.employeeCode],
      ["Name", emp.name],
      ["Designation", emp.designation],
      ["Days Worked", String(emp.totalDaysWorked || 0)],
      ["Gross Wages", String(emp.totalGrossWages || 0)],
      ["PF Deduction", String(emp.pfDeduction || 0)],
      ["ESI Deduction", String(emp.esiDeduction || 0)],
      ["Total Deductions", String(emp.totalDeductions || 0)],
      ["Net Wages", String(emp.netPay || 0)],
    ];

    for (const [lbl, val] of fields) {
      page.drawText(`${lbl}:`, { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(String(val || "--"), { x: 180, y, size: 8, font, color: rgb(0, 0, 0) });
      y -= 16;
    }
  }

  return await pdfDoc.save();
}
