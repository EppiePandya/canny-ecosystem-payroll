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
import {
  bringDefaultLetterContent,
  capitalizeFirstLetter,
  createRole,
  letterTypesArray,
  getInitialValueFromZod,
  hasPermission,
  isGoodStatus,
  replaceDash,
  replaceUnderscore,
  LetterSchema,
  transformStringArrayIntoOptions,
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
import {
  CheckboxField,
  Field,
  MarkdownField,
  SearchableSelectField,
} from "@canny_ecosystem/ui/forms";
import { FormButtons } from "@/components/form/form-buttons";
import { createLetter } from "@canny_ecosystem/supabase/mutations";
import type { LetterDatabaseUpdate } from "@canny_ecosystem/supabase/types";
import { useEffect, useState } from "react";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { UPDATE_LETTER_TAG } from "../../modules_+/letters+/$letterId+/update-letter";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry } from "@/utils/cache";
import { attribute } from "@canny_ecosystem/utils/constant";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { useTheme } from "@/utils/theme";
import { useCompanyId } from "@/utils/company";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { FormulaDebuggerDialog } from "@/components/letter/formula-debugger-dialog";

export const CREATE_LETTER_TAG = "create-letter";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  try {
    const { user } = await getUserCookieOrFetchUser(request, supabase);
    if (
      !hasPermission(user?.role!, `${createRole}:${attribute.letters}`)
    ) {
      return safeRedirect(DEFAULT_ROUTE, { headers });
    }

    const employeeSalaryData = null;

    return json({ employeeSalaryData, error: null });
  } catch (error) {
    return json({
      error,
      employeeSalaryData: null,
    });
  }
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const submission = parseWithZod(formData, { schema: LetterSchema });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }
    const letterData = submission.value;
    const { status, error } = await createLetter({
      supabase,
      letterData: letterData,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Letter created",
        error: null,
      });

    return json(
      {
        status: "error",
        message: "Letter creation failed",
        error,
      },
      { status: 500 },
    );
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

