import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { google } from "googleapis";
import dotenv from "dotenv";

export type StorageMode = "local" | "google_drive";

export interface StorageFileItem {
  id: string; // File ID in Google Drive or relative file path in Local
  name: string;
  size: number;
  fullPath?: string;
  subfolder?: string;
}

export interface StorageInvoiceFileItem {
  id: string; // Absolute file path
  name: string; // File name (e.g., "INVOICE NO. 2024_25_1124.pdf")
  size: number; // File size in bytes
  fullPath: string;
  yearFolder?: string;
  monthFolder?: string;
  dateFolder?: string;
  companySubfolder?: string;
  relativePath: string;
}

export interface StorageDocumentFileItem {
  id: string; // Absolute file path
  name: string; // File name (e.g., "aadhar card.jpg")
  size: number; // File size in bytes
  fullPath: string;
  employeeFolderName?: string;
  companySubfolder?: string;
  relativePath: string;
  extension?: string;
}

export interface StorageReimbursementFileItem {
  id: string; // File ID in Google Drive or file path in Local
  name: string; // File name (e.g., "CANNY STAFF EXP FOR THE MONTH OF AUG-2026.xlsx")
  size: number;
  fullPath?: string;
  companySubfolder?: string;
  monthSubfolder?: string;
  relativePath: string;
}

let envLoaded = false;
function ensureEnvLoaded() {
  if (!envLoaded) {
    try {
      (dotenv.config as any)({ override: true, quiet: true });
    } catch {}
    envLoaded = true;
  }
}

/**
 * Returns whether the system is running in Local Desktop Folder mode or Google Drive mode
 */
export function getStorageMode(): StorageMode {
  ensureEnvLoaded();
  if (process.env.STORAGE_MODE === "google_drive") {
    return "google_drive";
  }
  return "local";
}

function getGoogleDriveClient() {
  ensureEnvLoaded();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      "Missing Google Service Account credentials in environment (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)"
    );
  }
  key = key.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function getRootPayrollFolderId(): Promise<string | null> {
  const rawEnvId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const drive = getGoogleDriveClient();
  const cleanId = rawEnvId?.trim().replace(/^['"]|['"]$/g, "");

  const candidateIds = Array.from(
    new Set([
      cleanId,
      cleanId?.replace("PeaFlKV", "PeaFIKV"),
      cleanId?.replace("PeaFIKV", "PeaFlKV"),
      cleanId?.replace("PeaHKV", "PeaFlKV"),
      cleanId?.replace("PeaFlKV", "PeafIKV"),
      cleanId?.replace("PeaFlKV", "PeaflKV"),
      "1MLueIRLBr-NObwPeaFlKVnlpsqUDWVMI",
      "1MLueIRLBr-NObwPeaFIKVnlpsqUDWVMI",
    ].filter(Boolean) as string[])
  );

  for (const cand of candidateIds) {
    try {
      const check = await drive.files.get({
        fileId: cand,
        fields: "id, name",
        supportsAllDrives: true,
      });
      if (check.data.id) {
        return check.data.id;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Fallback: search all folders accessible or shared with this service account
  try {
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 100,
    });
    const files = res.data.files || [];
    const payroll = files.find((f) => f.name?.trim().toLowerCase() === "payroll");
    if (payroll?.id) return payroll.id;
    const input = files.find((f) => f.name?.trim().toLowerCase() === "input");
    if (input?.id) return input.id;
    if (files.length > 0) return files[0].id || null;
  } catch (err: any) {
    console.warn(`[GoogleDrive] List accessible folders error: ${err?.message || err}`);
  }

  console.warn(`[GoogleDrive] Could not access any Payroll folder. Please ensure the Payroll folder is shared with the service account email.`);
  return null;
}

export interface GoogleDriveDiagnostics {
  serviceAccountEmail: string;
  configuredFolderId: string;
  connected: boolean;
  accessibleFoldersCount: number;
  accessibleFolders: Array<{ id: string; name: string }>;
  resolvedFolderId: string | null;
  resolvedFolderName: string | null;
  errorMessage?: string;
}

export async function getGoogleDriveDiagnostics(): Promise<GoogleDriveDiagnostics | null> {
  const mode = getStorageMode();
  if (mode !== "google_drive") return null;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const configuredFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim().replace(/^['"]|['"]$/g, "") || "";

  try {
    const drive = getGoogleDriveClient();
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 30,
    });

    const accessibleFolders = (res.data.files || []).map((f) => ({
      id: f.id || "",
      name: f.name || "",
    }));

    const rootFolderId = await getRootPayrollFolderId();
    let resolvedFolderName: string | null = null;
    if (rootFolderId) {
      try {
        const meta = await drive.files.get({ fileId: rootFolderId, fields: "id, name", supportsAllDrives: true });
        resolvedFolderName = meta.data.name || null;
      } catch {}
    }

    return {
      serviceAccountEmail: email,
      configuredFolderId,
      connected: accessibleFolders.length > 0 && Boolean(rootFolderId),
      accessibleFoldersCount: accessibleFolders.length,
      accessibleFolders,
      resolvedFolderId: rootFolderId,
      resolvedFolderName,
    };
  } catch (err: any) {
    return {
      serviceAccountEmail: email,
      configuredFolderId,
      connected: false,
      accessibleFoldersCount: 0,
      accessibleFolders: [],
      resolvedFolderId: null,
      resolvedFolderName: null,
      errorMessage: err?.message || String(err),
    };
  }
}

async function findGoogleDriveFolder(parentId: string, folderName: string): Promise<string | null> {
  try {
    const drive = getGoogleDriveClient();
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
    });
    const s = folderName.trim().toLowerCase();
    const isReimbursementSearch = s.startsWith("reimbur") || s.startsWith("reimbus");

    const target = (res.data.files || []).find((f) => {
      const n = f.name?.trim().toLowerCase() || "";
      if (n === s) return true;
      if (isReimbursementSearch && (n.startsWith("reimbur") || n.startsWith("reimbus"))) return true;
      return false;
    });
    return target?.id || null;
  } catch {
    return null;
  }
}

async function resolveGoogleDriveFolder(rootFolderId: string, folderName: string): Promise<string | null> {
  const drive = getGoogleDriveClient();
  const searchName = folderName.trim().toLowerCase();
  const isReimbursementSearch = searchName.startsWith("reimbur") || searchName.startsWith("reimbus");

  // 1. Check if rootFolderId itself matches folderName
  try {
    const meta = await drive.files.get({
      fileId: rootFolderId,
      fields: "id, name",
      supportsAllDrives: true,
    });
    const metaName = meta.data.name?.trim().toLowerCase() || "";
    if (
      metaName === searchName ||
      (isReimbursementSearch && (metaName.startsWith("reimbur") || metaName.startsWith("reimbus")))
    ) {
      return rootFolderId;
    }
  } catch {}

  // 2. Check if a direct child folder of rootFolderId matches
  const childId = await findGoogleDriveFolder(rootFolderId, folderName);
  if (childId) return childId;

  // 3. Fallback: search all accessible folders shared with this service account
  try {
    const res = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 200,
    });
    const matched = (res.data.files || []).find((f) => {
      const n = f.name?.trim().toLowerCase() || "";
      if (n === searchName) return true;
      if (isReimbursementSearch && (n.startsWith("reimbur") || n.startsWith("reimbus"))) return true;
      return false;
    });
    if (matched?.id) return matched.id;
  } catch {}

  // 4. Default back to rootFolderId if looking for Input folder
  if (searchName === "input") {
    return rootFolderId;
  }

  return null;
}

