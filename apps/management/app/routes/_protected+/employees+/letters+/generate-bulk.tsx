import JSZip from "jszip";
import {
  formatMonthYearDate,
  replacePlaceholders,
  getLetterSalaryFromAssignment,
  formatDateToSlash,
  formatDateToOrdinal,
} from "@canny_ecosystem/utils";
import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";

import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getActiveEmployeesByIdsFlat,
  getLetterById,
} from "@canny_ecosystem/supabase/queries";

import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";
import {
  getSalaryStructureEarnings,
  getSalaryStructureDeductions,
} from "@/components/letter/letter-templates/salary-structure-document";
import {
  sortDeductions,
} from "@/components/employees/pdf/salary-slip-pdf";

function formatUnderscoreText(str: string | null | undefined) {
  if (!str) return "";

  return str
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => {
      if (word.toLowerCase() === "iti") return "ITI";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeRun(
  content: string,
  opts: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
  },
): string {
  return `<w:r>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
        ${opts.bold ? "<w:b />" : ""}
        ${opts.italic ? "<w:i />" : ""}
        ${opts.underline ? '<w:u w:val="single" />' : ""}
        ${opts.strike ? "<w:strike />" : ""}
        <w:sz w:val="22" />
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(content)}</w:t>
    </w:r>`;
}

function parseTextToRuns(text: string): string {
  // Step 1: Normalize HTML inline formatting tags → internal Unicode sentinels
  // Using rare control chars as temporary markers so we don't confuse them with content
  const BOLD_OPEN = "\x02",
    BOLD_CLOSE = "\x03";
  const ITALIC_OPEN = "\x04",
    ITALIC_CLOSE = "\x05";
  const UL_OPEN = "\x06",
    UL_CLOSE = "\x07";
  const ST_OPEN = "\x0E",
    ST_CLOSE = "\x0F";

  let normalized = text
    .replace(/&rupee;|&inr;|&#8377;/gi, "₹")
    // HTML bold
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
    .replace(/<b>([\s\S]*?)<\/b>/gi, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
    // HTML italic
    .replace(/<em>([\s\S]*?)<\/em>/gi, `${ITALIC_OPEN}$1${ITALIC_CLOSE}`)
    .replace(/<i>([\s\S]*?)<\/i>/gi, `${ITALIC_OPEN}$1${ITALIC_CLOSE}`)
    // HTML underline
    .replace(/<u>([\s\S]*?)<\/u>/gi, `${UL_OPEN}$1${UL_CLOSE}`)
    // HTML strikethrough
    .replace(/<s>([\s\S]*?)<\/s>/gi, `${ST_OPEN}$1${ST_CLOSE}`)
    .replace(/<strike>([\s\S]*?)<\/strike>/gi, `${ST_OPEN}$1${ST_CLOSE}`)
    .replace(/<del>([\s\S]*?)<\/del>/gi, `${ST_OPEN}$1${ST_CLOSE}`)
    // HTML line breaks → space
    .replace(/<br\s*\/?>/gi, " ")
    // Strip any remaining HTML tags we don't recognise
    .replace(/<[^>]+>/g, "");

  // Step 1b: Decode HTML entities so they render as real characters
  // (must happen AFTER tag stripping so &amp; in attributes isn't decoded early)
  normalized = normalized
    // Named entities
    .replace(/&nbsp;/gi, "\u00A0")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&ldquo;/gi, "\u201C")
    .replace(/&rdquo;/gi, "\u201D")
    .replace(/&hellip;/gi, "\u2026")
    .replace(/&copy;/gi, "\u00A9")
    .replace(/&reg;/gi, "\u00AE")
    .replace(/&trade;/gi, "\u2122")
    // Numeric hex: &#x20; &#xA0; &#x2019; etc.
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    // Numeric decimal: &#160; &#32; etc.
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );

  // Step 2: Convert markdown syntax → same sentinels
  normalized = normalized
    // Bold: **text** or __text__
    .replace(/\*\*([\s\S]*?)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
    .replace(/__([\s\S]*?)__/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
    // Strikethrough: ~~text~~
    .replace(/~~([\s\S]*?)~~/g, `${ST_OPEN}$1${ST_CLOSE}`)
    // Italic: *text* or _text_  (after bold so ** is already consumed)
    .replace(/\*([\s\S]*?)\*/g, `${ITALIC_OPEN}$1${ITALIC_CLOSE}`)
    .replace(/_([\s\S]*?)_/g, `${ITALIC_OPEN}$1${ITALIC_CLOSE}`);

  // Step 3: Tokenise on our sentinels and produce OOXML runs
  const pattern = new RegExp(
    `[${BOLD_OPEN}${BOLD_CLOSE}${ITALIC_OPEN}${ITALIC_CLOSE}${UL_OPEN}${UL_CLOSE}${ST_OPEN}${ST_CLOSE}]`,
  );

  const tokens = normalized.split(pattern);
  const markers = Array.from(
    normalized.matchAll(
      new RegExp(
        `[${BOLD_OPEN}${BOLD_CLOSE}${ITALIC_OPEN}${ITALIC_CLOSE}${UL_OPEN}${UL_CLOSE}${ST_OPEN}${ST_CLOSE}]`,
        "g",
      ),
    ),
  ).map((m) => m[0]);

  let bold = false,
    italic = false,
    underline = false,
    strike = false;
  let result = "";

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]) {
      result += makeRun(tokens[i], { bold, italic, underline, strike });
    }
    const marker = markers[i];
    if (marker === BOLD_OPEN) {
      bold = true;
    }
    if (marker === BOLD_CLOSE) {
      bold = false;
    }
    if (marker === ITALIC_OPEN) {
      italic = true;
    }
    if (marker === ITALIC_CLOSE) {
      italic = false;
    }
    if (marker === UL_OPEN) {
      underline = true;
    }
    if (marker === UL_CLOSE) {
      underline = false;
    }
    if (marker === ST_OPEN) {
      strike = true;
    }
    if (marker === ST_CLOSE) {
      strike = false;
    }
  }

  return result;
}

function makeTableRow(
  col1: string,
  col2: string,
  col3: string,
  isBold: boolean = false,
  isHeader: boolean = false,
) {
  if (isHeader) {
    return `<w:tr>
      <w:tc>
        <w:tcPr>
          <w:gridSpan w:val="3" />
          <w:shd w:val="clear" w:color="auto" w:fill="F2F2F2" />
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:jc w:val="center" />
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:b />
              <w:sz w:val="20" />
              <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
            </w:rPr>
            <w:t>${escapeXml(col1)}</w:t>
          </w:r>
        </w:p>
      </w:tc>
    </w:tr>`;
  }

  return `<w:tr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="3600" w:type="dxa" />
      </w:tcPr>
      <w:p>
        <w:pPr>
          <w:ind w:left="100" />
        </w:pPr>
        <w:r>
          <w:rPr>
            ${isBold ? "<w:b />" : ""}
            <w:sz w:val="20" />
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
          </w:r>
          <w:t>${escapeXml(col1)}</w:t>
        </w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="900" w:type="dxa" />
      </w:tcPr>
      <w:p>
        <w:pPr>
          <w:jc w:val="center" />
        </w:pPr>
        <w:r>
          <w:rPr>
            ${isBold ? "<w:b />" : ""}
            <w:sz w:val="20" />
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
          </w:r>
          <w:t>${escapeXml(col2)}</w:t>
        </w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="1500" w:type="dxa" />
      </w:tcPr>
      <w:p>
        <w:pPr>
          <w:jc w:val="right" />
          <w:ind w:right="100" />
        </w:pPr>
        <w:r>
          <w:rPr>
            ${isBold ? "<w:b />" : ""}
            <w:sz w:val="20" />
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
          </w:r>
          <w:t>${escapeXml(col3)}</w:t>
        </w:r>
      </w:p>
    </w:tc>
  </w:tr>`;
}

function makeTable(rowsHtml: string) {
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="6000" w:type="dxa" />
      <w:jc w:val="center" />
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="80" w:type="dxa" />
        <w:bottom w:w="80" w:type="dxa" />
      </w:tblCellMar>
    </w:tblPr>
    ${rowsHtml}
  </w:tbl>`;
}

function makeSignatureTable(
  data: any,
  hasDirector: boolean,
  hasEmployee: boolean,
  isWithEmployeeName: boolean,
  isWithEmployeeLetterName: boolean,
) {
  const directorXml = hasDirector
    ? `
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>Yours truly,</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(CANNY_MANAGEMENT_SERVICES_NAME)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">&#10;&#10;&#10;</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>Director</w:t></w:r>
    </w:p>
  `
    : "";

  let employeeNameText = "";
  if (isWithEmployeeName && data?.employees) {
    employeeNameText = [data.employees.first_name, data.employees.last_name]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();
  } else if (isWithEmployeeLetterName) {
    employeeNameText = (data?.letter_name || "").toUpperCase();
  }

  const employeeXml = hasEmployee
    ? `
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>I accept the contract of employment with the terms and conditions contained thereto</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">&#10;&#10;</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>_______________________________</w:t></w:r>
    </w:p>
    ${employeeNameText
      ? `
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(employeeNameText)}</w:t></w:r>
    </w:p>
    `
      : ""
    }
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>Date: ${formatDateToSlash(data?.date ?? new Date())}</w:t></w:r>
    </w:p>
  `
    : "";

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="8500" w:type="dxa" />
      <w:tblBorders>
        <w:top w:val="none" />
        <w:left w:val="none" />
        <w:bottom w:val="none" />
        <w:right w:val="none" />
        <w:insideH w:val="none" />
        <w:insideV w:val="none" />
      </w:tblBorders>
    </w:tblPr>
    <w:tr>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="4250" w:type="dxa" />
        </w:tcPr>
        ${directorXml || "<w:p/>"}
      </w:tc>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="4250" w:type="dxa" />
        </w:tcPr>
        ${employeeXml || "<w:p/>"}
      </w:tc>
    </w:tr>
  </w:tbl>`;
}

