import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function ensureEnvLoaded() {
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/management/.env"),
    path.resolve(currentDir, "../.env"),
    path.resolve(currentDir, "../../.env"),
  ];
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
      }
    } catch {}
  }
}
ensureEnvLoaded();

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  ensureEnvLoaded();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

/**
 * Checks whether an email address exists in the database `users` table (and `employees` table).
 */
async function checkUserExistsByEmail(email: string): Promise<{ exists: boolean; user?: any }> {
  try {
    const sb = getSupabase();
    if (!sb) {
      console.warn("[GmailAutoReply] Supabase credentials not found, cannot query users table");
      return { exists: false };
    }
    const cleanEmail = email.trim().toLowerCase();

    // 1. Query users table
    const { data: users, error: userErr } = await sb
      .from("users")
      .select("id, email, first_name, last_name, is_active")
      .ilike("email", cleanEmail)
      .limit(1);

    if (userErr) {
      console.error("[GmailAutoReply] Database query error on users table:", userErr);
    } else if (users && users.length > 0) {
      return { exists: true, user: users[0] };
    }

    // 2. Query employees table as fallback
    const { data: employees, error: empErr } = await sb
      .from("employees")
      .select("id, email, personal_email, first_name, last_name")
      .or(`email.ilike.${cleanEmail},personal_email.ilike.${cleanEmail}`)
      .limit(1);

    if (!empErr && employees && employees.length > 0) {
      return { exists: true, user: employees[0] };
    }

    return { exists: false };
  } catch (err) {
    console.error("[GmailAutoReply] Exception checking user in database:", err);
    return { exists: false };
  }
}

/**
 * Detects if an email is forwarded and extracts the original sender's email address.
 */
