import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { safeRedirect } from "@/utils/server/http.server";
import {
  hasPermission,
  isGoodStatus,
  ReimbursementSchema,
  reimbursementStatusArray,
  replaceUnderscore,
  transformStringArrayIntoOptions,
  createRole,
  reimbursementTypeArray,
  z,
  getInitialValueFromZod,
  currentDate,
} from "@canny_ecosystem/utils";

import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Field, SearchableSelectField } from "@canny_ecosystem/ui/forms";
import { FormButtons } from "@/components/form/form-buttons";
import {
  createReimbursementsFromData,
  createReimbursementFromAdvance,
} from "@canny_ecosystem/supabase/mutations";
import type { ReimbursementInsert } from "@canny_ecosystem/supabase/types";
import {
  getEmployeesBySiteId,
  getEmployeesByCompanyId,
  getSiteNamesByCompanyId,
  getUsersByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { useEffect, useState } from "react";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { cacheKeyPrefix, DEFAULT_ROUTE, recentlyAddedFilter } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry } from "@/utils/cache";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Label } from "@canny_ecosystem/ui/label";

export const ADD_REIMBURSEMENTS_TAG = "Add_Reimbursement";
const BulkReimbursementSchema = z.object({
  singleValue: ReimbursementSchema.pick({
    submitted_date: true,
    status: true,
    user_id: true,
    company_id: true,
    type: true,
    note: true,
  }),
  reimbursements: z.array(
    ReimbursementSchema.pick({ amount: true, employee_id: true }),
  ),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(
      user?.role!,
      `${createRole}:${attribute.employeeReimbursements}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const url = new URL(request.url);
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const { data: userData } = await getUsersByCompanyId({
    supabase,
    companyId,
  });

  const searchParams = new URLSearchParams(url.searchParams);

  const { data: siteData } = await getSiteNamesByCompanyId({
    supabase,
    companyId,
  });

  const site = searchParams.get("site") ?? "";

  let employeeData = null;
  if (site) {
    const { data } = await getEmployeesBySiteId({ supabase, siteId: site });
    employeeData = data;
  } else {
    const { data } = await getEmployeesByCompanyId({
      supabase,
      companyId,
      params: { from: 0, to: 500 },
    });
    employeeData = data;
  }

  const userOptions = userData?.map((user: any) => ({
    label: (user.email?.toLowerCase() ?? "") as string,
    value: user.id as string,
  }));

  const siteOptions = siteData?.map((siteData: any) => ({
    label: siteData.name as string,
    pseudoLabel: siteData?.projects?.name as string,
    value: siteData.id as string,
  }));

  const employeeOptions = employeeData?.map((employeeData: any) => ({
    label: employeeData.employee_code as string,
    pseudoLabel: `${employeeData?.first_name
      } ${employeeData?.middle_name ?? ""} ${employeeData?.last_name ?? ""}`,
    value: employeeData.id as string,
  }));

  return json({ userOptions, siteOptions, employeeOptions, companyId });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();
  const submission = parseWithZod(formData, {
    schema: BulkReimbursementSchema,
  });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  const data = submission.value.reimbursements.map((value) => ({
    ...submission.value.singleValue,
    ...value,
  }));

  let createdCount = 0;
  let status = 200;
  let error: any = null;

  const isAdvancesType = submission.value.singleValue.type === "advances";

  if (isAdvancesType) {
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    for (const item of data) {
      if (!item.employee_id) continue;
      const { data: createdAdvance } = await supabase
        .from("employee_advance_details")
        .insert({
          company_id: companyId,
          employee_id: item.employee_id,
          advance_name: item.note || `Advance claim for employee`,
          advance_date:
            item.submitted_date || new Date().toISOString().split("T")[0],
          amount: parseFloat(item.amount as any) || 0,
          is_paid: false,
        })
        .select()
        .single();

      if (createdAdvance && createdAdvance.id) {
        const { status: reimbStatus } = await createReimbursementFromAdvance({
          supabase,
          data: item as unknown as ReimbursementInsert,
          advanceId: createdAdvance.id,
        });
        if (isGoodStatus(reimbStatus)) {
          createdCount++;
        }
      }
    }
    if (createdCount > 0) {
      status = 200;
    } else {
      status = 400;
      error = "Failed to create advance details and reimbursements.";
    }
  } else {
    const result = await createReimbursementsFromData({
      supabase,
      reimbursementsData: data as unknown as ReimbursementInsert[],
    });
    status = result.status;
    error = result.error;
  }

  if (isGoodStatus(status)) {
    return json({
      status: "success",
      message: isAdvancesType
        ? `${createdCount} Employee Advances & Reimbursements Created Successfully`
        : "Employee Reimbursements Created Successfully",
      error: null,
    });
  }
  return json({
    status: "error",
    message: "Employee Reimbursements Create Failed",
    error,
  });
}

export default function AddBulkReimbursements() {
  const { userOptions, siteOptions, employeeOptions, companyId } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());

  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const site = searchParams.get("site");
  const navigate = useNavigate();

  const paramFromEmail = searchParams.get("from_email");
  const paramAmount = searchParams.get("amount");
  const paramType = searchParams.get("type");
  const paramNote = searchParams.get("note");
  const paramDate = searchParams.get("date");
  const paramStatus = searchParams.get("status");
  const paramEmployeeId = searchParams.get("employee_id");
  const paramUserId = searchParams.get("user_id");

  const initialValues = getInitialValueFromZod(BulkReimbursementSchema);

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(`${cacheKeyPrefix.employee_reimbursements}`);
        clearCacheEntry(cacheKeyPrefix.reimbursements);
        toast({
          title: "Success",
          description: actionData?.message || "Reimbursement Created",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description:
            actionData?.error?.message ??
            actionData?.message ??
            "Reimbursement Create Failed",
          variant: "destructive",
        });
      }
      navigate(
        `/approvals/reimbursements?recently_added=${recentlyAddedFilter[0]}`,
      );
    }
  }, [actionData]);

  const REIMBURSEMENTS_TAG = ADD_REIMBURSEMENTS_TAG;

  const [form, fields] = useForm({
    id: REIMBURSEMENTS_TAG,
    constraint: getZodConstraint(BulkReimbursementSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: BulkReimbursementSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      singleValue: {
        ...initialValues.singleValue,
        company_id: companyId,
        submitted_date: paramDate || currentDate,
        status: paramStatus || "approved",
        type: paramType || "expenses",
        note: paramNote || "",
        user_id: paramUserId || "",
      },
      reimbursements: [
        {
          employee_id: paramEmployeeId || "",
          amount: paramAmount ? Number(paramAmount) : undefined,
        },
      ],
    },
  });

  const singleField = fields.singleValue.getFieldset();

  const addReimbursement = () => {
    if (form.value?.reimbursements) {
      form.update({
        value: {
          ...form.value,
          reimbursements: [
            ...(form.value?.reimbursements as any),
            initialValues.reimbursements,
          ],
        },
      });
    } else {
      form.update({
        value: {
          ...form.value,
          reimbursements: [initialValues.reimbursements],
        },
      });
    }
  };

  const removeReimbursement = (index: number) => {
    if (form.value?.reimbursements) {
      const updated = [...form.value.reimbursements];
      updated.splice(index, 1);

      form.update({
        value: {
          ...form.value,
          reimbursements: updated,
        },
      });
    }
  };

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">
                {`${replaceUnderscore(REIMBURSEMENTS_TAG)}s`}
              </CardTitle>
              <CardDescription className="lowercase">
                {`${replaceUnderscore(REIMBURSEMENTS_TAG)}s by filling this form`}
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col px-6">
              {paramFromEmail && (
                <div className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-between text-xs text-primary font-medium">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    <span><strong>Autofilled from Email:</strong> Review pre-filled fields (Employee, Date, Type, Note, Amount) and click Submit.</span>
                  </div>
                </div>
              )}
              <input
                {...getInputProps(singleField.company_id, { type: "hidden" })}
              />
              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8">
                <Field
                  key={paramDate || "submitted-date-field"}
                  inputProps={{
                    ...getInputProps(singleField.submitted_date, {
                      type: "date",
                    }),
                    defaultValue: paramDate || currentDate,
                  }}
                  labelProps={{
                    children: "Submitted Date",
                  }}
                  errors={singleField.submitted_date.errors}
                />
                <SearchableSelectField
                  key={paramStatus || resetKey}
                  className="w-full capitalize flex-1"
                  options={transformStringArrayIntoOptions(
                    reimbursementStatusArray as unknown as string[],
                  )}
                  inputProps={{
                    ...getInputProps(singleField.status, { type: "text" }),
                    defaultValue: paramStatus || "approved",
                  }}
                  placeholder={"Select Status"}
                  labelProps={{
                    children: "Status",
                  }}
                  errors={singleField.status.errors}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8">
                <SearchableSelectField
                  key={paramType || resetKey + 2}
                  inputProps={{
                    ...getInputProps(singleField.type, { type: "text" }),
                    placeholder: "Select Reimbursement Type",
                    defaultValue: paramType || "expenses",
                  }}
                  options={transformStringArrayIntoOptions(
                    reimbursementTypeArray as unknown as string[],
                  )}
                  labelProps={{
                    children: "Type",
                  }}
                  errors={singleField.type.errors}
                />
                <Field
                  key={paramNote || "note-field"}
                  inputProps={{
                    ...getInputProps(singleField.note, { type: "text" }),
                    defaultValue: paramNote || "",
                    placeholder: "Enter Note",
                  }}
                  labelProps={{
                    children: "Note",
                  }}
                  errors={singleField.note.errors}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8">
                <SearchableSelectField
                  key={paramUserId || resetKey + 1}
                  inputProps={{
                    ...getInputProps(singleField.user_id, { type: "text" }),
                    defaultValue: paramUserId || "",
                    placeholder: "Select an authority that approved",
                  }}
                  className="lowercase"
                  options={userOptions ?? []}
                  labelProps={{
                    children: "Approved By",
                  }}
                  errors={singleField.user_id.errors}
                />
                <div className="flex flex-col gap-1.5 items-start">
                  <Label>Site</Label>
                  <Combobox
                    key={resetKey + 4}
                    placeholder="Select Site to filter Employees"
                    className="mb-6 w-full"
                    options={siteOptions ?? []}
                    value={site ?? ""}
                    onChange={(value) => {
                      searchParams.set("site", value);
                      if (!value.length) {
                        searchParams.delete("site");
                      }
                      setSearchParams(searchParams);
                    }}
                  />
                </div>
              </div>
            </div>
            <CardContent className="max-h-[190px] overflow-scroll mb-4 border mx-6 py-4 rounded-md">
              {fields?.reimbursements.getFieldList().map((fieldSet, index) => {
                const field = fieldSet.getFieldset();
                return (
                  <div
                    key={String(
                      fields?.reimbursements.key! + index + resetKey + 3,
                    )}
                    className="flex flex-row items-center justify-center gap-2 max-sm:grid max-sm:grid-cols-2"
                  >
                    <div className="mb-6 py-[7px] px-3 border shadow rounded text-sm">
                      {index + 1}
                    </div>
                    <SearchableSelectField
                      key={String((paramEmployeeId || "") + resetKey + site! + index + 5)}
                      inputProps={{
                        ...getInputProps(field.employee_id, { type: "text" }),
                        defaultValue: (index === 0 && paramEmployeeId) ? paramEmployeeId : "",
                        placeholder: "Select Employee",
                      }}
                      options={employeeOptions ?? []}
                      errors={field.employee_id.errors}
                    />
                    <Field
                      key={String((paramAmount || "") + index + "amount")}
                      inputProps={{
                        ...getInputProps(field.amount, { type: "number" }),
                        defaultValue: (index === 0 && paramAmount) ? Number(paramAmount) : undefined,
                        placeholder: "Enter Amount",
                      }}
                      errors={field.amount.errors}
                    />
                    <Button
                      type="button"
                      onClick={() => removeReimbursement(index)}
                      variant="destructive-outline"
                      className="mb-6 h-min py-2.5"
                    >
                      <Icon name="cross" />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                onClick={addReimbursement}
                variant="primary-outline"
                size="full"
              >
                <Icon name="plus-circled" className="mr-2" /> Add Reimbursement
              </Button>
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
