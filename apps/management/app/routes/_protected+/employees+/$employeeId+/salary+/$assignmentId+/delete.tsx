import { deleteEmployeeSalaryAssignment } from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { isGoodStatus } from "@canny_ecosystem/utils";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { cacheKeyPrefix } from "@/constant";
import { clearExactCacheEntry } from "@/utils/cache";
import { useActionData, useNavigate, useParams } from "@remix-run/react";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export async function loader() {
  return json({ ok: true });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const assignmentId = params.assignmentId as string;

  const { status, error } = await deleteEmployeeSalaryAssignment({
    supabase: supabase as any,
    id: assignmentId,
  });

  if (isGoodStatus(status)) {
    return json({
      status: "success",
      message: "Salary record deleted successfully.",
    });
  }

  return json({
    status: "error",
    message: "Failed to delete salary record.",
    error,
  });
}

export default function DeleteSalaryRecord() {
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { employeeId } = useParams();

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearExactCacheEntry(`${cacheKeyPrefix.employee_salary}${employeeId}`);
        toast({
          title: "Success",
          description: actionData.message,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: actionData?.message || "Failed to delete",
          variant: "destructive",
        });
      }
      navigate(`/employees/${employeeId}/salary`);
    }
  }, [actionData, employeeId, navigate, toast]);

  return <div className="p-4 text-center">Processing deletion...</div>;
}
