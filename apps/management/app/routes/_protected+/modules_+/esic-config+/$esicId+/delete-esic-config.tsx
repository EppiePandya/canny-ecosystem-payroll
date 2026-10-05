import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { deleteCompanyEsicDetail } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { isGoodStatus } from "@canny_ecosystem/utils";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json, useActionData, useNavigate } from "@remix-run/react";
import { useEffect } from "react";

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const esicId = params.esicId;

  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!user) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  if (!esicId) {
    return json(
      {
        status: "error",
        message: "ESIC Config ID is required",
        error: "No ESIC Config ID provided",
        redirectUrl: "/modules/esic-config",
      },
      { status: 400 },
    );
  }

  try {
    const { error, status } = await deleteCompanyEsicDetail({
      supabase,
      id: esicId,
    });

    if (!isGoodStatus(status)) {
      return json(
        {
          status: "error",
          message: "Failed to delete ESIC Config",
          error,
          redirectUrl: "/modules/esic-config",
        },
        { status: 500 },
      );
    }

    return json({
      status: "success",
      message: "ESIC Config deleted successfully",
      error: null,
      redirectUrl: "/modules/esic-config",
    });
  } catch (error) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
        redirectUrl: "/modules/esic-config",
      },
      { status: 500 },
    );
  }
}

export default function DeleteEsicConfig() {
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.esic_config);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
    } else {
      toast({
        title: "Error",
        description:
          actionData?.error?.message ||
          actionData?.error ||
          "ESIC Config deletion failed",
        variant: "destructive",
      });
    }

    navigate(actionData?.redirectUrl ?? "/modules/esic-config", {
      replace: true,
    });
  }, [actionData]);

  return null;
}
