import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { deleteRelationshipManpowerVersion } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  deleteRole,
  hasPermission,
  isGoodStatus,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json, useActionData, useNavigate, useParams } from "@remix-run/react";
import { useEffect } from "react";

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const versionId = params.versionId;

  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(
      user?.role!,
      `${deleteRole}:${attribute.settingRelationships}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  try {
    const { status, error } = await deleteRelationshipManpowerVersion({
      supabase: supabase as any,
      id: versionId ?? "",
    });

    if (isGoodStatus(status)) {
      return json({
        status: "success",
        message: "Manpower version deleted",
        error: null,
      });
    }

    return json(
      { status: "error", message: "Failed to delete manpower version", error },
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

export default function DeleteManpowerVersion() {
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { relationshipId } = useParams();

  useEffect(() => {
    if (!actionData) return;
    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.relationships);
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
          "Manpower version delete failed",
        variant: "destructive",
      });
    }
    navigate(`/settings/relationships?expanded=${relationshipId}`, {
      replace: true,
    });
  }, [actionData, navigate, relationshipId, toast]);

  return null;
}
