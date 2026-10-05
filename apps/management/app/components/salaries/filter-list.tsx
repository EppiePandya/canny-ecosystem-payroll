import { Badge } from "@canny_ecosystem/ui/badge";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useSearchParams } from "@remix-run/react";
import { replaceUnderscore } from "@canny_ecosystem/utils";

export function FilterList({ filterList }: { filterList: any }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const removeFilter = (key: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete(key);
    setSearchParams(newParams);
  };

  const activeFilters = Object.entries(filterList).filter(
    ([_, value]) => value && String(value).length > 0,
  );

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {activeFilters.map(([key, value]) => (
        <Badge
          key={key}
          variant="secondary"
          className="flex items-center gap-1 py-1 px-2 h-7"
        >
          <span className="opacity-60 capitalize">
            {replaceUnderscore(key)}:
          </span>
          <span>{String(value)}</span>
          <button
            type="button"
            onClick={() => removeFilter(key)}
            className="ml-1 hover:text-destructive transition-colors"
          >
            <Icon name="cross" className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={() => {
          const newParams = new URLSearchParams(searchParams);
          for (const [key] of activeFilters) {
            newParams.delete(key);
          }
          setSearchParams(newParams);
        }}
        className="text-xs text-muted-foreground hover:text-primary transition-colors ml-1"
      >
        Clear all
      </button>
    </div>
  );
}
