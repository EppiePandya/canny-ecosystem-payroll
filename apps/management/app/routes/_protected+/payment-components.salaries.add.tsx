import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { safeRedirect } from "@/utils/server/http.server";
import {
  hasPermission,
  isGoodStatus,
  createRole,
  formatNumber,
} from "@canny_ecosystem/utils";
import {
  getSiteNamesByCompanyId,
  getDepartmentsBySiteId,
  getPaymentFieldsByCompanyId,
  getPaymentTemplatesWithDetailsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import React, { useEffect, useState, useMemo } from "react";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearExactCacheEntry, clearCacheEntry } from "@/utils/cache";
import { Button } from "@canny_ecosystem/ui/button";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@canny_ecosystem/ui/tooltip";
import { upsertEmployeeSalaryAssignment } from "@canny_ecosystem/supabase/mutations";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(user?.role!, `${createRole}:${attribute.paymentComponent}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const url = new URL(request.url);
  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );

  const searchParams = new URLSearchParams(url.searchParams);
  const site = searchParams.get("site") ?? "";

  const { data: siteData } = await getSiteNamesByCompanyId({
    supabase: supabase as any,
    companyId,
  });

  const { data: templateData } =
    await getPaymentTemplatesWithDetailsByCompanyId({
      supabase: supabase as any,
      companyId,
    });

  const { data: paymentFieldsData } = await getPaymentFieldsByCompanyId({
    supabase: supabase as any,
    companyId,
  });

  let employeeData = null;
  let departmentData = null;

  if (site) {
    const { data: depts } = await getDepartmentsBySiteId({
      supabase: supabase as any,
      siteId: site,
    });
    departmentData = depts;

    const { data, error } = await supabase
      .from("employees")
      .select(`
        id,
        employee_code,
        first_name,
        middle_name,
        last_name,
        is_active,
        work_details!work_details_employee_id_fkey!inner(
          employee_id,
          site_id,
          department_id
        ),
        employee_salary_assignment(
          id,
          effective_date,
          monthly_ctc,
          basic_percent,
          is_pro_rata,
          use_payment_template,
          template_id,
          employee_salary_components(
            payment_field_id,
            amount
          )
        )
      `)
      .eq("work_details.site_id", site)
      .eq("is_active", true)
      .order("effective_date", {
        foreignTable: "employee_salary_assignment",
        ascending: false,
      });

    if (error) {
      console.error("Error loading employees with salaries:", error);
    } else {
      const uniqueEmployeesMap = new Map<string, any>();
      for (const emp of data || []) {
        if (!uniqueEmployeesMap.has(emp.id)) {
          uniqueEmployeesMap.set(emp.id, emp);
        }
      }
      employeeData = Array.from(uniqueEmployeesMap.values());
    }
  }

  const siteOptions =
    siteData?.map((siteData) => ({
      label: siteData.name,
      pseudoLabel: siteData?.projects?.name,
      value: siteData.id,
    })) || [];

  const departmentOptions =
    departmentData?.map((dept: any) => ({
      label: dept.name,
      value: dept.id,
    })) || [];

  if (site) {
    departmentOptions.push({
      label: "Other (No Department)",
      value: "other",
    });
  }

  return json({
    siteOptions,
    departmentOptions,
    templates: templateData || [],
    paymentFields: paymentFieldsData || [],
    companyId,
    employeeData,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(user?.role!, `${createRole}:${attribute.paymentComponent}`)
  ) {
    return json(
      { status: "error", message: "Unauthorized" },
      { status: 403, headers },
    );
  }

  const formData = await request.formData();
  const recordsJson = formData.get("recordsJson") as string;
  if (!recordsJson) {
    return json(
      { status: "error", message: "No records to save" },
      { status: 400, headers },
    );
  }

  const records = JSON.parse(recordsJson);

  const results = {
    successCount: 0,
    failedCount: 0,
    errors: [] as string[],
  };

  for (const record of records) {
    const componentsList = record.use_payment_template
      ? undefined
      : Object.entries(record.components || {}).map(([fieldId, amount]) => ({
        payment_field_id: fieldId,
        amount: Number(amount) || 0,
      }));

    const { status, error } = await upsertEmployeeSalaryAssignment({
      supabase: supabase as any,
      assignment: {
        employee_id: record.employee_id,
        monthly_ctc: Number(record.monthly_ctc),
        basic_percent: Number(record.basic_percent),
        is_pro_rata: record.is_pro_rata,
        use_payment_template: record.use_payment_template,
        template_id: record.template_id || null,
        effective_date: record.effective_date,
      },
      components: componentsList,
    });

    if (isGoodStatus(status) && !error) {
      results.successCount++;
      clearExactCacheEntry(
        `${cacheKeyPrefix.employee_salary}${record.employee_id}`,
      );
    } else {
      results.failedCount++;
      results.errors.push(error?.message || "Failed to save assignment");
    }
  }

  clearCacheEntry(cacheKeyPrefix.payroll_components);

  if (results.failedCount === 0) {
    return json({
      status: "success",
      message: `Successfully saved ${results.successCount} salary assignments.`,
    });
  }

  return json({
    status: results.successCount > 0 ? "partial" : "error",
    message: `Processed ${results.successCount} successfully. Failed ${results.failedCount} with error: ${results.errors.join(", ")}`,
  });
}

const formatFieldName = (name: string) => {
  return name
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bDa\b/gi, "DA")
    .replace(/\bHra\b/gi, "HRA")
    .replace(/\bCtc\b/gi, "CTC")
    .replace(/\bEpf\b/gi, "EPF")
    .replace(/\bEsic\b/gi, "ESIC");
};

const formatAmount = (val: number | string | undefined | null) => {
  if (val === undefined || val === null || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return "";
  return String(formatNumber(num));
};

type DiffCellProps = {
  oldVal: string | number | undefined | null;
  newVal: string | number;
  isChanged: boolean;
  isFocused: boolean;
  onFocus: () => void;
  isPercentage?: boolean;
  disabled?: boolean;
  inputElement: React.ReactNode;
};

const DiffCell = ({
  oldVal,
  newVal,
  isChanged,
  isFocused,
  onFocus,
  isPercentage = false,
  disabled = false,
  inputElement,
}: DiffCellProps) => {
  if (!isChanged) {
    return (
      <div className="w-full h-full min-h-[40px] flex items-center">
        {inputElement}
      </div>
    );
  }

  if (isFocused && !disabled) {
    return (
      <div className="w-full h-full min-h-[40px] flex items-center">
        {inputElement}
      </div>
    );
  }

  // Calculate difference
  let diffText = "";
  let isPositive = true;
  let hasDiff = false;

  const oldNum = Number(oldVal) || 0;
  const newNum = Number(newVal) || 0;
  const diff = newNum - oldNum;
  if (diff !== 0) {
    hasDiff = true;
    isPositive = diff > 0;
    const formattedDiff =
      diff % 1 === 0 ? Math.abs(diff).toString() : Math.abs(diff).toFixed(2);
    diffText = diff > 0 ? `+${formattedDiff}` : `-${formattedDiff}`;
  }

  const oldValClean =
    oldVal !== undefined && oldVal !== null && oldVal !== "" ? oldVal : "0";
  const oldDisplay = isPercentage ? `${oldValClean}%` : String(oldValClean);
  const newDisplay = isPercentage ? `${newVal}%` : String(newVal);

  return (
    <div
      onClick={() => {
        if (!disabled) {
          onFocus();
        }
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onFocus();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`w-full h-full min-h-[40px] flex items-center px-3 text-sm select-none transition-colors focus:outline-none focus:bg-muted/10 ${disabled
          ? "cursor-not-allowed opacity-90"
          : "cursor-pointer hover:bg-muted/10"
        }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground/60 line-through decoration-destructive/50">
          {oldDisplay}
        </span>
        <span className="text-muted-foreground/40">→</span>
        <span className="text-foreground font-medium">{newDisplay}</span>
        {hasDiff && (
          <span
            className={`text-xs font-semibold ${isPositive ? "text-emerald-500" : "text-destructive"
              }`}
          >
            {diffText}
          </span>
        )}
      </div>
    </div>
  );
};

