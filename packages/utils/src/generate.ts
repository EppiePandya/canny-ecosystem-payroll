import { resolveDynamicDate } from "./date-utils";
import {
  DEFAULT_APPOINTMENT_LETTER,
  DEFAULT_CONTRACTUAL_APPOINTMENT_LETTER,
  DEFAULT_EXPERIENCE_LETTER,
  DEFAULT_NOC_LETTER,
  DEFAULT_OFFER_LETTER,
  DEFAULT_RELIEVING_LETTER,
  DEFAULT_TERMINATION_LETTER,
  DEFAULT_PAYROLL_INVOICE_SUBJECT,
  DEFAULT_REIMBURSEMENT_INVOICE_SUBJECT,
} from "../constant";

export const styles: Record<string, any> = {
  page: {
    paddingBottom: 30,
  },
  otherPage: {
    paddingBottom: 40,
    paddingTop: 40,
  },
  indent: {
    padding: 20,
  },
  continuationSpacer: {
    height: 32,
    marginLeft: 8,
    marginRight: 8,
  },
  wrapper: {
    paddingBottom: 30,
    paddingHorizontal: 40,
    backgroundColor: "#ffffff",
    fontSize: 10,
    lineHeight: 1.6,
    fontFamily: "Helvetica",
    flexGrow: 1,
  },
  header: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    marginBottom: 55,
    marginTop: 15,
  },
  headerDate: {
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
  },
  recipient: {
    width: "35%",
    marginBottom: 14,
  },
  text: {
    marginBottom: 5,
  },
  title: {
    marginHorizontal: "auto",
    fontFamily: "Helvetica-Bold",
    marginVertical: 20,
  },
  h1Text: {
    fontSize: "32px",
  },
  h2Text: {
    fontSize: "24px",
  },
  h3Text: {
    fontSize: "18.72px",
  },
  h4Text: {
    fontSize: "16px",
  },
  h5Text: {
    fontSize: "13.28px",
  },
  h6Text: {
    fontSize: "10.72px",
  },
  subject: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    marginVertical: 10,
  },
  section: {
    marginTop: 5,
    marginBottom: 15,
  },
  otherSection: {
    marginTop: 5,
    marginBottom: 15,
  },
  container: {
    position: "absolute",
    bottom: 120,
    right: 80,
    pointerEvents: "none",
  },
  signatureWrapper: {
    position: "relative",
  },
  signatureOverlay: {
    position: "absolute",
    bottom: 7,
    left: 20,
    width: 140,
    zIndex: 3,
  },
  signatureStampOverlay: {
    position: "absolute",
    left: 130,
    width: 70,
    opacity: 0.95,
    zIndex: 2,
    pointerEvents: "none",
  },
  stamp: {
    width: 70,
    height: 70,
    right: 30,
    bottom: 20,
    opacity: 0.95,
    position: "absolute",
    pointerEvents: "none",
    zIndex: 2,
  },
  page2Stamp: {
    width: 70,
    height: 70,
    right: 1,
    bottom: 1,
    position: "absolute",
    pointerEvents: "none",
    zIndex: 2,
  },
  keyPoints: {
    marginLeft: 15,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  footer: {
    textAlign: "center",
    marginBottom: 0,
    paddingBottom: 0,
    paddingHorizontal: 5,
  },
  addressSection: {
    marginBottom: 15,
  },
  addressText: {
    lineHeight: 1.5,
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  addressContainer: {
    width: 160,
    marginTop: 3,
  },
  reference: {
    marginBottom: 15,
  },
  content: {
    marginBottom: 15,
  },
  normalText: {
    fontSize: 11,
    lineHeight: 1.4,
  },
  tableContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 10,
  },
  table: {
    marginHorizontal: "auto",
    marginVertical: "5px",
    width: "60%",
    maxWidth: "80%",
    borderTop: "1px solid #000",
    borderLeft: "1px solid #000",
  },
  tableHeader: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    backgroundColor: "white",
  },
  tableBody: {
    display: "flex",
    backgroundColor: "white",
    flexDirection: "column",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    margin: 0,
  },
  th: {
    textTransform: "capitalize",
    textAlign: "center",
    flex: 1,
    paddingTop: "2px",
    paddingHorizontal: "3px",
    borderBottom: "1px solid #000",
    borderRight: "1px solid #000",
  },
  tableCell: {
    textTransform: "capitalize",
    textAlign: "center",
    flex: 1,
    paddingTop: "2px",
    paddingHorizontal: "3px",
    borderBottom: "1px solid #000",
    borderRight: "1px solid #000",
  },
  tableCellAmount: {
    width: 100,
    textAlign: "right",
  },
  signatureSection: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: {
    width: "40%",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: "#000",
    marginBottom: 10,
  },

  list: {
    marginLeft: 20, // Indentation for lists
    marginBottom: 10,
  },
  listItem: {
    marginBottom: 4,
    color: "#333", // Dark gray for list items
  },

  // Blockquote Styles
  blockquote: {
    borderLeft: "4px solid #ccc", // Subtle border for blockquotes
    paddingLeft: 10,
    marginLeft: 0,
    marginBottom: 10,
    fontSize: 12,
    color: "#555", // Lighter gray for blockquotes
    fontStyle: "italic",
  },

  // Code Block Styles
  codeblock: {
    backgroundColor: "#f4f4f4", // Light gray background for the entire block
    padding: 10, // Padding around the code block
    borderRadius: 4, // Rounded corners
    marginBottom: 10, // Space below the block
    overflowWrap: "break-word", // Prevents horizontal overflow
    fontFamily: "Courier", // Monospace font for code
    fontSize: 10, // Smaller font size for readability
    color: "#333", // Dark gray text for code
    whiteSpace: "pre-wrap", // Preserve whitespace but wrap long lines
  },
  code: {
    fontFamily: "Courier", // Monospace font for inline code
    fontSize: 10, // Consistent font size
    color: "#000", // Black text for inline code
  },

  // Inline Code Styles
  inlineCode: {
    backgroundColor: "#f4f4f4", // Light gray background for inline code
    padding: "2px 4px",
    borderRadius: 4,
    fontFamily: "Courier", // Monospace font for inline code
    fontSize: 10,
    color: "#000", // Black text for inline code
  },
  link: {
    color: "#007BFF", // Blue color for links
    textDecoration: "underline", // Underline for clickable links
  },
  // Image Styles
  image: {
    width: "100%",
    height: "auto",
    objectFit: "contain",
  },
  boldText: {
    fontFamily: "Helvetica-Bold",
  },
  italicText: {
    fontStyle: "italic",
  },
  underlineText: {
    textDecoration: "underline",
  },
  delText: {
    textDecoration: "line-through",
  },
  supText: {
    verticalAlign: "super",
  },
  subText: {
    verticalAlign: "sub",
  },
  centerText: {
    textAlign: "center",
  },
};

