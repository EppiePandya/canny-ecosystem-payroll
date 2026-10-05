import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  hasPermission,
  isGoodStatus,
  RelationshipManpowerVersionSchema,
  createRole,
  getValidDateForInput,
} from "@canny_ecosystem/utils";
import { Field, SearchableSelectField } from "@canny_ecosystem/ui/forms";
import { Input } from "@canny_ecosystem/ui/input";
import { Label } from "@canny_ecosystem/ui/label";
import { getInitialValueFromZod } from "@canny_ecosystem/utils";
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

import { addRelationshipManpowerVersion } from "@canny_ecosystem/supabase/mutations";
import { FormButtons } from "@/components/form/form-buttons";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import {
  SUPABASE_BUCKET,
  SUPABASE_MEDIA_URL_PREFIX,
} from "@canny_ecosystem/utils/constant";

export const CREATE_MANPOWER_VERSION = "create-manpower-version";

const SERVICE_CHARGES_ON_OPTIONS = [
  { label: "Basic", value: "basic" },
  { label: "Gross", value: "gross" },
  { label: "CTC", value: "ctc" },
];

export async function loader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(
      user?.role!,
      `${createRole}:${attribute.settingRelationships}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const relationshipId = params.relationshipId;
  if (!relationshipId) {
    return safeRedirect("/settings/relationships", { headers });
  }

  return json({
    status: "success",
    relationshipId,
  });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: RelationshipManpowerVersionSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    let filePathUrl: string | null = null;

    if (
      submission.value.agreement_upload &&
      typeof submission.value.agreement_upload === "object" &&
      "arrayBuffer" in submission.value.agreement_upload
    ) {
      const file = submission.value.agreement_upload as File;
      const buffer = await file.arrayBuffer();
      const fileData = new Uint8Array(buffer);
      const filePath = `relationships/${submission.value.relationship_id}/${file.name}`;

      const { data: fileRes, error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET.CANNY_ECOSYSTEM)
        .upload(filePath, fileData, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        return json({
          status: "error",
          message: "Failed to upload document",
          error: uploadError.message,
        });
      }

      filePathUrl = `${SUPABASE_MEDIA_URL_PREFIX}${fileRes.fullPath}`;
    }

    const { status, error } = await addRelationshipManpowerVersion({
      supabase: supabase as any,
      data: {
        ...submission.value,
        agreement_upload: filePathUrl ?? null,
      } as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Manpower version added",
        error: null,
      });

    return json({
      status: "error",
      message: "Failed to add manpower version",
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

export default function CreateManpowerVersion({
  updateValues,
}: {
  updateValues?: any;
}) {
  const { relationshipId } = useParams();
  const actionData = useActionData<typeof action>();

  const isUpdate = !!updateValues;

  const initialValues =
    updateValues ?? getInitialValueFromZod(RelationshipManpowerVersionSchema);
  const [resetKey, setResetKey] = useState(Date.now());

  const [form, fields] = useForm({
    id: isUpdate ? "update-manpower-version" : CREATE_MANPOWER_VERSION,
    constraint: getZodConstraint(RelationshipManpowerVersionSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: RelationshipManpowerVersionSchema,
      });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      agreement_upload:
        typeof initialValues?.agreement_upload === "string"
          ? undefined
          : initialValues?.agreement_upload,
      relationship_id: relationshipId,
    },
  });
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.relationships);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate(`/settings/relationships?expanded=${relationshipId}`, {
        replace: true,
      });
    } else {
      toast({
        title: "Error",
        description:
          actionData?.error?.message ??
          actionData?.message ??
          "Manpower version creation failed",
        variant: "destructive",
      });
    }
  }, [actionData]);

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form
          method="POST"
          encType="multipart/form-data"
          {...getFormProps(form)}
          className="flex flex-col"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {isUpdate ? "Update" : "Add"} Manpower Version
              </CardTitle>
              <CardDescription>
                {isUpdate ? "Modify existing" : "Add a new"} terms version for
                this relationship.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.relationship_id, { type: "hidden" })}
              />

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-1 place-content-center justify-between gap-6">
                <Field
                  inputProps={{
                    ...getInputProps(fields.service_charge, { type: "number" }),
                    placeholder: "e.g. 5.5",
                    step: "0.01",
                  }}
                  labelProps={{ children: "Service Charge (%)" }}
                  errors={fields.service_charge.errors}
                />

                <Field
                  inputProps={{
                    ...getInputProps(fields.reimbursement_charge, {
                      type: "number",
                    }),
                    placeholder: "e.g. 2.0",
                    step: "0.01",
                  }}
                  labelProps={{ children: "Reimbursement Charge (%)" }}
                  errors={fields.reimbursement_charge.errors}
                />

                <Field
                  inputProps={{
                    ...getInputProps(fields.exit_charge, { type: "number" }),
                    placeholder: "e.g. 1.5",
                    step: "0.01",
                  }}
                  labelProps={{ children: "Exit Charge (%)" }}
                  errors={fields.exit_charge.errors}
                />

                <Field
                  inputProps={{
                    ...getInputProps(fields.statutory_charge, {
                      type: "number",
                    }),
                    placeholder: "e.g. 0.5",
                    step: "0.01",
                  }}
                  labelProps={{ children: "Statutory Charge (%)" }}
                  errors={fields.statutory_charge.errors}
                />
              </div>

              <div className="mt-4">
                <SearchableSelectField
                  key={resetKey + 2}
                  inputProps={{
                    ...getInputProps(fields.service_charges_on, {
                      type: "text",
                    }),
                    placeholder: "Select Type",
                  }}
                  options={SERVICE_CHARGES_ON_OPTIONS}
                  labelProps={{ children: "Service Charges On" }}
                  errors={fields.service_charges_on.errors}
                />
              </div>

              <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-1 place-content-center justify-between gap-6 mt-4">
                <Field
                  inputProps={{
                    ...getInputProps(fields.start_date, { type: "date" }),
                    defaultValue: getValidDateForInput(
                      fields.start_date.initialValue as string,
                    ),
                  }}
                  labelProps={{ children: "Start Date" }}
                  errors={fields.start_date.errors}
                />
                <Field
                  inputProps={{
                    ...getInputProps(fields.end_date, { type: "date" }),
                    defaultValue: getValidDateForInput(
                      fields.end_date.initialValue as string,
                    ),
                  }}
                  labelProps={{ children: "End Date" }}
                  errors={fields.end_date.errors}
                />
              </div>

              <div className="mt-4 flex w-full flex-col gap-1.5">
                <Label htmlFor={fields.agreement_upload.id}>
                  Agreement Document
                </Label>
                <div className="flex flex-col gap-2">
                  <div
                    className={cn(
                      "text-sm text-muted-foreground flex items-center gap-2",
                      !(
                        typeof initialValues?.agreement_upload === "string" &&
                        initialValues.agreement_upload
                      ) && "hidden",
                    )}
                  >
                    <span>Current File:</span>
                    <a
                      href={initialValues.agreement_upload}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline truncate max-w-[300px]"
                    >
                      {initialValues.agreement_upload?.split("/").pop()}
                    </a>
                  </div>
                  <Input
                    {...getInputProps(fields.agreement_upload, {
                      type: "file",
                    })}
                    accept=".pdf,.doc,.docx"
                  />
                </div>
                <div
                  id={fields.agreement_upload.errorId}
                  className="text-[0.8rem] font-medium text-destructive"
                >
                  {fields.agreement_upload.errors}
                </div>
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
