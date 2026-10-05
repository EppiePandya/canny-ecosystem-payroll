import {
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_NAME,
} from "@/constant";
import {
  formatDate,
  formatNumber,
  replaceUnderscore,
  roundToNearest,
} from "@canny_ecosystem/utils";
import type {
  CompanyDatabaseRow,
  EmployeeDatabaseRow,
  EmployeeStatutoryDetailsDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type SalaryRegisterEmployeeType = {
  attendance: {
    working_days: number;
    weekly_off: number;
    paid_holidays: number;
    paid_days: number;
    paid_leaves: number;
    casual_leaves: number;
    absents: number;
  };
  bankDetails: { bank?: string; account_number?: number | string } | null;
  employeeData: Partial<EmployeeDatabaseRow>;
  employeeProjectAssignmentData: {
    position?: string;
    department?: string;
    date_of_joining?: string;
  };
  employeeStatutoryDetails: Partial<EmployeeStatutoryDetailsDatabaseRow> | null;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  monthly_ctc?: number;
};

export type SalaryRegisterDataType = {
  month: string;
  year: number;
  paymentDate?: string;
  companyData: Partial<CompanyDatabaseRow & LocationDatabaseRow>;
  employeeData: SalaryRegisterEmployeeType[];
};

export function parseEmployeeComponents(emp: SalaryRegisterEmployeeType) {
  const earnings = emp.earnings || [];
  const deductions = emp.deductions || [];

  const findEarn = (keywords: string[]) => {
    const found = earnings.find((e) => {
      const n = (e.name || "").toUpperCase();
      return keywords.some((k) => n.includes(k));
    });
    return found ? Number(found.amount || 0) : 0;
  };

  const findDed = (keywords: string[]) => {
    const found = deductions.find((d) => {
      const n = (d.name || "").toUpperCase();
      return keywords.some((k) => n.includes(k));
    });
    return found ? Number(found.amount || 0) : 0;
  };

  const basicEarned = findEarn(["BASIC", "CONSOL"]);
  const hraEarned = findEarn(["HRA", "HOUSE RENT"]);
  const otEarned = findEarn(["OT", "OVERTIME"]);
  const bonusEarned = findEarn(["BONUS"]);
  const transEarned = findEarn(["TRANS", "CONVEYANCE", "TRAVEL"]);
  const othEarned = findEarn(["OTH", "SPECIAL", "ALLOWANCE", "OTHER"]);
  const daEarned = findEarn(["DA", "VDA", "ARREAR"]);

  const wd = Number(emp.attendance?.working_days) || 26;
  const pd = Number(emp.attendance?.paid_days) || 0;
  const scale = pd > 0 && wd > 0 ? wd / pd : 1;

  const basicRate = roundToNearest(basicEarned * (pd > 0 && pd < wd ? scale : 1));
  const hraRate = roundToNearest(hraEarned * (pd > 0 && pd < wd ? scale : 1));
  const transRate = roundToNearest(transEarned * (pd > 0 && pd < wd ? scale : 1));
  const othRate = roundToNearest(othEarned * (pd > 0 && pd < wd ? scale : 1));
  const totalRate = basicRate + hraRate + transRate + othRate;

  const grossSalary = earnings.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const pfWages = basicEarned;
  const esiWages = grossSalary - findEarn(["BONUS", "GRATUITY"]);

  const pfDed = findDed(["PF", "EPF", "PROVIDENT"]);
  const esiDed = findDed(["ESI", "ESIC", "INSURANCE"]);
  const itDed = findDed(["IT", "INCOME TAX", "TDS"]);
  const ptDed = findDed(["PT", "PROFESSIONAL TAX"]);
  const loanDed = findDed(["LOAN"]);
  const advDed = findDed(["ADV", "ADVANCE"]);
  const lwfDed = findDed(["LWF", "WELFARE"]);
  const totalDeductions = deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const netPay = grossSalary - totalDeductions;

  return {
    basicEarned,
    hraEarned,
    otEarned,
    bonusEarned,
    transEarned,
    othEarned,
    daEarned,
    basicRate,
    hraRate,
    transRate,
    othRate,
    totalRate,
    grossSalary,
    pfWages,
    esiWages,
    pfDed,
    esiDed,
    itDed,
    ptDed,
    loanDed,
    advDed,
    lwfDed,
    totalDeductions,
    netPay,
  };
}

/**
 * Statutory Salary Register HTML Component (Matches Gujarat Form 17 / Minimum Wages Rules layout)
 */
export function SalaryRegisterHTML({ data }: { data: SalaryRegisterDataType }) {
  if (!data?.employeeData?.length) {
    return (
      <div className="p-8 text-center text-neutral-500 font-sans">
        No salary entries found for this payroll.
      </div>
    );
  }

  const clientAddress = [
    data.companyData?.address_line_1,
    data.companyData?.address_line_2,
    data.companyData?.city,
    data.companyData?.state,
    data.companyData?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  let totalGross = 0;
  let totalPf = 0;
  let totalEsi = 0;
  let totalDed = 0;
  let totalNet = 0;

  return (
    <div className="p-4 bg-white text-black font-sans text-[10px] leading-tight min-w-[1100px] select-text">
      {/* Top Statutory Header */}
      <div className="grid grid-cols-12 gap-2 border-b-2 border-black pb-3 mb-2 items-start">
        {/* Left: Establishment */}
        <div className="col-span-4 pr-2">
          <div className="text-[9px] text-neutral-600 font-medium">Name & Add of Establishment</div>
          <div className="font-bold text-[11px] uppercase text-black">{CANNY_MANAGEMENT_SERVICES_NAME}</div>
          <div className="text-[8.5px] leading-tight text-neutral-700 mt-0.5">{CANNY_MANAGEMENT_SERVICES_ADDRESS}</div>
          <div className="mt-1 font-semibold text-[9px]">
            <span>P.F.No :- <span className="font-bold">GJNRD61115</span></span>
            <span className="ml-3">ESI No :- <span className="font-bold">37000280740001000</span></span>
          </div>
        </div>

        {/* Center: Title and Statutory Rules */}
        <div className="col-span-4 text-center px-1">
          <div className="text-[9px] text-neutral-700">Payment Date :- {data.paymentDate || formatDate(new Date())}</div>
          <div className="font-black text-[13px] tracking-wide uppercase mt-0.5">Salary Register</div>
          <div className="font-bold text-[11px] mt-0.5">Month :- {data.month} - {data.year}</div>
          <div className="text-[7.5px] leading-tight text-neutral-600 mt-1 space-y-0.5">
            <div>(1) Form under Rule - 6 of Equal Remuneration Rules 1976</div>
            <div>(2) Form under Rule - 21(4),25(2),26(1) and 26(2) of Gujarat Minimum Wages Rules 1961</div>
            <div>(3) Form under Rule - 6 of Payment of Wages Gujarat Rules, 1963</div>
            <div>(4) Form 17 under Rule - 78 of Contract Labour (Regulation & Abolition) Gujarat, Rules,1972</div>
            <div>(5) Form under Rule - 52(2) of Inter State Migrant Workers (Gujarat) Rules 1981</div>
          </div>
        </div>

        {/* Right: Contractor / Unit / Site */}
        <div className="col-span-4 text-right pl-2">
          <div className="text-[9px] text-neutral-600 font-medium">Contractor/Unit/Site</div>
          <div className="font-bold text-[11px] uppercase text-black">{data.companyData?.name || "BAOXHIN INDIA PRIVATE LIMITED"}</div>
          <div className="text-[8.5px] leading-tight text-neutral-700 mt-0.5 max-w-xs ml-auto">{clientAddress}</div>
        </div>
      </div>

      {/* Main Statutory Table */}
      <table className="w-full border-collapse border border-black text-[8.5px]">
        <thead>
          <tr className="border-b border-black bg-neutral-100 font-bold text-center">
            <th className="border border-black p-1 w-6">Sr.<br />No.</th>
            <th className="border border-black p-1 text-left w-[180px]">
              <div>Employee Name</div>
              <div className="flex justify-between font-normal text-[7.5px] text-neutral-600">
                <span>Employee Id</span>
                <span>UAN No.</span>
              </div>
              <div className="font-normal text-[7.5px] text-neutral-600">Department / Designation</div>
              <div className="font-normal text-[7.5px] text-neutral-600">P.F.No / ESI.No</div>
            </th>
            <th className="border border-black p-1 w-[70px]">Working<br />Details</th>
            <th className="border border-black p-1 w-[80px]">Rate</th>
            <th className="border border-black p-1 w-[80px]">Earnings</th>
            <th className="border border-black p-1 w-[75px]">
              <div>Gross Salary</div>
              <div className="font-normal text-[7.5px] text-neutral-600 mt-0.5">PF Wages</div>
              <div className="font-normal text-[7.5px] text-neutral-600">ESI Wages</div>
            </th>
            <th className="border border-black p-1 w-[120px]">
              <div>Deduction</div>
              <div className="flex justify-between text-[7px] font-normal border-t border-black/40 mt-0.5 pt-0.5">
                <span>Components</span>
                <span>Gross Ded.</span>
              </div>
            </th>
            <th className="border border-black p-1 w-[75px]">
              <div>Net Salary</div>
              <div className="text-[7.5px] font-normal">Payable in Rs.</div>
            </th>
            <th className="border border-black p-1 text-left w-[110px]">
              <div>Signature of employees /<br />Thumb Impression</div>
              <div className="font-normal text-[7.5px] text-neutral-600">payment mode / bank</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.employeeData.map((emp, idx) => {
            const c = parseEmployeeComponents(emp);
            totalGross += c.grossSalary;
            totalPf += c.pfDed;
            totalEsi += c.esiDed;
            totalDed += c.totalDeductions;
            totalNet += c.netPay;

            const fullName = `${emp.employeeData?.first_name || ""} ${emp.employeeData?.middle_name || ""} ${emp.employeeData?.last_name || ""}`.trim();
            const empCode = emp.employeeData?.employee_code || "--";
            const uan = emp.employeeStatutoryDetails?.uan_number || "--";
            const dept = emp.employeeProjectAssignmentData?.department || "--";
            const desig = replaceUnderscore(emp.employeeProjectAssignmentData?.position || "--");
            const pfNo = emp.employeeStatutoryDetails?.pf_number || "--";
            const esicNo = emp.employeeStatutoryDetails?.esic_number || "--";

            const att = emp.attendance || {};
            const wd = att.working_days || 26;
            const wo = att.weekly_off ?? 4;
            const ph = att.paid_holidays ?? 0;
            const pd = att.paid_days ?? 0;
            const pl = att.paid_leaves ?? 0;
            const cl = att.casual_leaves ?? 0;
            const sl = 0;
            const ab = att.absents ?? 0;
            const tot = pd;

            return (
              <tr key={idx} className="border-b border-black align-top hover:bg-neutral-50/50">
                {/* 1. Sr. No. */}
                <td className="border border-black p-1 text-center font-bold">
                  {idx + 1}
                </td>

                {/* 2. Employee Details */}
                <td className="border border-black p-1 font-sans">
                  <div className="font-bold text-[9px] uppercase tracking-tight">{fullName}</div>
                  <div className="flex justify-between text-[8px] text-neutral-700 mt-0.5">
                    <span>{empCode}</span>
                    <span>{uan}</span>
                  </div>
                  <div className="text-[8px] uppercase text-neutral-800">{dept}</div>
                  <div className="text-[8px] uppercase font-medium">{desig}</div>
                  <div className="text-[7.5px] text-neutral-600 mt-0.5">
                    <div>{pfNo}</div>
                    <div>{esicNo}</div>
                  </div>
                </td>

                {/* 3. Working Details */}
                <td className="border border-black p-1">
                  <div className="space-y-0.5 text-[7.5px]">
                    <div className="flex justify-between"><span>WD</span><span>{formatNumber(wd)}.00</span></div>
                    <div className="flex justify-between"><span>WO</span><span>{formatNumber(wo)}.00</span></div>
                    <div className="flex justify-between"><span>PH</span><span>{formatNumber(ph)}.00</span></div>
                    <div className="flex justify-between"><span>PD</span><span>{formatNumber(pd)}.00</span></div>
                    <div className="flex justify-between"><span>PL</span><span>{formatNumber(pl)}.00</span></div>
                    <div className="flex justify-between"><span>CL</span><span>{formatNumber(cl)}.00</span></div>
                    <div className="flex justify-between"><span>SL</span><span>{formatNumber(sl)}.00</span></div>
                    <div className="flex justify-between"><span>AB</span><span>{formatNumber(ab)}.00</span></div>
                    <div className="flex justify-between font-bold border-t border-black/30 pt-0.5">
                      <span>TOT</span><span>{formatNumber(tot)}.00</span>
                    </div>
                  </div>
                </td>

                {/* 4. Rate */}
                <td className="border border-black p-1">
                  <div className="space-y-0.5 text-[7.5px]">
                    <div className="flex justify-between"><span>Consol.BASIC</span><span>{c.basicRate > 0 ? formatNumber(c.basicRate) : "0.00"}</span></div>
                    <div className="flex justify-between"><span>HRA</span><span>{c.hraRate > 0 ? formatNumber(c.hraRate) : "0.00"}</span></div>
                    <div className="flex justify-between"><span>OT AMT</span><span>0.00</span></div>
                    <div className="flex justify-between"><span>BONUS</span><span>0.00</span></div>
                    <div className="flex justify-between"><span>TRANS.EXP</span><span>{c.transRate > 0 ? formatNumber(c.transRate) : "0.00"}</span></div>
                    <div className="flex justify-between"><span>OTH.All</span><span>{c.othRate > 0 ? formatNumber(c.othRate) : "0.00"}</span></div>
                    <div className="flex justify-between text-[7px] text-neutral-500"><span>OT Hrs/Day</span><span></span></div>
                    <div className="flex justify-between"><span>DA/Arrears</span><span>0.00</span></div>
                    <div className="flex justify-between font-bold border-t border-black/30 pt-0.5">
                      <span>TOT</span><span>{formatNumber(c.totalRate)}.00</span>
                    </div>
                  </div>
                </td>

                {/* 5. Earnings */}
                <td className="border border-black p-1">
                  <div className="space-y-0.5 text-[7.5px]">
                    <div className="flex justify-between"><span>Consol.BASIC</span><span>{c.basicEarned > 0 ? formatNumber(roundToNearest(c.basicEarned)) : "0"}</span></div>
                    <div className="flex justify-between"><span>HRA</span><span>{c.hraEarned > 0 ? formatNumber(roundToNearest(c.hraEarned)) : "0"}</span></div>
                    <div className="flex justify-between"><span>OT AMT</span><span>{c.otEarned > 0 ? formatNumber(roundToNearest(c.otEarned)) : "0"}</span></div>
                    <div className="flex justify-between"><span>BONUS</span><span>{c.bonusEarned > 0 ? formatNumber(roundToNearest(c.bonusEarned)) : "0"}</span></div>
                    <div className="flex justify-between"><span>TRANS.EXP</span><span>{c.transEarned > 0 ? formatNumber(roundToNearest(c.transEarned)) : "0"}</span></div>
                    <div className="flex justify-between"><span>OTH.All</span><span>{c.othEarned > 0 ? formatNumber(roundToNearest(c.othEarned)) : "0"}</span></div>
                    <div className="flex justify-between"><span>DA/Arrears</span><span>{c.daEarned > 0 ? formatNumber(roundToNearest(c.daEarned)) : "0"}</span></div>
                  </div>
                </td>

                {/* 6. Gross Salary / PF Wages / ESI Wages */}
                <td className="border border-black p-1 text-right">
                  <div className="font-bold text-[9px]">{formatNumber(roundToNearest(c.grossSalary))}</div>
                  <div className="mt-3 text-[8px] text-neutral-800">{formatNumber(roundToNearest(c.pfWages))}</div>
                  <div className="mt-2 text-[8px] text-neutral-800">{formatNumber(roundToNearest(c.esiWages))}</div>
                </td>

                {/* 7. Deduction */}
                <td className="border border-black p-1">
                  <div className="grid grid-cols-12 gap-1 h-full">
                    <div className="col-span-7 space-y-0.5 text-[7.5px] border-r border-black/30 pr-1">
                      <div className="flex justify-between"><span>P.F</span><span>{c.pfDed > 0 ? formatNumber(roundToNearest(c.pfDed)) : "0"}</span></div>
                      <div className="flex justify-between"><span>ESI</span><span>{c.esiDed > 0 ? formatNumber(roundToNearest(c.esiDed)) : "0"}</span></div>
                      <div className="flex justify-between"><span>IT</span><span>{c.itDed > 0 ? formatNumber(roundToNearest(c.itDed)) : "0"}</span></div>
                      <div className="flex justify-between"><span>P.T.</span><span>{c.ptDed > 0 ? formatNumber(roundToNearest(c.ptDed)) : "0"}</span></div>
                      <div className="flex justify-between"><span>Loan</span><span>{c.loanDed > 0 ? formatNumber(roundToNearest(c.loanDed)) : "0"}</span></div>
                      <div className="flex justify-between"><span>Advn.</span><span>{c.advDed > 0 ? formatNumber(roundToNearest(c.advDed)) : "0"}</span></div>
                      <div className="flex justify-between"><span>LWF</span><span>{c.lwfDed > 0 ? formatNumber(roundToNearest(c.lwfDed)) : "0"}</span></div>
                    </div>
                    <div className="col-span-5 text-right font-bold text-[9px] pt-1">
                      {formatNumber(roundToNearest(c.totalDeductions))}
                    </div>
                  </div>
                </td>

                {/* 8. Net Salary */}
                <td className="border border-black p-1 text-center font-black text-[10px] align-middle">
                  {formatNumber(roundToNearest(c.netPay))}
                </td>

                {/* 9. Signature / Bank */}
                <td className="border border-black p-1">
                  <div className="text-[7.5px] text-neutral-600 uppercase font-medium">
                    {emp.bankDetails?.bank ? "BANK TRANSFER" : "CASH"}
                  </div>
                  <div className="text-[8px] font-semibold uppercase mt-0.5 truncate max-w-[100px]">
                    {emp.bankDetails?.bank || "--"}
                  </div>
                  <div className="text-[7.5px] text-neutral-600 truncate max-w-[100px]">
                    {emp.bankDetails?.account_number || "--"}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Totals Summary Row */}
          <tr className="border-t-2 border-black font-bold bg-neutral-100 text-[8.5px]">
            <td colSpan={2} className="border border-black p-1 text-center uppercase font-black">
              Total ({data.employeeData.length} Employees)
            </td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1 text-right font-black">
              {formatNumber(roundToNearest(totalGross))}
            </td>
            <td className="border border-black p-1">
              <div className="grid grid-cols-12 text-right">
                <div className="col-span-7 text-[7.5px] pr-1">
                  PF: {formatNumber(roundToNearest(totalPf))}<br />
                  ESI: {formatNumber(roundToNearest(totalEsi))}
                </div>
                <div className="col-span-5 font-black text-[9px]">
                  {formatNumber(roundToNearest(totalDed))}
                </div>
              </div>
            </td>
            <td className="border border-black p-1 text-center font-black text-[10px]">
              ₹{formatNumber(roundToNearest(totalNet))}
            </td>
            <td className="border border-black p-1"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * PDF Generator for Statutory Salary Register (Landscape A4)
 */
export async function generateSalaryRegisterPdf(data: SalaryRegisterDataType): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 Landscape Dimensions: 841.89 x 595.28 points
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  const clientAddress = [
    data.companyData?.address_line_1,
    data.companyData?.address_line_2,
    data.companyData?.city,
    data.companyData?.state,
    data.companyData?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const EMPLOYEES_PER_PAGE = 4;
  const totalPages = Math.ceil(data.employeeData.length / EMPLOYEES_PER_PAGE) || 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    let currentY = pageHeight - margin;

    // --- Header Section ---
    const headerHeight = 70;

    // Left Column: Establishment
    page.drawText("Name & Add of Establishment", { x: margin, y: currentY, size: 7, font });
    page.drawText(CANNY_MANAGEMENT_SERVICES_NAME, { x: margin, y: currentY - 10, size: 9, font: fontBold });
    
    const addrLines = [
      CANNY_MANAGEMENT_SERVICES_ADDRESS.slice(0, 50),
      CANNY_MANAGEMENT_SERVICES_ADDRESS.slice(50, 100),
    ].filter(Boolean);
    addrLines.forEach((l, i) => {
      page.drawText(l, { x: margin, y: currentY - 20 - i * 8, size: 6.5, font });
    });

    page.drawText("P.F.No :- GJNRD61115", { x: margin, y: currentY - 38, size: 7, font: fontBold });
    page.drawText("ESI No :- 37000280740001000", { x: margin + 110, y: currentY - 38, size: 7, font: fontBold });

    // Middle Column: Title & Statutory Rules
    const centerX = pageWidth / 2;
    const paymentDateText = `Payment Date :- ${data.paymentDate || formatDate(new Date())}`;
    const pDateWidth = font.widthOfTextAtSize(paymentDateText, 7);
    page.drawText(paymentDateText, { x: centerX - pDateWidth / 2, y: currentY, size: 7, font });

    const titleText = "Salary Register";
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 12);
    page.drawText(titleText, { x: centerX - titleWidth / 2, y: currentY - 12, size: 12, font: fontBold });

    const monthText = `Month :- ${data.month} - ${data.year}`;
    const monthWidth = fontBold.widthOfTextAtSize(monthText, 9);
    page.drawText(monthText, { x: centerX - monthWidth / 2, y: currentY - 24, size: 9, font: fontBold });

    const rules = [
      "(1) Form under Rule - 6 of Equal Remuneration Rules 1976",
      "(2) Form under Rule - 21(4),25(2),26(1) and 26(2) of Gujarat Minimum Wages Rules 1961",
      "(3) Form under Rule - 6 of Payment of Wages Gujarat Rules, 1963",
      "(4) Form 17 under Rule - 78 of Contract Labour (Regulation & Abolition) Gujarat, Rules,1972",
      "(5) Form under Rule - 52(2) of Inter State Migrant Workers (Gujarat) Rules 1981",
    ];
    rules.forEach((r, i) => {
      const rWidth = font.widthOfTextAtSize(r, 6);
      page.drawText(r, { x: centerX - rWidth / 2, y: currentY - 33 - i * 7, size: 6, font });
    });

    // Right Column: Contractor/Unit/Site
    const rightX = pageWidth - margin - 220;
    page.drawText("Contractor/Unit/Site", { x: rightX, y: currentY, size: 7, font });
    const compName = data.companyData?.name || "BAOXHIN INDIA PRIVATE LIMITED";
    page.drawText(compName.slice(0, 40), { x: rightX, y: currentY - 10, size: 9, font: fontBold });

    const clientAddrLines = [
      clientAddress.slice(0, 45),
      clientAddress.slice(45, 90),
    ].filter(Boolean);
    clientAddrLines.forEach((l, i) => {
      page.drawText(l, { x: rightX, y: currentY - 20 - i * 8, size: 6.5, font });
    });

    currentY -= headerHeight;

    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: pageWidth - margin, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    const colWidths = [
      24,  // 0: Sr No
      175, // 1: Employee Details
      65,  // 2: Working Details
      75,  // 3: Rate
      75,  // 4: Earnings
      70,  // 5: Gross / Wages
      115, // 6: Deductions
      65,  // 7: Net Salary
      138, // 8: Signature
    ];

    const colX: number[] = [margin];
    for (let i = 0; i < colWidths.length; i++) {
      colX.push(colX[i] + colWidths[i]);
    }

    const tableHeaderHeight = 32;
    page.drawRectangle({
      x: margin,
      y: currentY - tableHeaderHeight,
      width: contentWidth,
      height: tableHeaderHeight,
      color: rgb(0.95, 0.95, 0.95),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });

    for (let i = 1; i < colX.length - 1; i++) {
      page.drawLine({
        start: { x: colX[i], y: currentY },
        end: { x: colX[i], y: currentY - tableHeaderHeight },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
    }

    page.drawText("Sr.", { x: colX[0] + 5, y: currentY - 12, size: 6.5, font: fontBold });
    page.drawText("No.", { x: colX[0] + 4, y: currentY - 20, size: 6.5, font: fontBold });

    page.drawText("Employee Name", { x: colX[1] + 4, y: currentY - 9, size: 7, font: fontBold });
    page.drawText("Employee Id                  UAN No.", { x: colX[1] + 4, y: currentY - 17, size: 6, font });
    page.drawText("Department / Designation / PF & ESI", { x: colX[1] + 4, y: currentY - 25, size: 6, font });

    page.drawText("Working Details", { x: colX[2] + 4, y: currentY - 16, size: 6.5, font: fontBold });
    page.drawText("Rate", { x: colX[3] + 25, y: currentY - 16, size: 7, font: fontBold });
    page.drawText("Earnings", { x: colX[4] + 18, y: currentY - 16, size: 7, font: fontBold });

    page.drawText("Gross Salary", { x: colX[5] + 8, y: currentY - 9, size: 6.5, font: fontBold });
    page.drawText("PF / ESI Wages", { x: colX[5] + 6, y: currentY - 20, size: 6, font });

    page.drawText("Deduction (Components | Gross)", { x: colX[6] + 4, y: currentY - 16, size: 6.5, font: fontBold });
    page.drawText("Net Salary", { x: colX[7] + 10, y: currentY - 12, size: 7, font: fontBold });
    page.drawText("Payable Rs.", { x: colX[7] + 8, y: currentY - 20, size: 6, font });

    page.drawText("Signature / Thumb Impression", { x: colX[8] + 4, y: currentY - 12, size: 6.5, font: fontBold });
    page.drawText("payment mode / bank name", { x: colX[8] + 4, y: currentY - 20, size: 6, font });

    currentY -= tableHeaderHeight;

    const pageEmployees = data.employeeData.slice(
      pageIdx * EMPLOYEES_PER_PAGE,
      (pageIdx + 1) * EMPLOYEES_PER_PAGE,
    );

    const rowHeight = 105;

    pageEmployees.forEach((emp, empIdx) => {
      const globalIdx = pageIdx * EMPLOYEES_PER_PAGE + empIdx;
      const c = parseEmployeeComponents(emp);

      page.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });

      for (let i = 1; i < colX.length - 1; i++) {
        page.drawLine({
          start: { x: colX[i], y: currentY },
          end: { x: colX[i], y: currentY - rowHeight },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }

      const rowTop = currentY - 10;

      page.drawText(`${globalIdx + 1}`, { x: colX[0] + 8, y: rowTop - 40, size: 8, font: fontBold });

      const fullName = `${emp.employeeData?.first_name || ""} ${emp.employeeData?.middle_name || ""} ${emp.employeeData?.last_name || ""}`.trim().toUpperCase();
      page.drawText(fullName.slice(0, 30), { x: colX[1] + 4, y: rowTop, size: 7.5, font: fontBold });
      
      const empCode = emp.employeeData?.employee_code || "--";
      const uan = emp.employeeStatutoryDetails?.uan_number || "--";
      page.drawText(`${empCode}`, { x: colX[1] + 4, y: rowTop - 11, size: 6.5, font });
      page.drawText(`${uan}`, { x: colX[1] + 85, y: rowTop - 11, size: 6.5, font });

      const dept = (emp.employeeProjectAssignmentData?.department || "--").toUpperCase();
      page.drawText(dept.slice(0, 32), { x: colX[1] + 4, y: rowTop - 22, size: 6.5, font });

      const desig = replaceUnderscore(emp.employeeProjectAssignmentData?.position || "--").toUpperCase();
      page.drawText(desig.slice(0, 32), { x: colX[1] + 4, y: rowTop - 33, size: 6.5, font: fontBold });

      const pfNo = emp.employeeStatutoryDetails?.pf_number || "--";
      page.drawText(pfNo.slice(0, 32), { x: colX[1] + 4, y: rowTop - 46, size: 6, font });

      const esicNo = emp.employeeStatutoryDetails?.esic_number || "--";
      page.drawText(esicNo.slice(0, 32), { x: colX[1] + 4, y: rowTop - 56, size: 6, font });

      const att = emp.attendance || {};
      const wd = att.working_days || 26;
      const wo = att.weekly_off ?? 4;
      const ph = att.paid_holidays ?? 0;
      const pd = att.paid_days ?? 0;
      const pl = att.paid_leaves ?? 0;
      const cl = att.casual_leaves ?? 0;
      const sl = 0;
      const ab = att.absents ?? 0;
      const tot = pd;

      const workingRows = [
        ["WD", `${formatNumber(wd)}.00`],
        ["WO", `${formatNumber(wo)}.00`],
        ["PH", `${formatNumber(ph)}.00`],
        ["PD", `${formatNumber(pd)}.00`],
        ["PL", `${formatNumber(pl)}.00`],
        ["CL", `${formatNumber(cl)}.00`],
        ["SL", `${formatNumber(sl)}.00`],
        ["AB", `${formatNumber(ab)}.00`],
      ];
      workingRows.forEach(([lbl, val], rIdx) => {
        page.drawText(lbl, { x: colX[2] + 4, y: rowTop - rIdx * 9.5, size: 6, font });
        page.drawText(val, { x: colX[2] + 32, y: rowTop - rIdx * 9.5, size: 6, font });
      });
      page.drawText("TOT", { x: colX[2] + 4, y: rowTop - 78, size: 6.5, font: fontBold });
      page.drawText(`${formatNumber(tot)}.00`, { x: colX[2] + 30, y: rowTop - 78, size: 6.5, font: fontBold });

      const rateRows = [
        ["Consol.BASIC", `${c.basicRate > 0 ? formatNumber(c.basicRate) : "0.00"}`],
        ["HRA", `${c.hraRate > 0 ? formatNumber(c.hraRate) : "0.00"}`],
        ["OT AMT", "0.00"],
        ["BONUS", "0.00"],
        ["TRANS.EXP", `${c.transRate > 0 ? formatNumber(c.transRate) : "0.00"}`],
        ["OTH.All", `${c.othRate > 0 ? formatNumber(c.othRate) : "0.00"}`],
        ["OT Hrs/Day", ""],
        ["DA/Arrears", "0.00"],
      ];
      rateRows.forEach(([lbl, val], rIdx) => {
        page.drawText(lbl, { x: colX[3] + 3, y: rowTop - rIdx * 9.5, size: 5.5, font });
        if (val) page.drawText(val, { x: colX[3] + 42, y: rowTop - rIdx * 9.5, size: 5.5, font });
      });
      page.drawText("TOT", { x: colX[3] + 3, y: rowTop - 78, size: 6, font: fontBold });
      page.drawText(`${formatNumber(c.totalRate)}.00`, { x: colX[3] + 38, y: rowTop - 78, size: 6, font: fontBold });

      const earnRows = [
        ["Consol.BASIC", `${c.basicEarned > 0 ? formatNumber(roundToNearest(c.basicEarned)) : "0"}`],
        ["HRA", `${c.hraEarned > 0 ? formatNumber(roundToNearest(c.hraEarned)) : "0"}`],
        ["OT AMT", `${c.otEarned > 0 ? formatNumber(roundToNearest(c.otEarned)) : "0"}`],
        ["BONUS", `${c.bonusEarned > 0 ? formatNumber(roundToNearest(c.bonusEarned)) : "0"}`],
        ["TRANS.EXP", `${c.transEarned > 0 ? formatNumber(roundToNearest(c.transEarned)) : "0"}`],
        ["OTH.All", `${c.othEarned > 0 ? formatNumber(roundToNearest(c.othEarned)) : "0"}`],
        ["DA/Arrears", `${c.daEarned > 0 ? formatNumber(roundToNearest(c.daEarned)) : "0"}`],
      ];
      earnRows.forEach(([lbl, val], rIdx) => {
        page.drawText(lbl, { x: colX[4] + 3, y: rowTop - rIdx * 10.5, size: 5.5, font });
        page.drawText(val, { x: colX[4] + 48, y: rowTop - rIdx * 10.5, size: 5.5, font });
      });

      page.drawText(`${formatNumber(roundToNearest(c.grossSalary))}`, { x: colX[5] + 25, y: rowTop, size: 8, font: fontBold });
      page.drawText(`${formatNumber(roundToNearest(c.pfWages))}`, { x: colX[5] + 25, y: rowTop - 30, size: 6.5, font });
      page.drawText(`${formatNumber(roundToNearest(c.esiWages))}`, { x: colX[5] + 25, y: rowTop - 55, size: 6.5, font });

      const dedRows = [
        ["P.F", `${c.pfDed > 0 ? formatNumber(roundToNearest(c.pfDed)) : "0"}`],
        ["ESI", `${c.esiDed > 0 ? formatNumber(roundToNearest(c.esiDed)) : "0"}`],
        ["IT", `${c.itDed > 0 ? formatNumber(roundToNearest(c.itDed)) : "0"}`],
        ["P.T.", `${c.ptDed > 0 ? formatNumber(roundToNearest(c.ptDed)) : "0"}`],
        ["Loan", `${c.loanDed > 0 ? formatNumber(roundToNearest(c.loanDed)) : "0"}`],
        ["Advn.", `${c.advDed > 0 ? formatNumber(roundToNearest(c.advDed)) : "0"}`],
        ["LWF", `${c.lwfDed > 0 ? formatNumber(roundToNearest(c.lwfDed)) : "0"}`],
      ];
      dedRows.forEach(([lbl, val], rIdx) => {
        page.drawText(lbl, { x: colX[6] + 4, y: rowTop - rIdx * 10, size: 6, font });
        page.drawText(val, { x: colX[6] + 32, y: rowTop - rIdx * 10, size: 6, font });
      });
      page.drawLine({
        start: { x: colX[6] + 62, y: currentY },
        end: { x: colX[6] + 62, y: currentY - rowHeight },
        thickness: 0.3,
        color: rgb(0.7, 0.7, 0.7),
      });
      page.drawText(`${formatNumber(roundToNearest(c.totalDeductions))}`, { x: colX[6] + 70, y: rowTop - 30, size: 8, font: fontBold });

      page.drawText(`${formatNumber(roundToNearest(c.netPay))}`, { x: colX[7] + 12, y: rowTop - 30, size: 9, font: fontBold });

      const payMode = emp.bankDetails?.bank ? "BANK TRANSFER" : "CASH";
      page.drawText(payMode, { x: colX[8] + 4, y: rowTop, size: 6.5, font });
      const bankName = (emp.bankDetails?.bank || "--").toUpperCase();
      page.drawText(bankName.slice(0, 24), { x: colX[8] + 4, y: rowTop - 12, size: 6.5, font: fontBold });
      const accNo = String(emp.bankDetails?.account_number || "--");
      page.drawText(accNo.slice(0, 24), { x: colX[8] + 4, y: rowTop - 24, size: 6.5, font });

      currentY -= rowHeight;
    });

    page.drawText(`Page ${pageIdx + 1} of ${totalPages}`, {
      x: pageWidth - margin - 60,
      y: margin - 10,
      size: 7,
      font,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
