import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
  useSubmit,
  useActionData,
} from "@remix-run/react";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  getSupabaseWithHeaders,
  getSupabaseEnv,
} from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { BonusSearchFilter } from "@/components/statutory/bonus-search-filter";
import { StatutoryActionMenu } from "@/components/statutory/statutory-action-menu";
import { BonusExportBar } from "@/components/statutory/bonus-export-bar";
import { Tabs, TabsList, TabsTrigger } from "@canny_ecosystem/ui/tabs";
import { payoutMonths } from "@canny_ecosystem/utils/constant";

import {
  getEmployeeYearlyBonusDetails,
  getEmployeesByCompanyId,
  getApprovedPayrollsByCompanyId,
  getStatutoryBonusByCompanyId,
  getCompanyConfigByCompanyId,
  getProjectsByCompanyId,
  getSitesByCompanyId,
  getRelationshipsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { upsertEmployeeYearlyBonusDetails } from "@canny_ecosystem/supabase/mutations";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import * as XLSX from "xlsx";
import saveAs from "file-saver";
import Papa from "papaparse";
import {
  formatDateTime,
  roundToNearest,
  formatDate,
} from "@canny_ecosystem/utils";
import { CANNY_MANAGEMENT_SERVICES_ACCOUNT_NUMBER } from "@/constant";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { getEmployeeBankDetailsById } from "@canny_ecosystem/supabase/queries";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { toast } from "@canny_ecosystem/ui/use-toast";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers: responseHeaders } = getSupabaseWithHeaders({
    request,
  });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const url = new URL(request.url);

  const now = new Date();
  const nowMonth = now.getMonth() + 1;
  const nowYear = now.getFullYear();
  const { data: companyConfig } = await getCompanyConfigByCompanyId({
    supabase,
    companyId,
  });

  const configStartMonth = companyConfig?.company_bonus_start_month ?? 4;
  const configEndMonth = companyConfig?.company_bonus_end_month ?? 3;

  const actualDefaultFY =
    configStartMonth === 1
      ? `${nowYear}`
      : nowMonth < configStartMonth
        ? `${nowYear - 1}-${nowYear}`
        : `${nowYear}-${nowYear + 1}`;

  const fyParam = url.searchParams.get("fy");
  const selectedFY = fyParam || actualDefaultFY;
  const fromParam = url.searchParams.get("from") || String(configStartMonth);
  const toParam = url.searchParams.get("to") || String(configEndMonth);
  const selectedFrom = Number.parseInt(fromParam);
  const selectedTo = Number.parseInt(toParam);

  const [startYearStr] = selectedFY.split("-");
  const startYear = parseInt(startYearStr);

  const { data: yd } = await getEmployeeYearlyBonusDetails({
    supabase,
    companyId,
    startYear,
    fromMonth: selectedFrom,
    toMonth: selectedTo,
  });

  // Filter out records that were already paid in payroll
  let filteredYd = yd || [];
  if (filteredYd.length > 0) {
    const payrollIds = [...new Set(filteredYd.map((item) => item.payroll_id))];
    const { data: salaryEntriesWithBonus } = await supabase
      .from("salary_field_values")
      .select(`
        amount,
        salary_entries!inner(payroll_id, monthly_attendance!inner(employee_id)),
        payroll_fields!inner(name)
      `)
      .in("salary_entries.payroll_id", payrollIds)
      .ilike("payroll_fields.name", "bonus")
      .gt("amount", 0);

    if (salaryEntriesWithBonus) {
      const paidInPayroll = new Set(
        salaryEntriesWithBonus.map(
          (s) =>
            `${s.salary_entries.monthly_attendance.employee_id}_${s.salary_entries.payroll_id}`,
        ),
      );
      filteredYd = filteredYd.filter(
        (item) => !paidInPayroll.has(`${item.employee_id}_${item.payroll_id}`),
      );
    }
  }

  const { data: employees } = await getEmployeesByCompanyId({
    supabase,
    companyId,
    params: { from: 0, to: 1000, filters: { status: "active" } },
  });

  const { data: approvedPayrolls } = await getApprovedPayrollsByCompanyId({
    supabase,
    companyId,
    params: { from: 0, to: 100 },
  });

  const { data: bonusSettings } = await getStatutoryBonusByCompanyId({
    supabase,
    companyId,
  });

  const { data: projectsData } = await getProjectsByCompanyId({
    supabase,
    companyId,
  });

  const { data: sitesData } = await getSitesByCompanyId({
    supabase,
    companyId,
  });

  const { data: companyRelations } = await getRelationshipsByCompanyId({
    supabase,
    companyId,
  });

  const projectOptions =
    projectsData && projectsData.length > 0
      ? projectsData.map((p) => ({ label: p.name, value: p.id }))
      : (companyRelations || []).map((r: any) => ({
        label: r.company?.name || r.id,
        value: r.id,
      }));

  const siteOptions = (sitesData || []).map((s: any) => ({
    label: s.name,
    value: s.id,
  }));

  return json(
    {
      env: getSupabaseEnv(),
      companyId,
      yearlyData: filteredYd,
      selectedFY,
      selectedFrom,
      selectedTo,
      approvedPayrolls: approvedPayrolls || [],
      bonusSettings: bonusSettings?.[0] || null,
      configStartMonth,
      configEndMonth,
      projectOptions,
      siteOptions,
    },
    { headers: responseHeaders },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-yearly-bonus") {
    const data = JSON.parse(formData.get("data") as string);
    const { status, error } = await upsertEmployeeYearlyBonusDetails({
      supabase,
      data: Array.isArray(data) ? data : [data],
    });
    if (error) {
      return json({ status: "error", error: error.message }, { status: 400 });
    }
    return json({ status: "success" });
  }

  if (intent === "get-eligible-employees") {
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const payrollIdsStr = formData.get("payrollIds") as string;
    const payrollIds = JSON.parse(payrollIdsStr || "[]") as string[];

    if (payrollIds.length === 0) return json({ employees: [] });

    // Helper to safely extract field name from payroll_fields relation (handles both object and array)
    const getFieldName = (f: any) => {
      const pf = f?.payroll_fields;
      if (!pf) return "";
      if (Array.isArray(pf)) return pf[0]?.name || "";
      return pf.name || "";
    };

    // Fetch company statutory bonus setting to get default bonus percentage
    const { data: companyBonus } = await getStatutoryBonusByCompanyId({
      supabase,
      companyId,
    });
    const defaultBonusPercentage = companyBonus?.[0]?.percentage || 8.33;

    // 1. Get all employees & salary entries in these payrolls along with field values
    const { data: allEntries, error: entriesError } = await supabase
      .from("salary_entries")
      .select(`
        id,
        payroll_id,
        payroll:payroll_id(id, month, year, title),
        monthly_attendance!inner(
          employee_id,
          employees!inner(
            first_name, 
            middle_name,
            last_name, 
            employee_code
          )
        ),
        salary_field_values(
          id,
          amount,
          payroll_fields(
            id,
            name,
            type
          )
        )
      `)
      .in("payroll_id", payrollIds);

    if (entriesError) {
      console.error("Fetch salary entries error", entriesError);
      return json({ error: "Failed to fetch entries" }, { status: 500 });
    }

    if (!allEntries || allEntries.length === 0) return json({ employees: [] });

    // 2. Get existing yearly records to avoid duplicates
    const { data: existingYearly } = await supabase
      .from("employee_yearly_bonus_details")
      .select("employee_id, payroll_id")
      .in("payroll_id", payrollIds);

    const existingYearlyMap = new Set(
      existingYearly?.map((r) => `${r.employee_id}-${r.payroll_id}`) || [],
    );

    const eligible = (allEntries as any[])
      .filter((entry) => {
        const empId = entry.monthly_attendance?.employee_id;
        if (!empId) return false;

        const key = `${empId}-${entry.payroll_id}`;
        if (existingYearlyMap.has(key)) return false;

        const fields = entry.salary_field_values || [];

        // Check if ANY bonus (bonus / monthly bonus / statutory bonus) was ALREADY paid in this payroll run with amount > 0
        const hasPaidBonusInPayroll = fields.some((f: any) => {
          const name = getFieldName(f).trim().toLowerCase();
          const amt = Number(f.amount || 0);
          return name.includes("bonus") && amt > 0;
        });

        if (hasPaidBonusInPayroll) {
          return false;
        }

        return true;
      })
      .map((entry) => {
        const emp = entry.monthly_attendance.employees;
        const payroll = (entry as any).payroll;
        const fields = entry.salary_field_values || [];

        const basicField =
          fields.find((f: any) => getFieldName(f).trim().toLowerCase().includes("basic")) ||
          fields.find((f: any) => getFieldName(f).trim().toLowerCase().includes("pay")) ||
          fields.find((f: any) => Number(f.amount || 0) > 0);

        const monthName = payoutMonths.find(
          (m) => Number(m.value) === Number(payroll?.month),
        )?.label;
        const displayLabel =
          monthName && payroll?.year
            ? `${monthName} ${payroll.year}`
            : payroll?.title || "Unknown";

        const fullName = [emp.first_name, emp.middle_name, emp.last_name]
          .filter(Boolean)
          .join(" ");

        return {
          id: `${entry.monthly_attendance.employee_id}-${entry.payroll_id}`,
          employee_id: entry.monthly_attendance.employee_id,
          payroll_id: entry.payroll_id,
          name: fullName,
          code: emp.employee_code,
          payroll_label: displayLabel,
          basic_salary: Number(basicField?.amount || 0),
          percentage: Number(defaultBonusPercentage || 8.33),
        };
      });

    return json({ employees: eligible });
  }

  return json({ status: "success" });
}

