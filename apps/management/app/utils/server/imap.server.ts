import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface InboxEmail {
  id: string;
  uid: number;
  subject: string;
  from: {
    name: string;
    address: string;
  };
  to: string;
  date: string;
  seen: boolean;
  snippet: string;
  html?: string;
  text?: string;
  hasAttachments: boolean;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentUrl?: string;
  }>;
}

function checkHasAttachments(struct: any): boolean {
  if (!struct) return false;
  if (struct.disposition && String(struct.disposition).toLowerCase() === "attachment") return true;
  if (struct.filename) return true;
  if (Array.isArray(struct.childNodes)) {
    return struct.childNodes.some((child: any) => checkHasAttachments(child));
  }
  return false;
}

function extractAttachmentsFromStructure(struct: any): Array<{
  filename: string;
  contentType: string;
  size: number;
  contentUrl?: string;
}> {
  const attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentUrl?: string;
  }> = [];

  function walk(node: any) {
    if (!node) return;
    const isAttachment =
      (node.disposition && String(node.disposition).toLowerCase() === "attachment") ||
      (node.dispositionParameters && node.dispositionParameters.filename) ||
      (node.parameters && node.parameters.name) ||
      node.filename ||
      (node.id && String(node.type).startsWith("image/"));

    if (isAttachment) {
      const filename =
        node.filename ||
        node.dispositionParameters?.filename ||
        node.parameters?.name ||
        (node.id ? node.id.replace(/[<>]/g, "") : "attachment");
      const contentType = node.type
        ? `${node.type}`.toLowerCase()
        : "application/octet-stream";
      const size = node.size || 0;

      attachments.push({ filename, contentType, size });
    }

    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        walk(child);
      }
    }
  }

  walk(struct);
  return attachments;
}

let memoryCache: {
  timestamp: number;
  limit: number;
  emails: InboxEmail[];
} | null = null;

const CACHE_TTL_MS = 60 * 1000; // 60 seconds memory cache

