import { Link, Outlet, useLocation, useParams } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { SecondaryMenu } from "@canny_ecosystem/ui/secondary-menu";
import { FooterTabs } from "@/components/footer-tabs";

export default function VehicleLayout() {
  const { vehicleId } = useParams();
  const { pathname } = useLocation();

  const items = [
    { label: "Overview", path: `/vehicles/vehicle/${vehicleId}/overview` },
    { label: "Reimbursement", path: `/vehicles/vehicle/${vehicleId}/reimbursements` },
  ];

  return (
    <section className="flex flex-col h-full w-full">
      <div className="flex items-center gap-4 py-2.5 px-4 border-b">
        <div className="hidden md:flex md:items-center md:gap-4 w-full">
          <Link
            prefetch="intent"
            to="/vehicles/vehicle"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "bg-card w-9 h-9 px-0 rounded-full",
            )}
          >
            <Icon name="chevron-left" size="sm" />
          </Link>
          <SecondaryMenu items={items} pathname={pathname} Link={Link} />
        </div>
        <FooterTabs items={items} pathname={pathname} Link={Link} />
      </div>
      <div className="px-4 py-4 flex-1">
        <Outlet />
      </div>
    </section>
  );
}
