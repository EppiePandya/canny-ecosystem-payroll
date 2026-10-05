import { FormButtons } from "@/components/form/form-buttons";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { addOrUpdateInvoiceWithProof } from "@canny_ecosystem/supabase/media";
import { createInvoice } from "@canny_ecosystem/supabase/mutations";
import {
  getCannyCompanyIdByName,
  getCompanyConfigByCompanyId,
  getLatestInvoiceByCompanyId,
  getLocationsForSelectByCompanyId,
  getRelationshipsByCompanyId,
  getUsersByCompanyId,
  getCompanyById,
  type ManpowerVersion,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { InvoiceDatabaseInsert } from "@canny_ecosystem/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import {
  CheckboxField,
  Field,
  RangeField,
  SearchableSelectField,
  TextareaField,
} from "@canny_ecosystem/ui/forms";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  generateEmployeeCodes as generateInvoiceCodes,
  generateInvoiceNumber,
  getDefaultInvoiceSubject,
  getInitialValueFromZod,
  InvoiceSchema,
  isGoodStatus,
  replaceDash,
  replaceUnderscore,
  roundToNearest,
  SIZE_10MB,
  transformStringArrayIntoOptions,
  type z,
} from "@canny_ecosystem/utils";
import {
  DEFAULT_PAYROLL_INVOICE_SUBJECT,
  DEFAULT_REIMBURSEMENT_INVOICE_SUBJECT,
} from "@canny_ecosystem/utils/constant";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  type ClientLoaderFunctionArgs,
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { parseMultipartFormData } from "@remix-run/server-runtime/dist/formData";
import { createMemoryUploadHandler } from "@remix-run/server-runtime/dist/upload/memoryUploadHandler";
import { useEffect, useState } from "react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useSalaryEntriesStore } from "@/store/salary-entries";

const ADD_INVOICE_TAG = "Create-Invoice";

export const CANNY_NAME = "Canny Management Services";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const { data: cannyData, error } = await getCannyCompanyIdByName({
    name: CANNY_NAME,
    supabase,
  });
  if (error) {
    throw new Error("Error fetching company ID");
  }

  let companyRelations = [] as any;
  if (cannyData?.id) {
    const { data } = await getRelationshipsByCompanyId({
      companyId,
      supabase: supabase as any,
    });
    companyRelations = (data ?? []) as unknown as any;
  }
  const { data: userList } = await getUsersByCompanyId({
    companyId,
    supabase,
  });
  const userOptions = userList?.map((user) => ({
    label: user?.email,
    value: user?.id,
  }));
  const { data: companyLocations } = await getLocationsForSelectByCompanyId({
    companyId,
    supabase,
  });

  const companyLocationArray = companyLocations?.map((location) => ({
    label: location?.name,
    value: location?.id,
  }));

  const { data: company } = await getCompanyById({ supabase, id: companyId });

  let targetCompanyId = companyId;
  if (company?.company_type === "sub_contractor" && company.contractor_id) {
    targetCompanyId = company.contractor_id;
  }

  const { data: companyConfig } = await getCompanyConfigByCompanyId({
    companyId: targetCompanyId,
    supabase,
  });

  const invoicePrefix = companyConfig?.invoice_prefix ?? "";
  const { data: latestInvoiceNumber } = await getLatestInvoiceByCompanyId({
    supabase,
    companyId: targetCompanyId,
    prefix: invoicePrefix,
  });

  return {
    companyRelations,
    companyLocationArray,
    userOptions,
    companyId,
    invoicePrefix,
    latestInvoiceNumber,
  };
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(
    `${cacheKeyPrefix.payroll_invoice}${args.params.payrollId}`,
    args,
  );
}

