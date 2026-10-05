import { useMemo } from "react";
import { Outlet, useNavigation, useParams } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  calculateFieldTotalsWithNetPay,
  getUniqueFields,
  calculateSalaryBreakdown,
} from "@canny_ecosystem/utils";
import type {
  PayrollDatabaseRow,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { PayrollActions } from "../payroll-actions";
import { SalaryEntryDataTable } from "./salary-entry-table/data-table";
import { salaryEntryColumns } from "./salary-entry-table/columns";
import { useSalaryEntriesStore } from "@/store/salary-entries";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PayrollSummaryCard } from "./payroll-summary-card";
import { PayrollDetailsCard } from "./payroll-details-card";
import { FilterControls } from "./filter-controls";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { useSalaryData } from "@/hooks/salary-data";

export function SalaryEntryComponent({
  data,
  payrollData,
  env,
  fromWhere,
  allLocationOptions,
}: {
  data: any[];
  payrollData: Omit<PayrollDatabaseRow, "created_at"> & {
    site?: { name: string } | null;
    project?: { name: string } | null;
  };
  env: SupabaseEnv;
  fromWhere: "runpayroll" | "payrollhistory";
  allSiteOptions: ComboboxSelectOption[];
  allLocationOptions: ComboboxSelectOption[];
}) {
  const { selectedRows } = useSalaryEntriesStore();
  const { payrollId } = useParams();
  const navigation = useNavigation();

  const disable =
    navigation.state === "submitting" || navigation.state === "loading";
  const computedData = useMemo(() => {
    return data.map((row: any) => {
      let assignment = row.employee?.salary_assignment;

      if (assignment && assignment.effective_date && payrollData) {
        const firstDayOfMonthStr = `${payrollData.year}-${String(payrollData.month).padStart(2, "0")}-01`;
        if (assignment.effective_date > firstDayOfMonthStr) {
          assignment = null;
        }
      }

      if (!assignment) return row;

      const templateVersions =
        assignment.payment_templates?.payment_template_versions || [];
      const latestVersion = Array.isArray(templateVersions)
        ? templateVersions.sort(
          (a: any, b: any) =>
            new Date(b.effective_date).getTime() -
            new Date(a.effective_date).getTime(),
        )[0]
        : templateVersions;

      const hasCustomComponents =
        assignment.employee_salary_components &&
        assignment.employee_salary_components.length > 0;

      const useTemplateVal = assignment.use_payment_template && !hasCustomComponents;

      const resolvedComponents = useTemplateVal
        ? latestVersion?.payment_template_components
        : assignment.employee_salary_components;

      const isProRata = useTemplateVal
        ? latestVersion?.is_pro_rata
        : assignment.is_pro_rata;

      const rawStatutory = useTemplateVal
        ? latestVersion?.payment_statutory_components?.[0]
        : assignment.employee_salary_statutory_components;

      const monthlyCtc = useTemplateVal
        ? Number(latestVersion?.monthly_ctc || 0)
        : Number(assignment.monthly_ctc || 0);

      const basicPercent = useTemplateVal
        ? Number(latestVersion?.basic_percent || 0)
        : Number(assignment.basic_percent || 0);

      const statutory = {
        pf: rawStatutory?.pf,
        esi: rawStatutory?.esi,
        pt: rawStatutory?.pt,
        bonus: rawStatutory?.bonus,
        lwf: rawStatutory?.lwf,
      };

      const calculationResult = calculateSalaryBreakdown({
        monthlyCtc,
        basicPercent,
        isProRata: !!isProRata,
        components: resolvedComponents || [],
        statutory,
      });

      const payableDays =
        (row.present_days || 0) +
        (row.paid_leaves || 0) +
        (row.paid_holidays || 0);
      const factor = row.working_days > 0 ? payableDays / row.working_days : 0;

      const adjustedCalculation = {
        basicAmount: calculationResult.basicAmount * factor,
        earnings: calculationResult.earnings.map((e) => ({
          ...e,
          amount: e.amount * factor,
        })),
        deductions: calculationResult.deductions.map((d) => ({
          ...d,
          amount: d.amount * factor,
        })),
        grossAmount: calculationResult.grossAmount * factor,
        netAmount: calculationResult.netAmount * factor,
      };

      const dynamicFieldValues: any[] = [];
      const pushField = (name: string, amount: number, type: string) => {
        const existingField = row.salary_entries?.salary_field_values?.find(
          (sfv: any) =>
            sfv.payroll_fields?.name?.toLowerCase() === name.toLowerCase(),
        );

        dynamicFieldValues.push({
          id: existingField?.id,
          amount,
          payroll_fields: {
            id: existingField?.payroll_fields?.id,
            name,
            type,
          },
        });
      };

      pushField("Basic", adjustedCalculation.basicAmount, "earning");
      for (const e of adjustedCalculation.earnings)
        pushField(e.name, e.amount, "earning");
      for (const d of adjustedCalculation.deductions)
        pushField(d.name, d.amount, "deduction");

      return {
        ...row,
        calculation: {
          basicAmount: adjustedCalculation.basicAmount,
          earnings: adjustedCalculation.earnings,
          deductions: adjustedCalculation.deductions,
          grossAmount: adjustedCalculation.grossAmount,
          netAmount: adjustedCalculation.netAmount,
        },
        salary_entries: {
          ...row.salary_entries,
          salary_field_values: dynamicFieldValues,
        },
      };
    });
  }, [data]);

  const {
    siteOptions,
    departmentOptions,
    filteredData,
    searchString,
    setSearchString,
    selectedSiteIds,
    selectedDeptIds,
    handleFieldChange,
  } = useSalaryData(computedData);

  const totals = useMemo(
    () =>
      calculateFieldTotalsWithNetPay(
        selectedRows.length ? selectedRows : computedData,
      ),
    [selectedRows, computedData],
  );

  const uniqueFields = useMemo(
    () => getUniqueFields(filteredData),
    [filteredData],
  );

  return (
    <section className="p-2 md:p-4 flex flex-col max-h-full gap-4 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PayrollSummaryCard
          totals={totals}
          hasSelectedRows={selectedRows.length > 0}
        />
        <PayrollDetailsCard payrollData={payrollData} />
      </div>

      <div className="w-full flex flex-col md:flex-row items-start gap-3">
        <FilterControls
          searchString={searchString}
          onSearchChange={setSearchString}
          siteOptions={siteOptions}
          departmentOptions={departmentOptions}
          selectedSiteIds={selectedSiteIds}
          selectedDeptIds={selectedDeptIds}
          onFieldChange={handleFieldChange}
          payrollData={payrollData}
        />

        <PayrollActions
          className={cn(
            payrollData?.status === "pending" || !selectedRows.length
              ? "hidden"
              : "",
          )}
          allLocationOptions={allLocationOptions}
          payrollId={payrollId ?? payrollData?.id}
          data={selectedRows.length ? selectedRows : (data as any)}
          env={env}
          fromWhere={fromWhere}
          status={payrollData?.status}
        />
      </div>

      {disable ? (
        <LoadingSpinner className="my-20" />
      ) : (
        <SalaryEntryDataTable
          data={filteredData}
          columns={salaryEntryColumns({
            uniqueFields,
            data: computedData,
            editable: payrollData?.status === "pending",
          })}
          totalNet={totals.TOTAL as number}
          uniqueFields={uniqueFields}
        />
      )}

      <Outlet />
    </section>
  );
}
