import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, Link } from "@remix-run/react";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  getSupabaseWithHeaders,
  getSupabaseEnv,
} from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getSiteNamesByCompanyId,
  getProjectNamesByCompanyId,
  getGratuityByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { useInView } from "react-intersection-observer";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { LAZY_LOADING_LIMIT } from "@canny_ecosystem/supabase/constant";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Input } from "@canny_ecosystem/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { payoutMonths } from "@canny_ecosystem/utils/constant";
import { formatDateToSlash } from "@canny_ecosystem/utils";
import { Icon } from "@canny_ecosystem/ui/icon";
import * as XLSX from "xlsx";
import saveAs from "file-saver";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Calendar } from "@canny_ecosystem/ui/calendar";
import { formatISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@canny_ecosystem/ui/dialog";

function lastDayOfMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}
function monthEndDateStr(month: number, year: number) {
  const d = lastDayOfMonth(month, year);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseLocalDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function yearsOfService(startDate: string, endDate: string): number {
  const from = new Date(startDate);
  const to = new Date(endDate);
  const ms = to.getTime() - from.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 365.25));
}

function completedMonthsOfService(startDate: string, endDate: string): number {
  const from = new Date(startDate);
  const to = new Date(endDate);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return 0;

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return Math.max(0, years * 12 + months);
}

