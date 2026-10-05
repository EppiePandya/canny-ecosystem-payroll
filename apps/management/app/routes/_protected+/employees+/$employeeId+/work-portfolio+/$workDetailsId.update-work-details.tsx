import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import {
  EmployeeWorkDetailsSchema,
  hasPermission,
  isGoodStatus,
  updateRole,
} from "@canny_ecosystem/utils";
import {
  getDepartmentsByCompanyId,
  getEmployeeWorkDetailsById,
  getProjectNamesByCompanyId,
  getSitesByProjectId,
  getSitesByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { updateEmployeeWorkDetails } from "@canny_ecosystem/supabase/mutations";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { useEffect, useState } from "react";
import { FormProvider, getFormProps, useForm } from "@conform-to/react";
import { Card } from "@canny_ecosystem/ui/card";
import { CreateEmployeeWorkDetails } from "@/components/employees/form/create-employee-work-details";
import { FormButtons } from "@/components/form/form-buttons";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";

export const UPDATE_EMPLOYEE_WORK_DETAILS = "update-employee-work-details";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workDetailsId = params.workDetailsId;
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(
      user?.role!,
      `${updateRole}:${attribute.employeeWorkDetails}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  try {
    let workDetailsData = null;

    if (workDetailsId) {
      workDetailsData = await getEmployeeWorkDetailsById({
        supabase,
        id: workDetailsId,
      });
    }

    if (!workDetailsData || workDetailsData.error) {
      return json({
        status: "error",
        message: "Failed to get employee work details",
        data: null,
        projectOptions: null,
        siteOptions: null,
        departmentOptions: null,
        error: workDetailsData?.error || "Not found",
      });
    }

    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

    const { data: departments } = await getDepartmentsByCompanyId({
      supabase,
      companyId,
    });
    const departmentOptions = departments?.map((department) => ({
      label: department?.name,
      value: department?.id,
    }));

    const urlParams = new URL(request.url).searchParams;
    let urlProjectId = urlParams.get("project");

    if (!urlProjectId) {
      urlProjectId =
        (workDetailsData.data as any)?.project_id ||
        (workDetailsData.data as any)?.sites?.projects?.id;
    }

    const { data: projects } = await getProjectNamesByCompanyId({
      supabase,
      companyId,
    });

    const projectOptions = projects?.map((project) => ({
      label: project?.name,
      value: project?.id,
    }));

    let siteOptions: {
      label: string | undefined;
      value: string | undefined;
    }[] = [];

    if (urlProjectId) {
      const { data: sites } = await getSitesByProjectId({
        supabase,
        projectId: urlProjectId,
      });

      siteOptions =
        sites?.map((site) => ({
          label: site?.name,
          value: site?.id,
        })) || [];
    } else {
      const { data: sites } = await getSitesByCompanyId({
        supabase,
        companyId,
      });

      siteOptions =
        sites?.map((site) => ({
          label: site?.name,
          value: site?.id,
        })) || [];
    }

    return json({
      status: "success",
      message: "Employee work details found",
      data: workDetailsData?.data,
      projectOptions,
      siteOptions,
      departmentOptions,
      error: null,
    });
  } catch (error) {
    return json({
      status: "error",
      message: "An unexpected error occurred",
      data: null,
      projectOptions: null,
      departmentOptions: null,
      siteOptions: null,
      error,
    });
  }
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: EmployeeWorkDetailsSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }
    const { status, error } = await updateEmployeeWorkDetails({
      supabase,
      data: submission.value,
    });

    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Employee work details updated successfully",
        error: null,
      });
    }
    return json({
      status: "error",
      message: "Failed to update employee work details",
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

export default function UpdateEmployeeWorkDetails() {
  const {
    data,
    siteOptions,
    status,
    error,
    departmentOptions,
    projectOptions,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());
  const currentSchema = EmployeeWorkDetailsSchema;

  const [form, fields] = useForm({
    id: UPDATE_EMPLOYEE_WORK_DETAILS,
    constraint: getZodConstraint(currentSchema),
    onValidate: ({ formData }: { formData: FormData }) => {
      return parseWithZod(formData, { schema: currentSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: data,
  });
  const { toast } = useToast();
  const navigate = useNavigate();
  const { employeeId } = useParams();

  useEffect(() => {
    if (status === "error") {
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to load",
        variant: "destructive",
      });
    }
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(cacheKeyPrefix.employees);
        clearCacheEntry(`${cacheKeyPrefix.employee_overview}${employeeId}`);
        clearExactCacheEntry(
          `${cacheKeyPrefix.employee_work_portfolio}${employeeId}`,
        );
        toast({
          title: "Success",
          description: actionData?.message || "Employee updated",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description:
            actionData?.error?.message ||
            actionData?.error ||
            "Employee update failed",
          variant: "destructive",
        });
      }
      navigate(`/employees/${employeeId}/work-portfolio`);
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
            <CreateEmployeeWorkDetails
              key={resetKey}
              fields={fields as any}
              isUpdate={true}
              projectOptions={projectOptions as any}
              siteOptions={siteOptions as any}
              departmentOptions={departmentOptions as any}
            />
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
