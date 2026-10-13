import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GEMINI_LITE, GEMINI_MAIN } from "@/utils/ai/chat/constant";
import { google as googleAi } from "@ai-sdk/google";
import { z } from "@canny_ecosystem/utils";
import { generateObject } from "ai";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function ensureEnvLoaded() {
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/management/.env"),
    path.resolve(currentDir, "../.env"),
    path.resolve(currentDir, "../../.env"),
  ];
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
      }
    } catch {}
  }
}
ensureEnvLoaded();

const PayrollAISchema = z.object({
  headerRowIndex: z
    .number()
    .describe(
      "0-indexed row number where the main column headers are located (e.g. 0, 1, or 2). Check the sample rows for the row containing column title labels.",
    ),

  secondaryHeaderRowIndex: z
    .number()
    .nullable()
    .describe(
      "0-indexed row number if headers are multi-row / stacked (e.g. Row 1 has parent groups like 'Rate of Wages' / 'Earned Wages' or 'Gross' and Row 2 has child column headers 'Basic', 'HRA', etc.), else null if headers are single-row.",
    ),

  dataStartRowIndex: z
    .number()
    .describe(
      "0-indexed row number where actual employee records begin (typically the row immediately following the header or secondary header).",
    ),

  dataEndRowIndex: z
    .number()
    .nullable()
    .describe(
      "0-indexed row number where actual employee records end (immediately before summary totals, averages, grand totals, or signature blocks). Return null if employee data extends beyond sample rows.",
    ),

  employeeNameCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing the Employee's Full Name.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Name', 'Employee Name', 'Staff Name', 'Name of Workman').",
        ),
      cleanHeader: z
        .string()
        .default("employee_name")
        .describe("Clean output column header: 'employee_name'."),
      reasoning: z
        .string()
        .describe("Explanation why this column was chosen as employee name."),
    })
    .nullable()
    .describe(
      "Column containing Employee Name. STRICT: Exclude personal non-payment metadata columns such as Father Name, Mother Name, Gender, DOB, DOJ, Designation, Department, Branch, Location, Bank details, PAN, or Remarks. Return null if no employee name column exists.",
    ),

  employeeCodeCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Employee Code / ID."),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Emp Code', 'Code', 'Emp ID', 'Staff ID', 'Card No').",
        ),
      cleanHeader: z
        .string()
        .default("employee_code")
        .describe("Clean output column header: 'employee_code'."),
      reasoning: z
        .string()
        .describe("Explanation why this column was chosen as employee code."),
    })
    .nullable()
    .describe(
      "Column containing Employee Code / ID number. Return null if not found.",
    ),

  esicCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Employee ESIC Registration / IP Number.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'ESIC No', 'ESI No', 'IP No', 'ESIC Number').",
        ),
      cleanHeader: z
        .string()
        .default("esic_no")
        .describe("Clean output column header: 'esic_no'."),
      reasoning: z
        .string()
        .describe(
          "Explanation why this column was chosen as ESIC IP / registration number.",
        ),
    })
    .nullable()
    .describe(
      "CRITICAL: Employee's ESIC IP / Registration Number (identifying number, usually 10 or 17 digits, e.g. 1009123456). Clean header: 'esic_no'. STRICT: DO NOT confuse this with the monthly ESIC employee deduction amount (which belongs under esicDeductionCol)! Return null if employee ESIC IP registration number is not present in the sheet.",
    ),

  uanCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Employee PF Universal Account Number (UAN).",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'UAN', 'UAN No', 'PF UAN').",
        ),
      cleanHeader: z
        .string()
        .default("uan_no")
        .describe("Clean output column header: 'uan_no'."),
      reasoning: z
        .string()
        .describe("Explanation why this column was chosen as PF UAN number."),
    })
    .nullable()
    .describe(
      "Employee's PF UAN Number (usually 12 digits, e.g. 100912345678). Clean header: 'uan_no'. Return null if not present in the sheet.",
    ),

  // Attendance columns
  workingDaysCol: z
    .object({
      colIndex: z
        .number()
        .nullable()
        .describe(
          "0-indexed column index if Working Days / Month Days is an explicit column in the sheet, else null if Working Days is derived from formula or arithmetic division.",
        ),
      originalHeader: z
        .string()
        .nullable()
        .describe(
          "Original header text in source sheet if present (e.g. 'Working Days', 'Total Days', 'Month Days', 'W.Days', 'Std Days', 'Calendar Days'), else null if taken from formula divisor.",
        ),
      cleanHeader: z
        .string()
        .default("working_days")
        .describe(
          "Clean column header name for output (default: 'working_days').",
        ),
      dividedNumber: z
        .number()
        .nullable()
        .describe(
          "The numeric divisor used to divide monthly amount/rate fields to calculate per-day rates (e.g. 30, 26, 31, 28). MANDATORY: If amount formulas or arithmetic divide rate amounts by a literal number (like /30 or /26) even without a separate column in the sheet, YOU MUST SET THIS TO THAT DIVIDED NUMBER!",
        ),
      reasoning: z
        .string()
        .describe(
          "Explanation: whether extracted from a dedicated column or derived from division arithmetic in amount fields.",
        ),
    })
    .nullable()
    .describe(
      "MANDATORY ATTENDANCE RULE 1 - WORKING DAYS (REQUIRED):\n" +
        "- Clean header MUST be 'working_days'.\n" +
        "- DO NOT COUNT WORKING DAYS AS ADDITION OF MULTIPLE COLUMNS (e.g. Present Days + PH Days, or any sum of columns). NEVER DO THAT!\n" +
        "- ONLY TAKE WORKING DAYS IF:\n" +
        "  1) There are TWO explicit attendance fields in the sheet (one explicitly Working Days / Month Days / Std Days, and one Present Days). If a column is a sum or addition of other columns, it is NOT working days.\n" +
        "  2) If in Basic formula it is divided (divisor number between 20 and 31 like / 26 or / 30). In this case set colIndex to null and set dividedNumber to that divisor.\n" +
        "  3) Otherwise, 26 static (or MAX(26, present days)). That's it!\n" +
        "- If only ONE attendance column is in the sheet, it is strictly Present Days! In that case set workingDaysCol.colIndex to null.\n" +
        "- RANGE [0, 31]: All attendance day values must be between 0 and 31.",
    ),

  presentDaysCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Present Days / Actual Worked Days.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Present Days', 'P.Days', 'Present', 'Actual Days', 'No of Days Worked', 'No. of days Worked', 'Attendance', 'Atten.').",
        ),
      cleanHeader: z
        .string()
        .default("present_days")
        .describe("Clean descriptive header: 'present_days'."),
      reasoning: z
        .string()
        .describe(
          "Explanation: column header or column cell used as multiplier in Basic formula.",
        ),
    })
    .nullable()
    .describe(
      "MANDATORY ATTENDANCE RULE 2 - PRESENT DAYS (REQUIRED):\n" +
        "- Clean header MUST be 'present_days'.\n" +
        "- STRICT NAMING: If a column is named 'no of days worked', 'no of worked days', 'no of present days', 'present days', 'days worked', 'worked days', 'attendance', 'present', 'p days', 'actual days', THAT IS ONLY PRESENT DAYS, NEVER WORKING DAYS!\n" +
        "- If only ONE attendance column is in the sheet, it is ALWAYS Present Days only!\n" +
        "- CRITICAL RULE: NEVER KEEP PRESENT DAYS BLANK! If you cannot figure out present days from column headers, look at the Basic formula: the column cell that is used in the Basic formula as a multiplier (NOT a static number like * 1 or * 2 or * 8, but a column cell reference like * C2 or C2 *), THAT COLUMN CELL IS PRESENT DAYS! Set presentDaysCol.colIndex to that column cell so present_days is populated.\n" +
        "- RANGE [0, 31]: All attendance values must be between 0 and 31.",
    ),

  phCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Paid Holidays (PH)."),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'PH', 'Paid Holiday', 'Paid Holidays', 'Holidays', 'Festive Holiday', 'National Holiday', 'NH', 'FH').",
        ),
      cleanHeader: z.string().default("ph").describe("Clean header: 'ph'."),
      reasoning: z
        .string()
        .describe("Explanation: holiday days component from sheet column."),
    })
    .nullable()
    .describe(
      "ATTENDANCE RULE 3 - PAID HOLIDAYS (ph):\n" +
        "Paid Holidays component (PH, Paid Holiday, FH, NH). Clean header: 'ph'. Return null if not present.",
    ),

  clCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Casual Leaves (CL) / Paid Leaves.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'CL', 'Casual Leave', 'Casual Holiday', 'Leave', 'Leaves').",
        ),
      cleanHeader: z.string().default("cl").describe("Clean header: 'cl'."),
      reasoning: z
        .string()
        .describe(
          "Explanation: casual leave days component from sheet column.",
        ),
    })
    .nullable()
    .describe(
      "ATTENDANCE RULE 4 - CASUAL LEAVES (cl):\n" +
        "Casual Leaves (CL, Casual Leave). Clean header: 'cl'. Return null if not present.",
    ),

  elCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Earned Leaves / Privilege Leaves (EL / PL).",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'EL', 'Earned Leave', 'PL', 'Privilege Leave', 'Paid Leave', 'SL', 'Sick Leave').",
        ),
      cleanHeader: z.string().default("el").describe("Clean header: 'el'."),
      reasoning: z
        .string()
        .describe(
          "Explanation: earned/privilege leave days component from sheet column.",
        ),
    })
    .nullable()
    .describe(
      "ATTENDANCE RULE 5 - EARNED LEAVES (el):\n" +
        "Earned Leaves / Privilege Leaves (EL, PL, Paid Leave, SL). Clean header: 'el'. Return null if not present.",
    ),

  otDaysCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Overtime attendance."),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'OT', 'OT Hours', 'OT Days', 'OT Hrs', 'Overtime').",
        ),
      cleanHeader: z
        .string()
        .default("ot_days")
        .describe("Clean header: 'ot_days'."),
      reasoning: z.string().describe("Explanation: overtime attendance field."),
    })
    .nullable()
    .describe(
      "ATTENDANCE RULE 6 - OVERTIME (ot_days):\n" +
        "- IF OT is written and value is exceeding 99: It is an OT AMOUNT wage in Rupees, NOT attendance! (Place in overtimeCol, NOT here!). In such case, derive OT days from the formula of that OT cell, figure out from the formula if it is OT hours or days - if hours, convert to days by dividing by 8.\n" +
        "- IF OT is written and value is exceeding 31 (up to 99) or header says 'Hours': It is probably in OT Hours, convert to days by dividing by 8.\n" +
        "- IF OT values are between 0 and 100: It is valid day attendance.\n" +
        "Return null if no OT attendance column is present.",
    ),

  // Earnings columns
  basicCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing actual attendance-earned Basic wages.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Basic', 'Basic Pay', 'Earned Basic', 'Actual Basic', 'Basic Wages').",
        ),
      cleanHeader: z
        .string()
        .default("basic")
        .describe("Clean header: 'basic'."),
      reasoning: z
        .string()
        .describe(
          "Explanation confirming this column is actual earned Basic flowing into Net Pay, NOT a fixed master rate.",
        ),
    })
    .nullable()
    .describe(
      "MANDATORY EARNINGS RULE 1 - BASIC (REQUIRED):\n" +
        "- Clean header MUST be 'basic'.\n" +
        "- SELECT ONLY the attendance-calculated / actual earned Basic wages (e.g. 15,000) that flow into Net Pay!\n" +
        "- NEVER SELECT fixed monthly master rate columns (e.g. Basic 20,000 when earned is 15,000).",
    ),

  daCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Dearness Allowance (DA)."),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'DA', 'D.A.', 'Dearness Allowance').",
        ),
      cleanHeader: z.string().default("da").describe("Clean header: 'da'."),
      reasoning: z.string().describe("Explanation for DA column detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 2 - DEARNESS ALLOWANCE (da):\n" +
        "Dearness Allowance (DA / D.A.). Clean header: 'da'. Return null if not present.",
    ),

  hraCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing House Rent Allowance (HRA).",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'HRA', 'H.R.A.', 'House Rent Allowance').",
        ),
      cleanHeader: z.string().default("hra").describe("Clean header: 'hra'."),
      reasoning: z.string().describe("Explanation for HRA column detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 3 - HOUSE RENT ALLOWANCE (hra):\n" +
        "House Rent Allowance (HRA / H.R.A.). Clean header: 'hra'. Return null if not present.",
    ),

  ltaCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Leave Travel Allowance (LTA).",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'LTA', 'L.T.A.', 'Leave Travel Allowance', 'LTC').",
        ),
      cleanHeader: z.string().default("lta").describe("Clean header: 'lta'."),
      reasoning: z.string().describe("Explanation for LTA column detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 4 - LEAVE TRAVEL ALLOWANCE (lta):\n" +
        "Leave Travel Allowance (LTA / LTC). Clean header: 'lta'. Return null if not present.",
    ),

  bonusCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Statutory Bonus / Incentive.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Bonus', 'Statutory Bonus', 'Incentive', 'Ex Gratia', 'Ex-Gratia').",
        ),
      cleanHeader: z
        .string()
        .default("bonus")
        .describe("Clean header: 'bonus'."),
      reasoning: z.string().describe("Explanation for Bonus column detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 5 - BONUS (bonus):\n" +
        "Statutory Bonus / Incentive (Bonus, Incentive, Ex-Gratia). Clean header: 'bonus'. Return null if not present.",
    ),

  overtimeCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Overtime monetary wage amount.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'OT Amount', 'OT Wages', 'Overtime', 'OT Amt', 'OT Pay').",
        ),
      cleanHeader: z
        .string()
        .default("ot_amount")
        .describe("Clean header: 'ot_amount'."),
      reasoning: z
        .string()
        .describe("Explanation for Overtime wage detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 6 - OVERTIME WAGE AMOUNT ('ot_amount'):\n" +
        "Overtime monetary wage in Rupees (values > 99 or header OT Amount/Wages). Clean header: 'ot_amount'. Return null if not present.",
    ),

  allowanceCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Allowance / Other Allowance.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Allowance', 'Allow', 'Allowa', 'Other Allowance', 'Special Allowance', 'Allowances').",
        ),
      cleanHeader: z
        .string()
        .default("allowance")
        .describe("Clean header: 'allowance'."),
      reasoning: z
        .string()
        .describe("Explanation for Allowance column detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 7 - ALLOWANCE ('allowance'):\n" +
        "Allowance earning column (e.g. 'Allowance', 'Allow', 'Allowa', 'Other Allowance', 'Special Allowance'). Clean header: 'allowance'. Return null if not present.",
    ),

  leaveSalaryCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Leave Salary / Leave Wages / Leave Encashment.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Leave Salary', 'Leave Wages', 'Leave Pay', 'Leave Encashment', 'Leave Amt').",
        ),
      cleanHeader: z
        .string()
        .default("leave_salary")
        .describe("Clean header: 'leave_salary'."),
      reasoning: z
        .string()
        .describe("Explanation for Leave Salary column detection."),
    })
    .nullable()
    .describe(
      "EARNINGS RULE 8 - LEAVE SALARY ('leave_salary'):\n" +
        "Leave Salary earning column (e.g. 'Leave Salary', 'Leave Wages', 'Leave Pay', 'Leave Encashment'). Clean header: 'leave_salary'. Return null if not present.",
    ),

  // Deduction columns
  pfCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Employee Provident Fund deduction.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'PF', 'P.F.', 'EPF', 'Provident Fund', 'PF Employee').",
        ),
      cleanHeader: z.string().default("pf").describe("Clean header: 'pf'."),
      reasoning: z.string().describe("Explanation for PF deduction detection."),
    })
    .nullable()
    .describe(
      "DEDUCTIONS RULE 1 - PROVIDENT FUND (pf):\n" +
        "Employee Provident Fund deduction (PF / EPF). EXCLUDE employer contribution. Clean header: 'pf'. Return null if not present.",
    ),

  esicDeductionCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Employee ESIC contribution deduction.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'ESIC', 'ESI', 'ESIC Deduction', 'ESI Deduction', 'ESIC Emp').",
        ),
      cleanHeader: z.string().default("esic").describe("Clean header: 'esic'."),
      reasoning: z
        .string()
        .describe("Explanation for ESIC deduction detection."),
    })
    .nullable()
    .describe(
      "DEDUCTIONS RULE 2 - ESIC DEDUCTION (esic):\n" +
        "Employee ESIC statutory contribution deduction from wage (e.g. 'ESIC', 'ESI', 'ESIC Deduction'). NOT the 10/17 digit registration number! Clean header: 'esic'. Return null if not present.",
    ),

  ptCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Professional Tax deduction.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'PT', 'P.T.', 'Prof Tax', 'Professional Tax', 'P. Tax').",
        ),
      cleanHeader: z.string().default("pt").describe("Clean header: 'pt'."),
      reasoning: z.string().describe("Explanation for PT deduction detection."),
    })
    .nullable()
    .describe(
      "DEDUCTIONS RULE 3 - PROFESSIONAL TAX (pt):\n" +
        "Professional Tax deduction (PT). Clean header: 'pt'. Return null if not present.",
    ),

  lwfCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Labour Welfare Fund deduction.",
        ),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'LWF', 'L.W.F.', 'Labour Welfare Fund', 'Welfare').",
        ),
      cleanHeader: z.string().default("lwf").describe("Clean header: 'lwf'."),
      reasoning: z
        .string()
        .describe("Explanation for LWF deduction detection."),
    })
    .nullable()
    .describe(
      "DEDUCTIONS RULE 4 - LABOUR WELFARE FUND (lwf):\n" +
        "Labour Welfare Fund deduction (LWF). Clean header: 'lwf'. Return null if not present.",
    ),

  // Extra fields
  advanceCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Advance."),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Advance', 'Salary Advance', 'Staff Advance', 'Adv').",
        ),
      cleanHeader: z
        .string()
        .default("advance")
        .describe("Clean header: 'advance'."),
      reasoning: z
        .string()
        .describe("Explanation for Advance column detection."),
    })
    .nullable()
    .describe(
      "EXTRA FIELD 1 - ADVANCE (advance):\n" +
        "Advance column (Advance, Salary Advance). Clean header: 'advance'. Return null if not present.\n" +
        "Whether it is placed in earnings or deductions is determined from its Net Pay formula (+ -> earning, - -> deduction).",
    ),

  expenseCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Expense / Reimbursement."),
      originalHeader: z
        .string()
        .describe(
          "Header text in source sheet (e.g. 'Expense', 'Expenses', 'Reimbursement', 'Claim').",
        ),
      cleanHeader: z
        .string()
        .default("expense")
        .describe("Clean header: 'expense'."),
      reasoning: z
        .string()
        .describe("Explanation for Expense column detection."),
    })
    .nullable()
    .describe(
      "EXTRA FIELD 2 - EXPENSE (expense):\n" +
        "Expense / Claim reimbursement column (Expense, Claim, Reimbursement). Clean header: 'expense'. Return null if not present.\n" +
        "Whether it is placed in earnings or deductions is determined from its Net Pay formula (+ -> earning, - -> deduction).",
    ),

  grossCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing the Gross earned wages / total earnings column in source sheet.",
        ),
      originalHeader: z
        .string()
        .describe(
          "The EXACT header text from the source sheet, e.g. 'Total Gross', 'Gross', 'Earning', 'Total Earnings', 'Gross Wages', 'Actual Wages', 'Gross Salary', 'Total Wages'.",
        ),
      cleanHeader: z
        .string()
        .default("gross")
        .describe("Clean output column header: 'gross'."),
      reasoning: z
        .string()
        .describe(
          "Explanation confirming this column is the gross earned wages / total earnings column.",
        ),
    })
    .nullable()
    .describe(
      "GROSS / TOTAL EARNINGS COLUMN ('gross'):\n" +
        "- Clean header MUST be 'gross'.\n" +
        "- DO NOT calculate or sum from other columns! Detect and import directly from the Excel column with similar names: 'Total Gross', 'Gross', 'Earning', 'Total Earnings', 'Gross Wages', 'Actual Wages', 'Gross Salary', 'Total Wages'.\n" +
        "- Return null if no such column exists in the source sheet.",
    ),

  totalDeductionsCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing the Total Deductions / Deductions column in source sheet.",
        ),
      originalHeader: z
        .string()
        .describe(
          "The EXACT header text from the source sheet, e.g. 'Total Deductions', 'Total Deduction', 'Deductions', 'Total Ded', 'Tot Ded'.",
        ),
      cleanHeader: z
        .string()
        .default("deductions")
        .describe("Clean output column header: 'deductions'."),
      reasoning: z
        .string()
        .describe(
          "Explanation confirming this column is the total deductions column.",
        ),
    })
    .nullable()
    .describe(
      "TOTAL DEDUCTIONS COLUMN ('deductions'):\n" +
        "- Clean header MUST be 'deductions'.\n" +
        "- DO NOT calculate or sum from other columns! Detect and import directly from the Excel column with similar names: 'Total Deductions', 'Total Deduction', 'Deductions', 'Total Ded', 'Tot Ded'.\n" +
        "- Return null if no such column exists in the source sheet.",
    ),

  netPayCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing the final Net Pay / Take Home column in source sheet.",
        ),
      originalHeader: z
        .string()
        .describe(
          "The EXACT header text from the source sheet, e.g. 'Net Pay', 'Net Payable', 'Take Home', 'Net Salary', 'Paid Amount'.",
        ),
      cleanHeader: z
        .string()
        .default("net_pay")
        .describe("Clean output column header: 'net_pay'."),
      reasoning: z
        .string()
        .describe(
          "Explanation confirming this column equals Gross minus Total Deductions in sample rows.",
        ),
    })
    .nullable()
    .describe(
      "MANDATORY NET PAY COLUMN ('net_pay', REQUIRED):\n" +
        "- Clean header MUST be 'net_pay'.\n" +
        "- Detect the Net Pay / Take Home / Net Salary / Net Payable / Paid Amount column in the source sheet.\n" +
        "- In transformed Excel, 'net_pay' is a REQUIRED column placed at the end of every row.",
    ),

  excludedRateColumns: z
    .array(
      z.object({
        colIndex: z
          .number()
          .describe(
            "0-indexed column index containing the excluded rate/master column in the source sheet.",
          ),
        header: z
          .string()
          .describe("Original header text of the excluded rate column."),
        reason: z
          .string()
          .describe(
            "Why this column was excluded (e.g. fixed master rate, not earned wages).",
          ),
      }),
    )
    .default([])
    .describe(
      "RATE / MASTER COLUMNS EXCLUSION:\n" +
        "- List of fixed monthly rate columns detected in the sheet (e.g. 'Basic Rate', 'Rate Basic', 'Gross Rate', 'Rate of Wages', etc.) that were EXCLUDED so only earned wages flow into Net Pay.",
    ),
});

