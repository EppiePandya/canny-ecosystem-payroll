import * as XLSX from "xlsx";
import type { TypedSupabaseClient } from "@canny_ecosystem/supabase/types";
import {
  createAttendanceByPayrollImportAndGiveID,
  createSalaryPayroll,
  deletePayroll,
} from "@canny_ecosystem/supabase/mutations";
import {
  calculateSalaryTotalNetAmount,
  getMonthNumberFromName,
  getMonthNameFromNumber,
  generateCompanyPrefix,
  generateEmployeeCodes,
} from "@canny_ecosystem/utils";
import { getLatestEmployeeByCompanyId } from "@canny_ecosystem/supabase/queries";
import { classifyHeadersWithAI } from "@/utils/ai/salary-import";

export interface ParsedFileMetadata {
  companyName: string;
  siteName: string;
  month: number;
  year: number;
  originalFilename: string;
}

export interface VarianceAuditItem {
  employeeCode: string;
  employeeName: string;
  component: string;
  previousValue: number;
  currentValue: number;
  difference: number;
  note: string;
}

export interface ProcessPayrollResult {
  status: "success" | "error" | "skipped" | "already_imported";
  message: string;
  payrollId?: string;
  companyId?: string;
  siteId?: string;
  month: number;
  year: number;
  totalEmployees: number;
  totalNetAmount: number;
  variances: VarianceAuditItem[];
  autoCreatedCount?: number;
  autoCreatedEmployees?: Array<{ name: string; code: string; designation?: string }>;
  error?: any;
  payrollTitle?: string;
  isAlreadyImported?: boolean;
}

export function isValidEmployeeCode(code?: string): boolean {
  if (!code) return false;
  const s = code.trim().toLowerCase();
  return (
    s !== "" &&
    s !== "null" &&
    s !== "undefined" &&
    s !== "n/a" &&
    s !== "na" &&
    s !== "none" &&
    s !== "auto" &&
    s !== "-" &&
    s !== "--" &&
    s !== "." &&
    s !== "new" &&
    s !== "new employee" &&
    s !== "new_employee"
  );
}

export function splitEmployeeName(fullName: string): { firstName: string; middleName: string; lastName: string } {
  const cleanName = (fullName || "Unknown").trim().replace(/\s+/g, " ");
  const parts = cleanName.split(" ");
  let firstName = parts[0] || "Unknown";
  let middleName = "";
  let lastName = "";

  if (parts.length > 2) {
    middleName = parts[1];
    lastName = parts.slice(2).join(" ");
  } else if (parts.length === 2) {
    lastName = parts[1];
  } else {
    lastName = firstName;
  }

  if (firstName.length < 3) firstName = firstName.padEnd(3, ".");
  if (lastName.length < 3) lastName = lastName.padEnd(3, ".");

  return { firstName, middleName, lastName };
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
];

/**
 * Parses filename to extract Company, Site, Month, and Year
 */
export function extractMetadataFromFilename(filename: string): ParsedFileMetadata {
  const cleanName = filename.replace(/\.(xlsx|xls|csv)$/i, "").trim();
  const parts = cleanName.split(/[-_ ]+/).filter(Boolean);

  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;
  let companyName = "";
  let siteName = "";

  const remainingParts: string[] = [];
  const NOISE_WORDS = [
    "salary", "sheet", "for", "the", "month", "of", "payroll",
    "attendance", "wage", "wages", "data", "register", "report", "siding", "worker", "workers"
  ];

  for (const part of parts) {
    const num = Number(part);
    if (!Number.isNaN(num) && num >= 2000 && num <= 2100) {
      year = num;
      continue;
    }

    const lower = part.toLowerCase();
    if (MONTH_NAMES.includes(lower)) {
      const mNum = getMonthNumberFromName(part);
      if (mNum) {
        month = mNum;
        continue;
      }
    }

    if (NOISE_WORDS.includes(lower)) {
      continue;
    }

    remainingParts.push(part);
  }

  if (remainingParts.length === 1) {
    companyName = remainingParts[0];
  } else if (remainingParts.length >= 2) {
    companyName = remainingParts[0];
    siteName = remainingParts.slice(1).join(" ");
  } else {
    companyName = cleanName;
  }

  return {
    companyName,
    siteName,
    month,
    year,
    originalFilename: filename,
  };
}

function normalizeHeader(header: any): string {
  if (header === null || header === undefined) return "";
  return String(header)
    .trim()
    .toUpperCase()
    .replace(/[\s\.\-_@%]+/g, "_");
}

function cleanMatchString(val: any): string {
  if (!val) return "";
  return String(val).trim().toUpperCase().replace(/[\s\.\-_]+/g, "");
}

function cleanToken(str: string): string {
  if (!str) return "";
  return str.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeNameTokens(name: string): string[] {
  if (!name) return [];
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["MR", "MRS", "MS", "DR", "SH", "SHRI", "SMT", "LATE"].includes(t));
}

function areNameTokensMatching(nameA: string, nameB: string): boolean {
  const tokensA = normalizeNameTokens(nameA);
  const tokensB = normalizeNameTokens(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Exact set match (e.g. "GANGADHAR MANDAL" vs "MANDAL GANGADHAR")
  if (tokensA.length === tokensB.length) {
    const setB = new Set(tokensB);
    if (tokensA.every((t) => setB.has(t))) return true;
  }

  // If one has middle name and other has only first & last name
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const setB = new Set(tokensB);
    const setA = new Set(tokensA);
    const firstA = tokensA[0];
    const lastA = tokensA[tokensA.length - 1];
    const firstB = tokensB[0];
    const lastB = tokensB[tokensB.length - 1];
    if (setB.has(firstA) && setB.has(lastA)) return true;
    if (setA.has(firstB) && setA.has(lastB)) return true;
  }

  return false;
}

const STANDARD_BASE_FIELD_TOKENS = new Set([
  "BASIC",
  "HRA",
  "DA",
  "LTA",
  "OVERTIME",
  "BONUS",
  "PF",
  "ESI",
  "PT",
  "LWF",
  "TDS",
  "ADVANCE",
  "CONVEYANCE",
  "EXPENSES",
  "SPECIALALLOWANCE",
  "STATUTORYBONUS",
  "STATUTORYLEAVE",
  "EFFICIENCYBONUS",
]);

