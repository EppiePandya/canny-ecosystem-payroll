import path from "node:path";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "@canny_ecosystem/utils";
import { employeeDocumentTypeArray } from "@canny_ecosystem/utils";
import {
  SUPABASE_BUCKET,
  SUPABASE_MEDIA_URL_PREFIX,
} from "@canny_ecosystem/utils/constant";
import type {
  EmployeeDatabaseRow,
  TypedSupabaseClient,
} from "@canny_ecosystem/supabase/types";
import {
  listPendingDocumentFiles,
  readDocumentFileBuffer,
  archiveDocumentFile,
  getCompanyFileFilter,
  type StorageDocumentFileItem,
} from "@/utils/server/folder-storage.server";
import { GEMINI_LITE } from "@/utils/ai/chat/constant";
import { addEmployeeDocument } from "@canny_ecosystem/supabase/mutations";

export type EmployeeDocumentType = (typeof employeeDocumentTypeArray)[number];

export interface DocumentClassificationResult {
  documentType: EmployeeDocumentType;
  confidence: number;
  reason: string;
  aiUsed: boolean;
}

export interface MatchedEmployeeInfo {
  id: string;
  employee_code: string | null;
  name: string;
  company_id: string | null;
  matchScore: number;
  matchReason: string;
}

export interface ProcessDocumentReport {
  filename: string;
  relativePath: string;
  status: "success" | "skipped" | "error";
  message: string;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  documentType?: EmployeeDocumentType;
  documentUrl?: string;
  fileSize: number;
  archived: boolean;
  error?: any;
}

