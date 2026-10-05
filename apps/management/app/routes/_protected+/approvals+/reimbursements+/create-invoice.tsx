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
  SIZE_10MB,
  transformStringArrayIntoOptions,
} from "@canny_ecosystem/utils";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
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
import { useReimbursementStore } from "@/store/reimbursements";

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

  const { data: companyLocations } = await getLocationsForSelectByCompanyId({
    companyId,
    supabase,
  });

  const companyLocationArray = companyLocations?.map((location) => ({
    label: location?.name,
    value: location?.id,
  }));
  const { data: userList } = await getUsersByCompanyId({
    companyId,
    supabase,
  });
  const userOptions = userList?.map((user) => ({
    label: user?.email,
    value: user?.id,
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
    userOptions,
    companyLocationArray,
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
    const selectedReimbursementData = JSON.parse(selectedRowData || "[]");
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
      });

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
    }
    const { data, status, error } = await createInvoice({
      supabase,
      data: submission.value,
    });
    if ((data as any)?.id) {
      const updatedReimbursement = (
        selectedReimbursementData as Array<{ id: string }>
      ).map(({ id }: { id: string }) => ({
        id: id!,
        invoice_id: (data as any).id!,
      }));

      for (const entry of updatedReimbursement) {
        const { id, invoice_id } = entry;
        const { error } = await supabase
          .from("reimbursements")
          .update({ invoice_id })
          .eq("id", id);

        if (error) {
          return json({
            status: "error",
            message: "Error udating Reimbursement",
            error,
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

export default function CreateInvoiceFromRiembursement({
  updateValues,
  locationArrayFromUpdate,
  companyRelationsFromUpdate,
  userOptionsFromUpdate,
}: {
  updateValues?: InvoiceDatabaseInsert;
  locationArrayFromUpdate: any[];
  userOptionsFromUpdate: any[];
  companyRelationsFromUpdate: any;
}) {
  const {
    companyId,
    companyLocationArray,
    userOptions,
    companyRelations,
    invoicePrefix,
    latestInvoiceNumber,
  } = useLoaderData<typeof loader>();
  const { selectedRows } = useReimbursementStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const allRelations = companyRelationsFromUpdate ?? companyRelations;
  const relations =
    allRelations?.find(
      (r: any) => r.relationship_type?.toLowerCase() === "manpower",
    ) ?? allRelations?.[0];
  const manpowerVersions = (relations?.relationship_manpower_version ??
    []) as ManpowerVersion[];

  const sortedManpowerVersions = [...manpowerVersions].sort(
    (a, b) =>
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
  );

  const initialValues = updateValues ?? getInitialValueFromZod(InvoiceSchema);

  const validSelectedRows = selectedRows.filter(
    (row) => !row.invoice_id || row.invoice_id === initialValues.id,
  );

  useEffect(() => {
    const skippedCount = selectedRows.length - validSelectedRows.length;
    if (skippedCount > 0) {
      toast({
        title: "Information",
        description: `${skippedCount} entries skipped because an invoice is already created for them.`,
      });
    }
  }, [selectedRows.length, validSelectedRows.length, toast]);

  function transformPayrollData(employees: any[]) {
    const total = employees.reduce(
      (sum, entry) => sum + (entry?.amount || 0),
      0,
    );

    return [
      {
        field: "REIMBURSEMENT",
        amount: Number(total.toFixed(2)),
      },
    ];
  }

  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());
  const [chargeValue, setChargeValue] = useState<number>(
    typeof updateValues?.charge_amount === "number"
      ? (updateValues.charge_amount as number)
      : 0,
  );

  const INVOICE_TAG = updateValues ? "Update-Invoice" : ADD_INVOICE_TAG;

  function extractSiteName(row: any): string | null {
    if (!row) return null;
    if (typeof row.site_name === "string" && row.site_name.trim()) return row.site_name.trim();
    if (row.site?.name && typeof row.site.name === "string") return row.site.name.trim();
    if (row.sites?.name && typeof row.sites.name === "string") return row.sites.name.trim();
    if (Array.isArray(row.sites) && row.sites[0]?.name) return row.sites[0].name.trim();

    const emp = row.employees || row.employee;
    if (emp) {
      if (typeof emp.site_name === "string" && emp.site_name.trim()) return emp.site_name.trim();
      if (emp.site?.name) return emp.site.name.trim();
      if (emp.sites?.name) return emp.sites.name.trim();
      if (Array.isArray(emp.sites) && emp.sites[0]?.name) return emp.sites[0].name.trim();

      const wd = Array.isArray(emp.work_details) ? emp.work_details[0] : emp.work_details;
      if (wd) {
        if (typeof wd.site_name === "string" && wd.site_name.trim()) return wd.site_name.trim();
        if (wd.site?.name) return wd.site.name.trim();
        if (wd.sites?.name) return wd.sites.name.trim();
        if (Array.isArray(wd.sites) && wd.sites[0]?.name) return wd.sites[0].name.trim();
      }
    }

    return null;
  }

  function extractDepartmentName(row: any): string | null {
    if (!row) return null;
    if (typeof row.department_name === "string" && row.department_name.trim()) return row.department_name.trim();
    if (row.department?.name && typeof row.department.name === "string") return row.department.name.trim();
    if (row.departments?.name && typeof row.departments.name === "string") return row.departments.name.trim();
    if (Array.isArray(row.departments) && row.departments[0]?.name) return row.departments[0].name.trim();

    const emp = row.employees || row.employee;
    if (emp) {
      if (typeof emp.department_name === "string" && emp.department_name.trim()) return emp.department_name.trim();
      if (emp.department?.name) return emp.department.name.trim();
      if (emp.departments?.name) return emp.departments.name.trim();
      if (Array.isArray(emp.departments) && emp.departments[0]?.name) return emp.departments[0].name.trim();

      const wd = Array.isArray(emp.work_details) ? emp.work_details[0] : emp.work_details;
      if (wd) {
        if (typeof wd.department_name === "string" && wd.department_name.trim()) return wd.department_name.trim();
        if (wd.department?.name) return wd.department.name.trim();
        if (wd.departments?.name) return wd.departments.name.trim();
        if (Array.isArray(wd.departments) && wd.departments[0]?.name) return wd.departments[0].name.trim();
      }
    }

    return null;
  }

  const siteNames = Array.from(
    new Set(
      validSelectedRows
        .map((row: any) => extractSiteName(row))
        .filter((name): name is string => Boolean(name)),
    ),
  ).join(", ");

  const departmentNames = Array.from(
    new Set(
      validSelectedRows
        .map((row: any) => extractDepartmentName(row))
        .filter((name): name is string => Boolean(name)),
    ),
  ).join(", ");

  let monthStr = "";
  const dateVal = initialValues.date || new Date().toISOString();
  if (dateVal) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      monthStr = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    }
  }

  const defaultReimbursementSubject = getDefaultInvoiceSubject("reimbursement", {
    siteName: siteNames || undefined,
    departmentName: departmentNames || undefined,
    month: monthStr || undefined,
  });

  const [form, fields] = useForm({
    id: "invoice",
    constraint: getZodConstraint(InvoiceSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: InvoiceSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      subject: updateValues?.subject ?? defaultReimbursementSubject,
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
        ? typeof updateValues?.payroll_data === "string"
          ? JSON.parse(updateValues.payroll_data as string)
          : updateValues.payroll_data
        : transformPayrollData(validSelectedRows as any[]),
      type: updateValues?.type ?? "reimbursement",
      proof: undefined,
    },
  });

  const activeManpowerVersion =
    sortedManpowerVersions.find((v) => {
      const selectedDateStr = fields.date.value || fields.date.initialValue;
      if (!selectedDateStr) return false;
      const selectedDate = new Date(selectedDateStr as any);
      const startDate = new Date(v.start_date);
      const endDate = v.end_date ? new Date(v.end_date) : null;
      return selectedDate >= startDate && (!endDate || selectedDate <= endDate);
    }) || sortedManpowerVersions[0];

  useEffect(() => {
    if (!actionData) return;
    if (actionData.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.payroll_invoice);
      toast({
        title: "Success",
        description: actionData?.message ?? "Invoice created",
        variant: "success",
      });
    } else {
      toast({
        title: "Error",
        description: actionData.error?.message ?? "Invoice create failed",
        variant: "destructive",
      });
    }

    navigate("/payroll/invoices", {
      replace: true,
    });
  }, [actionData]);

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
                value={JSON.stringify(validSelectedRows)}
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
                  key={resetKey}
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
                  key={resetKey + 1}
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
                    defaultValue:
                      (fields.type.initialValue as string) ?? undefined,
                    readOnly: true,
                  }}
                  placeholder={"Select Type"}
                  labelProps={{
                    children: "Type",
                  }}
                  errors={fields.type.errors}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">
                    Reimbursement Charges
                  </label>
                  <input
                    type="number"
                    id="reimbursement_charges_display"
                    value={chargeValue}
                    readOnly
                    className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm text-muted-foreground cursor-not-allowed"
                  />
                  <input
                    type="hidden"
                    name={fields.charge_amount.name}
                    value={chargeValue}
                  />
                </div>
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

                  const chargeLabel =
                    activeCharge != null
                      ? `${activeCharge}% on ${
                          activeManpowerVersion?.service_charges_on
                            ? activeManpowerVersion.service_charges_on
                                .charAt(0)
                                .toUpperCase() +
                              activeManpowerVersion.service_charges_on.slice(1)
                            : ""
                        }`
                      : "N/A";

                  return (
                    <CheckboxField
                      buttonProps={{
                        ...getInputProps(fields.include_charge, {
                          type: "checkbox",
                        }),
                        onCheckedChange: (checked: boolean) => {
                          setChargeValue(checked ? activeCharge ?? 0 : 0);
                        },
                      }}
                      labelProps={{
                        children: `Is Charge Included? (${chargeLabel})`,
                      }}
                    />
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
                    required: fields.is_paid.value === "on",
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.paid_date.name),
                  }}
                  errors={fields.paid_date.errors}
                />
              </div>
              <RangeField
                key={resetKey + 2}
                labelProps={{ children: "Field" }}
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
                    key: "field",
                    type: "text",
                    placeholder: "Field",
                  },
                  { key: "amount", type: "number", placeholder: "Amount" },
                ]}
                errors={fields.payroll_data.errors}
              />
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
