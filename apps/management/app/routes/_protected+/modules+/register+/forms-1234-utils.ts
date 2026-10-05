import type ExcelJS from "exceljs";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
} from "@/constant";

export function getCleanSiteName(selectedSite: string, sites: any[]): string {
  if (selectedSite === "all") return "ALL PROJECTS";
  // Try matching by site id first
  const matchedSite = sites.find((s: any) => String(s.id) === selectedSite);
  if (matchedSite) return matchedSite.name.toUpperCase();
  // Fall back: maybe it's a project id — look through site.project
  const siteWithProject = sites.find(
    (s: any) => s.project && String(s.project.id) === selectedSite,
  );
  if (siteWithProject?.project?.name) {
    return siteWithProject.project.name.toUpperCase();
  }
  return "ALL PROJECTS";
}

export function getCompanyAddressStr(companyAddress: any): string {
  return companyAddress?.address_line_1
    ? `${companyAddress.address_line_1 || ""}, ${companyAddress.address_line_2 || ""}, ${companyAddress.city || ""}, ${companyAddress.state || ""} ${companyAddress.pincode || ""}`
      .trim()
      .replace(/,\s*$/, "")
    : "Plot No. 64, GIDC Main Road, Dharampur, Porbandar, Gujarat, India - 360577";
}

export function formatMonthYearLabel(
  activeMonthName: string,
  selectedYear: string,
): string {
  const shortMonth = activeMonthName.substring(0, 3).toUpperCase();
  return `${shortMonth} - ${selectedYear}`;
}

export function setCellBorder(
  cell: ExcelJS.Cell,
  style: "thin" | "double" = "thin",
) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style, color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };
}

export function applyCommonHeaders(
  sheet: ExcelJS.Worksheet,
  formTitle: string,
  formRule: string,
  formSubtitle: string,
  cleanSiteName: string,
  clientName: string,
  companyAddressStr: string,
  monthYearStr: string,
  maxCol: number,
) {
  const addressParts = CANNY_MANAGEMENT_SERVICES_ADDRESS.split(",").map((p) =>
    p.trim(),
  );
  const cannyAddr1 = `No. ${addressParts[0]} ${addressParts[1]}, ${addressParts.slice(2, 6).join(", ")},`;
  const cannyAddr2 = `${addressParts[6]}, ${addressParts[7]}`;

  const colLetter = String.fromCharCode(64 + maxCol);

  sheet.mergeCells(`A1:${colLetter}1`);
  const r1 = sheet.getCell("A1");
  r1.value = { text: "BACK", hyperlink: "#index" };
  r1.font = {
    bold: true,
    color: { argb: "FF0000FF" },
    name: "Calibri",
    size: 10,
  };
  r1.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(1).height = 20;

  sheet.mergeCells(`A3:${colLetter}3`);
  const r3 = sheet.getCell("A3");
  r3.value = "Contract Labour (Regulation & Abolition) Central Rules";
  r3.font = { bold: true, name: "Calibri", size: 10 };
  r3.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(3).height = 20;

  sheet.mergeCells(`A4:${colLetter}4`);
  const r4 = sheet.getCell("A4");
  r4.value = formTitle;
  r4.font = { bold: true, name: "Calibri", size: 16 };
  r4.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(4).height = 25;

  sheet.mergeCells(`A5:${colLetter}5`);
  const r5 = sheet.getCell("A5");
  r5.value = formRule;
  r5.font = { italic: true, name: "Calibri", size: 9 };
  r5.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(5).height = 18;

  sheet.mergeCells(`A6:${colLetter}6`);
  const r6 = sheet.getCell("A6");
  r6.value = formSubtitle;
  r6.font = { bold: true, name: "Calibri", size: 14 };
  r6.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(6).height = 25;

  sheet.mergeCells(`A7:${colLetter}7`);
  const r7 = sheet.getCell("A7");
  r7.value = `Name and address of Contractor - ${CANNY_MANAGEMENT_SERVICES_NAME}`;
  r7.font = { bold: true, name: "Calibri", size: 9 };
  r7.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(7).height = 20;

  sheet.mergeCells(`A8:${colLetter}8`);
  const r8 = sheet.getCell("A8");
  r8.value = cannyAddr1;
  r8.font = { bold: true, name: "Calibri", size: 9 };
  r8.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(8).height = 20;

  sheet.mergeCells(`A9:${colLetter}9`);
  const r9 = sheet.getCell("A9");
  r9.value = cannyAddr2;
  r9.font = { bold: true, name: "Calibri", size: 9 };
  r9.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(9).height = 20;

  sheet.mergeCells(`A10:${colLetter}10`);
  const r10 = sheet.getCell("A10");
  r10.value = `Nature and location of work - ${cleanSiteName}`;
  r10.font = { bold: true, name: "Calibri", size: 9 };
  r10.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(10).height = 20;

  sheet.mergeCells(`A11:${colLetter}11`);
  const r11 = sheet.getCell("A11");
  r11.value = `Name and address of establishment in/under which contract is carried on - ${clientName}, ${companyAddressStr}`;
  r11.font = { bold: true, name: "Calibri", size: 9 };
  r11.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(11).height = 20;

  sheet.mergeCells(`A12:${colLetter}12`);
  const r12 = sheet.getCell("A12");
  r12.value = `Name and address of Principal Employer - ${clientName}, ${companyAddressStr}`;
  r12.font = { bold: true, name: "Calibri", size: 9 };
  r12.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(12).height = 20;

  sheet.mergeCells(`A13:${colLetter}13`);
  const r13 = sheet.getCell("A13");
  r13.value = `For the month of ${monthYearStr}`;
  r13.font = { bold: true, name: "Calibri", size: 10 };
  r13.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(13).height = 22;

  for (let r = 3; r <= 13; r++) {
    for (let c = 1; c <= maxCol; c++) {
      setCellBorder(sheet.getCell(r, c));
    }
  }
}