export type PayrollAIAnalysis = z.infer<typeof PayrollAISchema>;

export interface SheetTransformationResult {
  sheetName: string;
  totalRows: number;
  lastRowText: string;
  recordsCount: number;
  columns: string[];
  details: {
    sheetName: string;
    employeeNameCol: string | null;
    employeeCodeCol: string | null;
    esicCol: string | null;
    uanCol: string | null;
    attendance: string[];
    earnings: string[];
    grossCol: string | null;
    deductions: string[];
    netPayCol: string | null;
    excludedRateColumns: string[];
  };
  previewRows?: (string | number)[][];
}

export interface ExcelTransformationResult {
  transformedBuffer: Buffer;
  transformedFilename: string;
  totalRows: number;
  lastRowText: string;
  recordsCount: number;
  columns: string[];
  details: {
    sheetName: string;
    employeeNameCol: string | null;
    employeeCodeCol: string | null;
    esicCol: string | null;
    uanCol: string | null;
    attendance: string[];
    earnings: string[];
    grossCol: string | null;
    deductions: string[];
    netPayCol: string | null;
    excludedRateColumns: string[];
  };
  sheets: SheetTransformationResult[];
}

const SYSTEM_TRANSFORMATION_PROMPT = `You are an expert HR and Payroll AI Data Transformation specialist.
Your task is to analyze an incoming client salary/payroll spreadsheet and detect the columns required to transform it into a standardized, clean payroll workbook.

STANDARDIZED CLOSED COLUMN SET (STRICT):
The transformed payroll workbook must contain ONLY this standardized closed set of column headers (and NO other allowances, other deductions, or summary columns):
1. EMPLOYEE IDENTIFIERS:
   - employee_name: Full name of employee (e.g. 'Employee Name', 'Name', 'Emp Name')
   - employee_code: Employee ID / Code / Card No (e.g. 'Emp Code', 'Code', 'Emp ID')
   - uan_no: 12-digit PF UAN number (e.g. 'UAN', 'UAN No', 'PF UAN')
   - esic_no: 10 or 17-digit ESIC IP / insurance registration number (e.g. 'ESIC No', 'ESI IP', 'ESIC Reg')
2. ATTENDANCE (Mandatory lowercase snake_case headers):
   - working_days (REQUIRED): Month/standard working days. DO NOT count working days as addition of multiple columns like present days + ph days! Only take working days if: (1) there are two explicit attendance fields in the sheet (not an addition/sum column), (2) in Basic formula it is divided (/20 to /31), or (3) 26 static (or MAX(26, present days)). That's it!
   - present_days (REQUIRED): Actual days worked. Any single attendance column (e.g. 'no of days worked', 'attendance', 'present') is strictly present_days. NEVER keep present days blank: if you cannot figure out present days from column headers, find the column cell used as a multiplier in the Basic formula (not a static multiplier, but a column cell reference like * C2 or C2 *), that column is strictly present days! Add that in present_days.
   - ph: Paid Holidays (e.g. 'PH', 'Paid Holiday', 'FH', 'NH').
   - cl: Casual Leaves (e.g. 'CL', 'Casual Leave').
   - el: Earned / Privilege Leaves (e.g. 'EL', 'PL', 'Privilege Leave', 'SL').
   - ot_days: Overtime attendance in days (values <= 31; or values > 31 and <= 99 / 8; or derived from OT amount formula).
3. EARNINGS (Mandatory lowercase snake_case headers):
   - basic (REQUIRED): Attendance-calculated / earned Basic wages that flow into Net Pay (e.g. 'Basic', 'Earned Basic', 'Actual Basic'). NEVER fixed monthly master rate!
   - da: Dearness Allowance (e.g. 'DA', 'D.A.').
   - hra: House Rent Allowance (e.g. 'HRA', 'H.R.A.').
   - lta: Leave Travel Allowance (e.g. 'LTA', 'LTC').
   - bonus: Statutory Bonus / Incentive (e.g. 'Bonus', 'Ex Gratia', 'Incentive').
   - ot_amount: Overtime wage in Rupees (values > 99 or header 'OT Amount' / 'OT Wages').
   - allowance: General / Other Allowance (e.g. 'Allowance', 'Allow', 'Allowa', 'Other Allowance', 'Special Allowance', 'Allowances').
   - leave_salary: Leave Salary / Leave Encashment / Leave Wages (e.g. 'Leave Salary', 'Leave Wages', 'Leave Pay', 'Leave Encashment').
   - gross: Total gross earned wages column. DO NOT calculate from other columns! Import directly from the Excel column with similar names (e.g. 'Total Gross', 'Gross', 'Earning', 'Total Earnings', 'Gross Wages', 'Actual Wages', 'Gross Salary', 'Total Wages').
4. DEDUCTIONS (Mandatory lowercase snake_case headers):
   - pf: Employee Provident Fund deduction (e.g. 'PF', 'EPF', 'Provident Fund').
   - esic: Employee ESIC statutory contribution deduction from wage (e.g. 'ESIC', 'ESI', 'ESIC Deduction').
   - pt: Professional Tax deduction (e.g. 'PT', 'P.T.', 'Prof Tax').
   - lwf: Labour Welfare Fund deduction (e.g. 'LWF', 'Labour Welfare Fund').
   - deductions: Total deductions column. DO NOT calculate from other columns! Import directly from the Excel column with similar names (e.g. 'Total Deductions', 'Total Deduction', 'Deductions', 'Total Ded', 'Tot Ded').
5. EXTRA FIELDS (advance, expense):
   - advance: Salary Advance. Placed in earnings if ADDED (+) to Net Pay; placed in deductions if SUBTRACTED (-) from Net Pay.
   - expense: Expense / Claim Reimbursement. Placed in earnings if ADDED (+) to Net Pay; placed in deductions if SUBTRACTED (-) from Net Pay.
6. NET PAY (Mandatory lowercase snake_case header):
   - net_pay (REQUIRED): Final Net Pay / Take Home salary (e.g. 'Net Pay', 'Net Payable', 'Take Home', 'Net Salary', 'Paid Amount'). Placed at the end of every row.
7. DYNAMIC FORMULA FIELDS (IN GROSS, DEDUCTION, NET PAY):
   - Check the cell formulas of Gross, Deductions, and Net Pay across employee rows.
   - If any column is referenced in these formulas that is NOT in the predefined fields above:
     * If it is ADDED (+) in Gross or Net Pay formula: add it to EARNINGS with its snake_case header (e.g. conveyance, special_allowance, medical).
     * If it is SUBTRACTED (-) in Deductions or Net Pay formula: add it to DEDUCTIONS with its snake_case header (e.g. tds, loan, insurance).
8. STRICT EXCLUSIONS:
   - EXCLUDE fixed monthly master rate columns (e.g. Rate Basic 20,000, Gross Rate 30,000) and list them in excludedRateColumns with reasoning explaining why each is a fixed rate rather than earned wages.
   - EXCLUDE summary rows (Total, Grand Total).

Follow the precise rules specified in each schema field's description to inspect cell values, formulas, and mathematical relationships.`;

/**
 * Extracts formula relationships and mathematical patterns from sample rows.
 */