function generateSalaryStructureOoxml(
  salaryData: any,
  employeeData: any,
  date?: any,
): string {
  if (!salaryData) return "";

  const {
    earnings: rawEarnings = [],
    deductions: rawDeductions = [],
    grossAmount = 0,
    netAmount = 0,
    employerContribution = {
      pfTotal: 0,
      eps: 0,
      employerEpf: 0,
      edli: 0,
      admin: 0,
      totalPfLiability: 0,
      esi: 0,
      total: 0,
    },
  } = salaryData;

  const earnings = getSalaryStructureEarnings(rawEarnings);
  const deductions = getSalaryStructureDeductions(rawDeductions);

  const formatAmount = (amount?: number) => {
    if (amount === undefined || amount === null || amount === 0) return "-";
    return `${Math.round(amount).toLocaleString("en-IN")}/-`;
  };

  const salutation =
    employeeData?.gender?.toLowerCase() === "female"
      ? employeeData?.marital_status?.toLowerCase() === "married"
        ? "Mrs."
        : "Ms."
      : "Mr.";
  const employeeFullName = employeeData
    ? `${salutation} ${[
      employeeData.first_name,
      employeeData.middle_name,
      employeeData.last_name,
    ]
      .filter(Boolean)
      .join(" ")}`.trim()
    : "Not Found";

  const rawEmpName = employeeData
    ? [employeeData.first_name, employeeData.last_name]
        .filter(Boolean)
        .join(" ")
        .toUpperCase()
    : "";

  const formattedDate = date
    ? formatDateToSlash(date)
    : new Date()
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
        .replace(/\//g, "/");

  let refString = employeeData?.company_name || "Not Found";

  const makeCombinedRow = (
    l1: string,
    l2: string,
    r1: string,
    r2: string,
    opts?: { isHeader?: boolean; isBold?: boolean },
  ) => {
    const isBold = opts?.isBold || opts?.isHeader;
    if (opts?.isHeader) {
      return `<w:tr>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(l1)}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(r1)}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>`;
    }

    const bXml = isBold ? "<w:b/>" : "";
    return `<w:tr>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:ind w:left="80"/></w:pPr><w:r><w:rPr>${bXml}<w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(l1)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:ind w:right="80"/></w:pPr><w:r><w:rPr>${bXml}<w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(l2)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:ind w:left="80"/></w:pPr><w:r><w:rPr>${bXml}<w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(r1)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:ind w:right="80"/></w:pPr><w:r><w:rPr>${bXml}<w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(r2)}</w:t></w:r></w:p></w:tc>
    </w:tr>`;
  };

  let rowsXml = "";
  rowsXml += makeCombinedRow(
    "NET SALARY",
    "",
    "CTC/GROSS",
    "",
    { isHeader: true },
  );

  for (let i = 0; i < earnings.length; i++) {
    const earn = earnings[i];
    const earnName = earn.name || "Allowance";
    const amtStr = earn.amount ? `Rs. ${formatAmount(earn.amount)}` : "Rs. -";
    rowsXml += makeCombinedRow(
      earnName,
      amtStr,
      earnName,
      amtStr,
    );
  }

  const grossStr = `Rs. ${formatAmount(grossAmount)}`;
  rowsXml += makeCombinedRow(
    "Gross Salary",
    grossStr,
    "Gross Salary",
    grossStr,
    { isBold: true },
  );

  const employerRows = [
    {
      name: "PF Employer",
      amount: `Rs. ${formatAmount(
        employerContribution.totalPfLiability || employerContribution.pfTotal,
      )}`,
    },
    {
      name: "ESIC Employer",
      amount: `Rs. ${formatAmount(employerContribution.esi)}`,
    },
    { name: "WC Policy", amount: "-" },
  ];

  const maxBottom = Math.max(deductions.length, employerRows.length);
  for (let i = 0; i < maxBottom; i++) {
    const ded = deductions[i];
    const empR = employerRows[i];
    const l1 = ded ? ded.name || "Deduction" : "-";
    const l2 = ded ? (ded.amount ? `Rs. ${formatAmount(ded.amount)}` : "Rs. -") : "-";
    const r1 = empR ? empR.name : "-";
    const r2 = empR ? empR.amount : "-";
    rowsXml += makeCombinedRow(l1, l2, r1, r2);
  }

  const totalCtc = grossAmount + (employerContribution.total || 0);
  rowsXml += makeCombinedRow(
    "Net Salary",
    `Rs. ${formatAmount(netAmount)}`,
    "Total Gross C.T.C",
    `Rs. ${formatAmount(totalCtc)}`,
    { isBold: true },
  );

  const tableXml = `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="8000" w:type="dxa" />
      <w:jc w:val="center" />
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    ${rowsXml}
  </w:tbl>`;

  return `
    <w:p>
      <w:r>
        <w:br w:type="page" />
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center" />
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b />
          <w:sz w:val="24" />
          <w:u w:val="single" />
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
        </w:rPr>
        <w:t>SALARY - STRUCTURE LETTER</w:t>
      </w:r>
    </w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>

    <w:p>
      <w:pPr>
        <w:spacing w:after="120" />
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>Dear ${escapeXml(employeeFullName)},</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t xml:space="preserve">                                                                             Date: ${formattedDate}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:spacing w:after="120" />
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>Ref</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>: ${escapeXml(refString)}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:spacing w:after="240" />
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>Further to your employment with us, your salary for the period of employment with effect Letter to the following:</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:jc w:val="center" />
        <w:spacing w:after="120" />
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>YOUR TOTAL COST OF COMPANY WILL BE AS BELOW:</w:t>
      </w:r>
    </w:p>

    ${tableXml}

    <w:p>
      <w:pPr>
        <w:spacing w:before="240" w:after="120" />
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>The net salary is subject to Income Tax</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:spacing w:after="240" />
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>All other terms and conditions as per your Work Assignment Letter &amp; Letter of Engagement Remain unchanged until further notice. You may sign a copy of this letter and return it back to Us as an unconditional token of acceptance.</w:t>
      </w:r>
    </w:p>

    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="8500" w:type="dxa" />
        <w:jc w:val="center" />
        <w:tblBorders>
          <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="4250" w:type="dxa" /></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>For, ${escapeXml(CANNY_MANAGEMENT_SERVICES_NAME)}</w:t></w:r></w:p>
          <w:p><w:pPr><w:spacing w:before="600" /></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>Authorized Signatory</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4250" w:type="dxa" /></w:tcPr>
          <w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>I accept the contract of employment with the terms and conditions Contained thereto</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="400" /></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>${escapeXml(rawEmpName)}</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(Signature &amp; Date)</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;
}

function buildWordDocumentXml(data: any): string {
  let bodyXml = "";

  // 1. Company Letterhead Header
  if (data.include_letter_header) {
    bodyXml += `
      <w:p>
        <w:pPr>
          <w:jc w:val="center" />
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:b />
            <w:sz w:val="32" />
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
          </w:rPr>
          <w:t>Canny Management Services Pvt. Ltd.</w:t>
        </w:r>
      </w:p>
      <w:p>
        <w:pPr>
          <w:jc w:val="center" />
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:sz w:val="18" />
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
          </w:rPr>
          <w:t>502-503, Girivar Glean, Under Odhav Overbrigde, Sardar Patel Ring Rd, nr. Palm Hotel, Odhav, Ahmedabad, Gujarat 382415</w:t>
        </w:r>
      </w:p>
      <w:p>
        <w:pPr>
          <w:pBdr>
            <w:bottom w:val="double" w:sz="6" w:space="4" w:color="000000" />
          </w:pBdr>
        </w:pPr>
      </w:p>
    `;
  } else {
    bodyXml += `<w:p><w:pPr><w:spacing w:before="720" /></w:pPr></w:p>`;
  }

  // 2. Date
  const dateStr = formatDateToSlash(data.date ?? new Date());
  bodyXml += `
    <w:p>
      <w:pPr>
        <w:jc w:val="right" />
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b />
          <w:sz w:val="22" />
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
        </w:rPr>
        <w:t>Date:- ${dateStr}</w:t>
      </w:r>
    </w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
  `;

  const rawContent = data.content || "";
  const hasSalaryStructure = Boolean(
    (data.include_salary_structure ||
      (data as any).includeSalaryStructure ||
      rawContent.includes("${salaryStructure}")) &&
      data.salary_structure_data,
  );

  const contentWithoutSalary = rawContent.replace(
    /(?:<p>)?\s*(?:<[^>]+>|\*\*)*\$\{(?:<[^>]+>)*\s*salaryStructure\s*(?:<[^>]+>)*\}(?:<[^>]+>|\*\*)*\s*(?:<\/p>)?/gi,
    "",
  );

  const pages = contentWithoutSalary.split(
    /(?:<p>)?\s*(?:<[^>]+>|\*\*)*\$\{(?:<[^>]+>)*\s*pagebreak\s*(?:<[^>]+>)*\}(?:<[^>]+>|\*\*)*\s*(?:<\/p>)?/gi,
  );

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    if (pIdx > 0) {
      bodyXml += `
        <w:p>
          <w:r>
            <w:br w:type="page" />
          </w:r>
        </w:p>
      `;
    }

    const pageContent = pages[pIdx];
    const lines = splitContentIntoLines(pageContent);

    let insideTable = false;
    let tableRows: string[] = [];
    let inRecipientBlock = pIdx === 0;

    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const line = lines[lIdx];

      if (line.startsWith("|")) {
        insideTable = true;
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const isSeparator = cells.every((c) => c.match(/^:?-+:?$/));
        if (!isSeparator) {
          const rowXml = `<w:tr>
            ${cells
              .map(
                (c) => `<w:tc>
              <w:tcPr>
                <w:tcW w:w="${Math.floor(6000 / cells.length)}" w:type="dxa" />
              </w:tcPr>
              <w:p>
                <w:pPr>
                  <w:ind w:left="100" />
                </w:pPr>
                ${parseTextToRuns(c)}
              </w:p>
            </w:tc>`,
              )
              .join("")}
          </w:tr>`;
          tableRows.push(rowXml);
        }
        continue;
      } else if (insideTable) {
        bodyXml += makeTable(tableRows.join(""));
        tableRows = [];
        insideTable = false;
      }

      const cleanLine = line.replace(/<[^>]+>/g, "");
      const stripped = decodeHtmlEntities(cleanLine).trim();

      if (!stripped) {
        if (!inRecipientBlock) {
          bodyXml += `<w:p><w:pPr><w:spacing w:after="120" /></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
        }
        continue;
      }

      const hasSignatureToken =
        /\$\{signature((?::[0-2])*)?\}/.test(cleanLine) ||
        cleanLine.includes("${employeeSignatureWithName}") ||
        cleanLine.includes("${employeeSignatureWithLetterName}") ||
        cleanLine.includes("${employeeSignature}");

      if (hasSignatureToken) {
        inRecipientBlock = false;
        const hasSig = /\$\{signature((?::[0-2])*)?\}/.test(cleanLine);
        const hasEmpSigWithName = cleanLine.includes(
          "${employeeSignatureWithName}",
        );
        const hasEmpSigWithLetter = cleanLine.includes(
          "${employeeSignatureWithLetterName}",
        );
        const hasEmpSig = cleanLine.includes("${employeeSignature}");

        bodyXml += makeSignatureTable(
          data,
          hasSig,
          hasEmpSig || hasEmpSigWithName || hasEmpSigWithLetter,
          hasEmpSigWithName,
          hasEmpSigWithLetter,
        );
        continue;
      }

      let isCentered = false;
      let lineText = line;
      if (
        cleanLine.includes("${center}") ||
        /<center\b/i.test(line) ||
        /text-align:\s*center/i.test(line)
      ) {
        isCentered = true;
        inRecipientBlock = false;
        lineText = line
          .replace(/<[^>]*>\$\{center\}<\/[^>]*>|\$\{center\}/gi, "")
          .replace(/<center\b[^>]*>|<\/center>/gi, "")
          .trim();
      }

      let isAddress = false;
      if (lineText.includes("${address}")) {
        isAddress = true;
        lineText = lineText.replace(/\$\{address\}/g, "").toUpperCase();
      }

      if (lineText.startsWith("#")) {
        inRecipientBlock = false;
        const hashCount = (lineText.match(/^#+/) || [""])[0].length;
        const headingText = lineText.replace(/^#+\s*/, "");
        const size = hashCount === 1 ? 32 : hashCount === 2 ? 28 : 24;
        bodyXml += `
          <w:p>
            <w:pPr>
              <w:jc w:val="${isCentered ? "center" : "left"}" />
              <w:spacing w:before="240" w:after="120" />
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:b />
                <w:sz w:val="${size}" />
                <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
              </w:rPr>
              <w:t>${escapeXml(headingText)}</w:t>
            </w:r>
          </w:p>
        `;
        continue;
      }

      const isSalutationOrBody =
        stripped.length > 70 ||
        /^(dear\b|subject\s*:|to whom|with reference|this has reference|we are pleased|with the following)/i.test(
          stripped,
        );

      let spacingBefore = 0;
      let spacingAfter = 80;

      if (inRecipientBlock) {
        if (isSalutationOrBody) {
          inRecipientBlock = false;
          spacingBefore = 240;
          spacingAfter = 80;
        } else {
          spacingBefore = 0;
          spacingAfter = 30;
        }
      }

      if (
        lineText.startsWith("* ") ||
        lineText.startsWith("- ") ||
        lineText.startsWith("• ")
      ) {
        inRecipientBlock = false;
        const bulletText = lineText.replace(/^[*•-]\s*/, "");
        bodyXml += `
          <w:p>
            <w:pPr>
              <w:ind w:left="360" />
              <w:spacing w:after="60" />
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:sz w:val="22" />
                <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
              </w:rPr>
              <w:t xml:space="preserve">•   </w:t>
            </w:r>
            ${parseTextToRuns(bulletText)}
          </w:p>
        `;
        continue;
      }

      bodyXml += `
        <w:p>
          <w:pPr>
            ${isCentered ? '<w:jc w:val="center" />' : ""}
            ${isAddress ? '<w:ind w:left="720" />' : ""}
            <w:spacing ${spacingBefore > 0 ? `w:before="${spacingBefore}" ` : ""}w:after="${spacingAfter}" />
          </w:pPr>
          ${parseTextToRuns(lineText)}
        </w:p>
      `;
    }

    if (insideTable) {
      bodyXml += makeTable(tableRows.join(""));
    }
  }

  const contentHasSignatureToken =
    /\$\{signature((?::[0-2])*)?\}/.test(content) ||
    content.includes("${employeeSignatureWithName}") ||
    content.includes("${employeeSignatureWithLetterName}") ||
    content.includes("${employeeSignature}");

  if (
    !contentHasSignatureToken &&
    (data.include_signatuory || data.include_employee_signature)
  ) {
    bodyXml += `
      <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    `;
    bodyXml += makeSignatureTable(
      data,
      data.include_signatuory,
      data.include_employee_signature,
      true,
      false,
    );
  }

  if (hasSalaryStructure && data.salary_structure_data) {
    bodyXml += generateSalaryStructureOoxml(
      data.salary_structure_data,
      data.employees,
      data.date,
    );
  }

  if (data.include_letter_footer) {
    bodyXml += `
      <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
      <w:p>
        <w:pPr>
          <w:pBdr>
            <w:top w:val="single" w:sz="6" w:space="4" w:color="000000" />
          </w:pBdr>
          <w:jc w:val="center" />
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:sz w:val="16" />
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" />
          </w:rPr>
          <w:t>Regd Office: 502-503, Girivar Glean, Under Odhav Overbrigde, Sardar Patel Ring Rd, nr. Palm Hotel, Odhav, Ahmedabad, Gujarat 382415</w:t>
        </w:r>
      </w:p>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function generateDocx(data: any): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );

  const documentXml = buildWordDocumentXml(data);
  zip.file("word/document.xml", documentXml);

  return zip.generateAsync({ type: "nodebuffer" });
}

function preserveCase(match: string, replacement: string): string {
  const firstLetter = match.match(/[a-z]/i);
  if (!firstLetter) return replacement;

  const lettersOnly = match.replace(/[^a-zA-Z]/g, "");
  if (lettersOnly && lettersOnly === lettersOnly.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (firstLetter[0] === firstLetter[0].toUpperCase()) {
    return (
      replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase()
    );
  }

  return replacement.toLowerCase();
}

function replaceGenderPronouns(
  content: string | null | undefined,
  gender?: string | null,
): string {
  if (!content) return "";
  const isFemale = gender?.toLowerCase() === "female";

  const he_she_slash =
    /\[?(he\s*\/\s*she\s*\/\s*they|he\s*\/\s*she|she\s*\/\s*he)\]?/gi;
  const him_her_slash =
    /\[?(him\s*\/\s*her\s*\/\s*them|him\s*\/\s*her|her\s*\/\s*him)\]?/gi;
  const his_her_slash =
    /\[?(his\s*\/\s*her\s*\/\s*their|his\s*\/\s*her|her\s*\/\s*his)\]?/gi;
  const himself_herself_slash =
    /\[?(himself\s*\/\s*herself\s*\/\s*themselves|himself\s*\/\s*herself|herself\s*\/\s*himself)\]?/gi;

  if (isFemale) {
    return content
      .replace(himself_herself_slash, (match) => preserveCase(match, "herself"))
      .replace(his_her_slash, (match) => preserveCase(match, "her"))
      .replace(him_her_slash, (match) => preserveCase(match, "her"))
      .replace(he_she_slash, (match) => preserveCase(match, "she"))
      .replace(/\bhimself\b/gi, (match) => preserveCase(match, "herself"))
      .replace(/\bhim\b/gi, (match) => preserveCase(match, "her"))
      .replace(/\bhis\b/gi, (match) => preserveCase(match, "her"))
      .replace(/\bhe\b/gi, (match) => preserveCase(match, "she"));
  }

  return content
    .replace(himself_herself_slash, (match) => preserveCase(match, "himself"))
    .replace(his_her_slash, (match) => preserveCase(match, "his"))
    .replace(him_her_slash, (match) => preserveCase(match, "him"))
    .replace(he_she_slash, (match) => preserveCase(match, "he"))
    .replace(/\bherself\b/gi, (match) => preserveCase(match, "himself"))
    .replace(/\bshe\b/gi, (match) => preserveCase(match, "he"))
    .replace(/\bher\b/gi, (match, offset, str) => {
      const after = str.slice(offset + match.length).trim();
      const nextWordMatch = after.match(/^([a-z0-9]+)/i);
      const nextWord = nextWordMatch ? nextWordMatch[1].toLowerCase() : "";

      const objectiveFollowers = [
        "at",
        "in",
        "on",
        "to",
        "for",
        "with",
        "by",
        "from",
        "about",
        "under",
        "against",
        "of",
        "and",
        "or",
        "but",
        "if",
        "that",
        "as",
        "all",
        "both",
        "each",
        "so",
        "then",
        "also",
        "now",
        "here",
        "there",
        "who",
        "whom",
        "which",
      ];

      if (!nextWord || objectiveFollowers.includes(nextWord)) {
        return preserveCase(match, "him");
      }
      return preserveCase(match, "his");
    });
}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&rsquo;/gi, "’")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/&hellip;/gi, "...")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );
}

function sanitizePdfText(text: string): string {
  if (!text) return "";
  let clean = decodeHtmlEntities(text);
  clean = clean.replace(/Rs\.\s*₹/gi, "Rs. ");
  clean = clean.replace(/Rs\s*₹/gi, "Rs. ");
  clean = clean.replace(/₹/g, "Rs. ");
  clean = clean.replace(/&rupee;|&inr;|&#8377;/gi, "Rs. ");
  clean = clean.replace(/Rs\.\s*Rs\./gi, "Rs.");
  return clean
    .replace(/\\([=\-_*~`[\](){}+.!#\/\\])/g, "$1")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, " ");
}

type LetterAssetBuffers = {
  header: Uint8Array | null;
  footer: Uint8Array | null;
  signature: Uint8Array | null;
  stamp: Uint8Array | null;
};

async function getLetterAssetBuffers(): Promise<LetterAssetBuffers> {
  const fetchBuffer = async (filename: string): Promise<Uint8Array | null> => {
    try {
      const url = `${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/${filename}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.error(`Error fetching letter asset ${filename}:`, e);
      return null;
    }
  };

  const [header, footer, signature, stamp] = await Promise.all([
    fetchBuffer("letters-header.png"),
    fetchBuffer("letters-footer.png"),
    fetchBuffer("signature.png"),
    fetchBuffer("company-stamp.png"),
  ]);

  return { header, footer, signature, stamp };
}

type StyledSpan = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
};

function parseStyledText(rawHtmlOrMd: string): StyledSpan[] {
  let text = rawHtmlOrMd;

  // Convert HTML rupee entities if any
  text = text.replace(/&rupee;|&inr;|&#8377;/gi, "₹");

  // Convert line break tags
  text = text.replace(/<br\s*\/?>/gi, " ");

  // Remove markdown backslash escapes before symbols (e.g. \= -> =, \- -> -, \/ -> /)
  text = text.replace(/\\([=\-_*~`[\](){}+.!#\/\\])/g, "$1");

  // Normalize HTML bold/italic/underline tags to sentinel markers
  const BOLD_ON = "\x02",
    BOLD_OFF = "\x03";
  const ITALIC_ON = "\x04",
    ITALIC_OFF = "\x05";
  const UNDERLINE_ON = "\x06",
    UNDERLINE_OFF = "\x07";

  // Clean empty markdown markers like **** or ____
  text = text.replace(/\*{4,}/g, "").replace(/_{4,}/g, "");

  text = text
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, `${BOLD_ON}$1${BOLD_OFF}`)
    .replace(/<b>([\s\S]*?)<\/b>/gi, `${BOLD_ON}$1${BOLD_OFF}`)
    .replace(/<em>([\s\S]*?)<\/em>/gi, `${ITALIC_ON}$1${ITALIC_OFF}`)
    .replace(/<i>([\s\S]*?)<\/i>/gi, `${ITALIC_ON}$1${ITALIC_OFF}`)
    .replace(/<u>([\s\S]*?)<\/u>/gi, `${UNDERLINE_ON}$1${UNDERLINE_OFF}`)
    .replace(/<ins>([\s\S]*?)<\/ins>/gi, `${UNDERLINE_ON}$1${UNDERLINE_OFF}`)
    .replace(/<[^>]+>/g, ""); // strip remaining HTML tags

  text = decodeHtmlEntities(text);

  // Markdown bold & italic markers
  text = text
    .replace(/\*\*([\s\S]*?)\*\*/g, `${BOLD_ON}$1${BOLD_OFF}`)
    .replace(/__([\s\S]*?)__/g, `${BOLD_ON}$1${BOLD_OFF}`)
    .replace(/\*([\s\S]*?)\*/g, `${ITALIC_ON}$1${ITALIC_OFF}`)
    .replace(/_([\s\S]*?)_/g, `${ITALIC_ON}$1${ITALIC_OFF}`);

  const spans: StyledSpan[] = [];
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let buf = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === BOLD_ON) {
      if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });
      buf = "";
      isBold = true;
    } else if (ch === BOLD_OFF) {
      if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });
      buf = "";
      isBold = false;
    } else if (ch === ITALIC_ON) {
      if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });
      buf = "";
      isItalic = true;
    } else if (ch === ITALIC_OFF) {
      if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });
      buf = "";
      isItalic = false;
    } else if (ch === UNDERLINE_ON) {
      if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });
      buf = "";
      isUnderline = true;
    } else if (ch === UNDERLINE_OFF) {
      if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });
      buf = "";
      isUnderline = false;
    } else {
      buf += ch;
    }
  }
  if (buf) spans.push({ text: buf, bold: isBold, italic: isItalic, underline: isUnderline });

  return spans;
}

