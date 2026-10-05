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
import {
  numberToWords,
  calculateSalaryBreakdown,
} from "@canny_ecosystem/utils";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useMemo } from "react";

export function ViewPaymentTemplateComponentsDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
}) {
  if (!template) return null;

  const today = new Date();
  const latestVersion = (template.payment_template_versions || [])
    .filter(
      (v: any) => !v.effective_date || new Date(v.effective_date) <= today,
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];
  const components = latestVersion?.payment_template_components ?? [];
  const statutory = template.statutory || {};
  const result = useMemo(() => {
    return calculateSalaryBreakdown({
      monthlyCtc: Number(latestVersion?.monthly_ctc || 0),
      basicPercent: Number(latestVersion?.basic_percent || 0),
      isProRata: !!latestVersion?.is_pro_rata,
      payableDays: 26,
      workingDays: 26,
      components: components,
      statutory: statutory,
    });
  }, [latestVersion, components, statutory]);

  const { earnings, deductions, grossAmount, deductionsTotal, netAmount } =
    result;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1000px] p-0 overflow-hidden bg-white dark:bg-[#050505] rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border-none [&>button]:hidden">
        <div className="flex flex-col max-h-[90vh]">
          <div className="relative overflow-hidden px-8 py-10 bg-gradient-to-br from-primary/10 via-background to-background dark:from-primary/20 dark:via-black dark:to-black border-b border-border/50">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Icon
                name="column"
                className="w-32 h-32 text-primary rotate-12"
              />
            </div>
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  Template Breakdown
                </h2>
                <p className="text-muted-foreground mt-1 font-medium">
                  Configured components for {template.name}
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
            </div>
          </div>

          <ScrollArea className="flex-1 px-8 py-6">
            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Calculation Preview</h3>
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
                        {earnings.map((e: any) => (
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
                            {grossAmount.toLocaleString(undefined, {
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
                        {deductions.map((d: any) => (
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
                        {deductions.length === 0 && (
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
                            {deductionsTotal.toLocaleString(undefined, {
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
                  {numberToWords(netAmount)} rupees only
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right mr-4">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    Net Amount
                  </p>
                  <p className="text-2xl font-black text-primary">
                    ₹
                    {netAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
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
      </DialogContent>
    </Dialog>
  );
}