export async function applySheetProtection(sheet: ExcelJS.Worksheet) {
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

export function getDailyAttendance(
  cycleDays: { day: number; isPrevMonth: boolean }[],
  yearNum: number,
  monthNum: number,
  prevYearNum: number,
  prevMonthNum: number,
  emp: any,
  useShortWOff = false,
): string[] {
  const woff = useShortWOff ? "W/Off" : "W";
  const dailyRecords = emp.dailyRecords || emp.daily_records || [];

  if (dailyRecords.length > 0) {
    return cycleDays.map((d) => {
      const dateObj = new Date(
        d.isPrevMonth ? prevYearNum : yearNum,
        (d.isPrevMonth ? prevMonthNum : monthNum) - 1,
        d.day,
      );
      const year = dateObj.getFullYear();
      const monthStr = String(dateObj.getMonth() + 1).padStart(2, "0");
      const dayStr = String(dateObj.getDate()).padStart(2, "0");
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      const record = dailyRecords.find((r: any) => r.date === dateStr);

      if (record) {
        if (record.holiday) {
          const ht = record.holiday_type?.toLowerCase() || "";
          if (ht === "weekly" || ht === "week off") {
            return woff;
          } else if (ht === "casual_leave" || ht === "cl") {
            return "CL";
          } else if (ht === "paid_leave" || ht === "pl") {
            return "L";
          } else if (ht === "paid_holiday" || ht === "ph" || ht === "holiday") {
            return "PH";
          } else {
            return "H";
          }
        } else if (record.present) {
          return "P";
        } else {
          return "A";
        }
      }

      if (dateObj.getDay() === 0) return woff;
      return "P";
    });
  }

  const attendance: string[] = [];
  const normalDayIndices: number[] = [];

  cycleDays.forEach((d, idx) => {
    const dateObj = new Date(
      d.isPrevMonth ? prevYearNum : yearNum,
      (d.isPrevMonth ? prevMonthNum : monthNum) - 1,
      d.day,
    );
    if (dateObj.getDay() === 0) {
      attendance[idx] = woff;
    } else {
      normalDayIndices.push(idx);
    }
  });

  const totalNormalDays = normalDayIndices.length;

  let absentDays = emp.absentDays ?? emp.absent_days ?? 0;
  let paidLeaves = emp.paidLeaves ?? emp.paid_leaves ?? 0;
  let casualLeaves = emp.casualLeaves ?? emp.casual_leaves ?? 0;
  let paidHolidays = emp.paidHolidays ?? emp.paid_holidays ?? 0;
  let presentDays = emp.presentDays ?? emp.daysWorked ?? emp.present_days ?? 0;

  // Sanity check: if paid_leaves is set to full working days (e.g. 26) due to DB defaults while present/absent are 0, treat paid_leaves as 0
  if (paidLeaves >= totalNormalDays && presentDays === 0 && absentDays === 0 && casualLeaves === 0) {
    paidLeaves = 0;
  }

  // Calculate default present count if presentDays is not explicitly set
  if (presentDays <= 0 && absentDays === 0 && casualLeaves === 0 && paidLeaves === 0 && paidHolidays === 0) {
    presentDays = totalNormalDays;
  } else if (presentDays <= 0) {
    presentDays = Math.max(0, totalNormalDays - absentDays - casualLeaves - paidLeaves - paidHolidays);
  }

  const cl = Math.min(totalNormalDays, casualLeaves);
  const p = Math.min(totalNormalDays - cl, presentDays);
  const l = Math.min(totalNormalDays - cl - p, paidLeaves);
  const ph = Math.min(totalNormalDays - cl - p - l, paidHolidays);
  const a = Math.max(0, totalNormalDays - cl - p - l - ph);

  const normalStatuses = new Array(totalNormalDays).fill(null);

  const placeStatus = (status: string, count: number) => {
    if (count <= 0) return;
    const freeIndices: number[] = [];
    normalStatuses.forEach((val, idx) => {
      if (val === null) freeIndices.push(idx);
    });

    if (freeIndices.length === 0) return;

    for (let i = 0; i < count; i++) {
      const targetFreeIdx = Math.floor((i * freeIndices.length) / count);
      const targetIdx = freeIndices[targetFreeIdx];
      normalStatuses[targetIdx] = status;
    }
  };

  placeStatus("P", p);
  placeStatus("CL", cl);
  placeStatus("L", l);
  placeStatus("PH", ph);
  placeStatus("A", a);

  normalStatuses.forEach((val, idx) => {
    if (val === null) {
      normalStatuses[idx] = "P";
    }
  });

  normalDayIndices.forEach((normalIdx, i) => {
    attendance[normalIdx] = normalStatuses[i];
  });

  cycleDays.forEach((_, idx) => {
    if (!attendance[idx]) {
      attendance[idx] = "P";
    }
  });

  return attendance;
}
