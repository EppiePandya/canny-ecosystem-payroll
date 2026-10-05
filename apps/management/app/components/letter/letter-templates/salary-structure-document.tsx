import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";
import { formatDateToSlash } from "@canny_ecosystem/utils";
import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";
import { Signature } from "./signature";

export function getSalaryStructureEarnings(rawEarnings: any[] = []) {
  let basicDaAmt = 0;
  let hraAmt = 0;
  let allowanceAmt = 0;
  let bonusAmt = 0;
  const extraEarnings: { name: string; amount: number }[] = [];

  if (Array.isArray(rawEarnings)) {
    for (const e of rawEarnings) {
      const nameUpper = (e.name || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
      const amt = e.monthly_amount ?? e.amount ?? 0;

      if (
        nameUpper === "BASIC" ||
        nameUpper === "BASIC PAY" ||
        nameUpper === "BASIC SALARY" ||
        nameUpper === "BASIC WAGES" ||
        nameUpper.startsWith("BASIC ") ||
        nameUpper.includes("BASIC") ||
        nameUpper === "DA" ||
        nameUpper === "VDA" ||
        nameUpper.includes("DEARNESS")
      ) {
        basicDaAmt += amt;
      } else if (nameUpper === "HRA" || nameUpper.includes("HOUSE RENT")) {
        hraAmt += amt;
      } else if (
        nameUpper === "OVERTIME" ||
        nameUpper === "OT" ||
        nameUpper.includes("OVERTIME") ||
        nameUpper.includes("SPECIAL ALLOWANCE") ||
        nameUpper.includes("ALLOWANCE")
      ) {
        allowanceAmt += amt;
      } else if (nameUpper.includes("BONUS") || nameUpper.includes("INCENTIVE")) {
        bonusAmt += amt;
      } else {
        extraEarnings.push({ name: e.name, amount: amt });
      }
    }
  }

  return [
    { name: "Basic + DA", amount: basicDaAmt },
    { name: "HRA", amount: hraAmt },
    { name: "Allowance", amount: allowanceAmt },
    { name: "Bonus 8.33%", amount: bonusAmt },
    ...extraEarnings,
  ];
}

export function getSalaryStructureDeductions(rawDeductions: any[] = []) {
  if (!Array.isArray(rawDeductions) || rawDeductions.length === 0) {
    return [
      { name: "PF Employee", amount: 0 },
      { name: "ESIC Employee", amount: 0 },
      { name: "P.Tax", amount: 0 },
    ];
  }

  return rawDeductions.map((d: any) => {
    const rawName = (d.name || "").trim();
    const clean = rawName.toUpperCase().replace(/[\s_-]+/g, " ");
    let name = rawName;
    if (
      clean === "PF" ||
      clean.includes("PROVIDENT") ||
      clean.includes("PF EMPLOYEE") ||
      clean === "EPF"
    ) {
      name = "PF Employee";
    } else if (
      clean === "ESI" ||
      clean === "ESIC" ||
      clean.includes("ESIC EMPLOYEE") ||
      clean.includes("EMPLOYEE ESI")
    ) {
      name = "ESIC Employee";
    } else if (
      clean === "PT" ||
      clean === "P.TAX" ||
      clean.includes("PROFESSIONAL TAX") ||
      clean === "P TAX"
    ) {
      name = "P.Tax";
    }
    return { name, amount: d.monthly_amount ?? d.amount ?? 0 };
  });
}

export function SalaryStructureDocument({
  salaryData,
  employeeData,
  date,
}: {
  salaryData?: any;
  employeeData?: any;
  date?: Date | string | null;
}) {
  if (!salaryData) return null;

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
    employeeData?.gender?.toLowerCase() === "female" ? "Mrs." : "Mr.";

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

  const totalCtc = grossAmount + (employerContribution.total || 0);

  return (
    <div className="break-before-page text-xs font-sans">
      <h2 className="text-center font-bold text-sm underline mb-5 tracking-wide">
        SALARY - STRUCTURE LETTER
      </h2>

      <div className="flex justify-between font-bold mb-2">
        <span>Dear {employeeFullName}</span>
        <span>Date: {formattedDate}</span>
      </div>

      <div className="flex mb-2 font-bold">
        <span>Ref:</span>
        <span className="ml-1.5">{refString}</span>
      </div>

      <p className="mb-4 leading-normal">
        Further to your employment with us, your salary for the period of
        employment with effect Letter to the following:
      </p>

      <div className="mt-6 mb-3 flex flex-col items-center">
        <div className="font-bold text-center mb-3 tracking-wide text-xs">
          YOUR TOTAL COST OF COMPANY WILL BE AS BELOW:
        </div>

        <div className="grid grid-cols-2 gap-3 w-full max-w-xl mx-auto">
          {/* NET SALARY Table */}
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="border-b border-black font-bold">
                <th colSpan={2} className="py-1 text-center border-black">
                  NET SALARY
                </th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((earning: any) => (
                <tr
                  key={`net-earning-${earning.name}`}
                  className="border-b border-black"
                >
                  <td className="w-[54%] pl-2 py-0.5 border-r border-black">
                    {earning.name}
                  </td>
                  <td className="w-[46%] px-2 py-0.5">
                    <div className="flex justify-between items-center">
                      <span>Rs.</span>
                      <span>{formatAmount(earning.amount)}</span>
                    </div>
                  </td>
                </tr>
              ))}

              <tr className="border-b-2 border-t-2 border-black font-bold">
                <td className="w-[54%] text-center py-0.5 border-r border-black font-bold">
                  Gross Salary
                </td>
                <td className="w-[46%] px-2 py-0.5">
                  <div className="flex justify-between items-center font-bold">
                    <span>Rs.</span>
                    <span>{formatAmount(grossAmount)}</span>
                  </div>
                </td>
              </tr>

              {deductions.map((deduction: any) => (
                <tr
                  key={`net-deduction-${deduction.name}`}
                  className="border-b border-black"
                >
                  <td className="w-[54%] pl-2 py-0.5 border-r border-black">
                    {deduction.name}
                  </td>
                  <td className="w-[46%] px-2 py-0.5">
                    <div className="flex justify-between items-center">
                      <span>Rs.</span>
                      <span>{formatAmount(deduction.amount)}</span>
                    </div>
                  </td>
                </tr>
              ))}

              <tr className="border-t-2 border-black font-bold">
                <td className="w-[54%] text-center py-0.5 border-r border-black font-bold">
                  Net Salary
                </td>
                <td className="w-[46%] px-2 py-0.5">
                  <div className="flex justify-between items-center font-bold">
                    <span>Rs.</span>
                    <span>{formatAmount(netAmount)}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* CTC/GROSS Table */}
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="border-b border-black font-bold">
                <th colSpan={2} className="py-1 text-center border-black">
                  CTC/GROSS
                </th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((earning: any) => (
                <tr
                  key={`ctc-earning-${earning.name}`}
                  className="border-b border-black"
                >
                  <td className="w-[54%] pl-2 py-0.5 border-r border-black">
                    {earning.name}
                  </td>
                  <td className="w-[46%] px-2 py-0.5">
                    <div className="flex justify-between items-center">
                      <span>Rs.</span>
                      <span>{formatAmount(earning.amount)}</span>
                    </div>
                  </td>
                </tr>
              ))}

              <tr className="border-b-2 border-t-2 border-black font-bold">
                <td className="w-[54%] text-center py-0.5 border-r border-black font-bold">
                  Gross Salary
                </td>
                <td className="w-[46%] px-2 py-0.5">
                  <div className="flex justify-between items-center font-bold">
                    <span>Rs.</span>
                    <span>{formatAmount(grossAmount)}</span>
                  </div>
                </td>
              </tr>

              <tr className="border-b border-black">
                <td className="w-[54%] pl-2 py-0.5 border-r border-black">
                  PF Employer
                </td>
                <td className="w-[46%] px-2 py-0.5">
                  <div className="flex justify-between items-center">
                    <span>Rs.</span>
                    <span>
                      {formatAmount(
                        employerContribution.totalPfLiability ||
                          employerContribution.pfTotal,
                      )}
                    </span>
                  </div>
                </td>
              </tr>

              <tr className="border-b border-black">
                <td className="w-[54%] pl-2 py-0.5 border-r border-black">
                  ESIC Employer
                </td>
                <td className="w-[46%] px-2 py-0.5">
                  <div className="flex justify-between items-center">
                    <span>Rs.</span>
                    <span>{formatAmount(employerContribution.esi)}</span>
                  </div>
                </td>
              </tr>

              <tr className="border-b border-black">
                <td className="w-[54%] pl-2 py-0.5 border-r border-black">
                  WC Policy
                </td>
                <td className="w-[46%] px-2 py-0.5 text-center">-</td>
              </tr>

              <tr className="border-t-2 border-black font-bold">
                <td className="w-[54%] text-center py-0.5 border-r border-black font-bold">
                  Total Gross C.T.C
                </td>
                <td className="w-[46%] px-2 py-0.5">
                  <div className="flex justify-between items-center font-bold">
                    <span>Rs.</span>
                    <span>{formatAmount(totalCtc)}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-xs leading-relaxed">
        The net salary is subject to Income Tax
      </p>

      <p className="mt-3 text-xs leading-relaxed">
        All other terms and conditions as per your Work Assignment Letter &
        Letter of Engagement Remain unchanged until further notice. You may sign
        a copy of this letter and return it back to Us as an unconditional token
        of acceptance.
      </p>

      <div className="mt-12 flex justify-between items-end">
        <div className="text-left">
          <p className="font-bold text-xs">
            For, {CANNY_MANAGEMENT_SERVICES_NAME}
          </p>
          <div className="my-2">
            <Signature
              src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/signature.png`}
            />
          </div>
          <p className="text-xs">Authorized Signatory</p>
        </div>

        <div className="text-right">
          <p className="text-xs max-w-xs text-left mb-8">
            I accept the contract of employment with the terms and conditions
            Contained thereto
          </p>
          {rawEmpName && (
            <p className="font-bold text-xs text-center mb-6">
              {rawEmpName}
            </p>
          )}
          <p className="text-xs text-center">(Signature & Date)</p>
        </div>
      </div>
    </div>
  );
}

