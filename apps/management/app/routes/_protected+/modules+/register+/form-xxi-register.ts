import type ExcelJS from "exceljs";
import {
  getCleanSiteName,
  getCompanyAddressStr,
  formatMonthYearLabel,
  applyCommonHeaders,
  setCellBorder,
  applySheetProtection,
} from "./forms-1234-utils";

export async function addFormXXIRegisterSheet(
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
  const sheet = workbook.addWorksheet("FORM XXI");
  const maxCol = 12;

  const cleanSiteName = getCleanSiteName(selectedSite, sites);
  const companyAddressStr = getCompanyAddressStr(companyAddress);
  const clientName = companyName?.name;
  const monthYearStr = formatMonthYearLabel(activeMonthName, selectedYear);

  applyCommonHeaders(
    sheet,
    "Form XXI",
    "See Rule 78(1)(a)(ii)",
    "Register of Fines",
    cleanSiteName,
    clientName,
    companyAddressStr,
    monthYearStr,
    maxCol,
  );

  const headers = [
    "Sl. No.",
    "Name of workman",
    "Father's/\nHusband's name",
    "Designation/\nnature of\nemployment",
    "Act/Omission\nfor which fine\nimposed",
    "Date of\noffence",
    "Total overtime\nworked or\nproduction in\ncase of piece-\nrated",
    "Normal rates\nof wages",
    "Overtime\nrate of\nwages",
    "Overtime\nearnings",
    "Date on\nwhich\novertime\nwages\npaid",
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
    const normalRate = emp.rateBasic + emp.rateDa;
    const otRate = normalRate * 2;
    const otEarnings = Math.round((normalRate / 8) * 2 * (emp.otHours || 0));

    const rowData = [
      index + 1,
      emp.fullName,
      (emp.fatherSpouse || "-").toUpperCase(),
      (emp.designation || "Sampler").replace(/_/g, " ").toUpperCase(),
      "NIL",
      "NIL",
      emp.otHours > 0 ? emp.otHours : "NIL",
      emp.otHours > 0 ? normalRate : "NIL",
      emp.otHours > 0 ? otRate : "NIL",
      emp.otHours > 0 ? otEarnings : "NIL",
      "NIL",
      "",
    ];

    const addedRow = sheet.addRow(rowData);
    addedRow.eachCell((cell, colIndex) => {
      cell.font = { name: "Calibri", size: 9 };
      setCellBorder(cell);

      if ([1, 4, 5, 6, 7, 11, 12].includes(colIndex)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if ([8, 9, 10].includes(colIndex)) {
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

  const widths = [6, 25, 25, 20, 15, 12, 15, 12, 12, 12, 15, 12];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  await applySheetProtection(sheet);
}
