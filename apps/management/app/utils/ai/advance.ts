import { booleanArray, z } from "@canny_ecosystem/utils";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { GEMINI_LITE } from "./chat/constant";

export const AdvanceFiltersSchema = z.object({
  name: z
    .string()
    .optional()
    .describe(
      "Full name, employee code or advance name. Example: John Doe or EMP123 or Personal Advance",
    ),
  advance_date_start: z
    .string()
    .optional()
    .describe(
      "Advance Date start range in YYYY-MM-DD format. Example: 1990-01-01",
    ),
  advance_date_end: z
    .string()
    .optional()
    .describe(
      "Advance Date end range in YYYY-MM-DD format. Example: 2000-12-31",
    ),
  is_paid: z
    .enum(booleanArray)
    .optional()
    .describe("Is the advance fully paid."),
  project: z
    .string()
    .optional()
    .describe("Project name assigned to the individual."),
  site: z.string().optional().describe("Name of the site under the project."),
  in_reimbursement: z
    .enum(booleanArray)
    .optional()
    .describe("Is the advance linked to a reimbursement."),
  month: z.string().optional().describe("Month of the advance date."),
  year: z.string().optional().describe("Year of the advance date."),
});

export const generateAdvanceFilter = async ({
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
      schema: AdvanceFiltersSchema,
    });
    return { object: result.object };
  } catch (e) {
    console.error("Error generating query: ", e);
    return {
      object: {},
    };
  }
};