export async function downloadGoogleDriveFile(fileId: string): Promise<Buffer> {
  const drive = getGoogleDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function archiveGoogleDriveFile(fileId: string, newName: string): Promise<void> {
  const drive = getGoogleDriveClient();
  await drive.files.update({
    fileId,
    supportsAllDrives: true,
    requestBody: { name: newName },
  });
}

export async function listGoogleDriveTree(
  parentFolderId: string,
  currentRelativePath: string = ""
): Promise<Array<{ id: string; name: string; size: number; relativePath: string; isFolder: boolean }>> {
  try {
    const drive = getGoogleDriveClient();
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, size)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
    });

    const entries = res.data.files || [];
    let allItems: Array<{ id: string; name: string; size: number; relativePath: string; isFolder: boolean }> = [];

    for (const entry of entries) {
      if (
        !entry.name ||
        entry.name.startsWith(".") ||
        entry.name.startsWith("~$") ||
        entry.name.toLowerCase().includes("processed")
      ) {
        continue;
      }
      const isFolder = entry.mimeType === "application/vnd.google-apps.folder";
      const relPath = currentRelativePath ? `${currentRelativePath}/${entry.name}` : entry.name;

      if (isFolder) {
        allItems.push({
          id: entry.id!,
          name: entry.name,
          size: 0,
          relativePath: relPath,
          isFolder: true,
        });
        const subItems = await listGoogleDriveTree(entry.id!, relPath);
        allItems = allItems.concat(subItems);
      } else {
        allItems.push({
          id: entry.id!,
          name: entry.name,
          size: Number(entry.size) || 0,
          relativePath: relPath,
          isFolder: false,
        });
      }
    }
    return allItems;
  } catch {
    return [];
  }
}

