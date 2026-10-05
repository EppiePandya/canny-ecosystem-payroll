import { useMemo } from "react";
import { Link, useLocation } from "@remix-run/react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export function Breadcrumbs({
  className,
  labels = {},
  minSegments,
}: {
  className?: string;
  labels?: Record<string, string>;
  minSegments?: number;
}) {
  const location = useLocation();

  const isMinSegmentsReached = useMemo(() => {
    if (!minSegments) return true;
    const segments = location.pathname.split("/").filter(Boolean);
    return segments.length >= minSegments;
  }, [location.pathname, minSegments]);

  const pathnames = useMemo(() => {
    const rawPathnames = location.pathname
      .split("/")
      .filter((x) => x && !x.startsWith("_") && x !== "dashboard");

    const items = [];
    let currentPath = "";

    for (let i = 0; i < rawPathnames.length; i++) {
      const segment = rawPathnames[i];
      currentPath += `/${segment}`;

      const next = rawPathnames[i + 1]?.toLowerCase();
      const current = segment.toLowerCase();

      let skip = false;
      if (current === "overview" && i > 0) {
        const prev = rawPathnames[i - 1];
        const isPrevId =
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            prev,
          ) || /^[A-Z0-9]{6,10}$/.test(prev);
        if (isPrevId) skip = true;
      }

      if (current === "vehicles" && (next === "vehicle" || next === "usage"))
        skip = true;
      if (current === "settings" && next && !next.startsWith("_")) skip = true;
      if (
        current === "approvals" &&
        (next === "reimbursements" ||
          next === "payee" ||
          next === "loans" ||
          next === "exits")
      )
        skip = true;
      if (
        current === "time-tracking" &&
        (next === "attendance" || next === "leaves" || next === "holidays")
      )
        skip = true;
      if (
        current === "payroll" &&
        (next === "run-payroll" ||
          next === "payroll-history" ||
          next === "invoices")
      )
        skip = true;
      if (
        current === "payment-components" &&
        (next === "statutory-fields" ||
          next === "payment-fields" ||
          next === "payment-templates" ||
          next === "statutory")
      )
        skip = true;
      if (current === "statutory-fields" && next && !next.startsWith("_"))
        skip = true;
      if (current === "events" && (next === "incidents" || next === "cases"))
        skip = true;
      if (
        current === "modules" &&
        (next === "sites" ||
          next === "projects" ||
          next === "departments" ||
          next === "letters")
      )
        skip = true;

      if (!skip) {
        items.push({
          value: segment,
          to: currentPath,
        });
      }
    }

    return items;
  }, [location.pathname]);

  if (!isMinSegmentsReached || pathnames.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center text-sm font-medium tracking-tight",
        className,
      )}
    >
      <ol className="flex items-center flex-wrap gap-1 text-muted-foreground/50">
        <li className="flex items-center">
          <Link
            to="/dashboard"
            className="hover:text-primary transition-colors hover:bg-accent/40 px-1 py-0.5 rounded-md"
          >
            Home
          </Link>
        </li>
        {pathnames.map(({ value, to }, index) => {
          const last = index === pathnames.length - 1;

          const isId =
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
              value,
            ) || /^[A-Z0-9]{6,10}$/.test(value);

          let label = value
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

          if (isId) {
            label = labels[value] || "Profile";
          }

          if (value.toLowerCase() === "statutory-fields") {
            label = "Statutory Fields";
          }

          return (
            <li key={to} className="flex items-center gap-1">
              <Icon
                name="chevron-right"
                className="w-3 h-3 text-muted-foreground/30 flex-shrink-0"
              />
              {last ? (
                <span className="text-foreground font-semibold px-1 py-0.5">
                  {label}
                </span>
              ) : (
                <Link
                  to={to}
                  className="hover:text-primary transition-all hover:bg-accent/40 px-1 py-0.5 rounded-md"
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
