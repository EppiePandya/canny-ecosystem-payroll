import {
  hasPermission,
  isGoodStatus,
  updateRole,
  EmployeeLoanSchema,
} from "@canny_ecosystem/utils";
import {
  json,
  useActionData,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { updateEmployeeLoanById } from "@canny_ecosystem/supabase/mutations";
import { getEmployeeLoanById } from "@canny_ecosystem/supabase/queries";
import CreateLoan from "../create-loan";
import { parseWithZod } from "@conform-to/zod";
import { clearExactCacheEntry } from "@/utils/cache";

export const UPDATE_LOAN_TAG = "update-loan";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);
  const loanId = params.loanId;

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.employees}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  if (!loanId) return safeRedirect("/employees", { headers });

  const { data, error } = await getEmployeeLoanById({ supabase, id: loanId });

  if (error || !data) {
    return safeRedirect(`/employees/${params.employeeId}/loans`, { headers });
  }

  return json({ loanData: data });
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const loanId = params.loanId;

    if (!loanId) {
      return json(
        { status: "error", message: "Loan ID is missing" },
        { status: 400 },
      );
    }

    const submission = parseWithZod(formData, {
      schema: EmployeeLoanSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { status, error } = await updateEmployeeLoanById({
      supabase,
      data: { ...submission.value, id: loanId },
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Loan updated successfully",
        error: null,
      });

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return json(
        {
          result: submission.reply({
            fieldErrors: {
              loan_name: [
                "A loan with this name already exists for this employee.",
              ],
            },
          }),
        },
        { status: 400 },
      );
    }

    return json({
      status: "error",
      message: "Failed to update loan",
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

export default function UpdateLoan() {
  const { loanData } = useLoaderData<typeof loader>();
  return <CreateLoan updateValues={loanData as any} />;
}
