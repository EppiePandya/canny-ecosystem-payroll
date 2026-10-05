import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { Field } from "@canny_ecosystem/ui/forms";
import { useFetcher } from "@remix-run/react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canny_ecosystem/ui/sheet";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { useState, useEffect } from "react";
import type { EmployeeDatabaseRow } from "@canny_ecosystem/supabase/types";
import { FormButtons } from "../../../form/form-buttons";
import { AttendanceSchema } from "@canny_ecosystem/utils";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export function SalaryEntryAttendance({
  triggerChild,
  attendance,
  editable,
  field,
  payrollId,
  employee,
  onSuccess,
}: {
  triggerChild: React.ReactNode;
  field:
    | "working_days"
    | "present_days"
    | "overtime_hours"
    | "paid_holidays"
    | "paid_leaves"
    | "casual_leaves";
  attendance: any;
  editable: boolean;
  payrollId: string;
  employee: EmployeeDatabaseRow;
  onSuccess?: (updatedEntry: any) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        asChild
        className={cn("cursor-pointer", !editable && "cursor-default")}
        onClick={() => setOpen(true)}
      >
        {triggerChild}
      </SheetTrigger>

      {open && (
        <SalaryEntryAttendanceContent
          attendance={attendance}
          editable={editable}
          field={field}
          payrollId={payrollId}
          employee={employee}
          setOpen={setOpen}
          onSuccess={onSuccess}
        />
      )}
    </Sheet>
  );
}

function SalaryEntryAttendanceContent({
  attendance,
  editable,
  field,
  payrollId,
  employee,
  setOpen,
  onSuccess,
}: {
  field:
    | "working_days"
    | "present_days"
    | "overtime_hours"
    | "paid_holidays"
    | "paid_leaves"
    | "casual_leaves";
  attendance: any;
  editable: boolean;
  payrollId: string;
  employee: EmployeeDatabaseRow;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSuccess?: (updatedEntry: any) => void;
}) {
  const name = `${employee?.first_name} ${employee?.middle_name ?? ""} ${
    employee?.last_name ?? ""
  }`;

  const { toast } = useToast();
  const fetcher = useFetcher<any>();
  const isSubmitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
      clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
      clearExactCacheEntry(cacheKeyPrefix.run_payroll);
    }
  }, [fetcher.state, payrollId]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.status === "success") {
        toast({
          title: "Success",
          description:
            fetcher.data.message || "Attendance updated successfully",
          variant: "success",
        });
        onSuccess?.(fetcher.data.updatedRow);
        setOpen(false);
      } else {
        toast({
          title: "Error",
          description: fetcher.data.message || "Failed to update attendance",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, onSuccess, setOpen, toast]);

  const [resetKey, setResetKey] = useState(Date.now());

  const [form, fields] = useForm({
    id: "UPDATE_ATTENDANCE",
    constraint: getZodConstraint(AttendanceSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: AttendanceSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: { ...attendance },
  });

  return (
    <SheetContent className="w-[450px] max-sm:w-full">
      <SheetHeader className="pb-6">
        <SheetTitle className="flex flex-col gap-1 text-left">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Update {field.replace("_", " ")}
          </span>
          <span className="text-primary text-2xl font-bold">{name}</span>
          <span className="text-muted-foreground text-xs font-medium">
            Employee Code: {employee?.employee_code ?? "--"}
          </span>
        </SheetTitle>
      </SheetHeader>

      <FormProvider context={form.context}>
        <fetcher.Form
          method="post"
          {...getFormProps(form)}
          action={`/payroll/run-payroll/${payrollId}/${attendance?.id}/update-salary-entry-attendance`}
          className="flex flex-col gap-4"
        >
          <input {...getInputProps(fields.id, { type: "hidden" })} />
          <input {...getInputProps(fields.employee_id, { type: "hidden" })} />
          <input {...getInputProps(fields.month, { type: "hidden" })} />

          <div className="grid grid-cols-2 gap-4">
            <Field
              key={`${resetKey}-working-days`}
              inputProps={{
                ...getInputProps(fields.working_days, { type: "number" }),
                readOnly: !editable,
                placeholder: "Enter working days",
                autoFocus: field === "working_days",
              }}
              labelProps={{
                children: "Working Days",
              }}
              errors={fields.working_days.errors}
            />

            <Field
              key={`${resetKey}-present`}
              inputProps={{
                ...getInputProps(fields.present_days, { type: "number" }),
                readOnly: !editable,
                placeholder: "Enter present days",
                autoFocus: field === "present_days",
              }}
              labelProps={{
                children: "Present Days",
              }}
              errors={fields.present_days.errors}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              key={`${resetKey}-paid-holidays`}
              inputProps={{
                ...getInputProps(fields.paid_holidays, { type: "number" }),
                readOnly: !editable,
                placeholder: "Enter paid holidays",
                autoFocus: field === "paid_holidays",
              }}
              labelProps={{
                children: "Paid Holidays",
              }}
              errors={fields.paid_holidays.errors}
            />

            <Field
              key={`${resetKey}-paid-leaves`}
              inputProps={{
                ...getInputProps(fields.paid_leaves, { type: "number" }),
                readOnly: !editable,
                placeholder: "Enter paid leaves",
                autoFocus: field === "paid_leaves",
              }}
              labelProps={{
                children: "Paid Leaves",
              }}
              errors={fields.paid_leaves.errors}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              key={`${resetKey}-casual-leaves`}
              inputProps={{
                ...getInputProps(fields.casual_leaves, { type: "number" }),
                readOnly: !editable,
                placeholder: "Enter casual leaves",
                autoFocus: field === "casual_leaves",
              }}
              labelProps={{
                children: "Casual Leaves",
              }}
              errors={fields.casual_leaves.errors}
            />

            <Field
              key={`${resetKey}-overtime`}
              inputProps={{
                ...getInputProps(fields.overtime_hours, { type: "number" }),
                readOnly: !editable,
                placeholder: "Enter overtime hours",
                autoFocus: field === "overtime_hours",
              }}
              labelProps={{
                children: "Overtime Hours",
              }}
              errors={fields.overtime_hours.errors}
            />
          </div>

          <SheetFooter className="pt-6">
            <FormButtons
              form={form}
              setResetKey={setResetKey}
              isSingle
              className={cn(!editable && "hidden")}
              isSubmitting={isSubmitting}
            />
          </SheetFooter>
        </fetcher.Form>
      </FormProvider>
    </SheetContent>
  );
}
