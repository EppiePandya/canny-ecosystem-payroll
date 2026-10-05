import {
  getValidDateForInput,
  hasPermission,
  isGoodStatus,
  RelationshipSchema,
  replaceUnderscore,
  createRole,
  relationshipTypeArray,
  transformStringArrayIntoOptions,
} from "@canny_ecosystem/utils";
import {
  CheckboxField,
  Field,
  JSONBField,
  SearchableSelectField,
} from "@canny_ecosystem/ui/forms";
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
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

import { UPDATE_RELATIONSHIP } from "./$relationshipId.update-relationship";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";

import { createRelationship } from "@canny_ecosystem/supabase/mutations";
import type { RelationshipDatabaseUpdate } from "@canny_ecosystem/supabase/types";
import { getCompanies } from "@canny_ecosystem/supabase/queries";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { FormButtons } from "@/components/form/form-buttons";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearExactCacheEntry } from "@/utils/cache";

export const CREATE_RELATIONSHIP = "create-relationship";

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<Response> {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(
      user?.role!,
      `${createRole}:${attribute.settingRelationships}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }
  try {
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const { data: companies, error } = await getCompanies({ supabase });

    if (error) {
      return json(
        {
          status: "error",
          message: error.message,
          error,
          data: null,
        },
        {
          status: 500,
        },
      );
    }

    if (!companies) {
      return json(
        {
          status: "error",
          message: "Company ID is missing or invalid",
          data: null,
          error: "No companies found",
        },
        { status: 400 },
      );
    }

    const companyOptions = companies.map((company) => ({
      label: company.name,
      value: company.id,
    }));

    return json({
      status: "success",
      message: "Relationship created",
      companyId,
      companyOptions,
      error: null,
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

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: RelationshipSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { status, error } = await createRelationship({
      supabase,
      data: submission.value,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Relationship created",
        error: null,
      });

    if (
      String(error?.code) === "23505" ||
      error?.message?.includes("unique constraint")
    ) {
      return json({
        status: "error",
        message:
          "This relationship type already exists for the selected company.",
        error: null,
      });
    }

    return json({
      status: "error",
      message: "Failed to create relationship",
      error,
    });
  } catch (error: any) {
    if (
      String(error?.code) === "23505" ||
      error?.message?.includes("unique constraint")
    ) {
      return json({
        status: "error",
        message:
          "This relationship type already exists for the selected company.",
        error: null,
      });
    }
    return json(
      {
        status: "error",
        message: "Failed to create relationship",
        error,
      },
      { status: 500 },
    );
  }
}

export default function CreateRelationship({
  updateValues,
  companyOptionsFromUpdate,
}: {
  updateValues?: RelationshipDatabaseUpdate | null;
  companyOptionsFromUpdate?: ComboboxSelectOption[];
}) {
  const { companyId, companyOptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const RELATIONSHIP_TAG = updateValues
    ? UPDATE_RELATIONSHIP
    : CREATE_RELATIONSHIP;

  const initialValues =
    updateValues ?? getInitialValueFromZod(RelationshipSchema);
  const [resetKey, setResetKey] = useState(Date.now());

  const [form, fields] = useForm({
    id: RELATIONSHIP_TAG,
    constraint: getZodConstraint(RelationshipSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: RelationshipSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      company_id: initialValues.company_id ?? companyId,
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
    } else {
      toast({
        title: "Error",
        description:
          actionData?.message ||
          actionData?.error?.message ||
          "Relationship creation failed",
        variant: "destructive",
      });
    }
    navigate("/settings/relationships", { replace: true });
  }, [actionData]);

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {replaceDash(RELATIONSHIP_TAG)}
              </CardTitle>
              <CardDescription>
                {RELATIONSHIP_TAG.split("-")[0]} relationship of a company that
                will be central in all of canny apps
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <SearchableSelectField
                key={resetKey}
                inputProps={{
                  ...getInputProps(fields.company_id, {
                    type: "text",
                  }),
                  placeholder: "Select Company",
                }}
                options={companyOptionsFromUpdate ?? companyOptions}
                labelProps={{
                  children: "Company",
                }}
                errors={fields.company_id.errors}
              />
              <SearchableSelectField
                inputProps={{
                  ...getInputProps(fields.relationship_type, { type: "text" }),
                  autoFocus: true,
                  placeholder: `Select ${replaceUnderscore(
                    fields.relationship_type.name,
                  )}`,
                }}
                options={transformStringArrayIntoOptions(
                  relationshipTypeArray as unknown as string[],
                )}
                labelProps={{
                  children: replaceUnderscore(fields.relationship_type.name),
                }}
                errors={fields.relationship_type.errors}
              />
              <CheckboxField
                buttonProps={getInputProps(fields.is_active, {
                  type: "checkbox",
                })}
                labelProps={{
                  htmlFor: fields.is_active.id,
                  children: "Is this currently active?",
                }}
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
