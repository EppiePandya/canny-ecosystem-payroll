import {
  getInitialValueFromZod,
  replaceDash,
  transformStringArrayIntoOptions,
  hasPermission,
  updateRole,
  reasonForExitArray,
  EmployeeExitFormSchema,
} from "@canny_ecosystem/utils";
import {
  CheckboxField,
  Field,
  SearchableSelectField,
} from "@canny_ecosystem/ui/forms";
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
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import type { EmployeeExitUpdate } from "@canny_ecosystem/supabase/types";
import { FormButtons } from "@/components/form/form-buttons";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { getEmployeeWorkDetailsByEmployeeIdForOthersforexit } from "@canny_ecosystem/supabase/queries";
import { createEmployeeExit } from "@canny_ecosystem/supabase/mutations";
import { Combobox } from "@canny_ecosystem/ui/combobox";

export const CREATE_Employee_EXIT = "create-employee-exit";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const employeeId = params.employeeId;

  if (!employeeId) {
    return json({ error: "Employee ID is required" }, { status: 400 });
  }

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.employeeExit}`))
    return safeRedirect(DEFAULT_ROUTE, { headers });

  const { data, error } =
    await getEmployeeWorkDetailsByEmployeeIdForOthersforexit({
      supabase,
      employeeId,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    });

  return json({
    employeeId,
    workDetails: data || [],
    approvedBy: user ? { id: user.id, email: user.email } : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: EmployeeExitFormSchema,
  });

  if (submission.status !== "success") {
    return json({ result: submission.reply() }, { status: 400 });
  }

  const { error, status } = await createEmployeeExit({
    supabase,
    data: submission.value,
  });

  if (error) {
    return json(
      {
        status: "error",
        message: error.message ?? "Failed to create employee exit",
      },
      { status: status || 500 },
    );
  }

  return json({
    status: "success",
    message: "Employee exit created successfully",
  });
}

export default function CreateEmployeeExit({
  updateValues,
}: {
  updateValues?: EmployeeExitUpdate | null;
}) {
  const loaderData = useLoaderData<typeof loader>();

  const employeeId =
    loaderData && "employeeId" in loaderData ? loaderData.employeeId : "";
  const approvedBy =
    loaderData && "approvedBy" in loaderData ? loaderData.approvedBy : null;

  const { toast } = useToast();
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());

  const approvedByOptions = approvedBy
    ? [{ label: approvedBy.email, value: approvedBy.id }]
    : [];

  const initialValues =
    updateValues ?? getInitialValueFromZod(EmployeeExitFormSchema);

  const [form, fields] = useForm({
    id: CREATE_Employee_EXIT,
    constraint: getZodConstraint(EmployeeExitFormSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: EmployeeExitFormSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      employee_id: updateValues?.employee_id ?? employeeId,
    },
  });

  useEffect(() => {
    if (!actionData) return;

    if (
      actionData &&
      "status" in actionData &&
      actionData.status === "success"
    ) {
      clearCacheEntry(cacheKeyPrefix.exits);
      clearCacheEntry(cacheKeyPrefix.employees);
      clearExactCacheEntry(`${cacheKeyPrefix.employee_payments}${employeeId}`);
      clearExactCacheEntry(`${cacheKeyPrefix.employee_overview}${employeeId}`);
      toast({
        title: "Success",
        description:
          actionData && "message" in actionData
            ? actionData.message
            : "Success",
        variant: "success",
      });
    }

    navigate(`/employees/${employeeId}/payments`, { replace: true });
  }, [actionData]);

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {replaceDash(CREATE_Employee_EXIT)}
              </CardTitle>
              <CardDescription>Employee Exit Form</CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.employee_id, { type: "hidden" })}
              />

              <Field
                inputProps={getInputProps(fields.last_working_day, {
                  type: "date",
                })}
                labelProps={{ children: "Last Working Day" }}
                errors={fields.last_working_day.errors}
              />

              <Field
                inputProps={getInputProps(fields.esic_exit_date, {
                  type: "date",
                })}
                labelProps={{ children: "ESIC Exit Date" }}
                errors={fields.esic_exit_date.errors}
              />

              <SearchableSelectField
                options={approvedByOptions}
                inputProps={getInputProps(fields.user_id, { type: "text" })}
                labelProps={{ children: "Approved By" }}
                errors={fields.user_id.errors}
              />

              <SearchableSelectField
                options={transformStringArrayIntoOptions(
                  reasonForExitArray as unknown as string[],
                )}
                inputProps={getInputProps(fields.exit_reason, {
                  type: "text",
                })}
                labelProps={{ children: "Reason" }}
                errors={fields.exit_reason.errors}
              />

              <div className="md:col-span-2">
                <Field
                  inputProps={getInputProps(fields.note, { type: "text" })}
                  labelProps={{ children: "Note" }}
                  errors={fields.note.errors}
                />
              </div>
            </CardContent>

            <FormButtons form={form} setResetKey={setResetKey} isSingle />
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