function extractFormulaAndMathInsights(
  sheet: XLSX.WorkSheet,
  sampleRows: any[][],
): string[] {
  const insights: string[] = [];
  const divisorColCounts = new Map<number, number>();
  const divisorNumberCounts = new Map<number, number>();
  const multiplierColCounts = new Map<number, number>();

  if (sheet) {
    for (const cellAddr of Object.keys(sheet)) {
      if (cellAddr.startsWith("!")) continue;
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;

      let cellCoords: XLSX.CellAddress | null = null;
      try {
        cellCoords = XLSX.utils.decode_cell(cellAddr);
      } catch {}
      if (cellCoords && cellCoords.r > 50) continue; // Sample first 50 rows for insights

      const c = cellCoords ? cellCoords.c : -1;
      const formula = String(cell.f);

      // 1. Division: e.g. / D5 or / 30 or / 26 or / (30) or / $D$2
      const divMatches = formula.match(
        /\/\s*\(?\s*(\$?[A-Za-z]+\$?\d+|\d+(?:\.\d+)?)\s*\)?/g,
      );
      if (divMatches) {
        for (const dm of divMatches) {
          const operand = dm
            .replace(/^\/\s*\(?\s*/, "")
            .replace(/\s*\)?$/, "")
            .replace(/\$/g, "");
          if (/^[A-Za-z]+\d+$/.test(operand)) {
            try {
              const targetCell = sheet[operand];
              const targetVal = targetCell ? Number(targetCell.v) : Number.NaN;
              if (
                !Number.isNaN(targetVal) &&
                targetVal >= 20 &&
                targetVal <= 31
              ) {
                const rounded = Math.round(targetVal);
                divisorNumberCounts.set(
                  rounded,
                  (divisorNumberCounts.get(rounded) || 0) + 1,
                );
              } else {
                const decoded = XLSX.utils.decode_cell(operand);
                divisorColCounts.set(
                  decoded.c,
                  (divisorColCounts.get(decoded.c) || 0) + 1,
                );
              }
            } catch {}
          } else {
            const num = Math.round(Number(operand));
            if (!Number.isNaN(num) && num >= 20 && num <= 31) {
              divisorNumberCounts.set(
                num,
                (divisorNumberCounts.get(num) || 0) + 1,
              );
            }
          }
        }
      }

      // 2. Multiplication: e.g. * C2 or C2 * (strictly column cell multiplier, ignoring static numbers like * 1 or * 8)
      const mulMatches = formula.match(
        /(?:(?:\*\s*(\$?[A-Za-z]+\$?\d+))|(?:(\$?[A-Za-z]+\$?\d+)\s*\*))/g,
      );
      if (mulMatches) {
        for (const mm of mulMatches) {
          const operand = mm.replace(/[*$\s]/g, "");
          if (/^[A-Za-z]+\d+$/.test(operand)) {
            try {
              const decoded = XLSX.utils.decode_cell(operand);
              if (decoded.c !== c) {
                // Verify column values are within attendance days range [0, 31]
                let hasValidDays = false;
                let hasExcessive = false;
                for (
                  let testR = 1;
                  testR < Math.min(sampleRows.length, 15);
                  testR++
                ) {
                  const rawVal = sampleRows[testR]?.[decoded.c];
                  if (
                    rawVal !== null &&
                    rawVal !== undefined &&
                    rawVal !== ""
                  ) {
                    const num = Number(String(rawVal).replace(/,/g, "").trim());
                    if (!Number.isNaN(num)) {
                      if (num > 31) hasExcessive = true;
                      else if (num > 0 && num <= 31) hasValidDays = true;
                    }
                  }
                }
                if (hasValidDays && !hasExcessive) {
                  multiplierColCounts.set(
                    decoded.c,
                    (multiplierColCounts.get(decoded.c) || 0) + 1,
                  );
                }
              }
            } catch {}
          }
        }
      }
    }
  }

  // Value-based divisor detection across data rows (if formula division was not detected)
  if (
    divisorNumberCounts.size === 0 &&
    divisorColCounts.size === 0 &&
    sampleRows.length >= 2
  ) {
    for (let r = 1; r < Math.min(sampleRows.length, 15); r++) {
      const row = sampleRows[r];
      if (!row || !Array.isArray(row)) continue;
      const numValues: Array<{ col: number; val: number }> = [];
      for (let c = 0; c < row.length; c++) {
        const raw = row[c];
        if (raw === null || raw === undefined || raw === "") continue;
        const clean = Number(String(raw).replace(/,/g, "").trim());
        if (!Number.isNaN(clean) && clean > 0) {
          numValues.push({ col: c, val: clean });
        }
      }
      const daysItems = numValues.filter((it) => it.val >= 1 && it.val <= 31);
      const rateItems = numValues.filter((it) => it.val >= 1000);
      const earnItems = numValues.filter((it) => it.val >= 500);

      for (const d of daysItems) {
        for (const rt of rateItems) {
          for (const en of earnItems) {
            if (rt.col === en.col || rt.col === d.col || en.col === d.col)
              continue;
            if (rt.val > en.val) {
              const calcDiv = Math.round((rt.val * d.val) / en.val);
              if (calcDiv >= 20 && calcDiv <= 31) {
                const expected = (rt.val * d.val) / calcDiv;
                if (Math.abs(expected - en.val) <= 2) {
                  divisorNumberCounts.set(
                    calcDiv,
                    (divisorNumberCounts.get(calcDiv) || 0) + 1,
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  // Format detected insights
  if (divisorColCounts.size > 0) {
    const sortedDivisors = Array.from(divisorColCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    insights.push(
      `Working Days Divisor: Column [C${sortedDivisors[0][0]}] appears in formulas as divisor (/ [C${sortedDivisors[0][0]}])`,
    );
  }

  if (divisorNumberCounts.size > 0) {
    const sortedNums = Array.from(divisorNumberCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    insights.push(
      `Working Days Divisor Number: Formula/arithmetic divides amounts by literal number ${sortedNums[0][0]} (/ ${sortedNums[0][0]}). MANDATORY: Working Days is not a separate column in the sheet, so you MUST set workingDaysCol.colIndex to null and set workingDaysCol.dividedNumber to ${sortedNums[0][0]}.`,
    );
  }

  if (multiplierColCounts.size > 0) {
    const sortedMultipliers = Array.from(multiplierColCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    insights.push(
      `Present Days Multiplier: Column [C${sortedMultipliers[0][0]}] appears in formulas as a column cell multiplier (* [C${sortedMultipliers[0][0]}]). Values are in [0, 31]. This column is strictly Present Days! Set presentDaysCol.colIndex to ${sortedMultipliers[0][0]}. NEVER leave Present Days blank.`,
    );
  }

  // Check Net Pay formula signs and attendance structure for guidance in prompt
  if (sampleRows.length > 0 && sheet) {
    const headerRow = sampleRows[0] || [];
    let netPayCol = -1;
    let grossCol = -1;
    let dedCol = -1;
    let basicCol = -1;
    const attCols: number[] = [];
    const otCols: number[] = [];

    for (let c = 0; c < headerRow.length; c++) {
      const h = String(headerRow[c] || "").toLowerCase();
      if (/net\s*pay|net\s*salary|take\s*home|net\s*payable/i.test(h))
        netPayCol = c;
      if (/gross|total\s*gross|total\s*earning|total\s*wages/i.test(h))
        grossCol = c;
      if (/total\s*ded|deductions?/i.test(h)) dedCol = c;
      if (/basic/i.test(h) && basicCol === -1) basicCol = c;
      if (/ot|overtime/i.test(h)) otCols.push(c);
      if (
        /attend|present|work|days|w\.?day|p\.?day/i.test(h) &&
        !/ph|paid\s*hol|holiday|ot|overtime/i.test(h)
      ) {
        // Range check: values must be in [0, 31]
        let valid = false;
        let excessive = false;
        for (let r = 1; r < Math.min(sampleRows.length, 10); r++) {
          const val = Number(sampleRows[r]?.[c]);
          if (!Number.isNaN(val)) {
            if (val > 31) excessive = true;
            else if (val > 0 && val <= 31) valid = true;
          }
        }
        if (valid && !excessive) attCols.push(c);
      }
    }

    if (attCols.length === 1) {
      insights.push(
        `Single Attendance Column: Only one attendance column [C${attCols[0]}] exists. Per rule, this MUST be Present Days! Set workingDaysCol.colIndex to null and use the Basic formula divisor or static 26.`,
      );
    } else if (attCols.length >= 2) {
      insights.push(
        `Multiple Attendance Columns: Columns [${attCols.map((c) => `C${c}`).join(", ")}] are attendance. Per rule: DO NOT count working days as addition of multiple columns like present days + ph days! Only take working days if there are two explicit fields (one specifically Working Days, one Present Days). Otherwise set workingDaysCol.colIndex to null and take working days from Basic formula divisor (/20 to /31) or static 26. That's it!`,
      );
    }

    for (const otC of otCols) {
      let maxOt = 0;
      for (let r = 1; r < Math.min(sampleRows.length, 10); r++) {
        const v = Number(sampleRows[r]?.[otC]);
        if (!Number.isNaN(v) && v > maxOt) maxOt = v;
      }
      if (maxOt > 99) {
        insights.push(
          `OT Column [C${otC}] has values > 99 (${maxOt}). It is an OT Amount (rupees), NOT attendance! Place it in Earnings.`,
        );
      } else if (maxOt > 31) {
        insights.push(
          `OT Column [C${otC}] has values > 31 (${maxOt}). It is in OT Hours. Convert to OT Days by dividing by 8.`,
        );
      }
    }

    if (netPayCol >= 0 || grossCol >= 0 || dedCol >= 0) {
      const signs = analyzeNetPayAndGrossFormulaSigns({
        sheet,
        sampleRows,
        netPayColIdx: netPayCol >= 0 ? netPayCol : null,
        grossColIdx: grossCol >= 0 ? grossCol : null,
        deductionsColIdx: dedCol >= 0 ? dedCol : null,
        dataStartRowIndex: 1,
      });
      if (signs.addedCols.size > 0 || signs.subtractedCols.size > 0) {
        const addedList = Array.from(signs.addedCols).map((c) => `C${c}`);
        const subList = Array.from(signs.subtractedCols).map((c) => `C${c}`);
        insights.push(
          `Formula Signs (Net Pay / Gross / Deductions): Columns [${addedList.join(", ")}] are ADDED (+) -> MUST be Earnings. Columns [${subList.join(", ")}] are SUBTRACTED (-) -> MUST be Deductions.`,
        );
      }
    }
  }

  return insights;
}

/**
 * Detailed console logging for every decision made by the AI for spreadsheet transformation.
 * Logs decisions for EVERY source column in the sheet, derived columns, exclusions, and target mappings.
 */
function logAIDecisions(
  ai: PayrollAIAnalysis,
  sheetName: string,
  filename: string,
  modelName: string,
  sampleRows?: any[][],
): void {
  console.log("\n======================================================");
  console.log(
    `[AI Transform Decision] Sheet: "${sheetName}" | File: "${filename}" | Model: "${modelName}"`,
  );
  console.log("------------------------------------------------------");
  console.log(`[Structure Decision] Header Row Index: ${ai.headerRowIndex}`);
  if (
    ai.secondaryHeaderRowIndex !== null &&
    ai.secondaryHeaderRowIndex !== undefined
  ) {
    console.log(
      `[Structure Decision] Secondary Header Row: ${ai.secondaryHeaderRowIndex}`,
    );
  }
  console.log(
    `[Structure Decision] Data Rows: ${ai.dataStartRowIndex} to ${ai.dataEndRowIndex ?? "End"}`,
  );

  // 1. Map of column indices to decisions
  const colDecisionMap = new Map<
    number,
    { target: string; clean: string; reason: string }
  >();

  const registerCol = (name: string, colObj: any) => {
    if (colObj && typeof colObj.colIndex === "number" && colObj.colIndex >= 0) {
      colDecisionMap.set(colObj.colIndex, {
        target: name,
        clean: colObj.cleanHeader || name,
        reason: colObj.reasoning || "Matched column pattern in sheet",
      });
    }
  };

  registerCol("employee_name", ai.employeeNameCol);
  registerCol("employee_code", ai.employeeCodeCol);
  registerCol("uan_no", ai.uanCol);
  registerCol("esic_no", ai.esicCol);
  if (
    ai.workingDaysCol &&
    typeof ai.workingDaysCol.colIndex === "number" &&
    ai.workingDaysCol.colIndex >= 0
  ) {
    registerCol("working_days", ai.workingDaysCol);
  }
  registerCol("present_days", ai.presentDaysCol);
  registerCol("ph", ai.phCol);
  registerCol("cl", ai.clCol);
  registerCol("el", ai.elCol);
  registerCol("ot_days", ai.otDaysCol);
  registerCol("basic", ai.basicCol);
  registerCol("da", ai.daCol);
  registerCol("hra", ai.hraCol);
  registerCol("lta", ai.ltaCol);
  registerCol("bonus", ai.bonusCol);
  registerCol("ot_amount", ai.overtimeCol);
  registerCol("allowance", ai.allowanceCol);
  registerCol("leave_salary", ai.leaveSalaryCol);
  registerCol("gross", ai.grossCol);
  registerCol("pf", ai.pfCol);
  registerCol("esic", ai.esicDeductionCol);
  registerCol("pt", ai.ptCol);
  registerCol("lwf", ai.lwfCol);
  registerCol("advance", ai.advanceCol);
  registerCol("expense", ai.expenseCol);
  registerCol("deductions", ai.totalDeductionsCol);
  registerCol("net_pay", ai.netPayCol);

  const excludedRateMap = new Map<number, string>();
  if (ai.excludedRateColumns && Array.isArray(ai.excludedRateColumns)) {
    for (const ec of ai.excludedRateColumns) {
      if (typeof ec.colIndex === "number" && ec.colIndex >= 0) {
        excludedRateMap.set(
          ec.colIndex,
          ec.reason || "Fixed master rate column, excluded from earned payroll",
        );
      }
    }
  }

  // Determine all source columns in the spreadsheet
  const headerRow =
    sampleRows && sampleRows.length > ai.headerRowIndex
      ? sampleRows[ai.headerRowIndex] || []
      : sampleRows && sampleRows.length > 0
        ? sampleRows[0] || []
        : [];

  const totalCols = headerRow.length;

  if (totalCols > 0) {
    console.log(
      `\n--- [Source Column-by-Column Decisions: ${totalCols} Columns Analyzed] ---`,
    );
    for (let c = 0; c < totalCols; c++) {
      const origHeader = String(headerRow[c] ?? "").trim();
      const colLabel = `Col ${String(c).padStart(2, " ")} ("${origHeader || "Empty"}")`;

      if (colDecisionMap.has(c)) {
        const dec = colDecisionMap.get(c)!;
        console.log(
          `  ✓ ${colLabel.padEnd(30)} -> MAPPED to '${dec.target}' [clean: '${dec.clean}'] | Reason: ${dec.reason}`,
        );
      } else if (excludedRateMap.has(c)) {
        console.log(
          `  ✕ ${colLabel.padEnd(30)} -> EXCLUDED (Rate Column) | Reason: ${excludedRateMap.get(c)}`,
        );
      } else {
        const hLow = origHeader.toLowerCase();
        if (/rate|master/i.test(hLow)) {
          console.log(
            `  ✕ ${colLabel.padEnd(30)} -> EXCLUDED (Rate Column) | Reason: Header indicates fixed master rate rather than earned wages`,
          );
        } else if (
          /father|mother|gender|sex|dob|doj|designation|department|dept|branch|location|bank|ifsc|account|ac\s*no|pan|address|marital|blood/i.test(
            hLow,
          )
        ) {
          console.log(
            `  ⊘ ${colLabel.padEnd(30)} -> SKIPPED (Personal Metadata) | Reason: Non-payment employee metadata excluded from payroll transform`,
          );
        } else if (origHeader === "") {
          console.log(
            `  - ${colLabel.padEnd(30)} -> SKIPPED (Empty Header) | Reason: Blank or unused column`,
          );
        } else {
          console.log(
            `  - ${colLabel.padEnd(30)} -> UNMAPPED | Reason: Not mapped to any schema field in current transformation`,
          );
        }
      }
    }
  }

  // 2. Log Derived Attendance Decisions
  console.log("\n--- [Derived Field Decisions] ---");
  if (!ai.workingDaysCol || ai.workingDaysCol.colIndex === null) {
    console.log(
      `  ★ working_days     : DERIVED from Basic formula divisor (${ai.workingDaysCol?.dividedNumber ?? "None"}) or static MAX(26, present_days) | Reason: ${ai.workingDaysCol?.reasoning || "Derived via attendance rules"}`,
    );
  } else {
    console.log(
      `  ✓ working_days     : From Col ${ai.workingDaysCol.colIndex} ("${ai.workingDaysCol.originalHeader}") | Divisor: ${ai.workingDaysCol.dividedNumber ?? "None"} | Reason: ${ai.workingDaysCol.reasoning}`,
    );
  }
  if (!ai.presentDaysCol || ai.presentDaysCol.colIndex === null) {
    console.log(
      "  ★ present_days     : DERIVED from Basic formula column multiplier cell (* Cell)",
    );
  }

  // 3. Log Target Schema Summary
  const logCol = (name: string, col: any) => {
    if (col && typeof col.colIndex === "number" && col.colIndex >= 0) {
      console.log(
        `  ✓ ${name.padEnd(16)} -> Col ${col.colIndex} ("${col.originalHeader || ""}") [clean: "${col.cleanHeader || ""}"] | Reason: ${col.reasoning || "N/A"}`,
      );
    } else {
      console.log(`  - ${name.padEnd(16)} -> Not Found (null)`);
    }
  };

  console.log("\n--- [Target Schema: Identifiers] ---");
  logCol("employee_name", ai.employeeNameCol);
  logCol("employee_code", ai.employeeCodeCol);
  logCol("uan_no", ai.uanCol);
  logCol("esic_no", ai.esicCol);

  console.log("\n--- [Target Schema: Attendance] ---");
  if (
    ai.workingDaysCol &&
    typeof ai.workingDaysCol.colIndex === "number" &&
    ai.workingDaysCol.colIndex >= 0
  ) {
    logCol("working_days", ai.workingDaysCol);
  } else {
    console.log(
      `  ★ working_days     -> Derived (Divisor: ${ai.workingDaysCol?.dividedNumber ?? "None"}) | Reason: ${ai.workingDaysCol?.reasoning || "Derived"}`,
    );
  }
  logCol("present_days", ai.presentDaysCol);
  logCol("ph", ai.phCol);
  logCol("cl", ai.clCol);
  logCol("el", ai.elCol);
  logCol("ot_days", ai.otDaysCol);

  console.log("\n--- [Target Schema: Earnings] ---");
  logCol("basic", ai.basicCol);
  logCol("da", ai.daCol);
  logCol("hra", ai.hraCol);
  logCol("lta", ai.ltaCol);
  logCol("bonus", ai.bonusCol);
  logCol("ot_amount", ai.overtimeCol);
  logCol("allowance", ai.allowanceCol);
  logCol("leave_salary", ai.leaveSalaryCol);
  logCol("gross", ai.grossCol);

  console.log("\n--- [Target Schema: Deductions] ---");
  logCol("pf", ai.pfCol);
  logCol("esic", ai.esicDeductionCol);
  logCol("pt", ai.ptCol);
  logCol("lwf", ai.lwfCol);
  logCol("advance", ai.advanceCol);
  logCol("expense", ai.expenseCol);
  logCol("deductions", ai.totalDeductionsCol);

  console.log("\n--- [Target Schema: Net Pay] ---");
  logCol("net_pay", ai.netPayCol);

  if (ai.excludedRateColumns && ai.excludedRateColumns.length > 0) {
    console.log("\n--- [AI Excluded Rate / Master Columns] ---");
    for (const ec of ai.excludedRateColumns) {
      console.log(
        `  ✕ Excluded Rate Col ${ec.colIndex} ("${ec.header}"): ${ec.reason}`,
      );
    }
  }
  console.log("======================================================\n");
}

/**
 * Analyzes a spreadsheet matrix using GEMINI_MAIN to detect columns for transformed payroll Excel.
 */
async function analyzePayrollSheetWithAI({
  sheetName,
  filename,
  totalRows,
  sampleRows,
  sheet,
}: {
  sheetName: string;
  filename: string;
  totalRows: number;
  sampleRows: any[][];
  sheet: XLSX.WorkSheet;
}): Promise<PayrollAIAnalysis> {
  ensureEnvLoaded();
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY in environment. Cannot perform AI transformation.",
    );
  }

  // Format sample rows with clear row, column indices, and cell formulas
  const formattedSample = sampleRows
    .map((row, rIdx) => {
      let lastNonEmpty = -1;
      for (let c = row.length - 1; c >= 0; c--) {
        if (
          row[c] !== null &&
          row[c] !== undefined &&
          String(row[c]).trim() !== ""
        ) {
          lastNonEmpty = c;
          break;
        }
      }
      if (lastNonEmpty === -1) {
        return `Row ${rIdx}: [Empty]`;
      }
      const cells = row
        .slice(0, lastNonEmpty + 1)
        .map((val, cIdx) => {
          const cellAddr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          const cell = sheet ? sheet[cellAddr] : null;
          const formula = cell?.f ? cell.f : null;
          if (formula) {
            return `[C${cIdx}]: ${JSON.stringify(val)} (formula: =${formula})`;
          }
          return `[C${cIdx}]: ${JSON.stringify(val)}`;
        })
        .join(", ");
      return `Row ${rIdx}: ${cells}`;
    })
    .join("\n");

  const formulaInsights = extractFormulaAndMathInsights(sheet, sampleRows);
  const formulaSection =
    formulaInsights.length > 0
      ? `\n\nDETECTED FORMULA & MATHEMATICAL RELATIONSHIPS IN SAMPLE ROWS:\n${formulaInsights.map((f) => `- ${f}`).join("\n")}`
      : "";

  const prompt = `Spreadsheet Filename: "${filename}"
Sheet Tab: "${sheetName}"
Total Rows in Sheet: ${totalRows}

Spreadsheet Sample (First ${sampleRows.length} rows):
${formattedSample}${formulaSection}

Please analyze the rows, headers, and formulas to detect the allowed columns according to the closed standardized schema:
- EMPLOYEE IDENTIFIERS: employee_name, employee_code, uan_no, esic_no (provide reasoning for each detection)
- ATTENDANCE: working_days (Required), present_days (Required), ph, cl, el, ot_days
- EARNINGS: basic (Required), da, hra, lta, bonus, ot_amount, plus advance / expense if added (+)
- GROSS: gross (Total gross earned wages column. DO NOT calculate from other columns! Detect directly from source sheet column of similar names: 'Total Gross', 'Gross', 'Earning', 'Total Earnings', 'Gross Wages', 'Actual Wages', 'Gross Salary', 'Total Wages')
- DEDUCTIONS: pf, esic, pt, lwf, plus advance / expense if subtracted (-), plus deductions (Total deductions column. DO NOT calculate from other columns! Detect directly from source sheet column of similar names: 'Total Deductions', 'Total Deduction', 'Deductions', 'Total Ded', 'Tot Ded')
- NET PAY: net_pay (REQUIRED: Final net salary / take home pay from columns like 'Net Pay', 'Net Payable', 'Take Home', 'Net Salary')
- Check formulas of Gross, Deductions, and Net Pay to classify advance, expense, and any unlisted allowance/deduction columns based on plus (+) vs minus (-).
- EXCLUDED RATE COLUMNS: Detect any fixed master rate columns (e.g. Rate Basic, Basic Rate, Gross Rate, Rate of Wages) and list them in excludedRateColumns with reasoning explaining why they represent fixed rates rather than earned wages.
- Exclude all other columns from the transformation schema.`;

  const modelsToTry = [GEMINI_LITE, GEMINI_MAIN].filter(
    (m, idx, arr) => arr.indexOf(m) === idx,
  );

  console.log(
    `\n[AI Analyze] Sending sheet "${sheetName}" (${filename}, ${totalRows} rows) to AI for column decision analysis...`,
  );

  let lastErr: any = null;
  for (const modelName of modelsToTry) {
    try {
      const result = await generateObject({
        model: googleAi(modelName),
        system: SYSTEM_TRANSFORMATION_PROMPT,
        prompt,
        schema: PayrollAISchema,
        temperature: 0.1,
      });

      logAIDecisions(result.object, sheetName, filename, modelName, sampleRows);
      return result.object;
    } catch (err: any) {
      console.warn(
        `[PayrollExcelTransform] Model "${modelName}" failed, trying next candidate:`,
        err?.message || err,
      );
      lastErr = err;
    }
  }

  throw lastErr;
}

function toSnakeCaseHeader(header: string): string {
  const clean = String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || "custom_field";
}

/**
 * Analyzes Net Pay, Gross, and Total Deductions formulas across sample rows to determine which columns
 * are mathematically added (+) or subtracted (-) to compute pay.
 */
function analyzeNetPayAndGrossFormulaSigns({
  sheet,
  sampleRows,
  netPayColIdx,
  grossColIdx,
  deductionsColIdx,
  dataStartRowIndex,
}: {
  sheet: XLSX.WorkSheet;
  sampleRows: any[][];
  netPayColIdx?: number | null;
  grossColIdx?: number | null;
  deductionsColIdx?: number | null;
  dataStartRowIndex: number;
}): {
  addedCols: Set<number>;
  subtractedCols: Set<number>;
} {
  const addedCols = new Set<number>();
  const subtractedCols = new Set<number>();
  if (!sheet) return { addedCols, subtractedCols };

  const summaryColIndices = new Set<number>();
  if (typeof netPayColIdx === "number" && netPayColIdx >= 0)
    summaryColIndices.add(netPayColIdx);
  if (typeof grossColIdx === "number" && grossColIdx >= 0)
    summaryColIndices.add(grossColIdx);
  if (typeof deductionsColIdx === "number" && deductionsColIdx >= 0)
    summaryColIndices.add(deductionsColIdx);

  const parseFormula = (
    formula: string,
    signMultiplier: number,
    rowIdx: number,
    depth = 0,
  ) => {
    if (depth > 5) return;
    const clean = formula.trim().replace(/^=/, "");
    const regex =
      /([+-])?\s*(?:SUM\s*\(([^)]+)\)|([A-Za-z]+\d+:[A-Za-z]+\d+)|(\$?[A-Za-z]+\$?\d+))/gi;
    let match = regex.exec(clean);
    while (match !== null) {
      const explicitSign = match[1] || "+";
      const sign = (explicitSign === "-" ? -1 : 1) * signMultiplier;
      const sumArgs = match[2];
      const rangeArg = match[3];
      const singleCell = match[4];

      if (sumArgs || rangeArg) {
        const target = sumArgs || rangeArg || "";
        const parts = target.split(",");
        for (const part of parts) {
          const p = part.trim();
          if (p.includes(":")) {
            const rangeParts = p.split(":");
            if (rangeParts.length === 2) {
              try {
                const start = XLSX.utils.decode_cell(
                  rangeParts[0].trim().replace(/\$/g, ""),
                );
                const end = XLSX.utils.decode_cell(
                  rangeParts[1].trim().replace(/\$/g, ""),
                );
                for (
                  let c = Math.min(start.c, end.c);
                  c <= Math.max(start.c, end.c);
                  c++
                ) {
                  if (!summaryColIndices.has(c)) {
                    if (sign > 0) addedCols.add(c);
                    else subtractedCols.add(c);
                  }
                }
              } catch {}
            }
          } else if (p) {
            try {
              const decoded = XLSX.utils.decode_cell(p.replace(/\$/g, ""));
              if (!summaryColIndices.has(decoded.c)) {
                if (sign > 0) addedCols.add(decoded.c);
                else subtractedCols.add(decoded.c);
              }
            } catch {}
          }
        }
      } else if (singleCell) {
        try {
          const decoded = XLSX.utils.decode_cell(singleCell.replace(/\$/g, ""));
          const targetCol = decoded.c;

          const targetAddr = XLSX.utils.encode_cell({
            r: rowIdx,
            c: targetCol,
          });
          const targetCell = sheet[targetAddr];
          const tf = targetCell?.f ? String(targetCell.f) : "";
          const isGroupSum =
            tf !== "" &&
            !/[*/]/.test(tf) &&
            (/^[A-Za-z0-9_$.]+\s*[+-]\s*[A-Za-z0-9_$.]+/.test(tf) ||
              /^SUM\(/i.test(tf));

          if (isGroupSum) {
            parseFormula(tf, sign, rowIdx, depth + 1);
          } else {
            if (!summaryColIndices.has(targetCol)) {
              if (sign > 0) addedCols.add(targetCol);
              else subtractedCols.add(targetCol);
            }
          }
        } catch {}
      }

      match = regex.exec(clean);
    }
  };

  // 1. Inspect Net Pay formulas (sign +1)
  if (typeof netPayColIdx === "number" && netPayColIdx >= 0) {
    for (
      let r = dataStartRowIndex;
      r < Math.min(sampleRows.length, dataStartRowIndex + 25);
      r++
    ) {
      const netAddr = XLSX.utils.encode_cell({ r, c: netPayColIdx });
      const netCell = sheet[netAddr];
      if (netCell?.f) {
        parseFormula(String(netCell.f), 1, r);
      }
    }
  }

  // 2. Inspect Gross formulas (sign +1, all components are earnings)
  if (typeof grossColIdx === "number" && grossColIdx >= 0) {
    for (
      let r = dataStartRowIndex;
      r < Math.min(sampleRows.length, dataStartRowIndex + 25);
      r++
    ) {
      const grossAddr = XLSX.utils.encode_cell({ r, c: grossColIdx });
      const grossCell = sheet[grossAddr];
      if (grossCell?.f) {
        parseFormula(String(grossCell.f), 1, r);
      }
    }
  }

  // 3. Inspect Total Deductions formulas (sign -1, all components are deductions)
  if (typeof deductionsColIdx === "number" && deductionsColIdx >= 0) {
    for (
      let r = dataStartRowIndex;
      r < Math.min(sampleRows.length, dataStartRowIndex + 25);
      r++
    ) {
      const dedAddr = XLSX.utils.encode_cell({ r, c: deductionsColIdx });
      const dedCell = sheet[dedAddr];
      if (dedCell?.f) {
        parseFormula(String(dedCell.f), -1, r);
      }
    }
  }

  // Fallback: if no formulas found in initial sample rows, scan other sheet cells in these columns
  if (addedCols.size === 0 && subtractedCols.size === 0) {
    for (const cellAddr of Object.keys(sheet)) {
      if (cellAddr.startsWith("!")) continue;
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;
      try {
        const dec = XLSX.utils.decode_cell(cellAddr);
        if (dec.c === netPayColIdx) parseFormula(String(cell.f), 1, dec.r);
        else if (dec.c === grossColIdx) parseFormula(String(cell.f), 1, dec.r);
        else if (dec.c === deductionsColIdx)
          parseFormula(String(cell.f), -1, dec.r);
      } catch {}
    }
  }

  return { addedCols, subtractedCols };
}

/**
 * Extracts numeric divisor from Basic salary cell formulas (e.g. / 30, / 26).
 */
function extractBasicFormulaDivisor(
  sheet: XLSX.WorkSheet,
  sampleRows: any[][],
  basicColIdx: number,
  dataStartRowIndex: number,
): number | null {
  if (!sheet || basicColIdx < 0) return null;
  const divisorCounts = new Map<number, number>();

  for (
    let r = dataStartRowIndex;
    r < Math.min(sampleRows.length, dataStartRowIndex + 20);
    r++
  ) {
    const cellAddr = XLSX.utils.encode_cell({ r, c: basicColIdx });
    const cell = sheet[cellAddr];
    if (!cell || !cell.f) continue;
    const formula = String(cell.f);

    const divMatches = formula.match(
      /\/\s*\(?\s*(\$?[A-Za-z]+\$?\d+|\d+(?:\.\d+)?)\s*\)?/g,
    );
    if (divMatches) {
      for (const dm of divMatches) {
        const operand = dm
          .replace(/^\/\s*\(?\s*/, "")
          .replace(/\s*\)?$/, "")
          .replace(/\$/g, "");
        if (/^[A-Za-z]+\d+$/.test(operand)) {
          try {
            const targetCell = sheet[operand];
            const targetVal = targetCell ? Number(targetCell.v) : Number.NaN;
            if (
              !Number.isNaN(targetVal) &&
              targetVal >= 20 &&
              targetVal <= 31
            ) {
              const rounded = Math.round(targetVal);
              divisorCounts.set(rounded, (divisorCounts.get(rounded) || 0) + 1);
            }
          } catch {}
        } else {
          const num = Math.round(Number(operand));
          if (!Number.isNaN(num) && num >= 20 && num <= 31) {
            divisorCounts.set(num, (divisorCounts.get(num) || 0) + 1);
          }
        }
      }
    }
  }

  if (divisorCounts.size > 0) {
    const sorted = Array.from(divisorCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    return sorted[0][0];
  }
  return null;
}

/**
 * Detects whether a column is computed or composed as an addition/sum of multiple other columns
 * (e.g. Present Days + PH Days). Per user rule, such columns must NEVER be taken as working days!
 */
function isColumnSumOfOtherColumns(
  sheet: XLSX.WorkSheet,
  colIdx: number,
  sampleRows: any[][],
  headerRowIndex = 0,
): boolean {
  if (colIdx < 0 || sampleRows.length === 0) return false;

  // 1. Check formula in sheet cells: e.g. =C2+D2, =C2+D2+E2, =SUM(C2:D2), =SUM(C2, D2)
  if (sheet) {
    let formulaAddCount = 0;
    let formulaTotalCount = 0;
    for (let r = 0; r < Math.min(sampleRows.length, 30); r++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c: colIdx });
      const cell = sheet[cellAddr];
      if (cell?.f) {
        formulaTotalCount++;
        const f = String(cell.f).trim();
        if (
          /[A-Za-z0-9_$.]+\s*\+\s*[A-Za-z0-9_$.]+/.test(f) ||
          /^SUM\(/i.test(f)
        ) {
          formulaAddCount++;
        }
      }
    }
    if (
      formulaTotalCount > 0 &&
      formulaAddCount >= Math.ceil(formulaTotalCount / 2)
    ) {
      return true;
    }
  }

  // 2. Check values across rows to see if colIdx equals sum of two other attendance columns (e.g. Present + PH)
  const headerRow = sampleRows[headerRowIndex] || [];
  const hText = String(headerRow[colIdx] || "").toLowerCase();
  const isLikelySumHeader =
    /(?:total|tot|payable|paid|gross|net)\s*days?/i.test(hText);

  if (isLikelySumHeader && sampleRows.length >= 3) {
    const numCols = sampleRows[0]?.length || 0;
    for (let c1 = 0; c1 < numCols; c1++) {
      if (c1 === colIdx) continue;
      for (let c2 = c1 + 1; c2 < numCols; c2++) {
        if (c2 === colIdx) continue;
        let matchCount = 0;
        let testCount = 0;
        for (
          let r = headerRowIndex + 1;
          r < Math.min(sampleRows.length, headerRowIndex + 10);
          r++
        ) {
          const sumVal = Number(sampleRows[r]?.[colIdx]);
          const val1 = Number(sampleRows[r]?.[c1]);
          const val2 = Number(sampleRows[r]?.[c2]);
          if (
            !Number.isNaN(sumVal) &&
            !Number.isNaN(val1) &&
            !Number.isNaN(val2) &&
            (val1 > 0 || val2 > 0)
          ) {
            testCount++;
            if (Math.abs(sumVal - (val1 + val2)) < 0.05) {
              matchCount++;
            }
          }
        }
        if (testCount >= 2 && matchCount === testCount) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Extracts the column index of the cell used as a multiplier in Basic formulas
 * (e.g. * C2 or C2 *), strictly ignoring static numbers (like * 1 or * 2 or * 8).
 * The column cell multiplier represents Present Days.
 */
function extractBasicFormulaMultiplierCol(
  sheet: XLSX.WorkSheet,
  sampleRows: any[][],
  basicColIdx: number,
  dataStartRowIndex: number,
): number | null {
  if (!sheet || basicColIdx < 0) return null;
  const colMultiplierCounts = new Map<number, number>();

  for (
    let r = dataStartRowIndex;
    r < Math.min(sampleRows.length, dataStartRowIndex + 40);
    r++
  ) {
    const cellAddr = XLSX.utils.encode_cell({ r, c: basicColIdx });
    const cell = sheet[cellAddr];
    if (!cell || !cell.f) continue;
    const formula = String(cell.f);

    const mulMatches = formula.match(
      /(?:(?:\*\s*(\$?[A-Za-z]+\$?\d+))|(?:(\$?[A-Za-z]+\$?\d+)\s*\*))/g,
    );
    if (!mulMatches) continue;

    for (const mm of mulMatches) {
      const operand = mm.replace(/[*$\s]/g, "");
      if (/^[A-Za-z]+\d+$/.test(operand)) {
        try {
          const decoded = XLSX.utils.decode_cell(operand);
          if (decoded.c === basicColIdx) continue;

          // Verify column values are within attendance days range [0, 31]
          let hasValidDays = false;
          let hasExcessive = false;
          for (
            let testR = dataStartRowIndex;
            testR < Math.min(sampleRows.length, dataStartRowIndex + 20);
            testR++
          ) {
            const rawVal = sampleRows[testR]?.[decoded.c];
            if (rawVal !== null && rawVal !== undefined && rawVal !== "") {
              const num = Number(String(rawVal).replace(/,/g, "").trim());
              if (!Number.isNaN(num)) {
                if (num > 31) hasExcessive = true;
                else if (num > 0 && num <= 31) hasValidDays = true;
              }
            }
          }

          if (hasValidDays && !hasExcessive) {
            colMultiplierCounts.set(
              decoded.c,
              (colMultiplierCounts.get(decoded.c) || 0) + 1,
            );
          }
        } catch {}
      }
    }
  }

  if (colMultiplierCounts.size > 0) {
    const sorted = Array.from(colMultiplierCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    return sorted[0][0];
  }

  return null;
}

/**
 * Extracts Present Days for a specific row if present days could not be determined from column headers.
 * Looks for the column cell used as a multiplier in the Basic formula (e.g. * C2 or C2 *),
 * strictly ignoring static numbers (like * 1 or * 2 or * 8).
 */
function extractRowPresentDays({
  sheet,
  sheetRowIdx,
  row,
  basicColIdx,
  sampleRows,
  fallbackMultiplierCol,
}: {
  sheet: XLSX.WorkSheet;
  sheetRowIdx: number;
  row: any[];
  basicColIdx: number;
  sampleRows: any[][];
  fallbackMultiplierCol?: number | null;
}): number | null {
  // 1. If a known multiplier column was already detected, use row value if valid in [0, 31]
  if (
    typeof fallbackMultiplierCol === "number" &&
    fallbackMultiplierCol >= 0 &&
    fallbackMultiplierCol < row.length
  ) {
    const rawVal = row[fallbackMultiplierCol];
    const cleaned = cleanAttendanceDaysValue(rawVal);
    if (typeof cleaned === "number") {
      return cleaned;
    }
  }

  // 2. Check Basic formula for this specific row in sheet
  if (sheet && sheetRowIdx >= 0 && basicColIdx >= 0) {
    const cellAddr = XLSX.utils.encode_cell({ r: sheetRowIdx, c: basicColIdx });
    const cell = sheet[cellAddr];
    if (cell?.f) {
      const formula = String(cell.f);
      const mulMatches = formula.match(
        /(?:(?:\*\s*(\$?[A-Za-z]+\$?\d+))|(?:(\$?[A-Za-z]+\$?\d+)\s*\*))/g,
      );
      if (mulMatches) {
        for (const mm of mulMatches) {
          const operand = mm.replace(/[*$\s]/g, "");
          if (/^[A-Za-z]+\d+$/.test(operand)) {
            try {
              const decoded = XLSX.utils.decode_cell(operand);
              if (decoded.c !== basicColIdx) {
                const targetCell = sheet[operand];
                const rawVal = targetCell ? targetCell.v : row[decoded.c];
                const cleaned = cleanAttendanceDaysValue(rawVal);
                if (typeof cleaned === "number") {
                  return cleaned;
                }
              }
            } catch {}
          }
        }
      }
    }
  }

  // 3. Check Basic formulas in other sample rows to identify the multiplier column
  if (sheet && basicColIdx >= 0 && sampleRows && sampleRows.length > 0) {
    for (let r = 0; r < Math.min(sampleRows.length, 30); r++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c: basicColIdx });
      const cell = sheet[cellAddr];
      if (cell?.f) {
        const formula = String(cell.f);
        const mulMatches = formula.match(
          /(?:(?:\*\s*(\$?[A-Za-z]+\$?\d+))|(?:(\$?[A-Za-z]+\$?\d+)\s*\*))/g,
        );
        if (mulMatches) {
          for (const mm of mulMatches) {
            const operand = mm.replace(/[*$\s]/g, "");
            if (/^[A-Za-z]+\d+$/.test(operand)) {
              try {
                const decoded = XLSX.utils.decode_cell(operand);
                if (decoded.c !== basicColIdx && decoded.c < row.length) {
                  const cleaned = cleanAttendanceDaysValue(row[decoded.c]);
                  if (typeof cleaned === "number") {
                    return cleaned;
                  }
                }
              } catch {}
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Set of columns that are strictly required and must NEVER be pruned,
 * even if all values across all rows are 0, N/A, or blank.
 */
export const REQUIRED_TRANSFORMED_COLUMNS = new Set<string>([
  "employee_name",
  "employee_code",
  "working_days",
  "present_days",
  "basic",
  "net_pay",
]);

/**
 * Checks whether a cell value is considered zero, N/A, blank, or missing.
 * Used to prune columns where ALL values across employee rows are 0 or N/A.
 */
export function isValueZeroOrNA(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "number") {
    return Number.isNaN(val) || val === 0;
  }
  const s = String(val).trim().toLowerCase();
  if (s === "") return true;
  if (
    s === "0" ||
    s === "0.0" ||
    s === "0.00" ||
    s === "0.000" ||
    s === "-0" ||
    s === "na" ||
    s === "n/a" ||
    s === "#n/a" ||
    s === "n.a." ||
    s === "n/a." ||
    s === "#na" ||
    s === "-" ||
    s === "--" ||
    s === "nil" ||
    s === "none" ||
    s === "null" ||
    s === "nan"
  ) {
    return true;
  }
  const num = Number(s.replace(/,/g, ""));
  if (!Number.isNaN(num) && num === 0) {
    return true;
  }
  return false;
}

/**
 * Post-processing step 1: Filters out invalid/ghost rows from transformed payroll data.
 * If from a row, only name is there and no emp code & no uan code & no esic code & net pay is 0 / null / N/A,
 * then removes that row as well. Also removes rows where no identifiers are present at all.
 */
export function filterInvalidTransformedRows(
  headers: string[],
  rows: (string | number)[][],
): (string | number)[][] {
  const nameIdx = headers.indexOf("employee_name");
  const codeIdx = headers.indexOf("employee_code");
  const uanIdx = headers.indexOf("uan_no");
  const esicIdx = headers.indexOf("esic_no");
  const netPayIdx = headers.indexOf("net_pay");

  const filtered = rows.filter((row, rIdx) => {
    const hasName = nameIdx >= 0 && !isValueZeroOrNA(row[nameIdx]);
    const hasEmpCode = codeIdx >= 0 && !isValueZeroOrNA(row[codeIdx]);
    const hasUan = uanIdx >= 0 && !isValueZeroOrNA(row[uanIdx]);
    const hasEsic = esicIdx >= 0 && !isValueZeroOrNA(row[esicIdx]);

    let isNetPayZeroOrNA = true;
    if (netPayIdx >= 0) {
      const netVal = row[netPayIdx];
      isNetPayZeroOrNA =
        isValueZeroOrNA(netVal) ||
        (typeof netVal === "number" && netVal <= 0) ||
        (typeof netVal === "string" &&
          !Number.isNaN(Number(netVal)) &&
          Number(netVal) <= 0);
    }

    // If completely empty or no identifiers at all
    if (!hasName && !hasEmpCode && !hasUan && !hasEsic) {
      console.log(
        `  ✕ [Row Filter] Dropped blank row #${rIdx + 1} (No name, code, UAN, or ESIC)`,
      );
      return false;
    }

    // User rule:
    // "if from a row, only name is there and no emp code & no uan code & no esic code & net pay is 0 / null / N/A is there, then remove that row as well."
    if (hasName && !hasEmpCode && !hasUan && !hasEsic && isNetPayZeroOrNA) {
      console.log(
        `  ✕ [Row Filter] Dropped ghost row #${rIdx + 1}: Name="${row[nameIdx]}", no code/UAN/ESIC, net_pay=${netPayIdx >= 0 ? row[netPayIdx] : "None"}`,
      );
      return false;
    }

    return true;
  });

  if (rows.length !== filtered.length) {
    console.log(
      `[Post-Processing Row Filter] Kept ${filtered.length} of ${rows.length} rows (${rows.length - filtered.length} ghost/empty rows removed)`,
    );
  }
  return filtered;
}

/**
 * Post-processing step 2: Prunes non-required columns where every row's value is 0, N/A, blank, or null.
 * Keeps the column if even 1 row has a valid non-zero/non-N/A value.
 * Strictly preserves REQUIRED_TRANSFORMED_COLUMNS even if all values are 0 or N/A.
 */
export function pruneEmptyTransformedColumns(
  headers: string[],
  rows: (string | number)[][],
): {
  finalHeaders: string[];
  finalDataRows: (string | number)[][];
} {
  const keepColIndices: number[] = [];
  const keptCols: string[] = [];
  const prunedCols: string[] = [];

  for (let c = 0; c < headers.length; c++) {
    const colHeader = headers[c];
    if (REQUIRED_TRANSFORMED_COLUMNS.has(colHeader)) {
      keptCols.push(`${colHeader} (Required)`);
      keepColIndices.push(c);
      continue;
    }

    let hasValidValue = false;
    for (const row of rows) {
      const val = row[c];
      if (!isValueZeroOrNA(val)) {
        hasValidValue = true;
        break;
      }
    }

    if (hasValidValue) {
      keptCols.push(colHeader);
      keepColIndices.push(c);
    } else {
      prunedCols.push(colHeader);
    }
  }

  console.log(
    `[Post-Processing Column Pruning] Kept ${keptCols.length} columns: [${keptCols.join(", ")}]`,
  );
  if (prunedCols.length > 0) {
    console.log(
      `[Post-Processing Column Pruning] Pruned ${prunedCols.length} columns (All ${rows.length} rows were 0 or N/A): [${prunedCols.join(", ")}]`,
    );
  }

  const finalHeaders = keepColIndices.map((i) => headers[i]);
  const finalDataRows = rows.map((row) => keepColIndices.map((i) => row[i]));

  return { finalHeaders, finalDataRows };
}

/**
 * Cleans attendance days values, enforcing that valid day values must be between 0 and 31.
 * If value is outside [0, 31], it is NOT day attendance and returns "".
 */
function cleanAttendanceDaysValue(val: any): number | "" {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(String(val).replace(/,/g, "").trim());
  if (!Number.isNaN(num) && num >= 0 && num <= 31) {
    return Math.round(num * 10) / 10;
  }
  return "";
}

/**
 * Extracts Overtime Days from an OT cell:
 * - If value > 99: It is an OT Amount (rupees), not attendance.
 *   Inspects formula in sheet to find referenced OT hours or days, converts hours by / 8.
 * - If value > 31 and <= 99: It is in OT Hours. Converts to days by dividing by 8.
 * - If value between 0 and 31: If header says hours, converts to days (/ 8), else returns days.
 * - Returns days count in [0, 31] or "".
 */
function extractRowOtDays({
  sheet,
  sheetRowIdx,
  row,
  otColIdx,
  otHeader,
  sampleRows,
  headerRowIndex,
}: {
  sheet: XLSX.WorkSheet;
  sheetRowIdx: number;
  row: any[];
  otColIdx: number;
  otHeader?: string | null;
  sampleRows?: any[][];
  headerRowIndex?: number;
}): number | "" {
  if (otColIdx < 0 || !row || otColIdx >= row.length) return "";
  const raw = row[otColIdx];
  if (raw === null || raw === undefined || raw === "") return "";
  const num = Number(String(raw).replace(/,/g, "").trim());
  if (Number.isNaN(num)) return "";
  if (num <= 0) return 0;

  // Helper to format days: in [0, 31], rounded to 1 decimal place or whole integer
  const formatDays = (d: number): number | "" => {
    if (Number.isNaN(d) || d < 0 || d > 31) return "";
    return Math.round(d * 10) / 10;
  };

  // 1. If value is > 99: It is an Overtime Amount (rupees), NOT attendance days!
  // In this case, we MUST derive OT days from the formula of the OT cell.
  if (num > 99) {
    if (sheet) {
      // Find the formula for this OT cell or this OT column:
      // A. Direct cell formula on current row
      let formula = "";
      if (sheetRowIdx >= 0) {
        const cellAddr = XLSX.utils.encode_cell({
          r: sheetRowIdx,
          c: otColIdx,
        });
        const cell = sheet[cellAddr];
        if (cell?.f) {
          formula = String(cell.f);
        }
      }

      // B. If current cell doesn't have .f (e.g. shared formula range in SheetJS),
      // look across other rows in this column for the column formula template
      if (!formula) {
        for (let r = 0; r < 50; r++) {
          const testAddr = XLSX.utils.encode_cell({ r, c: otColIdx });
          const testCell = sheet[testAddr];
          if (testCell?.f) {
            formula = String(testCell.f);
            break;
          }
        }
      }

      if (formula) {
        const dividesBy8 = /\/\s*\(?\s*8(?:\.0+)?\s*\)?|\/\s*208|\/\s*240/.test(
          formula,
        );

        // Check cell references in formula: e.g. H5, K5, $J$2
        const refMatches = formula.match(/\$?[A-Za-z]+\$?\d+/g);
        if (refMatches) {
          for (const rm of refMatches) {
            const cleanRef = rm.replace(/\$/g, "");
            try {
              const decoded = XLSX.utils.decode_cell(cleanRef);
              if (decoded.c !== otColIdx) {
                // Read value for this row in the referenced column
                let refVal = Number(
                  String(row[decoded.c] ?? "")
                    .replace(/,/g, "")
                    .trim(),
                );
                if (Number.isNaN(refVal) || refVal === 0) {
                  if (sheet && sheetRowIdx >= 0) {
                    const targetAddr = XLSX.utils.encode_cell({
                      r: sheetRowIdx,
                      c: decoded.c,
                    });
                    const targetCell = sheet[targetAddr];
                    if (targetCell && targetCell.v !== undefined) {
                      const v = Number(
                        String(targetCell.v).replace(/,/g, "").trim(),
                      );
                      if (!Number.isNaN(v)) refVal = v;
                    }
                  }
                }

                // Multiplier for OT hours/days is between 0.1 and 200 (salary rates are >= 500)
                if (!Number.isNaN(refVal) && refVal > 0 && refVal <= 200) {
                  const refColHeader =
                    sampleRows && typeof headerRowIndex === "number"
                      ? String(
                          sampleRows[headerRowIndex]?.[decoded.c] || "",
                        ).toLowerCase()
                      : "";
                  const isHoursCol =
                    dividesBy8 ||
                    refVal > 31 ||
                    /(?:hrs?|hours?)/i.test(refColHeader);

                  if (isHoursCol) {
                    const days = formatDays(refVal / 8);
                    if (days !== "") return days;
                  } else if (refVal <= 31) {
                    const days = formatDays(refVal);
                    if (days !== "") return days;
                  }
                }
              }
            } catch {}
          }
        }

        // Check if formula contains numeric constant multipliers (e.g. "=16*50" or "=Basic/26/8*2*16")
        const numMatches = formula.match(/\b\d+(?:\.\d+)?\b/g);
        if (numMatches) {
          for (const nm of numMatches) {
            const m = Number(nm);
            // Look for hours count: between 0.5 and 200, excluding common rate divisors (8, 2, 1.5, 26, 30, 31, 28, 208, 240)
            if (
              m > 0 &&
              m <= 200 &&
              m !== 8 &&
              m !== 2 &&
              m !== 1.5 &&
              m !== 26 &&
              m !== 30 &&
              m !== 31 &&
              m !== 28 &&
              m !== 208 &&
              m !== 240
            ) {
              if (dividesBy8 || m > 31) {
                const days = formatDays(m / 8);
                if (days !== "") return days;
              } else if (m <= 31) {
                const days = formatDays(m);
                if (days !== "") return days;
              }
            }
          }
        }
      }
    }

    // C. Fallback: Search if there is another column in this row explicitly for OT hours
    if (sampleRows && typeof headerRowIndex === "number") {
      const headerRow = sampleRows[headerRowIndex] || [];
      for (let c = 0; c < row.length; c++) {
        if (c === otColIdx) continue;
        const h = String(headerRow[c] || "").toLowerCase();
        if (
          /(?:ot|overtime).*(?:hr|hour)|(?:hr|hour).*(?:ot|overtime)/i.test(h)
        ) {
          const hVal = Number(
            String(row[c] ?? "")
              .replace(/,/g, "")
              .trim(),
          );
          if (!Number.isNaN(hVal) && hVal > 0 && hVal <= 200) {
            const days = formatDays(hVal / 8);
            if (days !== "") return days;
          }
        }
      }
    }

    // D. Fallback: Estimate hours from Basic amount if formula divided by 8
    for (let c = 0; c < row.length; c++) {
      if (c === otColIdx) continue;
      const bVal = Number(
        String(row[c] ?? "")
          .replace(/,/g, "")
          .trim(),
      );
      if (!Number.isNaN(bVal) && bVal >= 3000 && bVal <= 150000) {
        for (const div of [26, 30, 31, 28]) {
          const hourly = bVal / div / 8;
          if (hourly > 0) {
            for (const mult of [1, 2, 1.5]) {
              const estHours = num / (hourly * mult);
              if (
                estHours > 0.5 &&
                estHours <= 200 &&
                Math.abs(estHours - Math.round(estHours)) < 0.05
              ) {
                const days = formatDays(Math.round(estHours) / 8);
                if (days !== "") return days;
              }
            }
          }
        }
      }
    }

    // If formula did not yield OT days, NEVER return amount (> 99). Return ""!
    return "";
  }

  // Determine if column as a whole represents hours
  let columnIsHours = false;
  if (otHeader && /(?:hrs?|hours?)/i.test(otHeader)) {
    columnIsHours = true;
  } else if (sampleRows && otColIdx >= 0) {
    for (let r = 0; r < Math.min(sampleRows.length, 50); r++) {
      const v = Number(
        String(sampleRows[r]?.[otColIdx] ?? "")
          .replace(/,/g, "")
          .trim(),
      );
      if (!Number.isNaN(v) && v > 31 && v <= 99) {
        columnIsHours = true;
        break;
      }
    }
  }

  // Check if any formula in the sheet referencing this OT column treats it as hours (/ 8 or hourly rate)
  if (!columnIsHours && sheet && otColIdx >= 0) {
    const maxScanRows = Math.min(sampleRows?.length || 40, 40);
    for (let r = 0; r < maxScanRows; r++) {
      for (let c = 0; c < 40; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell?.f) {
          const fStr = String(cell.f);
          const refs = fStr.match(/\$?[A-Za-z]+\$?\d+/g);
          if (refs) {
            for (const rm of refs) {
              try {
                const dec = XLSX.utils.decode_cell(rm.replace(/\$/g, ""));
                if (dec.c === otColIdx) {
                  if (
                    /\/\s*\(?\s*8(?:\.0+)?\s*\)?|\/\s*208|\/\s*240/.test(fStr)
                  ) {
                    columnIsHours = true;
                    break;
                  }
                  const multMatches = fStr.match(/\*\s*(\d+(?:\.\d+)?)/g);
                  if (multMatches) {
                    for (const mm of multMatches) {
                      const mVal = Number(mm.replace(/^\*\s*/, ""));
                      if (mVal > 0 && mVal <= 150) {
                        columnIsHours = true;
                        break;
                      }
                    }
                  }
                }
              } catch {}
            }
          }
        }
        if (columnIsHours) break;
      }
      if (columnIsHours) break;
    }
  }

  // 2. If value is > 31 and <= 99: It is in OT Hours. Convert to days by dividing by 8
  if (num > 31) {
    return formatDays(num / 8);
  }

  // 3. If value is between 0 and 31:
  // If column or header represents hours, convert to days (/ 8), else it is already days
  if (columnIsHours) {
    return formatDays(num / 8);
  }

  return formatDays(num);
}

/**
 * Extracts Overtime Wage Amount (Rupees) for a row:
 * - If otColIdx points to an explicit OT Amount column (> 99 or monetary header), returns that value.
 * - If otColIdx points to an OT Days / OT Hours column (<= 99), derives the OT Amount through:
 *   1) Inspecting formulas in this row that reference the OT Days/Hours column.
 *   2) Inspecting the Gross cell formula (e.g. Gross minus other earnings when Gross includes OT).
 *   3) Evaluating formula templates or fallback to hourly rate from Basic wage.
 */
function extractRowOtAmount({
  sheet,
  sheetRowIdx,
  row,
  otColIdx,
  aiAnalysis,
  _sampleRows,
  _headerRowIndex,
  presentDaysVal,
}: {
  sheet?: XLSX.WorkSheet;
  sheetRowIdx: number;
  row: any[];
  otColIdx: number;
  aiAnalysis: PayrollAIAnalysis;
  _sampleRows?: any[][];
  _headerRowIndex?: number;
  presentDaysVal?: number | null;
}): number {
  if (!row || otColIdx < 0 || otColIdx >= row.length) return 0;

  // 1. If otColIdx contains an amount directly (> 99), return it
  const rawVal = row[otColIdx];
  const numVal = cleanNumericCellValue(rawVal);
  if (typeof numVal === "number" && numVal > 99) {
    return Math.round(numVal);
  }

  // 2. If aiAnalysis.overtimeCol points to a distinct column containing an amount, return it
  if (
    aiAnalysis.overtimeCol &&
    typeof aiAnalysis.overtimeCol.colIndex === "number" &&
    aiAnalysis.overtimeCol.colIndex >= 0 &&
    aiAnalysis.overtimeCol.colIndex !== otColIdx &&
    aiAnalysis.overtimeCol.colIndex < row.length
  ) {
    const directVal = cleanNumericCellValue(
      row[aiAnalysis.overtimeCol.colIndex],
    );
    if (typeof directVal === "number" && directVal > 0) {
      return Math.round(directVal);
    }
  }

  // 3. If row[otColIdx] is attendance (hours or days <= 99), derive OT Amount through formulas:
  if (sheet && sheetRowIdx >= 0) {
    // A. Check if any cell in this row has a formula referencing otColIdx (excluding Gross and Net Pay)
    for (let c = 0; c < row.length; c++) {
      if (
        c === otColIdx ||
        c === aiAnalysis.grossCol?.colIndex ||
        c === aiAnalysis.netPayCol?.colIndex
      ) {
        continue;
      }
      const addr = XLSX.utils.encode_cell({ r: sheetRowIdx, c });
      const cell = sheet[addr];
      if (cell?.f) {
        const refMatches = String(cell.f).match(/\$?[A-Za-z]+\$?\d+/g);
        if (refMatches) {
          for (const rm of refMatches) {
            try {
              const dec = XLSX.utils.decode_cell(rm.replace(/\$/g, ""));
              if (dec.c === otColIdx) {
                const cellNum = cleanNumericCellValue(
                  cell.v !== undefined ? cell.v : row[c],
                );
                if (typeof cellNum === "number" && cellNum > 0) {
                  return Math.round(cellNum);
                }
              }
            } catch {}
          }
        }
      }
    }

    // B. Check Gross cell formula for this row:
    // If Gross formula references otColIdx, then OT amount is included in Gross!
    if (
      aiAnalysis.grossCol &&
      typeof aiAnalysis.grossCol.colIndex === "number" &&
      aiAnalysis.grossCol.colIndex >= 0
    ) {
      const grossAddr = XLSX.utils.encode_cell({
        r: sheetRowIdx,
        c: aiAnalysis.grossCol.colIndex,
      });
      const grossCell = sheet[grossAddr];
      if (grossCell?.f) {
        const fStr = String(grossCell.f);
        const refMatches = fStr.match(/\$?[A-Za-z]+\$?\d+/g);
        let grossRefsOt = false;
        if (refMatches) {
          for (const rm of refMatches) {
            try {
              const dec = XLSX.utils.decode_cell(rm.replace(/\$/g, ""));
              if (dec.c === otColIdx) {
                grossRefsOt = true;
                break;
              }
            } catch {}
          }
        }

        if (grossRefsOt) {
          // Gross minus other earnings = OT Amount!
          const grossVal = cleanNumericCellValue(
            grossCell.v !== undefined
              ? grossCell.v
              : row[aiAnalysis.grossCol.colIndex],
          );
          if (typeof grossVal === "number" && grossVal > 0) {
            let otherEarningsSum = 0;
            const checkCols = [
              aiAnalysis.basicCol?.colIndex,
              aiAnalysis.daCol?.colIndex,
              aiAnalysis.hraCol?.colIndex,
              aiAnalysis.ltaCol?.colIndex,
              aiAnalysis.bonusCol?.colIndex,
              aiAnalysis.allowanceCol?.colIndex,
              aiAnalysis.leaveSalaryCol?.colIndex,
            ];
            for (const col of checkCols) {
              if (typeof col === "number" && col >= 0 && col !== otColIdx) {
                const v = cleanNumericCellValue(row[col]);
                if (typeof v === "number") otherEarningsSum += v;
              }
            }

            const diff = grossVal - otherEarningsSum;
            if (diff > 0) {
              return Math.round(diff);
            }
          }
        }
      }
    }
  }

  // C. Fallback: If row[otColIdx] has attendance count, calculate using hourly rate from Basic:
  const otUnits = Number(
    String(row[otColIdx] ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  if (!Number.isNaN(otUnits) && otUnits > 0) {
    let basicVal = 0;
    if (
      aiAnalysis.basicCol &&
      typeof aiAnalysis.basicCol.colIndex === "number" &&
      aiAnalysis.basicCol.colIndex >= 0
    ) {
      const b = cleanNumericCellValue(row[aiAnalysis.basicCol.colIndex]);
      if (typeof b === "number") basicVal = b;
    }

    if (basicVal > 0) {
      const wd =
        typeof presentDaysVal === "number" && presentDaysVal > 0
          ? Math.max(26, presentDaysVal)
          : 26;
      const isHours =
        otUnits > 31 ||
        /(?:hr|hour)/i.test(
          aiAnalysis.otDaysCol?.originalHeader ||
            "",
        );
      const hours = isHours ? otUnits : otUnits * 8;
      const hourly = basicVal / wd / 8;
      return Math.round(hourly * hours * 2);
    }
  }

  return 0;
}

/**
 * Validates and enriches attendance column detections based on mathematical and formula verifications.
 */
function validateAndEnrichAttendance(
  aiAnalysis: PayrollAIAnalysis,
  sheet: XLSX.WorkSheet,
  sampleRows: any[][],
): PayrollAIAnalysis {
  const result = { ...aiAnalysis };
  const headerRow = sampleRows[result.headerRowIndex] || [];

  // Helper to get header text for a column index
  const getHeader = (cIdx: number): string => {
    return String(headerRow[cIdx] || `Col_${cIdx}`).trim();
  };

  // Helper to test if a column is an employee identifier
  const isIdentifierCol = (c: number): boolean => {
    if (
      c === result.employeeNameCol?.colIndex ||
      c === result.employeeCodeCol?.colIndex ||
      c === result.uanCol?.colIndex ||
      c === result.esicCol?.colIndex
    ) {
      return true;
    }
    const h = getHeader(c).toLowerCase();
    return /name|emp.*code|card\s*no|uan|esic.*no|pf.*no|dept|design|doj|dob|bank|pan/i.test(
      h,
    );
  };

  // Detect Gross column if not already set
  if (
    !result.grossCol ||
    typeof result.grossCol.colIndex !== "number" ||
    result.grossCol.colIndex < 0
  ) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c)
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
      if (/rate/i.test(hText)) continue;
      if (
        /(?:^|\b)(?:total\s*gross|gross\s*total|gross|total\s*earnings?|earnings?|gross\s*wages?|actual\s*wages?|gross\s*salary|total\s*wages?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.grossCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "gross",
          reasoning: "Detected gross column from header text",
        };
        break;
      }
    }
  }

  // Detect Total Deductions column if not already set
  if ((result as any).deductionsCol && !result.totalDeductionsCol) {
    result.totalDeductionsCol = (result as any).deductionsCol;
  }
  if (result.totalDeductionsCol && !(result as any).deductionsCol) {
    (result as any).deductionsCol = result.totalDeductionsCol;
  }
  if (
    !result.totalDeductionsCol ||
    typeof result.totalDeductionsCol.colIndex !== "number" ||
    result.totalDeductionsCol.colIndex < 0
  ) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c)
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
      if (
        /(?:^|\b)(?:total\s*deductions?|tot\s*deductions?|total\s*ded|tot\s*ded|deductions?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.totalDeductionsCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "deductions",
          reasoning: "Detected total deductions column from header text",
        };
        (result as any).deductionsCol = result.totalDeductionsCol;
        break;
      }
    }
  }

  // Detect Net Pay column if not already set
  if (
    !result.netPayCol ||
    typeof result.netPayCol.colIndex !== "number" ||
    result.netPayCol.colIndex < 0
  ) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c)
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
      if (
        /(?:^|\b)(?:net\s*pay|net\s*payable|take\s*home|net\s*salary|paid\s*amount|net\s*amt|net\s*wage)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.netPayCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "net_pay",
          reasoning: "Detected net pay column from header text",
        };
        break;
      }
    }
  }

  // 1. Formula signs check across Net Pay, Gross, and Total Deductions
  let addedCols = new Set<number>();
  let subtractedCols = new Set<number>();
  const signs = analyzeNetPayAndGrossFormulaSigns({
    sheet,
    sampleRows,
    netPayColIdx: result.netPayCol?.colIndex,
    grossColIdx: result.grossCol?.colIndex,
    deductionsColIdx:
      result.totalDeductionsCol?.colIndex ??
      (result as any).deductionsCol?.colIndex,
    dataStartRowIndex: result.dataStartRowIndex,
  });
  addedCols = signs.addedCols;
  subtractedCols = signs.subtractedCols;

  // 2. Identify and validate Basic column (Required)
  let basicColIdx = -1;
  if (
    result.basicCol &&
    typeof result.basicCol.colIndex === "number" &&
    result.basicCol.colIndex >= 0
  ) {
    basicColIdx = result.basicCol.colIndex;
  } else {
    for (const earn of result.earnings) {
      const h = (earn.originalHeader || earn.cleanHeader || "").toLowerCase();
      if (/basic/i.test(h)) {
        basicColIdx = earn.colIndex;
        result.basicCol = {
          colIndex: earn.colIndex,
          originalHeader: earn.originalHeader,
          cleanHeader: "basic",
          reasoning: "Detected basic from earnings array",
        };
        break;
      }
    }
  }

  if (basicColIdx === -1) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const h = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:basic|earned\s*basic|actual\s*basic|basic\s*pay|basic\s*salary|basic\s*wages)(?:\b|$)/i.test(
          h,
        )
      ) {
        basicColIdx = c;
        result.basicCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "basic",
          reasoning: "Detected basic from header search",
        };
        break;
      }
    }
  }

  // 3. Scan candidate attendance columns mostly before Basic (or outside earnings block)
  // Exclude metadata, PH, CL, EL, OT
  const candidateAttCols: number[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    if (isIdentifierCol(c)) continue;
    if (basicColIdx > 0 && c === basicColIdx) continue;
    const hText = getHeader(c).toLowerCase();

    if (
      /(?:^|\b)(?:ph|paid\s*hol|holiday|festival|national|fh|nh)(?:\b|_|$)/i.test(
        hText,
      )
    )
      continue;
    if (/(?:^|\b)(?:ot|o\.t\.?|overtime)(?:\b|_|$)/i.test(hText)) continue;
    if (
      /(?:^|\b)(?:cl|pl|el|sl|c\.l|p\.l|e\.l|s\.l|leave|leaves|casual|sick|privilege|earned)(?:\b|_|$)/i.test(
        hText,
      )
    )
      continue;

    if (
      /attend|present|work|days|w\.?day|p\.?day|duty|cal\.?day/i.test(hText)
    ) {
      // Check values: valid day attendance must be in [0, 31]
      let hasValidDaysValues = false;
      let hasExcessiveValues = false;
      for (
        let r = result.dataStartRowIndex;
        r < Math.min(sampleRows.length, result.dataStartRowIndex + 15);
        r++
      ) {
        const raw = sampleRows[r]?.[c];
        if (raw !== null && raw !== undefined && raw !== "") {
          const num = Number(String(raw).replace(/,/g, "").trim());
          if (!Number.isNaN(num)) {
            if (num > 31) hasExcessiveValues = true;
            else if (num > 0 && num <= 31) hasValidDaysValues = true;
          }
        }
      }
      if (hasValidDaysValues && !hasExcessiveValues) {
        if (
          !isColumnSumOfOtherColumns(
            sheet,
            c,
            sampleRows,
            result.headerRowIndex,
          )
        ) {
          candidateAttCols.push(c);
        }
      }
    }
  }

  // 4. Detect divisor number from Basic formula (or earnings formulas)
  let detectedDivisorNumber: number | null = null;
  if (basicColIdx >= 0 && sheet) {
    detectedDivisorNumber = extractBasicFormulaDivisor(
      sheet,
      sampleRows,
      basicColIdx,
      result.dataStartRowIndex,
    );
  }
  if (detectedDivisorNumber === null && sheet) {
    for (const cellAddr of Object.keys(sheet)) {
      if (cellAddr.startsWith("!")) continue;
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;
      const divMatch = String(cell.f).match(/\/\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/);
      if (divMatch) {
        const num = Math.round(Number(divMatch[1]));
        if (num >= 20 && num <= 31) {
          detectedDivisorNumber = num;
          break;
        }
      }
    }
  }

  // 5. Present Days vs Working Days Rule:
  // "in excel, if there's no of days worked, it is present days not working days, working days will only be there if there are two columns of attendance (except ph, overtime, cl, pl, el), if there's only one column named 'no of days worked, no of worked days, no of present days, attendance, ...' then it will be present days only, and take working days only from basic formula as value they are dividing it from and if it is between 20 to 31, if theres not anything like that in formula then set working days as MAX(26, whatever is present days you have set)."
  if (
    result.workingDaysCol?.colIndex !== null &&
    result.workingDaysCol?.colIndex !== undefined
  ) {
    const wH = getHeader(result.workingDaysCol.colIndex).toLowerCase();
    if (
      /(?:no\s*(?:of)?\s*(?:days?\s*)?worked|no\s*(?:of)?\s*worked\s*days?|days?\s*worked|worked\s*days?|no\s*(?:of)?\s*present\s*(?:days?)?|present\s*days?|p\.?\s*days?|actual\s*days?|attendance|duty\s*days?)/i.test(
        wH,
      )
    ) {
      if (!result.presentDaysCol || result.presentDaysCol.colIndex === null) {
        result.presentDaysCol = {
          colIndex: result.workingDaysCol.colIndex,
          originalHeader: getHeader(result.workingDaysCol.colIndex),
          cleanHeader: "present_days",
          reasoning: "Days worked/attendance column is strictly Present Days",
        };
      }
      result.workingDaysCol.colIndex = null;
    }
  }

  // If workingDaysCol and presentDaysCol point to the same column, it's strictly Present Days
  if (
    result.workingDaysCol?.colIndex !== null &&
    result.workingDaysCol?.colIndex !== undefined &&
    result.presentDaysCol?.colIndex !== null &&
    result.presentDaysCol?.colIndex !== undefined &&
    result.workingDaysCol.colIndex === result.presentDaysCol.colIndex
  ) {
    result.workingDaysCol.colIndex = null;
  }

  if (candidateAttCols.length === 1) {
    // Exactly ONE attendance column exists!
    const singleCol = candidateAttCols[0];
    result.presentDaysCol = {
      colIndex: singleCol,
      originalHeader: getHeader(singleCol),
      cleanHeader: "present_days",
      reasoning: "Single attendance column rule: treated as Present Days only",
    };
    result.workingDaysCol = {
      colIndex: null,
      originalHeader: null,
      cleanHeader: "working_days",
      dividedNumber: detectedDivisorNumber ?? null,
      reasoning: detectedDivisorNumber
        ? `Single attendance column rule: working days derived from Basic formula divisor (${detectedDivisorNumber})`
        : "Single attendance column rule: working days default to MAX(26, present days)",
    };
  } else if (candidateAttCols.length >= 2) {
    // TWO or more attendance columns exist!
    let workedCol: number | null = null;
    let totalCol: number | null = null;

    for (const c of candidateAttCols) {
      const hText = getHeader(c).toLowerCase();
      if (
        /no\s*(?:of)?\s*(?:days?\s*)?worked|days?\s*worked|worked\s*days?|no\s*(?:of)?\s*present|present\s*days?|p\.?\s*days?|present|actual\s*days?/i.test(
          hText,
        )
      ) {
        workedCol = c;
      } else if (
        /working\s*days?|w\.?\s*days?|month\s*days?|std\s*days?|cal\.?\s*days?/i.test(
          hText,
        )
      ) {
        if (
          !isColumnSumOfOtherColumns(
            sheet,
            c,
            sampleRows,
            result.headerRowIndex,
          )
        ) {
          totalCol = c;
        }
      }
    }

    if (workedCol !== null && totalCol !== null && workedCol !== totalCol) {
      result.workingDaysCol = {
        colIndex: totalCol,
        originalHeader: getHeader(totalCol),
        cleanHeader: "working_days",
        dividedNumber: detectedDivisorNumber ?? null,
        reasoning: "Identified as Working Days from two attendance columns",
      };
      result.presentDaysCol = {
        colIndex: workedCol,
        originalHeader: getHeader(workedCol),
        cleanHeader: "present_days",
        reasoning: "Identified as Days Worked from two attendance columns",
      };
    } else {
      // Not two explicit independent fields (or one was a sum/addition).
      // Per user rule: DO NOT count working days as addition of multiple columns!
      // Only take working days from two explicit fields, or formula divisor, or static 26.
      const pCol = workedCol ?? candidateAttCols[0];
      result.presentDaysCol = {
        colIndex: pCol,
        originalHeader: getHeader(pCol),
        cleanHeader: "present_days",
        reasoning:
          "Present days column; working days derived from formula divisor or static 26",
      };
      result.workingDaysCol = {
        colIndex: null,
        originalHeader: null,
        cleanHeader: "working_days",
        dividedNumber: detectedDivisorNumber ?? null,
        reasoning: detectedDivisorNumber
          ? `Working days derived from Basic formula divisor (${detectedDivisorNumber})`
          : "Working days default to MAX(26, present days)",
      };
    }
  } else {
    if (
      result.presentDaysCol?.colIndex !== null &&
      result.presentDaysCol?.colIndex !== undefined
    ) {
      const pCol = result.presentDaysCol.colIndex;
      let valid = true;
      for (
        let r = result.dataStartRowIndex;
        r < Math.min(sampleRows.length, result.dataStartRowIndex + 10);
        r++
      ) {
        const val = Number(sampleRows[r]?.[pCol]);
        if (!Number.isNaN(val) && val > 31) {
          valid = false;
          break;
        }
      }
      if (!valid) {
        result.presentDaysCol = null;
      }
    }
    result.workingDaysCol = {
      colIndex: null,
      originalHeader: null,
      cleanHeader: "working_days",
      dividedNumber: detectedDivisorNumber ?? null,
      reasoning: detectedDivisorNumber
        ? `Working days derived from Basic formula divisor (${detectedDivisorNumber})`
        : "Working days default to MAX(26, present days)",
    };
  }

  // Fallback: If presentDaysCol is still null or has invalid colIndex, find the column cell multiplier in Basic formula
  if (
    !result.presentDaysCol ||
    result.presentDaysCol.colIndex === null ||
    result.presentDaysCol.colIndex === undefined ||
    result.presentDaysCol.colIndex < 0
  ) {
    const mulCol = extractBasicFormulaMultiplierCol(
      sheet,
      sampleRows,
      basicColIdx,
      result.dataStartRowIndex,
    );
    if (typeof mulCol === "number" && mulCol >= 0) {
      result.presentDaysCol = {
        colIndex: mulCol,
        originalHeader: getHeader(mulCol),
        cleanHeader: "present_days",
        reasoning: "Derived from Basic formula column cell multiplier (* Cell)",
      };
      if (result.workingDaysCol?.colIndex === mulCol) {
        result.workingDaysCol.colIndex = null;
      }
    }
  }

  // 6. Overtime (OT) Handling:
  // - Values > 99 indicate an Overtime Amount (rupee wage) -> MUST BE in Earnings!
  // - Values <= 99 indicate OT attendance (if > 31 or hours header, converted to OT Days by / 8).
  // - If only OT Amount exists, OT Days is extracted from the formula of that OT cell.
  const otAmountCols: number[] = [];
  const otHoursCols: number[] = [];

  for (let c = 0; c < headerRow.length; c++) {
    const hText = getHeader(c).toLowerCase();
    if (!/(?:^|\b)(?:ot|overtime)(?:\b|_|$)/i.test(hText)) continue;

    let maxVal = 0;
    for (let r = result.dataStartRowIndex; r < sampleRows.length; r++) {
      const v = Number(
        String(sampleRows[r]?.[c] ?? "")
          .replace(/,/g, "")
          .trim(),
      );
      if (!Number.isNaN(v) && v > maxVal) maxVal = v;
    }

    if (maxVal === 0 && sheet) {
      for (let r = 0; r < 40; r++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        const v = cell ? Number(cell.v) : Number.NaN;
        if (!Number.isNaN(v) && v > maxVal) maxVal = v;
      }
    }

    if (maxVal > 99 || /(?:amt|amount|rupees?|rs)/i.test(hText)) {
      otAmountCols.push(c);
    } else {
      otHoursCols.push(c);
    }
  }

  // Handle OT columns:
  // "for ot_amount, ot_days, if one is there, other has to be there -
  // figure out which one is present between them through column name and amount like you are right now,
  // and then figure out the other one through formula of the same - it must be somewhere"

  if (otAmountCols.length > 0 && otHoursCols.length > 0) {
    // Both are present as explicit columns in the sheet
    const amtCol = otAmountCols[0];
    const hoursCol = otHoursCols[0];
    result.overtimeCol = {
      colIndex: amtCol,
      originalHeader: getHeader(amtCol),
      cleanHeader: "ot_amount",
      reasoning: "Overtime wage amount column",
    };
    result.otDaysCol = {
      colIndex: hoursCol,
      originalHeader: getHeader(hoursCol),
      cleanHeader: "ot_days",
      reasoning: "Overtime attendance column",
    };
  } else if (otAmountCols.length > 0 && otHoursCols.length === 0) {
    // ot_amount is present; derive ot_days through formula of ot_amount
    const amtCol = otAmountCols[0];
    result.overtimeCol = {
      colIndex: amtCol,
      originalHeader: getHeader(amtCol),
      cleanHeader: "ot_amount",
      reasoning: "OT values > 99 or header indicates monetary Overtime wage",
    };

    let foundHoursCol: number | null = null;
    if (sheet) {
      for (let r = 0; r < Math.min(sampleRows.length, 40); r++) {
        const addr = XLSX.utils.encode_cell({ r, c: amtCol });
        const cell = sheet[addr];
        if (cell?.f) {
          const refMatches = String(cell.f).match(/\$?[A-Za-z]+\$?\d+/g);
          if (refMatches) {
            for (const rm of refMatches) {
              try {
                const dec = XLSX.utils.decode_cell(rm.replace(/\$/g, ""));
                if (dec.c !== amtCol && !isIdentifierCol(dec.c)) {
                  let isAtt = true;
                  let hasNonZero = false;
                  for (
                    let tr = result.dataStartRowIndex;
                    tr <
                    Math.min(sampleRows.length, result.dataStartRowIndex + 10);
                    tr++
                  ) {
                    const v = Number(sampleRows[tr]?.[dec.c]);
                    if (!Number.isNaN(v)) {
                      if (v > 200) {
                        isAtt = false;
                        break;
                      }
                      if (v > 0) hasNonZero = true;
                    }
                  }
                  if (isAtt && hasNonZero) {
                    foundHoursCol = dec.c;
                    break;
                  }
                }
              } catch {}
            }
          }
        }
        if (foundHoursCol !== null) break;
      }
    }

    const otDaysIdx = foundHoursCol !== null ? foundHoursCol : amtCol;
    result.otDaysCol = {
      colIndex: otDaysIdx,
      originalHeader: getHeader(otDaysIdx),
      cleanHeader: "ot_days",
      reasoning: "OT Days derived from OT Amount cell formula (/ 8 if hours)",
    };
  } else if (otHoursCols.length > 0 && otAmountCols.length === 0) {
    // ot_days is present; derive ot_amount through formula of the same (it must be somewhere)
    const hoursCol = otHoursCols[0];
    result.otDaysCol = {
      colIndex: hoursCol,
      originalHeader: getHeader(hoursCol),
      cleanHeader: "ot_days",
      reasoning: "Overtime attendance column",
    };

    let foundAmtCol: number | null = null;
    let foundFormula = "";
    if (sheet) {
      for (let c = 0; c < headerRow.length; c++) {
        if (c === hoursCol || isIdentifierCol(c)) continue;
        for (let r = 0; r < Math.min(sampleRows.length, 40); r++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          if (cell?.f) {
            const refMatches = String(cell.f).match(/\$?[A-Za-z]+\$?\d+/g);
            if (refMatches) {
              for (const rm of refMatches) {
                try {
                  const dec = XLSX.utils.decode_cell(rm.replace(/\$/g, ""));
                  if (dec.c === hoursCol) {
                    if (
                      c !== result.grossCol?.colIndex &&
                      c !== result.netPayCol?.colIndex
                    ) {
                      foundAmtCol = c;
                      foundFormula = String(cell.f);
                      break;
                    }
                  }
                } catch {}
              }
            }
          }
          if (foundAmtCol !== null) break;
        }
        if (foundAmtCol !== null) break;
      }
    }

    const otAmtIdx = foundAmtCol !== null ? foundAmtCol : hoursCol;
    result.overtimeCol = {
      colIndex: otAmtIdx,
      originalHeader: getHeader(otAmtIdx),
      cleanHeader: "ot_amount",
      reasoning: foundFormula
        ? `Overtime Amount identified from formula referencing OT attendance (${foundFormula})`
        : "Overtime Amount derived from formula in sheet referencing OT attendance",
    };
  }

  // Ensure OT columns are cleared from standard attendance if they were classified as ot_amount
  if (
    result.overtimeCol?.colIndex !== null &&
    typeof result.overtimeCol?.colIndex === "number"
  ) {
    const c = result.overtimeCol.colIndex;
    if (result.workingDaysCol?.colIndex === c) result.workingDaysCol = null;
    if (result.presentDaysCol?.colIndex === c) result.presentDaysCol = null;
    if (result.phCol?.colIndex === c) result.phCol = null;
    if (result.clCol?.colIndex === c) result.clCol = null;
    if (result.elCol?.colIndex === c) result.elCol = null;
  }

  // 7. Detect other attendance components: ph, cl, el
  if (!result.phCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:ph|paid\s*hol(?:idays?)?|holidays?|festiv(?:al|e)\s*holiday|national\s*holiday|fh|nh)(?:\b|_|$)/i.test(
          hText,
        )
      ) {
        result.phCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "ph",
          reasoning: "Paid Holidays detected",
        };
        break;
      }
    }
  }

  if (!result.clCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:cl|casual\s*leave|casual\s*holiday)(?:\b|_|$)/i.test(hText)
      ) {
        result.clCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "cl",
          reasoning: "Casual Leaves detected",
        };
        break;
      }
    }
  }

  if (!result.elCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:el|pl|earned\s*leave|privilege\s*leave|paid\s*leave|sl|sick\s*leave)(?:\b|_|$)/i.test(
          hText,
        )
      ) {
        result.elCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "el",
          reasoning: "Earned/Privilege Leaves detected",
        };
        break;
      }
    }
  }

  // 8. Detect Earnings columns: da, hra, lta, bonus
  if (!result.daCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c) || c === basicColIdx) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:da|d\.a\.?|dearness(?:\s*allowance)?)(?:\b|$)/i.test(hText)
      ) {
        result.daCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "da",
          reasoning: "DA detected",
        };
        break;
      }
    }
  }

  if (!result.hraCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c) || c === basicColIdx) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:hra|h\.r\.a\.?|house\s*rent(?:\s*allowance)?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.hraCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "hra",
          reasoning: "HRA detected",
        };
        break;
      }
    }
  }

  if (!result.ltaCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c) || c === basicColIdx) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:lta|l\.t\.a\.?|ltc|l\.t\.c\.?|leave\s*travel(?:\s*allowance)?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.ltaCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "lta",
          reasoning: "LTA detected",
        };
        break;
      }
    }
  }

  if (!result.bonusCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c) || c === basicColIdx) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:bonus|incentive|ex[\s-]?gratia|performance\s*bonus)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.bonusCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "bonus",
          reasoning: "Bonus detected",
        };
        break;
      }
    }
  }

  // Allowance & Leave Salary column detection
  if (
    result.allowanceCol &&
    (typeof result.allowanceCol.colIndex !== "number" ||
      result.allowanceCol.colIndex < 0 ||
      result.allowanceCol.colIndex >= headerRow.length ||
      isIdentifierCol(result.allowanceCol.colIndex))
  ) {
    result.allowanceCol = null;
  }

  if (
    result.leaveSalaryCol &&
    (typeof result.leaveSalaryCol.colIndex !== "number" ||
      result.leaveSalaryCol.colIndex < 0 ||
      result.leaveSalaryCol.colIndex >= headerRow.length ||
      isIdentifierCol(result.leaveSalaryCol.colIndex))
  ) {
    result.leaveSalaryCol = null;
  }

  if (!result.allowanceCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (
        isIdentifierCol(c) ||
        c === basicColIdx ||
        c === result.daCol?.colIndex ||
        c === result.hraCol?.colIndex ||
        c === result.ltaCol?.colIndex ||
        c === result.bonusCol?.colIndex
      )
        continue;
      const hText = getHeader(c).toLowerCase().trim();
      if (
        /(?:dearness|house\s*rent|leave\s*travel|^da\b|^hra\b|^lta\b)/i.test(
          hText,
        )
      )
        continue;
      if (/(?:deduction|rate|master)/i.test(hText)) continue;
      if (
        /(?:^|\b)(?:allow(?:ances?|a)?|allw|other\s*allow(?:ance|a)?|special\s*allow(?:ance|a)?|spl\s*allow(?:ance|a)?)(?:\b|_|$)/i.test(
          hText,
        )
      ) {
        result.allowanceCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "allowance",
          reasoning: "Allowance detected",
        };
        break;
      }
    }
  }

  if (!result.leaveSalaryCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (
        isIdentifierCol(c) ||
        c === basicColIdx ||
        c === result.ltaCol?.colIndex ||
        c === result.allowanceCol?.colIndex
      )
        continue;
      const hText = getHeader(c).toLowerCase().trim();
      if (/(?:travel|lta|ltc)/i.test(hText)) continue;
      if (/(?:deduction|rate|master)/i.test(hText)) continue;
      if (
        /(?:^|\b)(?:leave\s*(?:salary|wages?|pay|encash(?:ment)?|amt|amount)|(?:el|pl)\s*encash(?:ment)?|leave_salary)(?:\b|_|$)/i.test(
          hText,
        )
      ) {
        result.leaveSalaryCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "leave_salary",
          reasoning: "Leave Salary detected",
        };
        break;
      }
    }
  }

  // 9. Detect Deductions columns: pf, esic, pt, lwf
  if (!result.pfCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (/(?:employer|er\b|company)/i.test(hText)) continue;
      if (
        /(?:^|\b)(?:pf|p\.f\.?|epf|e\.p\.f\.?|provident\s*fund)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.pfCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "pf",
          reasoning: "PF deduction detected",
        };
        break;
      }
    }
  }

  if (!result.esicDeductionCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (/(?:employer|er\b|company)/i.test(hText)) continue;
      if (/(?:no|num|ip|code|card)/i.test(hText)) continue;
      if (/(?:^|\b)(?:esic|esi|e\.s\.i\.c\.?)(?:\b|$)/i.test(hText)) {
        result.esicDeductionCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "esic",
          reasoning: "ESIC deduction detected",
        };
        break;
      }
    }
  }

  if (!result.ptCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:pt|p\.t\.?|prof(?:essional)?\s*tax|p\.?\s*tax)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.ptCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "pt",
          reasoning: "PT deduction detected",
        };
        break;
      }
    }
  }

  if (!result.lwfCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:lwf|l\.w\.f\.?|labour\s*welfare(?:\s*fund)?|labor\s*welfare|welfare(?:\s*fund)?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.lwfCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "lwf",
          reasoning: "LWF deduction detected",
        };
        break;
      }
    }
  }

  // 10. Detect Extra fields: advance, expense
  if (!result.advanceCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:advance|adv|salary\s*advance|staff\s*advance)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.advanceCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "advance",
          reasoning: "Advance detected",
        };
        break;
      }
    }
  }

  if (!result.expenseCol) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      const hText = getHeader(c).toLowerCase();
      if (
        /(?:^|\b)(?:expense|expenses|reimbursement|claim|travel\s*expense)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.expenseCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "expense",
          reasoning: "Expense detected",
        };
        break;
      }
    }
  }

  // 11. Classify advance and expense as addition (+) vs minus (-) in Net Pay formula
  let isAdvanceEarning = false;
  if (
    result.advanceCol &&
    typeof result.advanceCol.colIndex === "number" &&
    result.advanceCol.colIndex >= 0
  ) {
    const advC = result.advanceCol.colIndex;
    if (addedCols.has(advC)) {
      isAdvanceEarning = true;
    } else if (subtractedCols.has(advC)) {
      isAdvanceEarning = false;
    } else {
      // Default: advance is normally a deduction
      isAdvanceEarning = false;
    }
  }

  let isExpenseEarning = true;
  if (
    result.expenseCol &&
    typeof result.expenseCol.colIndex === "number" &&
    result.expenseCol.colIndex >= 0
  ) {
    const expC = result.expenseCol.colIndex;
    if (subtractedCols.has(expC)) {
      isExpenseEarning = false;
    } else if (addedCols.has(expC)) {
      isExpenseEarning = true;
    } else {
      // Default: expense reimbursement is normally added to pay
      isExpenseEarning = true;
    }
  }

  // Store classification metadata on extra fields
  (result as any).isAdvanceEarning = isAdvanceEarning;
  (result as any).isExpenseEarning = isExpenseEarning;

  // 12. Detect and validate Gross column (import directly from excel column of similar names)
  if (
    !result.grossCol ||
    typeof result.grossCol.colIndex !== "number" ||
    result.grossCol.colIndex < 0
  ) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      if (c === basicColIdx) continue;
      const hText = getHeader(c)
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
      if (/rate/i.test(hText)) continue;
      if (
        /(?:^|\b)(?:total\s*gross|gross\s*total|gross|total\s*earnings?|earnings?|gross\s*wages?|actual\s*wages?|gross\s*salary|total\s*wages?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.grossCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "gross",
          reasoning: "Detected gross column from header text",
        };
        break;
      }
    }
  }

  // 13. Detect and validate Deductions column (import directly from excel column of similar names)
  if ((result as any).deductionsCol && !result.totalDeductionsCol) {
    result.totalDeductionsCol = (result as any).deductionsCol;
  }
  if (result.totalDeductionsCol && !(result as any).deductionsCol) {
    (result as any).deductionsCol = result.totalDeductionsCol;
  }

  if (
    !result.totalDeductionsCol ||
    typeof result.totalDeductionsCol.colIndex !== "number" ||
    result.totalDeductionsCol.colIndex < 0
  ) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isIdentifierCol(c)) continue;
      if (
        c === result.pfCol?.colIndex ||
        c === result.esicDeductionCol?.colIndex ||
        c === result.ptCol?.colIndex ||
        c === result.lwfCol?.colIndex ||
        c === result.advanceCol?.colIndex ||
        c === result.expenseCol?.colIndex
      ) {
        continue;
      }
      const hText = getHeader(c)
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
      if (
        /(?:^|\b)(?:total\s*deductions?|tot\s*deductions?|total\s*ded|tot\s*ded|deductions?)(?:\b|$)/i.test(
          hText,
        )
      ) {
        result.totalDeductionsCol = {
          colIndex: c,
          originalHeader: getHeader(c),
          cleanHeader: "deductions",
          reasoning: "Detected total deductions column from header text",
        };
        (result as any).deductionsCol = result.totalDeductionsCol;
        break;
      }
    }
  }

  // 14. Check in formula of Gross, Deductions, and Net Pay for unmapped fields:
  // "check in formula of gross, deduction and net pay, if it is in it and its not in any fields i wrote down, and then add it in earning / deduction depending on plus / minus"
  const refreshedSigns = analyzeNetPayAndGrossFormulaSigns({
    sheet,
    sampleRows,
    netPayColIdx: result.netPayCol?.colIndex,
    grossColIdx: result.grossCol?.colIndex,
    deductionsColIdx:
      result.totalDeductionsCol?.colIndex ??
      (result as any).deductionsCol?.colIndex,
    dataStartRowIndex: result.dataStartRowIndex,
  });
  for (const c of refreshedSigns.addedCols) addedCols.add(c);
  for (const c of refreshedSigns.subtractedCols) subtractedCols.add(c);

  const predefinedColIndices = new Set<number>();
  const addIfValid = (colObj?: { colIndex?: number | null } | null) => {
    if (colObj && typeof colObj.colIndex === "number" && colObj.colIndex >= 0) {
      predefinedColIndices.add(colObj.colIndex);
    }
  };

  addIfValid(result.employeeNameCol);
  addIfValid(result.employeeCodeCol);
  addIfValid(result.uanCol);
  addIfValid(result.esicCol);
  addIfValid(result.workingDaysCol);
  addIfValid(result.presentDaysCol);
  addIfValid(result.phCol);
  addIfValid(result.clCol);
  addIfValid(result.elCol);
  addIfValid(result.otDaysCol);
  addIfValid(result.basicCol);
  addIfValid(result.daCol);
  addIfValid(result.hraCol);
  addIfValid(result.ltaCol);
  addIfValid(result.bonusCol);
  addIfValid(result.overtimeCol);
  addIfValid(result.allowanceCol);
  addIfValid(result.leaveSalaryCol);
  addIfValid(result.pfCol);
  addIfValid(result.esicDeductionCol);
  addIfValid(result.ptCol);
  addIfValid(result.lwfCol);
  addIfValid(result.advanceCol);
  addIfValid(result.expenseCol);
  addIfValid(result.grossCol);
  addIfValid(result.totalDeductionsCol);
  addIfValid((result as any).deductionsCol);
  addIfValid(result.netPayCol);

  const isPredefinedOrIdentifier = (c: number): boolean => {
    if (predefinedColIndices.has(c)) return true;
    if (isIdentifierCol(c)) return true;
    const h = getHeader(c)
      .toLowerCase()
      .replace(/[\s_-]+/g, " ");
    if (
      /^(?:employee\s*name|name|employee\s*code|emp\s*code|code|uan|uan\s*no|esic\s*no|working\s*days?|present\s*days?|ph|cl|el|ot\s*days?|basic|da|hra|lta|bonus|overtime|ot\s*amount|allowance|leave\s*salary|pf|esic|pt|lwf|advance|expense|gross|deductions?|net\s*pay)$/i.test(
        h,
      )
    ) {
      return true;
    }
    return false;
  };

  const extraEarningsFromFormula: Array<{
    colIndex: number;
    originalHeader: string;
    cleanHeader: string;
    reasoning: string;
  }> = [];

  const extraDeductionsFromFormula: Array<{
    colIndex: number;
    originalHeader: string;
    cleanHeader: string;
    reasoning: string;
  }> = [];

  const seenCleanHeaders = new Set<string>([
    "employee_name",
    "employee_code",
    "uan_no",
    "esic_no",
    "working_days",
    "present_days",
    "ph",
    "cl",
    "el",
    "ot_days",
    "basic",
    "da",
    "hra",
    "lta",
    "bonus",
    "ot_amount",
    "allowance",
    "leave_salary",
    "advance",
    "expense",
    "gross",
    "pf",
    "esic",
    "pt",
    "lwf",
    "deductions",
    "net_pay",
  ]);

  const allReferencedFormulaCols = Array.from(
    new Set([...addedCols, ...subtractedCols]),
  ).sort((a, b) => a - b);

  for (const c of allReferencedFormulaCols) {
    if (isPredefinedOrIdentifier(c)) continue;
    const origH = getHeader(c);
    let cleanH = toSnakeCaseHeader(origH);
    if (!cleanH || cleanH === "col" || cleanH === "") cleanH = `field_${c}`;
    if (seenCleanHeaders.has(cleanH)) {
      cleanH = `${cleanH}_${c}`;
    }
    seenCleanHeaders.add(cleanH);

    if (addedCols.has(c) && !subtractedCols.has(c)) {
      extraEarningsFromFormula.push({
        colIndex: c,
        originalHeader: origH,
        cleanHeader: cleanH,
        reasoning:
          "Added (+) in Gross/Net Pay formula and not in predefined fields",
      });
    } else if (subtractedCols.has(c) && !addedCols.has(c)) {
      extraDeductionsFromFormula.push({
        colIndex: c,
        originalHeader: origH,
        cleanHeader: cleanH,
        reasoning:
          "Subtracted (-) in Deductions/Net Pay formula and not in predefined fields",
      });
    } else if (addedCols.has(c) && subtractedCols.has(c)) {
      extraEarningsFromFormula.push({
        colIndex: c,
        originalHeader: origH,
        cleanHeader: cleanH,
        reasoning: "Referenced in Gross formula",
      });
    }
  }

  (result as any).extraEarningsFromFormula = extraEarningsFromFormula;
  (result as any).extraDeductionsFromFormula = extraDeductionsFromFormula;

  // 15. Build clean earnings and deductions arrays for internal helpers
  result.earnings = [];
  if (result.basicCol)
    result.earnings.push({ ...result.basicCol, cleanHeader: "basic" });
  if (result.daCol)
    result.earnings.push({ ...result.daCol, cleanHeader: "da" });
  if (result.hraCol)
    result.earnings.push({ ...result.hraCol, cleanHeader: "hra" });
  if (result.ltaCol)
    result.earnings.push({ ...result.ltaCol, cleanHeader: "lta" });
  if (result.bonusCol)
    result.earnings.push({ ...result.bonusCol, cleanHeader: "bonus" });
  if (result.overtimeCol)
    result.earnings.push({ ...result.overtimeCol, cleanHeader: "ot_amount" });
  if (result.allowanceCol)
    result.earnings.push({ ...result.allowanceCol, cleanHeader: "allowance" });
  if (result.leaveSalaryCol)
    result.earnings.push({
      ...result.leaveSalaryCol,
      cleanHeader: "leave_salary",
    });
  if (isAdvanceEarning && result.advanceCol)
    result.earnings.push({ ...result.advanceCol, cleanHeader: "advance" });
  if (isExpenseEarning && result.expenseCol)
    result.earnings.push({ ...result.expenseCol, cleanHeader: "expense" });
  for (const ee of extraEarningsFromFormula) {
    result.earnings.push(ee);
  }
  if (
    result.grossCol &&
    typeof result.grossCol.colIndex === "number" &&
    result.grossCol.colIndex >= 0
  )
    result.earnings.push({ ...result.grossCol, cleanHeader: "gross" });

  result.deductions = [];
  if (result.pfCol)
    result.deductions.push({ ...result.pfCol, cleanHeader: "pf" });
  if (result.esicDeductionCol)
    result.deductions.push({ ...result.esicDeductionCol, cleanHeader: "esic" });
  if (result.ptCol)
    result.deductions.push({ ...result.ptCol, cleanHeader: "pt" });
  if (result.lwfCol)
    result.deductions.push({ ...result.lwfCol, cleanHeader: "lwf" });
  if (!isAdvanceEarning && result.advanceCol)
    result.deductions.push({ ...result.advanceCol, cleanHeader: "advance" });
  if (!isExpenseEarning && result.expenseCol)
    result.deductions.push({ ...result.expenseCol, cleanHeader: "expense" });
  for (const ed of extraDeductionsFromFormula) {
    result.deductions.push(ed);
  }
  if (
    result.totalDeductionsCol &&
    typeof result.totalDeductionsCol.colIndex === "number" &&
    result.totalDeductionsCol.colIndex >= 0
  )
    result.deductions.push({
      ...result.totalDeductionsCol,
      cleanHeader: "deductions",
    });

  // Ensure header names are strictly standardized
  if (result.workingDaysCol) result.workingDaysCol.cleanHeader = "working_days";
  if (result.presentDaysCol) result.presentDaysCol.cleanHeader = "present_days";
  if (result.phCol) result.phCol.cleanHeader = "ph";
  if (result.clCol) result.clCol.cleanHeader = "cl";
  if (result.elCol) result.elCol.cleanHeader = "el";
  if (result.otDaysCol) result.otDaysCol.cleanHeader = "ot_days";
  if (result.employeeNameCol)
    result.employeeNameCol.cleanHeader = "employee_name";
  if (result.employeeCodeCol)
    result.employeeCodeCol.cleanHeader = "employee_code";
  if (result.uanCol) result.uanCol.cleanHeader = "uan_no";
  if (result.esicCol) result.esicCol.cleanHeader = "esic_no";
  if (result.overtimeCol) result.overtimeCol.cleanHeader = "ot_amount";
  if (result.allowanceCol) result.allowanceCol.cleanHeader = "allowance";
  if (result.leaveSalaryCol) result.leaveSalaryCol.cleanHeader = "leave_salary";
  if (result.grossCol) result.grossCol.cleanHeader = "gross";
  if (result.totalDeductionsCol)
    result.totalDeductionsCol.cleanHeader = "deductions";
  if ((result as any).deductionsCol)
    (result as any).deductionsCol.cleanHeader = "deductions";
  if (result.netPayCol) result.netPayCol.cleanHeader = "net_pay";

  console.log("\n--- [Enriched & Verified Column Decisions] ---");
  if (result.employeeNameCol) {
    console.log(
      `  • employee_name: Col ${result.employeeNameCol.colIndex} ("${result.employeeNameCol.originalHeader}") | ${result.employeeNameCol.reasoning}`,
    );
  }
  if (result.employeeCodeCol) {
    console.log(
      `  • employee_code: Col ${result.employeeCodeCol.colIndex} ("${result.employeeCodeCol.originalHeader}") | ${result.employeeCodeCol.reasoning}`,
    );
  }
  if (result.uanCol) {
    console.log(
      `  • uan_no       : Col ${result.uanCol.colIndex} ("${result.uanCol.originalHeader}") | ${result.uanCol.reasoning}`,
    );
  }
  if (result.esicCol) {
    console.log(
      `  • esic_no      : Col ${result.esicCol.colIndex} ("${result.esicCol.originalHeader}") | ${result.esicCol.reasoning}`,
    );
  }
  console.log(
    `  • working_days : Col ${result.workingDaysCol?.colIndex ?? "Derived"} | ${result.workingDaysCol?.reasoning}`,
  );
  console.log(
    `  • present_days : Col ${result.presentDaysCol?.colIndex} ("${result.presentDaysCol?.originalHeader ?? ""}") | ${result.presentDaysCol?.reasoning}`,
  );
  if (result.phCol) {
    console.log(
      `  • ph           : Col ${result.phCol.colIndex} ("${result.phCol.originalHeader}") | ${result.phCol.reasoning}`,
    );
  }
  if (result.clCol) {
    console.log(
      `  • cl           : Col ${result.clCol.colIndex} ("${result.clCol.originalHeader}") | ${result.clCol.reasoning}`,
    );
  }
  if (result.elCol) {
    console.log(
      `  • el           : Col ${result.elCol.colIndex} ("${result.elCol.originalHeader}") | ${result.elCol.reasoning}`,
    );
  }
  if (result.otDaysCol || result.overtimeCol) {
    console.log(
      `  • overtime     : ot_days -> Col ${result.otDaysCol?.colIndex} ("${result.otDaysCol?.originalHeader}"), ot_amount -> Col ${result.overtimeCol?.colIndex} ("${result.overtimeCol?.originalHeader}") | ${result.overtimeCol?.reasoning || result.otDaysCol?.reasoning}`,
    );
  }
  if (result.basicCol) {
    console.log(
      `  • basic        : Col ${result.basicCol.colIndex} ("${result.basicCol.originalHeader}") | ${result.basicCol.reasoning}`,
    );
  }
  if (result.allowanceCol) {
    console.log(
      `  • allowance    : Col ${result.allowanceCol.colIndex} ("${result.allowanceCol.originalHeader}") | ${result.allowanceCol.reasoning}`,
    );
  }
  if (result.leaveSalaryCol) {
    console.log(
      `  • leave_salary : Col ${result.leaveSalaryCol.colIndex} ("${result.leaveSalaryCol.originalHeader}") | ${result.leaveSalaryCol.reasoning}`,
    );
  }
  if (result.grossCol) {
    console.log(
      `  • gross        : Col ${result.grossCol.colIndex} ("${result.grossCol.originalHeader}") | ${result.grossCol.reasoning}`,
    );
  }
  if (result.totalDeductionsCol) {
    console.log(
      `  • deductions   : Col ${result.totalDeductionsCol.colIndex} ("${result.totalDeductionsCol.originalHeader}") | ${result.totalDeductionsCol.reasoning || "Direct deductions column"}`,
    );
  }
  if (result.advanceCol) {
    console.log(
      `  • advance      : Col ${result.advanceCol.colIndex} -> placed in ${isAdvanceEarning ? "earnings (+)" : "deductions (-)"} based on Net Pay formula sign`,
    );
  }
  if (result.expenseCol) {
    console.log(
      `  • expense      : Col ${result.expenseCol.colIndex} -> placed in ${isExpenseEarning ? "earnings (+)" : "deductions (-)"} based on Net Pay formula sign`,
    );
  }
  for (const ee of extraEarningsFromFormula) {
    console.log(
      `  • Dynamic Earning   : "${ee.cleanHeader}" (Col ${ee.colIndex}) | ${ee.reasoning}`,
    );
  }
  for (const ed of extraDeductionsFromFormula) {
    console.log(
      `  • Dynamic Deduction : "${ed.cleanHeader}" (Col ${ed.colIndex}) | ${ed.reasoning}`,
    );
  }
  if (result.netPayCol) {
    console.log(
      `  • net_pay      : Col ${result.netPayCol.colIndex} ("${result.netPayCol.originalHeader}") | ${result.netPayCol.reasoning}`,
    );
  }
  console.log("----------------------------------------------\n");

  return result;
}

