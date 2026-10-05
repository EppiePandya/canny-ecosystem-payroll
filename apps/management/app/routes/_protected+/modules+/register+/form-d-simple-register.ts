import type ExcelJS from "exceljs";
import { getDailyAttendance } from "./forms-1234-utils";

const getAttendanceDays = (month: number, year: number, cycle: string = "1-31") => {
  const days: { day: number; isPrevMonth: boolean }[] = [];
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  if (cycle === "21-20") {
    const prevMonthTotalDays = new Date(prevYear, prevMonth, 0).getDate();
    for (let d = 21; d <= prevMonthTotalDays; d++) {
      days.push({ day: d, isPrevMonth: true });
    }
    for (let d = 1; d <= 20; d++) {
      days.push({ day: d, isPrevMonth: false });
    }
  } else if (cycle === "26-25") {
    const prevMonthTotalDays = new Date(prevYear, prevMonth, 0).getDate();
    for (let d = 26; d <= prevMonthTotalDays; d++) {
      days.push({ day: d, isPrevMonth: true });
    }
    for (let d = 1; d <= 25; d++) {
      days.push({ day: d, isPrevMonth: false });
    }
  } else {
    // Default "1-31" (Calendar Month: 1st to end of month)
    const currentMonthTotalDays = new Date(year, month, 0).getDate();
    for (let d = 1; d <= currentMonthTotalDays; d++) {
      days.push({ day: d, isPrevMonth: false });
    }
  }

  return days;
};

export function addFormDSimpleRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  selectedMonth: string,
  selectedYear: string,
  cleanSiteName: string,
  cycle: string = "1-31",
) {
  const sheetD = workbook.addWorksheet("FORM D");

  sheetD.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };
  sheetD.views = [{ showGridLines: true }];

  sheetD.getRow(2).height = 22;
  sheetD.getRow(3).height = 22;
  sheetD.getRow(5).height = 20;

  const monthNum = parseInt(selectedMonth);
  const yearNum = parseInt(selectedYear);
  const cycleDays = getAttendanceDays(monthNum, yearNum, cycle);

  const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
  const prevYearNum = monthNum === 1 ? yearNum - 1 : yearNum;
  const currentMonthTotalDays = new Date(yearNum, monthNum, 0).getDate();

  let periodStart = "";
  let periodEnd = "";

  if (cycle === "21-20") {
    periodStart = `21.${String(prevMonthNum).padStart(2, "0")}.${prevYearNum}`;
    periodEnd = `20.${selectedMonth.padStart(2, "0")}.${selectedYear}`;
  } else if (cycle === "26-25") {
    periodStart = `26.${String(prevMonthNum).padStart(2, "0")}.${prevYearNum}`;
    periodEnd = `25.${selectedMonth.padStart(2, "0")}.${selectedYear}`;
  } else {
    periodStart = `01.${selectedMonth.padStart(2, "0")}.${selectedYear}`;
    periodEnd = `${String(currentMonthTotalDays).padStart(2, "0")}.${selectedMonth.padStart(2, "0")}.${selectedYear}`;
  }

  const totalCols = 12 + cycleDays.length;

  sheetD.mergeCells(2, 1, 2, totalCols);
  sheetD.getCell("A2").value = "FORM D";
  sheetD.getCell("A2").font = { bold: true, size: 12, name: "Calibri" };
  sheetD.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

  sheetD.mergeCells(3, 1, 3, totalCols);
  sheetD.getCell("A3").value = "FORMAT OF ATTENDANCE REGISTER";
  sheetD.getCell("A3").font = { bold: true, size: 14, name: "Calibri" };
  sheetD.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };

  sheetD.mergeCells(5, 1, 5, totalCols);
  sheetD.getCell("A5").value =
    `Name of Establishment: Canny Management Services Pvt. Ltd.   Site: ${cleanSiteName}   For the Period: ${periodStart} to ${periodEnd}`;
  sheetD.getCell("A5").font = { bold: true, size: 11, name: "Calibri" };
  sheetD.getCell("A5").alignment = { vertical: "middle" };

  const headersD = [
    "Sl. No.",
    "Employee Name",
    "DOJ",
    ...cycleDays.map((d) => String(d.day)),
    "Present",
    "CL",
    "PH",
    "A",
    "WOF",
    "H",
    "Total paid days",
    "OT Hours",
    "Signature",
  ];
  const headerRowD = sheetD.addRow(headersD);
  headerRowD.height = 30;
  headerRowD.eachCell((cell) => {
    cell.font = { bold: true, size: 10, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  const indexesD = [
    "1",
    "2",
    "3",
    ...cycleDays.map(() => "4"),
    "5",
    "5",
    "5",
    "5",
    "5",
    "5",
    "5",
    "6",
    "7",
  ];
  const indexRowD = sheetD.addRow(indexesD);
  indexRowD.height = 22;
  indexRowD.eachCell((cell) => {
    cell.font = { italic: true, size: 9, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  dataToExport.forEach((emp, index) => {
    const attendanceRow = getDailyAttendance(
      cycleDays,
      parseInt(selectedYear),
      parseInt(selectedMonth),
      prevYearNum,
      prevMonthNum,
      emp,
      true,
    );

    const presents = attendanceRow.filter((x) => x === "P").length;
    const cl = attendanceRow.filter((x) => x === "CL").length;
    const ph = attendanceRow.filter((x) => x === "PH").length;
    const absents = attendanceRow.filter((x) => x === "A").length;
    const wof = attendanceRow.filter((x) => x === "W/Off" || x === "W").length;
    const h = attendanceRow.filter((x) => x === "H" || x === "L").length;
    const totalPaidDays =
      presents + cl + ph + attendanceRow.filter((x) => x === "L").length;

    const rowData = [
      index + 1,
      emp.fullName,
      emp.doj,
      ...attendanceRow,
      presents,
      cl,
      ph,
      absents,
      wof,
      h,
      totalPaidDays,
      "-",
      "",
    ];
    const added = sheetD.addRow(rowData);
    added.height = 24;
    added.eachCell((cell, colNum) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNum === 2 ? "left" : "center",
      };
    });
  });

  sheetD.columns.forEach((col, cIndex) => {
    const colNum = cIndex + 1;
    if (colNum === 1) {
      col.width = 6;
    } else if (colNum === 2) {
      col.width = 28;
    } else if (colNum === 3) {
      col.width = 12;
    } else if (colNum >= 4 && colNum <= 3 + cycleDays.length) {
      col.width = 4.2;
    } else if (
      colNum >= 4 + cycleDays.length &&
      colNum <= 10 + cycleDays.length
    ) {
      col.width = 9;
    } else if (colNum === 11 + cycleDays.length) {
      col.width = 12;
    } else if (colNum === 12 + cycleDays.length) {
      col.width = 18;
    }
  });
}
