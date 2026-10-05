import {
  replaceUnderscore,
  getInitialValueFromZod,
  replaceDash,
  hasPermission,
  updateRole,
  EmployeeDeathExitFormSchema,
  deathReasonArray,
  transformStringArrayIntoOptions,
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
  useLocation,
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

import type { EmployeeDeathExitUpdate } from "@canny_ecosystem/supabase/types";

import { FormButtons } from "@/components/form/form-buttons";
import { useToast } from "@canny_ecosystem/ui/use-toast";

import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";

import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";

import { clearCacheEntry } from "@/utils/cache";
import { createEmployeeDeathExit } from "@canny_ecosystem/supabase/mutations";

export const CREATE_EMPLOYEE_DEATH_EXIT = "create-employee-death-exit";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const employeeId = params.employeeId;
  const exitId = params.exitId;

  if (!employeeId)
    throw new Response("Employee ID is required", { status: 400 });
  if (!exitId) throw new Response("Exit ID is required", { status: 400 });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.exits}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  return { employeeId, exitId };
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: EmployeeDeathExitFormSchema,
  });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  const { status, error } = await createEmployeeDeathExit({
    supabase,
    data: submission.value,
  });

  if (error) {
    return json(
      {
        status: "error",
        message: error.message ?? "Failed to create death exit",
      },
      { status: 500 },
    );
  }

  return json({
    status: "success",
    message: "Employee death exit created successfully",
  });
}

export default function CreateEmployeeDeathExit({
  updateValues,
}: {
  updateValues?: EmployeeDeathExitUpdate | null;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [resetKey, setResetKey] = useState(Date.now());

  const { employeeId, exitId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isUpdate = !!updateValues;

  const initialValues =
    updateValues ?? getInitialValueFromZod(EmployeeDeathExitFormSchema);

  const [form, fields] = useForm({
    id: isUpdate ? "update-death-exit" : CREATE_EMPLOYEE_DEATH_EXIT,
    lastResult: actionData?.result as any,
    constraint: getZodConstraint(EmployeeDeathExitFormSchema),

    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: EmployeeDeathExitFormSchema,
      });
    },

    shouldValidate: "onInput",
    shouldRevalidate: "onInput",

    defaultValue: {
      ...initialValues,
      exit_id: updateValues?.exit_id ?? exitId,
    },
  });

  useEffect(() => {
    if (!actionData) return;

    if ((actionData as any)?.status === "success") {
      clearCacheEntry(cacheKeyPrefix.employee_payments);
      clearCacheEntry(cacheKeyPrefix.exits);

      toast({
        title: "Success",
        description: (actionData as any).message,
        variant: "success",
      });

      navigate(`/employees/${employeeId}/payments`, { replace: true });
    }
  }, [actionData]);

  return (
    <section className="px-4 py-4">
      <FormProvider context={form.context}>
        <Form
          method="POST"
          action={isUpdate ? location.pathname : undefined}
          {...getFormProps(form)}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {isUpdate ? "Update Death Exit" : "Create Death Exit"}
              </CardTitle>
              <CardDescription>Employee death exit form</CardDescription>
            </CardHeader>

            <CardContent>
              <input
                {...getInputProps(fields.exit_id, { type: "hidden" })}
                value={exitId}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  inputProps={getInputProps(fields.date_of_death, {
                    type: "date",
                  })}
                  labelProps={{
                    children: replaceUnderscore(fields.date_of_death.name),
                  }}
                  errors={fields.date_of_death.errors}
                />

                <SearchableSelectField
                  className="w-full capitalize flex-1"
                  key={resetKey}
                  options={transformStringArrayIntoOptions(
                    deathReasonArray as unknown as string[],
                  )}
                  inputProps={{
                    ...getInputProps(fields.death_reason, { type: "text" }),
                  }}
                  placeholder={`Select ${replaceUnderscore(fields.death_reason.name)}`}
                  labelProps={{
                    children: replaceUnderscore(fields.death_reason.name),
                  }}
                  errors={fields.death_reason.errors}
                />

                <CheckboxField
                  labelProps={{
                    children: replaceUnderscore(fields.on_duty_esic.name),
                  }}
                  buttonProps={getInputProps(fields.on_duty_esic, {
                    type: "checkbox",
                  })}
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
