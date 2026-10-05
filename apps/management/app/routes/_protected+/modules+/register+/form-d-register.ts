import type ExcelJS from "exceljs";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
} from "@/constant";
import { payoutMonths } from "@canny_ecosystem/utils/constant";
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

const getContractorAddressParts = (address: string): string[] => {
  if (!address) return [];
  const parts = address
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let lines: string[] = [];
  if (parts.length <= 2) {
    lines = [parts.join(", ")];
  } else if (parts.length <= 4) {
    lines = [parts.slice(0, 2).join(", "), parts.slice(2).join(", ")];
  } else {
    lines = [
      parts.slice(0, 2).join(", "),
      parts.slice(2, 5).join(", "),
      parts.slice(5).join(", "),
    ];
  }

  // Clean lines and add commas between lines
  lines = lines.map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i].replace(/,$/, "");
    if (i < lines.length - 1) {
      lines[i] = lines[i] + ",";
    }
  }

  return lines;
};

export async function addFormDRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  selectedMonth: string,
  selectedYear: string,
  companyName: any,
  companyAddress: any,
  sites: any[],
  selectedSite: string,
  stampBase64: string | null,
  signatureBase64: string | null,
  cycle: string = "1-31",
) {
  const sheet = workbook.addWorksheet("FORM D");

  let cleanSiteName = "ALL SITES";
  if (selectedSite !== "all") {
    const matchedSite = sites.find((s: any) => String(s.id) === selectedSite);
    if (matchedSite) {
      cleanSiteName = matchedSite.name.toUpperCase();
    }
  }

  const clientName = companyName?.name || "SGS India Private Limited";

  const clientAddrPart1 = companyAddress
    ? `${companyAddress.address_line_1 || ""}, ${companyAddress.address_line_2 || ""}`
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/,\s*$/, "")
    : "Plot No. 64, GIDC Main Road,";
  const clientAddrPart2 = companyAddress
    ? `${companyAddress.city || ""}, ${companyAddress.state || ""} ${companyAddress.pincode || ""}`
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/,\s*$/, "")
    : "Dharampur, Porbandar, Gujarat, India - 360577";
  const clientAddressLines = [clientAddrPart1, clientAddrPart2].filter(Boolean);
  const monthNum = parseInt(selectedMonth);
  const yearNum = parseInt(selectedYear);
  const cycleDays = getAttendanceDays(monthNum, yearNum, cycle);

  const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
  const prevYearNum = monthNum === 1 ? yearNum - 1 : yearNum;
  const currentMonthTotalDays = new Date(yearNum, monthNum, 0).getDate();

  let periodStart = "";
  let periodEnd = "";

  if (cycle === "21-20") {
    periodStart = `21-${String(prevMonthNum).padStart(2, "0")}-${prevYearNum}`;
    periodEnd = `20-${String(monthNum).padStart(2, "0")}-${yearNum}`;
  } else if (cycle === "26-25") {
    periodStart = `26-${String(prevMonthNum).padStart(2, "0")}-${prevYearNum}`;
    periodEnd = `25-${String(monthNum).padStart(2, "0")}-${yearNum}`;
  } else {
    periodStart = `01-${String(monthNum).padStart(2, "0")}-${yearNum}`;
    periodEnd = `${String(currentMonthTotalDays).padStart(2, "0")}-${String(monthNum).padStart(2, "0")}-${yearNum}`;
  }

  const monthName = payoutMonths[monthNum - 1].label.toUpperCase();

  const datesColCount = cycleDays.length;
  const lastDateColIndex = 2 + datesColCount;
  const summaryStartColIndex = lastDateColIndex + 1;
  const summaryEndColIndex = summaryStartColIndex + 5;
  const totalPaidDaysColIndex = summaryEndColIndex + 1;
  const otHoursColIndex = totalPaidDaysColIndex + 1;
  const remarksColIndex = otHoursColIndex + 1;
  const sigColIndex = remarksColIndex + 1;

  const contractorAddressLines = getContractorAddressParts(
    CANNY_MANAGEMENT_SERVICES_ADDRESS,
  );

  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitles: "1:7",
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.3,
      bottom: 0.3,
      header: 0.1,
      footer: 0.1,
    },
  };
  sheet.views = [{ showGridLines: true }];

  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 20;
  sheet.getRow(4).height = 22;

  sheet.getCell("A1").value = "FORM D";
  sheet.getCell("A1").font = { bold: true, name: "Calibri", size: 12 };
  sheet.getCell("A1").alignment = { vertical: "middle" };

  const lastDateCol = 5 + datesColCount;
  const firstContractorCol = 6 + datesColCount;

  sheet.mergeCells(1, 6, 1, lastDateCol);
  sheet.getCell(1, 6).value = clientName;
  sheet.getCell(1, 6).font = { bold: true, name: "Calibri", size: 14 };
  sheet.getCell(1, 6).alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells(1, firstContractorCol, 1, sigColIndex);
  sheet.getCell(1, firstContractorCol).value = CANNY_MANAGEMENT_SERVICES_NAME;
  sheet.getCell(1, firstContractorCol).font = { bold: true, name: "Calibri", size: 10 };
  sheet.getCell(1, firstContractorCol).alignment = { horizontal: "right", vertical: "middle" };

  sheet.getCell("A2").value = "FORMAT OF ATTENDANCE REGISTER";
  sheet.getCell("A2").font = { bold: true, name: "Calibri", size: 12 };
  sheet.getCell("A2").alignment = { vertical: "middle" };

  // Principal Employer / Client Address in a single block
  sheet.mergeCells(2, 6, 3, lastDateCol);
  const PEAddressCell = sheet.getCell(2, 6);
  PEAddressCell.value = clientAddressLines.join("\n");
  PEAddressCell.font = { name: "Calibri", size: 9 };
  PEAddressCell.alignment = {
    horizontal: "center",
    vertical: "top",
    wrapText: true,
  };

  // Contractor Address in a single block
  sheet.mergeCells(2, firstContractorCol, 4, sigColIndex);
  const contractorAddressCell = sheet.getCell(2, firstContractorCol);
  contractorAddressCell.value = contractorAddressLines.join("\n");
  contractorAddressCell.font = { name: "Calibri", size: 9 };
  contractorAddressCell.alignment = {
    horizontal: "right",
    vertical: "top",
    wrapText: true,
  };

  sheet.getCell("A4").value = `For the Period . ${periodStart} to ${periodEnd}`;
  sheet.getCell("A4").font = { bold: true, name: "Calibri", size: 12 };
  sheet.getCell("A4").alignment = { vertical: "middle" };

  sheet.mergeCells(4, 6, 4, lastDateCol);
  sheet.getCell(4, 6).value =
    `Attendance For the Month of ${monthName}-${yearNum}`;
  sheet.getCell(4, 6).font = { bold: true, name: "Calibri", size: 12 };
  sheet.getCell(4, 6).alignment = { horizontal: "center", vertical: "middle" };

  sheet.getRow(5).height = 32;
  sheet.getRow(6).height = 28;
  sheet.getRow(7).height = 22;

  sheet.mergeCells("A5:A6");
  sheet.getCell("A5").value = "Sl.\nNumber\nin\nEmployee\nregister";
  sheet.getCell("A5").font = { bold: true, name: "Calibri", size: 10 };
  sheet.getCell("A5").alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.mergeCells("B5:B6");
  sheet.getCell("B5").value = "Name";
  sheet.getCell("B5").font = { bold: true, name: "Calibri", size: 11 };
  sheet.getCell("B5").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells(5, 3, 5, lastDateColIndex);
  sheet.getCell(5, 3).value = "Place of work* Date";
  sheet.getCell(5, 3).font = { bold: true, name: "Calibri", size: 11 };
  sheet.getCell(5, 3).alignment = { horizontal: "center", vertical: "middle" };

  cycleDays.forEach((d, i) => {
    const colIndex = 3 + i;
    sheet.getCell(6, colIndex).value = d.day;
    sheet.getCell(6, colIndex).font = { bold: true, name: "Calibri", size: 10 };
    sheet.getCell(6, colIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  });

  sheet.mergeCells(5, summaryStartColIndex, 5, summaryEndColIndex);
  sheet.getCell(5, summaryStartColIndex).value = "Summary No. of Days";
  sheet.getCell(5, summaryStartColIndex).font = {
    bold: true,
    name: "Calibri",
    size: 11,
  };
  sheet.getCell(5, summaryStartColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  const summaryHeaders = ["Present", "CL", "PH", "A", "WOF", "H"];
  summaryHeaders.forEach((sh, i) => {
    const colIndex = summaryStartColIndex + i;
    sheet.getCell(6, colIndex).value = sh;
    sheet.getCell(6, colIndex).font = { bold: true, name: "Calibri", size: 10 };
    sheet.getCell(6, colIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  });

  sheet.mergeCells(5, totalPaidDaysColIndex, 6, totalPaidDaysColIndex);
  sheet.getCell(5, totalPaidDaysColIndex).value = "Total\npaid\ndays";
  sheet.getCell(5, totalPaidDaysColIndex).font = {
    bold: true,
    name: "Calibri",
    size: 10,
  };
  sheet.getCell(5, totalPaidDaysColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.mergeCells(5, otHoursColIndex, 6, otHoursColIndex);
  sheet.getCell(5, otHoursColIndex).value = "OT\n(Hrs)";
  sheet.getCell(5, otHoursColIndex).font = {
    bold: true,
    name: "Calibri",
    size: 10,
  };
  sheet.getCell(5, otHoursColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.mergeCells(5, remarksColIndex, 6, remarksColIndex);
  sheet.getCell(5, remarksColIndex).value = "Remarks\nks No.\nof\nhours";
  sheet.getCell(5, remarksColIndex).font = {
    bold: true,
    name: "Calibri",
    size: 10,
  };
  sheet.getCell(5, remarksColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.mergeCells(5, sigColIndex, 6, sigColIndex);
  sheet.getCell(5, sigColIndex).value = "**Signature\nof\nRegister\nKeeper";
  sheet.getCell(5, sigColIndex).font = {
    bold: true,
    name: "Calibri",
    size: 10,
  };
  sheet.getCell(5, sigColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.getCell("A7").value = 1;
  sheet.getCell("A7").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("A7").font = { name: "Calibri", size: 9 };

  sheet.getCell("B7").value = 2;
  sheet.getCell("B7").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("B7").font = { name: "Calibri", size: 9 };

  sheet.mergeCells(7, 3, 7, lastDateColIndex);
  sheet.getCell(7, 3).value = 4;
  sheet.getCell(7, 3).alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell(7, 3).font = { name: "Calibri", size: 9 };

  sheet.mergeCells(7, summaryStartColIndex, 7, summaryEndColIndex);
  sheet.getCell(7, summaryStartColIndex).value = 5;
  sheet.getCell(7, summaryStartColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  sheet.getCell(7, summaryStartColIndex).font = { name: "Calibri", size: 9 };

  sheet.getCell(7, remarksColIndex).value = 6;
  sheet.getCell(7, remarksColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  sheet.getCell(7, remarksColIndex).font = { name: "Calibri", size: 9 };

  sheet.getCell(7, sigColIndex).value = 7;
  sheet.getCell(7, sigColIndex).alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  sheet.getCell(7, sigColIndex).font = { name: "Calibri", size: 9 };

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: "FF000000" } },
    left: { style: "thin" as const, color: { argb: "FF000000" } },
    bottom: { style: "thin" as const, color: { argb: "FF000000" } },
    right: { style: "thin" as const, color: { argb: "FF000000" } },
  };

  for (let r = 5; r <= 7; r++) {
    for (let c = 1; c <= sigColIndex; c++) {
      sheet.getCell(r, c).border = thinBorder;
    }
  }

  let currentRowNum = 8;
  dataToExport.forEach((emp, index) => {
    const slNo = index + 1;
    const name = emp.fullName;

    sheet.getRow(currentRowNum).height = 24;

    sheet.getCell(currentRowNum, 1).value = slNo;
    sheet.getCell(currentRowNum, 1).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell(currentRowNum, 1).font = { name: "Calibri", size: 10 };
    sheet.getCell(currentRowNum, 1).border = thinBorder;

    sheet.getCell(currentRowNum, 2).value = name;
    sheet.getCell(currentRowNum, 2).alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: false,
    };
    sheet.getCell(currentRowNum, 2).font = { name: "Calibri", size: 10 };
    sheet.getCell(currentRowNum, 2).border = thinBorder;

    const attendanceRow = getDailyAttendance(
      cycleDays,
      yearNum,
      monthNum,
      prevYearNum,
      prevMonthNum,
      emp,
      false,
    );

    cycleDays.forEach((d, dateIdx) => {
      const colIndex = 3 + dateIdx;
      const val = attendanceRow[dateIdx];

      sheet.getCell(currentRowNum, colIndex).value = val;
      sheet.getCell(currentRowNum, colIndex).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
      sheet.getCell(currentRowNum, colIndex).font = {
        name: "Calibri",
        size: 10,
      };
      sheet.getCell(currentRowNum, colIndex).border = thinBorder;
    });

    const dateRangeStart = sheet.getCell(currentRowNum, 3).address;
    const dateRangeEnd = sheet.getCell(currentRowNum, lastDateColIndex).address;
    const dateRange = `${dateRangeStart}:${dateRangeEnd}`;

    const presents = attendanceRow.filter((x) => x === "P").length;
    const cl = attendanceRow.filter((x) => x === "CL").length;
    const ph = attendanceRow.filter((x) => x === "PH").length;
    const absents = attendanceRow.filter((x) => x === "A").length;
    const wof = attendanceRow.filter(
      (x) => x === "W" || x === "WOF" || x === "WO",
    ).length;
    const h = attendanceRow.filter((x) => x === "H" || x === "L").length;
    const totalPaidDays =
      presents + cl + ph + attendanceRow.filter((x) => x === "L").length;

    sheet.getCell(currentRowNum, summaryStartColIndex).value = {
      formula: `COUNTIF(${dateRange},"P")`,
      result: presents,
    };
    sheet.getCell(currentRowNum, summaryStartColIndex + 1).value = {
      formula: `COUNTIF(${dateRange},"CL")`,
      result: cl,
    };
    sheet.getCell(currentRowNum, summaryStartColIndex + 2).value = {
      formula: `COUNTIF(${dateRange},"PH")`,
      result: ph,
    };
    sheet.getCell(currentRowNum, summaryStartColIndex + 3).value = {
      formula: `COUNTIF(${dateRange},"A")`,
      result: absents,
    };
    sheet.getCell(currentRowNum, summaryStartColIndex + 4).value = {
      formula: `COUNTIF(${dateRange},"W")+COUNTIF(${dateRange},"WOF")+COUNTIF(${dateRange},"WO")`,
      result: wof,
    };
    sheet.getCell(currentRowNum, summaryStartColIndex + 5).value = {
      formula: `COUNTIF(${dateRange},"H")+COUNTIF(${dateRange},"L")`,
      result: h,
    };

    for (let i = 0; i < 6; i++) {
      const colIndex = summaryStartColIndex + i;
      sheet.getCell(currentRowNum, colIndex).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
      sheet.getCell(currentRowNum, colIndex).font = {
        name: "Calibri",
        size: 10,
      };
      sheet.getCell(currentRowNum, colIndex).border = thinBorder;
    }

    const pAddr = sheet.getCell(currentRowNum, summaryStartColIndex).address;
    const clAddr = sheet.getCell(
      currentRowNum,
      summaryStartColIndex + 1,
    ).address;
    const phAddr = sheet.getCell(
      currentRowNum,
      summaryStartColIndex + 2,
    ).address;

    sheet.getCell(currentRowNum, totalPaidDaysColIndex).value = {
      formula: `${pAddr}+${clAddr}+${phAddr}+COUNTIF(${dateRange},"L")`,
      result: totalPaidDays,
    };
    sheet.getCell(currentRowNum, totalPaidDaysColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell(currentRowNum, totalPaidDaysColIndex).font = {
      name: "Calibri",
      size: 10,
      bold: true,
    };
    sheet.getCell(currentRowNum, totalPaidDaysColIndex).border = thinBorder;

    sheet.getCell(currentRowNum, otHoursColIndex).value = emp.otHours || "-";
    sheet.getCell(currentRowNum, otHoursColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell(currentRowNum, otHoursColIndex).font = {
      name: "Calibri",
      size: 10,
      bold: true,
    };
    sheet.getCell(currentRowNum, otHoursColIndex).border = thinBorder;

    sheet.getCell(currentRowNum, remarksColIndex).value = "";
    sheet.getCell(currentRowNum, remarksColIndex).border = thinBorder;
    sheet.getCell(currentRowNum, remarksColIndex).alignment = {
      vertical: "middle",
    };

    sheet.getCell(currentRowNum, sigColIndex).value = "";
    sheet.getCell(currentRowNum, sigColIndex).border = thinBorder;
    sheet.getCell(currentRowNum, sigColIndex).alignment = {
      vertical: "middle",
    };

    currentRowNum++;
  });

  currentRowNum += 2;

  sheet.mergeCells(currentRowNum, 1, currentRowNum, sigColIndex);
  sheet.getRow(currentRowNum).height = 20;
  sheet.getCell(currentRowNum, 1).value =
    "#Relay and *Place of Work in case of Mines only (Underground/Opencast/Surface)";
  sheet.getCell(currentRowNum, 1).font = {
    name: "Calibri",
    size: 10,
    italic: true,
  };
  sheet.getCell(currentRowNum, 1).alignment = {
    horizontal: "left",
    vertical: "middle",
  };

  currentRowNum++;
  sheet.mergeCells(currentRowNum, 1, currentRowNum, sigColIndex);
  sheet.getRow(currentRowNum).height = 20;
  sheet.getCell(currentRowNum, 1).value =
    "In case an employee is not present the following to be entered: (R for Rest/L for Paid Leave/A for absent/W for Weekly Off/C for Establishment Closed)";
  sheet.getCell(currentRowNum, 1).font = {
    name: "Calibri",
    size: 10,
    italic: true,
  };
  sheet.getCell(currentRowNum, 1).alignment = {
    horizontal: "left",
    vertical: "middle",
  };

  currentRowNum++;
  sheet.mergeCells(currentRowNum, 1, currentRowNum, sigColIndex);
  sheet.getRow(currentRowNum).height = 20;
  sheet.getCell(currentRowNum, 1).value =
    "** Not necessary in case of E Form maintenance.";
  sheet.getCell(currentRowNum, 1).font = {
    name: "Calibri",
    size: 10,
    italic: true,
  };
  sheet.getCell(currentRowNum, 1).alignment = {
    horizontal: "left",
    vertical: "middle",
  };

  sheet.getColumn(1).width = 4.5;
  sheet.getColumn(2).width = 26;

  for (let i = 0; i < datesColCount; i++) {
    sheet.getColumn(3 + i).width = 3.0;
  }

  // Summary columns: Present, CL, PH, A, WOF, H
  sheet.getColumn(summaryStartColIndex).width = 6.0;
  sheet.getColumn(summaryStartColIndex + 1).width = 4.5;
  sheet.getColumn(summaryStartColIndex + 2).width = 4.5;
  sheet.getColumn(summaryStartColIndex + 3).width = 4.5;
  sheet.getColumn(summaryStartColIndex + 4).width = 4.5;
  sheet.getColumn(summaryStartColIndex + 5).width = 4.5;

  sheet.getColumn(totalPaidDaysColIndex).width = 6.0;
  sheet.getColumn(otHoursColIndex).width = 5.0;
  sheet.getColumn(remarksColIndex).width = 8.0;
  sheet.getColumn(sigColIndex).width = 10.0;

  const lastRowNum = sheet.lastRow ? sheet.lastRow.number : currentRowNum;

  if (signatureBase64) {
    try {
      const signatureId = workbook.addImage({
        base64: signatureBase64,
        extension: "png",
      });
      const width = stampBase64 ? 200 : 140;
      const height = stampBase64 ? 200 : 50;
      sheet.addImage(signatureId, {
        tl: { col: sigColIndex - 9.1, row: lastRowNum + 1.5 },
        ext: { width: 180, height: 80 },
      });
    } catch (e) {
      console.error("Error adding signature to Form D:", e);
    }
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