function extractForwardedInfo(bodyText: string, bodyHtml?: string, subject?: string): {
  isForwarded: boolean;
  forwardedEmail: string | null;
} {
  const isFwdSubject = /^(?:fwd|fw|fwd\[\d+\]):\s*/i.test(subject || "");
  const combined = `${bodyText || ""}\n${bodyHtml || ""}`;

  const hasFwdMarker =
    /(?:---------- Forwarded message ---------|-----Original Message-----|Begin forwarded message:?|Forwarded message:?|-------- Original-Nachricht --------)/i.test(
      combined
    );

  const isForwarded = isFwdSubject || hasFwdMarker;

  if (!isForwarded) {
    return { isForwarded: false, forwardedEmail: null };
  }

  // Regex patterns to extract the original sender's email from the forwarded section
  const patterns = [
    // Pattern 1: Forwarded block with From: name <email> or From: email
    /(?:Forwarded message|Original Message|Begin forwarded message)[\s\S]*?From:\s*(?:[^<\n\r]+<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
    // Pattern 2: From: inside text block
    /From:\s*(?:[^\n\r<]+<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
    // Pattern 3: mailto: link in HTML
    /From:[\s\S]*?mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    // Pattern 4: Sender:
    /Sender:\s*(?:[^\n\r<]+<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
  ];

  for (const regex of patterns) {
    const match = combined.match(regex);
    if (match && match[1]) {
      const email = match[1].trim().toLowerCase();
      ensureEnvLoaded();
      const rawAllowed = (process.env.AUTO_REPLY_ALLOWED_EMAIL?.trim() || "cannycms@gmail.com").toLowerCase();
      const allowedSenders = rawAllowed
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const botEmail = (process.env.GMAIL_USER || "common.canny@gmail.com").toLowerCase().trim();
      // Ensure the extracted email is NOT the forwarder itself or the bot
      if (!allowedSenders.includes(email) && email !== botEmail) {
        return { isForwarded: true, forwardedEmail: email };
      }
    }
  }

  return { isForwarded: true, forwardedEmail: null };
}

/**
 * Detects if an attachment is an Excel file (.xlsx, .xls, .xlsm, .xlsb, .csv)
 */
function isExcelAttachment(att: { filename?: string; contentType?: string }): boolean {
  const filename = (att.filename || "").toLowerCase().trim();
  const contentType = (att.contentType || "").toLowerCase().trim();

  const excelExtensions = [".xlsx", ".xls", ".xlsm", ".xlsb", ".csv"];
  const hasExcelExtension = excelExtensions.some((ext) => filename.endsWith(ext));

  const excelContentTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.macroenabled.12",
    "application/vnd.ms-excel.sheet.binary.macroenabled.12",
    "application/msexcel",
    "application/x-msexcel",
    "application/x-ms-excel",
    "application/x-excel",
    "application/x-dos_ms_excel",
    "application/xls",
    "application/x-xls",
    "text/csv",
    "application/csv",
  ];
  const hasExcelContentType = excelContentTypes.some((ct) => contentType.includes(ct));

  return hasExcelExtension || hasExcelContentType;
}

/**
 * Opens an Excel file (.xlsx, .xls, .xlsm, .csv) and extracts total rows and the last row as text.
 */
function parseExcelAttachmentInfo(
  content: Buffer | Uint8Array,
  filename: string
): {
  totalRows: number;
  lastRowText: string;
} {
  try {
    const workbook = XLSX.read(Buffer.from(content), { type: "buffer", cellDates: true });
    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      return { totalRows: 0, lastRowText: "Empty spreadsheet (no sheets found)" };
    }

    const firstSheet = workbook.Sheets[sheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as any[][];

    // Filter out completely blank rows
    const rows = rawRows.filter(
      (row) => Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
    );

    const totalRows = rows.length;
    if (totalRows === 0) {
      return { totalRows: 0, lastRowText: "No data rows found" };
    }

    const lastRow = rows[totalRows - 1];
    const lastRowText = lastRow
      .map((cell) => {
        if (cell === null || cell === undefined) return "";
        if (cell instanceof Date) return cell.toLocaleDateString();
        return String(cell).trim();
      })
      .filter((cell) => cell !== "")
      .join(", ");

    return {
      totalRows,
      lastRowText: lastRowText || "Empty row",
    };
  } catch (err: any) {
    console.error(`[GmailAutoReply] Error reading Excel file "${filename}":`, err);
    return {
      totalRows: 0,
      lastRowText: `Error parsing file: ${err?.message || "Invalid or corrupt format"}`,
    };
  }
}

export interface AutoReplyConfig {
  enabled: boolean;
  keyword: string;
  replyMessage: string;
  allowedSenderEmail: string;
  pollIntervalSeconds: number;
  enabledAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  processedCount: number;
}

export interface AutoReplyHistoryItem {
  id: string;
  uid: number;
  messageId: string;
  from: string;
  subject: string;
  repliedAt: string;
  replyMessage: string;
  status: "success" | "error";
  error?: string;
  verificationType?: "forwarded" | "direct";
  forwardedEmail?: string | null;
  hasExcelAttachment?: boolean;
}

interface StoredData {
  config: AutoReplyConfig;
  processedIds: string[];
  history: AutoReplyHistoryItem[];
}

const DEFAULT_CONFIG: AutoReplyConfig = {
  enabled: false,
  keyword: "AUTO_REPLY",
  replyMessage: "Hello",
  allowedSenderEmail: process.env.AUTO_REPLY_ALLOWED_EMAIL || "cannycms@gmail.com",
  pollIntervalSeconds: 30,
  enabledAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
  processedCount: 0,
};

// Storage directory and file (anchored to currentDir so cwd differences never cause data loss)
const DATA_DIR = path.resolve(currentDir, "../data");
const STORAGE_FILE = path.join(DATA_DIR, "gmail-auto-reply.json");

function ensureStorageDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("[GmailAutoReply] Failed to create data dir:", err);
  }
}

