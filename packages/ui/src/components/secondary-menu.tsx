import { cn } from "@/utils";

export function SecondaryMenu({
  items,
  pathname,
  Link,
  className,
}: {
  items: { path?: string; label?: string }[];
  pathname: string;
  Link: React.ElementType;
  className?: string;
}) {
  const activeItem = [...(items || [])]
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))
    .find(
      (item) =>
        item.path &&
        (pathname === item.path || pathname.startsWith(item.path + "/")),
    );

  return (
    <nav className={cn(className)}>
      <ul className="flex space-x-6 text-sm overflow-auto no-scrollbar">
        {items?.map((item) => {
          const isActive = activeItem?.path === item.path;
          return item?.label && item?.path ? (
            <Link
              prefetch="intent"
              key={item?.path}
              to={item?.path}
              className={cn(
                "text-muted-foreground font-medium underline-offset-4",
                "hover:underline focus:underline focus:outline-none",
                isActive &&
                  "text-primary no-underline hover:no-underline focus:no-underline cursor-default",
              )}
            >
              <span className="capitalize">{item?.label}</span>
            </Link>
          ) : null;
        })}
      </ul>
    </nav>
  );
}
