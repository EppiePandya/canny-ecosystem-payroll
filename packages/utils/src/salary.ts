import { roundValue } from "./misx";
import { calculateSalaryBreakdown } from "./salary-calculator";

import { isDaComponent, isLeaveSalaryComponent } from "./salary-calculator";

export function calculateComponentAmount({
  calculationType,
  amountValue,
  basicAmount,
  daAmount = 0,
}: {
  calculationType: string;
  amountValue: number;
  basicAmount: number;
  daAmount?: number;
}) {
  if (calculationType === "percentage_of_basic") {
    return roundValue(((basicAmount + daAmount) * amountValue) / 100);
  }
  return amountValue;
}

export function determineActiveSalary(assignments: any[]) {
  if (!assignments || assignments.length === 0) return null;

  const today = new Date();
  const activeAssignment = assignments
    .filter(
      (a: any) => !a.effective_date || new Date(a.effective_date) <= today,
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];

  return activeAssignment ? activeAssignment.id : null;
}

export function generateSalaryFromTemplate({
  template,
  effectiveDateOverride,
}: {
  template: any;
  effectiveDateOverride?: string;
}) {
  const latestVersion = [...(template.payment_template_versions || [])].sort(
    (a: any, b: any) =>
      new Date(b.effective_date).getTime() -
      new Date(a.effective_date).getTime(),
  )[0];

  const monthlyCtc = latestVersion?.monthly_ctc || 0;
  const basicPercent = latestVersion?.basic_percent || 0;
  const isProRata = latestVersion?.is_pro_rata ?? true;

  let effectiveDate = latestVersion?.effective_date;
  if (effectiveDateOverride) {
    effectiveDate = effectiveDateOverride;
  } else if (effectiveDate) {
    effectiveDate = new Date(effectiveDate).toISOString().split("T")[0];
  }

  const basicAmount = (monthlyCtc * basicPercent) / 100;

  const rawTemplateComps = latestVersion?.payment_template_components || [];
  const daTc = rawTemplateComps.find(
    (c: any) => isDaComponent(c.payment_fields) || isDaComponent(c),
  );
  let daAmount = 0;
  if (daTc) {
    daAmount = Number(daTc.amount || daTc.calculation_value || 0);
  }
  const baseForPercentage = basicAmount + daAmount;

  const components = rawTemplateComps.map((tc: any) => {
    let amount = tc.amount || 0;
    const calcType = (tc.payment_fields?.calculation_type || "").toLowerCase();
    if (
      calcType === "percentage_of_basic" ||
      isLeaveSalaryComponent(tc.payment_fields)
    ) {
      amount = roundValue((baseForPercentage * (tc.amount || 0)) / 100);
    }
    return {
      payment_field_id: tc.payment_field_id,
      amount,
    };
  });


  const assignment = {
    monthly_ctc: monthlyCtc,
    basic_percent: basicPercent,
    basic_amount: Number(basicAmount.toFixed(2)),
    effective_date: effectiveDate,
    use_payment_template: false,
    template_id: template.id,
    is_pro_rata: isProRata,
  };

  return { assignment, components };
}

export function getLetterSalaryFromAssignment(
  assignment: any,
  customDays = 26,
) {
  let ctc = 0;
  let gross = 0;
  let basicDa = 0;
  let netPay = 0;
  let breakdownData: any = null;

  if (assignment) {
    let monthlyCtc = assignment.monthly_ctc || 0;
    let basicPercent = assignment.basic_percent || 0;
    let isProRata = false;
    let components: any[] = [];
    let statutory: any = {};

    const hasCustomComponents =
      Array.isArray(assignment.employee_salary_components) &&
      assignment.employee_salary_components.length > 0;

    const useTemplateVal =
      assignment.use_payment_template &&
      assignment.payment_templates?.payment_template_versions &&
      !hasCustomComponents;

    if (useTemplateVal) {
      const todayTime = new Date().getTime();
      const versions =
        assignment.payment_templates.payment_template_versions || [];
      const activeVersion = versions
        .filter(
          (v: any) =>
            !v.effective_date ||
            new Date(v.effective_date).getTime() <= todayTime,
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.effective_date).getTime() -
            new Date(a.effective_date).getTime(),
        )[0];

      if (activeVersion) {
        monthlyCtc = activeVersion.monthly_ctc || 0;
        basicPercent = activeVersion.basic_percent || 0;
        components = activeVersion.payment_template_components || [];
        const rawStatutory = activeVersion.payment_statutory_components;
        statutory = Array.isArray(rawStatutory)
          ? rawStatutory[0] || {}
          : rawStatutory || {};
        isProRata = activeVersion.is_pro_rata || false;
      }
    } else {
      components = assignment.employee_salary_components || [];
      const rawStatutory = assignment.employee_salary_statutory_components;
      statutory = Array.isArray(rawStatutory)
        ? rawStatutory[0] || {}
        : rawStatutory || {};
      isProRata = assignment.is_pro_rata || false;
    }

    const breakdown = calculateSalaryBreakdown({
      monthlyCtc,
      basicPercent,
      basicFormula: assignment.basic_formula || null,
      calculationDirection: assignment.calculation_direction || null,
      components,
      statutory,
      isProRata: isProRata,
      payableDays: customDays,
      workingDays: customDays,
      overtimeHours: 0,
      attendance: {
        paidHolidays: 0,
        paidLeaves: 0,
        casualLeaves: 0,
        overtimeHours: 0,
      },
      holidayConfig: [],
    });

    const daComp = breakdown.earnings.find((e: any) => {
      const name = (e.name || "").toUpperCase().trim().replace(/[\.\s_]/g, "");
      return (
        name === "DA" ||
        name === "DEARNESS" ||
        name === "DEARNESSALLOWANCE" ||
        name === "VDA" ||
        name === "VARIABLEDEARNESSALLOWANCE" ||
        name === "BASIC2"
      );
    });

    ctc = breakdown.monthlyCtc;
    gross = breakdown.grossAmount;
    basicDa = breakdown.basicAmount + (daComp ? daComp.amount : 0);
    netPay = breakdown.netAmount;
    breakdownData = breakdown;
  }

  return { ctc, gross, basicDa, netPay, breakdown: breakdownData };
}

