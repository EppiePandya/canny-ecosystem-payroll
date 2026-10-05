import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  deleteSalaryEntriesFromPayrollAndEmployeeId,
  recalculatePayrollTotals,
} from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { isGoodStatus } from "@canny_ecosystem/utils";
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

    const employeeId = params.employeeId;
    const payrollId = params.payrollId;

    const { status, error } = await deleteSalaryEntriesFromPayrollAndEmployeeId(
      {
        supabase,
        payrollId: payrollId ?? "",
        employeeId: employeeId ?? "",
      },
    );

    if (isGoodStatus(status) || status === 200) {
      await recalculatePayrollTotals({
        supabase,
        payrollId: payrollId!,
      });
      return json({
        status: "success",
        message: "Payroll Entry deleted successfully",
        error: null,
      });
    }
    return json({
      status: "error",
      message: (error as any)?.message || "Payroll Entry delete failed",
      error,
    });
  } catch (error) {
    console.error("Error in delete-salary-entry action:", error);
    return json({
      status: "error",
      message: "An unexpected error occurred",
      error,
      data: null,
    });
  }
}

export default function DeleteSalaryEntry() {
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
          description:
            (actionData?.error as any)?.message || actionData?.message,
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