function loadStoredData(): StoredData {
  ensureEnvLoaded();
  ensureStorageDir();
  const searchFiles = [
    STORAGE_FILE,
    path.resolve(process.cwd(), "data/gmail-auto-reply.json"),
    path.resolve(currentDir, "../../data/gmail-auto-reply.json"),
  ];

  let config = { ...DEFAULT_CONFIG };
  const allProcessedIds = new Set<string>();
  let history: AutoReplyHistoryItem[] = [];

  for (const filePath of searchFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.config) {
          config = { ...config, ...parsed.config };
        }
        if (Array.isArray(parsed.processedIds)) {
          for (const id of parsed.processedIds) {
            allProcessedIds.add(id);
          }
        }
        if (Array.isArray(parsed.history) && parsed.history.length > history.length) {
          history = parsed.history.slice(0, 100);
        }
      }
    } catch (err) {
      console.error(`[GmailAutoReply] Error reading storage file ${filePath}:`, err);
    }
  }

  // Environment variable ALWAYS takes absolute priority
  if (process.env.AUTO_REPLY_ALLOWED_EMAIL?.trim()) {
    config.allowedSenderEmail = process.env.AUTO_REPLY_ALLOWED_EMAIL.trim();
  }

  return {
    config,
    processedIds: Array.from(allProcessedIds),
    history,
  };
}

function saveStoredData(data: StoredData) {
  ensureStorageDir();
  try {
    const tempFile = `${STORAGE_FILE}.tmp`;
    const payload = JSON.stringify(
      {
        config: data.config,
        processedIds: data.processedIds.slice(-5000), // keep last 5000 IDs
        history: data.history.slice(0, 100), // keep last 100 log entries
      },
      null,
      2
    );
    fs.writeFileSync(tempFile, payload, "utf-8");
    fs.renameSync(tempFile, STORAGE_FILE);
  } catch (err) {
    console.error("[GmailAutoReply] Error saving storage file:", err);
  }
}

class GmailAutoReplyManager {
  private config: AutoReplyConfig;
  private processedIds: Set<string>;
  private history: AutoReplyHistoryItem[];
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  // Track exact moment worker/server started so historical emails before this moment are NEVER replied to
  private workerStartedAt: Date = new Date();

  constructor() {
    const stored = loadStoredData();
    this.config = stored.config;
    this.processedIds = new Set(stored.processedIds);
    this.history = stored.history;
    this.workerStartedAt = new Date();
  }

  public getConfig(): AutoReplyConfig {
    ensureEnvLoaded();
    const envAllowed = process.env.AUTO_REPLY_ALLOWED_EMAIL?.trim();
    return {
      ...this.config,
      allowedSenderEmail: envAllowed || this.config.allowedSenderEmail || "cannycms@gmail.com",
    };
  }

  public getStatus() {
    return {
      isRunning: this.config.enabled && !!this.timer,
      status: this.config.enabled ? ("Running" as const) : ("Disabled" as const),
      config: this.getConfig(),
      processedCount: this.processedIds.size,
      workerStartedAt: this.workerStartedAt.toISOString(),
      recentHistory: this.history.slice(0, 20),
    };
  }

  public updateConfig(updates: Partial<AutoReplyConfig>): AutoReplyConfig {
    const wasEnabled = this.config.enabled;
    const isNowEnabled = updates.enabled !== undefined ? updates.enabled : wasEnabled;

    this.config = {
      ...this.config,
      ...updates,
      keyword: updates.keyword !== undefined ? updates.keyword.trim() : this.config.keyword,
      replyMessage: updates.replyMessage !== undefined ? updates.replyMessage.trim() : this.config.replyMessage,
    };

    if (!wasEnabled && isNowEnabled) {
      this.config.enabled = true;
      this.config.enabledAt = new Date().toISOString();
      // On enabling / restarting the 30s recheck worker, set restart timestamp so it only replies to incoming emails
      this.workerStartedAt = new Date();
      this.save();
      this.startWorker();
      // Run an immediate check on enabling
      this.checkInboxSafe();
    } else if (wasEnabled && !isNowEnabled) {
      this.config.enabled = false;
      this.save();
      this.stopWorker();
    } else {
      this.save();
    }

    return this.getConfig();
  }

