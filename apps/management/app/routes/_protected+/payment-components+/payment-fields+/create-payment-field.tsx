import {
  isGoodStatus,
  PaymentFieldSchema,
  calculationTypeArray,
  fixedTypeArray,
  componentTypeArray,
  transformStringArrayIntoOptions,
  createRole,
  hasPermission,
  replaceDash,
  validateFormula,
  DERIVED_FORMULA_COMPONENTS,
} from "@canny_ecosystem/utils";
import {
  CheckboxField,
  ErrorList,
  Field,
  SearchableSelectField,
} from "@canny_ecosystem/ui/forms";
import { Label } from "@canny_ecosystem/ui/label";
import { FormulaEditor } from "@/components/payment-field/formula-editor";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { createPaymentField } from "@canny_ecosystem/supabase/mutations";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { FormButtons } from "@/components/form/form-buttons";
import type { PaymentFieldDataType } from "@canny_ecosystem/supabase/queries";
import { getPaymentFieldNamesByCompanyId } from "@canny_ecosystem/supabase/queries";

import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { clearExactCacheEntry } from "@/utils/cache";

export const CREATE_PAYMENT_FIELD = "create-payment-field";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${createRole}:${attribute.paymentFields}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const { data: allPaymentFields } = await getPaymentFieldNamesByCompanyId({
    supabase,
    companyId,
  });

  return json({ companyId, allPaymentFields: allPaymentFields ?? [] });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const submission = parseWithZod(formData, { schema: PaymentFieldSchema });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    if (
      submission.value.calculation_type === "variable" &&
      submission.value.formula
    ) {
      const { data: fieldNames } = await getPaymentFieldNamesByCompanyId({
        supabase,
        companyId: submission.value.company_id,
      });
      const componentNames = [
        ...(fieldNames ?? []).map((f: any) => f.display_name || f.name),
        ...DERIVED_FORMULA_COMPONENTS.map((c) => c.name),
      ];
      const { valid, error: formulaError } = validateFormula(
        submission.value.formula,
        componentNames,
      );
      if (!valid) {
        return json(
          {
            status: "error",
            message: `Invalid formula: ${formulaError}`,
            error: { message: `Invalid formula: ${formulaError}` },
          },
          { status: 400 },
        );
      }
    }

    const { status, error } = await createPaymentField({
      supabase: supabase as any,
      data: [submission.value as any],
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Payment Field created",
        error: null,
      });

    return json(
      {
        status: "error",
        message: "Payment Field creation failed",
        error,
      },
      { status: 500 },
    );
  } catch (error) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
      },
      { status: 500 },
    );
  }
}

