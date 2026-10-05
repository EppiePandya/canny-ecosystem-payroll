import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import { useUser } from "@/utils/user";
import type { CompanyConfigDatabaseRow } from "@canny_ecosystem/supabase/types";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Field, SearchableSelectField } from "@canny_ecosystem/ui/forms";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  deepEqualCheck,
  hasPermission,
  updateRole,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import {
  useForm,
  getFormProps,
  getInputProps,
  FormProvider,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import { z } from "zod";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export const COMPANY_CONFIG = "company-config";

const monthOptions = [
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
];

const CompanyConfigFormSchema = z.object({
  company_id: z.string().uuid(),
  company_bonus_start_month: z.preprocess(
    (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10)),
    z.number().int().min(1).max(12).nullable().optional(),
  ),
  company_bonus_end_month: z.preprocess(
    (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10)),
    z.number().int().min(1).max(12).nullable().optional(),
  ),
  invoice_prefix: z.string().optional().nullable(),
});

export const CompanyConfig = ({
  configValues,
  companyId,
  companyType,
}: {
  configValues: Partial<CompanyConfigDatabaseRow> | null;
  companyId: string;
  companyType?: string;
}) => {
  const { role } = useUser();
  const fetcher = useFetcher<any>();
  const { toast } = useToast();
  const [resetKey, setResetKey] = useState(Date.now());

  const defaultValue = {
    company_id: companyId,
    company_bonus_start_month:
      configValues?.company_bonus_start_month != null
        ? String(configValues.company_bonus_start_month)
        : "",
    company_bonus_end_month:
      configValues?.company_bonus_end_month != null
        ? String(configValues.company_bonus_end_month)
        : "",
    invoice_prefix: configValues?.invoice_prefix ?? "",
  };

  const [form, fields] = useForm({
    id: COMPANY_CONFIG,
    constraint: getZodConstraint(CompanyConfigFormSchema),
    lastResult: fetcher.data?.result,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: CompanyConfigFormSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue,
  });

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (
        fetcher.data.status === 200 ||
        fetcher.data.status === 201 ||
        fetcher.data.status === "success" ||
        !fetcher.data.error
      ) {
        toast({
          title: "Success",
          description: "Company configuration updated successfully",
        });
        setResetKey(Date.now());
        clearExactCacheEntry(cacheKeyPrefix.company_config);
        clearExactCacheEntry(cacheKeyPrefix.general);
      } else {
        toast({
          title: "Error",
          description:
            fetcher.data.error?.message || "Failed to update configuration",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, toast]);

  return (
    <FormProvider context={form.context}>
      <fetcher.Form
        method="POST"
        {...getFormProps(form)}
        action={`/${companyId}/update-company-config`}
        key={resetKey}
      >
        <Card>
          <CardHeader className="max-sm:text-sm">
            <CardTitle>Company Config</CardTitle>
            <CardDescription className="max-sm:text-xs">
              Configure your invoice prefix and statutory bonus period.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <input {...getInputProps(fields.company_id, { type: "hidden" })} />
            <Field
              className={cn(companyType === "sub_contractor" && "hidden")}
              labelProps={{ children: "Invoice Prefix" }}
              inputProps={{
                ...getInputProps(fields.invoice_prefix, { type: "text" }),
                placeholder: "Enter invoice prefix",
                readOnly: !hasPermission(
                  role,
                  `${updateRole}:${attribute.settingGeneral}`,
                ),
              }}
              errors={fields.invoice_prefix.errors}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 items-center justify-center md:gap-x-8">
              <SearchableSelectField
                key={resetKey}
                labelProps={{ children: "Bonus Start Month" }}
                className="w-full capitalize flex-1"
                options={monthOptions}
                inputProps={{
                  ...getInputProps(fields.company_bonus_start_month, {
                    type: "text",
                  }),
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                placeholder="Select bonus start month"
                errors={fields.company_bonus_start_month.errors}
              />
              <SearchableSelectField
                key={resetKey + 1}
                labelProps={{ children: "Bonus End Month" }}
                className="w-full capitalize flex-1"
                options={monthOptions}
                inputProps={{
                  ...getInputProps(fields.company_bonus_end_month, {
                    type: "text",
                  }),
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                placeholder="Select bonus end month"
                errors={fields.company_bonus_end_month.errors}
              />
            </div>
          </CardContent>
          <CardFooter
            className={cn(
              "border-t pt-6 flex justify-between",
              !hasPermission(
                role,
                `${updateRole}:${attribute.settingGeneral}`,
              ) && "hidden",
            )}
          >
            <div className="max-sm:text-sm">
              Set the statutory bonus period (e.g. April – March).
            </div>
            <div className="flex flex-row max-sm:flex-col gap-4">
              <Button
                variant="secondary"
                type="reset"
                {...form.reset.getButtonProps()}
                onClick={() => setResetKey(Date.now())}
              >
                Reset
              </Button>
              <Button
                form={form.id}
                disabled={
                  fetcher.state !== "idle" ||
                  !form.valid ||
                  deepEqualCheck(form.initialValue, form.value)
                }
                variant="default"
                type="submit"
              >
                {fetcher.state !== "idle" ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </fetcher.Form>
    </FormProvider>
  );
};
