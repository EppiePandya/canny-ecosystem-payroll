import {
  hasPermission,
  isGoodStatus,
  updateRole,
  EmployeeAdvanceSchema,
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
import { updateEmployeeAdvanceById } from "@canny_ecosystem/supabase/mutations";
import { getEmployeeAdvanceById } from "@canny_ecosystem/supabase/queries";
import CreateAdvance from "../create-advance";
import { parseWithZod } from "@conform-to/zod";
import { clearExactCacheEntry } from "@/utils/cache";

export const UPDATE_ADVANCE_TAG = "update-advance";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);
  const advanceId = params.advanceId;

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.employees}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  if (!advanceId) return safeRedirect("/employees", { headers });

  const { data, error } = await getEmployeeAdvanceById({
    supabase,
    id: advanceId,
  });

  if (error || !data) {
    return safeRedirect(`/employees/${params.employeeId}/advances`, {
      headers,
    });
  }

  return json({ advanceData: data });
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const advanceId = params.advanceId;

    if (!advanceId) {
      return json(
        { status: "error", message: "Advance ID is missing" },
        { status: 400 },
      );
    }

    const submission = parseWithZod(formData, {
      schema: EmployeeAdvanceSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { status, error } = await updateEmployeeAdvanceById({
      supabase,
      data: { ...submission.value, id: advanceId },
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Advance updated successfully",
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
              advance_name: [
                "A advance with this name already exists for this employee.",
              ],
            },
          }),
        },
        { status: 400 },
      );
    }

    return json({
      status: "error",
      message: "Failed to update advance",
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

export default function UpdateAdvance() {
  const { advanceData } = useLoaderData<typeof loader>();
  return <CreateAdvance updateValues={advanceData as any} />;
}
