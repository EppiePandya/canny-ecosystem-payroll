import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { google as googleAi } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "@canny_ecosystem/utils";
import {
  recalculatePayrollTotals,
  createAttendanceByPayrollImportAndGiveID,
} from "@canny_ecosystem/supabase/mutations";
import { ensureEnvLoaded } from "./payroll-excel-transform.js";
import { GEMINI_MAIN, GEMINI_LITE } from "@/utils/ai/chat/constant.js";

ensureEnvLoaded();

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  ensureEnvLoaded();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

// ============================================================================
// Schemas for Gemini AI
// ============================================================================

const CompanyAndPeriodSchema = z.object({
  matchedCompanyId: z
    .string()
    .nullable()
    .describe(
      "The ID of the matched company from the provided database companies list, or null if no confident match"
    ),
  matchedCompanyName: z
    .string()
    .nullable()
    .describe("The name of the matched company from the database list, or null"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score between 0.0 and 1.0"),
  month: z
    .number()
    .min(1)
    .max(12)
    .describe("Payroll month as integer (1 for January, 12 for December)"),
  year: z
    .number()
    .min(2000)
    .max(2100)
    .describe("Payroll year as 4-digit integer (e.g. 2024, 2025, 2026)"),
  reasoning: z
    .string()
    .describe("Brief explanation for company match and month/year extraction"),
});

const FieldMappingItemSchema = z.object({
  sheetHeader: z
    .string()
    .describe("The exact column header from the spreadsheet"),
  category: z
    .enum([
      "earning",
      "deduction",
      "attendance",
      "employee_identifier",
      "summary_total",
      "ignore",
    ])
    .describe("Semantic category of this column"),
  action: z
    .enum(["reuse", "create", "ignore_for_payroll_fields"])
    .describe(
      "reuse: reuse existing payroll_field; create: create a new payroll_field; ignore_for_payroll_fields: attendance, employee identifiers, or totals that should not become dynamic payroll fields"
    ),
  existingFieldId: z
    .string()
    .nullable()
    .describe("ID of the existing payroll_field if reusing, else null"),
  matchedFieldName: z
    .string()
    .nullable()
    .describe(
      "The standardized uppercase name for this field (e.g. 'BASIC', 'HRA', 'PF', 'ESIC DEDUCTION', 'OVERTIME')"
    ),
  fieldType: z
    .enum(["earning", "deduction"])
    .nullable()
    .describe("Field type: earning or deduction, or null if ignored"),
  consider_for_epf: z
    .boolean()
    .default(false)
    .describe("Whether this component is considered for EPF/PF calculation"),
  consider_for_esic: z
    .boolean()
    .default(false)
    .describe("Whether this component is considered for ESIC calculation"),
  reasoning: z
    .string()
    .describe("Brief explanation why this was matched, created, or ignored"),
});

const FieldAnalysisResultSchema = z.object({
  mappings: z
    .array(FieldMappingItemSchema)
    .describe("List of mappings for each column header in the sheet"),
});

// ============================================================================
// Public Interfaces
// ============================================================================

export interface AutoIngestParams {
  transformedBuffer: Buffer | Uint8Array;
  transformedFilename: string;
  originalFilename?: string;
  emailSubject?: string;
  emailBodyText?: string;
  senderEmail?: string;
}

export interface AutoIngestResult {
  success: boolean;
  companyId?: string;
  companyName?: string;
  month?: number;
  year?: number;
  payrollId?: string;
  payrollTitle?: string;
  isNewPayroll?: boolean;
  totalEmployeesInSheet: number;
  matchedEmployeesCount: number;
  unmatchedEmployeesCount: number;
  unmatchedEmployeeNames: string[];
  attendanceCreatedCount: number;
  salaryEntriesCreatedCount: number;
  fieldsReusedCount: number;
  fieldsCreatedCount: number;
  reusedFieldNames: string[];
  createdFieldNames: string[];
  totalNetAmount: number;
  payrollUrl?: string;
  summaryText: string;
  error?: string;
}

// ============================================================================
// Helper: Normalize Strings for Comparison
// ============================================================================

function cleanStr(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toUpperCase()
    .replace(/[_\s]+/g, " ");
}

// ============================================================================
// Gemini Step 1: Detect Company and Month/Year
// ============================================================================

async function detectCompanyAndPeriodWithAI({
  filename,
  originalFilename,
  emailSubject,
  emailBodyText,
  sheetNames,
  dbCompanies,
}: {
  filename: string;
  originalFilename?: string;
  emailSubject?: string;
  emailBodyText?: string;
  sheetNames: string[];
  dbCompanies: Array<{ id: string; name: string }>;
}): Promise<z.infer<typeof CompanyAndPeriodSchema>> {
  const companyOptions = dbCompanies
    .map((c) => `- ID: "${c.id}" | Name: "${c.name}"`)
    .join("\n");

  const prompt = `You are an AI assistant in a Payroll management system.
We received an incoming salary sheet Excel file via email.
Analyze the file names, email subject, email body, and sheet names, and match it to the correct company and payroll period (Month & Year).

Available Companies in Database:
${companyOptions}

File Information:
- Original Filename: ${originalFilename || "Not specified"}
- Transformed Filename: ${filename}
- Email Subject: ${emailSubject || "Not specified"}
- Email Body Snippet: ${(emailBodyText || "").slice(0, 500) || "None"}
- Excel Sheet Names: ${sheetNames.join(", ")}

Matching Rules:
1. COMPANY MATCHING (GUESS WORK / FUZZY MATCHING):
   - The company name in the file name or email subject may be slightly abbreviated, informal, or misspelled.
     Examples:
     * "SGS" or "SGS Oct" -> matches "SGS INDIA PVT LTD"
     * "Canny" or "CMS" -> matches "Canny Management Services"
     * "Hawa" or "Hawa Valves" -> matches "HAWA VALVES INDIA PVT LTD"
     * "Baoxhin" -> matches "BAOXHIN INDIA PVT LTD"
     * "Shyam Plastic" -> matches "SHYAM PLASTIC INDUSTRIES" or "SHYAM PLASTIC MACHINERY" (check context)
     * "Cotecna" -> matches "COTECNA INSPECTION INDIA PVT LTD"
   - Match with the highest confidence company from the list above.
   - If there is NO plausible match among the listed companies, set matchedCompanyId to null.

2. MONTH & YEAR EXTRACTION:
   - Extract the payroll month (1-12) and year (e.g. 2024, 2025, 2026).
   - Look for patterns like "Oct 2024", "October 24", "10-2024", "Sep_2026", "June 26", etc. in the filename, subject, or sheet names.
   - If year is 2 digits (e.g. "24" or "26"), expand to 2024 or 2026.
   - If year is completely omitted, default to ${new Date().getFullYear()}.
   - If month is completely omitted, default to current month (${new Date().getMonth() + 1}).

Return your match adhering strictly to the schema.`;

  const modelsToTry = [
    GEMINI_LITE,
    GEMINI_MAIN
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastErr: any = null;
  for (const model of modelsToTry) {
    try {
      const res = await generateObject({
        model: googleAi(model),
        prompt,
        schema: CompanyAndPeriodSchema,
        temperature: 0.1,
      });
      return res.object;
    } catch (err: any) {
      console.warn(`[PayrollAutoIngest] Model "${model}" failed on company detection:`, err?.message || err);
      lastErr = err;
    }
  }

  throw lastErr;
}

// ============================================================================
// Gemini Step 2: Resolve Payroll Fields (Deduplication / Reuse / Creation)
// ============================================================================

async function resolvePayrollFieldsWithAI({
  headers,
  sampleRows,
  existingFields,
  payrollId,
}: {
  headers: string[];
  sampleRows: any[][];
  existingFields: Array<{ id: string; name: string; type: string }>;
  payrollId: string;
}): Promise<z.infer<typeof FieldAnalysisResultSchema>> {
  const existingFieldsList =
    existingFields.length > 0
      ? existingFields
          .map((f) => `- ID: "${f.id}" | Name: "${f.name}" | Type: "${f.type}"`)
          .join("\n")
      : "None (this payroll currently has no existing fields)";

  // Format headers with sample values for AI inspection
  const headerDetails = headers.map((h, colIdx) => {
    const samples = sampleRows
      .slice(0, 5)
      .map((r) => r[colIdx])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
    return `- Header: "${h}" | Sample Values: [${samples.slice(0, 3).join(", ")}]`;
  }).join("\n");

  const prompt = `You are an AI assistant in a Payroll management system.
We need to map columns from a salary spreadsheet into database payroll fields for Payroll ID "${payrollId}".

CRITICAL REQUIREMENT - DEDUPLICATION & REUSE OF PAYROLL FIELDS:
In this system, payroll fields for a payroll run MUST NOT be created multiple times.
If a column in the spreadsheet matches an EXISTING payroll field (even with minor naming differences, abbreviations, synonyms, or casing variations), IT MUST BE REUSED!

Existing Payroll Fields for this Payroll:
${existingFieldsList}

Columns from the Salary Sheet:
${headerDetails}

CLASSIFICATION RULES:

1. NON-COMPONENT COLUMNS (MUST BE IGNORED FOR PAYROLL FIELDS):
   - Employee Identifiers: "Employee Code", "Emp Code", "Employee ID", "Employee Name", "Name", "UAN", "ESIC", "ESIC No", "PF No", "PAN"
     -> category: "employee_identifier", action: "ignore_for_payroll_fields"
   - Attendance Columns: "Working Days", "Present Days", "Total Paid Days", "Paid Holidays", "Casual Leaves", "OT Hours", "Overtime Hours", "Absent Days", "Weekly Off"
     -> category: "attendance", action: "ignore_for_payroll_fields"
   - Summary / Total Columns: "Gross", "Gross Wages", "Actual Wages", "Total Earnings", "Net Pay", "Net Salary", "Take Home", "Total Deductions", "Net Payable"
     -> category: "summary_total", action: "ignore_for_payroll_fields"

2. SALARY COMPONENT COLUMNS (EARNINGS & DEDUCTIONS):
   - These represent dynamic earnings (e.g. Basic, HRA, DA, Overtime Amount, Special Allowance, Conveyance, Bonus, Leave Salary)
     and deductions (e.g. PF, ESIC Deduction, Professional Tax / PT, TDS, Advance, Loan, LWF).

   - REUSE RULE (PRIORITY #1):
     Compare the column with the "Existing Payroll Fields" list above.
     If there is ANY existing field that represents the same component:
     * "Basic Pay", "Basic", "Basic Salary", "Earned Basic" -> match existing "BASIC" (or "Basic")
     * "House Rent Allowance", "H.R.A.", "HRA" -> match existing "HRA"
     * "Provident Fund", "PF Emp", "PF Deduction", "PF 12%" -> match existing "PF"
     * "ESIC", "ESI", "ESIC Deduction", "ESI Deduction" -> match existing "ESI" or "ESIC"
     * "Prof Tax", "Professional Tax", "PT" -> match existing "PT" or "PROFESSIONAL TAX"
     * "OT", "OT Amount", "Overtime", "Overtime Pay" -> match existing "OVERTIME" or "Overtime"
     * "Advance", "Advance Ded" -> match existing "advance " or "ADVANCE"
     * "Bonus" -> match existing "BONUS"
     * "Leave Salary" -> match existing "LEAVE SALARY" or "Leave Salary"
     * "Other Allowance" -> match existing "OTHER ALLOWANCE" or "Other Allowance"
     * "Special Allowance" -> match existing "SPECIAL ALLOWANCE"
     => Set action: "reuse", existingFieldId: "<existing field ID>", matchedFieldName: "<existing field name>", fieldType: "<existing field type>".

   - CREATE RULE (ONLY WHEN GENUINELY NEW):
     If and ONLY IF no existing field matches this component in the payroll:
     => Set action: "create", existingFieldId: null, matchedFieldName: "<CLEAN UPPERCASE NAME>", fieldType: "earning" | "deduction".
     * Set consider_for_epf: true for Basic, DA, etc.; false for HRA, OT, etc.
     * Set consider_for_esic: true for gross wage components; false for non-wages.

Provide a mapping for EVERY header listed.`;

  const modelsToTry = [
    GEMINI_LITE,
    GEMINI_MAIN
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastErr: any = null;
  for (const model of modelsToTry) {
    try {
      const res = await generateObject({
        model: googleAi(model),
        prompt,
        schema: FieldAnalysisResultSchema,
        temperature: 0.1,
      });
      return res.object;
    } catch (err: any) {
      console.warn(`[PayrollAutoIngest] Model "${model}" failed on field mapping:`, err?.message || err);
      lastErr = err;
    }
  }

  throw lastErr;
}

// ============================================================================
// Main Ingestion Pipeline
// ============================================================================

export async function ingestTransformedPayrollToDatabase({
  transformedBuffer,
  transformedFilename,
  originalFilename,
  emailSubject,
  emailBodyText,
  senderEmail,
}: AutoIngestParams): Promise<AutoIngestResult> {
  const sb = getSupabase();

  console.log(
    `[PayrollAutoIngest] Starting automated payroll ingestion for "${transformedFilename}"...`
  );

  // 1. Read Workbook & Extract Sheet Data
  const wb = XLSX.read(transformedBuffer, { type: "buffer" });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return {
      success: false,
      totalEmployeesInSheet: 0,
      matchedEmployeesCount: 0,
      unmatchedEmployeesCount: 0,
      unmatchedEmployeeNames: [],
      attendanceCreatedCount: 0,
      salaryEntriesCreatedCount: 0,
      fieldsReusedCount: 0,
      fieldsCreatedCount: 0,
      reusedFieldNames: [],
      createdFieldNames: [],
      totalNetAmount: 0,
      summaryText: "Failed: The transformed workbook has no sheets.",
      error: "Empty workbook",
    };
  }

  const firstSheetName = wb.SheetNames[0];
  const worksheet = wb.Sheets[firstSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (rawRows.length < 2) {
    return {
      success: false,
      totalEmployeesInSheet: 0,
      matchedEmployeesCount: 0,
      unmatchedEmployeesCount: 0,
      unmatchedEmployeeNames: [],
      attendanceCreatedCount: 0,
      salaryEntriesCreatedCount: 0,
      fieldsReusedCount: 0,
      fieldsCreatedCount: 0,
      reusedFieldNames: [],
      createdFieldNames: [],
      totalNetAmount: 0,
      summaryText: "Failed: Sheet does not contain any data rows.",
      error: "No data rows",
    };
  }

  const rawHeaders: string[] = (rawRows[0] || []).map((h) => String(h || "").trim());
  const dataRows: any[][] = rawRows.slice(1).filter((r) => {
    return r?.some((c) => c !== null && c !== undefined && String(c).trim() !== "");
  });

  const totalEmployeesInSheet = dataRows.length;

  // 2. Fetch Companies from Database
  const { data: dbCompanies, error: compErr } = await sb
    .from("companies")
    .select("id, name");

  if (compErr || !dbCompanies || dbCompanies.length === 0) {
    return {
      success: false,
      totalEmployeesInSheet,
      matchedEmployeesCount: 0,
      unmatchedEmployeesCount: 0,
      unmatchedEmployeeNames: [],
      attendanceCreatedCount: 0,
      salaryEntriesCreatedCount: 0,
      fieldsReusedCount: 0,
      fieldsCreatedCount: 0,
      reusedFieldNames: [],
      createdFieldNames: [],
      totalNetAmount: 0,
      summaryText: `Failed: Could not query companies from database (${compErr?.message || "No companies found"}).`,
      error: compErr?.message || "No companies found",
    };
  }

  // 3. AI Step 1: Detect Company and Month/Year
  let aiDetection: z.infer<typeof CompanyAndPeriodSchema>;
  try {
    aiDetection = await detectCompanyAndPeriodWithAI({
      filename: transformedFilename,
      originalFilename,
      emailSubject,
      emailBodyText,
      sheetNames: wb.SheetNames,
      dbCompanies: dbCompanies.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (detectErr: any) {
    console.error("[PayrollAutoIngest] AI Company & Period detection failed:", detectErr);
    return {
      success: false,
      totalEmployeesInSheet,
      matchedEmployeesCount: 0,
      unmatchedEmployeesCount: 0,
      unmatchedEmployeeNames: [],
      attendanceCreatedCount: 0,
      salaryEntriesCreatedCount: 0,
      fieldsReusedCount: 0,
      fieldsCreatedCount: 0,
      reusedFieldNames: [],
      createdFieldNames: [],
      totalNetAmount: 0,
      summaryText: `Failed: AI could not identify company or period (${detectErr?.message || String(detectErr)}).`,
      error: detectErr?.message || "Detection failed",
    };
  }

  if (!aiDetection.matchedCompanyId) {
    const companyListStr = dbCompanies.map((c) => c.name).join(", ");
    return {
      success: false,
      totalEmployeesInSheet,
      matchedEmployeesCount: 0,
      unmatchedEmployeesCount: 0,
      unmatchedEmployeeNames: [],
      attendanceCreatedCount: 0,
      salaryEntriesCreatedCount: 0,
      fieldsReusedCount: 0,
      fieldsCreatedCount: 0,
      reusedFieldNames: [],
      createdFieldNames: [],
      totalNetAmount: 0,
      summaryText: `Could not match filename "${originalFilename || transformedFilename}" to any registered company. Available companies: ${companyListStr}. Reason: ${aiDetection.reasoning}`,
      error: "No company matched",
    };
  }

  const companyId = aiDetection.matchedCompanyId;
  const companyName =
    aiDetection.matchedCompanyName ||
    dbCompanies.find((c) => c.id === companyId)?.name ||
    "Company";
  const month = aiDetection.month;
  const year = aiDetection.year;

  console.log(
    `[PayrollAutoIngest] Matched Company: "${companyName}" (${companyId}) for Month ${month}/${year}. Confidence: ${aiDetection.confidence}. Reasoning: ${aiDetection.reasoning}`
  );

  // 4. Locate or Create Payroll Record
  const { data: existingPayroll } = await sb
    .from("payroll")
    .select("id, title, status, month, year, company_id, total_employees, total_net_amount")
    .eq("company_id", companyId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  let payrollId = "";
  let payrollTitle = "";
  let isNewPayroll = false;

  const monthNames = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  if (existingPayroll) {
    payrollId = existingPayroll.id;
    payrollTitle = existingPayroll.title || `Payroll - ${monthNames[month]} ${year}`;
    isNewPayroll = false;
    console.log(
      `[PayrollAutoIngest] Found existing payroll "${payrollTitle}" (ID: ${payrollId}). Reusing...`
    );
  } else {
    payrollTitle = `Payroll - ${monthNames[month]} ${year}`;
    isNewPayroll = true;
    const { data: newPayroll, error: createPErr } = await sb
      .from("payroll")
      .insert({
        company_id: companyId,
        month,
        year,
        title: payrollTitle,
        status: "pending",
        total_employees: 0,
        total_net_amount: 0,
      })
      .select("id, title")
      .single();

    if (createPErr || !newPayroll) {
      console.error("[PayrollAutoIngest] Failed to create payroll record:", createPErr);
      return {
        success: false,
        companyId,
        companyName,
        month,
        year,
        totalEmployeesInSheet,
        matchedEmployeesCount: 0,
        unmatchedEmployeesCount: 0,
        unmatchedEmployeeNames: [],
        attendanceCreatedCount: 0,
        salaryEntriesCreatedCount: 0,
        fieldsReusedCount: 0,
        fieldsCreatedCount: 0,
        reusedFieldNames: [],
        createdFieldNames: [],
        totalNetAmount: 0,
        summaryText: `Failed to create payroll record: ${createPErr?.message || "Unknown error"}`,
        error: createPErr?.message || "Payroll creation error",
      };
    }

    payrollId = newPayroll.id;
    payrollTitle = newPayroll.title || payrollTitle;
    console.log(
      `[PayrollAutoIngest] Created new payroll "${payrollTitle}" (ID: ${payrollId}).`
    );
  }

  // 5. Fetch Existing Payroll Fields for this Payroll
  const { data: existingFields, error: fieldsQueryErr } = await sb
    .from("payroll_fields")
    .select("id, name, type, payroll_id")
    .eq("payroll_id", payrollId);

  if (fieldsQueryErr) {
    console.warn("[PayrollAutoIngest] Error querying existing payroll fields:", fieldsQueryErr);
  }

  const existingFieldsList = existingFields || [];

  // 6. AI Step 2: Resolve Field Mappings (Deduplication, Reuse, Creation)
  let fieldAnalysis: z.infer<typeof FieldAnalysisResultSchema>;
  try {
    fieldAnalysis = await resolvePayrollFieldsWithAI({
      headers: rawHeaders,
      sampleRows: dataRows.slice(0, 10),
      existingFields: existingFieldsList.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
      })),
      payrollId,
    });
  } catch (fieldAiErr: any) {
    console.error("[PayrollAutoIngest] AI field resolution failed:", fieldAiErr);
    return {
      success: false,
      companyId,
      companyName,
      month,
      year,
      payrollId,
      payrollTitle,
      isNewPayroll,
      totalEmployeesInSheet,
      matchedEmployeesCount: 0,
      unmatchedEmployeesCount: 0,
      unmatchedEmployeeNames: [],
      attendanceCreatedCount: 0,
      salaryEntriesCreatedCount: 0,
      fieldsReusedCount: 0,
      fieldsCreatedCount: 0,
      reusedFieldNames: [],
      createdFieldNames: [],
      totalNetAmount: 0,
      summaryText: `Failed to resolve payroll fields: ${fieldAiErr?.message || String(fieldAiErr)}`,
      error: fieldAiErr?.message || "Field mapping error",
    };
  }

  // 7. Process Field Mappings: Create missing fields & build header-to-fieldId map
  const headerToFieldMap = new Map<
    string,
    {
      fieldId: string;
      name: string;
      type: "earning" | "deduction";
      consider_for_epf: boolean;
      consider_for_esic: boolean;
    }
  >();

  const reusedFieldNames: string[] = [];
  const createdFieldNames: string[] = [];

  // Pre-index existing fields by normalized name
  const existingFieldByName = new Map<string, (typeof existingFieldsList)[0]>();
  for (const ef of existingFieldsList) {
    existingFieldByName.set(cleanStr(ef.name), ef);
    existingFieldByName.set(normalizeHeader(ef.name), ef);
  }

  for (const m of fieldAnalysis.mappings) {
    if (m.action === "ignore_for_payroll_fields") {
      continue;
    }

    if (m.action === "reuse" && m.existingFieldId) {
      headerToFieldMap.set(m.sheetHeader, {
        fieldId: m.existingFieldId,
        name: m.matchedFieldName || m.sheetHeader,
        type: (m.fieldType || "earning") as "earning" | "deduction",
        consider_for_epf: m.consider_for_epf,
        consider_for_esic: m.consider_for_esic,
      });
      reusedFieldNames.push(m.matchedFieldName || m.sheetHeader);
      continue;
    }

    // If marked for reuse but existingFieldId is null, try finding in existingFieldByName
    if (m.action === "reuse" && !m.existingFieldId && m.matchedFieldName) {
      const match =
        existingFieldByName.get(cleanStr(m.matchedFieldName)) ||
        existingFieldByName.get(normalizeHeader(m.matchedFieldName));
      if (match) {
        headerToFieldMap.set(m.sheetHeader, {
          fieldId: match.id,
          name: match.name,
          type: match.type as "earning" | "deduction",
          consider_for_epf: m.consider_for_epf,
          consider_for_esic: m.consider_for_esic,
        });
        reusedFieldNames.push(match.name);
        continue;
      }
    }

    // Action is 'create' (or unlinked reuse)
    if (m.matchedFieldName && m.fieldType) {
      const cleanFieldName = normalizeHeader(m.matchedFieldName);

      // Check if it already exists in DB before creating
      const existingMatch =
        existingFieldByName.get(cleanStr(cleanFieldName)) ||
        existingFieldByName.get(cleanFieldName);

      if (existingMatch) {
        headerToFieldMap.set(m.sheetHeader, {
          fieldId: existingMatch.id,
          name: existingMatch.name,
          type: existingMatch.type as "earning" | "deduction",
          consider_for_epf: m.consider_for_epf,
          consider_for_esic: m.consider_for_esic,
        });
        reusedFieldNames.push(existingMatch.name);
      } else {
        // Create new payroll field
        const { data: createdField, error: cfErr } = await sb
          .from("payroll_fields")
          .upsert(
            {
              name: cleanFieldName,
              type: m.fieldType,
              payroll_id: payrollId,
            },
            { onConflict: "name, payroll_id" }
          )
          .select("id, name, type")
          .single();

        if (cfErr || !createdField) {
          console.error(
            `[PayrollAutoIngest] Failed to create payroll field "${cleanFieldName}":`,
            cfErr
          );
        } else {
          headerToFieldMap.set(m.sheetHeader, {
            fieldId: createdField.id,
            name: createdField.name,
            type: createdField.type as "earning" | "deduction",
            consider_for_epf: m.consider_for_epf,
            consider_for_esic: m.consider_for_esic,
          });
          existingFieldByName.set(cleanStr(createdField.name), createdField);
          existingFieldByName.set(createdField.name, createdField);
          createdFieldNames.push(createdField.name);
        }
      }
    }
  }

  console.log(
    `[PayrollAutoIngest] Payroll fields resolved: ${reusedFieldNames.length} reused (${reusedFieldNames.join(", ")}), ${createdFieldNames.length} created (${createdFieldNames.join(", ")})`
  );

  // 8. Fetch Employees for Company to Match
  const { data: companyEmployees, error: empErr } = await sb
    .from("employees")
    .select(`
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      employee_statutory_details (
        uan_number,
        esic_number
      )
    `)
    .eq("company_id", companyId);

  if (empErr) {
    console.error("[PayrollAutoIngest] Error fetching company employees:", empErr);
  }

  const employees = companyEmployees || [];
  console.log(
    `[PayrollAutoIngest] Loaded ${employees.length} employees from database for company "${companyName}".`
  );

  // Build employee lookup maps
  const byCode = new Map<string, string>();
  const byUan = new Map<string, string>();
  const byEsic = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const emp of employees) {
    if (emp.employee_code) {
      byCode.set(cleanStr(emp.employee_code), emp.id);
      // Also match without leading zeroes
      const stripped = emp.employee_code.replace(/^0+/, "");
      if (stripped) byCode.set(cleanStr(stripped), emp.id);
    }

    const stat = Array.isArray(emp.employee_statutory_details)
      ? emp.employee_statutory_details[0]
      : emp.employee_statutory_details;

    if (stat) {
      if (stat.uan_number) {
        const u = String(stat.uan_number).trim().replace(/\D/g, "");
        if (u) byUan.set(u, emp.id);
      }
      if (stat.esic_number) {
        const es = String(stat.esic_number).trim().replace(/\D/g, "");
        if (es) byEsic.set(es, emp.id);
      }
    }

    const fullName = `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`.trim();
    const shortName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    if (fullName) byName.set(cleanStr(fullName), emp.id);
    if (shortName) byName.set(cleanStr(shortName), emp.id);
  }

  // Identify column indices from sheet headers
  let codeColIdx = -1;
  let nameColIdx = -1;
  let uanColIdx = -1;
  let esicColIdx = -1;
  let workingDaysColIdx = -1;
  let presentDaysColIdx = -1;
  let otHoursColIdx = -1;
  let paidHolidaysColIdx = -1;
  let casualLeavesColIdx = -1;
  let paidLeavesColIdx = -1;
  let grossColIdx = -1;
  let netPayColIdx = -1;

  for (let c = 0; c < rawHeaders.length; c++) {
    const h = rawHeaders[c];
    const norm = cleanStr(h);

    if (codeColIdx < 0 && (norm.includes("code") || norm.includes("empid") || norm === "id")) {
      codeColIdx = c;
    } else if (nameColIdx < 0 && (norm.includes("name") || norm === "empname")) {
      nameColIdx = c;
    } else if (uanColIdx < 0 && norm.includes("uan")) {
      uanColIdx = c;
    } else if (
      esicColIdx < 0 &&
      (norm.includes("esicno") || norm.includes("esicip") || norm === "esic" || norm === "esi")
    ) {
      esicColIdx = c;
    } else if (
      workingDaysColIdx < 0 &&
      (norm.includes("workingday") || norm.includes("totalday") || norm.includes("monthday") || norm === "wdays")
    ) {
      workingDaysColIdx = c;
    } else if (
      presentDaysColIdx < 0 &&
      (norm.includes("presentday") || norm.includes("payableday") || norm.includes("paiday") || norm === "pdays" || norm === "present")
    ) {
      presentDaysColIdx = c;
    } else if (otHoursColIdx < 0 && (norm.includes("othour") || norm.includes("othr") || norm === "ot")) {
      otHoursColIdx = c;
    } else if (paidHolidaysColIdx < 0 && (norm.includes("paidholiday") || norm === "ph" || norm === "holiday")) {
      paidHolidaysColIdx = c;
    } else if (casualLeavesColIdx < 0 && (norm.includes("casualleave") || norm === "cl" || norm === "leave")) {
      casualLeavesColIdx = c;
    } else if (paidLeavesColIdx < 0 && (norm.includes("paidleave") || norm === "pl" || norm === "sl")) {
      paidLeavesColIdx = c;
    } else if (grossColIdx < 0 && (norm.includes("gross") || norm.includes("actualwage") || norm === "wage")) {
      grossColIdx = c;
    } else if (netPayColIdx < 0 && (norm.includes("netpay") || norm.includes("netsalary") || norm.includes("takehome"))) {
      netPayColIdx = c;
    }
  }

  // 9. Process Data Rows: Match Employees, Upsert Attendance, Upsert Salary Entries
  let matchedEmployeesCount = 0;
  let unmatchedEmployeesCount = 0;
  const unmatchedEmployeeNames: string[] = [];
  let attendanceCreatedCount = 0;
  let salaryEntriesCreatedCount = 0;

  const baseTimestamp = Date.now();
  const allSalaryFieldValues: Array<{
    salary_entry_id: string;
    payroll_field_id: string;
    amount: number;
    consider_for_epf: boolean;
  }> = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowCreatedAt = new Date(baseTimestamp + i * 1000).toISOString();

    const rawCode = codeColIdx >= 0 ? row[codeColIdx] : null;
    const rawName = nameColIdx >= 0 ? row[nameColIdx] : null;
    const rawUan = uanColIdx >= 0 ? row[uanColIdx] : null;
    const rawEsic = esicColIdx >= 0 ? row[esicColIdx] : null;

    // Ignore summary Total row generated at the bottom of the transformed sheet
    if (
      (rawName && String(rawName).trim().toLowerCase() === "total") ||
      (rawCode && String(rawCode).trim().toLowerCase() === "total") ||
      String(row[0] ?? "").trim().toLowerCase() === "total"
    ) {
      continue;
    }

    // Match Employee
    let employeeId: string | null = null;

    if (rawCode) {
      const c = cleanStr(rawCode);
      employeeId = byCode.get(c) || byCode.get(c.replace(/^0+/, "")) || null;
    }
    if (!employeeId && rawUan) {
      const u = String(rawUan).trim().replace(/\D/g, "");
      if (u) employeeId = byUan.get(u) || null;
    }
    if (!employeeId && rawEsic) {
      const es = String(rawEsic).trim().replace(/\D/g, "");
      if (es) employeeId = byEsic.get(es) || null;
    }
    if (!employeeId && rawName) {
      const n = cleanStr(rawName);
      if (n) employeeId = byName.get(n) || null;
    }

    if (!employeeId) {
      unmatchedEmployeesCount++;
      const displayName = rawName ? String(rawName) : rawCode ? `Code: ${rawCode}` : `Row ${i + 1}`;
      unmatchedEmployeeNames.push(displayName);
      continue;
    }

    matchedEmployeesCount++;

    // Parse Attendance Values
    const parseNum = (val: any): number => {
      if (val === null || val === undefined || val === "") return 0;
      const n = Number(String(val).replace(/,/g, "").trim());
      return Number.isNaN(n) ? 0 : n;
    };

    let workingDays = workingDaysColIdx >= 0 ? parseNum(row[workingDaysColIdx]) : 0;
    if (workingDays === 0) {
      // Default to 30 or 26 days
      workingDays = 30;
    }

    const presentDays = presentDaysColIdx >= 0 ? parseNum(row[presentDaysColIdx]) : workingDays;
    const otHours = otHoursColIdx >= 0 ? parseNum(row[otHoursColIdx]) : 0;
    const paidHolidays = paidHolidaysColIdx >= 0 ? parseNum(row[paidHolidaysColIdx]) : 0;
    const casualLeaves = casualLeavesColIdx >= 0 ? parseNum(row[casualLeavesColIdx]) : 0;
    const paidLeaves = paidLeavesColIdx >= 0 ? parseNum(row[paidLeavesColIdx]) : 0;
    const absentDays = Math.max(
      0,
      workingDays - presentDays - paidHolidays - casualLeaves - paidLeaves
    );

    // Upsert Monthly Attendance
    const { data: attendanceData, error: attendErr } =
      await createAttendanceByPayrollImportAndGiveID({
        supabase: sb,
        month,
        year,
        employee_id: employeeId,
        insertData: {
          working_days: workingDays,
          present_days: presentDays,
          overtime_hours: otHours,
          paid_holidays: paidHolidays,
          casual_leaves: casualLeaves,
          paid_leaves: paidLeaves,
          absent_days: absentDays,
          created_at: rowCreatedAt,
        },
      });

    if (attendErr || !attendanceData?.id) {
      console.error(
        `[PayrollAutoIngest] Attendance upsert error for employee ${employeeId}:`,
        attendErr
      );
      continue;
    }

    attendanceCreatedCount++;

    // Gross / CTC value for salary entry
    const grossVal = grossColIdx >= 0 ? parseNum(row[grossColIdx]) : 0;
    const netVal = netPayColIdx >= 0 ? parseNum(row[netPayColIdx]) : 0;
    const monthlyCtc = Math.round(grossVal || netVal || 0);

    // Upsert Salary Entry
    const { data: salaryEntry, error: seErr } = await sb
      .from("salary_entries")
      .upsert(
        {
          monthly_attendance_id: attendanceData.id,
          payroll_id: payrollId,
          monthly_ctc: monthlyCtc,
          created_at: rowCreatedAt,
        },
        {
          onConflict: "monthly_attendance_id, payroll_id",
        }
      )
      .select("id")
      .single();

    if (seErr || !salaryEntry?.id) {
      console.error(
        `[PayrollAutoIngest] Salary entry upsert error for employee ${employeeId}:`,
        seErr
      );
      continue;
    }

    salaryEntriesCreatedCount++;

    // Collect Field Values for this Row
    for (let c = 0; c < rawHeaders.length; c++) {
      const headerName = rawHeaders[c];
      const fieldConfig = headerToFieldMap.get(headerName);
      if (!fieldConfig) continue;

      const cellVal = row[c];
      const numAmt = parseNum(cellVal);

      if (numAmt !== 0) {
        allSalaryFieldValues.push({
          salary_entry_id: salaryEntry.id,
          payroll_field_id: fieldConfig.fieldId,
          amount: Math.round(numAmt * 100) / 100,
          consider_for_epf: fieldConfig.consider_for_epf,
        });
      }
    }
  }

  // 10. Batch Upsert Salary Field Values
  if (allSalaryFieldValues.length > 0) {
    console.log(
      `[PayrollAutoIngest] Upserting ${allSalaryFieldValues.length} salary field values across ${salaryEntriesCreatedCount} entries...`
    );

    // Deduplicate by (salary_entry_id, payroll_field_id)
    const uniqueValuesMap = new Map<string, (typeof allSalaryFieldValues)[0]>();
    for (const fv of allSalaryFieldValues) {
      uniqueValuesMap.set(`${fv.salary_entry_id}-${fv.payroll_field_id}`, fv);
    }
    const deduplicatedValues = Array.from(uniqueValuesMap.values());

    const BATCH_SIZE = 250;
    for (let b = 0; b < deduplicatedValues.length; b += BATCH_SIZE) {
      const chunk = deduplicatedValues.slice(b, b + BATCH_SIZE);
      const { error: fvErr } = await sb
        .from("salary_field_values")
        .upsert(chunk, { onConflict: "salary_entry_id, payroll_field_id" });

      if (fvErr) {
        console.error("[PayrollAutoIngest] Error batch upserting salary_field_values:", fvErr);
      }
    }
  }

  // 11. Recalculate Payroll Totals
  console.log(`[PayrollAutoIngest] Recalculating payroll totals for payroll ID "${payrollId}"...`);
  const totals = await recalculatePayrollTotals({
    supabase: sb,
    payrollId,
  });

  const totalNetAmount = totals?.totalNetAmount || 0;
  const payrollUrl = `/payroll/run-payroll/${payrollId}`;

  const summaryText =
    `Successfully processed salary sheet for company "${companyName}" (${monthNames[month]} ${year}).\n` +
    `- Payroll: ${payrollTitle} (ID: ${payrollId})\n` +
    `- Payroll Link: ${payrollUrl}\n` +
    `- Matched Employees: ${matchedEmployeesCount} of ${totalEmployeesInSheet} (${unmatchedEmployeesCount} unmatched)\n` +
    `- Attendance Records: ${attendanceCreatedCount}\n` +
    `- Salary Entries: ${salaryEntriesCreatedCount}\n` +
    `- Reused Payroll Fields: ${reusedFieldNames.length} (${reusedFieldNames.join(", ") || "None"})\n` +
    `- Created Payroll Fields: ${createdFieldNames.length} (${createdFieldNames.join(", ") || "None"})\n` +
    `- Total Net Amount: ₹${totalNetAmount.toLocaleString("en-IN")}`;

  console.log(`[PayrollAutoIngest] Completed successfully:\n${summaryText}`);

  return {
    success: true,
    companyId,
    companyName,
    month,
    year,
    payrollId,
    payrollTitle,
    isNewPayroll,
    totalEmployeesInSheet,
    matchedEmployeesCount,
    unmatchedEmployeesCount,
    unmatchedEmployeeNames,
    attendanceCreatedCount,
    salaryEntriesCreatedCount,
    fieldsReusedCount: reusedFieldNames.length,
    fieldsCreatedCount: createdFieldNames.length,
    reusedFieldNames,
    createdFieldNames,
    totalNetAmount,
    payrollUrl,
    summaryText,
  };
}
