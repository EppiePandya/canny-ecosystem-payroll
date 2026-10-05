import {
  useForm,
  getFormProps,
  getInputProps,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod";
import { HolidayConfigSchema } from "@canny_ecosystem/utils";
import type { HolidayConfigDatabaseRow } from "@canny_ecosystem/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Field, CheckboxField } from "@canny_ecosystem/ui/forms";
import { Button } from "@canny_ecosystem/ui/button";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export function HolidayConfigDialog({
  open,
  onOpenChange,
  type,
  label,
  record,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: string;
  label: string;
  record?: HolidayConfigDatabaseRow;
  companyId: string;
}) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const { toast } = useToast();

  const [form, fields] = useForm({
    id: `holiday-config-${type}`,
    constraint: getZodConstraint(HolidayConfigSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: HolidayConfigSchema });
    },
    defaultValue: {
      id: record?.id,
      company_id: companyId,
      type: type as any,
      multiplier: record?.multiplier || 1,
      working_days: record?.working_days ?? 30,
      use_attendance_working_days: record?.use_attendance_working_days ?? true,
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const useAttendanceControl = useInputControl(
    fields.use_attendance_working_days as any,
  );
  const isUseAttendanceChecked =
    useAttendanceControl.value === "on" ||
    useAttendanceControl.value === "true" ||
    (useAttendanceControl.value === undefined &&
      (record?.use_attendance_working_days ?? true));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as any;
      if (data.error) {
        toast({
          title: "Error",
          description: data.error.message || "Something went wrong",
          variant: "destructive",
        });
      } else if (!data.status || data.status === "success") {
        clearCacheEntry(cacheKeyPrefix.attendance);
        revalidator.revalidate();
        toast({
          title: "Success",
          description: `Holiday config for ${label} updated successfully`,
        });
        onOpenChange(false);
      }
    }
  }, [fetcher.state, fetcher.data, toast, label, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]  p-4">
        <DialogHeader>
          <DialogTitle>
            {record ? "Edit" : "Set"} {label} Configuration
          </DialogTitle>
          <DialogDescription className="text-sm leading-tight">
            Configure the multiplier value and working days for{" "}
            {label.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form
          method="post"
          {...getFormProps(form)}
          className="space-y-2"
        >
          <input type="hidden" name="_action" value="upsert-holiday-config" />
          <input {...getInputProps(fields.id, { type: "hidden" })} />
          <input {...getInputProps(fields.company_id, { type: "hidden" })} />
          <input {...getInputProps(fields.type, { type: "hidden" })} />

          <Field
            labelProps={{ children: "Multiplier Value" }}
            inputProps={{
              ...getInputProps(fields.multiplier, { type: "number" }),
              placeholder: "e.g. 1, 2, 5",
            }}
            errors={fields.multiplier.errors}
          />

          <CheckboxField
            labelProps={{ children: "Use Attendance Working Days" }}
            buttonProps={{
              ...getInputProps(fields.use_attendance_working_days, {
                type: "checkbox",
              }),
              checked: isUseAttendanceChecked,
              onCheckedChange: (checked) => {
                useAttendanceControl.change(checked ? "on" : "");
              },
            }}
            errors={fields.use_attendance_working_days.errors}
          />

          <Field
            labelProps={{ children: "Custom Working Days" }}
            inputProps={{
              ...getInputProps(fields.working_days, { type: "number" }),
              placeholder: "e.g. 26, 30",
              disabled: isUseAttendanceChecked,
            }}
            errors={fields.working_days.errors}
          />
          <p className="text-[10px] text-muted-foreground -mt-2 px-1">
            Note: If "Use Attendance Working Days" is checked, this value will
            be ignored and set to null.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
