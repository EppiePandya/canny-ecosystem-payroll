import type { CTCFormValues } from "./types";

export const CTC_DETECTOR_DEFAULTS: CTCFormValues = {
  working_days: 30,
  basic: {
    basic_amount: 0,
    is_monthly: true,
    consider_for_pf: true,
    consider_for_esic: true,
  },
  earnings: [],
  percentage_components: [],
  statutory: {
    pf_enabled: true,
    pf_percentage: 13,
    pf_limit_enabled: true,
    pf_limit: 15000,
    esic_enabled: true,
    esic_percentage: 3.25,
    esic_limit_enabled: true,
    esic_limit: 21000,
    ptax_amount: 0,
  },
};

export const MONTHLY_FORMULA_DAYS = 30 as const;
export const OVERTIME_FORMULA_DAYS = 26 as const;
