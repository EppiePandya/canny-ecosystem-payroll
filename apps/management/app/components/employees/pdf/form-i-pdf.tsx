import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type FormIEmployeeData = {
  employeeCode: string;
  name: string;
  surname: string;
  gender: string;
  fatherMotherSpouseName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  nationality: string;
  educationLevel: string;
  dateOfJoining: string;
  designation: string;
  category: string;
  typeOfEmployment: string;
  detailsOfPosting: string;
  pay: string;
  promotion: string;
  mobileNumber: string;
  uan: string;
  pan: string;
  nominee: string;
  familyDetails: string;
  epsNps: string;
  esicIp: string;
  aadhaar: string;
  bankAccountNumber: string;
  bankName: string;
  branchIfsc: string;
  presentAddress: string;
  permanentAddress: string;
  serviceBookNo: string;
  dateOfExit: string;
  reasonForExit: string;
  markOfIdentification: string;
  photoAttached: string;
  specimenSignature: string;
  remarks: string;
  establishmentName: string;
  employerName: string;
  ownerName: string;
  employerPanTan: string;
  registrationNumber: string;
};

export function FormIPage({ emp }: { emp: FormIEmployeeData }) {
  const fields = [
    { num: 1, label: "Employee Code", value: emp.employeeCode },
    { num: 2, label: "Name", value: emp.name },
    { num: 3, label: "Surname", value: emp.surname },
    { num: 4, label: "Gender", value: emp.gender },
    { num: 5, label: "Father's/Mother's/Spouse Name", value: emp.fatherMotherSpouseName },
    { num: 6, label: "Date of Birth", value: emp.dateOfBirth },
    { num: 7, label: "Place of Birth", value: emp.placeOfBirth },
    { num: 8, label: "Nationality", value: emp.nationality },
    { num: 9, label: "Education Level", value: emp.educationLevel },
    { num: 10, label: "Date of Joining", value: emp.dateOfJoining },
    { num: 11, label: "Designation", value: emp.designation },
    { num: 12, label: "Category (HS/S/SS/US)*", value: emp.category },
    { num: 13, label: "Type of Employment (P/T/FT/T/B)**", value: emp.typeOfEmployment },
    { num: 14, label: "Details of Posting", value: emp.detailsOfPosting },
    { num: 15, label: "Pay", value: emp.pay },
    { num: 16, label: "Promotion", value: emp.promotion },
    { num: 17, label: "Mobile Number", value: emp.mobileNumber },
    { num: 18, label: "Universal Account Number (UAN)", value: emp.uan },
    { num: 19, label: "PAN", value: emp.pan },
    { num: 20, label: "Nominee", value: emp.nominee },
    { num: 21, label: "Details of Family", value: emp.familyDetails },
    { num: 22, label: "EPS/NPS", value: emp.epsNps },
    { num: 23, label: "ESIC IP No.", value: emp.esicIp },
    { num: 24, label: "AADHAAR NO.", value: emp.aadhaar },
    { num: 25, label: "Bank A/c Number", value: emp.bankAccountNumber },
    { num: 26, label: "Bank", value: emp.bankName },
    { num: 27, label: "Branch (IFSC)", value: emp.branchIfsc },
    { num: 28, label: "Present Address", value: emp.presentAddress },
    { num: 29, label: "Permanent Address", value: emp.permanentAddress },
    { num: 30, label: "Service Book No.", value: emp.serviceBookNo },
    { num: 31, label: "Date of Exit", value: emp.dateOfExit },
    { num: 32, label: "Reason for Exit", value: emp.reasonForExit },
    { num: 33, label: "Mark of Identification", value: emp.markOfIdentification },
    { num: 34, label: "Photo", value: emp.photoAttached },
    { num: 35, label: "Specimen Signature", value: emp.specimenSignature },
    { num: 36, label: "Remarks", value: emp.remarks },
  ];

  return (
    <div className="border border-black p-4 text-[10px] bg-white font-sans max-w-4xl mx-auto my-4 shadow-sm">
      <div className="text-center pb-2 border-b border-black">
        <h2 className="font-bold text-xs">FORM I</h2>
        <p className="italic text-[9px]">[See Rule 78 (1) (a) (i)]</p>
        <p className="font-bold text-[10px] mt-1">REGISTER OF EMPLOYMENT AND FORM OF NOMINATION</p>
      </div>

      <div className="grid grid-cols-2 border-b border-black text-[9px]">
        <div className="p-1 border-r border-black font-semibold">Name of the Establishment: {emp.establishmentName}</div>
        <div className="p-1 font-semibold">Name of the Employer: {emp.employerName}</div>
      </div>

      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="border-b border-black bg-neutral-50 font-bold">
            <th className="w-10 p-1 border-r border-black text-center">Sl.</th>
            <th className="p-1 border-r border-black text-left">Particulars</th>
            <th className="p-1 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.num} className="border-b border-black">
              <td className="p-1 border-r border-black text-center">{f.num}</td>
              <td className="p-1 border-r border-black font-medium">{f.label}</td>
              <td className="p-1">{f.value || "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function generateFormIPdf(employees: FormIEmployeeData[]): Promise<Uint8Array> {
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
    page.drawText("FORM I - REGISTER OF EMPLOYMENT", {
      x: width / 2 - 110,
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
    page.drawText(`Employer: ${emp.employerName || ""}`, {
      x: 320,
      y,
      size: 8,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 20;

    const fields = [
      ["1", "Employee Code", emp.employeeCode],
      ["2", "Name", `${emp.name} ${emp.surname}`],
      ["3", "Gender", emp.gender],
      ["4", "Father/Mother/Spouse", emp.fatherMotherSpouseName],
      ["5", "DOB", emp.dateOfBirth],
      ["6", "DOJ", emp.dateOfJoining],
      ["7", "Designation", emp.designation],
      ["8", "Category", emp.category],
      ["9", "UAN", emp.uan],
      ["10", "ESIC IP", emp.esicIp],
      ["11", "PAN", emp.pan],
      ["12", "Aadhaar", emp.aadhaar],
      ["13", "Bank Account", emp.bankAccountNumber],
      ["14", "Bank Name", emp.bankName],
      ["15", "IFSC", emp.branchIfsc],
      ["16", "Present Address", (emp.presentAddress || "").substring(0, 45)],
      ["17", "Permanent Address", (emp.permanentAddress || "").substring(0, 45)],
    ];

    for (const [sl, label, val] of fields) {
      page.drawLine({
        start: { x: 30, y },
        end: { x: width - 30, y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 14;
      page.drawText(sl, { x: 40, y, size: 7.5, font, color: rgb(0, 0, 0) });
      page.drawText(label, { x: 70, y, size: 7.5, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(val || "--", { x: 220, y, size: 7.5, font, color: rgb(0, 0, 0) });
      y -= 8;
    }
  }

  return await pdfDoc.save();
}
