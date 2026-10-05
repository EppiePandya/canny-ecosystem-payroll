import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import { useUser } from "@/utils/user";
import type { CompanyDatabaseUpdate } from "@canny_ecosystem/supabase/types";
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
  company_size,
  company_type,
  CompanyDetailsSchema,
  deepEqualCheck,
  hasPermission,
  replaceUnderscore,
  transformStringArrayIntoOptions,
  updateRole,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { Form } from "@remix-run/react";
import { useState } from "react";

export const COMPANY_DETAILS = "company-details";

export const CompanyDetails = ({
  updateValues,
}: {
  updateValues: CompanyDatabaseUpdate;
}) => {
  const { role } = useUser();
  const [resetKey, setResetKey] = useState(Date.now());

  const [form, fields] = useForm({
    id: COMPANY_DETAILS,
    constraint: getZodConstraint(CompanyDetailsSchema),
    onValidate({ formData }) {
      if (!deepEqualCheck(form.initialValue, form.value)) {
        clearExactCacheEntry(cacheKeyPrefix.general);
        clearExactCacheEntry(cacheKeyPrefix.settings);
      }
      return parseWithZod(formData, { schema: CompanyDetailsSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: updateValues,
  });

  return (
    <FormProvider context={form.context}>
      <Form
        method="POST"
        {...getFormProps(form)}
        action={`/${updateValues.id}/update-company`}
      >
        <Card>
          <CardHeader className="max-sm:text-sm">
            <CardTitle>Company Details</CardTitle>
            <CardDescription className="max-sm:text-xs ">
              This is your company's visible details within canny.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 items-center justify-center md:gap-x-8">
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input {...getInputProps(fields.logo, { type: "hidden" })} />
              <Field
                labelProps={{ children: "Company Name" }}
                inputProps={{
                  ...getInputProps(fields.name, { type: "text" }),

                  placeholder: `Enter ${fields.name.name}`,
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                errors={fields.name.errors}
              />
              <Field
                labelProps={{ children: "Email Suffix" }}
                inputProps={{
                  ...getInputProps(fields.email_suffix, { type: "text" }),
                  placeholder: `Enter ${replaceUnderscore(
                    fields.email_suffix.name,
                  )}`,
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                errors={fields.email_suffix.errors}
              />
              <SearchableSelectField
                key={resetKey}
                labelProps={{ children: "Company Type" }}
                className={cn(
                  "w-full capitalize flex-1",
                  (role === "executive" || role === "supervisor") && "hidden",
                )}
                options={transformStringArrayIntoOptions(
                  company_type as unknown as string[],
                )}
                inputProps={{
                  ...getInputProps(fields.company_type, { type: "text" }),
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                placeholder={`Select ${replaceUnderscore(
                  fields.company_type.name,
                )}`}
                errors={fields.company_type.errors}
              />
              <SearchableSelectField
                key={resetKey + 1}
                labelProps={{ children: "Company Size" }}
                className={cn(
                  "w-full capitalize flex-1",
                  (role === "executive" || role === "supervisor") && "hidden",
                )}
                options={transformStringArrayIntoOptions(
                  company_size as unknown as string[],
                )}
                inputProps={{
                  ...getInputProps(fields.company_size, { type: "text" }),
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                placeholder={`Select ${replaceUnderscore(
                  fields.company_size.name,
                )}`}
                errors={fields.company_size.errors}
              />
            </div>
            <Field
              labelProps={{ children: "Registration Number" }}
              inputProps={{
                ...getInputProps(fields.registration_number, { type: "text" }),
                placeholder: `Enter ${replaceUnderscore(
                  fields.registration_number.name,
                )}`,
                readOnly: !hasPermission(
                  role,
                  `${updateRole}:${attribute.settingGeneral}`,
                ),
              }}
              errors={fields.registration_number.errors}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 items-center justify-center md:gap-x-8">
              <Field
                labelProps={{ children: "Primary Number" }}
                inputProps={{
                  ...getInputProps(fields.primary_number, { type: "text" }),
                  placeholder: `Enter ${replaceUnderscore(
                    fields.primary_number.name,
                  )}`,
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                errors={fields.primary_number.errors}
              />
              <Field
                labelProps={{ children: "Secondary Number" }}
                inputProps={{
                  ...getInputProps(fields.secondary_number, { type: "text" }),
                  placeholder: `Enter ${replaceUnderscore(
                    fields.secondary_number.name,
                  )}`,
                  readOnly: !hasPermission(
                    role,
                    `${updateRole}:${attribute.settingGeneral}`,
                  ),
                }}
                errors={fields.secondary_number.errors}
              />
            </div>
          </CardContent>

          <CardFooter
            className={cn(
              "border-t pt-6 flex justify-between  ",
              !hasPermission(
                role,
                `${updateRole}:${attribute.settingGeneral}`,
              ) && "hidden",
            )}
          >
            <div className="max-sm:text-sm">
              Please use 32 characters at maximum.
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
                  !form.valid || deepEqualCheck(form.initialValue, form.value)
                }
                variant="default"
                type="submit"
              >
                Save
              </Button>
            </div>
          </CardFooter>
        </Card>
      </Form>
    </FormProvider>
  );
};
