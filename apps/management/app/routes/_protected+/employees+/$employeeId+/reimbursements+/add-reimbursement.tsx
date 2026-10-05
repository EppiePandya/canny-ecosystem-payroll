import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { safeRedirect } from "@/utils/server/http.server";
import {
  getInitialValueFromZod,
  hasPermission,
  isGoodStatus,
  ReimbursementSchema,
  reimbursementStatusArray,
  replaceUnderscore,
  transformStringArrayIntoOptions,
  createRole,
  reimbursementTypeArray,
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
  createReimbursementFromLoan,
  createReimbursementFromAdvance,
  createReimbursementsFromData,
} from "@canny_ecosystem/supabase/mutations";
import type {
  ReimbursementInsert,
  ReimbursementsUpdate,
} from "@canny_ecosystem/supabase/types";
import { UPDATE_REIMBURSEMENTS_TAG } from "../../../approvals+/reimbursements+/$reimbursementId.update-reimbursements";
import {
  getEmployeeLoanById,
  getEmployeeAdvanceById,
  getUsersByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { useEffect, useState } from "react";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry } from "@/utils/cache";

export const ADD_REIMBURSEMENTS_TAG = "Add_Reimbursement";

export async function loader({ request, params }: LoaderFunctionArgs) {
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
  const employeeId = params.employeeId;

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const { data: userData, error: userError } = await getUsersByCompanyId({
    supabase,
    companyId,
  });
  if (userError || !userData) {
    throw userError;
  }

  const userOptions = userData.map((userData) => ({
    label: userData.email?.toLowerCase() ?? "",
    value: userData.id!,
  }));

  const url = new URL(request.url);
  const loanId = url.searchParams.get("loanId");
  const advanceId = url.searchParams.get("advanceId");
  let amount: string | null = null;
  let note: string | null = null;

  if (loanId) {
    const { data: loanData } = await getEmployeeLoanById({
      supabase,
      id: loanId,
    });

    if (loanData) {
      amount = loanData.amount?.toString() ?? null;
      note = loanData.loan_name
        ? `Loan Reimbursement - ${loanData.loan_name}`
        : null;
    }
  } else if (advanceId) {
    const { data: advanceData } = await getEmployeeAdvanceById({
      supabase,
      id: advanceId,
    });

    if (advanceData) {
      amount = advanceData.amount?.toString() ?? null;
      note = advanceData.advance_name
        ? `Advance Reimbursement - ${advanceData.advance_name}`
        : null;
    }
  }

  return json({
    userOptions,
    employeeId,
    companyId,
    loanId,
    advanceId,
    amount,
    note,
  });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: ReimbursementSchema });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  const url = new URL(request.url);
  const loanId = url.searchParams.get("loanId");
  const advanceId = url.searchParams.get("advanceId");

  let status = 0;
  let error: any = null;

  if (loanId) {
    ({ status, error } = await createReimbursementFromLoan({
      supabase,
      data: submission.value as unknown as ReimbursementInsert,
      loanId,
    }));
  } else if (advanceId) {
    ({ status, error } = await createReimbursementFromAdvance({
      supabase,
      data: submission.value as unknown as ReimbursementInsert,
      advanceId,
    }));
  } else if (submission.value.type === "advances") {
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const { data: createdAdvance, error: advErr } = await supabase
      .from("employee_advance_details")
      .insert({
        company_id: companyId,
        employee_id: submission.value.employee_id,
        advance_name: submission.value.note || "Advance claim",
        advance_date:
          submission.value.submitted_date ||
          new Date().toISOString().split("T")[0],
        amount: submission.value.amount || 0,
        is_paid: false,
      })
      .select()
      .single();

    if (createdAdvance && createdAdvance.id) {
      ({ status, error } = await createReimbursementFromAdvance({
        supabase,
        data: submission.value as unknown as ReimbursementInsert,
        advanceId: createdAdvance.id,
      }));
    } else {
      status = 400;
      error = advErr || "Failed to create employee advance details";
    }
  } else {
    ({ status, error } = await createReimbursementsFromData({
      supabase,
      reimbursementsData: submission.value as unknown as ReimbursementInsert[],
    }));
  }

  if (isGoodStatus(status)) {
    return json({
      status: "success",
      message: "Employee reimbursement create successfully",
      error: null,
    });
  }
  return json({
    status: "error",
    message: "Employee reimbursement create failed",
    error,
  });
}

