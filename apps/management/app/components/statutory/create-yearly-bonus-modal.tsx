import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Label } from "@canny_ecosystem/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { StatusButton } from "@canny_ecosystem/ui/status-button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Icon } from "@canny_ecosystem/ui/icon";

interface CreateYearlyBonusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payrolls: any[];
  bonusSettings: any;
}

export function CreateYearlyBonusModal({
  open,
  onOpenChange,
  payrolls,
  bonusSettings,
}: CreateYearlyBonusModalProps) {
  const { toast } = useToast();
  const fetcher = useFetcher<any>();
  const submitFetcher = useFetcher<any>();

  const [fromPayrollId, setFromPayrollId] = useState("");
  const [toPayrollId, setToPayrollId] = useState("");
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    new Set(),
  );
  const [eligibleEntries, setEligibleEntries] = useState<any[]>([]);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");

  const sortedPayrolls = [...payrolls].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const payrollOptions = sortedPayrolls.map((p) => ({
    label: `${p.title} (${p.month}/${p.year})`,
    value: p.id,
  }));

  useEffect(() => {
    if (fromPayrollId && toPayrollId && open) {
      const fromIndex = sortedPayrolls.findIndex((p) => p.id === fromPayrollId);
      const toIndex = sortedPayrolls.findIndex((p) => p.id === toPayrollId);
      if (fromIndex !== -1 && toIndex !== -1) {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const rangeIds = sortedPayrolls.slice(start, end + 1).map((p) => p.id);
        fetcher.submit(
          {
            intent: "get-eligible-employees",
            payrollIds: JSON.stringify(rangeIds),
          },
          { method: "POST" },
        );
      }
    }
  }, [fromPayrollId, toPayrollId, open]);

  useEffect(() => {
    if (fetcher.data && fetcher.data.employees) {
      setEligibleEntries(fetcher.data.employees);
      setSelectedEntries(new Set());
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (
      submitFetcher.state === "submitting" ||
      submitFetcher.state === "loading"
    ) {
      setStatus("pending");
    } else if (submitFetcher.state === "idle" && submitFetcher.data) {
      if (submitFetcher.data.status === "success") {
        setStatus("success");
        toast({
          title: "Success",
          description: "Yearly bonus records created successfully",
          variant: "success",
        });
        setTimeout(() => {
          onOpenChange(false);
          resetForm();
        }, 1500);
      } else if (submitFetcher.data.status === "error") {
        setStatus("error");
        toast({
          title: "Error",
          description: submitFetcher.data.error || "Failed to create records",
          variant: "destructive",
        });
        setTimeout(() => setStatus("idle"), 2000);
      }
    }
  }, [submitFetcher.state, submitFetcher.data]);

  const resetForm = () => {
    setFromPayrollId("");
    setToPayrollId("");
    setSelectedEntries(new Set());
    setEligibleEntries([]);
    setStatus("idle");
  };

  const groupedData = eligibleEntries.reduce(
    (acc, entry) => {
      if (!acc[entry.employee_id]) {
        acc[entry.employee_id] = {
          id: entry.employee_id,
          name: entry.name,
          code: entry.code,
          basic_salary: entry.basic_salary,
          percentage: entry.percentage,
          months: {},
        };
      }
      acc[entry.employee_id].months[entry.payroll_label] = entry;
      return acc;
    },
    {} as Record<string, any>,
  );

  const employeeRows = Object.values(groupedData);

  const uniqueMonths = Array.from(
    new Set(eligibleEntries.map((e) => e.payroll_label)),
  ).sort((a, b) => {
    const entryA = eligibleEntries.find((e) => e.payroll_label === a);
    const entryB = eligibleEntries.find((e) => e.payroll_label === b);
    return (entryA?.payroll_id || "").localeCompare(entryB?.payroll_id || "");
  });

  const toggleEntry = (id: string) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedEntries(newSelected);
  };

  const toggleEmployeeAll = (empId: string, entryIds: string[]) => {
    const newSelected = new Set(selectedEntries);
    const allSelected = entryIds.every((id) => newSelected.has(id));
    if (allSelected) entryIds.forEach((id) => newSelected.delete(id));
    else entryIds.forEach((id) => newSelected.add(id));
    setSelectedEntries(newSelected);
  };

  const toggleAll = () => {
    if (selectedEntries.size === eligibleEntries.length)
      setSelectedEntries(new Set());
    else setSelectedEntries(new Set(eligibleEntries.map((e) => e.id)));
  };

  const calculateBonus = (basicSalary: number, percentage: number) =>
    (basicSalary * Number(percentage)) / 100;

  const handleSubmit = () => {
    if (!fromPayrollId || !toPayrollId || selectedEntries.size === 0) {
      toast({
        title: "Error",
        description: "Please select range and employees",
        variant: "destructive",
      });
      return;
    }
    const data = eligibleEntries
      .filter((entry) => selectedEntries.has(entry.id))
      .map((entry) => ({
        employee_id: entry.employee_id,
        payroll_id: entry.payroll_id,
        bonus_amount: calculateBonus(
          Number(entry.basic_salary || 0),
          entry.percentage,
        ),
        employee_salary: Number(entry.basic_salary || 0),
        status: false,
      }));
    submitFetcher.submit(
      { intent: "create-yearly-bonus", data: JSON.stringify(data) },
      { method: "POST" },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* flex-col so header/footer are flex-none and middle scrolls */}
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] flex flex-col p-0 gap-0 border-white/5 bg-card/95 backdrop-blur-xl z-[50]">
        {/* HEADER — flex-none */}
        <DialogHeader className="flex-none p-6 pb-4 border-b border-white/5">
          <DialogTitle className="text-xl font-bold tracking-tight">
            Bulk Create Yearly Bonus
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Review and select bonus records in a matrix view across the selected
            range.
          </p>
        </DialogHeader>

        {/* BODY — flex-1 so it fills space between header and footer, flex-col for inner layout */}
        <div className="flex-1 min-h-0 flex flex-col gap-4 p-6 pb-4 overflow-visible">
          {/* Range pickers — flex-none */}
          <div className="flex-none grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded border border-white/5 relative z-30">
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                From Payroll
              </Label>
              <Select value={fromPayrollId} onValueChange={setFromPayrollId}>
                <SelectTrigger className="h-10 bg-background border-white/10">
                  <SelectValue placeholder="Starting Period" />
                </SelectTrigger>
                <SelectContent className="z-[9999] bg-card border-white/10 shadow-2xl">
                  {payrollOptions.length > 0 ? (
                    payrollOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No payrolls available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                To Payroll
              </Label>
              <Select value={toPayrollId} onValueChange={setToPayrollId}>
                <SelectTrigger className="h-10 bg-background border-white/10">
                  <SelectValue placeholder="Ending Period" />
                </SelectTrigger>
                <SelectContent className="z-[9999] bg-card border-white/10 shadow-2xl">
                  {payrollOptions.length > 0 ? (
                    payrollOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No payrolls available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Matrix label — flex-none */}
          <div className="flex-none flex items-center justify-between px-1">
            <Label className="text-[11px] font-semibold text-foreground tracking-tight">
              Eligible Matrix
            </Label>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase text-primary tracking-widest bg-primary/10 px-2 py-0.5 rounded-sm">
                {selectedEntries.size} SELECTED
              </span>
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                {eligibleEntries.length} TOTAL
              </span>
            </div>
          </div>

          {/* TABLE — flex-1 min-h-0 so it fills remaining body space and scrolls */}
          <div className="flex-1 min-h-0 overflow-auto border border-white/5 rounded bg-card/50 shadow-sm relative z-10">
            <table className="w-full min-w-max text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-background border-b border-white/5">
                <tr className="h-[40px]">
                  <th className="w-[50px] px-4 text-left">
                    <Checkbox
                      checked={
                        eligibleEntries.length > 0 &&
                        selectedEntries.size === eligibleEntries.length
                      }
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="w-[120px] px-4 text-[10px] font-medium text-muted-foreground tracking-widest uppercase text-left">
                    Code
                  </th>
                  <th className="w-[200px] px-4 text-[10px] font-medium text-muted-foreground tracking-widest uppercase text-left">
                    Employee Name
                  </th>
                  {uniqueMonths.map((month) => (
                    <th
                      key={month}
                      className="px-6 text-center text-[10px] font-medium text-muted-foreground tracking-widest uppercase"
                    >
                      {month.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fetcher.state === "loading" ||
                fetcher.state === "submitting" ? (
                  <tr>
                    <td
                      colSpan={uniqueMonths.length + 3}
                      className="text-center py-24"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                          Scanning...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : employeeRows.length > 0 ? (
                  employeeRows.map((emp: any) => {
                    const empEntryIds = Object.values(emp.months).map(
                      (m: any) => m.id,
                    );
                    const allEmpSelected = empEntryIds.every((id) =>
                      selectedEntries.has(id),
                    );
                    return (
                      <tr
                        key={emp.id}
                        className="border-b border-white/5 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={allEmpSelected}
                            onCheckedChange={() =>
                              toggleEmployeeAll(emp.id, empEntryIds)
                            }
                          />
                        </td>
                        <td className="w-[120px] min-w-[120px] max-w-[120px] px-4 py-3 text-sm font-medium text-primary truncate overflow-hidden" title={emp.code}>
                          {emp.code}
                        </td>
                        <td className="w-[200px] min-w-[200px] max-w-[200px] px-4 py-3 text-sm font-medium text-primary truncate overflow-hidden" title={emp.name}>
                          {emp.name}
                        </td>
                        {uniqueMonths.map((month) => {
                          const entry = emp.months[month];
                          if (!entry) {
                            return (
                              <td
                                key={month}
                                className="text-center px-4 opacity-10"
                              >
                                <span className="text-[10px] font-mono">-</span>
                              </td>
                            );
                          }
                          const isSelected = selectedEntries.has(entry.id);
                          const amount = calculateBonus(
                            Number(entry.basic_salary),
                            entry.percentage,
                          );
                          return (
                            <td
                              key={month}
                              className={cn(
                                "relative p-0 border-x border-white/5 transition-colors cursor-pointer",
                                isSelected
                                  ? "bg-primary/10"
                                  : "hover:bg-muted/50",
                              )}
                              onClick={() => toggleEntry(entry.id)}
                            >
                              <div className="flex items-center justify-center py-3 min-h-[45px]">
                                <span
                                  className={cn(
                                    "text-xs font-semibold tabular-nums transition-colors",
                                    isSelected ? "text-primary" : "text-white",
                                  )}
                                >
                                  ₹
                                  {amount.toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={uniqueMonths.length + 3}
                      className="text-center py-32 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-3 opacity-20">
                        <Icon name="info-circled" className="h-5 w-5" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest">
                            No candidates found
                          </span>
                          <p className="text-[10px] max-w-[200px] mx-auto mt-1">
                            Select a payroll range to view eligibility.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER — flex-none, always visible */}
        <DialogFooter className="flex-none p-6 pt-4 gap-3 border-t border-white/5">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 px-6 font-semibold text-xs"
          >
            Cancel
          </Button>
          <StatusButton
            status={
              status === "pending"
                ? "pending"
                : status === "success"
                  ? "success"
                  : "idle"
            }
            onClick={handleSubmit}
            disabled={status !== "idle" || selectedEntries.size === 0}
            className={cn(
              "h-10 px-8 transition-all min-w-[160px] font-semibold text-xs",
              status === "success" && "bg-green-600 hover:bg-green-600",
            )}
          >
            {status === "idle" && `Create ${selectedEntries.size} Selected`}
            {status === "pending" && "Processing..."}
            {status === "success" && "Done!"}
          </StatusButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
