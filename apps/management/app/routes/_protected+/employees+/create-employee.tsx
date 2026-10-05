import {
  createRole,
  EmployeeAddressesSchema,
  EmployeeBankDetailsSchema,
  EmployeeGuardiansSchema,
  EmployeeWorkDetailsSchema,
  EmployeeSchema,
  EmployeeStatutorySchema,
  hasPermission,
  isGoodStatus,
  SIZE_10MB,
  generateEmployeeCodes,
  generateCompanyPrefix,
  EmployeeSalaryUnifiedSchema,
} from "@canny_ecosystem/utils";
import {
  createEmployee,
  upsertEmployeeSalaryAssignment,
  upsertEmployeeSalaryStatutoryComponents,
} from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getInitialValueFromZod } from "@canny_ecosystem/utils";
import { FormProvider, getFormProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  json,
  unstable_parseMultipartFormData as parseMultipartFormData,
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
  redirect,
} from "@remix-run/node";
import { Card } from "@canny_ecosystem/ui/card";
import { useEffect, useState } from "react";
import { commitSession, getSession } from "@/utils/sessions";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { FormButtons } from "@/components/form/form-buttons";
import { useIsomorphicLayoutEffect } from "@canny_ecosystem/utils/hooks/isomorphic-layout-effect";
import { CreateEmployeeDetails } from "@/components/employees/form/create-employee-details";
import { CreateEmployeeStatutoryDetails } from "@/components/employees/form/create-employee-statutory-details";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { CreateEmployeeBankDetails } from "@/components/employees/form/create-employee-bank-details";
import { CreateEmployeeAddress } from "@/components/employees/form/create-employee-address";
import type { EmployeeGuardianDatabaseInsert } from "@canny_ecosystem/supabase/types";
import { CreateEmployeeGuardianDetails } from "@/components/employees/form/create-employee-guardian-details";
import { FormStepHeader } from "@/components/form/form-step-header";
import {
  getCompanyNameByCompanyId,
  getDepartmentsByCompanyId,
  getLatestEmployeeByCompanyId,
  getLatestEmployeeOfTheSite,
  getProjectNamesByCompanyId,
  getSiteById,
  getSiteNamesByCompanyId,
  getCompanyConfigByCompanyId,
  checkEmployeeNameConflictInSite,
  getPaymentFieldsByCompanyId,
  getPaymentTemplatesBasicByCompanyId,
  getEmployeeProvidentFundByCompanyId,
  getEmployeeStateInsuranceByCompanyId,
  getProfessionalTaxesByCompanyId,
  getStatutoryBonusByCompanyId,
  getLabourWelfareFundsByCompanyId,
  getCompanyEsicDetailsByCompanyId,
} from "@canny_ecosystem/supabase/queries";

import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { EmployeeSalaryFormFields } from "@/components/employees/salary/employee-salary-form";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { attribute } from "@canny_ecosystem/utils/constant";
import { safeRedirect } from "@/utils/server/http.server";
import { seedRequisitesForEmployeeCreation } from "@canny_ecosystem/supabase/seed";
import { CreateEmployeeWorkDetails } from "@/components/employees/form/create-employee-work-details";

export const CREATE_EMPLOYEE = [
  "create-employee",
  "create-employee-statutory-details",
  "create-employee-bank-details",
  "create-employee-project-assignment",
  "create-employee-addresses",
  "create-employee-guardians",
  "create-employee-salary",
];

export const STEP = "step";

const SESSION_KEY_PREFIX = "multiStepEmployeeForm_step_";