export function getLocalPayrollBasePath(): string {
  let envPath = process.env.LOCAL_PAYROLL_FOLDER || process.env.FOLDER_WATCH_PATH;

  if (!envPath) {
    const candidatePaths = [
      "E:\\Canny\\Payroll",
      "e:\\Canny\\Payroll",
      "D:\\Canny\\Payroll",
      "C:\\Canny\\Payroll",
      "\\\\SERVER\\Canny Office\\Payroll",
    ];
    for (const cand of candidatePaths) {
      try {
        if (existsSync(cand)) {
          envPath = cand;
          break;
        }
      } catch {}
    }
  }

  if (envPath) {
    let rawPath = envPath.trim().replace(/^['"]|['"]$/g, "");
    if (rawPath.startsWith("\\") || rawPath.startsWith("/")) {
      const cleanParts = rawPath.replace(/^[\/\\]+/, "").split(/[\/\\]+/);
      return `\\\\${cleanParts.join("\\")}`;
    }
    return path.normalize(rawPath);
  }

  const homeDir = os.homedir();
  return path.join(homeDir, "Desktop", "Payroll");
}

export function getLocalDocumentsBasePath(): string {
  const basePath = getLocalPayrollBasePath();
  return path.join(basePath, "documents");
}

export function getLocalInvoiceBasePath(): string {
  const envPath = process.env.LOCAL_INVOICE_FOLDER;
  if (envPath) {
    let rawPath = envPath.trim().replace(/^['"]|['"]$/g, "");
    if (rawPath.startsWith("\\") || rawPath.startsWith("/")) {
      const cleanParts = rawPath.replace(/^[\/\\]+/, "").split(/[\/\\]+/);
      return `\\\\${cleanParts.join("\\")}`;
    }
    return path.normalize(rawPath);
  }
  const basePath = getLocalPayrollBasePath();
  return path.join(basePath, "Invoice");
}

export function getLocalReimbursementBasePath(): string {
  const envPath = process.env.LOCAL_REIMBURSEMENT_FOLDER;
  if (envPath) {
    let rawPath = envPath.trim().replace(/^['"]|['"]$/g, "");
    if (rawPath.startsWith("\\") || rawPath.startsWith("/")) {
      const cleanParts = rawPath.replace(/^[\/\\]+/, "").split(/[\/\\]+/);
      return `\\\\${cleanParts.join("\\")}`;
    }
    return path.normalize(rawPath);
  }
  const basePath = getLocalPayrollBasePath();
  const candidateNames = ["Reimbursement", "Reimbusrsment", "reimbursement", "reimbusrsment"];
  for (const name of candidateNames) {
    const candidatePath = path.join(basePath, name);
    try {
      if (existsSync(candidatePath)) return candidatePath;
    } catch {}
  }
  return path.join(basePath, "Reimbursement");
}

/**
 * Ensure directory exists locally / on network share
 */
async function ensureLocalDir(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") console.error("ensureLocalDir error:", err);
  }
}

/**
 * List files in Input folder & Company Subfolders (supports Local Desktop & Network Share & Google Drive)
 */
export async function listInputFiles(customInputFolder?: string): Promise<StorageFileItem[]> {
  const mode = getStorageMode();

  if (mode === "google_drive") {
    try {
      const rootFolderId = await getRootPayrollFolderId();
      if (!rootFolderId) return [];

      const inputFolderId = await resolveGoogleDriveFolder(rootFolderId, customInputFolder || "Input");
      if (!inputFolderId) return [];

      const tree = await listGoogleDriveTree(inputFolderId);
      const files: StorageFileItem[] = [];

      let inputFolderName = "";
      try {
        const drive = getGoogleDriveClient();
        const meta = await drive.files.get({
          fileId: inputFolderId,
          fields: "id, name",
          supportsAllDrives: true,
        });
        inputFolderName = meta.data.name || "";
      } catch {}

      for (const item of tree) {
        if (item.isFolder) continue;
        const lower = item.name.toLowerCase();
        if (
          !lower.includes("processed") &&
          (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm") || lower.endsWith(".csv"))
        ) {
          const parts = item.relativePath.split(/[\/\\]+/);
          let subfolder = parts.length > 1 ? parts[0] : undefined;
          if (!subfolder && inputFolderName && !["input", "payroll"].includes(inputFolderName.trim().toLowerCase())) {
            subfolder = inputFolderName;
          }
          files.push({
            id: item.id,
            name: item.name,
            size: item.size,
            subfolder,
          });
        }
      }
      return files;
    } catch (err) {
      console.error("Google Drive listInputFiles error:", err);
      return [];
    }
  }

  // Local / Network Server Folder Mode
  const primaryBasePath = getLocalPayrollBasePath();
  const desktopBasePath = path.join(os.homedir(), "Desktop", "Payroll");

  const inputDirsToScan = new Set<string>();
  inputDirsToScan.add(path.join(primaryBasePath, customInputFolder || "Input"));
  if (desktopBasePath !== primaryBasePath) {
    inputDirsToScan.add(path.join(desktopBasePath, customInputFolder || "Input"));
  }

  const resultMap = new Map<string, StorageFileItem>();

  for (const dirPath of inputDirsToScan) {
    await ensureLocalDir(dirPath);
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemLower = item.name.toLowerCase();
        if (
          item.name.startsWith(".") ||
          item.name.startsWith("~$") ||
          itemLower.includes("processed")
        ) {
          continue;
        }

        if (item.isDirectory()) {
          // Scan company subfolder (e.g. Input/Cotecna/, Input/SGS/)
          const subfolderPath = path.join(dirPath, item.name);
          try {
            const subFiles = await fs.readdir(subfolderPath, { withFileTypes: true });
            for (const sf of subFiles) {
              const lower = sf.name.toLowerCase();
              if (
                !sf.isDirectory() &&
                !sf.name.startsWith("~$") &&
                !sf.name.startsWith(".") &&
                !lower.includes("processed") &&
                (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm") || lower.endsWith(".csv"))
              ) {
                const filePath = path.join(subfolderPath, sf.name);
                const mapKey = `${item.name}/${sf.name}`;
                if (!resultMap.has(mapKey)) {
                  try {
                    const stat = await fs.stat(filePath);
                    resultMap.set(mapKey, {
                      id: filePath,
                      name: sf.name,
                      size: stat.size,
                      fullPath: filePath,
                      subfolder: item.name,
                    });
                  } catch {
                    resultMap.set(mapKey, {
                      id: filePath,
                      name: sf.name,
                      size: 0,
                      fullPath: filePath,
                      subfolder: item.name,
                    });
                  }
                }
              }
            }
          } catch (subErr) {
            console.error("Failed to read subfolder:", subfolderPath, subErr);
          }
        } else {
          // Root input file
          const lower = item.name.toLowerCase();
          if (
            !item.name.startsWith("~$") &&
            !item.name.startsWith(".") &&
            !lower.includes("processed") &&
            (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm") || lower.endsWith(".csv"))
          ) {
            const filePath = path.join(dirPath, item.name);
            if (!resultMap.has(item.name)) {
              try {
                const stat = await fs.stat(filePath);
                resultMap.set(item.name, {
                  id: filePath,
                  name: item.name,
                  size: stat.size,
                  fullPath: filePath,
                });
              } catch {
                resultMap.set(item.name, {
                  id: filePath,
                  name: item.name,
                  size: 0,
                  fullPath: filePath,
                });
              }
            }
          }
        }
      }
    } catch (readErr) {
      console.error("Failed to read input directory:", dirPath, readErr);
    }
  }

  const result = Array.from(resultMap.values());
  return result;
}

/**
 * Read / Download Excel file buffer
 */
export async function readExcelFile(fileItem: StorageFileItem): Promise<Buffer> {
  const mode = getStorageMode();

  if (mode === "google_drive") {
    return downloadGoogleDriveFile(fileItem.id);
  }

  // Local Folder Mode
  const filePath = fileItem.fullPath || fileItem.id;
  return fs.readFile(filePath);
}

async function safeFileRenameWithRetry(oldPath: string, newPath: string, maxAttempts = 3): Promise<void> {
  if (oldPath === newPath) return;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.rename(oldPath, newPath);
      return;
    } catch (err: any) {
      if (err.code === "EXDEV") {
        await fs.copyFile(oldPath, newPath);
        await fs.unlink(oldPath);
        return;
      }
      if ((err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES") && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      if (err.code === "EBUSY" || err.code === "EPERM") {
        throw new Error(
          `File is currently locked or open (e.g. in Microsoft Excel or another viewer). Please close it and retry.`
        );
      }
      throw err;
    }
  }
}

export interface ArchiveInputFileOptions {
  customProcessedFolder?: string;
  suggestedTitle?: string;
}

export interface ArchiveInputFileResult {
  success: boolean;
  archivedName: string;
  newPath?: string;
  error?: string;
}

/**
 * Archive processed input file in place with [PROCESSED] prefix (No Processed folder).
 * Supports smart AI renaming to standardize file name if suggestedTitle is provided.
 */
export async function archiveInputFile(
  fileItem: StorageFileItem,
  optionsOrCustomFolder?: string | ArchiveInputFileOptions
): Promise<ArchiveInputFileResult> {
  const mode = getStorageMode();
  const options: ArchiveInputFileOptions =
    typeof optionsOrCustomFolder === "string"
      ? { customProcessedFolder: optionsOrCustomFolder }
      : optionsOrCustomFolder || {};

  const ext = path.extname(fileItem.name) || ".xlsx";
  let targetBaseName = fileItem.name;

  // If a clean AI payroll title was provided (e.g. "Cotecna - Odisha (August 2026)"), standardize filename
  if (options.suggestedTitle) {
    const cleanTitle = options.suggestedTitle
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanTitle) {
      targetBaseName = `${cleanTitle}${ext}`;
    }
  }

  const archivedName = targetBaseName.startsWith("[PROCESSED]")
    ? targetBaseName
    : `[PROCESSED] ${targetBaseName}`;

  if (mode === "google_drive") {
    try {
      await archiveGoogleDriveFile(fileItem.id, archivedName);
      return { success: true, archivedName };
    } catch (err: any) {
      return {
        success: false,
        archivedName,
        error: err.message || String(err),
      };
    }
  }

  // Local Folder Mode: In-place rename in the same folder without creating a Processed subfolder
  const oldPath = fileItem.fullPath || fileItem.id;
  const dir = path.dirname(oldPath);
  let newPath = path.join(dir, archivedName);

  if (oldPath === newPath) {
    return { success: true, archivedName, newPath };
  }

  try {
    // If the destination file already exists and is not the current file, append a timestamp
    if (existsSync(newPath) && newPath !== oldPath) {
      const baseWithoutExt = archivedName.replace(new RegExp(`\\${ext}$`, "i"), "");
      newPath = path.join(dir, `${baseWithoutExt}_${Date.now()}${ext}`);
    }

    await safeFileRenameWithRetry(oldPath, newPath);
    return {
      success: true,
      archivedName: path.basename(newPath),
      newPath,
    };
  } catch (err: any) {
    return {
      success: false,
      archivedName,
      error: err.message || String(err),
    };
  }
}

import type { TypedSupabaseClient } from "@canny_ecosystem/supabase/types";
import { extractMetadataFromFilename } from "@/utils/automation/excel-pipeline.server";

function cleanToken(str: string): string {
  return str.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * List of generic payroll noise words excluded from company matching
 */
const NOISE_WORDS = new Set([
  "INDIA", "PVT", "LTD", "LIMITED", "INC", "CORP", "CO", "AND", "THE", "OF", "FOR",
  "BILL", "PAYMENT", "SHEET", "SALARY", "WAGE", "WAGES", "WORKER", "WORKERS", "EMPLOYEE",
  "MINERAL", "MINIRAL", "ODISHA", "SITE", "FINAL", "AUG", "AUGUST", "SEP", "SEPTEMBER",
  "OCT", "OCTOBER", "NOV", "NOVEMBER", "DEC", "DECEMBER", "JAN", "JANUARY", "FEB", "FEBRUARY",
  "MAR", "MARCH", "APR", "APRIL", "MAY", "JUN", "JUNE", "JUL", "JULY", "REGISTER", "REPORT",
  "DATA", "INPUT", "PROCESSED", "ATTENDANCE", "MONTH", "YEAR", "SIDING", "OTHER"
]);

export async function getCompanyFileFilter({
  supabase,
  activeCompanyId,
}: {
  supabase: TypedSupabaseClient;
  activeCompanyId: string;
}) {
  const { data: companies } = await supabase.from("companies").select("id, name");
  const { data: prefixes } = await supabase.from("company_prefix").select("id, name, company_id");
  const { data: sites } = await supabase.from("sites").select("id, name, company_id");

  const companyTokensMap = new Map<string, Set<string>>();

  for (const comp of (companies as any[]) || []) {
    const set = new Set<string>();
    const compName = comp.name || comp.company_name;
    if (compName) {
      const cleanedFullName = cleanToken(compName);
      if (cleanedFullName && !NOISE_WORDS.has(cleanedFullName)) set.add(cleanedFullName);
      const words = compName.split(/[\s_\-\.\,]+/);
      for (const w of words) {
        const cleaned = cleanToken(w);
        if (cleaned.length >= 2 && !NOISE_WORDS.has(cleaned)) {
          set.add(cleaned);
        }
      }
    }
    companyTokensMap.set(comp.id, set);
  }

  for (const pref of prefixes || []) {
    if (pref.name && pref.company_id) {
      const cleaned = cleanToken(pref.name);
      if (cleaned && !NOISE_WORDS.has(cleaned)) {
        if (!companyTokensMap.has(pref.company_id)) {
          companyTokensMap.set(pref.company_id, new Set());
        }
        companyTokensMap.get(pref.company_id)!.add(cleaned);
      }
    }
  }

  for (const site of sites || []) {
    if (site.name && site.company_id) {
      const cleaned = cleanToken(site.name);
      if (cleaned && cleaned.length >= 2 && !NOISE_WORDS.has(cleaned)) {
        if (!companyTokensMap.has(site.company_id)) {
          companyTokensMap.set(site.company_id, new Set());
        }
        companyTokensMap.get(site.company_id)!.add(cleaned);
      }
    }
  }

  const activeTokens = companyTokensMap.get(activeCompanyId) || new Set();
  const otherCompanyTokens = new Set<string>();

  const COMMON_SHORT_WORDS = new Set([
    "CO", "IN", "ST", "IT", "AT", "TO", "BY", "OR", "AN", "ON", "NO", "IS", "US", "ME", "MY", "WE", "AM", "GO", "DO", "UP", "SO", "BE", "IF", "HE", "HI"
  ]);

  for (const [cId, tokensSet] of companyTokensMap.entries()) {
    if (cId !== activeCompanyId) {
      for (const tok of tokensSet) {
        if (!activeTokens.has(tok) && tok.length >= 2 && !COMMON_SHORT_WORDS.has(tok) && !NOISE_WORDS.has(tok)) {
          otherCompanyTokens.add(tok);
        }
      }
    }
  }

  function isFileForActiveCompanyFolder(folderName: string): boolean {
    const folderClean = cleanToken(folderName);
    if (!folderClean) return false;

    for (const tok of activeTokens) {
      if (folderClean === tok || folderClean.includes(tok) || tok.includes(folderClean)) {
        return true;
      }
    }
    return false;
  }

  function isFileForActiveCompany(filename: string): boolean {
    const meta = extractMetadataFromFilename(filename);
    const filenameClean = cleanToken(filename);
    const metaCompanyClean = cleanToken(meta.companyName || "");

    let matchesActive = false;
    for (const tok of activeTokens) {
      if (
        (metaCompanyClean && (metaCompanyClean === tok || metaCompanyClean.includes(tok) || tok.includes(metaCompanyClean))) ||
        filenameClean.includes(tok)
      ) {
        matchesActive = true;
        break;
      }
    }

    let matchesOther = false;
    for (const otherTok of otherCompanyTokens) {
      if (
        (metaCompanyClean && (metaCompanyClean === otherTok || metaCompanyClean.includes(otherTok))) ||
        filenameClean.includes(otherTok)
      ) {
        matchesOther = true;
        break;
      }
    }

    if (matchesOther && !matchesActive) {
      return false;
    }
    if (matchesActive) {
      return true;
    }
    if (matchesOther) {
      return false;
    }

    return true;
  }

  async function filterFiles(files: StorageFileItem[]): Promise<StorageFileItem[]> {
    const matchedFiles: StorageFileItem[] = [];

    for (const f of files) {
      // If the file is inside a company subfolder (e.g. Input/Cotecna/), strictly match by subfolder
      if (f.subfolder) {
        if (isFileForActiveCompanyFolder(f.subfolder)) {
          matchedFiles.push(f);
        }
        // Subfolder exists: do not fall back to filename matching for other companies
        continue;
      }

      if (isFileForActiveCompany(f.name)) {
        matchedFiles.push(f);
      }
    }

    return matchedFiles;
  }

  async function filterDocFiles(docs: StorageDocumentFileItem[]): Promise<StorageDocumentFileItem[]> {
    const matchedDocs: StorageDocumentFileItem[] = [];

    for (const d of docs) {
      if (d.companySubfolder) {
        if (isFileForActiveCompanyFolder(d.companySubfolder)) {
          matchedDocs.push(d);
        }
        continue;
      }

      if (isFileForActiveCompany(d.name) || (d.employeeFolderName && isFileForActiveCompany(d.employeeFolderName))) {
        matchedDocs.push(d);
      }
    }

    return matchedDocs;
  }

  async function filterInvoiceFiles(invoices: StorageInvoiceFileItem[]): Promise<StorageInvoiceFileItem[]> {
    const matchedInvoices: StorageInvoiceFileItem[] = [];

    for (const inv of invoices) {
      if (inv.companySubfolder) {
        if (isFileForActiveCompanyFolder(inv.companySubfolder)) {
          matchedInvoices.push(inv);
        }
        continue;
      }

      const fullText = `${inv.name} ${inv.relativePath || ""}`;
      if (isFileForActiveCompany(fullText)) {
        matchedInvoices.push(inv);
      }
    }

    return matchedInvoices;
  }

  async function filterReimbursementFiles(files: StorageReimbursementFileItem[]): Promise<StorageReimbursementFileItem[]> {
    const matchedFiles: StorageReimbursementFileItem[] = [];

    for (const f of files) {
      if (f.companySubfolder) {
        if (isFileForActiveCompanyFolder(f.companySubfolder)) {
          matchedFiles.push(f);
        }
        continue;
      }

      const fullText = `${f.name} ${f.relativePath || ""}`;
      if (isFileForActiveCompany(fullText)) {
        matchedFiles.push(f);
      }
    }

    return matchedFiles;
  }

  const activeComp = ((companies as any[]) || []).find((c) => c.id === activeCompanyId);
  const activeCompanyName = activeComp?.name || activeComp?.company_name || "";

  return {
    activeCompanyId,
    activeCompanyName,
    activeTokens: Array.from(activeTokens),
    isFileForActiveCompany,
    isFileForActiveCompanyFolder,
    filterFiles,
    filterDocFiles,
    filterInvoiceFiles,
    filterReimbursementFiles,
  };
}

const IGNORED_SYSTEM_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".ini",
  ".db",
  ".sys",
  ".tmp",
  ".lnk",
  ".bat",
  ".cmd",
  ".ps1",
]);

/**
 * List all pending employee document files from documents/ and its subfolders
 */
export async function listPendingDocumentFiles(
  customDocsFolder?: string
): Promise<StorageDocumentFileItem[]> {
  const mode = getStorageMode();

  if (mode === "google_drive") {
    try {
      const rootFolderId = await getRootPayrollFolderId();
      if (!rootFolderId) return [];

      const docFolderId = await resolveGoogleDriveFolder(rootFolderId, customDocsFolder || "documents");
      if (!docFolderId) return [];

      const tree = await listGoogleDriveTree(docFolderId);
      const results: StorageDocumentFileItem[] = [];

      for (const item of tree) {
        if (item.isFolder) continue;
        const ext = path.extname(item.name).toLowerCase();
        if (IGNORED_SYSTEM_EXTENSIONS.has(ext)) continue;

        const parts = item.relativePath.split(/[\/\\]+/);
        let employeeFolderName: string | undefined = undefined;
        let companySubfolder: string | undefined = undefined;

        if (parts.length >= 3) {
          companySubfolder = parts[0];
          employeeFolderName = parts[1];
        } else if (parts.length === 2) {
          employeeFolderName = parts[0];
        }

        results.push({
          id: item.id,
          name: item.name,
          size: item.size,
          fullPath: item.id,
          employeeFolderName,
          companySubfolder,
          relativePath: item.relativePath,
          extension: ext || ".jpg",
        });
      }
      return results;
    } catch (err) {
      console.error("Google Drive listPendingDocumentFiles error:", err);
      return [];
    }
  }

  const basePath = customDocsFolder || getLocalDocumentsBasePath();
  await ensureLocalDir(basePath);

  const candidateDocDirs = [
    basePath,
    "E:\\Canny\\Payroll\\documents",
    "e:\\Canny\\Payroll\\documents",
    path.join(os.homedir(), "Desktop", "Payroll", "documents"),
  ];

  const docDirsToScan = new Set<string>();
  for (const dir of candidateDocDirs) {
    try {
      if (existsSync(dir)) {
        docDirsToScan.add(path.normalize(dir));
      }
    } catch {}
  }
  docDirsToScan.add(path.normalize(basePath));

  const resultMap = new Map<string, StorageDocumentFileItem>();

  for (const rootDir of docDirsToScan) {
    try {
      if (!existsSync(rootDir)) {
        await ensureLocalDir(rootDir);
      }

      const scanDirectory = async (currentDir: string, relativeDir: string = "") => {
        let entries: any[] = [];
        try {
          entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          const entryName = entry.name;
          const lower = entryName.toLowerCase();
          // Skip hidden files, system files, and processed files/directories
          if (
            entryName.startsWith(".") ||
            entryName.startsWith("~$") ||
            lower.includes("processed") ||
            lower === "desktop.ini" ||
            lower === "thumbs.db"
          ) {
            continue;
          }

          const fullEntryPath = path.join(currentDir, entryName);
          const relativeEntryPath = relativeDir ? path.join(relativeDir, entryName) : entryName;

          if (entry.isDirectory()) {
            await scanDirectory(fullEntryPath, relativeEntryPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entryName).toLowerCase();
            // Accept any file unless it is a known system / executable file
            if (!IGNORED_SYSTEM_EXTENSIONS.has(ext)) {
              let statSize = 0;
              try {
                const stat = await fs.stat(fullEntryPath);
                statSize = stat.size;
              } catch {}

              // Determine employeeFolderName from path structure
              // e.g., if relativeEntryPath is "eppie/aadhar card.jpg"
              const parts = relativeEntryPath.split(/[\/\\]+/);
              let employeeFolderName: string | undefined = undefined;
              let companySubfolder: string | undefined = undefined;

              if (parts.length >= 3) {
                companySubfolder = parts[0];
                employeeFolderName = parts[1];
              } else if (parts.length === 2) {
                employeeFolderName = parts[0];
              } else if (parts.length === 1 && relativeDir) {
                employeeFolderName = relativeDir;
              }

              const key = fullEntryPath.toLowerCase();
              if (!resultMap.has(key)) {
                resultMap.set(key, {
                  id: fullEntryPath,
                  name: entryName,
                  size: statSize,
                  fullPath: fullEntryPath,
                  employeeFolderName,
                  companySubfolder,
                  relativePath: relativeEntryPath,
                  extension: ext || ".jpg",
                });
              }
            }
          }
        }
      };

      await scanDirectory(rootDir);
    } catch (err) {
      console.error("Error scanning document directory:", rootDir, err);
    }
  }

  return Array.from(resultMap.values());
}

/**
 * Read Document file buffer
 */
export async function readDocumentFileBuffer(
  fileItem: StorageDocumentFileItem | { fullPath?: string; id?: string }
): Promise<Buffer> {
  const filePath = fileItem.fullPath || (fileItem as any).id;
  if (!filePath) {
    throw new Error("No file path provided for reading document buffer");
  }
  if (getStorageMode() === "google_drive" || !existsSync(filePath)) {
    return downloadGoogleDriveFile((fileItem as any).id || filePath);
  }
  return fs.readFile(filePath);
}

/**
 * Archive processed document file in place with [PROCESSED] prefix (No Processed folder)
 */
export async function archiveDocumentFile(
  fileItem: StorageDocumentFileItem,
  _subfolder?: string
): Promise<void> {
  const archivedName = fileItem.name.startsWith("[PROCESSED]")
    ? fileItem.name
    : `[PROCESSED] ${fileItem.name}`;

  if (getStorageMode() === "google_drive" || (fileItem.id && !existsSync(fileItem.fullPath || ""))) {
    await archiveGoogleDriveFile(fileItem.id, archivedName);
    return;
  }

  const oldPath = fileItem.fullPath || fileItem.id;
  const dir = path.dirname(oldPath);
  const newPath = path.join(dir, archivedName);

  if (oldPath !== newPath) {
    await safeFileRenameWithRetry(oldPath, newPath);
  }
}

/**
 * List all pending invoice PDF files from Invoice/ and its subfolders (Year/Month/Date)
 */
export async function listPendingInvoiceFiles(
  customInvoiceFolder?: string
): Promise<StorageInvoiceFileItem[]> {
  const mode = getStorageMode();

  if (mode === "google_drive") {
    try {
      const rootFolderId = await getRootPayrollFolderId();
      if (!rootFolderId) return [];

      const invoiceFolderId = await resolveGoogleDriveFolder(rootFolderId, customInvoiceFolder || "Invoice");
      if (!invoiceFolderId) return [];

      const tree = await listGoogleDriveTree(invoiceFolderId);
      const results: StorageInvoiceFileItem[] = [];

      for (const item of tree) {
        if (item.isFolder) continue;
        const ext = path.extname(item.name).toLowerCase();
        if (ext !== ".pdf" && ext !== ".jpg" && ext !== ".png" && ext !== ".jpeg") continue;

        const parts = item.relativePath.split(/[\/\\]+/);
        let yearFolder: string | undefined = undefined;
        let monthFolder: string | undefined = undefined;
        let dateFolder: string | undefined = undefined;
        let companySubfolder: string | undefined = undefined;

        if (parts.length >= 4) {
          yearFolder = parts[0];
          monthFolder = parts[1];
          dateFolder = parts[2];
        } else if (parts.length === 3) {
          yearFolder = parts[0];
          monthFolder = parts[1];
        } else if (parts.length === 2) {
          companySubfolder = parts[0];
        }

        results.push({
          id: item.id,
          name: item.name,
          size: item.size,
          fullPath: item.id,
          yearFolder,
          monthFolder,
          dateFolder,
          companySubfolder,
          relativePath: item.relativePath,
        });
      }
      return results;
    } catch (err) {
      console.error("Google Drive listPendingInvoiceFiles error:", err);
      return [];
    }
  }

  const basePath = customInvoiceFolder || getLocalInvoiceBasePath();
  await ensureLocalDir(basePath);

  const candidateInvoiceDirs = [
    basePath,
    "E:\\Canny\\Payroll\\Invoice",
    "e:\\Canny\\Payroll\\Invoice",
    "\\\\SERVER\\Canny Office\\Payroll\\Invoice",
    path.join(os.homedir(), "Desktop", "Payroll", "Invoice"),
  ];

  const invoiceDirsToScan = new Set<string>();
  for (const dir of candidateInvoiceDirs) {
    try {
      if (existsSync(dir)) {
        invoiceDirsToScan.add(path.normalize(dir));
      }
    } catch {}
  }
  invoiceDirsToScan.add(path.normalize(basePath));

  const resultMap = new Map<string, StorageInvoiceFileItem>();

  for (const rootDir of invoiceDirsToScan) {
    try {
      if (!existsSync(rootDir)) {
        await ensureLocalDir(rootDir);
      }

      const scanDirectory = async (currentDir: string, relativeDir: string = "") => {
        let entries: any[] = [];
        try {
          entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          const entryName = entry.name;
          const lower = entryName.toLowerCase();
          if (
            entryName.startsWith(".") ||
            entryName.startsWith("~$") ||
            lower.includes("processed") ||
            lower === "desktop.ini" ||
            lower === "thumbs.db"
          ) {
            continue;
          }

          const fullEntryPath = path.join(currentDir, entryName);
          const relativeEntryPath = relativeDir ? path.join(relativeDir, entryName) : entryName;

          if (entry.isDirectory()) {
            await scanDirectory(fullEntryPath, relativeEntryPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entryName).toLowerCase();
            if (ext === ".pdf" || ext === ".jpg" || ext === ".png" || ext === ".jpeg") {
              let statSize = 0;
              try {
                const stat = await fs.stat(fullEntryPath);
                statSize = stat.size;
              } catch {}

              const parts = relativeEntryPath.split(/[\/\\]+/);
              let yearFolder: string | undefined = undefined;
              let monthFolder: string | undefined = undefined;
              let dateFolder: string | undefined = undefined;
              let companySubfolder: string | undefined = undefined;

              // Parsing directory structure: Year / Month / Date / File
              if (parts.length >= 4) {
                yearFolder = parts[0];
                monthFolder = parts[1];
                dateFolder = parts[2];
              } else if (parts.length === 3) {
                yearFolder = parts[0];
                monthFolder = parts[1];
              } else if (parts.length === 2) {
                companySubfolder = parts[0];
              }

              const key = fullEntryPath.toLowerCase();
              if (!resultMap.has(key)) {
                resultMap.set(key, {
                  id: fullEntryPath,
                  name: entryName,
                  size: statSize,
                  fullPath: fullEntryPath,
                  yearFolder,
                  monthFolder,
                  dateFolder,
                  companySubfolder,
                  relativePath: relativeEntryPath,
                });
              }
            }
          }
        }
      };

      await scanDirectory(rootDir);
    } catch (err) {
      console.error("Error scanning invoice directory:", rootDir, err);
    }
  }

  return Array.from(resultMap.values());
}

/**
 * Read Invoice file buffer
 */
export async function readInvoiceFileBuffer(
  fileItem: StorageInvoiceFileItem | { fullPath?: string; id?: string }
): Promise<Buffer> {
  const filePath = fileItem.fullPath || (fileItem as any).id;
  if (!filePath) {
    throw new Error("No file path provided for reading invoice buffer");
  }
  if (getStorageMode() === "google_drive" || !existsSync(filePath)) {
    return downloadGoogleDriveFile((fileItem as any).id || filePath);
  }
  return fs.readFile(filePath);
}

/**
 * Archive processed invoice file in place with [PROCESSED] prefix (No Processed folder)
 */
export async function archiveInvoiceFile(
  fileItem: StorageInvoiceFileItem
): Promise<void> {
  const archivedName = fileItem.name.startsWith("[PROCESSED]")
    ? fileItem.name
    : `[PROCESSED] ${fileItem.name}`;

  if (getStorageMode() === "google_drive" || (fileItem.id && !existsSync(fileItem.fullPath || ""))) {
    await archiveGoogleDriveFile(fileItem.id, archivedName);
    return;
  }

  const oldPath = fileItem.fullPath || fileItem.id;
  const dir = path.dirname(oldPath);
  const newPath = path.join(dir, archivedName);

  if (oldPath !== newPath) {
    await safeFileRenameWithRetry(oldPath, newPath);
  }
}

/**
 * List all pending reimbursement Excel files from Reimbursement/ and its subfolders (Company/Month)
 */
export async function listPendingReimbursementFiles(
  customReimbursementFolder?: string
): Promise<StorageReimbursementFileItem[]> {
  const mode = getStorageMode();

  if (mode === "google_drive") {
    try {
      const rootFolderId = await getRootPayrollFolderId();
      if (!rootFolderId) return [];

      const reimFolderId = await resolveGoogleDriveFolder(rootFolderId, customReimbursementFolder || "Reimbursement");
      if (!reimFolderId) return [];

      const tree = await listGoogleDriveTree(reimFolderId);
      const results: StorageReimbursementFileItem[] = [];

      for (const item of tree) {
        if (item.isFolder) continue;
        const lower = item.name.toLowerCase();
        if (
          lower.startsWith("~$") ||
          lower.startsWith(".") ||
          lower.includes("processed") ||
          (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".xlsm") && !lower.endsWith(".csv") && !lower.endsWith(".pdf"))
        ) {
          continue;
        }

        const parts = item.relativePath.split(/[\/\\]+/);
        let companySubfolder: string | undefined = undefined;
        let monthSubfolder: string | undefined = undefined;

        if (parts.length >= 3) {
          companySubfolder = parts[0];
          monthSubfolder = parts[1];
        } else if (parts.length === 2) {
          companySubfolder = parts[0];
        }

        results.push({
          id: item.id,
          name: item.name,
          size: item.size,
          fullPath: item.id,
          companySubfolder,
          monthSubfolder,
          relativePath: item.relativePath,
        });
      }
      return results;
    } catch (err) {
      console.error("Google Drive listPendingReimbursementFiles error:", err);
      return [];
    }
  }

  const basePath = customReimbursementFolder || getLocalReimbursementBasePath();
  await ensureLocalDir(basePath);

  const candidateDirs = [
    basePath,
    path.join(getLocalPayrollBasePath(), "Reimbursement"),
    path.join(getLocalPayrollBasePath(), "Reimbusrsment"),
  ];

  const dirsToScan = new Set<string>();
  for (const dir of candidateDirs) {
    try {
      if (existsSync(dir)) dirsToScan.add(path.normalize(dir));
    } catch {}
  }
  dirsToScan.add(path.normalize(basePath));

  const resultMap = new Map<string, StorageReimbursementFileItem>();

  for (const rootDir of dirsToScan) {
    try {
      if (!existsSync(rootDir)) await ensureLocalDir(rootDir);

      const scanDirectory = async (currentDir: string, relativeDir: string = "") => {
        let entries: any[] = [];
        try {
          entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          const entryName = entry.name;
          const lower = entryName.toLowerCase();
          if (
            entryName.startsWith(".") ||
            entryName.startsWith("~$") ||
            lower.includes("processed") ||
            lower === "desktop.ini" ||
            lower === "thumbs.db"
          ) {
            continue;
          }

          const fullEntryPath = path.join(currentDir, entryName);
          const relativeEntryPath = relativeDir ? path.join(relativeDir, entryName) : entryName;

          if (entry.isDirectory()) {
            await scanDirectory(fullEntryPath, relativeEntryPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entryName).toLowerCase();
            if (ext === ".xlsx" || ext === ".xls" || ext === ".xlsm" || ext === ".csv" || ext === ".pdf") {
              let statSize = 0;
              try {
                const stat = await fs.stat(fullEntryPath);
                statSize = stat.size;
              } catch {}

              const parts = relativeEntryPath.split(/[\/\\]+/);
              let companySubfolder: string | undefined = undefined;
              let monthSubfolder: string | undefined = undefined;

              if (parts.length >= 3) {
                companySubfolder = parts[0];
                monthSubfolder = parts[1];
              } else if (parts.length === 2) {
                companySubfolder = parts[0];
              }

              const key = fullEntryPath.toLowerCase();
              if (!resultMap.has(key)) {
                resultMap.set(key, {
                  id: fullEntryPath,
                  name: entryName,
                  size: statSize,
                  fullPath: fullEntryPath,
                  companySubfolder,
                  monthSubfolder,
                  relativePath: relativeEntryPath,
                });
              }
            }
          }
        }
      };

      await scanDirectory(rootDir);
    } catch (err) {
      console.error("Error scanning reimbursement directory:", rootDir, err);
    }
  }

  return Array.from(resultMap.values());
}

/**
 * Read Reimbursement file buffer
 */
export async function readReimbursementFileBuffer(
  fileItem: StorageReimbursementFileItem | { fullPath?: string; id?: string }
): Promise<Buffer> {
  const filePath = fileItem.fullPath || (fileItem as any).id;
  if (!filePath) {
    throw new Error("No file path provided for reading reimbursement buffer");
  }
  if (getStorageMode() === "google_drive" || !existsSync(filePath)) {
    return downloadGoogleDriveFile((fileItem as any).id || filePath);
  }
  return fs.readFile(filePath);
}

/**
 * Archive processed reimbursement file in place with [PROCESSED] prefix
 */
export async function archiveReimbursementFile(
  fileItem: StorageReimbursementFileItem
): Promise<void> {
  const archivedName = fileItem.name.startsWith("[PROCESSED]")
    ? fileItem.name
    : `[PROCESSED] ${fileItem.name}`;

  if (getStorageMode() === "google_drive" || (fileItem.id && !existsSync(fileItem.fullPath || ""))) {
    await archiveGoogleDriveFile(fileItem.id, archivedName);
    return;
  }

  const oldPath = fileItem.fullPath || fileItem.id;
  const dir = path.dirname(oldPath);
  const newPath = path.join(dir, archivedName);

  if (oldPath !== newPath) {
    await safeFileRenameWithRetry(oldPath, newPath);
  }
}

