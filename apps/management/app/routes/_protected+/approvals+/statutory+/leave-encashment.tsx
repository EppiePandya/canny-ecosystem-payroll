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
} from "@canny_ecosystem/supabase/queries";
import { useInView } from "react-intersection-observer";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { LAZY_LOADING_LIMIT } from "@canny_ecosystem/supabase/constant";
import { payoutMonths } from "@canny_ecosystem/utils/constant";

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
import { Icon } from "@canny_ecosystem/ui/icon";
import * as XLSX from "xlsx";
import saveAs from "file-saver";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@canny_ecosystem/ui/dialog";

const YEARS = Array.from(
  { length: 10 },
  (_, i) => new Date().getFullYear() - 5 + i,
);

const DEFAULT_EXPORT_COLUMNS = [
  { key: "sl_no", label: "Sl. No.", enabled: true },
  { key: "emp_code", label: "EMPL CODE", enabled: true },
  { key: "esic_no", label: "ESIC NO.", enabled: true },
  { key: "uan_no", label: "UAN NO.", enabled: true },
  { key: "name", label: "Staff Name", enabled: true },
  { key: "father_name", label: "FATHER'S NAME", enabled: true },
  { key: "designation", label: "DESIGNATION", enabled: true },
  { key: "area", label: "AREA", enabled: true },
  { key: "location", label: "LOCATION", enabled: true },
  ...payoutMonths.map((m) => ({
    key: m.label.slice(0, 3).toLowerCase(),
    label: m.label.slice(0, 3),
    enabled: true,
  })),
  { key: "total_days", label: "TOTAL DAYS E.L", enabled: true },
  {
    key: "no_of_leaves",
    label: "No of Annual Leave to be paid",
    enabled: true,
  },
  { key: "per_day_basic", label: "Per Day Basic", enabled: true },
  { key: "amount_to_pay", label: "Amount to be paid", enabled: true },
];

export function transformWorkDetailsToLeaveEncashmentRows(
  workDetails: any[],
  year: number,
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
      .filter((a: any) => a.effective_date <= `${year}-12-31`)
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
        .filter(
          (v: any) => !v.effective_date || v.effective_date <= `${year}-12-31`,
        )
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

    let basic = Number(basicComp?.amount ?? 0);
    if (basic === 0 && monthlyCtc > 0) {
      basic = monthlyCtc * (basicPercent / 100);
    }

    const monthPresentDays = Array.from({ length: 12 }, (_, i) => {
      const mNum = i + 1;
      const att = (emp.monthly_attendance as any[])?.find(
        (a: any) => Number(a.month) === mNum && Number(a.year) === year,
      );
      return att ? Number(att.present_days ?? 0) : 0;
    });

    const totalDays = monthPresentDays.reduce((a, b) => a + b, 0);
    const noOfLeaves = totalDays / 20;
    const perDayBasic = basic / 26;
    const amountToPay = noOfLeaves * perDayBasic;

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
      joining_date: wd.start_date,
      basic,
      present_days_list: monthPresentDays,
      total_days: totalDays,
      no_of_leaves: noOfLeaves,
      per_day_basic: perDayBasic,
      amount_to_pay: amountToPay,
    };
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers: responseHeaders } = getSupabaseWithHeaders({
    request,
  });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const url = new URL(request.url);

  const defaultYear = new Date().getFullYear();
  const year = Number(url.searchParams.get("year") || defaultYear);
  const siteId = url.searchParams.get("site") || "";
  const projectId = url.searchParams.get("project") || "";
  const status = url.searchParams.get("status") || "";

  const { data: sites } = await getSiteNamesByCompanyId({
    supabase,
    companyId,
  });
  const { data: projects } = await getProjectNamesByCompanyId({
    supabase,
    companyId,
  });

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
          working_days,
          present_days
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
    .lte("start_date", `${year}-12-31`)
    .not("start_date", "is", null);

  if (siteId) wdQuery = wdQuery.eq("site_id", siteId);
  if (projectId) wdQuery = wdQuery.eq("project_id", projectId);

  if (status === "active") {
    wdQuery = wdQuery.eq("employees.is_active", true);
  } else if (status === "inactive") {
    wdQuery = wdQuery.eq("employees.is_active", false);
  }

  wdQuery = wdQuery.range(0, LAZY_LOADING_LIMIT - 1);
  const { data: workDetails, count } = await wdQuery;

  const initialRows = transformWorkDetailsToLeaveEncashmentRows(
    workDetails ?? [],
    year,
  );

  const hasNextPage = (count ?? 0) > (workDetails?.length ?? 0);

  const env = getSupabaseEnv();

  return json(
    {
      initialRows,
      totalCount: count ?? 0,
      hasNextPage,
      sites: sites ?? [],
      projects: projects ?? [],
      year,
      siteId,
      projectId,
      status,
      env,
      companyId,
    },
    { headers: responseHeaders },
  );
}