clientLoader.hydrate = true;

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });

  try {
    const formData = await parseMultipartFormData(
      request,
      createMemoryUploadHandler({ maxPartSize: SIZE_10MB }),
    );
    const selectedRowData = formData.get("selected_rows") as string;
    const selectedSalaryEntriesData = JSON.parse(selectedRowData || "[]");
    const submission = parseWithZod(formData, {
      schema: InvoiceSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    if (submission.value.proof) {
      const { error, status } = await addOrUpdateInvoiceWithProof({
        invoiceData: submission.value as InvoiceDatabaseInsert,
        proof: submission.value.proof as File,
        supabase,
        route: "add",
        selectedSalaryEntriesData,
      });

      if (isGoodStatus(status!)) {
        return json({
          status: "success",
          message: "Invoice created successfully",
          error: null,
        });
      }

      return json({
        status: "error",
        message: "Error creating Invoice",
        error,
      });
    }

    const { data, status, error } = await createInvoice({
      supabase,
      data: submission.value,
    });

    if (data?.id) {
      const entryIds = (selectedSalaryEntriesData as Array<any>)
        .map((salaryEntry) => salaryEntry.salary_entries?.id || salaryEntry.id)
        .filter(Boolean);

      if (entryIds.length > 0) {
        const { error: updateError } = await supabase
          .from("salary_entries")
          .update({ invoice_id: data.id })
          .in("id", entryIds);

        if (updateError) {
          console.error("Error updating Salary Entry invoice_id:", updateError);
          return json({
            status: "error",
            message: "Error updating Salary Entry",
            error: updateError,
          });
        }
      }
      return json({
        status: "success",
        message: "Invoice created successfully",
        error: null,
      });
    }
    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Invoice created successfully",
        error: null,
      });
    }

    return json({
      status: "error",
      message: "Error creating Invoice",
      error,
    });
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

const isPFField = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "pf" ||
    lower === "epf" ||
    lower.includes("provident fund") ||
    lower.includes("provident_fund") ||
    lower.includes("pf contribution")
  );
};

const isESIField = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "esi" ||
    lower === "esic" ||
    lower.includes("esic contribution") ||
    lower.includes("esi contribution") ||
    lower.includes("state insurance")
  );
};

