import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { parseWithZod } from "@conform-to/zod";
import { isGoodStatus, CompanyEsicDetailsSchema } from "@canny_ecosystem/utils";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { useEffect } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";

import { getCompanyEsicDetailById } from "@canny_ecosystem/supabase/queries";
import { updateCompanyEsicDetailById } from "@canny_ecosystem/supabase/mutations";
import CreateEsicConfig from "@/routes/_protected+/modules+/esic-config+/create-esic-config";

export const UPDATE_ESIC_CONFIG_TAG = "update-esic-config";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const esicId = params.esicId;
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!user) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  try {
    if (esicId) {
      const { data, error } = await getCompanyEsicDetailById({
        supabase,
        id: esicId,
      });

      if (error) throw error;

      return json({
        data,
        error: null,
      });
    }

    throw new Error("No identity key provided");
  } catch (error) {
    return json(
      {
        data: null,
        error,
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

    const submission = parseWithZod(formData, {
      schema: CompanyEsicDetailsSchema,
    });

    if (submission.status !== "success") {
      return json(
        { result: submission.reply() },
        { status: submission.status === "error" ? 400 : 200 },
      );
    }

    const { status, error } = await updateCompanyEsicDetailById({
      supabase,
      data: submission.value as any,
    });

    if (isGoodStatus(status))
      return json({
        status: "success",
        message: "ESIC Config updated successfully",
        error: null,
      });

    return json({
      status: "error",
      message: "Failed to update ESIC Config",
      error,
    });
  } catch (error) {
    return json(
      {
        status: "error",
        message: "Failed to update ESIC Config",
        error,
      },
      { status: 500 },
    );
  }
}

export default function UpdateEsicConfig() {
  const { data, error } = useLoaderData<typeof loader>();
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
          "ESIC Config update failed",
        variant: "destructive",
      });
    }

    navigate("/modules/esic-config", {
      replace: true,
    });
  }, [actionData]);

  if (error)
    return <ErrorBoundary error={error} message="Failed to load ESIC Config" />;

  return <CreateEsicConfig updateValues={data} />;
}