export async function fetchInboxEmails(
  limit = 10,
  forceRefresh = false,
  searchQuery = ""
): Promise<{ emails: InboxEmail[]; error: string | null }> {
  const cleanSearch = searchQuery.trim();

  // Return cached result if fresh and has sufficient emails (only when no search query)
  if (!cleanSearch && !forceRefresh && memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL_MS) {
    if (memoryCache.limit >= limit || memoryCache.emails.length >= limit) {
      return { emails: memoryCache.emails, error: null };
    }
  }

  const userEmail = process.env.GMAIL_USER || "cannycms@gmail.com";
  const rawPass = process.env.GMAIL_APP_PASSWORD;
  const pass = rawPass ? rawPass.replace(/\s+/g, "") : undefined;

  if (!pass) {
    return { emails: [], error: "GMAIL_APP_PASSWORD is not configured in environment variables." };
  }

  // Create a timeout promise to guarantee the loader resolves cleanly (35 seconds timeout)
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<{ emails: InboxEmail[]; error: string | null }>((resolve) => {
    timeoutId = setTimeout(() => {
      if (memoryCache && memoryCache.emails.length > 0 && !cleanSearch) {
        resolve({ emails: memoryCache.emails, error: null });
      } else {
        resolve({ emails: [], error: "IMAP connection timed out. Click Sync to retry." });
      }
    }, 35000);
  });

  const fetchPromise = (async () => {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: userEmail,
        pass,
      },
      connectionTimeout: 15000,
      logger: false,
    });

    // Handle background socket errors so ECONNRESET / network drops NEVER crash the Node process
    client.on("error", (err) => {
      console.error("[IMAP Socket Warning]", err?.message || err);
    });

    try {
      await client.connect();

      const emails: InboxEmail[] = [];
      const lock = await client.getMailboxLock("INBOX");

      try {
        const totalMessages = (client.mailbox && typeof client.mailbox === "object" && "exists" in client.mailbox)
          ? (client.mailbox as any).exists || 0
          : 0;

        if (totalMessages === 0) {
          if (!cleanSearch) memoryCache = { timestamp: Date.now(), limit, emails: [] };
          return { emails: [], error: null };
        }

        let range: string;
        let isUidRange = false;

        if (cleanSearch) {
          let searchedUids: number[] = [];
          try {
            const searchRes = await client.search({ text: cleanSearch }, { uid: true });
            if (Array.isArray(searchRes) && searchRes.length > 0) {
              searchedUids = searchRes;
            } else {
              const altRes = await client.search(
                {
                  or: [
                    { subject: cleanSearch },
                    { from: cleanSearch },
                    { body: cleanSearch },
                  ],
                },
                { uid: true }
              );
              if (Array.isArray(altRes)) {
                searchedUids = altRes;
              }
            }
          } catch (err) {
            console.error("IMAP search error:", err);
          }

          if (searchedUids.length > 0) {
            const fetchCount = Math.min(searchedUids.length, Math.max(Math.round(limit * 2.5), 50));
            const targetUids = searchedUids.slice(-fetchCount);
            range = targetUids.join(",");
            isUidRange = true;
          } else {
            const fetchCount = Math.min(totalMessages, Math.max(Math.round(limit * 2.5), 50));
            const start = Math.max(1, totalMessages - fetchCount + 1);
            range = `${start}:${totalMessages}`;
          }
        } else {
          const fetchCount = Math.min(totalMessages, Math.max(Math.round(limit * 2.5), 50));
          const start = Math.max(1, totalMessages - fetchCount + 1);
          range = `${start}:${totalMessages}`;
        }

        // Phase 1: Fetch envelopes & bodyStructure
        const rawMessages: any[] = [];
        for await (const message of client.fetch(
          range,
          {
            envelope: true,
            flags: true,
            bodyStructure: true,
            uid: true,
          },
          isUidRange ? { uid: true } : undefined
        )) {
          rawMessages.push(message);
        }

        // Phase 2: Fetch source for top 10 most recent messages for snippet, html, text & attachments
        const recentUids = rawMessages.slice(-10).map((m) => m.uid);

        const sourceMap: Record<number, any> = {};
        if (recentUids.length > 0) {
          try {
            const uidRange = recentUids.join(",");
            const sourceFetchPromise = (async () => {
              for await (const msg of client.fetch(
                uidRange,
                { source: true, uid: true },
                { uid: true }
              )) {
                if (msg.source) {
                  try {
                    const parsed = await simpleParser(msg.source);
                    sourceMap[msg.uid] = parsed;
                  } catch (e) { }
                }
              }
            })();

            // Cap source preview fetch to max 8 seconds so it never stalls the response
            await Promise.race([
              sourceFetchPromise,
              new Promise((res) => setTimeout(res, 8000)),
            ]);
          } catch (e) {
            console.error("Failed fetching source batch:", e);
          }
        }

        for (const message of rawMessages) {
          const parsed = sourceMap[message.uid];
          let snippet = "";
          let html = "";
          let text = "";
          let attachmentsList: any[] = [];

          if (parsed) {
            html = parsed.html || (parsed.textAsHtml ? parsed.textAsHtml : "");
            text = parsed.text || "";
            snippet = (parsed.text || "").slice(0, 150).replace(/\s+/g, " ").trim();
            if (parsed.attachments && parsed.attachments.length > 0) {
              attachmentsList = parsed.attachments.map((att: any) => {
                const mimeType = att.contentType || "application/octet-stream";
                // Exclude giant base64 payloads (>3MB) from initial list payload to prevent network bloat
                const isReasonableSize = !att.size || att.size < 3 * 1024 * 1024;
                const base64 = isReasonableSize && att.content ? att.content.toString("base64") : "";
                const contentUrl = base64 ? `data:${mimeType};base64,${base64}` : undefined;

                return {
                  filename: att.filename || "attachment",
                  contentType: mimeType,
                  size: att.size || 0,
                  contentUrl,
                };
              });
            }
          } else {
            snippet = message.envelope?.subject || "(No Preview)";
          }

          // Fallback attachment extraction from bodyStructure if simpleParser didn't return attachments
          if (attachmentsList.length === 0 && checkHasAttachments(message.bodyStructure)) {
            attachmentsList = extractAttachmentsFromStructure(message.bodyStructure);
          }

          const hasAtt = attachmentsList.length > 0 || checkHasAttachments(message.bodyStructure);
          const fromObject = message.envelope?.from?.[0];

          emails.push({
            id: String(message.uid),
            uid: message.uid,
            subject: message.envelope?.subject || "(No Subject)",
            from: {
              name: fromObject?.name || fromObject?.address?.split("@")[0] || "Unknown",
              address: fromObject?.address || "",
            },
            to: message.envelope?.to?.[0]?.address || "",
            date: message.envelope?.date ? message.envelope.date.toISOString() : new Date().toISOString(),
            seen: message.flags ? message.flags.has("\\Seen") : true,
            snippet,
            html,
            text,
            hasAttachments: hasAtt,
            attachments: attachmentsList,
          });
        }

        let reversed = emails.reverse();
        if (cleanSearch) {
          const q = cleanSearch.toLowerCase();
          reversed = reversed.filter((mail) =>
            mail.subject.toLowerCase().includes(q) ||
            mail.from.name.toLowerCase().includes(q) ||
            mail.from.address.toLowerCase().includes(q) ||
            mail.snippet.toLowerCase().includes(q) ||
            (mail.text && mail.text.toLowerCase().includes(q))
          );
        } else {
          memoryCache = { timestamp: Date.now(), limit, emails: reversed };
        }
        return { emails: reversed, error: null };
      } finally {
        lock.release();
        try {
          await client.logout();
        } catch (e) {
          // ignore logout error
        }
      }
    } catch (err: any) {
      console.error("IMAP Inbox fetch error:", err);
      if (memoryCache && memoryCache.emails.length > 0) {
        return { emails: memoryCache.emails.slice(0, limit), error: null };
      }
      return { emails: [], error: err?.message || "Failed to connect to IMAP server." };
    }
  })();

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId!);
    if (memoryCache && memoryCache.emails.length > 0) {
      return { emails: memoryCache.emails, error: null };
    }
    return { emails: [], error: err?.message || "IMAP fetch error." };
  }
}

