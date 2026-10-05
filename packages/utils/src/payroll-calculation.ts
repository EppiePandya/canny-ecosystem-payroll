import { getCurrentMonthIndex } from "./misx";

export const calculatePaymentField = (paymentField) => {
  if (!paymentField || !paymentField.is_active) return 0;
  return paymentField?.amount ? paymentField?.amount : 0;
};

export const calculateSB = (sb, grossPay) => {
  if (!sb) return 0;
  const currentMonth = getCurrentMonthIndex();
  const { payment_frequency, percentage, payout_month } = sb;

  if (payment_frequency === "yearly" && payout_month !== currentMonth) return 0;

  const bonusAmount = (grossPay * percentage) / 100;

  return bonusAmount;
};

export const calculateEPF = (epf, grossPay) => {
  if (!epf) return 0;
  const {
    employee_contribution,
    employer_contribution,
    employee_restrict_value,
    employer_restrict_value,
    restrict_employee_contribution,
    restrict_employer_contribution,
  } = epf;
  let employeeContributionAmount = grossPay * employee_contribution;
  let employerContributionAmount = grossPay * employer_contribution;

  if (restrict_employee_contribution)
    employeeContributionAmount = Math.min(
      employeeContributionAmount,
      employee_restrict_value,
    );
  if (restrict_employer_contribution)
    employerContributionAmount = Math.min(
      employerContributionAmount,
      employer_restrict_value,
    );
  return employeeContributionAmount + employerContributionAmount;
};

export const calculateESI = (esi, grossPay) => {
  if (!esi) return 0;
  const { employee_contribution, employer_contribution } = esi;
  const employeesContributionAmount = grossPay * employee_contribution;
  const employersContributionAmount = grossPay * employer_contribution;

  return employeesContributionAmount + employersContributionAmount;
};

export const calculatePT = (pt, grossPay) => {
  if (!pt || !pt.gross_salary_range) return 0;
  let slabs = pt.gross_salary_range;
  if (typeof slabs === "string") {
    try {
      slabs = JSON.parse(slabs);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(slabs)) return 0;
  for (const range of slabs) {
    const start = Number(range.start || 0);
    const end =
      range.end === null || range.end === undefined
        ? Number.POSITIVE_INFINITY
        : Number(range.end);
    if (grossPay >= start && grossPay <= end) return Number(range.value || 0);
  }
  return 0;
};

export const calculateLWF = (lwf: any, grossPay?: number, month?: number) => {
  if (!lwf) return 0;
  const {
    employee_contribution = 0,
    deduction_cycle = "monthly",
  } = lwf;

  if (month) {
    const cycle = String(deduction_cycle || "monthly").toLowerCase().trim();
    if (cycle === "half_yearly" || cycle === "half yearly" || cycle === "halfyearly") {
      if (![6, 12].includes(month)) return 0;
    } else if (cycle === "quarterly") {
      if (![3, 6, 9, 12].includes(month)) return 0;
    } else if (cycle === "yearly" || cycle === "annual" || cycle === "annually") {
      if (month !== 12) return 0;
    }
  }

  return Number(employee_contribution || 0);
};