export interface DocumentSyncBatchResult {
  success: boolean;
  message: string;
  timestamp: string;
  filesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  reports: ProcessDocumentReport[];
}

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
};

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function normalizeToken(str: string): string {
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Fast heuristic classification based on filename and subfolder tokens
 */
export function classifyDocumentTypeFast(
  filename: string,
  subfolder?: string
): DocumentClassificationResult | null {
  const combined = `${subfolder || ""} ${filename}`.toLowerCase();
  const clean = combined.replace(/[^a-z0-9]/g, " ");

  const hasGuardian =
    clean.includes("guardian") ||
    clean.includes("father") ||
    clean.includes("mother") ||
    clean.includes("parent");

  // 1. Aadhaar Card
  if (
    clean.includes("aadhaar") ||
    clean.includes("aadhar") ||
    clean.includes("adhar") ||
    clean.includes("uidai") ||
    clean.includes("adar card") ||
    clean.includes("aadar")
  ) {
    if (hasGuardian) {
      return {
        documentType: "guardian_aadhaar_card",
        confidence: 0.95,
        reason: "Heuristic: Matches guardian aadhaar pattern",
        aiUsed: false,
      };
    }
    return {
      documentType: "aadhaar_card",
      confidence: 0.95,
      reason: "Heuristic: Matches Aadhaar card keywords",
      aiUsed: false,
    };
  }

  // 2. PAN Card
  if (
    clean.includes("pan card") ||
    clean.includes("pancard") ||
    clean.includes("pan doc") ||
    clean.includes("pan copy") ||
    clean.includes("income tax pan") ||
    /\bpan\b/.test(clean)
  ) {
    return {
      documentType: "pan_card",
      confidence: 0.95,
      reason: "Heuristic: Matches PAN card keywords",
      aiUsed: false,
    };
  }

  // 3. Bank Document
  if (
    clean.includes("passbook") ||
    clean.includes("bank statement") ||
    clean.includes("bank doc") ||
    clean.includes("cheque") ||
    clean.includes("cancel cheque") ||
    clean.includes("cancelled cheque") ||
    clean.includes("bank proof") ||
    clean.includes("bank details") ||
    clean.includes("bank account")
  ) {
    if (hasGuardian) {
      return {
        documentType: "guardian_bank_document",
        confidence: 0.95,
        reason: "Heuristic: Matches guardian bank document",
        aiUsed: false,
      };
    }
    return {
      documentType: "bank_document",
      confidence: 0.95,
      reason: "Heuristic: Matches bank document keywords",
      aiUsed: false,
    };
  }

  // 4. Driving License
  if (
    clean.includes("driving license") ||
    clean.includes("driving licence") ||
    clean.includes("driver license") ||
    clean.includes("driving lic") ||
    clean.includes("dl copy") ||
    /\bdl\b/.test(clean)
  ) {
    return {
      documentType: "driving_license",
      confidence: 0.95,
      reason: "Heuristic: Matches driving license keywords",
      aiUsed: false,
    };
  }

  // 5. Election / Voter ID Card
  if (
    clean.includes("voter") ||
    clean.includes("election") ||
    clean.includes("epic card") ||
    clean.includes("voting card")
  ) {
    return {
      documentType: "election_card",
      confidence: 0.95,
      reason: "Heuristic: Matches voter/election card keywords",
      aiUsed: false,
    };
  }

  // 6. Address Proof
  if (
    clean.includes("address proof") ||
    clean.includes("electricity bill") ||
    clean.includes("light bill") ||
    clean.includes("ration card") ||
    clean.includes("rent agreement") ||
    clean.includes("gas bill") ||
    clean.includes("water bill")
  ) {
    return {
      documentType: "address_proof",
      confidence: 0.9,
      reason: "Heuristic: Matches address proof keywords",
      aiUsed: false,
    };
  }

  // 7. Education Document
  if (
    clean.includes("education") ||
    clean.includes("marksheet") ||
    clean.includes("degree") ||
    clean.includes("diploma") ||
    clean.includes("10th") ||
    clean.includes("12th") ||
    clean.includes("ssc") ||
    clean.includes("hsc") ||
    clean.includes("graduation") ||
    clean.includes("college") ||
    clean.includes("school")
  ) {
    return {
      documentType: "education_document",
      confidence: 0.9,
      reason: "Heuristic: Matches education document keywords",
      aiUsed: false,
    };
  }

  // 8. CV / Resume / Bio Data
  if (
    clean.includes("resume") ||
    clean.includes("curriculum vitae") ||
    clean.includes("cv") ||
    clean.includes("bio data") ||
    clean.includes("biodata")
  ) {
    return {
      documentType: clean.includes("cv") ? "cv" : "bio_data",
      confidence: 0.9,
      reason: "Heuristic: Matches resume/cv/bio-data keywords",
      aiUsed: false,
    };
  }

  // 9. Birth Certificate
  if (clean.includes("birth certificate") || clean.includes("birth cert")) {
    return {
      documentType: "birth_certificate",
      confidence: 0.95,
      reason: "Heuristic: Matches birth certificate keywords",
      aiUsed: false,
    };
  }

  // 10. Forms
  if (clean.includes("canny form")) {
    return {
      documentType: "canny_form",
      confidence: 0.95,
      reason: "Heuristic: Matches canny form",
      aiUsed: false,
    };
  }
  if (clean.includes("clearance")) {
    return {
      documentType: "clearance_form",
      confidence: 0.95,
      reason: "Heuristic: Matches clearance form",
      aiUsed: false,
    };
  }
  if (clean.includes("joining form") || clean.includes("joining")) {
    return {
      documentType: "joining_form",
      confidence: 0.9,
      reason: "Heuristic: Matches joining form",
      aiUsed: false,
    };
  }
  if (clean.includes("personal data")) {
    return {
      documentType: "personal_data_form",
      confidence: 0.9,
      reason: "Heuristic: Matches personal data form",
      aiUsed: false,
    };
  }

  return null;
}

const ClassificationSchema = z.object({
  documentType: z.enum(employeeDocumentTypeArray).describe(
    "The standard classification for the employee document."
  ),
  confidence: z.number().min(0).max(1).describe("Confidence level from 0 to 1"),
  reason: z.string().describe("Brief justification for the classification"),
});

/**
 * Classify document type using Gemini AI if heuristic is ambiguous
 */
export async function classifyDocumentTypeWithAI({
  filename,
  subfolder,
}: {
  filename: string;
  subfolder?: string;
}): Promise<DocumentClassificationResult> {
  // First check fast heuristic
  const fastResult = classifyDocumentTypeFast(filename, subfolder);
  if (fastResult && fastResult.confidence >= 0.85) {
    return fastResult;
  }

  try {
    const prompt = `Analyze this file name and location to classify which Indian HR/Employee document type it is:
File Name: "${filename}"
Folder Name: "${subfolder || "root"}"

Allowed standard document types:
${employeeDocumentTypeArray.map((t) => `- ${t}`).join("\n")}

Guidelines:
- Aadhaar card/UIDAI/Adhar -> "aadhaar_card"
- PAN Card/Income Tax -> "pan_card"
- Bank passbook/cancelled cheque/statement -> "bank_document"
- Voter card/Election ID -> "election_card"
- Driving license/DL -> "driving_license"
- Electricity bill/Rent agreement/Address proof -> "address_proof"
- 10th/12th/Marksheet/Degree/Certificate -> "education_document"
- Resume/CV -> "cv" or "bio_data"
- If it mentions guardian/father/mother + aadhaar -> "guardian_aadhaar_card"
- If it mentions guardian/father/mother + bank -> "guardian_bank_document"
- Default to "address_proof" or "personal_data_form" if unknown general document.`;

    const result = await generateObject({
      model: google(GEMINI_LITE),
      system:
        "You are an expert HR document classification AI. Classify the provided employee document accurately.",
      prompt,
      schema: ClassificationSchema,
    });

    return {
      documentType: result.object.documentType,
      confidence: result.object.confidence,
      reason: result.object.reason,
      aiUsed: true,
    };
  } catch (aiErr) {
    console.warn("AI Classification fallback error:", aiErr);
    // Fallback if AI fails
    return (
      fastResult || {
        documentType: "aadhaar_card",
        confidence: 0.5,
        reason: "Default fallback",
        aiUsed: false,
      }
    );
  }
}

/**
 * Match an employee candidate name / folder name against the database employee list
 */
export function matchEmployeeByNameOrCode({
  candidateString,
  allEmployees,
}: {
  candidateString: string;
  allEmployees: Pick<
    EmployeeDatabaseRow,
    "id" | "employee_code" | "first_name" | "middle_name" | "last_name" | "company_id"
  >[];
}): MatchedEmployeeInfo | null {
  if (!candidateString || !allEmployees.length) return null;

  const raw = candidateString.trim();
  const cleanRaw = normalizeToken(raw);
  if (!cleanRaw) return null;

  // 1. Direct Employee Code match
  for (const emp of allEmployees) {
    if (emp.employee_code) {
      const codeClean = normalizeToken(emp.employee_code);
      if (codeClean && (cleanRaw === codeClean || cleanRaw.includes(codeClean) || codeClean.includes(cleanRaw))) {
        const name = [emp.first_name, emp.middle_name, emp.last_name]
          .filter(Boolean)
          .join(" ");
        return {
          id: emp.id,
          employee_code: emp.employee_code,
          name: name || emp.employee_code,
          company_id: emp.company_id,
          matchScore: 1.0,
          matchReason: `Exact Employee Code Match: ${emp.employee_code}`,
        };
      }
    }
  }

  // 2. Direct First Name or Last Name match (e.g. folder "eppie")
  for (const emp of allEmployees) {
    const firstClean = emp.first_name ? normalizeToken(emp.first_name) : "";
    const lastClean = emp.last_name ? normalizeToken(emp.last_name) : "";
    const fullNameParts = [emp.first_name, emp.middle_name, emp.last_name]
      .filter(Boolean)
      .join(" ");

    if (firstClean && cleanRaw === firstClean) {
      return {
        id: emp.id,
        employee_code: emp.employee_code,
        name: fullNameParts,
        company_id: emp.company_id,
        matchScore: 0.98,
        matchReason: `First Name Match: ${emp.first_name}`,
      };
    }

    if (lastClean && cleanRaw === lastClean && lastClean.length >= 3) {
      return {
        id: emp.id,
        employee_code: emp.employee_code,
        name: fullNameParts,
        company_id: emp.company_id,
        matchScore: 0.92,
        matchReason: `Last Name Match: ${emp.last_name}`,
      };
    }
  }

  // 3. Exact full name match
  for (const emp of allEmployees) {
    const fullNameParts = [emp.first_name, emp.middle_name, emp.last_name]
      .filter(Boolean)
      .join(" ");
    const cleanFull = normalizeToken(fullNameParts);

    if (cleanFull && (cleanRaw === cleanFull || cleanRaw.includes(cleanFull) || cleanFull.includes(cleanRaw))) {
      return {
        id: emp.id,
        employee_code: emp.employee_code,
        name: fullNameParts,
        company_id: emp.company_id,
        matchScore: 0.95,
        matchReason: `Name Match: ${fullNameParts}`,
      };
    }

    // Also try First + Last only
    const shortName = [emp.first_name, emp.last_name].filter(Boolean).join(" ");
    const cleanShort = normalizeToken(shortName);
    if (cleanShort && (cleanRaw === cleanShort || cleanRaw.includes(cleanShort) || cleanShort.includes(cleanRaw))) {
      return {
        id: emp.id,
        employee_code: emp.employee_code,
        name: fullNameParts,
        company_id: emp.company_id,
        matchScore: 0.9,
        matchReason: `Name Match: ${shortName}`,
      };
    }
  }

  // 3. Token-based word overlap match
  const candidateTokens = raw
    .toLowerCase()
    .split(/[\s_\-\.\,]+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 2);

  let bestMatch: MatchedEmployeeInfo | null = null;
  let highestScore = 0;

  for (const emp of allEmployees) {
    const fullName = [emp.first_name, emp.middle_name, emp.last_name]
      .filter(Boolean)
      .join(" ");
    const empTokens = fullName
      .toLowerCase()
      .split(/[\s_\-\.\,]+/)
      .map(normalizeToken)
      .filter((t) => t.length >= 2);

    if (empTokens.length === 0) continue;

    let matchCount = 0;
    for (const cTok of candidateTokens) {
      if (empTokens.some((eTok) => eTok === cTok || eTok.includes(cTok) || cTok.includes(eTok))) {
        matchCount++;
      }
    }

    const score = matchCount / Math.max(empTokens.length, candidateTokens.length);
    if (score > 0.45 && score > highestScore) {
      highestScore = score;
      bestMatch = {
        id: emp.id,
        employee_code: emp.employee_code,
        name: fullName,
        company_id: emp.company_id,
        matchScore: score,
        matchReason: `Token Similarity (${Math.round(score * 100)}%): ${fullName}`,
      };
    }
  }

  return bestMatch;
}

/**
 * Upload single document buffer directly to Supabase Storage and DB
 */
export async function uploadDocumentToSupabase({
  supabase,
  fileBuffer,
  filename,
  employeeId,
  documentType,
}: {
  supabase: TypedSupabaseClient;
  fileBuffer: Buffer;
  filename: string;
  employeeId: string;
  documentType: EmployeeDocumentType;
}): Promise<{ status: "success" | "error"; url?: string; error?: string }> {
  try {
    let ext = path.extname(filename).toLowerCase();
    let contentType = MIME_MAP[ext];

    // Sniff buffer header if extension missing or unknown
    if (!contentType || ext === "") {
      if (fileBuffer.length >= 4) {
        if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4e && fileBuffer[3] === 0x47) {
          contentType = "image/png";
          if (!ext) ext = ".png";
        } else if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) {
          contentType = "image/jpeg";
          if (!ext) ext = ".jpg";
        } else if (fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46) {
          contentType = "application/pdf";
          if (!ext) ext = ".pdf";
        } else if (fileBuffer[0] === 0x52 && fileBuffer[1] === 0x49 && fileBuffer[2] === 0x46 && fileBuffer[3] === 0x46) {
          contentType = "image/webp";
          if (!ext) ext = ".webp";
        }
      }
      if (!contentType) {
        contentType = "image/jpeg";
        if (!ext) ext = ".jpg";
      }
    }

    const baseName = path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9\-_]/g, "_");
    const cleanFileName = `${baseName || "document"}${ext}`;
    const filePath = `employees/${documentType}/${employeeId}_${Date.now()}_${cleanFileName}`;
    const fileData = new Uint8Array(fileBuffer);

    // 1. Upload to Supabase Storage Bucket
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET.CANNY_ECOSYSTEM)
      .upload(filePath, fileData, {
        contentType: contentType || "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return {
        status: "error",
        error: `Storage error: ${uploadError.message || String(uploadError)}`,
      };
    }

    // 2. Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from(SUPABASE_BUCKET.CANNY_ECOSYSTEM)
      .getPublicUrl(filePath);

    const publicUrl =
      publicUrlData?.publicUrl ||
      `${SUPABASE_MEDIA_URL_PREFIX}${SUPABASE_BUCKET.CANNY_ECOSYSTEM}/${filePath}`;

    // 3. Remove existing doc of same type to avoid duplicates
    try {
      await supabase
        .from("employee_documents")
        .delete()
        .eq("employee_id", employeeId)
        .eq("document_type", documentType);
    } catch {}

    // 4. Insert new record using addEmployeeDocument
    const { error: insertError } = await addEmployeeDocument({
      supabase,
      employee_id: employeeId,
      document_type: documentType,
      url: publicUrl,
    });

    if (insertError) {
      console.error("Error inserting employee_documents record:", insertError);
      return {
        status: "error",
        error: `Database error: ${(insertError as any).message || String(insertError)}`,
      };
    }

    return {
      status: "success",
      url: publicUrl,
    };
  } catch (err: any) {
    console.error("uploadDocumentToSupabase exception:", err);
    return {
      status: "error",
      error: `Upload exception: ${err.message || String(err)}`,
    };
  }
}

