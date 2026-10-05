import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@canny_ecosystem/ui/sheet";
import { roundToNearest } from "@canny_ecosystem/utils";
import { useMemo } from "react";

type SalaryItem = {
  name: string;
  amount: number;
  displayLabel?: string;
};

type Calculation = {
  monthlyCtc?: number;
  basicPercent?: number;
  earnings?: SalaryItem[];
  deductions?: SalaryItem[];
  grossAmount?: number;
  netAmount?: number;
  deductionsTotal?: number;
  payableDays?: number;
  workingDays?: number;
  basicAmount?: number;
  basicDailyRate?: number;
};

type PayrollRow = {
  employee?: {
    name?: string;
    full_name?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    employee_code?: string;
  };
  name?: string;
  employee_code?: string;
  empCode?: string;
  calculation?: Calculation;
};

type PayrollSummarySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PayrollRow[];
};

export function PayrollSummarySheet({
  open,
  onOpenChange,
  data,
}: PayrollSummarySheetProps) {
  const { rows, totals } = useMemo(() => {
    const rows = data
      .filter((row) => !!row.calculation)
      .map((row, i) => {
        const calc = row.calculation!;

        const name =
          row.employee?.full_name ||
          (row.employee?.first_name
            ? `${row.employee.first_name} ${row.employee.middle_name ?? ""} ${row.employee.last_name ?? ""}`
                .replace(/\s+/g, " ")
                .trim()
            : null) ||
          row.employee?.name ||
          row.name ||
          "—";

        const empCode =
          row.employee?.employee_code ||
          row.employee_code ||
          row.empCode ||
          "—";

        return {
          id: `${empCode}-${i}`,
          name,
          empCode,
          payableDays: calc.payableDays ?? 0,
          workingDays: calc.workingDays ?? 0,
          monthlyCtc: calc.monthlyCtc ?? 0,
          basicPercent: calc.basicPercent ?? 0,
          basicAmount: calc.basicAmount ?? 0,
          basicDailyRate: calc.basicDailyRate ?? 0,
          earnings: calc.earnings ?? [],
          deductions: calc.deductions ?? [],
          grossAmount: calc.grossAmount ?? 0,
          deductionsTotal:
            calc.deductionsTotal ??
            (calc.grossAmount ?? 0) - (calc.netAmount ?? 0),
          netAmount: calc.netAmount ?? 0,
        };
      });

    const totals = rows.reduce(
      (acc, r) => {
        acc.monthlyCtc += r.monthlyCtc;
        acc.grossAmount += r.grossAmount;
        acc.deductionsTotal += r.deductionsTotal;
        acc.netAmount += r.netAmount;

        for (const e of r.earnings) {
          const existing = acc.earnings.find((item) => item.name === e.name);
          if (existing) {
            existing.amount += e.amount;
          } else {
            acc.earnings.push({ ...e });
          }
        }

        for (const d of r.deductions) {
          const existing = acc.deductions.find((item) => item.name === d.name);
          if (existing) {
            existing.amount += d.amount;
          } else {
            acc.deductions.push({ ...d });
          }
        }

        return acc;
      },
      {
        monthlyCtc: 0,
        grossAmount: 0,
        deductionsTotal: 0,
        netAmount: 0,
        earnings: [] as SalaryItem[],
        deductions: [] as SalaryItem[],
      },
    );

    return { rows, totals };
  }, [data]);

  const fmt = (n: number) => `₹${roundToNearest(n).toLocaleString("en-IN")}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-[720px] overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="text-xl font-semibold">
            Payroll Summary
            <span className="ml-2 text-sm text-muted-foreground font-normal">
              ({rows.length} Employees)
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="p-5 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Total CTC",
                value: fmt(totals.monthlyCtc),
              },
              {
                label: "Gross",
                value: fmt(totals.grossAmount),
              },
              {
                label: "Deductions",
                value: fmt(totals.deductionsTotal),
              },
              {
                label: "Net Pay",
                value: fmt(totals.netAmount),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border p-4 bg-muted/30"
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {item.label}
                </p>
                <p className="text-xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            {totals.earnings.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-3 px-1 text-green-700 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Total Earnings Breakdown
                </h3>
                <div className="border rounded-xl overflow-hidden bg-background">
                  <div className="divide-y">
                    {totals.earnings.map((e) => (
                      <div
                        key={e.name}
                        className="px-4 py-3 flex justify-between items-center bg-green-50/10"
                      >
                        <span className="text-sm font-medium">{e.name}</span>
                        <span className="text-sm font-semibold">
                          {fmt(e.amount)}
                        </span>
                      </div>
                    ))}
                    <div className="px-4 py-3 flex justify-between items-center bg-green-50/40 border-t">
                      <span className="text-sm font-bold">Total Gross</span>
                      <span className="text-sm font-bold text-green-700">
                        {fmt(totals.grossAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {totals.deductions.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-3 px-1 text-destructive flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  Total Deductions Breakdown
                </h3>
                <div className="border rounded-xl overflow-hidden bg-background">
                  <div className="divide-y">
                    {totals.deductions.map((d) => (
                      <div
                        key={d.name}
                        className="px-4 py-3 flex justify-between items-center bg-destructive/5"
                      >
                        <span className="text-sm font-medium">{d.name}</span>
                        <span className="text-sm font-semibold">
                          {fmt(d.amount)}
                        </span>
                      </div>
                    ))}
                    <div className="px-4 py-3 flex justify-between items-center bg-destructive/10 border-t">
                      <span className="text-sm font-bold">
                        Total Deductions
                      </span>
                      <span className="text-sm font-bold text-destructive">
                        {fmt(totals.deductionsTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="rounded-2xl bg-primary/5 border-2 border-primary/10 p-6 flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-1">
                  Company Net Payable
                </p>
                <p className="text-xs text-muted-foreground italic">
                  Total payout across {rows.length} employees
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-primary tracking-tight">
                  {fmt(totals.netAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
