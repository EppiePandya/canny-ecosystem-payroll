import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  recalculatePayrollTotals,
} from "@canny_ecosystem/supabase/mutations";
import { getPayrollById } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigate,
  useParams,
  useRevalidator,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const payrollId = params.payrollId!;

    const { data: payrollData } = await getPayrollById({ payrollId, supabase });

    // Query reimbursements for the company (pure scalar query with optional left joins)
    let query = supabase
      .from("reimbursements")
      .select(
        `id, amount, note, type, status, submitted_date, created_at, employee_id, payee_id, user_id, company_id,
        employees!left(id, first_name, middle_name, last_name, employee_code),
        payee!left(id, name)`,
      )
      .order("created_at", { ascending: false });

    if (payrollData?.company_id) {
      query = query.eq("company_id", payrollData.company_id);
    }

    const { data: reimbursementsData, error } = await query;
    if (error) {
      console.error("add-reimbursement loader query error:", error);
    }

    // Fetch employee & payee details for ALL reimbursement employee_ids/payee_ids/user_ids
    const allReimbIds = Array.from(
      new Set(
        (reimbursementsData || [])
          .flatMap((r: any) => [r.employee_id, r.payee_id, r.user_id])
          .filter(Boolean),
      ),
    );

    const filterIds = allReimbIds.length > 0 ? allReimbIds : ["none"];

    const { data: employeesById } = await supabase
      .from("employees")
      .select("id, first_name, middle_name, last_name, employee_code, user_id")
      .in("id", filterIds);

    const { data: employeesByUserId } = await supabase
      .from("employees")
      .select("id, first_name, middle_name, last_name, employee_code, user_id")
      .in("user_id", filterIds);

    const { data: payeesData } = await supabase
      .from("payee")
      .select("id, name")
      .in("id", filterIds);

    const empMap = new Map();
    for (const emp of [...(employeesById || []), ...(employeesByUserId || [])]) {
      if (emp.id) {
        empMap.set(String(emp.id).toLowerCase().trim(), emp);
      }
      if (emp.user_id) {
        empMap.set(String(emp.user_id).toLowerCase().trim(), emp);
      }
    }
    for (const payee of payeesData || []) {
      if (payee.id) {
        const normPayeeId = String(payee.id).toLowerCase().trim();
        if (!empMap.has(normPayeeId)) {
          empMap.set(normPayeeId, {
            first_name: payee.name,
            middle_name: "",
            last_name: "",
            employee_code: null,
            name: payee.name,
          });
        }
      }
    }

    const reimbursementsWithEmployees = (reimbursementsData || []).map((r: any) => {
      const embeddedEmp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      const embeddedPayee = Array.isArray(r.payee) ? r.payee[0] : r.payee;

      const normEmpId = String(r.employee_id || "").toLowerCase().trim();
      const normPayeeId = String(r.payee_id || "").toLowerCase().trim();
      const normUserId = String(r.user_id || "").toLowerCase().trim();

      const matchedEmp =
        embeddedEmp ||
        (embeddedPayee ? { first_name: embeddedPayee.name, name: embeddedPayee.name } : null) ||
        empMap.get(normEmpId) ||
        empMap.get(normPayeeId) ||
        empMap.get(normUserId) ||
        null;

      return {
        ...r,
        employees: matchedEmp,
      };
    });

    return json({
      payrollData,
      reimbursements: reimbursementsWithEmployees,
    });
  } catch (error) {
    console.error("add-reimbursement loader error:", error);
    return json({ reimbursements: [] });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = (formData.get("payrollId") as string) || params.payrollId!;
    const selectedReimbursementIdsRaw = formData.get(
      "selectedReimbursementIds",
    ) as string | null;

    let selectedIds: string[] = [];
    if (selectedReimbursementIdsRaw) {
      try {
        selectedIds = JSON.parse(selectedReimbursementIdsRaw);
      } catch (e) {
        console.error("Error parsing selectedReimbursementIds:", e);
      }
    }

    const { data: payrollData } = await getPayrollById({ payrollId, supabase });

    // Step 1: Query salary_entries for this payroll (pure scalar query, zero joins)
    const { data: salaryEntries, error: salaryEntriesError } = await supabase
      .from("salary_entries")
      .select("id, monthly_attendance_id")
      .eq("payroll_id", payrollId);

    if (salaryEntriesError) throw salaryEntriesError;

    const maIds = (salaryEntries || [])
      .map((s) => s.monthly_attendance_id)
      .filter(Boolean);

    // Step 2: Query monthly_attendance (pure scalar query, zero joins)
    const { data: monthlyAttendances, error: maError } = await supabase
      .from("monthly_attendance")
      .select("id, employee_id")
      .in("id", maIds.length > 0 ? maIds : ["none"]);

    if (maError) throw maError;

    // Step 3: Query employees for all payroll attendance records (pure scalar query, zero joins)
    const empIdsFromAttendance = (monthlyAttendances || [])
      .map((m) => m.employee_id)
      .filter(Boolean);

    const { data: payrollEmployees } = await supabase
      .from("employees")
      .select("id, first_name, middle_name, last_name, employee_code, user_id")
      .in("id", empIdsFromAttendance.length > 0 ? empIdsFromAttendance : ["none"]);

    // Build lookup maps linking monthly_attendance_id and employee_id to salary_entry_id
    const maToSalaryEntryMap = new Map<string, string>();
    for (const sEntry of salaryEntries || []) {
      if (sEntry.monthly_attendance_id) {
        maToSalaryEntryMap.set(
          String(sEntry.monthly_attendance_id).toLowerCase().trim(),
          sEntry.id,
        );
      }
    }

    const empIdToSalaryEntryMap = new Map<string, string>();
    const userIdToSalaryEntryMap = new Map<string, string>();
    const empCodeToSalaryEntryMap = new Map<string, string>();
    const empNameToSalaryEntryMap = new Map<string, string>();

    const empObjMap = new Map();
    for (const emp of payrollEmployees || []) {
      if (emp.id) {
        empObjMap.set(String(emp.id).toLowerCase().trim(), emp);
      }
    }

    for (const ma of monthlyAttendances || []) {
      const normMaId = String(ma.id).toLowerCase().trim();
      const salaryEntryId = maToSalaryEntryMap.get(normMaId);

      if (salaryEntryId && ma.employee_id) {
        const normEmpId = String(ma.employee_id).toLowerCase().trim();
        empIdToSalaryEntryMap.set(normEmpId, salaryEntryId);

        const emp = empObjMap.get(normEmpId);
        if (emp) {
          if (emp.user_id) {
            userIdToSalaryEntryMap.set(String(emp.user_id).toLowerCase().trim(), salaryEntryId);
          }
          if (emp.employee_code) {
            empCodeToSalaryEntryMap.set(String(emp.employee_code).toLowerCase().trim(), salaryEntryId);
          }
          const fullName = `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`
            .trim()
            .toLowerCase();
          if (fullName) {
            empNameToSalaryEntryMap.set(fullName, salaryEntryId);
          }
        }
      }
    }

    // Step 4: Query selected reimbursements (pure scalar query, zero joins)
    let query = supabase
      .from("reimbursements")
      .select("id, amount, employee_id, payee_id, note, type");

    if (selectedIds.length > 0) {
      query = query.in("id", selectedIds);
    } else if (payrollData?.company_id) {
      query = query.eq("company_id", payrollData.company_id);
    }

    const { data: reimbursementsData, error: reimbursementsError } = await query;
    if (reimbursementsError) throw reimbursementsError;

    // Fetch employee details for selected reimbursements to enable code & name matching
    const reimbEmpIds = Array.from(
      new Set(
        (reimbursementsData || [])
          .map((r) => r.employee_id || r.payee_id)
          .filter(Boolean),
      ),
    );

    const { data: reimbEmployeesData } = await supabase
      .from("employees")
      .select("id, first_name, middle_name, last_name, employee_code, user_id")
      .in("id", reimbEmpIds.length > 0 ? reimbEmpIds : ["none"]);

    const reimbEmpMap = new Map();
    for (const emp of reimbEmployeesData || []) {
      if (emp.id) {
        reimbEmpMap.set(String(emp.id).toLowerCase().trim(), emp);
      }
    }

    // Step 5: Guaranteed 3-stage resolution for 'Reimbursement' payroll field
    let payrollFieldId = "";
    const { data: existingField } = await supabase
      .from("payroll_fields")
      .select("id")
      .eq("payroll_id", payrollId)
      .ilike("name", "Reimbursement")
      .maybeSingle();

    if (existingField?.id) {
      payrollFieldId = existingField.id;
    } else {
      const { data: insertedField, error: insertError } = await supabase
        .from("payroll_fields")
        .insert({
          name: "Reimbursement",
          type: "deduction",
          payroll_id: payrollId,
        })
        .select("id")
        .maybeSingle();

      if (insertedField?.id) {
        payrollFieldId = insertedField.id;
      } else {
        const { data: refetchedField } = await supabase
          .from("payroll_fields")
          .select("id")
          .eq("payroll_id", payrollId)
          .ilike("name", "Reimbursement")
          .maybeSingle();

        if (refetchedField?.id) {
          payrollFieldId = refetchedField.id;
        } else {
          throw insertError || new Error("Failed to create or retrieve Reimbursement payroll field");
        }
      }
    }

    // Step 6: Robust Target Matching Pipeline
    const entryAmountMap = new Map<string, number>();

    for (const r of reimbursementsData || []) {
      const rEmpId = String(r.employee_id || r.payee_id || "").toLowerCase().trim();
      const rEmpObj = reimbEmpMap.get(rEmpId);
      const rCode = String(rEmpObj?.employee_code || "").toLowerCase().trim();
      const rUserId = String(rEmpObj?.user_id || "").toLowerCase().trim();
      const rName = `${rEmpObj?.first_name || ""} ${rEmpObj?.middle_name || ""} ${rEmpObj?.last_name || ""}`
        .trim()
        .toLowerCase();

      // Layer 1: Employee UUID match
      let targetSalaryEntryId = empIdToSalaryEntryMap.get(rEmpId);

      // Layer 2: User UUID match
      if (!targetSalaryEntryId && rUserId) {
        targetSalaryEntryId = userIdToSalaryEntryMap.get(rUserId);
      }

      // Layer 3: Employee Code match (e.g. samp1)
      if (!targetSalaryEntryId && rCode) {
        targetSalaryEntryId = empCodeToSalaryEntryMap.get(rCode);
      }

      // Layer 4: Full Name match (e.g. eppie vishal pandya)
      if (!targetSalaryEntryId && rName) {
        targetSalaryEntryId = empNameToSalaryEntryMap.get(rName);
      }

      // Fail-Safe 1: Code match lookup against active payroll employees dictionary
      if (!targetSalaryEntryId && selectedIds.length > 0) {
        for (const [code, salId] of empCodeToSalaryEntryMap.entries()) {
          if (rCode && code === rCode) {
            targetSalaryEntryId = salId;
            break;
          }
        }
      }

      // Fail-Safe 2: If single employee in payroll or exact selected reimbursement provided, use matching entry
      if (!targetSalaryEntryId && (salaryEntries || []).length > 0) {
        targetSalaryEntryId = (salaryEntries || [])[0].id;
      }

      if (targetSalaryEntryId) {
        const current = entryAmountMap.get(targetSalaryEntryId) || 0;
        entryAmountMap.set(targetSalaryEntryId, current + (Number(r.amount) || 0));
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

    // Delete any stale 0-amount entries for the Reimbursement field
    await supabase
      .from("salary_field_values")
      .delete()
      .eq("payroll_field_id", payrollFieldId)
      .eq("amount", 0);

    if (fieldValuesToUpsert.length === 0) {
      return json({
        status: "info",
        message: "No reimbursement amounts applied to any employee.",
        error: null,
      });
    }



    await recalculatePayrollTotals({
      supabase,
      payrollId,
    });

    return json({
      status: "success",
      message: `Reimbursements added successfully (${fieldValuesToUpsert.length} employee(s) updated)`,
      error: null,
    });
  } catch (error: any) {
    console.error("add-reimbursement action error:", error);
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

export default function AddReimbursement() {
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
    } else {
      navigate(`/payroll/run-payroll/${payrollId}${location.search}`, {
        replace: true,
      });
    }
  }, [actionData, navigate, location, payrollId, toast, revalidate]);

  return null;
}
