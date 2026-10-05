import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearCacheEntry } from "@/utils/cache";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { deleteEmployeeDeathExit } from "@canny_ecosystem/supabase/mutations";

import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { toast } from "@canny_ecosystem/ui/use-toast";
import { deleteRole, hasPermission } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";

import type { ActionFunctionArgs } from "@remix-run/node";
import { json, useActionData, useNavigate, useParams } from "@remix-run/react";
import { useEffect } from "react";

export async function action({ request, params }: ActionFunctionArgs) {
  const employeeId = params.employeeId as string;
  const deathExitId = params.employeeDeathExitId as string;

  try {
    const { supabase, headers } = getSupabaseWithHeaders({ request });
    const { user } = await getUserCookieOrFetchUser(request, supabase);

    if (!hasPermission(user?.role!, `${deleteRole}:${attribute.deathExit}`)) {
      return safeRedirect(DEFAULT_ROUTE, { headers });
    }

    await deleteEmployeeDeathExit({
      supabase,
      exitId: deathExitId,
    });

    clearCacheEntry(`${cacheKeyPrefix.employee_payments}${employeeId}`);

    return json({
      status: "success",
      returnTo: `/employees/${employeeId}/payments`,
      message: "death Exit deleted successfully.",
    });
  } catch (error) {
    console.error("Delete death exit error:", error);

    return json({
      status: "error",
      returnTo: `/employees/${employeeId}/payments`,
      message: "Failed to delete exit. Please try again.",
    });
  }
}

export default function DeleteDeathEmployeeExit() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const { employeeId } = useParams();

  useEffect(() => {
    if (!actionData) return;

    if (actionData.status === "success") {
      toast({
        title: "Success",
        description: actionData.message,
        variant: "success",
      });
    } else {
      toast({
        title: "Error",
        description: actionData.message,
        variant: "destructive",
      });
    }

    clearCacheEntry(`${cacheKeyPrefix.employee_payments}${employeeId}`);
    navigate(actionData.returnTo ?? `/employees/${employeeId}/payments`, {
      replace: true,
    });
  }, [actionData, navigate, employeeId]);

  return null;
}
