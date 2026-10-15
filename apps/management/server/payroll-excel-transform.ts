import path from "node:path";
import { GEMINI_LITE, GEMINI_MAIN } from "@/utils/ai/chat/constant";
import { google as googleAi } from "@ai-sdk/google";
import { z } from "@canny_ecosystem/utils";
import { generateObject } from "ai";
import * as XLSX from "xlsx";

// -----------------------------------------------------------------------------
// TYPES & RESULT INTERFACES
// -----------------------------------------------------------------------------

export interface SheetTransformationDetails {
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
  removedColumns: Array<{ header: string; reason: string }>;
}

export interface SheetPayrollJsonResult {
  sheetName: string;
  totalRows: number;
  recordsCount: number;
  columns: string[];
  records: Array<Record<string, string | number>>;
  details: SheetTransformationDetails;
  totals: Record<string, number>;
  lastRowText: string;
  previewRows?: (string | number)[][];
}

export interface PayrollTransformJsonResult {
  success: boolean;
  filename: string;
  totalRecords: number;
  recordsCount: number;
  totalRows: number;
  columns: string[];
  records: Array<Record<string, string | number>>;
  details: SheetTransformationDetails;
  totals: Record<string, number>;
  sheets: SheetPayrollJsonResult[];
  lastRowText: string;
  transformedBuffer?: Buffer;
  transformedFilename?: string;
  previewRows?: (string | number)[][];
}

// Backward-compatibility aliases
export type ExcelTransformationResult = PayrollTransformJsonResult;
export type SheetTransformationResult = SheetPayrollJsonResult;

// -----------------------------------------------------------------------------
// STRICTLY ALLOWED CANONICAL COLUMNS
// -----------------------------------------------------------------------------

export const STANDARD_ALLOWED_COLUMNS = new Set<string>([
  // Identity (required: employee_name, uan_no)
  "employee_name",
  "employee_code",
  "uan_no",
  "esic_no",

  // Attendance
  "working_days",
  "present_days",
  "ph",
  "pl",
  "cl",
  "ml",
  "el",
  "ot_hours",
  "ot_days",

  // Earnings (required: basic)
  "basic",
  "da",
  "hra",
  "lta",
  "ph_wage",
  "ot_amount",
  "allowance",
  "fixed_allowance",
  "other_allowance",
  "conveyance_allowance",
  "transportation_allowance",
  "el_amount",
  "leave_salary",
  "bonus",
  "gross",

  // Deductions
  "pf",
  "esic",
  "pt",
  "lwf",
  "deduction",

  // Advance & Expense
  "advance",
  "expense",

  // Payment
  "net_pay",
]);

export const REQUIRED_TRANSFORMED_COLUMNS = new Set<string>([
  "employee_name",
  "uan_no",
  "working_days",
  "present_days",
  "basic",
  "net_pay",
]);

// -----------------------------------------------------------------------------
// AI DECISION SCHEMA
// -----------------------------------------------------------------------------

const SheetStructureSchema = z.object({
  headerRowIndex: z
    .number()
    .describe(
      "0-indexed row number where the main column headers are located (e.g. 0, 1, or 2).",
    ),

  secondaryHeaderRowIndex: z
    .number()
    .nullable()
    .describe(
      "0-indexed row number if headers are multi-row / stacked or if a column numbering row (1, 2, 3...) exists, else null.",
    ),

  dataStartRowIndex: z
    .number()
    .describe(
      "CRITICAL: 0-indexed row number where actual employee records begin. Must be strictly after header rows.",
    ),

  dataEndRowIndex: z
    .number()
    .nullable()
    .describe(
      "0-indexed row number where actual employee records end (immediately before summary totals or signatures). Return null if data continues to the end.",
    ),

  columnsToKeep: z
    .array(
      z.object({
        colIndex: z
          .number()
          .describe("0-indexed column index in source spreadsheet."),
        cleanHeader: z
          .string()
          .describe(
            "Standardized snake_case column name matching allowed payroll schema: employee_name, employee_code, uan_no, esic_no, working_days, present_days, ph, pl, cl, ml, el, ot_hours, ot_days, basic, da, hra, lta, ph_wage, ot_amount, allowance, fixed_allowance, other_allowance, conveyance_allowance, transportation_allowance, el_amount, leave_salary, bonus, gross, pf, esic, pt, lwf, deduction, advance, expense, net_pay, or other payment field involved in gross/net_pay calculation. STRICTLY FORBIDDEN SYNONYMS: NEVER use uan_number (use uan_no), never use esic_number (use esic_no), never use deductions/total_deduction/total_deductions (use deduction).",
          ),
        category: z
          .enum([
            "identifier",
            "attendance",
            "earning",
            "deduction",
            "gross",
            "net_pay",
            "formula_component",
          ])
          .describe("Category of this column."),
        reason: z.string().describe("Why this column is kept."),
      }),
    )
    .describe("Columns to keep matching the allowed payroll schema."),

  columnsToRemove: z
    .array(
      z.object({
        colIndex: z.number(),
        originalHeader: z.string(),
        reason: z
          .string()
          .describe(
            "Why removed: 'empty', 'unused_metadata' (e.g. Father Name), 'rate_column' (e.g. daily wage rate 651), or 'unreferenced'.",
          ),
      }),
    )
    .default([])
    .describe(
      "Columns to remove: empty columns, rate/multiplier columns, unreferenced metadata.",
    ),

  transformationSummary: z
    .string()
    .describe(
      "Brief explanation of how the header row and data rows were detected and how columns were matched.",
    ),
});

export type PayrollAIAnalysis = z.infer<typeof SheetStructureSchema>;

// -----------------------------------------------------------------------------
// SYSTEM PROMPT
// -----------------------------------------------------------------------------

