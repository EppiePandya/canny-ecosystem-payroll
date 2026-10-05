import type ExcelJS from "exceljs";
import {
  getCleanSiteName,
  getCompanyAddressStr,
  formatMonthYearLabel,
  applyCommonHeaders,
  setCellBorder,
  applySheetProtection,
} from "./forms-1234-utils";

export async function addFormXXIIRegisterSheet(
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
  const sheet = workbook.addWorksheet("FORM XXII");
  const maxCol = 11;

  const cleanSiteName = getCleanSiteName(selectedSite, sites);
  const companyAddressStr = getCompanyAddressStr(companyAddress);
  const clientName = companyName?.name;
  const monthYearStr = formatMonthYearLabel(activeMonthName, selectedYear);

  applyCommonHeaders(
    sheet,
    "Form XXII",
    "See Rule 78(1)(a)(ii)",
    "Register of Advances",
    cleanSiteName,
    clientName,
    companyAddressStr,
    monthYearStr,
    maxCol,
  );

  const headers = [
    "Sl. No.",
    "Name of workman",
    "Father's/\nhusband's name",
    "Designation/nature\nof employment",
    "Wages period\nand wages\npayable",
    "Date and\namount of\nadvance given",
    "Purpose(s)\nfor which\nadvance made",
    "Number of\ninstalments by\nwhich advance\nto be repaid",
    "Date and\namount of each\ninstalment\nrepaid",
    "Date on which\nlast instalment\nwas repaid",
    "Remarks",
  ];

  const row14 = sheet.getRow(14);
  row14.height = 25;
  const row15 = sheet.getRow(15);
  row15.height = 25;

  headers.forEach((h, i) => {
    const colIndex = i + 1;
    const cell = sheet.getCell(14, colIndex);
    cell.value = h;
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    sheet.mergeCells(14, colIndex, 15, colIndex);
  });

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

    const rateOfWages = emp.rateBasic + emp.rateDa;
    const wagesPayable = rateOfWages * emp.daysWorked;

    const rowData = [
      index + 1,
      emp.fullName,
      (emp.fatherSpouse || "-").toUpperCase(),
      (emp.designation || "Sampler").replace(/_/g, " ").toUpperCase(),
      `${activeMonthName.substring(0, 3).toUpperCase()} - ${wagesPayable.toFixed(0)}`,
      loanAmt > 0
        ? `${emp.recoveryDate || "-"} - ${loanAmt.toFixed(0)}`
        : "NIL",
      loanAmt > 0
        ? (emp.recoveryParticulars && emp.recoveryParticulars !== "-"
            ? String(emp.recoveryParticulars)
            : "ADVANCE"
          ).toUpperCase()
        : "NIL",
      loanAmt > 0 ? emp.instalments || 1 : "NIL",
      loanAmt > 0
        ? `${emp.completeDate || "-"} - ${loanAmt.toFixed(0)}`
        : "NIL",
      loanAmt > 0 ? emp.completeDate || "-" : "NIL",
      "",
    ];

    const addedRow = sheet.addRow(rowData);
    addedRow.eachCell((cell, colIndex) => {
      cell.font = { name: "Calibri", size: 9 };
      setCellBorder(cell);

      if ([1, 5, 6, 7, 8, 9, 10].includes(colIndex)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  });

  const widths = [6, 25, 25, 20, 15, 20, 18, 12, 20, 15, 12];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  await applySheetProtection(sheet);
}
