import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { Field, SearchableSelectField } from "@canny_ecosystem/ui/forms";
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
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { FormButtons } from "../../../form/form-buttons";
import {
  componentTypeArray,
  replaceUnderscore,
  SalaryEntrySchema,
  transformStringArrayIntoOptions,
  roundValue,
} from "@canny_ecosystem/utils";
import { useState, useEffect } from "react";
import type { EmployeeDatabaseRow } from "@canny_ecosystem/supabase/types";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export function SalaryEntrySheet({
  triggerChild,
  salaryEntry,
  employee,
  editable,
  payrollId,
  payrollFieldTemplate,
  monthlyAttendanceId,
  salaryEntryId,
  onSuccess,
  isMonthlyCtc,
}: {
  triggerChild: React.ReactNode;
  salaryEntry: any;
  employee: EmployeeDatabaseRow;
  editable: boolean;
  payrollId: string;
  payrollFieldTemplate?: any;
  monthlyAttendanceId?: string;
  salaryEntryId?: string;
  onSuccess?: (updatedEntry: any) => void;
  isMonthlyCtc?: boolean;
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
        <SalaryEntrySheetContent
          salaryEntry={salaryEntry}
          employee={employee}
          editable={editable}
          payrollId={payrollId}
          payrollFieldTemplate={payrollFieldTemplate}
          monthlyAttendanceId={monthlyAttendanceId}
          salaryEntryId={salaryEntryId}
          setOpen={setOpen}
          onSuccess={onSuccess}
          isMonthlyCtc={isMonthlyCtc}
        />
      )}
    </Sheet>
  );
}

function SalaryEntrySheetContent({
  salaryEntry,
  employee,
  editable,
  payrollId,
  payrollFieldTemplate,
  monthlyAttendanceId,
  salaryEntryId,
  setOpen,
  onSuccess,
  isMonthlyCtc,
}: {
  salaryEntry: any;
  employee: EmployeeDatabaseRow;
  editable: boolean;
  payrollId: string;
  payrollFieldTemplate?: any;
  monthlyAttendanceId?: string;
  salaryEntryId?: string;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSuccess?: (updatedEntry: any) => void;
  isMonthlyCtc?: boolean;
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
      if (fetcher.data.success) {
        toast({
          title: "Success",
          description:
            fetcher.data.message || "Salary Entry updated successfully",
          variant: "success",
        });
        onSuccess?.(fetcher.data.updatedEntry);
        setOpen(false);
      } else if (
        fetcher.data.status === "error" ||
        fetcher.data.success === false
      ) {
        toast({
          title: "Error",
          description: fetcher.data.message || "Failed to update salary entry",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, onSuccess, setOpen, toast]);

  const [resetKey, setResetKey] = useState(Date.now());

  const typeOptions = transformStringArrayIntoOptions(
    componentTypeArray as unknown as string[],
  );

  const formattedDefaultValue = {
    amount: salaryEntry?.amount != null ? roundValue(salaryEntry.amount) : 0,
    name: isMonthlyCtc
      ? "Monthly CTC"
      : salaryEntry?.payroll_fields?.name ?? payrollFieldTemplate?.name ?? "",
    type: isMonthlyCtc
      ? "earning"
      : typeOptions.find(
          (opt) =>
            opt.value ===
            (salaryEntry?.payroll_fields?.type ?? payrollFieldTemplate?.type),
        )?.value ?? "",
  };

  const [form, fields] = useForm({
    id: "UPDATE_SALARY_ENTRY",
    constraint: getZodConstraint(SalaryEntrySchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: SalaryEntrySchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...formattedDefaultValue,
      salaryFieldValues_id: salaryEntry?.id,
      payrollFields_id:
        salaryEntry?.payroll_fields?.id ?? payrollFieldTemplate?.id,
      payroll_id: payrollId,
      monthly_attendance_id: monthlyAttendanceId,
      salary_entries_id: salaryEntryId,
    },
  });

  return (
    <SheetContent className="flex flex-col w-[600px] max-sm:w-full h-full">
      <SheetHeader className="px-6 pt-4 pb-8 flex-shrink-0">
        <SheetTitle className="flex justify-between">
          <div>
            <h1 className="text-primary text-3xl">{name}</h1>
            <h4 className="my-1 text-muted-foreground text-sm">
              Employee Code: {employee?.employee_code ?? "--"}
            </h4>
          </div>

          <div className="flex flex-col items-end justify-around">
            <h2 className="text-xl text-muted-foreground">Net Pay</h2>
            <p className="font-bold">Rs {salaryEntry?.amount}</p>
          </div>
        </SheetTitle>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <FormProvider context={form.context}>
          <fetcher.Form
            method="POST"
            {...getFormProps(form)}
            className="flex flex-col"
            action={`/payroll/run-payroll/${payrollId}/upsert-salary-entry-value`}
          >
            <input
              {...getInputProps(fields.salaryFieldValues_id, {
                type: "hidden",
              })}
            />
            <input
              {...getInputProps(fields.payrollFields_id, { type: "hidden" })}
            />
            <input {...getInputProps(fields.payroll_id, { type: "hidden" })} />
            <input
              {...getInputProps(fields.monthly_attendance_id, {
                type: "hidden",
              })}
            />
            <input
              {...getInputProps(fields.salary_entries_id, { type: "hidden" })}
            />

            {isMonthlyCtc ? (
              <>
                <input type="hidden" name="name" value="Monthly CTC" />
                <input type="hidden" name="type" value="earning" />
                <input type="hidden" name="is_monthly_ctc" value="true" />
              </>
            ) : (
              <>
                <Field
                  inputProps={{
                    ...getInputProps(fields.name, { type: "text" }),
                    placeholder: "Enter field name",

                    readOnly: !editable,
                  }}
                  labelProps={{
                    children: "Field Name",
                  }}
                  errors={fields.name.errors}
                />
                <SearchableSelectField
                  key={resetKey + 1}
                  className="capitalize"
                  options={transformStringArrayIntoOptions(
                    componentTypeArray as unknown as string[],
                  )}
                  inputProps={{
                    ...getInputProps(fields.type, { type: "text" }),
                    readOnly: !editable,
                  }}
                  placeholder={`Select ${replaceUnderscore(fields.type.name)}`}
                  labelProps={{
                    children: replaceUnderscore(fields.type.name),
                  }}
                  errors={fields.type.errors}
                />
              </>
            )}
            <Field
              inputProps={{
                ...getInputProps(fields.amount, { type: "number" }),
                autoFocus: true,
                placeholder: "Enter amount",

                readOnly: !editable,
              }}
              labelProps={{
                children: isMonthlyCtc ? "Monthly CTC Amount" : "Amount",
              }}
              errors={fields.amount.errors}
            />
          </fetcher.Form>
        </FormProvider>
      </div>
      <SheetFooter className="mt-auto flex-shrink-0 pl-6">
        <FormButtons
          form={form}
          setResetKey={setResetKey}
          isSingle={true}
          className={cn(!editable && "hidden")}
          isSubmitting={isSubmitting}
        />
      </SheetFooter>
    </SheetContent>
  );
}
