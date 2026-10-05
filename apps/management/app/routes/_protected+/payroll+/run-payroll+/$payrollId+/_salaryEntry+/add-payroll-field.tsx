import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  createPayrollFields,
  createSalaryFieldValues,
  updatePayrollById,
} from "@canny_ecosystem/supabase/mutations";
import {
  getPayrollById,
  getSalaryEntriesByPayrollIdForAddingSalaryEntry,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { PayrollFieldsDatabaseInsert } from "@canny_ecosystem/supabase/types";
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

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = formData.get("payrollId") as string;

    const payrollFieldData = JSON.parse(
      formData.get("payrollFieldData") as string,
    );

    const { data: payrollData } = await getPayrollById({
      payrollId,
      supabase,
    });

    const { data: salaryEntryData } =
      await getSalaryEntriesByPayrollIdForAddingSalaryEntry({
        payrollId,
        supabase,
        companyId: payrollData?.company_id ?? "",
      });

    const newTotal =
      Number(salaryEntryData?.length) * payrollFieldData.default_amount;

    const updatedPayrollData = {
      total_net_amount:
        payrollFieldData.type === "earning"
          ? payrollData?.total_net_amount! + newTotal
          : payrollData?.total_net_amount! - newTotal,
    };

    let payrollFieldId = "";
    let payrollFieldsStatus = 200;
    let payrollFieldsError: any = null;

    const { data: existingField } = await supabase
      .from("payroll_fields")
      .select("id")
      .eq("payroll_id", payrollId)
      .ilike("name", payrollFieldData.name)
      .maybeSingle();

    if (existingField) {
      payrollFieldId = existingField.id;
    } else {
      const finalPayrollFields = [
        {
          name: payrollFieldData.name,
          type: payrollFieldData.type,
          payroll_id: payrollId,
        },
      ];

      const {
        data: payrollFieldsData,
        status,
        error,
      } = await createPayrollFields({
        supabase,
        data: finalPayrollFields as unknown as PayrollFieldsDatabaseInsert[],
        onConflict: "name, payroll_id",
      });

      payrollFieldsStatus = status;
      payrollFieldsError = error;

      if (
        isGoodStatus(status) &&
        payrollFieldsData &&
        payrollFieldsData.length > 0
      ) {
        payrollFieldId = payrollFieldsData[0].id;
      }
    }

    if (!payrollFieldId) {
      return json(
        {
          status: "error",
          message: "Payroll Field add failed",
          error:
            payrollFieldsError ||
            new Error("Failed to create or find payroll field"),
        },
        { status: 500 },
      );
    }

    const payrollFieldValuesToBeAdded = salaryEntryData?.map((entry) => ({
      payroll_field_id: payrollFieldId,
      amount: Number(payrollFieldData.default_amount),
      salary_entry_id: entry.salary_entries.id,
    }));

    const { status: salaryFieldEntriesStatus, error: salaryFieldEntriesError } =
      await createSalaryFieldValues({
        supabase,
        data: payrollFieldValuesToBeAdded!,
      });

    if (
      isGoodStatus(payrollFieldsStatus) &&
      isGoodStatus(salaryFieldEntriesStatus)
    ) {
      await updatePayrollById({
        data: updatedPayrollData,
        supabase,
        payrollId,
      });
      return json({
        status: "success",
        message: "Payroll Field Added successfully",
        error: null,
      });
    }
    return json(
      {
        status: "error",
        message: "Payroll Field add failed",
        error: payrollFieldsError ?? salaryFieldEntriesError,
      },
      { status: 500 },
    );
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

export default function AddPayrollField() {
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
