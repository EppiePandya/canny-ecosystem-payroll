import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  formatDate,
  formatDateRange,
  replaceUnderscore,
} from "@canny_ecosystem/utils";
import { useSearchParams } from "@remix-run/react";
import type { MailFilters } from "./mail-search-filter";

export type MailFilterListType = MailFilters & {
  name?: string | null;
};

type Props = {
  filterList: MailFilterListType | null;
};

export function MailFilterList({ filterList }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const renderFilter = ({ key, value }: { key: string; value: string }) => {
    if (!value) return null;

    switch (key) {
      case "name":
        return `Search: ${value}`;

      case "category":
        return replaceUnderscore(value);

      case "status":
        return value === "unread" ? "Unread Only" : "Read Only";

      case "attachment":
        return value === "true" ? "With Attachments" : "Without Attachments";

      case "starred":
        return "Starred Only";

      case "date_start": {
        if (value && filterList?.date_end) {
          return formatDateRange(
            new Date(value),
            new Date(filterList.date_end),
            {
              includeTime: false,
            },
          );
        }
        return value && formatDate(new Date(value));
      }

      case "date_end":
        return !filterList?.date_start && value && formatDate(new Date(value));

      default:
        return null;
    }
  };

  const handleOnRemove = (key: string) => {
    const updated = new URLSearchParams(searchParams);
    if (key === "date_start" && filterList?.date_end) {
      updated.delete("date_end");
    }
    updated.delete(key);
    if (key === "name") {
      updated.delete("search");
      updated.delete("q");
    }
    setSearchParams(updated);
  };

  if (!filterList) return null;

  const validEntries = Object.entries(filterList).filter(
    ([key, value]) =>
      value !== null &&
      value !== undefined &&
      String(value).trim().length > 0 &&
      !(key === "category" && value === "all"),
  );

  if (validEntries.length === 0) return null;

  return (
    <ul className="flex items-center space-x-2 w-full overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
      {validEntries.map(([key, value]) => {
        const renderValue = renderFilter({
          key,
          value: value ?? "",
        });
        if (!renderValue) return null;

        return (
          <li key={key} className={cn(!renderValue && "hidden", "shrink-0")}>
            <Button
              className="rounded-full h-9 px-3 bg-secondary hover:bg-secondary font-normal text-[#878787] flex space-x-1 items-center group transition-colors shadow-none"
              onClick={() => handleOnRemove(key)}
            >
              <Icon
                name="cross"
                className="scale-0 group-hover:scale-100 transition-all w-0 group-hover:w-4"
              />
              <span className="capitalize text-xs">{renderValue}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
