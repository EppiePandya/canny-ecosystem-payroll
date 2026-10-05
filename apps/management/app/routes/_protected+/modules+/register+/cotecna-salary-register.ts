import type ExcelJS from "exceljs";
import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";

export async function addMonthlySalaryRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  shortMonthName: string,
  selectedMonth: string,
  selectedYear: string,
  companyName: any,
  effectiveCompanyAddress: any,
  sites: any[],
  projects: any[],
) {
  // Sheet tab name monthwise: e.g. "Aug 2026", "May 2026"
  const sheetName = `${shortMonthName} ${selectedYear}`;
  const sheet = workbook.addWorksheet(sheetName);

  // Column definitions with widths and hidden flags matching reference layout
  const columnsConfig = [
    { key: "srNo", header: "Sr. No.", width: 5.5, hidden: false },
    { key: "empCode", header: "EMP. CODE", width: 9, hidden: false },
    { key: "uan", header: "UAN NO.", width: 14, hidden: false },
    { key: "esic", header: "ESIC NO.", width: 12, hidden: false },
    { key: "memberId", header: "Member ID", width: 23, hidden: true },
    { key: "empName", header: "NAME OF EMPLOYEE", width: 26.5, hidden: false },
    { key: "designation", header: "DESIGNATION", width: 16, hidden: false },
    { key: "partyName", header: "Name of Party", width: 30, hidden: false },
    { key: "branch", header: "Branch", width: 15, hidden: false },
    { key: "contractor", header: "Contractor", width: 23, hidden: true },
    { key: "dept", header: "Dept", width: 13, hidden: false },
    { key: "div", header: "Div", width: 10, hidden: true },
    { key: "jobLocation", header: "Job Location", width: 18, hidden: false },
    { key: "category", header: "Category of Employees", width: 14, hidden: false },
    { key: "salary", header: "Salary", width: 11, hidden: true },
    { key: "increment", header: "Increment", width: 9, hidden: true },
    { key: "presentSalary", header: "Present Salary", width: 11, hidden: false },
    { key: "wDay", header: "W. Day", width: 8.5, hidden: false },
    { key: "attn", header: "Attn.", width: 7.5, hidden: false },
    { key: "basic", header: "Basic", width: 11, hidden: false },
    { key: "hra", header: "HRA", width: 11, hidden: false },
    { key: "wAll", header: "W. All", width: 12.5, hidden: true },
    { key: "splAll", header: "Spl All", width: 12.5, hidden: true },
    { key: "food", header: "Food", width: 11, hidden: true },
    { key: "conv", header: "Conv", width: 11, hidden: true },
    { key: "otherAll", header: "Other All", width: 15.5, hidden: false },
    { key: "fixedAllow", header: "Fixed Allowances", width: 15.5, hidden: false },
    { key: "lta", header: "LTA", width: 15.5, hidden: false },
    { key: "bonus", header: "Bonus @ 8.33%", width: 17.5, hidden: false },
    { key: "phWage", header: "PH WAGE", width: 17.5, hidden: false },
    { key: "el", header: "E.L. @ 5 %", width: 15.5, hidden: false },
    { key: "otHrs", header: "OT Hrs.", width: 13.5, hidden: false },
    { key: "otAmount", header: "OT Amount", width: 17, hidden: false },
    { key: "grossSalary", header: "Gross Salary", width: 11, hidden: false },
    { key: "pf", header: "P.F. @12%", width: 10, hidden: false },
    { key: "esicDeduction", header: "E.S.I.C. @ 0.75%", width: 12, hidden: false },
    { key: "pTax", header: "P. TAX", width: 8, hidden: false },
    { key: "netSalary", header: "Net Salary", width: 11.5, hidden: false },
    { key: "erPf", header: "Employer \nPF Cont. 13%", width: 11, hidden: false },
    { key: "erEsic", header: "Employer \nESIC Cont. 3.25%", width: 11, hidden: false },
    { key: "lwf", header: "Labour Welfare Fund", width: 10, hidden: false },
    { key: "serviceCharge", header: "Service Charge", width: 10, hidden: false },
    { key: "expVoucher", header: "Exps Voucher Amount", width: 11, hidden: false },
    { key: "scOnExpVoucher", header: "Service Charge On Exps Voucher", width: 9, hidden: false },
    { key: "grandTotal", header: "Grand Total", width: 11, hidden: false },
  ];

  // Set column widths and hidden properties
  columnsConfig.forEach((col, idx) => {
    const colNumber = idx + 1;
    const worksheetColumn = sheet.getColumn(colNumber);
    worksheetColumn.width = col.width;
    if (col.hidden) {
      worksheetColumn.hidden = true;
    }
  });

  // Header Row (Row 1)
  const headerRow = sheet.getRow(1);
  headerRow.height = 46.5;

  columnsConfig.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: "FF000000" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" }, // Yellow background
    };
    cell.alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF000000" } },
      bottom: { style: "medium", color: { argb: "FF000000" } },
      left: { style: "medium", color: { argb: "FF000000" } },
      right: { style: "medium", color: { argb: "FF000000" } },
    };
  });

  const clientPartyName = companyName?.name || "";
  const contractorName = CANNY_MANAGEMENT_SERVICES_NAME || "";

  // Data Rows (Row 2 onwards)
  dataToExport.forEach((emp: any, index: number) => {
    const rowNum = index + 2;
    const row = sheet.getRow(rowNum);
    row.height = 16;

    const workingDays = Number(emp.workingDays || 30);
    const presentDays = emp.presentDays !== undefined ? Number(emp.presentDays) : (emp.daysWorked ?? 0);
    const otHours = Number(emp.otHours || 0);
    const otAmount = Number(emp.otAmount || 0);

    const calcBasic = Number(emp.basic || 0);
    const calcHra = Number(emp.hra || 0);
    const splAll = Number(emp.specialBasic || 0);
    const otherAll = Number(emp.otherAllowance !== undefined ? emp.otherAllowance : (emp.allowances || 0));
    const fixedAllow = Number(emp.fixedAllowance || 0);
    const bonus = Number(emp.yearlyBonus || 0);
    const el = Number(emp.leaveEncash || 0);

    // Dynamic rate calculation based on actual employee data
    const rateBasic = emp.rateBasic && emp.rateBasic > 0
      ? (emp.rateBasic <= 1000 ? Math.round(emp.rateBasic * workingDays) : Number(emp.rateBasic))
      : (presentDays > 0 ? Math.round((calcBasic / presentDays) * workingDays) : calcBasic);

    const rateHra = presentDays > 0 && calcHra > 0
      ? Math.round((calcHra / presentDays) * workingDays)
      : calcHra;

    const fullSalary = Number(
      emp.monthlyCtc ||
      (rateBasic + rateHra + splAll + otherAll + fixedAllow) ||
      (calcBasic + calcHra + splAll + otherAll + fixedAllow) ||
      0,
    );
    const increment = 0;
    const presentSalary = fullSalary + increment;

    // Use actual gross and deductions from database/payroll
    const gross = Number(emp.gross !== undefined ? emp.gross : (calcBasic + calcHra + splAll + otherAll + fixedAllow + bonus + el + otAmount));
    const pf = Number(emp.pf || 0);
    const esi = Number(emp.esi || 0);
    const pt = Number(emp.pt || 0);
    const net = Number(emp.net !== undefined ? emp.net : (gross - pf - esi - pt));

    const erPf = pf > 0 ? Math.round(calcBasic * 0.13) : 0;
    const erEsic = esi > 0 ? Math.round(gross * 0.0325) : 0;
    const lwf = Number(emp.lwf || 0);
    const serviceCharge = Math.round((gross + erPf + erEsic + lwf) * 0.05 * 100) / 100;
    const expVoucher = Number(emp.voucherAmount || 0);
    const scOnExp = Math.round(expVoucher * 0.02 * 100) / 100;
    const grandTotal = Math.round((gross + erPf + erEsic + lwf + serviceCharge + expVoucher + scOnExp) * 100) / 100;

    // Dynamic category resolution
    let categoryDisplay = "";
    if (emp.category) {
      const cat = String(emp.category).toUpperCase();
      if (cat === "SS" || cat.includes("SEMI")) categoryDisplay = "Semi Skilled";
      else if (cat === "US" || cat.includes("UN")) categoryDisplay = "Unskilled";
      else if (cat === "HS" || cat.includes("HIGH")) categoryDisplay = "Highly Skilled";
      else if (cat === "S" || cat.includes("SKILL")) categoryDisplay = "Skilled";
      else categoryDisplay = String(emp.category);
    }

    // Set Cell values & formulas
    // 1 (A): Sr. No.
    row.getCell(1).value = { formula: `IF(B${rowNum}="","",SUBTOTAL(3,$B$2:B${rowNum}))`, result: index + 1 };

    // 2 (B): EMP. CODE
    row.getCell(2).value = emp.code || `EMP${index + 1}`;

    // 3 (C): UAN NO.
    row.getCell(3).value = emp.uan && emp.uan !== "-" ? String(emp.uan) : "N/A";
    row.getCell(3).numFmt = "@";

    // 4 (D): ESIC NO.
    row.getCell(4).value = emp.esic && emp.esic !== "-" ? String(emp.esic) : "N/A";
    row.getCell(4).numFmt = "@";

    // 5 (E): Member ID (hidden)
    row.getCell(5).value = emp.pfNumber || "";

    // 6 (F): NAME OF EMPLOYEE
    row.getCell(6).value = emp.fullName || "";

    // 7 (G): DESIGNATION
    row.getCell(7).value = emp.designation || "";

    // 8 (H): Name of Party (Dynamic active company)
    row.getCell(8).value = clientPartyName;

    // 9 (I): Branch (Dynamic employee site/branch)
    row.getCell(9).value = emp.siteName || "";

    // 10 (J): Contractor (hidden)
    row.getCell(10).value = contractorName;

    // 11 (K): Dept (Dynamic employee project/dept)
    row.getCell(11).value = emp.projectName || "";

    // 12 (L): Div (hidden)
    row.getCell(12).value = 0;

    // 13 (M): Job Location (Dynamic employee site/location)
    row.getCell(13).value = emp.siteName || "";

    // 14 (N): Category of Employees
    row.getCell(14).value = categoryDisplay;

    // 15 (O): Salary (hidden)
    row.getCell(15).value = fullSalary;

    // 16 (P): Increment (hidden)
    row.getCell(16).value = increment;

    // 17 (Q): Present Salary
    row.getCell(17).value = { formula: `O${rowNum}+P${rowNum}`, result: presentSalary };

    // 18 (R): W. Day
    row.getCell(18).value = workingDays;

    // 19 (S): Attn.
    row.getCell(19).value = presentDays;

    // 20 (T): Basic
    if (workingDays > 0 && rateBasic > 0) {
      row.getCell(20).value = { formula: `ROUND(${rateBasic}*S${rowNum}/R${rowNum},0)`, result: calcBasic };
    } else {
      row.getCell(20).value = calcBasic;
    }

    // 21 (U): HRA
    if (workingDays > 0 && rateHra > 0) {
      row.getCell(21).value = { formula: `ROUND(${rateHra}*S${rowNum}/R${rowNum},0)`, result: calcHra };
    } else {
      row.getCell(21).value = calcHra;
    }

    // 22 (V): W. All (hidden)
    row.getCell(22).value = 0;

    // 23 (W): Spl All (hidden)
    if (splAll > 0 && workingDays > 0) {
      row.getCell(23).value = { formula: `ROUND(${splAll}*S${rowNum}/R${rowNum},0)`, result: splAll };
    } else {
      row.getCell(23).value = 0;
    }

    // 24 (X): Food (hidden)
    row.getCell(24).value = 0;

    // 25 (Y): Conv (hidden)
    row.getCell(25).value = 0;

    // 26 (Z): Other All
    row.getCell(26).value = otherAll;

    // 27 (AA): Fixed Allowances
    row.getCell(27).value = fixedAllow > 0 ? fixedAllow : null;

    // 28 (AB): LTA
    row.getCell(28).value = null;

    // 29 (AC): Bonus @ 8.33%
    row.getCell(29).value = bonus > 0 ? { formula: `ROUND(T${rowNum}*8.33%,0)`, result: bonus } : null;

    // 30 (AD): PH WAGE
    row.getCell(30).value = null;

    // 31 (AE): E.L. @ 5 %
    row.getCell(31).value = el > 0 ? { formula: `ROUND(T${rowNum}*5%,0)`, result: el } : null;

    // 32 (AF): OT Hrs.
    row.getCell(32).value = otHours;

    // 33 (AG): OT Amount
    row.getCell(33).value = otAmount;

    // 34 (AH): Gross Salary
    row.getCell(34).value = {
      formula: `ROUND(SUM(T${rowNum}:AA${rowNum}, AC${rowNum}, AE${rowNum}, AG${rowNum}), 0)`,
      result: gross,
    };

    // 35 (AI): P.F. @12%
    // In payroll, PF is based on eligible PF wages or fixed payroll entry; if it matches basic * 12%, use formula, else exact PF value
    if (Math.round(calcBasic * 0.12) === pf && pf > 0) {
      row.getCell(35).value = { formula: `ROUND(T${rowNum}*12%,0)`, result: pf };
    } else {
      row.getCell(35).value = pf;
    }

    // 36 (AJ): E.S.I.C. @ 0.75%
    if (esi > 0) {
      row.getCell(36).value = { formula: `ROUND(AH${rowNum}*0.75%,0)`, result: esi };
    } else {
      row.getCell(36).value = 0;
    }

    // 37 (AK): P. TAX
    row.getCell(37).value = pt;

    // 38 (AL): Net Salary
    row.getCell(38).value = { formula: `AH${rowNum}-AI${rowNum}-AJ${rowNum}-AK${rowNum}`, result: net };

    // 39 (AM): Employer PF Cont. 13%
    if (pf > 0) {
      row.getCell(39).value = { formula: `ROUND(T${rowNum}*13%,0)`, result: erPf };
    } else {
      row.getCell(39).value = 0;
    }

    // 40 (AN): Employer ESIC Cont. 3.25%
    if (esi > 0) {
      row.getCell(40).value = { formula: `ROUND(AH${rowNum}*3.25%,0)`, result: erEsic };
    } else {
      row.getCell(40).value = 0;
    }

    // 41 (AO): Labour Welfare Fund
    row.getCell(41).value = lwf;

    // 42 (AP): Service Charge
    row.getCell(42).value = { formula: `ROUND(AH${rowNum}+AM${rowNum}+AN${rowNum}+AO${rowNum},0)*5%`, result: serviceCharge };
    row.getCell(42).numFmt = "0";

    // 43 (AQ): Exps Voucher Amount
    row.getCell(43).value = expVoucher;

    // 44 (AR): Service Charge On Exps Voucher
    row.getCell(44).value = { formula: `AQ${rowNum}*2%`, result: scOnExp };
    row.getCell(44).numFmt = "0";

    // 45 (AS): Grand Total
    row.getCell(45).value = { formula: `AH${rowNum}+AM${rowNum}+AN${rowNum}+AO${rowNum}+AP${rowNum}+AQ${rowNum}+AR${rowNum}`, result: grandTotal };
    row.getCell(45).numFmt = "0";

    // Style each data cell in the row
    for (let colIdx = 1; colIdx <= 45; colIdx++) {
      const cell = row.getCell(colIdx);
      cell.font = { name: "Arial", size: 10 };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
      cell.alignment = {
        horizontal: "left",
        vertical: "middle",
      };
    }
  });
}

// Backward compatibility alias
export const addCotecnaSalaryRegisterSheet = addMonthlySalaryRegisterSheet;