export default function AddReimbursements({
  updateValues,
  userOptionsFromUpdate,
  isLinkedToLoan,
}: {
  updateValues?: ReimbursementsUpdate | null;
  userOptionsFromUpdate?: any;
  reimbursementId?: string;
  isLinkedToLoan?: boolean;
}) {
  const {
    userOptions,
    employeeId,
    companyId,
    loanId,
    advanceId,
    amount,
    note,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(`${cacheKeyPrefix.employee_reimbursements}`);
        clearCacheEntry(cacheKeyPrefix.reimbursements);
        clearCacheEntry(cacheKeyPrefix.employee_loans);
        toast({
          title: "Success",
          description: actionData?.message || "Reimbursement created",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description:
            actionData?.error?.message ??
            actionData?.message ??
            "Reimbursement create failed",
          variant: "destructive",
        });
      }
      navigate(`/employees/${employeeId}/reimbursements`);
    }
  }, [actionData]);

  const REIMBURSEMENTS_TAG = updateValues
    ? UPDATE_REIMBURSEMENTS_TAG
    : ADD_REIMBURSEMENTS_TAG;

  const initialValues =
    updateValues ?? getInitialValueFromZod(ReimbursementSchema);

  const [form, fields] = useForm({
    id: REIMBURSEMENTS_TAG,
    constraint: getZodConstraint(ReimbursementSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: ReimbursementSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      employee_id: initialValues.employee_id ?? employeeId,
      company_id: initialValues.company_id ?? companyId,
      amount: initialValues.amount ?? (amount ? Number(amount) : undefined),
      note: initialValues.note ?? note ?? undefined,
      type: loanId ? "loan" : advanceId ? "advances" : initialValues.type,
    },
  });

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">
                {replaceUnderscore(REIMBURSEMENTS_TAG)}
              </CardTitle>
              <CardDescription className="lowercase">
                {`${replaceUnderscore(
                  REIMBURSEMENTS_TAG,
                )} by filling this form`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.employee_id, { type: "hidden" })}
              />
              <input
                {...getInputProps(fields.company_id, { type: "hidden" })}
              />
              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8 mt-10">
                <Field
                  inputProps={{
                    ...getInputProps(fields.submitted_date, {
                      type: "date",
                    }),

                    className: "",
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.submitted_date.name),
                  }}
                  errors={fields.submitted_date.errors}
                />
                <SearchableSelectField
                  key={resetKey}
                  className="w-full capitalize flex-1 "
                  options={transformStringArrayIntoOptions(
                    reimbursementStatusArray as unknown as string[],
                  )}
                  inputProps={{
                    ...getInputProps(fields.status, { type: "text" }),
                  }}
                  placeholder={`Select ${replaceUnderscore(
                    fields.status.name,
                  )}`}
                  labelProps={{
                    children: "Status",
                  }}
                  errors={fields.status.errors}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8 mt-10">
                <Field
                  inputProps={{
                    ...getInputProps(fields.amount, {
                      type: "number",
                    }),
                    placeholder: `Enter ${replaceUnderscore(
                      fields.amount.name,
                    )}`,
                    className: "",
                    readOnly:
                      isLinkedToLoan ||
                      !!loanId ||
                      !!advanceId ||
                      initialValues.type === "loan" ||
                      initialValues.type === "advances",
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.amount.name),
                  }}
                  errors={fields.amount.errors}
                />
                <SearchableSelectField
                  key={resetKey + 1}
                  inputProps={{
                    ...getInputProps(fields.user_id, {
                      type: "text",
                    }),
                    placeholder: "Select an authority that approved",
                  }}
                  className="lowercase"
                  options={(userOptions as any) ?? userOptionsFromUpdate}
                  labelProps={{
                    children: "Approved By",
                  }}
                  errors={fields.user_id.errors}
                />
              </div>

              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8 mt-10">
                <SearchableSelectField
                  key={resetKey + 2}
                  inputProps={{
                    ...getInputProps(fields.type, {
                      type: "text",
                    }),
                    placeholder: "Select Reimbursement Type",
                    readOnly:
                      isLinkedToLoan ||
                      !!loanId ||
                      !!advanceId ||
                      initialValues.type === "loan" ||
                      initialValues.type === "advances",
                  }}
                  options={transformStringArrayIntoOptions(
                    reimbursementTypeArray as unknown as string[],
                  )}
                  labelProps={{
                    children: "Type",
                  }}
                  errors={fields.type.errors}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.note, {
                      type: "text",
                    }),
                    placeholder: `Enter ${replaceUnderscore(fields.note.name)}`,
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.note.name),
                  }}
                  errors={fields.note.errors}
                />
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
