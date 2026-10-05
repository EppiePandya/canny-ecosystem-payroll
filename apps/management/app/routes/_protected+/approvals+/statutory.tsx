import { FooterTabs } from "@/components/footer-tabs";
import { approvalStatutorySideNavList } from "@/constant";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { SecondarySidebar } from "@canny_ecosystem/ui/secondary-sidebar";
import { hasPermission, readRole } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLocation } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${readRole}:${attribute.approvals}`)) {
    return safeRedirect("/approvals/reimbursements", { headers });
  }
  return {};
}

export default function ApprovalsStatutory() {
  const { pathname } = useLocation();

  const items = approvalStatutorySideNavList.map((item) => ({
    label: item.name,
    path: item.link,
  }));

  return (
    <div className="flex w-full flex-1 overflow-hidden">
      <div className="hidden md:flex">
        <SecondarySidebar
          items={approvalStatutorySideNavList}
          className="flex-shrink-0"
        />
      </div>
      <FooterTabs items={items} pathname={pathname} Link={Link} />
      <div className="flex flex-col flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