/**
 * Process a single document file item: Match employee -> AI Classify -> Upload -> Archive
 */
export async function processSingleEmployeeDocument({
  fileItem,
  supabase,
  allEmployees,
  overrideEmployeeId,
}: {
  fileItem: StorageDocumentFileItem;
  supabase: TypedSupabaseClient;
  allEmployees?: Pick<
    EmployeeDatabaseRow,
    "id" | "employee_code" | "first_name" | "middle_name" | "last_name" | "company_id"
  >[];
  overrideEmployeeId?: string;
}): Promise<ProcessDocumentReport> {
  const report: ProcessDocumentReport = {
    filename: fileItem.name,
    relativePath: fileItem.relativePath,
    status: "skipped",
    message: "",
    fileSize: fileItem.size,
    archived: false,
  };

  try {
    // 1. Fetch employees if not provided
    let employeesList = allEmployees;
    if (!employeesList) {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, employee_code, first_name, middle_name, last_name, company_id");
      employeesList = emps || [];
    }

    // 2. Identify Target Employee
    let targetEmployeeId = overrideEmployeeId;
    let targetEmployeeName = "";
    let targetEmployeeCode = "";

    if (targetEmployeeId) {
      const matched = employeesList.find((e) => e.id === targetEmployeeId);
      if (matched) {
        targetEmployeeName = [matched.first_name, matched.middle_name, matched.last_name]
          .filter(Boolean)
          .join(" ");
        targetEmployeeCode = matched.employee_code || "";
      }
    } else {
      // Look up via folder name or filename
      const searchString = fileItem.employeeFolderName || fileItem.name;
      const matched = matchEmployeeByNameOrCode({
        candidateString: searchString,
        allEmployees: employeesList,
      });

      if (matched) {
        targetEmployeeId = matched.id;
        targetEmployeeName = matched.name;
        targetEmployeeCode = matched.employee_code || "";
      }
    }

    if (!targetEmployeeId) {
      report.status = "skipped";
      report.message = `Could not match folder/file "${fileItem.relativePath}" to any employee in the database.`;
      return report;
    }

    report.employeeId = targetEmployeeId;
    report.employeeName = targetEmployeeName;
    report.employeeCode = targetEmployeeCode;

    // 3. Classify document type using AI & heuristics
    const classification = await classifyDocumentTypeWithAI({
      filename: fileItem.name,
      subfolder: fileItem.employeeFolderName,
    });

    report.documentType = classification.documentType;

    // 4. Read File Buffer
    const fileBuffer = await readDocumentFileBuffer(fileItem);

    // 5. Upload to Supabase Storage and link in database
    const uploadResult = await uploadDocumentToSupabase({
      supabase,
      fileBuffer,
      filename: fileItem.name,
      employeeId: targetEmployeeId,
      documentType: classification.documentType,
    });

    if (uploadResult.status === "error") {
      report.status = "error";
      report.message = uploadResult.error || "Failed to upload document";
      return report;
    }

    report.documentUrl = uploadResult.url;

    // 6. Archive processed file locally to avoid duplicates
    try {
      await archiveDocumentFile(fileItem, targetEmployeeName || "General");
      report.archived = true;
    } catch (archErr) {
      console.warn("Could not archive file locally:", archErr);
      report.archived = false;
    }

    report.status = "success";
    report.message = `Successfully ingested "${fileItem.name}" as ${classification.documentType} for ${targetEmployeeName || "Employee"}${classification.aiUsed ? " (AI Classified)" : ""}.`;
    return report;
  } catch (err: any) {
    report.status = "error";
    report.message = err.message || String(err);
    report.error = err;
    return report;
  }
}

