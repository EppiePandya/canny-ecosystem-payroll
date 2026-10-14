import type { InboxEmail } from "@/utils/server/imap.server";
import {
  parseDateToISO,
  getReimbursementCategory,
  findEmployeeMatchFromAllSources,
  extractStructuredReimbursementDetails,
  findBestUserMatch,
} from "./mail-helpers";

export function extractJoineeDetails(email?: InboxEmail): {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  doj?: string;
  dob?: string;
  gender?: string;
} {
  if (!email) return {};

  const subject = email.subject || "";
  const snippet = email.snippet || "";
  const bodyText = email.text || "";
  const html = email.html || "";
  const htmlPlain = html ? html.replace(/<[^>]+>/g, "\n") : "";
  const fullText = `${subject}\n${snippet}\n${bodyText}\n${htmlPlain}`;

  let rawName = "";
  let extractedEmail = "";
  let extractedPhone = "";
  let extractedDOJ = "";
  let extractedDOB = "";
  let extractedGender = "";

  // 1. EXTRACT NAME
  const subjNameMatch = subject.match(
    /(?:new\s*joinee|joining\s*details?\s*(?:of)?|onboarding|new\s*employee)\s*[:=\#-]?\s*([a-zA-Z\s\.]{2,40})/i
  );
  if (subjNameMatch && subjNameMatch[1]) {
    const cand = subjNameMatch[1].trim();
    if (cand.length >= 2 && !/details|sheet|info|list|report|data/i.test(cand)) {
      rawName = cand;
    }
  }

  if (!rawName) {
    const nameLabelMatch = fullText.match(
      /(?:candidate\s*name|employee\s*name|joinee\s*name|full\s*name|name)\s*[:=\#-]?\s*([a-zA-Z\s\.]{2,40})/i
    );
    if (nameLabelMatch && nameLabelMatch[1]) {
      const cand = nameLabelMatch[1].trim();
      if (cand.length >= 2 && !/details|sheet|info|code|id|date|joining/i.test(cand)) {
        rawName = cand;
      }
    }
  }

  // Check Aadhaar PDF line pattern (the line above DOB/Date of Birth in Aadhaar Cards/Forms)
  if (!rawName) {
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (/(?:dob|date\s*of\s*birth|year\s*of\s*birth)/i.test(lines[i]) && i > 0) {
        const prevLine = lines[i - 1].replace(/^to\s+/i, "").trim();
        if (/^[a-zA-Z\s\.]{2,40}$/.test(prevLine) && !/government|india|aadhaar|unique|identification|enrollment|download/i.test(prevLine)) {
          rawName = prevLine;
          break;
        }
      }
    }
  }

  // 2. EXTRACT EMAIL
  const emailLabelMatch = fullText.match(
    /(?:personal\s*email|email\s*id|work\s*email|email)\s*[:=\#-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  );
  if (emailLabelMatch && emailLabelMatch[1]) {
    extractedEmail = emailLabelMatch[1].trim();
  } else {
    const senderEmail = (email.from?.address || "").toLowerCase();
    const allEmails = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi) || [];
    const filteredEmail = allEmails.find((e) => e.toLowerCase() !== senderEmail && !/support|info|canny|admin/i.test(e));
    if (filteredEmail) {
      extractedEmail = filteredEmail;
    }
  }

  // 3. EXTRACT PHONE
  const phoneMatch = fullText.match(
    /(?:mobile\s*no\.?|contact\s*no\.?|phone\s*no\.?|mobile|contact|phone)\s*[:=\#-]?\s*(?:\+91[\-\s]?)?([6-9]\d{9})/i
  );
  if (phoneMatch && phoneMatch[1]) {
    extractedPhone = phoneMatch[1].trim();
  } else {
    const standalonePhone = fullText.match(/(?:\+91[\-\s]?)?([6-9]\d{9})\b/);
    if (standalonePhone && standalonePhone[1]) {
      extractedPhone = standalonePhone[1].trim();
    }
  }

  // 4. EXTRACT DOJ (Date of Joining)
  const dojMatch = fullText.match(
    /(?:date\s*of\s*joining|joining\s*date|doj)\s*[:=\#-]?\s*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]{3,9}\s+[0-9]{4})/i
  );
  if (dojMatch && dojMatch[1]) {
    extractedDOJ = parseDateToISO(dojMatch[1].trim());
  }

  // 5. EXTRACT DOB (Date of Birth)
  const dobMatch = fullText.match(
    /(?:date\s*of\s*birth|birth\s*date|dob)\s*[:=\#-]?\s*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]{3,9}\s+[0-9]{4})/i
  );
  if (dobMatch && dobMatch[1]) {
    extractedDOB = parseDateToISO(dobMatch[1].trim());
  }

  // 6. EXTRACT GENDER
  const genderMatch = fullText.match(/(?:gender|sex)\s*[:=\#-]?\s*(male|female|other)/i);
  if (genderMatch && genderMatch[1]) {
    extractedGender = genderMatch[1].toLowerCase();
  }

  let first_name = "";
  let middle_name = "";
  let last_name = "";

  if (rawName && /resignation|designation|registr|register|emp|code|details|joining|joinee|onboarding|sheet|report/i.test(rawName)) {
    rawName = "";
  }

  if (rawName) {
    const tokens = rawName.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      first_name = tokens[0];
    } else if (tokens.length === 2) {
      first_name = tokens[0];
      last_name = tokens[1];
    } else if (tokens.length >= 3) {
      first_name = tokens[0];
      middle_name = tokens.slice(1, -1).join(" ");
      last_name = tokens[tokens.length - 1];
    }
  }

  return {
    first_name,
    middle_name,
    last_name,
    email: extractedEmail,
    phone: extractedPhone,
    doj: extractedDOJ,
    dob: extractedDOB,
    gender: extractedGender,
  };
}


export function extractReimbursementDetails(
  email: InboxEmail,
  employeesList: any[] = [],
  usersList: any[] = [],
  allEmployeesList: any[] = [],
  companiesList: any[] = []
) {
  const structuredData = extractStructuredReimbursementDetails(email);
  const htmlText = email.html ? email.html.replace(/<[^>]+>/g, " ") : "";
  const text = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""} ${htmlText}`;
  const lowerText = text.toLowerCase();

  let type = "expenses";
  if (/advance|advances|diesel advance|cash advance/i.test(lowerText)) {
    type = "advances";
  } else if (/travel|flight|cab|uber|ola|taxi|train|hotel|trip/i.test(lowerText)) {
    type = "travel";
  } else if (/medical|doctor|medicine|health|hospital|pharmacy/i.test(lowerText)) {
    type = "medical";
  } else if (/loan/i.test(lowerText)) {
    type = "loan";
  }

  let amount = structuredData.amount || "";
  if (!amount) {
    const currencyMatch = text.match(/(?:rs\.?|₹|inr|\$)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (currencyMatch && currencyMatch[1]) {
      amount = currencyMatch[1].replace(/,/g, "");
    }
  }

  if (!amount) {
    const amountMatch = text.match(
      /(?:amount|total|claim|credit|advance|reimbursement|pay|kindly pay|please pay)[\s:=._-]*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (amountMatch && amountMatch[1]) {
      const candidate = amountMatch[1].replace(/,/g, "");
      if (!/^(19|20)\d\d$/.test(candidate) || /₹|rs|inr|\$/i.test(text)) {
        amount = candidate;
      }
    }
  }

  if (!amount) {
    const slashMatch = text.match(/\b([\d,]{3,10})(?:\.\d{1,2})?\s*(?:\/-|rs|inr|₹)/i);
    if (slashMatch && slashMatch[1]) {
      amount = slashMatch[1].replace(/,/g, "");
    }
  }

  if (!amount) {
    const standaloneSlash = text.match(/\b([\d,]{3,10})\s*\/-/);
    if (standaloneSlash && standaloneSlash[1]) {
      amount = standaloneSlash[1].replace(/,/g, "");
    }
  }

  const senderEmail = (email.from?.address || "").toLowerCase();
  const senderName = (email.from?.name || "").toLowerCase();

  let matchedCompanyId = "";
  let matchedCompanyName = "";
  let matchedEmployeeId = "";
  let matchedUserId = "";

  const searchEmployees = allEmployeesList.length > 0 ? allEmployeesList : employeesList;

  // PRIORITY 1: Find best employee match using code, full name, email, or unique first name
  const matchedEmp = findEmployeeMatchFromAllSources({
    email,
    senderEmail,
    senderName,
    employeesList: searchEmployees,
  });

  if (matchedEmp) {
    matchedEmployeeId = matchedEmp.id;
    matchedCompanyId = matchedEmp.company_id || "";
    matchedUserId = matchedEmp.user_id || "";
  }

  // PRIORITY 2: Fallback User search if company/user wasn't resolved
  if (!matchedCompanyId || !matchedUserId) {
    const matchedUser = findBestUserMatch(senderEmail, senderName, usersList);
    if (matchedUser) {
      if (!matchedUserId) matchedUserId = matchedUser.id;
      if (!matchedCompanyId) matchedCompanyId = matchedUser.company_id || "";
      if (!matchedEmployeeId) {
        const linkedEmp = searchEmployees.find(
          (e: any) =>
            e.user_id === matchedUser.id ||
            (e.email && e.email.toLowerCase() === matchedUser.email?.toLowerCase()) ||
            (e.personal_email && e.personal_email.toLowerCase() === matchedUser.email?.toLowerCase())
        );
        if (linkedEmp) matchedEmployeeId = linkedEmp.id;
      }
    }
  }

  if (matchedCompanyId && companiesList.length > 0) {
    const comp = companiesList.find((c: any) => c.id === matchedCompanyId);
    if (comp) {
      matchedCompanyName = comp.name;
    }
  }

  const note = `${email.subject} (From: ${email.from?.name || email.from?.address || ""})`;

  let dateStr = new Date().toISOString().split("T")[0];
  if (email.date) {
    try {
      dateStr = new Date(email.date).toISOString().split("T")[0];
    } catch (e) {
      // ignore
    }
  }

  return {
    amount,
    type,
    note,
    date: dateStr,
    name: structuredData.name || senderName || "",
    employeeId: matchedEmployeeId,
    userId: matchedUserId,
    companyId: matchedCompanyId,
    companyName: matchedCompanyName,
    location: structuredData.location || "",
  };
}


export function extractBulkReimbursementItems(
  emailInput: string | InboxEmail,
  employeesList: any[] = [],
  companyId: string = "",
  defaultType: string = "expenses"
): Array<{
  id: string;
  employeeId: string;
  name: string;
  amount: string;
  type: string;
  note: string;
}> {
  let emailText = "";
  let emailHtml = "";
  if (typeof emailInput === "string") {
    emailText = emailInput;
  } else if (emailInput && typeof emailInput === "object") {
    emailText = `${emailInput.subject || ""}\n${emailInput.text || ""}\n${emailInput.snippet || ""}`;
    emailHtml = emailInput.html || "";
  }

  const items: Array<{
    id: string;
    employeeId: string;
    name: string;
    amount: string;
    type: string;
    note: string;
  }> = [];

  const companyEmployees = companyId
    ? employeesList.filter((emp: any) => emp.company_id === companyId)
    : employeesList;

  const searchEmps = employeesList.length > 0 ? employeesList : companyEmployees;
  const seenKeys = new Set<string>();

  const findEmpMatch = (text: string) => {
    if (!text || text.length < 2) return null;
    const cleanText = text.trim();
    if (/location|branch|site|bathinda|punjab|delhi|mumbai|satna|m\.p|\(punjab\)|\(mp\)|\(pb\)/i.test(cleanText)) {
      return null;
    }
    const lowerText = cleanText.toLowerCase();
    const normText = cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Match by Employee Code (Normalized & Exact)
    const codeMatch = searchEmps.find((emp: any) => {
      const rawCode = (emp.employee_code || "").trim();
      if (!rawCode || rawCode.length < 2) return false;
      const lowerCode = rawCode.toLowerCase();
      const normCode = lowerCode.replace(/[^a-z0-9]/g, "");

      if (!normCode) return false;

      if (lowerText === lowerCode || normText === normCode) return true;

      if (normText.length >= 3 && normCode.length >= 3) {
        if (normText.endsWith(normCode) || normCode.endsWith(normText)) return true;
      }

      const escCode = rawCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      if (/[a-zA-Z]/.test(rawCode)) {
        return new RegExp(`\\b${escCode}\\b`, "i").test(cleanText);
      }

      if (/^\d+$/.test(rawCode) && rawCode.length >= 2) {
        return new RegExp(`(?<=\\s|^|[\\(\\[:=-])${escCode}(?=\\s|$|[\\)\\].,;:-])`, "i").test(cleanText);
      }
      return false;
    });
    if (codeMatch) return codeMatch;

    // 2. Exact Full Name Match (first_name + middle_name + last_name)
    const exactFullNameMatch = searchEmps.find((emp: any) => {
      const fn = (emp.first_name || "").toLowerCase().trim();
      const mn = (emp.middle_name || "").toLowerCase().trim();
      const ln = (emp.last_name || "").toLowerCase().trim();

      const fullName = [fn, mn, ln].filter(Boolean).join(" ").trim();
      const firstLast = `${fn} ${ln}`.trim();

      if (!fullName || fullName.length < 2) return false;

      const normFullName = fullName.replace(/[^a-z0-9]/g, "");
      const normFirstLast = firstLast.replace(/[^a-z0-9]/g, "");

      if (lowerText === fullName || lowerText === firstLast || normText === normFullName || normText === normFirstLast) {
        return true;
      }

      const textTokens = lowerText.split(/\s+/).filter(Boolean);
      const nameTokens = fullName.split(/\s+/).filter(Boolean);
      if (nameTokens.length >= 2 && nameTokens.every((t) => textTokens.includes(t))) {
        return true;
      }

      return false;
    });
    if (exactFullNameMatch) return exactFullNameMatch;

    // 3. First Name + Last Name Both Present in text
    const bothNamesMatch = searchEmps.find((emp: any) => {
      const fn = (emp.first_name || "").toLowerCase().trim();
      const ln = (emp.last_name || "").toLowerCase().trim();
      if (!fn || !ln || fn.length < 2 || ln.length < 2) return false;
      const escFn = fn.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const escLn = ln.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return (
        new RegExp(`\\b${escFn}\\b`, "i").test(lowerText) &&
        new RegExp(`\\b${escLn}\\b`, "i").test(lowerText)
      );
    });
    if (bothNamesMatch) return bothNamesMatch;

    // 4. First Name Match Only (If 1 unique candidate, auto-select. If multiple candidates exist, return null so user chooses from dropdown where all candidates are listed at top)
    const fnCandidates = searchEmps.filter((emp: any) => {
      const fn = (emp.first_name || "").toLowerCase().trim();
      if (!fn || fn.length < 3) return false;
      const escFn = fn.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return new RegExp(`\\b${escFn}\\b`, "i").test(lowerText);
    });
    if (fnCandidates.length === 1) {
      return fnCandidates[0];
    }

    return null;
  };

  const parseAmountStr = (text: string): string => {
    if (!text) return "";
    const m = text.match(/(?:rs\.?|₹|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m && m[1]) {
      const val = m[1].replace(/,/g, "");
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0 && num < 10000000) {
        return val;
      }
    }
    return "";
  };

  const addItem = (empId: string, name: string, amount: string, rawNote?: string) => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (!empId && /location|branch|site|bathinda|punjab|delhi|mumbai|satna|m\.p|\(punjab\)|\(mp\)/i.test(name)) {
      return;
    }
    const key = `${empId || name.toLowerCase()}_${amount}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const itemType = defaultType || "expenses";
    const displayName = name.replace(/[\/\\|_-]/g, " ").trim();
    items.push({
      id: `bulk_${Math.random().toString(36).substring(2, 9)}`,
      employeeId: empId,
      name: displayName,
      amount,
      type: itemType,
      note: rawNote || `${itemType === "advances" ? "Advance" : "Expense"} claim for ${displayName}`,
    });
  };

  // STRATEGY A: Parse HTML <table> / <tr> rows if emailHtml exists
  if (emailHtml && /<tr/i.test(emailHtml)) {
    const trMatches = emailHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const trHtml of trMatches) {
      const cellMatches = trHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      if (cellMatches.length < 2) continue;

      const cellTexts = cellMatches.map((cell) =>
        cell
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/\s+/g, " ")
          .trim()
      );

      const rowJoined = cellTexts.join(" ").toLowerCase();
      if (
        /location|employee code|employee name|advance amount|s\.no|serial no|total amount/i.test(
          rowJoined
        ) &&
        !/\d{3,}/.test(rowJoined)
      ) {
        continue;
      }

      let rowAmount = "";
      let matchedEmp: any = null;
      let fallbackName = "";

      for (const cell of cellTexts) {
        if (!cell) continue;

        if (!matchedEmp) {
          const emp = findEmpMatch(cell);
          if (emp) {
            matchedEmp = emp;
          } else if (
            /[a-zA-Z]{3,}/.test(cell) &&
            !/location|branch|site|bathinda|punjab|delhi|mumbai|satna|m\.p|\(punjab\)|\(mp\)|\(pb\)|pjl|rupees|only|thousand|hundred/i.test(cell)
          ) {
            if (!fallbackName) fallbackName = cell;
          }
        }

        if (!rowAmount) {
          if (
            /₹|rs\.?|inr|\$|\d[\d,]*\s*(?:rupees|\/-|only)/i.test(cell) ||
            /^[\d,]+(?:\.\d{1,2})?$/.test(cell.trim())
          ) {
            const parsed = parseAmountStr(cell);
            if (parsed) {
              if (parsed.length === 4 && (parsed.startsWith("202") || parsed.startsWith("199"))) {
                if (/₹|rs|inr|\$|rupees|\/-/i.test(cell)) {
                  rowAmount = parsed;
                }
              } else {
                rowAmount = parsed;
              }
            }
          }
        }
      }

      if (rowAmount && (matchedEmp || (fallbackName && !/location|branch|site|bathinda|punjab/i.test(fallbackName)))) {
        const empName = matchedEmp
          ? `${matchedEmp.first_name || ""} ${matchedEmp.last_name || ""}`.trim()
          : fallbackName;
        addItem(matchedEmp ? matchedEmp.id : "", empName, rowAmount);
      }
    }
  }

  // STRATEGY B: Parse Pipe '|' or Tab '\t' separated table lines
  if (items.length === 0 && emailText) {
    const lines = emailText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes("|") || trimmed.includes("\t") || /\s{3,}/.test(trimmed)) {
        const cells = trimmed
          .split(/[|\t]|(?:\s{3,})/)
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length >= 2) {
          const rowJoined = cells.join(" ").toLowerCase();
          if (
            /location|employee code|employee name|advance amount|total/i.test(rowJoined) &&
            !/\d{3,}/.test(rowJoined)
          ) {
            continue;
          }

          let rowAmount = "";
          let matchedEmp: any = null;
          let fallbackName = "";

          for (const cell of cells) {
            if (!matchedEmp) {
              const emp = findEmpMatch(cell);
              if (emp) matchedEmp = emp;
              else if (
                /[a-zA-Z]{3,}/.test(cell) &&
                !/pjl|satna|m\.p|location|rupees|only|thousand|hundred/i.test(cell)
              ) {
                if (!fallbackName) fallbackName = cell;
              }
            }
            if (!rowAmount) {
              const parsed = parseAmountStr(cell);
              if (parsed) rowAmount = parsed;
            }
          }

          if (rowAmount && (matchedEmp || fallbackName)) {
            const empName = matchedEmp
              ? `${matchedEmp.first_name || ""} ${matchedEmp.last_name || ""}`.trim()
              : fallbackName;
            addItem(matchedEmp ? matchedEmp.id : "", empName, rowAmount);
          }
        }
      }
    }
  }

  // STRATEGY C: Preserved Old Code Pattern (Single line format e.g. "Javed: 5000", "Rahul - 5000")
  if (items.length === 0 && emailText) {
    const lines = emailText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(
        /^(?:[0-9]+\.|\-|\*)?\s*([A-Za-z0-9\s.]{2,40})[\s:=._-]+\s*(?:rs\.?|₹|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i
      );

      if (match && match[1] && match[2]) {
        const namePart = match[1].replace(/[._-]/g, "").trim();
        const amountVal = match[2].replace(/,/g, "");

        if (
          /dear|thanks|regards|team|account|ifsc|date|limit|total|sub|cif|c|note|salary|please|deduct|below/i.test(
            namePart
          )
        ) {
          continue;
        }

        const amtNum = parseFloat(amountVal);
        if (amtNum > 0 && namePart.length >= 2) {
          const empMatch = findEmpMatch(namePart) || findEmpMatch(trimmed);
          const empId = empMatch ? empMatch.id : "";
          const empName = empMatch
            ? `${empMatch.first_name || ""} ${empMatch.last_name || ""}`.trim()
            : namePart;
          addItem(empId, empName, amountVal);
        }
      }
    }
  }

  return items;
}

