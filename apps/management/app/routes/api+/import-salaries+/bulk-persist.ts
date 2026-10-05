import { type ActionFunctionArgs, json } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  upsertUnifiedPaymentTemplate,
  upsertEmployeeSalaryAssignment,
  upsertEmployeeSalaryStatutoryComponents,
} from "@canny_ecosystem/supabase/mutations";
import { isGoodStatus } from "@canny_ecosystem/utils";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json(
      { status: "error", message: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(
      request,
      supabase as any,
    );

    const body = await request.json();
    let { assignments, effectiveDate } = body;

    if (typeof assignments === "string") {
      try {
        assignments = JSON.parse(assignments);
      } catch (e) {
        console.error("Failed to parse assignments string:", e);
      }
    }

    if (
      !assignments ||
      !Array.isArray(assignments) ||
      assignments.length === 0
    ) {
      console.warn("Bulk Persist: No assignments provided or invalid format", {
        assignments,
      });
      return json(
        { status: "error", message: "No assignments provided" },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const targetEffectiveDate = effectiveDate || today;
    const results = {
      templatesCreated: 0,
      assignmentsCreated: 0,
      errors: [] as string[],
    };

    for (const emp of assignments) {
      const {
        status: aStatus,
        error: aError,
        data: aData,
      } = await upsertEmployeeSalaryAssignment({
        supabase: supabase as any,
        assignment: {
          employee_id: emp.id,
          use_payment_template: false,
          monthly_ctc: Number(emp.monthlyCtc.toFixed(2)),
          basic_percent: Number(emp.basicPercentage.toFixed(5)),
          basic_amount: Number(
            (
              emp.basicAmount ||
              (emp.monthlyCtc * emp.basicPercentage) / 100
            ).toFixed(2),
          ),
          is_pro_rata: true,
          effective_date: targetEffectiveDate,
        },
        components: (emp.resolvedComponents || [])
          .map((c: any) => ({
            payment_field_id: c.payment_field_id || c.id,
            amount: c.amount,
          }))
          .filter((c: any) => Boolean(c.payment_field_id)),
      });

      if (!isGoodStatus(aStatus) || aError) {
        results.errors.push(
          `Failed to create direct assignment for ${emp.employee_code || emp.id}: ${
            aError?.message || "Unknown error"
          }`,
        );
      } else {
        results.assignmentsCreated++;

        if (emp.resolvedStatutory) {
          const { error: sError } =
            await upsertEmployeeSalaryStatutoryComponents({
              supabase: supabase as any,
              data: {
                employee_salary_assignment_id: aData?.id,
                pf_id: emp.resolvedStatutory.pf?.id || null,
                esic_id: emp.resolvedStatutory.esi?.id || null,
                pt_id: emp.resolvedStatutory.pt?.id || null,
                statutory_bonus_id: emp.resolvedStatutory.bonus?.id || null,
                labour_welfare_fund_id:
                  emp.resolvedStatutory.lwf?.id || null,
              },
            });
          if (sError) {
            results.errors.push(
              `Failed to add statutory for ${emp.employee_code || emp.id}: ${sError.message}`,
            );
          }
        }

        clearExactCacheEntry(`${cacheKeyPrefix.employee_salary}${emp.id}`);
      }
    }

    return json({
      status:
        results.errors.length === 0
          ? "success"
          : results.assignmentsCreated > 0
            ? "partial"
            : "error",
      message: `Successfully processed ${results.assignmentsCreated} assignments and ${results.templatesCreated} templates.`,
      ...results,
    });
  } catch (error: any) {
    console.error("Bulk Persist Error:", error);
    return json(
      { status: "error", message: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
