import { json, type ActionFunctionArgs } from "@remix-run/node";
import { parseWithZod } from "@conform-to/zod";
import { AttendanceSchema, isGoodStatus } from "@canny_ecosystem/utils";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  recalculateAndPersistSalaryEntriesForAttendances,
  recalculatePayrollTotals,
  updateAttendance,
} from "@canny_ecosystem/supabase/mutations";
import { getSalaryEntriesByPayrollId } from "@canny_ecosystem/supabase/queries";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";

import {
  useActionData,
  useNavigate,
  useParams,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const attendanceId = params.attendanceId;
    const payrollId = params.payrollId;

    if (!attendanceId || !payrollId) {
      return json(
        { status: "error", message: "Required params missing", error: null },
        { status: 400 },
      );
    }

    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: AttendanceSchema,
    });

    if (submission.status !== "success") {
      return json(
        {
          status: "error",
          message: "Attendance update failed",
          error: submission.error,
        },
        { status: 400 },
      );
    }

    const updatePayload = {
      id: attendanceId,
      ...submission.value,
    };

    const { status, error } = await updateAttendance({
      supabase,
      data: updatePayload,
    });

    if (isGoodStatus(status)) {
      await recalculateAndPersistSalaryEntriesForAttendances({
        supabase,
        attendanceIds: [attendanceId],
        payrollId,
      });

      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });
    }

    if (!isGoodStatus(status)) {
      return json(
        {
          status: "error",
          message: "Failed to update attendance",
          error: error ?? null,
        },
        { status: 500 },
      );
    }

    let updatedRow: any = null;
    if (isGoodStatus(status) && attendanceId) {
      const { data: attendanceData } = await supabase
        .from("monthly_attendance")
        .select("month, year")
        .eq("id", attendanceId)
        .single();

      if (attendanceData) {
        const { companyId } = await getCompanyIdOrFirstCompany(
          request,
          supabase,
        );
        const { data: updatedRows } = await getSalaryEntriesByPayrollId({
          supabase,
          payrollId,
          month: attendanceData.month,
          year: attendanceData.year,
          companyId,
          attendanceId,
        });
        updatedRow = updatedRows?.[0] ?? null;
      }
    }

    return json({
      status: "success",
      message: "Attendance updated successfully",
      error: null,
      updatedRow,
    });
  } catch (error) {
    return json(
      {
        status: "error",
        message: "Unexpected error occurred",
        error,
      },
      { status: 500 },
    );
  }
}

export default function UpdateAttendancePage() {
  const actionData = useActionData<typeof action>();
  const { payrollId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
    } else {
      toast({
        title: "Error",
        description: (actionData?.error as any)?.message || actionData?.message,
        variant: "destructive",
      });
    }
    navigate(`/payroll/run-payroll/${payrollId}${location.search}`, {
      replace: true,
    });
  }, [actionData, payrollId, location]);

  return null;
}