export default function LeaveEncashmentIndex() {
  const {
    initialRows,
    hasNextPage: initialHasNextPage,
    sites,
    projects,
    year,
    siteId,
    projectId,
    status,
    env,
    companyId,
  } = useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  // Export Columns Dialog State
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportCols, setExportCols] = useState(DEFAULT_EXPORT_COLUMNS);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Infinite scroll / lazy loading state
  const [data, setData] = useState(initialRows);
  const [from, setFrom] = useState(LAZY_LOADING_LIMIT);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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
              working_days,
              present_days
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
        .lte("start_date", `${year}-12-31`)
        .not("start_date", "is", null);

      if (siteId) q = q.eq("site_id", siteId);
      if (projectId) q = q.eq("project_id", projectId);
      if (status === "active") q = q.eq("employees.is_active", true);
      else if (status === "inactive") q = q.eq("employees.is_active", false);

      q = q.range(from, to);

      const { data: workDetails } = await q;
      if (workDetails && workDetails.length > 0) {
        const newRows = transformWorkDetailsToLeaveEncashmentRows(
          workDetails,
          year,
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

  const shortYear = String(year).slice(-2);

  const filtered = useMemo(() => {
    return data.filter((r) => {
      const query = search.toLowerCase().trim();
      const codeMatch = r.employee_code.toLowerCase().includes(query);
      const nameMatch = r.name.toLowerCase().includes(query);
      return codeMatch || nameMatch;
    });
  }, [data, search]);

  const setParam = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val);
    else next.delete(key);
    setSearchParams(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCodes(new Set(filtered.map((r) => r.employee_code)));
    } else {
      setSelectedCodes(new Set());
    }
  };

  const handleSelectRow = (code: string, checked: boolean) => {
    const next = new Set(selectedCodes);
    if (checked) next.add(code);
    else next.delete(code);
    setSelectedCodes(next);
  };

  // Drag and drop logic
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null) return;
    const next = [...exportCols];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    setExportCols(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const next = [...exportCols];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= exportCols.length) return;
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    setExportCols(next);
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
    setExportCols(DEFAULT_EXPORT_COLUMNS);
  };

  // Summary of selected employees
  const selectionSummary = useMemo(() => {
    const selected = filtered.filter((r) => selectedCodes.has(r.employee_code));
    return selected.reduce(
      (acc, r) => {
        acc.totalDays += r.total_days;
        acc.leaves += r.no_of_leaves;
        acc.amount += r.amount_to_pay;
        return acc;
      },
      { totalDays: 0, leaves: 0, amount: 0 },
    );
  }, [filtered, selectedCodes]);

  function handleExport() {
    const selectedData = filtered.filter((r) =>
      selectedCodes.has(r.employee_code),
    );
    if (selectedData.length === 0) return;

    const enabledCols = exportCols.filter((c) => c.enabled);
    const getLetter = (key: string) => {
      const idx = enabledCols.findIndex((c) => c.key === key);
      if (idx === -1) return "";
      return String.fromCharCode(65 + idx);
    };

    const wb = XLSX.utils.book_new();
    const headers = enabledCols.map((c) => {
      const isMonth = payoutMonths
        .map((m) => m.label.slice(0, 3).toLowerCase())
        .includes(c.key);
      if (isMonth) {
        return `${c.label}-${shortYear}`;
      }
      return c.label;
    });

    const dataRows = selectedData.map((r, i) => {
      const rowNum = i + 2;

      // Resolve column letters dynamically
      const totalDaysL = getLetter("total_days");
      const noOfLeavesL = getLetter("no_of_leaves");
      const perDayBasicL = getLetter("per_day_basic");

      // Build sum of months
      const monthLetters = payoutMonths
        .map((m) => m.label.slice(0, 3).toLowerCase())
        .map((m) => getLetter(m))
        .filter(Boolean);
      const totalDaysFormula = monthLetters
        .map((L) => `${L}${rowNum}`)
        .join("+");

      return enabledCols.map((col) => {
        const monthKeys = payoutMonths.map((m) =>
          m.label.slice(0, 3).toLowerCase(),
        );
        const monthIdx = monthKeys.indexOf(col.key);
        if (monthIdx !== -1) {
          return r.present_days_list[monthIdx];
        }

        switch (col.key) {
          case "sl_no":
            return i + 1;
          case "emp_code":
            return r.employee_code;
          case "esic_no":
            return r.esic_number;
          case "uan_no":
            return r.uan_number;
          case "name":
            return r.name;
          case "father_name":
            return r.father_name;
          case "designation":
            return r.designation;
          case "area":
            return r.location;
          case "location":
            return r.sub_location;
          case "total_days":
            return totalDaysFormula ? { f: totalDaysFormula } : r.total_days;
          case "no_of_leaves":
            return totalDaysL
              ? { f: `ROUND((${totalDaysL}${rowNum})/20,2)` }
              : r.no_of_leaves;
          case "per_day_basic":
            return r.per_day_basic;
          case "amount_to_pay":
            return noOfLeavesL && perDayBasicL
              ? {
                f: `ROUND(${noOfLeavesL}${rowNum}*${perDayBasicL}${rowNum},2)`,
              }
              : r.amount_to_pay;
          default:
            return "";
        }
      });
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    XLSX.utils.book_append_sheet(wb, ws, "Leave Encashment");
    const buf = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `Leave-Encashment-${year}.xlsx`);
  }

  const tableRef = useRef<HTMLTableElement>(null);

  return (
    <section className="pt-4 px-4 pb-0 overflow-hidden flex flex-col h-[calc(100dvh-145px)] gap-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
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
                      (siteId || projectId || status) && "opacity-100",
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
        <Table ref={tableRef} className="w-max min-w-full text-sm">
          <TableHeader className="sticky top-0 z-20 bg-card border-b border-white/5">
            <TableRow className="flex h-[45px] hover:bg-transparent">
              <TableHead className="px-4 py-2 w-[50px] min-w-[50px] max-w-[50px] flex-shrink-0 sticky left-0 bg-card z-30 flex items-center justify-center">
                <Checkbox
                  checked={
                    filtered.length > 0 &&
                    selectedCodes.size === filtered.length
                  }
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
              </TableHead>

              <TableHead className="px-4 py-2 w-[40px] min-w-[40px] max-w-[40px] flex-shrink-0 sticky left-[50px] bg-card z-30 flex items-center font-medium">
                SL
              </TableHead>

              <TableHead className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 sticky left-[90px] bg-card z-30 flex items-center font-medium">
                Emp Code
              </TableHead>

              <TableHead className="px-4 py-2 w-[180px] min-w-[180px] max-w-[180px] flex-shrink-0 sticky left-[200px] bg-card z-30 flex items-center font-medium">
                Name
              </TableHead>

              <TableHead className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 flex items-center font-medium">
                ESIC No
              </TableHead>

              <TableHead className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 flex items-center font-medium">
                UAN No
              </TableHead>

              <TableHead className="px-4 py-2 w-[140px] min-w-[140px] max-w-[140px] flex-shrink-0 flex items-center font-medium">
                Father Name
              </TableHead>

              <TableHead className="px-4 py-2 w-[130px] min-w-[130px] max-w-[130px] flex-shrink-0 flex items-center font-medium">
                Designation
              </TableHead>

              <TableHead className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center font-medium">
                Area
              </TableHead>

              <TableHead className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center font-medium">
                Location
              </TableHead>

              {/* 12 Months present days headers */}
              {payoutMonths.map((m, i) => {
                const shortLabel = m.label.slice(0, 3);
                return (
                  <TableHead
                    key={i}
                    className="px-3 py-2 w-[70px] min-w-[70px] max-w-[70px] flex-shrink-0 flex items-center justify-center font-medium text-center"
                  >
                    {shortLabel}-{shortYear}
                  </TableHead>
                );
              })}

              <TableHead className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center justify-center font-medium text-center">
                Total Days E.L
              </TableHead>

              <TableHead className="px-4 py-2 w-[150px] min-w-[150px] max-w-[150px] flex-shrink-0 flex items-center justify-center font-medium text-center">
                Annual Leaves
              </TableHead>

              <TableHead className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 flex items-center justify-end font-medium text-right">
                Per Day Basic
              </TableHead>

              <TableHead className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center justify-end font-medium text-right">
                Amount
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((row, idx) => (
                <TableRow
                  key={row.employee_code}
                  className="flex h-[38px] hover:bg-muted/40 group items-center"
                >
                  <TableCell className="px-4 py-2 w-[50px] min-w-[50px] max-w-[50px] flex-shrink-0 sticky left-0 bg-card z-10 group-hover:bg-muted/50 flex items-center justify-center">
                    <Checkbox
                      checked={selectedCodes.has(row.employee_code)}
                      onCheckedChange={(checked) =>
                        handleSelectRow(row.employee_code, !!checked)
                      }
                    />
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[40px] min-w-[40px] max-w-[40px] flex-shrink-0 sticky left-[50px] bg-card z-10 group-hover:bg-muted/50 tabular-nums flex items-center">
                    {idx + 1}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 sticky left-[90px] bg-card z-10 group-hover:bg-muted/50 flex items-center">
                    <Link
                      to={`/employees/${row.employee_id}`}
                      prefetch="intent"
                      className="text-primary/80 hover:text-primary transition-all font-medium truncate block w-full"
                    >
                      {row.employee_code}
                    </Link>
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[180px] min-w-[180px] max-w-[180px] flex-shrink-0 sticky left-[200px] bg-card z-10 group-hover:bg-muted/50 flex items-center">
                    <Link
                      to={`/employees/${row.employee_id}`}
                      prefetch="intent"
                      className="text-primary/80 hover:text-primary transition-all font-medium truncate block w-full"
                    >
                      {row.name}
                    </Link>
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 flex items-center truncate">
                    {row.esic_number || "—"}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 flex items-center truncate">
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

                  {/* 12 Months present days values */}
                  {row.present_days_list.map((days, i) => (
                    <TableCell
                      key={i}
                      className="px-3 py-2 w-[70px] min-w-[70px] max-w-[70px] flex-shrink-0 flex items-center justify-center text-center tabular-nums"
                    >
                      {days}
                    </TableCell>
                  ))}

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center justify-center text-center tabular-nums">
                    {row.total_days}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[150px] min-w-[150px] max-w-[150px] flex-shrink-0 flex items-center justify-center text-center tabular-nums">
                    {row.no_of_leaves.toFixed(2)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[110px] min-w-[110px] max-w-[110px] flex-shrink-0 flex items-center justify-end text-right tabular-nums">
                    ₹{row.per_day_basic.toFixed(2)}
                  </TableCell>

                  <TableCell className="px-4 py-2 w-[120px] min-w-[120px] max-w-[120px] flex-shrink-0 flex items-center justify-end text-right tabular-nums">
                    ₹{row.amount_to_pay.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="flex">
                <TableCell
                  colSpan={25}
                  className="h-64 bg-background flex flex-col items-center justify-center text-center w-full"
                >
                  <div className="flex flex-col items-center gap-1">
                    <h2 className="text-lg font-semibold">No records found.</h2>
                    <p className="text-muted-foreground text-sm">
                      Try adjusting your filters or search term.
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
                colSpan={27}
                className="flex items-center justify-center gap-2 w-full"
              >
                <Spinner />
                <span className="text-xs text-[#606060]">Loading more...</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <LeaveEncashmentExportBar
        selectedCount={selectedCodes.size}
        totalDays={selectionSummary.totalDays}
        totalLeaves={selectionSummary.leaves}
        totalAmount={selectionSummary.amount}
        onExport={() => setIsExportDialogOpen(true)}
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
              const displayLabel = payoutMonths
                .map((m) => m.label.slice(0, 3).toLowerCase())
                .includes(col.key)
                ? `${col.label}-${shortYear}`
                : col.label;

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
                      {displayLabel}
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
              Export Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function LeaveEncashmentExportBar({
  selectedCount,
  totalDays,
  totalLeaves,
  totalAmount,
  onExport,
}: {
  selectedCount: number;
  totalDays: number;
  totalLeaves: number;
  totalAmount: number;
  onExport: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="z-40 fixed bottom-16 md:bottom-8 left-0 right-0 mx-auto h-14 w-max shadow-md rounded-full flex gap-10 justify-between items-center p-2 text-sm border dark:border-muted-foreground/30 bg-card text-card-foreground">
      <div className="ml-4 flex items-center space-x-1">
        <p className="font-semibold whitespace-nowrap">
          {selectedCount} Selected
        </p>
      </div>
      <div className="h-full flex items-center gap-2">
        <div className="h-full font-medium rounded-full hidden md:flex items-center px-6 border dark:border-muted-foreground/30 whitespace-nowrap gap-4">
          <span>
            Total Days:{" "}
            <span className="font-semibold text-foreground">{totalDays}</span>
          </span>
          <span className="w-px h-4 bg-border/20" />
          <span>
            Total Leaves:{" "}
            <span className="font-semibold text-foreground">
              {totalLeaves.toFixed(2)}
            </span>
          </span>
          <span className="w-px h-4 bg-border/20" />
          <span>
            Amount:{" "}
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
          Export Excel
        </Button>
      </div>
    </div>
  );
}