/**
 * Extracts row-specific working days for an employee row.
 * Handles sheets where different employees have different working days (e.g. 26 vs 30 vs 31),
 * extracted from each row's formula division (/ 26, / 30) or arithmetic (Rate * Days) / Earned.
 */
function extractRowWorkingDays({
  sheet,
  sheetRowIdx,
  row,
  aiAnalysis,
  presentDays,
  defaultWorkingDays,
}: {
  sheet: XLSX.WorkSheet;
  sheetRowIdx: number;
  row: any[];
  aiAnalysis: PayrollAIAnalysis;
  presentDays?: number | null;
  defaultWorkingDays: number | null;
}): number | string {
  // 1. If there is a valid Working Days column in the source sheet (from two explicit fields), use row value if present
  if (
    typeof aiAnalysis.workingDaysCol?.colIndex === "number" &&
    aiAnalysis.workingDaysCol.colIndex >= 0
  ) {
    const rawVal = row[aiAnalysis.workingDaysCol.colIndex];
    if (
      rawVal !== null &&
      rawVal !== undefined &&
      String(rawVal).trim() !== ""
    ) {
      const num = Number(String(rawVal).replace(/,/g, "").trim());
      if (!Number.isNaN(num) && num > 0 && num <= 31) {
        return Math.round(num * 100) / 100;
      }
    }
  }

  // 2. If in formula it is divided: inspect formulas in this specific row (sheetRowIdx) in sheet
  if (sheet && sheetRowIdx >= 0) {
    const checkCols: number[] = [];
    if (
      typeof aiAnalysis.basicCol?.colIndex === "number" &&
      aiAnalysis.basicCol.colIndex >= 0
    ) {
      checkCols.push(aiAnalysis.basicCol.colIndex);
    }
    for (const earn of aiAnalysis.earnings) {
      if (
        typeof earn.colIndex === "number" &&
        earn.colIndex >= 0 &&
        !checkCols.includes(earn.colIndex)
      ) {
        checkCols.push(earn.colIndex);
      }
    }
    if (
      typeof aiAnalysis.grossCol?.colIndex === "number" &&
      aiAnalysis.grossCol.colIndex >= 0 &&
      !checkCols.includes(aiAnalysis.grossCol.colIndex)
    ) {
      checkCols.push(aiAnalysis.grossCol.colIndex);
    }
    for (let c = 0; c < row.length; c++) {
      if (!checkCols.includes(c)) checkCols.push(c);
    }

    for (const c of checkCols) {
      const cellAddr = XLSX.utils.encode_cell({ r: sheetRowIdx, c });
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;
      const formula = String(cell.f);

      const divMatches = formula.match(
        /\/\s*\(?\s*(\$?[A-Za-z]+\$?\d+|\d+(?:\.\d+)?)\s*\)?/g,
      );
      if (divMatches) {
        for (const dm of divMatches) {
          const operand = dm
            .replace(/^\/\s*\(?\s*/, "")
            .replace(/\s*\)?$/, "")
            .replace(/\$/g, "");

          if (/^[A-Za-z]+\d+$/.test(operand)) {
            try {
              const targetCell = sheet[operand];
              const targetVal = targetCell ? Number(targetCell.v) : Number.NaN;
              if (
                !Number.isNaN(targetVal) &&
                targetVal >= 20 &&
                targetVal <= 31
              ) {
                return Math.round(targetVal);
              }
            } catch {}
          } else {
            const num = Math.round(Number(operand));
            if (!Number.isNaN(num) && num >= 20 && num <= 31) {
              return num;
            }
          }
        }
      }
    }
  }

  // 3. Fallback to defaultWorkingDays if derived from formula in [20, 31]
  if (
    typeof defaultWorkingDays === "number" &&
    defaultWorkingDays >= 20 &&
    defaultWorkingDays <= 31
  ) {
    return defaultWorkingDays;
  }

  // 4. Fallback rule: 26 static (or MAX(26, present days))
  const pDays =
    typeof presentDays === "number" &&
    !Number.isNaN(presentDays) &&
    presentDays > 0
      ? presentDays
      : 26;
  return Math.max(26, pDays);
}