export default function CreateLetter({
  updateValues,
}: {
  reimbursementId?: string;
  updateValues?: LetterDatabaseUpdate | null;
  userOptionsFromUpdate?: any;
}) {
  const [resetKey, setResetKey] = useState(Date.now());
  const [debuggerOpen, setDebuggerOpen] = useState(false);
  const { employeeSalaryData } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();

  const { toast } = useToast();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const { companyId } = useCompanyId();

  const LETTERS_TAG = updateValues ? UPDATE_LETTER_TAG : CREATE_LETTER_TAG;

  const initialValues = updateValues
    ? {
        ...updateValues,
        include_salary_structure:
          Boolean((updateValues as any).include_salary_structure) ||
          Boolean(updateValues.content?.includes("${salaryStructure}")),
      }
    : getInitialValueFromZod(LetterSchema);

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.status === "success") {
      clearCacheEntry(`${cacheKeyPrefix.letters}`);
      toast({
        title: "Success",
        description: actionData?.message ?? "Site letter created successfully",
        variant: "success",
      });
      navigate("/modules/letters");
    } else {
      toast({
        title: "Error",
        description:
          actionData?.error?.message ?? "Failed to create Site letter",
        variant: "destructive",
      });
    }
  }, [actionData]);

  const [form, fields] = useForm({
    id: LETTERS_TAG,
    constraint: getZodConstraint(LetterSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: LetterSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      company_id: initialValues?.company_id ?? companyId,
    },
  });

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center max-sm:flex-col max-sm:items-start gap-4">
              <div className="space-y-1.5">
                <CardTitle className="text-3xl capitalize">
                  {replaceDash(LETTERS_TAG)}
                </CardTitle>
                <CardDescription>
                  You can {LETTERS_TAG.split("-")[0]} letters by filling this
                  form
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-2 font-semibold text-xs py-1.5 px-3 border border-primary/20 hover:bg-primary/5 transition-all duration-300"
                onClick={() => setDebuggerOpen(true)}
              >
                <Icon
                  name="calendar"
                  className="h-4 w-4 text-primary animate-pulse"
                />
                Date Formula Debugger
              </Button>
            </CardHeader>
            <CardContent>
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.company_id, { type: "hidden" })}
              />

              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8 mt-5">
                <Field
                  key={
                    (typeof fields.letter_type.value === "string"
                      ? fields.letter_type.value
                      : fields.letter_type.initialValue) + fields.letter_name.id
                  }
                  inputProps={{
                    ...getInputProps(fields.letter_name, { type: "text" }),
                    placeholder: `Enter ${replaceUnderscore(fields.letter_name.name)}`,
                    defaultValue: !updateValues
                      ? capitalizeFirstLetter(
                          replaceUnderscore(
                            typeof fields.letter_type.value === "string"
                              ? fields.letter_type.value
                              : "",
                          ),
                        )
                      : typeof fields.letter_name.value === "string"
                        ? fields.letter_name.value
                        : "",
                  }}
                  labelProps={{
                    children: "Letter Name",
                  }}
                  errors={fields.letter_name.errors}
                />

                <SearchableSelectField
                  key={resetKey}
                  className="w-full capitalize flex-1"
                  options={transformStringArrayIntoOptions(
                    letterTypesArray as unknown as string[],
                  )}
                  inputProps={getInputProps(fields.letter_type, {
                    type: "text",
                  })}
                  onChange={(value) => {
                    if (!value) return;

                    const formatted = capitalizeFirstLetter(
                      replaceUnderscore(value),
                    );

                    form.update({
                      name: fields.subject.name,
                      value: capitalizeFirstLetter(replaceUnderscore(value)),
                    });

                    form.update({
                      name: fields.letter_name.name,
                      value: formatted,
                    });

                    form.validate();
                  }}
                  placeholder={`Select ${replaceUnderscore(
                    fields.letter_type.name,
                  )}`}
                  labelProps={{
                    children: "Letter Type",
                  }}
                  errors={fields.letter_type.errors}
                />
              </div>
              <div className="grid grid-cols-1 place-content-center justify-between gap-x-8 mt-4">
                <Field
                  key={
                    (typeof fields.letter_type.value === "string"
                      ? fields.letter_type.value
                      : fields.letter_type.initialValue) + fields.subject.id
                  }
                  inputProps={{
                    ...getInputProps(fields.subject, { type: "text" }),
                    placeholder: `Enter ${replaceUnderscore(fields.subject.name)}`,
                    defaultValue: !updateValues
                      ? capitalizeFirstLetter(
                          replaceUnderscore(
                            typeof fields.letter_type.value === "string"
                              ? fields.letter_type.value
                              : "",
                          ),
                        )
                      : typeof fields.subject.value === "string"
                        ? fields.subject.value
                        : "",
                  }}
                  labelProps={{
                    children: replaceUnderscore(fields.subject.name),
                  }}
                  errors={fields.subject.errors}
                />
                <MarkdownField
                  key={
                    (typeof fields.letter_type.value === "string"
                      ? fields.letter_type.value
                      : fields.letter_type.initialValue) + fields.content.id
                  }
                  theme={theme}
                  inputProps={{
                    ...getInputProps(fields.content, { type: "hidden" }),
                    placeholder: "Write your letter content here...",
                    defaultValue: !updateValues
                      ? bringDefaultLetterContent(
                          typeof fields.letter_type.value === "string"
                            ? fields.letter_type.value
                            : undefined,
                          employeeSalaryData,
                        ) ??
                        (typeof fields.content.value === "string"
                          ? fields.content.value
                          : "")
                      : typeof fields.content.value === "string"
                        ? fields.content.value
                        : bringDefaultLetterContent(
                            typeof fields.letter_type.value === "string"
                              ? fields.letter_type.value
                              : undefined,
                            employeeSalaryData,
                          ) ?? "",
                  }}
                  labelProps={{
                    children: "Content",
                  }}
                  errorClassName={"min-h-min pt-0 pb-0"}
                  errors={fields.content.errors}
                />
              </div>

              <div className="grid grid-cols-5 max-xl:grid-cols-3 max-sm:grid-cols-2 place-content-center justify-between gap-x-8 px-2">
                <CheckboxField
                  className="mt-8"
                  buttonProps={getInputProps(fields.include_signatuory, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Include Signatuory",
                  }}
                />
                <CheckboxField
                  className="mt-8"
                  buttonProps={getInputProps(
                    fields.include_employee_signature,
                    {
                      type: "checkbox",
                    },
                  )}
                  labelProps={{
                    children: "Include Employee Signature",
                  }}
                />
                <CheckboxField
                  className="mt-8"
                  buttonProps={getInputProps(fields.include_letter_header, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Include Letter Header",
                  }}
                />
                <CheckboxField
                  className="mt-8"
                  buttonProps={getInputProps(fields.include_letter_footer, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Include Letter Footer",
                  }}
                />
                <CheckboxField
                  className="mt-8"
                  buttonProps={getInputProps(fields.include_salary_structure, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Include Salary Structure",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-x-8 px-2">
                <CheckboxField
                  className="mt-8"
                  buttonProps={getInputProps(fields.isPdf, {
                    type: "checkbox",
                  })}
                  labelProps={{
                    children: "Default to PDF (uncheck for Word)",
                  }}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.font_size, { type: "number" }),
                    placeholder: "Enter Font Size",
                  }}
                  labelProps={{
                    children: "Font Size",
                  }}
                  errors={fields.font_size.errors}
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
      <FormulaDebuggerDialog
        open={debuggerOpen}
        onOpenChange={setDebuggerOpen}
      />
    </section>
  );
}
