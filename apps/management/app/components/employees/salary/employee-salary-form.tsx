import { FormButtons } from "@/components/form/form-buttons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import {
  Field,
  SearchableSelectField,
  CheckboxField,
  ConformControlledSelectField,
} from "@canny_ecosystem/ui/forms";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import {
  Form,
  useActionData,
  useNavigate,
  useParams,
  Link,
  useFetcher,
} from "@remix-run/react";
import { useEffect, useState, useMemo } from "react";
import {
  EmployeeSalaryUnifiedSchema,
  formatNumber,
  evaluateFormula,
} from "@canny_ecosystem/utils";
import { FormulaEditor } from "@/components/payment-field/formula-editor";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import type { PaymentFieldDataType } from "@canny_ecosystem/supabase/queries";

const formatAmount = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return "";
  return String(formatNumber(num));
};

export type EmployeeSalaryFormProps = {
  initialValues?: any;
  paymentTemplateOptions: ComboboxSelectOption[];
  paymentFieldsOptions: ComboboxSelectOption[];
  paymentFieldsData: PaymentFieldDataType[];
  pfOptions?: { label: string; value: string }[];
  esicOptions?: { label: string; value: string }[];
  ptOptions?: { label: string; value: string }[];
  bonusOptions?: { label: string; value: string }[];
  lwfOptions?: { label: string; value: string }[];
};

export type EmployeeSalaryFormFieldsProps = {
  form: any;
  fields: any;
  paymentTemplateOptions: ComboboxSelectOption[];
  paymentFieldsOptions: ComboboxSelectOption[];
  paymentFieldsData: PaymentFieldDataType[];
  pfOptions?: { label: string; value: string }[];
  esicOptions?: { label: string; value: string }[];
  ptOptions?: { label: string; value: string }[];
  bonusOptions?: { label: string; value: string }[];
  lwfOptions?: { label: string; value: string }[];
};

