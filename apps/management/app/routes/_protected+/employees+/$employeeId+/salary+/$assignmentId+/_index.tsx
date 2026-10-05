import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getEmployeeSalaryAssignmentById,
  getPaymentFieldsByCompanyId,
  getPaymentTemplatesBasicByCompanyId,
  getEmployeeProvidentFundByCompanyId,
  getEmployeeStateInsuranceByCompanyId,
  getProfessionalTaxesByCompanyId,
  getStatutoryBonusByCompanyId,
  getLabourWelfareFundsByCompanyId,
  getEmployeeStatutoryComponentsByAssignmentId,
  type PaymentFieldDataType,
} from "@canny_ecosystem/supabase/queries";
import {
  upsertEmployeeSalaryAssignment,
  upsertEmployeeSalaryStatutoryComponents,
  deleteAllEmployeeComponents,
  syncEmployeeComponents,
} from "@canny_ecosystem/supabase/mutations";
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );
  const assignmentId = params.assignmentId as string;

  const [
    { data: assignment },
    { data: paymentFields },
    { data: templates },
    { data: pfData },
    { data: esicData },
    { data: ptData },
    { data: bonusData },
    { data: lwfData },
  ] = await Promise.all([
    getEmployeeSalaryAssignmentById({
      supabase: supabase as any,
      id: assignmentId,
    }),
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

  if (!assignment) {
    throw new Response("Not Found", { status: 404 });
  }

  const paymentTemplateOptions = (templates || []).map((t: any) => ({
    label: String(t.name ?? ""),
    value: String(t.id ?? ""),
  })) as ComboboxSelectOption[];

  const paymentFieldsOptions = (paymentFields || []).map((f: any) => ({
    label: String(f.name || ""),
    value: String(f.id ?? ""),
  })) as ComboboxSelectOption[];

  const hasCustomComponents =
    assignment.employee_salary_components &&
    assignment.employee_salary_components.length > 0;

  const resolvedComponents = hasCustomComponents
    ? (assignment.employee_salary_components ?? []).map((c: any) => ({
      id: c.id,
      payment_field_id: c.payment_field_id,
      amount: c.amount,
    }))
    : assignment.payment_templates?.payment_template_versions?.[0]?.payment_template_components.map(
      (c: any) => ({
        id: c.id,
        payment_field_id: c.payment_field_id,
        amount: c.amount,
      }),
    ) || [];

  const templateStatutoryData =
    assignment.payment_templates?.payment_template_versions?.[0]
      ?.payment_statutory_components || null;

  const [{ data: employeeStatutoryData }] = await Promise.all([
    getEmployeeStatutoryComponentsByAssignmentId({
      supabase: supabase as any,
      assignmentId,
    }),
  ] as any);

  const initialValues = {
    assignment: {
      id: assignment.id,
      monthly_ctc: assignment.monthly_ctc,
      basic_percent: assignment.basic_percent,
      is_pro_rata: assignment.is_pro_rata,
      effective_date: assignment.effective_date,
      employee_id: assignment.employee_id,
      use_payment_template: assignment.use_payment_template ?? false,
      template_id: assignment.template_id ?? "",
      calculation_direction: assignment.calculation_direction ?? "ctc_to_basic",
      basic_formula: assignment.basic_formula ?? "",
    },
    components: resolvedComponents,
    statutory: employeeStatutoryData || templateStatutoryData,
  };

  return json({
    initialValues,
    paymentTemplateOptions,
    paymentFieldsOptions,
    paymentFieldsData: (paymentFields || []) as PaymentFieldDataType[],

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
  const assignmentId = params.assignmentId as string;

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
      id: assignmentId,
      employee_id: employeeId,
      use_payment_template: assignment.use_payment_template ?? false,
      template_id: assignment.template_id || null,
      calculation_direction: assignment.calculation_direction ?? "ctc_to_basic",
      basic_formula: assignment.basic_formula || null,
    },
    components: components || [],
  });

  if (!isGoodStatus(status)) {
    return json({
      status: "error",
      message: "Failed to update salary assignment.",
      error,
    });
  }

  try {
    if (statutory) {
      const { error: sError } = await upsertEmployeeSalaryStatutoryComponents({
        supabase: supabase as any,
        data: {
          ...statutory,
          employee_salary_assignment_id: assignmentId,
        },
      });

      if (sError) throw sError;
    }
  } catch (error) {
    return json({
      status: "error",
      message: "Failed to update salary components.",
      error: error,
    });
  }

  clearExactCacheEntry(`${cacheKeyPrefix.employee_salary}${employeeId}`);

  return json({
    status: "success",
    message: "Salary assignment updated successfully.",
    data,
  });
}

export default function EditEmployeeSalaryPage() {
  const {
    initialValues,
    paymentTemplateOptions,
    paymentFieldsOptions,
    paymentFieldsData,
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
        initialValues={initialValues}
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
