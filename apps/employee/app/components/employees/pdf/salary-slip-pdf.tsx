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

export function formatDoj(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatCompanyAddress(companyData?: any): string {
  if (!companyData) return "";
  const parts = [
    companyData.address_line_1,
    companyData.address_line_2,
    companyData.city,
    companyData.state,
    companyData.pincode,
  ].filter(Boolean);
  return parts.join(", ");
}

export function formatRupeesWords(amount: number): string {
  const rawWords = numberToWordsIndian(roundToNearest(Number(amount)));
  if (!rawWords) return "";
  const titleCase = rawWords
    .split(/\s+/)
    .map((w) =>
      w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "",
    )
    .join(" ");
  return `${titleCase} Only`;
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

export type DataType = {
  month: string;
  year: number;
  companyData: Partial<CompanyDatabaseRow & LocationDatabaseRow> & {
    company_salary_prefix?: string | null;
    show_employer_contribution?: boolean | null;
  };
  employee: {
    bankDetails: { bank: string; account_number: number | string } | null;
    employeeData: Partial<EmployeeDatabaseRow> & {
      date_of_joining?: string | null;
    };
    employeeProjectAssignmentData: any;
    employeeStatutoryDetails: EmployeeStatutoryDetailsDatabaseRow | null;
    attendance: {
      working_days?: number | null;
      weekly_off?: number | null;
      paid_holidays?: number | null;
      paid_days?: number | null;
      present_days?: number | null;
      paid_leaves?: number | null;
      casual_leaves?: number | null;
      absents?: number | null;
      overtime_hours?: number | null;
      cl?: number | null;
      pl?: number | null;
      sl?: number | null;
      ml?: number | null;
      lwp?: number | null;
      [key: string]: any;
    } | any;
    earnings: { name: string; amount: number; actual?: number }[];
    deductions: { name: string; amount: number }[];
    employerContributions?: { name: string; amount: number }[];
    netPay?: number | null;
    actualWages?: number | null;
  };
};

export function sortEarnings<T extends { name: string; amount?: number }>(
  earnings: T[] = [],
): T[] {
  if (!earnings || !Array.isArray(earnings)) return [];
  return [...earnings];
}

export function sortDeductions<T extends { name: string; amount?: number }>(
  deductions: T[] = [],
): T[] {
  if (!deductions || !Array.isArray(deductions)) return [];
  return [...deductions];
}

export function sortEmployerContributions<
  T extends { name: string; amount?: number },
>(contribs: T[] = []): T[] {
  if (!contribs || !Array.isArray(contribs)) return [];
  return [...contribs];
}

export function ensureStandardDeductionsAndContribs(
  deductions: { name: string; amount: number }[] = [],
  employerContributions: { name: string; amount: number }[] = [],
) {
  return {
    deductions,
    employerContributions,
  };
}

export function formatEmployerContribName(name: string): string {
  return (name || "").toUpperCase();
}

export function formatEarningName(name: string): string {
  return (name || "").toUpperCase();
}

export function formatDeductionName(name: string): string {
  return (name || "").toUpperCase();
}

export function toWordsTitleCase(str: string): string {
  if (!str) return "";
  return str.toUpperCase();
}

export function formatStatutoryNo(val?: string | null): string {
  if (!val) return "N/A";
  const trimmed = String(val).trim();
  if (!trimmed || trimmed.toUpperCase() === "NULL" || trimmed === "-") {
    return "N/A";
  }
  return trimmed;
}

export function getCompanyAddressString(
  companyData?: DataType["companyData"],
  employee?: DataType["employee"],
): string {
  const compParts = [
    companyData?.address_line_1,
    companyData?.address_line_2,
    companyData?.city,
    companyData?.state ? formatStateName(companyData.state) : "",
    companyData?.pincode,
  ].filter(Boolean);

  if (compParts.length > 0) {
    return compParts.join(", ");
  }

  const projLoc =
    employee?.employeeProjectAssignmentData?.project_assignment_location ||
    employee?.employeeProjectAssignmentData?.sites?.company_locations;
  if (projLoc) {
    const projParts = [
      projLoc.address_line_1,
      projLoc.address_line_2,
      projLoc.city,
      projLoc.state ? formatStateName(projLoc.state) : "",
      projLoc.pincode,
    ].filter(Boolean);
    if (projParts.length > 0) {
      return projParts.join(", ");
    }
  }

  return "";
}

export function buildSalarySlipData(data: DataType) {
  const emp = data.employee;

  const cleanUpper = (s: string) =>
    String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const hasIndividualEarnings = (emp.earnings || []).some((e) => {
    const c = cleanUpper(e.name);
    return !["ACTUALWAGES", "ACTUALWAGE", "NETPAY", "NETSALARY"].includes(c);
  });

  const rawEarnings = (emp.earnings || []).filter((e) => {
    const c = cleanUpper(e.name);
    if (c === "NETPAY" || c === "NETSALARY") return false;
    if ((c === "ACTUALWAGES" || c === "ACTUALWAGE") && hasIndividualEarnings)
      return false;
    return true;
  });

  const rawDeductions = (emp.deductions || []).filter((d) => {
    const c = cleanUpper(d.name);
    if (
      c === "TOTALDEDUCTIONS" ||
      c === "TOTALDED" ||
      c === "TOTALDEDUCTION"
    )
      return false;
    return true;
  });

  // Working Details Rows (Standard 9 rows matching template)
  const att = emp.attendance || {};
  const workingDays = Number(att.working_days ?? 26);
  const weekoff = 0;
  const payHoliday = Number(att.paid_holidays ?? 0);
  const presentDays = Number(att.present_days ?? att.paid_days ?? 26);
  const cl = Number(att.cl ?? att.casual_leaves ?? 0);
  const pl = Number(att.pl ?? att.paid_leaves ?? 0);
  const sl = Number(att.sl ?? 0);
  const ml = Number(att.ml ?? 0);
  const lwp = Number(att.lwp ?? att.absents ?? 0);

  const workingRows: { label: string; value: string }[] = [
    { label: "Working Days", value: workingDays.toFixed(2) },
    { label: "Weekoff", value: weekoff.toFixed(2) },
    { label: "Pay Holiday", value: payHoliday.toFixed(2) },
    { label: "Present Days", value: presentDays.toFixed(2) },
    { label: "CL", value: cl.toFixed(2) },
    { label: "PL", value: pl.toFixed(2) },
    { label: "SL", value: sl.toFixed(2) },
    { label: "M.L.", value: ml.toFixed(2) },
    { label: "LWP", value: lwp.toFixed(2) },
  ];
  if (att.overtime_hours && Number(att.overtime_hours) > 0) {
    workingRows.push({
      label: "OT Hours",
      value: Number(att.overtime_hours).toFixed(2),
    });
  }

  const totalWorkingDays =
    presentDays + weekoff + payHoliday + cl + pl + sl + ml;

  // Earnings Rows matching standard template order
  const findEarning = (keys: string[]) => {
    return rawEarnings.find((e) => {
      const c = cleanUpper(e.name);
      return keys.some((k) => c === k || c.includes(k));
    });
  };

  const usedEarnings = new Set<string>();

  const basicItem = findEarning(["BASIC"]);
  if (basicItem) usedEarnings.add(basicItem.name);
  const daItem = findEarning(["DA", "VDA", "DEARNESS"]);
  if (daItem) usedEarnings.add(daItem.name);
  const otItem = findEarning(["OVERTIME", "OT", "EXGRAT"]);
  if (otItem) usedEarnings.add(otItem.name);
  const hraItem = findEarning(["HRA", "HOUSERENT"]);
  if (hraItem) usedEarnings.add(hraItem.name);
  const convItem = findEarning(["CONV", "CONVEYANCE", "TRANSPORT"]);
  if (convItem) usedEarnings.add(convItem.name);
  const spAllItem = findEarning(["SPECIAL", "SPALL"]);
  if (spAllItem) usedEarnings.add(spAllItem.name);
  const othAllItem = findEarning(["OTHER", "OTHALL"]);
  if (othAllItem) usedEarnings.add(othAllItem.name);
  const bonusItem = findEarning(["BONUS", "STATUTORYBONUS"]);
  if (bonusItem) usedEarnings.add(bonusItem.name);

  const basicActual =
    emp.actualWages != null
      ? Number(emp.actualWages)
      : basicItem?.amount
        ? Number(basicItem.amount)
        : 0;

  const earningsRows: {
    label: string;
    actual: string;
    payable: string;
    actualNum: number;
    payableNum: number;
  }[] = [
    {
      label: "Basic",
      actual: basicActual > 0 ? basicActual.toFixed(2) : "0.00",
      payable: Number(basicItem?.amount || 0).toFixed(2),
      actualNum: basicActual,
      payableNum: Number(basicItem?.amount || 0),
    },
    {
      label: "DA",
      actual: "0.00",
      payable: Number(daItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(daItem?.amount || 0),
    },
    {
      label: "OT/EX GRAT",
      actual: "",
      payable: Number(otItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(otItem?.amount || 0),
    },
    {
      label: "HRA",
      actual: "0.00",
      payable: Number(hraItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(hraItem?.amount || 0),
    },
    {
      label: "CONV",
      actual: "0.00",
      payable: Number(convItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(convItem?.amount || 0),
    },
    {
      label: "SP.All",
      actual: "0.00",
      payable: Number(spAllItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(spAllItem?.amount || 0),
    },
    {
      label: "OTH.All",
      actual: "0.00",
      payable: Number(othAllItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(othAllItem?.amount || 0),
    },
    {
      label: "BONUS",
      actual: "0.00",
      payable: Number(bonusItem?.amount || 0).toFixed(2),
      actualNum: 0,
      payableNum: Number(bonusItem?.amount || 0),
    },
  ];

  for (const e of rawEarnings) {
    if (!usedEarnings.has(e.name)) {
      const amt = Number(e.amount || 0);
      earningsRows.push({
        label: e.name,
        actual: "0.00",
        payable: amt.toFixed(2),
        actualNum: 0,
        payableNum: amt,
      });
    }
  }

  const grossActual = earningsRows.reduce((acc, r) => acc + r.actualNum, 0);
  const grossPayable = earningsRows.reduce((acc, r) => acc + r.payableNum, 0);

  // Deduction Rows matching standard template order
  const findDeduction = (keys: string[]) => {
    return rawDeductions.find((d) => {
      const c = cleanUpper(d.name);
      return keys.some((k) => c === k || c.includes(k));
    });
  };

  const usedDeductions = new Set<string>();
  const pfItem = findDeduction(["PF", "EPF", "PROVIDENT"]);
  if (pfItem) usedDeductions.add(pfItem.name);
  const esiItem = findDeduction(["ESI", "ESIC", "STATEINSURANCE"]);
  if (esiItem) usedDeductions.add(esiItem.name);
  const ptItem = findDeduction(["PT", "PROFESSIONALTAX", "PROFTAX"]);
  if (ptItem) usedDeductions.add(ptItem.name);
  const itItem = findDeduction(["IT", "TDS", "INCOMETAX", "TAX"]);
  if (itItem) usedDeductions.add(itItem.name);
  const lwfItem = findDeduction(["LWF", "WELFARE", "LABOURWELFARE"]);
  if (lwfItem) usedDeductions.add(lwfItem.name);
  const advItem = findDeduction(["ADVANCE"]);
  if (advItem) usedDeductions.add(advItem.name);
  const loanItem = findDeduction(["LOAN", "LOANINST"]);
  if (loanItem) usedDeductions.add(loanItem.name);
  const foodItem = findDeduction(["FOOD", "CANTEEN", "MESS"]);
  if (foodItem) usedDeductions.add(foodItem.name);
  const othDedItem = findDeduction(["OTHER", "OTHDED", "MISC"]);
  if (othDedItem) usedDeductions.add(othDedItem.name);
  const embillItem = findDeduction(["EMBILL", "ELECTRICITY", "MOBILE", "BILL"]);
  if (embillItem) usedDeductions.add(embillItem.name);

  const fmtDed = (item: any) => {
    const val = Number(item?.amount || 0);
    return val > 0 ? val.toFixed(2) : "";
  };

  const deductionRows: { label: string; amount: string; num: number }[] = [
    { label: "P.F", amount: fmtDed(pfItem), num: Number(pfItem?.amount || 0) },
    { label: "ESI", amount: fmtDed(esiItem), num: Number(esiItem?.amount || 0) },
    { label: "P.T.", amount: fmtDed(ptItem), num: Number(ptItem?.amount || 0) },
    { label: "I.T.", amount: fmtDed(itItem), num: Number(itItem?.amount || 0) },
    { label: "L.W.F", amount: fmtDed(lwfItem), num: Number(lwfItem?.amount || 0) },
    {
      label: "Advance",
      amount: fmtDed(advItem),
      num: Number(advItem?.amount || 0),
    },
    {
      label: "Loan Inst.",
      amount: fmtDed(loanItem),
      num: Number(loanItem?.amount || 0),
    },
    { label: "Food", amount: fmtDed(foodItem), num: Number(foodItem?.amount || 0) },
    {
      label: "Oth.Ded",
      amount: fmtDed(othDedItem),
      num: Number(othDedItem?.amount || 0),
    },
    {
      label: "E/Mbill",
      amount: fmtDed(embillItem),
      num: Number(embillItem?.amount || 0),
    },
  ];

  for (const d of rawDeductions) {
    if (!usedDeductions.has(d.name)) {
      const val = Number(d.amount || 0);
      deductionRows.push({
        label: d.name,
        amount: val > 0 ? val.toFixed(2) : "",
        num: val,
      });
    }
  }

  const totalDeductions = deductionRows.reduce((acc, r) => acc + r.num, 0);

  // Employer Contribution Rows
  const showEmployerContrib = Boolean(
    data.companyData?.show_employer_contribution,
  );

  const rawEmployerContribs = showEmployerContrib
    ? [...(emp.employerContributions || [])]
    : [];

  if (showEmployerContrib && rawEmployerContribs.length === 0) {
    for (const d of rawDeductions) {
      const c = cleanUpper(d.name);
      const amt = Number(d.amount || 0);
      if (amt <= 0) continue;
      if (
        c === "PF" ||
        c === "EPF" ||
        c.includes("PROVIDENT") ||
        c.startsWith("PF")
      ) {
        rawEmployerContribs.push({
          name: "PF",
          amount: Math.round((amt * 13) / 12),
        });
      } else if (
        c === "ESI" ||
        c === "ESIC" ||
        c.includes("STATEINSURANCE") ||
        c.startsWith("ESI")
      ) {
        rawEmployerContribs.push({
          name: "ESIC",
          amount: Math.round((amt * 3.25) / 0.75),
        });
      }
    }
  }

  const findContrib = (keys: string[]) => {
    return rawEmployerContribs.find((c) => {
      const u = cleanUpper(c.name);
      return keys.some((k) => u === k || u.includes(k));
    });
  };

  const usedContribs = new Set<string>();
  const pfContrib = findContrib(["PF", "EPF", "PROVIDENT"]);
  if (pfContrib) usedContribs.add(pfContrib.name);
  const esiContrib = findContrib(["ESI", "ESIC", "STATEINSURANCE"]);
  if (esiContrib) usedContribs.add(esiContrib.name);
  const lwfContrib = findContrib(["LWF", "WELFARE", "LABOURWELFARE"]);
  if (lwfContrib) usedContribs.add(lwfContrib.name);

  const fmtContrib = (item: any) => {
    const val = Number(item?.amount || 0);
    return val > 0 ? val.toFixed(2) : "";
  };

  const employerContribRows: { label: string; amount: string; num: number }[] =
    showEmployerContrib
      ? [
          {
            label: "P.F",
            amount: fmtContrib(pfContrib),
            num: Number(pfContrib?.amount || 0),
          },
          {
            label: "ESI",
            amount: fmtContrib(esiContrib),
            num: Number(esiContrib?.amount || 0),
          },
          {
            label: "L.W.F",
            amount: fmtContrib(lwfContrib),
            num: Number(lwfContrib?.amount || 0),
          },
        ]
      : [];

  if (showEmployerContrib) {
    for (const c of rawEmployerContribs) {
      if (!usedContribs.has(c.name)) {
        const val = Number(c.amount || 0);
        employerContribRows.push({
          label: c.name,
          amount: val > 0 ? val.toFixed(2) : "",
          num: val,
        });
      }
    }
  }

  const totalEmployerContribution = employerContribRows.reduce(
    (acc, r) => acc + r.num,
    0,
  );

  const netAmount =
    emp.netPay != null
      ? Number(emp.netPay)
      : grossPayable - totalDeductions;

  return {
    workingRows,
    totalWorkingDays,
    earningsRows,
    grossActual,
    grossPayable,
    deductionRows,
    totalDeductions,
    employerContribRows,
    totalEmployerContribution,
    netAmount,
    showEmployerContrib,
  };
}

/**
 * HTML/React component for rendering salary slip in dialog preview and browser printing
 */
export function SalarySlipPDF({ data }: { data: DataType }) {
  const emp = data.employee;
  const {
    workingRows,
    totalWorkingDays,
    earningsRows,
    grossActual,
    grossPayable,
    deductionRows,
    totalDeductions,
    employerContribRows,
    totalEmployerContribution,
    netAmount,
    showEmployerContrib,
  } = buildSalarySlipData(data);

  const monthShort = data.month ? data.month.slice(0, 3) : "";
  const clientName = data.companyData?.company_salary_prefix
    ? `${data.companyData.company_salary_prefix} ${data.companyData?.name || ""}`
    : data.companyData?.name || "";
  const clientAddress = getCompanyAddressString(data.companyData, data.employee);

  const words = formatRupeesWords(netAmount);

  const maxRows = Math.max(
    workingRows.length,
    earningsRows.length,
    deductionRows.length,
    showEmployerContrib ? employerContribRows.length : 0,
    10,
  );

  const empRowClass = showEmployerContrib
    ? "grid grid-cols-[17%_29%_27%_27%] border-b border-black min-h-[19px] items-stretch"
    : "grid grid-cols-[20%_30%_20%_30%] border-b border-black min-h-[19px] items-stretch";

  return (
    <div className="w-full max-w-[850px] mx-auto bg-white text-black p-6 font-sans text-[11px] leading-tight select-text print:p-0 print:m-0">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 pb-2">
        <div className="text-left max-w-[50%]">
          <div className="font-bold text-[13px] text-black tracking-tight uppercase">
            {CANNY_MANAGEMENT_SERVICES_NAME.toUpperCase()}
          </div>
          <div className="text-[10px] text-black mt-0.5 leading-tight">
            {CANNY_MANAGEMENT_SERVICES_ADDRESS}
          </div>
        </div>
        <div className="text-right max-w-[50%]">
          <div className="font-bold text-[13px] text-black tracking-tight uppercase">
            {clientName.toUpperCase()}
          </div>
          {clientAddress && (
            <div className="text-[10px] text-black mt-0.5 leading-tight">
              {clientAddress}
            </div>
          )}
        </div>
      </div>

      {/* Subheader */}
      <div className="relative flex items-center justify-between py-1.5 my-0.5">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-bold text-[13px] text-black">Salary Slip</span>
        </div>
        <div className="ml-auto font-bold text-[11px] text-black">
          Salary for the month of :- {monthShort}- {data.year}
        </div>
      </div>

      {/* Unified Table Container */}
      <div className="border border-black text-[10px]">
        {/* Table 1: Employee Details (6 rows) */}
        {/* Row 1 */}
        <div className={empRowClass}>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            Emp.Id
          </div>
          <div className="px-2 py-0.5 font-bold border-r border-black uppercase truncate text-black flex items-center">
            {emp.employeeData?.employee_code || ""}
          </div>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            P.F. No.
          </div>
          <div className="px-2 py-0.5 font-bold uppercase truncate text-black flex items-center">
            {formatStatutoryNo(emp.employeeStatutoryDetails?.pf_number)}
          </div>
        </div>
        {/* Row 2 */}
        <div className={empRowClass}>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            Emp. Name
          </div>
          <div className="px-2 py-0.5 font-bold border-r border-black uppercase truncate text-black flex items-center">
            {[
              emp.employeeData?.first_name,
              emp.employeeData?.middle_name,
              emp.employeeData?.last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .toUpperCase()}
          </div>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            UAN No.
          </div>
          <div className="px-2 py-0.5 font-bold uppercase truncate text-black flex items-center">
            {formatStatutoryNo(emp.employeeStatutoryDetails?.uan_number)}
          </div>
        </div>
        {/* Row 3 */}
        <div className={empRowClass}>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            Designation
          </div>
          <div className="px-2 py-0.5 font-bold border-r border-black uppercase truncate text-black flex items-center">
            {replaceUnderscore(
              emp.employeeProjectAssignmentData?.position || "",
            ).toUpperCase()}
          </div>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            ESI No.
          </div>
          <div className="px-2 py-0.5 font-bold uppercase truncate text-black flex items-center">
            {formatStatutoryNo(emp.employeeStatutoryDetails?.esic_number)}
          </div>
        </div>
        {/* Row 4 */}
        <div className={empRowClass}>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            Department
          </div>
          <div className="px-2 py-0.5 font-bold border-r border-black uppercase truncate text-black flex items-center">
            {replaceUnderscore(
              emp.employeeProjectAssignmentData?.department || "",
            ).toUpperCase()}
          </div>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            Bank
          </div>
          <div className="px-2 py-0.5 font-bold uppercase truncate text-black flex items-center">
            {(emp.bankDetails?.bank || "").toUpperCase()}
          </div>
        </div>
        {/* Row 5 */}
        <div className={empRowClass}>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            Location
          </div>
          <div className="px-2 py-0.5 font-bold border-r border-black uppercase truncate text-black flex items-center">
            {(
              emp.employeeProjectAssignmentData?.location ||
              emp.employeeProjectAssignmentData?.site ||
              ""
            ).toUpperCase()}
          </div>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            A/c No
          </div>
          <div className="px-2 py-0.5 font-bold uppercase truncate text-black flex items-center">
            {emp.bankDetails?.account_number || ""}
          </div>
        </div>
        {/* Row 6 */}
        <div className={empRowClass}>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            D.O.J
          </div>
          <div className="px-2 py-0.5 font-bold border-r border-black truncate text-black flex items-center">
            {formatDoj(
              emp.employeeData?.date_of_joining ||
                emp.employeeProjectAssignmentData?.start_date,
            )}
          </div>
          <div className="px-2 py-0.5 border-r border-black text-black font-normal flex items-center">
            PAN No
          </div>
          <div className="px-2 py-0.5 font-bold uppercase truncate text-black flex items-center">
            {emp.employeeStatutoryDetails?.pan_number || ""}
          </div>
        </div>

        {/* Table 2 */}
        {showEmployerContrib ? (
          <>
            {/* Header Row 1 */}
            <div className="grid grid-cols-[17%_16%_13%_14%_13%_14%_13%] bg-[#D9E8F5] font-bold text-center border-b border-black min-h-[22px] items-stretch">
              <div className="py-1 border-r border-black flex items-center justify-center">
                WORKING DETAILS
              </div>
              <div className="col-span-2 py-1 border-r border-black flex items-center justify-center">
                EARNINGS DETAILS
              </div>
              <div className="col-span-2 py-1 border-r border-black flex items-center justify-center">
                DEDUCTION DETAILS
              </div>
              <div className="col-span-2 py-1 flex items-center justify-center">
                EMPLOYER CONTRIBUTION
              </div>
            </div>

            {/* Header Row 2 */}
            <div className="grid grid-cols-[17%_16%_13%_14%_13%_14%_13%] border-b border-black text-center font-bold min-h-[19px] items-stretch">
              <div className="border-r border-black py-0.5"></div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Earnings
              </div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Amount
              </div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Deduction
              </div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Amount
              </div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Contribution
              </div>
              <div className="py-0.5 flex items-center justify-center">
                Amount
              </div>
            </div>

            {/* Data Rows */}
            <div>
              {Array.from({ length: maxRows }).map((_, idx) => {
                const wRow = workingRows[idx];
                const eRow = earningsRows[idx];
                const dRow = deductionRows[idx];
                const cRow = employerContribRows[idx];

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[17%_16%_13%_14%_13%_14%_13%] text-[10px] items-stretch min-h-[19px] leading-tight"
                  >
                    {/* Working Details */}
                    <div className="flex justify-between items-center px-2 py-0.5 border-r border-black">
                      <span>{wRow?.label || ""}</span>
                      <span>{wRow?.value || ""}</span>
                    </div>
                    {/* Earnings Name */}
                    <div className="px-2 py-0.5 border-r border-black truncate flex items-center">
                      {eRow?.label || ""}
                    </div>
                    {/* Earnings Amount */}
                    <div className="px-2 py-0.5 text-right border-r border-black flex items-center justify-end">
                      {eRow?.payable || ""}
                    </div>
                    {/* Deduction Name */}
                    <div className="px-2 py-0.5 border-r border-black truncate flex items-center">
                      {dRow?.label || ""}
                    </div>
                    {/* Deduction Amount */}
                    <div className="px-2 py-0.5 text-right border-r border-black flex items-center justify-end">
                      {dRow?.amount || ""}
                    </div>
                    {/* Employer Contrib Name */}
                    <div className="px-2 py-0.5 border-r border-black truncate flex items-center">
                      {cRow?.label || ""}
                    </div>
                    {/* Employer Contrib Amount */}
                    <div className="px-2 py-0.5 text-right flex items-center justify-end">
                      {cRow?.amount || ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals Row */}
            <div className="grid grid-cols-[17%_16%_13%_14%_13%_14%_13%] border-t border-b border-black font-bold items-stretch min-h-[22px]">
              <div className="flex justify-between items-center px-2 py-1 border-r border-black">
                <span>TOTAL</span>
                <span>{totalWorkingDays.toFixed(2)}</span>
              </div>
              <div className="px-2 py-1 border-r border-black flex items-center">
                Gross Income
              </div>
              <div className="px-2 py-1 text-right border-r border-black flex items-center justify-end">
                {grossPayable.toFixed(2)}
              </div>
              <div className="px-2 py-1 border-r border-black flex items-center">
                Total Deduction
              </div>
              <div className="px-2 py-1 text-right border-r border-black flex items-center justify-end">
                {totalDeductions.toFixed(2)}
              </div>
              <div className="px-2 py-1 border-r border-black flex items-center">
                Total Contrib.
              </div>
              <div className="px-2 py-1 text-right flex items-center justify-end">
                {totalEmployerContribution.toFixed(2)}
              </div>
            </div>

            {/* Net Amount & In Words Row */}
            <div className="grid grid-cols-[17%_16%_13%_14%_13%_14%_13%] border-b border-black items-stretch min-h-[24px]">
              <div className="col-span-5 flex items-center px-2 py-1 border-r border-black">
                <span className="text-black font-normal mr-3">Rupees</span>
                <span className="italic font-serif text-[10.5px] tracking-wide text-black truncate">
                  {words}
                </span>
              </div>
              <div className="bg-[#D9E8F5] flex items-center justify-center font-bold px-2 py-1 border-r border-black text-center">
                Net Amount
              </div>
              <div className="bg-[#D9E8F5] flex items-center justify-end font-bold px-2 py-1 text-right whitespace-nowrap">
                Rs. {netAmount.toFixed(2)}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Header Row 1 (3 Sections: 20% 40% 40%) */}
            <div className="grid grid-cols-[20%_24%_16%_24%_16%] bg-[#D9E8F5] font-bold text-center border-b border-black min-h-[22px] items-stretch">
              <div className="py-1 border-r border-black flex items-center justify-center">
                WORKING DETAILS
              </div>
              <div className="col-span-2 py-1 border-r border-black flex items-center justify-center">
                EARNINGS DETAILS
              </div>
              <div className="col-span-2 py-1 flex items-center justify-center">
                DEDUCTION DETAILS
              </div>
            </div>

            {/* Header Row 2 */}
            <div className="grid grid-cols-[20%_24%_16%_24%_16%] border-b border-black text-center font-bold min-h-[19px] items-stretch">
              <div className="border-r border-black py-0.5"></div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Earnings
              </div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Amount
              </div>
              <div className="py-0.5 border-r border-black flex items-center justify-center">
                Deduction
              </div>
              <div className="py-0.5 flex items-center justify-center">
                Amount
              </div>
            </div>

            {/* Data Rows */}
            <div>
              {Array.from({ length: maxRows }).map((_, idx) => {
                const wRow = workingRows[idx];
                const eRow = earningsRows[idx];
                const dRow = deductionRows[idx];

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[20%_24%_16%_24%_16%] text-[10px] items-stretch min-h-[19px] leading-tight"
                  >
                    {/* Working Details */}
                    <div className="flex justify-between items-center px-2 py-0.5 border-r border-black">
                      <span>{wRow?.label || ""}</span>
                      <span>{wRow?.value || ""}</span>
                    </div>
                    {/* Earnings Name */}
                    <div className="px-2 py-0.5 border-r border-black truncate flex items-center">
                      {eRow?.label || ""}
                    </div>
                    {/* Earnings Amount */}
                    <div className="px-2 py-0.5 text-right border-r border-black flex items-center justify-end">
                      {eRow?.payable || ""}
                    </div>
                    {/* Deduction Name */}
                    <div className="px-2 py-0.5 border-r border-black truncate flex items-center">
                      {dRow?.label || ""}
                    </div>
                    {/* Deduction Amount */}
                    <div className="px-2 py-0.5 text-right flex items-center justify-end">
                      {dRow?.amount || ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals Row */}
            <div className="grid grid-cols-[20%_24%_16%_24%_16%] border-t border-b border-black font-bold items-stretch min-h-[22px]">
              <div className="flex justify-between items-center px-2 py-1 border-r border-black">
                <span>TOTAL</span>
                <span>{totalWorkingDays.toFixed(2)}</span>
              </div>
              <div className="px-2 py-1 border-r border-black flex items-center">
                Gross Income
              </div>
              <div className="px-2 py-1 text-right border-r border-black flex items-center justify-end">
                {grossPayable.toFixed(2)}
              </div>
              <div className="px-2 py-1 border-r border-black flex items-center">
                Total Deduction
              </div>
              <div className="px-2 py-1 text-right flex items-center justify-end">
                {totalDeductions.toFixed(2)}
              </div>
            </div>

            {/* Net Amount & In Words Row */}
            <div className="grid grid-cols-[20%_24%_16%_24%_16%] border-b border-black items-stretch min-h-[24px]">
              <div className="col-span-3 flex items-center px-2 py-1 border-r border-black">
                <span className="text-black font-normal mr-3">Rupees</span>
                <span className="italic font-serif text-[10.5px] tracking-wide text-black truncate">
                  {words}
                </span>
              </div>
              <div className="bg-[#D9E8F5] flex items-center justify-center font-bold px-2 py-1 border-r border-black text-center">
                Net Amount
              </div>
              <div className="bg-[#D9E8F5] flex items-center justify-end font-bold px-2 py-1 text-right whitespace-nowrap">
                Rs. {netAmount.toFixed(2)}
              </div>
            </div>
          </>
        )}

        {/* Disclaimer Row */}
        <div className="text-center text-[9px] py-1 text-black">
          This is computer generated statement hence does not require a
          signature .
        </div>
      </div>

      {/* Dashed line */}
      <div className="border-b-[1.5px] border-dashed border-gray-400 mt-4 w-full"></div>
    </div>
  );
}

/**
 * Pure JavaScript PDF generator using pdf-lib matching the exact layout
 */
export async function generateSalarySlipPdf(
  data: DataType,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { height, width } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 36;
  const tableWidth = width - margin * 2;
  const startY = height - 40;

  const emp = data.employee;
  const {
    workingRows,
    totalWorkingDays,
    earningsRows,
    grossActual,
    grossPayable,
    deductionRows,
    totalDeductions,
    employerContribRows,
    totalEmployerContribution,
    netAmount,
    showEmployerContrib,
  } = buildSalarySlipData(data);

  const monthShort = data.month ? data.month.slice(0, 3) : "";
  const clientName = (
    data.companyData?.company_salary_prefix
      ? `${data.companyData.company_salary_prefix} ${data.companyData?.name || ""}`
      : data.companyData?.name || ""
  ).toUpperCase();
  const clientAddress = getCompanyAddressString(data.companyData, data.employee);

  const words = formatRupeesWords(netAmount);

  // 1. Header Left (Always Canny Management Services)
  page.drawText(CANNY_MANAGEMENT_SERVICES_NAME.toUpperCase(), {
    x: margin,
    y: startY,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const addrLines = wrapText(
    CANNY_MANAGEMENT_SERVICES_ADDRESS,
    tableWidth * 0.48,
    fontRegular,
    7.5,
  );
  let addrY = startY - 11;
  for (const line of addrLines) {
    page.drawText(line.trim(), {
      x: margin,
      y: addrY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });
    addrY -= 9.5;
  }

  // 1. Header Right (Client Name & Address)
  if (clientName) {
    const clientNameW = fontBold.widthOfTextAtSize(clientName, 11);
    page.drawText(clientName, {
      x: margin + tableWidth - clientNameW,
      y: startY,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  let clientAddrY = startY - 11;
  if (clientAddress) {
    const clientAddrLines = wrapText(
      clientAddress,
      tableWidth * 0.48,
      fontRegular,
      7.5,
    );
    for (const line of clientAddrLines) {
      const lineTrim = line.trim();
      const lineW = fontRegular.widthOfTextAtSize(lineTrim, 7.5);
      page.drawText(lineTrim, {
        x: margin + tableWidth - lineW,
        y: clientAddrY,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      clientAddrY -= 9.5;
    }
  }

  // 2. Subheader
  const subY = Math.min(addrY - 4, clientAddrY - 4, startY - 33);
  const slipTitleW = fontBold.widthOfTextAtSize("Salary Slip", 10.5);
  page.drawText("Salary Slip", {
    x: margin + (tableWidth - slipTitleW) / 2,
    y: subY,
    size: 10.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const monthStr = `Salary for the month of :- ${monthShort}- ${data.year}`;
  const monthStrW = fontBold.widthOfTextAtSize(monthStr, 9);
  page.drawText(monthStr, {
    x: margin + tableWidth - monthStrW,
    y: subY,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Table Structure
  const maxRows = Math.max(
    workingRows.length,
    earningsRows.length,
    deductionRows.length,
    showEmployerContrib ? employerContribRows.length : 0,
    10,
  );

  const t1Top = subY - 12;
  const rowH1 = 13.5;
  const t1Height = 6 * rowH1;
  const t1Bottom = t1Top - t1Height;

  const h1H = 14;
  const h2H = 12.5;
  const itemRowH = 12.5;
  const totalsRowH = 13.5;
  const netRowH = 14.5;
  const disclaimerH = 12.5;

  const bodyH = maxRows * itemRowH;
  const t2Height = h1H + h2H + bodyH + totalsRowH + netRowH + disclaimerH;
  const totalTableHeight = t1Height + t2Height;
  const tableBottom = t1Top - totalTableHeight;

  // Single outer border around entire unified table
  page.drawRectangle({
    x: margin,
    y: tableBottom,
    width: tableWidth,
    height: totalTableHeight,
    borderWidth: 0.8,
    borderColor: rgb(0, 0, 0),
    color: rgb(1, 1, 1),
  });

  // Column boundaries
  const colW1 = showEmployerContrib ? tableWidth * 0.17 : tableWidth * 0.20;
  const colW2 = showEmployerContrib ? tableWidth * 0.16 : tableWidth * 0.24;
  const colW3 = showEmployerContrib ? tableWidth * 0.13 : tableWidth * 0.16;
  const colW4 = showEmployerContrib ? tableWidth * 0.14 : tableWidth * 0.24;
  const colW5 = showEmployerContrib ? tableWidth * 0.13 : tableWidth * 0.16;
  const colW6 = showEmployerContrib ? tableWidth * 0.14 : 0;
  const colW7 = showEmployerContrib ? tableWidth * 0.13 : 0;

  const bx0 = margin;
  const bx1 = bx0 + colW1;
  const bx2 = bx1 + colW2;
  const bx3 = bx2 + colW3;
  const bx4 = bx3 + colW4;
  const bx5 = showEmployerContrib ? bx4 + colW5 : margin + tableWidth;
  const bx6 = showEmployerContrib ? bx5 + colW6 : margin + tableWidth;
  const bx7 = margin + tableWidth;

  // Table 1 column boundaries
  const t1x0 = margin;
  const t1x1 = showEmployerContrib ? bx1 : t1x0 + tableWidth * 0.20;
  const t1x2 = showEmployerContrib ? bx3 : t1x1 + tableWidth * 0.30;
  const t1x3 = showEmployerContrib ? bx5 : t1x2 + tableWidth * 0.20;
  const t1x4 = margin + tableWidth;

  const lightBlue = rgb(0.85, 0.91, 0.96);

  // Table 1 (Employee Details Rows - 4 columns)
  const empRows = [
    [
      "Emp.Id",
      emp.employeeData?.employee_code || "",
      "P.F. No.",
      formatStatutoryNo(emp.employeeStatutoryDetails?.pf_number),
    ],
    [
      "Emp. Name",
      [
        emp.employeeData?.first_name,
        emp.employeeData?.middle_name,
        emp.employeeData?.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toUpperCase(),
      "UAN No.",
      formatStatutoryNo(emp.employeeStatutoryDetails?.uan_number),
    ],
    [
      "Designation",
      replaceUnderscore(
        emp.employeeProjectAssignmentData?.position || "",
      ).toUpperCase(),
      "ESI No.",
      formatStatutoryNo(emp.employeeStatutoryDetails?.esic_number),
    ],
    [
      "Department",
      replaceUnderscore(
        emp.employeeProjectAssignmentData?.department || "",
      ).toUpperCase(),
      "Bank",
      (emp.bankDetails?.bank || "").toUpperCase(),
    ],
    [
      "Location",
      (
        emp.employeeProjectAssignmentData?.location ||
        emp.employeeProjectAssignmentData?.site ||
        ""
      ).toUpperCase(),
      "A/c No",
      emp.bankDetails?.account_number || "",
    ],
    [
      "D.O.J",
      formatDoj(
        emp.employeeData?.date_of_joining ||
          emp.employeeProjectAssignmentData?.start_date,
      ),
      "PAN No",
      emp.employeeStatutoryDetails?.pan_number || "",
    ],
  ];

  for (let r = 0; r < 6; r++) {
    const rowY = t1Top - (r + 1) * rowH1;
    const baseLine = rowY + 3.8;
    const [l1, v1, l2, v2] = empRows[r];

    // Horizontal divider for each row
    page.drawLine({
      start: { x: margin, y: rowY },
      end: { x: margin + tableWidth, y: rowY },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });

    page.drawText(l1, {
      x: t1x0 + 4,
      y: baseLine,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    page.drawText(v1.slice(0, 32), {
      x: t1x1 + 4,
      y: baseLine,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    page.drawText(l2, {
      x: t1x2 + 4,
      y: baseLine,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    page.drawText(v2.slice(0, 32), {
      x: t1x3 + 4,
      y: baseLine,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  // Table 2 Header 1
  const h1Bottom = t1Bottom - h1H;
  page.drawRectangle({
    x: margin,
    y: h1Bottom,
    width: tableWidth,
    height: h1H,
    color: lightBlue,
  });

  page.drawLine({
    start: { x: margin, y: h1Bottom },
    end: { x: margin + tableWidth, y: h1Bottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  const h1Base = h1Bottom + 4.0;
  const wDetStrW = fontBold.widthOfTextAtSize("WORKING DETAILS", 7.5);
  page.drawText("WORKING DETAILS", {
    x: bx0 + (colW1 - wDetStrW) / 2,
    y: h1Base,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const eDetStrW = fontBold.widthOfTextAtSize("EARNINGS DETAILS", 7.5);
  page.drawText("EARNINGS DETAILS", {
    x: bx1 + (bx3 - bx1 - eDetStrW) / 2,
    y: h1Base,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const dDetStrW = fontBold.widthOfTextAtSize("DEDUCTION DETAILS", 7.5);
  page.drawText("DEDUCTION DETAILS", {
    x: bx3 + (bx5 - bx3 - dDetStrW) / 2,
    y: h1Base,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  if (showEmployerContrib) {
    const cDetStrW = fontBold.widthOfTextAtSize("EMPLOYER CONTRIBUTION", 7.5);
    page.drawText("EMPLOYER CONTRIBUTION", {
      x: bx5 + (bx7 - bx5 - cDetStrW) / 2,
      y: h1Base,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  // Table 2 Header 2
  const h2Bottom = h1Bottom - h2H;
  page.drawLine({
    start: { x: margin, y: h2Bottom },
    end: { x: margin + tableWidth, y: h2Bottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  const h2Base = h2Bottom + 3.5;
  const subheaders = showEmployerContrib
    ? [
        { text: "Earnings", xL: bx1, xR: bx2 },
        { text: "Amount", xL: bx2, xR: bx3 },
        { text: "Deduction", xL: bx3, xR: bx4 },
        { text: "Amount", xL: bx4, xR: bx5 },
        { text: "Contribution", xL: bx5, xR: bx6 },
        { text: "Amount", xL: bx6, xR: bx7 },
      ]
    : [
        { text: "Earnings", xL: bx1, xR: bx2 },
        { text: "Amount", xL: bx2, xR: bx3 },
        { text: "Deduction", xL: bx3, xR: bx4 },
        { text: "Amount", xL: bx4, xR: bx5 },
      ];

  for (const sh of subheaders) {
    const sw = fontBold.widthOfTextAtSize(sh.text, 7.5);
    page.drawText(sh.text, {
      x: sh.xL + (sh.xR - sh.xL - sw) / 2,
      y: h2Base,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  // Data Body Rows
  for (let r = 0; r < maxRows; r++) {
    const rowBottom = h2Bottom - (r + 1) * itemRowH;
    const rBase = rowBottom + 3.2;

    const wRow = workingRows[r];
    const eRow = earningsRows[r];
    const dRow = deductionRows[r];
    const cRow = employerContribRows[r];

    // Working Details
    if (wRow) {
      page.drawText(wRow.label, {
        x: bx0 + 4,
        y: rBase,
        size: 7.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      const valW = fontRegular.widthOfTextAtSize(wRow.value, 7.5);
      page.drawText(wRow.value, {
        x: bx1 - 4 - valW,
        y: rBase,
        size: 7.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
    }

    // Earnings Details
    if (eRow) {
      page.drawText(eRow.label, {
        x: bx1 + 4,
        y: rBase,
        size: 7.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      if (eRow.payable) {
        const payW = fontRegular.widthOfTextAtSize(eRow.payable, 7.5);
        page.drawText(eRow.payable, {
          x: bx3 - 4 - payW,
          y: rBase,
          size: 7.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Deduction Details
    if (dRow) {
      page.drawText(dRow.label, {
        x: bx3 + 4,
        y: rBase,
        size: 7.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      if (dRow.amount) {
        const amtW = fontRegular.widthOfTextAtSize(dRow.amount, 7.5);
        page.drawText(dRow.amount, {
          x: bx5 - 4 - amtW,
          y: rBase,
          size: 7.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Employer Contribution Details
    if (showEmployerContrib && cRow) {
      page.drawText(cRow.label, {
        x: bx5 + 4,
        y: rBase,
        size: 7.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      if (cRow.amount) {
        const amtW = fontRegular.widthOfTextAtSize(cRow.amount, 7.5);
        page.drawText(cRow.amount, {
          x: bx7 - 4 - amtW,
          y: rBase,
          size: 7.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  // Horizontal lines around Totals Row
  const bodyBottom = h2Bottom - bodyH;
  const totalsBottom = bodyBottom - totalsRowH;
  page.drawLine({
    start: { x: margin, y: bodyBottom },
    end: { x: margin + tableWidth, y: bodyBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: margin, y: totalsBottom },
    end: { x: margin + tableWidth, y: totalsBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  const totBase = totalsBottom + 4.0;

  // Working Total
  page.drawText("TOTAL", {
    x: bx0 + 4,
    y: totBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  const totDaysStr = totalWorkingDays.toFixed(2);
  const totDaysW = fontBold.widthOfTextAtSize(totDaysStr, 7.5);
  page.drawText(totDaysStr, {
    x: bx1 - 4 - totDaysW,
    y: totBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Earnings Total (Gross Income)
  page.drawText("Gross Income", {
    x: bx1 + 4,
    y: totBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  const grossPayStr = grossPayable.toFixed(2);
  const grossPayW = fontBold.widthOfTextAtSize(grossPayStr, 7.5);
  page.drawText(grossPayStr, {
    x: bx3 - 4 - grossPayW,
    y: totBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Deduction Total (Total Deduction)
  page.drawText("Total Deduction", {
    x: bx3 + 4,
    y: totBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  const totDedStr = totalDeductions.toFixed(2);
  const totDedW = fontBold.widthOfTextAtSize(totDedStr, 7.5);
  page.drawText(totDedStr, {
    x: bx5 - 4 - totDedW,
    y: totBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Employer Contribution Total (Total Contrib.)
  if (showEmployerContrib) {
    page.drawText("Total Contrib.", {
      x: bx5 + 4,
      y: totBase,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    const totContribStr = totalEmployerContribution.toFixed(2);
    const totContribW = fontBold.widthOfTextAtSize(totContribStr, 7.5);
    page.drawText(totContribStr, {
      x: bx7 - 4 - totContribW,
      y: totBase,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  // Net Amount & In Words Row
  const netBottom = totalsBottom - netRowH;
  page.drawLine({
    start: { x: margin, y: netBottom },
    end: { x: margin + tableWidth, y: netBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  const netBase = netBottom + 4.2;

  // Words on left
  page.drawText("Rupees", {
    x: bx0 + 4,
    y: netBase,
    size: 7.5,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  page.drawText(words.slice(0, 75), {
    x: bx0 + 44,
    y: netBase,
    size: 7.5,
    font: fontOblique,
    color: rgb(0, 0, 0),
  });

  // Net Amount Box on right
  const netBoxLeft = showEmployerContrib ? bx5 : bx3;
  const netBoxWidth = showEmployerContrib ? colW6 + colW7 : colW4 + colW5;
  const netLabelRight = showEmployerContrib ? bx6 : bx4;

  page.drawRectangle({
    x: netBoxLeft,
    y: netBottom,
    width: netBoxWidth,
    height: netRowH,
    color: lightBlue,
  });

  const netTitleW = fontBold.widthOfTextAtSize("Net Amount", 7.5);
  page.drawText("Net Amount", {
    x: netBoxLeft + (netLabelRight - netBoxLeft - netTitleW) / 2,
    y: netBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const netAmtStr = `Rs. ${netAmount.toFixed(2)}`;
  const netAmtW = fontBold.widthOfTextAtSize(netAmtStr, 7.5);
  page.drawText(netAmtStr, {
    x: (showEmployerContrib ? bx7 : bx5) - 4 - netAmtW,
    y: netBase,
    size: 7.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // CONTINUOUS VERTICAL DIVIDERS ACROSS THE WHOLE UNIFIED TABLE:
  // Table 1 dividers (top of Table 1 down to bottom of Table 1)
  page.drawLine({
    start: { x: t1x1, y: t1Top },
    end: { x: t1x1, y: t1Bottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: t1x2, y: t1Top },
    end: { x: t1x2, y: t1Bottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: t1x3, y: t1Top },
    end: { x: t1x3, y: t1Bottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Table 2 dividers:
  // Divider 1 (bx1): runs from bottom of Table 1 down to bottom of Totals row
  page.drawLine({
    start: { x: bx1, y: t1Bottom },
    end: { x: bx1, y: totalsBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Divider 2 (bx2): runs from bottom of Header 1 down to bottom of Totals row (between Earnings Name and Amount)
  page.drawLine({
    start: { x: bx2, y: h1Bottom },
    end: { x: bx2, y: totalsBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Divider 3 (bx3): runs from bottom of Table 1 down to bottom of Totals row (or netBottom if !showEmployerContrib)
  page.drawLine({
    start: { x: bx3, y: t1Bottom },
    end: { x: bx3, y: showEmployerContrib ? totalsBottom : netBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  // Divider 4 (bx4): runs from bottom of Header 1 down to bottom of Totals row (or netBottom if !showEmployerContrib)
  page.drawLine({
    start: { x: bx4, y: h1Bottom },
    end: { x: bx4, y: showEmployerContrib ? totalsBottom : netBottom },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  if (showEmployerContrib) {
    // Divider 5 (bx5: 73%): runs from bottom of Table 1 all the way down to bottom of Net Amount row
    page.drawLine({
      start: { x: bx5, y: t1Bottom },
      end: { x: bx5, y: netBottom },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });

    // Divider 6 (bx6: 87%): runs from bottom of Header 1 all the way down to bottom of Net Amount row
    page.drawLine({
      start: { x: bx6, y: h1Bottom },
      end: { x: bx6, y: netBottom },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });
  }

  // Disclaimer Row
  const discStr =
    "This is computer generated statement hence does not require a signature .";
  const discW = fontRegular.widthOfTextAtSize(discStr, 6.8);
  page.drawText(discStr, {
    x: margin + (tableWidth - discW) / 2,
    y: tableBottom + 3.8,
    size: 6.8,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  // 5. Dashed tear line below table
  const dashY = tableBottom - 14;
  for (let dx = margin; dx < margin + tableWidth; dx += 10) {
    page.drawLine({
      start: { x: dx, y: dashY },
      end: { x: Math.min(dx + 5, margin + tableWidth), y: dashY },
      thickness: 0.6,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return await pdfDoc.save();
}
