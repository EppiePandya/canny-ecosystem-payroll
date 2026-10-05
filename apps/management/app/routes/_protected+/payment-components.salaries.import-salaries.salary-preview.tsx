import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  json,
  useLoaderData,
  useLocation,
  useNavigate,
  useFetcher,
  useSearchParams,
} from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { calculateSalaryBreakdown } from "@canny_ecosystem/utils";
import { Button } from "@canny_ecosystem/ui/button";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import {
  getEmployeesWithSalaryByEmployeeCodes,
  getSalaryComponentsDetails,
} from "@canny_ecosystem/supabase/queries/salary-import";
import { useRequestInfo } from "@/utils/request-info";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import { ScrollArea } from "@canny_ecosystem/ui/scroll-area";
import { Input } from "@canny_ecosystem/ui/input";
import { Label } from "@canny_ecosystem/ui/label";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    },
  });
}

const getCellValue = (cell: any) => {
  if (cell && typeof cell === "object") {
    if (
      "v" in cell &&
      cell.v !== undefined &&
      cell.v !== null &&
      cell.v !== 0 &&
      cell.v !== ""
    ) {
      return cell.v;
    }
    if ("w" in cell && cell.w) {
      const clean = String(cell.w).replace(/[^0-9.]/g, "");
      const n = Number.parseFloat(clean);
      if (!Number.isNaN(n)) return n;
    }
    return cell.v ?? 0;
  }
  return cell;
};

const getCellFormula = (cell: any) => {
  if (cell && typeof cell === "object" && "f" in cell) return cell.f;
  if (typeof cell === "string" && cell.startsWith("=")) return cell;
  return null;
};

const excelColumnToIndex = (col: string) => {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.toUpperCase().charCodeAt(i) - 64);
  }
  return index - 1;
};

const evaluateSimpleFormula = (formula: string, row: any[]) => {
  try {
    const formulaStr = formula.startsWith("=") ? formula.substring(1) : formula;

    const cellRegex = /\$?([A-Z]+)\$?(\d+)/g;

    const evalStr = formulaStr.replace(cellRegex, (match, colStr) => {
      const colIdx = excelColumnToIndex(colStr);
      if (colIdx >= 0 && colIdx < row.length) {
        const val = getCellValue(row[colIdx]);
        return String(Number(val) || 0);
      }
      return "0";
    });

    if (/^[0-9.+\-*/() ]+$/.test(evalStr)) {
      return new Function(`return ${evalStr}`)();
    }
  } catch (e) {
    console.error("Formula evaluation failed:", formula, e);
  }
  return 0;
};

function resolveEmployeeSalary(employee: any, effectiveDateStr?: string) {
  const referenceDate = effectiveDateStr
    ? new Date(effectiveDateStr)
    : new Date();
  const assignments = employee.employee_salary_assignment || [];

  const validAssignments = assignments
    .filter(
      (a: any) =>
        !a.effective_date || new Date(a.effective_date) <= referenceDate,
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    );

  let assignment = validAssignments[0];
  if (!assignment) {
    const futureAssignments = assignments
      .filter(
        (a: any) =>
          a.effective_date && new Date(a.effective_date) > referenceDate,
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.effective_date).getTime() -
          new Date(b.effective_date).getTime(),
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
  let templateName: string | null = null;

  if (assignment.use_payment_template && assignment.payment_templates) {
    templateName = assignment.payment_templates.name;
    const versions =
      assignment.payment_templates.payment_template_versions || [];
    const validVersions = versions
      .filter(
        (v: any) =>
          !v.effective_date || new Date(v.effective_date) <= referenceDate,
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.effective_date).getTime() -
          new Date(a.effective_date).getTime(),
      );
    let latestVersion = validVersions[0];
    if (!latestVersion) {
      const futureVersions = versions
        .filter(
          (v: any) =>
            v.effective_date && new Date(v.effective_date) > referenceDate,
        )
        .sort(
          (a: any, b: any) =>
            new Date(a.effective_date).getTime() -
            new Date(b.effective_date).getTime(),
        );
      latestVersion = futureVersions[0];
    }

    if (latestVersion) {
      monthlyCtc = Number(latestVersion.monthly_ctc || 0);
      basicPercent = Number(latestVersion.basic_percent || 0);
      basicAmount = Number(latestVersion.basic_amount || 0);
      isProRata = !!latestVersion.is_pro_rata;
      resolvedComponents = latestVersion.payment_template_components || [];
      const ts = latestVersion.payment_statutory_components;
      if (ts) {
        resolvedStatutory = {
          pf: ts.pf,
          esi: ts.esi,
          pt: ts.pt,
          bonus: ts.bonus,
          lwf: ts.lwf,
        };
      }
    }
  } else {
    resolvedComponents = assignment.employee_salary_components || [];
    const esc = assignment.employee_salary_statutory_components;
    if (esc) {
      resolvedStatutory = {
        pf: esc.pf,
        esi: esc.esi,
        pt: esc.pt,
        bonus: esc.bonus,
        lwf: esc.lwf,
      };
    }
  }

  return {
    assignmentId: assignment.id,
    effectiveDate: assignment.effective_date,
    monthlyCtc,
    basicPercent,
    basicAmount,
    isProRata,
    isTemplate: !!assignment.use_payment_template,
    templateName,
    resolvedComponents,
    resolvedStatutory,
  };
}

function isSameMonth(dateStr1?: string, dateStr2?: string) {
  if (!dateStr1 || !dateStr2) return false;
  try {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    return (
      d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()
    );
  } catch (e) {
    return false;
  }
}

