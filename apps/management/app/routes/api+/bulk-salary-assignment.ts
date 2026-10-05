import { type ActionFunctionArgs, json } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getPaymentTemplatesWithDetailsByCompanyId,
  getEmployeeSalaryAssignmentsByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import {
  upsertEmployeeSalaryAssignment,
  upsertEmployeeSalaryStatutoryComponents,
} from "@canny_ecosystem/supabase/mutations";
import { generateSalaryFromTemplate } from "@canny_ecosystem/utils";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { isGoodStatus } from "@canny_ecosystem/utils";

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

    const formData = await request.formData();
    const payloadStr = formData.get("payload");
    if (!payloadStr) {
      return json(
        { status: "error", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const { employeeIds, templateId, effectiveDate, mode = "create" } = JSON.parse(
      payloadStr.toString(),
    );

    if (
      !employeeIds ||
      !Array.isArray(employeeIds) ||
      employeeIds.length === 0
    ) {
      return json(
        { status: "error", message: "No employees selected" },
        { status: 400 },
      );
    }
    if (!templateId) {
      return json(
        { status: "error", message: "No template selected" },
        { status: 400 },
      );
    }

    const { data: templates, error: templatesError } =
      await getPaymentTemplatesWithDetailsByCompanyId({
        supabase: supabase as any,
        companyId,
      });

    if (templatesError || !templates) {
      return json(
        { status: "error", message: "Failed to fetch templates" },
        { status: 500 },
      );
    }

    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      return json(
        { status: "error", message: "Template not found" },
        { status: 404 },
      );
    }

    const { assignment, components } = generateSalaryFromTemplate({
      template,
      effectiveDateOverride: effectiveDate,
    });

    const latestVersion = [...(template.payment_template_versions || [])].sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];

    const rawStatutory = latestVersion?.payment_statutory_components;
    const statutoryData = Array.isArray(rawStatutory)
      ? rawStatutory[0]
      : rawStatutory;

    const results = await Promise.allSettled(
      employeeIds.map(async (employeeId) => {
        const { data: existing, error: existingError } =
          await getEmployeeSalaryAssignmentsByEmployeeId({
            supabase: supabase as any,
            employeeId,
          });

        if (existingError) {
          throw new Error(
            existingError.message ||
              `Failed to check existing assignment for employee ${employeeId}`,
          );
        }

        if (mode === "create" && existing && existing.length > 0) {
          return { skipped: true };
        }

        const { status, error, data } = await upsertEmployeeSalaryAssignment({
          supabase: supabase as any,
          assignment: {
            ...assignment,
            employee_id: employeeId,
            use_payment_template: false,
            template_id: null,
          },
          components: components.map((c: any) => ({
            payment_field_id: c.payment_field_id,
            amount: c.amount,
          })),
        });

        if (!isGoodStatus(status) || error) {
          throw new Error(
            error?.message ||
              `Failed to upsert salary assignment for employee ${employeeId}`,
          );
        }

        if (statutoryData && data?.id) {
          const { error: sError } = await upsertEmployeeSalaryStatutoryComponents({
            supabase: supabase as any,
            data: {
              employee_salary_assignment_id: data.id,
              pf_id: statutoryData.pf_id || null,
              esic_id: statutoryData.esic_id || null,
              pt_id: statutoryData.pt_id || null,
              statutory_bonus_id: statutoryData.statutory_bonus_id || null,
              labour_welfare_fund_id: statutoryData.labour_welfare_fund_id || null,
            },
          });

          if (sError) {
            throw new Error(
              sError.message ||
                `Failed to upsert statutory components for employee ${employeeId}`,
            );
          }
        }

        clearExactCacheEntry(`${cacheKeyPrefix.employee_salary}${employeeId}`);
        return data;
      }),
    );

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        if ((result.value as any)?.skipped) {
          skippedCount++;
        } else {
          successCount++;
        }
      } else {
        failedCount++;
        errors.push(result.reason?.message || "Unknown error");
      }
    }

    let overallStatus = "success";
    if (failedCount > 0 && successCount > 0) {
      overallStatus = "partial";
    } else if (successCount === 0 && skippedCount > 0 && failedCount === 0) {
      overallStatus = "skipped";
    } else if (successCount === 0) {
      overallStatus = "error";
    }

    return json({
      status: overallStatus,
      successCount,
      failedCount,
      skippedCount,
      errors,
    });
  } catch (error: any) {
    console.error("Bulk Salary Assignment Error:", error);
    return json(
      { status: "error", message: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
