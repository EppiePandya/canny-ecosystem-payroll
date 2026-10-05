import * as XLSX from "xlsx";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "@canny_ecosystem/utils";
import { GEMINI_MAIN } from "@/utils/ai/chat/constant";
import type {
  TypedSupabaseClient,
  InvoiceDatabaseInsert,
} from "@canny_ecosystem/supabase/types";
import {
  getMonthNameFromNumber,
  generateInvoiceNumber,
  getDefaultInvoiceSubject,
} from "@canny_ecosystem/utils";
import { createInvoice } from "@canny_ecosystem/supabase/mutations";
import {
  getCompanyById,
  getCompanyConfigByCompanyId,
  getLatestInvoiceByCompanyId,
  getLocationsForSelectByCompanyId,
  getRelationshipsByCompanyId,
  type ManpowerVersion,
} from "@canny_ecosystem/supabase/queries";

export interface ParsedReimbursementRow {
  rowNumber: number;
  serialNo?: string;
  rawName: string;
  rawCode: string;
  employeeName?: string;
  employeeCode?: string;
  location?: string;
  activity?: string;
  previousBalance: number;
  advanceAmount: number;
  advances?: Array<{ name: string; amount: number }>;
  totalBalancePlusAdvance?: number;
  expenseAmount: number;
  inHandAmount: number;
  remainingAmount: number;
  netRemaining?: number;
  selectedAmount: number;
  matchedEmployee: {
    id: string;
    employee_code: string;
    fullName: string;
    name?: string;
    siteName?: string;
    projectName?: string;
  } | null;
  matchedPayee?: {
    id: string;
    name: string;
    bankName?: string;
    accountNumber?: string;
  } | null;
  autoCreatePayee?: {
    name: string;
    account_holder_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch_name?: string;
    type?: string;
  };
  matchType?: "code" | "name" | "fuzzy" | "payee" | "auto_payee";
  candidateEmployees?: Array<{
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  }>;
  candidatePayees?: Array<{
    id: string;
    name: string;
    bank_name?: string;
    account_number?: string;
  }>;
  status: "matched" | "unmatched" | "zero_amount";
}

export interface ParseReimbursementSheetResult {
  sheetTitle: string;
  monthName: string;
  monthNumber: number;
  year: number;
  month?: string;
  fileName: string;
  fileType?: "excel" | "pdf";
  hasEmployeeSheet?: boolean;
  vendorDetails?: {
    vendorName?: string;
    mobileNumber?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branchName?: string;
    address?: string;
    totalBillAmount?: number;
    breakdownItems?: Array<{ description: string; amount: number }>;
  };
  invoiceDetails?: {
    invoiceNumber?: string;
    clientName?: string;
    clientGstin?: string;
    particulars?: string;
    period?: string;
    location?: string;
    billableAmount?: number;
    serviceChargeRate?: number;
    serviceChargeAmount?: number;
    subtotalAmount?: number;
    igstRate?: number;
    igstAmount?: number;
    cgstRate?: number;
    cgstAmount?: number;
    sgstRate?: number;
    sgstAmount?: number;
    grandTotal?: number;
    hsnCode?: string;
  };
  items: ParsedReimbursementRow[];
  rows: ParsedReimbursementRow[];
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  totalExpenseAmount: number;
  totalRemainingAmount: number;
  totalNetRemaining?: number;
  aiDetected?: boolean;
  detectedColumns?: Record<string, number | null>;
  allEmployees?: Array<{
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  }>;
  allPayees?: Array<{
    id: string;
    name: string;
    account_holder_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch_name?: string;
    type?: string;
  }>;
}

function cleanString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function parseNumeric(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const raw = String(val).trim();
  if (!raw) return 0;
  const isNegative = raw.includes("-") || (raw.startsWith("(") && raw.endsWith(")"));
  const digitsOnly = raw.replace(/[^0-9.]/g, "");
  if (!digitsOnly) return 0;
  const num = parseFloat(digitsOnly);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}

function cleanToken(str: string): string {
  return str.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[a.length][b.length];
}

/**
 * Checks if two words/tokens are similar (handles typos like VEKATESH vs VENKATESH)
 */
function areTokensSimilar(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  if (t1.length < 3 || t2.length < 3) return false;
  if (t1.length >= 5 && (t2.includes(t1) || t1.includes(t2))) return true;
  const dist = levenshtein(t1, t2);
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen >= 8 && dist <= 2) return true;
  if (maxLen >= 4 && dist <= 1) return true;
  return false;
}

/**
 * Strips initials (e.g. "P.", "D.", "S."), titles, and returns core name tokens (length >= 3)
 */
function extractNameTokens(name: string): string[] {
  if (!name) return [];
  const normalized = name
    .toUpperCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .trim();
  const rawWords = normalized.split(/\s+/).filter(Boolean);
  return rawWords
    .map(cleanToken)
    .filter((w) => w.length >= 3);
}

export interface EmployeeRosterItem {
  id: string;
  employee_code: string;
  numericCode: string;
  fullName: string;
  cleanName: string;
  tokens: string[];
  siteName?: string;
  projectName?: string;
}

/**
 * Matches raw extracted name & code against active company roster
 */
