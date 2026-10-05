import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  createPayrollFields,
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
  useRevalidator,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = formData.get("payrollId") as string;

    const { data: payrollData } = await getPayrollById({ payrollId, supabase });
    if (!payrollData) throw new Error("Payroll not found");

    const { data: salaryEntryData } =
      await getSalaryEntriesByPayrollIdForAddingSalaryEntry({
        payrollId,
        supabase,
        companyId: payrollData.company_id ?? "",
      });

    const { data: loansData } = await supabase
      .from("employee_loan_details")
      .select("*, loan_deduction(salary_field_values(amount))")
      .eq("company_id", payrollData.company_id)
      .or("is_paid.eq.false,is_paid.is.null");

    // 1. Create or get 'Loan' payroll field
    let payrollFieldId = "";
    const { data: existingField } = await supabase
      .from("payroll_fields")
      .select("id")
      .eq("payroll_id", payrollId)
      .ilike("name", "Loan")
      .maybeSingle();

    if (existingField) {
      payrollFieldId = existingField.id;
    } else {
      const finalPayrollFields = [
        {
          name: "Loan",
          type: "deduction",
          payroll_id: payrollId,
        },
      ];

      const {
        data: payrollFieldsData,
        status: payrollFieldsStatus,
        error: payrollFieldsError,
      } = await createPayrollFields({
        supabase,
        data: finalPayrollFields as unknown as PayrollFieldsDatabaseInsert[],
        onConflict: "name, payroll_id",
      });

      if (
        !isGoodStatus(payrollFieldsStatus) ||
        !payrollFieldsData ||
        payrollFieldsData.length === 0
      ) {
        throw (
          payrollFieldsError || new Error("Failed to create Loan payroll field")
        );
      }

      payrollFieldId = payrollFieldsData[0].id;
    }

    // 2. Compute loan deductions for each employee
    const payrollMonth = payrollData.month;
    const payrollYear = payrollData.year;

    let totalDeduction = 0;
    const fieldValuesToUpsert = [];
    const loanDeductionMappings: { salaryEntryId: string; loanId: string }[] =
      [];

    for (const entry of salaryEntryData || []) {
      const employeeId =
        (entry as any).employees?.id ||
        (Array.isArray((entry as any).employees)
          ? (entry as any).employees[0]?.id
          : undefined) ||
        (entry as any).employee_id;

      const salaryEntryId =
        (entry as any).salary_entries?.id ||
        (Array.isArray((entry as any).salary_entries)
          ? (entry as any).salary_entries[0]?.id
          : undefined);

      if (!employeeId || !salaryEntryId) continue;

      const employeeLoans =
        loansData?.filter((l) => l.employee_id === employeeId) || [];

      let amount = 0;
      for (const loan of employeeLoans) {
        const received_amount = ((loan as any)?.loan_deduction || []).reduce(
          (acc: number, curr: any) =>
            acc + (Number(curr.salary_field_values?.amount) || 0),
          0,
        );
        if (loan.is_paid || received_amount >= (Number(loan.amount) || 0)) {
          continue;
        }

        const loanDate = new Date(loan.loan_date);
        const startYear = loanDate.getFullYear();
        const startMonth = loanDate.getMonth() + 1;

        const monthsSinceStart =
          (payrollYear - startYear) * 12 + (payrollMonth - startMonth);

        if (
          monthsSinceStart >= 0 &&
          monthsSinceStart < (loan.number_of_months || 0)
        ) {
          const remainingAmount = (Number(loan.amount) || 0) - received_amount;
          const deduction = Math.min(
            Number(loan.monthly_installment || 0),
            remainingAmount,
          );

          if (deduction > 0) {
            amount += deduction;
            loanDeductionMappings.push({
              salaryEntryId: salaryEntryId,
              loanId: loan.id,
            });
          }
        }
      }

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

    // Delete any stale 0-amount entries for the Loan field (from previous runs)
    await supabase
      .from("salary_field_values")
      .delete()
      .eq("payroll_field_id", payrollFieldId)
      .eq("amount", 0);

    if (fieldValuesToUpsert.length === 0) {
      return json({
        status: "info",
        message: "No active loans found for any employee in this payroll.",
        error: null,
      });
    }

    if (totalDeduction > 0) {
      await updatePayrollById({
        data: {
          total_net_amount:
            (payrollData.total_net_amount || 0) - totalDeduction,
        },
        supabase,
        payrollId,
      });
    }

    return json({
      status: "success",
      message: "Loans added successfully",
      error: null,
    });
  } catch (error: any) {
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

export default function AddLoan() {
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
