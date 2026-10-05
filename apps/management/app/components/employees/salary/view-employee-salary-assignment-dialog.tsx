import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import { Badge } from "@canny_ecosystem/ui/badge";
import { ScrollArea } from "@canny_ecosystem/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { calculateSalaryBreakdown } from "@canny_ecosystem/utils";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Input } from "@canny_ecosystem/ui/input";
import { Label } from "@canny_ecosystem/ui/label";
import { Icon } from "@canny_ecosystem/ui/icon";

export function ViewEmployeeSalaryAssignmentDialog({
  open,
  onOpenChange,
  data,
  env,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data?: any;
  env: any;
}) {
  const { supabase } = useSupabase({ env });
  const [loading, setLoading] = useState(false);
  const [assignmentDetail, setAssignmentDetail] = useState<any>(null);
  const [workingDays, setWorkingDays] = useState(26);
  const [payableDays, setPayableDays] = useState(26);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [paidHolidays, setPaidHolidays] = useState(0);
  const [paidLeaves, setPaidLeaves] = useState(0);
  const [casualLeaves, setCasualLeaves] = useState(0);
  const [configs, setConfigs] = useState<
    Record<
      string,
      {
        multiplier: number;
        working_days?: number | null;
        use_attendance_working_days?: boolean;
      }
    >
  >({
    overtime_hours: { multiplier: 1 },
    paid_holidays: { multiplier: 1 },
    paid_leaves: { multiplier: 1 },
    casual_leaves: { multiplier: 1 },
  });

  useEffect(() => {
    if (open && data?.id) {
      loadFullDetail(data.id);
      setWorkingDays(26);
      setPayableDays(26);
      setOvertimeHours(0);
      setPaidHolidays(0);
      setPaidLeaves(0);
      setCasualLeaves(0);
      setConfigs({
        overtime_hours: { multiplier: 1 },
        paid_holidays: { multiplier: 1 },
        paid_leaves: { multiplier: 1 },
        casual_leaves: { multiplier: 1 },
      });
    } else if (!open) {
      setAssignmentDetail(null);
    }
  }, [open, data?.id]);

  async function loadFullDetail(id: string) {
    setLoading(true);
    try {
      const { data: assignment, error } = await supabase
        .from("employee_salary_assignment")
        .select(`
          *,
          employee_salary_components (
            *,
            payment_fields (*)
          ),
          payment_templates (
             *,
            payment_template_versions (
              id,
              monthly_ctc,
              basic_percent,
              is_pro_rata,
              effective_date,
              payment_template_components (
                *,
                payment_fields (*)
              ),
              payment_statutory_components (*)
            )
          )
        `)
        .eq("id", id)
        .maybeSingle();

      if (error || !assignment)
        throw error || new Error("Assignment not found");

      let resolvedComponents = [];
      let resolvedStatutory: any = {};

      const hasCustomComponents =
        Array.isArray(assignment.employee_salary_components) &&
        assignment.employee_salary_components.length > 0;

      if (
        assignment.use_payment_template &&
        assignment.payment_templates &&
        !hasCustomComponents
      ) {
        const today = new Date();
        const latestVersion =
          assignment.payment_templates.payment_template_versions
            ?.filter(
              (v: any) =>
                !v.effective_date || new Date(v.effective_date) <= today,
            )
            ?.sort(
              (a: any, b: any) =>
                new Date(b.effective_date).getTime() -
                new Date(a.effective_date).getTime(),
            )[0];

        if (latestVersion) {
          assignment.monthly_ctc = latestVersion.monthly_ctc;
          assignment.basic_percent = latestVersion.basic_percent;
          assignment.is_pro_rata = latestVersion.is_pro_rata;
          resolvedComponents = latestVersion.payment_template_components || [];

          const ts = latestVersion.payment_statutory_components;
          if (ts) {
            const [pf, esi, pt, bonus, lwf] = await Promise.all([
              ts.pf_id
                ? supabase
                  .from("employee_provident_fund")
                  .select("*")
                  .eq("id", ts.pf_id)
                  .maybeSingle()
                  .then((r) => r.data)
                : null,
              ts.esic_id
                ? supabase
                  .from("employee_state_insurance")
                  .select("*")
                  .eq("id", ts.esic_id)
                  .maybeSingle()
                  .then((r) => r.data)
                : null,
              ts.pt_id
                ? supabase
                  .from("professional_tax")
                  .select("*")
                  .eq("id", ts.pt_id)
                  .maybeSingle()
                  .then((r) => r.data)
                : null,
              ts.statutory_bonus_id
                ? supabase
                  .from("statutory_bonus")
                  .select("*")
                  .eq("id", ts.statutory_bonus_id)
                  .maybeSingle()
                  .then((r) => r.data)
                : null,
              ts.labour_welfare_fund_id
                ? supabase
                  .from("labour_welfare_fund")
                  .select("*")
                  .eq("id", ts.labour_welfare_fund_id)
                  .maybeSingle()
                  .then((r) => r.data)
                : null,
            ]);
            resolvedStatutory = { pf, esi, pt, bonus, lwf };
          }
        }
      } else {
        resolvedComponents = assignment.employee_salary_components || [];

        const { data: esc } = await supabase
          .from("employee_salary_statutory_components")
          .select("*")
          .eq("employee_salary_assignment_id", id)
          .maybeSingle();

        if (esc) {
          const [pf, esi, pt, bonus, lwf] = await Promise.all([
            esc.pf_id
              ? supabase
                .from("employee_provident_fund")
                .select("*")
                .eq("id", esc.pf_id)
                .maybeSingle()
                .then((r) => r.data)
              : null,
            esc.esic_id
              ? supabase
                .from("employee_state_insurance")
                .select("*")
                .eq("id", esc.esic_id)
                .maybeSingle()
                .then((r) => r.data)
              : null,
            esc.pt_id
              ? supabase
                .from("professional_tax")
                .select("*")
                .eq("id", esc.pt_id)
                .maybeSingle()
                .then((r) => r.data)
              : null,
            esc.statutory_bonus_id
              ? supabase
                .from("statutory_bonus")
                .select("*")
                .eq("id", esc.statutory_bonus_id)
                .maybeSingle()
                .then((r) => r.data)
              : null,
            esc.labour_welfare_fund_id
              ? supabase
                .from("labour_welfare_fund")
                .select("*")
                .eq("id", esc.labour_welfare_fund_id)
                .maybeSingle()
                .then((r) => r.data)
              : null,
          ]);
          resolvedStatutory = { pf, esi, pt, bonus, lwf };
        }
      }

      setAssignmentDetail({
        ...assignment,
        resolvedComponents,
        resolvedStatutory,
      });

      const { data: employee } = await supabase
        .from("employees")
        .select("company_id")
        .eq("id", assignment.employee_id)
        .maybeSingle();

      if (employee?.company_id) {
        const { data: hc } = await supabase
          .from("holiday_config")
          .select("type, multiplier, working_days, use_attendance_working_days")
          .eq("company_id", employee.company_id);

        if (hc) {
          const newConfigs = { ...configs };
          for (const config of hc) {
            if (config.type in newConfigs) {
              (newConfigs as any)[config.type] = {
                multiplier: config.multiplier,
                working_days: config.working_days,
                use_attendance_working_days: config.use_attendance_working_days,
              };
            }
          }
          setConfigs(newConfigs);
        }
      }
    } catch (err) {
      console.error("ViewEmployeeSalaryAssignmentDialog Error:", err);
    } finally {
      setLoading(false);
    }
  }

  const result = useMemo(() => {
    if (!assignmentDetail) return null;

    return calculateSalaryBreakdown({
      monthlyCtc: Number(assignmentDetail.monthly_ctc || 0),
      basicPercent: Number(assignmentDetail.basic_percent || 0),
      basicFormula: assignmentDetail.basic_formula || null,
      calculationDirection: assignmentDetail.calculation_direction || null,
      isProRata: !!assignmentDetail.is_pro_rata,
      payableDays: Number(payableDays),
      workingDays: Number(workingDays),
      holidayConfig: Object.entries(configs).map(([type, config]) => ({
        type,
        ...config,
      })) as any,
      attendance: {
        overtimeHours: Number(overtimeHours),
        paidHolidays: Number(paidHolidays),
        paidLeaves: Number(paidLeaves),
        casualLeaves: Number(casualLeaves),
      },
      components: assignmentDetail.resolvedComponents,
      statutory: assignmentDetail.resolvedStatutory,
    });
  }, [
    assignmentDetail,
    workingDays,
    payableDays,
    overtimeHours,
    paidHolidays,
    paidLeaves,
    casualLeaves,
    configs,
  ]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1000px] p-0 overflow-hidden bg-white dark:bg-[#050505] rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border-none [&>button]:hidden">
        {loading ? (
          <div className="h-[400px] flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : !assignmentDetail || !result ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground font-medium">
            Failed to load salary details
          </div>
        ) : (
          <div className="flex flex-col max-h-[90vh]">
            <div className="relative overflow-hidden px-8 py-10 bg-gradient-to-br from-primary/10 via-background to-background dark:from-primary/20 dark:via-black dark:to-black border-b border-border/50">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Icon
                  name="rupees"
                  className="w-32 h-32 text-primary rotate-12"
                />
              </div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-foreground">
                    Salary Preview
                  </h2>
                  <p className="text-muted-foreground mt-1 font-medium">
                    {assignmentDetail.use_payment_template
                      ? `Template: ${assignmentDetail.payment_templates?.name}`
                      : "Custom Assignment"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1">
                    Monthly CTC
                  </p>
                  <p className="text-4xl font-black tabular-nums text-primary">
                    ₹
                    {result.monthlyCtc.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1">
                    Net Payable
                  </p>
                  <p className="text-4xl font-black tabular-nums text-primary">
                    ₹
                    {result.netAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 px-8 py-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-4 p-4 border border-dashed rounded-lg bg-primary/5">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      Working Days
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={workingDays}
                        onChange={(e) => setWorkingDays(Number(e.target.value))}
                        className="h-9 focus-visible:ring-primary/30 pl-8 bg-background"
                      />
                      <Icon
                        name="calendar"
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      Payable Days
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={payableDays}
                        onChange={(e) => setPayableDays(Number(e.target.value))}
                        className="h-9 focus-visible:ring-primary/30 pl-8 bg-background"
                      />
                      <Icon
                        name="check"
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      OT Hours
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={overtimeHours}
                        onChange={(e) =>
                          setOvertimeHours(Number(e.target.value))
                        }
                        className="h-9 focus-visible:ring-primary/30 pl-8 bg-background"
                      />
                      <Icon
                        name="clock"
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      OT Multiplier
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.1"
                        value={configs.overtime_hours.multiplier}
                        onChange={(e) =>
                          setConfigs((prev) => ({
                            ...prev,
                            overtime_hours: {
                              ...prev.overtime_hours,
                              multiplier: Number(e.target.value),
                            },
                          }))
                        }
                        className="h-9 focus-visible:ring-primary/30 pl-8 bg-background font-bold text-blue-600"
                      />
                      <Icon
                        name="update"
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border border-dashed rounded-lg bg-primary/5">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Paid Holidays
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={paidHolidays}
                        onChange={(e) =>
                          setPaidHolidays(Number(e.target.value))
                        }
                        className="h-9 bg-background flex-1"
                        placeholder="Days"
                      />
                      <Input
                        type="number"
                        step="0.1"
                        value={configs.paid_holidays.multiplier}
                        onChange={(e) =>
                          setConfigs((prev) => ({
                            ...prev,
                            paid_holidays: {
                              ...prev.paid_holidays,
                              multiplier: Number(e.target.value),
                            },
                          }))
                        }
                        className="h-9 bg-background w-20 text-center font-semibold text-emerald-600"
                        title="Multiplier"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Paid Leaves
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={paidLeaves}
                        onChange={(e) => setPaidLeaves(Number(e.target.value))}
                        className="h-9 bg-background flex-1"
                        placeholder="Days"
                      />
                      <Input
                        type="number"
                        step="0.1"
                        value={configs.paid_leaves.multiplier}
                        onChange={(e) =>
                          setConfigs((prev) => ({
                            ...prev,
                            paid_leaves: {
                              ...prev.paid_leaves,
                              multiplier: Number(e.target.value),
                            },
                          }))
                        }
                        className="h-9 bg-background w-20 text-center font-semibold text-emerald-600"
                        title="Multiplier"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Casual Leaves
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={casualLeaves}
                        onChange={(e) =>
                          setCasualLeaves(Number(e.target.value))
                        }
                        className="h-9 bg-background flex-1"
                        placeholder="Days"
                      />
                      <Input
                        type="number"
                        step="0.1"
                        value={configs.casual_leaves.multiplier}
                        onChange={(e) =>
                          setConfigs((prev) => ({
                            ...prev,
                            casual_leaves: {
                              ...prev.casual_leaves,
                              multiplier: Number(e.target.value),
                            },
                          }))
                        }
                        className="h-9 bg-background w-20 text-center font-semibold text-emerald-600"
                        title="Multiplier"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 px-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 h-9 text-xs font-semibold text-primary">
                    <Badge
                      variant="outline"
                      className={
                        result.adjustedPayableDays > result.workingDays
                          ? "text-emerald-600 border-emerald-200 bg-emerald-50 text-sm py-1"
                          : "text-amber-600 border-amber-200 bg-amber-50 text-sm py-1"
                      }
                    >
                      {result.adjustedPayableDays} Payable Days
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">Salary Breakdown</h3>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>Earnings</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.earnings.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell>
                                <div className="font-medium text-primary flex items-center gap-2">
                                  {e.name}
                                  {e.isStatutory && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] h-4 px-1"
                                    >
                                      Statutory
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {e.rule}
                                </div>
                                {e.displayLabel && (
                                  <div className="text-[10px] text-muted-foreground/70 italic mt-0.5">
                                    {e.displayLabel}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {e.amount.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted">
                            <TableCell className="font-semibold text-primary">
                              Gross Income
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-emerald-600">
                              {result.grossAmount.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>Deductions</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.deductions.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell>
                                <div className="font-medium text-primary flex items-center gap-2">
                                  {d.name}
                                  {d.isStatutory && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] h-4 px-1"
                                    >
                                      Statutory
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {d.rule}
                                </div>
                                {d.displayLabel && (
                                  <div className="text-[10px] text-muted-foreground/70 italic mt-0.5">
                                    {d.displayLabel}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-destructive">
                                {d.amount.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                          {result.deductions.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={2}
                                className="text-center text-muted-foreground py-4 text-sm"
                              >
                                No deductions
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow className="bg-muted">
                            <TableCell className="font-semibold text-primary">
                              Total Deductions
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-destructive">
                              {result.deductionsTotal.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>Employer Contribution</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>
                              <div className="font-medium text-primary">
                                Employer PF (13%)
                              </div>
                              <div className="text-xs text-muted-foreground">
                                EPF Matching (incl. EDLI & Admin)
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-amber-600">
                              {result.employerContribution.totalPfLiability.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="pl-6 border-l-2 border-primary/10">
                              <div className="text-sm font-medium text-primary/80">
                                Pension (EPS)
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {result.employerContribution.eps.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="pl-6 border-l-2 border-primary/10">
                              <div className="text-sm font-medium text-primary/80">
                                EPF Share
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {result.employerContribution.employerEpf.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="pl-6 border-l-2 border-primary/10">
                              <div className="text-sm font-medium text-primary/80">
                                EDLI (0.5%)
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {result.employerContribution.edli.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="pl-6 border-l-2 border-primary/10">
                              <div className="text-sm font-medium text-primary/80">
                                Admin Charges (0.5%)
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {result.employerContribution.admin.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <div className="font-medium text-primary">
                                Employer ESIC
                              </div>
                              <div className="text-xs text-muted-foreground">
                                3.25% of Gross
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-amber-600">
                              {result.employerContribution.esi.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow className="bg-muted">
                            <TableCell className="font-semibold text-primary">
                              Total Contribution
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-amber-600">
                              {result.employerContribution.total.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="py-8 bg-muted/30 dark:bg-black/50 border-t border-border/50 px-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1">
                    In Words
                  </p>
                  <p className="text-sm text-foreground font-medium capitalize italic">
                    {result.netAmountWords} rupees only
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-6 py-2 rounded-xl text-sm font-bold bg-foreground text-background hover:opacity-90 transition-opacity"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
