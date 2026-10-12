import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as XLSX from "xlsx";
import { google as googleAi } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "@canny_ecosystem/utils";

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

export const GEMINI_MAIN = process.env.GEMINI_MAIN_MODEL || "gemini-2.5-flash";

const PayrollAISchema = z.object({
  headerRowIndex: z
    .number()
    .describe("0-indexed row number containing the main column headers (e.g. 0, 1, 2)"),
  secondaryHeaderRowIndex: z
    .number()
    .nullable()
    .describe(
      "0-indexed row number if headers are multi-row / stacked (e.g. Row 1 has 'Rate of Wages' / 'Earned Wages' and Row 2 has 'Basic', 'HRA'), else null"
    ),
  dataStartRowIndex: z
    .number()
    .describe("0-indexed row number where actual employee records begin"),
  dataEndRowIndex: z
    .number()
    .nullable()
    .describe(
      "0-indexed row number where actual employee records end (before totals, averages, or summary rows). If data extends beyond sample, return null"
    ),

  employeeNameCol: z
    .object({
      colIndex: z.number().describe("0-indexed column index containing Employee Name"),
      originalHeader: z.string().describe("Header text in source sheet"),
    })
    .nullable(),

  employeeCodeCol: z
    .object({
      colIndex: z.number().describe("0-indexed column index containing Employee Code / ID"),
      originalHeader: z.string().describe("Header text in source sheet"),
    })
    .nullable(),

  esicCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Employee ESIC Registration / IP Number (NOT the monthly deduction amount!)"
        ),
      originalHeader: z.string().describe("Header text in source sheet"),
    })
    .nullable(),

  uanCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Employee PF UAN Number"),
      originalHeader: z.string().describe("Header text in source sheet"),
    })
    .nullable(),

  workingDaysCol: z
    .object({
      colIndex: z
        .number()
        .nullable()
        .describe(
          "0-indexed column index containing Working Days if present as a column in the sheet, else null"
        ),
      originalHeader: z
        .string()
        .nullable()
        .describe("Header text in source sheet if present, or null if taken from divided number in formula"),
      cleanHeader: z.string().default("Working Days"),
      dividedNumber: z
        .number()
        .nullable()
        .describe(
          "The numeric number used to divide amount fields (e.g. 30, 26, 31, 28) to compute per-day rate. MANDATORY: MUST BE PROVIDED if amount fields are divided by a number (like /30 or /26) even if Working Days is not a separate column in the sheet!"
        ),
      reasoning: z
        .string()
        .describe(
          "Explanation: column or divided number used to divide amounts to calculate per-day rate"
        ),
    })
    .nullable()
    .describe(
      "Working Days used to divide amount fields. If not present as a separate column in the sheet, MUST capture the divided number (e.g. 30, 26, 31) from amount formulas/math"
    ),

  presentDaysCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Present Days / Actual Worked Days"),
      originalHeader: z.string().describe("Header text in source sheet"),
      cleanHeader: z.string().describe("Clean header e.g. Present Days"),
      reasoning: z
        .string()
        .describe(
          "Explanation: days multiplied in amount fields. If multiplied field was a sum of multiple fields, this is the component with the highest digits/value"
        ),
    })
    .nullable()
    .describe(
      "Column containing actual Present Days worked (multiplier in amount fields, or the component with highest values if sum of multiple fields)"
    ),

  totalPaidDaysCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Total Paid Days / Payable Days (the sum column)"
        ),
      originalHeader: z.string().describe("Header text in source sheet"),
      cleanHeader: z.string().describe("Clean header e.g. Total Paid Days"),
      reasoning: z
        .string()
        .describe(
          "Explanation: composite days column that sums present days + holidays/leaves and is multiplied into amounts"
        ),
    })
    .nullable()
    .describe(
      "If present days + holidays/leaves were summed into a combined Paid Days column used in the amount calculation, this is that total paid days column (null if present days itself was directly multiplied)"
    ),

  paidHolidaysCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Paid Holidays (PH)"),
      originalHeader: z.string().describe("Header text in source sheet"),
      cleanHeader: z.string().describe("Clean header e.g. Paid Holidays"),
      reasoning: z
        .string()
        .describe(
          "Explanation: holiday days component summed into total multiplied days"
        ),
    })
    .nullable()
    .describe(
      "Column containing Paid Holidays (PH) that sum into the days multiplied for amount calculation"
    ),

  casualLeavesCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing Casual Leaves (CL) / Casual Holidays / Leaves"
        ),
      originalHeader: z.string().describe("Header text in source sheet"),
      cleanHeader: z.string().describe("Clean header e.g. Casual Leaves"),
      reasoning: z
        .string()
        .describe(
          "Explanation: casual leaves / leave days component summed into total multiplied days"
        ),
    })
    .nullable()
    .describe(
      "Column containing Casual Leaves (CL) / Paid Leaves (PL/SL) that sum into the days multiplied for amount calculation"
    ),

  otherAttendanceCols: z
    .array(
      z.object({
        colIndex: z.number().describe("0-indexed column index"),
        originalHeader: z.string().describe("Original header text in source sheet"),
        cleanHeader: z.string().describe("Clean descriptive header e.g. Weekly Off"),
        reasoning: z.string().describe("Reasoning for selecting this attendance column"),
      })
    )
    .describe(
      "Any other leaf attendance component columns (e.g. Weekly Off, Special Leave) summed into multiplied days (empty array if none)"
    ),

  otHoursCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing Overtime Hours (OT Hours)"),
      originalHeader: z.string().describe("Header text in source sheet"),
      cleanHeader: z.string().describe("Clean header e.g. OT Hours"),
      reasoning: z
        .string()
        .describe(
          "Explanation: overtime hours multiplied to calculate OT Amount"
        ),
    })
    .nullable()
    .describe(
      "Column containing Overtime Hours (OT Hours / OT Hrs) multiplied to calculate OT or OT Amount"
    ),

  earnings: z
    .array(
      z.object({
        colIndex: z.number().describe("0-indexed column index"),
        originalHeader: z.string().describe("Original header text in source sheet"),
        cleanHeader: z
          .string()
          .describe(
            "Clean descriptive header name for the new Excel, e.g. Basic, HRA, DA, Overtime Amount"
          ),
        reasoning: z
          .string()
          .describe(
            "Explanation why this column was selected as the actual attendance-earned wage rather than a fixed monthly master rate"
          ),
      })
    )
    .describe(
      "List of columns containing actual calculated earnings that flow into Net Pay. STRICT: DO NOT include fixed monthly master rates!"
    ),

  grossCol: z
    .object({
      colIndex: z
        .number()
        .describe(
          "0-indexed column index containing the Gross earned wages column (which sums the earned fields before it)"
        ),
      originalHeader: z
        .string()
        .describe(
          "The EXACT header text from the source sheet, e.g. 'Actual Wages', 'Wages', 'Gross Wages', 'Gross', 'Gross Salary'"
        ),
      reasoning: z
        .string()
        .describe(
          "Explanation confirming this column sums the earned fields before it in sample rows"
        ),
    })
    .nullable()
    .describe(
      "The Gross earned wages column that sums the attendance-calculated earnings before it. Preserve the EXACT header name from the source sheet."
    ),

  deductions: z
    .array(
      z.object({
        colIndex: z.number().describe("0-indexed column index"),
        originalHeader: z.string().describe("Original header text in source sheet"),
        cleanHeader: z
          .string()
          .describe(
            "Clean descriptive header name for the new Excel. If the source header is 'ESIC' or 'ESI', name this 'ESIC Deduction' or 'ESI Deduction' to distinguish from ESIC IP number"
          ),
        reasoning: z
          .string()
          .describe("Explanation why this column is an active deduction calculated in Net Pay"),
      })
    )
    .describe("List of columns containing actual deductions subtracted to arrive at Net Pay"),

  netPayCol: z
    .object({
      colIndex: z
        .number()
        .describe("0-indexed column index containing final Net Pay / Take Home column"),
      originalHeader: z
        .string()
        .describe(
          "The EXACT header text from the source sheet, e.g. 'Net Pay', 'Net Payable', 'Take Home', 'Net Salary'"
        ),
      reasoning: z
        .string()
        .describe(
          "Explanation confirming this column equals Gross minus Total Deductions"
        ),
    })
    .nullable()
    .describe(
      "The final Net Pay column after subtracting deductions from gross. Preserve the EXACT header name from the source sheet."
    ),

  excludedRateColumns: z
    .array(
      z.object({
        colIndex: z.number(),
        header: z.string(),
        reason: z
          .string()
          .describe("e.g. 'Monthly master rate (20000) not attendance calculated'"),
      })
    )
    .describe("Columns identified as fixed monthly rates or uncalculated amounts that were deliberately excluded"),
});

