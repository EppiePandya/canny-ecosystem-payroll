import type {
  BasicComponent,
  CTCCalculationResult,
  CTCFormValues,
  EarningRow,
  PercentageComponentRow,
} from "./types";

export function calcEffectiveBasic(
  basic: BasicComponent,
  working_days: number,
): number {
  if (basic.is_monthly) {
    return basic.basic_amount;
  }
  return basic.basic_amount * working_days;
}
export function calcEffectiveEarning(
  earning: EarningRow,
  working_days: number,
): number {
  if (earning.is_monthly) {
    return earning.amount;
  }
  return earning.amount * working_days;
}

export function calcEffectivePercentageComponent(
  comp: PercentageComponentRow,
  effectiveBasic: number,
): number {
  return effectiveBasic * (comp.percentage / 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateCTC(values: CTCFormValues): CTCCalculationResult {
  const { working_days, basic, earnings, percentage_components, statutory } =
    values;

  const effectiveBasic = calcEffectiveBasic(basic, working_days);

  const effectiveEarnings = earnings.map((e) => ({
    id: e.id,
    name: e.name,
    amount: calcEffectiveEarning(e, working_days),
    consider_for_pf: e.consider_for_pf,
    consider_for_esic: e.consider_for_esic,
  }));

  const effectivePercentageComponents = percentage_components.map((pc) => ({
    id: pc.id,
    name: pc.name,
    amount: calcEffectivePercentageComponent(pc, effectiveBasic),
    consider_for_pf: pc.consider_for_pf,
    consider_for_esic: pc.consider_for_esic,
  }));

  const totalEarnings =
    effectiveBasic +
    effectiveEarnings.reduce((s, e) => s + e.amount, 0) +
    effectivePercentageComponents.reduce((s, e) => s + e.amount, 0);

  let pfWages = 0;
  if (statutory.pf_enabled) {
    if (basic.consider_for_pf) pfWages += effectiveBasic;
    for (const e of effectiveEarnings) {
      const raw = earnings.find((r) => r.id === e.id);
      if (raw?.consider_for_pf) pfWages += e.amount;
    }
    for (const pc of effectivePercentageComponents) {
      const raw = percentage_components.find((r) => r.id === pc.id);
      if (raw?.consider_for_pf) pfWages += pc.amount;
    }
  }

  const pfContributoryWages =
    statutory.pf_enabled && statutory.pf_limit_enabled
      ? Math.min(pfWages, statutory.pf_limit)
      : pfWages;

  const pfAmount = statutory.pf_enabled
    ? pfContributoryWages * (statutory.pf_percentage / 100)
    : 0;

  let esicWages = 0;
  if (statutory.esic_enabled) {
    if (basic.consider_for_esic) esicWages += effectiveBasic;
    for (const e of effectiveEarnings) {
      const raw = earnings.find((r) => r.id === e.id);
      if (raw?.consider_for_esic) esicWages += e.amount;
    }
    for (const pc of effectivePercentageComponents) {
      const raw = percentage_components.find((r) => r.id === pc.id);
      if (raw?.consider_for_esic) esicWages += pc.amount;
    }
  }

  let esicAmount = 0;
  if (statutory.esic_enabled) {
    const isAboveLimit =
      statutory.esic_limit_enabled && esicWages > statutory.esic_limit;
    if (!isAboveLimit) {
      esicAmount = esicWages * (statutory.esic_percentage / 100);
    }
  }

  const ptax = statutory.ptax_amount;

  const employerContributions = pfAmount + esicAmount + ptax;

  const finalCTC = totalEarnings + employerContributions;

  const basicPercentage =
    finalCTC > 0
      ? Math.round(((effectiveBasic / finalCTC) * 100) * 100000) / 100000
      : 0;

  return {
    effectiveBasic: round2(effectiveBasic),
    effectiveEarnings: effectiveEarnings.map((e) => ({
      id: e.id,
      name: e.name,
      amount: round2(e.amount),
    })),
    effectivePercentageComponents: effectivePercentageComponents.map((e) => ({
      id: e.id,
      name: e.name,
      amount: round2(e.amount),
    })),
    totalEarnings: round2(totalEarnings),
    pfWages: round2(pfWages),
    pfAmount: round2(pfAmount),
    esicWages: round2(esicWages),
    esicAmount: round2(esicAmount),
    ptax: round2(ptax),
    employerContributions: round2(employerContributions),
    finalCTC: round2(finalCTC),
    basicPercentage,
  };
}