export default function BulkSalaryEntry() {
  const {
    siteOptions,
    departmentOptions,
    templates,
    paymentFields,
    employeeData,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const selectedSite = searchParams.get("site") || "";
  const selectedDepartment = searchParams.get("department") || "";

  const sortedPaymentFields = useMemo(() => {
    return [...paymentFields].sort(
      (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0),
    );
  }, [paymentFields]);

  const templateOptions = useMemo(() => {
    return templates.map((t) => ({
      label: t.name,
      value: t.id,
    }));
  }, [templates]);

  const [localSalaries, setLocalSalaries] = useState<
    Record<
      string,
      {
        monthly_ctc: string;
        basic_percent: string;
        is_pro_rata: boolean;
        use_payment_template: boolean;
        template_id: string;
        effective_date: string;
        components: Record<string, string>;
      }
    >
  >({});

  const [dirtyEmployeeIds, setDirtyEmployeeIds] = useState<Set<string>>(
    new Set(),
  );

  const filteredEmployees = useMemo(() => {
    if (!employeeData) return [];
    let emps = employeeData;
    if (selectedDepartment) {
      if (selectedDepartment === "other") {
        emps = emps.filter((e) => {
          const wd = Array.isArray(e.work_details)
            ? e.work_details[0]
            : e.work_details;
          return !wd?.department_id;
        });
      } else {
        emps = emps.filter((e) => {
          const wd = Array.isArray(e.work_details)
            ? e.work_details[0]
            : e.work_details;
          return wd?.department_id === selectedDepartment;
        });
      }
    }
    return emps.sort((a, b) => a.first_name.localeCompare(b.first_name));
  }, [employeeData, selectedDepartment]);

  const [hideEmptyFields, setHideEmptyFields] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{
    empId: string;
    fieldId: string;
  } | null>(null);
  const [explicitlyIncludedFieldIds, setExplicitlyIncludedFieldIds] = useState<
    Set<string>
  >(new Set());

  const displayedPaymentFields = useMemo(() => {
    if (!hideEmptyFields) {
      return sortedPaymentFields;
    }
    return sortedPaymentFields.filter((field) => {
      const hasValue = filteredEmployees.some((emp) => {
        const val = localSalaries[emp.id]?.components?.[field.id];
        return (
          val !== undefined && val !== null && val !== "" && Number(val) !== 0
        );
      });
      return hasValue || explicitlyIncludedFieldIds.has(field.id);
    });
  }, [
    sortedPaymentFields,
    filteredEmployees,
    localSalaries,
    hideEmptyFields,
    explicitlyIncludedFieldIds,
  ]);

  const hiddenFields = useMemo(() => {
    return sortedPaymentFields.filter(
      (field) => !displayedPaymentFields.some((df) => df.id === field.id),
    );
  }, [sortedPaymentFields, displayedPaymentFields]);

  const handleAddExplicitField = (fieldId: string) => {
    setExplicitlyIncludedFieldIds((prev) => {
      const next = new Set(prev);
      next.add(fieldId);
      return next;
    });
  };

  useEffect(() => {
    if (employeeData) {
      const mapping: Record<string, any> = {};
      const todayStr = new Date().toISOString().split("T")[0];
      for (const emp of employeeData) {
        const assignments = emp.employee_salary_assignment || [];
        const activeAssignment = assignments[0];

        const empComponents: Record<string, string> = {};
        for (const f of sortedPaymentFields) {
          empComponents[f.id] = "";
        }

        if (activeAssignment) {
          for (const c of activeAssignment.employee_salary_components || []) {
            empComponents[c.payment_field_id] = formatAmount(c.amount || 0);
          }

          if (
            activeAssignment.use_payment_template &&
            activeAssignment.template_id
          ) {
            const template = templates.find(
              (t) => t.id === activeAssignment.template_id,
            );
            if (template) {
              const latestVersion =
                template.payment_template_versions?.find(
                  (v: any) =>
                    !v.effective_date ||
                    new Date(v.effective_date) <= new Date(),
                ) || template.payment_template_versions?.[0];
              if (latestVersion) {
                for (const c of latestVersion.payment_template_components ||
                  []) {
                  empComponents[c.payment_field_id] = formatAmount(
                    c.amount || 0,
                  );
                }
              }
            }
          }

          mapping[emp.id] = {
            monthly_ctc: formatAmount(activeAssignment.monthly_ctc || ""),
            basic_percent:
              activeAssignment.basic_percent != null
                ? String(activeAssignment.basic_percent)
                : "50",
            is_pro_rata: activeAssignment.is_pro_rata ?? true,
            use_payment_template:
              activeAssignment.use_payment_template ?? false,
            template_id: activeAssignment.template_id || "",
            effective_date: activeAssignment.effective_date || todayStr,
            components: empComponents,
          };
        } else {
          mapping[emp.id] = {
            monthly_ctc: "",
            basic_percent: "50",
            is_pro_rata: true,
            use_payment_template: false,
            template_id: "",
            effective_date: todayStr,
            components: empComponents,
          };
        }
      }
      setLocalSalaries(mapping);
      setDirtyEmployeeIds(new Set());
    }
  }, [employeeData, sortedPaymentFields, templates]);

  useEffect(() => {
    if (actionData) {
      if (actionData.status === "success") {
        toast({
          title: "Success",
          description: actionData.message,
          variant: "success",
        });
        navigate("/payment-components/salaries");
      } else if (actionData.status === "partial") {
        toast({
          title: "Partial Success",
          description: actionData.message,
          variant: "warning",
        });
        navigate("/payment-components/salaries");
      } else {
        toast({
          title: "Error",
          description: actionData.message || "Failed to save salaries",
          variant: "destructive",
        });
      }
    }
  }, [actionData]);

  const handleSalaryChange = (empId: string, field: string, value: any) => {
    setDirtyEmployeeIds((prev) => {
      const next = new Set(prev);
      next.add(empId);
      return next;
    });
    setLocalSalaries((prev) => {
      const empData = prev[empId] || {
        monthly_ctc: "",
        basic_percent: "50",
        is_pro_rata: true,
        use_payment_template: false,
        template_id: "",
        effective_date: new Date().toISOString().split("T")[0],
        components: {},
      };
      return {
        ...prev,
        [empId]: {
          ...empData,
          [field]: value,
        },
      };
    });
  };

  const handleTemplateChange = (empId: string, templateId: string) => {
    setDirtyEmployeeIds((prev) => {
      const next = new Set(prev);
      next.add(empId);
      return next;
    });
    if (!templateId) {
      setLocalSalaries((prev) => {
        const empData = prev[empId] || {};
        return {
          ...prev,
          [empId]: {
            ...empData,
            use_payment_template: false,
            template_id: "",
          },
        };
      });
      return;
    }

    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const latestVersion = template.payment_template_versions?.[0];
    if (!latestVersion) return;

    const monthlyCtc = latestVersion.monthly_ctc ?? "";
    const basicPercent = latestVersion.basic_percent ?? "50";
    const isProRata = latestVersion.is_pro_rata ?? true;
    const effectiveDate =
      latestVersion.effective_date ?? new Date().toISOString().split("T")[0];

    const templateComponents: Record<string, string> = {};
    for (const f of sortedPaymentFields) {
      templateComponents[f.id] = "";
    }
    for (const c of latestVersion.payment_template_components || []) {
      templateComponents[c.payment_field_id] = formatAmount(c.amount || 0);
    }

    setLocalSalaries((prev) => {
      const empData = prev[empId] || {};
      return {
        ...prev,
        [empId]: {
          ...empData,
          monthly_ctc: formatAmount(monthlyCtc),
          basic_percent: formatAmount(basicPercent),
          is_pro_rata: isProRata,
          use_payment_template: false,
          template_id: templateId,
          effective_date: effectiveDate,
          components: templateComponents,
        },
      };
    });
  };

  const handleComponentChange = (
    empId: string,
    fieldId: string,
    value: string,
  ) => {
    setDirtyEmployeeIds((prev) => {
      const next = new Set(prev);
      next.add(empId);
      return next;
    });
    setLocalSalaries((prev) => {
      const empData = prev[empId] || {
        monthly_ctc: "",
        basic_percent: "50",
        is_pro_rata: true,
        use_payment_template: false,
        template_id: "",
        effective_date: new Date().toISOString().split("T")[0],
        components: {},
      };
      const comps = empData.components || {};
      return {
        ...prev,
        [empId]: {
          ...empData,
          components: {
            ...comps,
            [fieldId]: value,
          },
        },
      };
    });
  };

  const recordsToSubmit = useMemo(() => {
    return Object.entries(localSalaries)
      .filter(
        ([empId, data]) =>
          dirtyEmployeeIds.has(empId) &&
          data.monthly_ctc !== "" &&
          !isNaN(Number(data.monthly_ctc)),
      )
      .map(([empId, data]) => {
        const comps: Record<string, number> = {};
        for (const [fieldId, amountStr] of Object.entries(
          data.components || {},
        )) {
          if (amountStr !== "" && !isNaN(Number(amountStr))) {
            comps[fieldId] = Number(amountStr);
          }
        }
        return {
          employee_id: empId,
          monthly_ctc: Number(data.monthly_ctc),
          basic_percent: Number(data.basic_percent),
          is_pro_rata: data.is_pro_rata,
          use_payment_template: data.use_payment_template,
          template_id: data.template_id,
          effective_date: data.effective_date,
          components: comps,
        };
      });
  }, [localSalaries, dirtyEmployeeIds]);

  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    let el = containerRef.current?.parentElement;
    const elementsToModify: HTMLElement[] = [];

    while (el) {
      if (
        el.classList.contains("overflow-auto") ||
        el.style.overflow === "auto" ||
        el.style.overflowY === "auto" ||
        el.tagName === "BODY" ||
        el.tagName === "HTML"
      ) {
        elementsToModify.push(el);
      }
      el = el.parentElement;
    }

    const originalOverflows = elementsToModify.map((element) => ({
      element,
      overflow: element.style.overflow,
    }));

    for (const item of originalOverflows) {
      item.element.style.overflow = "hidden";
    }

    return () => {
      for (const item of originalOverflows) {
        item.element.style.overflow = item.overflow;
      }
    };
  }, []);

  const SUBMIT_BUTTON_CLASS =
    "bg-[#3B82F6] text-slate-950 hover:bg-[#2563EB] font-bold rounded-lg px-6 py-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm";

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className="flex flex-col h-[calc(100vh-145px)] overflow-hidden bg-background text-foreground"
      >
        <header className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-b bg-card backdrop-blur-xl sticky top-0 z-30 gap-4 border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <Icon name="arrow-left" />
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Change Salary
              </h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                Payment Components / Salaries
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1.5 w-48">
              <Combobox
                options={siteOptions || []}
                value={selectedSite}
                onChange={(val) =>
                  setSearchParams((p) => {
                    if (val) p.set("site", val);
                    else p.delete("site");
                    p.delete("department");
                    return p;
                  })
                }
                placeholder="Select Site"
              />
            </div>

            <div className="flex flex-col gap-1.5 w-48">
              <Combobox
                options={departmentOptions || []}
                value={selectedDepartment}
                onChange={(val) =>
                  setSearchParams((p) => {
                    if (val) p.set("department", val);
                    else p.delete("department");
                    return p;
                  })
                }
                placeholder="Select Department"
                disabled={!selectedSite}
              />
            </div>

            {selectedSite && (
              <div className="flex items-center gap-2 bg-card border border-white/10 px-3 py-2 rounded-lg h-10 hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="hide-empty-fields"
                  checked={hideEmptyFields}
                  onCheckedChange={(checked) => {
                    const val = !!checked;
                    setHideEmptyFields(val);
                    if (!val) {
                      setExplicitlyIncludedFieldIds(new Set());
                    }
                  }}
                />
                <label
                  htmlFor="hide-empty-fields"
                  className="text-xs font-semibold cursor-pointer select-none text-muted-foreground"
                >
                  Hide empty columns
                </label>
              </div>
            )}

            {selectedSite && hideEmptyFields && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 border-white/10 hover:bg-muted/50 flex items-center justify-center"
                  >
                    <Icon name="plus" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md bg-card border-white/10 text-foreground">
                  <DialogHeader>
                    <DialogTitle>Include Payment Fields</DialogTitle>
                  </DialogHeader>
                  <div className="py-2 space-y-4 max-h-[300px] overflow-y-auto pr-2">
                    {hiddenFields.length > 0 ? (
                      <div className="space-y-2">
                        {hiddenFields.map((field) => (
                          <div
                            key={field.id}
                            className="flex items-center justify-between p-2 rounded-lg border border-white/5 bg-muted/20 hover:bg-muted/30 transition-colors"
                          >
                            <span className="text-sm font-medium">
                              {formatFieldName(field.name)}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => handleAddExplicitField(field.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        All payment fields are already visible.
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="secondary"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Form method="post">
              <input
                type="hidden"
                name="recordsJson"
                value={JSON.stringify(recordsToSubmit)}
              />
              <button
                type="submit"
                className={SUBMIT_BUTTON_CLASS}
                disabled={recordsToSubmit.length === 0}
              >
                Submit
              </button>
            </Form>
          </div>
        </header>

        <main className="flex-1 flex flex-col bg-muted/30 p-4 min-h-0 overflow-hidden">
          {filteredEmployees.length > 0 ? (
            <div className="flex-1 flex flex-col min-h-0 border rounded-xl bg-card shadow-sm overflow-hidden border-white/10">
              <div className="flex-1 overflow-auto w-full">
                <table
                  className="w-full text-sm text-left border-separate border-spacing-0"
                  style={{ borderSpacing: 0 }}
                >
                  <thead className="text-xs uppercase bg-card text-muted-foreground sticky top-0 z-30 shadow-sm border-white/10">
                    <tr>
                      <th
                        style={{ backgroundColor: "hsl(var(--card))" }}
                        className="px-3 py-3 border-r border-white/10 font-bold sticky left-0 z-20 w-[50px] min-w-[50px] max-w-[50px] text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]"
                      >
                        s SL
                      </th>
                      <th
                        style={{ backgroundColor: "hsl(var(--card))" }}
                        className="px-3 py-3 border-r border-white/10 font-bold sticky left-[50px] z-20 w-[200px] min-w-[200px] max-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]"
                      >
                        Name
                      </th>
                      <th
                        style={{ backgroundColor: "hsl(var(--card))" }}
                        className="px-3 py-3 border-r border-white/10 font-bold sticky left-[250px] z-20 w-[140px] min-w-[140px] max-w-[140px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]"
                      >
                        Employee Code
                      </th>
                      <th className="px-3 py-3 border-r border-white/10 font-bold w-[140px] min-w-[140px] max-w-[140px]">
                        Monthly CTC
                      </th>
                      <th className="px-3 py-3 border-r border-white/10 font-bold w-[90px] min-w-[90px] max-w-[90px]">
                        Basic %
                      </th>
                      <th className="px-3 py-3 border-r border-white/10 font-bold w-[110px] min-w-[110px] max-w-[110px]">
                        Pro-rata
                      </th>
                      <th className="px-3 py-3 border-r border-white/10 font-bold w-[180px] min-w-[180px] max-w-[180px]">
                        Salary Template
                      </th>
                      {displayedPaymentFields.map((field) => (
                        <th
                          key={field.id}
                          className="px-3 py-3 border-r border-white/10 font-bold w-[130px] min-w-[130px] max-w-[130px]"
                        >
                          {formatFieldName(field.name)}
                        </th>
                      ))}
                      <th className="px-3 py-3 font-bold w-[150px] min-w-[150px] max-w-[150px]">
                        Effective From
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp, idx) => {
                      const ctcValue = localSalaries[emp.id]?.monthly_ctc || "";
                      const basicValue =
                        localSalaries[emp.id]?.basic_percent ?? "50";
                      const proRataValue =
                        localSalaries[emp.id]?.is_pro_rata ?? true;
                      const selectedTempId =
                        localSalaries[emp.id]?.template_id || "";
                      const effDate =
                        localSalaries[emp.id]?.effective_date || "";
                      const useTemplate =
                        localSalaries[emp.id]?.use_payment_template ?? false;

                      const activeAssignment =
                        emp.employee_salary_assignment?.[0];
                      const oldCtc = activeAssignment?.monthly_ctc;
                      const oldBasic = activeAssignment?.basic_percent;
                      const oldProRata = activeAssignment?.is_pro_rata;
                      const oldTemplateId = activeAssignment?.template_id;
                      const oldUseTemplate =
                        activeAssignment?.use_payment_template;
                      const oldEffDate = activeAssignment?.effective_date || "";

                      const oldTemplate = templates.find(
                        (t) => t.id === oldTemplateId,
                      );
                      const oldTemplateName =
                        oldUseTemplate && oldTemplate
                          ? oldTemplate.name
                          : "Custom";
                      const hasTemplateChanged =
                        oldUseTemplate !== useTemplate ||
                        (useTemplate && oldTemplateId !== selectedTempId);

                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td
                            style={{ backgroundColor: "hsl(var(--card))" }}
                            className="px-3 py-2 border-r border-b border-white/10 text-center text-muted-foreground sticky left-0 z-10 w-[50px] min-w-[50px] max-w-[50px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] outline outline-1 outline-card"
                          >
                            {idx + 1}
                          </td>
                          <td
                            style={{ backgroundColor: "hsl(var(--card))" }}
                            className="px-3 py-2 border-r border-b border-white/10 font-semibold sticky left-[50px] z-10 w-[200px] min-w-[200px] max-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] truncate outline outline-1 outline-card"
                          >
                            {[emp.first_name, emp.middle_name, emp.last_name]
                              .filter(Boolean)
                              .join(" ")}
                          </td>
                          <td
                            style={{ backgroundColor: "hsl(var(--card))" }}
                            className="px-3 py-2 border-r border-b border-white/10 text-xs tracking-wider uppercase text-muted-foreground sticky left-[250px] z-10 w-[140px] min-w-[140px] max-w-[140px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] truncate outline outline-1 outline-card"
                          >
                            {emp.employee_code}
                          </td>
                          <td className="p-0 border-r border-b border-white/10 w-[140px] min-w-[140px] max-w-[140px]">
                            {(() => {
                              const isCtcChanged =
                                activeAssignment &&
                                String(oldCtc || "") !== String(ctcValue);
                              const isCtcFocused =
                                focusedCell?.empId === emp.id &&
                                focusedCell?.fieldId === "monthly_ctc";
                              return (
                                <DiffCell
                                  oldVal={oldCtc}
                                  newVal={ctcValue}
                                  isChanged={!!isCtcChanged}
                                  isFocused={isCtcFocused}
                                  onFocus={() =>
                                    setFocusedCell({
                                      empId: emp.id,
                                      fieldId: "monthly_ctc",
                                    })
                                  }
                                  inputElement={
                                    <input
                                      type="number"
                                      step="any"
                                      value={ctcValue}
                                      autoFocus={isCtcFocused}
                                      onBlur={() => setFocusedCell(null)}
                                      onChange={(e) =>
                                        handleSalaryChange(
                                          emp.id,
                                          "monthly_ctc",
                                          e.target.value,
                                        )
                                      }
                                      className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-3 text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
                                      placeholder="Enter CTC"
                                    />
                                  }
                                />
                              );
                            })()}
                          </td>
                          <td className="p-0 border-r border-b border-white/10 w-[90px] min-w-[90px] max-w-[90px]">
                            {(() => {
                              const isBasicChanged =
                                activeAssignment &&
                                String(oldBasic ?? "") !== String(basicValue);
                              const isBasicFocused =
                                focusedCell?.empId === emp.id &&
                                focusedCell?.fieldId === "basic_percent";
                              return (
                                <DiffCell
                                  oldVal={oldBasic}
                                  newVal={basicValue}
                                  isChanged={!!isBasicChanged}
                                  isFocused={isBasicFocused}
                                  onFocus={() =>
                                    setFocusedCell({
                                      empId: emp.id,
                                      fieldId: "basic_percent",
                                    })
                                  }
                                  isPercentage={true}
                                  inputElement={
                                    <input
                                      type="number"
                                      value={basicValue}
                                      autoFocus={isBasicFocused}
                                      onBlur={() => setFocusedCell(null)}
                                      onChange={(e) =>
                                        handleSalaryChange(
                                          emp.id,
                                          "basic_percent",
                                          e.target.value,
                                        )
                                      }
                                      className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-3 text-sm transition-all text-foreground"
                                      placeholder="50"
                                      max={100}
                                      min={0}
                                    />
                                  }
                                />
                              );
                            })()}
                          </td>
                          <td className="p-0 border-r border-b border-white/10 w-[110px] min-w-[110px] max-w-[110px]">
                            <div className="flex items-center min-h-[40px]">
                              {activeAssignment &&
                                (oldProRata ?? true) !== proRataValue ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <select
                                      value={proRataValue ? "true" : "false"}
                                      onChange={(e) =>
                                        handleSalaryChange(
                                          emp.id,
                                          "is_pro_rata",
                                          e.target.value === "true",
                                        )
                                      }
                                      className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-2 text-sm transition-all cursor-pointer text-emerald-600 font-semibold dark:text-emerald-400 bg-emerald-500/5"
                                    >
                                      <option value="true" className="bg-card">
                                        Yes
                                      </option>
                                      <option value="false" className="bg-card">
                                        No
                                      </option>
                                    </select>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-card text-foreground border border-white/10 p-2 shadow-lg rounded-md z-50">
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-semibold">
                                        Pro-rata Changed
                                      </p>
                                      <div className="flex items-center gap-2 font-mono text-xs">
                                        <span className="text-destructive line-through bg-destructive/10 px-1.5 py-0.5 rounded">
                                          {oldProRata ? "Yes" : "No"}
                                        </span>
                                        <span className="text-muted-foreground">
                                          →
                                        </span>
                                        <span className="text-emerald-500 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                          {proRataValue ? "Yes" : "No"}
                                        </span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <select
                                  value={proRataValue ? "true" : "false"}
                                  onChange={(e) =>
                                    handleSalaryChange(
                                      emp.id,
                                      "is_pro_rata",
                                      e.target.value === "true",
                                    )
                                  }
                                  className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-2 text-sm transition-all cursor-pointer text-foreground"
                                >
                                  <option value="true" className="bg-card">
                                    Yes
                                  </option>
                                  <option value="false" className="bg-card">
                                    No
                                  </option>
                                </select>
                              )}
                            </div>
                          </td>
                          <td className="p-0 border-r border-b border-white/10 w-[180px] min-w-[180px] max-w-[180px]">
                            <div className="flex items-center min-h-[40px]">
                              {activeAssignment && hasTemplateChanged ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <select
                                      value={selectedTempId}
                                      onChange={(e) =>
                                        handleTemplateChange(
                                          emp.id,
                                          e.target.value,
                                        )
                                      }
                                      className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-2 text-sm transition-all cursor-pointer text-emerald-600 font-semibold dark:text-emerald-400 bg-emerald-500/5"
                                    >
                                      <option value="" className="bg-card">
                                        Custom
                                      </option>
                                      {templateOptions.map((t: any) => (
                                        <option
                                          key={t.value}
                                          value={t.value}
                                          className="bg-card"
                                        >
                                          {t.label}
                                        </option>
                                      ))}
                                    </select>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-card text-foreground border border-white/10 p-2 shadow-lg rounded-md z-50">
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-semibold">
                                        Template Changed
                                      </p>
                                      <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                                        <span
                                          className="text-destructive line-through bg-destructive/10 px-1.5 py-0.5 rounded truncate max-w-[120px]"
                                          title={oldTemplateName}
                                        >
                                          {oldTemplateName}
                                        </span>
                                        <span className="text-muted-foreground">
                                          →
                                        </span>
                                        <span
                                          className="text-emerald-500 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded truncate max-w-[120px]"
                                          title={
                                            templates.find(
                                              (t) => t.id === selectedTempId,
                                            )?.name || "Custom"
                                          }
                                        >
                                          {templates.find(
                                            (t) => t.id === selectedTempId,
                                          )?.name || "Custom"}
                                        </span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <select
                                  value={selectedTempId}
                                  onChange={(e) =>
                                    handleTemplateChange(emp.id, e.target.value)
                                  }
                                  className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-2 text-sm transition-all cursor-pointer text-foreground"
                                >
                                  <option value="" className="bg-card">
                                    Custom
                                  </option>
                                  {templateOptions.map((t: any) => (
                                    <option
                                      key={t.value}
                                      value={t.value}
                                      className="bg-card"
                                    >
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                          {displayedPaymentFields.map((field) => {
                            const compValue =
                              localSalaries[emp.id]?.components?.[field.id] ||
                              "";
                            const oldComp =
                              activeAssignment?.employee_salary_components?.find(
                                (c: any) => c.payment_field_id === field.id,
                              );
                            const oldCompValue = oldComp
                              ? formatAmount(oldComp.amount || 0)
                              : "0";
                            const isCompChanged =
                              activeAssignment &&
                              String(oldCompValue) !== String(compValue);
                            const isCompFocused =
                              focusedCell?.empId === emp.id &&
                              focusedCell?.fieldId === field.id;

                            return (
                              <td
                                key={field.id}
                                className="p-0 border-r border-b border-white/10 w-[130px] min-w-[130px] max-w-[130px]"
                              >
                                <DiffCell
                                  oldVal={oldCompValue}
                                  newVal={compValue}
                                  isChanged={!!isCompChanged}
                                  isFocused={isCompFocused}
                                  onFocus={() =>
                                    setFocusedCell({
                                      empId: emp.id,
                                      fieldId: field.id,
                                    })
                                  }
                                  disabled={useTemplate}
                                  inputElement={
                                    <input
                                      type="number"
                                      value={compValue}
                                      disabled={useTemplate}
                                      autoFocus={isCompFocused}
                                      onBlur={() => setFocusedCell(null)}
                                      onChange={(e) =>
                                        handleComponentChange(
                                          emp.id,
                                          field.id,
                                          e.target.value,
                                        )
                                      }
                                      className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-3 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed text-foreground"
                                      placeholder="0"
                                    />
                                  }
                                />
                              </td>
                            );
                          })}
                          <td className="p-0 border-b border-white/10 w-[150px] min-w-[150px] max-w-[150px]">
                            <div className="flex items-center min-h-[40px]">
                              {activeAssignment &&
                                String(oldEffDate) !== String(effDate) ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <input
                                      type="date"
                                      value={effDate}
                                      onChange={(e) =>
                                        handleSalaryChange(
                                          emp.id,
                                          "effective_date",
                                          e.target.value,
                                        )
                                      }
                                      className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-3 text-sm transition-all cursor-pointer text-emerald-600 font-semibold dark:text-emerald-400 bg-emerald-500/5"
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-card text-foreground border border-white/10 p-2 shadow-lg rounded-md z-50">
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-semibold">
                                        Effective Date Changed
                                      </p>
                                      <div className="flex items-center gap-2 font-mono text-xs">
                                        <span className="text-destructive line-through bg-destructive/10 px-1.5 py-0.5 rounded">
                                          {oldEffDate || "-"}
                                        </span>
                                        <span className="text-muted-foreground">
                                          →
                                        </span>
                                        <span className="text-emerald-500 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                          {effDate || "-"}
                                        </span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <input
                                  type="date"
                                  value={effDate}
                                  onChange={(e) =>
                                    handleSalaryChange(
                                      emp.id,
                                      "effective_date",
                                      e.target.value,
                                    )
                                  }
                                  className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full h-8 px-3 text-sm transition-all cursor-pointer text-foreground"
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed rounded-xl bg-card text-muted-foreground p-8 border-white/10">
              <Icon name="info" className="h-8 w-8 mb-2" />
              <p className="text-sm font-medium">
                {selectedSite
                  ? "No active employees found for this site."
                  : "Please select a Site from the dropdown to load employees."}
              </p>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
