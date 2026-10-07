import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  recalculatePayrollTotals,
} from "@canny_ecosystem/supabase/mutations";
import { getPayrollById } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigate,
  useParams,
  useRevalidator,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

function parseYearMonth(dateInput: any): { year: number; month: number } | null {
  if (!dateInput) return null;
  const str = String(dateInput).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1], 10), month: parseInt(isoMatch[2], 10) };
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = formData.get("payrollId") as string;

    const { data: payrollData } = await getPayrollById({ payrollId, supabase });
    if (!payrollData) throw new Error("Payroll not found");

    // 1. Fetch salary_entries and monthly_attendance (batch chunked in 50s for URL safety)
    const { data: salaryEntries, error: salaryEntriesError } = await supabase
      .from("salary_entries")
      .select("id, monthly_attendance_id")
      .eq("payroll_id", payrollId)
      .limit(10000);

    if (salaryEntriesError) throw salaryEntriesError;

    const maIds = (salaryEntries || [])
      .map((s) => s.monthly_attendance_id)
      .filter((id): id is string => Boolean(id));

    const { data: monthlyAttendances, error: maError } = await supabase
      .from("monthly_attendance")
      .select("id, employee_id")
      .in("id", maIds.length > 0 ? maIds : ["none"])
      .limit(10000);

    if (maError) throw maError;

    const maToSalaryEntryMap = new Map<string, string>();
    for (const se of salaryEntries || []) {
      if (se.monthly_attendance_id) {
        maToSalaryEntryMap.set(
          String(se.monthly_attendance_id).toLowerCase().trim(),
          se.id,
        );
      }
    }

    const empToSalaryEntryMap = new Map<string, string>();
    for (const ma of monthlyAttendances || []) {
      const seId = maToSalaryEntryMap.get(String(ma.id).toLowerCase().trim());
      if (seId && ma.employee_id) {
        empToSalaryEntryMap.set(
          String(ma.employee_id).toLowerCase().trim(),
          seId,
        );
      }
    }

    const payrollEmpIds = Array.from(empToSalaryEntryMap.keys());
    if (payrollEmpIds.length === 0) {
      return json({
        status: "info",
        message: "No salary entries found in this payroll.",
        error: null,
      });
    }

    // 2. Fetch pending advances for the employees in this payroll (limit 10000)
    let { data: advancesData, error: advancesError } = await supabase
      .from("employee_advance_details")
      .select("*, advance_deduction(salary_field_values(amount))")
      .in("employee_id", payrollEmpIds)
      .or("is_paid.eq.false,is_paid.is.null")
      .limit(10000);

    if (advancesError || !advancesData) {
      console.warn("Retrying employee_advance_details basic query:", advancesError);
      const { data: fallbackData } = await supabase
        .from("employee_advance_details")
        .select("*")
        .in("employee_id", payrollEmpIds)
        .or("is_paid.eq.false,is_paid.is.null")
        .limit(10000);

      advancesData = fallbackData || [];
    }

    // 3. Guaranteed resolution for 'Advance' payroll field
    let payrollFieldId = "";
    const { data: existingFields } = await supabase
      .from("payroll_fields")
      .select("id")
      .eq("payroll_id", payrollId)
      .ilike("name", "Advance")
      .limit(1);

    if (existingFields && existingFields.length > 0) {
      payrollFieldId = existingFields[0].id;
    } else {
      const { data: insertedFields, error: insertError } = await supabase
        .from("payroll_fields")
        .insert({
          name: "Advance",
          type: "deduction",
          payroll_id: payrollId,
        })
        .select("id")
        .limit(1);

      if (insertedFields && insertedFields.length > 0) {
        payrollFieldId = insertedFields[0].id;
      } else {
        const { data: refetchedFields } = await supabase
          .from("payroll_fields")
          .select("id")
          .eq("payroll_id", payrollId)
          .ilike("name", "Advance")
          .limit(1);

        if (refetchedFields && refetchedFields.length > 0) {
          payrollFieldId = refetchedFields[0].id;
        } else {
          throw (
            insertError ||
            new Error("Failed to create or retrieve Advance payroll field")
          );
        }
      }
    }

    // 4. Compute advance deductions
    const payrollMonth = payrollData.month;
    const payrollYear = payrollData.year;
    const entryAmountMap = new Map<string, number>();

    for (const advance of advancesData || []) {
      const advEmpId = String(advance.employee_id || "").toLowerCase().trim();
      const salaryEntryId = empToSalaryEntryMap.get(advEmpId);

      if (!salaryEntryId) continue;

      const received_amount = (
        (advance as any)?.advance_deduction || []
      ).reduce(
        (acc: number, curr: any) =>
          acc + (Number(curr?.salary_field_values?.amount) || 0),
        0,
      );

      if (
        advance.is_paid ||
        received_amount >= (Number(advance.amount) || 0)
      ) {
        continue;
      }

      const parsedDate =
        parseYearMonth(advance.advance_date) ||
        parseYearMonth(advance.created_at);

      let isEligible = true;
      if (parsedDate) {
        const monthsSinceStart =
          (payrollYear - parsedDate.year) * 12 +
          (payrollMonth - parsedDate.month);
        if (monthsSinceStart < 0) {
          isEligible = false;
        }
      }

      if (isEligible) {
        const remainingAmount =
          (Number(advance.amount) || 0) - received_amount;

        if (remainingAmount > 0) {
          const current = entryAmountMap.get(salaryEntryId) || 0;
          entryAmountMap.set(salaryEntryId, current + remainingAmount);
        }
      }
    }

    let totalDeduction = 0;
    const fieldValuesToUpsert = [];

    for (const [salaryEntryId, amount] of entryAmountMap.entries()) {
      if (amount > 0) {
        fieldValuesToUpsert.push({
          payroll_field_id: payrollFieldId,
          amount,
          salary_entry_id: salaryEntryId,
        });
        totalDeduction += amount;
      }
    }

    if (fieldValuesToUpsert.length > 0) {
      const { error: salaryFieldEntriesError } = await supabase
        .from("salary_field_values")
        .upsert(fieldValuesToUpsert, {
          onConflict: "salary_entry_id, payroll_field_id",
        });

      if (salaryFieldEntriesError) throw salaryFieldEntriesError;
    }

    // Delete any stale 0-amount entries for the Advance field (from previous runs)
    await supabase
      .from("salary_field_values")
      .delete()
      .eq("payroll_field_id", payrollFieldId)
      .eq("amount", 0);

    if (fieldValuesToUpsert.length === 0) {
      return json({
        status: "info",
        message: "No active advances found for any employee in this payroll run.",
        error: null,
      });
    }



    await recalculatePayrollTotals({
      supabase,
      payrollId,
    });

    return json({
      status: "success",
      message: "Advances added successfully",
      error: null,
    });
  } catch (error: any) {
    console.error("add-advance action error:", error);
    return json(
      {
        status: "error",
        message: error.message || "An unexpected error occurred",
        error,
        data: null,
      },
      { status: 500 },
    );
  }
}

export default function AddAdvance() {
  const actionData = useActionData<typeof action>();
  const { payrollId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    if (actionData) {
      if (actionData.status === "success") {
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
        clearExactCacheEntry(cacheKeyPrefix.run_payroll);
        toast({
          title: "Success",
          description: actionData.message,
          variant: "success",
        });
      } else if (actionData.status === "info") {
        toast({
          title: "Info",
          description: actionData.message,
          variant: "default",
        });
      } else {
        toast({
          title: "Error",
          description: actionData.message,
          variant: "destructive",
        });
      }
      revalidate();
      navigate(`/payroll/run-payroll/${payrollId}${location.search}`, {
        replace: true,
      });
    }
  }, [actionData, navigate, location, payrollId, toast, revalidate]);

  return null;
}
