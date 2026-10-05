import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "@canny_ecosystem/utils";
import { GEMINI_LITE } from "./chat/constant";

export const suggestSalaryImportConfig = async ({
  sampleRows,
  totalRows,
}: {
  sampleRows: any[][];
  totalRows: number;
}) => {
  try {
    const result = await generateObject({
      model: google(GEMINI_LITE),
      system: `You are an expert HR data migration assistant.
      Your task is to analyze a sample of rows from a salary/payroll Excel spreadsheet and detect the import parameters.
      
      Here are the instructions:
      1. Detect the "headerRow" (1-indexed row number): The row that contains column headers (like Employee Code, Net Payable, Present Days, HRA, Basic, etc.).
      2. Detect the "startRow" (1-indexed row number): The row where actual employee records begin. This is usually headerRow + 1.
      3. Detect the "endRow" (1-indexed row number): The row where actual employee records end. Total rows count is ${totalRows}. If the last rows in the sheet are totals, summary rows, averages, or blank rows, exclude them from the endRow. Otherwise, return ${totalRows}.
      4. Detect the "empCodeColIdx" (0-indexed column index): The column that contains the Employee Code/ID (look for headers like Code, Employee Code, Emp Code, Emp ID, ID, Card No, Emp No, etc.).
      5. Detect the "netPayableColIdx" (0-indexed column index): The column that contains the Net Salary / Net Payable / Net Pay / Take Home (look for headers like Net, Net Salary, Net Payable, Net Pay, Take Home, Take-Home, Paid Amount, Salary, Total Paid, etc.).
      6. Detect the "presentDaysColIdx" (0-indexed column index): The column that contains attendance present days / days worked (look for headers like Present, Present Days, Paid Days, Days Worked, Days, Attendance, etc.). Return null if not present.
      
      Analyze the sample rows carefully:
      - Look at header titles (usually string columns in one of the top rows).
      - Look at data formats (e.g. employee codes are alphanumeric or short numbers, salaries are larger numeric values, present days are numbers between 0 and 31).
      - Ensure all returned values are mathematically sound (e.g. startRow > headerRow).
      - Return a JSON object with: headerRow, startRow, endRow, empCodeColIdx, netPayableColIdx, presentDaysColIdx.`,
      prompt: `Spreadsheet Sample Rows (first ${sampleRows.length} rows): ${JSON.stringify(sampleRows)}`,
      schema: z.object({
        headerRow: z
          .number()
          .describe("The 1-indexed row number containing the column headers."),
        startRow: z
          .number()
          .describe(
            "The 1-indexed row number where actual employee records begin.",
          ),
        endRow: z
          .number()
          .describe(
            "The 1-indexed row number where actual employee records end.",
          ),
        empCodeColIdx: z
          .number()
          .nullable()
          .describe(
            "The 0-indexed column index containing the Employee Code/ID.",
          ),
        netPayableColIdx: z
          .number()
          .nullable()
          .describe(
            "The 0-indexed column index containing the Net Payable/Net Salary.",
          ),
        presentDaysColIdx: z
          .number()
          .nullable()
          .describe(
            "The 0-indexed column index containing present days/attendance. Return null if no such column exists.",
          ),
      }),
    });
    return result.object;
  } catch (e) {
    console.error("Error suggesting salary import config: ", e);
    return {
      headerRow: 1,
      startRow: 2,
      endRow: totalRows,
      empCodeColIdx: null,
      netPayableColIdx: null,
      presentDaysColIdx: null,
    };
  }
};

export interface AIHeaderClassification {
  rawHeader: string;
  category:
    | "employee_code"
    | "uan_number"
    | "esic_number"
    | "employee_name"
    | "present_days"
    | "working_days"
    | "absent_days"
    | "overtime_hours"
    | "earning"
    | "deduction"
    | "ignore";
  systemKey: string;
}

const AIClassificationSchema = z.object({
  classifications: z.array(
    z.object({
      rawHeader: z.string(),
      category: z.enum([
        "employee_code",
        "uan_number",
        "esic_number",
        "employee_name",
        "present_days",
        "working_days",
        "absent_days",
        "overtime_hours",
        "earning",
        "deduction",
        "ignore",
      ]),
      systemKey: z
        .string()
        .describe(
          "Normalized key name e.g. BASIC, HRA, PF, ESI, EXPENSES, EFFICIENCY_BONUS",
        ),
    }),
  ),
});

/**
 * Uses Gemini AI to classify Excel spreadsheet headers into employee IDs, attendance, earnings, deductions, or ignored metadata.
 */