const schemas = [
  EmployeeSchema,
  EmployeeStatutorySchema,
  EmployeeBankDetailsSchema,
  EmployeeWorkDetailsSchema,
  EmployeeAddressesSchema,
  EmployeeGuardiansSchema,
  EmployeeSalaryUnifiedSchema,
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${createRole}:${attribute.employee}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { data: companyData } = await getCompanyNameByCompanyId({
    supabase,
    id: companyId,
  });

  const { data: companyConfig } = await getCompanyConfigByCompanyId({
    supabase,
    companyId,
  });

  // Fetch prefixes from company_prefix table
  const { data: companyPrefixes } = await (
    supabase.from("company_prefix") as any
  )
    .select("name, site_id, is_default, site:sites!site_id(name)")
    .eq("company_id", companyId);

  const prefixCodeMap: Record<string, string> = {};

  if (companyPrefixes) {
    for (const prefixRow of companyPrefixes) {
      if (prefixRow.name) {
        const { data: latestCode } = await getLatestEmployeeByCompanyId({
          supabase,
          companyId,
          prefix: prefixRow.name,
        });
        const nextCode = generateEmployeeCodes(
          prefixRow.name,
          1,
          latestCode ?? undefined,
        )[0];
        prefixCodeMap[prefixRow.name] = nextCode;
      }
    }
  }

  const defaultPrefixRow =
    companyPrefixes?.find((p: any) => p.is_default === true) ||
    companyPrefixes?.find((p) => p.site_id === null);
  const companyPrefix =
    defaultPrefixRow?.name || generateCompanyPrefix(companyData?.name ?? "");

  if (!prefixCodeMap[companyPrefix]) {
    const { data: latestCode } = await getLatestEmployeeByCompanyId({
      supabase,
      companyId,
      prefix: companyPrefix,
    });
    const nextCode = generateEmployeeCodes(
      companyPrefix,
      1,
      latestCode ?? undefined,
    )[0];
    prefixCodeMap[companyPrefix] = nextCode;
  }

  const { data: latestCode } = await getLatestEmployeeByCompanyId({
    supabase,
    companyId,
    prefix: companyPrefix,
  });

  const autoCode = generateEmployeeCodes(
    companyPrefix,
    1,
    latestCode ?? undefined,
  )[0];

  const step = Number.parseInt(url.searchParams.get(STEP) || "1");
  const totalSteps = schemas.length;

  const session = await getSession(request.headers.get("Cookie"));

  // Check if they are opening step 1 fresh (no step param in URL, i.e., clicked from dialog/table)
  const isFreshStart = !url.searchParams.has(STEP);

  if (isFreshStart) {
    for (let i = 1; i <= totalSteps; i++) {
      session.unset(`${SESSION_KEY_PREFIX}${i}`);
    }
    url.searchParams.set(STEP, "1");
    return redirect(url.toString(), {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  const stepData: any[] = [];

  for (let i = 1; i <= totalSteps; i++) {
    stepData.push(await session.get(`${SESSION_KEY_PREFIX}${i}`));
  }

  if (step < 1 || step > totalSteps) {
    url.searchParams.set(STEP, "1");
    return redirect(url.toString(), { status: 302 });
  }

  let siteOptions: any = [];
  let departmentOptions: any = [];
  let projectOptions: any = [];
  let workDetailCode = "";
  if (step === 4) {
    const url = new URL(request.url);
    const urlSearchParams = new URLSearchParams(url.searchParams);
    const site = urlSearchParams.get("site") ?? "";

    if (site) {
      const { data } = await getLatestEmployeeOfTheSite({
        supabase,
        siteId: site,
      });
      const { data: siteData } = await getSiteById({ id: site, supabase });

      const sitePrefixRow = companyPrefixes?.find((p) => p.site_id === site);
      const prefix = sitePrefixRow?.name || siteData?.prefix || "";

      workDetailCode = generateEmployeeCodes(prefix, 1, data!)[0];
    }

    const { data: departments } = await getDepartmentsByCompanyId({
      supabase,
      companyId,
    });
    departmentOptions = departments?.map((department) => ({
      label: department?.name,
      value: department?.id,
    }));
    const { data: sites } = await getSiteNamesByCompanyId({
      supabase,
      companyId,
    });

    siteOptions = sites?.map((site) => ({
      label: site?.name,
      pseudoLabel: site?.projects?.name,
      value: site?.id,
    }));

    const { data: projects } = await getProjectNamesByCompanyId({
      supabase,
      companyId,
    });
    projectOptions = projects?.map((project) => ({
      label: project?.name,
      value: project?.id,
    }));
  }

  let paymentTemplateOptions: any[] = [];
  let paymentFieldsOptions: any[] = [];
  let paymentFieldsData: any[] = [];
  let templates: any[] = [];
  let pfOptions: any[] = [];
  let esicOptions: any[] = [];
  let ptOptions: any[] = [];
  let bonusOptions: any[] = [];
  let lwfOptions: any[] = [];
  let companyEsicOptions: any[] = [];

  if (step === 2) {
    const { data: esicData } = await getCompanyEsicDetailsByCompanyId({
      supabase: supabase as any,
      companyId,
    });
    companyEsicOptions = (esicData || []).map((item) => ({
      label: item.esic_site_name,
      pseudoLabel: String(item.esic_id_number ?? ""),
      value: item.id,
    }));
  }

  if (step === 7) {
    const [
      { data: paymentFields },
      { data: templatesData },
      { data: pfData },
      { data: esicData },
      { data: ptData },
      { data: bonusData },
      { data: lwfData },
    ] = await Promise.all([
      getPaymentFieldsByCompanyId({ supabase: supabase as any, companyId }),
      getPaymentTemplatesBasicByCompanyId({
        supabase: supabase as any,
        companyId,
      }),
      getEmployeeProvidentFundByCompanyId({
        supabase: supabase as any,
        companyId,
      }),
      getEmployeeStateInsuranceByCompanyId({
        supabase: supabase as any,
        companyId,
      }),
      getProfessionalTaxesByCompanyId({ supabase: supabase as any, companyId }),
      getStatutoryBonusByCompanyId({ supabase: supabase as any, companyId }),
      getLabourWelfareFundsByCompanyId({
        supabase: supabase as any,
        companyId,
      }),
    ]);

    paymentTemplateOptions = (templatesData || []).map((t) => ({
      label: t.name,
      value: t.id,
    }));

    paymentFieldsOptions = (paymentFields || []).map((f) => ({
      label: f.name,
      value: f.id,
    }));

    paymentFieldsData = (paymentFields || []) as any;
    templates = templatesData || [];

    pfOptions = (pfData || []).map((pf: any) => ({
      label: String(pf.epf_number ?? ""),
      value: String(pf.id ?? ""),
    }));

    esicOptions = (esicData || []).map((e: any) => ({
      label: String(e.esi_number ?? ""),
      value: String(e.id ?? ""),
    }));

    ptOptions = (ptData || []).map((p: any) => ({
      label: String(p.state ?? ""),
      value: String(p.id ?? ""),
    }));

    bonusOptions = (bonusData || [])
      .filter((b: any) => b.payment_frequency === "monthly")
      .map((b: any) => ({
        label: String(b.name ?? ""),
        value: String(b.id ?? ""),
      }));

    lwfOptions = (lwfData || []).map((l: any) => ({
      label: String(l.state ?? ""),
      value: String(l.id ?? ""),
    }));
  }

  return json({
    step,
    totalSteps,
    stepData,
    autoCode,
    workDetailCode,
    companyId,
    siteOptions,
    departmentOptions,
    projectOptions,
    companyPrefixes: companyPrefixes || [],
    prefixCodeMap,
    defaultPrefix: companyPrefix,
    paymentTemplateOptions,
    paymentFieldsOptions,
    paymentFieldsData,
    templates,
    pfOptions,
    esicOptions,
    ptOptions,
    bonusOptions,
    lwfOptions,
    companyEsicOptions,
  });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  const session = await getSession(request.headers.get("Cookie"));
  const step = Number.parseInt(url.searchParams.get(STEP) || "1");
  const currentSchema = schemas[step - 1];
  const totalSteps = schemas.length;
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await parseMultipartFormData(
    request,
    createMemoryUploadHandler({ maxPartSize: SIZE_10MB }),
  );
  const actionType = formData.get("_action") as string;
  const submission = parseWithZod(formData, { schema: currentSchema });

  try {
    if (actionType === "submit") {
      if (submission.status !== "success") {
        return json(
          {
            status: "error",
            message: "Form validation failed",
            returnTo: `/employees/create-employee?step=${step}`,
          },
          { status: 400 },
        );
      }

      const employeeData = session.get(`${SESSION_KEY_PREFIX}1`);
      if (!employeeData) {
        return json(
          {
            status: "error",
            message:
              "Session expired or employee details missing. Please restart from step 1.",
            returnTo: "/employees/create-employee?step=1",
          },
          { status: 400 },
        );
      }

      const employeeStatutoryDetailsData = session.get(
        `${SESSION_KEY_PREFIX}2`,
      );
      const employeeBankDetailsData = session.get(`${SESSION_KEY_PREFIX}3`);
      const employeeWorkDetailsData = session.get(`${SESSION_KEY_PREFIX}4`);
      const employeeAddressesData = session.get(`${SESSION_KEY_PREFIX}5`);
      const employeeGuardiansData = session.get(`${SESSION_KEY_PREFIX}6`);
      const employeeSalaryUnifiedData = submission.value as any;

      const { update_main_employee_code, ...rest } =
        employeeWorkDetailsData ?? {};

      if (update_main_employee_code) {
        employeeData.employee_code =
          employeeWorkDetailsData.employee_code.trim();
      }

      // Name conflict check within site
      const { hasConflict, error: nameError } =
        await checkEmployeeNameConflictInSite({
          supabase,
          siteId: rest.site_id,
          firstName: employeeData.first_name,
          middleName: employeeData.middle_name || "",
          lastName: employeeData.last_name || "",
        });

      if (nameError) {
        console.error("Error checking name conflict:", nameError);
      }

      if (hasConflict) {
        return json(
          {
            status: "error",
            message: `An employee with name '${employeeData.first_name} ${employeeData.last_name || ""
              }' already exists in this site. To avoid attendance matching issues, please change the employee name manually or select a different site.`,
            returnTo: `/employees/create-employee?step=1`,
          },
          { status: 400 },
        );
      }

      const {
        id,
        status,
        employeeError,
        employeeStatutoryDetailsError,
        employeeBankDetailsError,
        employeeWorkDetailsError,
        employeeAddressesError,
        employeeGuardiansError,
      } = await createEmployee({
        supabase,
        employeeData,
        employeeStatutoryDetailsData,
        employeeBankDetailsData,
        employeeWorkDetailsData: rest,
        employeeAddressesData,
        employeeGuardiansData,
      });
      if (id) {
        await seedRequisitesForEmployeeCreation({ employeeId: id });
      }
      if (employeeError) {
        return json(
          {
            status: "error",
            error: employeeError,
            message: "Failed to create employee",
            returnTo: "/employees",
          },
          { status: 500 },
        );
      }

      if (
        employeeStatutoryDetailsError ||
        employeeBankDetailsError ||
        employeeWorkDetailsError ||
        employeeAddressesError ||
        employeeGuardiansError
      ) {
        return json(
          {
            status: "error",
            error:
              employeeStatutoryDetailsError ||
              employeeBankDetailsError ||
              employeeWorkDetailsError ||
              employeeAddressesError ||
              employeeGuardiansError,
            message: "Failed to save employee details",
            returnTo: DEFAULT_ROUTE,
          },
          { status: 500 },
        );
      }

      if (isGoodStatus(status)) {
        // Save step 7 salary unified details
        if (id && employeeSalaryUnifiedData) {
          const { assignment, components, statutory } =
            employeeSalaryUnifiedData;
          const useTemplate = assignment?.use_payment_template;

          const cleanAssignment = {
            ...assignment,
            employee_id: id,
          };

          const {
            status: salaryStatus,
            error: salaryError,
            data: salaryData,
          } = await upsertEmployeeSalaryAssignment({
            supabase: supabase as any,
            assignment: cleanAssignment,
            components: useTemplate ? undefined : components,
          });

          if (isGoodStatus(salaryStatus)) {
            const assignmentId = salaryData?.id;

            if (useTemplate) {
              await supabase
                .from("employee_salary_statutory_components")
                .delete()
                .eq("employee_salary_assignment_id", assignmentId);
            } else {
              if (statutory) {
                const { status: sStatus, error: sError } =
                  await upsertEmployeeSalaryStatutoryComponents({
                    supabase: supabase as any,
                    data: {
                      ...statutory,
                      employee_salary_assignment_id: assignmentId,
                    },
                  });
                if (sError) {
                  console.error(
                    "Failed to save statutory components for created employee:",
                    sError,
                  );
                }
              }
            }
            clearExactCacheEntry(`${cacheKeyPrefix.employee_salary}${id}`);
          } else {
            console.error(
              "Failed to save salary assignment for created employee:",
              salaryError,
            );
          }
        }

        for (let i = 1; i <= totalSteps; i++) {
          session.unset(`${SESSION_KEY_PREFIX}${i}`);
        }
        return json(
          {
            status: "success",
            message: "Employee created successfully",
            returnTo: "/employees",
            employeeCode: employeeData.employee_code,
          },
          {
            status: status,
            headers: {
              "Set-Cookie": await commitSession(session),
            },
          },
        );
      }
    } else if (
      actionType === "next" ||
      actionType === "back" ||
      actionType === "skip"
    ) {
      if (submission.status === "success") {
        session.set(`${SESSION_KEY_PREFIX}${step}`, submission.value);
      }

      if (submission.status === "error") {
        return json(
          {
            status: "error",
            message: "Form validation failed",
            returnTo: `/employees/create-employee?step=${step}`,
          },
          { status: 400 },
        );
      }

      let nextStep = step;
      if (actionType === "next" || actionType === "skip") {
        nextStep = Math.min(step + 1, totalSteps);
      } else if (actionType === "back") {
        nextStep = Math.max(step - 1, 1);
      }

      url.searchParams.set(STEP, String(nextStep));
      return redirect(url.toString(), {
        headers: {
          "Set-Cookie": await commitSession(session),
        },
      });
    }
  } catch (error) {
    return json(
      {
        status: "error",
        message: `An unexpected error occurred${error}`,
        returnTo: "/employees",
      },
      { status: 500 },
    );
  }

  return json({});
}

export default function CreateEmployee() {
  const {
    step,
    totalSteps,
    stepData,
    companyId,
    siteOptions,
    autoCode,
    workDetailCode,
    departmentOptions,
    projectOptions,
    companyPrefixes,
    prefixCodeMap,
    defaultPrefix,
    paymentTemplateOptions,
    paymentFieldsOptions,
    paymentFieldsData,
    templates,
    pfOptions,
    esicOptions,
    ptOptions,
    bonusOptions,
    lwfOptions,
    companyEsicOptions,
  } = useLoaderData<typeof loader>();
  const [resetKey, setResetKey] = useState(Date.now());

  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "true";
  const { toast } = useToast();
  const navigate = useNavigate();

  const EMPLOYEE_TAG = CREATE_EMPLOYEE[step - 1];
  const currentSchema = schemas[step - 1];
  const initialValues = getInitialValueFromZod(currentSchema);

  useIsomorphicLayoutEffect(() => {
    setResetKey(Date.now());
  }, [step]);

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(cacheKeyPrefix.employees);
        toast({
          title: "Success",
          description: actionData?.message || "Employee created successfully",
          variant: "success",
        });
        if (typeof window !== "undefined" && window.parent !== window) {
          window.parent.postMessage(
            {
              type: "EMPLOYEE_CREATED",
              employeeCode: actionData?.employeeCode,
            },
            "*",
          );
          return;
        }
      } else {
        toast({
          title: "Error",
          description:
            actionData?.error?.message ||
            actionData?.error ||
            actionData?.message ||
            "Failed to create employee",
          variant: "destructive",
        });
      }
      navigate(actionData?.returnTo ?? "/employees");
    }
  }, [actionData]);

  const [form, fields] = useForm({
    id: EMPLOYEE_TAG,
    constraint: getZodConstraint(currentSchema),
    onValidate: ({ formData }: { formData: FormData }) => {
      return parseWithZod(formData, { schema: currentSchema });
    },
    shouldValidate: "onInput",
    shouldRevalidate: "onInput",
    defaultValue: stepData[step - 1]
      ? {
        ...stepData[step - 1],
        company_id: step === 1 ? companyId : null,
      }
      : step === 7
        ? {
          assignment: {
            employee_id: "00000000-0000-0000-0000-000000000000",
            basic_percent: 50,
            is_pro_rata: true,
            use_payment_template: false,
          },
          components: [],
          statutory: {},
        }
        : {
          ...initialValues,
          first_name: searchParams.get("first_name") || initialValues.first_name || "",
          middle_name: searchParams.get("middle_name") || initialValues.middle_name || "",
          last_name: searchParams.get("last_name") || initialValues.last_name || "",
          email: searchParams.get("email") || initialValues.email || "",
          personal_email: searchParams.get("personal_email") || searchParams.get("email") || initialValues.personal_email || "",
          phone_number: searchParams.get("phone_number") || searchParams.get("phone") || initialValues.phone_number || "",
          gender: searchParams.get("gender") || initialValues.gender || undefined,
          date_of_birth: searchParams.get("date_of_birth") || searchParams.get("dob") || initialValues.date_of_birth || undefined,
          date_of_joining: searchParams.get("date_of_joining") || searchParams.get("doj") || initialValues.date_of_joining || undefined,
          company_id: step === 1 ? companyId : null,
        },
  });

  return (
    <section
      className={cn(
        "px-4 lg:px-10 xl:px-14 2xl:px-40 py-4",
        isEmbed && "px-2 py-2 lg:px-2 xl:px-2 2xl:px-2",
      )}
    >
      <div className="w-full mx-auto mb-4">
        <FormStepHeader
          totalSteps={totalSteps}
          step={step}
          stepData={stepData}
        />
      </div>
      <FormProvider context={form.context}>
        <Form
          method="POST"
          encType="multipart/form-data"
          {...getFormProps(form)}
          className="flex flex-col"
        >
          <Card>
            <div
              className={cn(
                "h-[560px] max-sm:h-[500px] overflow-scroll",
                isEmbed && "h-[450px] max-sm:h-[400px]",
              )}
            >
              {step === 1 ? (
                <CreateEmployeeDetails
                  key={resetKey}
                  fields={fields as any}
                  autoCode={autoCode}
                  companyPrefixes={companyPrefixes}
                  prefixCodeMap={prefixCodeMap}
                  defaultPrefix={defaultPrefix}
                />
              ) : null}
              {step === 2 ? (
                <CreateEmployeeStatutoryDetails
                  key={resetKey + 1}
                  fields={fields as any}
                  esicOptions={companyEsicOptions}
                />
              ) : null}
              {step === 3 ? (
                <CreateEmployeeBankDetails
                  key={resetKey + 2}
                  fields={fields as any}
                />
              ) : null}
              {step === 4 ? (
                <CreateEmployeeWorkDetails
                  key={resetKey + 3}
                  fields={fields as any}
                  projectOptions={projectOptions}
                  siteOptions={siteOptions}
                  departmentOptions={departmentOptions}
                  autoCode={workDetailCode}
                />
              ) : null}
              {step === 5 ? (
                <CreateEmployeeAddress
                  key={resetKey + 4}
                  fields={fields as any}
                />
              ) : null}
              {step === 6 ? (
                <CreateEmployeeGuardianDetails
                  key={resetKey + 5}
                  fields={fields as any}
                />
              ) : null}
              {step === 7 ? (
                <div key={resetKey + 6} className="p-6">
                  <EmployeeSalaryFormFields
                    form={form}
                    fields={fields}
                    paymentTemplateOptions={paymentTemplateOptions}
                    paymentFieldsOptions={paymentFieldsOptions}
                    paymentFieldsData={paymentFieldsData}
                    pfOptions={pfOptions}
                    esicOptions={esicOptions}
                    ptOptions={ptOptions}
                    bonusOptions={bonusOptions}
                    lwfOptions={lwfOptions}
                  />
                </div>
              ) : null}
            </div>
            <FormButtons
              className="pt-4 border-t"
              form={form}
              setResetKey={setResetKey}
              step={step}
              totalSteps={totalSteps}
            />
          </Card>
        </Form>
      </FormProvider>
    </section>
  );
}
