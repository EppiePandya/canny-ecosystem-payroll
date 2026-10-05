import {
  hasPermission,
  isGoodStatus,
  RelationshipManpowerVersionSchema,
  updateRole,
} from "@canny_ecosystem/utils";
import { parseWithZod } from "@conform-to/zod";
import {
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";

import { updateRelationshipManpowerVersion } from "@canny_ecosystem/supabase/mutations";
import { getRelationshipManpowerVersionById } from "@canny_ecosystem/supabase/queries";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { attribute } from "@canny_ecosystem/utils/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import {
  SUPABASE_BUCKET,
  SUPABASE_MEDIA_URL_PREFIX,
} from "@canny_ecosystem/utils/constant";
import CreateManpowerVersion from "./$relationshipId.create-manpower-version";

export async function loader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(
      user?.role!,
      `${updateRole}:${attribute.settingRelationships}`,
    )
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const relationshipId = params.relationshipId;
  const versionId = params.versionId;
  if (!relationshipId || !versionId) {
    return safeRedirect("/settings/relationships", { headers });
  }

  const { data: version, error } = await getRelationshipManpowerVersionById({
    supabase: supabase as any,
    id: versionId,
  });

  if (error || !version) {
    return safeRedirect(`/settings/relationships/${relationshipId}`, {
      headers,
    });
  }

  return json({
    status: "success",
    relationshipId,
    version,
  });
}

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const submission = parseWithZod(formData, {
      schema: RelationshipManpowerVersionSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    let filePathUrl = submission.value.agreement_upload as string | null;

    if (
      submission.value.agreement_upload &&
      typeof submission.value.agreement_upload === "object" &&
      "arrayBuffer" in submission.value.agreement_upload
    ) {
      const file = submission.value.agreement_upload as File;
      const buffer = await file.arrayBuffer();
      const fileData = new Uint8Array(buffer);
      const filePath = `relationships/${submission.value.relationship_id}/${file.name}`;

      const { data: fileRes, error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET.CANNY_ECOSYSTEM)
        .upload(filePath, fileData, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        return json({
          status: "error",
          message: "Failed to upload document",
          error: uploadError.message,
        });
      }

      filePathUrl = `${SUPABASE_MEDIA_URL_PREFIX}${fileRes.fullPath}`;
    }

    const { status, error } = await updateRelationshipManpowerVersion({
      supabase: supabase as any,
      data: {
        ...submission.value,
        id: params.versionId,
        agreement_upload: filePathUrl,
      } as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "Manpower version updated",
        error: null,
      });

    return json({
      status: "error",
      message: "Failed to update manpower version",
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

export default function UpdateManpowerVersion() {
  const { version, relationshipId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;

    if (actionData?.status === "success") {
      clearExactCacheEntry(cacheKeyPrefix.relationships);
      toast({
        title: "Success",
        description: actionData?.message,
        variant: "success",
      });
      navigate(`/settings/relationships?expanded=${relationshipId}`, {
        replace: true,
      });
    } else {
      toast({
        title: "Error",
        description:
          actionData?.error?.message ??
          actionData?.message ??
          "Manpower version update failed",
        variant: "destructive",
      });
    }
  }, [actionData]);

  return <CreateManpowerVersion updateValues={version} />;
}