export async function classifyHeadersWithAI(
  headers: string[],
  existingCompanyFields?: Array<{ id?: string; name: string; display_name?: string | null; type?: string }>
): Promise<Map<string, AIHeaderClassification>> {
  const map = new Map<string, AIHeaderClassification>();
  if (!headers || headers.length === 0) return map;

  const existingFieldNames = (existingCompanyFields || []).map((f) => f.name).filter(Boolean);

  try {
    const result = await generateObject({
      model: google(GEMINI_LITE),
      system: `You are an expert HR and Payroll AI Data Classification assistant.
Your task is to analyze column headers from an Excel payroll spreadsheet and classify each column.

EXISTING COMPANY PAYMENT FIELDS IN DATABASE:
${existingFieldNames.length > 0 ? JSON.stringify(existingFieldNames) : "None provided"}

Categorize each header into ONE of the following categories:
- "employee_code": Employee ID / Code column (e.g. EMP.CODE, CODE, CARD NO, EMP ID)
- "uan_number": UAN Number column (e.g. UAN, UAN NO)
- "esic_number": ESIC Number column (e.g. ESIC NO, ESI NO, IP NO)
- "employee_name": Employee Full Name column (e.g. Name of Workmen, Employee Name, Name, Staff Name)
- "present_days": Attendance present days / days worked / paid days (e.g. Attn, Atten, Present, Worked Days, Paid Days, P.day, P.days, P.DAY, No. of Present Days, Number of Present Days, Total Present, Present Days)
- "working_days": Total month working days / standard days (e.g. Working Days, Total Days, W.day, W.days, W.DAY, No. of Working Days, Number of Working Days, Month Days, Total Working Days, Std Days)
- "absent_days": Absent days column
- "overtime_hours": Overtime hours column
- "earning": Actual payable earning salary components (e.g. Basic, HRA, DA, Bonus, Allowance, Expenses, Efficiency Bonus, OT Amount)
- "deduction": Actual deduction salary components (e.g. PF, EPF, ESI, ESIC, PT, TDS, LWF, Advance, Loan)
- "ignore": Informational metadata, personal details, reference rates, summary totals, or non-payment fields (e.g. Sr No, Father's Name, Mother's Name, Spouse, Designation/Degn, Daily Rate, Wage Rate, P.M, PM, Per Month, Rate P.M, ESIC Area, Location, Gross Summary, Total Deductions Summary, Net Payment Summary, Remarks)

CRITICAL INSTRUCTIONS:
1. MATCH EXISTING DATABASE FIELDS & STRIP SUFFIXES: If an Excel header is a synonym, site-suffixed, or project-suffixed variation (for example: "HRA_SCCL" -> "HRA", "LTA_MINIRAL" -> "LTA", "OVERTIME_SURAT" -> "OVERTIME", "EFFICIENCY_MINIRAL_ODISHA" -> "EFFICIENCY_BONUS", "EXPENSES_OMC_ODISHA" -> "EXPENSES", "Statutory_Leave_Minir" -> "STATUTORY_LEAVE"), YOU MUST SET systemKey TO THE CLEAN BASE FIELD NAME (e.g. "HRA", "LTA", "OVERTIME", "EFFICIENCY_BONUS", "EXPENSES", "STATUTORY_LEAVE"). NEVER retain site/location suffixes like SCCL, MINIRAL, SURAT, ODISHA, OMC in system keys!
2. FLEXIBLE ATTENDANCE CLASSIFICATION:
   - Any column expressing PRESENT DAYS (e.g. "Attn", "P.day", "P.days", "Present", "Worked Days", "Paid Days", "No of Present Days", "Total Present") MUST be classified as "present_days".
   - Any column expressing TOTAL WORKING DAYS or MONTH DAYS (e.g. "W.day", "Working Days", "Total Days", "No of Working Days", "Month Days", "Std Days") MUST be classified as "working_days".
   - Columns named "P.M", "PM", "Rate P.M", "Per Month" represent the monthly minimum wage rate (monetary amount like 14842, 13186), NOT working days! "P.M" MUST ALWAYS be classified as "ignore". NEVER classify "P.M" as working_days!
3. Informational metadata like "Father's Name", "Sr. No.", "Designation", "Rate" (daily wage rate), "P.M" / "PM" (monthly minimum wage rate), "GN", "ESIC Area", "Location", "Remarks" MUST be classified as "ignore". NEVER classify them as earnings, deductions, or working_days!
4. Performance/attendance multiplier counts like "Efficience", "Efficiency" (when numeric count like 5.00, 6.00) MUST be classified as "ignore". They are NOT payable monetary fields! "Efficiency Bonus" (if amount) IS an earning.
5. Overtime multiplier count "OT" (e.g. 1.00, 0.00) MUST be classified as "overtime_hours". "OT Amount" or "Overtime Amount" IS an earning.
6. Summary calculated columns like "Gross", "Total Deductions", "Net Payment", "Take Home" MUST be classified as "ignore" so they are not double-added as component line items.
7. System key MUST use clean capitalized base component names without site or location suffixes.`,
      prompt: `Spreadsheet Column Headers: ${JSON.stringify(headers)}`,
      schema: AIClassificationSchema,
    });

    for (const item of result.object.classifications) {
      map.set(item.rawHeader.trim(), item as AIHeaderClassification);
    }
  } catch (err) {
    console.error("AI Header Classification failed, falling back to rule engine:", err);
  }

  return map;
}