/**
 * Process all pending documents or filter by employee
 */
export async function processAllPendingDocuments({
  supabase,
  companyId,
  employeeIdFilter,
  filePathsFilter,
}: {
  supabase: TypedSupabaseClient;
  companyId?: string;
  employeeIdFilter?: string;
  filePathsFilter?: string[];
}): Promise<DocumentSyncBatchResult> {
  let rawFiles = await listPendingDocumentFiles();
  let pendingFiles = rawFiles;

  if (companyId) {
    const filterUtil = await getCompanyFileFilter({
      supabase,
      activeCompanyId: companyId,
    });
    pendingFiles = await filterUtil.filterDocFiles(rawFiles);
  }

  if (filePathsFilter && filePathsFilter.length > 0) {
    const normFilters = new Set(
      filePathsFilter.map((p) => p.replace(/\\/g, "/").toLowerCase())
    );
    pendingFiles = pendingFiles.filter((f) => {
      const full = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
      const id = (f.id || "").replace(/\\/g, "/").toLowerCase();
      const rel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
      return normFilters.has(full) || normFilters.has(id) || normFilters.has(rel);
    });
  }

  if (pendingFiles.length === 0) {
    return {
      success: true,
      message: "No pending document files found in documents/ folder.",
      timestamp: new Date().toLocaleTimeString(),
      filesFound: 0,
      filesProcessed: 0,
      filesSkipped: 0,
      reports: [],
    };
  }

  // Fetch employees list
  let query = supabase
    .from("employees")
    .select("id, employee_code, first_name, middle_name, last_name, company_id");

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data: allEmployees } = await query;
  const employeesList = allEmployees || [];

  const reports: ProcessDocumentReport[] = [];

  for (const fileItem of pendingFiles) {
    // If filtering by specific employeeId
    if (employeeIdFilter) {
      const matched = matchEmployeeByNameOrCode({
        candidateString: fileItem.employeeFolderName || fileItem.name,
        allEmployees: employeesList,
      });

      if (!matched || matched.id !== employeeIdFilter) {
        continue;
      }
    }

    const report = await processSingleEmployeeDocument({
      fileItem,
      supabase,
      allEmployees: employeesList,
      overrideEmployeeId: employeeIdFilter,
    });

    reports.push(report);
  }

  const successCount = reports.filter((r) => r.status === "success").length;
  const skippedCount = reports.filter((r) => r.status === "skipped").length;

  return {
    success: true,
    message: `Processed ${successCount} document(s) successfully.${skippedCount > 0 ? ` Skipped ${skippedCount} unmatched file(s).` : ""}`,
    timestamp: new Date().toLocaleTimeString(),
    filesFound: pendingFiles.length,
    filesProcessed: successCount,
    filesSkipped: skippedCount,
    reports,
  };
}

