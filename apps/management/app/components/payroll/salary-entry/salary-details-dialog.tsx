import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { roundToNearest } from "@canny_ecosystem/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";

interface SalaryComponent {
  id: string;
  name: string;
  amount: number;
  rule: string;
  isStatutory: boolean;
  displayLabel?: string;
}

interface CalculationResult {
  monthlyCtc: number;
  basicPercent: number;
  basicAmount: number;
  basicDailyRate: number;
  earnings: SalaryComponent[];
  deductions: SalaryComponent[];
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  netAmountWords: string;
  payableDays: number;
  workingDays: number;
}

export function SalaryDetailsDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any;
}) {
  const calculation: CalculationResult = data?.calculation;
  const employee = data?.employee;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex flex-col">
            <span>Salary Breakdown</span>
            <span className="text-sm font-normal text-muted-foreground mt-1">
              {(`${employee?.first_name || ""} ${employee?.middle_name || ""} ${employee?.last_name || ""}`).trim() || employee?.name || "N/A"}
              {employee?.employee_code ? ` (${employee.employee_code})` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!calculation ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-lg font-medium">
              No calculation data available.
            </p>
            <p className="text-sm">
              This employee might not have a salary assignment or payroll
              components configured.
            </p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <section>
              <h3 className="text-lg font-semibold mb-2 border-b pb-1">
                Attendance & Basis
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-3 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">
                    Working Days
                  </p>
                  <p className="font-medium">{calculation.workingDays}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">
                    Present Days
                  </p>
                  <p className="font-medium">{data.present_days ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">
                    Payable Days
                  </p>
                  <p className="font-medium">{calculation.payableDays}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">
                    Monthly CTC
                  </p>
                  <p className="font-medium">
                    ₹{roundToNearest(calculation.monthlyCtc)}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-2 border-b pb-1 text-green-700">
                Earnings
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Calculation / Rule</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculation.earnings.map((earning) => (
                    <TableRow key={earning.id}>
                      <TableCell className="font-medium">
                        {earning.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {earning.displayLabel || earning.rule}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₹{roundToNearest(earning.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-green-50/50">
                    <TableCell colSpan={2} className="font-bold">
                      Gross Amount
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-700">
                      ₹{roundToNearest(calculation.grossAmount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-2 border-b pb-1 text-destructive">
                Deductions
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Calculation / Rule</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculation.deductions.length > 0 ? (
                    calculation.deductions.map((deduction) => (
                      <TableRow key={deduction.id}>
                        <TableCell className="font-medium text-destructive">
                          {deduction.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {deduction.displayLabel || deduction.rule}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹{roundToNearest(deduction.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-muted-foreground py-4"
                      >
                        No deductions
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-destructive/5">
                    <TableCell colSpan={2} className="font-bold">
                      Total Deductions
                    </TableCell>
                    <TableCell className="text-right font-bold text-destructive">
                      ₹{roundToNearest(calculation.deductionsTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>

            <section className="bg-primary/5 p-4 rounded-xl border border-primary/20">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-primary">
                    Net Payable Amount
                  </p>
                  <p className="text-xs text-muted-foreground italic capitalize">
                    {calculation.netAmountWords}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-primary">
                    ₹{roundToNearest(calculation.netAmount)}
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
