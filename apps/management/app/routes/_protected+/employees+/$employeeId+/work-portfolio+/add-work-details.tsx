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
  createRole,
  EmployeeWorkDetailsSchema,
  generateEmployeeCodes,
  getInitialValueFromZod,
  hasPermission,
  isGoodStatus,
} from "@canny_ecosystem/utils";
import {
  getDepartmentsByCompanyId,
  getLatestEmployeeOfTheSite,
  getProjectNamesByCompanyId,
  getSiteById,
  getSitesByProjectId,
  getSitesByCompanyId,
  getEmployeesByIds,
  checkEmployeeNameConflictInSite,
} from "@canny_ecosystem/supabase/queries";
import { createEmployeeWorkDetails } from "@canny_ecosystem/supabase/mutations";
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

export const ADD_EMPLOYEE_WORK_DETAILS = "add-employee-work-details";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const employeeId = params.employeeId;
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(
      user?.role!,
      `${createRole}:${attribute.employeeWorkDetails}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const url = new URL(request.url);
  const urlSearchParams = new URLSearchParams(url.searchParams);
  try {
    const site = urlSearchParams.get("site") ?? "";

    let autoCode = "";
    if (site) {
      const { data } = await getLatestEmployeeOfTheSite({
        supabase,
        siteId: site,
      });

      const { data: siteData } = await getSiteById({ id: site, supabase });

      autoCode = generateEmployeeCodes(siteData?.prefix ?? "", 1, data!)[0];
    }

    const { data: departments } = await getDepartmentsByCompanyId({
      supabase,
      companyId,
    });
    const departmentOptions = departments?.map((department) => ({
      label: department?.name,
      value: department?.id,
    }));
    const { data: projects } = await getProjectNamesByCompanyId({
      supabase,
      companyId,
    });

    const projectOptions =
      projects?.map((project) => ({
        label: project.name,
        value: project.id,
      })) || [];

    const projectId = urlSearchParams.get("project") ?? "";
    let siteOptions: { label: string; value: string }[] = [];
    if (projectId) {
      const { data: sites } = await getSitesByProjectId({
        supabase,
        projectId,
      });

      siteOptions =
        sites?.map((site) => ({
          label: site.name,
          value: site.id,
        })) || [];
    } else {
      const { data: sites } = await getSitesByCompanyId({
        supabase,
        companyId,
      });

      siteOptions =
        sites?.map((site) => ({
          label: site.name,
          value: site.id,
        })) || [];
    }

    return json({
      status: "success",
      employeeId,
      siteOptions,
      projectOptions,
      departmentOptions,
      message: "Employee Work Details Form Loaded",
      error: null,
    });
  } catch (error) {
    return json({
      status: "error",
      employeeId,
      siteOptions: null,
      departmentOptions: null,
      projectOptions: null,
      message: "An unexpected error occurred",
      error,
    });
  }
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const employeeId = params.employeeId;
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

    const { data: employees } = await getEmployeesByIds({
      supabase,
      ids: [employeeId ?? submission.value.employee_id ?? ""],
    });

    if (employees && employees.length > 0) {
      const employee = employees[0];

      // Name conflict check within site
      const { hasConflict, error: conflictError } =
        await checkEmployeeNameConflictInSite({
          supabase,
          siteId: submission.value.site_id,
          employeeId: employee.id,
          firstName: employee.first_name,
          middleName: employee.middle_name || "",
          lastName: employee.last_name || "",
        });

      if (conflictError) {
        return json({
          status: "error",
          message: "Error validating name uniqueness in site",
          error: conflictError,
        });
      }

      if (hasConflict) {
        return json({
          status: "error",
          message: `An employee with name '${employee.first_name} ${
            employee.last_name || ""
          }' already exists in this site. To avoid attendance matching issues, please change the employee name manually in the employee profile before creating work details.`,
          error: { message: "Duplicate employee name in site" },
        });
      }
    }

    const { status, error } = await createEmployeeWorkDetails({
      supabase,
      data: {
        ...submission.value,
        employee_id: submission.value.employee_id ?? employeeId ?? "",
      },
    });

    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Employee work details created successfully",
        error: null,
      });
    }

    return json({
      status: "error",
      message: "Failed to create employee work details",
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

export default function createEmployeeWorkDetailsRoute() {
  const {
    employeeId,
    siteOptions,
    status,
    error,
    departmentOptions,
    projectOptions,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [resetKey, setResetKey] = useState(Date.now());
  const currentSchema = EmployeeWorkDetailsSchema;

  const initialValues = getInitialValueFromZod(currentSchema);

  const [form, fields] = useForm({
    id: ADD_EMPLOYEE_WORK_DETAILS,
    constraint: getZodConstraint(currentSchema),
    onValidate: ({ formData }: { formData: FormData }) => {
      return parseWithZod(formData, { schema: currentSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...initialValues,
      employee_id: employeeId,
    },
  });
  const { toast } = useToast();
  const navigate = useNavigate();

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
          description: actionData?.message || "Employee Work Details created",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description:
            actionData?.error?.message ||
            "Creating employee work details failed",
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
              projectOptions={projectOptions}
              siteOptions={siteOptions}
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
