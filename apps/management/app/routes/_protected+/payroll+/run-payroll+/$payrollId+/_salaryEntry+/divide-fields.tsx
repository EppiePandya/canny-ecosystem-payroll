import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { recalculatePayrollTotals } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigate,
  useParams,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = params.payrollId;
    if (!payrollId) {
      console.error("Divide Fields Error: Missing payrollId");
      return json(
        { status: "error", message: "Payroll ID is required" },
        { status: 400 },
      );
    }

    const sourceFieldIdParam = formData.get("sourceFieldId") as string;
    const sourceFieldName = formData.get("sourceFieldName") as string;
    const targetFieldName = formData.get("targetFieldName") as string;
    const fieldType = formData.get("fieldType") as string;
    const distributionsData = formData.get("distributions") as string;

    if (
      !sourceFieldName ||
      !targetFieldName ||
      !fieldType ||
      !distributionsData
    ) {
      console.error("Divide Fields Error: Missing required form fields");
      return json(
        { status: "error", message: "Missing required fields" },
        { status: 400 },
      );
    }

    const distributions = JSON.parse(distributionsData) as Array<{
      monthly_attendance_id: string;
      salary_entry_id?: string;
      sourceAmount: number;
      targetAmount: number;
    }>;

    // 2. Get source payroll field ID
    let sourceFieldId = "";
    if (sourceFieldIdParam) {
      const { data: sourceField } = await supabase
        .from("payroll_fields")
        .select("id")
        .eq("id", sourceFieldIdParam)
        .maybeSingle();

      if (sourceField) {
        sourceFieldId = sourceField.id;
      }
    }

    if (!sourceFieldId) {
      const { data: sourceFields } = await supabase
        .from("payroll_fields")
        .select("id")
        .eq("payroll_id", payrollId)
        .ilike("name", sourceFieldName)
        .limit(1);

      if (sourceFields && sourceFields.length > 0) {
        sourceFieldId = sourceFields[0].id;
      }
    }

    if (!sourceFieldId) {
      console.error(`Source field "${sourceFieldName}" not found in database.`);
      return json(
        {
          status: "error",
          message: `Source field "${sourceFieldName}" not found in database.`,
        },
        { status: 404 },
      );
    }

    // 3. Get or create target payroll field ID
    let targetFieldId = "";
    const { data: targetFields } = await supabase
      .from("payroll_fields")
      .select("id")
      .eq("payroll_id", payrollId)
      .ilike("name", targetFieldName)
      .limit(1);

    if (targetFields && targetFields.length > 0) {
      targetFieldId = targetFields[0].id;
    } else {
      const { data: newTarget, error: targetError } = await supabase
        .from("payroll_fields")
        .insert({
          name: targetFieldName,
          type: fieldType,
          payroll_id: payrollId,
        })
        .select()
        .single();

      if (targetError || !newTarget) {
        console.error(
          `Failed to create target field "${targetFieldName}":`,
          targetError,
        );
        return json(
          {
            status: "error",
            message: `Failed to create target payroll field: ${targetFieldName}`,
            error: targetError,
          },
          { status: 500 },
        );
      }
      targetFieldId = newTarget.id;
    }

    // 4. Process each distribution and perform calculations
    for (const dist of distributions) {
      let finalSalaryEntryId = dist.salary_entry_id;

      if (!finalSalaryEntryId) {
        const { data: salaryEntry } = await supabase
          .from("salary_entries")
          .select("id")
          .eq("payroll_id", payrollId)
          .eq("monthly_attendance_id", dist.monthly_attendance_id)
          .maybeSingle();

        if (salaryEntry) {
          finalSalaryEntryId = salaryEntry.id;
        } else {
          // Fallback creation
          const { data: newEntry, error: entryError } = await supabase
            .from("salary_entries")
            .upsert(
              {
                payroll_id: payrollId,
                monthly_attendance_id: dist.monthly_attendance_id,
              },
              { onConflict: "payroll_id,monthly_attendance_id" },
            )
            .select()
            .single();

          if (entryError || !newEntry) {
            console.error("Failed to create salary entry row:", entryError);
            continue;
          }
          finalSalaryEntryId = newEntry.id;
        }
      }

      // Fetch the actual current value of the source field from DB
      const { data: sourceValRow } = await supabase
        .from("salary_field_values")
        .select("amount")
        .eq("salary_entry_id", finalSalaryEntryId)
        .eq("payroll_field_id", sourceFieldId)
        .maybeSingle();
      const currentSourceVal = Number(sourceValRow?.amount ?? 0);

      // Fetch the actual current value of the target field from DB
      const { data: targetValRow } = await supabase
        .from("salary_field_values")
        .select("amount")
        .eq("salary_entry_id", finalSalaryEntryId)
        .eq("payroll_field_id", targetFieldId)
        .maybeSingle();
      const currentTargetVal = Number(targetValRow?.amount ?? 0);

      // We subtract the target amount (dist.targetAmount) from the source field,
      // and add the target amount to the target field's existing value.
      const targetValToSeparate = dist.targetAmount;
      const newSourceVal = Math.max(0, currentSourceVal - targetValToSeparate);
      const newTargetVal = currentTargetVal + targetValToSeparate;

      // A. Update source field value
      const { error: srcValError } = await supabase
        .from("salary_field_values")
        .upsert(
          {
            salary_entry_id: finalSalaryEntryId,
            payroll_field_id: sourceFieldId,
            amount: newSourceVal,
          },
          { onConflict: "salary_entry_id,payroll_field_id" },
        );

      if (srcValError) {
        console.error(`Failed to update source value:`, srcValError);
        return json(
          {
            status: "error",
            message: `Failed to update source field: ${sourceFieldName}`,
            error: srcValError,
          },
          { status: 500 },
        );
      }

      // B. Update target field value
      const { error: tgtValError } = await supabase
        .from("salary_field_values")
        .upsert(
          {
            salary_entry_id: finalSalaryEntryId,
            payroll_field_id: targetFieldId,
            amount: newTargetVal,
          },
          { onConflict: "salary_entry_id,payroll_field_id" },
        );

      if (tgtValError) {
        console.error(`Failed to update target value:`, tgtValError);
        return json(
          {
            status: "error",
            message: `Failed to update target field: ${targetFieldName}`,
            error: tgtValError,
          },
          { status: 500 },
        );
      }
    }

    // 5. Recalculate payroll totals
    await recalculatePayrollTotals({
      supabase,
      payrollId,
    });

    return json({
      status: "success",
      message: `Field "${sourceFieldName}" separated into "${targetFieldName}" successfully for ${distributions.length} employees`,
    });
  } catch (error: any) {
    console.error("Divide Fields Action Catch Block Error:", error);
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error: error?.message || error,
      },
      { status: 500 },
    );
  }
}

export default function DivideFieldsRoute() {
  const actionData = useActionData<typeof action>();
  const { payrollId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
        clearExactCacheEntry(cacheKeyPrefix.run_payroll);
        toast({
          title: "Success",
          description: actionData?.message,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: actionData?.message || "An error occurred",
          variant: "destructive",
        });
      }
      navigate(`/payroll/run-payroll/${payrollId}${location.search}`, {
        replace: true,
      });
    }
  }, [actionData, location, payrollId, toast, navigate]);

  return null;
}
