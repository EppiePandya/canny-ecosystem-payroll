import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type FormIIIEmployeeData = {
  employeeCode: string;
  nameFull: string;
  fatherSpouseName: string;
  dateOfBirth: string;
  uan: string;
  gender: string;
  religion: string;
  maritalStatus: string;
  department: string;
  postHeld: string;
  dateOfAppointment: string;
  dateOfSuperannuation: string;
  village: string;
  postOffice: string;
  thana: string;
  subDivision: string;
  district: string;
  state: string;
  pincode: string;
  personalEmail: string;
  mobileNumber: string;
  establishmentName: string;
  establishmentAddress: string;
  nominees: Array<{
    nameFull: string;
    relationship: string;
    age: string;
    aadhaar: string;
    proportion: string;
  }>;
};

export function FormIIIPage({ emp }: { emp: FormIIIEmployeeData }) {
  const nominees = emp.nominees?.length ? emp.nominees : [{ nameFull: "", relationship: "", age: "", aadhaar: "", proportion: "" }];

  return (
    <div className="border border-black p-6 text-[10px] bg-white font-sans max-w-4xl mx-auto my-4 shadow-sm space-y-4">
      <div className="text-center pb-2 border-b border-black">
        <h2 className="font-bold text-xs">FORM-III</h2>
        <p className="italic text-[9px]">[(See rules 32 (1),(2), (3) and (4)] [For the purpose of Chapter-V]</p>
        <p className="font-bold text-[10px] mt-1">Nomination / Fresh Nomination / Modification of Nomination</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <div><span className="font-bold">Establishment:</span> {emp.establishmentName}</div>
        <div><span className="font-bold">Address:</span> {emp.establishmentAddress}</div>
        <div><span className="font-bold">Employee Code:</span> {emp.employeeCode}</div>
        <div><span className="font-bold">Name:</span> {emp.nameFull}</div>
        <div><span className="font-bold">Father/Spouse:</span> {emp.fatherSpouseName}</div>
        <div><span className="font-bold">DOB:</span> {emp.dateOfBirth}</div>
        <div><span className="font-bold">UAN:</span> {emp.uan}</div>
        <div><span className="font-bold">Gender / Marital:</span> {emp.gender} / {emp.maritalStatus}</div>
        <div><span className="font-bold">Department / Post:</span> {emp.department} / {emp.postHeld}</div>
        <div><span className="font-bold">DOA:</span> {emp.dateOfAppointment}</div>
      </div>

      <div className="pt-2">
        <div className="font-bold text-[10px] mb-1">Nomination Table</div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr className="bg-neutral-50 border-b border-black">
              <th className="p-1 border-r border-black text-left">Name of Nominee</th>
              <th className="p-1 border-r border-black text-left">Relationship</th>
              <th className="p-1 border-r border-black text-center">Age</th>
              <th className="p-1 border-r border-black text-left">Aadhaar</th>
              <th className="p-1 text-center">Proportion (%)</th>
            </tr>
          </thead>
          <tbody>
            {nominees.map((n, i) => (
              <tr key={i} className="border-b border-black">
                <td className="p-1 border-r border-black">{n.nameFull || "--"}</td>
                <td className="p-1 border-r border-black">{n.relationship || "--"}</td>
                <td className="p-1 border-r border-black text-center">{n.age || "--"}</td>
                <td className="p-1 border-r border-black">{n.aadhaar || "--"}</td>
                <td className="p-1 text-center">{n.proportion || "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between pt-8 text-[9px]">
        <div>Date: ________________</div>
        <div>Signature / Thumb Impression of Employee</div>
      </div>
    </div>
  );
}

export async function generateFormIIIPdf(employees: FormIIIEmployeeData[]): Promise<Uint8Array> {
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
    page.drawText("FORM-III - NOMINATION FORM", {
      x: width / 2 - 90,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 25;

    page.drawText(`Establishment: ${emp.establishmentName || ""}`, {
      x: 40,
      y,
      size: 8,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 15;

    const fields = [
      ["Employee Code", emp.employeeCode],
      ["Name of Employee", emp.nameFull],
      ["Father / Spouse Name", emp.fatherSpouseName],
      ["Date of Birth", emp.dateOfBirth],
      ["UAN", emp.uan],
      ["Gender", emp.gender],
      ["Department / Post", `${emp.department || ""} / ${emp.postHeld || ""}`],
      ["Date of Appointment", emp.dateOfAppointment],
      ["Address", `${emp.village || ""} ${emp.district || ""} ${emp.state || ""}`],
      ["Mobile Number", emp.mobileNumber],
    ];

    for (const [label, val] of fields) {
      page.drawText(`${label}:`, { x: 40, y, size: 7.5, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(val || "--", { x: 180, y, size: 7.5, font, color: rgb(0, 0, 0) });
      y -= 15;
    }

    y -= 10;
    page.drawText("Nominees:", { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
    y -= 15;

    for (const n of emp.nominees || []) {
      page.drawText(`• ${n.nameFull || ""} (${n.relationship || ""}) - Age: ${n.age || "--"} - Share: ${n.proportion || "--"}%`, {
        x: 50,
        y,
        size: 7.5,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 12;
    }

    page.drawText("Signature / Thumb impression of Employee", {
      x: width - 230,
      y: 60,
      size: 8,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
}