export type PayrollAIAnalysis = z.infer<typeof PayrollAISchema>;

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
}

const SYSTEM_TRANSFORMATION_PROMPT = `You are an expert HR and Payroll AI Data Transformation specialist.
Your task is to analyze an incoming salary/payroll spreadsheet and select the columns required to create a new, clean transformed payroll report including employee identification, attendance data, earned earnings, gross, deductions, and net pay.

TARGET SPREADSHEET COLUMN REQUIREMENTS:
In the newly created Excel, we strictly require:
1. Employee Name
2. ESIC (Employee's ESIC IP / Registration Number - NOT the deduction amount!)
3. Code (Employee Code / ID)
4. UAN (Universal Account Number / PF UAN)
5. Attendance Data (Extracted according to the 4 Mandatory Attendance Extraction Rules below):
   - Working Days (divisor used in amount calculation, e.g. 26, 30, 31)
   - Present Days (days multiplied in amount fields, or the component with highest digits if multiplied field is a sum)
   - Paid Holidays (PH) & Casual Holidays / Leaves (CL) (components summed into multiplied days)
   - Total Paid Days (the composite sum column, if distinct from Present Days)
   - OT Hours (overtime hours multiplied into Overtime Amount)
6. Active Calculated Earnings (Only earnings actually calculated in Net Pay based on attendance/performance, NOT fixed monthly master rates!)
7. Gross (Actual Gross / Wages that sums the attendance-calculated earnings before it - preserve EXACT header name from the sheet!)
8. Active Calculated Deductions (Deductions actually subtracted to arrive at Net Pay)
9. Net Pay (Final take-home pay after deductions - preserve EXACT header name from the sheet!)

=======================================================
MANDATORY ATTENDANCE DATA EXTRACTION RULES (RULES 1 - 4):
=======================================================

RULE 1: FIND WORKING DAYS USED TO DIVIDE AMOUNT FIELDS - MANDATORY
- Find the working days / month days divisor used to divide monthly amount/rate fields to calculate per-day rates (e.g. Rate / Working_Days * Present_Days).
- Check the formulas (e.g. =C5/30*D5 or =C5/26*D5 or =C5/F5*D5) and sample row values (where rate is divided by 30, 26, 31, etc.):
  * CASE 1A: If there is a dedicated column in the sheet for Working Days (e.g. header: "Working Days", "Total Days", "W.Days", "Month Days", "Std Days", "Calendar Days"), return its 0-indexed column index in workingDaysCol.colIndex, and set workingDaysCol.dividedNumber to that column's numeric value (e.g. 30).
  * CASE 1B (CRITICAL): If Working Days is NOT specially mentioned as a column in the sheet, but amount fields are divided by a number (e.g. formula divides by literal number like /30 or /26 or /31, or the arithmetic divides Rate by 30 or 26):
    YOU MUST TAKE THAT DIVIDED NUMBER AS WORKING DAYS!
    Set workingDaysCol.colIndex to null, and set workingDaysCol.dividedNumber to that number (e.g. 30, 26, 31).
    We will create and include the "Working Days" column in the transformed sheet using this divided number!

RULE 2: FIND PRESENT DAYS (DAYS MULTIPLIED IN AMOUNT FIELDS & SUM DECOMPOSITION)
- Find the days factor that is multiplied in the amount calculation (e.g. (Rate / Working_Days) * Multiplied_Days).
- Check if that multiplied days column is created using the sum of other columns (e.g. formula =ColA + ColB + ColC, or values Multiplier = ColA + ColB + ColC):
  * SUB-RULE 2A: If it is NOT created using the sum of other columns (it is an independent raw attendance column), then THAT column IS the Present Days! (Set presentDaysCol to this column, and totalPaidDaysCol to null).
  * SUB-RULE 2B: If it IS created using the sum of multiple columns (e.g. Present + Holidays + Leaves = Total Paid Days):
    - Compare the components summed together: The component column with the HIGHEST DIGITS / HIGHEST VALUES (e.g. 22 vs 2 vs 1) IS THE ACTUAL PRESENT DAYS! (Set presentDaysCol to this highest component column).
    - Set totalPaidDaysCol to the sum column itself (e.g. "Payable Days", "Total Paid Days", "Paid Days").

RULE 3: FIND OT HOURS MULTIPLIED INTO OT OR OT AMOUNT
- Find the Overtime Hours (OT Hours) column:
  * Check if there is an Overtime Amount / OT column (e.g. "OT Amount", "OT Wages", "Overtime Amount", "OT Pay", "OT Amt", "OT").
  * Look for the column containing hours (e.g. 0, 4, 8, 12.5) that is multiplied to compute the Overtime Amount.
  * Check headers such as: "OT Hours", "OT Hrs", "OT Hr", "OT", "Overtime Hours", "Overtime Hrs", "O.T. (Hrs)", "O.T. Hours".
  * Return this column in otHoursCol. (Note: OT Hours count belongs in attendance; OT Amount monetary wage belongs in earnings).

RULE 4: FIND PAID HOLIDAYS & CASUAL HOLIDAYS / LEAVES SUMMED INTO MULTIPLIED DAYS
- When the multiplied days column is a sum of multiple fields (as detected in Rule 2B):
  * The components that are NOT the highest (i.e. not the Present Days) represent Paid Holidays (PH) and Casual Holidays / Leaves (CL, PL, SL, etc.)!
  * Paid Holidays (PH): Look for headers like "PH", "Paid Holiday", "Paid Holidays", "Holidays", "Festive Holiday", "National Holiday", "NH", "FH". Return in paidHolidaysCol.
  * Casual Holidays / Leaves (CL): Look for headers like "CL", "Casual Leave", "Casual Holiday", "Leave", "Leaves", "PL", "Paid Leave", "Privilege Leave", "SL", "Sick Leave", "EL". Return in casualLeavesCol.
  * If there are other summed leave/off columns (e.g. Weekly Off "WO"), return them in otherAttendanceCols.
- If no such sum decomposition exists in the sheet, paidHolidaysCol and casualLeavesCol should be null.

=======================================================
EARNINGS, GROSS, DEDUCTIONS, AND NET PAY RULES:
=======================================================

CRITICAL INSTRUCTION - ATTENDANCE-CALCULATED EARNINGS VS MONTHLY MASTER RATES:
In Indian and SME payroll spreadsheets, there are frequently two distinct sets of earnings columns:
1. FIXED / MONTHLY MASTER RATES: (e.g. Basic = 20,000, HRA = 10,000, Gross Rate = 30,000, Wage Rate, Rate P.M., Rate). This is the nominal rate an employee would earn for a full month with 0 absences.
2. ATTENDANCE-CALCULATED / ACTUAL EARNED WAGES: (e.g. Basic = 15,000, HRA = 7,500, Earned Basic, Paid Basic, Actual Basic, or a second column named "Basic" with attendance-prorated numbers). This is calculated based on worked/present days (e.g., 20000 * 22.5 / 30 = 15000) and is the ACTUAL amount that adds to Gross Earned and flows directly into Net Pay.

STRICT RULE:
- You MUST SELECT ONLY the attendance-calculated / actual earned earnings (e.g. the 15,000 column) that are actually calculated in Net Pay!
- You MUST EXCLUDE and NEVER SELECT fixed monthly master rate columns (e.g. the 20,000 column) into earnings!
- Compare values across sample rows:
  * If attendance (Present Days) is less than month days, the fixed rate column will show a flat round number (like 20000) while the earned column shows the attendance-calculated reduced figure (like 15000).
  * Look at the math: Earned Earnings - Deductions = Net Pay. The earning components that actually sum to Net Pay are the ones to include.
  * If the sheet only has one set of earnings without separate rate columns, include those earnings.
  * Overtime Amount (OT Amount / OT Wages) is an earning if it is a paid monetary amount (do NOT include OT Hours count in earnings).

CRITICAL INSTRUCTION - GROSS COLUMN DETECTION (MANDATORY):
- You MUST identify the column for Gross earned wages / salary.
- The name of this column can be different across companies: it could be "Gross", "Gross Wages", "Gross Salary", "Wages", "Actual Wages", "Total Wages", "Earned Wages", "Total Earned", "Gross Pay", etc.
- 99% PROBABILITY DETECTION RULE: Look at the values in the sample rows! In 99% of payroll spreadsheets, the Gross column is the column that SUMS up all the attendance-calculated earning fields that appear immediately before it (e.g. Basic + HRA + DA + Allowances = Gross).
- EXCLUDE FIXED MASTER GROSS: If the sheet also has a fixed monthly master gross rate (e.g. 20000 + 10000 = 30000), DO NOT select that! Select the attendance-calculated Gross (e.g. 15000 + 7500 = 22500) that actually sums the earned fields and is used to compute Net Pay.
- PRESERVE EXACT HEADER NAME: In grossCol.originalHeader, return the EXACT text as written in the source sheet (e.g. "Actual Wages", "WAGES", "Gross Wages", "Gross"). We will preserve this exact name as the column header in the new Excel!

DEDUCTIONS TO INCLUDE:
- Include active employee deduction columns that reduce Net Pay:
  e.g. PF / EPF (Employee Provident Fund), ESIC deduction (Employee State Insurance deduction amount, e.g. 0.75%), Professional Tax (PT), TDS / Income Tax, Salary Advance, Loan Recovery, Labour Welfare Fund (LWF), Other Deductions.
- Exclude Employer contributions (Employer PF 12%, Employer ESIC 3.25%) unless they are deducted from employee wage.
- Exclude Total Deductions summary columns (unless it is Net Pay).

CRITICAL INSTRUCTION - NET PAY COLUMN DETECTION (MANDATORY):
- You MUST identify the final Net Pay / Take Home column.
- Header names can be "Net Pay", "Net Payable", "Net Salary", "Take Home", "Paid Amount", "Total Paid", "Net", etc.
- Verification in sample rows: Gross - Total Deductions = Net Pay.
- PRESERVE EXACT HEADER NAME: In netPayCol.originalHeader, return the EXACT text as written in the source sheet (e.g. "Net Payable", "Net Pay", "Take Home"). We will preserve this exact name as the column header in the new Excel!

CRITICAL INSTRUCTIONS ON IDENTIFIER COLUMNS:
- employeeNameCol: Column containing employee's full name (e.g. Name, Employee Name, Staff Name, Name of Workman).
- employeeCodeCol: Column containing employee's code/ID (e.g. Emp Code, Code, Emp ID, Staff ID, Card No).
- esicCol: Column containing employee's ESIC Registration / IP Number (e.g. ESIC No, ESI No, IP No, ESIC Number).
  IMPORTANT: This is the employee's ESIC ID number (usually 10 or 17 digits), NOT the monthly ESIC deduction amount! If not found in the sheet, return null.
- uanCol: Column containing employee's UAN (PF Universal Account Number, usually 12 digits, e.g. UAN, UAN No). If not found in the sheet, return null.

COLUMNS TO STRICTLY IGNORE AND EXCLUDE:
- Monthly master rates / wage rates (e.g. Basic 20000, Rate P.M., Wage Rate, Rate Gross).
- Non-wage attendance metadata not used in payment (e.g. Absent Days count, LOP count if not multiplied into wage).
- Summary totals from the bottom of the table (Total, Grand Total, Sum).
- Personal details & non-payment metadata (e.g. S.No, Sr No, Father Name, Mother Name, Gender, DOB, DOJ, Designation, Department, Branch, Location, Bank Name, Bank Account No, IFSC Code, PAN No, Remarks).

HEADER RENAMING GUIDELINES:
- Attendance columns: Use clean standard names: Working Days, Present Days, Paid Holidays, Casual Leaves, Total Paid Days, OT Hours.
- For earnings: Use clean names: Basic, HRA, DA, Overtime Amount, Special Allowance, etc.
- For deductions:
  * IMPORTANT: If a deduction column in the source sheet is named "ESIC" or "ESI", rename cleanHeader to "ESIC Deduction" or "ESI Deduction" to clearly distinguish it from the employee's ESIC registration number!
  * Use clean names: PF, ESIC Deduction, Professional Tax, TDS, Advance, Loan.
`;

