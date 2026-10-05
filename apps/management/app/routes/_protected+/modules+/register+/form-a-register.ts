import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_OWNER,
} from "@/constant";
import type ExcelJS from "exceljs";

export function addFormARegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  cleanSiteName: string,
) {
  const sheetA = workbook.addWorksheet("FORM A");

  sheetA.mergeCells("A1:AE1");
  sheetA.getCell("A1").value = "SCHEDULE";
  sheetA.getCell("A1").font = { bold: true, italic: true, size: 11 };
  sheetA.getCell("A1").alignment = { horizontal: "center" };

  sheetA.mergeCells("A2:AE2");
  sheetA.getCell("A2").value = "[See rule 2(1)]";
  sheetA.getCell("A2").font = { italic: true, size: 10 };
  sheetA.getCell("A2").alignment = { horizontal: "center" };

  sheetA.mergeCells("A3:AE3");
  sheetA.getCell("A3").value = "FORM A";
  sheetA.getCell("A3").font = { bold: true, size: 12 };
  sheetA.getCell("A3").alignment = { horizontal: "center" };

  sheetA.mergeCells("A4:AE4");
  sheetA.getCell("A4").value = "FORMAT OF EMPLOYEE REGISTER";
  sheetA.getCell("A4").font = { bold: true, size: 14 };
  sheetA.getCell("A4").alignment = { horizontal: "center" };

  sheetA.mergeCells("A5:AE5");
  sheetA.getCell("A5").value = "[Part A : For all Establishments]";
  sheetA.getCell("A5").font = { italic: true, size: 10 };
  sheetA.getCell("A5").alignment = { horizontal: "center" };

  sheetA.mergeCells("A6:AE6");
  sheetA.getCell("A6").value =
    `Name of the Establishment: ${CANNY_MANAGEMENT_SERVICES_NAME}   Site Name: ${cleanSiteName}   Name of Owner: ${CANNY_MANAGEMENT_SERVICES_OWNER}`;
  sheetA.getCell("A6").font = { bold: true, size: 10 };

  const headersA = [
    "Sl. No.",
    "Employee Code",
    "Name",
    "Surname",
    "Gender",
    "Father's/Spouse Name",
    "Date of Birth",
    "Nationality",
    "Education Level",
    "Date of Joining",
    "Designation",
    "Category *(HS/S/SS/US)*",
    "Type of Employment",
    "Mobile",
    "UAN",
    "PAN",
    "ESIC IP",
    "LWF",
    "AADHAAR",
    "Bank A/c Number",
    "Bank Name",
    "Bank Branch",
    "Branch (IFSC)",
    "Present Address",
    "Permanent Address",
    "Servie Book No.",
    "Date of Exit",
    "Reason for Exit",
    "Mark of Identification",
    "Photo Specimen Signature/Thumb Impression",
    "Remarks",
  ];
  const headerRowA = sheetA.addRow(headersA);
  headerRowA.height = 30;
  headerRowA.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  const indexesA = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const indexRowA = sheetA.addRow(indexesA);
  indexRowA.eachCell((cell) => {
    cell.font = { italic: true, size: 9 };
    cell.alignment = { horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  dataToExport.forEach((emp, index) => {
    const rowData = [
      index + 1,
      emp.code,
      (emp.name || "").toUpperCase(),
      (emp.surname || "").toUpperCase(),
      emp.gender,
      emp.fatherSpouse,
      emp.dob,
      emp.nationality,
      emp.education,
      emp.doj,
      emp.designation,
      emp.category,
      emp.employmentType,
      emp.mobile,
      emp.uan,
      emp.pan,
      emp.esic,
      emp.lwfApplicable,
      emp.aadhaar,
      emp.bankAc,
      emp.bankName,
      "-",
      emp.branchIfsc,
      emp.presentAddress,
      emp.permanentAddress,
      emp.serviceBookNo,
      emp.dateOfExit,
      emp.reasonForExit,
      emp.markOfIdentification,
      "-",
      emp.remarks,
    ];
    const added = sheetA.addRow(rowData);
    added.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });
  sheetA.columns.forEach((col, idx) => {
    if (idx === 23 || idx === 24) {
      col.width = 35;
    } else if (idx === 20 || idx === 22) {
      col.width = 25;
    } else {
      col.width = 16;
    }
  });
}
