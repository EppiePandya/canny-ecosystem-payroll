import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { json } from "@remix-run/react";
import { hasPermission, updateRole } from "@canny_ecosystem/utils";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { attribute } from "@canny_ecosystem/utils/constant";
import { safeRedirect } from "@/utils/server/http.server";
import { DEFAULT_ROUTE } from "@/constant";
import {
  getEmployeeExitById,
  getEmployeeWorkDetailsByEmployeeIdForOthersforexit,
} from "@canny_ecosystem/supabase/queries";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const exitId = params.exitId;
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.exits}`))
    return safeRedirect(DEFAULT_ROUTE, { headers });

  try {
    if (!exitId) {
      throw new Response("Exit ID is required", { status: 400 });
    }

    const { data: exitData, error: exitError } = await getEmployeeExitById({
      supabase,
      id: exitId,
    });

    if (exitError || !exitData) {
      throw new Response("Exit not found", { status: 404 });
    }

    const { data: workDetails, error: workError } =
      await getEmployeeWorkDetailsByEmployeeIdForOthersforexit({
        supabase,
        employeeId: exitData.employee_id,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      });

    if (workError) throw workError;

    return json({
      exitData,
      employeeId: exitData.employee_id,
      workDetails: workDetails ?? [],
      approvedBy: user ? { id: user.id, email: user.email } : null,
      error: null,
    });
  } catch (error) {
    return json({ error, exitData: null }, { status: 500 });
  }
}