export function resolveSalarySlipBreakdown({
  salaryEntries,
  attendance,
  assignment,
  holidayConfig = [],
  month,
}: {
  salaryEntries?: any;
  attendance?: any;
  assignment?: any;
  holidayConfig?: Array<{
    type: string;
    multiplier: number;
    working_days?: number | null;
    use_attendance_working_days?: boolean;
  }>;
  month?: number;
}) {
  let persistedEntries: any[] = [];
  if (Array.isArray(salaryEntries)) {
    if (salaryEntries.length > 0 && salaryEntries[0]?.salary_field_values) {
      persistedEntries = salaryEntries.flatMap(
        (se: any) => se.salary_field_values || [],
      );
    } else if (
      salaryEntries.length > 0 &&
      (salaryEntries[0]?.payroll_fields ||
        salaryEntries[0]?.name ||
        salaryEntries[0]?.amount !== undefined)
    ) {
      persistedEntries = salaryEntries;
    }
  } else if (salaryEntries?.salary_field_values) {
    persistedEntries = salaryEntries.salary_field_values || [];
  }

  const earnings: { name: string; amount: number }[] = [];
  const deductions: { name: string; amount: number }[] = [];
  const employerContributions: { name: string; amount: number }[] = [];
  let netPay: number | null = null;
  let actualWages: number | null = null;

  const cleanUpper = (s: string) =>
    String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const hasIndividualEarnings = persistedEntries.some((sfv: any) => {
    const name = sfv.payroll_fields?.name || sfv.name || "";
    const type = (sfv.payroll_fields?.type || sfv.type || "").toLowerCase();
    const c = cleanUpper(name);
    return (
      (type === "earning" || type.includes("earning")) &&
      !["ACTUALWAGES", "ACTUALWAGE", "NETPAY", "NETSALARY"].includes(c)
    );
  });

  const fieldMap = new Map<string, any>();
  for (const sfv of persistedEntries) {
    const name = sfv.payroll_fields?.name || sfv.name;
    const type = (sfv.payroll_fields?.type || sfv.type || "").toLowerCase();
    const amount = Number(sfv.amount || 0);
    if (!name) continue;

    const lowerName = name.trim().toLowerCase();
    const clean = cleanUpper(name);
    fieldMap.set(lowerName, { ...sfv, name, amount, type });

    if (clean === "NETPAY" || clean === "NETSALARY") {
      netPay = amount;
      continue;
    }

    if (
      clean === "TOTALDEDUCTIONS" ||
      clean === "TOTALDED" ||
      clean === "TOTALDEDUCTION"
    ) {
      // Subtotal of deductions - skip from additive deduction items
      continue;
    }

    if (clean === "ACTUALWAGES" || clean === "ACTUALWAGE") {
      actualWages = amount;
      if (hasIndividualEarnings) {
        // Reference rate / wage - skip from additive earning items
        continue;
      }
    }

    if (
      type === "employer_contribution" ||
      type === "employer" ||
      lowerName.includes("employer")
    ) {
      if (amount > 0) {
        const existing = employerContributions.find(
          (e) => e.name.toLowerCase() === lowerName,
        );
        if (existing) {
          existing.amount += amount;
        } else {
          employerContributions.push({ name, amount });
        }
      }
    } else if (type === "deduction") {
      if (amount > 0) {
        const existing = deductions.find(
          (d) => d.name.toLowerCase() === lowerName,
        );
        if (existing) {
          existing.amount += amount;
        } else {
          deductions.push({ name, amount });
        }
      }
    } else {
      if (amount > 0) {
        const existing = earnings.find(
          (e) => e.name.toLowerCase() === lowerName,
        );
        if (existing) {
          existing.amount += amount;
        } else {
          earnings.push({ name, amount });
        }
      }
    }
  }

  // If there are NO persisted salary entries at all (e.g., previewing before payroll has been generated), and assignment is provided, calculate from assignment
  if (persistedEntries.length === 0 && assignment) {
    let monthlyCtc = Number(
      assignment.monthly_ctc ||
        (Array.isArray(salaryEntries)
          ? salaryEntries[0]?.monthly_ctc
          : salaryEntries?.monthly_ctc) ||
        0,
    );
    let basicPercent = Number(assignment.basic_percent || 0);
    let isProRata = assignment.is_pro_rata ?? true;
    let components: any[] = [];
    let statutory: any = {};

    const hasCustomComponents =
      Array.isArray(assignment.employee_salary_components) &&
      assignment.employee_salary_components.length > 0;

    const useTemplateVal =
      assignment.use_payment_template &&
      assignment.payment_templates?.payment_template_versions &&
      !hasCustomComponents;

    let latestVersion: any = null;
    if (useTemplateVal) {
      const todayTime = new Date().getTime();
      const versions =
        assignment.payment_templates.payment_template_versions || [];
      latestVersion = versions
        .filter(
          (v: any) =>
            !v.effective_date ||
            new Date(v.effective_date).getTime() <= todayTime,
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.effective_date || 0).getTime() -
            new Date(a.effective_date || 0).getTime(),
        )[0];

      if (latestVersion) {
        monthlyCtc = Number(latestVersion.monthly_ctc || monthlyCtc);
        basicPercent = Number(latestVersion.basic_percent || basicPercent);
        components = latestVersion.payment_template_components || [];
        const rawStatutory = latestVersion.payment_statutory_components;
        statutory = Array.isArray(rawStatutory)
          ? rawStatutory[0] || {}
          : rawStatutory || {};
        isProRata = latestVersion.is_pro_rata ?? isProRata;
      }
    } else {
      components = assignment.employee_salary_components || [];
      const rawStatutory = assignment.employee_salary_statutory_components;
      statutory = Array.isArray(rawStatutory)
        ? rawStatutory[0] || {}
        : rawStatutory || {};
    }

    const workingDays = Number(attendance?.working_days || 0) || 26;
    const payableDays = Number(
      attendance?.present_days ?? attendance?.paid_days ?? workingDays,
    );
    const overtimeHours = Number(attendance?.overtime_hours || 0);

    const basicAmountToUse =
      assignment.basic_amount || latestVersion?.basic_amount;

    const dynamicCalculation = calculateSalaryBreakdown({
      monthlyCtc,
      basicPercent,
      basicAmount: basicAmountToUse,
      basicFormula:
        assignment.basic_formula || latestVersion?.basic_formula || null,
      calculationDirection:
        assignment.calculation_direction ||
        latestVersion?.calculation_direction ||
        null,
      isProRata,
      payableDays,
      workingDays,
      overtimeHours,
      holidayConfig: (holidayConfig as any) || [],
      attendance: {
        paidHolidays: Number(attendance?.paid_holidays || 0),
        paidLeaves: Number(attendance?.paid_leaves || 0),
        casualLeaves: Number(attendance?.casual_leaves || 0),
        overtimeHours,
      },
      components,
      statutory,
      month,
    });

    if (dynamicCalculation?.earnings) {
      for (const e of dynamicCalculation.earnings) {
        if (e.name && Number(e.amount) > 0) {
          earnings.push({
            name: e.name,
            amount: Number(e.amount),
          });
        }
      }
    }

    if (dynamicCalculation?.deductions) {
      for (const d of dynamicCalculation.deductions) {
        if (d.name && Number(d.amount) > 0) {
          deductions.push({
            name: d.name,
            amount: Number(d.amount),
          });
        }
      }
    }

    if (dynamicCalculation?.employerContribution) {
      if (Number(dynamicCalculation.employerContribution.pfTotal) > 0) {
        employerContributions.push({
          name: "PF",
          amount: Number(dynamicCalculation.employerContribution.pfTotal),
        });
      }
      if (Number(dynamicCalculation.employerContribution.esi) > 0) {
        employerContributions.push({
          name: "ESIC",
          amount: Number(dynamicCalculation.employerContribution.esi),
        });
      }
    }
  }

  // Derive employer contributions if not explicitly present
  if (employerContributions.length === 0) {
    for (const ded of deductions) {
      const lower = ded.name.toLowerCase();
      const amt = Number(ded.amount || 0);
      if (amt <= 0) continue;
      if (
        lower === "pf" ||
        lower === "epf" ||
        lower.includes("provident fund") ||
        lower.startsWith("pf")
      ) {
        employerContributions.push({
          name: "PF",
          amount: Math.round((amt * 13) / 12),
        });
      } else if (
        lower === "esi" ||
        lower === "esic" ||
        lower.includes("state insurance") ||
        lower.startsWith("esi")
      ) {
        employerContributions.push({
          name: "ESIC",
          amount: Math.round((amt * 3.25) / 0.75),
        });
      }
    }
  }

  return {
    earnings,
    deductions,
    employerContributions,
    netPay,
    actualWages,
  };
}
