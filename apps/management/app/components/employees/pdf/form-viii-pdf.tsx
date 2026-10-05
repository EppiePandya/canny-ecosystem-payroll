import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type FormVIIIEmployeeData = {
  name: string;
  fatherHusbandName: string;
  gender: string;
  religion: string;
  maritalStatus: string;
  department: string;
  postHeld: string;
  dateOfAppointment: string;
  address: string;
  establishmentName: string;
  establishmentAddress: string;
  nominees: Array<{
    name: string;
    relationship: string;
    age: string;
    aadhaar: string;
    proportion: string;
  }>;
};

export function FormVIIIPage({ emp }: { emp: FormVIIIEmployeeData }) {
  const nominees = emp.nominees?.length ? emp.nominees : [{ name: "", relationship: "", age: "", aadhaar: "", proportion: "" }];

  return (
    <div className="border border-black p-6 text-[10px] bg-white font-sans max-w-4xl mx-auto my-4 shadow-sm space-y-4">
      <div className="text-center pb-2 border-b border-black">
        <h2 className="font-bold text-xs">FORM VIII</h2>
        <p className="italic text-[8px]">[See rule 18(1)]</p>
        <p className="font-bold text-[10px] mt-1">NOMINATION FORM</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <div><span className="font-bold">Establishment:</span> {emp.establishmentName}</div>
        <div><span className="font-bold">Address:</span> {emp.establishmentAddress}</div>
        <div><span className="font-bold">Name:</span> {emp.name}</div>
        <div><span className="font-bold">Father/Husband:</span> {emp.fatherHusbandName}</div>
        <div><span className="font-bold">Gender / Marital Status:</span> {emp.gender} / {emp.maritalStatus}</div>
        <div><span className="font-bold">Department / Post:</span> {emp.department} / {emp.postHeld}</div>
        <div><span className="font-bold">DOA:</span> {emp.dateOfAppointment}</div>
      </div>

      <div className="pt-2">
        <div className="font-bold text-[9px] mb-1">Nomination Table</div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr className="bg-neutral-50 border-b border-black">
              <th className="p-1 border-r border-black text-left">Name</th>
              <th className="p-1 border-r border-black text-left">Relationship</th>
              <th className="p-1 border-r border-black text-center">Age</th>
              <th className="p-1 border-r border-black text-left">Aadhaar</th>
              <th className="p-1 text-center">Share (%)</th>
            </tr>
          </thead>
          <tbody>
            {nominees.map((n, i) => (
              <tr key={i} className="border-b border-black">
                <td className="p-1 border-r border-black">{n.name || "--"}</td>
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

export async function generateFormVIIIPdf(employees: FormVIIIEmployeeData[]): Promise<Uint8Array> {
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
    page.drawText("FORM VIII - NOMINATION FORM", {
      x: width / 2 - 90,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    const fields = [
      ["Name of Employee", emp.name],
      ["Father / Husband Name", emp.fatherHusbandName],
      ["Gender / Marital Status", `${emp.gender || ""} / ${emp.maritalStatus || ""}`],
      ["Department / Post", `${emp.department || ""} / ${emp.postHeld || ""}`],
      ["Date of Appointment", emp.dateOfAppointment],
      ["Establishment", emp.establishmentName],
    ];

    for (const [lbl, val] of fields) {
      page.drawText(`${lbl}:`, { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(String(val || "--"), { x: 180, y, size: 8, font, color: rgb(0, 0, 0) });
      y -= 18;
    }

    y -= 10;
    page.drawText("Nominees:", { x: 40, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
    y -= 15;

    for (const n of emp.nominees || []) {
      page.drawText(`• ${n.name || ""} (${n.relationship || ""}) - Age: ${n.age || "--"} - Share: ${n.proportion || "--"}%`, {
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
