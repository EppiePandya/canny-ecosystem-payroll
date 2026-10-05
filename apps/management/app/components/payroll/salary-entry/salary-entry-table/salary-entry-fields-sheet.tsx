import { useFetcher } from "@remix-run/react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canny_ecosystem/ui/sheet";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useState, useEffect } from "react";
import type { EmployeeDatabaseRow } from "@canny_ecosystem/supabase/types";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { Label } from "@canny_ecosystem/ui/label";
import { Input } from "@canny_ecosystem/ui/input";
import { Button } from "@canny_ecosystem/ui/button";
import { roundValue } from "@canny_ecosystem/utils";

export function SalaryEntryFieldsSheet({
  triggerChild,
  employee,
  editable,
  payrollId,
  monthlyAttendanceId,
  salaryEntryId,
  uniqueFields,
  salaryFieldValues,
  allRowsData,
  activeFieldName,
  onSuccess,
}: {
  triggerChild: React.ReactNode;
  employee: EmployeeDatabaseRow;
  editable: boolean;
  payrollId: string;
  monthlyAttendanceId: string;
  salaryEntryId?: string;
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  salaryFieldValues: any[];
  allRowsData: any[];
  activeFieldName?: string;
  onSuccess?: (updatedEntry: any) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        asChild
        className={cn("cursor-pointer py-2")}
        onClick={() => setOpen(true)}
      >
        {triggerChild}
      </SheetTrigger>
      {open && (
        <SalaryEntryFieldsSheetContent
          employee={employee}
          editable={editable}
          payrollId={payrollId}
          monthlyAttendanceId={monthlyAttendanceId}
          salaryEntryId={salaryEntryId}
          uniqueFields={uniqueFields}
          salaryFieldValues={salaryFieldValues}
          allRowsData={allRowsData}
          activeFieldName={activeFieldName}
          setOpen={setOpen}
          onSuccess={onSuccess}
        />
      )}
    </Sheet>
  );
}

