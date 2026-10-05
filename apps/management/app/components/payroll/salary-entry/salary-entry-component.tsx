import type React from "react";
import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { Button, buttonVariants } from "@canny_ecosystem/ui/button";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import {
  Outlet,
  useNavigation,
  useParams,
  useSubmit,
  useLocation,
} from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import {
  calculateFieldTotalsWithNetPay,
  getUniqueFields,
  calculateSalaryBreakdown,
  getMonthNameFromNumber,
  roundToNearest,
  isBasicComponent,
  isPhWagesComponent,
  getCompAmount,
} from "@canny_ecosystem/utils";
import { useDebounce } from "@canny_ecosystem/utils/hooks/debounce";
import { useToast } from "@canny_ecosystem/ui/use-toast";

import type {
  PayrollDatabaseRow,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { PayrollActions } from "../payroll-actions";
import { SalaryEntryDataTable } from "./salary-entry-table/data-table";
import { ExcelSalaryTable } from "./excel-salary-table";
import { salaryEntryColumns } from "./salary-entry-table/columns";
import { ImportDepartmentPayrollDialog } from "../import-department-payroll-dialog";
import { useSalaryEntriesStore } from "@/store/salary-entries";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { useSalaryData } from "@/utils/hooks/salary-data";
import { FilterControls } from "./filter-controls";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { Label } from "@canny_ecosystem/ui/label";
import { Input } from "@canny_ecosystem/ui/input";
import { PayrollSummarySheet } from "./payroll-summary-sheet";
import { ColumnVisibility } from "./column-visibility";
import { DELETE_TEXT } from "@canny_ecosystem/utils/constant";
import { ErrorList } from "@canny_ecosystem/ui/forms";
import { LoadingSpinner } from "@/components/loading-spinner";

export function SalaryEntryComponent({
  data,
  payrollData,
  companyData,
  companyLocation,
  companyRelations,
  noButtons = false,
  env,
  fromWhere,
  allSiteOptions,
  allProjectOptions,
  allDepartmentOptions,
  allLocationOptions,
  allEsicOptions = [],
  holidayConfig,
  totalCount,
  page,
  limit,
  isLoading = false,
  missingEmployees = [],
  payrollFields,
}: {
  data: any[];
  payrollData: Omit<PayrollDatabaseRow, "created_at"> & {
    site?: { name: string } | null;
    project?: { name: string } | null;
  };
  companyData?: any;
  companyLocation?: any;
  companyRelations?: any;
  noButtons?: boolean;
  env: SupabaseEnv;
  fromWhere: "runpayroll" | "payrollhistory";
  allSiteOptions: ComboboxSelectOption[];
  allProjectOptions: ComboboxSelectOption[];
  allDepartmentOptions: ComboboxSelectOption[];
  allLocationOptions: ComboboxSelectOption[];
  allEsicOptions?: ComboboxSelectOption[];
  holidayConfig?: Array<{
    type: "overtime_hours" | "paid_holidays" | "paid_leaves" | "casual_leaves";
    multiplier: number;
    working_days?: number | null;
    use_attendance_working_days?: boolean;
  }>;
  totalCount: number;
  page: number;
  limit: number;
  isLoading?: boolean;
  missingEmployees?: any[];
  payrollFields?: any[];
}) {
  const { selectedRows, setSelectedRows, setRowSelection, rowSelection } =
    useSalaryEntriesStore();
  const { role } = useUser();
  const { payrollId } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const [isExcelView, setIsExcelView] = useState(false);

  const submit = useSubmit();
  const navigation = useNavigation();

  const dbSalaryEntryIds = useMemo(() => {
    return selectedRows
      .filter((row: any) => row.source === "db" && row.salary_entries?.id)
      .map((row: any) => row.salary_entries.id);
  }, [selectedRows]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInputValue, setDeleteInputValue] = useState("");
  const [deleteInputError, setDeleteInputError] = useState<string[]>([]);

  const handleCancelDelete = () => {
    setDeleteInputError([]);
    setDeleteInputValue("");
    setDeleteOpen(false);
  };

  const handleDeleteEntries = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    if (deleteInputValue === DELETE_TEXT) {
      if (dbSalaryEntryIds.length === 0 || !payrollId) return;

      submit(
        {
          intent: "delete-entries",
          entryIds: JSON.stringify(dbSalaryEntryIds),
        },
        {
          method: "POST",
          action: `${location.pathname}${location.search}`,
        },
      );

      clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
      setDeleteInputValue("");
      setDeleteInputError([]);
      setDeleteOpen(false);
    } else {
      e.preventDefault();
      setDeleteInputError(["Please type the correct text to confirm."]);
    }
  };

  useEffect(() => {
    setSelectedRows([]);
    setRowSelection({});
  }, [payrollId, setSelectedRows, setRowSelection]);
  const [open, setOpen] = useState(false);
  const [workingDays, setWorkingDays] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [highSalaryAlertOpen, setHighSalaryAlertOpen] = useState(false);

  const [tableData, setTableData] = useState(data);
  const pendingUpdatesRef = useRef<Record<string, any>>({});

  useEffect(() => {
    setTableData(data);
  }, [data]);

  const handleSuccess = useCallback(
    (updatedEntry: any) => {
      if (!updatedEntry) return;
      pendingUpdatesRef.current[updatedEntry.id] = updatedEntry;
      setTableData((prev) =>
        prev.map((row) =>
          row.id === updatedEntry.id ? { ...row, ...updatedEntry } : row,
        ),
      );
      if (payrollId) {
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
      }
    },
    [payrollId],
  );

  const disable =
    navigation.state === "submitting" ||
    navigation.state === "loading" ||
    isLoading;

  const isFullPageLoading =
    navigation.state === "submitting" ||
    (navigation.state === "loading" &&
      Boolean(navigation.formData || navigation.formMethod));

  const submissionIntent = navigation.formData?.get("intent");
  let fullPageLoadingMessage = "Processing your request... Please wait";
  if (submissionIntent === "submit-entries") {
    fullPageLoadingMessage = "Submitting salary entries... Please wait";
  } else if (submissionIntent === "delete-entries") {
    fullPageLoadingMessage = "Deleting salary entries... Please wait";
  } else if (submissionIntent === "update-payroll-status") {
    fullPageLoadingMessage = "Updating payroll status... Please wait";
  }

  const computedData = useMemo(() => {
    return tableData.map((row: any) => {
      const pendingUpdate = pendingUpdatesRef.current[row.id];
      if (pendingUpdate) {
        row = { ...row, ...pendingUpdate };
      }
      const payroll_id = payrollId || row.salary_entries?.payroll_id;
      let assignment = row.employee?.salary_assignment;

      if (assignment && assignment.effective_date && payrollData) {
        const lastDayOfMonth = new Date(
          payrollData.year,
          payrollData.month,
          0,
        ).getDate();
        const lastDayOfMonthStr = `${payrollData.year}-${String(payrollData.month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
        if (assignment.effective_date > lastDayOfMonthStr) {
          const allAssignments = Array.isArray(
            row.employee?.employee_salary_assignment,
          )
            ? row.employee.employee_salary_assignment
            : [];
          const valid = allAssignments.filter(
            (a: any) => !a.effective_date || a.effective_date <= lastDayOfMonthStr,
          );
          if (valid.length > 0) {
            assignment = valid[0];
          }
        }
      }

      if (!assignment && !row.salary_entries) {
        return {
          ...row,
          source: "auto",
          salary_entries: {
            ...row.salary_entries,
            salary_field_values: [],
            payroll_id,
          },
        };
      }

      const today = new Date();
      const templateVersions =
        assignment?.payment_templates?.payment_template_versions || [];
      const latestVersion = Array.isArray(templateVersions)
        ? templateVersions
          .filter(
            (v: any) =>
              !v.effective_date || new Date(v.effective_date) <= today,
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.effective_date).getTime() -
              new Date(a.effective_date).getTime(),
          )[0]
        : templateVersions;

      const hasCustomComponents =
        Array.isArray(assignment?.employee_salary_components) &&
        assignment.employee_salary_components.length > 0;

      const useTemplateVal =
        assignment?.use_payment_template && !hasCustomComponents;

      const resolvedComponents = useTemplateVal
        ? latestVersion?.payment_template_components ||
        assignment?.employee_salary_components
        : assignment?.employee_salary_components ||
        latestVersion?.payment_template_components;

      const isProRata = useTemplateVal
        ? latestVersion?.is_pro_rata ?? assignment?.is_pro_rata
        : assignment?.is_pro_rata ?? latestVersion?.is_pro_rata;

      const rawStatutory = useTemplateVal
        ? latestVersion?.payment_statutory_components ||
        assignment?.employee_salary_statutory_components
        : assignment?.employee_salary_statutory_components ||
        latestVersion?.payment_statutory_components;

      const monthlyCtc =
        row.salary_entries?.monthly_ctc &&
          Number(row.salary_entries.monthly_ctc) !== 0
          ? Number(row.salary_entries.monthly_ctc)
          : useTemplateVal
            ? Number(latestVersion?.monthly_ctc || assignment?.monthly_ctc || 0)
            : Number(assignment?.monthly_ctc || latestVersion?.monthly_ctc || 0);

      const basicPercent = useTemplateVal
        ? Number(latestVersion?.basic_percent || assignment?.basic_percent || 0)
        : Number(assignment?.basic_percent || latestVersion?.basic_percent || 0);

      const statutory = {
        pf: rawStatutory?.pf,
        esi: rawStatutory?.esi,
        pt: rawStatutory?.pt,
        bonus: rawStatutory?.bonus,
        lwf: rawStatutory?.lwf,
      };

      const payableDays = row.present_days || 0;

      const persistedEntries = row.salary_entries?.salary_field_values || [];
      const persistedFieldMap = new Map<string, number>();
      for (const sfv of persistedEntries) {
        const fname = (sfv.payroll_fields?.name || sfv.name || "").trim().toLowerCase();
        const amt = Number(sfv.amount || 0);
        if (fname) persistedFieldMap.set(fname, amt);
      }

      const explicitBasicAmount = useTemplateVal
        ? Number(latestVersion?.basic_amount || assignment?.basic_amount || 0)
        : Number(assignment?.basic_amount || latestVersion?.basic_amount || 0);

      const basicCompInResolved = (resolvedComponents || []).find(
        (c: any) => isBasicComponent(c.payment_fields) || isBasicComponent(c),
      );
      const basicCompAmt = basicCompInResolved ? getCompAmount(basicCompInResolved) : 0;

      const persistedBasic =
        persistedFieldMap.get("basic") ??
        persistedFieldMap.get("basic pay") ??
        persistedFieldMap.get("basic salary");

      let basicAmountToUse = explicitBasicAmount || basicCompAmt;
      if (!basicAmountToUse && persistedBasic !== undefined && persistedBasic > 0) {
        if (isProRata && payableDays > 0 && (row.working_days || 0) > 0) {
          basicAmountToUse = Math.round((persistedBasic / payableDays) * (row.working_days || 0));
        } else {
          basicAmountToUse = persistedBasic;
        }
      }

      const componentsWithActualAmounts = (resolvedComponents || []).map((c: any) => {
        const fieldName = (c.payment_fields?.name || c.name || "").trim().toLowerCase();
        let amount = c.amount;
        if (fieldName && persistedFieldMap.has(fieldName)) {
          amount = persistedFieldMap.get(fieldName)!;
        }
        return {
          ...c,
          amount,
        };
      });

      const basicFormula =
        assignment?.basic_formula ||
        latestVersion?.basic_formula ||
        null;
      const calculationDirection =
        assignment?.calculation_direction ||
        latestVersion?.calculation_direction ||
        null;

      const adjustedCalculation = calculateSalaryBreakdown({
        monthlyCtc,
        basicPercent,
        basicAmount: basicAmountToUse,
        basicFormula,
        calculationDirection,
        isProRata: isProRata,
        payableDays,
        workingDays: row.working_days || 0,
        overtimeHours: row.overtime_hours || 0,
        holidayConfig: holidayConfig || [],
        attendance: {
          paidHolidays: row.paid_holidays || 0,
          paidLeaves: row.paid_leaves || 0,
          casualLeaves: row.casual_leaves || 0,
          overtimeHours: row.overtime_hours || 0,
        },
        components: componentsWithActualAmounts,
        statutory,
        month: row.month || payrollData?.month,
      });

      if (row.salary_entries && (row.salary_entries.salary_field_values || []).length > 0) {
        const persistedEntries = row.salary_entries.salary_field_values || [];
        const earnings: any[] = [];
        const deductions: any[] = [];
        let grossAmount = 0;
        let deductionsTotal = 0;

        for (const sfv of persistedEntries) {
          const name = sfv.payroll_fields?.name;
          const type = sfv.payroll_fields?.type?.toLowerCase() || "";
          const amount = Number(sfv.amount || 0);

          if (name) {
            if (type.includes("earning")) {
              earnings.push({
                id: sfv.payroll_field_id || name,
                name: name,
                amount: amount,
                rule: "Persisted",
              });
              grossAmount += amount;
            } else if (type.includes("deduction")) {
              deductions.push({
                id: sfv.payroll_field_id || name,
                name: name,
                amount: amount,
                rule: "Persisted",
              });
              deductionsTotal += amount;
            }
          }
        }

        const basicEntry = persistedEntries.find((sfv: any) => {
          const n = (sfv.payroll_fields?.name || "").toUpperCase();
          return n === "BASIC" || n === "BASIC PAY" || n === "BASIC SALARY";
        });
        const basicAmount = basicEntry ? Number(basicEntry.amount || 0) : adjustedCalculation.basicAmount;

        const netAmount = roundToNearest(grossAmount) - roundToNearest(deductionsTotal);

        return {
          ...row,
          source: "db",
          calculation: {
            monthlyCtc,
            basicPercent,
            basicAmount,
            basicDailyRate: (row.working_days || 0) > 0 ? basicAmount / row.working_days : 0,
            payableDays,
            workingDays: row.working_days || 0,
            earnings,
            deductions,
            grossAmount: roundToNearest(grossAmount),
            deductionsTotal: roundToNearest(deductionsTotal),
            netAmount,
            adjustedPayableDays: adjustedCalculation.adjustedPayableDays,
            payableDaysBreakdown: adjustedCalculation.payableDaysBreakdown,
          },
          salary_entries: {
            ...row.salary_entries,
            salary_field_values: persistedEntries,
            payroll_id,
          },
        };
      }

      const fieldMap = new Map<string, any>();

      for (const e of adjustedCalculation.earnings) {
        fieldMap.set(e.name.toLowerCase(), {
          amount: e.amount,
          source: "auto",
          consider_for_epf: e.consider_for_epf,
          consider_for_esic: e.consider_for_esic,
          payroll_fields: {
            name: e.name,
            type: "earning",
            consider_for_epf: e.consider_for_epf,
            consider_for_esic: e.consider_for_esic,
          },
        });
      }

      for (const d of adjustedCalculation.deductions) {
        fieldMap.set(d.name.toLowerCase(), {
          amount: d.amount,
          source: "auto",
          consider_for_epf: d.consider_for_epf,
          consider_for_esic: d.consider_for_esic,
          payroll_fields: {
            name: d.name,
            type: "deduction",
            consider_for_epf: d.consider_for_epf,
            consider_for_esic: d.consider_for_esic,
          },
        });
      }

      const dynamicFieldValues = Array.from(fieldMap.values());

      return {
        ...row,
        source: "auto",
        calculation: {
          monthlyCtc: adjustedCalculation.monthlyCtc,
          basicPercent: adjustedCalculation.basicPercent,
          basicAmount: adjustedCalculation.basicAmount,
          basicDailyRate: adjustedCalculation.basicDailyRate,
          payableDays: adjustedCalculation.payableDays,
          workingDays: adjustedCalculation.workingDays,
          earnings: adjustedCalculation.earnings,
          deductions: adjustedCalculation.deductions,
          grossAmount: adjustedCalculation.grossAmount,
          deductionsTotal: adjustedCalculation.deductionsTotal,
          netAmount: adjustedCalculation.netAmount,
          adjustedPayableDays: adjustedCalculation.adjustedPayableDays,
          payableDaysBreakdown: adjustedCalculation.payableDaysBreakdown,
        },
        salary_entries: {
          ...row.salary_entries,
          salary_field_values: dynamicFieldValues,
          payroll_id,
        },
      };
    });
  }, [tableData, payrollId, holidayConfig]);

  const {
    siteOptions,
    departmentOptions,
    projectOptions,
    esicOptions,
    filteredData,
    searchString,
    setSearchString,
    selectedSiteIds,
    selectedDeptIds,
    selectedProjectIds,
    selectedEsicIds,
    updateSites,
    updateDepts,
    updateProjects,
    updateEsics,
  } = useSalaryData(computedData, {
    siteOptions: allSiteOptions,
    projectOptions: allProjectOptions,
    departmentOptions: allDepartmentOptions,
    esicOptions: allEsicOptions,
  });

  const [localSearch, setLocalSearch] = useState(searchString);
  const debouncedSetSearch = useDebounce(setSearchString, 500);

  useEffect(() => {
    setLocalSearch(searchString);
  }, [searchString]);

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    debouncedSetSearch(val);
  };

  const totals = useMemo(
    () =>
      calculateFieldTotalsWithNetPay(
        selectedRows.length ? selectedRows : computedData,
      ),
    [selectedRows, computedData],
  );

  const highSalaryEmployees = useMemo(() => {
    return computedData.filter(
      (row: any) => (row.calculation?.netAmount ?? 0) > 50000,
    );
  }, [computedData]);

  const uniqueFields = useMemo(
    () => getUniqueFields(computedData, payrollFields),
    [computedData, payrollFields],
  );

  const existingEmployeeIds = useMemo(
    () =>
      computedData
        .filter((row: any) => row.source === "db")
        .map((row: any) => String(row.employee_id)),
    [computedData],
  );

  const allRowsArePersisted = useMemo(
    () => computedData.every((row: any) => row.source === "db"),
    [computedData],
  );

  const selectedProjectNames = useMemo(() => {
    return selectedProjectIds
      .map(
        (id) =>
          allProjectOptions.find((p) => String(p.value) === String(id))?.label,
      )
      .filter(Boolean) as string[];
  }, [selectedProjectIds, allProjectOptions]);

  const allRowsHaveInvoiceId = useMemo(
    () => computedData.every((row: any) => !!row.salary_entries?.invoice_id),
    [computedData],
  );

  const handleSubmitEntries = useCallback(() => {
    if (!selectedRows.length || !payrollId) return;

    const submissionData = selectedRows.map((row: any) => ({
      employee_id: row.employee_id,
      monthly_attendance_id: row.id,
      monthly_ctc: row.calculation?.monthlyCtc ?? 0,
      fields: (row.salary_entries?.salary_field_values || []).map((f: any) => ({
        name: f.payroll_fields?.name ?? "",
        type: f.payroll_fields?.type ?? "",
        amount: f.amount ?? 0,
        consider_for_epf:
          f.consider_for_epf ?? f.payroll_fields?.consider_for_epf ?? false,
      })),
    }));

    submit(
      {
        intent: "submit-entries",
        data: JSON.stringify(submissionData),
        payrollId,
      },
      {
        method: "POST",
        action: `${location.pathname}${location.search}`,
      },
    );

    clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
    clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
  }, [payrollId, selectedRows, submit, location]);

  const updateStatusPayroll = useCallback(
    (
      e: React.MouseEvent<HTMLButtonElement>,
      status: PayrollDatabaseRow["status"],
    ) => {
      e.preventDefault();
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
      submit(
        {
          data: JSON.stringify({
            id: payrollId ?? payrollData?.id,
            status: status,
          }),
          redirectUrl: `${location.pathname}${location.search}`,
        },
        {
          method: "POST",
          action: `${location.pathname}${location.search}`,
        },
      );
    },
    [payrollId, payrollData, submit, location],
  );

  const handleUpdateBulkAttendances = useCallback(() => {
    if (!selectedRows.length || !workingDays || !payrollId) return;

    const formData = new FormData();

    formData.append("payrollId", payrollId);

    formData.append(
      "attendancesData",
      JSON.stringify(
        selectedRows.map((row: any) => ({
          employee_id: row.employee_id,
          month: row.month,
          year: row.year,
          working_days: Number(workingDays),
          present_days: row.present_days,
          overtime_hours: row.overtime_hours,
        })),
      ),
    );

    submit(formData, {
      method: "post",
      action: `/payroll/run-payroll/${payrollId}/update-working-days${location.search}`,
      replace: true,
    });

    setWorkingDays("");
    clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
  }, [payrollId, selectedRows, workingDays, submit, location]);

  const handleDialogOpen = (isOpen: boolean) => {
    setOpen(isOpen);

    if (isOpen && selectedRows.length > 0) {
      setWorkingDays(String(selectedRows[0].working_days ?? ""));
    }
  };

  const monthName = getMonthNameFromNumber(payrollData.month ?? 0);
  const year = payrollData.year;

  const columns = useMemo(
    () =>
      salaryEntryColumns({
        uniqueFields,
        data: computedData,
        editable: payrollData?.status === "pending",
        page,
        limit,
        rowSelection,
        onSuccess: handleSuccess,
      }),
    [
      uniqueFields,
      computedData,
      payrollData?.status,
      page,
      limit,
      rowSelection,
      handleSuccess,
    ],
  );

  return (
    <section className="px-4 flex flex-col max-h-full gap-3 overflow-hidden bg-background relative">
      {isFullPageLoading && (
        <div className="fixed inset-0 z-[99999] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 transition-all duration-300 pointer-events-auto select-none">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-24 h-24 rounded-full bg-primary/20 animate-ping" />
            <div className="relative bg-card/95 border border-border p-8 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-4 min-w-[300px]">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-base font-semibold text-foreground tracking-wide">
                  {fullPageLoadingMessage}
                </p>
                <p className="text-xs text-muted-foreground">
                  Please do not refresh or leave the page
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="pt-4 pb-0 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4 flex-1 w-full">
          <div className="inline-flex items-center gap-4 px-5 py-1 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 shadow-sm backdrop-blur-sm shrink-0">
            <div className="flex items-center justify-center w-6 h-6 rounded-xl bg-primary/10 text-primary">
              <Icon name="calendar" size="sm" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Payroll Period
              </p>
              <h1 className="text-base font-bold text-foreground">
                {monthName} {year}
              </h1>
            </div>
          </div>

          <div className="flex-1 w-full overflow-x-auto overflow-y-visible py-0">
            <FilterControls
              searchString={searchString}
              onSearchChange={setSearchString}
              siteOptions={siteOptions}
              departmentOptions={departmentOptions}
              projectOptions={projectOptions}
              esicOptions={esicOptions}
              selectedSiteIds={selectedSiteIds}
              selectedDeptIds={selectedDeptIds}
              selectedProjectIds={selectedProjectIds}
              selectedEsicIds={selectedEsicIds}
              updateSites={updateSites}
              updateDepts={updateDepts}
              updateProjects={updateProjects}
              updateEsics={updateEsics}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 w-full">
        <Button
          variant={isExcelView ? "outline" : "muted"}
          onClick={() => setIsExcelView((prev) => !prev)}
          className={cn(
            "h-10 shrink-0 font-medium border border-input text-foreground shadow-sm transition-all cursor-pointer",
            isExcelView ? "bg-background hover:bg-muted" : "bg-muted hover:bg-muted/80",
          )}
        >
          {isExcelView ? "Standard View" : "Excel View"}
        </Button>

        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
            <Icon name="magnifying-glass" size="sm" />
          </div>
          <Input
            placeholder="Search Salary Entries by name, code, site, project..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-4 h-10 w-full focus-visible:ring-1 shadow-sm bg-background border-input"
          />
        </div>

        <ColumnVisibility className="h-10 w-10 shrink-0" />

        <div
          className={cn(
            "flex flex-row items-center gap-3 shrink-0 ml-auto w-full md:w-auto overflow-x-auto pb-1 md:pb-0",
            noButtons && "hidden",
          )}
        >
          {selectedRows.length > 0 &&
            selectedRows.some((row: any) => row.source !== "db") && (
              <Button
                onClick={handleSubmitEntries}
                className="h-10 shrink-0"
                disabled={disable}
              >
                {disable && navigation.state === "submitting" ? (
                  <span className="flex items-center gap-2">
                    <Spinner size={16} barClassName="bg-primary-foreground" />
                    Submitting...
                  </span>
                ) : (
                  `Submit Entries (${selectedRows.length})`
                )}
              </Button>
            )}

          <Button
            onClick={(e) => updateStatusPayroll(e, "approved")}
            className={cn(
              "hidden h-10 shrink-0",
              allRowsArePersisted &&
              allRowsHaveInvoiceId &&
              payrollData.status !== "approved" &&
              "flex",
            )}
            disabled={disable}
          >
            {disable && navigation.state === "submitting" ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} barClassName="bg-primary-foreground" />
                Approving...
              </span>
            ) : (
              "Approve"
            )}
          </Button>

          <Button
            variant="muted"
            onClick={(e) => updateStatusPayroll(e, "pending")}
            className={cn(
              "hidden h-10 shrink-0",
              payrollData.status === "submitted" && "flex",
            )}
            disabled={disable}
          >
            {disable && navigation.state === "submitting" ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} barClassName="bg-primary" />
                Updating...
              </span>
            ) : (
              "Undo Submit"
            )}
          </Button>

          <div
            className={cn(
              fromWhere.toLowerCase() === "payrollhistory" && "hidden",
              "shrink-0",
            )}
          >
            <ImportDepartmentPayrollDialog
              uniqueFields={uniqueFields}
              payrollId={payrollId!}
              allSiteOptions={allSiteOptions}
              existingEmployeeIds={existingEmployeeIds}
              payrollFields={payrollFields}
              selectedRows={selectedRows}
              payrollData={payrollData}
            />
          </div>
          <div
            className={cn(
              "border border-dotted border-r-muted-foreground h-6",
              !selectedRows.length && "hidden",
              role === "executive" && "hidden",
            )}
          />
          <AlertDialog open={open} onOpenChange={handleDialogOpen}>
            <Button
              variant="muted"
              size="icon"
              onClick={() => setSummaryOpen(true)}
              className={cn(
                "h-10 w-10 border border-input shrink-0",
                !selectedRows.length && "hidden",
              )}
            >
              <Icon name="chart" className="h-[18px] w-[18px]" />
            </Button>

            {highSalaryEmployees.length > 0 && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setHighSalaryAlertOpen(true)}
                className="h-10 w-10 shrink-0 animate-pulse"
                title={`${highSalaryEmployees.length} employees exceed 50,000 net pay`}
              >
                <Icon
                  name="exclaimation-triangle"
                  className="h-[18px] w-[18px]"
                />
              </Button>
            )}
            <AlertDialogTrigger
              className={cn(
                buttonVariants({ variant: "muted", size: "icon" }),
                "h-10 w-10  border border-input shrink-0",
                !selectedRows.length && "hidden",
                role === "executive" && "hidden",
              )}
            >
              <Icon name="edit" className="h-[18px] w-[18px]" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Update Bulk Working Days</AlertDialogTitle>
              </AlertDialogHeader>

              <div className="flex flex-col gap-1">
                <Label className="text-sm font-medium">Working Days</Label>
                <Input
                  type="number"
                  placeholder="Enter Working Days"
                  value={workingDays}
                  onChange={(e) => setWorkingDays(e.target.value)}
                />
              </div>
              <AlertDialogFooter className="pt-2">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(buttonVariants({ variant: "default" }))}
                  onClick={handleUpdateBulkAttendances}
                >
                  Submit
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {dbSalaryEntryIds.length > 0 && role !== "executive" && (
            <AlertDialog
              open={deleteOpen}
              onOpenChange={(val) => {
                setDeleteOpen(val);
                if (!val) {
                  setDeleteInputValue("");
                  setDeleteInputError([]);
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="muted"
                  size="icon"
                  className="h-10 w-10 border border-input shrink-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                  disabled={disable}
                >
                  <Icon name="trash" className="h-[18px] w-[18px]" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Salary Entries</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {dbSalaryEntryIds.length}{" "}
                    selected salary entries? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <p className="text-sm text-foreground/80">
                    Please type{" "}
                    <i className="text-foreground font-medium">{DELETE_TEXT}</i>{" "}
                    to confirm.
                  </p>
                  <Input
                    type="text"
                    autoFocus
                    value={deleteInputValue}
                    onChange={(e) => {
                      setDeleteInputValue(e.target.value);
                      setDeleteInputError([]);
                    }}
                    className="border border-input rounded-md h-10 w-full mt-2"
                    placeholder="Confirm your action"
                    onPaste={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  />
                  <ErrorList errors={deleteInputError} />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={handleCancelDelete}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteEntries}
                    onSelect={handleDeleteEntries}
                    className={cn(buttonVariants({ variant: "destructive" }))}
                  >
                    {disable ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <PayrollActions
          className={cn(!selectedRows.length && "hidden", "shrink-0")}
          payrollData={payrollData}
          allLocationOptions={allLocationOptions}
          payrollId={payrollId ?? payrollData?.id}
          data={selectedRows.length ? selectedRows : (data as any)}
          env={env}
          fromWhere={fromWhere}
          status={payrollData?.status}
          selectedProjectNames={selectedProjectNames}
          missingEmployees={missingEmployees}
        />
      </div>

      {isExcelView ? (
        <ExcelSalaryTable
          data={filteredData}
          uniqueFields={uniqueFields}
          payrollId={payrollId!}
          editable={payrollData?.status === "pending"}
          onSuccess={handleSuccess}
          totalCount={totalCount}
          page={page}
          limit={limit}
          isLoading={disable && !isFullPageLoading}
        />
      ) : (
        <SalaryEntryDataTable
          data={filteredData}
          columns={columns}
          totalNet={totals.TOTAL as number}
          uniqueFields={uniqueFields}
          totalCount={totalCount}
          page={page}
          limit={limit}
          isLoading={disable && !isFullPageLoading}
          payrollData={payrollData}
          companyData={companyData}
          companyLocation={companyLocation}
          companyRelations={companyRelations}
          allSiteOptions={allSiteOptions}
          editable={payrollData?.status === "pending"}
          env={env}
          payrollFields={payrollFields}
        />
      )}

      <PayrollSummarySheet
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        data={selectedRows.length ? selectedRows : computedData}
      />

      <AlertDialog
        open={highSalaryAlertOpen}
        onOpenChange={setHighSalaryAlertOpen}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Icon name="exclaimation-triangle" className="h-5 w-5" />
              High Salary Alert
            </AlertDialogTitle>
            <div className="text-sm text-muted-foreground mt-2">
              The following employees have a net amount exceeding 50,000. Please
              review their earnings and deductions.
            </div>
          </AlertDialogHeader>

          <div className="max-h-[400px] overflow-y-auto my-4 border rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-semibold">Emp Code</th>
                  <th className="px-4 py-3 font-semibold">Employee Name</th>
                  <th className="px-4 py-3 font-semibold text-right">
                    Net Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {highSalaryEmployees.map((emp) => (
                  <tr key={emp.employee_id} className="border-b border-border">
                    <td className="px-4 py-3 font-mono text-xs">
                      {emp.employee?.employee_code ?? "--"}
                    </td>
                    <td className="px-4 py-3">
                      {`${emp.employee?.first_name ?? ""} ${emp.employee?.last_name ?? ""
                        }`}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-destructive">
                      ₹{roundToNearest(emp.calculation?.netAmount ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "default" }))}
              onClick={() => setHighSalaryAlertOpen(false)}
            >
              Acknowledge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Outlet />
    </section>
  );
}
