import { safeRedirect } from "@/utils/server/http.server";

export async function loader() {
  return safeRedirect("/approvals/statutory/employee-provident-fund");
}
