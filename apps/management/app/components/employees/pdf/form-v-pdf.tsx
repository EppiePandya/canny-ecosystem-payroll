import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type FormVEmployeeData = {
  dateOfIssue: string;
  establishmentName: string;
  establishmentAddress: string;
  period: string;
  employeeCode: string;
  name: string;
  fatherHusbandName: string;
  designation: string;
  rateOfWages: number | string;
  rateVda: number | string;
  rateAllowances: number | string;
  daysWorked: number | string;
  earnedOt: number | string;
  totalEarned: number | string;
  deductionEpf: number | string;
  deductionEsic: number | string;
  deductionOthers: number | string;
  totalDeductions: number | string;
  netPayment: number | string;
};

export function FormVPage({ emp }: { emp: FormVEmployeeData }) {
  return (
    <div className="border border-black p-6 text-[10px] bg-white font-sans max-w-2xl mx-auto my-4 shadow-sm space-y-3">
      <div className="text-center pb-2 border-b border-black">
        <h2 className="font-bold text-xs">FORM V</h2>
        <p className="italic text-[8px]">(See rule 52)</p>
        <p className="font-bold text-[10px] mt-1">WAGE SLIP</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[9px] border-b border-black pb-2">
        <div><span className="font-bold">Date of issue:</span> {emp.dateOfIssue}</div>
        <div><span className="font-bold">Period:</span> {emp.period}</div>
        <div><span className="font-bold">Establishment:</span> {emp.establishmentName}</div>
        <div><span className="font-bold">Address:</span> {emp.establishmentAddress}</div>
        <div><span className="font-bold">Employee Code:</span> {emp.employeeCode}</div>
        <div><span className="font-bold">Name:</span> {emp.name}</div>
        <div><span className="font-bold">Father/Husband:</span> {emp.fatherHusbandName}</div>
        <div><span className="font-bold">Designation:</span> {emp.designation}</div>
      </div>

      <table className="w-full border-collapse border border-black text-[9px]">
        <tbody>
          <tr className="border-b border-black">
            <td className="p-1 border-r border-black font-semibold">Rate of Wages (Basic + VDA)</td>
            <td className="p-1 text-right">{Number(emp.rateOfWages || 0) + Number(emp.rateVda || 0)}</td>
          </tr>
          <tr className="border-b border-black">
            <td className="p-1 border-r border-black font-semibold">Total Days Worked</td>
            <td className="p-1 text-right">{emp.daysWorked || 0}</td>
          </tr>
          <tr className="border-b border-black">
            <td className="p-1 border-r border-black font-semibold">Total Earnings (Gross)</td>
            <td className="p-1 text-right">{emp.totalEarned || 0}</td>
          </tr>
          <tr className="border-b border-black">
            <td className="p-1 border-r border-black font-semibold">Total Deductions (EPF + ESIC + Other)</td>
            <td className="p-1 text-right">{emp.totalDeductions || 0}</td>
          </tr>
          <tr className="font-bold bg-neutral-50">
            <td className="p-1 border-r border-black">Net Amount Paid</td>
            <td className="p-1 text-right">{emp.netPayment || 0}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export async function generateFormVPdf(employees: FormVEmployeeData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const emp of employees) {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 35,
      y: 35,
      width: width - 70,
      height: height - 70,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    let y = height - 55;
    page.drawText("FORM V - WAGE SLIP", {
      x: width / 2 - 60,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    const fields = [
      ["Date of Issue", emp.dateOfIssue],
      ["Establishment", emp.establishmentName],
      ["Period", emp.period],
      ["Employee Code", emp.employeeCode],
      ["Name of Employee", emp.name],
      ["Father / Husband Name", emp.fatherHusbandName],
      ["Designation", emp.designation],
      ["Days Worked", String(emp.daysWorked || 0)],
      ["Gross Wages", String(emp.totalEarned || 0)],
      ["EPF Deduction", String(emp.deductionEpf || 0)],
      ["ESIC Deduction", String(emp.deductionEsic || 0)],
      ["Total Deductions", String(emp.totalDeductions || 0)],
      ["Net Payment", String(emp.netPayment || 0)],
    ];

    for (const [lbl, val] of fields) {
      page.drawText(`${lbl}:`, { x: 50, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(String(val || "--"), { x: 200, y, size: 8, font, color: rgb(0, 0, 0) });
      y -= 18;
    }
  }

  return await pdfDoc.save();
}
