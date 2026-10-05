import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import {
  LetterSchema,
  hasPermission,
  isGoodStatus,
  updateRole,
} from "@canny_ecosystem/utils";
import { getLetterById } from "@canny_ecosystem/supabase/queries";
import { updateLetterById } from "@canny_ecosystem/supabase/mutations";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import CreateLetter from "@/routes/_protected+/modules+/letters+/create-letter";

export const UPDATE_LETTER_TAG = "update-letter";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const letterId = params.letterId;

  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);
  if (
    !hasPermission(user?.role!, `${updateRole}:${attribute.letters}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }
  try {
    let letterData = null;
    let letterError = null;

    if (letterId) {
      ({ data: letterData, error: letterError } = await getLetterById({
        supabase,
        letterId,
      }));
    }

    if (letterError) throw letterError;

    return json({
      letterData,
      letterId,
      error: null,
    });
  } catch (error) {
    return json(
      {
        error,
        letterId,
        letterData: null,
        employeeSalaryData: null,
      },
      { status: 500 },
    );
  }
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const submission = parseWithZod(formData, { schema: LetterSchema });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }
    const { status, error } = await updateLetterById({
      supabase,
      data: {
        ...submission.value,
      },
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Letter updated",
        error: null,
      });

    return json(
      {
        status: "error",
        message: "Letter update failed",
        error,
      },
      { status: 500 },
    );
  } catch (error) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
      },
      { status: 500 },
    );
  }
}

export default function updateLetter() {
  const { letterData, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (error)
      toast({
        title: "Error",
        description: (error as Error)?.message || "Letter load failed",
        variant: "destructive",
      });
    if (!actionData) return;
    if (actionData?.status === "success") {
      clearExactCacheEntry(`${cacheKeyPrefix.letters}`);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate("/modules/letters", {
        replace: true,
      });
    } else {
      toast({
        title: "Error",
        description:
          actionData?.error?.message ??
          actionData?.error ??
          "Letter update failed",
        variant: "destructive",
      });
    }
  }, [actionData]);

  return <CreateLetter updateValues={letterData} />;
}
