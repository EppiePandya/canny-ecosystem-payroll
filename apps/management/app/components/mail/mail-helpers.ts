import type { InboxEmail } from "@/utils/server/imap.server";

export function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}


export function isUpdatesEmail(email: InboxEmail): boolean {
  const senderAddress = (email.from.address || "").toLowerCase().trim();
  const senderName = (email.from.name || "").toLowerCase().trim();
  const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`.trim();
  const lowerText = fullText.toLowerCase();

  // Bank payment alerts, salary credits, ipaycheck, automated notifications
  if (
    /ipaycheck|i-paycheck|paycheck|payslip|salary|payroll|e-payment|epayment|bankcredit|bank credit|credit alert|debit alert|bank alert|neft|rtgs|imps|nach|ach|nodal|paymentadvice|payment advice|payment confirmation|transaction alert|bank statement|system update|notification|alerts|auto-generated/i.test(senderAddress) ||
    /ipaycheck|i-paycheck|paycheck|payslip|icici bank|hdfc bank|sbi bank|axis bank|kotak|bank e-payment|credit alert|debit alert|payment confirmation|payment advice|transaction alert/i.test(senderName)
  ) {
    return true;
  }

  if (
    /ipaycheck|i-paycheck|paycheck|payslip|salary slip|salary credited|salary payment|e-payment for m\/s|we have credited|credited your account|debited from your account|credit alert|debit alert|transaction alert|payment advice|payment confirmation|utr no|bank e-payment|icici bank|hdfc bank|sbi bank|axis bank|kotak bank|bank credit|neft transfer|rtgs transfer|imps transfer|account balance|statement of account/i.test(lowerText)
  ) {
    return true;
  }

  return false;
}


export function isPromotionalEmail(email: InboxEmail): boolean {
  const senderAddress = (email.from.address || "").toLowerCase().trim();
  const senderName = (email.from.name || "").toLowerCase().trim();
  const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`.trim();
  const lowerText = fullText.toLowerCase();

  // Marketing, sales, promotions, newsletters, offers, digests
  if (
    /no-?reply|donotreply|do-not-reply|newsletter|marketing|promotions?|promo|offers?|deals?|sales?|digest|info@|news@|bulletin|campaign|advertising|store@|shop@|mall@/i.test(senderAddress) ||
    /custcomm|icicilombard|icicidirect|quora|experian|workindia|vodafone|vi\.in|aclemalls/i.test(senderAddress) ||
    /promotions?|offers?|deals?|sales?|marketing|newsletter/i.test(senderName)
  ) {
    return true;
  }

  if (
    /\b(sales?|special offer|limited offer|limited time|exclusive offer|discount|discounts|off your next|cashback|coupon|promo code|promotions?|marketing|newsletter|weekly digest|bulletin|shop now|buy now|order now|clearance|webinar|invitation to join|survey|try for free|free trial|upgrade now|subscription|renew now|renewal)\b/i.test(lowerText) ||
    /click here to view in browser|unsubscribe|privacy policy|terms and conditions|protect yourself from fraud/i.test(lowerText)
  ) {
    return true;
  }

  return false;
}