function splitContentIntoLines(content: string): string[] {
  if (!content) return [];
  const normalized = content
    // Convert line breaks and closing block tags to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    // Remove opening block tags
    .replace(/<(p|div|h[1-6]|ul|ol|li)\b[^>]*>/gi, "");

  const raw = normalized.split("\n");
  const lines: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
      .replace(/\\([=\-_*~`[\](){}+.!#\/\\])/g, "$1")
      .trim();
    const stripped = decodeHtmlEntities(line.replace(/<[^>]+>/g, "")).trim();

    if (!stripped) {
      // Only keep a single empty line between content blocks
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      continue;
    }

    lines.push(line);
  }

  return lines;
}

async function generateLetterPdf(
  data: any,
  preloadedAssets?: LetterAssetBuffers | null,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const assets = preloadedAssets || (await getLetterAssetBuffers());
  const headerImg = assets?.header
    ? await pdfDoc.embedPng(assets.header).catch(() => null)
    : null;
  const footerImg = assets?.footer
    ? await pdfDoc.embedPng(assets.footer).catch(() => null)
    : null;
  const sigImg = assets?.signature
    ? await pdfDoc.embedPng(assets.signature).catch(() => null)
    : null;
  const stampImg = assets?.stamp
    ? await pdfDoc.embedPng(assets.stamp).catch(() => null)
    : null;

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const baseFontSize = Number(data.font_size) || 10;

  let currentPage: PDFPage;
  let currentY = pageHeight - margin;

  const drawHeader = (page: PDFPage) => {
    if (data.include_letter_header || data.include_letter_head) {
      if (headerImg) {
        const headerScale = pageWidth / headerImg.width;
        const headerHeight = headerImg.height * headerScale;
        page.drawImage(headerImg, {
          x: 0,
          y: pageHeight - headerHeight,
          width: pageWidth,
          height: headerHeight,
        });
        return pageHeight - headerHeight - 40;
      }
    }
    return pageHeight - margin;
  };

  const drawFooter = (page: PDFPage) => {
    if (data.include_letter_footer && footerImg) {
      const footerScale = pageWidth / footerImg.width;
      const footerHeight = footerImg.height * footerScale;
      page.drawImage(footerImg, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: footerHeight,
      });
    }
  };

  let isSalaryStructurePage = false;
  let pageCount = 0;

  const addNewPage = (skipHeaderFooter = false) => {
    pageCount++;
    currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    if (skipHeaderFooter || isSalaryStructurePage) {
      currentY = pageHeight - margin - 10;
    } else {
      if (pageCount === 1) {
        currentY = drawHeader(currentPage);
        drawFooter(currentPage);
      } else {
        currentY = pageHeight - margin - 10;
      }
    }
    return currentPage;
  };

  const ensureSpace = (neededHeight: number) => {
    const bottomLimit =
      pageCount === 1 && !isSalaryStructurePage && data.include_letter_footer && footerImg
        ? (pageWidth / footerImg.width) * footerImg.height + 25
        : margin;
    if (currentY - neededHeight < bottomLimit) {
      addNewPage();
    }
  };

const RUPEE_SVG_PATH =
  "M 50 0 L 450 0 L 450 70 L 290 70 C 335 105 360 155 365 210 L 450 210 L 450 280 L 365 280 C 350 380 270 455 160 470 L 440 800 L 330 800 L 60 480 L 60 425 L 155 425 C 225 420 285 365 290 280 L 60 280 L 60 210 L 290 210 C 285 145 230 95 155 95 L 60 95 L 60 0 Z";

function drawRupeeSymbol(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  isBold = false,
  color = rgb(0, 0, 0),
) {
  const glyphHeight = size * 0.70;
  const scale = glyphHeight / 800;
  page.drawSvgPath(RUPEE_SVG_PATH, {
    x: x - 50 * scale,
    y: y + glyphHeight,
    scale,
    color,
    borderColor: isBold ? color : undefined,
    borderWidth: isBold ? 0.35 * (size / 10) : 0,
  });
}

  const drawRichParagraph = (
    rawLine: string,
    opts: {
      fontSize?: number;
      lineHeight?: number;
      align?: "left" | "center" | "right";
      indent?: number;
      prefix?: string;
      hangingIndent?: number;
    } = {},
  ) => {
    const fontSize = opts.fontSize ?? baseFontSize;
    const lineHeight = opts.lineHeight ?? fontSize * 1.55;
    const isCentered =
      opts.align === "center" ||
      /\$\{center\}/i.test(rawLine) ||
      /<center\b/i.test(rawLine) ||
      /text-align:\s*center/i.test(rawLine) ||
      /align=["']center["']/i.test(rawLine);
    let clean = rawLine
      .replace(/\$\{center\}/gi, "")
      .replace(/<center\b[^>]*>/gi, "")
      .replace(/<\/center>/gi, "");

    const isAddress = clean.includes("${address}");
    if (isAddress) {
      clean = clean.replace(/\$\{address\}/g, "").toUpperCase();
    }
    const indent = opts.indent ?? (isAddress ? 25 : 0);
    const hangingIndent = opts.hangingIndent ?? 0;
    const maxW = contentWidth - indent - hangingIndent;

    const spans = parseStyledText(clean);
    if (spans.length === 0 && !opts.prefix) return;

    // Tokenize into words, ₹ symbols, and whitespace
    const words: Array<{
      text: string;
      bold: boolean;
      italic: boolean;
      underline: boolean;
      isRupee?: boolean;
    }> = [];
    for (const span of spans) {
      const parts = span.text.split(/(₹|\s+)/);
      for (const p of parts) {
        if (p === "₹") {
          words.push({
            text: "₹",
            bold: span.bold,
            italic: span.italic,
            underline: Boolean(span.underline),
            isRupee: true,
          });
        } else if (p) {
          words.push({
            text: p,
            bold: span.bold,
            italic: span.italic,
            underline: Boolean(span.underline),
            isRupee: false,
          });
        }
      }
    }

    // Word wrap into lines
    const lines: Array<{
      items: Array<{
        text: string;
        font: PDFFont;
        width: number;
        underline: boolean;
        isRupee?: boolean;
        isBold?: boolean;
      }>;
      width: number;
    }> = [];
    let curItems: Array<{
      text: string;
      font: PDFFont;
      width: number;
      underline: boolean;
      isRupee?: boolean;
      isBold?: boolean;
    }> = [];
    let curLineWidth = 0;

    for (const w of words) {
      const font = w.bold ? fontBold : w.italic ? fontItalic : fontRegular;

      if (w.isRupee) {
        const rupeeW = fontSize * 0.46;
        if (curLineWidth + rupeeW <= maxW || curItems.length === 0) {
          curItems.push({
            text: "₹",
            font,
            width: rupeeW,
            underline: w.underline,
            isRupee: true,
            isBold: w.bold,
          });
          curLineWidth += rupeeW;
        } else {
          lines.push({ items: curItems, width: curLineWidth });
          curItems = [
            {
              text: "₹",
              font,
              width: rupeeW,
              underline: w.underline,
              isRupee: true,
              isBold: w.bold,
            },
          ];
          curLineWidth = rupeeW;
        }
        continue;
      }

      const safeText = sanitizePdfText(w.text);
      if (!safeText && w.text) continue;
      const wWidth = font.widthOfTextAtSize(safeText, fontSize);

      if (curLineWidth + wWidth <= maxW || curItems.length === 0) {
        curItems.push({
          text: safeText,
          font,
          width: wWidth,
          underline: w.underline,
          isRupee: false,
          isBold: w.bold,
        });
        curLineWidth += wWidth;
      } else if (safeText.trim() === "") {
        continue;
      } else {
        lines.push({ items: curItems, width: curLineWidth });
        curItems = [
          {
            text: safeText,
            font,
            width: wWidth,
            underline: w.underline,
            isRupee: false,
            isBold: w.bold,
          },
        ];
        curLineWidth = wWidth;
      }
    }
    if (curItems.length > 0) {
      lines.push({ items: curItems, width: curLineWidth });
    }

    // Trim trailing whitespace items from each line so underline doesn't overhang
    for (const line of lines) {
      while (
        line.items.length > 0 &&
        line.items[line.items.length - 1].text.trim() === ""
      ) {
        const removed = line.items.pop();
        if (removed) line.width -= removed.width;
      }
    }

    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const line = lines[lIdx];
      ensureSpace(lineHeight);
      let startX = margin + indent;
      if (isCentered) {
        startX = margin + indent + Math.max(0, (maxW - line.width) / 2);
      } else if (hangingIndent > 0) {
        if (lIdx === 0 && opts.prefix) {
          const prefixFont = fontBold;
          const safePrefix = sanitizePdfText(opts.prefix);
          currentPage.drawText(safePrefix, {
            x: margin + indent,
            y: currentY,
            size: fontSize,
            font: prefixFont,
            color: rgb(0, 0, 0),
          });
        }
        startX = margin + indent + hangingIndent;
      }

      let curX = startX;
      for (const item of line.items) {
        if (item.isRupee) {
          drawRupeeSymbol(currentPage, curX, currentY, fontSize, item.isBold, rgb(0, 0, 0));
          if (item.underline) {
            currentPage.drawLine({
              start: { x: curX, y: currentY - 1.5 },
              end: { x: curX + item.width, y: currentY - 1.5 },
              thickness: 0.8,
              color: rgb(0, 0, 0),
            });
          }
          curX += item.width;
        } else {
          currentPage.drawText(item.text, {
            x: curX,
            y: currentY,
            size: fontSize,
            font: item.font,
            color: rgb(0, 0, 0),
          });
          if (item.underline) {
            currentPage.drawLine({
              start: { x: curX, y: currentY - 1.5 },
              end: { x: curX + item.width, y: currentY - 1.5 },
              thickness: 0.8,
              color: rgb(0, 0, 0),
            });
          }
          curX += item.width;
        }
      }
      currentY -= lineHeight;
    }
  };

  const drawSignatures = (hasSignatory: boolean, hasEmpSig: boolean) => {
    ensureSpace(130);
    currentY -= 36;
    const sigStartY = currentY;

    if (hasSignatory && hasEmpSig) {
      const colWidthHalf = (contentWidth - 20) / 2;
      const leftX = margin;
      const rightX = margin + colWidthHalf + 20;

      // Left: Company Signatory
      currentPage.drawText("Yours truly,", {
        x: leftX,
        y: sigStartY,
        size: baseFontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
        x: leftX,
        y: sigStartY - 15,
        size: baseFontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      let nextLeftY = sigStartY - 30;
      if (sigImg || stampImg) {
        const sigTopY = sigStartY - 30;
        let lowestY = sigTopY;

        if (sigImg) {
          const sigW = 120;
          const sigH = (sigW / sigImg.width) * sigImg.height;
          const sigDrawY = sigTopY - sigH;
          currentPage.drawImage(sigImg, {
            x: leftX + 5,
            y: sigDrawY,
            width: sigW,
            height: sigH,
          });
          lowestY = Math.min(lowestY, sigDrawY);
        }

        if (stampImg) {
          const stampW = 60;
          const stampH = (stampW / stampImg.width) * stampImg.height;
          const stampDrawY = sigTopY - stampH;
          currentPage.drawImage(stampImg, {
            x: leftX + 90,
            y: stampDrawY,
            width: stampW,
            height: stampH,
            opacity: 0.95,
          });
          lowestY = Math.min(lowestY, stampDrawY);
        }

        nextLeftY = lowestY - 14;
      } else {
        nextLeftY = sigStartY - 55;
      }

      currentPage.drawText("Director", {
        x: leftX,
        y: nextLeftY,
        size: baseFontSize,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // Right: Employee Signatory
      const emp = data.employees;
      const empName = emp
        ? [emp.first_name, emp.last_name]
            .filter(Boolean)
            .join(" ")
            .toUpperCase()
        : "";
      currentPage.drawText("I accept the contract of employment", {
        x: rightX,
        y: sigStartY,
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText("_______________________________", {
        x: rightX,
        y: sigStartY - 32,
        size: 8.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText(empName, {
        x: rightX,
        y: sigStartY - 50,
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText(
        `Date: ${formatDateToSlash(data.date ?? new Date())}`,
        {
          x: rightX,
          y: sigStartY - 66,
          size: 8.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        },
      );

      currentY = Math.min(nextLeftY - 15, sigStartY - 80);
    } else if (hasSignatory) {
      currentPage.drawText("Yours truly,", {
        x: margin,
        y: sigStartY,
        size: baseFontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
        x: margin,
        y: sigStartY - 15,
        size: baseFontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      let nextY = sigStartY - 30;
      if (sigImg || stampImg) {
        const sigTopY = sigStartY - 30;
        let lowestY = sigTopY;

        if (sigImg) {
          const sigW = 125;
          const sigH = (sigW / sigImg.width) * sigImg.height;
          const sigDrawY = sigTopY - sigH;
          currentPage.drawImage(sigImg, {
            x: margin + 10,
            y: sigDrawY,
            width: sigW,
            height: sigH,
          });
          lowestY = Math.min(lowestY, sigDrawY);
        }

        if (stampImg) {
          const stampW = 65;
          const stampH = (stampW / stampImg.width) * stampImg.height;
          const stampDrawY = sigTopY - stampH;
          currentPage.drawImage(stampImg, {
            x: margin + 100,
            y: stampDrawY,
            width: stampW,
            height: stampH,
            opacity: 0.95,
          });
          lowestY = Math.min(lowestY, stampDrawY);
        }

        nextY = lowestY - 14;
      } else {
        nextY = sigStartY - 55;
      }

      currentPage.drawText("Director", {
        x: margin,
        y: nextY,
        size: baseFontSize,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      currentY = nextY - 15;
    } else if (hasEmpSig) {
      const emp = data.employees;
      const empName = emp
        ? [emp.first_name, emp.last_name]
            .filter(Boolean)
            .join(" ")
            .toUpperCase()
        : "";
      currentPage.drawText("I accept the contract of employment", {
        x: margin,
        y: sigStartY,
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText("_______________________________", {
        x: margin,
        y: sigStartY - 24,
        size: 8.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText(empName, {
        x: margin,
        y: sigStartY - 40,
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentPage.drawText(
        `Date: ${formatDateToSlash(data.date ?? new Date())}`,
        {
          x: margin,
          y: sigStartY - 54,
          size: 8.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        },
      );
      currentY = sigStartY - 70;
    }
  };

  const drawSalaryStructureDoc = () => {
    const salaryData = data.salary_structure_data;
    const emp = data.employees;
    if (!salaryData) return;

    // Reset Y to top margin area for Salary Structure page
    currentY -= 6;

    // Title: SALARY - STRUCTURE LETTER (Centered, Underlined, Bold)
    const titleText = "SALARY - STRUCTURE LETTER";
    const titleSize = 11;
    const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
    const titleX = margin + (contentWidth - titleW) / 2;
    currentPage.drawText(titleText, {
      x: titleX,
      y: currentY,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentPage.drawLine({
      start: { x: titleX, y: currentY - 2 },
      end: { x: titleX + titleW, y: currentY - 2 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });
    currentY -= 22;

    // Salutation & Date
    const salutation =
      emp?.gender?.toLowerCase() === "female"
        ? emp?.marital_status?.toLowerCase() === "married"
          ? "Mrs."
          : "Ms."
        : "Mr.";
    const empFullName = emp
      ? `${salutation} ${[emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ")}`.trim()
      : "Not Found";
    const rawEmpName = emp
      ? [emp.first_name, emp.last_name].filter(Boolean).join(" ").toUpperCase()
      : "";
    const formattedDate = formatDateToSlash(data.date ?? new Date());

    const dearText = `Dear ${empFullName}`;
    const dateText = `Date: ${formattedDate}`;
    const dateW = fontBold.widthOfTextAtSize(dateText, 8.5);

    currentPage.drawText(dearText, {
      x: margin,
      y: currentY,
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(dateText, {
      x: pageWidth - margin - dateW,
      y: currentY,
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentY -= 14;

    // Ref:
    let refString = emp?.company_name || "Not Found";

    currentPage.drawText("Ref:", {
      x: margin,
      y: currentY,
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    const refPrefixW = fontBold.widthOfTextAtSize("Ref: ", 8.5);
    const safeRefStr = sanitizePdfText(refString);
    currentPage.drawText(safeRefStr.slice(0, 85), {
      x: margin + refPrefixW,
      y: currentY,
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentY -= 14;

    // Lead-in paragraph
    drawRichParagraph(
      "Further to your employment with us, your salary for the period of employment with effect Letter to the following:",
      { fontSize: 8.5, lineHeight: 11 },
    );
    currentY -= 16; // One line space before YOUR TOTAL COST OF COMPANY

    // Table Heading: YOUR TOTAL COST OF COMPANY WILL BE AS BELOW:
    const subHeading = "YOUR TOTAL COST OF COMPANY WILL BE AS BELOW:";
    const subW = fontBold.widthOfTextAtSize(subHeading, 8.5);
    currentPage.drawText(subHeading, {
      x: margin + (contentWidth - subW) / 2,
      y: currentY,
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentY -= 14;

    // Data parsing
    const rawEarnings = salaryData.earnings || [];
    const rawDeductions = salaryData.deductions || [];
    const earnings = getSalaryStructureEarnings(rawEarnings);
    const deductions = getSalaryStructureDeductions(rawDeductions);
    const grossAmt = salaryData.grossAmount || 0;
    const netAmt = salaryData.netAmount || 0;
    const employerContrib = salaryData.employerContribution || {};
    const totalCtc = grossAmt + (employerContrib.total || 0);

    const formatAmt = (amount?: number) => {
      if (amount === undefined || amount === null || amount === 0) return "-";
      return `${Math.round(amount).toLocaleString("en-IN")}/-`;
    };

    // Table geometry
    const tblGap = 14;
    const singleTblW = (contentWidth - tblGap) / 2;
    const leftTblX = margin;
    const rightTblX = margin + singleTblW + tblGap;
    const rowH = 14;
    const col1W = singleTblW * 0.52;
    const col2W = singleTblW - col1W;

    const drawSingleRow = (
      tblX: number,
      y: number,
      col1: string,
      col2Symbol: string,
      col2Value: string,
      opts?: {
        isHeader?: boolean;
        isBold?: boolean;
        borderTopThick?: boolean;
        borderBottomThick?: boolean;
      },
    ) => {
      const isHeader = opts?.isHeader ?? false;
      const isBold = opts?.isBold ?? false;
      const font = isHeader || isBold ? fontBold : fontRegular;
      const fontSize = 7.5;

      if (isHeader) {
        const textW = fontBold.widthOfTextAtSize(col1, 8);
        currentPage.drawText(col1, {
          x: tblX + (singleTblW - textW) / 2,
          y: y + 3.5,
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      } else {
        currentPage.drawText(col1.slice(0, 32), {
          x: tblX + 4,
          y: y + 3.5,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });

        if (col2Symbol && col2Symbol !== "-") {
          currentPage.drawText(col2Symbol, {
            x: tblX + col1W + 4,
            y: y + 3.5,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }

        if (col2Value) {
          const valW = font.widthOfTextAtSize(col2Value, fontSize);
          const valX =
            col2Symbol === "-" && col2Value === "-"
              ? tblX + col1W + (col2W - valW) / 2
              : tblX + singleTblW - valW - 4;
          currentPage.drawText(col2Value, {
            x: valX,
            y: y + 3.5,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }

      // Horizontal lines
      currentPage.drawLine({
        start: { x: tblX, y: y + rowH },
        end: { x: tblX + singleTblW, y: y + rowH },
        thickness: opts?.borderTopThick ? 1 : 0.5,
        color: rgb(0, 0, 0),
      });
      currentPage.drawLine({
        start: { x: tblX, y: y },
        end: { x: tblX + singleTblW, y: y },
        thickness: opts?.borderBottomThick ? 1 : 0.5,
        color: rgb(0, 0, 0),
      });
      // Outer vertical lines
      currentPage.drawLine({
        start: { x: tblX, y: y },
        end: { x: tblX, y: y + rowH },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      currentPage.drawLine({
        start: { x: tblX + singleTblW, y: y },
        end: { x: tblX + singleTblW, y: y + rowH },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      // Inner column line (1 vertical divider line)
      if (!isHeader) {
        currentPage.drawLine({
          start: { x: tblX + col1W, y: y },
          end: { x: tblX + col1W, y: y + rowH },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
    };

    const employerRows = [
      {
        name: "PF Employer",
        symbol: "Rs.",
        amount: formatAmt(
          employerContrib.totalPfLiability || employerContrib.pfTotal,
        ),
      },
      {
        name: "ESIC Employer",
        symbol: "Rs.",
        amount: formatAmt(employerContrib.esi),
      },
      {
        name: "WC Policy",
        symbol: "-",
        amount: "-",
      },
    ];

    let startY = currentY - rowH;

    // Headers
    drawSingleRow(leftTblX, startY, "NET SALARY", "", "", { isHeader: true });
    drawSingleRow(rightTblX, startY, "CTC/GROSS", "", "", { isHeader: true });
    startY -= rowH;

    // Earnings
    for (let i = 0; i < earnings.length; i++) {
      const earn = earnings[i];
      const earnName = earn.name || "Allowance";
      const earnAmt = formatAmt(earn.amount);

      drawSingleRow(leftTblX, startY, earnName, "Rs.", earnAmt);
      drawSingleRow(rightTblX, startY, earnName, "Rs.", earnAmt);
      startY -= rowH;
    }

    // Gross Salary
    drawSingleRow(
      leftTblX,
      startY,
      "Gross Salary",
      "Rs.",
      formatAmt(grossAmt),
      { isBold: true, borderTopThick: true, borderBottomThick: true },
    );
    drawSingleRow(
      rightTblX,
      startY,
      "Gross Salary",
      "Rs.",
      formatAmt(grossAmt),
      { isBold: true, borderTopThick: true, borderBottomThick: true },
    );
    startY -= rowH;

    // Deductions (Left) vs Employer Contrib (Right)
    const maxBottomCount = Math.max(deductions.length, employerRows.length);
    for (let i = 0; i < maxBottomCount; i++) {
      const ded = deductions[i];
      if (ded) {
        drawSingleRow(
          leftTblX,
          startY,
          ded.name || "Deduction",
          "Rs.",
          formatAmt(ded.amount),
        );
      } else {
        drawSingleRow(leftTblX, startY, "-", "-", "-");
      }

      const empRow = employerRows[i];
      if (empRow) {
        drawSingleRow(
          rightTblX,
          startY,
          empRow.name,
          empRow.symbol,
          empRow.amount,
        );
      } else {
        drawSingleRow(rightTblX, startY, "-", "-", "-");
      }
      startY -= rowH;
    }

    // Final Total Row
    drawSingleRow(leftTblX, startY, "Net Salary", "Rs.", formatAmt(netAmt), {
      isBold: true,
      borderTopThick: true,
    });
    drawSingleRow(
      rightTblX,
      startY,
      "Total Gross C.T.C",
      "Rs.",
      formatAmt(totalCtc),
      { isBold: true, borderTopThick: true },
    );
    startY -= rowH;

    currentY = startY - 14;

    // Text notices
    drawRichParagraph("The net salary is subject to Income Tax", {
      fontSize: 8,
    });
    currentY -= 4;

    drawRichParagraph(
      "All other terms and conditions as per your Work Assignment Letter & Letter of Engagement Remain unchanged until further notice. You may sign a copy of this letter and return it back to Us as an unconditional token of acceptance.",
      { fontSize: 8, lineHeight: 11 },
    );
    currentY -= 20;

    // Signatures
    const sigStartY = currentY;
    const colWidthHalf = (contentWidth - 20) / 2;
    const sigLeftX = margin;
    const sigRightX = margin + colWidthHalf + 20;

    // Left: Company Signatory
    currentPage.drawText(`For, ${CANNY_MANAGEMENT_SERVICES_NAME}`, {
      x: sigLeftX,
      y: sigStartY,
      size: 8,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    let nextLeftY = sigStartY - 16;
    if (sigImg || stampImg) {
      const sigTopY = sigStartY - 16;
      let lowestY = sigTopY;

      if (sigImg) {
        const sigW = 110;
        const sigH = (sigW / sigImg.width) * sigImg.height;
        const sigDrawY = sigTopY - sigH;
        currentPage.drawImage(sigImg, {
          x: sigLeftX + 5,
          y: sigDrawY,
          width: sigW,
          height: sigH,
        });
        lowestY = Math.min(lowestY, sigDrawY);
      }

      if (stampImg) {
        const stampW = 55;
        const stampH = (stampW / stampImg.width) * stampImg.height;
        const stampDrawY = sigTopY - stampH;
        currentPage.drawImage(stampImg, {
          x: sigLeftX + 85,
          y: stampDrawY,
          width: stampW,
          height: stampH,
          opacity: 0.95,
        });
        lowestY = Math.min(lowestY, stampDrawY);
      }

      nextLeftY = lowestY - 10;
    } else {
      nextLeftY = sigStartY - 45;
    }

    currentPage.drawText("Authorized Signatory", {
      x: sigLeftX,
      y: nextLeftY,
      size: 8,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Right: Employee Signatory
    currentPage.drawText(
      "I accept the contract of employment with the terms and conditions",
      {
        x: sigRightX,
        y: sigStartY,
        size: 7.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      },
    );
    currentPage.drawText("Contained thereto", {
      x: sigRightX,
      y: sigStartY - 10,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    if (rawEmpName) {
      const empNameW = fontBold.widthOfTextAtSize(rawEmpName, 8);
      currentPage.drawText(rawEmpName, {
        x: sigRightX + (colWidthHalf - empNameW) / 2,
        y: sigStartY - 38,
        size: 8,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    const sigDateText = "(Signature & Date)";
    const sigDateW = fontRegular.widthOfTextAtSize(sigDateText, 7.5);
    currentPage.drawText(sigDateText, {
      x: sigRightX + (colWidthHalf - sigDateW) / 2,
      y: sigStartY - 54,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    currentY = Math.min(nextLeftY - 10, sigStartY - 65);
  };

  // Start with first page
  addNewPage();

  // 1. Draw Date (top right, matching reference style: Date:- DD/MM/YYYY)
  const dateStr = formatDateToSlash(data.date ?? new Date());
  const datePrefix = "Date:- ";
  const prefixW = fontBold.widthOfTextAtSize(datePrefix, baseFontSize);
  const dateW = fontRegular.widthOfTextAtSize(dateStr, baseFontSize);
  const totalW = prefixW + dateW;
  const dateStartX = pageWidth - margin - totalW;

  currentPage.drawText(datePrefix, {
    x: dateStartX,
    y: currentY,
    size: baseFontSize,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  currentPage.drawText(dateStr, {
    x: dateStartX + prefixW,
    y: currentY,
    size: baseFontSize,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  // 2. Separate salaryStructure from main letter pages
  const rawContent = data.content || "";
  const hasSalaryStructure = Boolean(
    (data.include_salary_structure ||
      (data as any).includeSalaryStructure ||
      rawContent.includes("${salaryStructure}")) &&
      data.salary_structure_data,
  );

  const cleanContent = rawContent.replace(
    /(?:<p>)?\s*(?:<[^>]+>|\*\*)*\$\{(?:<[^>]+>)*\s*salaryStructure\s*(?:<[^>]+>)*\}(?:<[^>]+>|\*\*)*\s*(?:<\/p>)?/gi,
    "",
  ).trim();

  // Split pages by pagebreak token
  const pages = cleanContent.split(
    /(?:<p>)?\s*(?:<[^>]+>|\*\*)*\$\{(?:<[^>]+>)*\s*pagebreak\s*(?:<[^>]+>)*\}(?:<[^>]+>|\*\*)*\s*(?:<\/p>)?/gi,
  );

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    if (pIdx > 0) {
      addNewPage();
    }

    const pageContent = pages[pIdx];
    const rawLines = splitContentIntoLines(pageContent);

    let insideTable = false;
    let tableRowsData: string[][] = [];
    let inRecipientBlock = pIdx === 0;
    let activeListItemIndent = 0;

    const flushTable = () => {
      if (tableRowsData.length === 0) return;
      const numCols = Math.max(...tableRowsData.map((r) => r.length), 1);
      const colW = contentWidth / numCols;
      const rowHeight = 16;

      for (let rIdx = 0; rIdx < tableRowsData.length; rIdx++) {
        const row = tableRowsData[rIdx];
        ensureSpace(rowHeight);

        if (rIdx === 0) {
          currentPage.drawRectangle({
            x: margin,
            y: currentY - 3,
            width: contentWidth,
            height: rowHeight,
            color: rgb(0.95, 0.95, 0.95),
          });
        }

        for (let cIdx = 0; cIdx < row.length; cIdx++) {
          const cellText = sanitizePdfText(
            row[cIdx].replace(/<[^>]+>/g, "").replace(/\*\*/g, ""),
          );
          const cellX = margin + cIdx * colW + 4;
          const fontToUse = rIdx === 0 ? fontBold : fontRegular;
          currentPage.drawText(cellText.slice(0, 45), {
            x: cellX,
            y: currentY + 1,
            size: 8,
            font: fontToUse,
            color: rgb(0, 0, 0),
          });

          if (cIdx > 0) {
            currentPage.drawLine({
              start: { x: margin + cIdx * colW, y: currentY - 3 },
              end: { x: margin + cIdx * colW, y: currentY - 3 + rowHeight },
              thickness: 0.5,
              color: rgb(0.8, 0.8, 0.8),
            });
          }
        }

        currentPage.drawLine({
          start: { x: margin, y: currentY - 3 },
          end: { x: margin + contentWidth, y: currentY - 3 },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });

        currentY -= rowHeight;
      }
      currentY -= 6;
      tableRowsData = [];
      insideTable = false;
    };

    for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
      const rawLine = rawLines[lIdx].trim();

      if (rawLine.startsWith("|")) {
        insideTable = true;
        const cells = rawLine
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const isSeparator = cells.every((c) => c.match(/^:?-+:?$/));
        if (!isSeparator && cells.length > 0) {
          tableRowsData.push(cells);
        }
        continue;
      } else if (insideTable) {
        flushTable();
      }

      // Check if line is empty / whitespace / entity-only spacer
      const stripped = decodeHtmlEntities(
        rawLine.replace(/<[^>]+>/g, ""),
      ).trim();
      if (!stripped) {
        if (!inRecipientBlock) {
          activeListItemIndent = 0;
          currentY -= Math.max(8, baseFontSize * 0.85);
        }
        continue;
      }

      if (rawLine.includes("${salaryStructure}")) {
        continue;
      }

      const hasSignatureToken =
        /\$\{signature((?::[0-2])*)?\}/.test(rawLine) ||
        rawLine.includes("${employeeSignatureWithName}") ||
        rawLine.includes("${employeeSignatureWithLetterName}") ||
        rawLine.includes("${employeeSignature}");

      if (hasSignatureToken) {
        activeListItemIndent = 0;
        inRecipientBlock = false;
        const hasSig =
          /\$\{signature((?::[0-2])*)?\}/.test(rawLine) ||
          Boolean(data.include_signatuory);
        const hasEmpSig =
          rawLine.includes("${employeeSignature}") ||
          rawLine.includes("${employeeSignatureWithName}") ||
          rawLine.includes("${employeeSignatureWithLetterName}") ||
          Boolean(data.include_employee_signature);

        drawSignatures(hasSig, hasEmpSig);
        continue;
      }

      if (rawLine.startsWith("#")) {
        activeListItemIndent = 0;
        inRecipientBlock = false;
        const headingText = rawLine.replace(/^#+\s*/, "");
        ensureSpace(24);
        currentY -= 12;
        drawRichParagraph(headingText, {
          fontSize: 11,
          align: rawLine.includes("${center}") ? "center" : "left",
        });
        currentY -= 12;
        continue;
      }

      const isCenteredLine =
        /\$\{center\}/i.test(rawLine) ||
        /<center\b/i.test(rawLine) ||
        /text-align:\s*center/i.test(rawLine) ||
        /align=["']center["']/i.test(rawLine);

      if (isCenteredLine) {
        activeListItemIndent = 0;
        inRecipientBlock = false;
        ensureSpace(24);
        currentY -= 14;
        drawRichParagraph(rawLine, {
          fontSize: baseFontSize,
          align: "center",
          lineHeight: baseFontSize * 1.4,
        });
        currentY -= 16;
        continue;
      }

      const isSalutationOrBody =
        stripped.length > 70 ||
        /^(dear\b|subject\s*:|to whom|with reference|this has reference|we are pleased|with the following)/i.test(
          stripped,
        );

      if (inRecipientBlock) {
        activeListItemIndent = 0;
        if (isSalutationOrBody) {
          inRecipientBlock = false;
          // Clean distinct gap before salutation / subject / body (matching reference image)
          currentY -= Math.max(18, baseFontSize * 1.8);
        } else {
          drawRichParagraph(rawLine, {
            fontSize: baseFontSize,
            lineHeight: baseFontSize * 1.25,
          });
          continue;
        }
      }

      // Check for numbered lists (e.g. "1.  POSTING...", "2)  PROBATION...", "a.  ...") or bullets ("* ", "- ", "• ")
      const cleanForList = rawLine
        .replace(/^(?:<p\b[^>]*>|<span\b[^>]*>|<strong>|<b>)+/i, "")
        .trim();

      const listMatch = cleanForList.match(
        /^(\d{1,2}[\.\)]|[a-zA-Z][\.\)]|[*•-])(?:\s|&nbsp;|\t)+([\s\S]+)$/i,
      );

      if (listMatch) {
        const rawPrefix = listMatch[1];
        const itemContent = listMatch[2].trim();
        const isBullet = /^[*•-]$/.test(rawPrefix);
        const displayPrefix = isBullet ? "-" : rawPrefix;
        const hangingIndent = isBullet ? 16 : 22;
        activeListItemIndent = hangingIndent;

        drawRichParagraph(itemContent, {
          fontSize: baseFontSize,
          prefix: displayPrefix,
          hangingIndent: hangingIndent,
          lineHeight: baseFontSize * 1.35,
        });
        currentY -= 4;
        continue;
      }

      const isSalutation =
        /^(dear\b|mr\.|mrs\.|ms\.|dr\.)/i.test(stripped) &&
        stripped.length < 50;

      const isShortGreeting =
        /^(congratulations!?|greetings!?)/i.test(stripped) &&
        stripped.length < 30;

      if (activeListItemIndent > 0) {
        if (
          isSalutation ||
          /^(with reference|dear\b|this has reference|we are pleased|with the following|subject\s*:)/i.test(
            stripped,
          )
        ) {
          activeListItemIndent = 0;
        } else {
          drawRichParagraph(rawLine, {
            fontSize: baseFontSize,
            indent: activeListItemIndent,
            lineHeight: baseFontSize * 1.35,
          });
          currentY -= 4;
          continue;
        }
      }

      drawRichParagraph(rawLine, {
        fontSize: baseFontSize,
        lineHeight: baseFontSize * 1.35,
      });

      if (isSalutation || isShortGreeting) {
        currentY -= 6;
      } else if (
        /^(with the following|pay\s*:)/i.test(stripped) ||
        stripped.endsWith(":")
      ) {
        currentY -= 6;
      } else {
        currentY -= 2;
      }
    }

    if (insideTable) {
      flushTable();
    }
  }

  // Draw main letter signatures at the end of the main letter pages
  const contentHasSig =
    /\$\{signature((?::[0-2])*)?\}/.test(cleanContent) ||
    cleanContent.includes("${employeeSignatureWithName}") ||
    cleanContent.includes("${employeeSignatureWithLetterName}") ||
    cleanContent.includes("${employeeSignature}");

  if (
    !contentHasSig &&
    (data.include_signatuory ||
      (data as any).includeSignatuory ||
      data.include_employee_signature ||
      (data as any).includeEmployeeSignature)
  ) {
    drawSignatures(
      Boolean(data.include_signatuory ?? (data as any).includeSignatuory),
      Boolean(
        data.include_employee_signature ??
          (data as any).includeEmployeeSignature,
      ),
    );
  }

  // Draw salary structure on its dedicated separate page (without letterhead header or footer)
  if (hasSalaryStructure && data.salary_structure_data) {
    isSalaryStructurePage = true;
    addNewPage(true);
    drawSalaryStructureDoc();
  }

  // Draw corner stamp on all main letter pages EXCEPT the last main letter page
  if (stampImg) {
    const allPdfPages = pdfDoc.getPages();
    const lastMainPageIndex =
      hasSalaryStructure && data.salary_structure_data
        ? allPdfPages.length - 2
        : allPdfPages.length - 1;

    const stampW = 60;
    const stampH = (stampW / stampImg.width) * stampImg.height;
    const footerScale = footerImg ? pageWidth / footerImg.width : 0;
    const footerHeight = footerImg ? footerImg.height * footerScale : 0;
    const stampX = pageWidth - margin - stampW - 10;
    const stampY = footerHeight > 0 ? footerHeight + 5 : margin + 10;

    for (let i = 0; i < lastMainPageIndex; i++) {
      allPdfPages[i].drawImage(stampImg, {
        x: stampX,
        y: stampY,
        width: stampW,
        height: stampH,
        opacity: 0.95,
      });
    }
  }

  return pdfDoc.save();
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const { supabase } = getSupabaseWithHeaders({ request });

    const letterId = formData.get("letterId") as string;
    const employeeIdsRaw = formData.get("employeeIds") as string;
    const format = formData.get("format") as string;
    const dateSource = (formData.get("dateSource") as string) || "custom";
    const letterDateRaw = formData.get("letterDate") as string;
    const fallbackDateObj = letterDateRaw
      ? new Date(`${letterDateRaw}T00:00:00`)
      : new Date();

    if (!letterId || !employeeIdsRaw) {
      return json(
        { success: false, message: "Missing required fields" },
        { status: 400 },
      );
    }

    const employeeIds = employeeIdsRaw.split(",");

    const letterTemplate = await getLetterById({ supabase, letterId });

    if (letterTemplate.error || !letterTemplate.data) {
      return json(
        { success: false, message: "Letter template not found" },
        { status: 404 },
      );
    }

    const isPdfFromTemplate = (letterTemplate.data as any).is_pdf ?? true;
    const isPdf = format ? format === "pdf" : isPdfFromTemplate;

    let { data: employees, error } = await getActiveEmployeesByIdsFlat({
      supabase,
      employeeIds,
    });

    if (!employees || employees.length === 0) {
      const { data: rawEmployees } = await supabase
        .from("employees")
        .select(`
          id,
          first_name,
          middle_name,
          last_name,
          gender,
          marital_status,
          employee_code,
          joined_date,
          employee_guardians(
            first_name,
            last_name,
            relationship
          ),
          employee_addresses(
            address_line_1,
            address_line_2,
            city,
            state,
            pincode,
            is_primary
          )
        `)
        .in("id", employeeIds);

      if (rawEmployees && rawEmployees.length > 0) {
        employees = rawEmployees.map((emp) => {
          const primaryAddress =
            emp.employee_addresses?.find((a: any) => a.is_primary) ??
            emp.employee_addresses?.[0];

          const addressLines: string[] = [];
          if (primaryAddress?.address_line_1) {
            addressLines.push(primaryAddress.address_line_1);
          }
          if (primaryAddress?.address_line_2) {
            addressLines.push(primaryAddress.address_line_2);
          }
          const cityState = [primaryAddress?.city, primaryAddress?.state]
            .filter(Boolean)
            .join(", ");
          if (cityState) {
            addressLines.push(cityState);
          }
          if (primaryAddress?.pincode) {
            addressLines.push(`Pin Code -${primaryAddress.pincode}`);
          }

          const formattedAddress =
            addressLines.length > 0 ? addressLines.join("\n") : "";

          return {
            ...emp,
            employee_id: emp.id,
            employee_address: formattedAddress,
          };
        }) as any[];
      }
    }

    if (error && (!employees || employees.length === 0)) {
      return json(
        { success: false, message: "Failed to fetch employees" },
        { status: 500 },
      );
    }

    if (!employees || employees.length === 0) {
      return json(
        {
          success: false,
          message:
            "No employees found with active work detail or active status",
        },
        { status: 400 },
      );
    }

    const generatedFiles = [];
    const assetBuffers = isPdf ? await getLetterAssetBuffers() : null;

    for (const employee of employees) {
      const empId = employee.employee_id || employee.id;
      const salutation =
        employee?.gender?.toLowerCase() === "female"
          ? employee?.marital_status?.toLowerCase() === "married"
            ? "Mrs."
            : "Ms."
          : "Mr.";

      const firstName = employee.first_name || "";
      const fatherGuardian =
        (
          employee.employee_guardians as unknown as
            | { first_name?: string | null; last_name?: string | null; relationship?: string | null }[]
            | undefined
        )?.find(
          (g) => g.relationship?.toLowerCase() === "father",
        ) ?? (employee.employee_guardians as unknown as { first_name?: string | null; last_name?: string | null; relationship?: string | null }[] | undefined)?.[0];

      const guardianFatherName = [
        fatherGuardian?.first_name,
        fatherGuardian?.last_name,
      ]
        .filter(Boolean)
        .join(" ");

      const middleName =
        employee.middle_name ||
        employee.father_name ||
        guardianFatherName ||
        "";
      const fatherName =
        employee.father_name ||
        guardianFatherName ||
        employee.middle_name ||
        employee.last_name ||
        "";
      const lastName = employee.last_name || "";
      const employeeFullName = [firstName, middleName, lastName]
        .filter(Boolean)
        .join(" ");

      const mrMrsFirstNameLastName = `${salutation} ${[firstName, lastName]
        .filter(Boolean)
        .join(" ")}`.trim();

      const mrMrsFirstMiddleLastName = `${salutation} ${employeeFullName}`.trim();

      let pfExitDate = null;
      if (employee.employee_exit_date) {
        pfExitDate = employee.employee_exit_date;
      }

      let resignationDate = null;

      if (pfExitDate) {
        const exit = new Date(pfExitDate);
        exit.setMonth(exit.getMonth() - 1);
        resignationDate = exit.toISOString().split("T")[0];
      }

      const { ctc, gross, basicDa, netPay, breakdown } =
        getLetterSalaryFromAssignment(employee.active_salary_assignment);

      const isFemale = employee?.gender?.toLowerCase() === "female";

      let employeeLetterDateObj = fallbackDateObj;
      if (dateSource === "joining_date") {
        if (employee.joined_date) {
          const d = new Date(`${employee.joined_date}T00:00:00`);
          if (!isNaN(d.getTime())) {
            employeeLetterDateObj = d;
          }
        }
      } else if (dateSource === "exit_date") {
        const exitDateVal = employee.employee_exit_date || employee.exit_date;
        if (exitDateVal) {
          const d = new Date(`${exitDateVal}T00:00:00`);
          if (!isNaN(d.getTime())) {
            employeeLetterDateObj = d;
          }
        }
      }

      const formattedReplacements = {
        employeeName: employeeFullName.toUpperCase(),
        employee_name: employeeFullName.toUpperCase(),
        name: employeeFullName.toUpperCase(),
        firstName: firstName.toUpperCase(),
        first_name: firstName.toUpperCase(),
        lastName: lastName.toUpperCase(),
        last_name: lastName.toUpperCase(),
        middleName: middleName.toUpperCase(),
        middle_name: middleName.toUpperCase(),
        fatherName: fatherName.toUpperCase(),
        father_name: fatherName.toUpperCase(),
        mrMrsFirstNameLastName: mrMrsFirstNameLastName.toUpperCase(),
        mrMrsFirstMiddleLastName: mrMrsFirstMiddleLastName.toUpperCase(),
        he: isFemale ? "SHE" : "HE",
        she: isFemale ? "SHE" : "HE",
        employeeDesignation:
          formatUnderscoreText(employee.position)?.toUpperCase() || "",
        designation:
          formatUnderscoreText(employee.position)?.toUpperCase() || "",
        employeeCode: employee.employee_code || "",
        employee_code: employee.employee_code || "",
        esicNumber: employee.esic_number || "",
        esic_number: employee.esic_number || "",
        joinedDate: formatDateToSlash(employee.joined_date) || "",
        joined_date: formatDateToSlash(employee.joined_date) || "",
        joinedDateOrdinal: formatDateToOrdinal(employee.joined_date) || "",
        joined_date_ordinal: formatDateToOrdinal(employee.joined_date) || "",
        joinedDateFormatted: formatDateToOrdinal(employee.joined_date) || "",
        joined_date_formatted: formatDateToOrdinal(employee.joined_date) || "",
        joinedDateWords: formatDateToOrdinal(employee.joined_date) || "",
        joiningDate: formatDateToOrdinal(employee.joined_date) || "",
        joining_date: formatDateToOrdinal(employee.joined_date) || "",
        joiningDateOrdinal: formatDateToOrdinal(employee.joined_date) || "",
        joining_date_ordinal: formatDateToOrdinal(employee.joined_date) || "",
        employeeJoiningDate: formatDateToOrdinal(employee.joined_date) || "",
        employee_joining_date: formatDateToOrdinal(employee.joined_date) || "",
        employeeJoiningDateOrdinal:
          formatDateToOrdinal(employee.joined_date) || "",
        employee_joining_date_ordinal:
          formatDateToOrdinal(employee.joined_date) || "",
        siteName:
          employee.active_work_details?.sites?.name?.toUpperCase() ||
          employee.site_name?.toUpperCase() ||
          "",
        siteAddress:
          employee.site_address?.replace(/_/g, " ") || "",
        departmentName: employee.department_name?.toUpperCase() || "",
        siteCity: employee.site_city?.toUpperCase() || "",
        companyName:
          CANNY_MANAGEMENT_SERVICES_NAME ||
          employee.company_name?.toUpperCase() ||
          "",
        projectName:
          employee.active_work_details?.projects?.name?.toUpperCase() ||
          employee.project_name?.toUpperCase() ||
          "",
        exitDate: formatDateToSlash(employee.employee_exit_date) || "",
        exitDateOrdinal:
          formatDateToOrdinal(employee.employee_exit_date) || "",
        exit_date_ordinal:
          formatDateToOrdinal(employee.employee_exit_date) || "",
        resignationDate: formatDateToSlash(resignationDate) || "",
        resignationDateOrdinal: formatDateToOrdinal(resignationDate) || "",
        resignation_date_ordinal: formatDateToOrdinal(resignationDate) || "",
        employeeAddress:
          employee.employee_address &&
          employee.employee_address !== "Not Found"
            ? employee.employee_address.replace(/_/g, " ")
            : "",
        todayDate: formatDateToSlash(employeeLetterDateObj) || "",
        todayDateOrdinal: formatDateToOrdinal(employeeLetterDateObj) || "",
        today_date_ordinal: formatDateToOrdinal(employeeLetterDateObj) || "",
        currentMonthYear: formatMonthYearDate(employeeLetterDateObj) || "",
        letterDate: formatDateToSlash(employeeLetterDateObj) || "",
        letterDateOrdinal: formatDateToOrdinal(employeeLetterDateObj) || "",
        letter_date_ordinal: formatDateToOrdinal(employeeLetterDateObj) || "",
        date: formatDateToSlash(employeeLetterDateObj) || "",
        dateOrdinal: formatDateToOrdinal(employeeLetterDateObj) || "",
        date_ordinal: formatDateToOrdinal(employeeLetterDateObj) || "",
        monthlyCtc: Math.round(ctc).toString(),
        monthlyGross: Math.round(gross).toString(),
        monthlyBasicDa: Math.round(basicDa).toString(),
        netPay: Math.round(netPay).toString(),

        grossAmount: breakdown?.grossAmount
          ? `INR ${breakdown.grossAmount}/-`
          : "",
        ctcAmount: breakdown?.totalCostToCompany
          ? `INR ${breakdown.totalCostToCompany}/-`
          : "",
        pfStartDate: formatMonthYearDate(employee.joined_date) || "",
        pfExitDate: formatMonthYearDate(pfExitDate) || "",
        _calcNetPay: (days: number) => {
          const res = getLetterSalaryFromAssignment(
            employee.active_salary_assignment,
            days,
          );
          return Math.round(res.netPay);
        },
      };

      const rawDateReplacements = {
        joinedDate: employee.joined_date,
        joined_date: employee.joined_date,
        employeeJoiningDate: employee.joined_date,
        joiningDate: employee.joined_date,
        exitDate: employee.employee_exit_date,
        exit_date: employee.employee_exit_date,
        resignationDate: resignationDate,
        resignation_date: resignationDate,
        todayDate: employeeLetterDateObj,
        today_date: employeeLetterDateObj,
        letterDate: employeeLetterDateObj,
        letter_date: employeeLetterDateObj,
        date: employeeLetterDateObj,
      };

      const replacedContent = replacePlaceholders(
        letterTemplate.data.content,
        formattedReplacements,
        rawDateReplacements,
      );

      const personalizedLetter = {
        ...letterTemplate.data,
        date: employeeLetterDateObj,
        content: replaceGenderPronouns(replacedContent, employee?.gender),
        salary_structure_data: breakdown,
        employees: employee,
      };

      // Automatically store the generated letter for this employee
      try {
        const formattedDate =
          employeeLetterDateObj && !isNaN(employeeLetterDateObj.getTime())
            ? employeeLetterDateObj.toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

        const { data: insertedData, error: dbError } = await supabase
          .from("employee_letter")
          .insert({
            employee_id: empId,
            letter_type: (letterTemplate.data.letter_type ||
              "appointment_letter") as any,
            subject:
              letterTemplate.data.subject || letterTemplate.data.letter_name,
            content: personalizedLetter.content,
            date: formattedDate,
            include_letter_head:
              (letterTemplate.data as any).include_letter_header ?? false,
            include_employee_address:
              (letterTemplate.data as any).include_employee_address ?? false,
            include_client_address:
              (letterTemplate.data as any).include_client_address ?? false,
            include_our_address:
              (letterTemplate.data as any).include_our_address ?? false,
            include_employee_signature:
              (letterTemplate.data as any).include_employee_signature ?? false,
            include_signatuory:
              (letterTemplate.data as any).include_signatuory ?? false,
          })
          .select();

        if (dbError) {
          console.error("Supabase employee_letter insert error:", dbError);
        }
      } catch (insertErr) {
        console.error("Failed to store employee_letter:", insertErr);
      }

      if (isPdf) {
        const pdfBuffer = await generateLetterPdf(
          personalizedLetter,
          assetBuffers,
        );
        generatedFiles.push({
          filename: `${employeeFullName}_${employee.employee_code}.pdf`,
          buffer: pdfBuffer,
        });
      } else {
        const docxBuffer = await generateDocx(personalizedLetter);
        generatedFiles.push({
          filename: `${employeeFullName}_${employee.employee_code}.docx`,
          buffer: docxBuffer,
        });
      }
    }

    if (generatedFiles.length === 1) {
      const item = generatedFiles[0];
      const contentType = isPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      return new Response(item.buffer as any, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename=${item.filename}`,
          "X-Employee-Count": "1",
        },
      });
    }

    const zip = new JSZip();
    for (const item of generatedFiles) {
      zip.file(item.filename, item.buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=${letterTemplate.data.letter_name}.zip`,
        "X-Employee-Count": employees.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("Generate Letters Error:", error);

    return json(
      {
        success: false,
        message:
          error?.message || "Something went wrong while generating letters",
      },
      { status: 500 },
    );
  }
}
