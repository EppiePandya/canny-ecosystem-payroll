import type { EmployeeAdvanceFilters } from "@canny_ecosystem/supabase/queries";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  formatDate,
  formatDateRange,
  replaceUnderscore,
} from "@canny_ecosystem/utils";
import { useSearchParams } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";

type Props = {
  filters: EmployeeAdvanceFilters | undefined | null;
};

export function FilterList({ filters }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const renderFilter = ({
    key,
    value,
  }: {
    key: string;
    value: string | null | undefined;
  }) => {
    if (!value) return null;

    switch (key) {
      case "advance_date_start":
        if (filters?.advance_date_end) {
          return formatDateRange(
            new Date(value),
            new Date(filters.advance_date_end),
            { includeTime: false },
          );
        }
        return formatDate(new Date(value));

      case "start_month":
        return `Start Month & Year: ${replaceUnderscore(value)}${filters?.start_year ? ` ${filters.start_year}` : ""}`;
      case "end_month":
        return `End Month & Year: ${replaceUnderscore(value)}${filters?.end_year ? ` ${filters.end_year}` : ""}`;

      case "name":
      case "project":
      case "site":
      case "year":
        return replaceUnderscore(value);
      case "is_paid":
        return value === "true" ? "Paid" : "Pending";
      case "in_reimbursement":
        return value === "true" ? "In Reimbursement" : "Not In Reimbursement";
      default:
        return null;
    }
  };

  const handleOnRemove = (key: string) => {
    const updatedSearchParams = new URLSearchParams(searchParams);

    if (key === "advance_date_start" && filters?.advance_date_end) {
      updatedSearchParams.delete("advance_date_end");
    }
    if (key === "start_month" && filters?.start_year) {
      updatedSearchParams.delete("start_year");
    }
    if (key === "end_month" && filters?.end_year) {
      updatedSearchParams.delete("end_year");
    }

    updatedSearchParams.delete(key);
    setSearchParams(updatedSearchParams);
  };

  return (
    <ul className="flex flex-0 space-x-2 w-full overflow-scroll no-scrollbar">
      {filters &&
        Object.entries(filters)
          .filter(
            ([key, value]) =>
              value != null &&
              key !== "advance_date_end" &&
              key !== "start_year" &&
              key !== "end_year",
          )
          .map(([key, value]) => (
            <li key={key}>
              <Button
                className="rounded-full h-9 px-3 bg-secondary hover:bg-secondary font-normal text-[#878787] flex space-x-1 items-center group"
                onClick={() => handleOnRemove(key)}
                aria-label={`Remove filter for ${key}`}
              >
                <Icon
                  name="cross"
                  className="scale-0 group-hover:scale-100 transition-all w-0 group-hover:w-4"
                />
                <span className="capitalize">
                  {renderFilter({ key, value: value ?? "" })}
                </span>
              </Button>
            </li>
          ))}
    </ul>
  );
}
