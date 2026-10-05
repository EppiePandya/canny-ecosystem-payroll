import {
  isGoodStatus,
  CompanyEsicDetailsSchema,
  getInitialValueFromZod,
  replaceDash,
} from "@canny_ecosystem/utils";
import { Field } from "@canny_ecosystem/ui/forms";
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
import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";

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
import { clearExactCacheEntry } from "@/utils/cache";
import type { CompanyEsicDetailsDatabaseUpdate } from "@canny_ecosystem/supabase/types";
import { createCompanyEsicDetail } from "@canny_ecosystem/supabase/mutations";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

import { UPDATE_ESIC_CONFIG_TAG } from "../../modules_+/esic-config+/$esicId+/update-esic-config";

export const CREATE_ESIC_CONFIG_TAG = "create-esic-config";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!user) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  return json({
    companyId,
  });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: CompanyEsicDetailsSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { status, error } = await createCompanyEsicDetail({
      supabase,
      data: submission.value as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "ESIC Config created successfully",
        error: null,
      });

    return json({
      status: "error",
      message: "Failed to create ESIC Config",
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

export default function CreateEsicConfig({
  updateValues,
}: {
  updateValues?: CompanyEsicDetailsDatabaseUpdate | null;
}) {
  const { companyId } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();
  const ESIC_TAG = updateValues
    ? UPDATE_ESIC_CONFIG_TAG
    : CREATE_ESIC_CONFIG_TAG;

  const initialValues =
    updateValues ?? getInitialValueFromZod(CompanyEsicDetailsSchema);

  const [form, fields] = useForm({
    id: ESIC_TAG,
    constraint: getZodConstraint(CompanyEsicDetailsSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: CompanyEsicDetailsSchema });
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
      clearExactCacheEntry(cacheKeyPrefix.esic_config);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate("/modules/esic-config", { replace: true });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description: actionData.error?.message ?? "ESIC Config creation failed",
        variant: "destructive",
      });
    }
  }, [actionData]);

  return (
    <section className="px-4 lg:px-10 xl:px-14 max-sm:px-0 2xl:px-40 py-4">
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card className="max-sm:px-0">
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {replaceDash(ESIC_TAG)}
              </CardTitle>
              <CardDescription>
                Add ESIC site configuration details for your company
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input {...getInputProps(fields.id, { type: "hidden" })} />
              <input
                {...getInputProps(fields.company_id, { type: "hidden" })}
              />
              <Field
                inputProps={{
                  ...getInputProps(fields.esic_site_name, { type: "text" }),
                  autoFocus: true,
                  placeholder: "Enter ESIC Site Name",
                }}
                labelProps={{
                  children: "ESIC Site Name",
                }}
                errors={fields.esic_site_name.errors}
              />
              <Field
                inputProps={{
                  ...getInputProps(fields.esic_id_number, { type: "text" }),
                  placeholder: "Enter ESIC ID Number",
                }}
                labelProps={{
                  children: "ESIC ID Number",
                }}
                errors={fields.esic_id_number.errors}
              />
            </CardContent>
            <FormButtons form={form} isSingle={true} />
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
