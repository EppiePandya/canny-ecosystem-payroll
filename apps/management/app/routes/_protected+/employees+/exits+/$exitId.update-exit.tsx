import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import {
  EmployeeExitFormSchema,
  hasPermission,
  isGoodStatus,
  updateRole,
} from "@canny_ecosystem/utils";
import { getEmployeeExitById } from "@canny_ecosystem/supabase/queries";
import { getEmployeeWorkDetailsByEmployeeIdForOthersforexit } from "@canny_ecosystem/supabase/queries";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import CreateEmployeeExit from "@/routes/_protected+/employees+/$employeeId+/payments+/create-employee-exit";
import { updateEmployeeExit } from "@canny_ecosystem/supabase/mutations";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { useEffect } from "react";
import { clearCacheEntry } from "@/utils/cache";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const exitId = params.exitId!;

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.exits}`))
    return safeRedirect(DEFAULT_ROUTE, { headers });

  const { data: exitData, error } = await getEmployeeExitById({
    supabase,
    id: exitId,
  });

  if (!exitData || error) throw new Response("Exit not found", { status: 404 });

  const { data: workDetails } =
    await getEmployeeWorkDetailsByEmployeeIdForOthersforexit({
      supabase,
      employeeId: exitData.employee_id,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    });

  const workDetailForThisExit = workDetails?.[0];

  return json({
    exitData,
    employeeId: exitData.employee_id,
    workDetails,
    workDetailForThisExit,
    approvedBy: user ? { id: user.id, email: user.email } : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: EmployeeExitFormSchema,
  });

  if (submission.status !== "success")
    return json({ result: submission.reply() }, { status: 400 });

  const { status, error } = await updateEmployeeExit({
    supabase,
    data: submission.value,
  });

  if (!isGoodStatus(status))
    return json({ status: "error", error }, { status: 500 });

  return json({ status: "success", message: "Exit updated" });
}

export default function UpdateEmployeeExit() {
  const { exitData } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!actionData) return;

    if (
      actionData &&
      typeof actionData === "object" &&
      "status" in actionData &&
      actionData.status === "success"
    ) {
      toast({
        title: "Success",
        description:
          "message" in actionData
            ? (actionData.message as string)
            : "Exit updated",
        variant: "success",
      });
      clearCacheEntry(cacheKeyPrefix.exits);
      navigate(`/employees/exits`, { replace: true });
    }
  }, [actionData]);

  return <CreateEmployeeExit updateValues={exitData} />;
}