export function transformWorkDetailsToRows(
  workDetails: any[],
  month: number,
  year: number,
  endDate: string,
  paymentDaysPerYear: number,
) {
  const empMap = new Map<string, any>();
  for (const row of workDetails ?? []) {
    const empId = row.employee_id;
    const existing = empMap.get(empId);
    if (!existing || new Date(row.start_date) > new Date(existing.start_date)) {
      empMap.set(empId, row);
    }
  }

  return Array.from(empMap.values()).map((wd: any) => {
    const emp = wd.employees;
    const statutory = Array.isArray(emp.employee_statutory_details)
      ? emp.employee_statutory_details[0]
      : emp.employee_statutory_details;

    const assignments: any[] = emp.employee_salary_assignment ?? [];
    const activeAssignment = assignments
      .filter((a: any) => a.effective_date <= endDate)
      .sort(
        (a: any, b: any) =>
          new Date(b.effective_date).getTime() -
          new Date(a.effective_date).getTime(),
      )[0];

    let components: any[] = [];
    let monthlyCtc = Number(activeAssignment?.monthly_ctc ?? 0);
    let basicPercent = Number(activeAssignment?.basic_percent ?? 50);

    if (
      activeAssignment?.use_payment_template &&
      activeAssignment.payment_templates
    ) {
      const versions =
        activeAssignment.payment_templates.payment_template_versions ?? [];
      const activeVersion = versions
        .filter((v: any) => !v.effective_date || v.effective_date <= endDate)
        .sort(
          (a: any, b: any) =>
            new Date(b.effective_date).getTime() -
            new Date(a.effective_date).getTime(),
        )[0];
      if (activeVersion) {
        components = activeVersion.payment_template_components ?? [];
        if (activeVersion.monthly_ctc)
          monthlyCtc = Number(activeVersion.monthly_ctc);
        if (activeVersion.basic_percent)
          basicPercent = Number(activeVersion.basic_percent);
      }
    } else {
      components = activeAssignment?.employee_salary_components ?? [];
    }

    const basicComp = components.find((c: any) =>
      (c.payment_fields?.name ?? "").toLowerCase().includes("basic"),
    );
    const daComp = components.find((c: any) => {
      const name = (c.payment_fields?.name ?? "").toLowerCase();
      return name === "da" || name.includes("dearness");
    });

    let basic = Number(basicComp?.amount ?? 0);
    const da = Number(daComp?.amount ?? 0);

    if (basic === 0 && monthlyCtc > 0) {
      basic = monthlyCtc * (basicPercent / 100);
    }

    const matchedAttendance = (emp.monthly_attendance as any[])?.find(
      (att: any) => att.month === month && att.year === year,
    );
    const workingDaysDivisor = Number(matchedAttendance?.working_days ?? 26);
    const totalSalaryForGratuity = basic + da;
    const perDay =
      totalSalaryForGratuity > 0
        ? totalSalaryForGratuity / workingDaysDivisor
        : 0;

    const exitDate =
      (emp.employee_exit as any[])?.[0]?.last_working_day ?? null;
    const lastDayWork = exitDate && exitDate < endDate ? exitDate : endDate;

    const joiningDate = wd.start_date;
    const totalYears = yearsOfService(joiningDate, lastDayWork);
    const monthsOfService = completedMonthsOfService(joiningDate, lastDayWork);

    const gratuity =
      monthsOfService >= 58 ? perDay * paymentDaysPerYear * totalYears : 0;
    const rb =
      monthsOfService >= 12 ? perDay * paymentDaysPerYear * totalYears : 0;
    const total = gratuity + rb;

    return {
      employee_id: emp.id,
      employee_code: emp.employee_code,
      esic_number: statutory?.esic_number ?? "",
      uan_number: statutory?.uan_number ?? "",
      name: [emp.first_name, emp.middle_name, emp.last_name]
        .filter(Boolean)
        .join(" "),
      father_name: emp.middle_name ?? "",
      designation: wd.position ?? "",
      location: wd.sites?.name ?? "",
      sub_location: wd.projects?.name ?? "",
      state: (wd.sites as any)?.state ?? "",
      joining_date: joiningDate,
      last_day_work: lastDayWork,
      total_years: totalYears,
      per_day: perDay,
      working_days: workingDaysDivisor,
      basic,
      gratuity,
      rb,
      total,
    };
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers: responseHeaders } = getSupabaseWithHeaders({
    request,
  });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const url = new URL(request.url);

  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const defaultMonth = prevMonthDate.getMonth() + 1;
  const defaultYear = prevMonthDate.getFullYear();

  const month = Number(url.searchParams.get("month") || defaultMonth);
  const year = Number(url.searchParams.get("year") || defaultYear);
  const siteId = url.searchParams.get("site") || "";
  const projectId = url.searchParams.get("project") || "";
  const status = url.searchParams.get("status") || "";
  const doj_start = url.searchParams.get("doj_start") || "";
  const doj_end = url.searchParams.get("doj_end") || "";

  const endDate = monthEndDateStr(month, year);

  const { data: sites } = await getSiteNamesByCompanyId({
    supabase,
    companyId,
  });
  const { data: projects } = await getProjectNamesByCompanyId({
    supabase,
    companyId,
  });

  const { data: gratuitySettings } = await getGratuityByCompanyId({
    supabase,
    companyId,
  });
  const gratuityConfig = gratuitySettings?.[0];
  const presentDayPerYear = gratuityConfig?.present_day_per_year ?? 26;
  const paymentDaysPerYear = gratuityConfig?.payment_days_per_year ?? 15;

  let wdQuery = supabase
    .from("work_details")
    .select(
      `
      employee_id,
      start_date,
      end_date,
      position,
      sites!inner(id, name, state),
      projects!left(id, name),
      employees!inner(
        id,
        first_name,
        middle_name,
        last_name,
        employee_code,
        is_active,
        employee_statutory_details!left(uan_number, esic_number),
        monthly_attendance!left(
          month,
          year,
          working_days
        ),
        employee_salary_assignment(
          effective_date,
          monthly_ctc,
          basic_percent,
          use_payment_template,
          employee_salary_components(
            amount,
            payment_fields(name, type)
          ),
          payment_templates(
            name,
            payment_template_versions(
              effective_date,
              monthly_ctc,
              basic_percent,
              payment_template_components(
                amount,
                payment_fields(name, type)
              )
            )
          )
        ),
        employee_exit!left(last_working_day)
      )
    `,
      { count: "exact" },
    )
    .eq("employees.company_id", companyId)
    .lte("start_date", endDate)
    .not("start_date", "is", null);

  if (siteId) wdQuery = wdQuery.eq("site_id", siteId);
  if (projectId) wdQuery = wdQuery.eq("project_id", projectId);

  if (status === "active") {
    wdQuery = wdQuery.eq("employees.is_active", true);
  } else if (status === "inactive") {
    wdQuery = wdQuery.eq("employees.is_active", false);
  }

  if (doj_start) {
    wdQuery = wdQuery.gte("start_date", doj_start);
  }
  if (doj_end) {
    wdQuery = wdQuery.lte("start_date", doj_end);
  }

  wdQuery = wdQuery.range(0, LAZY_LOADING_LIMIT - 1);
  const { data: workDetails, count } = await wdQuery;

  const initialRows = transformWorkDetailsToRows(
    workDetails ?? [],
    month,
    year,
    endDate,
    paymentDaysPerYear,
  );

  const hasNextPage = (count ?? 0) > (workDetails?.length ?? 0);

  return json(
    {
      env: getSupabaseEnv(),
      companyId,
      initialRows,
      totalCount: count ?? 0,
      hasNextPage,
      sites: sites ?? [],
      projects: projects ?? [],
      month,
      year,
      siteId,
      projectId,
      status,
      doj_start,
      doj_end,
      presentDayPerYear,
      paymentDaysPerYear,
    },
    { headers: responseHeaders },
  );
}

const YEARS = Array.from(
  { length: 6 },
  (_, i) => new Date().getFullYear() - 2 + i,
);

function fmt(v: number) {
  return v.toFixed(2);
}

export default function GratuityIndex() {
  const {
    initialRows,
    hasNextPage: initialHasNextPage,
    sites,
    projects,
    month,
    year,
    siteId,
    projectId,
    status,
    doj_start,
    doj_end,
    presentDayPerYear,
    paymentDaysPerYear,
    companyId,
    env,
  } = useLoaderData<typeof loader>();

  const [, setSearchParams] = useSearchParams();
  const tableRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState(initialRows);
  const [from, setFrom] = useState(LAZY_LOADING_LIMIT);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dojRange, setDojRange] = useState<{
    from: string;
    to: string;
  }>({
    from: doj_start || "",
    to: doj_end || "",
  });

  useEffect(() => {
    setDojRange({
      from: doj_start || "",
      to: doj_end || "",
    });
  }, [doj_start, doj_end]);

  const { supabase } = useSupabase({ env });
  const { ref, inView } = useInView();

  useEffect(() => {
    setData(initialRows);
    setFrom(LAZY_LOADING_LIMIT);
    setHasNextPage(initialHasNextPage);
  }, [initialRows, initialHasNextPage]);

  const loadMoreRows = async () => {
    if (isLoadingMore || !hasNextPage) return;
    setIsLoadingMore(true);

    const to = from + LAZY_LOADING_LIMIT - 1;
    const endDate = monthEndDateStr(month, year);

    try {
      let q = supabase
        .from("work_details")
        .select(`
          employee_id,
          start_date,
          end_date,
          position,
          sites!inner(id, name, state),
          projects!left(id, name),
          employees!inner(
            id,
            first_name,
            middle_name,
            last_name,
            employee_code,
            is_active,
            employee_statutory_details!left(uan_number, esic_number),
            monthly_attendance!left(
              month,
              year,
              working_days
            ),
            employee_salary_assignment(
              effective_date,
              monthly_ctc,
              basic_percent,
              use_payment_template,
              employee_salary_components(
                amount,
                payment_fields(name, type)
              ),
              payment_templates(
                name,
                payment_template_versions(
                  effective_date,
                  monthly_ctc,
                  basic_percent,
                  payment_template_components(
                    amount,
                    payment_fields(name, type)
                  )
                )
              )
            ),
            employee_exit!left(last_working_day)
          )
        `)
        .eq("employees.company_id", companyId)
        .lte("start_date", endDate)
        .not("start_date", "is", null);

      if (siteId) q = q.eq("site_id", siteId);
      if (projectId) q = q.eq("project_id", projectId);
      if (status === "active") q = q.eq("employees.is_active", true);
      else if (status === "inactive") q = q.eq("employees.is_active", false);

      if (doj_start) q = q.gte("start_date", doj_start);
      if (doj_end) q = q.lte("start_date", doj_end);

      q = q.range(from, to);

      const { data: workDetails } = await q;
      if (workDetails && workDetails.length > 0) {
        const newRows = transformWorkDetailsToRows(
          workDetails,
          month,
          year,
          endDate,
          paymentDaysPerYear,
        );
        setData((prev) => {
          const existingCodes = new Set(prev.map((r) => r.employee_code));
          const filteredNewRows = newRows.filter(
            (r) => !existingCodes.has(r.employee_code),
          );
          return [...prev, ...filteredNewRows];
        });
      }
      setFrom(to + 1);
      setHasNextPage((workDetails?.length ?? 0) === LAZY_LOADING_LIMIT);
    } catch (err) {
      console.error("loadMoreRows error", err);
      setHasNextPage(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (inView) {
      loadMoreRows();
    }
  }, [inView]);

  const [search, setSearch] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.employee_code.toLowerCase().includes(q),
    );
  }, [data, search]);

  const allCodes = useMemo(
    () => new Set(filtered.map((r) => r.employee_code)),
    [filtered],
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCodes(new Set(allCodes));
    } else {
      setSelectedCodes(new Set());
    }
  };

  const handleSelectRow = (code: string, checked: boolean) => {
    const next = new Set(selectedCodes);
    if (checked) {
      next.add(code);
    } else {
      next.delete(code);
    }
    setSelectedCodes(next);
  };

  const selectionSummary = useMemo(() => {
    const selectedRows = filtered.filter((r) =>
      selectedCodes.has(r.employee_code),
    );
    return {
      count: selectedRows.length,
      gratuity: selectedRows.reduce((sum, r) => sum + r.gratuity, 0),
      rb: selectedRows.reduce((sum, r) => sum + r.rb, 0),
      total: selectedRows.reduce((sum, r) => sum + r.total, 0),
    };
  }, [filtered, selectedCodes]);

  function setParam(key: string, val: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val) next.set(key, val);
      else next.delete(key);
      return next;
    });
  }

  interface ExportCol {
    key: string;
    label: string;
    width: number;
    enabled: boolean;
  }

  const [exportCols, setExportCols] = useState<ExportCol[]>([
    { key: "sl_no", label: "SL NO", width: 6, enabled: true },
    { key: "emp_code", label: "EMPLOYEE CODE", width: 14, enabled: true },
    { key: "name", label: "NAME", width: 22, enabled: true },
    { key: "esic_no", label: "ESIC NO", width: 14, enabled: true },
    { key: "uan_no", label: "UAN NO", width: 14, enabled: true },
    { key: "father_name", label: "FATHER NAME", width: 18, enabled: true },
    { key: "designation", label: "DESIGNATION", width: 16, enabled: true },
    { key: "location", label: "LOCATION", width: 16, enabled: true },
    { key: "sub_location", label: "SUB LOCATION", width: 16, enabled: true },
    { key: "state", label: "STATE", width: 12, enabled: true },
    { key: "doj", label: "DATE OF JOINING", width: 14, enabled: true },
    { key: "last_day", label: "LAST DAY OF WORK", width: 14, enabled: true },
    { key: "total_years", label: "TOTAL YEARS", width: 12, enabled: true },
    { key: "per_day_rate", label: "PER DAY RATE", width: 12, enabled: true },
    { key: "gratuity", label: "GRATUITY", width: 12, enabled: true },
    { key: "rb", label: "RB", width: 10, enabled: true },
    { key: "total", label: "TOTAL", width: 10, enabled: true },
  ]);

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null) return;
    const nextCols = [...exportCols];
    const [draggedItem] = nextCols.splice(draggedIndex, 1);
    nextCols.splice(index, 0, draggedItem);
    setExportCols(nextCols);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= exportCols.length) return;
    const nextCols = [...exportCols];
    const temp = nextCols[index];
    nextCols[index] = nextCols[targetIndex];
    nextCols[targetIndex] = temp;
    setExportCols(nextCols);
  };

  const toggleColumnEnabled = (key: string) => {
    setExportCols((prev) =>
      prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const handleSelectAllCols = () => {
    setExportCols((prev) => prev.map((c) => ({ ...c, enabled: true })));
  };

  const handleClearAllCols = () => {
    setExportCols((prev) => prev.map((c) => ({ ...c, enabled: false })));
  };

  const handleResetCols = () => {
    setExportCols([
      { key: "sl_no", label: "SL NO", width: 6, enabled: true },
      { key: "emp_code", label: "EMPLOYEE CODE", width: 14, enabled: true },
      { key: "name", label: "NAME", width: 22, enabled: true },
      { key: "esic_no", label: "ESIC NO", width: 14, enabled: true },
      { key: "uan_no", label: "UAN NO", width: 14, enabled: true },
      { key: "father_name", label: "FATHER NAME", width: 18, enabled: true },
      { key: "designation", label: "DESIGNATION", width: 16, enabled: true },
      { key: "location", label: "LOCATION", width: 16, enabled: true },
      { key: "sub_location", label: "SUB LOCATION", width: 16, enabled: true },
      { key: "state", label: "STATE", width: 12, enabled: true },
      { key: "doj", label: "DATE OF JOINING", width: 14, enabled: true },
      { key: "last_day", label: "LAST DAY OF WORK", width: 14, enabled: true },
      { key: "total_years", label: "TOTAL YEARS", width: 12, enabled: true },
      { key: "per_day_rate", label: "PER DAY RATE", width: 12, enabled: true },
      { key: "gratuity", label: "GRATUITY", width: 12, enabled: true },
      { key: "rb", label: "RB", width: 10, enabled: true },
      { key: "total", label: "TOTAL", width: 10, enabled: true },
    ]);
  };

  function handleExport() {
    const selectedData = filtered.filter((r) =>
      selectedCodes.has(r.employee_code),
    );
    if (selectedData.length === 0) return;

    const enabledCols = exportCols.filter((c) => c.enabled);
    if (enabledCols.length === 0) return;

    const getLetter = (key: string) => {
      const idx = enabledCols.findIndex((c) => c.key === key);
      if (idx === -1) return "";
      return String.fromCharCode(65 + idx);
    };

    const wb = XLSX.utils.book_new();
    const headers = enabledCols.map((c) => c.label);

    const dataRows = selectedData.map((r, i) => {
      const rowNum = i + 2;

      // Resolve column letters dynamically
      const dojL = getLetter("doj");
      const lastDayL = getLetter("last_day");
      const basicL = getLetter("basic");
      const perDayL = getLetter("per_day_rate");
      const yearsL = getLetter("total_years");
      const gratuityL = getLetter("gratuity");
      const rbL = getLetter("rb");

      return enabledCols.map((col) => {
        switch (col.key) {
          case "sl_no":
            return i + 1;
          case "emp_code":
            return r.employee_code;
          case "name":
            return r.name;
          case "esic_no":
            return r.esic_number;
          case "uan_no":
            return r.uan_number;
          case "father_name":
            return r.father_name;
          case "designation":
            return r.designation;
          case "location":
            return r.location;
          case "sub_location":
            return r.sub_location;
          case "state":
            return r.state;
          case "doj":
            return formatDateToSlash(r.joining_date)?.replaceAll("/", "-");
          case "last_day":
            return formatDateToSlash(r.last_day_work)?.replaceAll("/", "-");
          case "total_years":
            return dojL && lastDayL
              ? { f: `YEARFRAC(${dojL}${rowNum},${lastDayL}${rowNum})` }
              : r.total_years;
          case "per_day_rate":
            return basicL
              ? { f: `ROUND(${basicL}${rowNum}/${r.working_days || 26},2)` }
              : r.per_day;
          case "basic":
            return r.basic;
          case "gratuity":
            return perDayL && yearsL
              ? {
                  f: `IF(ROUND(${yearsL}${rowNum}*12,0)>=58,ROUND(${perDayL}${rowNum}*${paymentDaysPerYear}*${yearsL}${rowNum},2),0)`,
                }
              : r.gratuity;
          case "rb":
            return perDayL && yearsL
              ? {
                  f: `IF(ROUND(${yearsL}${rowNum}*12,0)>=12,ROUND(${perDayL}${rowNum}*${paymentDaysPerYear}*${yearsL}${rowNum},2),0)`,
                }
              : r.rb;
          case "total":
            return gratuityL && rbL
              ? { f: `${gratuityL}${rowNum}+${rbL}${rowNum}` }
              : r.total;
          default:
            return "";
        }
      });
    });

    const wsData = [headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws["!cols"] = enabledCols.map((c) => ({ wch: c.width }));

    const monthLabel =
      payoutMonths.find((m) => m.value === month)?.label ?? month;
    XLSX.utils.book_append_sheet(wb, ws, "Gratuity");
    const buf = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `Gratuity-${monthLabel}-${year}.xlsx`);
  }

  return (
    <section className="pt-4 px-4 pb-0 overflow-hidden flex flex-col h-[calc(100dvh-145px)] gap-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <div className="flex space-x-4 w-full md:w-auto items-center">
              <div className="relative w-full md:w-auto">
                <Icon
                  name="search"
                  className="absolute pointer-events-none left-3 top-[12.5px]"
                />
                <Input
                  type="text"
                  placeholder="Search employee…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full h-10 md:w-[480px] pr-8 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70"
                />
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "absolute z-10 right-3 top-[6px] opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100",
                      (siteId || projectId || status || doj_start || doj_end) &&
                        "opacity-100",
                    )}
                  >
                    <Icon name="mixer" />
                  </button>
                </DropdownMenuTrigger>
              </div>
            </div>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>Site</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuCheckboxItem
                        checked={!siteId}
                        onCheckedChange={() => setParam("site", "")}
                      >
                        All Sites
                      </DropdownMenuCheckboxItem>
                      {sites.map((s: any) => (
                        <DropdownMenuCheckboxItem
                          key={s.id}
                          checked={siteId === s.id}
                          onCheckedChange={() => setParam("site", s.id)}
                        >
                          {s.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>Project</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuCheckboxItem
                        checked={!projectId}
                        onCheckedChange={() => setParam("project", "")}
                      >
                        All Projects
                      </DropdownMenuCheckboxItem>
                      {projects.map((p: any) => (
                        <DropdownMenuCheckboxItem
                          key={p.id}
                          checked={projectId === p.id}
                          onCheckedChange={() => setParam("project", p.id)}
                        >
                          {p.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>Status</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuCheckboxItem
                        checked={!status}
                        onCheckedChange={() => setParam("status", "")}
                      >
                        All Statuses
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={status === "active"}
                        onCheckedChange={() => setParam("status", "active")}
                      >
                        Active
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={status === "inactive"}
                        onCheckedChange={() => setParam("status", "inactive")}
                      >
                        Inactive
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>Month</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      {payoutMonths.map((m) => (
                        <DropdownMenuCheckboxItem
                          key={m.value}
                          checked={Number(month) === m.value}
                          onCheckedChange={() =>
                            setParam("month", String(m.value))
                          }
                        >
                          {m.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>Year</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      {YEARS.map((y) => (
                        <DropdownMenuCheckboxItem
                          key={y}
                          checked={Number(year) === y}
                          onCheckedChange={() => setParam("year", String(y))}
                        >
                          {y}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>
                      {doj_start || doj_end ? (
                        <>
                          Date of joining (
                          {doj_start
                            ? formatDateToSlash(
                                parseLocalDate(doj_start),
                              )?.replaceAll("/", "-")
                            : ""}
                          {doj_start && doj_end
                            ? " to "
                            : doj_start
                              ? " onwards"
                              : " up to "}
                          {doj_end
                            ? formatDateToSlash(
                                parseLocalDate(doj_end),
                              )?.replaceAll("/", "-")
                            : ""}
                          )
                        </>
                      ) : (
                        "Date of joining"
                      )}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="p-0 flex flex-col items-center pb-2 bg-card">
                      <Calendar
                        mode="range"
                        captionLayout="dropdown"
                        today={parseLocalDate(dojRange.from) || new Date()}
                        selected={{
                          from: parseLocalDate(dojRange.from),
                          to: parseLocalDate(dojRange.to),
                        }}
                        onSelect={(range) => {
                          if (!range) return;

                          let newFrom = range.from
                            ? formatISO(range.from, { representation: "date" })
                            : "";
                          let newTo = range.to
                            ? formatISO(range.to, { representation: "date" })
                            : "";

                          if (range.from && range.to && range.from > range.to) {
                            const temp = newFrom;
                            newFrom = newTo;
                            newTo = temp;
                          }

                          setDojRange({
                            from: newFrom,
                            to: newTo,
                          });

                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            if (newFrom) {
                              next.set("doj_start", newFrom);
                            } else {
                              next.delete("doj_start");
                            }
                            if (newTo) {
                              next.set("doj_end", newTo);
                            } else {
                              next.delete("doj_end");
                            }
                            return next;
                          });
                        }}
                      />
                      {(dojRange.from || dojRange.to) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-[90%] text-xs border border-white/5 hover:bg-accent"
                          onClick={() => {
                            setDojRange({ from: "", to: "" });
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev);
                              next.delete("doj_start");
                              next.delete("doj_end");
                              return next;
                            });
                          }}
                        >
                          Clear filter
                        </Button>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className={cn(
          "border rounded shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col",
          !filtered.length && "border-none shadow-none",
        )}
      >
        <Table
          ref={tableRef}
          wrapperClassName="flex-1 min-h-0"
          className="w-max min-w-full text-sm"
        >
          <TableHeader className="sticky top-0 z-20 bg-card border-b border-white/5">
            <TableRow className="flex h-[45px] hover:bg-transparent">
              <TableHead className="px-4 py-2 w-[50px] min-w-[50px] max-w-[50px] sticky left-0 bg-card z-30 flex items-center justify-center">
                <Checkbox
                  checked={
                    filtered.length > 0 &&
                    filtered.every((r) => selectedCodes.has(r.employee_code))
                  }
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
              </TableHead>
              {[
                {
                  label: "SL",
                  w: "w-[40px] min-w-[40px] max-w-[40px]",
                  sticky: true,
                  left: "left-[50px]",
                },
                {
                  label: "Emp Code",
                  w: "w-[110px] min-w-[110px] max-w-[110px]",
                  sticky: true,
                  left: "left-[90px]",
                },
                {
                  label: "Name",
                  w: "w-[180px] min-w-[180px] max-w-[180px]",
                  sticky: true,
                  left: "left-[200px]",
                },
                {
                  label: "ESIC No",
                  w: "w-[110px] min-w-[110px] max-w-[110px]",
                },
                { label: "UAN No", w: "w-[110px] min-w-[110px] max-w-[110px]" },
                {
                  label: "Father Name",
                  w: "w-[140px] min-w-[140px] max-w-[140px]",
                },
                {
                  label: "Designation",
                  w: "w-[130px] min-w-[130px] max-w-[130px]",
                },
                {
                  label: "Location",
                  w: "w-[120px] min-w-[120px] max-w-[120px]",
                },
                {
                  label: "Sub Location",
                  w: "w-[120px] min-w-[120px] max-w-[120px]",
                },
                { label: "State", w: "w-[80px] min-w-[80px] max-w-[80px]" },
                { label: "DOJ", w: "w-[120px] min-w-[120px] max-w-[120px]" },
                {
                  label: "Last Day",
                  w: "w-[120px] min-w-[120px] max-w-[120px]",
                },
                { label: "Years", w: "w-[70px] min-w-[70px] max-w-[70px]" },
                {
                  label: "Per Day",
                  w: "w-[120px] min-w-[120px] max-w-[120px]",
                },
                { label: "Basic", w: "w-[130px] min-w-[130px] max-w-[130px]" },
                {
                  label: "Gratuity",
                  w: "w-[130px] min-w-[130px] max-w-[130px]",
                },
                { label: "RB", w: "w-[120px] min-w-[120px] max-w-[120px]" },
                { label: "Total", w: "w-[130px] min-w-[130px] max-w-[130px]" },
              ].map(({ label, w, sticky, left }) => (
                <TableHead
                  key={label}
                  className={cn(
                    "px-4 py-2.5 flex items-center text-muted-foreground font-medium capitalize flex-shrink-0",
                    w,
                    sticky && `sticky ${left} bg-card z-20`,
                  )}
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((row, idx) => (
                <TableRow
                  key={row.employee_code}
                  className="flex border-b border-white/5 hover:bg-muted/30 transition-colors group"
                >
                  <TableCell className="px-4 py-2 w-[50px] min-w-[50px] max-w-[50px] flex-shrink-0 sticky left-0 bg-card z-10 group-hover:bg-muted flex items-center justify-center">
                    <Checkbox
                      checked={selectedCodes.has(row.employee_code)}
                      onCheckedChange={(checked) =>
                        handleSelectRow(row.employee_code, !!checked)
                      }
                    />
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[40px] min-w-[40px] max-w-[40px] flex-shrink-0 sticky left-[50px] bg-card z-10 group-hover:bg-muted tabular-nums flex items-center">
                    {idx + 1}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 sticky left-[90px] bg-card z-10 group-hover:bg-muted flex items-center">
                    <Link
                      to={`/employees/${row.employee_id}`}
                      prefetch="intent"
                      className="text-primary/80 hover:text-primary transition-all font-medium truncate block w-full"
                    >
                      {row.employee_code}
                    </Link>
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[180px] min-w-[180px] max-w-[180px] flex-shrink-0 sticky left-[200px] bg-card z-10 group-hover:bg-muted flex items-center">
                    <Link
                      to={`/employees/${row.employee_id}`}
                      prefetch="intent"
                      className="text-primary/80 hover:text-primary transition-all font-medium truncate block w-full"
                    >
                      {row.name}
                    </Link>
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 tabular-nums flex items-center truncate">
                    {row.esic_number || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 tabular-nums flex items-center truncate">
                    {row.uan_number || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[140px] min-w-[140px] max-w-[140px] flex-shrink-0 flex items-center truncate">
                    {row.father_name || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[130px] min-w-[130px] max-w-[130px] flex-shrink-0 flex items-center truncate">
                    {row.designation || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center truncate">
                    {row.location || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center truncate">
                    {row.sub_location || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[80px] min-w-[80px] max-w-[80px] flex-shrink-0 flex items-center truncate">
                    {row.state || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 tabular-nums flex items-center">
                    {formatDateToSlash(row.joining_date)?.replaceAll("/", "-")}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 tabular-nums flex items-center">
                    {formatDateToSlash(row.last_day_work)?.replaceAll("/", "-")}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[70px] min-w-[70px] max-w-[70px] flex-shrink-0 tabular-nums text-center flex items-center justify-center">
                    {row.total_years.toFixed(2)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 tabular-nums text-right flex items-center justify-end">
                    ₹{fmt(row.per_day)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[130px] min-w-[130px] max-w-[130px] flex-shrink-0 tabular-nums text-right flex items-center justify-end">
                    ₹{fmt(row.basic)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[130px] min-w-[130px] max-w-[130px] flex-shrink-0 tabular-nums text-right flex items-center justify-end">
                    ₹{fmt(row.gratuity)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 tabular-nums text-right flex items-center justify-end">
                    ₹{fmt(row.rb)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[130px] min-w-[130px] max-w-[130px] flex-shrink-0 tabular-nums text-right flex items-center justify-end">
                    ₹{fmt(row.total)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="flex">
                <TableCell
                  colSpan={19}
                  className="h-64 bg-background flex flex-col items-center justify-center text-center w-full"
                >
                  <div className="flex flex-col items-center gap-1">
                    <h2 className="text-lg font-semibold">No records found.</h2>
                    <p className="text-muted-foreground text-sm">
                      Try adjusting your filters or selecting a different month
                      / year.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            <TableRow
              className={cn(
                "flex justify-center py-4",
                !hasNextPage && "hidden",
              )}
              ref={ref}
            >
              <TableCell
                colSpan={19}
                className="flex items-center justify-center gap-2 w-full"
              >
                <Spinner />
                <span className="text-xs text-[#606060]">Loading more...</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <GratuityExportBar
        selectedCount={selectedCodes.size}
        totalGratuity={selectionSummary.gratuity}
        totalRB={selectionSummary.rb}
        totalAmount={selectionSummary.total}
        onExport={() => setIsExportDialogOpen(true)}
        onCancel={() => setSelectedCodes(new Set())}
      />

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-md w-full flex flex-col max-h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-lg font-semibold">
              Export Columns Option
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Configure the order and visibility of columns for your Excel
              export.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-between items-center px-6 py-2 border-b border-border bg-muted/20 text-xs">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleSelectAllCols}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleClearAllCols}
              >
                Clear All
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleResetCols}
            >
              Reset to Default
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-2 max-h-[50vh]">
            {exportCols.map((col, idx) => {
              const isDragged = draggedIndex === idx;
              const isOver = dragOverIndex === idx;

              return (
                <div
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-lg border bg-card transition-all duration-150 group",
                    isDragged
                      ? "opacity-40 border-primary border-dashed"
                      : "border-border",
                    isOver
                      ? "bg-primary/10 border-primary scale-[1.01]"
                      : "hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing p-1"
                      title="Drag to reorder"
                    >
                      <Icon name="caret-sort" className="h-4 w-4" />
                    </div>

                    <Checkbox
                      id={`col-${col.key}`}
                      checked={col.enabled}
                      onCheckedChange={() => toggleColumnEnabled(col.key)}
                    />
                    <label
                      htmlFor={`col-${col.key}`}
                      className="text-xs font-medium select-none cursor-pointer text-foreground flex items-center"
                    >
                      <span className="text-muted-foreground/60 mr-2 font-mono text-[10px]">
                        {idx + 1}.
                      </span>
                      {col.label}
                    </label>
                  </div>

                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded"
                      disabled={idx === 0}
                      onClick={() => moveColumn(idx, "up")}
                      title="Move Up"
                    >
                      <Icon name="chevron-up" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded"
                      disabled={idx === exportCols.length - 1}
                      onClick={() => moveColumn(idx, "down")}
                      title="Move Down"
                    >
                      <Icon name="chevron-down" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/10 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsExportDialogOpen(false);
                handleExport();
              }}
              size="sm"
              disabled={exportCols.filter((c) => c.enabled).length === 0}
              className="flex items-center gap-2"
            >
              <Icon name="download" className="h-4 w-4" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function GratuityExportBar({
  selectedCount,
  totalGratuity,
  totalRB,
  totalAmount,
  onExport,
  onCancel,
}: {
  selectedCount: number;
  totalGratuity: number;
  totalRB: number;
  totalAmount: number;
  onExport: () => void;
  onCancel?: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="z-40 fixed bottom-16 md:bottom-8 left-0 right-0 mx-auto h-14 w-max shadow-md rounded-full flex gap-10 justify-between items-center p-2 text-sm border dark:border-muted-foreground/30 bg-card text-card-foreground">
      {onCancel && (
        <Button
          variant="ghost"
          onClick={onCancel}
          className="h-full bg-muted rounded-full text-muted-foreground hover:bg-muted hover:text-muted-foreground"
        >
          Cancel
        </Button>
      )}
      <div className={cn("flex items-center space-x-1", !onCancel && "ml-4")}>
        <p className="font-semibold whitespace-nowrap">
          {selectedCount} Selected
        </p>
      </div>
      <div className="h-full flex items-center gap-2">
        <div className="h-full font-medium rounded-full hidden md:flex items-center px-6 border dark:border-muted-foreground/30 whitespace-nowrap gap-4">
          <span>
            Gratuity:{" "}
            <span className="font-semibold text-foreground">
              ₹{totalGratuity.toFixed(2)}
            </span>
          </span>
          <span className="w-px h-4 bg-border/20" />
          <span>
            RB:{" "}
            <span className="font-semibold text-foreground">
              ₹{totalRB.toFixed(2)}
            </span>
          </span>
          <span className="w-px h-4 bg-border/20" />
          <span>
            Total:{" "}
            <span className="font-semibold text-foreground">
              ₹{totalAmount.toFixed(2)}
            </span>
          </span>
        </div>
        <Button
          onClick={(e) => {
            e.preventDefault();
            onExport();
          }}
          variant="default"
          size="lg"
          className="h-full rounded-full px-8 text-sm"
        >
          Export
        </Button>
      </div>
    </div>
  );
}