/**
 * Extracts formula relationships and mathematical patterns from sample rows.
 */
function extractFormulaAndMathInsights(
  sheet: XLSX.WorkSheet,
  sampleRows: any[][]
): string[] {
  const insights: string[] = [];
  const divisorColCounts = new Map<number, number>();
  const divisorNumberCounts = new Map<number, number>();
  const multiplierColCounts = new Map<number, number>();
  const sumRelationships: Array<{
    sumCol: number;
    compCols: number[];
    highestCompCol: number;
    formula?: string;
  }> = [];

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
      const r = cellCoords ? cellCoords.r : 0;
      const formula = String(cell.f);

      // 1. Division: e.g. / D5 or / 30 or / 26 or / (30) or / $D$2
      const divMatches = formula.match(
        /\/\s*\(?\s*(\$?[A-Za-z]+\$?\d+|\d+(?:\.\d+)?)\s*\)?/g
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
              const targetVal = targetCell ? Number(targetCell.v) : NaN;
              if (!isNaN(targetVal) && targetVal >= 15 && targetVal <= 31) {
                const rounded = Math.round(targetVal);
                divisorNumberCounts.set(
                  rounded,
                  (divisorNumberCounts.get(rounded) || 0) + 1
                );
              } else {
                const decoded = XLSX.utils.decode_cell(operand);
                divisorColCounts.set(
                  decoded.c,
                  (divisorColCounts.get(decoded.c) || 0) + 1
                );
              }
            } catch {}
          } else {
            const num = Math.round(Number(operand));
            if (!isNaN(num) && num >= 15 && num <= 31) {
              divisorNumberCounts.set(num, (divisorNumberCounts.get(num) || 0) + 1);
            }
          }
        }
      }

      // 2. Multiplication: e.g. * E5 or E5 *
      const mulMatches = formula.match(
        /\*\s*(\$?[A-Za-z]+\$?\d+)|(\$?[A-Za-z]+\$?\d+)\s*\*/g
      );
      if (mulMatches) {
        for (const mm of mulMatches) {
          const operand = mm.replace(/[*$\s]/g, "");
          if (/^[A-Za-z]+\d+$/.test(operand)) {
            try {
              const decoded = XLSX.utils.decode_cell(operand);
              multiplierColCounts.set(
                decoded.c,
                (multiplierColCounts.get(decoded.c) || 0) + 1
              );
            } catch {}
          }
        }
      }

      // 3. Additive Sums: e.g. =G5+H5+I5 or =SUM(G5:I5)
      const isAddSum =
        /^[A-Za-z0-9_$.]+\s*\+\s*[A-Za-z0-9_$.]+/.test(formula) ||
        /^SUM\(/i.test(formula);
      if (isAddSum && c >= 0) {
        const cleanedFormula = formula.replace(/^SUM\(/i, "").replace(/\)$/, "");
        const parts = cleanedFormula.split(/[+,]/);
        const compCols: number[] = [];
        for (const p of parts) {
          const cleanRef = p.trim().replace(/\$/g, "");
          if (/^[A-Za-z]+\d+$/.test(cleanRef)) {
            try {
              const decoded = XLSX.utils.decode_cell(cleanRef);
              if (!compCols.includes(decoded.c) && decoded.c !== c) {
                compCols.push(decoded.c);
              }
            } catch {}
          } else if (/^[A-Za-z]+\d+:[A-Za-z]+\d+$/.test(cleanRef)) {
            try {
              const range = XLSX.utils.decode_range(cleanRef);
              for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx++) {
                if (!compCols.includes(colIdx) && colIdx !== c) {
                  compCols.push(colIdx);
                }
              }
            } catch {}
          }
        }

        if (compCols.length >= 2) {
          if (!sumRelationships.some((sr) => sr.sumCol === c)) {
            // Find component with highest average/max value in sampleRows
            let highestCol = compCols[0];
            let highestVal = -Infinity;
            for (const colIdx of compCols) {
              let maxValInCol = 0;
              for (
                let testR = Math.max(0, r - 3);
                testR < Math.min(sampleRows.length, r + 4);
                testR++
              ) {
                const val = Number(sampleRows[testR]?.[colIdx]) || 0;
                if (val > maxValInCol) maxValInCol = val;
              }
              if (maxValInCol > highestVal) {
                highestVal = maxValInCol;
                highestCol = colIdx;
              }
            }
            sumRelationships.push({
              sumCol: c,
              compCols,
              highestCompCol: highestCol,
              formula,
            });
          }
        }
      }
    }
  }

  // Value-based sum detection across data rows (for spreadsheets without formulas)
  if (sumRelationships.length === 0 && sampleRows.length >= 3) {
    const numCols = sampleRows[0]?.length || 0;
    const candidateDaysCols: number[] = [];
    for (let c = 0; c < numCols; c++) {
      let isDaysCandidate = false;
      for (let r = 1; r < Math.min(sampleRows.length, 10); r++) {
        const val = Number(sampleRows[r]?.[c]);
        if (!isNaN(val) && val > 0 && val <= 31) {
          isDaysCandidate = true;
          break;
        }
      }
      if (isDaysCandidate) candidateDaysCols.push(c);
    }

    for (const sumCol of candidateDaysCols) {
      for (let i = 0; i < candidateDaysCols.length; i++) {
        for (let j = i + 1; j < candidateDaysCols.length; j++) {
          const colA = candidateDaysCols[i];
          const colB = candidateDaysCols[j];
          if (colA === sumCol || colB === sumCol) continue;

          let matchesCount = 0;
          let testRowsCount = 0;
          for (let r = 1; r < Math.min(sampleRows.length, 12); r++) {
            const sumVal = Number(sampleRows[r]?.[sumCol]);
            const valA = Number(sampleRows[r]?.[colA]);
            const valB = Number(sampleRows[r]?.[colB]);
            if (!isNaN(sumVal) && !isNaN(valA) && !isNaN(valB) && (valA > 0 || valB > 0)) {
              testRowsCount++;
              if (Math.abs(sumVal - (valA + valB)) < 0.05) {
                matchesCount++;
              }
            }
          }

          if (testRowsCount >= 2 && matchesCount === testRowsCount) {
            const avgA = sampleRows.reduce((acc, row) => acc + (Number(row?.[colA]) || 0), 0);
            const avgB = sampleRows.reduce((acc, row) => acc + (Number(row?.[colB]) || 0), 0);
            const highestCompCol = avgA >= avgB ? colA : colB;
            sumRelationships.push({
              sumCol,
              compCols: [colA, colB],
              highestCompCol,
            });
            break;
          }
        }
        if (sumRelationships.length > 0) break;
      }
    }
  }

  // Value-based divisor detection across data rows (if formula division was not detected)
  if (divisorNumberCounts.size === 0 && divisorColCounts.size === 0 && sampleRows.length >= 2) {
    for (let r = 1; r < Math.min(sampleRows.length, 15); r++) {
      const row = sampleRows[r];
      if (!row || !Array.isArray(row)) continue;
      const numValues: Array<{ col: number; val: number }> = [];
      for (let c = 0; c < row.length; c++) {
        const raw = row[c];
        if (raw === null || raw === undefined || raw === "") continue;
        const clean = Number(String(raw).replace(/,/g, "").trim());
        if (!isNaN(clean) && clean > 0) {
          numValues.push({ col: c, val: clean });
        }
      }
      const daysItems = numValues.filter((it) => it.val >= 1 && it.val <= 31);
      const rateItems = numValues.filter((it) => it.val >= 1000);
      const earnItems = numValues.filter((it) => it.val >= 500);

      for (const d of daysItems) {
        for (const rt of rateItems) {
          for (const en of earnItems) {
            if (rt.col === en.col || rt.col === d.col || en.col === d.col) continue;
            if (rt.val > en.val) {
              const calcDiv = Math.round((rt.val * d.val) / en.val);
              if (calcDiv >= 20 && calcDiv <= 31) {
                const expected = (rt.val * d.val) / calcDiv;
                if (Math.abs(expected - en.val) <= 2) {
                  divisorNumberCounts.set(calcDiv, (divisorNumberCounts.get(calcDiv) || 0) + 1);
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
    const sortedDivisors = Array.from(divisorColCounts.entries()).sort((a, b) => b[1] - a[1]);
    insights.push(
      `Working Days Divisor: Column [C${sortedDivisors[0][0]}] appears in formulas as divisor (/ [C${sortedDivisors[0][0]}])`
    );
  }

  if (divisorNumberCounts.size > 0) {
    const sortedNums = Array.from(divisorNumberCounts.entries()).sort((a, b) => b[1] - a[1]);
    insights.push(
      `Working Days Divisor Number: Formula/arithmetic divides amounts by literal number ${sortedNums[0][0]} (/ ${sortedNums[0][0]}). MANDATORY: Working Days is not a separate column in the sheet, so you MUST set workingDaysCol.colIndex to null and set workingDaysCol.dividedNumber to ${sortedNums[0][0]}.`
    );
  }

  if (multiplierColCounts.size > 0) {
    const sortedMultipliers = Array.from(multiplierColCounts.entries()).sort((a, b) => b[1] - a[1]);
    insights.push(
      `Days Multiplier: Column [C${sortedMultipliers[0][0]}] appears in formulas as days multiplier (* [C${sortedMultipliers[0][0]}])`
    );
  }

  for (const sr of sumRelationships) {
    const otherComps = sr.compCols.filter((c) => c !== sr.highestCompCol);
    insights.push(
      `Sum Decomposition: Column [C${sr.sumCol}] is a SUM of Columns [C${sr.highestCompCol}] and [${otherComps.map((c) => `C${c}`).join(", ")}]. Highest component [C${sr.highestCompCol}] represents Present Days. Remaining components represent Paid Holidays / Casual Leaves.`
    );
  }

  return insights;
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
      "Missing GOOGLE_GENERATIVE_AI_API_KEY in environment. Cannot perform AI transformation."
    );
  }

  // Format sample rows with clear row, column indices, and cell formulas
  const formattedSample = sampleRows
    .map((row, rIdx) => {
      let lastNonEmpty = -1;
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== "") {
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
          const formula = cell && cell.f ? cell.f : null;
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

Please analyze the rows and formulas, detect attendance columns following Rules 1-4, compare rate columns vs attendance-earned columns, and return the transformation schema.`;

  const modelsToTry = [
    GEMINI_MAIN,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.8-flash",
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

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
      return result.object;
    } catch (err: any) {
      console.warn(
        `[PayrollExcelTransform] Model "${modelName}" failed, trying next candidate:`,
        err?.message || err
      );
      lastErr = err;
    }
  }

  throw lastErr;
}

/**
 * Validates and enriches attendance column detections based on mathematical and formula verifications.
 */
function validateAndEnrichAttendance(
  aiAnalysis: PayrollAIAnalysis,
  sheet: XLSX.WorkSheet,
  sampleRows: any[][]
): PayrollAIAnalysis {
  const result = { ...aiAnalysis };
  const headerRow = sampleRows[result.headerRowIndex] || [];

  // Helper to get header text for a column index
  const getHeader = (cIdx: number): string => {
    return String(headerRow[cIdx] || `Col_${cIdx}`).trim();
  };

  // Check if presentDaysCol is actually a sum of other columns
  // Rule 2: If multiplied days is a sum of other fields, present days is the component with highest digits!
  const targetMultiplierCol = result.presentDaysCol?.colIndex;
  if (targetMultiplierCol !== undefined && targetMultiplierCol !== null && targetMultiplierCol >= 0) {
    // Check formulas in sample rows for targetMultiplierCol
    for (let r = result.dataStartRowIndex; r < Math.min(sampleRows.length, result.dataStartRowIndex + 15); r++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c: targetMultiplierCol });
      const cell = sheet ? sheet[cellAddr] : null;
      if (cell && cell.f) {
        const formula = String(cell.f);
        if (/^[A-Za-z0-9_$.]+\s*\+\s*[A-Za-z0-9_$.]+/.test(formula) || /^SUM\(/i.test(formula)) {
          const cleanedFormula = formula.replace(/^SUM\(/i, "").replace(/\)$/, "");
          const parts = cleanedFormula.split(/[+,]/);
          const compCols: number[] = [];
          for (const p of parts) {
            const cleanRef = p.trim().replace(/\$/g, "");
            if (/^[A-Za-z]+\d+$/.test(cleanRef)) {
              try {
                const decoded = XLSX.utils.decode_cell(cleanRef);
                if (!compCols.includes(decoded.c) && decoded.c !== targetMultiplierCol) {
                  compCols.push(decoded.c);
                }
              } catch {}
            }
          }

          if (compCols.length >= 2) {
            // Find component with highest values
            let highestCol = compCols[0];
            let highestVal = -Infinity;
            for (const colIdx of compCols) {
              const val = Number(sampleRows[r]?.[colIdx]) || 0;
              if (val > highestVal) {
                highestVal = val;
                highestCol = colIdx;
              }
            }

            // Assign presentDaysCol to the highest component
            result.totalPaidDaysCol = {
              colIndex: targetMultiplierCol,
              originalHeader: getHeader(targetMultiplierCol),
              cleanHeader: "Total Paid Days",
              reasoning: `Composite sum column (= ${formula}) used in amount multiplication`,
            };

            result.presentDaysCol = {
              colIndex: highestCol,
              originalHeader: getHeader(highestCol),
              cleanHeader: "Present Days",
              reasoning: `Component with highest value (${highestVal}) in sum decomposition formula ${formula}`,
            };

            // Map other components to paid holidays / casual leaves
            const remainingComps = compCols.filter((c) => c !== highestCol);
            for (const rCol of remainingComps) {
              const hText = getHeader(rCol).toLowerCase();
              if (/ph|paid\s*hol|holiday|festival|national|fh|nh/i.test(hText)) {
                if (!result.paidHolidaysCol) {
                  result.paidHolidaysCol = {
                    colIndex: rCol,
                    originalHeader: getHeader(rCol),
                    cleanHeader: "Paid Holidays",
                    reasoning: `Holiday component summed into total paid days`,
                  };
                }
              } else if (/cl|casual|leave|pl|privilege|sl|sick|el/i.test(hText)) {
                if (!result.casualLeavesCol) {
                  result.casualLeavesCol = {
                    colIndex: rCol,
                    originalHeader: getHeader(rCol),
                    cleanHeader: "Casual Leaves",
                    reasoning: `Leave component summed into total paid days`,
                  };
                }
              } else {
                if (!result.otherAttendanceCols) result.otherAttendanceCols = [];
                if (!result.otherAttendanceCols.some((o) => o.colIndex === rCol)) {
                  result.otherAttendanceCols.push({
                    colIndex: rCol,
                    originalHeader: getHeader(rCol),
                    cleanHeader: getHeader(rCol) || "Leave Days",
                    reasoning: `Component summed into total paid days`,
                  });
                }
              }
            }
            break;
          }
        }
      }
    }
  }

  // Rule 1: Validate and resolve workingDaysCol (column index or divided number)
  let detectedDivisorNumber: number | null = null;
  let detectedDivisorCol: number | null = null;

  if (sheet) {
    const formulaDivisorNumbers = new Map<number, number>();
    const formulaDivisorCols = new Map<number, number>();

    for (const cellAddr of Object.keys(sheet)) {
      if (cellAddr.startsWith("!")) continue;
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;
      const formula = String(cell.f);

      const divMatches = formula.match(
        /\/\s*\(?\s*(\$?[A-Za-z]+\$?\d+|\d+(?:\.\d+)?)\s*\)?/g
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
              const targetVal = targetCell ? Number(targetCell.v) : NaN;
              if (!isNaN(targetVal) && targetVal >= 15 && targetVal <= 31) {
                const rounded = Math.round(targetVal);
                formulaDivisorNumbers.set(
                  rounded,
                  (formulaDivisorNumbers.get(rounded) || 0) + 1
                );
              } else {
                const decoded = XLSX.utils.decode_cell(operand);
                formulaDivisorCols.set(
                  decoded.c,
                  (formulaDivisorCols.get(decoded.c) || 0) + 1
                );
              }
            } catch {}
          } else {
            const num = Math.round(Number(operand));
            if (!isNaN(num) && num >= 15 && num <= 31) {
              formulaDivisorNumbers.set(
                num,
                (formulaDivisorNumbers.get(num) || 0) + 1
              );
            }
          }
        }
      }
    }

    // Arithmetic check from values if formula division was not found: (Rate * Days) / Earned
    if (
      formulaDivisorNumbers.size === 0 &&
      formulaDivisorCols.size === 0 &&
      sampleRows.length >= 2
    ) {
      for (
        let r = result.dataStartRowIndex;
        r < Math.min(sampleRows.length, result.dataStartRowIndex + 15);
        r++
      ) {
        const row = sampleRows[r];
        if (!row || !Array.isArray(row)) continue;
        const numValues: Array<{ col: number; val: number }> = [];
        for (let c = 0; c < row.length; c++) {
          const raw = row[c];
          if (raw === null || raw === undefined || raw === "") continue;
          const clean = Number(String(raw).replace(/,/g, "").trim());
          if (!isNaN(clean) && clean > 0) {
            numValues.push({ col: c, val: clean });
          }
        }
        const multCol =
          result.presentDaysCol?.colIndex ?? result.totalPaidDaysCol?.colIndex;
        const daysItems = numValues.filter(
          (it) =>
            it.val >= 1 &&
            it.val <= 31 &&
            (typeof multCol === "number" && multCol >= 0
              ? it.col === multCol
              : true)
        );
        const rateItems = numValues.filter((it) => it.val >= 1000);
        const earnItems = numValues.filter(
          (it) =>
            it.val >= 500 &&
            (result.earnings.length > 0
              ? result.earnings.some((e) => e.colIndex === it.col)
              : true)
        );

        for (const d of daysItems) {
          for (const rt of rateItems) {
            for (const en of earnItems) {
              if (
                rt.col === en.col ||
                rt.col === d.col ||
                en.col === d.col
              )
                continue;
              if (rt.val > en.val) {
                const calcDiv = Math.round((rt.val * d.val) / en.val);
                if (calcDiv >= 20 && calcDiv <= 31) {
                  const expected = (rt.val * d.val) / calcDiv;
                  if (Math.abs(expected - en.val) <= 2) {
                    formulaDivisorNumbers.set(
                      calcDiv,
                      (formulaDivisorNumbers.get(calcDiv) || 0) + 1
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    if (formulaDivisorNumbers.size > 0) {
      const sorted = Array.from(formulaDivisorNumbers.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      detectedDivisorNumber = sorted[0][0];
    } else if (formulaDivisorCols.size > 0) {
      const sorted = Array.from(formulaDivisorCols.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      detectedDivisorCol = sorted[0][0];
    }
  }

  const hasValidCol =
    typeof result.workingDaysCol?.colIndex === "number" &&
    result.workingDaysCol.colIndex >= 0;

  const hasValidNum =
    typeof result.workingDaysCol?.dividedNumber === "number" &&
    result.workingDaysCol.dividedNumber > 0;

  if (hasValidCol) {
    if (!hasValidNum) {
      const sampleVal = Number(
        sampleRows[result.dataStartRowIndex]?.[result.workingDaysCol!.colIndex!]
      );
      result.workingDaysCol!.dividedNumber =
        detectedDivisorNumber ??
        (!isNaN(sampleVal) && sampleVal > 0 ? sampleVal : null);
    }
  } else if (hasValidNum) {
    result.workingDaysCol!.colIndex = null;
    result.workingDaysCol!.cleanHeader =
      result.workingDaysCol!.cleanHeader || "Working Days";
  } else if (detectedDivisorNumber !== null) {
    // Check if there is an explicit column for working days in header row
    let foundCol: number | null = null;
    for (let c = 0; c < (headerRow.length || 0); c++) {
      const hText = getHeader(c).toLowerCase();
      if (/work|month|w\.?day|std|calendar|total\s*days/i.test(hText)) {
        foundCol = c;
        break;
      }
    }
    result.workingDaysCol = {
      colIndex: foundCol,
      originalHeader: foundCol !== null ? getHeader(foundCol) : null,
      cleanHeader: "Working Days",
      dividedNumber: detectedDivisorNumber,
      reasoning: `Divided number ${detectedDivisorNumber} extracted from amount fields as working days divisor`,
    };
  } else if (detectedDivisorCol !== null) {
    const colVal =
      Number(sampleRows[result.dataStartRowIndex]?.[detectedDivisorCol]) || null;
    result.workingDaysCol = {
      colIndex: detectedDivisorCol,
      originalHeader: getHeader(detectedDivisorCol),
      cleanHeader: "Working Days",
      dividedNumber: colVal,
      reasoning: `Detected column [C${detectedDivisorCol}] as divisor in amount formulas`,
    };
  }

  // Rule 3: If otHoursCol was not detected, check for columns multiplied into OT Amount
  if (!result.otHoursCol) {
    for (let c = 0; c < (headerRow.length || 0); c++) {
      const hText = getHeader(c).toLowerCase();
      if (/^ot\s*hrs?$|^ot\s*hours?$|^overtime\s*hours?$|^o\.?t\.?\s*\(?hrs?\)?$/i.test(hText)) {
        // Confirm values look like hour counts (e.g. 0 to 100)
        let looksLikeHours = true;
        for (let r = result.dataStartRowIndex; r < Math.min(sampleRows.length, result.dataStartRowIndex + 10); r++) {
          const val = Number(sampleRows[r]?.[c]);
          if (!isNaN(val) && val > 200) {
            looksLikeHours = false;
            break;
          }
        }
        if (looksLikeHours) {
          result.otHoursCol = {
            colIndex: c,
            originalHeader: getHeader(c),
            cleanHeader: "OT Hours",
            reasoning: `Identified from header and numerical hour values`,
          };
          break;
        }
      }
    }
  }

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
  defaultWorkingDays,
}: {
  sheet: XLSX.WorkSheet;
  sheetRowIdx: number;
  row: any[];
  aiAnalysis: PayrollAIAnalysis;
  defaultWorkingDays: number | null;
}): number | string {
  // 1. If there is a valid Working Days column in the source sheet, use row value if present
  if (
    typeof aiAnalysis.workingDaysCol?.colIndex === "number" &&
    aiAnalysis.workingDaysCol.colIndex >= 0
  ) {
    const rawVal = row[aiAnalysis.workingDaysCol.colIndex];
    if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== "") {
      const num = Number(String(rawVal).replace(/,/g, "").trim());
      if (!isNaN(num) && num > 0) {
        return Math.round(num * 100) / 100;
      }
    }
  }

  // 2. Inspect formulas in this specific row (sheetRowIdx) in sheet
  if (sheet && sheetRowIdx >= 0) {
    const checkCols: number[] = [];
    // Prioritize earnings columns
    for (const earn of aiAnalysis.earnings) {
      if (typeof earn.colIndex === "number" && earn.colIndex >= 0) {
        checkCols.push(earn.colIndex);
      }
    }
    // Also check gross column
    if (
      typeof aiAnalysis.grossCol?.colIndex === "number" &&
      aiAnalysis.grossCol.colIndex >= 0 &&
      !checkCols.includes(aiAnalysis.grossCol.colIndex)
    ) {
      checkCols.push(aiAnalysis.grossCol.colIndex);
    }
    // Check all other non-empty columns in row as fallback
    for (let c = 0; c < row.length; c++) {
      if (!checkCols.includes(c)) checkCols.push(c);
    }

    for (const c of checkCols) {
      const cellAddr = XLSX.utils.encode_cell({ r: sheetRowIdx, c });
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;
      const formula = String(cell.f);

      const divMatches = formula.match(
        /\/\s*\(?\s*(\$?[A-Za-z]+\$?\d+|\d+(?:\.\d+)?)\s*\)?/g
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
              const targetVal = targetCell ? Number(targetCell.v) : NaN;
              if (!isNaN(targetVal) && targetVal >= 15 && targetVal <= 31) {
                return Math.round(targetVal);
              }
            } catch {}
          } else {
            const num = Math.round(Number(operand));
            if (!isNaN(num) && num >= 15 && num <= 31) {
              return num;
            }
          }
        }
      }
    }
  }

  // 3. Row-level arithmetic check: (Rate * Days) / Earned
  const daysCol =
    aiAnalysis.presentDaysCol?.colIndex ?? aiAnalysis.totalPaidDaysCol?.colIndex;
  let daysVal =
    typeof daysCol === "number" && daysCol >= 0
      ? Number(String(row[daysCol] ?? "").replace(/,/g, "").trim())
      : NaN;

  if (isNaN(daysVal) || daysVal <= 0 || daysVal > 31) {
    for (let c = 0; c < row.length; c++) {
      const val = Number(String(row[c] ?? "").replace(/,/g, "").trim());
      if (!isNaN(val) && val >= 1 && val <= 31) {
        daysVal = val;
        break;
      }
    }
  }

  if (!isNaN(daysVal) && daysVal > 0) {
    for (const earn of aiAnalysis.earnings) {
      const earnVal = Number(String(row[earn.colIndex] ?? "").replace(/,/g, "").trim());
      if (isNaN(earnVal) || earnVal <= 0) continue;

      for (let c = 0; c < row.length; c++) {
        if (c === earn.colIndex || c === daysCol) continue;
        const rateVal = Number(String(row[c] ?? "").replace(/,/g, "").trim());
        if (!isNaN(rateVal) && rateVal > earnVal && rateVal >= 1000) {
          const calcDiv = Math.round((rateVal * daysVal) / earnVal);
          if (calcDiv >= 20 && calcDiv <= 31) {
            const expected = (rateVal * daysVal) / calcDiv;
            if (Math.abs(expected - earnVal) <= 2) {
              return calcDiv;
            }
          }
        }
      }
    }
  }

  // 4. Fallback to defaultWorkingDays
  if (typeof defaultWorkingDays === "number" && defaultWorkingDays > 0) {
    return defaultWorkingDays;
  }

  return 30;
}

/**
 * Cleans numeric values from spreadsheet cells.
 */
function cleanNumericCellValue(val: any): number | string {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") {
    if (isNaN(val)) return 0;
    return Math.round(val * 100) / 100;
  }
  const str = String(val).replace(/,/g, "").trim();
  if (str === "") return 0;
  const parsed = Number(str);
  if (!isNaN(parsed)) {
    return Math.round(parsed * 100) / 100;
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
  codeVal: string
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
 *
 * Excludes fixed monthly master rates (e.g. Basic 20,000) and other non-wage metadata.
 * Uses GEMINI_MAIN for AI classification with algorithmic formula verification.
 */
export async function transformPayrollExcelAttachment(
  content: Buffer | Uint8Array,
  filename: string
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
      `Failed to decode Excel file "${filename}": ${readErr?.message || "Corrupt or invalid format"}`
    );
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error(`Excel file "${filename}" contains no sheets.`);
  }

  const newWorkbook = XLSX.utils.book_new();
  let firstSheetResult: ExcelTransformationResult | null = null;
  let totalTransformedRecordsAllSheets = 0;

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
        aiErr
      );
      // If single sheet, rethrow so failure mail is triggered
      if (sheetNames.length === 1) {
        throw new Error(
          `AI transformation failed for sheet "${sheetName}": ${aiErr?.message || String(aiErr)}`
        );
      }
      continue;
    }

    // Algorithmic validation and enrichment of attendance fields
    aiAnalysis = validateAndEnrichAttendance(aiAnalysis, sheet, sampleRows);

    // Validate that we found at least employee name or code and some payment columns
    const hasEmployeeId =
      aiAnalysis.employeeNameCol !== null || aiAnalysis.employeeCodeCol !== null;
    const hasPayColumns =
      aiAnalysis.earnings.length > 0 || aiAnalysis.deductions.length > 0;

    if (!hasEmployeeId && !hasPayColumns) {
      // Likely an informational or non-payroll tab (e.g. Instructions, Summary)
      continue;
    }

    // Prepare target column headers
    // Prevent collision between ESIC IP number and ESIC deduction
    const processedDeductions = aiAnalysis.deductions.map((d) => {
      let clean = d.cleanHeader.trim();
      if (clean.toUpperCase() === "ESIC" || clean.toUpperCase() === "ESI") {
        clean = "ESIC Deduction";
      }
      return {
        ...d,
        cleanHeader: clean,
      };
    });

    const grossHeader = aiAnalysis.grossCol?.originalHeader?.trim() || null;
    const netPayHeader = aiAnalysis.netPayCol?.originalHeader?.trim() || null;

    // Collect attendance columns in clean order
    const attendanceColumns: Array<{
      colIndex: number | null;
      fixedValue?: number | string | null;
      cleanHeader: string;
      category: string;
    }> = [];

    // 1. Working Days
    if (aiAnalysis.workingDaysCol) {
      const colIdx =
        typeof aiAnalysis.workingDaysCol.colIndex === "number" &&
        aiAnalysis.workingDaysCol.colIndex >= 0
          ? aiAnalysis.workingDaysCol.colIndex
          : null;
      const fixedVal =
        typeof aiAnalysis.workingDaysCol.dividedNumber === "number" &&
        aiAnalysis.workingDaysCol.dividedNumber > 0
          ? aiAnalysis.workingDaysCol.dividedNumber
          : (aiAnalysis.workingDaysCol as any).fixedValue ?? null;

      if (colIdx !== null || fixedVal !== null) {
        attendanceColumns.push({
          colIndex: colIdx,
          fixedValue: fixedVal,
          cleanHeader: aiAnalysis.workingDaysCol.cleanHeader?.trim() || "Working Days",
          category: "working_days",
        });
      }
    }

    // 2. Present Days
    if (
      aiAnalysis.presentDaysCol &&
      typeof aiAnalysis.presentDaysCol.colIndex === "number" &&
      aiAnalysis.presentDaysCol.colIndex >= 0
    ) {
      if (!attendanceColumns.some((ac) => ac.colIndex === aiAnalysis.presentDaysCol!.colIndex)) {
        attendanceColumns.push({
          colIndex: aiAnalysis.presentDaysCol.colIndex,
          cleanHeader: aiAnalysis.presentDaysCol.cleanHeader?.trim() || "Present Days",
          category: "present_days",
        });
      }
    }

    // 3. Paid Holidays
    if (
      aiAnalysis.paidHolidaysCol &&
      typeof aiAnalysis.paidHolidaysCol.colIndex === "number" &&
      aiAnalysis.paidHolidaysCol.colIndex >= 0
    ) {
      if (!attendanceColumns.some((ac) => ac.colIndex === aiAnalysis.paidHolidaysCol!.colIndex)) {
        attendanceColumns.push({
          colIndex: aiAnalysis.paidHolidaysCol.colIndex,
          cleanHeader: aiAnalysis.paidHolidaysCol.cleanHeader?.trim() || "Paid Holidays",
          category: "paid_holidays",
        });
      }
    }

    // 4. Casual Leaves
    if (
      aiAnalysis.casualLeavesCol &&
      typeof aiAnalysis.casualLeavesCol.colIndex === "number" &&
      aiAnalysis.casualLeavesCol.colIndex >= 0
    ) {
      if (!attendanceColumns.some((ac) => ac.colIndex === aiAnalysis.casualLeavesCol!.colIndex)) {
        attendanceColumns.push({
          colIndex: aiAnalysis.casualLeavesCol.colIndex,
          cleanHeader: aiAnalysis.casualLeavesCol.cleanHeader?.trim() || "Casual Leaves",
          category: "casual_leaves",
        });
      }
    }

    // 5. Other leaf attendance components (e.g. Weekly Off, Special Leave)
    if (Array.isArray(aiAnalysis.otherAttendanceCols)) {
      for (const other of aiAnalysis.otherAttendanceCols) {
        if (
          other &&
          typeof other.colIndex === "number" &&
          other.colIndex >= 0 &&
          !attendanceColumns.some((ac) => ac.colIndex === other.colIndex)
        ) {
          attendanceColumns.push({
            colIndex: other.colIndex,
            cleanHeader: other.cleanHeader?.trim() || other.originalHeader?.trim() || "Leave Days",
            category: "other_attendance",
          });
        }
      }
    }

    // 6. Total Paid Days (the composite sum column, if distinct from Present Days)
    if (
      aiAnalysis.totalPaidDaysCol &&
      typeof aiAnalysis.totalPaidDaysCol.colIndex === "number" &&
      aiAnalysis.totalPaidDaysCol.colIndex >= 0 &&
      aiAnalysis.totalPaidDaysCol.colIndex !== aiAnalysis.presentDaysCol?.colIndex &&
      !attendanceColumns.some((ac) => ac.colIndex === aiAnalysis.totalPaidDaysCol!.colIndex)
    ) {
      attendanceColumns.push({
        colIndex: aiAnalysis.totalPaidDaysCol.colIndex,
        cleanHeader: aiAnalysis.totalPaidDaysCol.cleanHeader?.trim() || "Total Paid Days",
        category: "total_paid_days",
      });
    }

    // 7. OT Hours
    if (
      aiAnalysis.otHoursCol &&
      typeof aiAnalysis.otHoursCol.colIndex === "number" &&
      aiAnalysis.otHoursCol.colIndex >= 0
    ) {
      if (!attendanceColumns.some((ac) => ac.colIndex === aiAnalysis.otHoursCol!.colIndex)) {
        attendanceColumns.push({
          colIndex: aiAnalysis.otHoursCol.colIndex,
          cleanHeader: aiAnalysis.otHoursCol.cleanHeader?.trim() || "OT Hours",
          category: "ot_hours",
        });
      }
    }

    const headers: string[] = [
      "Employee Name",
      "ESIC",
      "Code",
      "UAN",
      ...attendanceColumns.map((ac) => ac.cleanHeader),
      ...aiAnalysis.earnings.map((e) => e.cleanHeader.trim()),
      ...(grossHeader ? [grossHeader] : []),
      ...processedDeductions.map((d) => d.cleanHeader.trim()),
      ...(netPayHeader ? [netPayHeader] : []),
    ];

    // Ensure all header names are unique by appending suffix if duplicates exist
    const seenHeaders = new Map<string, number>();
    const uniqueHeaders = headers.map((hdr) => {
      const count = seenHeaders.get(hdr) || 0;
      seenHeaders.set(hdr, count + 1);
      if (count > 0) {
        return `${hdr} (${count + 1})`;
      }
      return hdr;
    });

    // Extract employee data rows
    const startRowIdx = Math.max(
      aiAnalysis.dataStartRowIndex,
      (aiAnalysis.secondaryHeaderRowIndex ?? aiAnalysis.headerRowIndex) + 1
    );

    const maxRowIdx =
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
      const esicVal =
        aiAnalysis.esicCol &&
        typeof aiAnalysis.esicCol.colIndex === "number" &&
        aiAnalysis.esicCol.colIndex >= 0
          ? cleanIdentifierValue(row[aiAnalysis.esicCol.colIndex])
          : "";
      const uanVal =
        aiAnalysis.uanCol &&
        typeof aiAnalysis.uanCol.colIndex === "number" &&
        aiAnalysis.uanCol.colIndex >= 0
          ? cleanIdentifierValue(row[aiAnalysis.uanCol.colIndex])
          : "";

      // Check for summary/total row
      if (isSummaryOrTotalRow(row, nameVal, codeVal)) {
        // Once a total row is reached, skip it
        continue;
      }

      // If both name and code are completely blank, skip empty row
      if (!nameVal && !codeVal) {
        continue;
      }

      const attendanceVals = attendanceColumns.map((ac) => {
        if (ac.category === "working_days") {
          return extractRowWorkingDays({
            sheet,
            sheetRowIdx,
            row,
            aiAnalysis,
            defaultWorkingDays:
              typeof ac.fixedValue === "number" ? ac.fixedValue : null,
          });
        }
        if (ac.colIndex !== null && ac.colIndex !== undefined && ac.colIndex >= 0) {
          const rawCell = row[ac.colIndex];
          if (rawCell !== null && rawCell !== undefined && String(rawCell).trim() !== "") {
            return cleanNumericCellValue(rawCell);
          }
          if (ac.fixedValue !== null && ac.fixedValue !== undefined) {
            return cleanNumericCellValue(ac.fixedValue);
          }
          return 0;
        }
        if (ac.fixedValue !== null && ac.fixedValue !== undefined) {
          return cleanNumericCellValue(ac.fixedValue);
        }
        return 0;
      });
      const earningVals = aiAnalysis.earnings.map((e) =>
        cleanNumericCellValue(row[e.colIndex])
      );
      const grossVal =
        aiAnalysis.grossCol &&
        typeof aiAnalysis.grossCol.colIndex === "number" &&
        aiAnalysis.grossCol.colIndex >= 0
          ? cleanNumericCellValue(row[aiAnalysis.grossCol.colIndex])
          : null;
      const deductionVals = processedDeductions.map((d) =>
        cleanNumericCellValue(row[d.colIndex])
      );
      const netPayVal =
        aiAnalysis.netPayCol &&
        typeof aiAnalysis.netPayCol.colIndex === "number" &&
        aiAnalysis.netPayCol.colIndex >= 0
          ? cleanNumericCellValue(row[aiAnalysis.netPayCol.colIndex])
          : null;

      outDataRows.push([
        nameVal,
        esicVal,
        codeVal,
        uanVal,
        ...attendanceVals,
        ...earningVals,
        ...(grossVal !== null ? [grossVal] : []),
        ...deductionVals,
        ...(netPayVal !== null ? [netPayVal] : []),
      ]);
    }

    if (outDataRows.length === 0) {
      continue;
    }

    // Assemble worksheet
    const worksheetData = [uniqueHeaders, ...outDataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Apply clean column widths
    worksheet["!cols"] = [
      { wch: 26 }, // Employee Name
      { wch: 20 }, // ESIC
      { wch: 16 }, // Code
      { wch: 20 }, // UAN
      ...attendanceColumns.map(() => ({ wch: 15 })), // Attendance columns
      ...aiAnalysis.earnings.map(() => ({ wch: 16 })),
      ...(grossHeader ? [{ wch: 18 }] : []),
      ...processedDeductions.map(() => ({ wch: 18 })),
      ...(netPayHeader ? [{ wch: 18 }] : []),
    ];

    const safeSheetName =
      sheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Transformed Payroll";
    XLSX.utils.book_append_sheet(newWorkbook, worksheet, safeSheetName);

    totalTransformedRecordsAllSheets += outDataRows.length;

    // Capture details for summary report
    const lastRow = outDataRows[outDataRows.length - 1];
    const lastRowText = lastRow
      .map((c) => String(c ?? "").trim())
      .filter(Boolean)
      .join(", ");

    if (!firstSheetResult) {
      firstSheetResult = {
        transformedBuffer: Buffer.from([]),
        transformedFilename: "",
        totalRows: worksheetData.length,
        lastRowText: lastRowText || "Empty row",
        recordsCount: outDataRows.length,
        columns: uniqueHeaders,
        details: {
          sheetName,
          employeeNameCol: aiAnalysis.employeeNameCol?.originalHeader || null,
          employeeCodeCol: aiAnalysis.employeeCodeCol?.originalHeader || null,
          esicCol: aiAnalysis.esicCol?.originalHeader || null,
          uanCol: aiAnalysis.uanCol?.originalHeader || null,
          attendance: attendanceColumns.map((ac) => {
            if (ac.category === "working_days") {
              const wdColIdx = uniqueHeaders.indexOf(ac.cleanHeader);
              if (wdColIdx >= 0) {
                const valsSet = new Set(
                  outDataRows
                    .map((r) => r[wdColIdx])
                    .filter((v) => v !== 0 && v !== "" && v !== null && v !== undefined)
                );
                const vals = Array.from(valsSet);
                if (vals.length > 0) {
                  return `${ac.cleanHeader} (${vals.join(", ")})`;
                }
              }
              return ac.cleanHeader;
            }
            return ac.colIndex === null && ac.fixedValue
              ? `${ac.cleanHeader} (${ac.fixedValue})`
              : ac.cleanHeader;
          }),
          earnings: aiAnalysis.earnings.map((e) => e.cleanHeader),
          grossCol: grossHeader,
          deductions: processedDeductions.map((d) => d.cleanHeader),
          netPayCol: netPayHeader,
          excludedRateColumns: (aiAnalysis.excludedRateColumns || []).map(
            (c) => `${c.header} (${c.reason})`
          ),
        },
      };
    }
  }

  if (newWorkbook.SheetNames.length === 0 || !firstSheetResult) {
    throw new Error(
      `No valid employee payroll data could be extracted from "${filename}". Please check that the spreadsheet contains employee records with attendance-calculated earnings and deductions.`
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

  return firstSheetResult;
}
