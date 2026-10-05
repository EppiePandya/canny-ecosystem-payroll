import { DEFAULT_ROUTE } from "@/constant";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { updateCompany } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  CompanyDetailsSchema,
  hasPermission,
  isGoodStatus,
  updateRole,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { parseWithZod } from "@conform-to/zod";
import { type ActionFunctionArgs, json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.company}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: CompanyDetailsSchema,
  });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  if (submission.value.company_type === "sub_contractor") {
    const { data: currentCompany, error: fetchError } = await supabase
      .from("companies")
      .select("contractor_id")
      .eq("id", submission.value.id!)
      .single();

    if (
      !fetchError &&
      currentCompany &&
      "contractor_id" in currentCompany &&
      currentCompany.contractor_id
    ) {
      submission.value.contractor_id = currentCompany.contractor_id as
        | string
        | null;
    } else {
      let contractorId = user?.company_id;

      if (!contractorId || contractorId === submission.value.id) {
        const { data: firstCompanies } = await supabase
          .from("companies")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1);
        if (
          firstCompanies?.[0]?.id &&
          firstCompanies[0].id !== submission.value.id
        ) {
          contractorId = firstCompanies[0].id;
        }
      }

      if (contractorId) {
        submission.value.contractor_id = contractorId;
      }
    }
  } else if (submission.value.company_type) {
    submission.value.contractor_id = null;
  }

  const { status, error } = await updateCompany({
    supabase,
    data: submission.value,
  });

  if (isGoodStatus(status)) {
    return safeRedirect("/settings", { status: 303 });
  }
  return json({ status, error });
}