export function matchEmployeeWithRoster(
  rawName: string,
  rawCode: string,
  employees: EmployeeRosterItem[]
): {
  matchedEmployee: {
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  } | null;
  matchType?: "code" | "name" | "fuzzy";
  candidateEmployees: Array<{
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  }>;
} {
  let matchedEmployee: {
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  } | null = null;
  let matchType: "code" | "name" | "fuzzy" | undefined = undefined;
  let candidateEmployees: Array<{
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  }> = [];

  // Method A: Match by code (exact code, numeric digits, or clean name)
  if (rawCode) {
    const rawCodeClean = cleanToken(rawCode);
    const rawDigits = rawCode.replace(/\D/g, "");

    const codeMatches = employees.filter(
      (e) =>
        e.employee_code.toUpperCase() === rawCode.toUpperCase() ||
        (rawDigits.length >= 3 && e.numericCode === rawDigits) ||
        e.cleanName === rawCodeClean
    );

    if (codeMatches.length === 1) {
      matchedEmployee = {
        id: codeMatches[0].id,
        employee_code: codeMatches[0].employee_code,
        fullName: codeMatches[0].fullName,
        siteName: codeMatches[0].siteName,
        projectName: codeMatches[0].projectName,
      };
      matchType = "code";
      candidateEmployees = [
        {
          id: codeMatches[0].id,
          employee_code: codeMatches[0].employee_code,
          fullName: codeMatches[0].fullName,
          siteName: codeMatches[0].siteName,
          projectName: codeMatches[0].projectName,
        },
      ];
    } else if (codeMatches.length > 1) {
      candidateEmployees = codeMatches.map((c) => ({
        id: c.id,
        employee_code: c.employee_code,
        fullName: c.fullName,
        siteName: c.siteName,
        projectName: c.projectName,
      }));
    }
  }

  // Method B: Match by Name (handles missing initials, typos, token similarity)
  if (!matchedEmployee && rawName) {
    const sheetClean = cleanToken(rawName);
    const sheetTokens = extractNameTokens(rawName);

    const scoredCandidates: Array<{
      emp: EmployeeRosterItem;
      score: number;
      exactMatch: boolean;
    }> = [];

    for (const emp of employees) {
      // 1. Exact full clean name match
      if (emp.cleanName === sheetClean) {
        scoredCandidates.push({ emp, score: 100, exactMatch: true });
        continue;
      }

      // 2. Substring match for full name
      if (sheetClean.length >= 6 && emp.cleanName.includes(sheetClean)) {
        scoredCandidates.push({ emp, score: 90, exactMatch: false });
        continue;
      }
      if (emp.cleanName.length >= 6 && sheetClean.includes(emp.cleanName)) {
        scoredCandidates.push({ emp, score: 85, exactMatch: false });
        continue;
      }

      // 3. Token-based matching (e.g., P.VEKATESH BABU vs P VENKATESH BABU / VENKATESH BABU)
      if (sheetTokens.length > 0 && emp.tokens.length > 0) {
        let matchedTokensCount = 0;
        for (const sTok of sheetTokens) {
          const hasSimilar = emp.tokens.some((eTok) => areTokensSimilar(sTok, eTok));
          if (hasSimilar) matchedTokensCount++;
        }

        const matchRatio = matchedTokensCount / sheetTokens.length;
        if (sheetTokens.length === 1 && matchedTokensCount === 1) {
          if (sheetTokens[0].length >= 5) {
            scoredCandidates.push({ emp, score: 70, exactMatch: false });
          }
        } else if (sheetTokens.length >= 2 && matchedTokensCount >= 2) {
          scoredCandidates.push({
            emp,
            score: 75 + Math.round(matchRatio * 20),
            exactMatch: matchRatio === 1,
          });
        } else if (sheetTokens.length >= 2 && matchRatio >= 0.5) {
          scoredCandidates.push({ emp, score: 60, exactMatch: false });
        }
      }
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    const topCandidates = scoredCandidates
      .filter((c) => c.score >= 60)
      .slice(0, 5)
      .map((c) => ({
        id: c.emp.id,
        employee_code: c.emp.employee_code,
        fullName: c.emp.fullName,
        siteName: c.emp.siteName,
        projectName: c.emp.projectName,
      }));

    // Rule: If exactly 1 match found -> auto match!
    if (topCandidates.length === 1) {
      matchedEmployee = topCandidates[0];
      matchType = scoredCandidates[0]?.exactMatch ? "name" : "fuzzy";
      candidateEmployees = topCandidates;
    }
    // Rule: If more than 1 match found -> auto-select if high confidence exact match, else candidate list
    else if (topCandidates.length > 1) {
      const topScore = scoredCandidates[0]?.score || 0;
      const secondScore = scoredCandidates[1]?.score || 0;
      if (
        (topScore === 100 && secondScore < 90) ||
        (scoredCandidates[0]?.exactMatch && topScore >= 90 && topScore - secondScore >= 15)
      ) {
        matchedEmployee = topCandidates[0];
        matchType = scoredCandidates[0]?.exactMatch ? "name" : "fuzzy";
        candidateEmployees = topCandidates;
      } else {
        matchedEmployee = null;
        matchType = "fuzzy";
        candidateEmployees = topCandidates;
      }
    } else {
      candidateEmployees = [];
    }
  }

  return { matchedEmployee, matchType, candidateEmployees };
}

/**
 * Extracts month and year from sheet title or filename (e.g. "TRAVELLING EXPENSES FOR THE MONTH OF AUG'26")
 */
export function extractReimbursementMonthYear(text: string): { month: number; year: number; monthName: string } {
  const currentYear = new Date().getFullYear();
  let month = new Date().getMonth() + 1;
  let year = currentYear;

  const upper = text.toUpperCase();

  const monthNames = [
    { name: "January", short: "JAN", num: 1 },
    { name: "February", short: "FEB", num: 2 },
    { name: "March", short: "MAR", num: 3 },
    { name: "April", short: "APR", num: 4 },
    { name: "May", short: "MAY", num: 5 },
    { name: "June", short: "JUN", num: 6 },
    { name: "July", short: "JUL", num: 7 },
    { name: "August", short: "AUG", num: 8 },
    { name: "September", short: "SEP", num: 9 },
    { name: "October", short: "OCT", num: 10 },
    { name: "November", short: "NOV", num: 11 },
    { name: "December", short: "DEC", num: 12 },
  ];

  for (const m of monthNames) {
    if (upper.includes(m.name.toUpperCase()) || upper.includes(m.short)) {
      month = m.num;
      break;
    }
  }

  const fourDigitMatch = upper.match(/20\d{2}/);
  if (fourDigitMatch) {
    year = parseInt(fourDigitMatch[0], 10);
  } else {
    const twoDigitMatch = upper.match(/['\-\s](\d{2})(?!\d)/);
    if (twoDigitMatch) {
      const yr = parseInt(twoDigitMatch[1], 10);
      year = yr < 50 ? 2000 + yr : 1900 + yr;
    }
  }

  return {
    month,
    year,
    monthName: getMonthNameFromNumber(month) || "August",
  };
}

export const ReimbursementAIAnalysisSchema = z.object({
  sheetTitle: z.string().describe("Overall title of the sheet, e.g. TRAVELLING EXPENSES FOR THE MONTH OF MARCH 2026"),
  month: z.string().describe("Extracted month name, e.g. March or August"),
  year: z.number().describe("Extracted 4-digit calendar year, e.g. 2026"),
  headerRowIndex: z.number().describe("0-indexed row number containing the column headers"),
  dataStartRowIndex: z.number().describe("0-indexed row number where employee data rows start (usually headerRowIndex + 1)"),
  dataEndRowIndex: z.number().nullable().describe("0-indexed row number where employee data ends (before any TOTAL / SUMMARY rows)"),
  columnMapping: z.object({
    sNoColIdx: z.number().nullable().describe("0-indexed column index for Serial Number (S.No, Sl No, Serial No)"),
    nameColIdx: z.number().nullable().describe("0-indexed column index for Employee Name / Staff Name / Name"),
    codeColIdx: z.number().nullable().describe("0-indexed column index for Employee Code / EMP ID (or null if sheet only has Name)"),
    locationColIdx: z.number().nullable().describe("0-indexed column index for Site / Location / Branch / Station"),
    activityColIdx: z.number().nullable().describe("0-indexed column index for Activity / Role / Project / Remarks"),
    prevBalColIdx: z.number().nullable().describe("0-indexed column index for Previous Balance carried forward"),
    advanceColIdx: z.number().nullable().describe("0-indexed column index for Advance amount / Cash Given / Less : Advance Paid / Imprest"),
    expenseColIdx: z.number().nullable().describe("0-indexed column index for Total Expense / Actual Spend / Claim Amount / Bills / Allowances (Travel, Accomodation, Food & Telephone)"),
    remainingColIdx: z.number().nullable().describe("0-indexed column index for Remaining / Net Payable / Total Payable / Due to Employee / Settlement"),
  }),
});

export type ReimbursementAIAnalysis = z.infer<typeof ReimbursementAIAnalysisSchema>;

/**
 * Uses Gemini AI to analyze any arbitrary Excel sheet layout,
 * dynamically determining header locations and column mappings regardless of
 * company-specific formatting, column order, or header naming variations.
 */
export async function analyzeReimbursementSheetWithAI({
  sampleRows,
  totalRows,
  fileName,
}: {
  sampleRows: any[][];
  totalRows: number;
  fileName: string;
}): Promise<ReimbursementAIAnalysis | null> {
  try {
    const result = await generateObject({
      model: google(GEMINI_MAIN),
      system: `You are an expert financial and HR payroll AI assistant.
Analyze the provided Excel spreadsheet matrix (the first 20-25 rows). Different companies, contractors, or site locations use different formats, column orders, and header names for Travelling Expenses & Reimbursement sheets.

Your task is to identify:
1. "sheetTitle": The overall title (e.g. Travelling Expenses For The Month Of March 2026 or Expenses Details - Minerals).
2. "month" and "year": The calendar month and 4-digit year of the expense period.
3. "headerRowIndex": The 0-indexed row containing table column headers (e.g. Name, Emp Code, Allowances, Advance Paid, Total Payable, Location, etc.).
4. "dataStartRowIndex": The 0-indexed row where employee data records start (usually headerRowIndex + 1).
5. "dataEndRowIndex": The 0-indexed row where employee data ends (exclude TOTAL, SUB-TOTAL, GRAND TOTAL, or empty summary rows). If no total row is found, return null.
6. "columnMapping":
   - "sNoColIdx": Column for S.No, Sl No, Sr No, Serial No.
   - "nameColIdx": Column for Employee Name, Staff Name, Name of Staff, Candidate Name, Name.
   - "codeColIdx": Column for Employee ID, Emp ID, Staff Code, Emp Code, Code. If there is no employee code column in this sheet, return null.
   - "locationColIdx": Column for Site, Station, Branch, Location, Project Site.
   - "activityColIdx": Column for Activity, Work, Role, Purpose, Remarks.
   - "prevBalColIdx": Column for Previous Balance, Opening Bal, Prev Bal.
   - "advanceColIdx": Column for Advance given, Advance Amount, Less : Advance Paid, Imprest, Cash Received.
   - "expenseColIdx": Column for Total Expense, Actual Expenditure, EXP, Claim Amount, Total Bills, Allowances (Travel, Accomodation, Food & Telephone), Allowances, Travel.
   - "remainingColIdx": Column for Remaining Balance, Net Payable, Total Payable, Balance to Pay, Due to Employee, Settlement.

Important rules:
- Pay attention to semantic meaning of the headers and sample row values (e.g., employee codes usually start with CMS or are numeric, amounts are numbers, names are person names).
- Some templates do NOT have an Employee Code column, only a "Name" column. In that case, codeColIdx MUST be null.
- Some templates use "Allowances (Travel, Accomodation, Food & Telephone)" or similar for the billable expense column (expenseColIdx).
- Some templates use "Less : Advance Paid" or similar for the advance column (advanceColIdx).
- Some templates use "Total Payable" or similar for the net balance column (remainingColIdx).
- If a column is missing in this particular company's template (e.g., no location or no prevBal), return null for that column index.
- If advance is missing or 0, advanceColIdx can be null.
- If expense or claim or allowances is present, map expenseColIdx accurately.
- If remaining balance or total payable is present, map remainingColIdx accurately.`,
      prompt: `File Name: ${fileName}\nTotal Rows: ${totalRows}\nSample Rows Matrix:\n${JSON.stringify(
        sampleRows.map((row, rIdx) => ({
          rowIndex: rIdx,
          cells: row.map((c) => (c === undefined || c === null ? "" : String(c))),
        }))
      )}`,
      schema: ReimbursementAIAnalysisSchema,
    });

    return result.object;
  } catch (err) {
    console.warn("analyzeReimbursementSheetWithAI encountered error, falling back to heuristics:", err);
    return null;
  }
}

/**
 * Parses a Reimbursement Excel Buffer, matches employees against active company roster,
 * and extracts all reimbursement rows using Gemini AI + Heuristic Fallback.
 */
export async function parseReimbursementExcelBuffer({
  buffer,
  fileName,
  companyId,
  supabase,
}: {
  buffer: Buffer;
  fileName: string;
  companyId: string;
  supabase: TypedSupabaseClient;
}): Promise<ParseReimbursementSheetResult> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Excel workbook contains no sheets");
  }

  const targetSheetName =
    workbook.SheetNames.find(
      (n) =>
        n.toUpperCase().includes("SUMMARY") ||
        n.toUpperCase().includes("EXPENSE") ||
        n.toUpperCase().includes("REIMBUR")
    ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[targetSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let sheetTitle = fileName;
  let headerRowIndex = -1;
  let detectedMonthName = "";
  let detectedYear = 0;
  let aiDetected = false;
  let aiDataEndRow: number | null = null;

  const colIndexMap = {
    sNo: -1,
    name: -1,
    code: -1,
    activity: -1,
    location: -1,
    prevBal: -1,
    advance: -1,
    advanceCols: [] as Array<{ name: string; idx: number }>,
    prevPlusAdv: -1,
    expense: -1,
    inHand: -1,
    remaining: -1,
  };

  // Step 1: Intelligent Gemini AI Analysis (handles any company format / arbitrary column order)
  const sampleRows = rows.slice(0, 25);
  const aiAnalysis = await analyzeReimbursementSheetWithAI({
    sampleRows,
    totalRows: rows.length,
    fileName,
  });

  if (aiAnalysis && aiAnalysis.headerRowIndex >= 0) {
    headerRowIndex = aiAnalysis.headerRowIndex;
    sheetTitle = aiAnalysis.sheetTitle || sheetTitle;
    detectedMonthName = aiAnalysis.month || "";
    detectedYear = aiAnalysis.year || 0;
    aiDataEndRow = aiAnalysis.dataEndRowIndex;
    aiDetected = true;

    const map = aiAnalysis.columnMapping;
    if (map.nameColIdx !== null && map.nameColIdx !== undefined) colIndexMap.name = map.nameColIdx;
    if (map.codeColIdx !== null && map.codeColIdx !== undefined) colIndexMap.code = map.codeColIdx;
    if (map.advanceColIdx !== null && map.advanceColIdx !== undefined) {
      colIndexMap.advance = map.advanceColIdx;
      colIndexMap.advanceCols.push({ name: "Advance", idx: map.advanceColIdx });
    }
    if (map.expenseColIdx !== null && map.expenseColIdx !== undefined) colIndexMap.expense = map.expenseColIdx;
    if (map.remainingColIdx !== null && map.remainingColIdx !== undefined) colIndexMap.remaining = map.remainingColIdx;
    if (map.locationColIdx !== null && map.locationColIdx !== undefined) colIndexMap.location = map.locationColIdx;
    if (map.activityColIdx !== null && map.activityColIdx !== undefined) colIndexMap.activity = map.activityColIdx;
    if (map.prevBalColIdx !== null && map.prevBalColIdx !== undefined) colIndexMap.prevBal = map.prevBalColIdx;
    if (map.sNoColIdx !== null && map.sNoColIdx !== undefined) colIndexMap.sNo = map.sNoColIdx;
  }

  // Step 2: Fallback to Heuristic Multi-pattern Detection if AI was unavailable or couldn't find headers
  if (headerRowIndex === -1 || (colIndexMap.name === -1 && colIndexMap.code === -1)) {
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rowText = row.filter(Boolean).map(cleanString).join(" ");
      if (
        rowText.toUpperCase().includes("TRAVELLING EXPENSES") ||
        rowText.toUpperCase().includes("STAFF EXP") ||
        rowText.toUpperCase().includes("EXPENSES DETAILS") ||
        rowText.toUpperCase().includes("EXPENSES FOR THE MONTH")
      ) {
        sheetTitle = rowText.trim();
      }

      const lowerCells = row.map((c) => cleanString(c).toLowerCase());
      const hasName = lowerCells.some(
        (c) =>
          c.includes("name of") ||
          c.includes("employee name") ||
          c === "name" ||
          c.includes("employe") ||
          c.includes("staff name")
      );
      const hasCode = lowerCells.some(
        (c) => c.includes("emp") || c.includes("code") || c === "emp id" || c === "id"
      );
      const hasExpense = lowerCells.some(
        (c) =>
          c.includes("exp") ||
          c.includes("amount") ||
          c.includes("claim") ||
          c.includes("allowance") ||
          c.includes("travel") ||
          c.includes("payable") ||
          c.includes("bill")
      );
      const hasAdvance = lowerCells.some(
        (c) => c.includes("advance") || c.includes("adv") || c.includes("imprest")
      );

      if (hasName && (hasCode || hasExpense || hasAdvance)) {
        headerRowIndex = r;

        lowerCells.forEach((c, idx) => {
          if (c === "s" || c === "sl" || c === "sr" || c === "s.no" || c === "sno" || c.includes("serial")) colIndexMap.sNo = idx;
          else if (c.includes("name of") || c.includes("employee name") || c === "name" || c.includes("employe") || c.includes("staff name")) colIndexMap.name = idx;
          else if (c.includes("emp id") || c.includes("emp code") || c === "emp" || c === "code" || c === "employee code") colIndexMap.code = idx;
          else if (c.includes("activity") || c === "act") colIndexMap.activity = idx;
          else if (c.includes("location") || c === "locatio" || c === "loc" || c === "site" || c === "station") colIndexMap.location = idx;
          else if (c.includes("prev") && c.includes("bal")) colIndexMap.prevBal = idx;
          else if (c.includes("prev") && c.includes("adv")) colIndexMap.prevPlusAdv = idx;
          else if (c.includes("advance") || c.includes("adv") || c.includes("imprest")) {
            if (colIndexMap.advance === -1) colIndexMap.advance = idx;
            const colHeaderName = cleanString(row[idx]) || `Advance #${colIndexMap.advanceCols.length + 1}`;
            colIndexMap.advanceCols.push({ name: colHeaderName, idx });
          }
          else if (c.includes("allowance") || c.includes("travel") || c.includes("exp") || c.includes("expense") || c.includes("claim") || c.includes("bill")) colIndexMap.expense = idx;
          else if (c.includes("in hand") || c.includes("inhand")) colIndexMap.inHand = idx;
          else if (c.includes("payable") || c.includes("rem") || c.includes("remaining") || c.includes("balance") || c.includes("net") || c.includes("due")) colIndexMap.remaining = idx;
        });

        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect table header row in reimbursement sheet (must contain Name, EMP code, and Expense columns)");
  }

  const extractedDate = extractReimbursementMonthYear(`${sheetTitle} ${fileName}`);
  const monthName = detectedMonthName || extractedDate.monthName;
  const month = extractedDate.month;
  const year = detectedYear || extractedDate.year;

  const { data: dbEmployees } = await supabase
    .from("employees")
    .select(`
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      company_id,
      work_details!work_details_employee_id_fkey (
        site_id,
        project_id,
        sites ( id, name, projects ( id, name ) ),
        projects ( id, name )
      )
    `)
    .eq("company_id", companyId);

  const employees: EmployeeRosterItem[] = (dbEmployees || []).map((e: any) => {
    const fullName = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ").trim();
    const rawWd = Array.isArray(e.work_details) ? e.work_details[0] : e.work_details;
    const siteName = rawWd?.sites?.name || "";
    const projectName = rawWd?.projects?.name || rawWd?.sites?.projects?.name || "";

    return {
      id: e.id,
      employee_code: cleanString(e.employee_code),
      numericCode: cleanString(e.employee_code).replace(/\D/g, ""),
      fullName,
      cleanName: cleanToken(fullName),
      tokens: extractNameTokens(fullName),
      siteName,
      projectName,
    };
  });

  const parsedItems: ParsedReimbursementRow[] = [];

  const stopKeywords = [
    "TOTAL",
    "GRAND TOTAL",
    "SUB TOTAL",
    "CANNY SHOULD RAISE",
    "PREVIOUS BAL+ADVANCE",
    "REIMBURSEMENT",
  ];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawName = colIndexMap.name !== -1 ? cleanString(row[colIndexMap.name]) : "";
    const rawCode = colIndexMap.code !== -1 ? cleanString(row[colIndexMap.code]) : "";

    const rowTextUpper = row.map((c) => cleanString(c).toUpperCase()).join(" ");
    const isStopRow = stopKeywords.some((keyword) => rowTextUpper.includes(keyword));
    if (isStopRow && !rawCode) {
      continue;
    }

    if (!rawName && !rawCode) {
      continue;
    }

    const location = colIndexMap.location !== -1 ? cleanString(row[colIndexMap.location]) : undefined;
    const activity = colIndexMap.activity !== -1 ? cleanString(row[colIndexMap.activity]) : undefined;
    const previousBalance = colIndexMap.prevBal !== -1 ? parseNumeric(row[colIndexMap.prevBal]) : 0;
    const advanceAmount = colIndexMap.advance !== -1 ? parseNumeric(row[colIndexMap.advance]) : 0;
    const expenseAmount = colIndexMap.expense !== -1 ? parseNumeric(row[colIndexMap.expense]) : 0;
    const inHandAmount = colIndexMap.inHand !== -1 ? parseNumeric(row[colIndexMap.inHand]) : 0;
    const remainingAmount = colIndexMap.remaining !== -1 ? parseNumeric(row[colIndexMap.remaining]) : 0;

    // Multi-Advance extraction across any detected advance columns
    const rowAdvances: Array<{ name: string; amount: number }> = [];
    if (colIndexMap.advanceCols && colIndexMap.advanceCols.length > 0) {
      colIndexMap.advanceCols.forEach((advCol, aIdx) => {
        const amt = parseNumeric(row[advCol.idx]);
        if (amt > 0) {
          rowAdvances.push({
            name: advCol.name || `Advance #${aIdx + 1}`,
            amount: amt,
          });
        }
      });
    }
    if (rowAdvances.length === 0 && advanceAmount > 0) {
      rowAdvances.push({
        name: "Advance #1",
        amount: advanceAmount,
      });
    }
    const totalAdvances = rowAdvances.length > 0
      ? rowAdvances.reduce((s, a) => s + a.amount, 0)
      : advanceAmount;

    const { matchedEmployee, matchType, candidateEmployees } =
      matchEmployeeWithRoster(rawName, rawCode, employees);

    const defaultAmount = expenseAmount > 0 ? expenseAmount : remainingAmount;
    const status: ParsedReimbursementRow["status"] = !matchedEmployee
      ? "unmatched"
      : defaultAmount <= 0
      ? "zero_amount"
      : "matched";

    parsedItems.push({
      rowNumber: r + 1,
      serialNo: String(r + 1),
      rawName,
      rawCode,
      employeeName: rawName,
      employeeCode: rawCode,
      location,
      activity,
      previousBalance,
      advanceAmount: totalAdvances,
      advances: rowAdvances,
      totalBalancePlusAdvance: previousBalance + totalAdvances,
      expenseAmount,
      inHandAmount,
      remainingAmount,
      netRemaining: remainingAmount,
      selectedAmount: defaultAmount,
      matchedEmployee: matchedEmployee
        ? {
            ...matchedEmployee,
            name: matchedEmployee.fullName,
          }
        : null,
      matchType,
      candidateEmployees,
      status,
    });
  }

  const matchedCount = parsedItems.filter((i) => i.status === "matched").length;
  const unmatchedCount = parsedItems.filter((i) => i.status === "unmatched").length;
  const totalExpenseAmount = parsedItems.reduce((acc, i) => acc + i.expenseAmount, 0);
  const totalRemainingAmount = parsedItems.reduce((acc, i) => acc + i.remainingAmount, 0);

  return {
    sheetTitle,
    monthName,
    monthNumber: month,
    year,
    month: monthName,
    fileName,
    fileType: "excel",
    items: parsedItems,
    rows: parsedItems,
    totalRows: parsedItems.length,
    matchedCount,
    unmatchedCount,
    totalExpenseAmount,
    totalRemainingAmount,
    totalNetRemaining: totalRemainingAmount,
    aiDetected,
    detectedColumns: {
      name: colIndexMap.name,
      code: colIndexMap.code,
      advance: colIndexMap.advance,
      expense: colIndexMap.expense,
      remaining: colIndexMap.remaining,
      location: colIndexMap.location,
      activity: colIndexMap.activity,
      prevBal: colIndexMap.prevBal,
      sNo: colIndexMap.sNo,
    },
    allEmployees: employees.map((e) => ({
      id: e.id,
      employee_code: e.employee_code,
      fullName: e.fullName,
      siteName: e.siteName,
      projectName: e.projectName,
    })),
  };
}

const ReimbursementPdfExtractionSchema = z.object({
  invoiceDetails: z
    .object({
      invoiceNumber: z
        .string()
        .optional()
        .describe("Invoice number if present on page 1, e.g. 2026-27/650, CMS/2026-27/650"),
      clientName: z
        .string()
        .optional()
        .describe("Billed to client / company name (e.g. COTECNA INSPECTION INDIA PVT. LTD)"),
      clientGstin: z
        .string()
        .optional()
        .describe("Client GSTIN if present (e.g. 23AACCC4428K1ZT)"),
      particulars: z
        .string()
        .optional()
        .describe("Description / particulars (e.g. Reimbursement of Expenses for Support Services during period Month of JULY - 2026 M.P. & MAHARASTRA)"),
      period: z
        .string()
        .optional()
        .describe("Period / month (e.g. Month of JULY - 2026)"),
      location: z
        .string()
        .optional()
        .describe("Location if mentioned on invoice (e.g. M.P. & MAHARASTRA, VIZAG)"),
      billableAmount: z
        .number()
        .describe("Base reimbursement amount before tax / charges (e.g. 50300)"),
      serviceChargeRate: z
        .number()
        .optional()
        .describe("Service charge percentage rate (e.g. 2 for 2%)"),
      serviceChargeAmount: z
        .number()
        .optional()
        .describe("Service charge amount (e.g. 1006)"),
      subtotalAmount: z
        .number()
        .optional()
        .describe("Subtotal amount (e.g. 51306)"),
      igstRate: z
        .number()
        .optional()
        .describe("IGST percentage rate (e.g. 18 for 18%)"),
      igstAmount: z
        .number()
        .optional()
        .describe("IGST tax amount (e.g. 9235)"),
      cgstRate: z.number().optional(),
      cgstAmount: z.number().optional(),
      sgstRate: z.number().optional(),
      sgstAmount: z.number().optional(),
      grandTotal: z
        .number()
        .optional()
        .describe("Grand total amount including taxes (e.g. 60541)"),
      hsnCode: z.string().optional(),
    })
    .optional(),
  sheetTitle: z
    .string()
    .optional()
    .describe("Heading of the travelling expenses breakdown table or bill (e.g. TRAVELLING EXPENSES FOR THE MONTH OF JULY'26 or Vehicle freight & Driver bill)"),
  monthName: z.string().optional().describe("Month name (e.g. July, August)"),
  year: z.number().optional().describe("Year (e.g. 2026)"),
  hasEmployeeSheet: z
    .boolean()
    .optional()
    .describe("True if page 2+ contains a multi-employee roster/table with employee codes & names; False if page 2 is a single vendor receipt, vehicle memo, handwritten bill, or direct invoice with no employee list sheet"),
  vendorDetails: z
    .object({
      vendorName: z.string().optional().describe("Proprietor / vendor / owner / payee name if this is a single vendor/vehicle bill (e.g. Rajababu Dangi)"),
      mobileNumber: z.string().optional().describe("Mobile / contact number on the receipt (e.g. 8287389029)"),
      bankName: z.string().optional().describe("Bank name (e.g. Bandhan Bank)"),
      accountNumber: z.string().optional().describe("Bank account number"),
      ifscCode: z.string().optional().describe("IFSC code (e.g. BDBL0001363)"),
      branchName: z.string().optional().describe("Branch name or code (e.g. Bina/1363)"),
      address: z.string().optional().describe("Address if present"),
      totalBillAmount: z.number().optional().describe("Total amount on the bill/receipt (e.g. 50300)"),
      breakdownItems: z
        .array(
          z.object({
            description: z.string().describe("Description e.g. Vehicle freight, Driver, Running"),
            amount: z.number().describe("Amount e.g. 22000, 10000, 18300"),
          })
        )
        .optional()
        .describe("Individual itemized expenses listed on the bill"),
    })
    .optional(),
  items: z.array(
    z.object({
      serialNo: z.string().optional().describe("Serial number (e.g. '1', '2')"),
      employeeName: z.string().describe("Full name of the employee as printed, or vendor/payee name"),
      employeeCode: z.string().optional().describe("Employee code / ID if present (e.g. '10231')"),
      activity: z.string().optional().describe("Activity if any (e.g. MIN, AGRI, VEHICLE)"),
      location: z.string().optional().describe("Location or site (e.g. VIZAG, KKD, RAIPUR, M.P. & MAHARASTRA)"),
      previousBalance: z.number().optional().describe("Previous balance if listed"),
      advanceAmount: z.number().optional().describe("Advance given to this employee for this period (e.g. 8000, 15000, 0)"),
      expenseAmount: z.number().describe("Expense incurred by employee (e.g. 9180, 1800, 2600, 50300)"),
      inHandAmount: z.number().optional().describe("In hand amount if any"),
      remainingAmount: z.number().optional().describe("Remaining / net reimbursement amount payable"),
    })
  ).default([]),
  totals: z
    .object({
      totalPreviousBalance: z.number().optional(),
      totalAdvance: z.number().optional(),
      totalExpense: z.number().optional(),
      totalInHand: z.number().optional(),
      totalRemaining: z.number().optional(),
      cannyBillAmount: z
        .number()
        .optional()
        .describe("CANNY SHOULD RAISE THE BILL amount"),
    })
    .optional(),
});

/**
 * Parses a Reimbursement PDF Buffer using Gemini Multimodal AI OCR,
 * extracting both Page 1 (Invoice summary) and Page 2+ (Travelling expenses table or Vendor bill attachment).
 */
export async function parseReimbursementPdfBuffer({
  buffer,
  fileName,
  companyId,
  supabase,
}: {
  buffer: Buffer;
  fileName: string;
  companyId: string;
  supabase: TypedSupabaseClient;
}): Promise<ParseReimbursementSheetResult> {
  const result = await generateObject({
    model: google(GEMINI_MAIN),
    system: `You are an expert financial auditor & OCR specialist for Canny Management Services.
Analyze this multi-page PDF document thoroughly across all pages:
1. PAGE 1 (Tax Invoice):
   - Check if Page 1 is an Invoice / Bill raised for Reimbursement of Expenses (e.g. to M/S COTECNA INSPECTION INDIA PVT. LTD).
   - Extract billableAmount (base amount before service charge and GST, e.g. 50,300 or 4,10,477), serviceChargeRate (e.g. 2%), serviceChargeAmount (e.g. 1,006), IGST / GST amounts, grand total (e.g. 60,541), particulars, client name, GSTIN, invoice number, period, and location.
2. PAGE 2+ (Attachment Analysis):
   Carefully check whether Page 2+ is:
   CASE A: A Multi-Employee Travelling Expense table / roster:
     - Table columns typically include: Serial No (S), NAME OF EMPLOYE, EMP ID, ACTIVITY, LOCATION, PREVIOUS BAL, AUG ADVANCE, EXP, IN HAND, REM.
     - Set hasEmployeeSheet = true.
     - Extract EVERY SINGLE ROW in the table without skipping or truncating (can be 50+ employees) into items.
   CASE B: A Direct Vendor Bill, Vehicle Memo, Support Service Receipt, or Handwritten Expense Bill (NO multi-employee sheet):
     - Example: Handwritten bill from Proprietor Rajababu Dangi with Vehicle freight (22,000), Driver (10,000), Running (18,300), Total = 50,300, Bandhan Bank details.
     - Set hasEmployeeSheet = false.
     - Extract vendorDetails (vendorName, mobileNumber, bankName, accountNumber, ifscCode, branchName, address, totalBillAmount, breakdownItems).
     - In "items", provide item(s) representing this reimbursement so it can be booked for the company:
       - Either the itemized breakdown or 1 combined item with employeeName = vendorName, expenseAmount = billableAmount (or totalBillAmount), location = invoice location, activity = "Support Services / Vehicle".
3. SUMMARY TOTALS:
   - Extract the totals row or bill summary if present.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: buffer,
            mimeType: "application/pdf",
          },
          {
            type: "text",
            text: `Extract all invoice details, employee travelling expense rows (or vendor/vehicle receipt breakdown), advances, and totals from this PDF file "${fileName}".`,
          },
        ],
      },
    ],
    schema: ReimbursementPdfExtractionSchema,
  });

  const extracted = result.object;

  const [{ data: dbEmployees }, { data: dbPayees }] = await Promise.all([
    supabase
      .from("employees")
      .select(`
        id,
        employee_code,
        first_name,
        middle_name,
        last_name,
        company_id,
        work_details!work_details_employee_id_fkey (
          site_id,
          project_id,
          sites ( id, name, projects ( id, name ) ),
          projects ( id, name )
        )
      `)
      .eq("company_id", companyId),
    supabase
      .from("payee")
      .select("id, name, account_holder_name, bank_name, account_number, ifsc_code, branch_name, type")
      .eq("company_id", companyId),
  ]);

  const employees: EmployeeRosterItem[] = (dbEmployees || []).map((e: any) => {
    const fullName = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ").trim();
    const rawWd = Array.isArray(e.work_details) ? e.work_details[0] : e.work_details;
    const siteName = rawWd?.sites?.name || "";
    const projectName = rawWd?.projects?.name || rawWd?.sites?.projects?.name || "";

    return {
      id: e.id,
      employee_code: cleanString(e.employee_code),
      numericCode: cleanString(e.employee_code).replace(/\D/g, ""),
      fullName,
      cleanName: cleanToken(fullName),
      tokens: extractNameTokens(fullName),
      siteName,
      projectName,
    };
  });

  const extractedDate = extractReimbursementMonthYear(
    `${extracted.sheetTitle || ""} ${extracted.invoiceDetails?.period || ""} ${fileName}`
  );
  const monthName = extracted.monthName || extractedDate.monthName;
  const month = extractedDate.month;
  const year = extracted.year || extractedDate.year;

  const parsedItems: ParsedReimbursementRow[] = [];

  for (let idx = 0; idx < (extracted.items || []).length; idx++) {
    const item = extracted.items[idx];
    const rawName = cleanString(item.employeeName);
    const rawCode = cleanString(item.employeeCode);

    if (!rawName && !rawCode) continue;

    const { matchedEmployee, matchType, candidateEmployees } =
      matchEmployeeWithRoster(rawName, rawCode, employees);

    const prevBal = item.previousBalance ?? 0;
    const advAmt = item.advanceAmount ?? 0;
    const expAmt = item.expenseAmount ?? 0;
    const inHandAmt = item.inHandAmount ?? 0;
    const remAmt = item.remainingAmount ?? Math.max(0, expAmt - advAmt);

    const rowAdvances: Array<{ name: string; amount: number }> = [];
    if (advAmt > 0) {
      rowAdvances.push({
        name: `${monthName || "Monthly"} Advance`,
        amount: advAmt,
      });
    }

    const defaultAmount = expAmt > 0 ? expAmt : remAmt;
    const status: ParsedReimbursementRow["status"] = !matchedEmployee
      ? "unmatched"
      : defaultAmount <= 0
      ? "zero_amount"
      : "matched";

    parsedItems.push({
      rowNumber: idx + 1,
      serialNo: item.serialNo || String(idx + 1),
      rawName,
      rawCode,
      employeeName: rawName,
      employeeCode: rawCode,
      location: cleanString(item.location),
      activity: cleanString(item.activity),
      previousBalance: prevBal,
      advanceAmount: advAmt,
      advances: rowAdvances,
      totalBalancePlusAdvance: prevBal + advAmt,
      expenseAmount: expAmt,
      inHandAmount: inHandAmt,
      remainingAmount: remAmt,
      netRemaining: remAmt,
      selectedAmount: defaultAmount,
      matchedEmployee: matchedEmployee
        ? {
            ...matchedEmployee,
            name: matchedEmployee.fullName,
          }
        : null,
      matchType,
      candidateEmployees,
      status,
    });
  }

  // Handle Scenario B: No multi-employee table found in attachment (e.g. vendor bill, vehicle memo, support services receipt)
  const isDirectExpense =
    extracted.hasEmployeeSheet === false ||
    parsedItems.length === 0 ||
    Boolean(
      extracted.vendorDetails?.vendorName &&
        parsedItems.length <= 1 &&
        !parsedItems[0]?.employeeCode,
    );

  if (isDirectExpense) {
    const billAmt =
      extracted.invoiceDetails?.billableAmount ||
      extracted.vendorDetails?.totalBillAmount ||
      extracted.totals?.cannyBillAmount ||
      (parsedItems[0]?.expenseAmount ?? 0);

    const vendorName =
      extracted.vendorDetails?.vendorName ||
      parsedItems[0]?.employeeName ||
      "Direct Vendor Reimbursement";

    // Match vendor name with existing company payee
    let matchedPayee: ParsedReimbursementRow["matchedPayee"] = null;
    const vendTokens = extractNameTokens(vendorName);
    for (const p of dbPayees || []) {
      if (!p.name) continue;
      const pTokens = extractNameTokens(p.name);
      const hasOverlap = vendTokens.some((vt) =>
        pTokens.some((pt) => areTokensSimilar(vt, pt)),
      );
      if (
        hasOverlap ||
        p.name.toLowerCase().includes(vendorName.toLowerCase()) ||
        vendorName.toLowerCase().includes(p.name.toLowerCase())
      ) {
        matchedPayee = {
          id: p.id,
          name: p.name,
          bankName: p.bank_name || undefined,
          accountNumber: p.account_number || undefined,
        };
        break;
      }
    }

    // Match with company employee if payee not matched
    let matchedEmployee: ParsedReimbursementRow["matchedEmployee"] = null;
    if (!matchedPayee) {
      const { matchedEmployee: empMatch } = matchEmployeeWithRoster(
        vendorName,
        "",
        employees,
      );
      if (empMatch) {
        matchedEmployee = {
          ...empMatch,
          name: empMatch.fullName,
        };
      }
    }

    // Auto-create payee payload if not already matched
    const autoCreatePayee =
      !matchedPayee && !matchedEmployee
        ? {
            name: vendorName,
            account_holder_name: vendorName,
            bank_name: extracted.vendorDetails?.bankName || "Bandhan Bank",
            account_number: extracted.vendorDetails?.accountNumber || "",
            ifsc_code: extracted.vendorDetails?.ifscCode || "BDBL0001363",
            branch_name: extracted.vendorDetails?.branchName || "Bina/1363",
            type: "vehicle",
          }
        : undefined;

    parsedItems.length = 0;
    parsedItems.push({
      rowNumber: 1,
      serialNo: "1",
      rawName: vendorName,
      rawCode: "",
      employeeName: vendorName,
      employeeCode: "",
      location: cleanString(
        extracted.invoiceDetails?.location ||
          extracted.vendorDetails?.address ||
          "M.P. & MAHARASTRA",
      ),
      activity: "Vehicle & Support Services",
      previousBalance: 0,
      advanceAmount: 0,
      advances: [],
      totalBalancePlusAdvance: 0,
      expenseAmount: billAmt,
      inHandAmount: 0,
      remainingAmount: billAmt,
      netRemaining: billAmt,
      selectedAmount: billAmt,
      matchedEmployee,
      matchedPayee,
      autoCreatePayee,
      matchType: matchedPayee
        ? "payee"
        : matchedEmployee
        ? "name"
        : "auto_payee",
      candidateEmployees: employees.map((e) => ({
        id: e.id,
        employee_code: e.employee_code,
        fullName: e.fullName,
        siteName: e.siteName,
        projectName: e.projectName,
      })),
      candidatePayees: (dbPayees || []).map((p) => ({
        id: p.id,
        name: p.name,
        bank_name: p.bank_name || undefined,
        account_number: p.account_number || undefined,
      })),
      status: "matched",
    });
  }

  const matchedCount = parsedItems.filter((i) => i.status === "matched").length;
  const unmatchedCount = parsedItems.filter((i) => i.status === "unmatched").length;
  const totalExpenseAmount =
    extracted.invoiceDetails?.billableAmount && extracted.invoiceDetails.billableAmount > 0
      ? extracted.invoiceDetails.billableAmount
      : parsedItems.reduce((acc, i) => acc + i.expenseAmount, 0);
  const totalRemainingAmount = parsedItems.reduce((acc, i) => acc + i.remainingAmount, 0);

  return {
    sheetTitle: extracted.sheetTitle || fileName,
    monthName,
    monthNumber: month,
    year,
    month: monthName,
    fileName,
    fileType: "pdf",
    hasEmployeeSheet: !isDirectExpense,
    vendorDetails: extracted.vendorDetails,
    invoiceDetails: extracted.invoiceDetails
      ? {
          invoiceNumber: extracted.invoiceDetails.invoiceNumber,
          clientName: extracted.invoiceDetails.clientName,
          clientGstin: extracted.invoiceDetails.clientGstin,
          particulars: extracted.invoiceDetails.particulars,
          period: extracted.invoiceDetails.period,
          location: extracted.invoiceDetails.location,
          billableAmount: extracted.invoiceDetails.billableAmount,
          serviceChargeRate: extracted.invoiceDetails.serviceChargeRate,
          serviceChargeAmount: extracted.invoiceDetails.serviceChargeAmount,
          subtotalAmount: extracted.invoiceDetails.subtotalAmount,
          igstRate: extracted.invoiceDetails.igstRate,
          igstAmount: extracted.invoiceDetails.igstAmount,
          cgstRate: extracted.invoiceDetails.cgstRate,
          cgstAmount: extracted.invoiceDetails.cgstAmount,
          sgstRate: extracted.invoiceDetails.sgstRate,
          sgstAmount: extracted.invoiceDetails.sgstAmount,
          grandTotal: extracted.invoiceDetails.grandTotal,
          hsnCode: extracted.invoiceDetails.hsnCode,
        }
      : undefined,
    items: parsedItems,
    rows: parsedItems,
    totalRows: parsedItems.length,
    matchedCount,
    unmatchedCount,
    totalExpenseAmount,
    totalRemainingAmount,
    totalNetRemaining: totalRemainingAmount,
    aiDetected: true,
    allEmployees: employees.map((e) => ({
      id: e.id,
      employee_code: e.employee_code,
      fullName: e.fullName,
      siteName: e.siteName,
      projectName: e.projectName,
    })),
    allPayees: (dbPayees || []).map((p) => ({
      id: p.id,
      name: p.name,
      account_holder_name: p.account_holder_name || undefined,
      bank_name: p.bank_name || undefined,
      account_number: p.account_number || undefined,
      ifsc_code: p.ifsc_code || undefined,
      branch_name: p.branch_name || undefined,
      type: p.type || undefined,
    })),
  };
}

/**
 * Universal Reimbursement File Parser:
 * Automatically routes .pdf files to Gemini Multimodal PDF OCR,
 * and .xlsx / .xls / .csv files to Excel Sheet Parser.
 */
export async function parseReimbursementFileBuffer({
  buffer,
  fileName,
  companyId,
  supabase,
}: {
  buffer: Buffer;
  fileName: string;
  companyId: string;
  supabase: TypedSupabaseClient;
}): Promise<ParseReimbursementSheetResult> {
  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return parseReimbursementPdfBuffer({ buffer, fileName, companyId, supabase });
  }
  return parseReimbursementExcelBuffer({ buffer, fileName, companyId, supabase });
}

/**
 * Automatically creates a combined Invoice for a batch of created Reimbursements
 * and links each reimbursement's invoice_id to the created invoice,
 * exactly like the manual Create-Invoice process does.
 */
export async function createCombinedInvoiceForReimbursements({
  supabase,
  companyId,
  reimbursementIds,
  totalAmount,
  submittedDate,
  siteName,
  departmentName,
  customSubject,
  invoiceDetails,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  reimbursementIds: string[];
  totalAmount: number;
  submittedDate?: string;
  siteName?: string;
  departmentName?: string;
  customSubject?: string;
  invoiceDetails?: {
    invoiceNumber?: string;
    clientName?: string;
    clientGstin?: string;
    particulars?: string;
    period?: string;
    location?: string;
    billableAmount?: number;
    serviceChargeRate?: number;
    serviceChargeAmount?: number;
    subtotalAmount?: number;
    igstRate?: number;
    igstAmount?: number;
    cgstRate?: number;
    cgstAmount?: number;
    sgstRate?: number;
    sgstAmount?: number;
    grandTotal?: number;
  };
}): Promise<{
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  totalAmount: number;
  linkedCount: number;
  error?: string;
}> {
  if (!reimbursementIds || reimbursementIds.length === 0 || totalAmount <= 0) {
    return {
      success: false,
      totalAmount: 0,
      linkedCount: 0,
      error: "No reimbursements or zero total amount provided for invoice generation",
    };
  }

  try {
    // 1. Resolve contractor/target company ID if subcontractor
    const { data: company } = await getCompanyById({ supabase, id: companyId });
    let targetCompanyId = companyId;
    if (company?.company_type === "sub_contractor" && company.contractor_id) {
      targetCompanyId = company.contractor_id;
    }

    // 2. Fetch company config and generate sequential invoice number
    const { data: companyConfig } = await getCompanyConfigByCompanyId({
      companyId: targetCompanyId,
      supabase,
    });

    const invoicePrefix = companyConfig?.invoice_prefix ?? "";
    const { data: latestInvoiceNumber } = await getLatestInvoiceByCompanyId({
      supabase,
      companyId: targetCompanyId,
      prefix: invoicePrefix,
    });

    const generatedNumber = generateInvoiceNumber(
      invoicePrefix,
      latestInvoiceNumber ?? undefined,
    );

    let targetInvoiceNumber = generatedNumber;
    if (invoiceDetails?.invoiceNumber) {
      const rawNo = invoiceDetails.invoiceNumber
        .trim()
        .replace(/^invoice\s*(?:no\.?|#)?\s*/i, "")
        .trim();
      if (invoicePrefix && !rawNo.toLowerCase().startsWith(invoicePrefix.toLowerCase())) {
        targetInvoiceNumber = `${invoicePrefix}/${rawNo.replace(/^\/+/, "")}`;
      } else {
        targetInvoiceNumber = rawNo;
      }
    }

    // 3. Resolve location / address ID for the invoice
    let addressId: string | null = null;
    const { data: companyLocations } = await getLocationsForSelectByCompanyId({
      companyId,
      supabase,
    });

    const locSearch = siteName || invoiceDetails?.location || "";
    if (companyLocations && companyLocations.length > 0) {
      if (locSearch) {
        const matchedLoc = companyLocations.find(
          (l) =>
            l?.name &&
            (locSearch.toLowerCase().includes(l.name.toLowerCase()) ||
              l.name.toLowerCase().includes(locSearch.toLowerCase()) ||
              (locSearch.toLowerCase().includes("vizag") &&
                l.name.toLowerCase().includes("vishakapatnam"))),
        );
        if (matchedLoc?.id) {
          addressId = matchedLoc.id;
        }
      }
      if (!addressId && companyLocations[0]?.id) {
        addressId = companyLocations[0].id;
      }
    } else {
      const { data: directLoc } = await supabase
        .from("company_locations")
        .select("id")
        .eq("company_id", companyId)
        .limit(1);

      if (directLoc && directLoc.length > 0) {
        addressId = directLoc[0].id;
      } else {
        const { data: anyLoc } = await supabase
          .from("company_locations")
          .select("id")
          .limit(1);

        if (anyLoc && anyLoc.length > 0) {
          addressId = anyLoc[0].id;
        } else {
          const { data: newLoc } = await supabase
            .from("company_locations")
            .insert({
              company_id: companyId,
              name: "HEAD OFFICE",
              address_line_1: "Main Office Address",
              city: "HEAD OFFICE",
              state: "HEAD OFFICE",
              pincode: "000000",
            })
            .select("id")
            .single();

          if (newLoc) {
            addressId = newLoc.id;
          }
        }
      }
    }

    if (!addressId) {
      return {
        success: false,
        totalAmount,
        linkedCount: 0,
        error: "Unable to find or create a valid company address for invoice",
      };
    }

    // 4. Format subject
    const invDate = submittedDate || new Date().toISOString().split("T")[0];
    let monthStr = "";
    const d = new Date(invDate);
    if (!isNaN(d.getTime())) {
      monthStr = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    }

    const defaultSubject =
      customSubject ||
      invoiceDetails?.particulars ||
      getDefaultInvoiceSubject("reimbursement", {
        siteName: siteName || invoiceDetails?.location || undefined,
        departmentName: departmentName || undefined,
        month: monthStr || invoiceDetails?.period || undefined,
      });

    // 5. Fetch active relationship for reimbursement charges
    let reimbursementCharge = 0;
    try {
      const { data: relations } = await getRelationshipsByCompanyId({
        companyId,
        supabase: supabase as any,
      });
      const manpowerRelation =
        (relations ?? []).find(
          (r: any) => r.relationship_type?.toLowerCase() === "manpower",
        ) ?? (relations ?? [])[0];
      const manpowerVersions = (manpowerRelation?.relationship_manpower_version ??
        []) as ManpowerVersion[];
      const sortedVersions = [...manpowerVersions].sort(
        (a, b) =>
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
      );
      const activeVersion =
        sortedVersions.find((v) => {
          const selectedDate = new Date(invDate);
          const startDate = new Date(v.start_date);
          const endDate = v.end_date ? new Date(v.end_date) : null;
          return selectedDate >= startDate && (!endDate || selectedDate <= endDate);
        }) || sortedVersions[0];

      reimbursementCharge = activeVersion?.reimbursement_charge ?? 0;
    } catch (e) {
      console.error("Failed to load reimbursement_charge:", e);
    }

    const hasServiceCharge =
      (invoiceDetails?.serviceChargeAmount ?? 0) > 0 ||
      (invoiceDetails?.serviceChargeRate ?? 0) > 0 ||
      reimbursementCharge > 0;

    const finalChargeRate =
      invoiceDetails?.serviceChargeRate ??
      (reimbursementCharge > 0 ? reimbursementCharge : hasServiceCharge ? 2 : 0);

    const includeIgst =
      (invoiceDetails?.igstAmount ?? 0) > 0 ||
      (hasServiceCharge && !invoiceDetails?.cgstAmount && !invoiceDetails?.sgstAmount);
    const includeCgst = (invoiceDetails?.cgstAmount ?? 0) > 0;
    const includeSgst = (invoiceDetails?.sgstAmount ?? 0) > 0;

    // 6. Construct invoice payload matching create-invoice.tsx
    const invoicePayload: InvoiceDatabaseInsert = {
      company_id: companyId,
      company_address_id: addressId,
      invoice_number: targetInvoiceNumber,
      date: invDate,
      subject: defaultSubject,
      type: "reimbursement",
      payroll_data: [
        {
          field: "REIMBURSEMENT",
          amount: Number(totalAmount.toFixed(2)),
        },
      ],
      include_charge: hasServiceCharge,
      charge_amount: finalChargeRate,
      include_cgst: includeCgst,
      include_sgst: includeSgst,
      include_igst: includeIgst,
      is_paid: false,
    };

    // 7. Create Invoice record in database
    const { data: createdInvoice, error: invErr } = await createInvoice({
      supabase,
      data: invoicePayload,
      bypassAuth: true,
    });

    if (invErr || !createdInvoice) {
      console.error("Error creating combined reimbursement invoice:", invErr);
      return {
        success: false,
        totalAmount,
        linkedCount: 0,
        error: invErr?.message || "Failed to create invoice in database",
      };
    }

    // 8. Link each created reimbursement to this invoice_id
    let linkedCount = 0;
    for (const reimbId of reimbursementIds) {
      const { error: linkErr } = await supabase
        .from("reimbursements")
        .update({ invoice_id: createdInvoice.id })
        .eq("id", reimbId);

      if (linkErr) {
        console.error(`Error linking reimbursement ${reimbId} to invoice:`, linkErr);
      } else {
        linkedCount++;
      }
    }

    return {
      success: true,
      invoiceId: createdInvoice.id,
      invoiceNumber: createdInvoice.invoice_number,
      totalAmount,
      linkedCount,
    };
  } catch (err: any) {
    console.error("createCombinedInvoiceForReimbursements Exception:", err);
    return {
      success: false,
      totalAmount,
      linkedCount: 0,
      error: err.message || String(err),
    };
  }
}

/**
 * Creates Reimbursement records in Supabase and automatically generates
 * a combined Invoice linking Advance -> Reimbursement -> Invoice.
 */
export async function createBatchReimbursements({
  supabase,
  companyId,
  userId,
  items,
  submittedDate,
  type = "expenses",
  status = "approved",
  defaultNote,
  createSplitAdvances = false,
  createCombinedInvoice = true,
  invoiceMode = "separate",
  customInvoiceAmount,
  invoiceDetails,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  userId?: string;
  items: Array<{
    employee_id?: string;
    payee_id?: string;
    autoCreatePayee?: {
      name: string;
      account_holder_name?: string;
      bank_name?: string;
      account_number?: string;
      ifsc_code?: string;
      branch_name?: string;
      type?: string;
    };
    amount: number;
    advanceAmount?: number;
    advances?: Array<{ name: string; amount: number }>;
    netRemaining?: number;
    expenseAmount?: number;
    note?: string;
    location?: string;
    activity?: string;
  }>;
  submittedDate: string;
  type?: string;
  status?: string;
  defaultNote?: string;
  createSplitAdvances?: boolean;
  createCombinedInvoice?: boolean;
  invoiceMode?: "separate" | "combined";
  customInvoiceAmount?: number;
  invoiceDetails?: any;
}) {
  if (!items || items.length === 0) {
    return {
      success: false,
      message: "No items provided for creation",
      createdCount: 0,
      createdAdvancesCount: 0,
      totalAmount: 0,
    };
  }

  const validItems = items.filter(
    (item) =>
      (item.employee_id || item.payee_id || item.autoCreatePayee) &&
      (item.amount > 0 ||
        (item.advanceAmount && item.advanceAmount > 0) ||
        (item.netRemaining && item.netRemaining > 0) ||
        (item.expenseAmount && item.expenseAmount > 0)),
  );

  if (validItems.length === 0) {
    return {
      success: false,
      message: "All items had 0 amount or missing employee/payee ID",
      createdCount: 0,
      createdAdvancesCount: 0,
      totalAmount: 0,
    };
  }

  // Auto-create Payee for items specifying autoCreatePayee without existing payee_id/employee_id
  for (const item of validItems) {
    if (item.autoCreatePayee && !item.payee_id && !item.employee_id) {
      const pName = item.autoCreatePayee.name.trim();
      const { data: existingPayee } = await supabase
        .from("payee")
        .select("id")
        .eq("company_id", companyId)
        .ilike("name", pName)
        .maybeSingle();

      if (existingPayee?.id) {
        item.payee_id = existingPayee.id;
      } else {
        const { data: newPayee, error: pErr } = await supabase
          .from("payee")
          .insert({
            company_id: companyId,
            name: pName,
            account_holder_name:
              item.autoCreatePayee.account_holder_name?.trim() || pName,
            bank_name: item.autoCreatePayee.bank_name?.trim() || "Bandhan Bank",
            account_number:
              item.autoCreatePayee.account_number?.trim() || "0000000000",
            ifsc_code: item.autoCreatePayee.ifsc_code?.trim() || "NA",
            branch_name: item.autoCreatePayee.branch_name?.trim() || "Main",
            account_type: "savings",
            type: item.autoCreatePayee.type || "vehicle",
          })
          .select("id")
          .single();

        if (pErr) {
          console.error("Error auto-creating payee:", pErr);
        } else if (newPayee?.id) {
          item.payee_id = newPayee.id;
        }
      }
    }
  }

  const createdReimbursementIds: string[] = [];
  let createdAdvancesCount = 0;
  let createdReimbursementsCount = 0;
  let totalCombinedAmount = 0;

  // Track reimbursements per recipient for separate invoicing
  const recipientReimbursementMap = new Map<
    string,
    {
      recipientKey: string;
      reimbursementIds: string[];
      totalAmount: number;
      location?: string;
      activity?: string;
    }
  >();

  function trackReimb(
    key: string,
    reimbId: string,
    amt: number,
    loc?: string,
    act?: string,
  ) {
    if (!recipientReimbursementMap.has(key)) {
      recipientReimbursementMap.set(key, {
        recipientKey: key,
        reimbursementIds: [],
        totalAmount: 0,
        location: loc,
        activity: act,
      });
    }
    const entry = recipientReimbursementMap.get(key)!;
    entry.reimbursementIds.push(reimbId);
    entry.totalAmount += amt;
    if (!entry.location && loc) entry.location = loc;
    if (!entry.activity && act) entry.activity = act;
  }

  // Deduplication: Query existing reimbursements and advances
  const employeeIds = Array.from(
    new Set(validItems.map((i) => i.employee_id).filter(Boolean)),
  ) as string[];
  const payeeIds = Array.from(
    new Set(validItems.map((i) => i.payee_id).filter(Boolean)),
  ) as string[];

  let existingReimbList: any[] = [];
  if (employeeIds.length > 0 || payeeIds.length > 0) {
    const reimbQuery = supabase
      .from("reimbursements")
      .select("id, employee_id, payee_id, amount, submitted_date, note, invoice_id")
      .eq("company_id", companyId)
      .eq("submitted_date", submittedDate);

    if (employeeIds.length > 0 && payeeIds.length > 0) {
      reimbQuery.or(
        `employee_id.in.(${employeeIds.join(",")}),payee_id.in.(${payeeIds.join(",")})`,
      );
    } else if (employeeIds.length > 0) {
      reimbQuery.in("employee_id", employeeIds);
    } else if (payeeIds.length > 0) {
      reimbQuery.in("payee_id", payeeIds);
    }
    const { data: rList } = await reimbQuery;
    existingReimbList = rList || [];
  }

  let existingAdvanceList: any[] = [];
  if (employeeIds.length > 0) {
    const { data: advList } = await supabase
      .from("employee_advance_details")
      .select("id, employee_id, amount, advance_date, advance_name, reimbursement_id")
      .eq("company_id", companyId)
      .in("employee_id", employeeIds)
      .eq("advance_date", submittedDate);
    existingAdvanceList = advList || [];
  }

  let skippedDuplicatesCount = 0;

  if (createSplitAdvances) {
    for (const item of validItems) {
      const recipientKey = (item.employee_id || item.payee_id || "recip") as string;
      const advAmt = Number(item.advanceAmount || 0);
      const remAmt = Number(item.netRemaining || 0);
      const expAmt = Number(item.expenseAmount || item.amount || 0);
      const baseNote = item.note || defaultNote || "Travelling Expenses";
      const locTag = item.location ? ` - ${item.location}` : "";
      const actTag = item.activity ? ` (${item.activity})` : "";

      const advanceList: Array<{ name: string; amount: number }> =
        item.advances && item.advances.length > 0
          ? item.advances.filter((a) => a.amount > 0)
          : advAmt > 0
          ? [{ name: "Advance", amount: advAmt }]
          : [];

      for (let i = 0; i < advanceList.length; i++) {
        const adv = advanceList[i];
        const advLabel =
          advanceList.length > 1
            ? adv.name || `Advance #${i + 1}`
            : "Advance";
        const expectedAdvNote = `${baseNote}${locTag}${actTag} - ${advLabel}`;

        const existingAdvReimb = (existingReimbList || []).find((er) => {
          const matchTarget = item.employee_id
            ? er.employee_id === item.employee_id
            : er.payee_id === item.payee_id;
          return (
            matchTarget &&
            Math.abs(Number(er.amount) - adv.amount) < 0.01 &&
            (er.note === expectedAdvNote ||
              (er.note || "").toLowerCase().includes("advance"))
          );
        });

        let reimbAdvId = existingAdvReimb?.id;

        if (existingAdvReimb) {
          skippedDuplicatesCount++;
          createdReimbursementIds.push(existingAdvReimb.id);
          totalCombinedAmount += adv.amount;
          trackReimb(
            recipientKey,
            existingAdvReimb.id,
            adv.amount,
            item.location,
            item.activity,
          );
        } else {
          const { data: reimbAdv, error: rAdvErr } = await supabase
            .from("reimbursements")
            .insert({
              company_id: companyId,
              employee_id: item.employee_id || null,
              payee_id: item.payee_id || null,
              amount: adv.amount,
              type: (type as any) || "expenses",
              status: (status as any) || "approved",
              submitted_date: submittedDate,
              note: expectedAdvNote,
              user_id: userId || null,
            })
            .select("id")
            .single();

          if (rAdvErr) {
            console.error(`Error creating ${advLabel} Reimbursement:`, rAdvErr);
          } else if (reimbAdv?.id) {
            reimbAdvId = reimbAdv.id;
            createdReimbursementsCount++;
            createdReimbursementIds.push(reimbAdv.id);
            totalCombinedAmount += adv.amount;
            trackReimb(
              recipientKey,
              reimbAdv.id,
              adv.amount,
              item.location,
              item.activity,
            );
          }
        }

        if (reimbAdvId && item.employee_id) {
          const existingAdvDetail = (existingAdvanceList || []).find(
            (ea) =>
              ea.employee_id === item.employee_id &&
              Math.abs(Number(ea.amount) - adv.amount) < 0.01,
          );

          if (!existingAdvDetail) {
            const { error: advErr } = await supabase
              .from("employee_advance_details")
              .insert({
                company_id: companyId,
                employee_id: item.employee_id,
                advance_name: expectedAdvNote,
                advance_date: submittedDate,
                amount: adv.amount,
                is_paid: false,
                reimbursement_id: reimbAdvId,
              });

            if (advErr) {
              console.error(
                `Error creating Advance Details for ${advLabel}:`,
                advErr,
              );
            } else {
              createdAdvancesCount++;
            }
          }
        }
      }

      if (remAmt > 0) {
        const claimSuffix =
          advanceList.length > 0 ? " - Remaining Claim" : "";
        const expectedRemNote = `${baseNote}${locTag}${actTag}${claimSuffix}`;

        const existingRemReimb = (existingReimbList || []).find((er) => {
          const matchTarget = item.employee_id
            ? er.employee_id === item.employee_id
            : er.payee_id === item.payee_id;
          return (
            matchTarget &&
            Math.abs(Number(er.amount) - remAmt) < 0.01 &&
            (er.note === expectedRemNote ||
              !(er.note || "").toLowerCase().includes("advance"))
          );
        });

        if (existingRemReimb) {
          skippedDuplicatesCount++;
          createdReimbursementIds.push(existingRemReimb.id);
          totalCombinedAmount += remAmt;
          trackReimb(
            recipientKey,
            existingRemReimb.id,
            remAmt,
            item.location,
            item.activity,
          );
        } else {
          const { data: reimbRem, error: rRemErr } = await supabase
            .from("reimbursements")
            .insert({
              company_id: companyId,
              employee_id: item.employee_id || null,
              payee_id: item.payee_id || null,
              amount: remAmt,
              type: (type as any) || "expenses",
              status: (status as any) || "approved",
              submitted_date: submittedDate,
              note: expectedRemNote,
              user_id: userId || null,
            })
            .select("id")
            .single();

          if (rRemErr) {
            console.error("Error creating Remaining Reimbursement:", rRemErr);
          } else if (reimbRem?.id) {
            createdReimbursementsCount++;
            createdReimbursementIds.push(reimbRem.id);
            totalCombinedAmount += remAmt;
            trackReimb(
              recipientKey,
              reimbRem.id,
              remAmt,
              item.location,
              item.activity,
            );
          }
        }
      }

      if (advanceList.length === 0 && remAmt <= 0 && expAmt > 0) {
        const expectedFallbackNote = `${baseNote}${locTag}${actTag}`;
        const existingFallback = (existingReimbList || []).find((er) => {
          const matchTarget = item.employee_id
            ? er.employee_id === item.employee_id
            : er.payee_id === item.payee_id;
          return (
            matchTarget && Math.abs(Number(er.amount) - expAmt) < 0.01
          );
        });

        if (existingFallback) {
          skippedDuplicatesCount++;
          createdReimbursementIds.push(existingFallback.id);
          totalCombinedAmount += expAmt;
          trackReimb(
            recipientKey,
            existingFallback.id,
            expAmt,
            item.location,
            item.activity,
          );
        } else {
          const { data: reimbFallback } = await supabase
            .from("reimbursements")
            .insert({
              company_id: companyId,
              employee_id: item.employee_id || null,
              payee_id: item.payee_id || null,
              amount: expAmt,
              type: (type as any) || "expenses",
              status: (status as any) || "approved",
              submitted_date: submittedDate,
              note: expectedFallbackNote,
              user_id: userId || null,
            })
            .select("id")
            .single();

          if (reimbFallback?.id) {
            createdReimbursementsCount++;
            createdReimbursementIds.push(reimbFallback.id);
            totalCombinedAmount += expAmt;
            trackReimb(
              recipientKey,
              reimbFallback.id,
              expAmt,
              item.location,
              item.activity,
            );
          }
        }
      }
    }
  } else {
    // Standard single reimbursement creation with deduplication
    const newItemsToInsert: typeof validItems = [];

    for (const item of validItems) {
      const recipientKey = (item.employee_id || item.payee_id || "recip") as string;
      const existing = (existingReimbList || []).find((er) => {
        const matchTarget = item.employee_id
          ? er.employee_id === item.employee_id
          : er.payee_id === item.payee_id;
        return (
          matchTarget && Math.abs(Number(er.amount) - item.amount) < 0.01
        );
      });

      if (existing) {
        skippedDuplicatesCount++;
        createdReimbursementIds.push(existing.id);
        totalCombinedAmount += item.amount;
        trackReimb(
          recipientKey,
          existing.id,
          item.amount,
          item.location,
          item.activity,
        );
      } else {
        newItemsToInsert.push(item);
      }
    }

    if (newItemsToInsert.length > 0) {
      const records = newItemsToInsert.map((item) => ({
        company_id: companyId,
        employee_id: item.employee_id || null,
        payee_id: item.payee_id || null,
        amount: item.amount,
        type: (type as any) || "expenses",
        status: (status as any) || "approved",
        submitted_date: submittedDate,
        note: item.note || defaultNote || "Staff Travelling Expenses",
        user_id: userId || null,
      }));

      const { data, error } = await supabase
        .from("reimbursements")
        .insert(records)
        .select("id");

      if (error) {
        console.error("createBatchReimbursements Supabase error:", error);
        return {
          success: false,
          message:
            error.message || "Failed to insert reimbursements into database",
          createdCount: 0,
          createdAdvancesCount: 0,
          totalAmount: 0,
          error,
        };
      }

      if (data && data.length > 0) {
        createdReimbursementsCount += data.length;
        data.forEach((r, idx) => {
          createdReimbursementIds.push(r.id);
          const it = newItemsToInsert[idx];
          if (it) {
            const recipientKey = (it.employee_id || it.payee_id || "recip") as string;
            trackReimb(recipientKey, r.id, it.amount, it.location, it.activity);
            totalCombinedAmount += it.amount;
          }
        });
      }
    }
  }

  // Final Automated Step: Create Invoice(s) & Link Advance -> Reimbursement -> Invoice
  const createdInvoices: Array<{
    invoiceId?: string;
    invoiceNumber?: string;
    totalAmount: number;
  }> = [];

  const alreadyLinkedInvoiceIds = Array.from(
    new Set(
      (existingReimbList || [])
        .filter((er) => createdReimbursementIds.includes(er.id) && er.invoice_id)
        .map((er) => er.invoice_id!)
    ),
  );

  if (
    createCombinedInvoice &&
    createdReimbursementsCount === 0 &&
    alreadyLinkedInvoiceIds.length > 0
  ) {
    const { data: existingInv } = await supabase
      .from("invoice")
      .select("id, invoice_number, payroll_data")
      .eq("id", alreadyLinkedInvoiceIds[0])
      .maybeSingle();

    if (existingInv) {
      createdInvoices.push({
        invoiceId: existingInv.id,
        invoiceNumber: existingInv.invoice_number,
        totalAmount: totalCombinedAmount,
      });
    }
  } else if (
    createCombinedInvoice &&
    createdReimbursementIds.length > 0 &&
    (totalCombinedAmount > 0 || (customInvoiceAmount && customInvoiceAmount > 0))
  ) {
    const effectiveInvoiceMode = invoiceMode || "combined";
    if (effectiveInvoiceMode === "combined") {
      const siteNames = Array.from(
        new Set(
          validItems
            .map((item) => (item.location || "").trim())
            .filter(Boolean),
        ),
      );
      const invoiceTotal =
        customInvoiceAmount && customInvoiceAmount > 0
          ? customInvoiceAmount
          : totalCombinedAmount;

      const res = await createCombinedInvoiceForReimbursements({
        supabase,
        companyId,
        reimbursementIds: createdReimbursementIds,
        totalAmount: invoiceTotal,
        submittedDate,
        siteName: siteNames.length > 0 ? siteNames.join(", ") : undefined,
        customSubject: defaultNote,
        invoiceDetails,
      });
      if (res.success && res.invoiceId) {
        createdInvoices.push(res);
      }
    } else {
      // Separate invoice per recipient
      for (const entry of recipientReimbursementMap.values()) {
        if (
          entry.reimbursementIds.length === 0 ||
          entry.totalAmount <= 0
        ) {
          continue;
        }
        const res = await createCombinedInvoiceForReimbursements({
          supabase,
          companyId,
          reimbursementIds: entry.reimbursementIds,
          totalAmount: entry.totalAmount,
          submittedDate,
          siteName: entry.location,
          customSubject: defaultNote,
          invoiceDetails,
        });
        if (res.success && res.invoiceId) {
          createdInvoices.push(res);
        }
      }
    }
  }

  const finalInvoiceAmount =
    customInvoiceAmount && customInvoiceAmount > 0
      ? customInvoiceAmount
      : totalCombinedAmount;

  const invoiceSummaryText =
    createdInvoices.length > 1
      ? `Generated ${createdInvoices.length} Separate Invoices (#${createdInvoices[0]?.invoiceNumber} to #${createdInvoices[createdInvoices.length - 1]?.invoiceNumber})`
      : createdInvoices.length === 1
      ? `Generated Single Combined Invoice #${createdInvoices[0]?.invoiceNumber}`
      : "";

  const duplicateNotice =
    skippedDuplicatesCount > 0
      ? ` (${skippedDuplicatesCount} already existing item(s) detected and safely preserved without duplicates)`
      : "";

  const successMessage =
    createdReimbursementsCount === 0 && skippedDuplicatesCount > 0
      ? `All ${skippedDuplicatesCount} record(s) for this month are already recorded in the system${createdInvoices.length > 0 ? ` (Invoice #${createdInvoices[0].invoiceNumber})` : ""}. No duplicate entries were created.`
      : invoiceSummaryText
      ? `Created ${createdAdvancesCount > 0 ? `${createdAdvancesCount} Advance(s) & ` : ""}${createdReimbursementsCount} Reimbursement(s), and ${invoiceSummaryText} (Total ₹${finalInvoiceAmount.toLocaleString("en-IN")}) with reimbursement charges & GST.${duplicateNotice}`
      : `Created ${createdAdvancesCount > 0 ? `${createdAdvancesCount} Advance(s) and ` : ""}${createdReimbursementsCount} Reimbursement(s) totaling ₹${finalInvoiceAmount.toLocaleString("en-IN")}.${duplicateNotice}`;

  return {
    success: true,
    message: successMessage,
    createdCount: createdReimbursementsCount,
    createdAdvancesCount,
    totalAmount: finalInvoiceAmount,
    invoiceId: createdInvoices[0]?.invoiceId,
    invoiceNumber: createdInvoices[0]?.invoiceNumber,
    createdInvoicesCount: createdInvoices.length,
    invoiceLinkedCount: createdInvoices.length,
  };
}

