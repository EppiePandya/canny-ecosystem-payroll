import {
  hasPermission,
  isGoodStatus,
  RelationshipManpowerVersionSchema,
  updateRole,
} from "@canny_ecosystem/utils";
import { Field, SearchableSelectField } from "@canny_ecosystem/ui/forms";
import { Input } from "@canny_ecosystem/ui/input";
import { Label } from "@canny_ecosystem/ui/label";
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

import { updateRelationshipManpowerVersion } from "@canny_ecosystem/supabase/mutations";
import { getRelationshipManpowerVersionById } from "@canny_ecosystem/supabase/queries";
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

export const UPDATE_MANPOWER_VERSION = "update-manpower-version";

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
      `${updateRole}:${attribute.settingRelationships}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const relationshipId = params.relationshipId;
  const versionId = params.versionId;
  if (!relationshipId || !versionId) {
    return safeRedirect("/settings/relationships", { headers });
  }

  const { data: version, error } = await getRelationshipManpowerVersionById({
    supabase: supabase as any,
    id: versionId,
  });

  if (error || !version) {
    return safeRedirect(`/settings/relationships/${relationshipId}`, {
      headers,
    });
  }

  return json({
    status: "success",
    relationshipId,
    version,
  });
}

export async function action({
  request,
  params,
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

    let filePathUrl = submission.value.agreement_upload as string | null;

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

    const { status, error } = await updateRelationshipManpowerVersion({
      supabase: supabase as any,
      data: {
        ...submission.value,
        id: params.versionId,
        agreement_upload: filePathUrl,
      } as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Manpower version updated",
        error: null,
      });

    return json({
      status: "error",
      message: "Failed to update manpower version",
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

export default function UpdateManpowerVersion() {
  const { version, relationshipId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const [resetKey, setResetKey] = useState(Date.now());

  const [form, fields] = useForm({
    id: UPDATE_MANPOWER_VERSION,
    constraint: getZodConstraint(RelationshipManpowerVersionSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: RelationshipManpowerVersionSchema,
      });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...version,
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
      navigate(`/settings/relationships/${relationshipId}`, { replace: true });
    } else {
      toast({
        title: "Error",
        description:
          actionData?.error?.message ??
          actionData?.message ??
          "Manpower version update failed",
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
                Update Manpower Version
              </CardTitle>
              <CardDescription>
                Modify existing terms version for this relationship.
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
                    defaultValue: fields.reimbursement_charge
                      .initialValue as number,
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

              <div className="mt-4 flex w-full flex-col gap-1.5">
                <Label htmlFor={fields.agreement_upload.id}>
                  Agreement Document
                </Label>
                <div className="flex flex-col gap-2">
                  <div
                    className={cn(
                      "text-sm text-muted-foreground flex items-center gap-2",
                      !(
                        typeof version.agreement_upload === "string" &&
                        version.agreement_upload
                      ) && "hidden",
                    )}
                  >
                    <span>Current File:</span>
                    <a
                      href={version.agreement_upload}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline truncate max-w-[300px]"
                    >
                      {version.agreement_upload?.split("/").pop()}
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
