import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  createAttendanceByPayrollImportAndGiveID,
  createSalaryEntries,
  createSalaryFieldValues,
  recalculatePayrollTotals,
} from "@canny_ecosystem/supabase/mutations";
import { getPayrollById } from "@canny_ecosystem/supabase/queries";
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

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = formData.get("payrollId") as string;

    const failedRedirect = formData.get("failedRedirect") as string;

    const salaryEntryData = JSON.parse(
      formData.get("salaryEntryData") as string,
    );

    const { data: payrollData } = await getPayrollById({
      payrollId,
      supabase,
    });

    const { data: attendanceData, error: attendanceError } =
      await createAttendanceByPayrollImportAndGiveID({
        employee_id: salaryEntryData.employee_id,
        insertData: { present_days: salaryEntryData.present_days },
        month: payrollData?.month!,
        year: payrollData?.year!,
        supabase,
      });
    if (attendanceError || !attendanceData) {
      console.error("Failed to insert attendance", attendanceError);
      return json({
        status: "error",
        message:
          "Salary Payroll Creation failed as conflict in attendance data",
        failedRedirect,
        error: attendanceError,
      });
    }
    const salaryEntryToBeAdded = [
      {
        payroll_id: payrollId,
        monthly_attendance_id: attendanceData.id,
      },
    ];

    const {
      data: salaryEntriesData,
      status: salaryEntriesStatus,
      error: salaryEntriesError,
    } = await createSalaryEntries({
      supabase,
      data: salaryEntryToBeAdded,
      onConflict: "monthly_attendance_id",
    });

    const result = await supabase
      .from("payroll_fields")
      .select("id, name")
      .eq("payroll_id", payrollId);

    const fieldMap = new Map<string, string>(
      !result.error && Array.isArray(result.data)
        ? result.data.map((f: any) => [f.name.toLowerCase(), f.id])
        : [],
    );

    const payrollFieldValuesToBeAdded = [];

    for (const entry of salaryEntryData.salary_data) {
      let fieldId = fieldMap.get(entry.key.toLowerCase());

      if (!fieldId) {
        const { data: newField, error: fieldError } = await supabase
          .from("payroll_fields")
          .insert({
            payroll_id: payrollId,
            name: entry.key,
            type: entry.type,
          })
          .select()
          .single();

        if (fieldError || !newField || !("id" in newField))
          throw fieldError || new Error("Field creation failed");
        fieldId = (newField as any).id as string;
        fieldMap.set(entry.key.toLowerCase(), fieldId);
      }

      if (fieldId) {
        payrollFieldValuesToBeAdded.push({
          payroll_field_id: fieldId,
          amount: entry.amount,
          salary_entry_id: salaryEntriesData![0]?.id ?? "",
        });
      }
    }

    const { status: salaryFieldEntriesStatus, error: salaryFieldEntriesError } =
      await createSalaryFieldValues({
        supabase,
        data: payrollFieldValuesToBeAdded,
      });
    if (
      isGoodStatus(salaryEntriesStatus) &&
      isGoodStatus(salaryFieldEntriesStatus)
    ) {
      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });

      return json({
        status: "success",
        message: "Salary Entry Added successfully",
        error: null,
      });
    }
    return json(
      {
        status: "error",
        message: "Salary Entry add failed",
        error: salaryEntriesError ?? salaryFieldEntriesError,
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

export default function AddSalaryEntry() {
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
