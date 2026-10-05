import { useState, useMemo } from "react";
import {
  json,
  useLoaderData,
  useNavigate,
  useFetcher,
  useParams,
} from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getPayrollById,
  getSalaryEntriesByPayrollId,
  getEmployeesWithSalaryByEmployeeCodes,
  getSiteNamesByCompanyId,
  getDepartmentsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { recalculatePayrollTotals } from "@canny_ecosystem/supabase/mutations";
import { calculateSalaryBreakdown } from "@canny_ecosystem/utils";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";

function unwrapObj(val: any): any {
  if (!val) return undefined;
  if (Array.isArray(val)) return val[0] ? unwrapObj(val[0]) : undefined;
  return val;
}

function resolveEmployeeSalary(employee: any, referenceDateStr?: string) {
  if (!employee) return null;
  const referenceDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const assignments = employee.employee_salary_assignment || [];
  const assignmentsArr = Array.isArray(assignments) ? assignments : [assignments];

  const validAssignments = assignmentsArr
    .filter(
      (a: any) => !a.effective_date || new Date(a.effective_date) <= referenceDate
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.effective_date || 0).getTime() - new Date(a.effective_date || 0).getTime()
    );

  let assignment = validAssignments[0];
  if (!assignment) {
    const futureAssignments = assignmentsArr
      .filter(
        (a: any) => a.effective_date && new Date(a.effective_date) > referenceDate
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.effective_date || 0).getTime() - new Date(b.effective_date || 0).getTime()
      );
    assignment = futureAssignments[0];
  }
  if (!assignment) return null;

  let resolvedComponents: any[] = [];
  let resolvedStatutory: any = {};
  let monthlyCtc = Number(assignment.monthly_ctc || 0);
  let basicPercent = Number(assignment.basic_percent || 0);
  let basicAmount = Number(assignment.basic_amount || 0);
  let isProRata = !!assignment.is_pro_rata;

  const hasCustomComponents =
    Array.isArray(assignment.employee_salary_components) &&
    assignment.employee_salary_components.length > 0;

  const useTemplateVal =
    assignment.use_payment_template &&
    assignment.payment_templates &&
    !hasCustomComponents;

  if (useTemplateVal) {
    const versions = assignment.payment_templates.payment_template_versions || [];
    const versionsArr = Array.isArray(versions) ? versions : [versions];
    const validVersions = versionsArr
      .filter(
        (v: any) => !v.effective_date || new Date(v.effective_date) <= referenceDate
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.effective_date || 0).getTime() - new Date(a.effective_date || 0).getTime()
      );
    let latestVersion = validVersions[0];
    if (!latestVersion) {
      const futureVersions = versionsArr
        .filter(
          (v: any) => v.effective_date && new Date(v.effective_date) > referenceDate
        )
        .sort(
          (a: any, b: any) =>
            new Date(a.effective_date || 0).getTime() - new Date(b.effective_date || 0).getTime()
        );
      latestVersion = futureVersions[0];
    }

    if (latestVersion) {
      monthlyCtc = Number(latestVersion.monthly_ctc || 0);
      basicPercent = Number(latestVersion.basic_percent || 0);
      basicAmount = Number(latestVersion.basic_amount || 0);
      isProRata = !!latestVersion.is_pro_rata;
      resolvedComponents = latestVersion.payment_template_components || [];
      const ts = unwrapObj(latestVersion.payment_statutory_components);
      if (ts) {
        resolvedStatutory = {
          pf: unwrapObj(ts.pf),
          esi: unwrapObj(ts.esi),
          pt: unwrapObj(ts.pt),
          bonus: unwrapObj(ts.bonus),
          lwf: unwrapObj(ts.lwf),
        };
      }
    }
  } else {
    resolvedComponents = assignment.employee_salary_components || [];
    const esc = unwrapObj(assignment.employee_salary_statutory_components);
    if (esc) {
      resolvedStatutory = {
        pf: unwrapObj(esc.pf),
        esi: unwrapObj(esc.esi),
        pt: unwrapObj(esc.pt),
        bonus: unwrapObj(esc.bonus),
        lwf: unwrapObj(esc.lwf),
      };
    }
  }

  return {
    monthlyCtc,
    basicPercent,
    basicAmount,
    isProRata,
    resolvedComponents,
    resolvedStatutory,
  };
}

