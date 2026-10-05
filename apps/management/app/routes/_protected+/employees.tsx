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
import {
  Outlet,
  useLocation,
  Link,
  useSearchParams,
  type ClientLoaderFunctionArgs,
} from "@remix-run/react";
import { useEffect, useRef } from "react";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);

  if (!hasPermission(user?.role!, `${readRole}:${attribute.employees}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }
  return {};
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.employees_main, args);
}

clientLoader.hydrate = true;

export default function People() {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "true";

  useEffect(() => {
    const wasInImport = prevPathRef.current.startsWith(
      "/employees/import-salaries",
    );
    const isInImport = pathname.startsWith("/employees/import-salaries");

    if (wasInImport && !isInImport) {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("salary_import_state");
      }
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (prevPathRef.current.startsWith("/employees/import-salaries")) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("salary_import_state");
        }
      }
    };
  }, []);

  const items = [
    {
      label: "Employees",
      path: "/employees",
    },
    {
      label: "Exits",
      path: "/employees/exits",
    },
    {
      label: "Payees",
      path: "/employees/payee",
    },
    {
      label: "Users",
      path: "/employees/users",
    },
  ];

  const pathSegments = pathname.split("/").filter(Boolean);
  const isEmployeeDetails =
    pathSegments[0] === "employees" &&
    pathSegments[1] &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      pathSegments[1],
    );

  return (
    <section className="flex flex-col h-full w-full">
      {!isEmployeeDetails && !isEmbedded && (
        <div className="flex items-center gap-4 md:py-2.5 px-4 md:border-b">
          <div className="hidden md:flex md:items-center md:gap-4 w-full">
            <SecondaryMenu
              items={items}
              pathname={pathname}
              Link={Link}
              className="py-2"
            />
          </div>
          <FooterTabs items={items} pathname={pathname} Link={Link} />
        </div>
      )}
      <div
        className={cn(
          "px-4 max-sm:px-2 w-full flex-1 min-h-0 flex flex-col",
          isEmbedded && "px-0 pb-0 pt-0",
        )}
      >
        <Outlet />
      </div>
    </section>
  );
}
