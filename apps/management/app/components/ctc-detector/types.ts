export const MONTHLY_FORMULA_DAYS = 30 as const;
export const OVERTIME_FORMULA_DAYS = 26 as const;

export type FormulaDays = number;

export interface BasicComponent {
  basic_amount: number;
  is_monthly: boolean;
  consider_for_pf: boolean;
  consider_for_esic: boolean;
}

export interface EarningRow {
  id: string;
  name: string;
  amount: number;
  is_monthly: boolean;
  consider_for_pf: boolean;
  consider_for_esic: boolean;
}

export interface PercentageComponentRow {
  id: string;
  name: string;
  percentage: number;
  based_on: "basic";
  consider_for_pf: boolean;
  consider_for_esic: boolean;
}

export interface StatutorySettings {
  pf_enabled: boolean;
  pf_percentage: number;
  pf_limit_enabled: boolean;
  pf_limit: number;
  esic_enabled: boolean;
  esic_percentage: number;
  esic_limit_enabled: boolean;
  esic_limit: number;
  ptax_amount: number;
}

export interface CTCFormValues {
  working_days: number;
  basic: BasicComponent;
  earnings: EarningRow[];
  percentage_components: PercentageComponentRow[];
  statutory: StatutorySettings;
}

export interface CTCCalculationResult {
  effectiveBasic: number;
  effectiveEarnings: { id: string; name: string; amount: number }[];
  effectivePercentageComponents: { id: string; name: string; amount: number }[];
  totalEarnings: number;
  pfWages: number;
  pfAmount: number;
  esicWages: number;
  esicAmount: number;
  ptax: number;
  employerContributions: number;
  finalCTC: number;
  basicPercentage: number;
}