export const replacePlaceholders = (
  content: string | null | undefined,
  replacements: Record<string, any>,
  rawDateReplacements: Record<string, any> = {},
) => {
  if (!content) return "";

  return content.replace(/\$\{([^}]+)\}/g, (fullMatch, rawKey) => {
    const cleanKey = rawKey
      .replace(/<[^>]+>/g, "")
      .replace(/\*\*/g, "")
      .trim();
    const isBoldInside = /<(b|strong)\b/i.test(rawKey) || /\*\*/.test(rawKey);

    const wrapResult = (res: any) => {
      if (res === undefined || res === null) return res;
      if (isBoldInside) {
        return `<strong>${res}</strong>`;
      }
      return res;
    };

    // 1. Preserve layout/renderer control tokens
    const normalizedClean = cleanKey.toLowerCase().replace(/[^a-z0-9]/g, "");
    const CONTROL_TOKENS = new Set([
      "center",
      "pagebreak",
      "address",
      "salarystructure",
    ]);
    if (
      CONTROL_TOKENS.has(normalizedClean) ||
      normalizedClean.startsWith("signature") ||
      normalizedClean.startsWith("employeesignature")
    ) {
      return fullMatch;
    }

    // 2. Dynamic Net Pay calculation check (e.g. netPay:26, netpay|27)
    const netPayMatch = cleanKey.match(
      /^(netpay|netPay|monthlyNetPay)[:|](\d+)$/i,
    );
    if (netPayMatch) {
      const days = parseInt(netPayMatch[2], 10);
      if (typeof replacements._calcNetPay === "function") {
        return wrapResult(replacements._calcNetPay(days));
      }
    }

    // 3. Date formula check (e.g. joinedDate|add:1:year, joinedDate|ordinal, joinedDate|add:1:year|ordinal)
    const [baseKey, ...formulaParts] = cleanKey
      .split("|")
      .map((s: string) => s.trim());
    const formula = formulaParts.join("|");

    if (formula) {
      const rawDate = rawDateReplacements[baseKey] ?? replacements[baseKey];
      if (rawDate) {
        const resolved = resolveDynamicDate(rawDate, formula);
        if (resolved) return wrapResult(resolved);
      }
      return fullMatch;
    }

    // 3. Direct or normalized key check
    const findReplacement = (k: string) => {
      if (!k) return undefined;
      if (replacements[k] !== undefined) return replacements[k];
      const normalizedK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const [rk, rv] of Object.entries(replacements)) {
        if (rk.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedK) {
          return rv;
        }
      }
      return undefined;
    };

    let value = findReplacement(cleanKey) ?? findReplacement(baseKey);

    if (value === "Invalid Date") value = "";

    return value !== undefined ? wrapResult(value) : fullMatch;
  });
};

