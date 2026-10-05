import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  recalculateAndPersistSalaryEntriesForAttendances,
  recalculatePayrollTotals,
  updateWorkingDaysBulk,
} from "@canny_ecosystem/supabase/mutations";
import { useActionData, useNavigate, useParams } from "@remix-run/react";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export async function action({ request, params }: ActionFunctionArgs) {
  const payrollId = params.payrollId;

  if (!payrollId) {
    return json(
      { status: "error", message: "Payroll id missing" },
      { status: 400 },
    );
  }

  try {
    const { supabase, headers } = getSupabaseWithHeaders({ request });

    const formData = await request.formData();
    const raw = formData.get("attendancesData");

    if (!raw) {
      return json(
        { status: "error", message: "No attendance data provided" },
        { status: 400 },
      );
    }

    const rows = JSON.parse(raw as string);

    const result = await updateWorkingDaysBulk({
      supabase,
      data: rows,
    });

    if (result.success && result.attendanceIds?.length) {
      await recalculateAndPersistSalaryEntriesForAttendances({
        supabase,
        attendanceIds: result.attendanceIds,
        payrollId,
      });

      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });

      // Reset payroll status to pending since attendance has changed
      await supabase
        .from("payroll")
        .update({ status: "pending" })
        .eq("id", payrollId);
    }

    if (!result.success) {
      return json(
        {
          status: "error",
          message: "Failed to update working days",
        },
        { status: 500 },
      );
    }

    return json(
      {
        status: "success",
        message: "Working days updated successfully",
      },
      { headers },
    );
  } catch (err) {
    console.error(err);

    return json(
      {
        status: "error",
        message: "Unexpected server error",
      },
      { status: 500 },
    );
  }
}

export default function UpdateWorkingDaysPage() {
  const actionData = useActionData<typeof action>();
  const { payrollId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!actionData) return;

    if (actionData.status === "success") {
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
      clearExactCacheEntry(cacheKeyPrefix.run_payroll);

      toast({
        title: "Success",
        description: actionData.message,
        variant: "success",
      });

      const search =
        typeof window !== "undefined" ? window.location.search : "";
      navigate(`/payroll/run-payroll/${payrollId}${search}`, { replace: true });
    } else {
      toast({
        title: "Error",
        description: actionData.message,
        variant: "destructive",
      });
    }
  }, [actionData, payrollId]);

  return null;
}
