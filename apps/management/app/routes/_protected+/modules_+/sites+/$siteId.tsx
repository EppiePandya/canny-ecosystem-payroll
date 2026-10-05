import { Link, Outlet, useLocation } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { SecondaryMenu } from "@canny_ecosystem/ui/secondary-menu";

export default function SiteTabsLayout() {
  const { pathname } = useLocation();

  return (
    <section className="flex flex-col h-full w-full">
      <div className="flex items-center gap-4 md:py-2.5 px-4 md:border-b">
        <div className="hidden md:flex md:items-center md:gap-4 w-full">
          <Link
            prefetch="intent"
            to="/modules/sites"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "bg-card w-9 h-9 px-0 rounded-full",
            )}
          >
            <Icon name="chevron-left" size="sm" />
          </Link>
          <SecondaryMenu
            items={[
              { label: "Overview", path: "" },
              { label: "Letters", path: "letters" },
            ]}
            pathname={pathname}
            Link={Link}
          />
        </div>
      </div>
      <div className="max-sm:pb-12">
        <Outlet />
      </div>
    </section>
  );
}
