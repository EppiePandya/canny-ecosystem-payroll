import {
  hasPermission,
  isGoodStatus,
  deleteRole,
} from "@canny_ecosystem/utils";
import { json, useParams, useNavigate } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { deleteEmployeeLoanById } from "@canny_ecosystem/supabase/mutations";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { useEffect } from "react";
import { useActionData } from "@remix-run/react";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${deleteRole}:${attribute.employees}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  return json({});
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const loanId = params.loanId;

    if (!loanId) {
      return json(
        { status: "error", message: "Loan ID is missing" },
        { status: 400 },
      );
    }

    const { status, error } = await deleteEmployeeLoanById({
      supabase,
      id: loanId,
    });

    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Loan deleted successfully",
        error: null,
        redirectUrl: `/employees/${params.employeeId}/loans`,
      });
    }

    return json({
      status: "error",
      message: "Failed to delete loan",
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

export default function DeleteLoanRoute() {
  const { employeeId } = useParams();
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.status === "success") {
      clearCacheEntry(cacheKeyPrefix.employee_loans);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
    } else if (actionData?.status === "error") {
      toast({
        title: "Error",
        description: actionData.message ?? "Loan deletion failed",
        variant: "destructive",
      });
    }
    navigate(actionData?.redirectUrl || `/employees/${employeeId}/loans`, {
      replace: true,
    });
  }, [actionData, employeeId, navigate, toast]);

  return null;
}