const fmt = (val: number | undefined | null) => {
  if (val === undefined || val === null || Number.isNaN(val)) return "0";
  return Math.round(val).toLocaleString("en-IN");
};

function getNewCompAmount(emp: any, chName: string): number {
  const normCh = chName.trim().toLowerCase();
  const oldAmt = emp.oldFieldValuesMap?.[normCh] || 0;

  if (normCh === "pt" || normCh === "professional tax") {
    if (emp.breakdown && emp.breakdown.ptAmount !== undefined && emp.breakdown.ptAmount > 0) {
      return emp.breakdown.ptAmount;
    }
    return oldAmt;
  }

  if (normCh === "esi" || normCh === "esic") {
    if (emp.breakdown && emp.breakdown.esiEmployee !== undefined && emp.breakdown.esiEmployee > 0) {
      return emp.breakdown.esiEmployee;
    }
    return oldAmt;
  }

  if (normCh === "pf" || normCh === "epf") {
    if (emp.breakdown && emp.breakdown.pfEmployee !== undefined && emp.breakdown.pfEmployee > 0) {
      return emp.breakdown.pfEmployee;
    }
    return oldAmt;
  }

  if (!emp.breakdown) return oldAmt;

  const foundEarning = emp.breakdown.earnings?.find(
    (e: any) =>
      e.name?.trim().toLowerCase() === normCh ||
      normCh.includes(e.name?.trim().toLowerCase()) ||
      e.name?.trim().toLowerCase().includes(normCh)
  );
  if (foundEarning) return foundEarning.amount;

  const foundDeduction = emp.breakdown.deductions?.find(
    (d: any) =>
      d.name?.trim().toLowerCase() === normCh ||
      normCh.includes(d.name?.trim().toLowerCase()) ||
      d.name?.trim().toLowerCase().includes(normCh)
  );
  if (foundDeduction) return foundDeduction.amount;

  return oldAmt;
}