/**
 * Cleans numeric values from spreadsheet cells.
 */
function cleanNumericCellValue(val: any): number | string {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") {
    if (Number.isNaN(val)) return 0;
    return Math.round(val);
  }
  const str = String(val).replace(/,/g, "").trim();
  if (str === "") return 0;
  const parsed = Number(str);
  if (!Number.isNaN(parsed)) {
    return Math.round(parsed);
  }
  return str;
}

/**
 * Cleans text identifiers (Code, UAN, ESIC) to avoid trailing .0 or scientific notation.
 */
function cleanIdentifierValue(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  // Strip .0 if parsed as float (e.g. 100912345678.0)
  if (/^\d+\.0$/.test(str)) {
    str = str.replace(/\.0$/, "");
  }
  return str;
}

/**
 * Checks if a row looks like a summary / total row.
 */
function isSummaryOrTotalRow(
  row: any[],
  nameVal: string,
  codeVal: string,
): boolean {
  const lowerName = nameVal.toLowerCase();
  const lowerCode = codeVal.toLowerCase();

  if (
    lowerName === "total" ||
    lowerName === "grand total" ||
    lowerName === "sub total" ||
    lowerName.startsWith("total ") ||
    lowerCode === "total" ||
    lowerCode === "grand total"
  ) {
    return true;
  }

  // Check if first non-empty cell in row is "total" or "grand total"
  for (const cell of row) {
    if (cell !== null && cell !== undefined && String(cell).trim() !== "") {
      const cellLower = String(cell).trim().toLowerCase();
      if (
        cellLower === "total" ||
        cellLower === "grand total" ||
        cellLower === "sub total" ||
        cellLower === "totals"
      ) {
        return true;
      }
      break;
    }
  }

  return false;
}