export default function StatutoryBonusIndex() {
  const {
    env,
    companyId,
    selectedFY,
    selectedFrom,
    selectedTo,
    yearlyData,
    approvedPayrolls,
    bonusSettings,
    configStartMonth,
    configEndMonth,
    projectOptions = [],
    siteOptions = [],
  } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });
  const submit = useSubmit();
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (actionData?.status === "success") {
      toast({
        title: "Success",
        description: "Bonus record created successfully",
      });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description: actionData.error || "Failed to create bonus record",
        variant: "destructive",
      });
    }
  }, [actionData]);

  const currentMonthRange = useMemo(() => {
    const cycle = [];
    for (let i = 0; i < 12; i++) {
      cycle.push(((configStartMonth - 1 + i) % 12) + 1);
    }
    const startIndex = cycle.indexOf(selectedFrom);
    const endIndex = cycle.indexOf(selectedTo);

    if (startIndex === -1 || endIndex === -1) return cycle;

    if (startIndex <= endIndex) {
      return cycle.slice(startIndex, endIndex + 1);
    }

    return [selectedFrom];
  }, [selectedFrom, selectedTo, configStartMonth]);

  const status = searchParams.get("status") || "unpaid";

  const currentData = useMemo(() => {
    if (status === "paid") {
      return yearlyData.filter((item: any) => !!item.status);
    }
    return yearlyData.filter((item: any) => !item.status);
  }, [yearlyData, status]);

  const aggregatedData = useMemo(() => {
    if (!currentData) return [];

    const map = new Map<string, any>();
    currentData.forEach((item: any) => {
      const empId = item.employee_id;
      // Use actual status from database
      const isPaid = !!item.status;
      const amt = Number(item.bonus_amount || 0);
      const payrollObj = Array.isArray(item.payroll)
        ? item.payroll[0]
        : item.payroll;
      const month = payrollObj?.month ? Number(payrollObj.month) : null;

      if (!map.has(empId)) {
        map.set(empId, {
          ...item,
          monthData: {},
          totalPaid: 0,
          totalPending: 0,
          recordIds: [],
          employee_salary: Number(item.employee_salary || 0),
        });
      }

      const existing = map.get(empId);
      if (month !== null) {
        if (!existing.monthData[month]) {
          existing.monthData[month] = {
            ids: [item.id],
            amt: 0,
            isPaid: isPaid,
          };
        } else {
          existing.monthData[month].ids.push(item.id);
        }

        existing.monthData[month].amt += amt;

        if (isPaid) {
          existing.totalPaid += amt;
        } else {
          existing.totalPending += amt;
        }
        existing.recordIds.push(item.id);
      }
    });
    return Array.from(map.values());
  }, [currentData]);

  const filteredData = useMemo(() => {
    if (!aggregatedData) return [];

    return aggregatedData.filter((item: any) => {
      const fullName = [
        item.employees?.first_name,
        item.employees?.middle_name,
        item.employees?.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const code = (item.employees?.employee_code || "").toLowerCase();
      const matchesSearch =
        fullName.includes(searchTerm.toLowerCase()) ||
        code.includes(searchTerm.toLowerCase());

      const workDetail = Array.isArray(item.employees?.work_details)
        ? item.employees?.work_details[0]
        : item.employees?.work_details;

      const empProjectId = workDetail?.project_id || workDetail?.projects?.id;
      const empSiteId = workDetail?.site_id || workDetail?.sites?.id;

      const matchesProject =
        selectedProject === "all" ||
        empProjectId === selectedProject ||
        workDetail?.projects?.name?.toLowerCase() ===
        selectedProject.toLowerCase();

      const matchesSite =
        selectedSite === "all" ||
        empSiteId === selectedSite ||
        workDetail?.sites?.name?.toLowerCase() ===
        selectedSite.toLowerCase();

      return matchesSearch && matchesProject && matchesSite;
    });
  }, [aggregatedData, searchTerm, selectedProject, selectedSite]);

  const allRecordIds = useMemo(() => {
    return new Set(filteredData.flatMap((item) => item.recordIds || []));
  }, [filteredData]);

  const fyOptions = useMemo(() => {
    const startYear = new Date().getFullYear() - 2;
    return Array.from({ length: 5 }, (_, i) => {
      const year = startYear + i;
      return configStartMonth === 1 ? `${year}` : `${year}-${year + 1}`;
    });
  }, [configStartMonth]);

  const selectionSummary = useMemo(() => {
    const selectedRows = currentData.filter((item: any) =>
      selectedIds.has(item.id),
    );
    return {
      totalAmount: selectedRows.reduce(
        (sum: number, item: any) => sum + (item.bonus_amount || 0),
        0,
      ),
      totalCount: selectedRows.length,
      invoicableAmount: selectedRows.reduce(
        (sum: number, item: any) => sum + (item.bonus_amount || 0),
        0,
      ),
      invoicableCount: selectedRows.length,
      skippedCount: 0,
    };
  }, [currentData, selectedIds]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(allRecordIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (item: any, checked: boolean) => {
    const next = new Set(selectedIds);
    const ids = item.recordIds || [];
    if (checked) ids.forEach((id: string) => next.add(id));
    else ids.forEach((id: string) => next.delete(id));
    setSelectedIds(next);
  };

  const handleToggleRecord = (ids: string[]) => {
    const next = new Set(selectedIds);
    const allSelected = ids.every((id) => next.has(id));
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelectedIds(next);
  };

  const handleExportCSV = () => {
    const selectedRecords = currentData.filter((item: any) =>
      selectedIds.has(item.id),
    );
    const exportRows = selectedRecords.map((item: any) => {
      const payrollObj = Array.isArray(item.payroll)
        ? item.payroll[0]
        : item.payroll;
      const monthLabel = payoutMonths.find(
        (m) => m.value === Number(payrollObj?.month),
      )?.label;

      return {
        "Employee Name": [
          item.employees?.first_name,
          item.employees?.middle_name,
          item.employees?.last_name,
        ]
          .filter(Boolean)
          .join(" "),
        "Employee Code": item.employees?.employee_code,
        Month: monthLabel || "",
        "Basic Salary": item.employee_salary,
        "Bonus Amount": item.bonus_amount,
        Status: item.status ? "Paid" : "Pending",
      };
    });
    const csv = Papa.unparse(exportRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const period = selectedFY;
    saveAs(blob, `Statutory-Bonus-${period}-${formatDateTime(Date.now())}.csv`);
  };

  const handleCreateInvoice = () => {
    // Find individual records that are selected and filter for 'invoice' type (not salary)
    const selectedData = currentData.filter((item: any) =>
      selectedIds.has(item.id),
    );

    if (!selectedData.length) {
      toast({
        title: "No Invoicable Records",
        description:
          "Monthly bonuses are already paid with salary and cannot be invoiced.",
        variant: "destructive",
      });
      return;
    }

    navigate(`/approvals/statutory/create-invoice`, {
      state: {
        selectedRows: selectedData,
      },
    });
  };

  const handleDownloadBankAdvice = async () => {
    // 1. Identify which aggregated rows have at least one record selected
    const selectedData = filteredData
      .map((item) => {
        const selectedRecordsForThisEmp =
          item.recordIds?.filter((id: string) => selectedIds.has(id)) || [];
        if (selectedRecordsForThisEmp.length === 0) return null;

        // Calculate total amount ONLY for the selected records for this employee
        const totalAmount = currentData
          .filter((d: any) => selectedRecordsForThisEmp.includes(d.id))
          .reduce(
            (sum: number, d: any) => sum + Number(d.bonus_amount || 0),
            0,
          );

        return {
          ...item,
          totalSelectedAmount: totalAmount,
        };
      })
      .filter(Boolean) as any[];

    if (!selectedData.length) return;

    const date = new Date();
    // 2. Fetch bank details for these employees
    const bankDetailsResults = await Promise.all(
      selectedData.map(({ employee_id }) =>
        getEmployeeBankDetailsById({ id: employee_id, supabase }),
      ),
    );

    const dateStr = formatDate(date)
      ?.toString()!
      .replace(/([A-Za-z]{3})/, (match: any) => match.toUpperCase())
      .replaceAll(" ", "-");

    const headers = [
      "Debit A/c Number",
      "Beneficiary A/c Number",
      "Beneficiary Name",
      "Amount",
      "Payment Type (Mandatory for all types of payments)",
      "Payment Date",
      "IFSC Code",
      "Payable Location",
      "Print Location",
      "Beneficiary Mobile No.",
      "Beneficiary email-id",
      "Bene Address 1",
      "Bene Address 2",
      "Bene Address 3",
      "Bene Address 4",
      "Add detail 1",
      "Add detail 2",
      "Add detail 3",
      "Add detail 4",
      "Add detail 5",
      "Remarks",
    ];

    const dataRows = [headers];
    selectedData.forEach((item: any, index) => {
      const bank = bankDetailsResults[index]?.data;
      dataRows.push([
        CANNY_MANAGEMENT_SERVICES_ACCOUNT_NUMBER,
        bank?.account_number || "",
        bank?.account_holder_name || "",
        roundToNearest(Number(item.totalSelectedAmount)).toFixed(2),
        (bank?.ifsc_code || "").toUpperCase().startsWith("ICIC") ? "I" : "N",
        dateStr,
        bank?.ifsc_code || "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Bonus Payment",
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bank Advice");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const fromName = payoutMonths
      .find((m) => m.value === selectedFrom)
      ?.label.slice(0, 3);
    const toName = payoutMonths
      .find((m) => m.value === selectedTo)
      ?.label.slice(0, 3);
    const period = `${selectedFY}_${fromName}-${toName}`;
    saveAs(
      blob,
      `Bank-Advice-Bonus-${period}-${formatDateTime(Date.now())}.xls`,
    );
  };

  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <section className="pt-4 px-4 pb-0 overflow-hidden flex flex-col h-[calc(100dvh-145px)] gap-4">
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-row max-sm:flex-col items-center justify-between gap-4">
          <div className="flex-1 max-sm:w-full">
            <BonusSearchFilter
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              selectedFY={selectedFY}
              onFYChange={(val) => {
                const params = new URLSearchParams(searchParams);
                params.set("fy", val);
                setSearchParams(params);
              }}
              selectedFrom={selectedFrom}
              onFromChange={(val) => {
                const params = new URLSearchParams(searchParams);
                params.set("from", val.toString());
                setSearchParams(params);
              }}
              selectedTo={selectedTo}
              onToChange={(val) => {
                const params = new URLSearchParams(searchParams);
                params.set("to", val.toString());
                setSearchParams(params);
              }}
              fyOptions={fyOptions}
              configStartMonth={configStartMonth}
              selectedProject={selectedProject}
              onProjectChange={setSelectedProject}
              projectOptions={projectOptions}
              selectedSite={selectedSite}
              onSiteChange={setSelectedSite}
              siteOptions={siteOptions}
            />
          </div>
          <StatutoryActionMenu
            selectedCount={selectedIds.size}
            onCreateInvoice={handleCreateInvoice}
            onDownloadBankDetails={handleDownloadBankAdvice}
            payrolls={approvedPayrolls}
            bonusSettings={bonusSettings}
            status={status}
          />
        </div>

        <Tabs
          value={searchParams.get("status") || "unpaid"}
          onValueChange={(val) => {
            const params = new URLSearchParams(searchParams);
            params.set("status", val);
            setSearchParams(params);
          }}
          className="w-fit"
        >
          <TabsList className="bg-muted/50 border border-white/5 h-9 p-1">
            <TabsTrigger
              value="unpaid"
              className="px-4 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground transition-all"
            >
              Unpaid
            </TabsTrigger>
            <TabsTrigger
              value="paid"
              className="px-4 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground transition-all"
            >
              Paid
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        className={cn(
          "border rounded max-h-fit overflow-hidden shadow-sm",
          !filteredData.length && "border-none shadow-none",
        )}
      >
        <div
          ref={parentRef}
          className="relative rounded overflow-auto bg-card"
          style={{
            maxHeight: `calc(100dvh - ${parentRef.current?.getBoundingClientRect().top ?? 250}px)`,
          }}
        >
          <table className="w-max min-w-full text-sm">
            <thead className="sticky z-20 top-0 bg-card border-b border-white/5">
              <tr className="flex h-[45px] hover:bg-transparent">
                <th className="px-4 py-2 w-[50px] sticky left-0 bg-card z-30 border-r flex items-center justify-center">
                  <Checkbox
                    checked={
                      filteredData.length > 0 &&
                      Array.from(allRecordIds).every((id) =>
                        selectedIds.has(id),
                      )
                    }
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                  />
                </th>
                <th className="px-4 py-2 w-[150px] min-w-[150px] max-w-[150px] sticky left-[50px] bg-card z-20 border-r border-white/5 flex items-center text-muted-foreground font-medium">
                  Employee Code
                </th>
                <th className="px-4 py-2 w-[200px] min-w-[200px] max-w-[200px] sticky left-[200px] bg-card z-20 border-r border-white/5 flex items-center text-muted-foreground font-medium">
                  Employee Name
                </th>
                {currentMonthRange.map((m) => (
                  <th
                    key={m}
                    className="px-4 py-2 w-[100px] min-w-[100px] max-w-[100px] flex items-center justify-center text-muted-foreground font-medium text-center"
                  >
                    {payoutMonths
                      .find((pm) => pm.value === m)
                      ?.label.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((item: any) => {
                  const isSelected =
                    item.recordIds?.length > 0 &&
                    item.recordIds.every((id: string) => selectedIds.has(id));
                  const fullName = [
                    item.employees?.first_name,
                    item.employees?.middle_name,
                    item.employees?.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr
                      key={item.employee_id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "flex border-b border-white/5 hover:bg-muted/30 transition-colors group",
                        isSelected ? "bg-muted/20" : "bg-transparent",
                      )}
                    >
                      <td className="px-4 py-3 w-[50px] sticky left-0 bg-card z-10 border-r border-white/5 flex justify-center items-center group-hover:bg-muted/50 transition-colors">
                        <Checkbox
                          checked={
                            item.recordIds?.length > 0 &&
                            item.recordIds.every((id: string) =>
                              selectedIds.has(id),
                            )
                          }
                          onCheckedChange={(checked) =>
                            handleSelectRow(item, !!checked)
                          }
                        />
                      </td>
                      <td className="px-4 py-3 w-[150px] min-w-[150px] max-w-[150px] sticky left-[50px] bg-card z-10 border-r border-white/5 group-hover:bg-muted/50 transition-colors flex items-center overflow-hidden">
                        <Link
                          to={`/employees/${item.employee_id}`}
                          className="text-primary/80 hover:text-primary transition-all font-medium truncate block w-full"
                          title={item.employees?.employee_code}
                        >
                          {item.employees?.employee_code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 w-[200px] min-w-[200px] max-w-[200px] sticky left-[200px] bg-card z-10 border-r border-white/5 group-hover:bg-muted/50 transition-colors flex items-center overflow-hidden">
                        <Link
                          to={`/employees/${item.employee_id}`}
                          className="text-primary/80 hover:text-primary transition-all font-medium truncate block w-full"
                          title={fullName}
                        >
                          {fullName}
                        </Link>
                      </td>
                      {currentMonthRange.map((m) => {
                        const data = item.monthData[m];
                        const isCellSelected = data && selectedIds.has(data.id);
                        return (
                          <td
                            key={m}
                            onClick={() =>
                              data &&
                              !data.isPaid &&
                              handleToggleRecord(data.ids)
                            }
                            className={cn(
                              "px-4 py-3 min-w-[100px] text-center tabular-nums transition-colors cursor-default flex items-center justify-center",
                              data &&
                                data.ids.every((id: string) =>
                                  selectedIds.has(id),
                                )
                                ? "bg-primary/10"
                                : "",
                            )}
                          >
                            {data ? (
                              <span className="tabular-nums">
                                ₹{data.amt}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr className="flex">
                  <td
                    colSpan={currentMonthRange.length + 3}
                    className="h-80 bg-background flex flex-col items-center justify-center text-center w-full"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <h2 className="text-xl font-semibold">
                        No Bonus Records Found.
                      </h2>
                      <p className="text-muted-foreground text-sm font-normal">
                        Try adjusting your search or the selected financial
                        year.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BonusExportBar
        selectedCount={selectionSummary.totalCount}
        totalAmount={selectionSummary.totalAmount}
        onExport={handleExportCSV}
      />
    </section>
  );
}
