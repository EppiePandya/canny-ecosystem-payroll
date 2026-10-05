import type ExcelJS from "exceljs";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
} from "@/constant";
import { payoutMonths } from "@canny_ecosystem/utils/constant";

const monthNames = payoutMonths.map((m) => m.label.slice(0, 3));

export async function addMusterRollWageRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  activeMonthName: string,
  selectedMonth: string,
  selectedYear: string,
  companyName: any,
  companyAddress: any,
  sites: any[],
  selectedSite: string,
  signatureBase64: string | null,
) {
  const sheet = workbook.addWorksheet("MUSTER ROLL CUM WAGE");

  let cleanSiteName = "ALL SITES";
  if (selectedSite !== "all") {
    const matchedSite = sites.find((s: any) => String(s.id) === selectedSite);
    if (matchedSite) {
      cleanSiteName = matchedSite.name.toUpperCase();
    }
  }

  const formatToDdmmyy = (dateStr: string) => {
    if (!dateStr || dateStr === "-") return "-";
    let d: Date;
    if (dateStr.includes(".")) {
      const parts = dateStr.split(".");
      d = new Date(
        parseInt(parts[2]),
        parseInt(parts[1]) - 1,
        parseInt(parts[0]),
      );
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const monthStr = monthNames[d.getMonth()];
    const yearStr = String(d.getFullYear()).slice(-2);
    return `${day}-${monthStr}-${yearStr}`;
  };

  const getPaymentDate = (m: number, y: number) => {
    const nextMonthNum = m === 12 ? 1 : m + 1;
    const nextYearNum = m === 12 ? y + 1 : y;
    const monthStr = monthNames[nextMonthNum - 1];
    const yearStr = String(nextYearNum).slice(-2);
    return `08-${monthStr}-${yearStr}`;
  };

  const monthNum = parseInt(selectedMonth);
  const yearNum = parseInt(selectedYear);
  const paymentDateStr = getPaymentDate(monthNum, yearNum);

  const groupedBySite: { [key: string]: any[] } = {};
  for (const emp of dataToExport) {
    const siteName = emp.siteName || "DEFAULT SITE";
    if (!groupedBySite[siteName]) {
      groupedBySite[siteName] = [];
    }
    groupedBySite[siteName].push(emp);
  }

  sheet.getCell("A1").value = "M-W Form I";
  sheet.getCell("A1").font = { bold: true, name: "Calibri", size: 10 };

  sheet.getCell("A2").value = "Factory F. No. A-77";
  sheet.getCell("A2").font = { bold: true, name: "Calibri", size: 9 };

  sheet.mergeCells("AB2:AH2");
  const formICell = sheet.getCell("AB2");
  formICell.value = "Form I";
  formICell.font = { bold: true, name: "Calibri", size: 12 };
  formICell.alignment = { horizontal: "center", vertical: "middle" };

  sheet.getCell("BH2").value = "(See Rule 27(1))";
  sheet.getCell("BH2").font = { italic: true, name: "Calibri", size: 9 };
  sheet.getCell("BH2").alignment = { horizontal: "right", vertical: "middle" };

  sheet.mergeCells("A3:BH3");
  const row3 = sheet.getCell("A3");
  row3.value = "Muster Roll -cum -Wage Register";
  row3.font = { bold: true, name: "Calibri", size: 14 };
  row3.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A4:BH4");
  const row4 = sheet.getCell("A4");
  row4.value = `Name of the establishment: ${CANNY_MANAGEMENT_SERVICES_NAME} ${CANNY_MANAGEMENT_SERVICES_ADDRESS}`;
  row4.font = { bold: true, name: "Calibri", size: 9 };
  row4.alignment = { horizontal: "left", vertical: "middle" };

  const clientName = companyName?.name || "SGS India Pvt. Ltd.";
  sheet.mergeCells("A5:BH5");
  const row5 = sheet.getCell("A5");
  row5.value = `Name of employer: ${clientName}`;
  row5.font = { bold: true, name: "Calibri", size: 9 };
  row5.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells("A6:BH6");
  const row6 = sheet.getCell("A6");
  row6.value = `For the month of ${activeMonthName.toUpperCase()} Year ${selectedYear}`;
  row6.font = { bold: true, name: "Calibri", size: 9 };
  row6.alignment = { horizontal: "left", vertical: "middle" };

  const headerDefinitions = [
    { range: "A8:A9", val: "EMP\nCODE" },
    { range: "B8:B9", val: "Full name of the employee" },
    { range: "C8:C9", val: "Nature of\nwork and\ndesignation" },
    { range: "D8:D9", val: "Date of\nentry into\nservice" },
    { range: "E8:E9", val: "Age\nand sex" },
    { range: "F8:F9", val: "UAN NO." },
    { range: "G8:G9", val: "ESIC NO." },
    { range: "H8:AL8", val: "Hours worked on" },
    { range: "AM8:AM9", val: "Pres.\nDays" },
    { range: "AN8:AN9", val: "PH\ndays" },
    { range: "AO8:AO9", val: "Total\ndays\nworked" },
    { range: "AP8:AP9", val: "RATE\nOF\nWAGES" },
    { range: "AQ8:AV8", val: "EARNINGS" },
    { range: "AW8:AW9", val: "Gross\nwages\npayable" },
    { range: "AX8:BB8", val: "DEDUCTION" },
    { range: "BC8:BC9", val: "Payroll\nAllowan\nces" },
    { range: "BD8:BD9", val: "Net\nwages\npaid" },
    { range: "BE8:BF8", val: "Leave Wages" },
    { range: "BG8:BG9", val: "Date of\npayment of\nWages" },
    { range: "BH8:BH9", val: "Signature\nor thumb\nimpression\nof employee" },
  ];

  for (const def of headerDefinitions) {
    sheet.mergeCells(def.range);
    const cell = sheet.getCell(def.range.split(":")[0]);
    cell.value = def.val;
    cell.font = { bold: true, size: 8, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }

  for (let d = 1; d <= 31; d++) {
    const colIndex = 7 + d;
    const cell = sheet.getCell(9, colIndex);
    cell.value = d;
    cell.font = { bold: true, size: 8, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  const earningsSub = ["BASIC", "VDA", "HRA", "FH", "BONUS", "OTHER\nALLOWNC"];
  for (let idx = 0; idx < earningsSub.length; idx++) {
    const val = earningsSub[idx];
    const colIndex = 43 + idx;
    const cell = sheet.getCell(9, colIndex);
    cell.value = val;
    cell.font = { bold: true, size: 8, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }

  const deductionSub = [
    "EPF",
    "Esic",
    "Prof\nessi\nonal\ntax",
    "Othe\nr\nAdv",
    "Total\nDeduct\nion",
  ];
  for (let idx = 0; idx < deductionSub.length; idx++) {
    const val = deductionSub[idx];
    const colIndex = 50 + idx;
    const cell = sheet.getCell(9, colIndex);
    cell.value = val;
    cell.font = { bold: true, size: 8, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }

  const leaveSub = ["Prev\nenjo\nyed", "Furt\nher\nEnjo\nyed"];
  for (let idx = 0; idx < leaveSub.length; idx++) {
    const val = leaveSub[idx];
    const colIndex = 57 + idx;
    const cell = sheet.getCell(9, colIndex);
    cell.value = val;
    cell.font = { bold: true, size: 8, name: "Calibri" };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }

  for (let r = 8; r <= 9; r++) {
    for (let c = 1; c <= 60; c++) {
      sheet.getCell(r, c).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    }
  }

  const indexRow = sheet.getRow(10);
  indexRow.height = 20;

  sheet.getCell("A10").value = "1";
  sheet.getCell("B10").value = "2";
  sheet.getCell("C10").value = "3";
  sheet.getCell("D10").value = "4";
  sheet.getCell("E10").value = "5";
  sheet.getCell("F10").value = "6";
  sheet.getCell("G10").value = "7";
  sheet.mergeCells("H10:AL10");
  sheet.getCell("H10").value = "8";
  sheet.getCell("AM10").value = "9";
  sheet.getCell("AN10").value = "10";
  sheet.getCell("AO10").value = "11";
  sheet.getCell("AP10").value = "12";
  sheet.mergeCells("AQ10:AV10");
  sheet.getCell("AQ10").value = "13";
  sheet.getCell("AW10").value = "14";
  sheet.mergeCells("AX10:BB10");
  sheet.getCell("AX10").value = "15";
  sheet.getCell("BC10").value = "16";
  sheet.getCell("BD10").value = "17";
  sheet.mergeCells("BE10:BF10");
  sheet.getCell("BE10").value = "18";
  sheet.getCell("BG10").value = "19";
  sheet.getCell("BH10").value = "20";

  for (let c = 1; c <= 60; c++) {
    const cell = sheet.getCell(10, c);
    cell.font = { bold: true, size: 8, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  let grandTotalPres = 0;
  let grandTotalPh = 0;
  let grandTotalTotalDays = 0;
  let grandTotalBasic = 0;
  let grandTotalDa = 0;
  let grandTotalHra = 0;
  let grandTotalFh = 0;
  let grandTotalBonus = 0;
  let grandTotalOtherAllow = 0;
  let grandTotalGross = 0;
  let grandTotalEPF = 0;
  let grandTotalEsic = 0;
  let grandTotalPt = 0;
  let grandTotalOtherAdv = 0;
  let grandTotalTotalDed = 0;
  let grandTotalPayAllow = 0;
  let grandTotalNet = 0;

  const totalDaysInMonth = new Date(yearNum, monthNum, 0).getDate();

  for (const siteName of Object.keys(groupedBySite)) {
    const employees = groupedBySite[siteName];

    const siteRow = sheet.addRow([]);
    siteRow.height = 22;
    sheet.getCell(siteRow.number, 2).value = siteName.toUpperCase();
    sheet.getCell(siteRow.number, 2).font = {
      bold: true,
      color: { argb: "FFFF0000" },
      name: "Calibri",
      size: 10,
    };
    sheet.getCell(siteRow.number, 2).alignment = {
      horizontal: "left",
      vertical: "middle",
    };

    for (let c = 1; c <= 60; c++) {
      sheet.getCell(siteRow.number, c).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    }

    for (const emp of employees) {
      let age = 30;
      if (emp.dob && emp.dob !== "-") {
        const parts = emp.dob.split(".");
        if (parts.length === 3) {
          const birthYear = parseInt(parts[2]);
          age = yearNum - birthYear;
        }
      }
      const sexLetter = (emp.gender || "Male").toUpperCase().startsWith("F")
        ? "F"
        : "M";
      const ageAndSex = `${age}${sexLetter}`;

      const formattedDoj = formatToDdmmyy(emp.doj);

      const attendanceRow = Array(31).fill("");
      for (let d = 1; d <= totalDaysInMonth; d++) {
        const dateObj = new Date(yearNum, monthNum - 1, d);
        if (dateObj.getDay() === 0) {
          attendanceRow[d - 1] = "W";
        } else {
          attendanceRow[d - 1] = "A";
        }
      }

      let phPlaced = 0;
      const phToPlace = emp.paidHolidays || 0;
      if (phToPlace > 0) {
        for (let d = 1; d <= totalDaysInMonth; d++) {
          if (attendanceRow[d - 1] === "A" && phPlaced < phToPlace) {
            attendanceRow[d - 1] = "PH";
            phPlaced++;
          }
        }
      }

      let pPlaced = 0;
      const pToPlace = emp.daysWorked || 0;
      for (let d = 1; d <= totalDaysInMonth; d++) {
        if (attendanceRow[d - 1] === "A" && pPlaced < pToPlace) {
          attendanceRow[d - 1] = "P";
          pPlaced++;
        }
      }
      if (pPlaced < pToPlace) {
        for (let d = 1; d <= totalDaysInMonth; d++) {
          if (attendanceRow[d - 1] === "W" && pPlaced < pToPlace) {
            attendanceRow[d - 1] = "P";
            pPlaced++;
          }
        }
      }
      if (pPlaced < pToPlace) {
        for (let d = 1; d <= totalDaysInMonth; d++) {
          if (attendanceRow[d - 1] === "PH" && pPlaced < pToPlace) {
            attendanceRow[d - 1] = "P";
            pPlaced++;
          }
        }
      }

      const basicEarned = Math.round(emp.rateBasic * emp.daysWorked);
      const daEarned = Math.round(emp.rateDa * emp.daysWorked);
      const grossWagesPayable =
        basicEarned +
        daEarned +
        emp.hra +
        emp.yearlyBonus +
        emp.allowances +
        (emp.specialBasic || 0) +
        (emp.leaveEncash || 0);

      const pf = emp.pf ?? Math.round(basicEarned * 0.12);
      const esi = emp.esi ?? Math.round(grossWagesPayable * 0.0075);
      const pt = emp.pt ?? (grossWagesPayable > 20000 ? 200 : 150);
      const totalDeductions = pf + esi + pt;
      const netWagesPaid = grossWagesPayable - totalDeductions;

      grandTotalPres += emp.daysWorked;
      grandTotalPh += emp.paidHolidays;
      grandTotalTotalDays += emp.daysWorked + emp.paidHolidays;
      grandTotalBasic += basicEarned;
      grandTotalDa += daEarned;
      grandTotalHra += emp.hra;
      grandTotalBonus += emp.yearlyBonus;
      grandTotalOtherAllow += emp.allowances;
      grandTotalGross += grossWagesPayable;
      grandTotalEPF += pf;
      grandTotalEsic += esi;
      grandTotalPt += pt;
      grandTotalTotalDed += totalDeductions;
      grandTotalNet += netWagesPaid;

      const rowValues = [
        emp.code,
        emp.fullName,
        emp.designation,
        formattedDoj,
        ageAndSex,
        emp.uan,
        emp.esic,
        ...attendanceRow,
        emp.daysWorked,
        emp.paidHolidays,
        emp.daysWorked + emp.paidHolidays,
        emp.rateBasic + emp.rateDa,
        basicEarned,
        daEarned,
        emp.hra,
        0,
        emp.yearlyBonus,
        emp.allowances,
        grossWagesPayable,
        pf,
        esi,
        pt,
        0,
        totalDeductions,
        0,
        netWagesPaid,
        "",
        "",
        paymentDateStr,
        "",
      ];

      const addedRow = sheet.addRow(rowValues);
      addedRow.height = 20;

      addedRow.eachCell((cell, colIndex) => {
        cell.font = { name: "Calibri", size: 8 };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };

        if (
          colIndex === 1 ||
          (colIndex >= 4 && colIndex <= 7) ||
          (colIndex >= 8 && colIndex <= 38) ||
          (colIndex >= 39 && colIndex <= 41) ||
          colIndex === 59
        ) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (
          colIndex === 42 ||
          (colIndex >= 43 && colIndex <= 49) ||
          (colIndex >= 50 && colIndex <= 54) ||
          colIndex === 55 ||
          colIndex === 56
        ) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }

        if (colIndex === 42) {
          cell.numFmt = "0.00";
        } else if (
          (colIndex >= 43 && colIndex <= 49) ||
          (colIndex >= 50 && colIndex <= 54) ||
          colIndex === 55 ||
          colIndex === 56
        ) {
          cell.numFmt = "0";
        }
      });
    }
  }

  const totalRowValues = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    ...Array(31).fill(""),
    grandTotalPres,
    grandTotalPh,
    grandTotalTotalDays,
    "",
    grandTotalBasic,
    grandTotalDa,
    grandTotalHra,
    grandTotalFh,
    grandTotalBonus,
    grandTotalOtherAllow,
    grandTotalGross,
    grandTotalEPF,
    grandTotalEsic,
    grandTotalPt,
    grandTotalOtherAdv,
    grandTotalTotalDed,
    grandTotalPayAllow,
    grandTotalNet,
    "",
    "",
    "",
    "",
  ];

  const totalRowAdded = sheet.addRow(totalRowValues);
  totalRowAdded.height = 22;

  totalRowAdded.eachCell((cell, colIndex) => {
    cell.font = { bold: true, name: "Calibri", size: 8 };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "double", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    if (colIndex === 1 || (colIndex >= 39 && colIndex <= 41)) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    } else if (
      (colIndex >= 43 && colIndex <= 49) ||
      (colIndex >= 50 && colIndex <= 54) ||
      colIndex === 55 ||
      colIndex === 56
    ) {
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.numFmt = "0";
    } else {
      cell.alignment = { horizontal: "left", vertical: "middle" };
    }
  });

  if (signatureBase64) {
    try {
      const signatureId = workbook.addImage({
        base64: signatureBase64,
        extension: "png",
      });
      sheet.addImage(signatureId, {
        tl: { col: 54.0, row: totalRowAdded.number + 1.5 },
        ext: { width: 180, height: 80 },
      });
    } catch (e) {
      console.error("Error adding signature to Muster Roll register:", e);
    }
  }

  const widths = [
    11,
    25,
    16,
    13,
    8,
    14,
    13,
    ...Array(31).fill(4.5),
    8,
    7,
    8,
    10,
    10,
    8,
    8,
    6,
    8,
    10,
    11,
    9,
    7,
    9,
    7,
    10,
    10,
    11,
    8,
    8,
    12,
    18,
  ];

  for (let i = 0; i < widths.length; i++) {
    sheet.getColumn(i + 1).width = widths[i];
  }

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