  public startWorker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.config.enabled) {
      return;
    }

    // Set restart timestamp so that all emails arriving before this restart are ignored
    this.workerStartedAt = new Date();
    const intervalMs = Math.max(10, this.config.pollIntervalSeconds || 30) * 1000;
    console.log(
      `[GmailAutoReply] Worker started at ${this.workerStartedAt.toISOString()}. Polling every ${intervalMs / 1000}s. Only new emails arriving after restart will be processed.`
    );

    this.timer = setInterval(() => {
      this.checkInboxSafe();
    }, intervalMs);
  }

  public stopWorker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[GmailAutoReply] Worker stopped.");
    }
  }

  private save() {
    saveStoredData({
      config: this.config,
      processedIds: Array.from(this.processedIds),
      history: this.history,
    });
  }

  public async triggerManualCheck(): Promise<{
    checkedCount: number;
    repliedCount: number;
    error: string | null;
  }> {
    return await this.checkInboxSafe();
  }

  private getSenderEmail(): string {
    return process.env.GMAIL_USER || "common.canny@gmail.com";
  }

  private getSenderName(): string {
    return "Canny CMS";
  }

  private isOAuthAvailable(): boolean {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
    return Boolean(clientId && clientSecret && refreshToken);
  }

  private getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      process.env.GOOGLE_REDIRECT_URI || "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    return oauth2Client;
  }

  private createTransporter() {
    ensureEnvLoaded();
    const senderEmail = this.getSenderEmail();

    if (this.isOAuthAvailable()) {
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const refreshToken = (process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN)!;

      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: senderEmail,
          clientId,
          clientSecret,
          refreshToken,
        },
      });
    }

    const rawPass = process.env.GMAIL_APP_PASSWORD;
    const pass = rawPass ? rawPass.replace(/\s+/g, "") : "";

    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: senderEmail,
        pass,
      },
    });
  }

  private async checkInboxSafe(): Promise<{
    checkedCount: number;
    repliedCount: number;
    error: string | null;
  }> {
    if (this.isProcessing) {
      return { checkedCount: 0, repliedCount: 0, error: null };
    }

    this.isProcessing = true;
    try {
      this.config.lastRunAt = new Date().toISOString();
      const result = await this.processIncomingEmails();
      this.config.lastSuccessAt = new Date().toISOString();
      this.config.lastError = null;
      this.save();
      return result;
    } catch (err: any) {
      console.error("[GmailAutoReply] Error during inbox polling:", err);
      this.config.lastError = err?.message || String(err);
      this.config.lastErrorAt = new Date().toISOString();
      this.save();
      return { checkedCount: 0, repliedCount: 0, error: err?.message || "Polling error" };
    } finally {
      this.isProcessing = false;
    }
  }

  private async processIncomingEmails(): Promise<{
    checkedCount: number;
    repliedCount: number;
    error: string | null;
  }> {
    ensureEnvLoaded();
    const userEmail = this.getSenderEmail();
    const rawPass = process.env.GMAIL_APP_PASSWORD;
    const pass = rawPass ? rawPass.replace(/\s+/g, "") : undefined;

    // Verify credentials exist
    if (!pass && !this.isOAuthAvailable()) {
      throw new Error("Neither GMAIL_APP_PASSWORD nor Google OAuth2 credentials are configured.");
    }

    const keyword = (this.config.keyword || "").trim().toLowerCase();
    if (!keyword) {
      return { checkedCount: 0, repliedCount: 0, error: null };
    }

    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: userEmail,
        pass: pass || "",
      },
      connectionTimeout: 15000,
      logger: false,
    });

    client.on("error", (err) => {
      console.warn("[GmailAutoReply IMAP Warning]", err?.message || err);
    });

    let checkedCount = 0;
    let repliedCount = 0;

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const totalMessages =
          client.mailbox && typeof client.mailbox === "object" && "exists" in client.mailbox
            ? (client.mailbox as any).exists || 0
            : 0;

        if (totalMessages === 0) {
          return { checkedCount: 0, repliedCount: 0, error: null };
        }

        // Fetch envelopes of the most recent 25 messages in INBOX
        const startSeq = Math.max(1, totalMessages - 24);
        const range = `${startSeq}:${totalMessages}`;

        const fetchedMessages: any[] = [];
        for await (const message of client.fetch(range, {
          envelope: true,
          flags: true,
          uid: true,
          internalDate: true,
        })) {
          fetchedMessages.push(message);
        }

        checkedCount = fetchedMessages.length;

        // Check recent emails (ignore emails older than 24 hours to avoid spamming old history)
        const maxAgeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

        for (const message of fetchedMessages) {
          const envelope = message.envelope;
          if (!envelope) continue;

          const uid = message.uid;
          const messageId = envelope.messageId || `<uid-${uid}@gmail.local>`;
          const subject = envelope.subject || "";
          const fromAddress = envelope.from?.[0]?.address || "";
          const fromName = envelope.from?.[0]?.name || fromAddress;
          const emailDate = message.internalDate || envelope.date;
          const arrivalDate = emailDate ? new Date(emailDate) : null;

          const uidKey = `uid:${uid}`;
          const msgIdKey = `msg:${messageId}`;

          // 1. Skip if from our own sender address to avoid loops
          if (fromAddress.toLowerCase() === userEmail.toLowerCase()) {
            continue;
          }

          // 2. Skip if already processed in memory or saved history
          if (this.processedIds.has(messageId) || this.processedIds.has(uidKey) || this.processedIds.has(msgIdKey)) {
            continue;
          }

          // 3. Skip if already answered in IMAP (\Answered flag)
          if (message.flags && (message.flags.has("\\Answered") || message.flags.has("$Answered"))) {
            this.processedIds.add(messageId);
            this.processedIds.add(uidKey);
            this.processedIds.add(msgIdKey);
            continue;
          }

          // 4. CRITICAL RESTART RULE: Only reply to emails that arrived AFTER worker/server restart!
          // Any email received before workerStartedAt is marked as processed history and skipped.
          if (arrivalDate && arrivalDate < this.workerStartedAt) {
            this.processedIds.add(messageId);
            this.processedIds.add(uidKey);
            this.processedIds.add(msgIdKey);
            continue;
          }

          // 5. Verification 1: Only reply if the mail is coming from specific allowed email (e.g. cannycms@gmail.com or cannychauhan3@gmail.com)
          ensureEnvLoaded();
          const rawAllowed = (process.env.AUTO_REPLY_ALLOWED_EMAIL?.trim() || this.config.allowedSenderEmail || "cannycms@gmail.com").toLowerCase();
          const allowedSenders = rawAllowed
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

          if (!allowedSenders.includes(fromAddress.toLowerCase())) {
            console.log(
              `[GmailAutoReply] Verification skipped: Email from "${fromAddress}" is not in allowed list [${allowedSenders.join(", ")}]. Skipping UID ${uid}.`
            );
            continue;
          }

          // 6. Fetch full message source to inspect body content and forwarded headers
          let isForwarded = false;
          let forwardedEmail: string | null = null;
          let parsedBodyText = "";
          let parsedBodyHtml = "";
          let parsedAttachments: any[] = [];

          try {
            for await (const fullMsg of client.fetch(String(uid), { source: true }, { uid: true })) {
              if (fullMsg.source) {
                const parsed = await simpleParser(fullMsg.source);
                parsedBodyText = parsed.text || "";
                parsedBodyHtml = (parsed.html || (parsed.textAsHtml ? parsed.textAsHtml : "")) as string;
                parsedAttachments = parsed.attachments || [];
                const fwdResult = extractForwardedInfo(parsedBodyText, parsedBodyHtml, subject);
                isForwarded = fwdResult.isForwarded;
                forwardedEmail = fwdResult.forwardedEmail;
              }
            }
          } catch (fetchErr) {
            console.warn(`[GmailAutoReply] Warning: failed to fetch source for UID ${uid}:`, fetchErr);
          }

          // 7. Check if BODY contains keyword (case-insensitive)
          const bodyHasKeyword =
            parsedBodyText.toLowerCase().includes(keyword) ||
            parsedBodyHtml.toLowerCase().includes(keyword);

          if (!bodyHasKeyword) {
            // Keyword not found in body -> Do NOT reply!
            continue;
          }

          // If the email is forwarded by cannycms@gmail.com, verify that whose email is forwarded exists in database users table
          if (isForwarded) {
            if (!forwardedEmail) {
              console.log(
                `[GmailAutoReply] Verification REJECTED: Email from "${fromAddress}" is marked as forwarded, but no original sender email could be extracted. Skipping UID ${uid}.`
              );
              this.processedIds.add(messageId);
              this.processedIds.add(uidKey);
              this.processedIds.add(msgIdKey);
              this.save();
              continue;
            }

            const { exists, user } = await checkUserExistsByEmail(forwardedEmail);
            if (!exists) {
              console.log(
                `[GmailAutoReply] Verification REJECTED: Forwarded email "${forwardedEmail}" does NOT exist in users database table. Skipping reply for UID ${uid}.`
              );
              this.processedIds.add(messageId);
              this.processedIds.add(uidKey);
              this.processedIds.add(msgIdKey);
              this.save();
              continue;
            }

            console.log(
              `[GmailAutoReply] Verification PASSED: Forwarded email "${forwardedEmail}" exists in database (User: ${user?.first_name || ""} ${user?.last_name || ""}, ID: ${user?.id}). Proceeding to auto-reply.`
            );
          } else {
            console.log(
              `[GmailAutoReply] Verification PASSED: Direct email from allowed sender "${fromAddress}". Proceeding to auto-reply.`
            );
          }

          // 8. Excel Attachment Validation & Inspection:
          // If the mail doesn't contain an excel file, reply with "no excel found in mail".
          // When it detects the excel, open and respond with total rows and the last row as a text, and return the same excel.
          const excelAttachments = parsedAttachments.filter(isExcelAttachment);
          const hasExcelAttachment = excelAttachments.length > 0;

          let replyText = "";
          let replyAttachments: Array<{
            filename: string;
            content: Buffer | Uint8Array;
            contentType?: string;
          }> = [];

          if (hasExcelAttachment) {
            if (excelAttachments.length === 1) {
              const info = parseExcelAttachmentInfo(
                excelAttachments[0].content,
                excelAttachments[0].filename || "attachment.xlsx"
              );
              replyText = `Total Rows: ${info.totalRows}\nLast Row: ${info.lastRowText}`;
            } else {
              replyText = excelAttachments
                .map((att) => {
                  const info = parseExcelAttachmentInfo(att.content, att.filename || "attachment.xlsx");
                  return `File: ${att.filename || "attachment.xlsx"}\nTotal Rows: ${info.totalRows}\nLast Row: ${info.lastRowText}`;
                })
                .join("\n\n");
            }

            // Return the same excel file(s) as attachment in the auto-reply
            replyAttachments = excelAttachments.map((att) => ({
              filename: att.filename || "attachment.xlsx",
              content: att.content,
              contentType: att.contentType,
            }));

            console.log(
              `[GmailAutoReply] Excel attachment confirmed for UID ${uid} (${excelAttachments.map((a) => a.filename || "unnamed").join(", ")}). Sending row summary and returning same excel file(s).`
            );
          } else {
            replyText = "no excel found in mail";
            console.log(
              `[GmailAutoReply] No Excel attachment found for UID ${uid} (Total attachments: ${parsedAttachments.length}). Sending notice: "${replyText}".`
            );
          }

          // 9. Send thread reply
          console.log(`[GmailAutoReply] Found verified matching email: "${subject}" from "${fromAddress}". Replying...`);

          try {
            await this.sendThreadReply({
              toAddress: fromAddress,
              toName: fromName,
              originalSubject: subject,
              originalMessageId: envelope.messageId,
              originalReferences: envelope.inReplyTo,
              replyMessage: replyText,
              attachments: replyAttachments,
            });

            // Mark as \Answered in IMAP
            try {
              await client.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true });
            } catch (flagErr) {
              // Ignore non-fatal flag errors
            }

            // Record processed ID so it is NEVER processed again
            this.processedIds.add(messageId);
            this.processedIds.add(uidKey);
            this.processedIds.add(msgIdKey);
            this.config.processedCount = (this.config.processedCount || 0) + 1;

            this.history.unshift({
              id: `${Date.now()}-${uid}`,
              uid,
              messageId,
              from: `${fromName} <${fromAddress}>`,
              subject,
              repliedAt: new Date().toISOString(),
              replyMessage: replyText,
              status: "success",
              verificationType: isForwarded ? "forwarded" : "direct",
              forwardedEmail: isForwarded ? forwardedEmail : null,
              hasExcelAttachment,
            });
            if (this.history.length > 100) this.history.pop();

            repliedCount++;
            this.save();
            console.log(`[GmailAutoReply] Successfully replied to "${fromAddress}" on thread with: "${replyText}".`);
          } catch (replyErr: any) {
            console.error(`[GmailAutoReply] Failed to reply to "${fromAddress}":`, replyErr);
            this.history.unshift({
              id: `${Date.now()}-${uid}`,
              uid,
              messageId,
              from: `${fromName} <${fromAddress}>`,
              subject,
              repliedAt: new Date().toISOString(),
              replyMessage: replyText,
              status: "error",
              error: replyErr?.message || String(replyErr),
              hasExcelAttachment,
            });
            // Mark processed to prevent infinite retry loops on corrupt addresses
            this.processedIds.add(messageId);
            this.processedIds.add(uidKey);
            this.processedIds.add(msgIdKey);
            this.save();
          }
        }
      } finally {
        lock.release();
        try {
          await client.logout();
        } catch {}
      }
    } catch (err: any) {
      throw err;
    }

    return { checkedCount, repliedCount, error: null };
  }

  private async sendThreadReply(params: {
    toAddress: string;
    toName: string;
    originalSubject: string;
    originalMessageId?: string;
    originalReferences?: string;
    replyMessage: string;
    attachments?: Array<{
      filename: string;
      content: Buffer | Uint8Array;
      contentType?: string;
    }>;
  }) {
    const { toAddress, originalSubject, originalMessageId, originalReferences, replyMessage, attachments } = params;
    const senderEmail = this.getSenderEmail();
    const senderName = this.getSenderName();

    // Construct Thread Reply Subject
    const replySubject = originalSubject.trim().toLowerCase().startsWith("re:")
      ? originalSubject.trim()
      : `Re: ${originalSubject.trim()}`;

    // References header construction
    const referencesHeader = originalMessageId
      ? originalReferences
        ? `${originalReferences} ${originalMessageId}`
        : originalMessageId
      : undefined;

    const transporter = this.createTransporter();

    // Send the reply email directly to the thread
    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: toAddress,
      subject: replySubject,
      inReplyTo: originalMessageId,
      references: referencesHeader,
      headers: {
        ...(originalMessageId ? { "In-Reply-To": originalMessageId } : {}),
        ...(referencesHeader ? { References: referencesHeader } : {}),
      },
      text: replyMessage,
      html: `<p>${replyMessage.replace(/\n/g, "<br />")}</p>`,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    });
  }
}

// Global Singleton to ensure exactly one instance in Node process
const GLOBAL_KEY = Symbol.for("canny.gmail.auto-reply.manager");

function getManager(): GmailAutoReplyManager {
  const globalObj = globalThis as any;
  if (!globalObj[GLOBAL_KEY]) {
    globalObj[GLOBAL_KEY] = new GmailAutoReplyManager();
  }
  return globalObj[GLOBAL_KEY];
}

export function getAutoReplyConfig(): AutoReplyConfig {
  return getManager().getConfig();
}

export function updateAutoReplyConfig(updates: Partial<AutoReplyConfig>): AutoReplyConfig {
  return getManager().updateConfig(updates);
}

export function startGmailAutoReplyWorker(): void {
  const manager = getManager();
  if (manager.getConfig().enabled) {
    manager.startWorker();
  }
}

export function stopGmailAutoReplyWorker(): void {
  getManager().stopWorker();
}

export function getGmailAutoReplyStatus() {
  return getManager().getStatus();
}

export function triggerManualAutoReplyCheck() {
  return getManager().triggerManualCheck();
}