export async function fetchSingleEmailDetails(uid: number): Promise<InboxEmail | null> {
  const userEmail = process.env.GMAIL_USER || "cannycms@gmail.com";
  const rawPass = process.env.GMAIL_APP_PASSWORD;
  const pass = rawPass ? rawPass.replace(/\s+/g, "") : undefined;

  if (!pass || !uid) return null;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: userEmail, pass },
    connectionTimeout: 10000,
    logger: false,
  });

  client.on("error", (err) => {
    console.error("[IMAP Socket Warning]", err?.message || err);
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      for await (const msg of client.fetch(
        String(uid),
        { envelope: true, flags: true, bodyStructure: true, source: true, uid: true },
        { uid: true }
      )) {
        let snippet = "";
        let html = "";
        let text = "";
        let attachmentsList: any[] = [];

        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);
            html = parsed.html || (parsed.textAsHtml ? parsed.textAsHtml : "");
            text = parsed.text || "";
            snippet = (parsed.text || "").slice(0, 150).replace(/\s+/g, " ").trim();
            if (parsed.attachments && parsed.attachments.length > 0) {
              attachmentsList = parsed.attachments.map((att: any) => {
                const mimeType = att.contentType || "application/octet-stream";
                const base64 = att.content ? att.content.toString("base64") : "";
                const contentUrl = base64 ? `data:${mimeType};base64,${base64}` : undefined;

                return {
                  filename: att.filename || "attachment",
                  contentType: mimeType,
                  size: att.size || 0,
                  contentUrl,
                };
              });
            }
          } catch (e) { }
        }

        if (attachmentsList.length === 0 && checkHasAttachments(msg.bodyStructure)) {
          attachmentsList = extractAttachmentsFromStructure(msg.bodyStructure);
        }

        const fromObject = msg.envelope?.from?.[0];

        const resultEmail: InboxEmail = {
          id: String(msg.uid),
          uid: msg.uid,
          subject: msg.envelope?.subject || "(No Subject)",
          from: {
            name: fromObject?.name || fromObject?.address?.split("@")[0] || "Unknown",
            address: fromObject?.address || "",
          },
          to: msg.envelope?.to?.[0]?.address || "",
          date: msg.envelope?.date ? msg.envelope.date.toISOString() : new Date().toISOString(),
          seen: msg.flags ? msg.flags.has("\\Seen") : true,
          snippet,
          html,
          text,
          hasAttachments: attachmentsList.length > 0 || checkHasAttachments(msg.bodyStructure),
          attachments: attachmentsList,
        };

        if (memoryCache && memoryCache.emails) {
          const idx = memoryCache.emails.findIndex((e) => e.uid === uid);
          if (idx >= 0) {
            memoryCache.emails[idx] = resultEmail;
          }
        }

        return resultEmail;
      }
    } finally {
      lock.release();
      try {
        await client.logout();
      } catch (e) { }
    }
  } catch (err) {
    console.error("fetchSingleEmailDetails error:", err);
  }
  return null;
}