function SalaryEntryFieldsSheetContent({
  employee,
  editable,
  payrollId,
  monthlyAttendanceId,
  salaryEntryId,
  uniqueFields,
  salaryFieldValues,
  allRowsData,
  activeFieldName,
  setOpen,
  onSuccess,
}: {
  employee: EmployeeDatabaseRow;
  editable: boolean;
  payrollId: string;
  monthlyAttendanceId: string;
  salaryEntryId?: string;
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  salaryFieldValues: any[];
  allRowsData: any[];
  activeFieldName?: string;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSuccess?: (updatedEntry: any) => void;
}) {
  const name = `${employee?.first_name} ${employee?.middle_name ?? ""} ${employee?.last_name ?? ""
    }`;

  const { toast } = useToast();
  const fetcher = useFetcher<any>();
  const isSubmitting = fetcher.state === "submitting";

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of uniqueFields) {
      const valObj = salaryFieldValues?.find(
        (entry: any) =>
          entry.payroll_fields?.name?.trim().toLowerCase() ===
          field.name.trim().toLowerCase(),
      );
      initial[field.name] = String(
        valObj?.amount != null ? roundValue(valObj.amount) : 0,
      );
    }
    return initial;
  });

  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  const handleFieldChange = (fieldName: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.add(fieldName);
      return next;
    });
  };

  useEffect(() => {
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
      clearExactCacheEntry(cacheKeyPrefix.run_payroll);
    }
  }, [fetcher.state, payrollId]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        toast({
          title: "Success",
          description:
            fetcher.data.message || "Salary Entry updated successfully",
          variant: "success",
        });
        onSuccess?.(fetcher.data.updatedEntry);
        setOpen(false);
      } else {
        toast({
          title: "Error",
          description:
            fetcher.data.message || "Failed to update salary entry values",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, onSuccess, setOpen, toast]);

  useEffect(() => {
    if (activeFieldName) {
      setTimeout(() => {
        const el = document.getElementById(`field-input-${activeFieldName}`);
        if (el) {
          el.focus();
          (el as HTMLInputElement).select();
        }
      }, 50);
    }
  }, [activeFieldName]);

  const earningFields = uniqueFields.filter((f) => f.type === "earning");
  const deductionFields = uniqueFields.filter((f) => f.type === "deduction");

  const totalEarnings = earningFields.reduce((sum, field) => {
    return sum + (parseFloat(values[field.name]) || 0);
  }, 0);

  const totalDeductions = deductionFields.reduce((sum, field) => {
    return sum + (parseFloat(values[field.name]) || 0);
  }, 0);

  const netPay = totalEarnings - totalDeductions;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editable) return;

    const dirtyFieldsList = uniqueFields.filter((field) => dirtyFields.has(field.name));

    if (dirtyFieldsList.length === 0) {
      setOpen(false);
      return;
    }

    const fieldsData = {
      monthly_attendance_id: monthlyAttendanceId,
      salary_entries_id: salaryEntryId,
      fields: dirtyFieldsList.map((field) => {
        const valObj = salaryFieldValues?.find(
          (entry: any) =>
            entry.payroll_fields?.name?.trim().toLowerCase() ===
            field.name.trim().toLowerCase(),
        );

        let payrollFieldTemplate = valObj?.payroll_fields;
        if (!payrollFieldTemplate) {
          for (const item of allRowsData) {
            const found = item.salary_entries?.salary_field_values?.find(
              (entry: any) =>
                entry.payroll_fields?.name?.trim().toLowerCase() ===
                field.name.trim().toLowerCase(),
            );
            if (found?.payroll_fields) {
              payrollFieldTemplate = found.payroll_fields;
              break;
            }
          }
        }

        return {
          payrollFields_id: payrollFieldTemplate?.id,
          salaryFieldValues_id: valObj?.id,
          name: field.name,
          type: field.type,
          amount: roundValue(parseFloat(values[field.name]) || 0),
        };
      }),
    };

    const formData = new FormData();
    formData.append("fieldsData", JSON.stringify(fieldsData));

    fetcher.submit(formData, {
      method: "POST",
      action: `/payroll/run-payroll/${payrollId}/upsert-salary-entry-value`,
    });
  };

  return (
    <SheetContent className="flex flex-col w-[650px] max-sm:w-full h-full p-0">
      <SheetHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
        <SheetTitle className="flex justify-between items-start">
          <div>
            <h1 className="text-primary text-2xl font-bold tracking-tight">
              {name}
            </h1>
            <h4 className="my-1 text-muted-foreground text-xs font-medium">
              Employee Code: {employee?.employee_code ?? "--"}
            </h4>
          </div>
        </SheetTitle>

        {/* Real-time totals card container */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-2">
          <div className="flex flex-col p-3 bg-green-50/50 border border-green-100 rounded-xl">
            <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">
              Total Earnings
            </span>
            <span className="text-base font-bold text-green-600 mt-1">
              ₹
              {totalEarnings.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex flex-col p-3 bg-destructive/5 border border-destructive/10 rounded-xl">
            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">
              Total Deductions
            </span>
            <span className="text-base font-bold text-destructive mt-1">
              ₹
              {totalDeductions.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex flex-col p-3 bg-primary/5 border border-primary/10 rounded-xl">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
              Net Pay
            </span>
            <span className="text-base font-bold text-primary mt-1">
              ₹
              {netPay.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-8">
            {/* Earnings Column */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-green-600 uppercase tracking-widest border-b pb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Earnings
              </h3>
              {earningFields.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No earnings fields defined
                </p>
              ) : (
                <div className="space-y-4">
                  {earningFields.map((field) => (
                    <div className="flex flex-col gap-1.5" key={field.name}>
                      <Label
                        htmlFor={`field-input-${field.name}`}
                        className="text-xs font-semibold text-foreground capitalize"
                      >
                        {field.name.replace(/_/g, " ")}
                      </Label>
                      <Input
                        id={`field-input-${field.name}`}
                        type="number"
                        step="any"
                        value={values[field.name]}
                        onChange={(e) =>
                          handleFieldChange(field.name, e.target.value)
                        }
                        disabled={!editable}
                        className="h-10 text-sm focus-visible:ring-1 focus-visible:ring-primary"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deductions Column */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-destructive uppercase tracking-widest border-b pb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                Deductions
              </h3>
              {deductionFields.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No deductions fields defined
                </p>
              ) : (
                <div className="space-y-4">
                  {deductionFields.map((field) => (
                    <div className="flex flex-col gap-1.5" key={field.name}>
                      <Label
                        htmlFor={`field-input-${field.name}`}
                        className="text-xs font-semibold text-foreground capitalize"
                      >
                        {field.name.replace(/_/g, " ")}
                      </Label>
                      <Input
                        id={`field-input-${field.name}`}
                        type="number"
                        step="any"
                        value={values[field.name]}
                        onChange={(e) =>
                          handleFieldChange(field.name, e.target.value)
                        }
                        disabled={!editable}
                        className="h-10 text-sm focus-visible:ring-1 focus-visible:ring-primary"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="mt-auto flex-shrink-0 px-6 py-4 border-t bg-muted/30 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          {editable && (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