function IncrementValueDisplay({
  oldVal,
  newVal,
}: {
  oldVal?: number;
  newVal?: number;
}) {
  const safeOld = Math.round(oldVal || 0);
  const safeNew = Math.round(newVal || 0);
  const diff = safeNew - safeOld;

  if (diff === 0) {
    return <span className="text-muted-foreground">{fmt(safeNew || safeOld)}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="line-through text-muted-foreground/60 text-[11px]">
          {fmt(safeOld)}
        </span>
        <span className="text-muted-foreground/40 text-[10px]">→</span>
        <span className="font-bold text-foreground text-xs">{fmt(safeNew)}</span>
      </div>
      <span
        className={cn(
          "text-[10px] font-semibold px-1 py-0.2 rounded",
          diff > 0
            ? "text-emerald-400 bg-emerald-500/10"
            : "text-rose-400 bg-rose-500/10"
        )}
      >
        {diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
      </span>
    </div>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { payrollId } = params;
  if (!payrollId) {
    return json({
      payrollData: null,
      comparisonData: [],
      componentHeaders: [],
      siteList: [],
      deptList: [],
      error: "Payroll ID is required",
    });
  }

  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const { data: payrollData } = await getPayrollById({
      supabase,
      payrollId,
    });

    if (!payrollData) {
      return json({
        payrollData: null,
        comparisonData: [],
        componentHeaders: [],
        siteList: [],
        deptList: [],
        error: "Payroll not found",
      });
    }

    const { data: attendanceEntries } = await getSalaryEntriesByPayrollId({
      supabase,
      payrollId,
      month: Number(payrollData.month),
      year: Number(payrollData.year),
      companyId,
      limit: 10000,
    });

    const { data: siteData } = await getSiteNamesByCompanyId({ supabase, companyId });
    const { data: deptData } = await getDepartmentsByCompanyId({ supabase, companyId });

    const siteList = (siteData || []).map((s: any) => s.name).filter(Boolean);
    const deptList = (deptData || []).map((d: any) => d.name).filter(Boolean);

    const employeeCodes = Array.from(
      new Set(
        (attendanceEntries || [])
          .map((att: any) => att.employee?.employee_code)
          .filter(Boolean)
      )
    );

    const { data: employeesSalaryData } = await getEmployeesWithSalaryByEmployeeCodes({
      supabase,
      employeeCodes: employeeCodes as string[],
    });

    const salaryMasterMap = new Map<string, any>();
    if (employeesSalaryData) {
      for (const emp of employeesSalaryData) {
        salaryMasterMap.set(emp.employee_code, emp);
      }
    }

    const componentHeaderMap = new Map<string, { id: string; name: string; type: string }>();

    const comparisonData = (attendanceEntries || []).map((att: any) => {
      const emp = att.employee || {};
      const empCode = emp.employee_code || "";
      const empName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "Unknown";

      const workDetails = emp.work_details;
      const siteName = workDetails?.site?.name || "N/A";
      const department = workDetails?.department?.name || "N/A";

      const presentDays = Number(att.present_days || 0);
      const workingDays = Number(att.working_days || att.total_days || 26);
      const paidHolidays = Number(att.paid_holidays || 0);
      const paidLeaves = Number(att.paid_leaves || 0);
      const casualLeaves = Number(att.casual_leaves || 0);
      const overtimeHours = Number(att.overtime_hours || 0);

      const salaryEntry = att.salary_entries || {};
      const salaryEntryId = salaryEntry.id || null;

      const masterEmp = salaryMasterMap.get(empCode);
      const resolvedSalary = masterEmp
        ? resolveEmployeeSalary(masterEmp, payrollData?.run_date)
        : null;

      const oldFieldValuesMap: Record<string, number> = {};
      const fieldValuesList = salaryEntry.salary_field_values || [];

      let sumOldEarnings = 0;
      for (const fv of fieldValuesList) {
        const fieldName = fv.payroll_fields?.name;
        const fieldType = fv.payroll_fields?.type;
        const fieldId = fv.payroll_fields?.id;
        const amt = Number(fv.amount || 0);

        if (fieldName) {
          const lowerName = fieldName.trim().toLowerCase();
          oldFieldValuesMap[lowerName] = amt;
          if (fieldType === "earning") {
            sumOldEarnings += amt;
          }
          if (!["basic", "basic salary", "esic", "esi", "pf", "epf", "bonus"].includes(lowerName)) {
            componentHeaderMap.set(lowerName, {
              id: fieldId || lowerName,
              name: fieldName,
              type: fieldType || "earning",
            });
          }
        }
      }

      const getOldValue = (keys: string[]) => {
        for (const k of keys) {
          if (oldFieldValuesMap[k] !== undefined) return oldFieldValuesMap[k];
        }
        return 0;
      };

      const rawOldCtc = Number(salaryEntry.monthly_ctc || 0);
      const oldBasic = getOldValue(["basic", "basic salary"]);
      const oldBonus = getOldValue(["bonus", "statutory bonus"]);
      const oldEsi = getOldValue(["esic", "esi", "employee esic", "employee esi", "esic deduction"]);
      const oldPf = getOldValue(["pf", "epf", "employee pf", "employee epf", "provident fund", "pf deduction"]);

      let newBreakdown: any = null;
      if (resolvedSalary) {
        newBreakdown = calculateSalaryBreakdown({
          monthlyCtc: resolvedSalary.monthlyCtc,
          basicPercent: resolvedSalary.basicPercent,
          basicAmount: resolvedSalary.basicAmount,
          isProRata: resolvedSalary.isProRata,
          payableDays: presentDays,
          workingDays: workingDays,
          overtimeHours: overtimeHours,
          holidayConfig: (payrollData as any)?.holiday_config || [],
          attendance: {
            paidHolidays,
            paidLeaves,
            casualLeaves,
            overtimeHours,
          },
          components: resolvedSalary.resolvedComponents,
          statutory: resolvedSalary.resolvedStatutory,
        });

        if (newBreakdown) {
          for (const e of newBreakdown.earnings || []) {
            if (e.name?.toLowerCase() !== "basic") {
              const lowerName = e.name.trim().toLowerCase();
              if (!componentHeaderMap.has(lowerName)) {
                componentHeaderMap.set(lowerName, {
                  id: e.id || lowerName,
                  name: e.name,
                  type: "earning",
                });
              }
            }
          }
          for (const d of newBreakdown.deductions || []) {
            if (!["esi", "esic", "pf", "epf"].includes(d.name?.toLowerCase())) {
              const lowerName = d.name.trim().toLowerCase();
              if (!componentHeaderMap.has(lowerName)) {
                componentHeaderMap.set(lowerName, {
                  id: d.id || lowerName,
                  name: d.name,
                  type: "deduction",
                });
              }
            }
          }
        }
      }

      const masterCtc = resolvedSalary ? resolvedSalary.monthlyCtc : 0;
      const oldCtc = rawOldCtc || masterCtc || getOldValue(["monthly ctc", "ctc"]) || sumOldEarnings;
      const newCtc = newBreakdown ? newBreakdown.monthlyCtc : oldCtc;

      const newBasic = newBreakdown ? newBreakdown.basicAmount : oldBasic;
      const newBonus = newBreakdown
        ? (newBreakdown.earnings?.find((e: any) => e.name.toLowerCase().includes("bonus"))?.amount ?? oldBonus)
        : oldBonus;

      const newEsi = newBreakdown
        ? (newBreakdown.esiEmployee > 0 ? newBreakdown.esiEmployee : (oldEsi > 0 ? oldEsi : 0))
        : oldEsi;

      const newPf = newBreakdown
        ? (newBreakdown.pfEmployee > 0 ? newBreakdown.pfEmployee : (oldPf > 0 ? oldPf : 0))
        : oldPf;

      let hasDifference =
        Math.abs(Math.round(oldCtc) - Math.round(newCtc)) > 0.5 ||
        Math.abs(Math.round(oldBasic) - Math.round(newBasic)) > 0.5 ||
        Math.abs(Math.round(oldPf) - Math.round(newPf)) > 0.5 ||
        Math.abs(Math.round(oldEsi) - Math.round(newEsi)) > 0.5;

      if (!hasDifference && newBreakdown) {
        for (const ch of Array.from(componentHeaderMap.values())) {
          const oldCompAmt = oldFieldValuesMap[ch.name.trim().toLowerCase()] || 0;
          const newCompAmt = getNewCompAmount({ oldFieldValuesMap, breakdown: newBreakdown }, ch.name);
          if (Math.abs(Math.round(oldCompAmt) - Math.round(newCompAmt)) > 0.5) {
            hasDifference = true;
            break;
          }
        }
      }

      return {
        id: att.id,
        salaryEntryId,
        attendanceId: att.id,
        employeeId: emp.id,
        employee_code: empCode,
        name: empName,
        location: siteName,
        department,
        presentDays,
        workingDays,
        hasMasterSalary: !!resolvedSalary,
        hasDifference,
        monthlyCtc: newCtc,
        oldCtc,
        oldBasic,
        newBasic,
        oldBonus,
        newBonus,
        oldEsi,
        newEsi,
        oldPf,
        newPf,
        oldFieldValuesMap,
        breakdown: newBreakdown,
      };
    });

    return json({
      payrollData,
      comparisonData,
      componentHeaders: Array.from(componentHeaderMap.values()),
      siteList,
      deptList,
      error: null,
    });
  } catch (err: any) {
    console.error("Error in sync-salary-increments loader:", err);
    return json({
      payrollData: null,
      comparisonData: [],
      componentHeaders: [],
      siteList: [],
      deptList: [],
      error: err.message || "Failed to load sync preview",
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { payrollId } = params;
  if (!payrollId) return json({ status: "error", message: "Payroll ID is required" });

  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "sync-salary-increments") {
      const updates = JSON.parse(formData.get("syncData") as string);

      const { data: existingFields } = await supabase
        .from("payroll_fields")
        .select("id, name, type")
        .eq("payroll_id", payrollId);

      const fieldMap = new Map<string, { id: string; type: string }>();
      if (existingFields) {
        for (const f of existingFields) {
          fieldMap.set(f.name.toLowerCase(), { id: f.id, type: f.type });
        }
      }

      for (const update of updates) {
        let { salaryEntryId, attendanceId, newCtc, fields } = update;

        if (!salaryEntryId && attendanceId) {
          const { data: createdEntry } = await supabase
            .from("salary_entries")
            .insert({
              payroll_id: payrollId,
              monthly_attendance_id: attendanceId,
              monthly_ctc: Math.round(Number(newCtc || 0)),
            })
            .select("id")
            .single();

          if (createdEntry) {
            salaryEntryId = createdEntry.id;
          }
        } else if (salaryEntryId) {
          await supabase
            .from("salary_entries")
            .update({ monthly_ctc: Math.round(Number(newCtc || 0)) })
            .eq("id", salaryEntryId);
        }

        if (!salaryEntryId) continue;

        for (const field of fields) {
          const fieldKey = field.name.toLowerCase();
          let fieldObj = fieldMap.get(fieldKey);

          if (!fieldObj) {
            const { data: newField, error: insertFieldError } = await supabase
              .from("payroll_fields")
              .insert({
                payroll_id: payrollId,
                name: field.name,
                type: field.type,
              })
              .select()
              .single();

            if (!insertFieldError && newField) {
              fieldObj = { id: newField.id, type: newField.type };
              fieldMap.set(fieldKey, fieldObj);
            }
          }

          if (fieldObj) {
            const { data: existingVal } = await supabase
              .from("salary_field_values")
              .select("id")
              .eq("salary_entry_id", salaryEntryId)
              .eq("payroll_field_id", fieldObj.id)
              .maybeSingle();

            if (existingVal) {
              await supabase
                .from("salary_field_values")
                .update({
                  amount: field.amount,
                  consider_for_epf: field.consider_for_epf ?? false,
                })
                .eq("id", existingVal.id);
            } else {
              await supabase.from("salary_field_values").insert({
                salary_entry_id: salaryEntryId,
                payroll_field_id: fieldObj.id,
                amount: field.amount,
                consider_for_epf: field.consider_for_epf ?? false,
              });
            }
          }
        }
      }

      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });

      return json({
        status: "success",
        message: `Successfully updated ${updates.length} employee salary entries`,
      });
    }

    return json({ status: "error", message: "Invalid action intent" });
  } catch (err: any) {
    console.error("Error in sync-salary-increments action:", err);
    return json({ status: "error", message: err.message || "Failed to update salary entries" });
  }
}

import { UpdateIncrementPayrollPage } from "@/components/payroll/update-increment-payroll-page";

export default function SyncSalaryIncrementsPage() {
  const {
    comparisonData = [],
    componentHeaders = [],
    siteList = [],
    deptList = [],
    error,
  } = useLoaderData<typeof loader>();

  return (
    <UpdateIncrementPayrollPage
      comparisonData={comparisonData}
      componentHeaders={componentHeaders}
      siteList={siteList}
      deptList={deptList}
      error={error}
    />
  );
}
