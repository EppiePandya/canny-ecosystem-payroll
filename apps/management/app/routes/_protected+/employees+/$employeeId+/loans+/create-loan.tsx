import {
  hasPermission,
  isGoodStatus,
  createRole,
  EmployeeLoanSchema,
} from "@canny_ecosystem/utils";
import { Field, CheckboxField } from "@canny_ecosystem/ui/forms";
import { getInitialValueFromZod, replaceDash } from "@canny_ecosystem/utils";
import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import {
  Form,
  json,
  useActionData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";

import { FormButtons } from "@/components/form/form-buttons";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearCacheEntry } from "@/utils/cache";
import type { EmployeeLoanDetailsDatabaseUpdate } from "@canny_ecosystem/supabase/types";
import { createEmployeeLoan } from "@canny_ecosystem/supabase/mutations";

export const CREATE_LOAN_TAG = "create-loan";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${createRole}:${attribute.employees}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  return json({});
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const employeeId = params.employeeId;

    if (!employeeId) {
      return json(
        { status: "error", message: "Employee ID is missing" },
        { status: 400 },
      );
    }

    const submission = parseWithZod(formData, {
      schema: EmployeeLoanSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const { status, error } = await createEmployeeLoan({
      supabase,
      data: {
        ...submission.value,
        employee_id: employeeId,
        company_id: companyId,
      } as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Loan created successfully",
        error: null,
      });

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return json(
        {
          result: submission.reply({
            fieldErrors: {
              loan_name: [
                "A loan with this name already exists for this employee.",
              ],
            },
          }),
        },
        { status: 400 },
      );
    }

    return json({
      status: "error",
      message: "Failed to create loan",
      error,
    });
  } catch (error) {
    return json({
      status: "error",
      message: "An unexpected error occurred",
      error,
    });
  }
}

export default function CreateLoan({
  updateValues,
}: {
  updateValues?: EmployeeLoanDetailsDatabaseUpdate | null;
}) {
  const { employeeId } = useParams();
  const actionData = useActionData<typeof action>();
  const isUpdate = !!updateValues;
  const LOAN_TAG = isUpdate ? "update-loan" : CREATE_LOAN_TAG;

  const initialValues =
    updateValues ?? getInitialValueFromZod(EmployeeLoanSchema);

  const [form, fields] = useForm({
    id: LOAN_TAG,
    constraint: getZodConstraint(EmployeeLoanSchema),
    lastResult: actionData?.result as any,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: EmployeeLoanSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      employee_id: employeeId,
    } as any,
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.status === "success") {
      clearCacheEntry(cacheKeyPrefix.employee_loans);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate(`/employees/${employeeId}/loans`, { replace: true });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description:
          actionData.message ??
          `Loan ${isUpdate ? "Update" : "Creation"} failed`,
        variant: "destructive",
      });
    }
  }, [actionData, employeeId, navigate, toast]);

  const hasReimbursement = !!fields.reimbursement_id.value;

  return (
    <section className="px-4 lg:px-10 xl:px-14 max-sm:px-0 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card className="max-sm:px-0">
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {replaceDash(LOAN_TAG)}
              </CardTitle>
              <CardDescription>
                {isUpdate
                  ? "Update the existing loan details"
                  : "Add a new loan for the employee"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.employee_id, { type: "hidden" })}
              />
              <input
                {...getInputProps(fields.reimbursement_id, { type: "hidden" })}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.loan_name, { type: "text" }),
                    autoFocus: true,
                    placeholder: "Enter loan name",
                  }}
                  labelProps={{
                    children: "Loan Name",
                  }}
                  errors={fields.loan_name.errors}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.loan_date, { type: "date" }),
                  }}
                  labelProps={{
                    children: "Loan Date",
                  }}
                  errors={fields.loan_date.errors}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.amount, { type: "number" }),
                    placeholder: "Enter amount",
                    readOnly: hasReimbursement,
                  }}
                  labelProps={{
                    children: "Amount",
                  }}
                  errors={fields.amount.errors}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.monthly_installment, {
                      type: "number",
                    }),
                    placeholder: "Enter monthly installment",
                  }}
                  labelProps={{
                    children: "Monthly Installment",
                  }}
                  errors={fields.monthly_installment.errors}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.number_of_months, {
                      type: "number",
                    }),
                    placeholder: "Enter number of months",
                    step: "1",
                  }}
                  labelProps={{
                    children: "Number of Months",
                  }}
                  errors={fields.number_of_months.errors}
                />
              </div>
              {isUpdate && (
                <div className="flex items-center gap-2 mt-2">
                  <CheckboxField
                    buttonProps={{
                      ...getInputProps(fields.is_paid, { type: "checkbox" }),
                    }}
                    labelProps={{
                      children: "Is Loan Paid Fully?",
                    }}
                    errors={fields.is_paid.errors}
                  />
                </div>
              )}
            </CardContent>
            <FormButtons form={form} isSingle={true} />
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
