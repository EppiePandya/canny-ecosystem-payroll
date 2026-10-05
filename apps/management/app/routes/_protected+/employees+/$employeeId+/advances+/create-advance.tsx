import {
  hasPermission,
  isGoodStatus,
  createRole,
  EmployeeAdvanceSchema,
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
import type { EmployeeAdvanceDetailsDatabaseUpdate } from "@canny_ecosystem/supabase/types";
import { createEmployeeAdvance } from "@canny_ecosystem/supabase/mutations";

export const CREATE_ADVANCE_TAG = "create-advance";

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
      schema: EmployeeAdvanceSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const { status, error } = await createEmployeeAdvance({
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
        message: "Advance created successfully",
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
              advance_name: [
                "A advance with this name already exists for this employee.",
              ],
            },
          }),
        },
        { status: 400 },
      );
    }

    return json({
      status: "error",
      message: "Failed to create advance",
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

export default function CreateAdvance({
  updateValues,
}: {
  updateValues?: EmployeeAdvanceDetailsDatabaseUpdate | null;
}) {
  const { employeeId } = useParams();
  const actionData = useActionData<typeof action>();
  const isUpdate = !!updateValues;
  const ADVANCE_TAG = isUpdate ? "update-advance" : CREATE_ADVANCE_TAG;

  const initialValues =
    updateValues ?? getInitialValueFromZod(EmployeeAdvanceSchema);

  const [form, fields] = useForm({
    id: ADVANCE_TAG,
    constraint: getZodConstraint(EmployeeAdvanceSchema),
    lastResult: actionData?.result as any,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: EmployeeAdvanceSchema });
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
      clearCacheEntry(cacheKeyPrefix.employee_advances);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate(`/employees/${employeeId}/advances`, { replace: true });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description:
          actionData.message ??
          `Advance ${isUpdate ? "Update" : "Creation"} failed`,
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
                {replaceDash(ADVANCE_TAG)}
              </CardTitle>
              <CardDescription>
                {isUpdate
                  ? "Update the existing advance details"
                  : "Add a new advance for the employee"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {isUpdate && (
                <input {...getInputProps(fields.id, { type: "hidden" })} />
              )}
              <input
                {...getInputProps(fields.employee_id, { type: "hidden" })}
              />
              <input
                {...getInputProps(fields.reimbursement_id, { type: "hidden" })}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.advance_name, { type: "text" }),
                    autoFocus: true,
                    placeholder: "Enter advance name",
                  }}
                  labelProps={{
                    children: "Advance Name",
                  }}
                  errors={fields.advance_name.errors}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.advance_date, { type: "date" }),
                  }}
                  labelProps={{
                    children: "Advance Date",
                  }}
                  errors={fields.advance_date.errors}
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
              </div>
              {isUpdate && (
                <div className="flex items-center gap-2 mt-2">
                  <CheckboxField
                    buttonProps={{
                      ...getInputProps(fields.is_paid, { type: "checkbox" }),
                    }}
                    labelProps={{
                      children: "Is Advance Paid Fully?",
                    }}
                    errors={fields.is_paid.errors}
                  />
                </div>
              )}
            </CardContent>
            <div className="px-6 text-red-500 font-semibold space-y-1 text-sm">
              {form.errors && form.errors.length > 0 && (
                <p>Form Errors: {JSON.stringify(form.errors)}</p>
              )}
              {fields.id.errors && <p>id: {fields.id.errors.join(", ")}</p>}
              {fields.employee_id.errors && (
                <p>employee_id: {fields.employee_id.errors.join(", ")}</p>
              )}
              {fields.reimbursement_id.errors && (
                <p>
                  reimbursement_id: {fields.reimbursement_id.errors.join(", ")}
                </p>
              )}
              {fields.advance_name.errors && (
                <p>advance_name: {fields.advance_name.errors.join(", ")}</p>
              )}
              {fields.advance_date.errors && (
                <p>advance_date: {fields.advance_date.errors.join(", ")}</p>
              )}
              {fields.amount.errors && (
                <p>amount: {fields.amount.errors.join(", ")}</p>
              )}
              {fields.is_paid.errors && (
                <p>is_paid: {fields.is_paid.errors.join(", ")}</p>
              )}
            </div>
            <FormButtons form={form} isSingle={true} />
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