/**
 * Sync documents for a specific employee ID from the local documents folder
 */
export async function syncEmployeeDocumentsFromFolder({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}): Promise<DocumentSyncBatchResult> {
  const pendingFiles = await listPendingDocumentFiles();

  if (pendingFiles.length === 0) {
    return {
      success: true,
      message: "No pending document files found in Payroll/documents folder.",
      timestamp: new Date().toLocaleTimeString(),
      filesFound: 0,
      filesProcessed: 0,
      filesSkipped: 0,
      reports: [],
    };
  }

  // 1. Fetch exact employee record
  const { data: emp } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, middle_name, last_name, company_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (!emp) {
    return {
      success: false,
      message: `Employee with ID ${employeeId} not found in database.`,
      timestamp: new Date().toLocaleTimeString(),
      filesFound: pendingFiles.length,
      filesProcessed: 0,
      filesSkipped: pendingFiles.length,
      reports: [],
    };
  }

  const empFullName = [emp.first_name, emp.middle_name, emp.last_name]
    .filter(Boolean)
    .join(" ");

  const empTokens = new Set<string>();
  if (emp.first_name) empTokens.add(normalizeToken(emp.first_name));
  if (emp.middle_name) empTokens.add(normalizeToken(emp.middle_name));
  if (emp.last_name) empTokens.add(normalizeToken(emp.last_name));
  if (emp.employee_code) empTokens.add(normalizeToken(emp.employee_code));
  if (emp.first_name && emp.last_name) {
    empTokens.add(normalizeToken(`${emp.first_name}${emp.last_name}`));
  }
  empTokens.add(normalizeToken(empFullName));

  const reports: ProcessDocumentReport[] = [];

  for (const fileItem of pendingFiles) {
    const folderClean = normalizeToken(fileItem.employeeFolderName || "");
    const nameClean = normalizeToken(fileItem.name || "");
    const relClean = normalizeToken(fileItem.relativePath || "");

    let isMatch = false;
    for (const tok of empTokens) {
      if (tok && tok.length >= 2) {
        if (
          folderClean === tok ||
          folderClean.includes(tok) ||
          tok.includes(folderClean) ||
          nameClean.includes(tok) ||
          relClean.includes(tok)
        ) {
          isMatch = true;
          break;
        }
      }
    }

    if (!isMatch) {
      continue;
    }

    const report = await processSingleEmployeeDocument({
      fileItem,
      supabase,
      allEmployees: [emp],
      overrideEmployeeId: employeeId,
    });

    reports.push(report);
  }

  const successCount = reports.filter((r) => r.status === "success").length;
  const skippedCount = reports.filter((r) => r.status === "skipped").length;
  const errorReports = reports.filter((r) => r.status === "error");

  const detailMsg =
    errorReports.length > 0
      ? `Failed to upload: ${errorReports.map((e) => e.message).join("; ")}`
      : "";

  return {
    success: successCount > 0,
    message:
      successCount > 0
        ? `Successfully auto-saved ${successCount} document(s) for ${empFullName}.`
        : errorReports.length > 0
        ? `Checked ${reports.length} matching file(s) for ${empFullName} but could not upload. ${detailMsg}`
        : `No documents found in Payroll/documents matching employee "${empFullName}" (Folder looked for: "${emp.first_name?.toLowerCase()}").`,
    timestamp: new Date().toLocaleTimeString(),
    filesFound: pendingFiles.length,
    filesProcessed: successCount,
    filesSkipped: skippedCount,
    reports,
  };
}