export default function CreateInvoice({
  updateValues,
  locationArrayFromUpdate,
  userOptionsFromUpdate,
  companyRelationsFromUpdate,
}: {
  updateValues?: InvoiceDatabaseInsert;
  userOptionsFromUpdate: any[];
  locationArrayFromUpdate: any[];
  companyRelationsFromUpdate: any;
}) {
  const {
    companyId,
    companyLocationArray,
    companyRelations,
    userOptions,
    invoicePrefix,
    latestInvoiceNumber,
  } = useLoaderData<typeof loader>();

  const { selectedRows } = useSalaryEntriesStore();
  const [capturedSelectedRows] = useState(() => selectedRows);
  const rowsToUse = capturedSelectedRows.length ? capturedSelectedRows : selectedRows;

  const allRelations = companyRelationsFromUpdate ?? companyRelations;
  const relations =
    allRelations?.find(
      (r: any) => r.relationship_type?.toLowerCase() === "manpower",
    ) ?? allRelations?.[0];
  const manpowerVersions = (relations?.relationship_manpower_version ??
    []) as ManpowerVersion[];

  const initialValues = updateValues ?? getInitialValueFromZod(InvoiceSchema);

  type SalaryEntryWithRelations = {
    employee?: {
      id: string;
      first_name: string;
      last_name: string;
      employee_code: string;
      salary_assignment?: {
        statutory?: {
          pf?: {
            employee_contribution?: string | number | null;
            employer_contribution?: string | number | null;
          } | null;
          esi?: {
            employee_contribution?: string | number | null;
            employer_contribution?: string | number | null;
          } | null;
        } | null;
      } | null;
    } | null;
    salary_entries: {
      id: string;
      invoice_id: string | null;
      salary_field_values: Array<{
        amount: number;
        payroll_fields: { name: string; type: string };
      }>;
    };
  };

  function transformSalaryData(
    employees: SalaryEntryWithRelations[],
    version: ManpowerVersion | undefined,
  ) {
    const fieldTotals: Record<
      string,
      { rawAmount: number; type: string; displayName: string }
    > = {};

    for (const emp of employees) {
      const statutory = emp.employee?.salary_assignment?.statutory;
      const pfEmployeeRate = statutory?.pf?.employee_contribution
        ? Number(statutory.pf.employee_contribution)
        : 12;
      const pfEmployerRate = statutory?.pf?.employer_contribution
        ? Number(statutory.pf.employer_contribution)
        : 13;

      const esiEmployeeRate = statutory?.esi?.employee_contribution
        ? Number(statutory.esi.employee_contribution)
        : 0.75;
      const esiEmployerRate = statutory?.esi?.employer_contribution
        ? Number(statutory.esi.employer_contribution)
        : 3.25;

      if (emp.salary_entries?.salary_field_values) {
        for (const entry of emp.salary_entries.salary_field_values) {
          const fieldName = entry.payroll_fields.name;
          const normalizedKey = fieldName.trim().toLowerCase();

          let amount = entry.amount;
          if (isPFField(normalizedKey)) {
            amount =
              entry.amount > 0
                ? (entry.amount * pfEmployerRate) / pfEmployeeRate
                : 0;
          } else if (isESIField(normalizedKey)) {
            amount =
              entry.amount > 0
                ? (entry.amount * esiEmployerRate) / esiEmployeeRate
                : 0;
          }

          if (!fieldTotals[normalizedKey]) {
            fieldTotals[normalizedKey] = {
              rawAmount: 0,
              type: entry.payroll_fields.type,
              displayName: fieldName,
            };
          }
          fieldTotals[normalizedKey].rawAmount += amount;
        }
      }
    }

    const fallbackServiceChargesOn =
      "basic,hra,other allowances,other allowance,vda,da";
    const serviceChargesOn =
      version?.service_charges_on || fallbackServiceChargesOn;
    const includedFields = serviceChargesOn
      .split(",")
      .map((f: string) => f.trim().toLowerCase());

    const includeAll = serviceChargesOn === "ctc";

    const preferredDefaultOrder = [
      "basic",
      "basicc",
      "vda",
      "da",
      "other allowance",
      "other allowances",
      "hra",
      "pf",
      "esi",
      "esic",
      "pt",
      "bonus",
      "statutory bonus",
    ];

    function getOrderIndex(fieldName: string) {
      const lower = fieldName.trim().toLowerCase();
      const index = preferredDefaultOrder.indexOf(lower);
      return index !== -1 ? index : Infinity;
    }

    const allFields = Object.entries(fieldTotals).map(([key, data]) => ({
      field: data.displayName,
      data,
    }));

    allFields.sort((a, b) => {
      const idxA = getOrderIndex(a.field);
      const idxB = getOrderIndex(b.field);
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return a.field.localeCompare(b.field);
    });

    const orderedFields = allFields;

    return orderedFields.map(({ field, data }, index) => {
      const amount = data.rawAmount;
      const fieldKey = field.trim().toLowerCase();

      return {
        field,
        amount: roundToNearest(Number(amount)),
        type: data.type,
        in_service_charge:
          includeAll ||
          (serviceChargesOn === "gross" && data.type === "earning") ||
          includedFields.includes(fieldKey),
        order: index + 1,
      };
    });
  }
  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());
  const [chargeAmountValue, setChargeAmountValue] = useState<number>(
    Number(updateValues?.charge_amount ?? 0),
  );

  const INVOICE_TAG = updateValues ? "Update-Invoice" : ADD_INVOICE_TAG;

  const initialManpowerVersion =
    manpowerVersions.find((v) => {
      const selectedDateStr = initialValues.date;
      if (!selectedDateStr) return false;
      const selectedDate = new Date(selectedDateStr);
      const startDate = new Date(v.start_date);
      const endDate = v.end_date ? new Date(v.end_date) : null;
      return selectedDate >= startDate && (!endDate || selectedDate <= endDate);
    }) || manpowerVersions[0];

  const [form, fields] = useForm<z.infer<typeof InvoiceSchema>>({
    id: "invoice",
    constraint: getZodConstraint(InvoiceSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: InvoiceSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      company_id: initialValues.company_id ?? companyId,
      invoice_number:
        initialValues.invoice_number ||
        (!updateValues && invoicePrefix
          ? generateInvoiceNumber(
              invoicePrefix,
              latestInvoiceNumber ?? undefined,
            )
          : initialValues.invoice_number),
      payroll_data: updateValues
        ? (() => {
            const parsed =
              typeof updateValues?.payroll_data === "string"
                ? JSON.parse(updateValues.payroll_data as string)
                : updateValues.payroll_data;
            return Array.isArray(parsed)
              ? [...parsed].sort(
                  (a: any, b: any) =>
                    (Number(a.order) || 0) - (Number(b.order) || 0),
                )
              : parsed;
          })()
        : transformSalaryData(rowsToUse, initialManpowerVersion),
      type: updateValues?.type ?? "salary",
      subject: updateValues?.subject ?? getDefaultInvoiceSubject(updateValues?.type ?? "salary"),
      proof: undefined,
    },
  });

  const includeChargeControl = useInputControl(fields.include_charge);
  const typeControl = useInputControl(fields.type);
  const subjectControl = useInputControl(fields.subject);
  const dateControl = useInputControl(fields.date);

  const activeManpowerVersion =
    manpowerVersions.find((v) => {
      const selectedDateStr = fields.date.value || fields.date.initialValue;
      if (!selectedDateStr) return false;
      const selectedDate = new Date(selectedDateStr);
      const startDate = new Date(v.start_date);
      const endDate = v.end_date ? new Date(v.end_date) : null;
      return selectedDate >= startDate && (!endDate || selectedDate <= endDate);
    }) || manpowerVersions[0];

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;
    if (actionData.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.payroll_invoice);
      useSalaryEntriesStore.getState().setSelectedRows([]);
      useSalaryEntriesStore.getState().setRowSelection({});
      toast({
        title: "Success",
        description: actionData.message ?? "Invoice created",
        variant: "success",
      });
    } else {
      toast({
        title: "Error",
        description: actionData?.error?.message ?? "Invoice create failed",
        variant: "destructive",
      });
    }

    navigate("/payroll/invoices", {
      replace: true,
    });
  }, [actionData]);

  useEffect(() => {
    const activeCharge =
      {
        salary: activeManpowerVersion?.service_charge,
        reimbursement: activeManpowerVersion?.reimbursement_charge,
        exit: activeManpowerVersion?.exit_charge,
      }[typeControl.value as string] ?? activeManpowerVersion?.service_charge;

    const isIncluded =
      includeChargeControl.value === "on" ||
      includeChargeControl.value === "true" ||
      (includeChargeControl.value as any) === true;

    if (isIncluded) {
      setChargeAmountValue(activeCharge ?? 0);
    } else {
      setChargeAmountValue(0);
    }
  }, [
    includeChargeControl.value,
    typeControl.value,
    dateControl.value,
    activeManpowerVersion,
  ]);

  useEffect(() => {
    const currentSubject = subjectControl.value || "";
    if (typeControl.value === "reimbursement") {
      if (
        !currentSubject ||
        currentSubject === DEFAULT_PAYROLL_INVOICE_SUBJECT ||
        currentSubject.startsWith("Providing Manpower")
      ) {
        subjectControl.change(getDefaultInvoiceSubject("reimbursement"));
      }
    } else if (typeControl.value === "salary") {
      if (
        !currentSubject ||
        currentSubject === DEFAULT_REIMBURSEMENT_INVOICE_SUBJECT ||
        currentSubject.startsWith("Reimbursement of Expenses")
      ) {
        subjectControl.change(getDefaultInvoiceSubject("salary"));
      }
    }
  }, [typeControl.value]);

  return (
    <section className="p-4">
      <FormProvider context={form.context}>
        <Form
          method="POST"
          encType="multipart/form-data"
          {...getFormProps(form)}
          className="flex flex-col"
        >
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">
                {replaceDash(INVOICE_TAG)}
              </CardTitle>
              <CardDescription className="lowercase">
                {`${replaceDash(INVOICE_TAG)} by filling this form`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="hidden"
                name="selected_rows"
                value={JSON.stringify(rowsToUse)}
              />
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.company_id, { type: "hidden" })}
              />

              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.invoice_number, { type: "text" }),
                    placeholder: `Enter ${replaceUnderscore(
                      fields.invoice_number.name,
                    )}`,
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.invoice_number.name),
                  }}
                  errors={fields.invoice_number.errors}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.date, { type: "date" }),
                    placeholder: `Enter ${replaceUnderscore(fields.date.name)}`,
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.date.name),
                  }}
                  errors={fields.date.errors}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
                <TextareaField
                  textareaProps={{
                    ...getInputProps(fields.subject, { type: "text" }),
                    rows: 2,
                    placeholder: `Enter ${replaceUnderscore(
                      fields.subject.name,
                    )}`,
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.subject.name),
                  }}
                  errors={fields.subject.errors}
                />
                <SearchableSelectField
                  className="capitalize"
                  options={companyLocationArray ?? locationArrayFromUpdate}
                  inputProps={{
                    ...getInputProps(fields.company_address_id, {
                      type: "text",
                    }),
                    defaultValue:
                      (fields.company_address_id.initialValue as string) ??
                      undefined,
                  }}
                  placeholder={"Select Company Location"}
                  labelProps={{
                    children: "Company Location",
                  }}
                  errors={fields.company_address_id.errors}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.additional_text, { type: "text" }),
                    placeholder: `Enter ${replaceUnderscore(
                      fields.additional_text.name,
                    )}`,
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.additional_text.name),
                  }}
                  errors={fields.additional_text.errors}
                />
                <SearchableSelectField
                  className="capitalize"
                  options={userOptions ?? userOptionsFromUpdate}
                  inputProps={{
                    ...getInputProps(fields.user_id, {
                      type: "text",
                    }),
                    defaultValue:
                      (fields.user_id.initialValue as string) ?? undefined,
                  }}
                  placeholder={"Select Authority"}
                  labelProps={{
                    children: "Authority",
                  }}
                  errors={fields.user_id.errors}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4 mb-6">
                <SearchableSelectField
                  className="capitalize"
                  options={transformStringArrayIntoOptions([
                    "salary",
                    "exit",
                    "reimbursement",
                  ])}
                  inputProps={{
                    ...getInputProps(fields.type, {
                      type: "text",
                    }),
                    defaultValue: String(fields.type.initialValue),
                  }}
                  placeholder={"Select Type"}
                  labelProps={{
                    children: "Type",
                  }}
                  errors={fields.type.errors}
                />
              </div>

              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
                {(() => {
                  const activeCharge =
                    {
                      salary: activeManpowerVersion?.service_charge,
                      reimbursement:
                        activeManpowerVersion?.reimbursement_charge,
                      exit: activeManpowerVersion?.exit_charge,
                    }[fields.type.value as string] ??
                    activeManpowerVersion?.service_charge;

                  return (
                    <>
                      <input
                        type="hidden"
                        name={fields.charge_amount.name}
                        value={chargeAmountValue}
                      />
                      <CheckboxField
                        buttonProps={{
                          ...getInputProps(fields.include_charge, {
                            type: "checkbox",
                          }),
                          checked:
                            includeChargeControl.value === "on" ||
                            includeChargeControl.value === "true" ||
                            (includeChargeControl.value as any) === true,
                          onCheckedChange: (checked) => {
                            includeChargeControl.change(checked ? "on" : "");
                          },
                        }}
                        labelProps={{
                          children: `Is Charge Included? (${
                            activeCharge != null
                              ? `${activeCharge}% on ${(
                                  activeManpowerVersion?.service_charges_on ||
                                  "basic,hra,other allowances,other allowance,vda,da"
                                )
                                  .split(",")
                                  .map(
                                    (word) =>
                                      word.trim().charAt(0).toUpperCase() +
                                      word.trim().slice(1),
                                  )
                                  .join(", ")}`
                              : "N/A"
                          })`,
                        }}
                      />
                    </>
                  );
                })()}
                <CheckboxField
                  buttonProps={getInputProps(fields.include_cgst, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Is Cgst Included? (9%)",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4 my-5">
                <CheckboxField
                  buttonProps={getInputProps(fields.include_sgst, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Is Sgst Included? (9%)",
                  }}
                />
                <CheckboxField
                  buttonProps={getInputProps(fields.include_igst, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Is Igst Included? (18%)",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4 my-5">
                <CheckboxField
                  buttonProps={getInputProps(fields.include_sign_stamp, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Include Signature & Stamp?",
                  }}
                />
              </div>

              <Field
                className="my-2"
                inputProps={{
                  ...getInputProps(fields.proof, { type: "file" }),
                  placeholder: `Enter ${replaceUnderscore(fields.proof.name)}`,
                }}
                labelProps={{
                  children: replaceUnderscore(fields.proof.name),
                }}
                errors={fields.proof.errors}
              />
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4 my-5">
                <CheckboxField
                  buttonProps={getInputProps(fields.is_paid, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Is this paid?",
                  }}
                />
                <CheckboxField
                  buttonProps={getInputProps(fields.include_header, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Include header in Invoice?",
                  }}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.paid_date, { type: "date" }),
                    placeholder: `Enter ${replaceUnderscore(
                      fields.paid_date.name,
                    )}`,
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.paid_date.name),
                  }}
                  errors={fields.paid_date.errors}
                />
              </div>
              <RangeField
                key={resetKey}
                labelProps={{ children: "Payroll salary" }}
                inputProps={{
                  ...getInputProps(fields.payroll_data, {
                    type: "hidden",
                  }),
                  defaultValue: JSON.stringify(
                    fields.payroll_data.initialValue ??
                      fields.payroll_data.value,
                  ),
                }}
                fields={[
                  {
                    key: "in_service_charge",
                    type: "checkbox",
                    placeholder: "Is in Service Charge ?",
                  },
                  {
                    key: "order",
                    type: "number",
                    placeholder: "Order",
                  },
                  {
                    key: "field",
                    type: "text",
                    placeholder: "Payroll Fields",
                  },
                  { key: "amount", type: "number", placeholder: "Amount" },
                ]}
                errors={fields.payroll_data.errors}
              />

              <p className={cn("text-muted-foreground tracking-wide hidden")}>
                Note : All default values are system generated, Please verify
                them manually before submitting.
              </p>
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
