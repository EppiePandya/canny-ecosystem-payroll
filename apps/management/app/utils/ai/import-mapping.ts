import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "@canny_ecosystem/utils";
import { GEMINI_LITE } from "./chat/constant";

const MappingResultSchema = z.object({
  mapping: z
    .record(z.string(), z.string())
    .describe(
      "A mapping where key is the internal field name and value is the header from the uploaded file.",
    ),
});

export const suggestFieldMapping = async ({
  headers,
  targetFields,
}: {
  headers: string[];
  targetFields: string[];
}) => {
  try {
    const result = await generateObject({
      model: google(GEMINI_LITE),
      system: `You are an expert data migration assistant. 
      Your task is to map headers from an uploaded CSV/Excel file to internal database fields.
      
      Internal Fields:
      ${targetFields.join(", ")}
      
      Instructions:
      - Analyze the uploaded headers and find the best match for each internal field.
      - Case sensitivity, underscores, and minor typos should be ignored.
      - SPECIAL RULE: If you see 'Name' or 'Employee Name', map it to 'full_name'.
      - SPECIAL RULE: If you see 'Father Name', map it to 'guardian_full_name'.
      - SPECIAL RULE: If you see 'Address', map it to 'full_address' (unless separate city/state columns exist).
      - SPECIAL RULE: Map 'EMP. CODE' or 'Code' to 'employee_code'.
      - SPECIAL RULE: Map 'UAN NO.' or 'UAN' to 'uan_number'.
      - If a header is a clear match for an internal field, include it in the mapping.
      - Do not guess if you are unsure. Only map clear matches.
      - Return a JSON object where the key is the Internal Field and the value is the matching header from the uploaded file.`,
      prompt: `Uploaded Headers: ${headers.join(", ")}`,
      schema: MappingResultSchema,
    });
    return result.object;
  } catch (e) {
    console.error("Error suggesting mapping: ", e);
    return { mapping: {} };
  }
};
