import { numberToWords, roundValue } from "./misx";
import { evaluateFormula } from "./payment-formula";

export interface SalaryComponent {
  id: string;
  payment_field_id?: string;
  name: string;
  amount: number;
  rule: string;
  isStatutory: boolean;
  displayLabel?: string;
  consider_for_epf?: boolean;
  consider_for_esic?: boolean;
  consider_for_bonus?: boolean;
}

export interface CalculationResult {
  monthlyCtc: number;
  basicPercent: number;
  basicAmount: number;
  basicDailyRate: number;
  earnings: SalaryComponent[];
  deductions: SalaryComponent[];
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  netAmountWords: string;
  payableDays: number;
  workingDays: number;
  adjustedPayableDays: number;
  payableDaysBreakdown: Array<{
    type: string;
    days: number;
    multiplier: number;
    addedDays: number;
  }>;
  employerContribution: {
    pfTotal: number;
    eps: number;
    employerEpf: number;
    edli: number;
    admin: number;
    esi: number;
    totalPfLiability: number;
    total: number;
  };
}

export interface EmployerPfBreakup {
  pfTotal: number;
  eps: number;
  employerEpf: number;
  edli: number;
  admin: number;
  totalPfLiability: number;
}

export function calculateEmployerPfStatutoryBreakup({
  epfWageBase,
  statutoryPf,
}: {
  epfWageBase: number;
  statutoryPf: any;
}): EmployerPfBreakup {
  if (!statutoryPf) {
    return {
      pfTotal: 0,
      eps: 0,
      employerEpf: 0,
      edli: 0,
      admin: 0,
      totalPfLiability: 0,
    };
  }

  const employerRestrictedBase = statutoryPf.restrict_employer_contribution
    ? Math.min(epfWageBase, statutoryPf.employer_restrict_value || 15000)
    : epfWageBase;

  const rawEmployerRate = Number(statutoryPf.employer_contribution) || 0.13;
  const employerRate =
    rawEmployerRate > 1 ? rawEmployerRate / 100 : rawEmployerRate;

  // In 13% structure: 12% is core PF (split into EPS 8.33% + EPF 3.67% or configured diff) + 0.5% EDLI + 0.5% Admin
  const employerPfTotal = roundValue(
    employerRestrictedBase * (employerRate >= 0.13 ? 0.12 : employerRate),
  );

  const epsWage = statutoryPf.restrict_employer_contribution
    ? Math.min(employerRestrictedBase, statutoryPf.employer_restrict_value || 15000)
    : employerRestrictedBase;
  const epsContribution = roundValue(epsWage * 0.0833);

  const employerEpfShare = Math.max(employerPfTotal - epsContribution, 0);

  const edliWage = statutoryPf.restrict_employer_contribution
    ? Math.min(
        employerRestrictedBase,
        statutoryPf.edli_restrict_value ||
          statutoryPf.employer_restrict_value ||
          15000,
      )
    : employerRestrictedBase;
  const edliContribution = roundValue(edliWage * 0.005);

  const epfAdminContribution = roundValue(employerRestrictedBase * 0.005);

  const totalPfLiability =
    employerRate >= 0.13
      ? roundValue(employerRestrictedBase * employerRate)
      : employerPfTotal + edliContribution + epfAdminContribution;

  return {
    pfTotal: totalPfLiability,
    eps: epsContribution,
    employerEpf: employerEpfShare,
    edli: edliContribution,
    admin: epfAdminContribution,
    totalPfLiability,
  };
}

export interface CalculationInput {
  month?: number;
  monthlyCtc: number;
  basicPercent: number;
  basicAmount?: number;
  basicFormula?: string | null;
  calculationDirection?: string | null;
  isProRata?: boolean;
  useRawAmounts?: boolean;
  payableDays: number;
  workingDays: number;
  overtimeHours?: number;
  holidayConfig?: Array<{
    type: "overtime_hours" | "paid_holidays" | "paid_leaves" | "casual_leaves";
    multiplier: number;
    working_days?: number | null;
    use_attendance_working_days?: boolean;
  }>;
  attendance?: {
    paidHolidays?: number;
    paidLeaves?: number;
    casualLeaves?: number;
    overtimeHours?: number;
  };
  components: Array<{
    id: string;
    payment_field_id?: string;
    amount: number;
    payment_fields: {
      id?: string;
      name: string;
      display_name?: string | null;
      type: string;
      calculation_type: string;
      formula?: string | null;
      is_pro_rata?: boolean;
      fixed_type?: "hour" | "day" | "month";
      is_overtime?: boolean;
      consider_for_epf?: boolean;
      consider_for_esic?: boolean;
      consider_for_bonus?: boolean;
    } | null;
  }>;
  statutory: {
    pf?: any;
    esi?: any;
    pt?: any;
    bonus?: any;
    lwf?: any;
  };
}

