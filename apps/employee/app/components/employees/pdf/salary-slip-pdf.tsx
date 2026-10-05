import {
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_NAME,
  EPFNO,
  numberToWordsIndian,
  SALARY_SLIP_TITLE,
} from "@/constant";

import {
  formatDate,
  formatNumber,
  replaceUnderscore,
  roundToNearest,
} from "@canny_ecosystem/utils";
import { statesAndUTs } from "@canny_ecosystem/utils/constant";
import type {
  CompanyDatabaseRow,
  EmployeeDatabaseRow,
  EmployeeStatutoryDetailsDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export function formatStateName(state?: string | null): string {
  if (!state) return "";
  const clean = state.trim();
  const matched = statesAndUTs.find(
    (s) =>
      s.value.toLowerCase() === clean.toLowerCase() ||
      s.label.toLowerCase() === clean.toLowerCase() ||
      s.value.replace(/_/g, " ").toLowerCase() === clean.replace(/_/g, " ").toLowerCase(),
  );
  if (matched) return matched.label;

  return clean
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export type DataType = {
  month: string;
  year: number;
  companyData: Partial<CompanyDatabaseRow & LocationDatabaseRow> & {
    company_salary_prefix?: string | null;
    show_employer_contribution?: boolean | null;
  };
  employee: {
    bankDetails: { bank: string; account_number: number | string } | null;
    employeeData: Partial<EmployeeDatabaseRow>;
    employeeProjectAssignmentData: any;
    employeeStatutoryDetails: EmployeeStatutoryDetailsDatabaseRow | null;
    attendance: {
      working_days?: number | null;
      paid_days?: number | null;
      absents?: number | null;
      paid_leaves?: number | null;
      casual_leaves?: number | null;
      overtime_hours?: number | null;
    } | any;
    earnings: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
    employerContributions?: { name: string; amount: number }[];
  };
};

export function sortEarnings<T extends { name: string; amount?: number }>(
  earnings: T[] = [],
): T[] {
  if (!earnings || !Array.isArray(earnings)) return [];

  const getRank = (name: string): number => {
    const clean = (name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    // 0: BASIC (Must always be first)
    if (
      clean === "BASIC" ||
      clean === "BASIC PAY" ||
      clean === "BASIC SALARY" ||
      clean === "BASIC WAGES" ||
      clean.startsWith("BASIC ") ||
      clean.startsWith("BASIC_") ||
      clean.includes("BASIC")
    ) {
      return 0;
    }
    // 1: DA / VDA / Dearness
    if (clean === "DA" || clean === "VDA" || clean.includes("DEARNESS") || clean.includes("VARIABLE DA")) return 1;
    // 2: HRA / House Rent
    if (clean === "HRA" || clean.includes("HOUSE RENT")) return 2;
    // 3: Conveyance / Transport / Travel
    if (clean === "CONVEYANCE" || clean.includes("CONVEYANCE") || clean.includes("TRANSPORT") || clean.includes("TRAVEL")) return 3;
    // 4: Allowances (Special, Other, Education, etc.)
    if (clean.includes("SPECIAL ALLOWANCE") || clean.includes("SPECIAL") || clean.includes("ALLOWANCE")) return 4;
    // 5: Medical
    if (clean.includes("MEDICAL")) return 5;
    // 6: Overtime / OT
    if (clean === "OVERTIME" || clean === "OT" || clean.includes("OVERTIME") || clean.includes("OT AMOUNT")) return 6;
    // 7: Holiday / Paid Holiday / Leave wages
    if (clean.includes("PH WAGE") || clean.includes("HOLIDAY") || clean.includes("LEAVE")) return 7;
    // 8: Bonus / Statutory Bonus / Incentive
    if (clean.includes("BONUS") || clean.includes("INCENTIVE")) return 8;
    // Any others:
    return 100;
  };

  return [...earnings].sort((a, b) => {
    const rankA = getRank(a?.name || "");
    const rankB = getRank(b?.name || "");
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return (a?.name || "").localeCompare(b?.name || "");
  });
}

export function sortDeductions<T extends { name: string; amount?: number }>(
  deductions: T[] = [],
): T[] {
  if (!deductions || !Array.isArray(deductions)) return [];

  const getRank = (name: string): number => {
    const clean = (name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    // 0: PF / EPF / Provident Fund
    if (clean === "PF" || clean === "EPF" || clean.includes("PROVIDENT") || clean.includes("PF ") || clean.startsWith("PF")) return 0;
    // 1: ESI / ESIC
    if (clean === "ESI" || clean === "ESIC" || clean.includes("STATE INSURANCE") || clean.includes("ESI ") || clean.startsWith("ESI")) return 1;
    // 2: PT / Professional Tax
    if (clean === "PT" || clean.includes("PROFESSIONAL TAX") || clean.includes("PROF TAX") || clean.startsWith("PT")) return 2;
    // 3: LWF / Labour Welfare
    if (clean === "LWF" || clean.includes("WELFARE") || clean.includes("LABOUR WELFARE")) return 3;
    // 4: TDS / Income Tax
    if (clean === "TDS" || clean.includes("TAX") || clean.includes("INCOME TAX")) return 4;
    // 5: Advance / Loan / Other
    if (clean.includes("ADVANCE") || clean.includes("LOAN")) return 5;
    return 100;
  };

  return [...deductions].sort((a, b) => {
    const rankA = getRank(a?.name || "");
    const rankB = getRank(b?.name || "");
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return (a?.name || "").localeCompare(b?.name || "");
  });
}

export function sortEmployerContributions<T extends { name: string; amount?: number }>(
  contribs: T[] = [],
): T[] {
  if (!contribs || !Array.isArray(contribs)) return [];

  const getRank = (name: string): number => {
    const clean = (name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    if (clean === "PF" || clean === "EPF" || clean.includes("PROVIDENT") || clean.includes("PF ") || clean.startsWith("PF")) return 0;
    if (clean === "ESI" || clean === "ESIC" || clean.includes("STATE INSURANCE") || clean.includes("ESI ") || clean.startsWith("ESI")) return 1;
    if (clean === "LWF" || clean.includes("WELFARE") || clean.includes("LABOUR WELFARE")) return 2;
    return 100;
  };

  return [...contribs].sort((a, b) => {
    const rankA = getRank(a?.name || "");
    const rankB = getRank(b?.name || "");
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return (a?.name || "").localeCompare(b?.name || "");
  });
}

export function ensureStandardDeductionsAndContribs(
  deductions: { name: string; amount: number }[] = [],
  employerContributions: { name: string; amount: number }[] = [],
) {
  const resultDeductions = [...(deductions || [])];
  const resultContribs = [...(employerContributions || [])];

  const hasPF = resultDeductions.some((d) => {
    const clean = (d?.name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    return (
      clean === "PF" ||
      clean === "EPF" ||
      clean.includes("PROVIDENT") ||
      clean.startsWith("PF")
    );
  });
  if (!hasPF) {
    resultDeductions.push({ name: "PF", amount: 0 });
  }

  const hasESI = resultDeductions.some((d) => {
    const clean = (d?.name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    return (
      clean === "ESI" ||
      clean === "ESIC" ||
      clean.includes("STATE INSURANCE") ||
      clean.startsWith("ESI")
    );
  });
  if (!hasESI) {
    resultDeductions.push({ name: "ESI", amount: 0 });
  }

  const hasPT = resultDeductions.some((d) => {
    const clean = (d?.name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    return (
      clean === "PT" ||
      clean.includes("PROFESSIONAL TAX") ||
      clean.includes("PROF TAX") ||
      clean.startsWith("PT")
    );
  });
  if (!hasPT) {
    resultDeductions.push({ name: "PT", amount: 0 });
  }

  const hasEmployerPF = resultContribs.some((c) => {
    const clean = (c?.name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    return (
      clean === "PF" ||
      clean === "EPF" ||
      clean.includes("PROVIDENT") ||
      clean.startsWith("PF")
    );
  });
  if (!hasEmployerPF) {
    resultContribs.push({ name: "PF", amount: 0 });
  }

  const hasEmployerESIC = resultContribs.some((c) => {
    const clean = (c?.name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
    return (
      clean === "ESI" ||
      clean === "ESIC" ||
      clean.includes("STATE INSURANCE") ||
      clean.startsWith("ESI")
    );
  });
  if (!hasEmployerESIC) {
    resultContribs.push({ name: "ESIC", amount: 0 });
  }

  return {
    deductions: sortDeductions(resultDeductions),
    employerContributions: sortEmployerContributions(resultContribs),
  };
}

export function formatEmployerContribName(name: string): string {
  if (!name) return "";
  const lower = name.trim().toLowerCase();
  if (lower.includes("pf") || lower.includes("provident")) return "PF";
  if (lower.includes("esi") || lower.includes("esic")) return "ESIC";
  if (lower.includes("lwf") || lower.includes("welfare")) return "LWF";
  if (lower.includes("eps")) return "EPS";

  return (
    (name
      .replace(/\s*\([\d.%\s]+\)/g, "")
      .replace(/employer\s*contribution/gi, "")
      .replace(/employer/gi, "")
      .trim() || name).toUpperCase()
  );
}

export function formatEarningName(name: string): string {
  if (!name) return "";
  const clean = name.trim();
  const upper = clean.toUpperCase().replace(/[\s_-]+/g, "_");

  // Normalize Overtime variations to clean standard "OVERTIME"
  if (
    upper.includes("OVERTIME") ||
    upper === "OT" ||
    upper.startsWith("OT_") ||
    upper.endsWith("_OT")
  ) {
    return "OVERTIME";
  }

  return replaceUnderscore(clean).toUpperCase();
}

export function formatDeductionName(name: string): string {
  if (!name) return "";
  return replaceUnderscore(name.trim()).toUpperCase();
}

export function toWordsTitleCase(str: string): string {
  if (!str) return "";
  return str.toUpperCase();
}

function wrapText(
  text: string,
  maxWidth: number,
  font: any,
  fontSize: number,
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * HTML/React component for rendering salary slip in dialog preview and browser printing
 */
export function SalarySlipPDF({ data }: { data: DataType }) {
  const emp = data.employee;

  const earningsTotal = (emp.earnings || []).reduce(
    (acc, e) => acc + (e.amount || 0),
    0,
  );

  const deductionTotal = (emp.deductions || []).reduce(
    (acc, d) => acc + (d.amount || 0),
    0,
  );

  const netAmount = earningsTotal - deductionTotal;

  const { deductions, employerContributions: employerContribItems } =
    ensureStandardDeductionsAndContribs(
      emp.deductions || [],
      emp.employerContributions || [],
    );
  const employerContribTotal = employerContribItems.reduce(
    (acc, e) => acc + (e.amount || 0),
    0,
  );
  const earnings = sortEarnings(emp.earnings || []);
  const maxRows = Math.max(
    earnings.length,
    deductions.length,
    employerContribItems.length,
    1,
  );

  const clientAddress = [
    data.companyData?.address_line_1,
    data.companyData?.address_line_2,
    data.companyData?.city,
    formatStateName(data.companyData?.state) || data.companyData?.state,
    data.companyData?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const words = toWordsTitleCase(
    numberToWordsIndian(roundToNearest(Number(netAmount))),
  );

  return (
    <div className="w-full bg-white text-black p-8 font-sans text-[11px] leading-tight select-text print:p-0 print:m-0">
      {/* Header */}
      <div className="flex justify-between items-start gap-8 pb-3">
        <div className="w-[45%] text-left">
          <div className="font-bold text-[12.5px] text-gray-900 leading-tight">
            {CANNY_MANAGEMENT_SERVICES_NAME}
          </div>
          <div className="text-[10px] text-gray-600 mt-1 leading-normal">
            {CANNY_MANAGEMENT_SERVICES_ADDRESS}
          </div>
        </div>
        <div className="w-[48%] text-left">
          <div className="font-bold text-[12.5px] text-gray-900 leading-tight">
            {data.companyData?.company_salary_prefix
              ? `${data.companyData.company_salary_prefix} ${data.companyData?.name || ""}`
              : data.companyData?.name}
          </div>
          <div className="text-[10px] text-gray-600 mt-1 leading-normal">
            {clientAddress}
          </div>
        </div>
      </div>

      {/* Title Subheader */}
      <div className="grid grid-cols-[36%_28%_36%] items-center py-2 mb-2 text-[10px] uppercase">
        <div className="text-right pr-4 font-normal text-gray-800">
          Salary Slip
        </div>
        <div className="text-center text-gray-600 font-normal">
          {SALARY_SLIP_TITLE}
        </div>
        <div className="text-right text-gray-800 font-normal">
          For the Month of {data.month} - {data.year}
        </div>
      </div>

      {/* Main Details Box */}
      <div className="border border-gray-300 rounded-none overflow-hidden uppercase">
        {/* Employee Info Grid */}
        <div className="divide-y divide-gray-200 text-[10px]">
          {/* Row 1 */}
          <div className="grid grid-cols-[14%_36%_14%_36%] items-center px-3 py-1.5 font-normal text-gray-900">
            <span className="text-gray-500">EMP. ID</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(emp.employeeData?.employee_code || "--").toUpperCase()}
            </span>
            <span className="text-gray-500">P.F. NO.</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(emp.employeeStatutoryDetails?.pf_number
                ? emp.employeeStatutoryDetails.pf_number.startsWith(EPFNO)
                  ? emp.employeeStatutoryDetails.pf_number
                  : `${EPFNO}/${emp.employeeStatutoryDetails.pf_number}`
                : "N/A").toUpperCase()}
            </span>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-[14%_36%_14%_36%] items-center px-3 py-1.5 font-normal text-gray-900">
            <span className="text-gray-500">EMP. NAME</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {([
                emp.employeeData?.first_name,
                emp.employeeData?.middle_name,
                emp.employeeData?.last_name,
              ]
                .filter(Boolean)
                .join(" ") || "--").toUpperCase()}
            </span>
            <span className="text-gray-500">UAN NO.</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(emp.employeeStatutoryDetails?.uan_number || "N/A").toUpperCase()}
            </span>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-[14%_36%_14%_36%] items-center px-3 py-1.5 font-normal text-gray-900">
            <span className="text-gray-500">DESIGNATION</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {replaceUnderscore(
                emp.employeeProjectAssignmentData?.position || "--",
              ).toUpperCase()}
            </span>
            <span className="text-gray-500">ESI NO.</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(emp.employeeStatutoryDetails?.esic_number || "N/A").toUpperCase()}
            </span>
          </div>

          {/* Row 4 */}
          <div className="grid grid-cols-[14%_36%_14%_36%] items-center px-3 py-1.5 font-normal text-gray-900">
            <span className="text-gray-500">LOCATION</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {replaceUnderscore(
                emp.employeeProjectAssignmentData?.location || "--",
              ).toUpperCase()}
            </span>
            <span className="text-gray-500">BANK</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(emp.bankDetails?.bank || "--").toUpperCase()}
            </span>
          </div>

          {/* Row 5 */}
          <div className="grid grid-cols-[14%_36%_14%_36%] items-center px-3 py-1.5 font-normal text-gray-900">
            <span className="text-gray-500">DEPARTMENT</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(emp.employeeProjectAssignmentData?.department || "--").toUpperCase()}
            </span>
            <span className="text-gray-500 normal-case">PAN No.</span>
            <span className="text-gray-900 font-normal truncate normal-case">
              {emp.employeeStatutoryDetails?.pan_number || "--"}
            </span>
          </div>

          {/* Row 6 */}
          <div className="grid grid-cols-[14%_36%_14%_36%] items-center px-3 py-1.5 font-normal text-gray-900">
            <span className="text-gray-500">D.O.J</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {(formatDate(
                emp.employeeProjectAssignmentData?.start_date || "",
              ) || "--").toUpperCase()}
            </span>
            <span className="text-gray-500">A/C NO.</span>
            <span className="text-gray-900 font-normal truncate uppercase">
              {String(emp.bankDetails?.account_number || "--").toUpperCase()}
            </span>
          </div>
        </div>

        {/* Attendance Row */}
        <div className="flex justify-between items-center px-3 py-1.5 border-t border-b border-gray-200 text-[10px] text-gray-900 font-normal uppercase">
          <span>WORKING DAYS : {emp.attendance?.working_days ?? 0}</span>
          <span>PAID DAYS : {emp.attendance?.paid_days ?? 0}</span>
          <span>ABSENTS : {emp.attendance?.absents ?? 0}</span>
          <span>PAID LEAVES : {emp.attendance?.paid_leaves ?? 0}</span>
          <span>CASUAL LEAVES : {emp.attendance?.casual_leaves ?? 0}</span>
          {Number(emp.attendance?.overtime_hours || 0) > 0 && (
            <span>OT HOURS : {emp.attendance.overtime_hours}</span>
          )}
        </div>

        {/* Earnings / Deductions / Employer Contribution Table */}
        <div>
          <div className="grid grid-cols-[18%_14%_18%_14%_22%_14%] bg-[#e5e7eb] text-gray-900 font-bold text-[10px] px-3 py-1.5 border-b border-gray-300 uppercase items-center">
            <div>EARNINGS</div>
            <div>AMOUNT</div>
            <div>DEDUCTIONS</div>
            <div>AMOUNT</div>
            <div className="whitespace-nowrap">EMPLOYER CONTRIB.</div>
            <div>AMOUNT</div>
          </div>

          <div className="divide-y divide-gray-200 text-[10px]">
            {Array.from({ length: maxRows }).map((_, idx) => {
              const earning = earnings[idx];
              const deduction = deductions[idx];
              const contrib = employerContribItems[idx];
              return (
                <div
                  key={idx}
                  className="grid grid-cols-[18%_14%_18%_14%_22%_14%] px-3 py-1.5 text-gray-900 font-normal uppercase items-center"
                >
                  <div className="truncate">{earning ? formatEarningName(earning.name) : ""}</div>
                  <div>{earning ? formatNumber(earning.amount) : ""}</div>
                  <div className="truncate">{deduction ? formatDeductionName(deduction.name) : ""}</div>
                  <div>{deduction ? formatNumber(deduction.amount ?? 0) : ""}</div>
                  <div className="truncate">
                    {contrib ? formatEmployerContribName(contrib.name) : ""}
                  </div>
                  <div>{contrib ? formatNumber(contrib.amount ?? 0) : ""}</div>
                </div>
              );
            })}
          </div>

          {/* Subtotals */}
          <div className="grid grid-cols-[18%_14%_18%_14%_22%_14%] bg-[#dbeafe] text-gray-900 font-bold text-[10px] px-3 py-1.5 border-t border-gray-300 uppercase items-center">
            <div className="whitespace-nowrap">GROSS INCOME</div>
            <div>{roundToNearest(earningsTotal)}</div>
            <div className="whitespace-nowrap">TOTAL DEDUCTIONS</div>
            <div>{roundToNearest(deductionTotal)}</div>
            <div className="whitespace-nowrap">TOTAL EMPLOYER CONTRIB.</div>
            <div>{roundToNearest(employerContribTotal)}</div>
          </div>

          {/* Net Amount & In Words */}
          <div className="grid grid-cols-[18%_14%_18%_14%_22%_14%] text-[10px] uppercase items-stretch border-t border-gray-200">
            <div className="col-span-4 flex items-center gap-6 px-3 py-1.5 bg-white text-gray-900">
              <span className="text-gray-500 font-normal">RUPEES</span>
              <span className="font-mono text-[9.5px] text-gray-900 tracking-wide font-normal uppercase truncate">{words.toUpperCase()}</span>
            </div>
            <div className="flex items-center justify-center px-3 py-1.5 bg-[#dcfce7] font-bold text-gray-900 whitespace-nowrap">
              NET AMOUNT
            </div>
            <div className="flex items-center px-3 py-1.5 bg-white font-bold text-gray-900 whitespace-nowrap">
              RS. {roundToNearest(netAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[9px] text-gray-500 mt-4">
        This is computer generated statement hence does not require signature.
      </div>
    </div>
  );
}

/**
 * Pure JavaScript PDF generator using pdf-lib (zero external fonts, zero canvas/yoga issues)
 */
export async function generateSalarySlipPdf(
  data: DataType,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { height, width } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

  const margin = 36;
  const tableWidth = width - margin * 2;
  const startY = height - 42;

  // Header Left (Canny) - Left aligned
  const leftStartX = margin;
  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME, {
    x: leftStartX,
    y: startY,
    size: 11.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const leftMaxW = tableWidth * 0.44;
  const leftAddrLines = wrapText(
    CANNY_MANAGEMENT_SERVICES_ADDRESS,
    leftMaxW,
    fontRegular,
    7.5,
  );

  let leftAddrY = startY - 12;
  for (const line of leftAddrLines) {
    page.drawText(line.trim(), {
      x: leftStartX,
      y: leftAddrY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    });
    leftAddrY -= 10;
  }

  // Header Right (Client Company) - with generous space from left company
  const rightStartX = margin + tableWidth * 0.53;
  const rightMaxW = tableWidth * 0.47;

  const clientName = data.companyData?.company_salary_prefix
    ? `${data.companyData.company_salary_prefix} ${data.companyData?.name || ""}`
    : data.companyData?.name || "";

  page.drawText(clientName, {
    x: rightStartX,
    y: startY,
    size: 11.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const clientAddress = [
    data.companyData?.address_line_1,
    data.companyData?.address_line_2,
    data.companyData?.city,
    formatStateName(data.companyData?.state) || data.companyData?.state,
    data.companyData?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const rightAddrLines = wrapText(
    clientAddress,
    rightMaxW,
    fontRegular,
    7.5,
  );

  let rightAddrY = startY - 12;
  for (const line of rightAddrLines) {
    page.drawText(line.trim(), {
      x: rightStartX,
      y: rightAddrY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    });
    rightAddrY -= 10;
  }

  const maxHeaderLines = Math.max(leftAddrLines.length, rightAddrLines.length, 1);
  const headerBottomY = startY - 12 - (maxHeaderLines - 1) * 10;

  // Title bar (Subheader)
  const subheaderY = headerBottomY - 18;
  page.drawText("SALARY SLIP", {
    x: margin + tableWidth * 0.33,
    y: subheaderY,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.1, 0.1, 0.1),
  });

  const titleMid = SALARY_SLIP_TITLE;
  page.drawText(titleMid, {
    x: margin + tableWidth * 0.45,
    y: subheaderY,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  const monthStr = `FOR THE MONTH OF ${String(data.month).toUpperCase()} - ${data.year}`;
  const monthStrWidth = fontRegular.widthOfTextAtSize(monthStr, 7.5);
  page.drawText(monthStr, {
    x: width - margin - monthStrWidth,
    y: subheaderY,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Box border top - exactly 10pt below subheader text
  const boxTopY = subheaderY - 10;

  // Employee details grid (6 rows, each 15pt high)
  const emp = data.employee;
  const fullName = [
    emp.employeeData?.first_name,
    emp.employeeData?.middle_name,
    emp.employeeData?.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const leftDetails = [
    ["EMP. ID", (emp.employeeData?.employee_code || "--").toUpperCase()],
    ["EMP. NAME", (fullName || "--").toUpperCase()],
    ["DESIGNATION", replaceUnderscore(emp.employeeProjectAssignmentData?.position || "--").toUpperCase()],
    ["LOCATION", replaceUnderscore(emp.employeeProjectAssignmentData?.location || "--").toUpperCase()],
    ["DEPARTMENT", (emp.employeeProjectAssignmentData?.department || "--").toUpperCase()],
    ["D.O.J", (formatDate(emp.employeeProjectAssignmentData?.start_date || "") || "--").toUpperCase()],
  ];

  const rightDetails = [
    [
      "P.F. NO.",
      (emp.employeeStatutoryDetails?.pf_number
        ? emp.employeeStatutoryDetails.pf_number.startsWith(EPFNO)
          ? emp.employeeStatutoryDetails.pf_number
          : `${EPFNO}/${emp.employeeStatutoryDetails.pf_number}`
        : "N/A").toUpperCase(),
    ],
    ["UAN NO.", (emp.employeeStatutoryDetails?.uan_number || "N/A").toUpperCase()],
    ["ESI NO.", (emp.employeeStatutoryDetails?.esic_number || "N/A").toUpperCase()],
    ["BANK", (emp.bankDetails?.bank || "--").toUpperCase()],
    ["PAN No.", emp.employeeStatutoryDetails?.pan_number || "--"],
    ["A/C NO.", String(emp.bankDetails?.account_number || "--").toUpperCase()],
  ];

  const lCol1X = margin + 6;
  const lCol2X = margin + 68;
  const rCol1X = margin + tableWidth * 0.48 + 6;
  const rCol2X = margin + tableWidth * 0.48 + 68;

  const rowH_emp = 15;
  for (let i = 0; i < 6; i++) {
    const [lKey, lVal] = leftDetails[i];
    const [rKey, rVal] = rightDetails[i];

    const rowTop = boxTopY - i * rowH_emp;
    const rowBottom = rowTop - rowH_emp;
    const baselineY = rowBottom + 4.8;

    // Left column: Regular font
    page.drawText(lKey, {
      x: lCol1X,
      y: baselineY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
    page.drawText(String(lVal).slice(0, 36), {
      x: lCol2X,
      y: baselineY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Right column: Regular font
    page.drawText(rKey, {
      x: rCol1X,
      y: baselineY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
    page.drawText(String(rVal).slice(0, 36), {
      x: rCol2X,
      y: baselineY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Horizontal divider
    page.drawLine({
      start: { x: margin, y: rowBottom },
      end: { x: width - margin, y: rowBottom },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.88),
    });
  }

  // Attendance bar (15pt high)
  const attTop = boxTopY - 6 * rowH_emp;
  const rowH_att = 15;
  const attBottom = attTop - rowH_att;
  const attBaselineY = attBottom + 4.8;

  const hasOt = Number(emp.attendance?.overtime_hours || 0) > 0;
  const attItems = hasOt
    ? [
        {
          text: `WORKING DAYS : ${emp.attendance?.working_days ?? 0}`,
          x: margin + 6,
        },
        {
          text: `PAID DAYS : ${emp.attendance?.paid_days ?? 0}`,
          x: margin + tableWidth * 0.18,
        },
        {
          text: `ABSENTS : ${emp.attendance?.absents ?? 0}`,
          x: margin + tableWidth * 0.35,
        },
        {
          text: `PAID LEAVES : ${emp.attendance?.paid_leaves ?? 0}`,
          x: margin + tableWidth * 0.5,
        },
        {
          text: `CASUAL LEAVES : ${emp.attendance?.casual_leaves ?? 0}`,
          x: margin + tableWidth * 0.67,
        },
        {
          text: `OT HOURS : ${emp.attendance.overtime_hours}`,
          x: margin + tableWidth * 0.84,
        },
      ]
    : [
        {
          text: `WORKING DAYS : ${emp.attendance?.working_days ?? 0}`,
          x: margin + 6,
        },
        {
          text: `PAID DAYS : ${emp.attendance?.paid_days ?? 0}`,
          x: margin + tableWidth * 0.22,
        },
        {
          text: `ABSENTS : ${emp.attendance?.absents ?? 0}`,
          x: margin + tableWidth * 0.43,
        },
        {
          text: `PAID LEAVES : ${emp.attendance?.paid_leaves ?? 0}`,
          x: margin + tableWidth * 0.62,
        },
        {
          text: `CASUAL LEAVES : ${emp.attendance?.casual_leaves ?? 0}`,
          x: margin + tableWidth * 0.8,
        },
      ];

  for (const item of attItems) {
    page.drawText(item.text, {
      x: item.x,
      y: attBaselineY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  page.drawLine({
    start: { x: margin, y: attBottom },
    end: { x: width - margin, y: attBottom },
    thickness: 0.5,
    color: rgb(0.88, 0.88, 0.88),
  });

  // Table Header (15pt high)
  const tblHeaderTop = attBottom;
  const rowH_header = 15;
  const tblHeaderBottom = tblHeaderTop - rowH_header;

  page.drawRectangle({
    x: margin,
    y: tblHeaderBottom,
    width: tableWidth,
    height: rowH_header,
    color: rgb(0.90, 0.91, 0.92),
  });

  // Helper for drawing bounded/truncated text so it never overlaps adjacent columns
  function drawTruncatedText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    font: any,
    size: number,
    color: any,
  ) {
    if (!text) return;
    let str = text;
    if (font.widthOfTextAtSize(str, size) > maxWidth) {
      while (str.length > 0 && font.widthOfTextAtSize(str + "...", size) > maxWidth) {
        str = str.slice(0, -1);
      }
      str = str + "...";
    }
    page.drawText(str, { x, y, size, font, color });
  }

  const col1X = margin + 6;
  const col2X = margin + tableWidth * 0.18;
  const col3X = margin + tableWidth * 0.32 + 6;
  const col4X = margin + tableWidth * 0.50;
  const col5X = margin + tableWidth * 0.64 + 6;
  const col6X = margin + tableWidth * 0.86;

  const headerBaselineY = tblHeaderBottom + 4.8;
  page.drawText("EARNINGS", { x: col1X, y: headerBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText("AMOUNT", { x: col2X, y: headerBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText("DEDUCTIONS", { x: col3X, y: headerBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText("AMOUNT", { x: col4X, y: headerBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText("EMPLOYER CONTRIB.", { x: col5X, y: headerBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText("AMOUNT", { x: col6X, y: headerBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

  page.drawLine({
    start: { x: margin, y: tblHeaderBottom },
    end: { x: width - margin, y: tblHeaderBottom },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Table Body Rows (each 15pt high)
  const earnings = sortEarnings(emp.earnings || []);
  const { deductions, employerContributions: employerContribItems } =
    ensureStandardDeductionsAndContribs(
      emp.deductions || [],
      emp.employerContributions || [],
    );
  const maxRows = Math.max(earnings.length, deductions.length, employerContribItems.length, 1);

  const earningsTotal = earnings.reduce((acc, e) => acc + (e.amount || 0), 0);
  const deductionTotal = deductions.reduce((acc, d) => acc + (d.amount || 0), 0);
  const employerContribTotal = employerContribItems.reduce((acc, e) => acc + (e.amount || 0), 0);
  const netAmount = earningsTotal - deductionTotal;

  const rowH_item = 15;
  for (let r = 0; r < maxRows; r++) {
    const earning = earnings[r];
    const deduction = deductions[r];
    const contrib = employerContribItems[r];

    const itemRowTop = tblHeaderBottom - r * rowH_item;
    const itemRowBottom = itemRowTop - rowH_item;
    const itemBaselineY = itemRowBottom + 4.8;

    if (earning) {
      drawTruncatedText(formatEarningName(earning.name), col1X, itemBaselineY, (col2X - col1X - 6), fontRegular, 7.5, rgb(0.15, 0.15, 0.15));
      page.drawText(formatNumber(earning.amount), { x: col2X, y: itemBaselineY, size: 7.5, font: fontRegular, color: rgb(0, 0, 0) });
    }

    if (deduction) {
      drawTruncatedText(formatDeductionName(deduction.name), col3X, itemBaselineY, (col4X - col3X - 6), fontRegular, 7.5, rgb(0.15, 0.15, 0.15));
      page.drawText(String(formatNumber(deduction.amount ?? 0)), { x: col4X, y: itemBaselineY, size: 7.5, font: fontRegular, color: rgb(0, 0, 0) });
    }

    if (contrib) {
      drawTruncatedText(formatEmployerContribName(contrib.name), col5X, itemBaselineY, (col6X - col5X - 6), fontRegular, 7.5, rgb(0.15, 0.15, 0.15));
      page.drawText(String(formatNumber(contrib.amount ?? 0)), { x: col6X, y: itemBaselineY, size: 7.5, font: fontRegular, color: rgb(0, 0, 0) });
    }

    page.drawLine({
      start: { x: margin, y: itemRowBottom },
      end: { x: width - margin, y: itemRowBottom },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });
  }

  // Subtotals Row (15pt high)
  const subtotalTop = tblHeaderBottom - maxRows * rowH_item;
  const rowH_subtotal = 15;
  const subtotalBottom = subtotalTop - rowH_subtotal;

  page.drawRectangle({
    x: margin,
    y: subtotalBottom,
    width: tableWidth,
    height: rowH_subtotal,
    color: rgb(0.86, 0.92, 0.98),
  });

  const subtotalBaselineY = subtotalBottom + 4.8;
  page.drawText("GROSS INCOME", { x: col1X, y: subtotalBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText(String(roundToNearest(earningsTotal)), { x: col2X, y: subtotalBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

  page.drawText("TOTAL DEDUCTIONS", { x: col3X, y: subtotalBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText(String(roundToNearest(deductionTotal)), { x: col4X, y: subtotalBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

  page.drawText("TOTAL EMPLOYER CONTRIB.", { x: col5X, y: subtotalBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText(String(roundToNearest(employerContribTotal)), { x: col6X, y: subtotalBaselineY, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

  page.drawLine({
    start: { x: margin, y: subtotalBottom },
    end: { x: width - margin, y: subtotalBottom },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });

  // Words & Net Amount Row (15.5pt high)
  const netTop = subtotalBottom;
  const rowH_net = 15.5;
  const netBottom = netTop - rowH_net;

  const greenBoxX = margin + tableWidth * 0.64;
  const greenBoxW = tableWidth * 0.22;
  page.drawRectangle({
    x: greenBoxX,
    y: netBottom,
    width: greenBoxW,
    height: rowH_net,
    color: rgb(0.86, 0.96, 0.89),
  });

  const netBaselineY = netBottom + 5.0;
  page.drawText("RUPEES", {
    x: margin + 6,
    y: netBaselineY,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const wordsText = toWordsTitleCase(numberToWordsIndian(roundToNearest(Number(netAmount)))).toUpperCase();
  page.drawText(wordsText.slice(0, 60), {
    x: margin + 58,
    y: netBaselineY,
    size: 7.5,
    font: fontCourier,
    color: rgb(0.1, 0.1, 0.1),
  });

  const netAmountW = fontBold.widthOfTextAtSize("NET AMOUNT", 7.5);
  page.drawText("NET AMOUNT", {
    x: greenBoxX + (greenBoxW - netAmountW) / 2,
    y: netBaselineY,
    size: 7.5,
    font: fontBold,
    color: rgb(0.05, 0.25, 0.05),
  });

  const netStr = `RS. ${roundToNearest(netAmount)}`;
  page.drawText(netStr, {
    x: col6X,
    y: netBaselineY,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const boxBottomY = netBottom;

  // Outer border around whole slip table
  page.drawRectangle({
    x: margin,
    y: boxBottomY,
    width: tableWidth,
    height: boxTopY - boxBottomY,
    borderColor: rgb(0.82, 0.85, 0.88),
    borderWidth: 0.75,
  });

  // Footer notice
  const footerNotice = "This is computer generated statement hence does not require signature.";
  const footerW = fontRegular.widthOfTextAtSize(footerNotice, 7);
  page.drawText(footerNotice, {
    x: (width - footerW) / 2,
    y: boxBottomY - 16,
    size: 7,
    font: fontRegular,
    color: rgb(0.45, 0.45, 0.45),
  });

  return pdfDoc.save();
}