function parseImportedValue(value: any, isMonthly: boolean) {
  const formula = getCellFormula(value);
  const v = getCellValue(value);

  if (!formula || formula.toUpperCase().includes("IF(")) {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return 0;

    const trimmed = v.trim();
    const n = Number(trimmed.replace(/[^0-9.]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  const formulaStr = formula.substring(1).replace(/\s+/g, "").toUpperCase();

  let result = 0;

  if (isMonthly) {
    const match = formulaStr.match(/(\d+(?:\.\d+)?)\/(\d+)/);
    if (match) {
      result = Number(match[1]);
    } else {
      const numbers = formulaStr.match(/\d+(?:\.\d+)?/g);
      if (numbers) {
        result = Math.max(...numbers.map(Number));
      }
    }
  } else {
    const divMatch = formulaStr.match(/(\d+(?:\.\d+)?)\/(\d+)/);
    if (divMatch) {
      const num = Number(divMatch[1]);
      const den = Number(divMatch[2]);
      result = den !== 0 ? num / den : num;
    } else {
      const multMatch =
        formulaStr.match(/(\d+(?:\.\d+)?)(?=\*\d+\*[A-Z]+\d+)/) ||
        formulaStr.match(/(\d+(?:\.\d+)?)\*[A-Z]+\d+/) ||
        formulaStr.match(/[A-Z]+\*(\d+(?:\.\d+)?)/);
      if (multMatch) {
        result = Number(multMatch[1]);
      } else {
        const numbers = formulaStr.match(/\d+(?:\.\d+)?/g);
        if (numbers) {
          const rate = numbers.map(Number).find((n) => n > 100);
          result = rate || Number(numbers[0]);
        }
      }
    }
  }

  return result;
}

type ProcessedEmployee = {
  id: string;
  employee_code: string;
  name: string;
  hasSalary: boolean;
  notFoundInDb?: boolean;
  salary: ReturnType<typeof resolveEmployeeSalary>;
  monthlyCtc: number;
  basicPercentage: number;
  breakdown: ReturnType<typeof calculateSalaryBreakdown> | null;
  location: string | null;
  resolvedComponents: any[];
  resolvedStatutory: any;
  excelNetPayable?: number;
  presentDaysBreakdown?: ReturnType<typeof calculateSalaryBreakdown> | null;
  excelPresentDays?: number;
};

function EmployeeSalaryRow({
  emp,
  mappedComponentHeaders,
  mappedStatutoryHeaders,
  tolerance,
  onRemove,
}: {
  emp: ProcessedEmployee;
  mappedComponentHeaders: any[];
  mappedStatutoryHeaders: any[];
  tolerance: number;
  onRemove: (code: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/40 group",
          expanded && "bg-primary/5",
          !emp.hasSalary && !emp.notFoundInDb && "opacity-60",
          emp.notFoundInDb &&
          "bg-destructive/5 hover:bg-destructive/10 border-destructive/20",
        )}
        onClick={() =>
          (emp.hasSalary || emp.breakdown) && setExpanded((v) => !v)
        }
      >
        <TableCell className="w-8 text-center">
          {(emp.hasSalary || !!emp.breakdown) && (
            <Icon
              name={expanded ? "chevron-up" : "chevron-down"}
              className="h-3.5 w-3.5 text-muted-foreground"
            />
          )}
        </TableCell>

        <TableCell
          className={cn(
            "font-mono text-[11px] font-bold",
            emp.notFoundInDb ? "text-destructive" : "text-primary",
          )}
        >
          {emp.employee_code}
        </TableCell>

        <TableCell
          className={cn(
            "font-medium text-sm",
            emp.notFoundInDb && "text-destructive/80 italic",
          )}
        >
          {emp.name}
          {emp.notFoundInDb && (
            <span className="ml-2 text-[9px] font-normal opacity-60">
              (Not in DB)
            </span>
          )}
        </TableCell>

        <TableCell>
          {emp.hasSalary && emp.salary ? (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                emp.salary.isTemplate
                  ? "border-blue-200 text-blue-700 bg-blue-50"
                  : "border-purple-200 text-purple-700 bg-purple-50",
              )}
            >
              {emp.salary.isTemplate
                ? emp.salary.templateName || "Template"
                : "Custom"}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                emp.notFoundInDb
                  ? "border-destructive text-destructive bg-destructive/10 font-bold"
                  : "border-destructive/30 text-destructive bg-destructive/5",
              )}
            >
              {emp.notFoundInDb ? "NEW / NO RECORD" : "No Salary"}
            </Badge>
          )}
        </TableCell>

        <TableCell className="text-right font-mono text-xs font-semibold">
          <div className="flex items-center justify-end gap-1.5">
            <div className="flex flex-col items-end gap-0.5">
              <span>₹{fmt(emp.monthlyCtc)}</span>
              {emp.excelPresentDays !== undefined && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-auto bg-amber-50 text-amber-700 border-amber-200 font-bold"
                >
                  {emp.excelPresentDays} Days
                </Badge>
              )}
            </div>
          </div>
        </TableCell>

        {mappedStatutoryHeaders.length > 0 ||
          mappedComponentHeaders.length > 0 ? (
          <>
            <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
              {Math.round(emp.basicPercentage * 100000) / 100000}%
            </TableCell>

            <TableCell className="text-right font-mono text-[10px]">
              <div className="flex flex-col items-end">
                <span>
                  {emp.breakdown ? `₹${fmt(emp.breakdown.basicAmount)}` : "—"}
                </span>
                {emp.presentDaysBreakdown && (
                  <span className="text-[8px] text-muted-foreground/60 font-normal leading-none mt-0.5">
                    ₹{fmt(emp.presentDaysBreakdown.basicAmount)}
                  </span>
                )}
              </div>
            </TableCell>

            {mappedComponentHeaders
              .filter((ch) => ch.type?.toLowerCase().includes("earning"))
              .map((ch) => {
                const comp = emp.breakdown?.earnings.find(
                  (e) => e.id === ch.id,
                );
                return (
                  <TableCell
                    key={ch.id}
                    className="text-right font-mono text-[10px]"
                  >
                    <div className="flex flex-col items-end">
                      <span>{comp ? `₹${fmt(comp.amount)}` : "—"}</span>
                      {emp.presentDaysBreakdown && (
                        <span className="text-[8px] text-muted-foreground/60 font-normal leading-none mt-0.5">
                          ₹
                          {fmt(
                            emp.presentDaysBreakdown.earnings.find(
                              (e) => e.id === ch.id,
                            )?.amount || 0,
                          )}
                        </span>
                      )}
                    </div>
                  </TableCell>
                );
              })}

            {mappedStatutoryHeaders
              .filter((sh) => sh.id === "bonus")
              .map((sh) => {
                const bonus = emp.breakdown?.earnings.find((e) =>
                  e.name.toUpperCase().includes("BONUS"),
                );
                return (
                  <TableCell
                    key={sh.id}
                    className="text-right font-mono text-[10px]"
                  >
                    <div className="flex flex-col items-end">
                      <span>{bonus ? `₹${fmt(bonus.amount)}` : "—"}</span>
                      {emp.presentDaysBreakdown && (
                        <span className="text-[8px] text-muted-foreground/60 font-normal leading-none mt-0.5">
                          ₹
                          {fmt(
                            emp.presentDaysBreakdown.earnings.find((e) =>
                              e.name.toUpperCase().includes("BONUS"),
                            )?.amount || 0,
                          )}
                        </span>
                      )}
                    </div>
                  </TableCell>
                );
              })}

            <TableCell className="text-right font-mono text-[10px] text-emerald-600 font-semibold bg-emerald-50/10">
              <div className="flex flex-col items-end">
                <span>
                  {emp.breakdown ? `₹${fmt(emp.breakdown.grossAmount)}` : "—"}
                </span>
                {emp.presentDaysBreakdown && (
                  <span className="text-[9px] text-muted-foreground font-normal border-t border-muted-foreground/10 mt-0.5 pt-0.5">
                    ₹{fmt(emp.presentDaysBreakdown.grossAmount)}
                  </span>
                )}
              </div>
            </TableCell>

            {mappedStatutoryHeaders
              .filter((sh) => sh.id !== "bonus")
              .map((sh) => {
                let val = 0;
                let exists = false;
                if (emp.breakdown) {
                  const name = sh.id.toUpperCase();
                  const d = emp.breakdown.deductions.find((d) =>
                    d.name.toUpperCase().includes(name),
                  );
                  if (d) {
                    val = d.amount;
                    exists = true;
                  }
                }
                return (
                  <TableCell
                    key={sh.id}
                    className="text-right font-mono text-[10px]"
                  >
                    <div className="flex flex-col items-end">
                      <span>{exists ? `₹${fmt(val)}` : "—"}</span>
                      {emp.presentDaysBreakdown && (
                        <span className="text-[8px] text-muted-foreground/60 font-normal leading-none mt-0.5">
                          ₹
                          {fmt(
                            emp.presentDaysBreakdown.deductions.find((d) =>
                              d.name
                                .toUpperCase()
                                .includes(sh.id.toUpperCase()),
                            )?.amount || 0,
                          )}
                        </span>
                      )}
                    </div>
                  </TableCell>
                );
              })}

            {mappedComponentHeaders
              .filter((ch) => ch.type?.toLowerCase().includes("deduction"))
              .map((ch) => {
                const comp = emp.breakdown?.deductions.find(
                  (d) => d.id === ch.id,
                );
                return (
                  <TableCell
                    key={ch.id}
                    className="text-right font-mono text-[10px]"
                  >
                    <div className="flex flex-col items-end">
                      <span>{comp ? `₹${fmt(comp.amount)}` : "—"}</span>
                      {emp.presentDaysBreakdown && (
                        <span className="text-[8px] text-muted-foreground/60 font-normal leading-none mt-0.5">
                          ₹
                          {fmt(
                            emp.presentDaysBreakdown.deductions.find(
                              (d) => d.id === ch.id,
                            )?.amount || 0,
                          )}
                        </span>
                      )}
                    </div>
                  </TableCell>
                );
              })}
          </>
        ) : (
          <>
            <TableCell className="text-right font-mono text-xs text-emerald-600">
              <div className="flex flex-col items-end">
                <span>
                  {emp.breakdown ? `₹${fmt(emp.breakdown.grossAmount)}` : "—"}
                </span>
                {emp.presentDaysBreakdown && (
                  <span className="text-[9px] text-muted-foreground font-normal border-t border-muted-foreground/10 mt-0.5 pt-0.5">
                    ₹{fmt(emp.presentDaysBreakdown.grossAmount)}
                  </span>
                )}
              </div>
            </TableCell>

            <TableCell className="text-right font-mono text-xs text-destructive">
              <div className="flex flex-col items-end">
                <span>
                  {emp.breakdown
                    ? `₹${fmt(emp.breakdown.deductionsTotal)}`
                    : "—"}
                </span>
                {emp.presentDaysBreakdown && (
                  <span className="text-[9px] text-muted-foreground font-normal border-t border-muted-foreground/10 mt-0.5 pt-0.5">
                    ₹{fmt(emp.presentDaysBreakdown.deductionsTotal)}
                  </span>
                )}
              </div>
            </TableCell>
          </>
        )}

        <TableCell className="text-right font-mono text-sm font-bold text-primary px-4">
          <div className="flex flex-col items-end">
            <span
              className={cn(
                emp.excelNetPayable !== undefined &&
                !emp.presentDaysBreakdown &&
                emp.breakdown &&
                Math.abs(emp.breakdown.netAmount - emp.excelNetPayable) >
                tolerance &&
                "text-amber-600",
              )}
            >
              {emp.breakdown ? `₹${fmt(emp.breakdown.netAmount)}` : "—"}
            </span>
            {emp.presentDaysBreakdown && (
              <span
                className={cn(
                  "text-[10px] text-primary/70 font-semibold border-t border-primary/10 mt-0.5 pt-0.5",
                  emp.excelNetPayable !== undefined &&
                  Math.abs(
                    emp.presentDaysBreakdown.netAmount - emp.excelNetPayable,
                  ) > tolerance &&
                  "text-amber-600",
                )}
              >
                ₹{fmt(emp.presentDaysBreakdown.netAmount)}
              </span>
            )}
            {emp.excelNetPayable !== undefined &&
              (emp.presentDaysBreakdown
                ? Math.abs(
                  emp.presentDaysBreakdown.netAmount - emp.excelNetPayable,
                ) > tolerance
                : emp.breakdown &&
                Math.abs(emp.breakdown.netAmount - emp.excelNetPayable) >
                tolerance) && (
                <span className="text-[9px] text-destructive font-bold flex items-center gap-0.5">
                  <Icon name="info" className="h-2.5 w-2.5" />
                  Excel: ₹{fmt(emp.excelNetPayable)}
                </span>
              )}
          </div>
        </TableCell>
        <TableCell className="w-10 px-2 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(emp.employee_code);
            }}
            title="Remove employee from import"
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
          </Button>
        </TableCell>
      </TableRow>

      {expanded && emp.breakdown && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={50} className="p-0">
            <div className="px-6 py-4">
              <SalaryBreakdownContent breakdown={emp.breakdown} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function SalaryBreakdownContent({ breakdown }: { breakdown: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border rounded-md overflow-hidden text-xs bg-background">
          <div className="bg-emerald-50 border-b px-3 py-1.5 font-bold text-emerald-700 uppercase tracking-wider text-[10px]">
            Earnings
          </div>
          <table className="w-full">
            <tbody>
              {breakdown.earnings.map((e: any) => (
                <tr
                  key={e.id}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{e.name}</div>
                    {e.rule && (
                      <div className="text-[10px] text-muted-foreground">
                        {e.rule}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-emerald-700 font-semibold">
                    {e.amount.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
              <tr className="bg-emerald-50/50">
                <td className="px-3 py-1.5 font-bold text-emerald-700">
                  Gross Total
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">
                  {breakdown.grossAmount.toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-md overflow-hidden text-xs bg-background">
          <div className="bg-red-50 border-b px-3 py-1.5 font-bold text-red-700 uppercase tracking-wider text-[10px]">
            Deductions
          </div>
          <table className="w-full">
            <tbody>
              {breakdown.deductions.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-3 py-3 text-center text-muted-foreground italic"
                  >
                    No deductions
                  </td>
                </tr>
              ) : (
                breakdown.deductions.map((d: any) => (
                  <tr
                    key={d.id}
                    className="border-b last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{d.name}</div>
                      {d.rule && (
                        <div className="text-[10px] text-muted-foreground">
                          {d.rule}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-destructive font-semibold">
                      {d.amount.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-red-50/50">
                <td className="px-3 py-1.5 font-bold text-destructive">
                  Total Deductions
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-destructive">
                  {breakdown.deductionsTotal.toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-md overflow-hidden text-xs bg-background">
          <div className="bg-amber-50 border-b px-3 py-1.5 font-bold text-amber-700 uppercase tracking-wider text-[10px]">
            Employer Contribution
          </div>
          <table className="w-full">
            <tbody>
              {[
                {
                  label: "Employer PF (13%)",
                  value: breakdown.employerContribution.totalPfLiability,
                },
                {
                  label: "↳ Pension (EPS)",
                  value: breakdown.employerContribution.eps,
                },
                {
                  label: "↳ EPF Share",
                  value: breakdown.employerContribution.employerEpf,
                },
                {
                  label: "↳ EDLI (0.5%)",
                  value: breakdown.employerContribution.edli,
                },
                {
                  label: "↳ Admin Charges (0.5%)",
                  value: breakdown.employerContribution.admin,
                },
                {
                  label: "Employer ESIC (3.25%)",
                  value: breakdown.employerContribution.esi,
                },
              ].map((item) => (
                <tr
                  key={item.label}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-1.5 font-medium">{item.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                    {item.value.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
              <tr className="bg-amber-50/50">
                <td className="px-3 py-1.5 font-bold text-amber-700">
                  Total Contribution
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-amber-700">
                  {breakdown.employerContribution.total.toLocaleString(
                    "en-IN",
                    { maximumFractionDigits: 2 },
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t pt-2 mt-1">
        <Icon name="rupees" className="h-3 w-3 flex-shrink-0" />
        <span className="capitalize italic">
          {breakdown.netAmountWords} rupees only
        </span>
      </div>
    </div>
  );
}

function FormulaPicker({
  formula,
  currentValue,
  onPick,
}: {
  formula: string;
  currentValue: number;
  onPick: (val: number) => void;
}) {
  if (!formula) return null;

  const parts = formula.split(/(\d+(?:\.\d+)?)/);

  return (
    <div className="flex flex-wrap items-center gap-0.5 font-mono text-[9px] leading-tight">
      {parts.map((part, i) => {
        const isNumber = /^\d+(?:\.\d+)?$/.test(part);
        if (isNumber) {
          const val = Number(part);
          const isSelected = Math.abs(val - currentValue) < 0.01;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(val)}
              className={cn(
                "px-1 py-0 rounded transition-all duration-200 border",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm scale-110 z-10"
                  : "bg-background text-muted-foreground border-muted-foreground/20 hover:border-primary/50 hover:text-primary",
              )}
              title={`Click to pick ${val}`}
            >
              {part}
            </button>
          );
        }
        return (
          <span key={i} className="opacity-40 px-0.5">
            {part}
          </span>
        );
      })}
    </div>
  );
}

function GlobalDebugDialog({
  importData,
  processedEmployees,
  manualOverrides,
  onOverrideChange,
  onClearOverrides,
}: any) {
  const [open, setOpen] = useState(false);
  const hasOverrides = Object.keys(manualOverrides).length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-[10px] gap-1.5 border-dashed transition-colors",
            hasOverrides
              ? "border-primary bg-primary/5 text-primary"
              : "hover:bg-primary/5 hover:text-primary",
          )}
        >
          <Icon name="code" className="h-3.5 w-3.5" />
          Debug Data
          {hasOverrides && (
            <Badge className="h-4 min-w-4 px-1 rounded-full text-[8px] ml-1">
              {Object.keys(manualOverrides).length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-primary/20 shadow-2xl">
        <DialogHeader className="p-6 pb-2 flex-none bg-muted/5">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <div className="p-1.5 bg-primary/10 rounded-md">
              <Icon name="code" className="h-4 w-4" />
            </div>
            Import Debug Data
          </DialogTitle>
          <DialogDescription className="text-xs">
            Inspect the mappings and pro-rata parsing results for each employee.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full px-6 pb-6">
            <div className="space-y-8 pt-2">
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Icon
                    name="table"
                    className="h-3.5 w-3.5 text-muted-foreground"
                  />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                    Mapping Configuration
                  </h3>
                </div>
                <div className="relative group">
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Badge
                      variant="outline"
                      className="bg-background/80 backdrop-blur-sm text-[9px] px-1.5 py-0 border-primary/20"
                    >
                      JSON
                    </Badge>
                  </div>
                  <pre className="p-4 bg-muted/40 rounded-lg text-[10px] font-mono overflow-auto border border-muted-foreground/10 leading-relaxed text-muted-foreground">
                    {JSON.stringify(importData?.mappings, null, 2)}
                  </pre>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Icon
                    name="magic"
                    className="h-3.5 w-3.5 text-muted-foreground"
                  />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                    Matched Pro-Rata Values
                  </h3>
                </div>
                <div className="border rounded-lg overflow-hidden shadow-sm bg-background">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-[9px] font-black uppercase tracking-tight py-2 h-auto px-4">
                          Emp Code
                        </TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-tight py-2 h-auto">
                          Basic Formula (Excel)
                        </TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-tight py-2 h-auto">
                          Parsed Result
                        </TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-tight py-2 h-auto">
                          Net Pay (Excel)
                        </TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-tight py-2 h-auto">
                          Component Mappings
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedEmployees.slice(0, 50).map((emp: any) => {
                        const excelRow = importData?.rows.find(
                          (r: any) =>
                            String(
                              getCellValue(r[importData.empCodeColIdx]),
                            ).trim() === emp.employee_code?.trim(),
                        );
                        if (!excelRow) return null;

                        const m = importData.mappings;
                        const val1 =
                          m.basic.colIdx !== null
                            ? excelRow[m.basic.colIdx]
                            : null;
                        const val2 =
                          (m.basic as any).colIdx2 !== null
                            ? excelRow[(m.basic as any).colIdx2]
                            : null;
                        const mValue =
                          manualOverrides[`${emp.employee_code}-basic`];
                        const parsed1 =
                          val1 !== null
                            ? parseImportedValue(val1, m.basic.isMonthly)
                            : 0;
                        const parsed2 =
                          (m as any).colIdx2 !== null
                            ? val2 !== null
                              ? parseImportedValue(val2, m.basic.isMonthly)
                              : 0
                            : 0;
                        const totalParsed =
                          mValue !== undefined ? mValue : parsed1 + parsed2;

                        return (
                          <TableRow
                            key={emp.id}
                            className="text-[10px] group transition-colors hover:bg-muted/20 border-b"
                          >
                            <TableCell className="font-mono font-black text-primary px-4 py-2.5">
                              {emp.employee_code}
                            </TableCell>
                            <TableCell className="max-w-[200px] py-2.5">
                              {val1 || val2 ? (
                                <div className="flex flex-col gap-2">
                                  {val1 && (
                                    <div className="flex flex-col gap-1">
                                      <div className="text-[8px] uppercase text-muted-foreground/60 font-bold tracking-tighter">
                                        Value 1
                                      </div>
                                      <div className="px-2 py-1.5 bg-amber-50/50 rounded border border-amber-200/30">
                                        <FormulaPicker
                                          formula={
                                            getCellFormula(val1) ||
                                            String(getCellValue(val1))
                                          }
                                          currentValue={
                                            manualOverrides[
                                            `${emp.employee_code}-basic`
                                            ] ?? parsed1
                                          }
                                          onPick={(v) =>
                                            onOverrideChange(
                                              emp.employee_code,
                                              "basic",
                                              v,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {val2 && (
                                    <div className="flex flex-col gap-1">
                                      <div className="text-[8px] uppercase text-muted-foreground/60 font-bold tracking-tighter">
                                        Value 2
                                      </div>
                                      <div className="px-2 py-1.5 bg-blue-50/50 rounded border border-blue-200/30">
                                        <FormulaPicker
                                          formula={
                                            getCellFormula(val2) ||
                                            String(getCellValue(val2))
                                          }
                                          currentValue={
                                            manualOverrides[
                                            `${emp.employee_code}-basic`
                                            ] ?? parsed2
                                          }
                                          onPick={(v) =>
                                            onOverrideChange(
                                              emp.employee_code,
                                              "basic",
                                              v,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40 italic">
                                  Not Mapped
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              {(val1 || val2) && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-black rounded-full border border-emerald-200/50 font-mono">
                                  {totalParsed.toLocaleString("en-IN", {
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 font-mono">
                              {emp.excelNetPayable !== undefined ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-emerald-700 font-black">
                                    ₹
                                    {emp.excelNetPayable.toLocaleString(
                                      "en-IN",
                                    )}
                                  </span>
                                  {m.netPayableColIdx !== null &&
                                    getCellFormula(
                                      excelRow[m.netPayableColIdx],
                                    ) && (
                                      <code className="text-[8px] text-muted-foreground opacity-60 truncate max-w-[120px]">
                                        {getCellFormula(
                                          excelRow[m.netPayableColIdx],
                                        )}
                                      </code>
                                    )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40 italic">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 pr-4">
                              <div className="space-y-1.5">
                                {m.components
                                  .filter((c: any) => c.colIdx !== null)
                                  .map((c: any, i: number) => {
                                    const val = excelRow[c.colIdx];
                                    const parsed = parseImportedValue(
                                      val,
                                      c.isMonthly,
                                    );
                                    return (
                                      <div
                                        key={i}
                                        className="flex flex-col gap-1.5 p-2 rounded bg-muted/30 border border-muted-foreground/5"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[8px] font-bold text-muted-foreground uppercase opacity-60">
                                            ID: ...{c.dbId.slice(-6)}
                                          </span>
                                          {c.isMonthly && (
                                            <Badge
                                              variant="outline"
                                              className="text-[7px] px-1 h-3 border-primary/20 text-primary"
                                            >
                                              Monthly
                                            </Badge>
                                          )}
                                        </div>
                                        <FormulaPicker
                                          formula={
                                            getCellFormula(val) ||
                                            String(getCellValue(val))
                                          }
                                          currentValue={
                                            manualOverrides[
                                            `${emp.employee_code}-${c.dbId}`
                                            ] ?? parsed
                                          }
                                          onPick={(v) =>
                                            onOverrideChange(
                                              emp.employee_code,
                                              c.dbId,
                                              v,
                                            )
                                          }
                                        />
                                        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-muted-foreground/5">
                                          <span className="text-[8px] text-muted-foreground uppercase font-medium">
                                            Resolved:
                                          </span>
                                          <span className="font-black text-emerald-600 font-mono">
                                            {manualOverrides[
                                              `${emp.employee_code}-${c.dbId}`
                                            ] ?? parsed}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                {m.components.filter(
                                  (c: any) => c.colIdx !== null,
                                ).length === 0 && (
                                    <span className="text-muted-foreground/40 italic">
                                      No components
                                    </span>
                                  )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {processedEmployees.length > 50 && (
                    <div className="p-3 bg-muted/10 border-t flex items-center justify-center gap-2">
                      <Icon
                        name="info"
                        className="h-3 w-3 text-muted-foreground"
                      />
                      <span className="text-[10px] text-muted-foreground italic">
                        Displaying first 50 records out of{" "}
                        {processedEmployees.length}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>

        {/* Action Bar */}
        <div className="p-4 border-t bg-muted/10 flex items-center justify-between flex-none">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Icon name="info" className="h-3.5 w-3.5" />
            <span>
              Click on numeric values in formulas to manually pick them for
              calculations.
            </span>
          </div>
          <div className="flex items-center gap-3">
            {hasOverrides && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearOverrides}
                className="text-[10px] h-8 text-destructive hover:text-destructive hover:bg-destructive/5"
              >
                Reset Overrides
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 px-6 gap-2"
              onClick={() => setOpen(false)}
            >
              <Icon name="check" className="h-3.5 w-3.5" />
              Submit & Update Table
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IncrementValueDisplay({
  oldVal,
  newVal,
}: {
  oldVal?: number | null;
  newVal?: number | null;
}) {
  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  if (newVal === undefined || newVal === null || Number.isNaN(newVal)) {
    return <span className="text-muted-foreground/30">—</span>;
  }

  if (
    oldVal !== undefined &&
    oldVal !== null &&
    oldVal > 0 &&
    Math.abs(newVal - oldVal) >= 0.01
  ) {
    const diff = Number((newVal - oldVal).toFixed(2));
    return (
      <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
        <span className="text-muted-foreground/50 font-normal text-xs line-through">
          {fmt(oldVal)}
        </span>
        <span className="text-muted-foreground/40 text-[10px]">→</span>
        <span className="font-bold text-foreground text-xs">
          {fmt(newVal)}
        </span>
        {diff !== 0 && (
          <span
            className={cn(
              "font-bold text-[11px] px-1 py-0.2 rounded ml-0.5",
              diff > 0
                ? "text-emerald-400 bg-emerald-950/60 border border-emerald-800/40"
                : "text-rose-400 bg-rose-950/60 border border-rose-800/40",
            )}
          >
            {diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
          </span>
        )}
      </div>
    );
  }

  if (
    oldVal !== undefined &&
    oldVal !== null &&
    oldVal > 0 &&
    Math.abs(newVal - oldVal) < 1
  ) {
    return <span className="font-normal text-muted-foreground/80 text-xs">{fmt(newVal)}</span>;
  }

  return (
    <div className="inline-flex items-center justify-end gap-1.5">
      <span className="font-bold text-foreground text-xs">{fmt(newVal)}</span>
      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/50 px-1 py-0.2 rounded border border-emerald-800/30">
        New
      </span>
    </div>
  );
}

function IncrementPreviewView({
  processedEmployees,
  mappedComponentHeaders,
  mappedStatutoryHeaders,
  onConfirm,
  isSubmitting,
  onBack,
  workingDays,
  setWorkingDays,
  payableDays,
  setPayableDays,
  importData,
  manualOverrides,
  setManualOverrides,
  effectiveDate,
  setEffectiveDate,
}: {
  processedEmployees: any[];
  mappedComponentHeaders: any[];
  mappedStatutoryHeaders: any[];
  onConfirm: () => void;
  isSubmitting: boolean;
  onBack: () => void;
  workingDays: number;
  setWorkingDays: (days: number) => void;
  payableDays: number;
  setPayableDays: (days: number) => void;
  importData?: any;
  manualOverrides?: any;
  setManualOverrides?: any;
  effectiveDate?: string;
  setEffectiveDate?: (date: string) => void;
}) {
  const [hideEmpty, setHideEmpty] = useState(true);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-background text-foreground">
      {/* Top Header matching Image 2 */}
      <div className="flex-none px-6 py-4 border-b border-border/40 bg-background flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={onBack}
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            Back
          </Button>
          <div className="h-6 w-6 rounded border border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
            <Icon name="check" className="h-3.5 w-3.5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Update Increment Salary
            </h1>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              COMPONENTS - SALARIES / BULK INCREMENT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 border-r pr-3 border-border/40">
            <label className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">
              Working
            </label>
            <input
              type="number"
              min={1}
              max={31}
              value={workingDays}
              onChange={(e) => {
                const val = Number(e.target.value);
                setWorkingDays(Number.isNaN(val) || val <= 0 ? 26 : val);
              }}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-xs font-mono text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 border-r pr-3 border-border/40">
            <label className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">
              Payable
            </label>
            <input
              type="number"
              min={0}
              max={31}
              value={payableDays}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPayableDays(Number.isNaN(val) || val < 0 ? 26 : val);
              }}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-xs font-mono text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 border-r pr-3 border-border/40">
            <label className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">
              Effective Date
            </label>
            <input
              type="date"
              value={effectiveDate || ""}
              onChange={(e) => setEffectiveDate?.(e.target.value)}
              className="h-8 text-xs rounded-md border border-input bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary h-4 w-4 bg-background"
            />
            Hide empty columns
          </label>

          {importData && manualOverrides !== undefined && setManualOverrides && (
            <GlobalDebugDialog
              importData={importData}
              processedEmployees={processedEmployees}
              manualOverrides={manualOverrides}
              onOverrideChange={(
                empCode: string,
                fieldId: string,
                value: number,
              ) => {
                setManualOverrides((prev: any) => ({
                  ...prev,
                  [`${empCode}-${fieldId}`]: value,
                }));
              }}
              onClearOverrides={() => setManualOverrides({})}
            />
          )}

          <Button
            onClick={onConfirm}
            disabled={isSubmitting || processedEmployees.length === 0}
            className="h-9 px-6 bg-primary text-primary-foreground font-semibold text-xs shadow-sm hover:bg-primary/90"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>

      {/* Main Table Container matching Image 2 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-md border border-border/40 bg-card overflow-hidden">
          <Table>
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
                {mappedComponentHeaders.map((ch) => (
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
              {processedEmployees.map((emp, index) => {
                const oldBreakdown = emp.salary
                  ? calculateSalaryBreakdown({
                    monthlyCtc: emp.salary.monthlyCtc,
                    basicPercent: emp.salary.basicPercent,
                    basicAmount: emp.salary.basicAmount,
                    isProRata: false,
                    useRawAmounts: true,
                    payableDays,
                    workingDays,
                    components: emp.salary.resolvedComponents || [],
                    statutory: emp.salary.resolvedStatutory || {},
                  })
                  : null;

                const oldBonus = oldBreakdown?.earnings?.find((e: any) =>
                  e.name.toUpperCase().includes("BONUS"),
                )?.amount;
                const newBonus = emp.breakdown?.earnings?.find((e: any) =>
                  e.name.toUpperCase().includes("BONUS"),
                )?.amount;

                const oldEsi = oldBreakdown?.deductions?.find((d: any) =>
                  d.name.toUpperCase().includes("ESI"),
                )?.amount;
                const newEsi = emp.breakdown?.deductions?.find((d: any) =>
                  d.name.toUpperCase().includes("ESI"),
                )?.amount;

                const oldPf = oldBreakdown?.deductions?.find((d: any) =>
                  d.name.toUpperCase().includes("PF"),
                )?.amount;
                const newPf = emp.breakdown?.deductions?.find((d: any) =>
                  d.name.toUpperCase().includes("PF"),
                )?.amount;

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
                        oldVal={emp.salary?.monthlyCtc}
                        newVal={emp.monthlyCtc}
                      />
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs py-2.5">
                      <IncrementValueDisplay
                        oldVal={oldBreakdown?.basicAmount}
                        newVal={emp.breakdown?.basicAmount}
                      />
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs py-2.5">
                      <IncrementValueDisplay
                        oldVal={oldBonus}
                        newVal={newBonus}
                      />
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs py-2.5">
                      <IncrementValueDisplay
                        oldVal={oldEsi}
                        newVal={newEsi}
                      />
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs py-2.5">
                      <IncrementValueDisplay
                        oldVal={oldPf}
                        newVal={newPf}
                      />
                    </TableCell>

                    {mappedComponentHeaders.map((ch) => {
                      const getCompVal = (breakdown: any, rawComps?: any[]) => {
                        if (!breakdown) return null;
                        const allComps = [
                          ...(breakdown.earnings || []),
                          ...(breakdown.deductions || []),
                        ];
                        let found = allComps.find(
                          (e: any) =>
                            e.id === ch.id ||
                            (e.payment_field_id && e.payment_field_id === ch.id),
                        );
                        if (found) return found;

                        if (rawComps && rawComps.length > 0) {
                          const rawMatch = rawComps.find(
                            (rc: any) =>
                              rc.payment_field_id === ch.id ||
                              rc.id === ch.id ||
                              rc.payment_fields?.id === ch.id,
                          );
                          if (rawMatch) {
                            const rawName =
                              rawMatch.payment_fields?.display_name ||
                              rawMatch.payment_fields?.name;
                            found = allComps.find(
                              (e: any) =>
                                e.id === rawMatch.id ||
                                (rawName &&
                                  e.name?.toLowerCase().trim() ===
                                  rawName.toLowerCase().trim()),
                            );
                            if (found) return found;
                          }
                        }

                        const chName = (ch.display_name || ch.name || "")
                          .toLowerCase()
                          .trim();
                        if (chName) {
                          found = allComps.find(
                            (e: any) => e.name?.toLowerCase().trim() === chName,
                          );
                          if (found) return found;
                        }

                        const cleanHeaderName = chName.replace(/[^a-z0-9]/g, "");
                        if (cleanHeaderName) {
                          found = allComps.find((e: any) => {
                            const cleanCompName = (e.name || "")
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, "");
                            return (
                              cleanCompName === cleanHeaderName ||
                              cleanHeaderName.startsWith(cleanCompName) ||
                              cleanCompName.startsWith(cleanHeaderName)
                            );
                          });
                          if (found) return found;
                        }

                        return null;
                      };

                      const comp = getCompVal(emp.breakdown, emp.resolvedComponents);
                      const oldComp = getCompVal(
                        oldBreakdown,
                        emp.salary?.resolvedComponents,
                      );

                      return (
                        <TableCell
                          key={ch.id}
                          className="text-right font-mono text-xs py-2.5"
                        >
                          <IncrementValueDisplay
                            oldVal={oldComp?.amount}
                            newVal={comp?.amount}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default function SalaryPreviewPage() {
  const { env } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestInfo = useRequestInfo();
  const companyId = requestInfo?.userPrefs?.companyId;
  const { toast } = useToast();
  const fetcher = useFetcher();

  const savedImportState = useMemo(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(sessionStorage.getItem("salary_import_state") || "{}");
    } catch {
      return {};
    }
  }, []);

  const [employeeCodes, setEmployeeCodes] = useState<string[]>(
    () => location.state?.employeeCodes ?? savedImportState?.employeeCodes ?? [],
  );
  const importData = (location.state?.importData ?? savedImportState?.importData) as
    | {
      rows: any[][];
      headerRow: any[];
      empCodeColIdx: number;
      mappings: {
        basic: { colIdx: number | null; isMonthly: boolean };
        statutory: {
          pf: { colIdx: number | null; dbId: string | null };
          esi: { colIdx: number | null; dbId: string | null };
          pt: { colIdx: number | null; dbId: string | null };
          bonus: { colIdx: number | null; dbId: string | null };
          lwf: { colIdx: number | null; dbId: string | null };
        };
        components: Array<{
          dbId: string | null;
          colIdx: number | null;
          isMonthly: boolean;
        }>;
      };
    }
    | undefined;

  const [rawEmployees, setRawEmployees] = useState<any[]>([]);
  const [mappingDetails, setMappingDetails] = useState<any>(null);
  const [manualOverrides, setManualOverrides] = useState<
    Record<string, number>
  >({});

  const handleRemoveEmployee = useCallback(
    (code: string) => {
      setEmployeeCodes((prev) => prev.filter((c) => c !== code));
      toast({
        title: "Employee Removed",
        description: `Employee ${code} has been removed from the preview.`,
      });
    },
    [toast],
  );
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workingDays, setWorkingDays] = useState<number>(
    () => location.state?.workingDays ?? location.state?.importData?.mappings?.workingDays ?? savedImportState?.workingDays ?? 26
  );
  const [payableDays, setPayableDays] = useState<number>(
    () => location.state?.payableDays ?? location.state?.workingDays ?? location.state?.importData?.mappings?.workingDays ?? savedImportState?.workingDays ?? 26
  );
  const [tolerance, setTolerance] = useState(1);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(() => {
    if (location.state?.effectiveDate) return location.state.effectiveDate;
    if (location.state?.importData?.effectiveDate) return location.state.importData.effectiveDate;
    if (savedImportState?.effectiveDate) return savedImportState.effectiveDate;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const isImporting = fetcher.state !== "idle";

  useEffect(() => {
    if (!employeeCodes.length) {
      navigate("/employees/import-salaries");
    }
  }, []);

  const fetchedCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!employeeCodes.length) return;

    const trimmedCodes = employeeCodes.map((c) => c?.trim()).filter(Boolean);

    const needsFetching = trimmedCodes.filter(
      (code) => !fetchedCodesRef.current.has(code),
    );

    if (needsFetching.length === 0) {
      if (loading) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getEmployeesWithSalaryByEmployeeCodes({
      supabase,
      employeeCodes: needsFetching,
    })
      .then(({ data, error }) => {
        if (error) {
          setError("Failed to fetch employee salary data.");
        } else {
          for (const code of needsFetching) {
            fetchedCodesRef.current.add(code);
          }

          setRawEmployees((prev) => {
            const existing = new Map(
              prev.map((e) => [e.employee_code?.trim(), e]),
            );
            if (data) {
              for (const e of data) {
                existing.set(e.employee_code?.trim(), e);
              }
            }

            return trimmedCodes
              .map((code) => existing.get(code))
              .filter(Boolean);
          });
        }
      })
      .finally(() => setLoading(false));
  }, [employeeCodes, supabase]);

  useEffect(() => {
    if (!importData?.mappings) return;

    const m = importData.mappings;
    const paymentFieldIds = m.components
      .map((c) => c.dbId)
      .filter(Boolean) as string[];

    const ptIds = [
      ...new Set(
        [
          ...Object.values((m as any).locationPTMapping || {}).filter(Boolean),
          m.statutory.pt?.dbId,
        ].filter(Boolean) as string[],
      ),
    ];

    const esiIds = [
      ...new Set(
        [
          ...Object.values((m as any).locationESICMapping || {}).filter(
            Boolean,
          ),
          m.statutory.esi.dbId,
        ].filter(Boolean) as string[],
      ),
    ];

    setLoadingDetails(true);
    getSalaryComponentsDetails({
      supabase,
      paymentFieldIds,
      pfId: m.statutory.pf.dbId,
      esiId: m.statutory.esi.dbId,
      esiIds,
      ptIds,
      bonusId: m.statutory.bonus.dbId,
      lwfId: m.statutory.lwf.dbId,
      companyId: companyId as string,
    })
      .then((details) => {
        setMappingDetails(details);
      })
      .finally(() => setLoadingDetails(false));
  }, [importData?.mappings, supabase, companyId]);

  const processedEmployees = useMemo<ProcessedEmployee[]>(() => {
    return employeeCodes.map((rawCode) => {
      const code = rawCode?.trim();
      const m: any = importData?.mappings;
      const emp = rawEmployees.find(
        (e) => e.employee_code?.trim() === code?.trim(),
      );
      const rawSalary = emp ? resolveEmployeeSalary(emp, effectiveDate) : null;
      const hasSalaryForEffectiveMonth =
        !!rawSalary && isSameMonth(rawSalary?.effectiveDate, effectiveDate);
      const salary = hasSalaryForEffectiveMonth ? rawSalary : null;
      const fullName = emp
        ? [emp.first_name, emp.middle_name, emp.last_name]
          .filter(Boolean)
          .join(" ")
        : code;

      let breakdown: ReturnType<typeof calculateSalaryBreakdown> | null = null;

      const excelRow = importData?.rows.find(
        (r) =>
          String(getCellValue(r[importData.empCodeColIdx])).trim() ===
          code?.trim(),
      );

      const overtimeHours =
        (importData?.mappings as any)?.overtimeColIdx !== null && excelRow
          ? Number(
            getCellValue(
              excelRow[(importData?.mappings as any).overtimeColIdx],
            ),
          ) || 0
          : 0;

      const activeWorkingDays = workingDays;
      const activePayableDays = payableDays;

      const basicPercent = salary?.basicPercent ?? 50;
      const monthlyCtc = salary?.monthlyCtc ?? 0;
      let basicAmountOverride: number | undefined = undefined;
      const isProRata = salary?.isProRata ?? true;
      const resolvedComponents = salary ? [...salary.resolvedComponents] : [];
      const resolvedStatutory = salary
        ? { ...salary.resolvedStatutory }
        : {
          pf: mappingDetails?.pf || null,
          esi: mappingDetails?.esi || null,
          pt:
            mappingDetails?.pts?.find(
              (p: any) => p.id === m?.statutory.pt.dbId,
            ) || null,
          bonus: mappingDetails?.bonus || null,
          lwf: mappingDetails?.lwf || null,
        };

      if (excelRow && m) {
        if (m.basic.colIdx !== null || (m.basic as any).colIdx2 !== null) {
          const val1 =
            m.basic.colIdx !== null ? excelRow[m.basic.colIdx] : null;
          const val2 =
            (m.basic as any).colIdx2 !== null
              ? excelRow[(m.basic as any).colIdx2]
              : null;

          const amount1 =
            val1 !== null ? parseImportedValue(val1, m.basic.isMonthly) : 0;
          const amount2 =
            val2 !== null ? parseImportedValue(val2, m.basic.isMonthly) : 0;

          const totalBasic = amount1 + amount2;

          const overrideKey = `${code}-basic`;
          const manualValue = manualOverrides[overrideKey];

          if (manualValue !== undefined) {
            basicAmountOverride = m.basic.isMonthly
              ? manualValue
              : manualValue * activeWorkingDays;
          } else if (totalBasic > 0) {
            basicAmountOverride = m.basic.isMonthly
              ? totalBasic
              : totalBasic * activeWorkingDays;
          }
        }

        const s = m.statutory;
        if (s.pf.dbId && s.pf.colIdx !== null) {
          const val = String(getCellValue(excelRow[s.pf.colIdx]) || "").trim();
          if (!val) resolvedStatutory.pf = null;
        }
        if (s.esi.dbId && s.esi.colIdx !== null) {
          const val = String(getCellValue(excelRow[s.esi.colIdx]) || "").trim();
          if (!val) resolvedStatutory.esi = null;
        }
        if (s.bonus.dbId && s.bonus.colIdx !== null) {
          const val = String(
            getCellValue(excelRow[s.bonus.colIdx]) || "",
          ).trim();
          if (!val) resolvedStatutory.bonus = null;
        }
        if (s.lwf.dbId && s.lwf.colIdx !== null) {
          const val = String(getCellValue(excelRow[s.lwf.colIdx]) || "").trim();
          if (!val) resolvedStatutory.lwf = null;
        }

        for (const compMap of m.components) {
          if (compMap.dbId) {
            const field = mappingDetails?.paymentFields?.find(
              (f: any) => f.id === compMap.dbId,
            );
            if (!field) continue;

            const val =
              compMap.colIdx !== null ? excelRow[compMap.colIdx] : null;
            const formula = getCellFormula(val);
            const isStaticValue = !formula;

            let amount = 0;
            const isMonthly = !!compMap.isMonthly;
            const isProRataComp =
              isStaticValue && isMonthly ? true : !isStaticValue;
            let fixedType: "day" | "month" | "hour" = isMonthly
              ? "month"
              : "day";

            if (compMap.colIdx !== null) {
              const overrideKey = `${code}-${compMap.dbId}`;
              const manualValue = manualOverrides[overrideKey];

              if (manualValue !== undefined) {
                amount = manualValue;
              } else {
                const rawVal = getCellValue(val);
                const hasExcelValue =
                  rawVal !== null &&
                  rawVal !== undefined &&
                  String(rawVal).trim() !== "";

                if (hasExcelValue) {
                  const importedVal = parseImportedValue(val, isMonthly);
                  const dbFixedType = field.fixed_type || "month";
                  const isVariableOrOvertime =
                    field.calculation_type === "variable" ||
                    field.is_overtime ||
                    field.name?.toUpperCase().includes("OVERTIME") ||
                    field.display_name?.toUpperCase().includes("OVERTIME");

                  if (isMonthly && dbFixedType === "day") {
                    amount =
                      activeWorkingDays > 0
                        ? importedVal / activeWorkingDays
                        : 0;
                  } else if (
                    !isMonthly &&
                    dbFixedType === "month" &&
                    !isVariableOrOvertime
                  ) {
                    amount = importedVal * activeWorkingDays;
                  } else {
                    amount = importedVal;
                  }
                } else if (salary) {
                  const existing = salary.resolvedComponents.find((rc) => {
                    if (
                      rc.payment_field_id === compMap.dbId ||
                      rc.id === compMap.dbId
                    )
                      return true;
                    const cName =
                      rc.payment_fields?.display_name ||
                      rc.payment_fields?.name;
                    const chName = field.display_name || field.name;
                    return (
                      cName &&
                      chName &&
                      cName.toLowerCase().trim() === chName.toLowerCase().trim()
                    );
                  });
                  amount = existing ? Number(existing.amount || 0) : 0;
                } else {
                  amount = 0;
                }
              }
            } else {
              if (salary) {
                const existing = salary.resolvedComponents.find((rc) => {
                  if (
                    rc.payment_field_id === compMap.dbId ||
                    rc.id === compMap.dbId
                  )
                    return true;
                  const cName =
                    rc.payment_fields?.display_name || rc.payment_fields?.name;
                  const chName = field.display_name || field.name;
                  return (
                    cName &&
                    chName &&
                    cName.toLowerCase().trim() === chName.toLowerCase().trim()
                  );
                });
                if (existing) {
                  amount = Number(existing.amount || 0);
                } else {
                  amount = field.calculation_type === "variable" ? 0 : Number(field.amount || 0);
                }
              } else {
                amount = Number(field.amount || 0);
              }
              if (
                field.calculation_type !== "fixed" &&
                field.calculation_type !== "variable"
              ) {
                fixedType = field.fixed_type || "month";
              }
            }

            const idx = resolvedComponents.findIndex((c) => {
              if (c.payment_field_id === compMap.dbId || c.id === compMap.dbId)
                return true;
              const cName =
                c.payment_fields?.display_name || c.payment_fields?.name;
              const chName = field.display_name || field.name;
              return (
                cName &&
                chName &&
                cName.toLowerCase().trim() === chName.toLowerCase().trim()
              );
            });

            const compData = {
              id: compMap.dbId,
              payment_field_id: compMap.dbId,
              amount,
              payment_fields: field
                ? {
                  ...field,
                  is_pro_rata:
                    field.is_pro_rata !== undefined &&
                      field.is_pro_rata !== null
                      ? field.is_pro_rata
                      : isProRataComp,
                  fixed_type: field.fixed_type || fixedType,
                }
                : null,
            };

            if (idx !== -1) {
              resolvedComponents[idx] = compData;
            } else {
              resolvedComponents.push(compData);
            }
          }
        }
      }

      let ptConfig = null;
      if (m.locationColIdx !== null && excelRow) {
        const locVal = String(
          getCellValue(excelRow[m.locationColIdx]) || "",
        ).trim();
        const ptConfigId = m.locationPTMapping?.[locVal];
        if (ptConfigId) {
          ptConfig = mappingDetails?.pts?.find((c: any) => c.id === ptConfigId);
        }
      }

      let esiConfig = null;
      if ((m as any).locationColIdxESIC !== null && excelRow) {
        const locVal = String(
          getCellValue(excelRow[(m as any).locationColIdxESIC]) || "",
        ).trim();
        const esiConfigId = (m as any).locationESICMapping?.[locVal];
        if (esiConfigId) {
          esiConfig = mappingDetails?.esis?.find(
            (c: any) => c.id === esiConfigId,
          );
        }
      }

      if (
        monthlyCtc > 0 ||
        basicAmountOverride ||
        resolvedComponents.length > 0
      ) {
        try {
          breakdown = calculateSalaryBreakdown({
            monthlyCtc,
            basicPercent,
            basicAmount: basicAmountOverride,
            isProRata,
            useRawAmounts: true,
            payableDays: activePayableDays,
            workingDays: activeWorkingDays,
            holidayConfig: mappingDetails?.holidayConfig || [],
            attendance: {
              overtimeHours: overtimeHours,
              paidHolidays: 0,
              paidLeaves: 0,
              casualLeaves: 0,
            },
            components: resolvedComponents,
            statutory: {
              ...resolvedStatutory,
              pt:
                (m as any).locationColIdx !== null
                  ? ptConfig
                  : ptConfig || resolvedStatutory.pt,
              esi:
                (m as any).locationColIdxESIC !== null
                  ? esiConfig
                  : esiConfig || resolvedStatutory.esi,
            },
          });
        } catch (e) {
          console.error("Breakdown error for", code, e);
        }
      }

      let finalCtc = monthlyCtc;
      let basicPercentage = basicPercent;

      if (breakdown && !salary) {
        const overtimeEarnings = breakdown.earnings
          .filter((e) => {
            const comp = resolvedComponents.find((rc) => rc.id === e.id);
            return comp?.payment_fields?.is_overtime === true;
          })
          .reduce((sum, e) => sum + e.amount, 0);

        const employerTotal = breakdown.employerContribution?.total || 0;
        const employerEsi = breakdown.employerContribution?.esi || 0;

        let overtimeEmployerContribution = 0;
        if (employerEsi > 0 && overtimeEarnings > 0) {
          const esiRate = mappingDetails?.esi?.employer_contribution || 0.0325;
          overtimeEmployerContribution = overtimeEarnings * esiRate;
        }

        finalCtc =
          breakdown.grossAmount -
          overtimeEarnings +
          (employerTotal - overtimeEmployerContribution);

        const basicAmount = breakdown.basicAmount || 0;
        basicPercentage = finalCtc > 0 ? (basicAmount / finalCtc) * 100 : 0;
      }

      let excelNetPayable: number | undefined = undefined;
      if ((m as any).netPayableColIdx !== null && excelRow) {
        const cell = excelRow[(m as any).netPayableColIdx];
        const rawV = Number(getCellValue(cell)) || 0;
        const formula = getCellFormula(cell);

        if (rawV === 0 && formula) {
          excelNetPayable = evaluateSimpleFormula(formula, excelRow);
        } else {
          excelNetPayable = rawV;
        }
      }

      let excelPresentDays: number | undefined = undefined;
      if ((m as any).presentDaysColIdx !== null && excelRow) {
        excelPresentDays =
          Number(getCellValue(excelRow[(m as any).presentDaysColIdx])) || 0;
      }

      let presentDaysBreakdown: ReturnType<
        typeof calculateSalaryBreakdown
      > | null = null;
      if (
        excelPresentDays !== undefined &&
        (monthlyCtc > 0 || basicAmountOverride || resolvedComponents.length > 0)
      ) {
        try {
          presentDaysBreakdown = calculateSalaryBreakdown({
            monthlyCtc,
            basicPercent,
            basicAmount: basicAmountOverride,
            isProRata,
            useRawAmounts: true,
            payableDays: excelPresentDays,
            workingDays: activeWorkingDays,
            holidayConfig: mappingDetails?.holidayConfig || [],
            attendance: {
              overtimeHours: overtimeHours,
              paidHolidays: 0,
              paidLeaves: 0,
              casualLeaves: 0,
            },
            components: resolvedComponents,
            statutory: {
              ...resolvedStatutory,
              pt:
                (m as any).locationColIdx !== null
                  ? ptConfig
                  : ptConfig || resolvedStatutory.pt,
              esi:
                (m as any).locationColIdxESIC !== null
                  ? esiConfig
                  : esiConfig || resolvedStatutory.esi,
            },
          });
        } catch (e) {
          console.error("Present days breakdown error", e);
        }
      }

      return {
        id: emp?.id || `new-${code}`,
        employee_code: code,
        name: fullName || code,
        hasSalary: hasSalaryForEffectiveMonth,
        notFoundInDb: !emp,
        salary: rawSalary,
        monthlyCtc: finalCtc,
        basicPercentage,
        breakdown,
        location:
          m.locationColIdx !== null && excelRow
            ? String(getCellValue(excelRow[m.locationColIdx]) || "").trim()
            : null,
        resolvedComponents,
        resolvedStatutory: {
          ...resolvedStatutory,
          pt:
            (m as any).locationColIdx !== null
              ? ptConfig
              : ptConfig || resolvedStatutory.pt,
          esi:
            (m as any).locationColIdxESIC !== null
              ? esiConfig
              : esiConfig || resolvedStatutory.esi,
        },
        excelNetPayable,
        excelPresentDays,
        presentDaysBreakdown,
      };
    });
  }, [
    employeeCodes,
    rawEmployees,
    importData,
    mappingDetails,
    workingDays,
    payableDays,
    tolerance,
    manualOverrides,
    effectiveDate,
  ]);

  const mappedComponentHeaders = useMemo(() => {
    if (!importData?.mappings.components || !mappingDetails?.paymentFields)
      return [];
    return importData.mappings.components
      .filter((c) => c.dbId)
      .map((c) =>
        mappingDetails.paymentFields.find((f: any) => f.id === c.dbId),
      )
      .filter(Boolean);
  }, [importData?.mappings, mappingDetails?.paymentFields, tolerance]);

  const mappedStatutoryHeaders = useMemo(() => {
    if (!importData?.mappings.statutory) return [];
    const s = importData.mappings.statutory;
    const m = importData.mappings;
    const headers = [];
    if (s.pf.dbId) headers.push({ id: "pf", name: "PF" });

    const hasESIMapping =
      ((m as any).locationColIdxESIC !== null &&
        Object.values((m as any).locationESICMapping || {}).some(
          (val) => !!val,
        )) ||
      !!s.esi?.dbId;
    if (hasESIMapping) headers.push({ id: "esi", name: "ESIC" });

    const hasPTMapping =
      ((m as any).locationColIdx !== null &&
        Object.values((m as any).locationPTMapping || {}).some(
          (val) => !!val,
        )) ||
      !!s.pt?.dbId;
    if (hasPTMapping) headers.push({ id: "pt", name: "PT" });

    if (s.bonus.dbId) headers.push({ id: "bonus", name: "Bonus" });
    if (s.lwf.dbId) headers.push({ id: "lwf", name: "LWF" });
    return headers;
  }, [importData?.mappings, tolerance]);

  const withSalary = processedEmployees.filter((e) => e.hasSalary);
  const updatedExisting = withSalary.filter((emp) =>
    Object.keys(manualOverrides).some((key) =>
      key.startsWith(`${emp.employee_code}-`),
    ),
  );
  const missingSalaryAssignments = processedEmployees.filter(
    (e) => !e.hasSalary && !e.notFoundInDb,
  );
  const newEmployees = processedEmployees.filter((e) => e.notFoundInDb);

  const totalNet = processedEmployees.reduce(
    (sum, e) => sum + (e.breakdown?.netAmount ?? 0),
    0,
  );
  const totalGross = processedEmployees.reduce(
    (sum, e) => sum + (e.breakdown?.grossAmount ?? 0),
    0,
  );

  const categorizedAssignments = useMemo(() => {
    const groups: Record<string, ProcessedEmployee[]> = {};

    for (const emp of missingSalaryAssignments) {
      const componentsPart = (emp.resolvedComponents || [])
        .map((c) => `${c.id}:${c.amount}`)
        .sort()
        .join("|");

      const statutoryPart = emp.resolvedStatutory
        ? [
          emp.resolvedStatutory.pf?.id,
          emp.resolvedStatutory.esi?.id,
          emp.resolvedStatutory.pt?.id,
          emp.resolvedStatutory.bonus?.id,
          emp.resolvedStatutory.lwf?.id,
        ].join("|")
        : "";

      const signature = [
        emp.location || "no-loc",
        emp.monthlyCtc.toFixed(2),
        emp.basicPercentage.toFixed(5),
        componentsPart,
        statutoryPart,
      ].join("##");

      if (!groups[signature]) groups[signature] = [];
      groups[signature].push(emp);
    }

    const commonGroups = Object.values(groups).filter((g) => g.length >= 5);
    const uniqueGroups = Object.values(groups).filter((g) => g.length < 5);

    return {
      commonGroups,
      uniqueGroups,
      totalGroups: Object.keys(groups).length,
    };
  }, [missingSalaryAssignments]);

  const handleImport = () => {
    let toImport: ProcessedEmployee[] = [];

    if (isIncrement) {
      toImport = processedEmployees.filter((emp) => !emp.notFoundInDb);
    } else {
      const updatedExisting = withSalary.filter((emp) =>
        Object.keys(manualOverrides).some((key) =>
          key.startsWith(`${emp.employee_code}-`),
        ),
      );
      toImport = [...missingSalaryAssignments, ...updatedExisting];
    }

    if (toImport.length === 0) {
      toast({
        title: "Nothing to Import",
        description: "No valid employee salary assignments found to import.",
      });
      return;
    }

    fetcher.submit(
      {
        assignments: toImport,
        workingDays,
        effectiveDate,
      } as any,
      {
        method: "POST",
        action: "/api/import-salaries/bulk-persist",
        encType: "application/json",
      },
    );
  };

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const result = fetcher.data as any;
      const hasErrors = result.errors && result.errors.length > 0;

      if (result.status === "success" || result.status === "partial") {
        toast({
          title:
            result.status === "success"
              ? "Import Successful"
              : "Import Partial",
          description: hasErrors ? (
            <div className="space-y-1 mt-1">
              <p>{result.message}</p>
              <div className="text-xs font-mono max-h-32 overflow-y-auto bg-muted/20 p-2 rounded border mt-2 space-y-1">
                {result.errors.map((err: string, i: number) => (
                  <p key={i} className="text-destructive font-semibold">
                    {err}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            result.message
          ),
          variant: result.status === "success" ? "success" : "warning",
        });
        setIsImportConfirmOpen(false);
        const isInc =
          location.state?.isIncrement ||
          searchParams.get("isIncrement") === "true" ||
          savedImportState?.isIncrement;
        navigate(isInc ? "/payment-components/salaries" : "/employees");
      } else {
        toast({
          title: "Import Failed",
          description: hasErrors ? (
            <div className="text-xs font-mono max-h-32 overflow-y-auto bg-muted/20 p-2 rounded border mt-2 space-y-1">
              {result.errors.map((err: string, i: number) => (
                <p key={i} className="text-destructive font-semibold">
                  {err}
                </p>
              ))}
            </div>
          ) : (
            result.message || "An unexpected error occurred"
          ),
          variant: "destructive",
        });
      }
    }
  }, [fetcher.data, fetcher.state, navigate, toast]);

  const isIncrement =
    location.state?.isIncrement ||
    savedImportState?.isIncrement ||
    searchParams.get("isIncrement") === "true";

  if (isIncrement && !loading) {
    return (
      <IncrementPreviewView
        processedEmployees={processedEmployees}
        mappedComponentHeaders={mappedComponentHeaders}
        mappedStatutoryHeaders={mappedStatutoryHeaders}
        onConfirm={handleImport}
        isSubmitting={fetcher.state !== "idle"}
        onBack={() => navigate(-1)}
        workingDays={workingDays}
        setWorkingDays={setWorkingDays}
        payableDays={payableDays}
        setPayableDays={setPayableDays}
        importData={importData}
        manualOverrides={manualOverrides}
        setManualOverrides={setManualOverrides}
        effectiveDate={effectiveDate}
        setEffectiveDate={setEffectiveDate}
      />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-muted/5">
      <div className="flex-none px-6 py-3 border-b bg-background flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => navigate(-1)}
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-primary leading-none">
              Salary Preview
            </h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Defaults: 26 working days · 26 payable days
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-4 border-r pr-4 mr-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                Tolerance
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={tolerance}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value);
                  setTolerance(Number.isNaN(val) ? 0 : val);
                }}
                className="h-7 w-16 text-xs px-1 text-center bg-muted/30 border-primary/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                Working
              </Label>
              <Input
                type="number"
                value={workingDays}
                onChange={(e) => setWorkingDays(Number(e.target.value))}
                className="h-7 w-12 text-xs px-1 text-center bg-muted/30 border-primary/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                Payable
              </Label>
              <Input
                type="number"
                value={payableDays}
                onChange={(e) => setPayableDays(Number(e.target.value))}
                className="h-7 w-12 text-xs px-1 text-center bg-muted/30 border-primary/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                Effective Date
              </Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="h-7 w-32 text-xs px-1 text-center bg-muted/30 border-primary/20"
              />
            </div>
          </div>

          <GlobalDebugDialog
            importData={importData}
            processedEmployees={processedEmployees}
            manualOverrides={manualOverrides}
            onOverrideChange={(
              empCode: string,
              fieldId: string,
              value: number,
            ) => {
              setManualOverrides((prev) => ({
                ...prev,
                [`${empCode}-${fieldId}`]: value,
              }));
            }}
            onClearOverrides={() => setManualOverrides({})}
          />
          <Badge variant="secondary" className="text-[10px] gap-1 px-2">
            <span className="font-bold">{employeeCodes.length}</span> codes
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] gap-1 px-2 border-emerald-200 text-emerald-700 bg-emerald-50"
          >
            <span className="font-bold">{withSalary.length}</span> with salary
          </Badge>
          {missingSalaryAssignments.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 px-2 border-amber-200 text-amber-700 bg-amber-50"
            >
              <span className="font-bold">
                {missingSalaryAssignments.length}
              </span>{" "}
              missing salary
            </Badge>
          )}
          {newEmployees.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 px-2 border-destructive/30 text-destructive bg-destructive/5"
            >
              <span className="font-bold">{newEmployees.length}</span> not in db
            </Badge>
          )}
          {!loading && totalNet > 0 && (
            <div className="ml-3 text-right border-l pl-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                Total Net
              </p>
              <p className="text-sm font-black font-mono text-primary">
                ₹
                {totalNet.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          )}
          {!loading && totalGross > 0 && (
            <div className="text-right border-l pl-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                Total Gross
              </p>
              <p className="text-sm font-black font-mono text-emerald-600">
                ₹
                {totalGross.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Icon name="update" className="animate-spin h-8 w-8 text-primary" />
            <p className="text-sm font-semibold text-primary animate-pulse">
              Fetching salary data for {employeeCodes.length} employees…
            </p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-destructive">
            <Icon name="info" className="h-8 w-8" />
            <p className="text-sm font-semibold">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              className="mt-2"
            >
              Go Back
            </Button>
          </div>
        ) : (
          <div className="space-y-8 p-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-emerald-100 rounded text-emerald-700">
                  <Icon name="file-text" className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">
                  Existing Salary Assignments ({withSalary.length})
                </h2>
                {updatedExisting.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-sm ml-auto"
                    onClick={handleImport}
                    disabled={isImporting}
                  >
                    <Icon name="upload" className="h-3.5 w-3.5" />
                    Update {updatedExisting.length} Adjusted Records
                  </Button>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden bg-background shadow-sm overflow-x-auto">
                <Table className="min-w-[1600px]">
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground w-32 px-4">
                        Emp Code
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">
                        Name
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">
                        Assignment
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4">
                        Monthly CTC
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-muted-foreground">
                        Basic %
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-primary">
                        Basic
                      </TableHead>

                      {mappedComponentHeaders
                        .filter((ch) =>
                          ch.type?.toLowerCase().includes("earning"),
                        )
                        .map((ch) => (
                          <TableHead
                            key={ch.id}
                            className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-700"
                          >
                            {ch.display_name || ch.name}
                          </TableHead>
                        ))}

                      {mappedStatutoryHeaders
                        .filter((sh) => sh.id === "bonus")
                        .map((sh) => (
                          <TableHead
                            key={sh.id}
                            className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-600"
                          >
                            {sh.name}
                          </TableHead>
                        ))}

                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-700 bg-emerald-50/30">
                        Gross
                      </TableHead>

                      {mappedStatutoryHeaders
                        .filter((sh) => sh.id !== "bonus")
                        .map((sh) => (
                          <TableHead
                            key={sh.id}
                            className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive"
                          >
                            {sh.name}
                          </TableHead>
                        ))}

                      {mappedComponentHeaders
                        .filter((ch) =>
                          ch.type?.toLowerCase().includes("deduction"),
                        )
                        .map((ch) => (
                          <TableHead
                            key={ch.id}
                            className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive"
                          >
                            {ch.display_name || ch.name}
                          </TableHead>
                        ))}

                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive bg-destructive/[0.02]">
                        Deductions
                      </TableHead>

                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-primary">
                        Net Payable
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody
                    key={`existing-body-${tolerance}-${Object.keys(manualOverrides).length}`}
                  >
                    {withSalary.map((emp) => (
                      <EmployeeSalaryRow
                        key={emp.id}
                        emp={emp}
                        mappedComponentHeaders={mappedComponentHeaders}
                        mappedStatutoryHeaders={mappedStatutoryHeaders}
                        tolerance={tolerance}
                        onRemove={handleRemoveEmployee}
                      />
                    ))}
                    {withSalary.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={
                            6 +
                            mappedStatutoryHeaders.length +
                            mappedComponentHeaders.length
                          }
                          className="text-center py-12 text-muted-foreground italic"
                        >
                          No employees with existing salary assignments found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {missingSalaryAssignments.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-amber-100 rounded text-amber-700">
                      <Icon name="info" className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wider">
                      Missing Salary Assignments (
                      {missingSalaryAssignments.length})
                    </h2>
                  </div>

                  <Dialog
                    open={isImportConfirmOpen}
                    onOpenChange={setIsImportConfirmOpen}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="h-8 gap-2 bg-amber-600 hover:bg-amber-700 text-white border-none shadow-sm"
                        disabled={missingSalaryAssignments.length === 0}
                      >
                        <Icon name="upload" className="h-3.5 w-3.5" />
                        Import Missing
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirm Salary Import</DialogTitle>
                        <DialogDescription>
                          You are about to create salary assignments for{" "}
                          {missingSalaryAssignments.length} employees.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-6 space-y-4">
                        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
                          <Icon
                            name="info"
                            className="h-5 w-5 text-amber-600 mt-0.5"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-amber-900">
                              Working Days Configuration
                            </p>
                            <p className="text-xs text-amber-800/80 leading-relaxed">
                              The system will import these salaries based on{" "}
                              <span className="font-bold">
                                {workingDays} working days
                              </span>{" "}
                              per month. This will affect pro-rata calculations
                              for basic and other components.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-1.5 px-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Working Days
                          </Label>
                          <Input
                            type="number"
                            value={workingDays}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setWorkingDays(val);
                              setPayableDays(val);
                            }}
                            className="h-9"
                          />
                        </div>

                        <div className="space-y-1.5 px-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Effective Date
                          </Label>
                          <Input
                            type="date"
                            value={effectiveDate}
                            onChange={(e) => setEffectiveDate(e.target.value)}
                            className="h-9"
                          />
                        </div>

                        <div className="border rounded-lg overflow-hidden bg-muted/20">
                          <div className="bg-muted/50 px-3 py-2 border-b">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                              Import Strategy Summary
                            </p>
                          </div>
                          <div className="p-3 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground font-medium">
                                Direct Salary Assignments
                              </span>
                              <Badge
                                variant="outline"
                                className="bg-background font-bold text-primary"
                              >
                                {missingSalaryAssignments.length +
                                  updatedExisting.length}{" "}
                                Employees
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic leading-relaxed pt-1 border-t">
                              All employee salary structures will be imported as
                              direct salary assignments without templates.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsImportConfirmOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="px-6"
                          onClick={handleImport}
                          disabled={isImporting}
                        >
                          {isImporting ? (
                            <span className="flex items-center gap-2">
                              <Icon
                                name="update"
                                className="h-3.5 w-3.5 animate-spin"
                              />
                              Importing...
                            </span>
                          ) : (
                            "Confirm & Import"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="border rounded-lg overflow-hidden bg-background shadow-sm overflow-x-auto">
                  <Table className="min-w-[1600px]">
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground w-32 px-4">
                          Emp Code
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">
                          Name
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">
                          Details
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4">
                          Monthly CTC
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-muted-foreground">
                          Basic %
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-primary">
                          Basic
                        </TableHead>

                        {mappedComponentHeaders
                          .filter((ch) =>
                            ch.type?.toLowerCase().includes("earning"),
                          )
                          .map((ch) => (
                            <TableHead
                              key={ch.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-700"
                            >
                              {ch.display_name || ch.name}
                            </TableHead>
                          ))}

                        {mappedStatutoryHeaders
                          .filter((sh) => sh.id === "bonus")
                          .map((sh) => (
                            <TableHead
                              key={sh.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-600"
                            >
                              {sh.name}
                            </TableHead>
                          ))}

                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-700 bg-emerald-50/30">
                          Gross
                        </TableHead>

                        {mappedStatutoryHeaders
                          .filter((sh) => sh.id !== "bonus")
                          .map((sh) => (
                            <TableHead
                              key={sh.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive"
                            >
                              {sh.name}
                            </TableHead>
                          ))}

                        {mappedComponentHeaders
                          .filter((ch) =>
                            ch.type?.toLowerCase().includes("deduction"),
                          )
                          .map((ch) => (
                            <TableHead
                              key={ch.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive"
                            >
                              {ch.display_name || ch.name}
                            </TableHead>
                          ))}

                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-primary text-right px-4">
                          Net Payable
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody
                      key={`missing-body-${tolerance}-${Object.keys(manualOverrides).length}`}
                    >
                      {missingSalaryAssignments.map((emp) => (
                        <EmployeeSalaryRow
                          key={emp.id}
                          emp={emp}
                          mappedComponentHeaders={mappedComponentHeaders}
                          mappedStatutoryHeaders={mappedStatutoryHeaders}
                          tolerance={tolerance}
                          onRemove={handleRemoveEmployee}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {newEmployees.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-destructive/10 rounded text-destructive">
                      <Icon name="info" className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-bold text-destructive uppercase tracking-wider">
                      New Employees - Not Found in DB ({newEmployees.length})
                    </h2>
                  </div>

                  <Badge
                    variant="outline"
                    className="text-destructive border-destructive/20 bg-destructive/5 font-mono text-[10px]"
                  >
                    Note: Create records before importing salaries
                  </Badge>
                </div>
                <div className="border rounded-lg overflow-hidden bg-background shadow-sm overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground w-32 px-4">
                          Emp Code
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">
                          Name
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">
                          Details
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4">
                          Monthly CTC
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-muted-foreground">
                          Basic %
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-primary">
                          Basic
                        </TableHead>

                        {mappedComponentHeaders
                          .filter((ch) =>
                            ch.type?.toLowerCase().includes("earning"),
                          )
                          .map((ch) => (
                            <TableHead
                              key={ch.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-700"
                            >
                              {ch.display_name || ch.name}
                            </TableHead>
                          ))}

                        {mappedStatutoryHeaders
                          .filter((sh) => sh.id === "bonus")
                          .map((sh) => (
                            <TableHead
                              key={sh.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-600"
                            >
                              {sh.name}
                            </TableHead>
                          ))}

                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-emerald-700 bg-emerald-50/30">
                          Gross
                        </TableHead>

                        {mappedStatutoryHeaders
                          .filter((sh) => sh.id !== "bonus")
                          .map((sh) => (
                            <TableHead
                              key={sh.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive"
                            >
                              {sh.name}
                            </TableHead>
                          ))}

                        {mappedComponentHeaders
                          .filter((ch) =>
                            ch.type?.toLowerCase().includes("deduction"),
                          )
                          .map((ch) => (
                            <TableHead
                              key={ch.id}
                              className="text-[10px] uppercase tracking-wider font-bold text-right px-4 text-destructive"
                            >
                              {ch.display_name || ch.name}
                            </TableHead>
                          ))}

                        <TableHead className="text-[10px] uppercase tracking-wider font-bold text-primary text-right px-4">
                          Net Payable
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody key={`new-body-${tolerance}`}>
                      {newEmployees.map((emp) => (
                        <EmployeeSalaryRow
                          key={emp.id}
                          emp={emp}
                          mappedComponentHeaders={mappedComponentHeaders}
                          mappedStatutoryHeaders={mappedStatutoryHeaders}
                          tolerance={tolerance}
                          onRemove={handleRemoveEmployee}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
