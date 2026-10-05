import { FooterTabs } from "@/components/footer-tabs";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clientCaching } from "@/utils/cache";
import { safeRedirect } from "@/utils/server/http.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { SecondaryMenu } from "@canny_ecosystem/ui/secondary-menu";
import { hasPermission, readRole } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  type ClientLoaderFunctionArgs,
  Link,
  Outlet,
  useLocation,
  useLoaderData,
} from "@remix-run/react";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getCompanyById } from "@canny_ecosystem/supabase/queries";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (!hasPermission(user?.role!, `${readRole}:${attribute.settings}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  let companyType = "";
  if (companyId) {
    const { data } = await getCompanyById({ supabase, id: companyId });
    companyType = data?.company_type || "";
  }

  return json({ companyType });
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.settings, args);
}

clientLoader.hydrate = true;

export default function Settings() {
  const { pathname } = useLocation();
  const { companyType } = useLoaderData<typeof loader>();

  const menuItems = [
    { label: "General", path: "/settings/general" },
    { label: "Locations", path: "/settings/locations" },
    { label: "Relationships", path: "/settings/relationships" },
    { label: "Documents", path: "/settings/documents" },
    { label: "Audit Logs", path: "/settings/audit-logs" },
  ];

  if (companyType === "sub_contractor") {
    menuItems.push({
      label: "Sub Contractor Config",
      path: "/settings/sub-contractor-config",
    });
  }

  return (
    <section className="flex flex-col h-full w-full">
      <div className="flex items-center gap-4 md:py-2.5 px-4 md:border-b">
        <div className="hidden md:flex md:items-center md:gap-4 w-full">
          <SecondaryMenu
            items={menuItems}
            pathname={pathname}
            Link={Link}
            className="py-2"
          />
        </div>

        <FooterTabs items={menuItems} pathname={pathname} Link={Link} />
      </div>
      <div className="px-4 max-sm:px-2 w-full flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>
    </section>
  );
}