/**
 * Transforms an Excel payroll attachment into a new Excel workbook containing:
 * - Employee Name
 * - ESIC (Registration / IP number)
 * - Code (Employee ID)
 * - UAN (PF UAN)
 * - Attendance Data (Working Days, Present Days, Paid Holidays, Casual Leaves, Total Paid Days, OT Hours)
 * - Attendance-calculated earnings that flow into Net Pay
 * - Actual deductions that flow into Net Pay
 * - Net Pay
 
 * Excludes fixed monthly master rates (e.g. Basic 20,000) and other non-wage metadata.
 * Uses GEMINI_MAIN for AI classification with algorithmic formula verification.
 */
export async function transformPayrollExcelAttachment(
  content: Buffer | Uint8Array,
  filename: string,
): Promise<ExcelTransformationResult> {
  ensureEnvLoaded();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(Buffer.from(content), {
      type: "buffer",
      cellDates: true,
      raw: false,
      cellFormula: true,
    });
  } catch (readErr: any) {
    throw new Error(
      `Failed to decode Excel file "${filename}": ${readErr?.message || "Corrupt or invalid format"}`,
    );
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error(`Excel file "${filename}" contains no sheets.`);
  }

  const newWorkbook = XLSX.utils.book_new();
  let firstSheetResult: ExcelTransformationResult | null = null;
  let totalTransformedRecordsAllSheets = 0;
  const allSheetResults: SheetTransformationResult[] = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    }) as any[][];

    // Filter out completely blank rows while preserving true sheet row indices
    const rowsWithMeta: Array<{ sheetRowIdx: number; row: any[] }> = [];
    for (let rawIdx = 0; rawIdx < rawRows.length; rawIdx++) {
      const r = rawRows[rawIdx];
      if (
        Array.isArray(r) &&
        r.some((c) => c !== null && c !== undefined && String(c).trim() !== "")
      ) {
        rowsWithMeta.push({ sheetRowIdx: rawIdx, row: r });
      }
    }

    // Skip sheets that have fewer than 2 rows (cannot contain header + data)
    if (rowsWithMeta.length < 2) {
      continue;
    }

    const rows = rowsWithMeta.map((item) => item.row);
    // Sample the first 25 rows for AI analysis
    const sampleRows = rows.slice(0, 25);

    let aiAnalysis: PayrollAIAnalysis;
    try {
      aiAnalysis = await analyzePayrollSheetWithAI({
        sheetName,
        filename,
        totalRows: rows.length,
        sampleRows,
        sheet,
      });
    } catch (aiErr: any) {
      console.error(
        `[PayrollExcelTransform] AI analysis failed for sheet "${sheetName}":`,
        aiErr,
      );
      // If single sheet, rethrow so failure mail is triggered
      if (sheetNames.length === 1) {
        throw new Error(
          `AI transformation failed for sheet "${sheetName}": ${aiErr?.message || String(aiErr)}`,
        );
      }
      continue;
    }

    // Algorithmic validation and enrichment of attendance fields
    aiAnalysis = validateAndEnrichAttendance(aiAnalysis, sheet, sampleRows);

    // Validate that we found at least employee name or code and some payment columns
    const hasEmployeeId =
      aiAnalysis.employeeNameCol !== null ||
      aiAnalysis.employeeCodeCol !== null;
    const hasPayColumns =
      aiAnalysis.earnings.length > 0 || aiAnalysis.deductions.length > 0;

    if (!hasEmployeeId && !hasPayColumns) {
      // Likely an informational or non-payroll tab (e.g. Instructions, Summary)
      continue;
    }

    // Prepare target column headers according to standardized closed column set:
    // 1. Employee Identifiers: employee_name, employee_code, uan, esic_no
    const identifierColumns: Array<{
      key: string;
      header: string;
      colIndex: number | null;
    }> = [];

    identifierColumns.push({
      key: "employee_name",
      header: "employee_name",
      colIndex: aiAnalysis.employeeNameCol?.colIndex ?? null,
    });

    if (
      aiAnalysis.employeeCodeCol &&
      typeof aiAnalysis.employeeCodeCol.colIndex === "number" &&
      aiAnalysis.employeeCodeCol.colIndex >= 0
    ) {
      identifierColumns.push({
        key: "employee_code",
        header: "employee_code",
        colIndex: aiAnalysis.employeeCodeCol.colIndex,
      });
    }

    if (
      aiAnalysis.uanCol &&
      typeof aiAnalysis.uanCol.colIndex === "number" &&
      aiAnalysis.uanCol.colIndex >= 0
    ) {
      identifierColumns.push({
        key: "uan_no",
        header: "uan_no",
        colIndex: aiAnalysis.uanCol.colIndex,
      });
    }

    if (
      aiAnalysis.esicCol &&
      typeof aiAnalysis.esicCol.colIndex === "number" &&
      aiAnalysis.esicCol.colIndex >= 0
    ) {
      identifierColumns.push({
        key: "esic_no",
        header: "esic_no",
        colIndex: aiAnalysis.esicCol.colIndex,
      });
    }

    // 2. Attendance columns: working_days (Required), present_days (Required), ph, cl, el, ot_days
    const attendanceColumns: Array<{
      key: "working_days" | "present_days" | "ph" | "cl" | "el" | "ot_days";
      header: string;
      colIndex: number | null;
      fixedValue?: number | null;
    }> = [];

    // working_days (Required)
    const wdFixedVal =
      typeof aiAnalysis.workingDaysCol?.dividedNumber === "number" &&
      aiAnalysis.workingDaysCol.dividedNumber >= 20 &&
      aiAnalysis.workingDaysCol.dividedNumber <= 31
        ? aiAnalysis.workingDaysCol.dividedNumber
        : (aiAnalysis.workingDaysCol as any)?.fixedValue ?? null;

    attendanceColumns.push({
      key: "working_days",
      header: "working_days",
      colIndex:
        typeof aiAnalysis.workingDaysCol?.colIndex === "number" &&
        aiAnalysis.workingDaysCol.colIndex >= 0
          ? aiAnalysis.workingDaysCol.colIndex
          : null,
      fixedValue: wdFixedVal,
    });

    // present_days (Required)
    attendanceColumns.push({
      key: "present_days",
      header: "present_days",
      colIndex:
        typeof aiAnalysis.presentDaysCol?.colIndex === "number" &&
        aiAnalysis.presentDaysCol.colIndex >= 0
          ? aiAnalysis.presentDaysCol.colIndex
          : null,
    });

    // ph (if present)
    const phSource = aiAnalysis.phCol;
    if (
      phSource &&
      typeof phSource.colIndex === "number" &&
      phSource.colIndex >= 0
    ) {
      attendanceColumns.push({
        key: "ph",
        header: "ph",
        colIndex: phSource.colIndex,
      });
    }

    // cl (if present)
    const clSource = aiAnalysis.clCol
    if (
      clSource &&
      typeof clSource.colIndex === "number" &&
      clSource.colIndex >= 0
    ) {
      attendanceColumns.push({
        key: "cl",
        header: "cl",
        colIndex: clSource.colIndex,
      });
    }

    // el (if present)
    const elSource = aiAnalysis.elCol
    if (
      elSource &&
      typeof elSource.colIndex === "number" &&
      elSource.colIndex >= 0
    ) {
      attendanceColumns.push({
        key: "el",
        header: "el",
        colIndex: elSource.colIndex,
      });
    }

    // ot_days (if present)
    const otSource = aiAnalysis.otDaysCol
    if (
      otSource &&
      typeof otSource.colIndex === "number" &&
      otSource.colIndex >= 0
    ) {
      attendanceColumns.push({
        key: "ot_days",
        header: "ot_days",
        colIndex: otSource.colIndex,
      });
    }

    // 3. Earnings columns: basic (Required), da, hra, lta, bonus, overtime, advance (if +), expense (if +)
    const isAdvanceEarning = (aiAnalysis as any).isAdvanceEarning ?? false;
    const isExpenseEarning = (aiAnalysis as any).isExpenseEarning ?? true;

    const earningColumns: Array<{
      key: string;
      header: string;
      colIndex: number | null;
    }> = [];

    // basic (Required)
    earningColumns.push({
      key: "basic",
      header: "basic",
      colIndex:
        typeof aiAnalysis.basicCol?.colIndex === "number" &&
        aiAnalysis.basicCol.colIndex >= 0
          ? aiAnalysis.basicCol.colIndex
          : null,
    });

    if (
      aiAnalysis.daCol &&
      typeof aiAnalysis.daCol.colIndex === "number" &&
      aiAnalysis.daCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "da",
        header: "da",
        colIndex: aiAnalysis.daCol.colIndex,
      });
    }

    if (
      aiAnalysis.hraCol &&
      typeof aiAnalysis.hraCol.colIndex === "number" &&
      aiAnalysis.hraCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "hra",
        header: "hra",
        colIndex: aiAnalysis.hraCol.colIndex,
      });
    }

    if (
      aiAnalysis.ltaCol &&
      typeof aiAnalysis.ltaCol.colIndex === "number" &&
      aiAnalysis.ltaCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "lta",
        header: "lta",
        colIndex: aiAnalysis.ltaCol.colIndex,
      });
    }

    if (
      aiAnalysis.bonusCol &&
      typeof aiAnalysis.bonusCol.colIndex === "number" &&
      aiAnalysis.bonusCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "bonus",
        header: "bonus",
        colIndex: aiAnalysis.bonusCol.colIndex,
      });
    }

    if (
      aiAnalysis.overtimeCol &&
      typeof aiAnalysis.overtimeCol.colIndex === "number" &&
      aiAnalysis.overtimeCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "ot_amount",
        header: "ot_amount",
        colIndex: aiAnalysis.overtimeCol.colIndex,
      });
    }

    // STRICT USER RULE: If one of ot_days or ot_amount is present, the other HAS to be there!
    const hasOtDays = attendanceColumns.some((ac) => ac.key === "ot_days");
    const hasOtAmount = earningColumns.some((ec) => ec.key === "ot_amount");

    if (hasOtDays && !hasOtAmount) {
      const colIdx =
        aiAnalysis.overtimeCol?.colIndex ??
        attendanceColumns.find((ac) => ac.key === "ot_days")?.colIndex ??
        null;
      earningColumns.push({
        key: "ot_amount",
        header: "ot_amount",
        colIndex: colIdx,
      });
    } else if (hasOtAmount && !hasOtDays) {
      const colIdx =
        aiAnalysis.otDaysCol?.colIndex ??
        earningColumns.find((ec) => ec.key === "ot_amount")?.colIndex ??
        null;
      attendanceColumns.push({
        key: "ot_days",
        header: "ot_days",
        colIndex: colIdx,
      });
    }

    if (
      aiAnalysis.allowanceCol &&
      typeof aiAnalysis.allowanceCol.colIndex === "number" &&
      aiAnalysis.allowanceCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "allowance",
        header: "allowance",
        colIndex: aiAnalysis.allowanceCol.colIndex,
      });
    }

    if (
      aiAnalysis.leaveSalaryCol &&
      typeof aiAnalysis.leaveSalaryCol.colIndex === "number" &&
      aiAnalysis.leaveSalaryCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "leave_salary",
        header: "leave_salary",
        colIndex: aiAnalysis.leaveSalaryCol.colIndex,
      });
    }

    if (
      isAdvanceEarning &&
      aiAnalysis.advanceCol &&
      typeof aiAnalysis.advanceCol.colIndex === "number" &&
      aiAnalysis.advanceCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "advance",
        header: "advance",
        colIndex: aiAnalysis.advanceCol.colIndex,
      });
    }

    if (
      isExpenseEarning &&
      aiAnalysis.expenseCol &&
      typeof aiAnalysis.expenseCol.colIndex === "number" &&
      aiAnalysis.expenseCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "expense",
        header: "expense",
        colIndex: aiAnalysis.expenseCol.colIndex,
      });
    }

    // Dynamic extra earnings found in formulas (+ sign)
    const extraEarnings = (aiAnalysis as any).extraEarningsFromFormula || [];
    for (const ee of extraEarnings) {
      if (typeof ee.colIndex === "number" && ee.colIndex >= 0) {
        earningColumns.push({
          key: ee.cleanHeader,
          header: ee.cleanHeader,
          colIndex: ee.colIndex,
        });
      }
    }

    if (
      aiAnalysis.grossCol &&
      typeof aiAnalysis.grossCol.colIndex === "number" &&
      aiAnalysis.grossCol.colIndex >= 0
    ) {
      earningColumns.push({
        key: "gross",
        header: "gross",
        colIndex: aiAnalysis.grossCol.colIndex,
      });
    }

    // 4. Deductions columns: pf, esic, pt, lwf, advance (if -), expense (if -), deductions
    const deductionColumns: Array<{
      key: string;
      header: string;
      colIndex: number | null;
    }> = [];

    if (
      aiAnalysis.pfCol &&
      typeof aiAnalysis.pfCol.colIndex === "number" &&
      aiAnalysis.pfCol.colIndex >= 0
    ) {
      deductionColumns.push({
        key: "pf",
        header: "pf",
        colIndex: aiAnalysis.pfCol.colIndex,
      });
    }

    if (
      aiAnalysis.esicDeductionCol &&
      typeof aiAnalysis.esicDeductionCol.colIndex === "number" &&
      aiAnalysis.esicDeductionCol.colIndex >= 0
    ) {
      deductionColumns.push({
        key: "esic",
        header: "esic",
        colIndex: aiAnalysis.esicDeductionCol.colIndex,
      });
    }

    if (
      aiAnalysis.ptCol &&
      typeof aiAnalysis.ptCol.colIndex === "number" &&
      aiAnalysis.ptCol.colIndex >= 0
    ) {
      deductionColumns.push({
        key: "pt",
        header: "pt",
        colIndex: aiAnalysis.ptCol.colIndex,
      });
    }

    if (
      aiAnalysis.lwfCol &&
      typeof aiAnalysis.lwfCol.colIndex === "number" &&
      aiAnalysis.lwfCol.colIndex >= 0
    ) {
      deductionColumns.push({
        key: "lwf",
        header: "lwf",
        colIndex: aiAnalysis.lwfCol.colIndex,
      });
    }

    if (
      !isAdvanceEarning &&
      aiAnalysis.advanceCol &&
      typeof aiAnalysis.advanceCol.colIndex === "number" &&
      aiAnalysis.advanceCol.colIndex >= 0
    ) {
      deductionColumns.push({
        key: "advance",
        header: "advance",
        colIndex: aiAnalysis.advanceCol.colIndex,
      });
    }

    if (
      !isExpenseEarning &&
      aiAnalysis.expenseCol &&
      typeof aiAnalysis.expenseCol.colIndex === "number" &&
      aiAnalysis.expenseCol.colIndex >= 0
    ) {
      deductionColumns.push({
        key: "expense",
        header: "expense",
        colIndex: aiAnalysis.expenseCol.colIndex,
      });
    }

    // Dynamic extra deductions found in formulas (- sign)
    const extraDeductions =
      (aiAnalysis as any).extraDeductionsFromFormula || [];
    for (const ed of extraDeductions) {
      if (typeof ed.colIndex === "number" && ed.colIndex >= 0) {
        deductionColumns.push({
          key: ed.cleanHeader,
          header: ed.cleanHeader,
          colIndex: ed.colIndex,
        });
      }
    }

    const dedColIdx =
      typeof aiAnalysis.totalDeductionsCol?.colIndex === "number" &&
      aiAnalysis.totalDeductionsCol.colIndex >= 0
        ? aiAnalysis.totalDeductionsCol.colIndex
        : typeof (aiAnalysis as any).deductionsCol?.colIndex === "number" &&
            (aiAnalysis as any).deductionsCol.colIndex >= 0
          ? (aiAnalysis as any).deductionsCol.colIndex
          : null;

    if (typeof dedColIdx === "number" && dedColIdx >= 0) {
      deductionColumns.push({
        key: "deductions",
        header: "deductions",
        colIndex: dedColIdx,
      });
    }

    // Assemble final output headers strictly in order
    const headers: string[] = [
      ...identifierColumns.map((c) => c.header),
      ...attendanceColumns.map((c) => c.header),
      ...earningColumns.map((c) => c.header),
      ...deductionColumns.map((c) => c.header),
      "net_pay",
    ];

    console.log(
      `[Transform Column Assembly] Sheet: "${sheetName}" | Initial Output Columns: [${headers.join(", ")}]`,
    );

    // Extract employee data rows: ensure all entries in the sheet are transformed
    const startRowIdx = Math.max(
      aiAnalysis.dataStartRowIndex,
      (aiAnalysis.secondaryHeaderRowIndex ?? aiAnalysis.headerRowIndex) + 1,
    );

    // If rows.length > sampleRows.length, the AI only inspected a sample of 25 rows,
    // so data rows continue all the way to rows.length - 1.
    const maxRowIdx =
      rows.length <= sampleRows.length &&
      aiAnalysis.dataEndRowIndex !== null &&
      aiAnalysis.dataEndRowIndex >= startRowIdx &&
      aiAnalysis.dataEndRowIndex < rows.length
        ? aiAnalysis.dataEndRowIndex
        : rows.length - 1;

    const outDataRows: (string | number)[][] = [];

    for (let r = startRowIdx; r <= maxRowIdx; r++) {
      const item = rowsWithMeta[r];
      if (!item) continue;
      const { sheetRowIdx, row } = item;
      if (!row || !Array.isArray(row)) continue;

      const nameVal =
        aiAnalysis.employeeNameCol &&
        typeof aiAnalysis.employeeNameCol.colIndex === "number" &&
        aiAnalysis.employeeNameCol.colIndex >= 0
          ? cleanIdentifierValue(row[aiAnalysis.employeeNameCol.colIndex])
          : "";
      const codeVal =
        aiAnalysis.employeeCodeCol &&
        typeof aiAnalysis.employeeCodeCol.colIndex === "number" &&
        aiAnalysis.employeeCodeCol.colIndex >= 0
          ? cleanIdentifierValue(row[aiAnalysis.employeeCodeCol.colIndex])
          : "";

      // Check for summary/total row
      if (isSummaryOrTotalRow(row, nameVal, codeVal)) {
        console.log(
          `  ✕ [Row Transform] Skipped summary/total row #${sheetRowIdx + 1} ("${nameVal || codeVal || row[0] || "Total"}")`,
        );
        continue;
      }

      // If both name and code are completely blank, skip empty row
      if (!nameVal && !codeVal) {
        console.log(
          `  ✕ [Row Transform] Skipped blank row #${sheetRowIdx + 1} (No name and no employee code)`,
        );
        continue;
      }

      // Pre-extract present days for this row so it is available for working days calculation
      let presentDaysVal: number | null = null;
      const presentColIdx = attendanceColumns.find(
        (ac) => ac.key === "present_days",
      )?.colIndex;
      if (typeof presentColIdx === "number" && presentColIdx >= 0) {
        const rawP = row[presentColIdx];
        const cleanedP = cleanAttendanceDaysValue(rawP);
        if (typeof cleanedP === "number") {
          presentDaysVal = cleanedP;
        }
      }

      // If present days could not be determined from column headers, extract from Basic formula multiplier column cell
      if (presentDaysVal === null) {
        const basicColIdx =
          typeof aiAnalysis.basicCol?.colIndex === "number" &&
          aiAnalysis.basicCol.colIndex >= 0
            ? aiAnalysis.basicCol.colIndex
            : -1;
        presentDaysVal = extractRowPresentDays({
          sheet,
          sheetRowIdx,
          row,
          basicColIdx,
          sampleRows,
          fallbackMultiplierCol: aiAnalysis.presentDaysCol?.colIndex ?? null,
        });
      }

      const identifierVals = identifierColumns.map((ic) => {
        if (typeof ic.colIndex === "number" && ic.colIndex >= 0) {
          return cleanIdentifierValue(row[ic.colIndex]);
        }
        return "";
      });

      const attendanceVals = attendanceColumns.map((ac) => {
        if (ac.key === "working_days") {
          const wd = extractRowWorkingDays({
            sheet,
            sheetRowIdx,
            row,
            aiAnalysis,
            presentDays: presentDaysVal,
            defaultWorkingDays:
              typeof ac.fixedValue === "number" &&
              ac.fixedValue >= 20 &&
              ac.fixedValue <= 31
                ? ac.fixedValue
                : null,
          });
          const numWd = Number(wd);
          if (!Number.isNaN(numWd) && numWd > 0 && numWd <= 31) {
            return Math.round(numWd * 100) / 100;
          }
          return Math.max(26, presentDaysVal ?? 26);
        }

        if (ac.key === "present_days") {
          if (presentDaysVal !== null) {
            return presentDaysVal;
          }
          if (
            ac.colIndex !== null &&
            ac.colIndex !== undefined &&
            ac.colIndex >= 0
          ) {
            const rawCell = row[ac.colIndex];
            return cleanAttendanceDaysValue(rawCell);
          }
          return "";
        }

        if (ac.key === "ot_days") {
          return extractRowOtDays({
            sheet,
            sheetRowIdx,
            row,
            otColIdx: ac.colIndex ?? -1,
            otHeader:
              aiAnalysis.otDaysCol?.originalHeader ||
              aiAnalysis.otHoursCol?.originalHeader,
            sampleRows,
            headerRowIndex: aiAnalysis.headerRowIndex,
          });
        }

        if (
          ac.colIndex !== null &&
          ac.colIndex !== undefined &&
          ac.colIndex >= 0
        ) {
          const rawCell = row[ac.colIndex];
          return cleanAttendanceDaysValue(rawCell);
        }

        return "";
      });

      // If present days is greater than working days for this row,
      // make the working day of only this row equal to the present day of this row.
      const workingDaysIdx = attendanceColumns.findIndex(
        (ac) => ac.key === "working_days",
      );
      const presentDaysIdx = attendanceColumns.findIndex(
        (ac) => ac.key === "present_days",
      );

      if (workingDaysIdx >= 0 && presentDaysIdx >= 0) {
        const numWorking = Number(attendanceVals[workingDaysIdx]);
        const numPresent = Number(attendanceVals[presentDaysIdx]);
        if (
          !Number.isNaN(numWorking) &&
          !Number.isNaN(numPresent) &&
          numPresent > numWorking
        ) {
          attendanceVals[workingDaysIdx] = numPresent;
        }
      }

      // Strict guard: No attendance value can ever exceed 31 or be negative (except OT days <= 100).
      for (let i = 0; i < attendanceVals.length; i++) {
        const v = attendanceVals[i];
        if (v !== "" && v !== null && v !== undefined) {
          const numV = Number(v);
          const maxLimit = attendanceColumns[i]?.key === "ot_days" ? 100 : 31;
          if (Number.isNaN(numV) || numV < 0 || numV > maxLimit) {
            attendanceVals[i] = "";
          }
        }
      }

      const earningVals = earningColumns.map((ec) => {
        if (ec.key === "ot_amount") {
          return extractRowOtAmount({
            sheet,
            sheetRowIdx,
            row,
            otColIdx: ec.colIndex ?? -1,
            aiAnalysis,
            sampleRows,
            headerRowIndex: aiAnalysis.headerRowIndex,
            presentDaysVal,
          });
        }
        return ec.colIndex !== null && ec.colIndex >= 0
          ? cleanNumericCellValue(row[ec.colIndex])
          : 0;
      });

      const deductionVals = deductionColumns.map((dc) =>
        dc.colIndex !== null && dc.colIndex >= 0
          ? cleanNumericCellValue(row[dc.colIndex])
          : 0,
      );

      // net_pay (Required)
      let netPayVal = 0;
      if (
        aiAnalysis.netPayCol &&
        typeof aiAnalysis.netPayCol.colIndex === "number" &&
        aiAnalysis.netPayCol.colIndex >= 0
      ) {
        const rawNet = row[aiAnalysis.netPayCol.colIndex];
        netPayVal = cleanNumericCellValue(rawNet);
      }
      if (netPayVal === 0) {
        const grossVal = earningColumns.find((e) => e.key === "gross")
          ? cleanNumericCellValue(
              row[earningColumns.find((e) => e.key === "gross")!.colIndex!],
            )
          : earningVals.reduce((sum, v) => sum + (Number(v) || 0), 0);
        const dedsVal = deductionColumns.find((d) => d.key === "deductions")
          ? cleanNumericCellValue(
              row[
                deductionColumns.find((d) => d.key === "deductions")!.colIndex!
              ],
            )
          : deductionVals.reduce((sum, v) => sum + (Number(v) || 0), 0);
        netPayVal = Math.round(Math.max(0, grossVal - dedsVal));
      }

      outDataRows.push([
        ...identifierVals,
        ...attendanceVals,
        ...earningVals,
        ...deductionVals,
        netPayVal,
      ]);
    }

    if (outDataRows.length === 0) {
      continue;
    }

    // --- POST-PROCESSING PIPELINE (Pure TypeScript, No AI) ---
    // Step 1: Remove rows where only name is there and no emp code & no uan code & no esic code & net pay is 0 / null / N/A
    const validDataRows = filterInvalidTransformedRows(headers, outDataRows);

    if (validDataRows.length === 0) {
      continue;
    }

    // Step 2: Prune non-required columns where entire column values are either N/A or 0
    const { finalHeaders, finalDataRows } = pruneEmptyTransformedColumns(
      headers,
      validDataRows,
    );

    console.log(
      `[Transform Final Sheet] Sheet: "${sheetName}" | Final Columns: [${finalHeaders.join(", ")}] | Transformed Records: ${finalDataRows.length}`,
    );

    // Summary total row for amount columns only (not for identifiers or attendance)
    const NON_AMOUNT_HEADERS = new Set<string>([
      "employee_name",
      "employee_code",
      "uan_no",
      "esic_no",
      "working_days",
      "present_days",
      "ph",
      "cl",
      "el",
      "ot_days",
    ]);

    const totalRow: (string | number)[] = finalHeaders.map((hdr, colIdx) => {
      if (colIdx === 0) {
        return "Total";
      }
      if (NON_AMOUNT_HEADERS.has(hdr)) {
        return "";
      }

      let sum = 0;
      let hasAnyNumber = false;
      for (const row of finalDataRows) {
        const val = row[colIdx];
        if (val !== null && val !== undefined && val !== "") {
          const num = Number(String(val).replace(/,/g, "").trim());
          if (!Number.isNaN(num)) {
            sum += num;
            hasAnyNumber = true;
          }
        }
      }

      // Whole round numbers for all amounts
      return hasAnyNumber ? Math.round(sum) : "";
    });

    // Assemble worksheet: [Headers, ...DataRows, TotalRow]
    const worksheetData = [finalHeaders, ...finalDataRows, totalRow];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Apply clean column widths for kept columns
    worksheet["!cols"] = finalHeaders.map((hdr) => {
      if (hdr === "employee_name") return { wch: 26 };
      if (hdr === "employee_code" || hdr === "uan_no" || hdr === "esic_no")
        return { wch: 18 };
      if (
        ["working_days", "present_days", "ph", "cl", "el", "ot_days"].includes(
          hdr,
        )
      )
        return { wch: 15 };
      if (hdr === "net_pay") return { wch: 18 };
      return { wch: 16 };
    });

    const safeSheetName =
      sheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) ||
      "Transformed Payroll";
    let finalSafeSheetName = safeSheetName;
    let counter = 1;
    while (newWorkbook.SheetNames.includes(finalSafeSheetName)) {
      const suffix = `_${counter++}`;
      finalSafeSheetName = `${safeSheetName.slice(0, 31 - suffix.length)}${suffix}`;
    }
    XLSX.utils.book_append_sheet(newWorkbook, worksheet, finalSafeSheetName);

    totalTransformedRecordsAllSheets += finalDataRows.length;

    // Capture details for summary report
    const lastRow = finalDataRows[finalDataRows.length - 1];
    const lastRowText = lastRow
      .map((c) => String(c ?? "").trim())
      .filter(Boolean)
      .join(", ");

    const keptHeaderSet = new Set(finalHeaders);
    const currentSheetDetails = {
      sheetName,
      employeeNameCol: keptHeaderSet.has("employee_name")
        ? aiAnalysis.employeeNameCol?.originalHeader || null
        : null,
      employeeCodeCol: keptHeaderSet.has("employee_code")
        ? aiAnalysis.employeeCodeCol?.originalHeader || null
        : null,
      esicCol: keptHeaderSet.has("esic_no")
        ? aiAnalysis.esicCol?.originalHeader || null
        : null,
      uanCol: keptHeaderSet.has("uan_no")
        ? aiAnalysis.uanCol?.originalHeader || null
        : null,
      attendance: attendanceColumns
        .map((ac) => ac.header)
        .filter((h) => keptHeaderSet.has(h)),
      earnings: earningColumns
        .map((e) => e.header)
        .filter((h) => keptHeaderSet.has(h)),
      grossCol: keptHeaderSet.has("gross")
        ? aiAnalysis.grossCol?.originalHeader || null
        : null,
      deductions: deductionColumns
        .map((d) => d.header)
        .filter((h) => keptHeaderSet.has(h)),
      netPayCol: aiAnalysis.netPayCol?.originalHeader || "net_pay",
      excludedRateColumns: [],
    };

    allSheetResults.push({
      sheetName,
      totalRows: worksheetData.length,
      lastRowText: lastRowText || "Empty row",
      recordsCount: finalDataRows.length,
      columns: finalHeaders,
      details: currentSheetDetails,
      previewRows: worksheetData,
    });

    if (!firstSheetResult) {
      firstSheetResult = {
        transformedBuffer: Buffer.from([]),
        transformedFilename: "",
        totalRows: worksheetData.length,
        lastRowText: lastRowText || "Empty row",
        recordsCount: finalDataRows.length,
        columns: finalHeaders,
        details: currentSheetDetails,
        sheets: [],
      };
    }
  }

  if (newWorkbook.SheetNames.length === 0 || !firstSheetResult) {
    throw new Error(
      `No valid employee payroll data could be extracted from "${filename}". Please check that the spreadsheet contains employee records with attendance-calculated earnings and deductions.`,
    );
  }

  // Generate output buffer
  const transformedBuffer = XLSX.write(newWorkbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  // Format output filename
  const parsed = path.parse(filename || "payroll.xlsx");
  const baseName = parsed.name || "payroll";
  const transformedFilename = `Transformed_${baseName}.xlsx`;

  firstSheetResult.transformedBuffer = transformedBuffer;
  firstSheetResult.transformedFilename = transformedFilename;
  firstSheetResult.recordsCount = totalTransformedRecordsAllSheets;
  firstSheetResult.sheets = allSheetResults;

  return firstSheetResult;
}