export default function CreatePaymentField({
  updateValues,
}: {
  updateValues?: PaymentFieldDataType | null;
}) {
  const { companyId, allPaymentFields } = useLoaderData<typeof loader>() as {
    companyId?: string;
    allPaymentFields?: { id: string; name: string; display_name: string }[];
  };
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resetKey, setResetKey] = useState(Date.now());

  const [isOvertime, setIsOvertime] = useState(!!updateValues?.is_overtime);
  const [formula, setFormula] = useState(updateValues?.formula ?? "");

  const formulaComponents = useMemo(() => {
    const seen = new Set<string>();
    return (allPaymentFields ?? [])
      .filter((field) => field.id !== updateValues?.id)
      .map((field) => ({ name: field.display_name || field.name }))
      .filter((component) => {
        const key = component.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [allPaymentFields, updateValues]);
  const [isProRata, setIsProRata] = useState(
    updateValues
      ? updateValues.is_overtime
        ? false
        : !!updateValues.is_pro_rata
      : true,
  );

  const [form, fields] = useForm({
    id: updateValues ? "update-payment-field" : CREATE_PAYMENT_FIELD,
    lastResult: actionData?.result,
    defaultValue: (updateValues
      ? { ...updateValues }
      : {
          calculation_type: calculationTypeArray[0],
          type: componentTypeArray[0],
          is_pro_rata: true,
          fixed_type: "day",
          display_order: 1,
          company_id: companyId,
        }) as any,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: PaymentFieldSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  useEffect(() => {
    setFormula(updateValues?.formula ?? "");
  }, [resetKey, updateValues]);

  useEffect(() => {
    if (!actionData) return;
    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.payment_fields);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate("/payment-components/payment-fields", { replace: true });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description:
          actionData?.error?.message || "Payment Field creation failed",
        variant: "destructive",
      });
    }
  }, [actionData, navigate, toast]);

  const PAYMENT_FIELD_TAG = updateValues
    ? "update-payment-field"
    : CREATE_PAYMENT_FIELD;

  const OVERTIME_TYPE = "earning";
  const OVERTIME_CALC_TYPE = "percentage_of_basic";
  const OVERTIME_AMOUNT = 100;

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {replaceDash(PAYMENT_FIELD_TAG)}
              </CardTitle>
              <CardDescription>
                Configure the payment field settings, calculation logic, and
                statutory considerations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {updateValues && (
                <input {...getInputProps(fields.id, { type: "hidden" })} />
              )}
              <input
                {...getInputProps(fields.company_id, { type: "hidden" })}
              />

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                <Field
                  labelProps={{ children: "Name" }}
                  inputProps={{
                    ...getInputProps(fields.name, { type: "text" }),
                    placeholder: "e.g. basic_salary",
                    autoFocus: !updateValues,
                  }}
                  errors={fields.name.errors}
                />
                <Field
                  labelProps={{ children: "Display Name" }}
                  inputProps={{
                    ...getInputProps(fields.display_name, { type: "text" }),
                    placeholder: "e.g. Basic Salary",
                  }}
                  errors={fields.display_name.errors}
                />
              </div>

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                <SearchableSelectField
                  key={`type-${resetKey}-${isOvertime}`}
                  labelProps={{ children: "Type" }}
                  options={transformStringArrayIntoOptions(
                    componentTypeArray as unknown as string[],
                  )}
                  inputProps={{
                    ...getInputProps(fields.type, { type: "text" }),
                    defaultValue: isOvertime
                      ? OVERTIME_TYPE
                      : ((fields.type.initialValue ??
                          componentTypeArray[0]) as any),
                    disabled: isOvertime,
                  }}
                  placeholder="Select Type"
                  errors={fields.type.errors}
                />
                <SearchableSelectField
                  key={`calc-${resetKey}`}
                  labelProps={{ children: "Calculation Type" }}
                  options={transformStringArrayIntoOptions(
                    calculationTypeArray as unknown as string[],
                  )}
                  inputProps={{
                    ...getInputProps(fields.calculation_type, { type: "text" }),
                    defaultValue: (fields.calculation_type.initialValue ??
                      calculationTypeArray[0]) as any,
                  }}
                  placeholder="Select Calculation Type"
                  errors={fields.calculation_type.errors}
                />
              </div>

              {fields.calculation_type.value === "variable" ? (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-medium">Formula</Label>
                  <FormulaEditor
                    key={`formula-${resetKey}`}
                    name={fields.formula.name}
                    value={formula}
                    onChange={setFormula}
                    salaryComponents={formulaComponents}
                  />
                  <ErrorList
                    id={fields.formula.errorId}
                    errors={fields.formula.errors}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                  {fields.calculation_type.value === "fixed" && (
                    <SearchableSelectField
                      key={`fixed-${resetKey}`}
                      labelProps={{ children: "Fixed Type" }}
                      options={transformStringArrayIntoOptions(
                        fixedTypeArray as unknown as string[],
                      )}
                      inputProps={{
                        ...getInputProps(fields.fixed_type, { type: "text" }),
                        disabled: isProRata,
                      }}
                      placeholder="Select Fixed Type"
                      errors={fields.fixed_type.errors}
                    />
                  )}
                  <Field
                    key={`amount-${resetKey}-${isOvertime}`}
                    labelProps={{
                      children:
                        fields.calculation_type.value === "percentage_of_basic"
                          ? "Percentage of Basic (%)"
                          : "Amount (Rs)",
                    }}
                    inputProps={{
                      ...getInputProps(fields.amount, { type: "number" }),
                      placeholder: "Enter value",
                      defaultValue: isOvertime
                        ? OVERTIME_AMOUNT
                        : (fields.amount.initialValue as any),
                      readOnly: isOvertime,
                    }}
                    errors={fields.amount.errors}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                <Field
                  labelProps={{ children: "Display Order" }}
                  inputProps={{
                    ...getInputProps(fields.display_order, { type: "number" }),
                    placeholder: "e.g. 1",
                  }}
                  errors={fields.display_order.errors}
                />
              </div>

              <div className="pt-4 border-t space-y-4">
                <h3 className="font-medium">Compliance & Attributes</h3>
                <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6 pb-2">
                  <CheckboxField
                    labelProps={{ children: "Is Pro Rata" }}
                    buttonProps={{
                      ...getInputProps(fields.is_pro_rata, {
                        type: "checkbox",
                      }),
                      checked: isProRata,
                      disabled: isOvertime,
                      onCheckedChange: (checked) => {
                        const isChecked = !!checked;
                        setIsProRata(isChecked);
                        if (isChecked) {
                          form.update({
                            name: fields.fixed_type.name,
                            value: "day",
                          });
                        }
                      },
                    }}
                    errors={
                      isOvertime
                        ? [
                            "Pro-rata calculation is not allowed for overtime components.",
                          ]
                        : fields.is_pro_rata.errors
                    }
                  />
                  <CheckboxField
                    labelProps={{ children: "Is Overtime" }}
                    buttonProps={{
                      ...getInputProps(fields.is_overtime, {
                        type: "checkbox",
                      }),
                      onCheckedChange: (checked) => {
                        const isChecked = !!checked;
                        setIsOvertime(isChecked);
                        if (isChecked) {
                          setIsProRata(false);
                          form.update({
                            name: fields.is_pro_rata.name,
                            value: false,
                          });
                        }
                      },
                    }}
                    errors={fields.is_overtime.errors}
                  />
                  <CheckboxField
                    labelProps={{ children: "Consider for EPF" }}
                    buttonProps={getInputProps(fields.consider_for_epf, {
                      type: "checkbox",
                    })}
                    errors={fields.consider_for_epf.errors}
                  />
                  <CheckboxField
                    labelProps={{ children: "Consider for ESIC" }}
                    buttonProps={getInputProps(fields.consider_for_esic, {
                      type: "checkbox",
                    })}
                    errors={fields.consider_for_esic.errors}
                  />
                  <CheckboxField
                    labelProps={{ children: "Consider for Bonus" }}
                    buttonProps={getInputProps(fields.consider_for_bonus, {
                      type: "checkbox",
                    })}
                    errors={fields.consider_for_bonus.errors}
                  />
                </div>
              </div>
            </CardContent>
            <FormButtons
              form={form}
              setResetKey={setResetKey}
              isSingle={true}
            />
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