export const bringDefaultLetterContent = (
  letterType: string | undefined,
  data: any,
) => {
  const salaryTablemarkdownLines = [
    "| **Particulars**           | **Amount (Rs.)** |",
    "|---------------------------|-----------------|",
  ];
  let totalGrossEarning = 0;
  let totalDeductions = 0;

  if (data?.earning) {
    for (const [key, value] of Object.entries(data.earning)) {
      const amount = value as number;
      salaryTablemarkdownLines.push(
        `| ${key.charAt(0).toUpperCase() + key.slice(1)
        }                     | ${amount.toLocaleString()}/-           |`,
      );
      totalGrossEarning += amount;
    }

    salaryTablemarkdownLines.push(
      `| **Gross Earning**         | **${totalGrossEarning.toLocaleString()}/-**     |`,
    );
  }

  if (data?.deduction) {
    for (const [key, value] of Object.entries(data.deduction)) {
      const amount = value as number;
      salaryTablemarkdownLines.push(
        `| ${key}                 | ${amount.toLocaleString()}/-           |`,
      );
      totalDeductions += amount;
    }
  }

  const netSalary = totalGrossEarning - totalDeductions;
  salaryTablemarkdownLines.push(
    `| **Net Salary**            | **${netSalary.toLocaleString()}/-** |`,
  );

  const salaryTableMarkdown = `\n
  # YOUR TOTAL COST OF COMPANY WILL BE AS BELOW:

    ${salaryTablemarkdownLines.join("\n")}`;

  switch (letterType) {
    case "appointment_letter":
      return DEFAULT_APPOINTMENT_LETTER + salaryTableMarkdown;

    case "experience_letter":
      return DEFAULT_EXPERIENCE_LETTER;

    case "offer_letter":
      return DEFAULT_OFFER_LETTER;

    case "noc_letter":
      return DEFAULT_NOC_LETTER;

    case "relieving_letter":
      return DEFAULT_RELIEVING_LETTER;

    case "termination_letter":
      return DEFAULT_TERMINATION_LETTER;

    case "contractual_appointment_letter":
      return DEFAULT_CONTRACTUAL_APPOINTMENT_LETTER;

    default:
      return "";
  }
};

export function getDefaultInvoiceSubject(
  type?: "salary" | "reimbursement" | "exit" | string,
  options?: {
    departmentName?: string;
    month?: string;
    siteName?: string;
    officeName?: string;
  },
): string {
  const formatMonthPart = (rawMonth?: string): string => {
    if (!rawMonth || !rawMonth.trim()) return "Month of _________";
    const mStr = rawMonth.trim();
    if (mStr.toLowerCase().startsWith("month of")) return mStr;

    const d = new Date(mStr);
    if (!isNaN(d.getTime())) {
      const monthShort = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
      const year = d.getFullYear();
      return `Month of ${monthShort} - ${year}`;
    }
    return `Month of ${mStr}`;
  };

  if (type === "reimbursement") {
    let deptName = options?.departmentName?.trim() || "";
    if (deptName && !deptName.toLowerCase().includes("department")) {
      deptName = `${deptName} Department`;
    }
    const deptPart = deptName ? ` - ${deptName}` : "";
    const monthPart = formatMonthPart(options?.month);
    const sitePart = options?.siteName?.trim()
      ? `\n${options.siteName.trim()}`
      : "";

    return `Reimbursement of Expenses for Support Services${deptPart} during period ${monthPart}${sitePart}`.trim();
  }

  const office = options?.officeName?.trim()
    ? `${options.officeName.trim()} Office`
    : "_____ Office";
  const monthPart = formatMonthPart(options?.month);

  return `Providing Manpower on Labour contract basis at your ${office} for ${monthPart}`;
}

