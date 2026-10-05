import {
  stateLWFContributions,
  stateProfessionalTax,
  stateMinimumWages,
  centralMinimumWages,
} from "@canny_ecosystem/utils/constant";
import { createPaymentField } from "./payment-fields";
import { createLabourWelfareFund } from "./labour-welfare-fund";
import { createProfessionalTax } from "./professional-tax";
import { createEmployeeStateInsurance } from "./employee-state-insurance";
import { createEmployeeProvidentFund } from "./employee-provident-fund";
import { createStatutoryBonus } from "./statutory-bonus";
import { createGratuity } from "./gratuity";
import { createLeaveEncashment } from "./leave-encashment";
import {
  getPaymentFieldsByCompanyId,
  getPrimaryLocationByCompanyId,
} from "../queries";
import type { TypedSupabaseClient } from "../types";

export async function automatedPaymentSetup({
  supabase,
  companyId,
  config,
  employeeType,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  config?: {
    states: { name: string; zone: "A" | "B" | "C" }[];
    centralRules: { type: string; label: string; zone: "A" | "B" | "C" }[];
  };
  employeeType?: string;
}) {
  // 0. Check if payment fields already exist to avoid duplicates
  const { data: existingFields } = await getPaymentFieldsByCompanyId({
    supabase,
    companyId,
  });

  if (existingFields && existingFields.length > 0) {
    return;
  }

  // 1. Setup Payment Fields for Central Gov rules if provided
  const centralRules = config?.centralRules || [];
  if (centralRules.length > 0) {
    for (const rule of centralRules) {
      const centralTemplate = centralMinimumWages.find(
        (cw) => cw.zone === rule.zone,
      );
      if (centralTemplate) {
        const centralData = centralTemplate.wages
          .filter((w: any) => !["LOAN", "ADVANCE"].includes(w.name))
          .map((w: any) => {
            const ruleSuffix = (rule.type || "rule")
              .toLowerCase()
              .replace(/\s+/g, "_");
            const percentMatch = (w.display_name || "").match(/\(([^)]+)%\)/);
            const percentage = percentMatch ? parseFloat(percentMatch[1]) : 0;
            const cleanDisplayName = (w.display_name || w.name)
              .replace(/\([^)]+%\)/g, "")
              .replace(/\(double\)/gi, "")
              .trim();

            const calcType =
              percentage > 0
                ? "percentage_of_basic"
                : w.calculation_type || "fixed";

            return {
              ...w,
              name:
                centralRules.length > 1 || (config?.states?.length ?? 0) > 0
                  ? `${w.name.toLowerCase()}_central_${ruleSuffix}_min`
                  : `${w.name.toLowerCase()}_min`,
              display_name: cleanDisplayName,
              calculation_type: calcType,
              amount:
                calcType === "percentage_of_basic" ? percentage : w.amount,
              company_id: companyId,
            };
          });

        if (centralData.length > 0) {
          await createPaymentField({
            supabase,
            data: centralData,
            bypassAuth: true,
          });
        }
      }
    }
  }

  // 2. Setup Payment Fields for each selected state individually
  const selectedStates = config?.states || [];
  for (const stateConfig of selectedStates) {
    const stateName = stateConfig.name;
    const zone = stateConfig.zone;

    let stateTemplate = stateMinimumWages.find(
      (sw) => sw.state.toLowerCase() === stateName.toLowerCase(),
    );

    if (!stateTemplate) {
      stateTemplate = stateMinimumWages.find((sw) => sw.state === "Default");
    }

    if (stateTemplate) {
      const zoneScaling: Record<string, number> = { A: 1.0, B: 0.95, C: 0.9 };
      const factor = zoneScaling[zone as keyof typeof zoneScaling] || 1.0;

      const stateData = stateTemplate.wages
        .filter((w: any) => !["LOAN", "ADVANCE"].includes(w.name))
        .map((w: any) => {
          const stateSuffix = stateName.toLowerCase().replace(/\s+/g, "_");
          const percentMatch = (w.display_name || "").match(/\(([^)]+)%\)/);
          const percentage = percentMatch ? parseFloat(percentMatch[1]) : 0;
          const cleanDisplayName = (w.display_name || w.name)
            .replace(/\([^)]+%\)/g, "")
            .replace(/\(double\)/gi, "")
            .trim();

          const calcType =
            percentage > 0
              ? "percentage_of_basic"
              : w.calculation_type || "fixed";

          const scaledAmount =
            w.type === "earning" && w.amount > 0
              ? Math.round(w.amount * factor * 100) / 100
              : w.amount;

          return {
            ...w,
            amount:
              calcType === "percentage_of_basic" ? percentage : scaledAmount,
            name:
              selectedStates.length > 1 || centralRules.length > 0
                ? `${w.name.toLowerCase()}_${stateSuffix}_min`
                : `${w.name.toLowerCase()}_min`,
            display_name: cleanDisplayName,
            calculation_type: calcType,
            company_id: companyId,
          };
        });

      if (stateData.length > 0) {
        await createPaymentField({
          supabase,
          data: stateData,
          bypassAuth: true,
        });
      }
    }
  }

  const primaryState = selectedStates[0]?.name || "Default";

  // 3. Setup Statutory Fields
  // EPF
  await createEmployeeProvidentFund({
    supabase,
    data: {
      epf_number: "TEMP-EPF",
      deduction_cycle: "monthly",
      employee_contribution: 0.12,
      employer_contribution: 0.12,
      employee_restrict_value: 15000,
      employer_restrict_value: 15000,
      edli_restrict_value: 0.005,
      is_default: true,
      company_id: companyId,
    },
    bypassAuth: true,
  });

  // ESI
  await createEmployeeStateInsurance({
    supabase,
    data: {
      esi_number: "TEMP-ESI",
      deduction_cycle: "monthly",
      employee_contribution: 0.0075,
      employer_contribution: 0.0325,
      is_default: true,
      max_limit: 21000,
      company_id: companyId,
    },
    bypassAuth: true,
  });

  // Bonus
  await createStatutoryBonus({
    supabase,
    data: {
      name: "Statutory Bonus",
      percentage: 8.33,
      payment_frequency: "monthly",
      is_default: true,
      company_id: companyId,
    },
    bypassAuth: true,
  });

  // Professional Tax
  const ptData = stateProfessionalTax.find(
    (pt) => pt.state.toLowerCase() === primaryState.toLowerCase(),
  );
  if (ptData) {
    await createProfessionalTax({
      supabase,
      data: {
        pt_number: ptData.pt_number,
        state: ptData.state.toLowerCase(),
        deduction_cycle: ptData.deduction_cycle as any,
        gross_salary_range: ptData.gross_salary_range,
        company_id: companyId,
      },
      bypassAuth: true,
    });
  }

  // LWF
  const lwfData = stateLWFContributions.find(
    (lwf) => lwf.state.toLowerCase() === primaryState.toLowerCase(),
  );
  if (lwfData) {
    await createLabourWelfareFund({
      supabase,
      data: {
        state: lwfData.state.toLowerCase(),
        employee_contribution: lwfData.employee_contribution,
        employer_contribution: lwfData.employer_contribution,
        deduction_cycle: lwfData.deduction_cycle as any,
        company_id: companyId,
      },
      bypassAuth: true,
    });
  }

  // Gratuity
  await createGratuity({
    supabase,
    data: {
      name: "Gratuity",
      eligibility_years: 4.5,
      max_amount_limit: 3000000,
      max_multiply_limit: 20,
      payment_days_per_year: 15,
      present_day_per_year: 240,
      is_default: true,
      company_id: companyId,
    },
    bypassAuth: true,
  });

  // Leave Encashment
  await createLeaveEncashment({
    supabase,
    data: {
      eligible_years: 5,
      encashment_frequency: "yearly",
      encashment_multiplier: 1,
      max_encashable_leaves: 30,
      max_encashment_amount: 500000,
      working_days_per_year: 26,
      is_default: true,
      company_id: companyId,
    },
    bypassAuth: true,
  });
}