const SYSTEM_TRANSFORMATION_PROMPT = `You are an expert HR and Payroll AI Data Transformation specialist.
Your task is to analyze an incoming client salary/payroll spreadsheet, detect the exact header row, identify real employee data rows, match columns ONLY to the strictly allowed canonical payroll columns, and remove all unused, unnecessary, empty, and rate/multiplier columns.

CRITICAL RULES & ALLOWED COLUMNS:

1. HEADER & DATA DETECTION:
   - Identify the exact row where column titles are located (headerRowIndex).
   - If there is a sub-header row or a column numbering row (e.g. '1', '2', '3', '4', '5'...) printed below headers, record secondaryHeaderRowIndex.
   - dataStartRowIndex MUST be the EXACT 0-indexed row where the first ACTUAL HUMAN EMPLOYEE record begins. NEVER treat column numbering rows or header title rows as employee data!

2. STRICTLY ALLOWED COLUMNS:
   You may ONLY map kept columns to the following allowed names:
   - Identity:
     * employee_name (required)
     * employee_code (can be name or number, min 2 chars)
     * uan_no (required, can be name or number, min 2 chars) - STRICT: NEVER use 'uan_number' or 'uan'. ALWAYS map to 'uan_no'.
     * esic_no (can be name or number, min 2 chars) - STRICT: NEVER use 'esic_number', 'esi_no', or 'esi_number'. ALWAYS map to 'esic_no'.
   - Attendance:
     * working_days
     * present_days (required)
     * ph, pl, cl, ml, el
     * ot_hours OR ot_days (ONLY ONE! Required if ot_amount is present):
       - If column header indicates hours (e.g. 'OT Hrs', 'Hours'), map to ot_hours.
       - If column header indicates days (e.g. 'OT Days', 'Days'), map to ot_days.
       - If unlabelled or just 'OT', check formula and values: values > 31 or divided by 8 are ot_hours; values <= 31 are ot_days.
   - Attendance Rules for General Days:
     * If two attendance columns of same/similar name exist (excluding leaves ph/cl/etc. and ot), the 1st is working_days, the 2nd is present_days.
     * If only ONE general attendance column exists, it will always be present_days.
   - Earnings:
     * basic (required), da, hra, lta, ph_wage, ot_amount, allowance, fixed_allowance, other_allowance, conveyance_allowance, transportation_allowance, el_amount, leave_salary, bonus, gross
   - Allowance Matching Rules:
     * Specific Allowance Names:
       - Conveyance / Conv / Travel -> conveyance_allowance
       - Transport / Transportation -> transportation_allowance
       - Fixed allowance -> fixed_allowance
       - Other allowance -> other_allowance
     * Single Allowance Rule:
       - If there is only one allowance column in the spreadsheet of any name, match by specific name first (conveyance, transportation, fixed, other); if it doesn't match those specific names (e.g. 'Allowance', 'Special Allowance', 'Spl All', 'Site Allowance'), map it to allowance.
     * Multiple Allowance Rule:
       - Match specific names first; any generic/unmatched allowances map to allowance, then other_allowance.
   - Earned Leave (EL) Payment:
     * EL wages / encashment / EL amount columns (money amounts, not attendance days) map to el_amount (earning).
   - Deductions:
     * pf, esic, pt, lwf, deduction
     * STRICT DEDUCTION RULE: NEVER use synonyms like 'deductions', 'total_deduction', 'total_deductions', or 'total_ded'. Map ANY total deduction or deduction summary column STRICTLY to 'deduction'. Only 'deduction' is allowed.
   - Special:
     * advance, expense (figure out whether earning or deduction based on calculation involvement in gross / net_pay: subtracted in net_pay -> deduction; added -> earning)
   - Payment:
     * net_pay
   - Other Payment Fields:
     * ONLY allow an additional payment field if it participates directly in gross or net_pay formula calculation and does not fit the standard names.

3. COLUMNS TO REMOVE (NEVER KEEP):
   - All empty columns (where all values across rows are blank or zero).
   - Wage rate / daily rate / basic rate columns (e.g. daily wage rate 651, 693, multipliers, divisors) - these are NOT wage earnings, they are formula inputs and must be removed!
   - Personal non-payment metadata: Father Name, Mother Name, Gender, Bank IFSC, PAN, Address, Remarks, Serial No.

4. STATIC CONSTRAINTS ENFORCEMENT:
   - All format validation (name, code/esic/uan can be name or number with min 2 len), range checks (attendance 0-31, ot_hours 0-99, amounts 0-99999), and basic divisor calculations are enforced by static functions.`;

// -----------------------------------------------------------------------------
// FACTUAL EXTRACTION ENGINE (Formulas, Columns, Names, Values)
// -----------------------------------------------------------------------------

interface ExtractedColInfo {
  colIndex: number;
  colLetter: string;
  headers: string[];
  sampleValues: any[];
  isNumeric: boolean;
  minNum: number | null;
  maxNum: number | null;
  formulas: string[];
  isUsedInFormulas: boolean;
}

interface FactSummary {
  columns: ExtractedColInfo[];
  formulaReferencedColIndices: Set<number>;
  formulaInsightLines: string[];
  formattedTable: string;
}

