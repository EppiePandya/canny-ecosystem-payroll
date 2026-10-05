import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";

import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  EmployeeDeathExitFormSchema,
  hasPermission,
  isGoodStatus,
  updateRole,
} from "@canny_ecosystem/utils";

import { updateEmployeeDeathExit } from "@canny_ecosystem/supabase/mutations";

import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";

import CreateEmployeeDeathExit from "../$exitId.create-employee-death-exit";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { useEffect } from "react";
import { clearCacheEntry } from "@/utils/cache";
import { getEmployeeDeathExitByExitId } from "@canny_ecosystem/supabase/queries";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.deathExit}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const deathExitId = params.employeeDeathExitId;

  if (!deathExitId) {
    throw new Response("Death exit ID is required", { status: 400 });
  }

  const { data, error } = await getEmployeeDeathExitByExitId({
    supabase,
    exitId: deathExitId,
  });

  if (error || !data) {
    throw new Response("Death exit not found", { status: 404 });
  }

  return json({ exitData: data });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: EmployeeDeathExitFormSchema,
  });

  if (submission.status !== "success") {
    return json(
      { result: submission.reply() },
      { status: submission.status === "error" ? 400 : 200 },
    );
  }

  const { status, error } = await updateEmployeeDeathExit({
    supabase,
    data: submission.value,
  });

  if (isGoodStatus(status)) {
    return json({
      status: "success",
      message: "Death exit updated successfully",
    });
  }

  return json({ status: "error", error }, { status: 500 });
}

export default function UpdateEmployeeDeathExit() {
  const { exitData } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { employeeId } = useParams();

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if ((actionData as any)?.status === "success") {
      toast({
        title: "Success",
        description: (actionData as any).message,
        variant: "success",
      });
      clearCacheEntry(cacheKeyPrefix.employee_payments);
      navigate(`/employees/${employeeId}/payments`, { replace: true });
    }
  }, [actionData]);

  return <CreateEmployeeDeathExit updateValues={exitData} />;
}
