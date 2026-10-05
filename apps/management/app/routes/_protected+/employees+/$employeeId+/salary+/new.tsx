import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getPaymentFieldsByCompanyId,
  getPaymentTemplatesBasicByCompanyId,
  getEmployeeProvidentFundByCompanyId,
  getEmployeeStateInsuranceByCompanyId,
  getProfessionalTaxesByCompanyId,
  getStatutoryBonusByCompanyId,
  getLabourWelfareFundsByCompanyId,
  type PaymentFieldDataType,
} from "@canny_ecosystem/supabase/queries";
import { upsertEmployeeSalaryAssignment } from "@canny_ecosystem/supabase/mutations";
import { upsertEmployeeSalaryStatutoryComponents } from "@canny_ecosystem/supabase/mutations";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { EmployeeSalaryForm } from "@/components/employees/salary/employee-salary-form";
import { parseWithZod } from "@conform-to/zod";
import {
  EmployeeSalaryUnifiedSchema,
  isGoodStatus,
} from "@canny_ecosystem/utils";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );

  const [
    { data: paymentFields },
    { data: templates },
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
    getLabourWelfareFundsByCompanyId({ supabase: supabase as any, companyId }),
  ]);

  const paymentTemplateOptions = (templates || []).map((t) => ({
    label: t.name,
    value: t.id,
  })) as ComboboxSelectOption[];

  const paymentFieldsOptions = (paymentFields || []).map((f) => ({
    label: f.name,
    value: f.id,
  })) as ComboboxSelectOption[];

  return json({
    paymentTemplateOptions,
    paymentFieldsOptions,
    paymentFieldsData: (paymentFields || []) as any,
    templates: templates || [],
    pfOptions: (pfData || []).map((pf: any) => ({
      label: String(pf.epf_number ?? ""),
      value: String(pf.id ?? ""),
    })) as { label: string; value: string }[],
    esicOptions: (esicData || []).map((e: any) => ({
      label: String(e.esi_number ?? ""),
      value: String(e.id ?? ""),
    })) as { label: string; value: string }[],
    ptOptions: (ptData || []).map((p: any) => ({
      label: String(p.state ?? ""),
      value: String(p.id ?? ""),
    })) as { label: string; value: string }[],
    bonusOptions: (bonusData || [])
      .filter((b: any) => b.payment_frequency === "monthly")
      .map((b: any) => ({
        label: String(b.name ?? ""),
        value: String(b.id ?? ""),
      })) as { label: string; value: string }[],
    lwfOptions: (lwfData || []).map((l: any) => ({
      label: String(l.state ?? ""),
      value: String(l.id ?? ""),
    })) as { label: string; value: string }[],
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const employeeId = params.employeeId as string;

  const formData = await request.formData();
  const submission = parseWithZod(formData, {
    schema: EmployeeSalaryUnifiedSchema,
  });

  if (submission.status !== "success") {
    return json(submission.reply());
  }

  const { assignment, components, statutory } = submission.value;

  const { status, error, data } = await upsertEmployeeSalaryAssignment({
    supabase: supabase as any,
    assignment: {
      ...assignment,
      employee_id: employeeId,
      use_payment_template: assignment.use_payment_template ?? false,
      template_id: assignment.template_id || null,
      calculation_direction: assignment.calculation_direction ?? "ctc_to_basic",
      basic_formula: assignment.basic_formula || null,
    },
    components: components || [],
  });

  if (isGoodStatus(status)) {
    const assignmentId = (data as any)?.id;

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
        return json({
          status: "error",
          message: "Failed to save statutory components.",
          error: sError,
        });
      }
    }
  }

  if (isGoodStatus(status)) {
    clearExactCacheEntry(`${cacheKeyPrefix.employee_salary}${employeeId}`);

    return json({
      status: "success",
      message: "Salary assignment created successfully.",
      data,
    });
  }

  return json({
    status: "error",
    message: "Failed to create salary assignment.",
    error,
  });
}

export default function AddEmployeeSalaryPage() {
  const {
    paymentTemplateOptions,
    paymentFieldsOptions,
    paymentFieldsData,
    templates,
    pfOptions,
    esicOptions,
    ptOptions,
    bonusOptions,
    lwfOptions,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const { toast } = useToast();
  const navigate = useNavigate();
  const { employeeId } = useParams();

  useEffect(() => {
    if (actionData?.status === "success") {
      toast({
        title: "Success",
        description: actionData.message,
        variant: "success",
      });
      navigate(`/employees/${employeeId}/salary`);
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description: actionData.message,
        variant: "destructive",
      });
    }
  }, [actionData, navigate, employeeId, toast]);

  return (
    <div className="py-6 h-full w-full overflow-y-auto no-scrollbar">
      <EmployeeSalaryForm
        paymentTemplateOptions={paymentTemplateOptions}
        paymentFieldsOptions={paymentFieldsOptions}
        paymentFieldsData={paymentFieldsData as PaymentFieldDataType[]}
        pfOptions={pfOptions}
        esicOptions={esicOptions}
        ptOptions={ptOptions}
        bonusOptions={bonusOptions}
        lwfOptions={lwfOptions}
      />
    </div>
  );
}
