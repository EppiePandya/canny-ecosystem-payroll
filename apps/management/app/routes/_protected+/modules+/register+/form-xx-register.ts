import type ExcelJS from "exceljs";
import {
  getCleanSiteName,
  getCompanyAddressStr,
  formatMonthYearLabel,
  applyCommonHeaders,
  setCellBorder,
  applySheetProtection,
} from "./forms-1234-utils";

export async function addFormXXRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  activeMonthName: string,
  selectedYear: string,
  companyName: any,
  companyAddress: any,
  sites: any[],
  selectedSite: string,
  stampBase64: string | null,
  signatureBase64: string | null,
) {
  const sheet = workbook.addWorksheet("FORM XX");
  const maxCol = 13;

  const cleanSiteName = getCleanSiteName(selectedSite, sites);
  const companyAddressStr = getCompanyAddressStr(companyAddress);
  const clientName = companyName?.name;
  const monthYearStr = formatMonthYearLabel(activeMonthName, selectedYear);

  applyCommonHeaders(
    sheet,
    "Form XX",
    "See Rule 78(1)(a)(ii)",
    "Register of Deductions for Damage or Loss",
    cleanSiteName,
    clientName,
    companyAddressStr,
    monthYearStr,
    maxCol,
  );

  const row14 = sheet.getRow(14);
  row14.height = 25;
  const row15 = sheet.getRow(15);
  row15.height = 25;

  const verticalHeaders = [
    { col: 1, label: "Sl. No." },
    { col: 2, label: "Name of workman" },
    { col: 3, label: "Father's/\nhusband's name" },
    { col: 4, label: "Designation/\nNature of\nemployment" },
    { col: 5, label: "Particulars\nof damage\nor loss" },
    { col: 6, label: "Date of\nDamage\nor loss" },
    { col: 7, label: "Whether\nworkman\nshowed\ncause\nagainst\ndeduction" },
    {
      col: 8,
      label:
        "Name of\nperson in\nwhose\npresence\nemployee's\nexplanation\nwas heard",
    },
    { col: 9, label: "Amount\nof\ndeduction\nimposed" },
    { col: 10, label: "No. of\ninstalments" },
    { col: 13, label: "Remarks" },
  ];

  verticalHeaders.forEach((vh) => {
    const colIndex = vh.col;
    const cell = sheet.getCell(14, colIndex);
    cell.value = vh.label;
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    sheet.mergeCells(14, colIndex, 15, colIndex);
  });

  sheet.mergeCells("K14:L14");
  const dateCell = sheet.getCell("K14");
  dateCell.value = "Date of";
  dateCell.font = { bold: true, size: 9, name: "Calibri" };
  dateCell.alignment = { horizontal: "center", vertical: "middle" };

  const firstInst = sheet.getCell("K15");
  firstInst.value = "First\ninstalment";
  firstInst.font = { bold: true, size: 9, name: "Calibri" };
  firstInst.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  const lastInst = sheet.getCell("L15");
  lastInst.value = "Last\ninstalment";
  lastInst.font = { bold: true, size: 9, name: "Calibri" };
  lastInst.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  for (let r = 14; r <= 15; r++) {
    for (let c = 1; c <= maxCol; c++) {
      setCellBorder(sheet.getCell(r, c));
    }
  }

  const indexes = Array.from({ length: maxCol }, (_, i) => String(i + 1));
  const row16 = sheet.addRow(indexes);
  row16.eachCell((cell) => {
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    setCellBorder(cell);
  });

  dataToExport.forEach((emp, index) => {
    const loanAmt = emp.loanAmount || 0;

    const rowData = [
      index + 1,
      emp.fullName,
      (emp.fatherSpouse || "-").toUpperCase(),
      (emp.designation || "Sampler").replace(/_/g, " ").toUpperCase(),
      loanAmt > 0
        ? (emp.recoveryParticulars && emp.recoveryParticulars !== "-"
            ? String(emp.recoveryParticulars)
            : "LOAN"
          ).toUpperCase()
        : "NIL",
      loanAmt > 0 ? emp.recoveryDate || "-" : "NIL",
      loanAmt > 0 ? (emp.showCause || "NO").toUpperCase() : "NIL",
      loanAmt > 0 ? (emp.explanation || "NIL").toUpperCase() : "NIL",
      loanAmt > 0 ? loanAmt : "NIL",
      loanAmt > 0 ? emp.instalments || 1 : "NIL",
      loanAmt > 0 ? emp.firstMonth || "-" : "NIL",
      loanAmt > 0 ? emp.lastMonth || "-" : "NIL",
      "",
    ];

    const addedRow = sheet.addRow(rowData);
    addedRow.eachCell((cell, colIndex) => {
      cell.font = { name: "Calibri", size: 9 };
      setCellBorder(cell);

      if ([1, 5, 6, 7, 8, 10, 11, 12].includes(colIndex)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colIndex === 9) {
        if (typeof cell.value === "number") {
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.numFmt = "0.00";
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  });

  const widths = [6, 25, 25, 20, 15, 12, 12, 20, 12, 12, 12, 12, 12];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  await applySheetProtection(sheet);
}
