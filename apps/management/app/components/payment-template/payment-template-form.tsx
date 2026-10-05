import { replaceDash, evaluateFormula } from "@canny_ecosystem/utils";
import { PaymentTemplateUnifiedSchema } from "@canny_ecosystem/utils";
import {
  CheckboxField,
  Field,
  SearchableSelectField,
  ConformControlledSelectField,
} from "@canny_ecosystem/ui/forms";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { Form, useActionData, useNavigate } from "@remix-run/react";
import { useEffect, useState, useMemo } from "react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import { FormulaEditor } from "@/components/payment-field/formula-editor";
import { Label } from "@canny_ecosystem/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cacheKeyPrefix } from "@/constant";
import { FormButtons } from "@/components/form/form-buttons";
import { clearExactCacheEntry } from "@/utils/cache";
import { PaymentTemplateComponentsSection } from "./payment-template-components-section";
import type { PaymentFieldDataType } from "@canny_ecosystem/supabase/queries";

type SelectOption = { label: string; value: string };

export const CREATE_PAYMENT_TEMPLATE = "create-payment-template";

export function PaymentTemplateForm({
  updateValues,
  paymentFieldsOptions,
  paymentFieldsData,
  pfOptions = [],
  esicOptions = [],
  ptOptions = [],
  bonusOptions = [],
  lwfOptions = [],
  isIncrement = false,
}: {
  updateValues?: any | null;
  paymentFieldsOptions: SelectOption[];
  paymentFieldsData: PaymentFieldDataType[];
  pfOptions?: SelectOption[];
  esicOptions?: SelectOption[];
  ptOptions?: SelectOption[];
  bonusOptions?: SelectOption[];
  lwfOptions?: SelectOption[];
  isIncrement?: boolean;
}) {
  const actionData = useActionData<{
    status: string;
    message: string;
    error: any;
    result: any;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resetKey, setResetKey] = useState(Date.now());

  const PAYMENT_TEMPLATE_TAG = isIncrement
    ? "add-increment"
    : updateValues
      ? "update-payment-template"
      : CREATE_PAYMENT_TEMPLATE;

  const [form, fields] = useForm({
    id: PAYMENT_TEMPLATE_TAG,
    lastResult: actionData?.result,
    defaultValue: updateValues
      ? {
        template: { ...updateValues.template },
        values: {
          ...updateValues.values,
          id: isIncrement ? undefined : updateValues.values.id,
          effective_date: isIncrement
            ? ""
            : updateValues.values.effective_date,
        },
        components: (updateValues.components || []).map((c: any) => ({
          ...c,
          id: isIncrement ? undefined : c.id,
        })),
        statutory: {
          ...updateValues.statutory,
          id: isIncrement ? undefined : updateValues.statutory.id,
        },
      }
      : {
        template: { name: "" },
        values: {
          is_pro_rata: true,
          basic_percent: 50,
          calculation_direction: "ctc_to_basic",
        },
        components: [],
        statutory: {},
      },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: PaymentTemplateUnifiedSchema });
    },
    shouldValidate: "onSubmit",
    shouldRevalidate: "onInput",
    onSubmit() { },
  });

  const templateFields = fields.template.getFieldset();
  const valuesFields = fields.values.getFieldset();
  const statutoryFields = fields.statutory.getFieldset();

  // Direction of the CTC/Basic calculation:
  // "ctc_to_basic" — user enters Monthly CTC, Basic is derived from percent
  // "basic_to_ctc" — user enters Basic amount, Monthly CTC is derived
  const [ctcCalculationMode, setCtcCalculationMode] = useState<
    "ctc_to_basic" | "basic_to_ctc" | "formula_basic"
  >(() => {
    if (updateValues?.values?.calculation_direction) {
      return updateValues.values.calculation_direction as
        | "ctc_to_basic"
        | "basic_to_ctc"
        | "formula_basic";
    }
    return "ctc_to_basic";
  });
  const [basicFormula, setBasicFormula] = useState<string>("");

  const formulaComponents = useMemo(() => {
    return [
      { name: "Monthly CTC", description: "Monthly CTC Amount" },
      { name: "CTC", description: "Monthly CTC Amount" },
      { name: "Working Days", description: "Total Working Days" },
      { name: "Present Days", description: "Payable Present Days" },
    ];
  }, []);

  const basicPercentValue = Number(valuesFields.basic_percent.value ?? 0);
  const monthlyCtcValue = Number(valuesFields.monthly_ctc.value ?? 0);
  const basicAmountValue = Number(valuesFields.basic_amount.value ?? 0);

  const handleCalculationModeChange = (
    mode: "ctc_to_basic" | "basic_to_ctc" | "formula_basic",
  ) => {
    setCtcCalculationMode(mode);
    form.update({
      name: valuesFields.calculation_direction.name,
      value: mode,
    });
    if (mode === "basic_to_ctc") {
      const seededBasic =
        monthlyCtcValue > 0 && basicPercentValue > 0
          ? Math.round((monthlyCtcValue * basicPercentValue) / 100)
          : 0;
      form.update({
        name: valuesFields.basic_amount.name,
        value: seededBasic,
      });
    }
  };

  const handleBasicFormulaChange = (val: string) => {
    setBasicFormula(val);
    if (val.trim() && monthlyCtcValue > 0) {
      try {
        const evalAmt = evaluateFormula(val, {
          "Monthly CTC": monthlyCtcValue,
          CTC: monthlyCtcValue,
          "Working Days": 30,
          "Present Days": 30,
        });
        if (!isNaN(evalAmt) && evalAmt >= 0) {
          const roundedVal = Math.round(evalAmt);
          form.update({
            name: valuesFields.basic_amount.name,
            value: roundedVal,
          });
          const computedPercent = Number(
            ((roundedVal / monthlyCtcValue) * 100).toFixed(5),
          );
          form.update({
            name: valuesFields.basic_percent.name,
            value: computedPercent,
          });
        }
      } catch { }
    }
  };

  useEffect(() => {
    if (ctcCalculationMode === "ctc_to_basic") {
      const computedBasic =
        monthlyCtcValue > 0 && basicPercentValue > 0
          ? Math.round((monthlyCtcValue * basicPercentValue) / 100)
          : 0;
      if (computedBasic !== basicAmountValue) {
        form.update({
          name: valuesFields.basic_amount.name,
          value: computedBasic,
        });
      }
    } else {
      const computedCtc =
        basicAmountValue > 0 && basicPercentValue > 0
          ? Math.round((basicAmountValue * 100) / basicPercentValue)
          : 0;
      if (computedCtc !== monthlyCtcValue) {
        form.update({
          name: valuesFields.monthly_ctc.name,
          value: computedCtc,
        });
      }
    }
  }, [
    ctcCalculationMode,
    monthlyCtcValue,
    basicPercentValue,
    basicAmountValue,
    valuesFields.basic_amount.name,
    valuesFields.monthly_ctc.name,
    form,
  ]);

  useEffect(() => {
    if (updateValues?.values?.calculation_direction) {
      setCtcCalculationMode(
        updateValues.values.calculation_direction as
        | "ctc_to_basic"
        | "basic_to_ctc",
      );
    } else {
      setCtcCalculationMode("ctc_to_basic");
    }
  }, [resetKey, updateValues]);

  useEffect(() => {
    if (!actionData) return;
    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.payment_templates);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate("/payment-components/payment-templates", { replace: true });
    } else if (actionData?.status === "error") {
      const error = actionData?.error;
      let description =
        actionData?.error?.message || "Payment Template operation failed";

      if (
        error &&
        (error.code === "23505" ||
          error.message?.includes("unique_template_name_per_company"))
      ) {
        const details = error.details || "";
        const match = details.match(/Key \(([^)]+)\)=\(([^)]+)\)/);
        let nameValue = "";
        if (match) {
          const keys = match[1].split(",").map((k: string) => k.trim());
          const valuesStr = match[2];

          if (keys[0] === "company_id" && keys[1] === "name") {
            const firstCommaIndex = valuesStr.indexOf(",");
            if (firstCommaIndex !== -1) {
              nameValue = valuesStr.substring(firstCommaIndex + 1).trim();
            } else {
              nameValue = valuesStr.trim();
            }
          } else {
            const nameIndex = keys.indexOf("name");
            if (nameIndex !== -1) {
              const values = valuesStr.split(",").map((v: string) => v.trim());
              nameValue = values[nameIndex] || "";
            }
          }
        }

        if (nameValue) {
          description = `Payment template name "${nameValue}" already exists. Please choose a different name.`;
        } else {
          description =
            "Payment template name already exists. Please choose a different name.";
        }
      }

      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    }
  }, [actionData, navigate, toast]);

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form
          key={form.key}
          method="POST"
          {...getFormProps(form)}
          id={form.id}
          className="flex flex-col gap-6"
        >
          <input {...getInputProps(valuesFields.id, { type: "hidden" })} />
          <input
            type="hidden"
            name={valuesFields.calculation_direction.name}
            value={ctcCalculationMode}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {replaceDash(PAYMENT_TEMPLATE_TAG)}
              </CardTitle>
              <CardDescription>
                Configure the payment template and aggregate values.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ConformControlledSelectField
                  className="col-span-full"
                  name="ctc-calculation-direction"
                  labelProps={{ children: "Calculation Direction" }}
                  options={[
                    {
                      value: "ctc_to_basic",
                      label: "Enter CTC, auto-calculate Basic",
                    },
                    {
                      value: "basic_to_ctc",
                      label: "Enter Basic, auto-calculate CTC",
                    },
                    {
                      value: "formula_basic",
                      label: "Enter Formula for Basic",
                    },
                  ]}
                  value={ctcCalculationMode}
                  onChange={(val) =>
                    handleCalculationModeChange(
                      val as "ctc_to_basic" | "basic_to_ctc" | "formula_basic",
                    )
                  }
                  placeholder="Select Calculation Direction"
                />
                <Field
                  className="col-span-full"
                  labelProps={{ children: "Template Name" }}
                  inputProps={{
                    ...getInputProps(templateFields.name, { type: "text" }),
                    placeholder: "e.g. Standard Developer Package",
                    autoFocus: !updateValues,
                  }}
                  errors={templateFields.name.errors}
                />
              </div>

              {ctcCalculationMode === "formula_basic" ? (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                    <Field
                      labelProps={{ children: "Monthly CTC (Rs)" }}
                      inputProps={{
                        ...getInputProps(valuesFields.monthly_ctc, {
                          type: "number",
                        }),
                        step: "any",
                        placeholder: "e.g. 50000",
                      }}
                      errors={valuesFields.monthly_ctc.errors}
                    />
                    <Field
                      labelProps={{ children: "Basic Percent (%)" }}
                      inputProps={{
                        ...getInputProps(valuesFields.basic_percent, {
                          type: "number",
                        }),
                        step: "any",
                        placeholder: "e.g. 50",
                      }}
                      errors={valuesFields.basic_percent.errors}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 border p-4 rounded-lg bg-muted/20">
                    <label className="text-sm font-medium flex items-center justify-between">
                      <span>Formula for Basic</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        Available variables: <code className="bg-muted px-1 rounded">Monthly CTC</code>, <code className="bg-muted px-1 rounded">CTC</code>, <code className="bg-muted px-1 rounded">Working Days</code>, <code className="bg-muted px-1 rounded">Present Days</code>
                      </span>
                    </label>
                    <FormulaEditor
                      value={basicFormula}
                      onChange={handleBasicFormulaChange}
                      salaryComponents={formulaComponents}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                  {ctcCalculationMode === "ctc_to_basic" ? (
                    <>
                      <input
                        type="hidden"
                        name={valuesFields.basic_amount.name}
                        value={valuesFields.basic_amount.value ?? ""}
                      />
                      <Field
                        labelProps={{ children: "Monthly CTC (Rs)" }}
                        inputProps={{
                          ...getInputProps(valuesFields.monthly_ctc, {
                            type: "number",
                          }),
                          step: "any",
                          placeholder: "e.g. 50000",
                        }}
                        errors={valuesFields.monthly_ctc.errors}
                      />
                    </>
                  ) : (
                    <Field
                      labelProps={{ children: "Basic Amount (Rs)" }}
                      inputProps={{
                        ...getInputProps(valuesFields.basic_amount, {
                          type: "number",
                        }),
                        step: "any",
                        placeholder: "e.g. 25000",
                      }}
                      errors={valuesFields.basic_amount.errors}
                    />
                  )}
                  <Field
                    labelProps={{ children: "Basic Percent (%)" }}
                    inputProps={{
                      ...getInputProps(valuesFields.basic_percent, {
                        type: "number",
                      }),
                      step: "any",
                      placeholder: "e.g. 50",
                    }}
                    errors={valuesFields.basic_percent.errors}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                {ctcCalculationMode === "basic_to_ctc" ? (
                  <Field
                    labelProps={{
                      children: "Monthly CTC (Rs) — auto-calculated",
                    }}
                    inputProps={{
                      ...getInputProps(valuesFields.monthly_ctc, {
                        type: "number",
                      }),
                      step: "any",
                      readOnly: true,
                      className: "bg-muted/50 text-muted-foreground",
                      placeholder: "Enter Basic and Percent",
                    }}
                    errors={valuesFields.monthly_ctc.errors}
                  />
                ) : (
                  <Field
                    labelProps={{ children: "Effective Date" }}
                    inputProps={{
                      ...getInputProps(valuesFields.effective_date, {
                        type: "date",
                      }),
                    }}
                    errors={valuesFields.effective_date.errors}
                  />
                )}
                {ctcCalculationMode === "basic_to_ctc" ? (
                  <Field
                    labelProps={{ children: "Effective Date" }}
                    inputProps={{
                      ...getInputProps(valuesFields.effective_date, {
                        type: "date",
                      }),
                    }}
                    errors={valuesFields.effective_date.errors}
                  />
                ) : null}
              </div>

              {ctcCalculationMode === "ctc_to_basic" &&
                monthlyCtcValue > 0 &&
                basicPercentValue > 0 && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    Basic Amount: ₹
                    {Math.round(
                      (monthlyCtcValue * basicPercentValue) / 100,
                    ).toLocaleString()}{" "}
                    (calculated from CTC)
                  </p>
                )}

              <div className="pt-4 border-t space-y-4">
                <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6 pb-2">
                  <CheckboxField
                    labelProps={{ children: "Is Pro Rata" }}
                    buttonProps={getInputProps(valuesFields.is_pro_rata, {
                      type: "checkbox",
                    })}
                    errors={valuesFields.is_pro_rata.errors}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <PaymentTemplateComponentsSection
            form={form}
            componentsConfig={fields.components}
            paymentFieldsOptions={paymentFieldsOptions}
            paymentFieldsData={paymentFieldsData}
            resetKey={resetKey}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Statutory Components</CardTitle>
              <CardDescription>
                Configure statutory deductions for this payment template.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                <div className="flex items-end gap-2">
                  <SearchableSelectField
                    className="flex-1"
                    labelProps={{ children: "Provident Fund (PF)" }}
                    options={pfOptions || []}
                    inputProps={{
                      ...getInputProps(statutoryFields.pf_id, {
                        type: "text",
                      }),
                    }}
                    placeholder="Select PF configuration"
                    errors={statutoryFields.pf_id.errors}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-8"
                    disabled={!statutoryFields.pf_id.value}
                    onClick={() =>
                      form.update({
                        name: statutoryFields.pf_id.name,
                        value: "",
                      })
                    }
                  >
                    <Icon name="trash" className="text-destructive" size="sm" />
                  </Button>
                </div>
                <div className="flex items-end gap-2">
                  <SearchableSelectField
                    className="flex-1"
                    labelProps={{ children: "ESIC" }}
                    options={esicOptions || []}
                    inputProps={{
                      ...getInputProps(statutoryFields.esic_id, {
                        type: "text",
                      }),
                    }}
                    placeholder="Select ESIC configuration"
                    errors={statutoryFields.esic_id.errors}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-8"
                    disabled={!statutoryFields.esic_id.value}
                    onClick={() =>
                      form.update({
                        name: statutoryFields.esic_id.name,
                        value: "",
                      })
                    }
                  >
                    <Icon name="trash" className="text-destructive" size="sm" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                <div className="flex items-end gap-2">
                  <SearchableSelectField
                    className="flex-1"
                    labelProps={{ children: "Professional Tax (PT)" }}
                    options={ptOptions || []}
                    inputProps={{
                      ...getInputProps(statutoryFields.pt_id, {
                        type: "text",
                      }),
                    }}
                    placeholder="Select PT configuration"
                    errors={statutoryFields.pt_id.errors}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-8"
                    disabled={!statutoryFields.pt_id.value}
                    onClick={() =>
                      form.update({
                        name: statutoryFields.pt_id.name,
                        value: "",
                      })
                    }
                  >
                    <Icon name="trash" className="text-destructive" size="sm" />
                  </Button>
                </div>
                <div className="flex items-end gap-2">
                  <SearchableSelectField
                    className="flex-1"
                    labelProps={{ children: "Statutory Bonus" }}
                    options={bonusOptions || []}
                    inputProps={{
                      ...getInputProps(statutoryFields.statutory_bonus_id, {
                        type: "text",
                      }),
                    }}
                    placeholder="Select Bonus configuration"
                    errors={statutoryFields.statutory_bonus_id.errors}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-8"
                    disabled={!statutoryFields.statutory_bonus_id.value}
                    onClick={() =>
                      form.update({
                        name: statutoryFields.statutory_bonus_id.name,
                        value: "",
                      })
                    }
                  >
                    <Icon name="trash" className="text-destructive" size="sm" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
                <div className="flex items-end gap-2">
                  <SearchableSelectField
                    className="flex-1"
                    labelProps={{ children: "Labour Welfare Fund (LWF)" }}
                    options={lwfOptions || []}
                    inputProps={{
                      ...getInputProps(statutoryFields.labour_welfare_fund_id, {
                        type: "text",
                      }),
                    }}
                    placeholder="Select LWF configuration"
                    errors={statutoryFields.labour_welfare_fund_id.errors}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-8"
                    disabled={!statutoryFields.labour_welfare_fund_id.value}
                    onClick={() =>
                      form.update({
                        name: statutoryFields.labour_welfare_fund_id.name,
                        value: "",
                      })
                    }
                  >
                    <Icon name="trash" className="text-destructive" size="sm" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-0 px-3">
              <FormButtons
                form={form}
                setResetKey={setResetKey}
                isSingle={true}
                className="!justify-end"
              />
            </CardContent>
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
