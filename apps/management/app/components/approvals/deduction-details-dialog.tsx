import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { formatDate } from "@canny_ecosystem/utils";

interface Deduction {
  salary_field_values: {
    amount: number;
    salary_entries: {
      payroll: {
        month: number;
        year: number;
        run_date: string;
      };
    };
  };
}

export function DeductionDetailsDialog({ deductions }: { deductions: any[] }) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs font-semibold hover:bg-muted"
        >
          View Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Icon name="receipt" className="h-5 w-5 text-primary" />
            Deduction Details
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {!deductions || deductions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground bg-muted/30 rounded-md">
              No deductions recorded yet.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-semibold text-foreground">
                      Date
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      Payroll Month
                    </TableHead>
                    <TableHead className="font-semibold text-foreground text-right">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductions.map((deduction, idx) => {
                    const salaryValues = deduction?.salary_field_values;
                    const payroll = salaryValues?.salary_entries?.payroll;

                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">
                          {payroll?.run_date
                            ? formatDate(payroll.run_date)
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {payroll?.month
                            ? `${months[payroll.month - 1]} ${payroll.year}`
                            : "--"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          ₹{salaryValues?.amount || 0}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
