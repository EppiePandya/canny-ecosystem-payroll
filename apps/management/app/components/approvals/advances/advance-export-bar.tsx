import type { AdvanceDataType } from "@canny_ecosystem/supabase/queries";
import { Button } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { fixedDecimal, formatDateTime } from "@canny_ecosystem/utils";
import type { VisibilityState } from "@tanstack/react-table";
import Papa from "papaparse";
import { AdvancesColumnIdArray } from "./table/advances-table-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@canny_ecosystem/ui/table";

export function AdvanceExportBar({
  rows,
  data,
  className,
  columnVisibility,
  onCancel,
}: {
  rows: number;
  data: AdvanceDataType[];
  className: string;
  columnVisibility: VisibilityState;
  onCancel?: () => void;
}) {
  const totalAmount = data.reduce(
    (sum: number, { amount }) => sum + (Number(amount) ?? 0),
    0,
  );
  const toBeExportedData = data.map((element) => {
    const exportedData: {
      [key: string]: string | number | boolean;
    } = {};

    for (const key of AdvancesColumnIdArray) {
      if (columnVisibility[key] === false) continue;
      if (key === "employee_code") {
        exportedData[key] = element?.employees?.employee_code ?? "";
      } else if (key === "employee_name") {
        exportedData[key] =
          `${element?.employees?.first_name || ""} ${element?.employees?.middle_name ? `${element?.employees?.middle_name} ` : ""}${element?.employees?.last_name || ""}`.trim();
      } else if (key === "project_name") {
        const workDetail = (element?.employees?.work_details as any)?.[0];
        exportedData[key] = workDetail?.sites?.projects?.name ?? "";
      } else if (key === "site_name") {
        const workDetail = (element?.employees?.work_details as any)?.[0];
        exportedData[key] = workDetail?.sites?.name ?? "";
      } else if (key === "total_amount") {
        const amount = Number(element?.amount) || 0;
        exportedData[key] = amount;
      } else {
        exportedData[key] = (element as any)?.[key] as
          | string
          | boolean
          | number;
      }
    }
    return exportedData;
  });

  const handleExport = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    const csv = Papa.unparse(toBeExportedData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", `Advances - ${formatDateTime(Date.now())}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxMonths = data.reduce((max, element) => {
    const amount = Number(element?.amount) || 0;
    const totalAmount = amount;
    const emi = 0;
    const numMonths = 0;
    return Math.max(max, numMonths);
  }, 4);

  const months: string[] = [];
  for (let i = 0; i < maxMonths; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    months.push(
      d.toLocaleString("default", { month: "short" }) +
        "-" +
        d.getFullYear().toString().slice(2),
    );
  }

  const detailedData = data.map((element) => {
    const amount = Number(element?.amount) || 0;
    const totalAmount = amount;
    const received = (element?.advance_deduction || []).reduce(
      (acc: number, curr: any) =>
        acc + (Number(curr.salary_field_values?.amount) || 0),
      0,
    );
    const pending = totalAmount - received;
    const emi = 0;
    const numMonths = 0;

    const empName =
      `${element?.employees?.first_name || ""} ${element?.employees?.middle_name ? `${element?.employees?.middle_name} ` : ""}${element?.employees?.last_name || ""}`.trim();

    const monthColumns = months.reduce(
      (acc, month) => {
        acc[month] = 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      "EMPLOYEE CODE": (element as any)?.employees?.employee_code || "",
      "EMPLOYEE NAME": empName,
      "A/C NO": "",
      "ADVANCE AMOUNT": amount.toFixed(2),
      EMI: emi > 0 ? `(${emi}*${numMonths})` : "0",
      "RECOVER ADVANCE AMOUNT": received.toFixed(2),
      ...monthColumns,
      "TOTAL DEDUCTION ADVANCE AMOUNT": received.toFixed(2),
      "PENDING ADVANCE": pending.toFixed(2),
    };
  });

  const handleExportDetails = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    const csv = Papa.unparse(detailedData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute(
      "download",
      `Advance_Details_${formatDateTime(Date.now())}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className={cn(
        "z-40 fixed bottom-16  md:bottom-8 left-0 right-0 mx-auto h-14 w-max shadow-md rounded-full flex gap-10 justify-between items-center p-2 text-sm border dark:border-muted-foreground/30 bg-card text-card-foreground",
        className,
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
        <div className="h-full tracking-wide font-medium rounded-full hidden md:flex justify-between items-center px-6 border dark:border-muted-foreground/30 ">
          Amount: <span className="ml-1.5">{fixedDecimal(totalAmount)}</span>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="lg"
              className="h-full rounded-full border-primary text-primary hover:text-primary hover:bg-primary/10"
            >
              Export Details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Preview Advance Details</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto rounded border my-4 relative">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {detailedData.length > 0 &&
                      Object.keys(detailedData[0]).map((key) => (
                        <TableHead
                          key={key}
                          className="whitespace-nowrap font-bold text-black dark:text-white bg-background border-b"
                        >
                          {key}
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailedData.map((row, idx) => (
                    <TableRow key={idx}>
                      {Object.values(row).map((val, i) => (
                        <TableCell key={i} className="whitespace-nowrap">
                          {String(val)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {detailedData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
                        No details available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={handleExportDetails} variant="default">
                Download CSV
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button
          onClick={handleExport}
          variant="default"
          size="lg"
          className="h-full rounded-full"
        >
          Export
        </Button>
      </div>
    </div>
  );
}