function resolvePTRange(amount: number, slabs: any) {
  if (!slabs) return 0;
  let parsedSlabs = slabs;
  if (typeof slabs === "string") {
    try {
      parsedSlabs = JSON.parse(slabs);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(parsedSlabs)) return 0;
  const slab = parsedSlabs.find((s: any) => {
    const start = Number(s.start || 0);
    const end =
      s.end === null || s.end === undefined
        ? Number.POSITIVE_INFINITY
        : Number(s.end);
    return amount >= start && amount <= end;
  });
  return slab ? Number(slab.value || 0) : 0;
}

function calculatePT(grossAmount: number, ptConfig: any): number {
  if (!ptConfig?.gross_salary_range) return 0;
  return resolvePTRange(grossAmount, ptConfig.gross_salary_range);
}

function calculateHolidayAdjustments(
  payableDays: number,
  holidayConfig: CalculationInput["holidayConfig"],
  attendance: CalculationInput["attendance"],
) {
  let adjustedPayableDays = payableDays;
  const payableDaysBreakdown: CalculationResult["payableDaysBreakdown"] = [];

  const configs = {
    paid_holidays: holidayConfig?.find((c) => c.type === "paid_holidays"),
    paid_leaves: holidayConfig?.find((c) => c.type === "paid_leaves"),
    casual_leaves: holidayConfig?.find((c) => c.type === "casual_leaves"),
  };

  const attendanceData = {
    paidHolidays: attendance?.paidHolidays || 0,
    paidLeaves: attendance?.paidLeaves || 0,
    casualLeaves: attendance?.casualLeaves || 0,
  };

  const phMultiplier = configs.paid_holidays?.multiplier ?? 1;

  if (attendanceData.paidHolidays > 0) {
    payableDaysBreakdown.push({
      type: "paid_holidays",
      days: attendanceData.paidHolidays,
      multiplier: phMultiplier,
      addedDays: attendanceData.paidHolidays * phMultiplier,
    });
  }

  if (configs.paid_leaves) {
    const added = attendanceData.paidLeaves * configs.paid_leaves.multiplier;
    adjustedPayableDays += added;
    payableDaysBreakdown.push({
      type: "paid_leaves",
      days: attendanceData.paidLeaves,
      multiplier: configs.paid_leaves.multiplier,
      addedDays: added,
    });
  }

  if (configs.casual_leaves) {
    const added =
      attendanceData.casualLeaves * configs.casual_leaves.multiplier;
    adjustedPayableDays += added;
    payableDaysBreakdown.push({
      type: "casual_leaves",
      days: attendanceData.casualLeaves,
      multiplier: configs.casual_leaves.multiplier,
      addedDays: added,
    });
  }

  return { adjustedPayableDays, payableDaysBreakdown };
}

interface ComponentContext {
  basicMonthlyAmount: number;
  basicDailyAmount: number;
  basicHourlyAmount: number;
  basicPayableAmount: number;
  daMonthlyAmount?: number;
  daPayableAmount?: number;
  workingDays: number;
  adjustedPayableDays: number;
  proRataFlag: boolean;
  overtimeHourlyAmount: number;
  attendance?: CalculationInput["attendance"];
  holidayConfig?: CalculationInput["holidayConfig"];
}

function handleOvertimeComponent(
  context: ComponentContext,
  multiplier: number,
) {
  const hours = context.attendance?.overtimeHours || 0;
  const amount = context.overtimeHourlyAmount * hours * multiplier;
  return {
    amount,
    rule: "Hourly Basic × OT Hours × Multiplier",
    displayLabel: `₹${context.overtimeHourlyAmount.toFixed(2)} × ${hours} hrs × ${multiplier}`,
  };
}

function handleProRataComponent(
  calculationType: string,
  compAmount: number,
  basicMonthlyAmount: number,
  adjustedPayableDays: number,
  daMonthlyAmount: number = 0,
) {
  let amount = 0;
  let rule = "";
  let displayLabel: string | undefined;

  const baseMonthly = basicMonthlyAmount + daMonthlyAmount;
  const baseLabel = daMonthlyAmount > 0 ? "Basic + DA" : "Basic";

  if (calculationType === "fixed" || calculationType === "variable") {
    amount = compAmount * adjustedPayableDays;
    rule =
      calculationType === "fixed" ? "Fixed (pro-rata)" : "Variable (pro-rata)";
    displayLabel = `₹${compAmount.toFixed(2)} × ${adjustedPayableDays} days`;
  } else if (calculationType === "percentage_of_basic") {
    const percentageAmount = (baseMonthly * compAmount) / 100;

    amount = percentageAmount * adjustedPayableDays;
    rule = `${compAmount}% of ${baseLabel}`;
    displayLabel = `${compAmount}% of ${baseLabel} × ${adjustedPayableDays} days`;
  }

  return { amount, rule, displayLabel };
}

function handlePercentageOfBasicComponent(
  percentage: number,
  context: ComponentContext,
  componentProRata: boolean,
  earningsSoFar?: SalaryComponent[],
) {
  const daInEarnings = earningsSoFar?.find((e) => isDaComponent(e));
  const daPayable =
    daInEarnings && daInEarnings.amount > 0
      ? daInEarnings.amount
      : context.daPayableAmount && context.daPayableAmount > 0
        ? context.daPayableAmount
        : 0;

  const basePayable = context.basicPayableAmount + daPayable;
  const amount = (basePayable * percentage) / 100;
  const hasDa = daPayable > 0 || (context.daMonthlyAmount || 0) > 0;
  const baseLabel = hasDa ? "Basic + DA" : "Basic";

  return {
    amount,
    rule: `${percentage}% of ${baseLabel}`,
    displayLabel: componentProRata
      ? `${percentage}% of ${baseLabel} × ${context.adjustedPayableDays} days`
      : `${percentage}% of ${baseLabel}`,
  };
}

function handleFixedOrVariableComponent(
  field: any,
  compAmount: number,
  context: ComponentContext,
  componentProRata: boolean,
) {
  const baseRate = Number(compAmount || 0);
  let amount = 0;
  let rule = "";
  let displayLabel: string | undefined;

  if (field.calculation_type === "fixed") {
    if (field.fixed_type === "day") {
      amount = baseRate * context.adjustedPayableDays;
      rule = "Fixed (day)";
      displayLabel = `₹${baseRate.toFixed(2)} × ${context.adjustedPayableDays} days`;
    } else if (field.fixed_type === "hour") {
      const payableHours = context.adjustedPayableDays * 8;
      amount = baseRate * payableHours;
      rule = "Fixed (hour)";
      displayLabel = `₹${baseRate.toFixed(2)} × ${payableHours} hrs`;
    } else {
      amount = componentProRata
        ? context.workingDays > 0
          ? (baseRate / context.workingDays) * context.adjustedPayableDays
          : 0
        : baseRate;
      rule = "Fixed (month)";
    }
  } else {
    amount = baseRate;
    rule = "Variable";
  }

  return { amount, rule, displayLabel };
}

function resolveComponentBaseAmount(
  field: any,
  compAmount: number,
  context: ComponentContext,
  earningsSoFar?: SalaryComponent[],
) {
  const componentProRata = context.proRataFlag && (field.is_pro_rata ?? true);

  if (field.is_overtime === true && !hasCustomFormula(field)) {
    const multiplier =
      context.holidayConfig?.find((c: any) => c.type === "overtime_hours")
        ?.multiplier ?? 1;
    return handleOvertimeComponent(context, multiplier);
  }

  const fixedType = field.fixed_type || "month";
  if (
    field.is_pro_rata &&
    fixedType !== "month" &&
    (field.calculation_type === "fixed" ||
      field.calculation_type === "variable")
  ) {
    return handleProRataComponent(
      field.calculation_type,
      Number(compAmount || 0),
      context.basicMonthlyAmount,
      context.adjustedPayableDays,
      context.daMonthlyAmount,
    );
  }

  const calcType = (field.calculation_type || "").toLowerCase();
  const isLeave = isLeaveSalaryComponent(field);

  if (calcType === "percentage_of_basic" || calcType === "percentage" || isLeave) {
    return handlePercentageOfBasicComponent(
      Number(compAmount || 0),
      context,
      componentProRata,
      earningsSoFar,
    );
  }

  return handleFixedOrVariableComponent(
    field,
    compAmount,
    context,
    componentProRata,
  );
}


const hasCustomFormula = (
  field: { calculation_type?: string; formula?: string | null } | null,
): field is { calculation_type: string; formula: string } =>
  typeof field?.formula === "string" &&
  field.formula.trim().length > 0;

export const isBasicComponent = (
  field: { name?: string; display_name?: string | null; payment_fields?: any } | null | undefined,
): boolean => {
  if (!field) return false;
  const f = (field as any).payment_fields || field;
  const name = (f.name || "").toUpperCase().trim();
  const displayName = (f.display_name || "").toUpperCase().trim();
  return (
    name === "BASIC" ||
    name === "BASIC PAY" ||
    name === "BASIC SALARY" ||
    displayName === "BASIC" ||
    displayName === "BASIC PAY" ||
    displayName === "BASIC SALARY"
  );
};

export const isDaComponent = (
  field: { name?: string; display_name?: string | null; payment_fields?: any } | null | undefined,
): boolean => {
  if (!field) return false;
  const f = (field as any).payment_fields || field;
  const name = (f.name || "").toUpperCase().trim();
  const displayName = (f.display_name || "").toUpperCase().trim();
  const cleanName = name.replace(/[\.\s_]/g, "");
  const cleanDisplayName = displayName.replace(/[\.\s_]/g, "");

  return (
    cleanName === "DA" ||
    cleanName.includes("DEARNESS") ||
    cleanName.includes("VDA") ||
    cleanName.includes("BASIC2") ||
    cleanDisplayName === "DA" ||
    cleanDisplayName.includes("DEARNESS") ||
    cleanDisplayName.includes("VDA") ||
    cleanDisplayName.includes("BASIC2") ||
    name === "DA" ||
    name.includes("DEARNESS") ||
    name.includes("VDA") ||
    displayName === "DA" ||
    displayName.includes("DEARNESS") ||
    displayName.includes("VDA")
  );
};

export const isLeaveSalaryComponent = (
  field: { name?: string; display_name?: string | null; payment_fields?: any } | null | undefined,
): boolean => {
  if (!field) return false;
  const f = (field as any).payment_fields || field;
  const name = (f.name || "").toUpperCase().trim();
  const displayName = (f.display_name || "").toUpperCase().trim();
  return (
    name.includes("LEAVE") ||
    displayName.includes("LEAVE")
  );
};

export const isPhWagesComponent = (
  field: { name?: string; display_name?: string | null; payment_fields?: any; id?: string } | null | undefined,
): boolean => {
  if (!field) return false;
  const f = (field as any).payment_fields || field;
  if (f.id === "virtual-PH_WAGES") return true;
  const name = (f.name || "").toUpperCase().trim();
  const displayName = (f.display_name || "").toUpperCase().trim();
  const cleanName = name.replace(/[\.\s_-]/g, "");
  const cleanDisplayName = displayName.replace(/[\.\s_-]/g, "");
  return (
    cleanName === "PH" ||
    cleanDisplayName === "PH" ||
    cleanName.includes("PHWAGE") ||
    cleanDisplayName.includes("PHWAGE") ||
    cleanName.includes("PAIDHOLIDAY") ||
    cleanDisplayName.includes("PAIDHOLIDAY") ||
    (cleanName.startsWith("PH") && (cleanName.includes("DAY") || cleanName.includes("COUNT") || cleanName.includes("WAGE"))) ||
    (cleanDisplayName.startsWith("PH") && (cleanDisplayName.includes("DAY") || cleanDisplayName.includes("COUNT") || cleanDisplayName.includes("WAGE"))) ||
    name === "PH WAGE" ||
    name === "PH WAGES" ||
    name === "PAID HOLIDAY WAGES" ||
    displayName === "PH WAGE" ||
    displayName === "PH WAGES" ||
    displayName === "PAID HOLIDAY WAGES"
  );
};

export const getCompAmount = (comp: any): number => {
  if (comp === null || comp === undefined) return 0;
  const val = comp.amount ?? comp.calculation_value ?? comp.value ?? 0;
  return Number(val) || 0;
};



function evaluateCustomFormula(
  formula: string,
  variables: Record<string, number>,
): number {
  try {
    return evaluateFormula(formula, variables);
  } catch {
    return 0;
  }
}

export function shouldDeductLwf(
  deductionCycle?: string,
  month?: number,
): boolean {
  if (!month) return true;
  const cycle = (deductionCycle || "monthly").toLowerCase().trim();

  if (cycle === "monthly") {
    return true;
  }
  if (cycle === "quarterly") {
    return [3, 6, 9, 12].includes(month);
  }
  if (
    cycle === "half_yearly" ||
    cycle === "half yearly" ||
    cycle === "halfyearly"
  ) {
    return [6, 12].includes(month);
  }
  if (
    cycle === "yearly" ||
    cycle === "annual" ||
    cycle === "annually"
  ) {
    return month === 12;
  }

  return true;
}

export function calculateSalaryBreakdown(
  input: CalculationInput,
): CalculationResult {
  const {
    month,
    monthlyCtc,
    basicPercent,
    components,
    statutory,
    payableDays = 0,
    workingDays = 0,
    holidayConfig,
    attendance,
  } = input;
  const { adjustedPayableDays, payableDaysBreakdown } =
    calculateHolidayAdjustments(payableDays, holidayConfig, attendance);
  const proRataFlag = input.isProRata ?? true;

  const basicComp = components.find(
    (c) => isBasicComponent(c.payment_fields) || isBasicComponent(c),
  );
  const daComp = components.find(
    (c) => isDaComponent(c.payment_fields) || isDaComponent(c),
  );

  const basicCompFormula =
    basicComp?.payment_fields && hasCustomFormula(basicComp.payment_fields)
      ? basicComp.payment_fields.formula
      : null;

  const activeBasicFormula =
    input.basicFormula && input.basicFormula.trim().length > 0
      ? input.basicFormula
      : basicCompFormula && basicCompFormula.trim().length > 0
        ? basicCompFormula
        : null;

  let basicMonthly = 0;
  let basicDailyRate = 0;
  let rawBasicAmount = 0;
  let basicRule = "";
  let basicDisplayLabel: string | undefined = undefined;

  const basicCompAmt = basicComp ? getCompAmount(basicComp) : 0;
  const configuredBaseBasic =
    input.basicAmount && input.basicAmount > 0
      ? input.basicAmount
      : basicCompAmt > 0
        ? basicCompAmt
        : (monthlyCtc * basicPercent) / 100;

  if (activeBasicFormula && activeBasicFormula.trim().length > 0) {
    const otHours =
      input.attendance?.overtimeHours || input.overtimeHours || 0;

    const defaultBasic = configuredBaseBasic;

    const initialVariables: Record<string, number> = {
      "Monthly CTC": monthlyCtc,
      MonthlyCTC: monthlyCtc,
      CTC: monthlyCtc,

      "Working Days": workingDays,
      WorkingDays: workingDays,
      Working: workingDays,
      "Total Days": workingDays,

      "Present Days": adjustedPayableDays,
      PresentDays: adjustedPayableDays,
      Present: adjustedPayableDays,

      "Payable Days": adjustedPayableDays,
      PayableDays: adjustedPayableDays,
      Payable: adjustedPayableDays,

      "Paid Days": adjustedPayableDays,
      PaidDays: adjustedPayableDays,
      Days: adjustedPayableDays,

      "Overtime Hours": otHours,
      "OT Hours": otHours,
      Overtime: otHours,
      OT: otHours,

      "Paid Holidays": input.attendance?.paidHolidays || 0,
      "PH Days": input.attendance?.paidHolidays || 0,
      PH: input.attendance?.paidHolidays || 0,

      "Base Basic": defaultBasic,
      "Fixed Basic": defaultBasic,
      Basic: defaultBasic,

      "Basic Percent": basicPercent,
      BasicPercent: basicPercent,
      "Basic Percentage": basicPercent,
    };

    for (const comp of components) {
      const fieldObj = (comp.payment_fields || comp) as any;
      if (!fieldObj) continue;
      const baseAmt = getCompAmount(comp);
      if (fieldObj.name) {
        initialVariables[fieldObj.name] = baseAmt;
        initialVariables[`Base ${fieldObj.name}`] = baseAmt;
      }
      if (fieldObj.display_name && fieldObj.display_name !== fieldObj.name) {
        initialVariables[fieldObj.display_name] = baseAmt;
        initialVariables[`Base ${fieldObj.display_name}`] = baseAmt;
      }
    }

    let evaluatedVal = evaluateCustomFormula(
      activeBasicFormula,
      initialVariables,
    );

    if (
      (evaluatedVal === 0 || isNaN(evaluatedVal)) &&
      activeBasicFormula.trim() !== "0"
    ) {
      const sanitizedFormula = activeBasicFormula.replace(
        /(\d+(\.\d+)?)\s*%/g,
        "($1/100)",
      );
      if (sanitizedFormula !== activeBasicFormula) {
        evaluatedVal = evaluateCustomFormula(
          sanitizedFormula,
          initialVariables,
        );
      }
    }

    const hasExplicitDays = /present|payable|working|days|paid/i.test(
      activeBasicFormula,
    );

    if (hasExplicitDays) {
      rawBasicAmount = evaluatedVal;
      basicMonthly =
        workingDays > 0 && adjustedPayableDays > 0
          ? (evaluatedVal / adjustedPayableDays) * workingDays
          : evaluatedVal;
      basicDailyRate = workingDays > 0 ? basicMonthly / workingDays : 0;
    } else {
      basicMonthly = evaluatedVal;
      basicDailyRate = workingDays > 0 ? basicMonthly / workingDays : 0;
      rawBasicAmount = proRataFlag
        ? workingDays > 0
          ? basicDailyRate * adjustedPayableDays
          : 0
        : basicMonthly;
    }

    basicRule = `Formula: ${activeBasicFormula}`;
    basicDisplayLabel = proRataFlag
      ? `₹${basicDailyRate.toFixed(2)} × ${adjustedPayableDays} days`
      : `Formula: ${activeBasicFormula}`;
  } else {
    const basicCompAmt = basicComp ? getCompAmount(basicComp) : 0;
    basicMonthly =
      input.basicAmount && input.basicAmount > 0
        ? input.basicAmount
        : basicCompAmt > 0
          ? basicCompAmt
          : (monthlyCtc * basicPercent) / 100;
    basicDailyRate = workingDays > 0 ? basicMonthly / workingDays : 0;
    rawBasicAmount = proRataFlag
      ? workingDays > 0
        ? basicDailyRate * adjustedPayableDays
        : 0
      : basicMonthly;
    basicRule =
      input.basicAmount && input.basicAmount > 0
        ? "Direct Basic"
        : `${basicPercent}% of CTC`;
    basicDisplayLabel = proRataFlag
      ? `₹${basicDailyRate.toFixed(2)} × ${adjustedPayableDays} days`
      : input.basicAmount && input.basicAmount > 0
        ? "Direct Basic"
        : `${basicPercent}% of CTC`;
  }

  let daMonthly = 0;
  let daPayableAmount = 0;
  if (daComp) {
    const f = daComp.payment_fields || daComp;
    const daVal = getCompAmount(daComp);
    if ((f as any)?.calculation_type === "percentage_of_basic") {
      daMonthly = (basicMonthly * daVal) / 100;
    } else {
      daMonthly = daVal;
    }
    const daDailyRate = workingDays > 0 ? daMonthly / workingDays : 0;
    daPayableAmount = proRataFlag
      ? workingDays > 0
        ? daDailyRate * adjustedPayableDays
        : 0
      : daMonthly;
  }

  const basicAndDaMonthly = basicMonthly + daMonthly;
  basicDailyRate = workingDays > 0 ? basicAndDaMonthly / workingDays : 0;


  const basicAmount = roundValue(rawBasicAmount);
  const rawEarningAmounts: number[] = [rawBasicAmount];

  const effectiveBaseBasicAndDa = Math.max(
    basicAndDaMonthly,
    basicAmount + daPayableAmount,
  );
  const effectiveDailyRate =
    workingDays > 0 ? effectiveBaseBasicAndDa / workingDays : basicDailyRate;

  const otConfig = holidayConfig?.find((c) => c.type === "overtime_hours");
  const otWorkingDays =
    otConfig?.use_attendance_working_days === false && otConfig?.working_days
      ? otConfig.working_days
      : workingDays;
  const overtimeHourlyAmount =
    otWorkingDays > 0 ? effectiveBaseBasicAndDa / otWorkingDays / 8 : effectiveDailyRate / 8;

  const phConfig = holidayConfig?.find((c) => c.type === "paid_holidays");
  const phMultiplier = phConfig?.multiplier ?? 1;
  const paidHolidays = input.attendance?.paidHolidays || 0;
  const phDailyRate = workingDays > 0 ? effectiveBaseBasicAndDa / workingDays : effectiveDailyRate;
  const phWageAmount = roundValue(phDailyRate * paidHolidays * phMultiplier);

  const basicContext: ComponentContext = {
    basicMonthlyAmount: basicMonthly,
    basicDailyAmount: basicDailyRate,
    basicHourlyAmount: basicDailyRate / 8,
    overtimeHourlyAmount,
    basicPayableAmount: basicAmount,
    daMonthlyAmount: daMonthly,
    daPayableAmount: daPayableAmount,
    workingDays,
    adjustedPayableDays,
    proRataFlag,
    attendance,
    holidayConfig,
  };

  const workingDaysContext: ComponentContext = {
    ...basicContext,
    adjustedPayableDays: workingDays,
    basicPayableAmount: basicMonthly,
    daPayableAmount: daMonthly,
  };


  // Names each component can be referenced by inside a custom formula
  // (the formula editor inserts display_name when present, but accept both)
  const componentNamesById = new Map<string, string[]>();
  for (const comp of components) {
    const field = comp.payment_fields;
    if (!field) continue;
    const names = [field.name];
    if (field.display_name && field.display_name !== field.name) {
      names.push(field.display_name);
    }
    componentNamesById.set(comp.id, names);
  }

  const buildFormulaVariables = (
    items: SalaryComponent[],
    derived: {
      basic: number;
      gross: number;
      presentDays: number;
      workingDays: number;
    },
    currentComp?: CalculationInput["components"][number],
  ): Record<string, number> => {
    const variables: Record<string, number> = {};
    // Every known component resolves (unresolved ones as 0) so a formula
    // never fails on a component that just isn't computed yet
    for (const names of componentNamesById.values()) {
      for (const name of names) variables[name] = 0;
    }
    for (const item of items) {
      const names = componentNamesById.get(item.id) ?? [item.name];
      for (const name of names) variables[name] = item.amount;
    }
    if (currentComp) {
      const field = currentComp.payment_fields;
      if (field) {
        const names = componentNamesById.get(currentComp.id) ?? [field.name];
        for (const name of names) {
          if (!variables[name] || variables[name] === 0) {
            variables[name] = currentComp.amount ?? 0;
          }
        }
      }
      const baseVal = currentComp.amount ?? 0;
      variables["Configured Amount"] = baseVal;
      variables["Amount"] = baseVal;
      variables["Value"] = baseVal;
      variables["Rate"] = baseVal;
      variables["Base Rate"] = baseVal;
      variables["Base Amount"] = baseVal;
      variables["Component Rate"] = baseVal;
      variables["Component Amount"] = baseVal;
      variables["Assigned Amount"] = baseVal;
      variables["Employee Salary Amount"] = baseVal;
    }
    const unproratedContext: ComponentContext = {
      ...workingDaysContext,
      proRataFlag: false,
    };
    for (const comp of components) {
      const field = comp.payment_fields;
      if (!field) continue;
      const names = componentNamesById.get(comp.id) ?? [
        field.name,
        ...(field.display_name && field.display_name !== field.name
          ? [field.display_name]
          : []),
      ];
      const baseResult = resolveComponentBaseAmount(
        field,
        comp.amount,
        unproratedContext,
      );
      const baseAmt = roundValue(baseResult.amount);
      for (const name of names) {
        variables[`Base ${name}`] = baseAmt;
        variables[`Fixed ${name}`] = baseAmt;
        variables[`Base ${name} Amount`] = baseAmt;
        variables[`Full ${name}`] = baseAmt;
      }
    }
    const otHours =
      input.attendance?.overtimeHours ||
      input.overtimeHours ||
      0;
    variables.Basic = derived.basic;
    const baseBasicVal =
      configuredBaseBasic > 0 ? configuredBaseBasic : basicMonthly;
    variables["Base Basic"] = baseBasicVal;
    variables["Fixed Basic"] = baseBasicVal;
    variables["Salary Basic"] = baseBasicVal;
    variables["Base Basic Amount"] = baseBasicVal;
    variables["Full Basic"] = baseBasicVal;
    variables.DA = daPayableAmount;
    variables["Base DA"] = daMonthly;
    variables["Basic+DA"] = derived.basic + daPayableAmount;
    variables["Basic + DA"] = derived.basic + daPayableAmount;
    variables["Basic DA"] = derived.basic + daPayableAmount;

    if (variables["Base HRA"] === undefined) {
      variables["Base HRA"] = 0;
    }
    if (variables["HRA"] === undefined) {
      variables["HRA"] = 0;
    }
    variables.Gross = derived.gross;
    variables["Monthly CTC"] = monthlyCtc;
    variables["Working Days"] = derived.workingDays;
    variables["Present Days"] = derived.presentDays;
    variables["Overtime Hours"] = otHours;
    variables["OT Hours"] = otHours;
    variables.Overtime = otHours;
    variables.OT = otHours;
    variables["PH Wages"] = phWageAmount;
    variables["PH Wage"] = phWageAmount;
    variables.PH = paidHolidays;
    variables["Paid Holidays"] = paidHolidays;
    variables["PH Days"] = paidHolidays;
    return variables;
  };

  const earnings: SalaryComponent[] = [];

  earnings.push({
    id: basicComp?.id || "basic",
    payment_field_id:
      basicComp?.payment_field_id || basicComp?.payment_fields?.id,
    name:
      basicComp?.payment_fields?.display_name ||
      basicComp?.payment_fields?.name ||
      "Basic",
    amount: basicAmount,
    rule: basicRule,
    isStatutory: false,
    consider_for_epf:
      (basicComp as any)?.consider_for_epf ??
      basicComp?.payment_fields?.consider_for_epf ??
      true,
    consider_for_esic:
      (basicComp as any)?.consider_for_esic ??
      basicComp?.payment_fields?.consider_for_esic ??
      true,
    displayLabel: basicDisplayLabel,
  });

  const deferredFormulaEarnings: Array<{
    earningIndex: number;
    comp: CalculationInput["components"][number];
  }> = [];

  const orderedComponents = [...components].sort((a, b) => {
    const isDaA = isDaComponent(a.payment_fields) || isDaComponent(a);
    const isDaB = isDaComponent(b.payment_fields) || isDaComponent(b);
    if (isDaA && !isDaB) return -1;
    if (!isDaA && isDaB) return 1;
    return 0;
  });

  for (const comp of orderedComponents) {
    const field = comp.payment_fields || {
      id: (comp as any).payment_field_id || comp.id,
      name: (comp as any).name || (comp as any).display_name || "ALLOWANCE",
      type: (comp as any).component_type || "earning",
      calculation_type: "fixed",
      fixed_type: "month",
    };
    const compType = ((comp as any).component_type || field.type || "").toLowerCase();
    if (!compType.includes("earning")) continue;

    const name = (field.name || "").toUpperCase();
    if (isBasicComponent(field)) continue;

    const isBonusComponent = name === "BONUS" || name === "STATUTORY BONUS";
    const isPhComponent = isPhWagesComponent(field) || isPhWagesComponent(comp);
    const isFormulaComponent =
      hasCustomFormula(field) && !isBonusComponent;
    // Formula components are evaluated after this loop so they can reference
    // the computed amounts of the other components and the gross so far
    const compAmt = getCompAmount(comp);
    let { amount, rule, displayLabel } = isFormulaComponent
      ? { amount: 0, rule: "Custom formula", displayLabel: (field as any).formula! }
      : isPhComponent
        ? {
            amount: phWageAmount,
            rule: `₹${phDailyRate.toFixed(2)} × ${paidHolidays} PH days${phMultiplier !== 1 ? ` × ${phMultiplier}` : ""}`,
            displayLabel: `₹${phDailyRate.toFixed(2)} × ${paidHolidays} days`,
          }
        : resolveComponentBaseAmount(field, compAmt, basicContext, earnings);


    let isStatutory = false;

    if (isFormulaComponent) {
      deferredFormulaEarnings.push({ earningIndex: earnings.length, comp });
    }

    rawEarningAmounts.push(amount);

    if (isBonusComponent) {
      isStatutory = true;
      if (statutory.bonus?.payment_frequency?.toLowerCase() === "monthly") {
        amount = (basicAmount * statutory.bonus.percentage) / 100;
        rule = `${statutory.bonus.percentage}% of Basic`;
        displayLabel = `${statutory.bonus.percentage}% of Basic`;
      } else {
        amount = 0;
        rule = "Not monthly";
        displayLabel = undefined;
      }
    }

    const isDa = isDaComponent(field);

    earnings.push({
      id: comp.id,
      payment_field_id:
        (comp as any).payment_field_id ||
        (comp as any).payment_fields?.id ||
        comp.id,
      name: (field as any).display_name || field.name,
      amount: roundValue(amount),
      rule,
      isStatutory,
      consider_for_epf:
        (comp as any).consider_for_epf ??
        (field as any).consider_for_epf ??
        (isPhComponent ? false : isDa),
      consider_for_esic:
        (comp as any).consider_for_esic ??
        (field as any).consider_for_esic ??
        (isPhComponent ? true : isDa),
      consider_for_bonus:
        (comp as any).consider_for_bonus ??
        (field as any).consider_for_bonus ??
        (isPhComponent ? false : isDa),
      displayLabel,
    });

  }

  for (const { earningIndex, comp } of deferredFormulaEarnings) {
    const field = comp.payment_fields!;
    const grossSoFar = earnings.reduce((sum, e) => sum + e.amount, 0);
    const variables = buildFormulaVariables(
      earnings,
      {
        basic: basicAmount,
        gross: grossSoFar,
        presentDays: adjustedPayableDays,
        workingDays,
      },
      comp,
    );
    const rawVal = evaluateCustomFormula(field.formula!, variables);
    rawEarningAmounts[earningIndex] = rawVal;
    earnings[earningIndex].amount = roundValue(rawVal);
  }

  const bonusEligibleComponentIds = new Set<string>();
  for (const c of components) {
    if (
      c.payment_fields?.consider_for_bonus === true ||
      (c as any).consider_for_bonus === true
    ) {
      if (c.id) bonusEligibleComponentIds.add(c.id);
      if (c.payment_field_id) bonusEligibleComponentIds.add(c.payment_field_id);
      if (c.payment_fields?.id)
        bonusEligibleComponentIds.add(c.payment_fields.id);
    }
  }

  const bonusWageBase =
    basicAmount +
    earnings
      .filter(
        (e) =>
          bonusEligibleComponentIds.has(e.id) ||
          bonusEligibleComponentIds.has(e.payment_field_id || "") ||
          e.consider_for_bonus === true,
      )
      .reduce((sum, e) => sum + e.amount, 0);

  const bonusIndex = earnings.findIndex(
    (e) => e.isStatutory && e.name.toUpperCase().includes("BONUS"),
  );

  if (
    bonusIndex !== -1 &&
    statutory.bonus?.payment_frequency?.toLowerCase() === "monthly"
  ) {
    const b = earnings[bonusIndex];
    const rawBonusVal = (bonusWageBase * statutory.bonus.percentage) / 100;
    b.amount = roundValue(rawBonusVal);
    rawEarningAmounts[bonusIndex] = rawBonusVal;
    b.rule = `${statutory.bonus.percentage}% of (Basic + Mapped Components)`;
    b.displayLabel = b.rule;
  }

  if (
    !earnings.some((e) => e.name.toUpperCase().includes("BONUS")) &&
    statutory.bonus
  ) {
    let amount = 0;
    let rule = "Not configured";
    let displayLabel: string | undefined;

    if (statutory.bonus.payment_frequency?.toLowerCase() === "monthly") {
      amount = (bonusWageBase * statutory.bonus.percentage) / 100;
      rule = `${statutory.bonus.percentage}% of (Basic + Mapped Components)`;
      displayLabel = rule;
    }

    rawEarningAmounts.push(amount);
    earnings.push({
      id: "virtual-BONUS",
      name: "BONUS",
      amount: roundValue(amount),
      rule,
      isStatutory: true,
      consider_for_epf: statutory.bonus?.consider_for_epf ?? false,
      consider_for_esic: statutory.bonus?.consider_for_esic ?? false,
      displayLabel,
    });
  }

  if (
    !earnings.some((e) => isPhWagesComponent(e)) &&
    paidHolidays > 0
  ) {
    rawEarningAmounts.push(phWageAmount);
    earnings.push({
      id: "virtual-PH_WAGES",
      name: "PH Wages",
      amount: phWageAmount,
      rule: `₹${phDailyRate.toFixed(2)} × ${paidHolidays} PH days${phMultiplier !== 1 ? ` × ${phMultiplier}` : ""}`,
      isStatutory: false,
      consider_for_epf: false,
      consider_for_esic: true,
      consider_for_bonus: false,
      displayLabel: `₹${phDailyRate.toFixed(2)} × ${paidHolidays} days`,
    });
  }

  const grossAmount = earnings.reduce((sum, e) => sum + e.amount, 0);

  const ptWageBase = earnings
    .filter((e) => {
      const name = e.name.trim().toUpperCase();
      if (
        name.includes("BONUS") ||
        e.id === "virtual-BONUS"
      ) {
        return false;
      }
      return true;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const epfEligibleComponentIds = new Set<string>();
  for (const c of components) {
    if (
      c.payment_fields?.consider_for_epf === true ||
      (c as any).consider_for_epf === true
    ) {
      if (c.id) epfEligibleComponentIds.add(c.id);
      if (c.payment_field_id) epfEligibleComponentIds.add(c.payment_field_id);
      if (c.payment_fields?.id)
        epfEligibleComponentIds.add(c.payment_fields.id);
    }
  }

  let epfWageBase =
    basicAmount +
    earnings
      .filter(
        (e) =>
          e.id !== "basic" &&
          (epfEligibleComponentIds.has(e.id) ||
            epfEligibleComponentIds.has(e.payment_field_id || "") ||
            e.consider_for_epf === true),
      )
      .reduce((sum, e) => sum + e.amount, 0);

  const esicEligibleComponentIds = new Set<string>();
  for (const c of components) {
    if (
      c.payment_fields?.consider_for_esic === true ||
      (c as any).consider_for_esic === true
    ) {
      if (c.id) esicEligibleComponentIds.add(c.id);
      if (c.payment_field_id) esicEligibleComponentIds.add(c.payment_field_id);
      if (c.payment_fields?.id)
        esicEligibleComponentIds.add(c.payment_fields.id);
    }
  }

  let esiWageBase = basicAmount;

  for (const e of earnings) {
    if (e.id === "basic") continue;
    if (
      esicEligibleComponentIds.has(e.id) ||
      esicEligibleComponentIds.has(e.payment_field_id || "") ||
      e.consider_for_esic === true
    ) {
      esiWageBase += e.amount;
    }
  }

  const esiLimitCheckWageBase = esiWageBase;

  const deductions: SalaryComponent[] = [];
  const rawDeductionAmounts: number[] = [];

  const statutoryDeductionNames = [
    "PF",
    "ESI",
    "PT",
    "PROFESSIONAL TAX",
    "LWF",
  ];
  const deferredFormulaDeductions: Array<{
    deductionIndex: number;
    comp: CalculationInput["components"][number];
  }> = [];

  for (const comp of components) {
    const field = comp.payment_fields || {
      id: (comp as any).payment_field_id || comp.id,
      name: (comp as any).name || (comp as any).display_name || "DEDUCTION",
      type: (comp as any).component_type || "deduction",
      calculation_type: "fixed",
      fixed_type: "month",
    };
    const compType = ((comp as any).component_type || field.type || "").toLowerCase();
    if (!compType.includes("deduction")) continue;

    const name = field.name.toUpperCase();
    const isFormulaComponent =
      hasCustomFormula(field) &&
      !statutoryDeductionNames.includes(name);
    const compAmt = getCompAmount(comp);
    let { amount, rule, displayLabel } = isFormulaComponent
      ? { amount: 0, rule: "Custom formula", displayLabel: field.formula! }
      : resolveComponentBaseAmount(field, compAmt, basicContext);

    let isStatutory = false;

    if (isFormulaComponent) {
      deferredFormulaDeductions.push({
        deductionIndex: deductions.length,
        comp,
      });
    }

    switch (name) {
      case "PF": {
        isStatutory = true;
        if (statutory.pf) {
          const restrictedBase = statutory.pf.restrict_employee_contribution
            ? Math.min(epfWageBase, statutory.pf.employee_restrict_value)
            : epfWageBase;

          amount = restrictedBase * statutory.pf.employee_contribution;
          rule = `${(statutory.pf.employee_contribution * 100).toFixed(2)}% of EPF Wages`;
          displayLabel = rule;
        }
        break;
      }
      case "ESI": {
        isStatutory = true;
        if (statutory.esi) {
          const maxLimit = statutory.esi.max_limit ?? 21000;
          if (esiLimitCheckWageBase <= maxLimit) {
            amount = esiWageBase * statutory.esi.employee_contribution;
            rule = `${(statutory.esi.employee_contribution * 100).toFixed(2)}% of ESIC Wages`;
            displayLabel = rule;
          } else {
            amount = 0;
            rule = "Above ESI limit";
            displayLabel = rule;
          }
        }
        break;
      }
      case "PT":
      case "PROFESSIONAL TAX": {
        isStatutory = true;
        amount = calculatePT(ptWageBase, statutory.pt);
        rule = statutory.pt?.gross_salary_range
          ? "Slab based"
          : "Not configured";
        displayLabel = rule;
        break;
      }
      case "LWF": {
        isStatutory = true;
        const isLwfDeductible = shouldDeductLwf(statutory.lwf?.deduction_cycle, month);
        amount = isLwfDeductible ? Number(statutory.lwf?.employee_contribution || 0) : 0;
        rule = statutory.lwf
          ? `${statutory.lwf.deduction_cycle || "Fixed"}`
          : "Not configured";
        displayLabel = rule;
        break;
      }
    }

    rawDeductionAmounts.push(amount);
    deductions.push({
      id: comp.id,
      payment_field_id:
        (comp as any).payment_field_id ||
        (comp as any).payment_fields?.id ||
        comp.id,
      name: (field as any).display_name || field.name,
      amount: roundValue(amount),
      rule,
      isStatutory,
      displayLabel,
    });
  }

  if (
    !deductions.some((d) => d.name.toUpperCase().includes("PF")) &&
    statutory.pf
  ) {
    const restrictedBase = statutory.pf.restrict_employee_contribution
      ? Math.min(epfWageBase, statutory.pf.employee_restrict_value)
      : epfWageBase;
    const rawPfVal = restrictedBase * statutory.pf.employee_contribution;
    const pfAmount = roundValue(rawPfVal);
    rawDeductionAmounts.push(rawPfVal);

    const pfRule = `${(statutory.pf.employee_contribution * 100).toFixed(2)}% of EPF Wages`;
    deductions.push({
      id: "virtual-PF",
      name: "PF",
      amount: pfAmount,
      rule: pfRule,
      isStatutory: true,
      displayLabel: pfRule,
    });
  }

  if (
    !deductions.some((d) => d.name.toUpperCase().includes("ESI")) &&
    statutory.esi
  ) {
    let amount = 0;
    let rule = "";
    const maxLimit = statutory.esi.max_limit ?? 21000;

    if (esiLimitCheckWageBase <= maxLimit) {
      amount = esiWageBase * statutory.esi.employee_contribution;
      rule = `${(statutory.esi.employee_contribution * 100).toFixed(2)}% of ESIC Wages`;
    } else {
      rule = "Above ESI limit";
      amount = 0;
    }

    rawDeductionAmounts.push(amount);
    deductions.push({
      id: "virtual-ESI",
      name: "ESI",
      amount: roundValue(amount),
      rule,
      isStatutory: true,
      displayLabel: rule,
    });
  }

  if (
    !deductions.some((d) => d.name.toUpperCase().includes("PT")) &&
    statutory.pt
  ) {
    const rawPtVal = calculatePT(ptWageBase, statutory.pt);
    rawDeductionAmounts.push(rawPtVal);
    deductions.push({
      id: "virtual-PT",
      name: "PT",
      amount: roundValue(rawPtVal),
      rule: statutory.pt?.gross_salary_range ? "Slab based" : "Not configured",
      isStatutory: true,
      displayLabel: statutory.pt?.gross_salary_range
        ? "Slab based"
        : "Not configured",
    });
  }

  if (
    !deductions.some((d) => d.name.toUpperCase().includes("LWF")) &&
    statutory.lwf
  ) {
    const isLwfDeductible = shouldDeductLwf(statutory.lwf?.deduction_cycle, month);
    const rawLwfVal = isLwfDeductible
      ? Number(statutory.lwf.employee_contribution || 0)
      : 0;
    rawDeductionAmounts.push(rawLwfVal);
    deductions.push({
      id: "virtual-LWF",
      name: "LWF",
      amount: roundValue(rawLwfVal),
      rule: statutory.lwf.deduction_cycle || "Fixed",
      isStatutory: true,
      displayLabel: statutory.lwf.deduction_cycle || "Fixed",
    });
  }

  // Evaluated after statutory deductions so formulas can reference PF/ESI/PT
  // amounts and the final gross
  for (const { deductionIndex, comp } of deferredFormulaDeductions) {
    const field = comp.payment_fields!;
    const variables = buildFormulaVariables(
      [...earnings, ...deductions],
      {
        basic: basicAmount,
        gross: grossAmount,
        presentDays: adjustedPayableDays,
        workingDays,
      },
      comp,
    );
    const rawVal = evaluateCustomFormula(field.formula!, variables);
    rawDeductionAmounts[deductionIndex] = rawVal;
    deductions[deductionIndex].amount = roundValue(rawVal);
  }

  const deductionsTotal = deductions.reduce((sum, d) => sum + d.amount, 0);
  const rawGrossTotal = rawEarningAmounts.reduce((sum, v) => sum + v, 0);
  const rawDeductionsTotal = rawDeductionAmounts.reduce((sum, v) => sum + v, 0);
  const netAmount = roundValue(rawGrossTotal - rawDeductionsTotal);
  return {
    monthlyCtc,
    basicPercent:
      monthlyCtc > 0 ? roundValue((basicMonthly / monthlyCtc) * 100) : basicPercent,
    basicAmount,
    basicDailyRate,
    earnings,
    deductions,
    grossAmount,
    deductionsTotal,
    netAmount,
    netAmountWords: numberToWords(netAmount),
    payableDays,
    workingDays,
    adjustedPayableDays,
    payableDaysBreakdown,
    employerContribution: (() => {
      const pfBreakup = calculateEmployerPfStatutoryBreakup({
        epfWageBase,
        statutoryPf: statutory.pf,
      });

      const esiContribution =
        esiLimitCheckWageBase <= (statutory.esi?.max_limit || 21000)
          ? roundValue(
            esiWageBase * (statutory.esi?.employer_contribution || 0.0325),
          )
          : 0;

      return {
        ...pfBreakup,
        esi: esiContribution,
        total: pfBreakup.totalPfLiability + esiContribution,
      };
    })(),
  };
}