function extractSheetFacts(
  sheet: XLSX.WorkSheet,
  sampleRows: any[][],
): FactSummary {
  const maxCols = sampleRows.reduce(
    (max, r) => (Array.isArray(r) ? Math.max(max, r.length) : max),
    0,
  );

  const formulaReferencedColIndices = new Set<number>();
  const formulaInsightLines: string[] = [];
  const formulaMap = new Map<number, string[]>();

  // 1. Scan sheet for cell formulas and build dependency graph
  if (sheet) {
    for (const cellAddr of Object.keys(sheet)) {
      if (cellAddr.startsWith("!")) continue;
      const cell = sheet[cellAddr];
      if (!cell || !cell.f) continue;

      try {
        const decoded = XLSX.utils.decode_cell(cellAddr);
        formulaReferencedColIndices.add(decoded.c);

        const fStr = String(cell.f).trim();
        const existing = formulaMap.get(decoded.c) || [];
        if (!existing.includes(fStr) && existing.length < 3) {
          existing.push(fStr);
          formulaMap.set(decoded.c, existing);
        }

        const cellRefs = fStr.match(
          /([$]?[A-Za-z]+[$]?\d+)(?::([$]?[A-Za-z]+[$]?\d+))?/g,
        );
        if (cellRefs) {
          for (const ref of cellRefs) {
            if (ref.includes(":")) {
              const [startRef, endRef] = ref.split(":");
              try {
                const startCell = XLSX.utils.decode_cell(
                  startRef.replace(/\$/g, ""),
                );
                const endCell = XLSX.utils.decode_cell(
                  endRef.replace(/\$/g, ""),
                );
                for (
                  let col = Math.min(startCell.c, endCell.c);
                  col <= Math.max(startCell.c, endCell.c);
                  col++
                ) {
                  formulaReferencedColIndices.add(col);
                }
              } catch {}
            } else {
              try {
                const singleCell = XLSX.utils.decode_cell(
                  ref.replace(/\$/g, ""),
                );
                formulaReferencedColIndices.add(singleCell.c);
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  // 2. Build column-by-column inventory
  const columns: ExtractedColInfo[] = [];

  for (let c = 0; c < maxCols; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    const headers: string[] = [];

    for (let r = 0; r < Math.min(3, sampleRows.length); r++) {
      const val = sampleRows[r]?.[c];
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        headers.push(String(val).trim());
      }
    }

    const sampleVals: any[] = [];
    let numCount = 0;
    let minNum: number | null = null;
    let maxNum: number | null = null;

    for (let r = 0; r < Math.min(sampleRows.length, 30); r++) {
      const raw = sampleRows[r]?.[c];
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        sampleVals.push(raw);
        const cleanStr = String(raw).replace(/,/g, "").trim();
        const num = Number(cleanStr);
        if (!Number.isNaN(num)) {
          numCount++;
          if (minNum === null || num < minNum) minNum = num;
          if (maxNum === null || num > maxNum) maxNum = num;
        }
      }
    }

    const isNumeric =
      sampleVals.length > 0 && numCount / sampleVals.length > 0.6;
    const formulas = formulaMap.get(c) || [];
    const isUsedInFormulas = formulaReferencedColIndices.has(c);

    if (formulas.length > 0) {
      formulaInsightLines.push(
        `Col ${c} [${colLetter}] has formula: [${formulas.map((f) => `=${f}`).join(", ")}]`,
      );
    }

    columns.push({
      colIndex: c,
      colLetter,
      headers,
      sampleValues: sampleVals.slice(0, 6),
      isNumeric,
      minNum,
      maxNum,
      formulas,
      isUsedInFormulas,
    });
  }

  const colLines = columns.map((col) => {
    const headerDisplay =
      col.headers.length > 0 ? col.headers.join(" > ") : "(Empty / No Header)";
    const samplesDisplay =
      col.sampleValues.length > 0 ? JSON.stringify(col.sampleValues) : "[]";
    const rangeDisplay =
      col.isNumeric && col.minNum !== null && col.maxNum !== null
        ? ` | Range: [${col.minNum} to ${col.maxNum}]`
        : "";
    const formulaDisplay = col.isUsedInFormulas ? " | ★ Used In Formulas" : "";

    return `- Col ${col.colIndex} [${col.colLetter}]: Header: "${headerDisplay}" | Samples: ${samplesDisplay}${rangeDisplay}${formulaDisplay}`;
  });

  return {
    columns,
    formulaReferencedColIndices,
    formulaInsightLines,
    formattedTable: colLines.join("\n"),
  };
}

// -----------------------------------------------------------------------------
// STATIC VALIDATION & CONSTRAINT FUNCTIONS
// -----------------------------------------------------------------------------

export function normHeader(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export const HEADER_KEYWORDS = new Set([
  "EMPCODE",
  "EMPID",
  "EMPLOYEECODE",
  "STAFFID",
  "CARDNO",
  "CODE",
  "UANNO",
  "UAN",
  "PFUAN",
  "ESICNO",
  "ESIC",
  "ESINO",
  "ESI",
  "IPNO",
  "EMPLOYEENAME",
  "NAMEOFEMPLOYEE",
  "NAME",
  "STAFFNAME",
  "SRNO",
  "SLNO",
  "SNO",
  "SERIALNO",
  "BASIC",
  "HRA",
  "GROSS",
  "NETPAY",
  "EARNINGS",
  "DEDUCTIONS",
  "PRESENTDAYS",
  "WORKINGDAYS",
]);

/**
 * Validates and cleans employee name:
 * - Constraint: valid human name string, min 2 chars, letters required.
 * - Rejects numbers, sequence numbers, header keywords, and summary words.
 */
export function validateAndCleanName(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s.length < 2) return null;
  if (!/[a-zA-Z\u00C0-\u024F\u0900-\u0D7F]/.test(s)) return null;
  if (/^[\d\s().,\-_/]+$/.test(s)) return null;
  const norm = normHeader(s);
  if (HEADER_KEYWORDS.has(norm)) return null;
  const lower = s.toLowerCase();
  if (
    lower === "total" ||
    lower === "grand total" ||
    lower === "sub total" ||
    lower === "totals" ||
    lower.startsWith("total ") ||
    lower.startsWith("grand total")
  ) {
    return null;
  }
  return s;
}

/**
 * Validates and cleans employee code:
 * - Constraint: can be name/text as well as number, minimum 2 in length.
 * - Cleans trailing '.0' (e.g. 101.0 -> 101).
 */
export function validateAndCleanCode(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  let s = String(val).trim();
  if (/^\d+\.0$/.test(s)) {
    s = s.replace(/\.0$/, "");
  }
  if (s === "") return null;
  if (s.length < 2) return null;
  const norm = normHeader(s);
  if (HEADER_KEYWORDS.has(norm)) return null;
  return s;
}

/**
 * Validates and cleans UAN number:
 * - Constraint: can be name/text as well as number, minimum 2 in length.
 * - Cleans trailing '.0' and trims whitespace.
 */
export function validateAndCleanUan(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  let s = String(val).trim();
  if (/^\d+\.0$/.test(s)) {
    s = s.replace(/\.0$/, "");
  }
  if (s === "") return null;
  if (s.length < 2) return null;
  const norm = normHeader(s);
  if (HEADER_KEYWORDS.has(norm)) return null;
  return s;
}

/**
 * Validates and cleans ESIC number:
 * - Constraint: can be name/text as well as number, minimum 2 in length (or empty / N/A).
 * - Cleans trailing '.0' and whitespace.
 */
export function validateAndCleanEsic(val: unknown): {
  isValid: boolean;
  value: string;
} {
  if (val === null || val === undefined) return { isValid: true, value: "" };
  let s = String(val).trim();
  if (/^\d+\.0$/.test(s)) {
    s = s.replace(/\.0$/, "");
  }
  const lower = s.toLowerCase();
  if (
    lower === "" ||
    lower === "na" ||
    lower === "n/a" ||
    lower === "#n/a" ||
    lower === "n.a." ||
    lower === "nil" ||
    lower === "none" ||
    lower === "-" ||
    lower === "--" ||
    lower === "0"
  ) {
    return { isValid: true, value: "" };
  }
  const norm = normHeader(s);
  if (HEADER_KEYWORDS.has(norm)) {
    return { isValid: false, value: "" };
  }
  if (s.length >= 2) {
    return { isValid: true, value: s };
  }
  return { isValid: false, value: "" };
}

/**
 * Validates and cleans attendance days (working_days, present_days, ph, pl, cl, ml, el, ot_days):
 * - Constraint: between 0 and 31.
 */
export function cleanAttendanceDaysValue(val: unknown): number | "" {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(String(val).replace(/,/g, "").trim());
  if (!Number.isNaN(num) && num >= 0 && num <= 31) {
    return Math.round(num * 1000) / 1000;
  }
  return "";
}

/**
 * Validates and cleans OT hours:
 * - Constraint: between 0 and 99.
 */
export function cleanOtHoursValue(val: unknown): number | "" {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(String(val).replace(/,/g, "").trim());
  if (!Number.isNaN(num) && num >= 0 && num <= 99) {
    return Math.round(num * 1000) / 1000;
  }
  return "";
}

/**
 * Validates and cleans all payment amounts:
 * - Constraint: between 0 and 99999.
 */
export function cleanAmountCellValue(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  let num: number;
  if (typeof val === "number") {
    num = Number.isNaN(val) ? 0 : Math.round(val);
  } else {
    const str = String(val).replace(/,/g, "").trim();
    if (str === "") return 0;
    const parsed = Number(str);
    num = Number.isNaN(parsed) ? 0 : Math.round(parsed);
  }
  if (num < 0 || num > 99999) {
    return 0;
  }
  return num;
}

/**
 * Statically extracts working days divisor from basic wages formula:
 * Looks for direct divisors e.g. / 26, / 30, / 31 or cell references e.g. /$X$4.
 */
export function extractBasicDivisor(
  sheet: XLSX.WorkSheet,
  basicColIdx: number,
): number | null {
  if (!sheet || basicColIdx < 0) return null;
  const colLetter = XLSX.utils.encode_col(basicColIdx);

  for (let r = 1; r <= 100; r++) {
    const cell = sheet[colLetter + r];
    if (cell?.f) {
      const fStr = String(cell.f);

      // 1. Check cell reference divisor: e.g. /$X$4 or /X4
      const cellRefMatches = fStr.match(/\/\s*([$]?[A-Za-z]+[$]?\d+)/g);
      if (cellRefMatches) {
        for (const m of cellRefMatches) {
          const rawRef = m.replace(/^\/\s*/, "").replace(/\$/g, "");
          const targetCell = sheet[rawRef];
          if (
            targetCell &&
            (targetCell.v !== undefined || targetCell.w !== undefined)
          ) {
            const num = Number(
              targetCell.v !== undefined ? targetCell.v : targetCell.w,
            );
            if (!Number.isNaN(num) && num >= 26 && num <= 31) {
              return num;
            }
          }
        }
      }

      // 2. Check literal number divisor: e.g. / 26, /30, /31
      const numMatches = fStr.match(/\/\s*(\d{1,2}(?:\.\d+)?)/g);
      if (numMatches) {
        for (const m of numMatches) {
          const num = Number(m.replace(/^\/\s*/, ""));
          if (!Number.isNaN(num) && num >= 26 && num <= 31) {
            return num;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Resolves overtime column from ot_amount formula:
 * Checks whether formula divides by 8 (ot_hours) or multiplies days (ot_days).
 */
export function resolveOtColumnFromFormula(
  sheet: XLSX.WorkSheet,
  otAmountColIdx: number,
  factSummary: FactSummary,
): { colIndex: number; header: "ot_hours" | "ot_days" } | null {
  if (!sheet || otAmountColIdx < 0) return null;
  const colLetter = XLSX.utils.encode_col(otAmountColIdx);
  const referencedCols = new Set<number>();
  let hasHourDivisor = false;

  for (let r = 1; r <= 100; r++) {
    const cell = sheet[colLetter + r];
    if (cell?.f) {
      const fStr = String(cell.f);
      if (/\/\s*8(?:\.0)?\b/.test(fStr)) {
        hasHourDivisor = true;
      }
      const matches = fStr.match(/([$]?[A-Za-z]+[$]?\d+)/g);
      if (matches) {
        for (const m of matches) {
          try {
            const dec = XLSX.utils.decode_cell(m.replace(/\$/g, ""));
            referencedCols.add(dec.c);
          } catch {}
        }
      }
    }
  }

  for (const colIdx of referencedCols) {
    if (colIdx === otAmountColIdx) continue;
    const colFact = factSummary.columns[colIdx];
    if (!colFact) continue;

    const headerStr = (colFact.headers || []).join(" ").toLowerCase();
    const isHoursHeader = /hour|hr|hrs/.test(headerStr);
    const isDaysHeader = /day|days/.test(headerStr);

    let hasValAbove31 = false;
    let hasValidAttendanceNum = false;
    for (const v of colFact.sampleValues) {
      const num = Number(String(v).replace(/,/g, ""));
      if (!Number.isNaN(num) && num > 0) {
        hasValidAttendanceNum = true;
        if (num > 31 && num <= 99) {
          hasValAbove31 = true;
        }
      }
    }

    if (isHoursHeader) return { colIndex: colIdx, header: "ot_hours" };
    if (isDaysHeader) return { colIndex: colIdx, header: "ot_days" };

    if (hasValAbove31 || hasHourDivisor) {
      return { colIndex: colIdx, header: "ot_hours" };
    }
    if (
      hasValidAttendanceNum &&
      (colFact.maxNum === null || colFact.maxNum <= 31)
    ) {
      return { colIndex: colIdx, header: "ot_days" };
    }
  }

  return null;
}

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
  return !Number.isNaN(num) && num === 0;
}

function isSummaryOrTotalRow(row: any[]): boolean {
  for (const cell of row) {
    if (cell !== null && cell !== undefined && String(cell).trim() !== "") {
      const lower = String(cell).trim().toLowerCase();
      if (
        lower === "total" ||
        lower === "grand total" ||
        lower === "sub total" ||
        lower === "totals" ||
        lower.startsWith("total ") ||
        lower.startsWith("grand total")
      ) {
        return true;
      }
      break;
    }
  }
  return false;
}

export function getCanonicalHeaderPriority(
  header: string,
  category: string,
  originalColIdx: number,
): number {
  switch (header) {
    // Identity
    case "employee_name":
      return 10;
    case "employee_code":
      return 20;
    case "uan_no":
      return 30;
    case "esic_no":
      return 40;
    // Attendance
    case "working_days":
      return 50;
    case "present_days":
      return 52;
    case "ph":
      return 54;
    case "pl":
      return 55;
    case "cl":
      return 56;
    case "ml":
      return 57;
    case "el":
      return 58;
    case "ot_hours":
    case "ot_days":
      return 60;
    // Earnings
    case "basic":
      return 70;
    case "da":
      return 72;
    case "hra":
      return 74;
    case "lta":
      return 76;
    case "ph_wage":
      return 78;
    case "ot_amount":
      return 80;
    case "allowance":
      return 82;
    case "fixed_allowance":
      return 83;
    case "other_allowance":
      return 84;
    case "conveyance_allowance":
      return 85;
    case "transportation_allowance":
      return 86;
    case "el_amount":
      return 87;
    case "leave_salary":
      return 88;
    case "bonus":
      return 89;
    case "gross":
      return 95;
    // Deductions
    case "pf":
      return 100;
    case "esic":
      return 102;
    case "pt":
      return 104;
    case "lwf":
      return 106;
    case "deduction":
      return 108;
    // Payment
    case "net_pay":
      return 120;
    default:
      if (category === "earning") return 88 + (originalColIdx % 6);
      if (category === "deduction") return 110 + (originalColIdx % 6);
      return 130 + (originalColIdx % 20);
  }
}

interface KeptColumnDef {
  colIndex: number;
  header: string;
  category: string;
  isSynthesized?: boolean;
  synthesizedDivisor?: number | null;
}

function resolveAttendanceColumns(
  cols: Array<{ colIndex: number; cleanHeader: string; category: string }>,
  sheet: XLSX.WorkSheet,
  basicColIdx: number,
): KeptColumnDef[] {
  const result: KeptColumnDef[] = [];
  const generalAttendanceCols: Array<{
    colIndex: number;
    header: string;
    category: string;
  }> = [];

  for (const c of cols) {
    if (
      c.cleanHeader === "working_days" ||
      c.cleanHeader === "present_days" ||
      c.cleanHeader === "duty_days" ||
      c.cleanHeader === "paid_days" ||
      c.cleanHeader === "total_days" ||
      c.cleanHeader === "attendance"
    ) {
      generalAttendanceCols.push({
        colIndex: c.colIndex,
        header: c.cleanHeader,
        category: "attendance",
      });
    } else {
      result.push({
        colIndex: c.colIndex,
        header: c.cleanHeader,
        category: c.category,
      });
    }
  }

  // Sort candidate general attendance columns by sheet column index
  generalAttendanceCols.sort((a, b) => a.colIndex - b.colIndex);

  if (generalAttendanceCols.length >= 2) {
    // First is working_days, second is present_days
    result.push({
      colIndex: generalAttendanceCols[0].colIndex,
      header: "working_days",
      category: "attendance",
    });
    result.push({
      colIndex: generalAttendanceCols[1].colIndex,
      header: "present_days",
      category: "attendance",
    });
  } else if (generalAttendanceCols.length === 1) {
    // Only one such column: it will ALWAYS be present_days!
    result.push({
      colIndex: generalAttendanceCols[0].colIndex,
      header: "present_days",
      category: "attendance",
    });
    // Figure out working_days from formula of basic with whatever it is getting divided from,
    // if that also is not present then working days will be MAX(26, present_days)
    const basicDivisor = extractBasicDivisor(sheet, basicColIdx);
    result.push({
      colIndex: -1,
      header: "working_days",
      category: "attendance",
      isSynthesized: true,
      synthesizedDivisor: basicDivisor,
    });
  } else {
    // Neither present in sheet, synthesize working_days & present_days
    const basicDivisor = extractBasicDivisor(sheet, basicColIdx);
    result.push({
      colIndex: -1,
      header: "working_days",
      category: "attendance",
      isSynthesized: true,
      synthesizedDivisor: basicDivisor,
    });
    result.push({
      colIndex: -1,
      header: "present_days",
      category: "attendance",
      isSynthesized: true,
    });
  }

  return result;
}

function resolveOvertimeColumn(
  cols: Array<{ colIndex: number; cleanHeader: string; category: string }>,
  sheet: XLSX.WorkSheet,
  otAmountColIdx: number,
  factSummary: FactSummary,
): KeptColumnDef | null {
  const existingOtCols = cols.filter(
    (c) => c.cleanHeader === "ot_hours" || c.cleanHeader === "ot_days",
  );

  if (existingOtCols.length > 0) {
    if (existingOtCols.length === 1) {
      return {
        colIndex: existingOtCols[0].colIndex,
        header: existingOtCols[0].cleanHeader,
        category: "attendance",
      };
    }
    // If both exist, pick the best one
    const hoursCol = existingOtCols.find((c) => c.cleanHeader === "ot_hours")!;
    const daysCol = existingOtCols.find((c) => c.cleanHeader === "ot_days")!;
    const hoursFact = factSummary.columns[hoursCol.colIndex];
    if (hoursFact?.maxNum !== null && (hoursFact?.maxNum ?? 0) > 31) {
      return {
        colIndex: hoursCol.colIndex,
        header: "ot_hours",
        category: "attendance",
      };
    }
    return {
      colIndex: daysCol.colIndex,
      header: "ot_days",
      category: "attendance",
    };
  }

  // If no OT column was proposed, but ot_amount is present, resolve from formula
  if (otAmountColIdx >= 0) {
    const fromFormula = resolveOtColumnFromFormula(
      sheet,
      otAmountColIdx,
      factSummary,
    );
    if (fromFormula) {
      return {
        colIndex: fromFormula.colIndex,
        header: fromFormula.header,
        category: "attendance",
      };
    }
  }

  return null;
}

function resolveAdvanceAndExpenseCategories(
  cols: KeptColumnDef[],
  sheet: XLSX.WorkSheet,
  netPayColIdx: number,
): KeptColumnDef[] {
  return cols.map((col) => {
    if (col.header !== "advance" && col.header !== "expense") {
      return col;
    }

    // Inspect net pay formula: if subtracted, categorize as deduction
    if (sheet && netPayColIdx >= 0) {
      const netLetter = XLSX.utils.encode_col(netPayColIdx);
      const colLetter = XLSX.utils.encode_col(col.colIndex);
      for (let r = 1; r <= 100; r++) {
        const cell = sheet[netLetter + r];
        if (cell?.f) {
          const fStr = String(cell.f);
          const minusPattern = new RegExp(`-\\s*[$]?${colLetter}[$]?\\d+`, "i");
          if (minusPattern.test(fStr)) {
            return { ...col, category: "deduction" };
          }
        }
      }
    }

    return {
      ...col,
      category: col.header === "advance" ? "deduction" : "earning",
    };
  });
}

function classifyAllowanceName(
  header: string,
  rawHeaders: string[],
):
  | "conveyance_allowance"
  | "transportation_allowance"
  | "fixed_allowance"
  | "other_allowance"
  | "generic" {
  const combined = `${header} ${rawHeaders.join(" ")}`.toLowerCase();

  // Conveyance
  if (/conveyance|\bconv\b|convey|travelling|travel\s*all/i.test(combined)) {
    return "conveyance_allowance";
  }

  // Transportation
  if (/transportation|\btransport\b|\btransp\b/i.test(combined)) {
    return "transportation_allowance";
  }

  // Fixed
  if (/\bfixed\b/i.test(combined)) {
    return "fixed_allowance";
  }

  // Other
  if (/\bother\b|\both\b/i.test(combined)) {
    return "other_allowance";
  }

  return "generic";
}

function isAllowanceCandidate(header: string, rawHeaders: string[]): boolean {
  if (["da", "hra", "lta"].includes(header)) return false;
  const rawStr = rawHeaders.join(" ").toLowerCase();
  if (/\bhra\b|house\s*rent/i.test(rawStr)) return false;
  if (/\bda\b|dearness/i.test(rawStr)) return false;
  if (/\blta\b|leave\s*travel/i.test(rawStr)) return false;

  const ALLOWANCE_CANONICALS = new Set([
    "allowance",
    "fixed_allowance",
    "other_allowance",
    "conveyance_allowance",
    "transportation_allowance",
  ]);
  if (ALLOWANCE_CANONICALS.has(header)) return true;
  if (header.includes("allowance") || header.includes("allw")) return true;

  if (
    /\ballowance\b|\ballw\b|\balln\b|\bconveyance\b|\bconv\b|\btransportation\b|\btransport\b/i.test(
      rawStr,
    )
  ) {
    return true;
  }
  return false;
}

function resolveAllowanceColumns(
  cols: KeptColumnDef[],
  factSummary: FactSummary,
): KeptColumnDef[] {
  const allowanceCandidates: Array<{
    col: KeptColumnDef;
    classified:
      | "conveyance_allowance"
      | "transportation_allowance"
      | "fixed_allowance"
      | "other_allowance"
      | "generic";
  }> = [];

  const nonAllowanceCols: KeptColumnDef[] = [];

  for (const c of cols) {
    const rawHeaders =
      c.colIndex >= 0 && factSummary.columns[c.colIndex]
        ? factSummary.columns[c.colIndex].headers
        : [];
    if (isAllowanceCandidate(c.header, rawHeaders)) {
      allowanceCandidates.push({
        col: c,
        classified: classifyAllowanceName(c.header, rawHeaders),
      });
    } else {
      nonAllowanceCols.push(c);
    }
  }

  if (allowanceCandidates.length === 0) {
    return cols;
  }

  const resolvedAllowances: KeptColumnDef[] = [];

  // If there's only one allowance of any name:
  // "if there's only one allowance of any name, then match by name, if you can't match it with names but it is allowance onlly then add it to allowance"
  if (allowanceCandidates.length === 1) {
    const single = allowanceCandidates[0];
    const finalHeader =
      single.classified !== "generic" ? single.classified : "allowance";
    resolvedAllowances.push({
      ...single.col,
      header: finalHeader,
      category: "earning",
    });
  } else {
    // Multiple allowance columns:
    // Sort candidates by colIndex
    allowanceCandidates.sort((a, b) => a.col.colIndex - b.col.colIndex);

    const assignedNames = new Set<string>();
    const unassigned: typeof allowanceCandidates = [];

    // Pass 1: Match specific named allowances first (conveyance, transportation, fixed, other)
    for (const cand of allowanceCandidates) {
      if (
        cand.classified !== "generic" &&
        !assignedNames.has(cand.classified)
      ) {
        assignedNames.add(cand.classified);
        resolvedAllowances.push({
          ...cand.col,
          header: cand.classified,
          category: "earning",
        });
      } else {
        unassigned.push(cand);
      }
    }

    // Pass 2: Remaining generic allowances: fallback pool in priority order
    const fallbackPool = [
      "allowance",
      "other_allowance",
      "fixed_allowance",
      "conveyance_allowance",
      "transportation_allowance",
    ];

    for (const cand of unassigned) {
      const nextAvailable = fallbackPool.find((n) => !assignedNames.has(n));
      if (nextAvailable) {
        assignedNames.add(nextAvailable);
        resolvedAllowances.push({
          ...cand.col,
          header: nextAvailable,
          category: "earning",
        });
      } else {
        resolvedAllowances.push({
          ...cand.col,
          header: cand.col.header || "allowance",
          category: "earning",
        });
      }
    }
  }

  const result = [...nonAllowanceCols, ...resolvedAllowances];
  result.sort((a, b) => a.colIndex - b.colIndex);
  return result;
}

function resolveEarnedLeaveColumns(
  cols: KeptColumnDef[],
  sheet: XLSX.WorkSheet,
  factSummary: FactSummary,
): KeptColumnDef[] {
  return cols.map((col) => {
    if (col.header === "el_amount") {
      return { ...col, category: "earning" };
    }

    const colFact =
      col.colIndex >= 0 ? factSummary.columns[col.colIndex] : null;
    const rawHeadersStr = colFact
      ? colFact.headers.join(" ").toLowerCase()
      : "";

    const isElCandidate =
      col.header === "el" ||
      /\b(el|earned\s*leave)\b/i.test(col.header) ||
      /\b(el|earned\s*leave)\b/i.test(rawHeadersStr);

    if (isElCandidate) {
      const hasAmountKeyword =
        /\b(amount|amt|wage|wages|pay|encash|encashment|rate|rs|rupee|payout)\b/i.test(
          rawHeadersStr,
        ) ||
        /\b(amount|amt|wage|wages|pay|encash|encashment)\b/i.test(col.header);

      const hasValuesOver31 =
        colFact?.maxNum !== null && (colFact?.maxNum ?? 0) > 31;

      let hasMoneyFormula = false;
      if (sheet && col.colIndex >= 0) {
        const colLetter = XLSX.utils.encode_col(col.colIndex);
        for (let r = 1; r <= 30; r++) {
          const cell = sheet[colLetter + r];
          if (cell?.f) {
            const fStr = String(cell.f).toLowerCase();
            if (/\*|\/26|\/30/.test(fStr)) {
              hasMoneyFormula = true;
              break;
            }
          }
        }
      }

      if (hasAmountKeyword || hasValuesOver31 || hasMoneyFormula) {
        return {
          ...col,
          header: "el_amount",
          category: "earning",
        };
      }
    }

    return col;
  });
}

function isPaymentComponentInFormula(
  colIndex: number,
  sheet: XLSX.WorkSheet,
  grossColIdx: number,
  netPayColIdx: number,
  factSummary: FactSummary,
): boolean {
  if (colIndex < 0 || !sheet) return false;
  const colLetter = XLSX.utils.encode_col(colIndex);
  const colFact = factSummary.columns[colIndex];
  if (!colFact) return false;

  // Rate multipliers are not payment components
  if (colFact.maxNum !== null && colFact.maxNum > 99999) return false;

  const targetCols = [grossColIdx, netPayColIdx].filter((idx) => idx >= 0);
  for (const tIdx of targetCols) {
    const tLetter = XLSX.utils.encode_col(tIdx);
    for (let r = 1; r <= 100; r++) {
      const cell = sheet[tLetter + r];
      if (cell?.f) {
        const fStr = String(cell.f);
        const directRef = new RegExp(`[+\\-]\\s*[$]?${colLetter}[$]?\\d+`, "i");
        if (directRef.test(fStr)) return true;

        const sumRangeMatch = fStr.match(
          /SUM\s*\(\s*([$]?[A-Za-z]+[$]?\d+)\s*:\s*([$]?[A-Za-z]+[$]?\d+)\s*\)/i,
        );
        if (sumRangeMatch) {
          try {
            const startC = XLSX.utils.decode_cell(
              sumRangeMatch[1].replace(/\$/g, ""),
            ).c;
            const endC = XLSX.utils.decode_cell(
              sumRangeMatch[2].replace(/\$/g, ""),
            ).c;
            if (
              colIndex >= Math.min(startC, endC) &&
              colIndex <= Math.max(startC, endC)
            ) {
              return true;
            }
          } catch {}
        }
      }
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// MAIN TRANSFORMATION PIPELINE
// -----------------------------------------------------------------------------

export async function transformPayrollExcelToJson(
  contentOrOptions:
    | Buffer
    | Uint8Array
    | { buffer: Buffer | Uint8Array; filename?: string },
  maybeFilename?: string,
): Promise<PayrollTransformJsonResult> {
  const content =
    Buffer.isBuffer(contentOrOptions) || contentOrOptions instanceof Uint8Array
      ? contentOrOptions
      : (contentOrOptions as any)?.buffer;
  const filename =
    maybeFilename ||
    (typeof contentOrOptions === "object" && "filename" in contentOrOptions
      ? (contentOrOptions as any).filename
      : "payroll.xlsx") ||
    "payroll.xlsx";

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
  const allSheetResults: SheetTransformationResult[] = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    }) as any[][];

    // Preserve non-empty rows with sheet row indices
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

    if (rowsWithMeta.length < 2) {
      continue;
    }

    const rows = rowsWithMeta.map((item) => item.row);
    const sampleRows = rows.slice(0, 30);

    // Step 1: Extract sheet facts (columns, sample values, and formula dependency graph)
    const factSummary = extractSheetFacts(sheet, sampleRows);

    // Step 2: Ask AI to identify header row, data start row, and column mapping
    const prompt = `Spreadsheet Filename: "${filename}"
Sheet Tab: "${sheetName}"
Total Non-Empty Rows: ${rows.length}

================ SHEET COLUMNS, HEADERS & FORMULA TRACES ================
${factSummary.formattedTable}

================ FORMULAS FOUND IN SHEET ================
${factSummary.formulaInsightLines.join("\n") || "- No formulas found"}

Please analyze all rows and columns above:
1. Identify headerRowIndex and secondaryHeaderRowIndex (if present).
2. Determine dataStartRowIndex where the FIRST ACTUAL HUMAN EMPLOYEE record begins.
3. Select columnsToKeep strictly matching allowed canonical payroll columns (NO SYNONYMS):
   - Identity: employee_name (required), employee_code (can be name or number, min 2 chars), uan_no (required, min 2 chars - NEVER use uan_number), esic_no (min 2 chars - NEVER use esic_number).
   - Attendance: working_days, present_days (required), ph, pl, cl, ml, el, ot_hours OR ot_days (only one! Required if ot_amount is present).
   - Earnings: basic (required), da, hra, lta, ph_wage, ot_amount, allowance, fixed_allowance, other_allowance, conveyance_allowance, transportation_allowance, el_amount, leave_salary, bonus, gross.
   - Deductions: pf, esic, pt, lwf, deduction (NEVER use deductions or total_deduction, keep ONLY deduction).
   - Special: advance, expense.
   - Payment: net_pay.
4. Select columnsToRemove:
   - Empty columns.
   - Wage rate / daily rate / basic rate columns (e.g. rate 651, 693).
   - Personal non-payment metadata (Father Name, Remarks, Serial No).`;

    let aiResult: z.infer<typeof SheetStructureSchema>;
    const modelsToTry = [GEMINI_LITE, GEMINI_MAIN].filter(
      (m, idx, arr) => arr.indexOf(m) === idx,
    );

    let lastErr: any = null;
    let analysisSuccess = false;
    for (const modelName of modelsToTry) {
      try {
        const res = await generateObject({
          model: googleAi(modelName),
          system: SYSTEM_TRANSFORMATION_PROMPT,
          prompt,
          schema: SheetStructureSchema,
          temperature: 0.1,
        });
        aiResult = res.object;
        analysisSuccess = true;
        break;
      } catch (err: any) {
        console.warn(
          `[PayrollExcelTransform] Model "${modelName}" failed:`,
          err?.message,
        );
        lastErr = err;
      }
    }

    if (!analysisSuccess) {
      const isQuota = /quota|rate[- ]limit|resource_exhausted|retry in/i.test(
        lastErr?.message || "",
      );
      if (isQuota || sheetNames.length === 1) {
        let msg = lastErr?.message || String(lastErr);
        const retryMatch = msg.match(/retry (?:in|after) ([0-9.]+)\s*s?/i);
        if (retryMatch?.[1]) {
          const ceilSecs = Math.ceil(Number.parseFloat(retryMatch[1]));
          msg = msg.replace(
            /retry (?:in|after) [0-9.]+\s*s?/i,
            `retry in ${ceilSecs}s`,
          );
        }
        throw new Error(`AI analysis failed for "${sheetName}": ${msg}`);
      }
      continue;
    }

    const ai = aiResult!;

    // Helper to normalize any stray synonyms deterministically to canonical names
    const normalizeCanonicalHeader = (header: string): string => {
      const h = header.trim().toLowerCase();
      if (h === "uan_number" || h === "uan") return "uan_no";
      if (h === "esic_number" || h === "esi_no" || h === "esi_number")
        return "esic_no";
      if (
        h === "deductions" ||
        h === "total_deduction" ||
        h === "total_deductions" ||
        h === "total_ded" ||
        h === "tot_ded" ||
        h === "tot_deduction"
      ) {
        return "deduction";
      }
      return h;
    };

    // Step 3: Determine target columns to keep
    const initialKeptCols: Array<{
      colIndex: number;
      cleanHeader: string;
      category: string;
    }> = [];

    const seenCanonicalKeys = new Set<string>();
    for (const col of ai.columnsToKeep) {
      if (typeof col.colIndex === "number" && col.colIndex >= 0) {
        const clean = normalizeCanonicalHeader(col.cleanHeader);
        // Avoid duplicate mappings for single canonical keys
        if (
          ["uan_no", "esic_no", "deduction", "gross", "net_pay"].includes(clean)
        ) {
          if (seenCanonicalKeys.has(clean)) continue;
          seenCanonicalKeys.add(clean);
        }
        initialKeptCols.push({
          colIndex: col.colIndex,
          cleanHeader: clean,
          category: clean === "deduction" ? "deduction" : col.category,
        });
      }
    }

    const basicColIdx =
      initialKeptCols.find((c) => c.cleanHeader === "basic")?.colIndex ?? -1;
    const otAmountColIdx =
      initialKeptCols.find((c) => c.cleanHeader === "ot_amount")?.colIndex ??
      -1;
    const grossColIdx =
      initialKeptCols.find((c) => c.cleanHeader === "gross")?.colIndex ?? -1;
    const netPayColIdx =
      initialKeptCols.find((c) => c.cleanHeader === "net_pay")?.colIndex ?? -1;

    // A. Resolve Overtime Column (ot_hours vs ot_days)
    const otCol = resolveOvertimeColumn(
      initialKeptCols,
      sheet,
      otAmountColIdx,
      factSummary,
    );

    const nonOtKeptCols = initialKeptCols.filter(
      (c) => c.cleanHeader !== "ot_hours" && c.cleanHeader !== "ot_days",
    );
    if (otCol) {
      nonOtKeptCols.push({
        colIndex: otCol.colIndex,
        cleanHeader: otCol.header,
        category: otCol.category,
      });
    }

    // B. Resolve General Attendance Columns (working_days vs present_days)
    const resolvedAttendanceCols = resolveAttendanceColumns(
      nonOtKeptCols,
      sheet,
      basicColIdx,
    );

    // C. Categorize Advance and Expense by calculation involvement in net_pay / gross
    const resolvedAdvanceExpenseCols = resolveAdvanceAndExpenseCategories(
      resolvedAttendanceCols,
      sheet,
      netPayColIdx,
    );

    // D. Resolve Allowance Columns (single vs multiple, specific match vs generic)
    const resolvedAllowanceCols = resolveAllowanceColumns(
      resolvedAdvanceExpenseCols,
      factSummary,
    );

    // E. Resolve Earned Leave Columns (attendance el vs monetary el_amount)
    const resolvedElCols = resolveEarnedLeaveColumns(
      resolvedAllowanceCols,
      sheet,
      factSummary,
    );

    // F. Strictly Filter Allowed Columns:
    // Only allow columns in STANDARD_ALLOWED_COLUMNS or custom payment fields in gross/net_pay calculation
    const strictlyAllowedKeptCols: KeptColumnDef[] = [];
    for (const col of resolvedElCols) {
      if (STANDARD_ALLOWED_COLUMNS.has(col.header)) {
        strictlyAllowedKeptCols.push(col);
      } else {
        const isPaymentInFormula = isPaymentComponentInFormula(
          col.colIndex,
          sheet,
          grossColIdx,
          netPayColIdx,
          factSummary,
        );
        if (isPaymentInFormula) {
          strictlyAllowedKeptCols.push(col);
        }
      }
    }

    // Sort kept columns in canonical logical payroll order
    strictlyAllowedKeptCols.sort((a, b) => {
      const prioA = getCanonicalHeaderPriority(
        a.header,
        a.category,
        a.colIndex,
      );
      const prioB = getCanonicalHeaderPriority(
        b.header,
        b.category,
        b.colIndex,
      );
      if (prioA !== prioB) return prioA - prioB;
      return a.colIndex - b.colIndex;
    });

    if (strictlyAllowedKeptCols.length === 0) {
      continue;
    }

    // Step 4: Extract valid employee rows matching headers
    let detectedHeaderMetaIdx = -1;
    for (let i = 0; i < Math.min(25, rowsWithMeta.length); i++) {
      const r = rowsWithMeta[i].row;
      const kwCount = r.filter((cell) =>
        cell !== null && cell !== undefined
          ? HEADER_KEYWORDS.has(normHeader(String(cell)))
          : false,
      ).length;
      if (kwCount >= 2) {
        detectedHeaderMetaIdx = i;
      }
    }

    const startRowIdx =
      detectedHeaderMetaIdx >= 0
        ? detectedHeaderMetaIdx + 1
        : Math.max(
            0,
            (ai.secondaryHeaderRowIndex ?? ai.headerRowIndex ?? 0) + 1,
          );

    const nameColIdx =
      strictlyAllowedKeptCols.find((c) => c.header === "employee_name")
        ?.colIndex ?? -1;
    const codeColIdx =
      strictlyAllowedKeptCols.find((c) => c.header === "employee_code")
        ?.colIndex ?? -1;
    const uanColIdx =
      strictlyAllowedKeptCols.find((c) => c.header === "uan_no")?.colIndex ??
      -1;
    const esicColIdx =
      strictlyAllowedKeptCols.find((c) => c.header === "esic_no")?.colIndex ??
      -1;
    const presentColIdx =
      strictlyAllowedKeptCols.find((c) => c.header === "present_days")
        ?.colIndex ?? -1;

    const outDataRows: (string | number)[][] = [];

    for (let r = startRowIdx; r < rowsWithMeta.length; r++) {
      const item = rowsWithMeta[r];
      if (!item) continue;
      const { row } = item;
      if (!row || !Array.isArray(row)) continue;

      const rawName = nameColIdx >= 0 ? row[nameColIdx] : "";
      const rawCode = codeColIdx >= 0 ? row[codeColIdx] : "";
      const rawUan = uanColIdx >= 0 ? row[uanColIdx] : "";
      const rawEsic = esicColIdx >= 0 ? row[esicColIdx] : "";

      // 1. Static Identity Constraints
      const cleanName = validateAndCleanName(rawName);
      const cleanUan = validateAndCleanUan(rawUan);
      const cleanCode =
        codeColIdx >= 0 &&
        rawCode !== "" &&
        rawCode !== null &&
        rawCode !== undefined
          ? validateAndCleanCode(rawCode)
          : "";
      const esicCheck =
        esicColIdx >= 0
          ? validateAndCleanEsic(rawEsic)
          : { isValid: true, value: "" };

      // Mandatory identity constraint:
      // Both employee_name and uan_no are required! If either is missing or invalid -> skip row!
      if (!cleanName || !cleanUan) {
        continue;
      }

      // If employee_code is present in row, must satisfy min 2 length constraint
      if (
        codeColIdx >= 0 &&
        rawCode !== "" &&
        rawCode !== null &&
        rawCode !== undefined &&
        cleanCode === null
      ) {
        continue;
      }

      // If esic_no is present in row, must satisfy format constraint (name or number, min 2 len)
      if (!esicCheck.isValid) {
        continue;
      }

      // Skip summary or total rows
      if (isSummaryOrTotalRow(row)) {
        continue;
      }

      // Extract present_days
      let presentDaysVal: number | null = null;
      if (presentColIdx >= 0) {
        const p = cleanAttendanceDaysValue(row[presentColIdx]);
        if (typeof p === "number") presentDaysVal = p;
      }

      // Extract each cell for the kept columns
      const rowValues = strictlyAllowedKeptCols.map((col) => {
        if (col.header === "employee_name") return cleanName;
        if (col.header === "employee_code") return cleanCode || "";
        if (col.header === "uan_no") return cleanUan;
        if (col.header === "esic_no") return esicCheck.value;

        if (col.header === "present_days") {
          return presentDaysVal ?? "";
        }

        if (col.header === "working_days") {
          if (col.isSynthesized) {
            const baseWd = col.synthesizedDivisor ?? 26;
            return typeof presentDaysVal === "number"
              ? Math.max(baseWd, presentDaysVal)
              : baseWd;
          }
          const rawCell = col.colIndex >= 0 ? row[col.colIndex] : "";
          let wd = cleanAttendanceDaysValue(rawCell);
          if (
            typeof wd === "number" &&
            typeof presentDaysVal === "number" &&
            presentDaysVal > wd
          ) {
            wd = presentDaysVal;
          }
          return wd !== ""
            ? wd
            : typeof presentDaysVal === "number"
              ? Math.max(26, presentDaysVal)
              : 26;
        }

        if (col.header === "ot_days") {
          const rawCell = col.colIndex >= 0 ? row[col.colIndex] : "";
          return cleanAttendanceDaysValue(rawCell);
        }

        if (col.header === "ot_hours") {
          const rawCell = col.colIndex >= 0 ? row[col.colIndex] : "";
          return cleanOtHoursValue(rawCell);
        }

        if (["ph", "pl", "cl", "ml", "el"].includes(col.header)) {
          const rawCell = col.colIndex >= 0 ? row[col.colIndex] : "";
          return cleanAttendanceDaysValue(rawCell);
        }

        // All amount / wage / earning / deduction / net_pay fields
        const rawCell = col.colIndex >= 0 ? row[col.colIndex] : "";
        return cleanAmountCellValue(rawCell);
      });

      outDataRows.push(rowValues);
    }

    if (outDataRows.length === 0) {
      continue;
    }

    // Step 5: Prune any optional columns where all rows are empty/zero
    const initialHeaders = strictlyAllowedKeptCols.map((c) => c.header);
    const otAmountPresent = outDataRows.some((row) => {
      const idx = initialHeaders.indexOf("ot_amount");
      return idx >= 0 && !isValueZeroOrNA(row[idx]);
    });

    const keepColIndices: number[] = [];
    for (let c = 0; c < initialHeaders.length; c++) {
      const colHeader = initialHeaders[c];
      if (REQUIRED_TRANSFORMED_COLUMNS.has(colHeader)) {
        keepColIndices.push(c);
        continue;
      }
      // If ot_amount is present with values, keep ot_days or ot_hours
      if (
        (colHeader === "ot_days" || colHeader === "ot_hours") &&
        otAmountPresent
      ) {
        keepColIndices.push(c);
        continue;
      }
      const hasValue = outDataRows.some((row) => !isValueZeroOrNA(row[c]));
      if (hasValue) {
        keepColIndices.push(c);
      }
    }

    const finalHeaders = keepColIndices.map((i) => initialHeaders[i]);
    const finalDataRows = outDataRows.map((row) =>
      keepColIndices.map((i) => row[i]),
    );

    // Step 6: Generate Summary Total Row for Amount Columns
    const NON_AMOUNT_HEADERS = new Set<string>([
      "employee_name",
      "employee_code",
      "uan_no",
      "esic_no",
      "working_days",
      "present_days",
      "ph",
      "pl",
      "cl",
      "ml",
      "el",
      "ot_hours",
      "ot_days",
    ]);

    const totalRow: (string | number)[] = finalHeaders.map((hdr, colIdx) => {
      if (colIdx === 0) return "Total";
      if (NON_AMOUNT_HEADERS.has(hdr)) return "";

      let sum = 0;
      let hasAny = false;
      for (const row of finalDataRows) {
        const v = row[colIdx];
        if (v !== null && v !== undefined && v !== "") {
          const num = Number(String(v).replace(/,/g, "").trim());
          if (!Number.isNaN(num)) {
            sum += num;
            hasAny = true;
          }
        }
      }
      return hasAny ? Math.round(sum) : "";
    });

    const worksheetData = [finalHeaders, ...finalDataRows, totalRow];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    worksheet["!cols"] = finalHeaders.map((hdr) => {
      if (hdr === "employee_name") return { wch: 28 };
      if (hdr === "employee_code" || hdr === "uan_no" || hdr === "esic_no")
        return { wch: 18 };
      if (
        [
          "working_days",
          "present_days",
          "ph",
          "pl",
          "cl",
          "ml",
          "el",
          "ot_hours",
          "ot_days",
        ].includes(hdr)
      )
        return { wch: 14 };
      if (hdr === "gross" || hdr === "net_pay") return { wch: 18 };
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

    const lastRow = finalDataRows[finalDataRows.length - 1];
    const lastRowText = lastRow
      .map((c) => String(c ?? "").trim())
      .filter(Boolean)
      .join(", ");

    const currentSheetDetails = {
      sheetName,
      employeeNameCol: finalHeaders.includes("employee_name")
        ? "employee_name"
        : null,
      employeeCodeCol: finalHeaders.includes("employee_code")
        ? "employee_code"
        : null,
      esicCol: finalHeaders.includes("esic_no") ? "esic_no" : null,
      uanCol: finalHeaders.includes("uan_no") ? "uan_no" : null,
      attendance: finalHeaders.filter((h) =>
        [
          "working_days",
          "present_days",
          "ph",
          "pl",
          "cl",
          "ml",
          "el",
          "ot_hours",
          "ot_days",
        ].includes(h),
      ),
      earnings: finalHeaders.filter(
        (h) =>
          [
            "basic",
            "da",
            "hra",
            "lta",
            "ph_wage",
            "ot_amount",
            "allowance",
            "fixed_allowance",
            "other_allowance",
            "conveyance_allowance",
            "transportation_allowance",
            "el_amount",
            "leave_salary",
            "bonus",
          ].includes(h) ||
          (strictlyAllowedKeptCols.find((c) => c.header === h)?.category ===
            "earning" &&
            ![
              "employee_name",
              "employee_code",
              "uan_no",
              "esic_no",
              "gross",
              "net_pay",
            ].includes(h)),
      ),
      grossCol: finalHeaders.includes("gross") ? "gross" : null,
      deductions: finalHeaders.filter(
        (h) =>
          ["pf", "esic", "pt", "lwf", "deduction"].includes(h) ||
          strictlyAllowedKeptCols.find((c) => c.header === h)?.category ===
            "deduction",
      ),
      netPayCol: finalHeaders.includes("net_pay") ? "net_pay" : null,
      excludedRateColumns: [],
      removedColumns: (ai.columnsToRemove || []).map((rc) => ({
        header: rc.originalHeader,
        reason: rc.reason,
      })),
    };

    // Convert final data rows into JSON employee records
    const sheetRecords: Array<Record<string, string | number>> =
      finalDataRows.map((row) => {
        const record: Record<string, string | number> = {
          sheet_name: sheetName,
        };
        for (let c = 0; c < finalHeaders.length; c++) {
          const key = finalHeaders[c];
          const val = row[c];
          record[key] = val !== null && val !== undefined ? val : "";
        }
        if (record.uan_no && !record.uan_number) {
          record.uan_number = record.uan_no;
        }
        if (record.esic_no && !record.esic_number) {
          record.esic_number = record.esic_no;
        }
        return record;
      });

    // Compute totals object for amount fields
    const sheetTotals: Record<string, number> = {};
    for (let c = 0; c < finalHeaders.length; c++) {
      const key = finalHeaders[c];
      const val = totalRow[c];
      if (typeof val === "number") {
        sheetTotals[key] = val;
      }
    }

    allSheetResults.push({
      sheetName,
      totalRows: finalDataRows.length,
      recordsCount: finalDataRows.length,
      columns: finalHeaders,
      records: sheetRecords,
      details: currentSheetDetails,
      totals: sheetTotals,
      lastRowText: lastRowText || "Empty row",
      previewRows: worksheetData,
    });

    if (!firstSheetResult) {
      firstSheetResult = {
        success: true,
        filename,
        totalRecords: finalDataRows.length,
        recordsCount: finalDataRows.length,
        totalRows: finalDataRows.length,
        columns: finalHeaders,
        records: sheetRecords,
        details: currentSheetDetails,
        totals: sheetTotals,
        sheets: [],
        lastRowText: lastRowText || "Empty row",
        previewRows: worksheetData,
        transformedBuffer: Buffer.from([]),
        transformedFilename: "",
      };
    }
  }

  if (newWorkbook.SheetNames.length === 0 || !firstSheetResult) {
    if (lastErr) {
      let msg = lastErr?.message || String(lastErr);
      const retryMatch = msg.match(/retry (?:in|after) ([0-9.]+)\s*s?/i);
      if (retryMatch?.[1]) {
        const ceilSecs = Math.ceil(Number.parseFloat(retryMatch[1]));
        msg = msg.replace(
          /retry (?:in|after) [0-9.]+\s*s?/i,
          `retry in ${ceilSecs}s`,
        );
      }
      throw new Error(`AI analysis failed: ${msg}`);
    }
    throw new Error(
      `No valid employee payroll data could be extracted from "${filename}".`,
    );
  }

  const transformedBuffer = XLSX.write(newWorkbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  const parsed = path.parse(filename || "payroll.xlsx");
  const baseName = parsed.name || "payroll";
  const transformedFilename = `Transformed_${baseName}.xlsx`;

  const allRecords = allSheetResults.flatMap((s) => s.records);
  const uniqueCols = new Set<string>();
  for (const s of allSheetResults) {
    for (const c of s.columns) uniqueCols.add(c);
  }

  firstSheetResult.transformedBuffer = transformedBuffer;
  firstSheetResult.transformedFilename = transformedFilename;
  firstSheetResult.records = allRecords;
  firstSheetResult.recordsCount = allRecords.length;
  firstSheetResult.totalRecords = allRecords.length;
  firstSheetResult.columns = Array.from(uniqueCols);
  firstSheetResult.sheets = allSheetResults;

  return firstSheetResult;
}

export const transformPayrollExcel = transformPayrollExcelToJson;
export const transformPayrollExcelAttachment = transformPayrollExcelToJson;
