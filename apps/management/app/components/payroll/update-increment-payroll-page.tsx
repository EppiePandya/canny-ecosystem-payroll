import { useState, useMemo, useEffect } from "react";
import { useNavigate, useFetcher, useParams } from "@remix-run/react";
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
import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";

const fmt = (val: number | undefined | null) => {
  if (val === undefined || val === null || Number.isNaN(val)) return "0";
  return Math.round(val).toLocaleString("en-IN");
};

function getNewCompAmount(emp: any, chName: string): number {
  const normCh = chName.trim().toLowerCase();
  const oldAmt = emp.oldFieldValuesMap?.[normCh] || 0;

  if (normCh === "pt" || normCh === "professional tax") {
    if (
      emp.breakdown &&
      emp.breakdown.ptAmount !== undefined &&
      emp.breakdown.ptAmount > 0
    ) {
      return emp.breakdown.ptAmount;
    }
    return oldAmt;
  }

  if (normCh === "esi" || normCh === "esic") {
    if (
      emp.breakdown &&
      emp.breakdown.esiEmployee !== undefined &&
      emp.breakdown.esiEmployee > 0
    ) {
      return emp.breakdown.esiEmployee;
    }
    return oldAmt;
  }

  if (normCh === "pf" || normCh === "epf") {
    if (
      emp.breakdown &&
      emp.breakdown.pfEmployee !== undefined &&
      emp.breakdown.pfEmployee > 0
    ) {
      return emp.breakdown.pfEmployee;
    }
    return oldAmt;
  }

  if (!emp.breakdown) return oldAmt;

  const foundEarning = emp.breakdown.earnings?.find(
    (e: any) =>
      e.name?.trim().toLowerCase() === normCh ||
      normCh.includes(e.name?.trim().toLowerCase()) ||
      e.name?.trim().toLowerCase().includes(normCh),
  );
  if (foundEarning) return foundEarning.amount;

  const foundDeduction = emp.breakdown.deductions?.find(
    (d: any) =>
      d.name?.trim().toLowerCase() === normCh ||
      normCh.includes(d.name?.trim().toLowerCase()) ||
      d.name?.trim().toLowerCase().includes(normCh),
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
    return (
      <span className="text-muted-foreground">{fmt(safeNew || safeOld)}</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="line-through text-muted-foreground/60 text-[11px]">
          {fmt(safeOld)}
        </span>
        <span className="text-muted-foreground/40 text-[10px]">→</span>
        <span className="font-bold text-foreground text-xs">
          {fmt(safeNew)}
        </span>
      </div>
      <span
        className={cn(
          "text-[10px] font-semibold px-1 py-0.2 rounded",
          diff > 0
            ? "text-emerald-400 bg-emerald-500/10"
            : "text-rose-400 bg-rose-500/10",
        )}
      >
        {diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
      </span>
    </div>
  );
}

interface UpdateIncrementPayrollPageProps {
  comparisonData: any[];
  componentHeaders: any[];
  siteList: string[];
  deptList: string[];
  error?: string | null;
}

export function UpdateIncrementPayrollPage({
  comparisonData = [],
  componentHeaders = [],
  siteList = [],
  deptList = [],
  error,
}: UpdateIncrementPayrollPageProps) {
  const navigate = useNavigate();
  const fetcher = useFetcher<any>();
  const { toast } = useToast();
  const { payrollId } = useParams();

  const [selectedSite, setSelectedSite] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [hideEmpty, setHideEmpty] = useState(true);

  const availableSites = useMemo(() => {
    const sites = new Set<string>(siteList);
    for (const emp of comparisonData) {
      if (emp.location && emp.location !== "N/A") sites.add(emp.location);
    }
    return Array.from(sites).sort();
  }, [comparisonData, siteList]);

  const availableDepts = useMemo(() => {
    const depts = new Set<string>(deptList);
    for (const emp of comparisonData) {
      if (emp.department && emp.department !== "N/A") depts.add(emp.department);
    }
    return Array.from(depts).sort();
  }, [comparisonData, deptList]);

  const filteredEmployees = useMemo(() => {
    return comparisonData.filter((emp: any) => {
      if (selectedSite !== "all" && emp.location !== selectedSite) return false;
      if (selectedDept !== "all" && emp.department !== selectedDept)
        return false;
      return true;
    });
  }, [comparisonData, selectedSite, selectedDept]);

  const visibleComponentHeaders = useMemo(() => {
    if (!hideEmpty) return componentHeaders;
    return componentHeaders.filter((ch: any) => {
      return filteredEmployees.some((emp: any) => {
        const oldAmt =
          emp.oldFieldValuesMap?.[ch.name.trim().toLowerCase()] || 0;
        const newAmt = getNewCompAmount(emp, ch.name);
        return oldAmt > 0 || newAmt > 0;
      });
    });
  }, [componentHeaders, filteredEmployees, hideEmpty]);

  const handleConfirm = () => {
    const updateList = comparisonData
      .filter((emp: any) => emp.hasDifference && emp.breakdown)
      .map((emp: any) => {
        const nb = emp.breakdown;
        const fields: any[] = [
          {
            name: "Basic",
            type: "earning",
            amount: emp.newBasic,
            consider_for_epf: true,
          },
        ];

        for (const e of nb.earnings || []) {
          if (e.name?.toLowerCase() !== "basic") {
            fields.push({
              name: e.name,
              type: "earning",
              amount: e.amount,
              consider_for_epf: false,
            });
          }
        }

        for (const d of nb.deductions || []) {
          fields.push({
            name: d.name,
            type: "deduction",
            amount: d.amount,
            consider_for_epf: false,
          });
        }

        const esiVal = emp.newEsi || nb.esiEmployee || 0;
        if (esiVal > 0) {
          fields.push({
            name: "ESIC",
            type: "deduction",
            amount: esiVal,
            consider_for_epf: false,
          });
        }

        const pfVal = emp.newPf || nb.pfEmployee || 0;
        if (pfVal > 0) {
          fields.push({
            name: "PF",
            type: "deduction",
            amount: pfVal,
            consider_for_epf: true,
          });
        }

        const ptVal = getNewCompAmount(emp, "PT");
        if (ptVal > 0) {
          fields.push({
            name: "PT",
            type: "deduction",
            amount: ptVal,
            consider_for_epf: false,
          });
        }

        for (const ch of visibleComponentHeaders) {
          const compName = ch.name;
          const compLower = compName.toLowerCase();
          if (["basic", "esic", "esi", "pf", "epf", "pt"].includes(compLower))
            continue;

          const val = getNewCompAmount(emp, compName);
          if (val > 0) {
            fields.push({
              name: compName,
              type: ch.type || "earning",
              amount: val,
              consider_for_epf: false,
            });
          }
        }

        return {
          salaryEntryId: emp.salaryEntryId,
          attendanceId: emp.attendanceId,
          newCtc: emp.monthlyCtc,
          fields,
        };
      });

    if (updateList.length === 0) {
      toast({
        title: "No Salary Increments Detected",
        description:
          "All employee payroll entries already match their master salary structures.",
        variant: "info",
      });
      return;
    }

    fetcher.submit(
      {
        intent: "sync-salary-increments",
        syncData: JSON.stringify(updateList),
      },
      { method: "POST" },
    );
  };

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.run_payroll);
      clearExactCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);

      toast({
        title: "Success",
        description: fetcher.data.message,
        variant: "success",
      });
      navigate(`/payroll/run-payroll/${payrollId}`, { replace: true });
    } else if (fetcher.data?.status === "error") {
      toast({
        title: "Error",
        description: fetcher.data.message || "Failed to update salary entries",
        variant: "destructive",
      });
    }
  }, [fetcher.data, navigate, payrollId, toast]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive font-semibold mb-4">{error}</p>
        <Button onClick={() => navigate(`/payroll/run-payroll/${payrollId}`)}>
          Back to Payroll
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-background text-foreground">
      {/* Top Header matching Increment preview design */}
      <div className="flex-none px-6 py-4 border-b border-border/40 bg-background flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded border border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
            <Icon name="check" className="h-3.5 w-3.5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Update Increment Salary
            </h1>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              COMPONENTS - SALARIES / MASTER SALARY SYNC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="h-9 px-3 py-1 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px]"
          >
            <option value="all">Select Site</option>
            {availableSites.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="h-9 px-3 py-1 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[160px]"
          >
            <option value="all">Select Department</option>
            {availableDepts.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary h-4 w-4 bg-background"
            />
            Hide empty columns
          </label>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-input"
            onClick={() => navigate(`/payroll/run-payroll/${payrollId}`)}
          >
            <Icon name="plus" className="h-4 w-4" />
          </Button>

          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || comparisonData.length === 0}
            className="h-9 px-6 bg-primary text-primary-foreground font-semibold text-xs shadow-sm hover:bg-primary/90"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto p-4 [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/20">
        <div className="rounded-md border border-border/40 bg-card overflow-x-auto min-w-max">
          <Table className="w-full whitespace-nowrap">
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="w-12 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  SL
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  NAME
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  EMPLOYEE CODE
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  MONTHLY CTC
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  BASIC
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  BONUS
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  ESI
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3">
                  PF
                </TableHead>
                {visibleComponentHeaders.map((ch: any) => (
                  <TableHead
                    key={ch.id}
                    className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-3"
                  >
                    {ch.name.toUpperCase()}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8 + visibleComponentHeaders.length}
                    className="h-32 text-center text-muted-foreground text-xs"
                  >
                    No employee entries found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((emp: any, index: number) => {
                  return (
                    <TableRow
                      key={emp.id || index}
                      className="border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      <TableCell className="text-center font-mono text-xs text-muted-foreground py-2.5">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-foreground uppercase py-2.5">
                        {emp.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground uppercase py-2.5">
                        {emp.employee_code}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs py-2.5">
                        <IncrementValueDisplay
                          oldVal={emp.oldCtc}
                          newVal={emp.monthlyCtc}
                        />
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs py-2.5">
                        <IncrementValueDisplay
                          oldVal={emp.oldBasic}
                          newVal={emp.newBasic}
                        />
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs py-2.5">
                        <IncrementValueDisplay
                          oldVal={emp.oldBonus}
                          newVal={emp.newBonus}
                        />
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs py-2.5">
                        <IncrementValueDisplay
                          oldVal={emp.oldEsi}
                          newVal={emp.newEsi}
                        />
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs py-2.5">
                        <IncrementValueDisplay
                          oldVal={emp.oldPf}
                          newVal={emp.newPf}
                        />
                      </TableCell>

                      {visibleComponentHeaders.map((ch: any) => {
                        const oldCompAmt =
                          emp.oldFieldValuesMap?.[
                            ch.name.trim().toLowerCase()
                          ] || 0;
                        const newCompAmt = getNewCompAmount(emp, ch.name);

                        return (
                          <TableCell
                            key={ch.id}
                            className="text-right font-mono text-xs py-2.5"
                          >
                            <IncrementValueDisplay
                              oldVal={oldCompAmt}
                              newVal={newCompAmt}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
