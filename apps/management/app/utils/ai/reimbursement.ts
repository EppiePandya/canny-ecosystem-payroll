import {
  booleanArray,
  reimbursementStatusArray,
  reimbursementTypeArray,
  z,
} from "@canny_ecosystem/utils";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { GEMINI_LITE } from "./chat/constant";
import { recentlyAddedFilter } from "@/constant";

export const ReimbursementFiltersSchema = z.object({
  name: z
    .string()
    .optional()
    .describe(
      "Full name, employee code or reimbursement name. Example: John Doe or EMP123 or Bonus",
    ),
  submitted_date_start: z
    .string()
    .optional()
    .describe(
      "Submitted Date Reimbursement start range in YYYY-MM-DD format. Example: 1990-01-01",
    ),
  submitted_date_end: z
    .string()
    .optional()
    .describe(
      "Submitted Date of Reimbursement end range in YYYY-MM-DD format. Example: 2000-12-31",
    ),
  users: z.string().optional().describe("Authority giving the approval."),
  status: z
    .enum(reimbursementStatusArray)
    .optional()
    .describe("Reimbursement status."),
  type: z
    .enum(reimbursementTypeArray)
    .optional()
    .describe("Reimbursement type."),
  project: z
    .string()
    .optional()
    .describe("Project name assigned to the individual."),
  site: z.string().optional().describe("Name of the site under the project."),
  payee: z
    .string()
    .optional()
    .describe("Name of the payee which has reimbursements."),
  in_invoice: z
    .enum(booleanArray)
    .optional()
    .describe("Is the reimbursement in any Invoice."),
  recently_added: z
    .enum(recentlyAddedFilter as [string, ...string[]])
    .optional()
    .describe(
      "Reimbursements usage added before particular time i.e.Recently added reimbursements. Example: 5_mins or 8_hours",
    ),
  reimbursement_for: z
    .enum(["employee", "payee", "vehicle"])
    .optional()
    .describe(
      "The type of entity for which the reimbursement is made (employee, payee, or vehicle). Example: employee or payee",
    ),
});

export const EmailReimbursementAnalysisSchema = z.object({
  is_reimbursement: z
    .boolean()
    .describe(
      "True ONLY if the email is requesting or submitting an employee/business reimbursement or expense/advance claim. False for repayment schedules, general emails, bank receipts, newsletters, or subcon status reports.",
    ),
  amount: z
    .number()
    .optional()
    .describe(
      "Extracted claim amount in numeric format if explicitly specified in the email.",
    ),
  type: z
    .enum(["expenses", "travel", "medical", "loan", "advances"])
    .default("expenses")
    .describe("Category of reimbursement claim: expenses, travel, medical, loan, or advances."),
  summary_note: z
    .string()
    .optional()
    .describe("Clean 1-line summary note for the reimbursement claim."),
});

export const analyzeEmailForReimbursementWithAI = async ({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) => {
  try {
    const result = await generateObject({
      model: google(GEMINI_LITE),
      system: `You are an AI assistant that analyzes incoming workplace emails to categorize them and determine if an email is an authentic employee reimbursement or expense/advance claim submission.
      Rules:
      - Return is_reimbursement = true if the email is about expenses, travel bills, medical claims, advances, or employee reimbursements.
      - Return is_reimbursement = false for general marketing emails, newsletters, bank repayment schedules, subcon status reports, personal emails, or non-reimbursement messages.
      - Extract exact amount and classify category into one of: expenses, travel, medical, loan, advances.`,
      prompt: `Subject: ${subject}\n\nBody/Snippet:\n${body.slice(0, 1500)}`,
      schema: EmailReimbursementAnalysisSchema,
    });
    return { object: result.object };
  } catch (e) {
    console.error("Error analyzing email with Gemini AI: ", e);
    return { object: null };
  }
};

export const generateReimbursementFilter = async ({
  input,
  context,
}: {
  input: string;
  context?: string;
}) => {
  try {
    const result = await generateObject({
      model: google(GEMINI_LITE),
      system: `You are a helpful assistant that generates filters for a given prompt.
      Current date is: ${new Date().toISOString().split("T")[0]}.
      Instructions:
      - Only include filters that have valid and meaningful values.
      - Omit any filters with empty strings, "unknown", null, undefined, or placeholder/default values.
      - Trim whitespace from string values before checking validity.
      - Do not include optional or default filters unless explicitly set.
      - Return filters as clean, minimal objects with only valid entries relevant to the user's request.
      ${context}`,
      prompt: input,
      schema: ReimbursementFiltersSchema,
    });
    return { object: result.object };
  } catch (e) {
    console.error("Error generating query: ", e);
    return {
      object: "Invalid request",
    };
  }
};