export function EmployeeSalaryFormFields({
  form,
  fields,
  paymentTemplateOptions,
  paymentFieldsOptions,
  paymentFieldsData,
  pfOptions,
  esicOptions,
  ptOptions,
  bonusOptions,
  lwfOptions,
}: EmployeeSalaryFormFieldsProps) {
  const { toast } = useToast();
  const [isAutofillTriggered, setIsAutofillTriggered] = useState(false);

  const assignmentFields = (fields.assignment as any).getFieldset();
  const componentList = (fields.components as any).getFieldList();
  const statutoryFields = (fields.statutory as any).getFieldset?.();

  const selectedIds = componentList
    .map((component: any) => {
      const fields = component.getFieldset();
      return fields.payment_field_id.value;
    })
    .filter(Boolean);

  const selectedTemplateId = assignmentFields.template_id.value;

  const isProRataControl = useInputControl({
    name: assignmentFields.is_pro_rata.name,
    formId: form.id,
    initialValue:
      fields.assignment.initialValue?.is_pro_rata === "on" ||
        fields.assignment.value?.is_pro_rata === "on" ||
        fields.assignment.value?.is_pro_rata === true
        ? "on"
        : undefined,
  });
  const isProRata = isProRataControl.value === "on";
  const fetcher = useFetcher<any>();

  const initialCalculationDirection =
    assignmentFields.calculation_direction?.value ||
    fields.assignment.value?.calculation_direction ||
    "ctc_to_basic";
  const initialBasicFormula =
    assignmentFields.basic_formula?.value ||
    fields.assignment.value?.basic_formula ||
    "";

  const [ctcCalculationMode, setCtcCalculationMode] = useState<
    "ctc_to_basic" | "basic_to_ctc" | "formula_basic"
  >(initialCalculationDirection as any);
  const [basicAmount, setBasicAmount] = useState<number>(0);
  const [basicFormula, setBasicFormula] = useState<string>(initialBasicFormula);

  const formulaComponents = useMemo(() => {
    return [
      { name: "Monthly CTC", description: "Monthly CTC Amount" },
      { name: "CTC", description: "Monthly CTC Amount" },
      { name: "Working Days", description: "Total Working Days" },
      { name: "Present Days", description: "Payable Present Days" },
    ];
  }, []);

  const basicPercentValue = Number(assignmentFields.basic_percent.value ?? 0);
  const monthlyCtcValue = Number(assignmentFields.monthly_ctc.value ?? 0);

  const handleCalculationModeChange = (
    mode: "ctc_to_basic" | "basic_to_ctc" | "formula_basic",
  ) => {
    setCtcCalculationMode(mode);
    form.update({
      name: assignmentFields.calculation_direction?.name || "assignment.calculation_direction",
      value: mode,
    });
    if (monthlyCtcValue > 0 && basicPercentValue > 0) {
      setBasicAmount(
        Number(((monthlyCtcValue * basicPercentValue) / 100).toFixed(2)),
      );
    }
  };

  const handleBasicFormulaChange = (val: string) => {
    setBasicFormula(val);
    form.update({
      name: assignmentFields.basic_formula?.name || "assignment.basic_formula",
      value: val,
    });
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
          setBasicAmount(roundedVal);
          const computedPercent = Number(
            ((roundedVal / monthlyCtcValue) * 100).toFixed(5),
          );
          form.update({
            name: assignmentFields.basic_percent.name,
            value: computedPercent,
          });
        }
      } catch { }
    }
  };

  useEffect(() => {
    if (monthlyCtcValue > 0 && basicPercentValue > 0) {
      const initialBasic = Number(
        ((monthlyCtcValue * basicPercentValue) / 100).toFixed(2),
      );
      setBasicAmount((prev) => (prev === 0 ? initialBasic : prev));
    }
  }, [ctcCalculationMode]);

  const handleMonthlyCtcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const newCtc = val === "" ? 0 : Number(val);
    form.update({
      name: assignmentFields.monthly_ctc.name,
      value: val,
    });
    if (ctcCalculationMode === "ctc_to_basic" && basicPercentValue > 0) {
      setBasicAmount(
        Number(((newCtc * basicPercentValue) / 100).toFixed(2)),
      );
    } else if (ctcCalculationMode === "formula_basic" && basicFormula.trim()) {
      try {
        const evalAmt = evaluateFormula(basicFormula, {
          "Monthly CTC": newCtc,
          CTC: newCtc,
          "Working Days": 30,
          "Present Days": 30,
        });
        if (!isNaN(evalAmt) && evalAmt >= 0) {
          const roundedVal = Math.round(evalAmt);
          setBasicAmount(roundedVal);
          if (newCtc > 0) {
            const computedPercent = Number(
              ((roundedVal / newCtc) * 100).toFixed(5),
            );
            form.update({
              name: assignmentFields.basic_percent.name,
              value: computedPercent,
            });
          }
        }
      } catch { }
    }
  };

  const handleBasicPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const newPercent = val === "" ? 0 : Number(val);
    form.update({
      name: assignmentFields.basic_percent.name,
      value: val,
    });
    if (ctcCalculationMode === "ctc_to_basic") {
      if (monthlyCtcValue > 0 && newPercent >= 0) {
        setBasicAmount(
          Number(((monthlyCtcValue * newPercent) / 100).toFixed(2)),
        );
      }
    } else {
      if (basicAmount > 0 && newPercent > 0) {
        const computedCtc = Number(((basicAmount * 100) / newPercent).toFixed(2));
        form.update({
          name: assignmentFields.monthly_ctc.name,
          value: computedCtc,
        });
      }
    }
  };

  const handleBasicAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const newBasic = val === "" ? 0 : Number(val);
    setBasicAmount(newBasic);

    if (ctcCalculationMode === "ctc_to_basic" || ctcCalculationMode === "formula_basic") {
      if (monthlyCtcValue > 0 && newBasic >= 0) {
        const calculatedPercent = Number(
          ((newBasic / monthlyCtcValue) * 100).toFixed(5),
        );
        form.update({
          name: assignmentFields.basic_percent.name,
          value: calculatedPercent,
        });
      }
    } else {
      if (newBasic >= 0 && basicPercentValue > 0) {
        const computedCtc = Number(((newBasic * 100) / basicPercentValue).toFixed(2));
        form.update({
          name: assignmentFields.monthly_ctc.name,
          value: computedCtc,
        });
      }
    }
  };

  const applyTemplate = (template: any) => {
    if (!template) return;

    const today = new Date();
    const latestVersion = [...(template.payment_template_versions || [])]
      .filter(
        (v: any) => !v.effective_date || new Date(v.effective_date) <= today,
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.effective_date).getTime() -
          new Date(a.effective_date).getTime(),
      )[0];

    const monthlyCtc = latestVersion?.monthly_ctc;
    const basicPercent = latestVersion?.basic_percent;
    const isProRataTemplateValue = latestVersion?.is_pro_rata;
    const effectiveDate = latestVersion?.effective_date;

    if (monthlyCtc !== undefined) {
      form.update({
        name: assignmentFields.monthly_ctc.name,
        value: String(monthlyCtc),
      });
    }
    if (basicPercent !== undefined) {
      form.update({
        name: assignmentFields.basic_percent.name,
        value: String(basicPercent),
      });
    }
    if (effectiveDate) {
      const dateValue = new Date(effectiveDate).toISOString().split("T")[0];
      form.update({
        name: assignmentFields.effective_date.name,
        value: dateValue,
      });
    }

    if (isProRataTemplateValue !== undefined) {
      form.update({
        name: assignmentFields.is_pro_rata.name,
        value: isProRataTemplateValue ? "on" : "",
      });
    }

    const newComponents = (
      latestVersion?.payment_template_components || []
    ).map((tc: any) => ({
      payment_field_id: tc.payment_field_id,
      amount: tc.amount ? Number(formatAmount(tc.amount)) : 0,
    }));

    form.update({
      name: fields.components.name,
      value: newComponents,
    });

    const statutory = latestVersion?.payment_statutory_components;

    form.update({
      name: fields.statutory.name,
      value: {
        pf_id: statutory?.pf_id || "",
        esic_id: statutory?.esic_id || "",
        pt_id: statutory?.pt_id || "",
        statutory_bonus_id: statutory?.statutory_bonus_id || "",
        labour_welfare_fund_id: statutory?.labour_welfare_fund_id || "",
      },
    });

    toast({
      title: "Template applied",
      description: `Applied ${template.name} with ${newComponents.length} components.`,
    });
  };

  const autofillFromTemplate = () => {
    if (!selectedTemplateId) return;

    setIsAutofillTriggered(true);

    if (fetcher.data?.template?.id === selectedTemplateId) {
      applyTemplate(fetcher.data.template);
      setIsAutofillTriggered(false);
    } else {
      fetcher.load(`/api/payment-template/${selectedTemplateId}`);
    }
  };

  useEffect(() => {
    if (
      isAutofillTriggered &&
      fetcher.data?.template &&
      fetcher.data.template.id === selectedTemplateId
    ) {
      applyTemplate(fetcher.data.template);
      setIsAutofillTriggered(false);
    }
  }, [fetcher.data, selectedTemplateId, isAutofillTriggered]);

  useEffect(() => {
    if (selectedTemplateId && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/api/payment-template/${selectedTemplateId}`);
    }
  }, [selectedTemplateId, fetcher]);

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Salary Assignment</CardTitle>
          <CardDescription>
            Define the base salary structure and link to a payment template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <input {...getInputProps(assignmentFields.id, { type: "hidden" })} />
          <input
            {...getInputProps(assignmentFields.employee_id, {
              type: "hidden",
            })}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

            {ctcCalculationMode === "formula_basic" ? (
              <>
                <Field
                  labelProps={{ children: "Monthly CTC" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.monthly_ctc, {
                      type: "number",
                    }),
                    step: "any",
                    placeholder: "e.g. 50000",
                    onChange: handleMonthlyCtcChange,
                  }}
                  errors={assignmentFields.monthly_ctc.errors}
                />
                <Field
                  labelProps={{ children: "Basic Percent (%)" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.basic_percent, {
                      type: "number",
                    }),
                    step: "any",
                    placeholder: "e.g. 50",
                    onChange: handleBasicPercentChange,
                  }}
                  errors={assignmentFields.basic_percent.errors}
                />
                <Field
                  labelProps={{ children: "Basic Amount (Rs) — auto-calculated" }}
                  inputProps={{
                    type: "number",
                    step: "any",
                    placeholder: "From formula",
                    value: basicAmount || "",
                    onChange: handleBasicAmountChange,
                  }}
                />
                <div className="flex flex-col gap-1.5 col-span-full border p-4 rounded-lg bg-muted/20">
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
                  {basicFormula && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Calculated Basic: <span className="font-semibold text-foreground">₹{basicAmount.toLocaleString()}</span> {monthlyCtcValue > 0 ? `(${((basicAmount / monthlyCtcValue) * 100).toFixed(1)}% of CTC)` : ""}
                    </p>
                  )}
                </div>
                <Field
                  labelProps={{ children: "Effective Date" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.effective_date, {
                      type: "date",
                    }),
                  }}
                  errors={assignmentFields.effective_date.errors}
                />
              </>
            ) : ctcCalculationMode === "ctc_to_basic" ? (
              <>
                <Field
                  labelProps={{ children: "Monthly CTC" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.monthly_ctc, {
                      type: "number",
                    }),
                    step: "any",
                    placeholder: "e.g. 50000",
                    onChange: handleMonthlyCtcChange,
                  }}
                  errors={assignmentFields.monthly_ctc.errors}
                />
                <Field
                  labelProps={{ children: "Basic Percent (%)" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.basic_percent, {
                      type: "number",
                    }),
                    step: "any",
                    placeholder: "e.g. 50",
                    onChange: handleBasicPercentChange,
                  }}
                  errors={assignmentFields.basic_percent.errors}
                />
                <Field
                  labelProps={{ children: "Basic Amount (Rs)" }}
                  inputProps={{
                    type: "number",
                    step: "any",
                    placeholder: "e.g. 25000",
                    value: basicAmount || "",
                    onChange: handleBasicAmountChange,
                  }}
                />
                <Field
                  labelProps={{ children: "Effective Date" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.effective_date, {
                      type: "date",
                    }),
                  }}
                  errors={assignmentFields.effective_date.errors}
                />
              </>
            ) : (
              <>
                <Field
                  labelProps={{ children: "Basic Amount (Rs)" }}
                  inputProps={{
                    type: "number",
                    step: "any",
                    placeholder: "e.g. 25000",
                    value: basicAmount || "",
                    onChange: handleBasicAmountChange,
                  }}
                />
                <Field
                  labelProps={{ children: "Basic Percent (%)" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.basic_percent, {
                      type: "number",
                    }),
                    step: "any",
                    placeholder: "e.g. 50",
                    onChange: handleBasicPercentChange,
                  }}
                  errors={assignmentFields.basic_percent.errors}
                />
                <Field
                  labelProps={{
                    children: "Monthly CTC (Rs) — auto-calculated",
                  }}
                  inputProps={{
                    ...getInputProps(assignmentFields.monthly_ctc, {
                      type: "number",
                    }),
                    step: "any",
                    readOnly: true,
                    className: "bg-muted/50 text-muted-foreground",
                    placeholder: "Enter Basic and Percent",
                  }}
                  errors={assignmentFields.monthly_ctc.errors}
                />
                <Field
                  labelProps={{ children: "Effective Date" }}
                  inputProps={{
                    ...getInputProps(assignmentFields.effective_date, {
                      type: "date",
                    }),
                  }}
                  errors={assignmentFields.effective_date.errors}
                />
              </>
            )}

            <div className="relative">
              <CheckboxField
                className="mt-6"
                labelProps={{ children: "Is Pro Rata" }}
                buttonProps={
                  {
                    ...getInputProps(assignmentFields.is_pro_rata, {
                      type: "checkbox",
                    }),
                    checked: isProRata,
                    onCheckedChange: (checked: boolean) => {
                      isProRataControl.change(checked ? "on" : undefined);
                    },
                  } as any
                }
                errors={assignmentFields.is_pro_rata.errors}
              />
            </div>
            <input
              type="hidden"
              name={assignmentFields.use_payment_template.name}
              value={selectedTemplateId ? "true" : "false"}
            />
            <input
              type="hidden"
              name={assignmentFields.calculation_direction?.name || "assignment.calculation_direction"}
              value={ctcCalculationMode}
            />
            <input
              type="hidden"
              name={assignmentFields.basic_formula?.name || "assignment.basic_formula"}
              value={basicFormula}
            />

            {ctcCalculationMode === "ctc_to_basic" &&
              monthlyCtcValue > 0 &&
              basicPercentValue > 0 && (
                <p className="text-xs text-muted-foreground -mt-2 col-span-full">
                  Basic Amount: ₹
                  {Math.round(
                    (monthlyCtcValue * basicPercentValue) / 100,
                  ).toLocaleString()}{" "}
                  (calculated from CTC)
                </p>
              )}
            {
              <div className="col-span-full flex flex-col md:flex-row gap-4 items-end">
                <SearchableSelectField
                  className="flex-1"
                  labelProps={{ children: "Select Template" }}
                  options={paymentTemplateOptions}
                  inputProps={{
                    ...getInputProps(assignmentFields.template_id, {
                      type: "text",
                    }),
                  }}
                  onChange={(value) => {
                    form.update({
                      name: assignmentFields.template_id.name,
                      value,
                    });

                    form.update({
                      name: fields.components.name,
                      value: [],
                    });

                    if (value) {
                      setIsAutofillTriggered(true);
                      if (fetcher.data?.template?.id === value) {
                        applyTemplate(fetcher.data.template);
                        setIsAutofillTriggered(false);
                      } else {
                        fetcher.load(`/api/payment-template/${value}`);
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={autofillFromTemplate}
                  disabled={!selectedTemplateId || fetcher.state !== "idle"}
                >
                  <Icon name="magic" className="mr-2" />
                  {fetcher.state !== "idle"
                    ? "Loading..."
                    : "Auto-fill from Template"}
                </Button>
              </div>
            }
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Statutory Components</CardTitle>
          <CardDescription>
            Configure statutory deductions for this assignment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-6">
            <div className="flex items-end gap-2">
              <ConformControlledSelectField
                className="flex-1"
                labelProps={{ children: "Provident Fund (PF)" }}
                options={pfOptions || []}
                name={statutoryFields?.pf_id?.name || "statutory.pf_id"}
                value={statutoryFields?.pf_id?.value || ""}
                onChange={(value) => {
                  form.update({
                    name: statutoryFields?.pf_id?.name || "statutory.pf_id",
                    value,
                  });
                }}
                placeholder="Select PF configuration"
                errors={statutoryFields?.pf_id?.errors}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-8"
                disabled={!statutoryFields?.pf_id?.value}
                onClick={() =>
                  form.update({
                    name: statutoryFields?.pf_id?.name || "statutory.pf_id",
                    value: "",
                  })
                }
              >
                <Icon name="trash" className="text-destructive" size="sm" />
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <ConformControlledSelectField
                className="flex-1"
                labelProps={{ children: "ESIC" }}
                options={esicOptions || []}
                name={statutoryFields?.esic_id?.name || "statutory.esic_id"}
                value={statutoryFields?.esic_id?.value || ""}
                onChange={(value) => {
                  form.update({
                    name: statutoryFields?.esic_id?.name || "statutory.esic_id",
                    value,
                  });
                }}
                placeholder="Select ESIC configuration"
                errors={statutoryFields?.esic_id?.errors}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-8"
                disabled={!statutoryFields?.esic_id?.value}
                onClick={() =>
                  form.update({
                    name: statutoryFields?.esic_id?.name || "statutory.esic_id",
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
              <ConformControlledSelectField
                className="flex-1"
                labelProps={{ children: "Professional Tax (PT)" }}
                options={ptOptions || []}
                name={statutoryFields?.pt_id?.name || "statutory.pt_id"}
                value={statutoryFields?.pt_id?.value || ""}
                onChange={(value) => {
                  form.update({
                    name: statutoryFields?.pt_id?.name || "statutory.pt_id",
                    value,
                  });
                }}
                placeholder="Select PT configuration"
                errors={statutoryFields?.pt_id?.errors}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-8"
                disabled={!statutoryFields?.pt_id?.value}
                onClick={() =>
                  form.update({
                    name: statutoryFields?.pt_id?.name || "statutory.pt_id",
                    value: "",
                  })
                }
              >
                <Icon name="trash" className="text-destructive" size="sm" />
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <ConformControlledSelectField
                className="flex-1"
                labelProps={{ children: "Statutory Bonus" }}
                options={bonusOptions || []}
                name={
                  statutoryFields?.statutory_bonus_id?.name ||
                  "statutory.statutory_bonus_id"
                }
                value={statutoryFields?.statutory_bonus_id?.value || ""}
                onChange={(value) => {
                  form.update({
                    name:
                      statutoryFields?.statutory_bonus_id?.name ||
                      "statutory.statutory_bonus_id",
                    value,
                  });
                }}
                placeholder="Select Bonus configuration"
                errors={statutoryFields?.statutory_bonus_id?.errors}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-8"
                disabled={!statutoryFields?.statutory_bonus_id?.value}
                onClick={() =>
                  form.update({
                    name:
                      statutoryFields?.statutory_bonus_id?.name ||
                      "statutory.statutory_bonus_id",
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
              <ConformControlledSelectField
                className="flex-1"
                labelProps={{ children: "Labour Welfare Fund (LWF)" }}
                options={lwfOptions || []}
                name={
                  statutoryFields?.labour_welfare_fund_id?.name ||
                  "statutory.labour_welfare_fund_id"
                }
                value={statutoryFields?.labour_welfare_fund_id?.value || ""}
                onChange={(value) => {
                  form.update({
                    name:
                      statutoryFields?.labour_welfare_fund_id?.name ||
                      "statutory.labour_welfare_fund_id",
                    value,
                  });
                }}
                placeholder="Select LWF configuration"
                errors={statutoryFields?.labour_welfare_fund_id?.errors}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-8"
                disabled={!statutoryFields?.labour_welfare_fund_id?.value}
                onClick={() =>
                  form.update({
                    name:
                      statutoryFields?.labour_welfare_fund_id?.name ||
                      "statutory.labour_welfare_fund_id",
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Salary Components</CardTitle>
            <CardDescription>
              Individual salary heads like HRA, LTA, Bonus, etc.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              form.insert({
                name: fields.components.name,
                defaultValue: { payment_field_id: "", amount: 0 } as any,
              })
            }
          >
            <Icon name="plus" size="sm" className="mr-2" />
            Add Component
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {componentList.map((component: any, index: number) => {
            const componentFields = component.getFieldset();
            const selectedFieldId = componentFields.payment_field_id.value;

            const currentValue = componentFields.payment_field_id.value;
            const filteredOptions = paymentFieldsOptions.filter((option) => {
              if (option.value === currentValue) return true;
              return !selectedIds.includes(option.value);
            });

            const selectedPaymentField = selectedFieldId
              ? paymentFieldsData.find((f) => f.id === selectedFieldId)
              : null;

            const isPercentageOfBasic =
              selectedPaymentField?.calculation_type === "percentage_of_basic";

            return (
              <div
                key={component.key}
                className="relative border rounded-lg p-6 pt-10 grid grid-cols-1 md:grid-cols-2 gap-6 bg-card/50"
              >
                <input
                  {...getInputProps(componentFields.id, { type: "hidden" })}
                />
                <Button
                  type="button"
                  variant="destructive-outline"
                  size="icon"
                  className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    form.remove({ name: fields.components.name, index })
                  }
                >
                  <Icon name="trash" size="sm" />
                </Button>

                <SearchableSelectField
                  labelProps={{ children: "Payment Field" }}
                  options={filteredOptions}
                  inputProps={{
                    ...getInputProps(componentFields.payment_field_id, {
                      type: "text",
                    }),
                  }}
                  placeholder="Select Field"
                  errors={componentFields.payment_field_id.errors}
                  onChange={(selectedId) => {
                    const field = paymentFieldsData.find(
                      (f) => f.id === selectedId,
                    );

                    if (!field) return;

                    const prevFieldId = componentFields.payment_field_id.value;

                    if (prevFieldId !== selectedId) {
                      form.update({
                        name: componentFields.amount.name,
                        value: formatAmount(field.amount),
                      });
                    }

                    form.update({
                      name: componentFields.payment_field_id.name,
                      value: selectedId,
                    });
                  }}
                />

                <Field
                  labelProps={{
                    children: isPercentageOfBasic
                      ? "Amount (%)"
                      : "Amount (Rs)",
                  }}
                  inputProps={{
                    ...getInputProps(componentFields.amount, {
                      type: "number",
                    }),
                    placeholder: isPercentageOfBasic
                      ? "e.g. 40"
                      : "Fixed Amount",
                  }}
                  errors={componentFields.amount.errors}
                />
              </div>
            );
          })}
          {componentList.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/50 text-muted-foreground">
              <Icon name="info" className="mx-auto h-8 w-8 mb-2 opacity-20" />
              <p>No components added yet.</p>
              <p className="text-sm">
                Click "Add Component" or use "Auto-fill from Template".
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function EmployeeSalaryForm({
  initialValues,
  paymentTemplateOptions,
  paymentFieldsOptions,
  paymentFieldsData,
  pfOptions,
  esicOptions,
  ptOptions,
  bonusOptions,
  lwfOptions,
}: EmployeeSalaryFormProps) {
  const { employeeId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const actionData = useActionData<any>();
  const [resetKey, setResetKey] = useState(Date.now());

  const formattedInitialValues = useMemo(() => {
    if (!initialValues) return undefined;
    const formatted = { ...initialValues };
    if (formatted.assignment) {
      formatted.assignment = {
        ...formatted.assignment,
        monthly_ctc: formatted.assignment.monthly_ctc
          ? Number(formatAmount(formatted.assignment.monthly_ctc))
          : undefined,
        basic_percent:
          formatted.assignment.basic_percent != null
            ? Number(formatted.assignment.basic_percent)
            : undefined,
      };
    }
    if (Array.isArray(formatted.components)) {
      formatted.components = formatted.components.map((c: any) => ({
        ...c,
        amount: c.amount ? Number(formatAmount(c.amount)) : 0,
      }));
    }
    return formatted;
  }, [initialValues]);

  const [form, fields] = useForm({
    id: "employee-salary-form",
    constraint: getZodConstraint(EmployeeSalaryUnifiedSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: EmployeeSalaryUnifiedSchema });
    },
    defaultValue: formattedInitialValues ?? {
      assignment: {
        employee_id: employeeId,
        basic_percent: 50,
        is_pro_rata: true,
        use_payment_template: false,
      },
      components: [],
      statutory: {},
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
  });

  useEffect(() => {
    if (actionData?.status === "success") {
      toast({
        title: "Success",
        description: actionData.message,
        variant: "success",
      });
      if (actionData.returnTo) navigate(actionData.returnTo);
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description: actionData.message || actionData.error?.message,
        variant: "destructive",
      });
    }
  }, [actionData, navigate, toast]);

  return (
    <FormProvider context={form.context}>
      <Form
        method="POST"
        {...getFormProps(form)}
        key={resetKey}
        className="flex flex-col gap-8"
      >
        <EmployeeSalaryFormFields
          form={form}
          fields={fields}
          paymentTemplateOptions={paymentTemplateOptions}
          paymentFieldsOptions={paymentFieldsOptions}
          paymentFieldsData={paymentFieldsData}
          pfOptions={pfOptions}
          esicOptions={esicOptions}
          ptOptions={ptOptions}
          bonusOptions={bonusOptions}
          lwfOptions={lwfOptions}
        />

        <div className="flex items-center justify-end gap-4 mt-8 px-6 pb-6">
          <Link
            to={`/employees/${employeeId}/salary`}
            className={cn(buttonVariants({ variant: "outline" }), "min-w-28")}
          >
            Cancel
          </Link>
          <FormButtons
            form={form}
            setResetKey={setResetKey}
            isSingle={true}
            className="p-0 border-none shadow-none"
          />
        </div>
      </Form>
    </FormProvider>
  );
}