export function getReimbursementCategory(email: InboxEmail): string | null {
  // Exclude updates (like ipaycheck/bank alerts) and promotional/sales emails from reimbursements
  if (isUpdatesEmail(email) || isPromotionalEmail(email)) {
    return null;
  }

  const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`.trim();
  if (!fullText) return null;
  const lowerText = fullText.toLowerCase();

  // Attendance Category: Check for attendance sheet / manpower deployment email
  const hasAttendanceAttachment = email.attachments?.some((a) =>
    /attendance|attendace|muster|manpower|deployment/i.test(a.filename || "")
  );

  if (
    /\b(attendance|attendace|manpower deployment|mustering|muster roll|daily attendance|attendance sheet|attendance format)\b/i.test(lowerText) ||
    hasAttendanceAttachment
  ) {
    return "Attendance";
  }

  // New Joinee Category: Check for new joinee / joining details / onboarding email
  const hasJoineeAttachment = email.attachments?.some((a) =>
    /joinee|joining|joiner|onboarding|new_employee|new_staff/i.test(a.filename || "")
  );

  if (
    /\b(new\s*joinee|new\s*joinees|new\s*joiner|new\s*joiners|new\s*joining|joinee|joinees|joining\s*detail|joining\s*details|new\s*employee|new\s*employees|onboarding|employee\s*onboarding)\b/i.test(lowerText) ||
    hasJoineeAttachment
  ) {
    return "New Joinee";
  }

  // Employee Left / Exit Category: Check for left, resign, resignation, etc.
  const hasLeftAttachment = email.attachments?.some((a) =>
    /left|resign|resignation|relieving|exit|termination|notice|lwd/i.test(a.filename || "")
  );

  if (
    /\b(left|resign|resignation|resigned|relieving|relieved|termination|terminated|exit|notice\s*period|last\s*working\s*day|lwd)\b/i.test(lowerText) ||
    hasLeftAttachment
  ) {
    return "Employee Left";
  }

  // Advance Category: Must match explicit advance keywords
  if (/\b(advance|advances|diesel advance|cash advance|travel advance)\b/i.test(lowerText)) {
    return "Reimbursement / Advance";
  }

  // Expenses Category: Must match explicit employee expense/claim/payment phrasing
  if (
    /\b(reimbursement|reimbursements|reimburse|expense claim|expenses claim|medical claim|travel claim|diesel claim|car repairing|repairing|fuel bill|taxi bill|hotel bill|kindly pay|please pay|kindly gpay|please credit|gpay|g-pay)\b/i.test(lowerText) ||
    (/\b(expense|expenses|bill|invoice|repair|repairing)\b/i.test(lowerText) && /\b(pay|rs|inr|₹|\$|amount|claim|credit)\b/i.test(lowerText))
  ) {
    return "Reimbursement / Expenses";
  }

  // Unknown Category: Only if explicit claim wording or direct user request with currency amount
  if (
    /\b(kindly|please|dear sir|dear ma'am|attached|bill|claim)\b/i.test(lowerText) &&
    /(?:rs\.?|₹|inr|\$|amount|total)[\s:=._-]*[\d,]{3,10}|\b[\d,]{3,10}(?:\.\d{1,2})?\s*(?:\/-|rs|inr|₹)/i.test(lowerText)
  ) {
    return "Reimbursement / Unknown";
  }

  return null;
}


export function getEmailCategory(email: InboxEmail): "primary" | "attendance" | "new_joinee" | "employee_left" | "advance" | "expenses" | "reimbursement" | "updates" | "promotions" {
  if (isUpdatesEmail(email)) return "updates";
  if (isPromotionalEmail(email)) return "promotions";

  const reimbCat = getReimbursementCategory(email);
  if (reimbCat === "Attendance") return "attendance";
  if (reimbCat === "New Joinee") return "new_joinee";
  if (reimbCat === "Employee Left") return "employee_left";
  if (reimbCat === "Reimbursement / Advance") return "advance";
  if (reimbCat === "Reimbursement / Expenses") return "expenses";
  if (reimbCat) return "reimbursement";

  return "primary";
}


export function isReimbursementEmail(email: InboxEmail): boolean {
  return getReimbursementCategory(email) !== null;
}


export function parseDateToISO(dateStr: string): string {
  try {
    const cleanStr = dateStr.replace(/(?:st|nd|rd|th)/gi, "").trim();
    const parts = cleanStr.split(/[\/\.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch (e) {
    // fallback
  }
  return "";
}


export function extractStructuredReimbursementDetails(email?: InboxEmail): {
  code?: string;
  name?: string;
  amount?: string;
  location?: string;
} {
  if (!email) return {};
  const html = email.html || "";
  const rawText = `${email.subject || ""}\n${email.snippet || ""}\n${email.text || ""}`;
  const htmlPlain = html ? html.replace(/<[^>]+>/g, "\n") : "";
  const fullText = `${rawText}\n${htmlPlain}`;

  let extractedCode = "";
  let extractedName = "";
  let extractedAmount = "";
  let extractedLocation = "";

  // PARSER 1: HTML <table> Parsing
  if (html && /<table/i.test(html)) {
    try {
      const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      const rows: string[][] = rowMatches.map((trHtml) => {
        const cellMatches = trHtml.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || [];
        return cellMatches.map((cellHtml) =>
          cellHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").trim()
        );
      });

      for (let i = 0; i < rows.length - 1; i++) {
        const headerRow = rows[i];
        const valueRow = rows[i + 1];

        if (headerRow.length >= 2 && valueRow.length === headerRow.length) {
          const codeIdx = headerRow.findIndex((h) => /code|id|no/i.test(h));
          const nameIdx = headerRow.findIndex((h) => /name|employee/i.test(h) && !/code|id|no/i.test(h));
          const amountIdx = headerRow.findIndex((h) => /amount|sum|claim|total/i.test(h));
          const locIdx = headerRow.findIndex((h) => /location|city|branch|site/i.test(h));

          if (codeIdx !== -1 && valueRow[codeIdx]) extractedCode = valueRow[codeIdx];
          if (nameIdx !== -1 && valueRow[nameIdx]) extractedName = valueRow[nameIdx];
          if (amountIdx !== -1 && valueRow[amountIdx]) extractedAmount = valueRow[amountIdx];
          if (locIdx !== -1 && valueRow[locIdx]) extractedLocation = valueRow[locIdx];

          if (extractedCode || extractedName) break;
        }
      }

      if (!extractedCode && !extractedName) {
        for (const row of rows) {
          if (row.length >= 2) {
            const key = row[0].toLowerCase();
            const val = row[1];
            if (/code|id|no/i.test(key) && !extractedCode) extractedCode = val;
            else if (/name|employee/i.test(key) && !/code|id|no/i.test(key) && !extractedName) extractedName = val;
            else if (/amount|claim|total/i.test(key) && !extractedAmount) extractedAmount = val;
            else if (/location|city|branch/i.test(key) && !extractedLocation) extractedLocation = val;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // PARSER 2: Text Header Block followed by Value Block
  if (!extractedCode || !extractedName) {
    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const isHeaderLine = (l: string) =>
      /^(?:location|employee\s*code|emp\s*code|code|employee\s*name|emp\s*name|name|advance\s*amount|amount|claim\s*amount)$/i.test(l);

    for (let i = 0; i < lines.length - 3; i++) {
      let headerCount = 0;
      let j = i;
      while (j < lines.length && isHeaderLine(lines[j])) {
        headerCount++;
        j++;
      }

      if (headerCount >= 2 && j + headerCount <= lines.length) {
        const headerBlock = lines.slice(i, j);
        const valueBlock = lines.slice(j, j + headerCount);

        headerBlock.forEach((hdr, idx) => {
          const val = valueBlock[idx] || "";
          if (/code|id|no/i.test(hdr) && !extractedCode) extractedCode = val;
          else if (/name/i.test(hdr) && !extractedName) extractedName = val;
          else if (/amount|claim/i.test(hdr) && !extractedAmount) extractedAmount = val;
          else if (/location/i.test(hdr) && !extractedLocation) extractedLocation = val;
        });

        if (extractedCode || extractedName) break;
      }
    }
  }

  // PARSER 3: Standard Inline Label Extraction
  if (!extractedCode) {
    const codeMatch = fullText.match(
      /(?:employee\s*code|emp\s*code|staff\s*code|code|emp\s*id)\s*[:=\#-]?\s*([a-z0-9\/\._-]+)/i
    );
    if (codeMatch && codeMatch[1]) extractedCode = codeMatch[1].trim();
  }

  if (!extractedName) {
    const nameMatch = fullText.match(
      /(?:employee\s*name|emp\s*name|name)\s*[:=\#-]?\s*([a-z\s\.]+)/i
    );
    if (nameMatch && nameMatch[1]) {
      const candidate = nameMatch[1].trim();
      if (candidate.length >= 2 && !/amount|code|location|total/i.test(candidate)) {
        extractedName = candidate;
      }
    }
  }

  if (!extractedAmount) {
    const amtMatch = fullText.match(
      /(?:advance\s*amount|claim\s*amount|amount)\s*[:=\#-]?\s*(?:rs\.?|₹|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (amtMatch && amtMatch[1]) extractedAmount = amtMatch[1].replace(/,/g, "");
  }

  return {
    code: extractedCode,
    name: extractedName,
    amount: extractedAmount,
    location: extractedLocation,
  };
}


export function findEmployeeMatchFromAllSources({
  email,
  senderEmail,
  senderName,
  employeesList,
}: {
  email?: InboxEmail;
  senderEmail: string;
  senderName: string;
  employeesList: any[];
}): any | null {
  if (!employeesList || employeesList.length === 0) return null;

  // 0. Check Structured Table / Key-Value Extraction First
  const structured = extractStructuredReimbursementDetails(email);
  if (structured.code) {
    const normExtracted = structured.code.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normExtracted && normExtracted.length >= 2) {
      const foundByStructuredCode = employeesList.find((emp) => {
        const rawEmpCode = (emp.employee_code || "").trim();
        if (!rawEmpCode) return false;
        const normEmpCode = rawEmpCode.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normEmpCode === normExtracted ||
          rawEmpCode.toLowerCase() === structured.code!.toLowerCase() ||
          (normExtracted.length >= 4 && (normEmpCode.endsWith(normExtracted) || normExtracted.endsWith(normEmpCode)))
        );
      });
      if (foundByStructuredCode) return foundByStructuredCode;
    }
  }

  const subject = email?.subject || "";
  const snippet = email?.snippet || "";
  const bodyText = email?.text || "";
  const htmlText = email?.html ? email.html.replace(/<[^>]+>/g, " ") : "";
  const attachments = (email?.attachments || []).map((a) => a.filename || "").join(" ");

  const rawFullText = `${subject} \n ${snippet} \n ${bodyText} \n ${htmlText} \n ${senderName} \n ${senderEmail} \n ${attachments}`;
  const normFullText = rawFullText.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

  const sEmail = (senderEmail || "").toLowerCase().trim();
  const sName = (senderName || "").toLowerCase().trim();

  const extractTokens = (str: string): string[] => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
  };

  const fullTextTokens = new Set(extractTokens(rawFullText));
  const senderNameTokens = extractTokens(sName);

  // --------------------------------------------------------------------------
  // PASS 1: MATCH BY EMPLOYEE CODE (HIGHEST PRIORITY)
  // Check if an explicit Employee Code label or code exists anywhere in subject/body/sender/attachments
  // --------------------------------------------------------------------------

  // 1A. Explicit Label Extraction
  const labelRegex = /(?:emp(?:loyee)?\s*(?:code|id|no|\#)?|code|staff\s*(?:code|id))\s*[:=\#-]?\s*([a-z0-9\/\._-]+)/gi;
  let match;
  while ((match = labelRegex.exec(rawFullText)) !== null) {
    const extractedCode = match[1]?.trim();
    if (extractedCode && extractedCode.length >= 2) {
      const normExtracted = extractedCode.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normExtracted && normExtracted.length >= 2) {
        const foundEmp = employeesList.find((emp) => {
          const rawEmpCode = (emp.employee_code || "").trim();
          if (!rawEmpCode) return false;
          const normEmpCode = rawEmpCode.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normEmpCode === normExtracted || rawEmpCode.toLowerCase() === extractedCode.toLowerCase();
        });
        if (foundEmp) {
          return foundEmp;
        }
      }
    }
  }

  // 1B. Scan all database employee codes in email subject/body/sender
  const compressedFullText = rawFullText.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const emp of employeesList) {
    const rawCode = (emp.employee_code || "").trim();
    if (!rawCode || rawCode.length < 2) continue;

    const normCode = rawCode.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normCode || normCode.length < 2) continue;

    const escCode = rawCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const isAlphaNum = /[a-zA-Z]/.test(rawCode);

    if (isAlphaNum) {
      const codeRegex = new RegExp(`\\b${escCode}\\b`, "i");
      if (codeRegex.test(rawFullText)) {
        return emp;
      }
      if (normCode.length >= 3 && compressedFullText.includes(normCode)) {
        return emp;
      }
    } else if (/^\d+$/.test(rawCode) && rawCode.length >= 2) {
      const numCodeRegex = new RegExp(`(?<=\\s|^|[\\(\\[:=-])${escCode}(?=\\s|$|[\\)\\].,;:-])`, "i");
      if (numCodeRegex.test(rawFullText)) {
        return emp;
      }
      // Check if numeric code appears after "code" or "emp"
      const LabeledNumRegex = new RegExp(`(?:emp|code|id|no)\\s*[:=\\#-]?\\s*${escCode}\\b`, "i");
      if (LabeledNumRegex.test(rawFullText)) {
        return emp;
      }
    }
  }

  // --------------------------------------------------------------------------
  // PASS 2: EXACT MATCH ON SENDER DISPLAY NAME (E.g. "Ajay Singh")
  // --------------------------------------------------------------------------
  if (senderNameTokens.length >= 1) {
    const exactNameMatch = employeesList.find((emp) => {
      const fn = (emp.first_name || "").trim();
      const mn = (emp.middle_name || "").trim();
      const ln = (emp.last_name || "").trim();

      const empTokens = extractTokens(`${fn} ${mn} ${ln}`);
      if (empTokens.length === 0) return false;

      const allInSender = empTokens.every((t) => senderNameTokens.includes(t));
      const senderInEmp = senderNameTokens.every((t) => empTokens.includes(t));
      return allInSender && senderInEmp;
    });

    if (exactNameMatch) return exactNameMatch;

    const candidateMatches = employeesList.filter((emp) => {
      const fn = (emp.first_name || "").trim();
      const ln = (emp.last_name || "").trim();

      const fnTokens = extractTokens(fn);
      const lnTokens = extractTokens(ln);

      if (fnTokens.length === 0) return false;

      if (lnTokens.length > 0) {
        const fnMatch = fnTokens.every((t) => senderNameTokens.includes(t));
        const lnMatch = lnTokens.every((t) => senderNameTokens.includes(t));
        return fnMatch && lnMatch;
      } else {
        const fnMatch = fnTokens.every((t) => senderNameTokens.includes(t));
        return fnMatch && senderNameTokens.length === fnTokens.length;
      }
    });

    if (candidateMatches.length === 1) {
      return candidateMatches[0];
    } else if (candidateMatches.length > 1) {
      // Multiple candidate employees match the name (e.g. multiple Ajay Singhs)
      // Do not auto-select an arbitrary one; return null so user picks from dropdown where all candidates are listed at top
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // PASS 3: MATCH FULL NAME IN EMAIL SUBJECT / BODY TEXT
  // --------------------------------------------------------------------------
  const fullTextNameMatches = employeesList.filter((emp) => {
    const fn = (emp.first_name || "").trim();
    const ln = (emp.last_name || "").trim();

    const fnTokens = extractTokens(fn);
    const lnTokens = extractTokens(ln);

    if (fnTokens.length === 0 || lnTokens.length === 0) return false;

    const fnMatch = fnTokens.every((t) => fullTextTokens.has(t));
    const lnMatch = lnTokens.every((t) => fullTextTokens.has(t));
    return fnMatch && lnMatch;
  });

  if (fullTextNameMatches.length === 1) {
    return fullTextNameMatches[0];
  } else if (fullTextNameMatches.length > 1) {
    // Multiple full-name matches exist; return null for user selection
    return null;
  }

  // --------------------------------------------------------------------------
  // PASS 4: MATCH BY EXACT SENDER EMAIL ADDRESS
  // --------------------------------------------------------------------------
  if (sEmail) {
    const exactEmailMatch = employeesList.find((emp) => {
      const pEmail = (emp.personal_email || "").toLowerCase().trim();
      const wEmail = (emp.email || "").toLowerCase().trim();
      return (pEmail && sEmail === pEmail) || (wEmail && sEmail === wEmail);
    });
    if (exactEmailMatch) return exactEmailMatch;
  }

  // --------------------------------------------------------------------------
  // PASS 5: FIRST NAME ONLY MATCH (ONLY IF EXACTLY 1 EMPLOYEE IN DB HAS THAT FIRST NAME)
  // --------------------------------------------------------------------------
  if (senderNameTokens.length >= 1) {
    const fnCandidates = employeesList.filter((emp) => {
      const fnTokens = extractTokens(emp.first_name || "");
      if (fnTokens.length === 0) return false;
      return fnTokens.every((t) => senderNameTokens.includes(t));
    });

    if (fnCandidates.length === 1) {
      return fnCandidates[0];
    }
  }

  return null;
}


export function findBestUserMatch(
  senderEmail: string,
  senderName: string,
  usersList: any[] = []
): any | null {
  if (!senderEmail && !senderName) return null;
  const sEmail = senderEmail.toLowerCase().trim();
  const sName = senderName.toLowerCase().trim();

  if (sEmail) {
    const exactEmail = usersList.find((u: any) => {
      const uEmail = (u.email || "").toLowerCase().trim();
      return uEmail && sEmail === uEmail;
    });
    if (exactEmail) return exactEmail;
  }

  if (sName) {
    const bothNamesMatch = usersList.find((u: any) => {
      const fn = (u.first_name || "").toLowerCase().trim();
      const ln = (u.last_name || "").toLowerCase().trim();
      if (!fn || !ln || fn.length < 2 || ln.length < 2) return false;
      const fullName = `${fn} ${ln}`;
      const escFn = fn.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const escLn = ln.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return (
        sName === fullName ||
        (new RegExp(`\\b${escFn}\\b`, "i").test(sName) &&
          new RegExp(`\\b${escLn}\\b`, "i").test(sName))
      );
    });
    if (bothNamesMatch) return bothNamesMatch;
  }

  return null;
}


export function findBestEmployeeMatch(
  senderEmail: string,
  senderName: string,
  employeesList: any[] = []
): any | null {
  return findEmployeeMatchFromAllSources({
    senderEmail,
    senderName,
    employeesList,
  });
}


export function getCompanyForEmail(
  email: InboxEmail,
  allUsersList: any[] = [],
  allEmployeesList: any[] = [],
  companiesList: any[] = []
): { companyId: string; companyName: string } {
  const senderEmail = (email.from?.address || "").toLowerCase();
  const senderName = (email.from?.name || "").toLowerCase();

  const userMatch = findBestUserMatch(senderEmail, senderName, allUsersList);
  if (userMatch && userMatch.company_id) {
    const comp = companiesList.find((c: any) => c.id === userMatch.company_id);
    if (comp) return { companyId: comp.id, companyName: comp.name };
  }

  const empMatch = findEmployeeMatchFromAllSources({
    email,
    senderEmail,
    senderName,
    employeesList: allEmployeesList,
  });
  if (empMatch && empMatch.company_id) {
    const comp = companiesList.find((c: any) => c.id === empMatch.company_id);
    if (comp) return { companyId: comp.id, companyName: comp.name };
  }

  return { companyId: "", companyName: "" };
}


export function getExcelColName(n: number): string {
  let name = "";
  let num = n;
  while (num >= 0) {
    name = String.fromCharCode((num % 26) + 65) + name;
    num = Math.floor(num / 26) - 1;
  }
  return name;
}
