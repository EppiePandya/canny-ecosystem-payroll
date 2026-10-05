import { useState, type MouseEvent } from "react";
import { Button } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  formatDateTime,
  calculateSalaryBreakdown,
} from "@canny_ecosystem/utils";
import * as XLSX from "xlsx";
import saveAs from "file-saver";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Label } from "@canny_ecosystem/ui/label";
import { Input } from "@canny_ecosystem/ui/input";

export function ExportBar({
  rows,
  selectedRows,
  onCancel,
  supabase,
}: {
  rows: number;
  selectedRows: any[];
  onCancel?: () => void;
  supabase: any;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [workingDays, setWorkingDays] = useState(26);
  const [payableDays, setPayableDays] = useState(26);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const selectedIds = selectedRows
      .map((row) => row.employee_salary_assignment?.[0]?.id)
      .filter(Boolean) as string[];

    if (selectedIds.length === 0) return;

    setExporting(true);
    try {
      const { data: assignments, error } = await supabase
        .from("employee_salary_assignment")
        .select(`
          id,
          employee_id,
          monthly_ctc,
          basic_percent,
          effective_date,
          is_pro_rata,
          use_payment_template,
          template_id,
          employees (
            employee_code,
            first_name,
            middle_name,
            last_name
          ),
          employee_salary_components (
            *,
            payment_fields (*)
          ),
          employee_salary_statutory_components (
            *,
            pf:employee_provident_fund (*),
            esi:employee_state_insurance (*),
            pt:professional_tax (*),
            bonus:statutory_bonus (*),
            lwf:labour_welfare_fund (*)
          ),
          payment_templates (
            name,
            payment_template_versions (
              id,
              effective_date,
              payment_template_components (
                *,
                payment_fields (*)
              ),
              payment_statutory_components (
                *,
                pf:employee_provident_fund (*),
                esi:employee_state_insurance (*),
                pt:professional_tax (*),
                bonus:statutory_bonus (*),
                lwf:labour_welfare_fund (*)
              )
            )
          )
        `)
        .in("id", selectedIds);

      if (error) {
        console.error("Error fetching salaries for export:", error);
        setExporting(false);
        return;
      }

      const today = new Date();

      const processedRows = (assignments || []).map((assignment: any) => {
        const emp = assignment.employees;
        const employeeCode = emp?.employee_code || "";
        const employeeName =
          `${emp?.first_name || ""} ${emp?.middle_name || ""} ${emp?.last_name || ""}`
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();

        let activeVersion = null;
        if (assignment.use_payment_template && assignment.payment_templates) {
          const versions =
            assignment.payment_templates.payment_template_versions || [];
          activeVersion = versions
            .filter(
              (v: any) =>
                !v.effective_date || new Date(v.effective_date) <= today,
            )
            .sort(
              (a: any, b: any) =>
                new Date(b.effective_date).getTime() -
                new Date(a.effective_date).getTime(),
            )[0];
        }

        const componentsList = assignment.use_payment_template
          ? activeVersion?.payment_template_components || []
          : assignment.employee_salary_components || [];

        const rawStatutory = assignment.use_payment_template
          ? Array.isArray(activeVersion?.payment_statutory_components)
            ? activeVersion.payment_statutory_components[0]
            : activeVersion?.payment_statutory_components
          : Array.isArray(assignment.employee_salary_statutory_components)
            ? assignment.employee_salary_statutory_components[0]
            : assignment.employee_salary_statutory_components;

        const statutory = {
          pf: rawStatutory?.pf || null,
          esi: rawStatutory?.esi || null,
          pt: rawStatutory?.pt || null,
          bonus: rawStatutory?.bonus || null,
          lwf: rawStatutory?.lwf || null,
        };

        const breakdown = calculateSalaryBreakdown({
          monthlyCtc: Number(assignment.monthly_ctc || 0),
          basicPercent: Number(assignment.basic_percent || 0),
          isProRata: !!assignment.is_pro_rata,
          payableDays: Number(payableDays),
          workingDays: Number(workingDays),
          holidayConfig: [],
          attendance: {
            overtimeHours: 0,
            paidHolidays: 0,
            paidLeaves: 0,
            casualLeaves: 0,
          },
          components: componentsList,
          statutory: statutory,
          month: today.getMonth() + 1,
        });

        const earningsMap: Record<string, number> = {};
        for (const e of breakdown.earnings || []) {
          earningsMap[e.name] = Math.round(e.amount || 0);
        }

        const deductionsMap: Record<string, number> = {};
        for (const d of breakdown.deductions || []) {
          deductionsMap[d.name] = Math.round(d.amount || 0);
        }

        const ec = breakdown.employerContribution;

        return {
          employeeCode,
          employeeName,
          monthlyCtc: Math.round(assignment.monthly_ctc || 0),
          grossAmount: Math.round(breakdown.grossAmount || 0),
          deductionsTotal: Math.round(breakdown.deductionsTotal || 0),
          netAmount: Math.round(breakdown.netAmount || 0),
          employerContribution: {
            pfTotal: Math.round(ec?.pfTotal || 0),
            eps: Math.round(ec?.eps || 0),
            employerEpf: Math.round(ec?.employerEpf || 0),
            edli: Math.round(ec?.edli || 0),
            admin: Math.round(ec?.admin || 0),
            esi: Math.round(ec?.esi || 0),
            total: Math.round(ec?.total || 0),
          },
          earningsMap,
          deductionsMap,
          statutory,
        };
      });

      const uniqueEarningsSet = new Set<string>();
      const uniqueDeductionsSet = new Set<string>();
      for (const r of processedRows) {
        for (const e of Object.keys(r.earningsMap)) {
          uniqueEarningsSet.add(e);
        }
        for (const d of Object.keys(r.deductionsMap)) {
          uniqueDeductionsSet.add(d);
        }
      }
      const uniqueEarnings = Array.from(uniqueEarningsSet).sort();
      const uniqueDeductions = Array.from(uniqueDeductionsSet).sort();

      const baseHeaders = [
        "Employee Code",
        "Employee Name",
        "Working Days",
        "Present Days",
        "Monthly CTC",
        "Gross Amount",
        "Total Deductions",
        "Net Payable",
      ];

      const employerHeaders = [
        "Employer PF Total",
        "Employer Pension (EPS)",
        "Employer EPF Share",
        "Employer EDLI",
        "Employer Admin Charges",
        "Employer ESIC",
        "Employer Contribution Total",
      ];

      const headers = [
        ...baseHeaders,
        ...uniqueEarnings,
        ...uniqueDeductions,
        ...employerHeaders,
      ];
      const dataRows = [headers];

      for (const row of processedRows) {
        const ec = row.employerContribution;

        const rowValues = [
          row.employeeCode,
          row.employeeName,
          workingDays,
          payableDays,
          row.monthlyCtc,
          row.grossAmount,
          row.deductionsTotal,
          row.netAmount,
        ];

        for (const field of uniqueEarnings) {
          rowValues.push(row.earningsMap[field] || 0);
        }

        for (const field of uniqueDeductions) {
          rowValues.push(row.deductionsMap[field] || 0);
        }

        rowValues.push(
          ec.pfTotal || 0,
          ec.eps || 0,
          ec.employerEpf || 0,
          ec.edli || 0,
          ec.admin || 0,
          ec.esi || 0,
          ec.total || 0,
        );

        dataRows.push(rowValues);
      }

      const worksheet = XLSX.utils.aoa_to_sheet(dataRows);

      const maxColWidths = headers.map((h, i) => {
        let maxLen = h.length;
        for (let r = 1; r < dataRows.length; r++) {
          const val = String(dataRows[r][i] || "");
          if (val.length > maxLen) {
            maxLen = val.length;
          }
        }
        return { wch: Math.min(maxLen + 4, 30) };
      });
      worksheet["!cols"] = maxColWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Salaries");

      workbook.Workbook = {
        Views: [{ RTL: false }],
        CalcPr: { calcMode: "auto" },
      };

      const buffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      saveAs(blob, `Salaries - ${formatDateTime(Date.now())}.xlsx`);
      setIsOpen(false);
    } catch (err) {
      console.error("Export generation error:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "z-40 fixed bottom-16 md:bottom-8 left-0 right-0 mx-auto h-14 w-max shadow-md rounded-full flex gap-10 justify-between items-center p-2 text-sm border dark:border-muted-foreground/30 bg-card text-card-foreground",
        )}
      >
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            className="h-full bg-muted rounded-full text-muted-foreground hover:bg-muted hover:text-muted-foreground"
          >
            Cancel
          </Button>
        )}
        <div className="ml-2 flex items-center space-x-1 rounded-md">
          <p className="font-semibold">{rows} Selected</p>
        </div>
        <div className="h-full flex justify-center items-center gap-2">
          <Button
            onClick={(e) => {
              e.preventDefault();
              setIsOpen(true);
            }}
            variant="outline"
            size="lg"
            className="h-full rounded-full border-blue-600 text-blue-600 bg-transparent hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            Export
          </Button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[420px] p-6 bg-white dark:bg-[#050505] rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border-none">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Salary Sheet Export Configurations
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="workingDays"
                className="text-sm font-semibold text-foreground"
              >
                Working Days
              </Label>
              <Input
                id="workingDays"
                type="number"
                value={workingDays}
                onChange={(e) => setWorkingDays(Number(e.target.value))}
                placeholder="26"
                className="w-full focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="payableDays"
                className="text-sm font-semibold text-foreground"
              >
                Present / Payable Days
              </Label>
              <Input
                id="payableDays"
                type="number"
                value={payableDays}
                onChange={(e) => setPayableDays(Number(e.target.value))}
                placeholder="26"
                className="w-full focus-visible:ring-primary/30"
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className="rounded-xl"
                disabled={exporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                className="rounded-xl"
                disabled={exporting}
              >
                {exporting ? "Generating..." : "Generate & Export"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
