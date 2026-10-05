import { CompanySchema, isGoodStatus } from "@canny_ecosystem/utils";
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
} from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
import { Card } from "@canny_ecosystem/ui/card";
import { useEffect, useState } from "react";
import { CreateCompanyDetails } from "@/components/company/form/create-company-details";
import { CreateCompanyRegionalDetails } from "@/components/company/form/create-company-regional-details";
import { FormButtons } from "@/components/form/form-buttons";
import { FormStepHeader } from "@/components/form/form-step-header";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { clearAllCache } from "@/utils/cache";
import { getSession, commitSession } from "@/utils/sessions";
import {
  createCompany,
  createRelationship,
  automatedPaymentSetup,
  addHolidaysFromData,
} from "@canny_ecosystem/supabase/mutations";
import { DEFAULT_ROUTE } from "@/constant";
import { publicHolidays } from "@canny_ecosystem/utils/constant";
import { seedCompanyRelationships } from "@canny_ecosystem/supabase/seed";
import { z } from "zod";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

const SESSION_KEY_PREFIX = "multiStepCompanyForm_step_";
const STEP = "step";
const TOTAL_STEPS = 2;

const Step2DummySchema = z.object({});

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const step = Number.parseInt(url.searchParams.get(STEP) || "1");
  const totalSteps = TOTAL_STEPS;

  const session = await getSession(request.headers.get("Cookie"));
  const stepData: any[] = [];

  for (let i = 1; i <= totalSteps; i++) {
    stepData.push(await session.get(`${SESSION_KEY_PREFIX}${i}`));
  }

  if (step < 1 || step > totalSteps) {
    url.searchParams.set(STEP, "1");
    return redirect(url.toString(), { status: 302 });
  }

  return json({
    step,
    totalSteps,
    stepData,
  });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const url = new URL(request.url);
  const session = await getSession(request.headers.get("Cookie"));
  const step = Number.parseInt(url.searchParams.get(STEP) || "1");
  const totalSteps = TOTAL_STEPS;

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  try {
    const formData = await request.formData();
    const actionType = formData.get("_action") as string;

    if (actionType === "submit") {
      const statesJson = formData.get("manual_states_json") as string;
      const config = statesJson ? JSON.parse(statesJson) : undefined;
      const states = config?.states || (formData.getAll("states") as string[]);
      const employee_type =
        (formData.get("employee_type") as string) || "regular";

      if (
        states.length === 0 &&
        (!config?.centralRules || config.centralRules.length === 0)
      ) {
        return json(
          {
            status: "error",
            message:
              "Please select at least one state or Central Government rule",
          },
          { status: 400 },
        );
      }

      const step1Data = await session.get(`${SESSION_KEY_PREFIX}1`);

      if (!step1Data) {
        return json(
          {
            status: "error",
            message:
              "Session expired or Step 1 data missing. Please go back and try again.",
          },
          { status: 400 },
        );
      }

      if (step1Data.company_type === "sub_contractor") {
        let contractorId = user?.company_id;

        if (!contractorId) {
          const { companyId: activeCompanyId } =
            await getCompanyIdOrFirstCompany(request, supabase);
          if (activeCompanyId) {
            contractorId = activeCompanyId;
          }
        }

        if (!contractorId) {
          const { data: firstCompanies } = await supabase
            .from("companies")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1);
          if (firstCompanies?.[0]?.id) {
            contractorId = firstCompanies[0].id;
          }
        }

        if (contractorId) {
          step1Data.contractor_id = contractorId;
        }
      }

      const { status, error, companyId } = await createCompany({
        supabase,
        companyData: step1Data,
      });

      if (isGoodStatus(status) && companyId) {
        try {
          await automatedPaymentSetup({
            supabase,
            companyId,
            config,
            employeeType: employee_type,
          });

          await createRelationship({
            supabase: supabase as any,
            data: {
              ...seedCompanyRelationships(),
              company_id: companyId,
              relationship_type: "partner",
            },
            bypassAuth: true,
          });

          await addHolidaysFromData({
            supabase,
            data: publicHolidays.map((holiday) => ({
              ...holiday,
              company_id: companyId,
            })),
          });
        } catch (setupError) {
          console.error("Post-creation setup failed:", setupError);
        }

        for (let i = 1; i <= totalSteps; i++) {
          session.unset(`${SESSION_KEY_PREFIX}${i}`);
        }

        return json(
          {
            status: "success",
            message: "Company created successfully!",
            companyId,
          },
          {
            headers: { "Set-Cookie": await commitSession(session) },
          },
        );
      }

      return json(
        {
          status: "error",
          message: `Failed to create Company: ${typeof error === "string" ? error : error?.message || "Unknown error"}`,
          error,
        },
        { status: 400 },
      );
    }

    if (actionType === "next" || actionType === "back") {
      if (step === 1) {
        const submission = parseWithZod(formData, { schema: CompanySchema });
        if (actionType === "next" && submission.status !== "success") {
          return json(
            { status: "error", result: submission.reply() },
            { status: 400 },
          );
        }
        if (submission.status === "success") {
          session.set(`${SESSION_KEY_PREFIX}${step}`, submission.value);
        }
      }

      const nextStep = actionType === "next" ? step + 1 : step - 1;
      url.searchParams.set(STEP, String(nextStep));

      return redirect(url.toString(), {
        headers: { "Set-Cookie": await commitSession(session) },
      });
    }

    return json(
      { status: "error", message: "Invalid action" },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Action Error:", error);
    return json(
      {
        status: "error",
        message: `An unexpected error occurred during submission: ${error?.message || "Unknown error"}`,
        error,
      },
      { status: 500 },
    );
  }
}

export default function CreateCompany() {
  const { step, totalSteps, stepData } = useLoaderData<typeof loader>();
  const [resetKey, setResetKey] = useState(Date.now());
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const currentSchema = step === 1 ? CompanySchema : Step2DummySchema;

  useEffect(() => {
    if (actionData) {
      if (actionData.status === "success") {
        clearAllCache();
        toast({
          title: "Success",
          description: actionData.message,
          variant: "success",
        });
        navigate(DEFAULT_ROUTE);
      } else if (actionData.status === "error" && actionData.message) {
        toast({
          title: "Error",
          description: actionData.message,
          variant: "destructive",
        });
      }
    }
  }, [actionData]);

  const [form, fields] = useForm({
    id: `create-company-step-${step}`,
    constraint: getZodConstraint(currentSchema),
    onValidate: ({ formData }) => {
      return parseWithZod(formData, { schema: currentSchema });
    },
    shouldValidate: "onInput",
    defaultValue:
      stepData[step - 1] ||
      (step === 1 ? getInitialValueFromZod(CompanySchema) : {}),
  });

  return (
    <section className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-4">
      <div className="w-full mx-auto mb-6">
        <FormStepHeader
          totalSteps={totalSteps}
          step={step}
          stepData={stepData}
        />
      </div>
      <FormProvider context={form.context}>
        <Form method="POST" {...getFormProps(form)} className="flex flex-col">
          <Card>
            <div className="h-[550px] overflow-y-auto p-2">
              {step === 1 && (
                <CreateCompanyDetails key={resetKey} fields={fields as any} />
              )}
              {step === 2 && (
                <CreateCompanyRegionalDetails key={resetKey + 1} />
              )}
            </div>
            <FormButtons
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
