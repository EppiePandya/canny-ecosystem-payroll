import type ExcelJS from "exceljs";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
} from "@/constant";

export async function addOtRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  activeMonthName: string,
  selectedYear: string,
  companyName: any,
  companyAddress: any,
  sites: any[],
  selectedSite: string,
  signatureBase64: string | null,
) {
  const sheet = workbook.addWorksheet("OT REGISTER");

  let cleanSiteName = "ALL SITES";
  if (selectedSite !== "all") {
    const matchedSite = sites.find((s: any) => String(s.id) === selectedSite);
    if (matchedSite) {
      cleanSiteName = matchedSite.name.toUpperCase();
    }
  }

  sheet.mergeCells("A2:L2");
  const row2 = sheet.getCell("A2");
  row2.value = "Contract Labour (Regulation & Abolition) Central Rules";
  row2.font = { bold: true, name: "Calibri", size: 12 };
  row2.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A3:L3");
  const row3 = sheet.getCell("A3");
  row3.value = "FORM XXIII";
  row3.font = { bold: true, name: "Calibri", size: 10 };
  row3.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A4:L4");
  const row4 = sheet.getCell("A4");
  row4.value = "See Rule 78(1)(a)(ii)";
  row4.font = { name: "Calibri", size: 9 };
  row4.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A5:L5");
  const row5 = sheet.getCell("A5");
  row5.value = "Register of Overtime";
  row5.font = { bold: true, name: "Calibri", size: 14 };
  row5.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A6:L6");
  const row6 = sheet.getCell("A6");
  row6.value = `Name and address of Contractor - ${CANNY_MANAGEMENT_SERVICES_NAME} ${CANNY_MANAGEMENT_SERVICES_ADDRESS}`;
  row6.font = { bold: true, name: "Calibri", size: 9 };
  row6.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  sheet.mergeCells("A7:L7");
  const row7 = sheet.getCell("A7");
  row7.value = `Nature and location of work - ${cleanSiteName}`;
  row7.font = { bold: true, name: "Calibri", size: 9 };
  row7.alignment = { horizontal: "center", vertical: "middle" };

  const clientName = companyName?.name || "SGS India Private Limited";
  const companyAddressStr =
    companyAddress && companyAddress.address_line_1
      ? `${companyAddress.address_line_1 || ""}, ${companyAddress.address_line_2 || ""}, ${companyAddress.city || ""}, ${companyAddress.state || ""} ${companyAddress.pincode || ""}`
          .trim()
          .replace(/,\s*$/, "")
      : "Plot No. 64, GIDC Main Road, Dharampur, Porbandar, Gujarat, India - 360577";

  sheet.mergeCells("A8:L8");
  const row8 = sheet.getCell("A8");
  row8.value = `Name and address of establishment in/under which contract is carried on - ${clientName}, ${companyAddressStr}`;
  row8.font = { bold: true, name: "Calibri", size: 9 };
  row8.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  sheet.mergeCells("A9:L9");
  const row9 = sheet.getCell("A9");
  row9.value = `Name and address of Principal Employer - ${clientName}, ${companyAddressStr}`;
  row9.font = { bold: true, name: "Calibri", size: 9 };
  row9.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  sheet.mergeCells("A10:L10");
  const row10 = sheet.getCell("A10");
  row10.value = `${cleanSiteName} OT Register For the month of ${activeMonthName.toUpperCase()}-${selectedYear}`;
  row10.font = { bold: true, name: "Calibri", size: 10 };
  row10.alignment = { horizontal: "center", vertical: "middle" };

  for (let r = 2; r <= 10; r++) {
    for (let c = 1; c <= 12; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    }
  }

  const headers = [
    "Sl. No.",
    "Name of workman",
    "Father's/\nHusband's name",
    "Sex",
    "Designation/nature\nof employment",
    "Dates on\nwhich\novertime\nworked",
    "Total overtime\nworked or\nproduction in\ncase of piece-\nrated",
    "Normal\nrates of\nwages",
    "Overtim\ne rate of\nwages",
    "Overtim\ne\nearnings",
    "Date on\nwhich\novertim\ne wages\npaid",
    "Remarks",
  ];

  const row11 = sheet.getRow(11);
  row11.height = 25;
  const row12 = sheet.getRow(12);
  row12.height = 25;

  headers.forEach((h, i) => {
    const colIndex = i + 1;
    const cell = sheet.getCell(11, colIndex);
    cell.value = h;
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    sheet.mergeCells(11, colIndex, 12, colIndex);
  });

  for (let r = 11; r <= 12; r++) {
    for (let c = 1; c <= 12; c++) {
      sheet.getCell(r, c).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    }
  }

  const indexes = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const row13 = sheet.addRow(indexes);
  row13.eachCell((cell) => {
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  let totalOtHours = 0;
  let totalOtEarnings = 0;

  dataToExport.forEach((emp, index) => {
    const normalRate = emp.rateBasic + emp.rateDa;
    const otRate = normalRate * 2;
    const otEarnings = Math.round((normalRate / 8) * 2 * emp.otHours);

    totalOtHours += emp.otHours;
    totalOtEarnings += otEarnings;

    const rowData = [
      index + 1,
      emp.fullName,
      emp.fatherSpouse,
      emp.gender ? (emp.gender.toUpperCase().startsWith("M") ? "M" : "F") : "M",
      emp.designation
        ? emp.designation
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/^\w/, (c: string) => c.toUpperCase())
        : "Sampler",
      "-",
      emp.otHours,
      normalRate,
      otRate,
      otEarnings,
      "-",
      "",
    ];

    const addedRow = sheet.addRow(rowData);
    addedRow.eachCell((cell, colIndex) => {
      cell.font = { name: "Calibri", size: 9 };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      if (
        colIndex === 1 ||
        colIndex === 4 ||
        colIndex === 5 ||
        colIndex === 6 ||
        colIndex === 7 ||
        colIndex === 11
      ) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colIndex === 8 || colIndex === 9 || colIndex === 10) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }

      if (colIndex === 8 || colIndex === 9) {
        cell.numFmt = "0.00";
      } else if (colIndex === 10 || colIndex === 7) {
        cell.numFmt = "0";
      }
    });
  });

  const totalRowData = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    totalOtHours,
    "",
    "",
    totalOtEarnings,
    "",
    "",
  ];

  const totalRowAdded = sheet.addRow(totalRowData);
  totalRowAdded.eachCell((cell, colIndex) => {
    cell.font = { bold: true, name: "Calibri", size: 9 };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "double", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    if (colIndex === 1 || colIndex === 7) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    } else if (colIndex === 10) {
      cell.alignment = { horizontal: "right", vertical: "middle" };
    } else {
      cell.alignment = { horizontal: "left", vertical: "middle" };
    }

    if (colIndex === 7 || colIndex === 10) {
      cell.numFmt = "0";
    }
  });

  if (signatureBase64) {
    try {
      const signatureId = workbook.addImage({
        base64: signatureBase64,
        extension: "png",
      });
      sheet.addImage(signatureId, {
        tl: { col: 8.0, row: totalRowAdded.number + 1.5 },
        ext: { width: 180, height: 80 },
      });
    } catch (e) {
      console.error("Error adding signature to OT register:", e);
    }
  }

  const colWidths = [6, 24, 24, 8, 18, 15, 18, 15, 15, 15, 15, 15];
  colWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  for (let i = 1; i <= 100; i++) {
    sheet.getColumn(i).protection = { locked: false };
  }
  sheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.protection = { locked: false };
    });
  });

  await sheet.protect("", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertColumns: true,
    insertRows: true,
    insertHyperlinks: true,
    deleteColumns: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
    pivotTables: true,
    objects: false,
  });
}
