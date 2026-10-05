import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  recalculateAndPersistSalaryEntriesForAttendances,
  recalculatePayrollTotals,
  updatePayrollFieldsById,
  updateSalaryFieldValuesById,
} from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { isGoodStatus, SalaryEntrySchema } from "@canny_ecosystem/utils";
import { parseWithZod } from "@conform-to/zod";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigate,
  useParams,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: SalaryEntrySchema,
    });

    if (submission.status !== "success") {
      return json(
        {
          status: "error",
          message: "Salary Entry update failed",
          error: submission.error,
        },
        { status: 500 },
      );
    }
    const payrollId = submission.value.payroll_id;

    const payrollField = {
      id: submission.value.payrollFields_id,
      name: submission.value.name,
      type: submission.value.type,
    };

    const { status: payrollFieldsStatus, error: payrollFieldsError } =
      await updatePayrollFieldsById({
        supabase,
        data: payrollField,
      });

    if (!isGoodStatus(payrollFieldsStatus)) {
      return json(
        {
          status: "error",
          message: "Salary Entry update failed",
          error: payrollFieldsError,
        },
        { status: 500 },
      );
    }

    const { status: salaryFieldValuesStatus, error: salaryFieldValuesError } =
      await updateSalaryFieldValuesById({
        supabase,
        data: {
          id: submission.value.salaryFieldValues_id,
          amount: submission.value.amount,
        },
      });

    if (!isGoodStatus(salaryFieldValuesStatus)) {
      return json(
        {
          status: "error",
          message: "Salary Entry update failed",
          error: salaryFieldValuesError,
        },
        { status: 500 },
      );
    }

    if (payrollId) {
      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });
    }

    return json({
      status: "success",
      message: "Salary Entry updated successfully",
      error: null,
    });
  } catch (error) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
        data: null,
      },
      { status: 500 },
    );
  }
}

export default function UpdateSalaryEntry() {
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