function findMatchingCompanyField(
  headerText: string,
  companyFields?: Array<{ id: string; name: string; display_name?: string | null; type?: string }>,
  fileContext?: { siteName?: string; companyName?: string }
): { key: string; type: "earning" | "deduction" } | null {
  if (!companyFields || companyFields.length === 0 || !headerText) return null;

  const normHeader = cleanToken(headerText);
  if (!normHeader) return null;

  const isHeaderOT = (normHeader.includes("OVERTIME") || normHeader.includes("OT")) && !normHeader.includes("OTHER") && !normHeader.includes("ATTENDANCE");
  const isHeaderEfficiency = normHeader.includes("EFFICIEN");
  const isHeaderStatBonus = normHeader.includes("STAT") && normHeader.includes("BONUS");
  const isHeaderStatLeave = normHeader.includes("STAT") && normHeader.includes("LEAVE");
  const isHeaderLTA = normHeader === "LTA" || normHeader.includes("LEAVETRAVEL") || normHeader.includes("LTA");
  const isHeaderPF = normHeader.startsWith("PF") || normHeader.includes("PROVIDENT");
  const isHeaderESI = normHeader.startsWith("ESI") || normHeader.startsWith("ESIC");
  const isHeaderBasic = normHeader.startsWith("BASIC");
  const isHeaderHRA = normHeader.includes("HRA") || normHeader.includes("HOUSERENT");
  const isHeaderDA = normHeader === "DA" || normHeader.includes("DEARNESS") || normHeader.includes("VDA");
  const isHeaderBonus = normHeader.includes("BONUS") && !isHeaderStatBonus && !isHeaderEfficiency;

  let targetCategory = "";
  if (isHeaderOT) targetCategory = "OT";
  else if (isHeaderEfficiency) targetCategory = "EFFICIENCY";
  else if (isHeaderStatBonus) targetCategory = "STAT_BONUS";
  else if (isHeaderStatLeave) targetCategory = "STAT_LEAVE";
  else if (isHeaderLTA) targetCategory = "LTA";
  else if (isHeaderPF) targetCategory = "PF";
  else if (isHeaderESI) targetCategory = "ESI";
  else if (isHeaderBasic) targetCategory = "BASIC";
  else if (isHeaderHRA) targetCategory = "HRA";
  else if (isHeaderDA) targetCategory = "DA";
  else if (isHeaderBonus) targetCategory = "BONUS";

  if (targetCategory) {
    const candidates: Array<{ field: (typeof companyFields)[0]; score: number }> = [];
    for (const field of companyFields) {
      const normName = cleanToken(field.name);
      const normDisp = cleanToken(field.display_name || "");

      let isMatch = false;
      if (targetCategory === "OT") {
        isMatch = (normName.includes("OVERTIME") || normName.includes("OT") || normDisp.includes("OVERTIME") || normDisp.includes("OT")) && !normName.includes("OTHER") && !normDisp.includes("OTHER");
      } else if (targetCategory === "EFFICIENCY") {
        isMatch = normName.includes("EFFICIEN") || normDisp.includes("EFFICIEN");
      } else if (targetCategory === "STAT_BONUS") {
        isMatch = normName.includes("STAT") && normName.includes("BONUS");
      } else if (targetCategory === "STAT_LEAVE") {
        isMatch = normName.includes("STAT") && normName.includes("LEAVE");
      } else if (targetCategory === "LTA") {
        isMatch = normName === "LTA" || normName.includes("LEAVETRAVEL") || normName.includes("LTA") || normDisp === "LTA";
      } else if (targetCategory === "PF") {
        isMatch = normName.startsWith("PF") || normName.includes("PROVIDENT");
      } else if (targetCategory === "ESI") {
        isMatch = normName.startsWith("ESI") || normName.startsWith("ESIC");
      } else if (targetCategory === "BASIC") {
        isMatch = normName.startsWith("BASIC");
      } else if (targetCategory === "HRA") {
        isMatch = normName.includes("HRA") || normName.includes("HOUSERENT");
      } else if (targetCategory === "DA") {
        isMatch = normName === "DA" || normName.includes("DEARNESS") || normName.includes("VDA");
      } else if (targetCategory === "BONUS") {
        isMatch = (normName.includes("BONUS") || normDisp.includes("BONUS")) &&
          !normName.includes("STAT") && !normDisp.includes("STAT") &&
          !normName.includes("EFFICIEN") && !normDisp.includes("EFFICIEN");
      }

      if (isMatch) {
        let score = 1000 - field.name.length;
        if (STANDARD_BASE_FIELD_TOKENS.has(normName) || STANDARD_BASE_FIELD_TOKENS.has(normDisp)) {
          score += 20000;
        }
        if (fileContext?.siteName) {
          const cleanSite = cleanToken(fileContext.siteName);
          if (cleanSite && (normName.includes(cleanSite) || normDisp.includes(cleanSite))) {
            score += 50000;
          }
        }
        if (fileContext?.companyName) {
          const cleanComp = cleanToken(fileContext.companyName);
          if (cleanComp && (normName.includes(cleanComp) || normDisp.includes(cleanComp))) {
            score += 30000;
          }
        }
        candidates.push({ field, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const bestField = candidates[0].field;
      return {
        key: bestField.name,
        type: (bestField.type as "earning" | "deduction") || (["PF", "ESI"].includes(targetCategory) ? "deduction" : "earning"),
      };
    }
  }

  // PASS 2: Exact Clean Token Match if no domain category matched
  for (const field of companyFields) {
    const normName = cleanToken(field.name);
    const normDisp = cleanToken(field.display_name || "");

    if (normHeader === normName || normHeader === normDisp) {
      return {
        key: field.name,
        type: (field.type as "earning" | "deduction") || "earning",
      };
    }
  }

  return null;
}

function mapHeaderToKey(
  normalized: string,
  rawText?: string,
  companyFields?: Array<{ id: string; name: string; display_name?: string | null; type?: string }>,
  fileContext?: { siteName?: string; companyName?: string }
): { key: string; isAttendance: boolean; type?: "earning" | "deduction" } {
  const cleanNorm = cleanToken(rawText || normalized);

  if (
    normalized.startsWith("DEGN") ||
    normalized.startsWith("DESIGNATION") ||
    normalized === "DESG" ||
    normalized === "ROLE" ||
    normalized === "POSITION" ||
    cleanNorm === "DESIGNATION" ||
    cleanNorm === "DEGN" ||
    cleanNorm === "DESG"
  ) {
    return { key: "designation", isAttendance: false };
  }

  if (
    normalized === "LOCATION" ||
    normalized === "SITE" ||
    normalized === "SITE_NAME" ||
    normalized === "PROJECT_SITE" ||
    cleanNorm === "LOCATION" ||
    cleanNorm === "SITE" ||
    cleanNorm === "SITENAME"
  ) {
    return { key: "site_name", isAttendance: false };
  }

  if (
    cleanNorm === "RATE" ||
    cleanNorm === "DAILYRATE" ||
    cleanNorm === "WAGERATE" ||
    cleanNorm === "BASICRATE" ||
    cleanNorm === "RATEPERDAY" ||
    cleanNorm === "PM" ||
    cleanNorm === "PERMONTH" ||
    cleanNorm === "RATEPM" ||
    normalized === "PM" ||
    normalized === "P_M" ||
    cleanNorm.startsWith("SRNO") ||
    cleanNorm.startsWith("SLNO") ||
    cleanNorm.startsWith("SNO") ||
    normalized === "SR_NO" ||
    normalized === "SL_NO" ||
    normalized === "S_NO" ||
    normalized.startsWith("SR_") ||
    normalized.startsWith("SL_") ||
    normalized === "RATE" ||
    normalized === "DAILY_RATE" ||
    normalized === "WAGE_RATE" ||
    normalized === "BASIC_RATE" ||
    cleanNorm === "ACTUALWAGES" ||
    cleanNorm === "ACTUALWAGE" ||
    cleanNorm === "TOTALWAGES" ||
    cleanNorm === "EARNEDWAGES" ||
    normalized.includes("ACTUAL_WAGE") ||
    normalized.includes("TOTAL_WAGE") ||
    normalized.includes("EARNED_WAGE") ||
    normalized.includes("TOTAL_EARNING") ||
    normalized.includes("FATHER") ||
    normalized.includes("MOTHER") ||
    normalized.includes("HUSBAND") ||
    normalized.includes("SPOUSE") ||
    normalized.includes("PARENT") ||
    normalized.includes("GENDER") ||
    normalized.includes("SEX") ||
    normalized === "GN" ||
    normalized.includes("DOB") ||
    normalized.includes("DOJ") ||
    normalized.includes("BIRTH") ||
    normalized.includes("JOINING") ||
    normalized.includes("BANK") ||
    normalized.includes("ACCOUNT") ||
    normalized.includes("IFSC") ||
    normalized.includes("AADHAR") ||
    normalized.includes("PAN") ||
    normalized.includes("DEPARTMENT") ||
    normalized.includes("AREA") ||
    normalized.includes("REMARK") ||
    normalized.includes("REMARKS") ||
    normalized.includes("GROSS") ||
    normalized.includes("TOTAL_DEDUCT") ||
    normalized.includes("TOTAL_DED") ||
    normalized.includes("NET_PAY") ||
    normalized.includes("NET_AMOUNT") ||
    normalized.includes("NET_SALARY") ||
    normalized.includes("NET_PAYMENT") ||
    normalized.includes("TAKE_HOME")
  ) {
    return { key: "IGNORE", isAttendance: false };
  }

  if (
    normalized.includes("EMP_CODE") ||
    normalized.includes("EMPCODE") ||
    normalized === "CODE" ||
    normalized === "EMP_ID" ||
    normalized === "CARD_NO"
  ) {
    return { key: "employee_code", isAttendance: false };
  }
  if (normalized.includes("UAN")) {
    return { key: "uan_number", isAttendance: false };
  }
  if (normalized.includes("ESIC_NO") || normalized.includes("ESIC_NUMBER") || normalized.includes("IP_NO")) {
    return { key: "esic_number", isAttendance: false };
  }
  if (
    normalized.includes("WORKMEN") ||
    normalized.includes("EMPLOYEE_NAME") ||
    normalized.includes("EMP_NAME") ||
    normalized === "NAME" ||
    normalized === "NAME_OF_WORKMEN"
  ) {
    return { key: "employee_name", isAttendance: false };
  }

  if (
    normalized.includes("DESIGNATION") ||
    normalized.includes("POSITION") ||
    normalized.includes("ROLE")
  ) {
    return { key: "designation", isAttendance: false };
  }
  if (
    normalized.includes("SITE") ||
    normalized.includes("LOCATION") ||
    normalized.includes("BRANCH") ||
    normalized.includes("ESIC_AREA") ||
    cleanNorm.includes("ESICAREA")
  ) {
    return { key: "site_name", isAttendance: false };
  }

  if (
    normalized.includes("WORKING") ||
    normalized.includes("TOTAL_DAYS") ||
    normalized.includes("MONTH_DAYS") ||
    normalized.includes("STD_DAYS") ||
    normalized.startsWith("W_DAY") ||
    normalized.startsWith("WDAY") ||
    normalized === "W_DAYS" ||
    normalized === "WDAYS"
  ) {
    return { key: "working_days", isAttendance: true };
  }
  if (
    normalized.startsWith("ATTN") ||
    normalized.startsWith("ATTEN") ||
    normalized.includes("PRESENT") ||
    normalized.includes("WORKED") ||
    normalized.includes("PAID_DAYS") ||
    normalized.startsWith("P_DAY") ||
    normalized.startsWith("PDAY") ||
    normalized === "P_DAYS" ||
    normalized === "PDAYS"
  ) {
    return { key: "present_days", isAttendance: true };
  }
  if (normalized.includes("ABSENT") || normalized.includes("LWP")) {
    return { key: "absent_days", isAttendance: true };
  }
  if (cleanNorm === "OT") {
    return { key: "overtime_hours", isAttendance: true };
  }
  if (
    normalized.includes("OT_HOURS") ||
    normalized.includes("OVERTIME_HOURS") ||
    normalized.includes("OT_HRS") ||
    normalized.includes("OT_DAYS")
  ) {
    return { key: "overtime_hours", isAttendance: true };
  }
  if (normalized.includes("PAID_HOLIDAYS") || normalized === "PH") {
    return { key: "paid_holidays", isAttendance: true };
  }
  if (normalized.includes("PAID_LEAVES") || normalized === "PL" || normalized === "EL") {
    return { key: "paid_leaves", isAttendance: true };
  }

  if (normalized.includes("EXPENSES") || normalized.includes("EXPENSE")) {
    const expField = companyFields?.find((f) => {
      const n = cleanToken(f.name);
      const d = cleanToken(f.display_name || "");
      return n.includes("EXPENSE") || d.includes("EXPENSE");
    });
    return {
      key: expField?.name || "EXPENSES",
      isAttendance: false,
      type: (expField?.type as "earning" | "deduction") || "earning",
    };
  }

  if (normalized.includes("BONUS") && !normalized.includes("EFFICIEN") && !normalized.includes("STAT")) {
    return { key: "BONUS", isAttendance: false, type: "earning" };
  }

  if (companyFields && companyFields.length > 0 && rawText) {
    const matchedField = findMatchingCompanyField(rawText, companyFields, fileContext);
    if (matchedField) {
      return { key: matchedField.key, isAttendance: false, type: matchedField.type };
    }
  }

  if (normalized.startsWith("PF") || normalized.includes("PROVIDENT") || normalized.includes("EPF")) {
    return { key: "PF", isAttendance: false, type: "deduction" };
  }
  if (normalized.startsWith("ESI") || normalized.includes("ESIC")) {
    return { key: "ESI", isAttendance: false, type: "deduction" };
  }
  if (normalized.startsWith("PT") || normalized.includes("PROFESSIONAL_TAX")) {
    return { key: "PT", isAttendance: false, type: "deduction" };
  }
  if (normalized.includes("LWF") || normalized.includes("LABOUR_WELFARE")) {
    return { key: "LWF", isAttendance: false, type: "deduction" };
  }
  if (normalized.includes("TDS") || normalized.includes("TAX") || normalized.includes("INCOME_TAX")) {
    return { key: "TDS", isAttendance: false, type: "deduction" };
  }
  if (normalized.includes("ADVANCE") || normalized.includes("LOAN")) {
    return { key: "ADVANCE", isAttendance: false, type: "deduction" };
  }
  if (normalized.includes("TOTAL_DEDUCT") || normalized.includes("TOTAL_DED")) {
    return { key: "TOTAL_DEDUCTIONS", isAttendance: false, type: "deduction" };
  }
  if (normalized.includes("OTHER_DEDUCT") || normalized.includes("PENALTY") || normalized.includes("FINE")) {
    return { key: "OTHER_DEDUCTIONS", isAttendance: false, type: "deduction" };
  }

  if (
    normalized.startsWith("BASIC") ||
    normalized.includes("RATE_OF_BASIC") ||
    cleanNorm.includes("RATEOFBASIC") ||
    normalized.endsWith("_BASIC")
  ) {
    return { key: "BASIC", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("HRA") || normalized.includes("HOUSE_RENT")) {
    return { key: "HRA", isAttendance: false, type: "earning" };
  }
  if (normalized === "VDA" || normalized.includes("VARIABLE_DA") || cleanNorm === "VDA") {
    return { key: "VDA", isAttendance: false, type: "earning" };
  }
  if (normalized === "DA" || normalized.includes("DEARNESS")) {
    return { key: "DA", isAttendance: false, type: "earning" };
  }
  if (
    normalized.includes("OTHER_ALL") ||
    normalized.includes("OTHER_ALLOW") ||
    cleanNorm.includes("OTHERALL") ||
    cleanNorm.includes("OTHERALLOW")
  ) {
    return { key: "OTHER_ALLOWANCE", isAttendance: false, type: "earning" };
  }
  if (
    normalized.includes("EFFICIENCY") ||
    normalized.includes("EFFICIENCE")
  ) {
    return { key: "EFFICIENCY_BONUS", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("STATUTORY_BONUS") || normalized.includes("STAT_BONUS")) {
    return { key: "STATUTORY_BONUS", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("STATUTORY_LEAVE") || normalized.includes("STAT_LEAVE") || normalized.includes("LEAVE_ENCASHMENT") || normalized.includes("LEAVE_MINIR")) {
    return { key: "STATUTORY_LEAVE", isAttendance: false, type: "earning" };
  }
  if (normalized === "LTA" || normalized.includes("LTA") || normalized.includes("LEAVE_TRAVEL")) {
    return { key: "LTA", isAttendance: false, type: "earning" };
  }
  if (
    (normalized.includes("OVERTIME") || normalized.includes("OT_AMOUNT") || normalized.includes("OT_WAGES") || normalized.startsWith("OT_") || normalized.endsWith("_OT") || normalized.includes("_OT_")) &&
    !normalized.includes("OTHER") &&
    !normalized.includes("HOURS") &&
    !normalized.includes("HRS")
  ) {
    return { key: "OVERTIME", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("BONUS")) {
    return { key: "BONUS", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("CONVEYANCE") || normalized.includes("TRANSPORT")) {
    return { key: "CONVEYANCE", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("SPECIAL_ALLOWANCE") || normalized.includes("SPL_ALLOW")) {
    return { key: "SPECIAL_ALLOWANCE", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("NET_PAY") || normalized.includes("NET_AMOUNT") || normalized.includes("NET_SALARY")) {
    return { key: "NET_PAY", isAttendance: false, type: "earning" };
  }
  if (normalized.includes("GROSS")) {
    return { key: "GROSS", isAttendance: false, type: "earning" };
  }

  return { key: normalized, isAttendance: false, type: "earning" };
}

export async function processPayrollExcel({
  fileBuffer,
  filename,
  supabase,
  overrideCompanyId,
  overrideSiteId,
  forceOverwrite = false,
}: {
  fileBuffer: Buffer;
  filename: string;
  supabase: TypedSupabaseClient;
  overrideCompanyId?: string;
  overrideSiteId?: string;
  forceOverwrite?: boolean;
}): Promise<ProcessPayrollResult> {
  try {
    const meta = extractMetadataFromFilename(filename);

    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        status: "error",
        message: "Excel workbook contains no sheets.",
        month: meta.month,
        year: meta.year,
        totalEmployees: 0,
        totalNetAmount: 0,
        variances: [],
      };
    }

    // Pre-scan all sheets to refine month and year if filename lacked them
    for (const sName of workbook.SheetNames) {
      const ws = workbook.Sheets[sName];
      if (!ws) continue;
      const sampleRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      for (let r = 0; r < Math.min(sampleRows.length, 12); r++) {
        const titleText = (sampleRows[r] || []).join(" ").toLowerCase();
        for (const mName of MONTH_NAMES) {
          if (titleText.includes(mName)) {
            const mNum = getMonthNumberFromName(mName);
            if (mNum) meta.month = mNum;
          }
        }
        const yearMatch = titleText.match(/\b(20\d\d)\b/);
        if (yearMatch) {
          meta.year = Number(yearMatch[1]);
        }
      }
    }

    let companyId = overrideCompanyId;
    if (!companyId) {
      const { data: companies } = await supabase
        .from("companies")
        .select("id, company_name")
        .ilike("company_name", `%${meta.companyName}%`)
        .limit(1);

      if (companies && companies.length > 0) {
        companyId = companies[0].id;
      } else {
        const { data: anyCompany } = await supabase
          .from("companies")
          .select("id, company_name")
          .limit(1);
        companyId = anyCompany?.[0]?.id;
      }
    }

    if (!companyId) {
      return {
        status: "error",
        message: `No company found in database. Please configure company first.`,
        month: meta.month,
        year: meta.year,
        totalEmployees: 0,
        totalNetAmount: 0,
        variances: [],
      };
    }

    const { data: dbFields } = await supabase
      .from("payment_fields")
      .select("id, name, display_name, type")
      .eq("company_id", companyId);

    const { data: allSites } = await supabase
      .from("sites")
      .select("id, name, project_id")
      .eq("company_id", companyId);

    const { data: allProjects } = await supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId);

    let siteId = overrideSiteId || null;
    if (!siteId) {
      const targetSiteSearch = meta.siteName || meta.companyName;
      if (targetSiteSearch && allSites && allSites.length > 0) {
        const cleanTarget = cleanMatchString(targetSiteSearch);
        const matchedSite = allSites.find((s) => {
          const sClean = cleanMatchString(s.name);
          return sClean === cleanTarget || sClean.includes(cleanTarget) || cleanTarget.includes(sClean);
        });

        if (matchedSite) {
          siteId = matchedSite.id;
        }
      }
    }

    const { data: allEmployees, error: empFetchErr } = await supabase
      .from("employees")
      .select(`
        id,
        employee_code,
        first_name,
        middle_name,
        last_name,
        company_id,
        employee_statutory_details (
          uan_number,
          esic_number
        ),
        employee_salary_assignment (
          id,
          monthly_ctc,
          employee_salary_components (
            *,
            payment_fields (*)
          )
        )
      `)
      .eq("company_id", companyId);

    if (empFetchErr) {
      return {
        status: "error",
        message: `Error loading employees for company ID: ${companyId}.`,
        month: meta.month,
        year: meta.year,
        totalEmployees: 0,
        totalNetAmount: 0,
        variances: [],
        error: empFetchErr,
      };
    }

    const employeeList = allEmployees || [];
    const empByCode = new Map<string, (typeof employeeList)[0]>();
    const empByUan = new Map<string, (typeof employeeList)[0]>();
    const empByEsic = new Map<string, (typeof employeeList)[0]>();
    const empByName = new Map<string, (typeof employeeList)[0]>();

    for (const emp of employeeList) {
      if (emp.employee_code && isValidEmployeeCode(emp.employee_code)) {
        empByCode.set(cleanMatchString(emp.employee_code), emp);
      }
      const rawStat = emp.employee_statutory_details;
      const statList = Array.isArray(rawStat) ? rawStat : rawStat ? [rawStat] : [];
      for (const stat of statList) {
        if (stat?.uan_number) {
          const cleanStatUan = String(stat.uan_number).replace(/[^0-9]/g, "");
          if (cleanStatUan) empByUan.set(cleanMatchString(cleanStatUan), emp);
        }
        if (stat?.esic_number) {
          const cleanStatEsic = String(stat.esic_number).replace(/[^0-9]/g, "");
          if (cleanStatEsic) empByEsic.set(cleanMatchString(cleanStatEsic), emp);
        }
      }
      const fullName = `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`;
      const cleanName = cleanMatchString(fullName);
      if (cleanName) {
        empByName.set(cleanName, emp);
      }
      const firstLast = `${emp.first_name || ""} ${emp.last_name || ""}`;
      const cleanFirstLast = cleanMatchString(firstLast);
      if (cleanFirstLast) {
        empByName.set(cleanFirstLast, emp);
      }
    }

    // Determine target company prefix for auto-generating employee codes
    const { data: companyPrefixes } = await supabase
      .from("company_prefix")
      .select("name, is_default, site_id")
      .eq("company_id", companyId);

    const defaultPrefixRow =
      (siteId ? companyPrefixes?.find((p: any) => p.site_id === siteId) : null) ||
      companyPrefixes?.find((p: any) => p.is_default === true) ||
      companyPrefixes?.find((p: any) => p.site_id === null) ||
      companyPrefixes?.[0];

    let companyPrefix = defaultPrefixRow?.name;

    // Fallback prefix: check existing employees code pattern
    if (!companyPrefix) {
      for (const emp of employeeList) {
        if (emp.employee_code && isValidEmployeeCode(emp.employee_code)) {
          const match = emp.employee_code.match(/^([A-Za-z0-9/_ -]+?)(\d+)$/);
          if (match && match[1]) {
            companyPrefix = match[1];
            break;
          }
        }
      }
    }

    if (!companyPrefix) {
      const { data: companyData } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .single();
      companyPrefix = companyData?.name ? generateCompanyPrefix(companyData.name) : "EMP";
    }

    const { data: latestCodeData } = await getLatestEmployeeByCompanyId({
      supabase,
      companyId,
      prefix: companyPrefix,
    });

    const usedCodes = new Set<string>();
    employeeList.forEach((e) => {
      if (e.employee_code) usedCodes.add(e.employee_code.trim().toUpperCase());
    });

    let currentLastCode = latestCodeData || "";

    // Pre-scan all sheets for existing codes to advance currentLastCode
    for (const sName of workbook.SheetNames) {
      const ws = workbook.Sheets[sName];
      if (!ws) continue;
      const sData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      for (let r = 0; r < sData.length; r++) {
        const row = sData[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim();
          if (isValidEmployeeCode(val)) {
            usedCodes.add(val.toUpperCase());
            if (companyPrefix && val.toUpperCase().startsWith(companyPrefix.toUpperCase())) {
              const numMatch = val.match(/\d+$/);
              const curMatch = currentLastCode.match(/\d+$/);
              if (numMatch) {
                const num = Number(numMatch[0]);
                const curNum = curMatch ? Number(curMatch[0]) : 0;
                if (num > curNum) {
                  currentLastCode = val;
                }
              }
            }
          }
        }
      }
    }

    const { data: existingPayroll } = await supabase
      .from("payroll")
      .select("id, title, total_employees, total_net_amount, status, created_at")
      .eq("company_id", companyId)
      .eq("month", meta.month)
      .eq("year", meta.year)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPayroll?.id && (existingPayroll.total_employees ?? 0) > 0 && !forceOverwrite) {
      const monthName = getMonthNameFromNumber(meta.month);
      return {
        status: "already_imported",
        isAlreadyImported: true,
        message: `Payroll data for ${monthName} ${meta.year} is already imported in the system (${existingPayroll.total_employees} employee records found in "${existingPayroll.title}"). If this Excel sheet was already imported, please click "Mark Done" to mark it as processed and rename it with [PROCESSED] so it won't show here again.`,
        payrollId: existingPayroll.id,
        payrollTitle: existingPayroll.title,
        companyId,
        month: meta.month,
        year: meta.year,
        totalEmployees: existingPayroll.total_employees || 0,
        totalNetAmount: existingPayroll.total_net_amount || 0,
        variances: [],
      };
    }

    if (existingPayroll?.id) {
      await deletePayroll({ id: existingPayroll.id, supabase, bypassAuth: true });
    }

    const salaryImportData: any[] = [];
    const transformedSalaryEntries: any[] = [];
    const uniqueComponentsSet = new Map<string, { type: string; consider_for_epf: boolean; consider_for_esic: boolean }>();
    const variances: VarianceAuditItem[] = [];
    const autoCreatedEmployees: Array<{ name: string; code: string; designation?: string }> = [];
    const processedSheetsSummary: Array<{ sheetName: string; employeeCount: number; netAmount: number }> = [];
    const processedEmployeeIds = new Set<string>();

    // Process each sheet independently to preserve exact columns, wages, and allowances
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      if (!sheetData || sheetData.length === 0) continue;

      // 1. Detect header row specifically for this sheet
      let headerRowIdx = -1;
      let headerMappings: Array<{ colIdx: number; raw: string; key: string; isAttendance: boolean; type?: "earning" | "deduction" }> = [];

      for (let r = 0; r < Math.min(sheetData.length, 25); r++) {
        const row = sheetData[r];
        if (!Array.isArray(row)) continue;

        let matchScore = 0;
        const currentMappings: typeof headerMappings = [];

        for (let c = 0; c < row.length; c++) {
          const cellText = String(row[c] || "").trim();
          if (!cellText) continue;

          const normalized = normalizeHeader(cellText);
          const mapped = mapHeaderToKey(normalized, cellText, dbFields || [], { siteName: sheetName, companyName: meta.companyName });

          if (
            ["employee_code", "uan_number", "esic_number", "employee_name"].includes(mapped.key) ||
            mapped.key === "BASIC" ||
            mapped.key === "PF" ||
            mapped.key === "ESI" ||
            mapped.key === "present_days"
          ) {
            matchScore++;
          }

          currentMappings.push({
            colIdx: c,
            raw: cellText,
            key: mapped.key,
            isAttendance: mapped.isAttendance,
            type: mapped.type,
          });
        }

        if (matchScore >= 2) {
          headerRowIdx = r;
          headerMappings = currentMappings;
          break;
        }
      }

      // If no valid employee table header found in this sheet, skip it (e.g., instructions/notes tab)
      if (headerRowIdx === -1 || headerMappings.length === 0) {
        continue;
      }

      // Check title rows above header for site or period clues
      for (let r = 0; r < headerRowIdx; r++) {
        const titleText = (sheetData[r] || []).join(" ").toLowerCase();
        for (const mName of MONTH_NAMES) {
          if (titleText.includes(mName)) {
            const mNum = getMonthNumberFromName(mName);
            if (mNum) meta.month = mNum;
          }
        }
        const yearMatch = titleText.match(/\b(20\d\d)\b/);
        if (yearMatch) {
          meta.year = Number(yearMatch[1]);
        }
      }

      // 2. AI header classification specifically for this sheet's columns
      try {
        const rawHeaderRow = sheetData[headerRowIdx] || [];
        const rawHeaders = rawHeaderRow.map((c: any) => String(c || "").trim()).filter(Boolean);
        const aiMap = await classifyHeadersWithAI(rawHeaders, dbFields || []);

        if (aiMap.size > 0) {
          const refinedMappings: typeof headerMappings = [];
          for (let c = 0; c < rawHeaderRow.length; c++) {
            const cellText = String(rawHeaderRow[c] || "").trim();
            if (!cellText) continue;

            const aiClass = aiMap.get(cellText);
            if (aiClass) {
              let key = "IGNORE";
              let isAttendance = false;
              let type: "earning" | "deduction" | undefined = undefined;

              if (aiClass.category === "employee_code") key = "employee_code";
              else if (aiClass.category === "uan_number") key = "uan_number";
              else if (aiClass.category === "esic_number") key = "esic_number";
              else if (aiClass.category === "employee_name") key = "employee_name";
              else if (aiClass.category === "designation") key = "designation";
              else if (aiClass.category === "site_name" || aiClass.category === "location") key = "site_name";
              else if (aiClass.category === "present_days") { key = "present_days"; isAttendance = true; }
              else if (aiClass.category === "working_days") {
                const normCell = cleanToken(cellText);
                if (normCell === "PM" || normCell === "PERMONTH" || normCell === "RATEPM" || normCell.includes("RATE")) {
                  key = "IGNORE";
                  isAttendance = false;
                } else {
                  key = "working_days";
                  isAttendance = true;
                }
              }
              else if (aiClass.category === "absent_days") { key = "absent_days"; isAttendance = true; }
              else if (aiClass.category === "overtime_hours") { key = "overtime_hours"; isAttendance = true; }
              else if (aiClass.category === "earning" || aiClass.category === "deduction") {
                const matchedDbField = findMatchingCompanyField(cellText, dbFields || [], { siteName: sheetName, companyName: meta.companyName });
                key = matchedDbField?.key || aiClass.systemKey || normalizeHeader(cellText);
                type = (aiClass.category as "earning" | "deduction");
              } else if (aiClass.category === "ignore") {
                key = "IGNORE";
              }

              refinedMappings.push({
                colIdx: c,
                raw: cellText,
                key,
                isAttendance,
                type,
              });
            } else {
              const normalized = normalizeHeader(cellText);
              const mapped = mapHeaderToKey(normalized, cellText, dbFields || [], { siteName: sheetName, companyName: meta.companyName });
              refinedMappings.push({
                colIdx: c,
                raw: cellText,
                key: mapped.key,
                isAttendance: mapped.isAttendance,
                type: mapped.type,
              });
            }
          }
          headerMappings = refinedMappings;
        }
      } catch (aiErr) {
        console.error("AI header refinement error for sheet", sheetName, aiErr);
      }

      // Rule engine fallback for this sheet
      if (dbFields && dbFields.length > 0) {
        headerMappings = headerMappings.map((map) => {
          if (
            [
              "employee_code",
              "uan_number",
              "esic_number",
              "employee_name",
              "designation",
              "site_name",
              "present_days",
              "working_days",
              "absent_days",
              "overtime_hours",
              "paid_holidays",
              "paid_leaves",
              "IGNORE",
            ].includes(map.key)
          ) {
            return map;
          }

          const normalized = normalizeHeader(map.raw);
          const mapped = mapHeaderToKey(normalized, map.raw, dbFields, { siteName: sheetName, companyName: meta.companyName });
          return {
            ...map,
            key: mapped.key !== normalized || !map.key ? mapped.key : map.key,
            isAttendance: mapped.isAttendance,
            type: map.type || mapped.type,
          };
        });
      }

      // Disambiguate duplicate efficiency columns
      const efficiencyMappings = headerMappings.filter(
        (m) => m.key.includes("EFFICIEN") || cleanToken(m.raw).includes("EFFICIEN")
      );
      if (efficiencyMappings.length > 1) {
        const basicColIdx = headerMappings.find((m) => m.key === "BASIC")?.colIdx ?? -1;
        for (const m of efficiencyMappings) {
          if (basicColIdx !== -1 && m.colIdx < basicColIdx) {
            m.key = "IGNORE";
            m.isAttendance = false;
          }
        }
      }

      // Match sheetName to a Site in DB if available (e.g., "NEW Delhi", "UP. - HARYANA", "RAJASTHAN")
      let sheetSiteId = siteId;
      if (allSites && allSites.length > 0) {
        const cleanSheet = cleanMatchString(sheetName);
        const matchedSite = allSites.find((s) => {
          const sClean = cleanMatchString(s.name);
          return sClean === cleanSheet || sClean.includes(cleanSheet) || cleanSheet.includes(sClean);
        });
        if (matchedSite) {
          sheetSiteId = matchedSite.id;
        }
      }

      let currentSectionSiteName = "";
      let sheetEmployeeCount = 0;
      let sheetNetSum = 0;

      for (let r = headerRowIdx + 1; r < sheetData.length; r++) {
        const row = sheetData[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        const firstFewCells = row.slice(0, 4).map((c) => String(c || "").toUpperCase()).join(" ");
        if (firstFewCells.includes("TOTAL") || firstFewCells.includes("SUMMARY") || firstFewCells.includes("GRAND")) {
          continue;
        }

        let rawCode = "";
        let rawUan = "";
        let rawEsic = "";
        let rawName = "";
        let rawDesignation = "";
        let rawSiteName = "";
        const attendance: Record<string, any> = {
          working_days: 26,
          present_days: 0,
          absent_days: 0,
          overtime_hours: 0,
          paid_holidays: 0,
          paid_leaves: 0,
          casual_leaves: 0,
        };
        const components: Record<string, any> = {};

        for (const map of headerMappings) {
          const cellVal = row[map.colIdx];
          if (cellVal === undefined || cellVal === null || cellVal === "") continue;

          const strVal = String(cellVal).trim();
          const numVal = Number(strVal.replace(/[^0-9.-]+/g, "")) || 0;

          if (map.key === "employee_code") {
            rawCode = strVal;
          } else if (map.key === "uan_number") {
            rawUan = strVal;
          } else if (map.key === "esic_number") {
            rawEsic = strVal;
          } else if (map.key === "employee_name") {
            rawName = strVal;
          } else if (map.key === "designation") {
            rawDesignation = strVal;
          } else if (map.key === "site_name") {
            rawSiteName = strVal;
          } else if (map.isAttendance) {
            if (map.key === "working_days") {
              // Working days in a calendar month cannot exceed 31.
              // If a wage rate like 14842 or 8034 was picked up, preserve default working days (26).
              if (numVal >= 1 && numVal <= 31) {
                attendance.working_days = Math.round(numVal);
              }
            } else if (map.key === "present_days") {
              if (numVal >= 0 && numVal <= 31) {
                attendance.present_days = Math.round(numVal);
              }
            } else if (map.key === "overtime_hours") {
              attendance.overtime_hours = numVal;
            } else {
              attendance[map.key] = Math.round(numVal);
            }
          } else if (!["NET_PAY", "GROSS", "TOTAL_DEDUCTIONS", "IGNORE", "designation", "site_name"].includes(map.key)) {
            // Keep the exact numerical value from the Excel sheet without alteration
            components[map.key] = {
              amount: numVal,
              type: map.type || "earning",
              consider_for_epf: ["BASIC", "DA", "VDA", "SPECIAL_ALLOWANCE"].includes(map.key),
              consider_for_esic: map.type === "earning",
            };
          }
        }

        const isExplicitNewKeyword = cleanToken(rawCode) === "NEW" || rawCode.trim().toUpperCase() === "NEW";
        const hasValidCode = isValidEmployeeCode(rawCode);
        const rowGross = Object.values(components)
          .filter((c: any) => c.type === "earning")
          .reduce((sum, c: any) => sum + (c.amount || 0), 0);
        const hasEarningsOrAttendance = rowGross > 0 || (attendance.present_days && attendance.present_days > 0);

        if (!isExplicitNewKeyword && !hasValidCode && !hasEarningsOrAttendance) {
          const rowText = row.map((c) => String(c || "").trim()).filter(Boolean).join(" ");
          if (allSites && allSites.length > 0 && rowText) {
            const cleanRowText = cleanMatchString(rowText);
            const foundSectionSite = allSites.find((s) => {
              const sClean = cleanMatchString(s.name);
              return cleanRowText.includes(sClean) || sClean.includes(cleanRowText);
            });
            if (foundSectionSite) {
              currentSectionSiteName = foundSectionSite.name;
            }
          }
          continue;
        }

        // Match existing employee
        let matchedEmp: (typeof employeeList)[0] | undefined;
        if (hasValidCode) {
          matchedEmp = empByCode.get(cleanMatchString(rawCode));
        }

        const cleanUan = rawUan ? rawUan.replace(/[^0-9]/g, "") : "";
        if (!matchedEmp && cleanUan && cleanUan.length >= 10) {
          matchedEmp = empByUan.get(cleanMatchString(cleanUan));
        }

        const cleanEsic = rawEsic ? rawEsic.replace(/[^0-9]/g, "") : "";
        if (!matchedEmp && cleanEsic && cleanEsic.length >= 8) {
          matchedEmp = empByEsic.get(cleanMatchString(cleanEsic));
        }

        if (!matchedEmp && rawName) {
          matchedEmp = empByName.get(cleanMatchString(rawName));
        }

        if (!matchedEmp && rawName && rawName.trim().length >= 3) {
          matchedEmp = employeeList.find((emp) => {
            const fullName = `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`.trim();
            return areNameTokensMatching(rawName, fullName);
          });
        }

        // Backfill statutory details if missing in DB
        if (matchedEmp && (cleanUan || cleanEsic)) {
          const rawStat = matchedEmp.employee_statutory_details;
          const stat = Array.isArray(rawStat) ? rawStat[0] : rawStat;
          const missingUan = !stat?.uan_number && cleanUan && cleanUan.length >= 10;
          const missingEsic = !stat?.esic_number && cleanEsic && cleanEsic.length >= 8;
          if (missingUan || missingEsic) {
            if (!stat) {
              await supabase.from("employee_statutory_details").insert({
                employee_id: matchedEmp.id,
                uan_number: cleanUan || null,
                esic_number: cleanEsic || null,
              });
            } else {
              await supabase
                .from("employee_statutory_details")
                .update({
                  ...(missingUan ? { uan_number: cleanUan } : {}),
                  ...(missingEsic ? { esic_number: cleanEsic } : {}),
                })
                .eq("employee_id", matchedEmp.id);
            }
          }
        }

        // Auto-create NEW employee on the fly
        if (!matchedEmp) {
          if (!isExplicitNewKeyword || !hasEarningsOrAttendance) {
            continue;
          }

          const cleanName = rawName.trim();
          if (
            !cleanName ||
            cleanName.length < 2 ||
            cleanName.toUpperCase().includes("TOTAL") ||
            cleanName.toUpperCase().includes("SUMMARY") ||
            cleanName.toUpperCase().includes("NAME OF WORKMEN") ||
            cleanName.toUpperCase().includes("GROUP")
          ) {
            continue;
          }

          let newCode = "";
          let codeAttempts = 0;
          while (!newCode || usedCodes.has(newCode.toUpperCase())) {
            codeAttempts++;
            const generatedList = generateEmployeeCodes(companyPrefix, 1, currentLastCode || undefined);
            const candidate = generatedList[0];
            currentLastCode = candidate;
            if (!usedCodes.has(candidate.toUpperCase())) {
              newCode = candidate;
            }
            if (codeAttempts > 500) {
              newCode = `${companyPrefix}${Date.now().toString().slice(-4)}`;
              break;
            }
          }
          usedCodes.add(newCode.toUpperCase());

          const { firstName, middleName, lastName } = splitEmployeeName(cleanName);

          const { data: createdEmp, error: createEmpErr } = await supabase
            .from("employees")
            .insert({
              company_id: companyId,
              employee_code: newCode,
              first_name: firstName,
              middle_name: middleName || null,
              last_name: lastName,
              is_active: true,
              gender: "male",
              marital_status: "unmarried",
              nationality: "Indian",
            })
            .select("id, employee_code, first_name, middle_name, last_name, company_id")
            .single();

          if (createEmpErr || !createdEmp) {
            console.error("Auto-create employee error for:", cleanName, createEmpErr);
            continue;
          }

          if (cleanUan || cleanEsic) {
            await supabase
              .from("employee_statutory_details")
              .insert({
                employee_id: createdEmp.id,
                uan_number: cleanUan || null,
                esic_number: cleanEsic || null,
              });
          }

          const effectiveSiteName = rawSiteName || currentSectionSiteName || sheetName || "";
          let empSiteId = sheetSiteId || siteId;
          let empProjectId: string | null = null;

          if (effectiveSiteName && allSites && allSites.length > 0) {
            const cleanSiteQuery = cleanMatchString(effectiveSiteName);
            const matchedSite = allSites.find(
              (s: any) => {
                const sClean = cleanMatchString(s.name);
                return sClean === cleanSiteQuery || sClean.includes(cleanSiteQuery) || cleanSiteQuery.includes(sClean);
              }
            );
            if (matchedSite) {
              empSiteId = matchedSite.id;
              if (matchedSite.project_id) {
                empProjectId = matchedSite.project_id;
              }
            }
          }

          if (empSiteId && !empProjectId && allSites) {
            const foundSite = allSites.find((s: any) => s.id === empSiteId);
            if (foundSite?.project_id) {
              empProjectId = foundSite.project_id;
            }
          }

          if (!empProjectId && allProjects && allProjects.length > 0) {
            const targetProjSearch = meta.siteName || "";
            if (targetProjSearch) {
              const cleanProjTarget = cleanMatchString(targetProjSearch);
              const matchedProj = allProjects.find((p: any) => {
                const pClean = cleanMatchString(p.name);
                return pClean === cleanProjTarget || pClean.includes(cleanProjTarget) || cleanProjTarget.includes(pClean);
              });
              if (matchedProj) {
                empProjectId = matchedProj.id;
              }
            }
            if (!empProjectId && allProjects.length === 1) {
              empProjectId = allProjects[0].id;
            }
          }

          await supabase
            .from("work_details")
            .insert({
              employee_id: createdEmp.id,
              site_id: empSiteId || null,
              project_id: empProjectId || null,
              position: rawDesignation ? rawDesignation.trim().toLowerCase() : "sampler",
              skill_level: "unskilled",
              assignment_type: "full_time",
              start_date: new Date().toISOString().split("T")[0],
            });

          await supabase
            .from("employee_salary_assignment")
            .insert({
              employee_id: createdEmp.id,
              monthly_ctc: Math.round(rowGross || 0),
              effective_date: new Date().toISOString().split("T")[0],
            });

          matchedEmp = {
            ...createdEmp,
            employee_statutory_details: cleanUan || cleanEsic ? [{ uan_number: cleanUan, esic_number: cleanEsic }] : [],
            employee_salary_assignment: [{ id: "auto", monthly_ctc: rowGross, employee_salary_components: [] }],
          } as any;

          empByCode.set(cleanMatchString(newCode), matchedEmp!);
          if (cleanUan) empByUan.set(cleanMatchString(cleanUan), matchedEmp!);
          if (cleanEsic) empByEsic.set(cleanMatchString(cleanEsic), matchedEmp!);
          empByName.set(cleanMatchString(cleanName), matchedEmp!);
          employeeList.push(matchedEmp as any);

          autoCreatedEmployees.push({
            name: `${firstName} ${lastName}`.trim(),
            code: newCode,
            designation: rawDesignation || "sampler",
          });
        }

        const employee_id = matchedEmp.id;

        // Prevent duplicate processing of same employee across sheets
        if (processedEmployeeIds.has(employee_id)) {
          continue;
        }
        processedEmployeeIds.add(employee_id);

        const salaryAssignment = matchedEmp.employee_salary_assignment?.[0];
        const monthly_ctc = salaryAssignment?.monthly_ctc || 0;

        if (salaryAssignment?.employee_salary_components) {
          for (const comp of salaryAssignment.employee_salary_components) {
            const compName = comp.payment_fields?.name?.toUpperCase() || "";
            const prevVal = Number(comp.amount || 0);
            const currentVal = components[compName]?.amount;

            if (currentVal !== undefined && prevVal > 0 && Math.abs(currentVal - prevVal) > 0.01) {
              variances.push({
                employeeCode: matchedEmp.employee_code || rawCode,
                employeeName: `${matchedEmp.first_name || ""} ${matchedEmp.last_name || ""}`.trim() || rawName,
                component: compName,
                previousValue: prevVal,
                currentValue: currentVal,
                difference: currentVal - prevVal,
                note: `Imported actual Excel value (₹${currentVal.toLocaleString()}) instead of master base (₹${prevVal.toLocaleString()}).`,
              });
            }
          }
        }

        // Register each sheet's specific components into the global unique set
        for (const [compName, compConfig] of Object.entries(components)) {
          if (!uniqueComponentsSet.has(compName)) {
            uniqueComponentsSet.set(compName, {
              type: compConfig.type,
              consider_for_epf: compConfig.consider_for_epf,
              consider_for_esic: compConfig.consider_for_esic,
            });
          }
        }

        const { error: attError, data: attData } = await createAttendanceByPayrollImportAndGiveID({
          employee_id,
          month: meta.month,
          year: meta.year,
          supabase,
          insertData: attendance as any,
        });

        if (attError || !attData) {
          console.error("Attendance creation failed for employee", matchedEmp.employee_code, attError);
          continue;
        }

        transformedSalaryEntries.push({
          monthly_attendance_id: attData.id,
          monthly_ctc: Math.round(monthly_ctc || 0),
        });

        const fullRecord: Record<string, any> = {
          employee_id,
          month: meta.month,
          year: meta.year,
          monthly_ctc: Math.round(monthly_ctc || 0),
          ...attendance,
          ...components,
        };

        salaryImportData.push(fullRecord);
        sheetEmployeeCount++;
      }

      if (sheetEmployeeCount > 0) {
        processedSheetsSummary.push({
          sheetName,
          employeeCount: sheetEmployeeCount,
          netAmount: sheetNetSum,
        });
      }
    }

    if (!salaryImportData.length) {
      return {
        status: "error",
        message: `Could not match any employee records across ${workbook.SheetNames.length} sheet(s) in the Excel file (${workbook.SheetNames.join(", ")}).`,
        month: meta.month,
        year: meta.year,
        totalEmployees: 0,
        totalNetAmount: 0,
        variances,
      };
    }

    const totalNetAmount = Math.round(calculateSalaryTotalNetAmount(salaryImportData));
    const payrollFields = Array.from(uniqueComponentsSet.entries()).map(([name, config]) => ({
      name,
      type: config.type,
    }));

    const payrollTitle = `${meta.companyName} ${meta.siteName ? `- ${meta.siteName}` : ""} (${getMonthNameFromNumber(meta.month)} ${meta.year})`;

    const { error: payrollError, data: createdPayroll } = await createSalaryPayroll({
      supabase,
      companyId,
      bypassAuth: true,
      data: {
        title: payrollTitle,
        type: "salary",
        site: null,
        project: null,
        month: meta.month,
        year: meta.year,
        run_date: new Date().toISOString(),
        totalEmployees: Math.round(salaryImportData.length),
        totalNetAmount: Math.round(totalNetAmount),
        salaryEntryData: transformedSalaryEntries,
        rawData: salaryImportData,
        payrollFieldsData: payrollFields as any,
      },
    });

    if (payrollError) {
      return {
        status: "error",
        message: `Failed to create payroll: ${payrollError.message || JSON.stringify(payrollError)}`,
        month: meta.month,
        year: meta.year,
        totalEmployees: salaryImportData.length,
        totalNetAmount,
        variances,
        error: payrollError,
      };
    }

    const targetPayrollId = (createdPayroll as any)?.id || (createdPayroll as any)?.data?.id;

    const autoCreatedNote = autoCreatedEmployees.length > 0
      ? ` (${autoCreatedEmployees.length} new employee(s) auto-created: ${autoCreatedEmployees.map(e => `${e.name} [${e.code}]`).join(", ")})`
      : "";

    const sheetBreakdown = processedSheetsSummary.length > 1
      ? ` across ${processedSheetsSummary.length} sheets (${processedSheetsSummary.map(s => `${s.sheetName}: ${s.employeeCount} employee(s)`).join(", ")})`
      : "";

    return {
      status: "success",
      message: `Successfully imported ${salaryImportData.length} employees${sheetBreakdown}${autoCreatedNote} from ${filename} into ${payrollTitle}.`,
      payrollId: targetPayrollId,
      companyId,
      siteId: siteId || undefined,
      month: meta.month,
      year: meta.year,
      totalEmployees: salaryImportData.length,
      totalNetAmount,
      variances,
      autoCreatedCount: autoCreatedEmployees.length,
      autoCreatedEmployees,
      payrollTitle,
    };
  } catch (err: any) {
    console.error("processPayrollExcel exception:", err);
    return {
      status: "error",
      message: `Exception processing Excel: ${err.message || String(err)}`,
      month: 0,
      year: 0,
      totalEmployees: 0,
      totalNetAmount: 0,
      variances: [],
      error: err,
    };
  }
}
