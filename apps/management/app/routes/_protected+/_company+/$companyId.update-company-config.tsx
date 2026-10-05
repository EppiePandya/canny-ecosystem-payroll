import { DEFAULT_ROUTE } from "@/constant";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { upsertCompanyConfig } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  hasPermission,
  isGoodStatus,
  updateRole,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { parseWithZod } from "@conform-to/zod";
import { type ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { z } from "zod";

const CompanyConfigFormSchema = z.object({
  company_id: z.string().uuid(),
  company_bonus_start_month: z.preprocess(
    (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10)),
    z.number().int().min(1).max(12).nullable().optional(),
  ),
  company_bonus_end_month: z.preprocess(
    (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10)),
    z.number().int().min(1).max(12).nullable().optional(),
  ),
  invoice_prefix: z.string().optional().nullable(),
  company_salary_prefix: z.string().optional().nullable(),
  show_employer_contribution: z.preprocess(
    (v) => (v === "true" || v === "on" || v === true),
    z.boolean().optional().nullable(),
  ),
});

export async function loader() {
  return redirect("/settings");
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (
    !hasPermission(user?.role!, `${updateRole}:${attribute.settingGeneral}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: CompanyConfigFormSchema,
  });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  const { status, data, error } = await upsertCompanyConfig({
    supabase,
    configData: {
      company_id: submission.value.company_id,
      company_bonus_start_month:
        submission.value.company_bonus_start_month ?? null,
      company_bonus_end_month: submission.value.company_bonus_end_month ?? null,
      invoice_prefix: submission.value.invoice_prefix ?? null,
      company_salary_prefix: submission.value.company_salary_prefix ?? null,
      show_employer_contribution: submission.value.show_employer_contribution ?? false,
    },
  });

  if (isGoodStatus(status)) {
    return json({ status: "success", data });
  }

  // On error, return the error info
  return json({ status: "error", error }, { status: 400 });
}
