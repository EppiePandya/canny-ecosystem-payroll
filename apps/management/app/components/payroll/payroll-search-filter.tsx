import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { formatISO } from "date-fns";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  type SubmitOptions,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "@remix-run/react";
import { Calendar } from "@canny_ecosystem/ui/calendar";
import {
  defaultYear,
  getYears,
  payrollPaymentStatusArray,
} from "@canny_ecosystem/utils";
import { useTypingAnimation } from "@canny_ecosystem/utils/hooks/typing-animation";
import { useDebounce } from "@canny_ecosystem/utils/hooks/debounce";
import { months } from "@canny_ecosystem/utils/constant";

export const PLACEHOLDERS = [
  "Approved payrolls between Jan and May 2024",
  "Salary type payrolls created before 2020",
  "Payrolls with pending status",
  "Payroll records from Project 'XYZ' created in 2023",
  "Payrolls generated between 2018 and 2020",
  "Pending payrolls for employees from Site 'ABC'",
  "Payrolls created before 2015 still pending",
  "Payrolls submitted of month January",
  "Payroll records for Site 'ABC' during 2021",
  "All payrolls from Site 'ABC' with 'Part-time' type",
  "Approved payrolls for year 2023",
  "Payrolls with pending payment for Site 'XYZ'",
];

export function PayrollSearchFilter({
  disabled,
  from,
}: {
  disabled?: boolean;
  from: "run-payroll" | "payroll-history";
}) {
  const [prompt, setPrompt] = useState("");
  const navigation = useNavigation();
  const [isFocused, setIsFocused] = useState(false);
  const animatedPlaceholder = useTypingAnimation(PLACEHOLDERS, isFocused, {
    typingSpeed: 40,
    pauseDuration: 4000,
  });
  const isSubmitting =
    navigation.state === "submitting" ||
    (navigation.state === "loading" &&
      (navigation.location.pathname === "/payroll/run-payroll" ||
        navigation.location.pathname === "/payroll/payroll-history") &&
      navigation.location.search.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  // Read filter values directly from URL — no local state mirror needed
  const filters = {
    date_start: searchParams.get("date_start") || "",
    date_end: searchParams.get("date_end") || "",
    status: searchParams.get("status") || "",
    month: searchParams.get("month") || "",
    year: searchParams.get("year") || "",
  };

  const submit = useSubmit();
  const debounceSubmit = useDebounce((target: any, options?: SubmitOptions) => {
    submit(target, options);
  }, 300);

  // Write a single param to the URL
  const updateSearchParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams, { preventScrollReset: true });
  };

  // Write multiple params atomically to the URL
  const updateSearchParams = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    }
    setSearchParams(newParams, { preventScrollReset: true });
  };

  const filterKeys = ["date_start", "date_end", "status", "month", "year"];

  const deleteAllSearchParams = () => {
    const newParams = new URLSearchParams(searchParams);
    for (const key of filterKeys) {
      newParams.delete(key);
    }
    newParams.delete("name");
    setSearchParams(newParams, { preventScrollReset: true });
  };

  useHotkeys(
    "esc",
    () => {
      setPrompt("");
      deleteAllSearchParams();
      setIsOpen(false);
    },
    {
      enableOnFormTags: true,
    },
  );

  useHotkeys(["meta+s", "ctrl+s"], (evt) => {
    if (!disabled) {
      evt.preventDefault();
      inputRef.current?.focus();
    }
  });

  useHotkeys(["meta+f", "ctrl+f"], (evt) => {
    if (!disabled) {
      evt.preventDefault();
      setIsOpen((prev) => !prev);
    }
  });

  const handleSearch = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const value = evt.target.value;
    if (value) {
      setPrompt(value);
    } else {
      deleteAllSearchParams();
      setPrompt("");
    }
  };

  const handleSubmit = () => {
    if (prompt.split(" ").length > 1) {
      debounceSubmit(
        { prompt: prompt },
        {
          action:
            from === "payroll-history"
              ? "/payroll/payroll-history?index"
              : "/payroll/run-payroll?index",
          method: "POST",
        },
      );
    } else {
      if (prompt.length) {
        updateSearchParam("name", prompt);
      }
    }
  };

  const hasValidFilters =
    Object.entries(filters).filter(
      ([key, value]) => value?.length && key !== "name",
    ).length > 0;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex space-x-4 w-full md:w-auto items-center">
        <form
          className="relative w-full md:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Icon
            name={isSubmitting ? "update" : "search"}
            className={cn(
              "absolute pointer-events-none left-3 top-[12.5px]",
              isSubmitting && "animate-spin",
            )}
          />
          <Input
            tabIndex={-1}
            ref={inputRef}
            disabled={disabled}
            className="pl-9 w-full h-10 md:w-[480px] pr-8 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70"
            value={prompt}
            onChange={handleSearch}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoComplete="on"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            placeholder={
              disabled ? "No Payroll to Search And Filter" : animatedPlaceholder
            }
          />

          <DropdownMenuTrigger disabled={disabled} asChild>
            <button
              onClick={() => setIsOpen((prev) => !prev)}
              type="button"
              disabled={disabled}
              className={cn(
                "absolute z-10 right-3 top-[6px] opacity-70",
                !disabled &&
                  "transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100",
                hasValidFilters && "opacity-100",
                isOpen && "opacity-100",
              )}
            >
              <Icon name="mixer" />
            </button>
          </DropdownMenuTrigger>
        </form>
      </div>

      <DropdownMenuContent
        className="w-full md:w-[480px]"
        align="end"
        sideOffset={19}
        alignOffset={-11}
      >
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Date</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                <Calendar
                  mode="range"
                  captionLayout="dropdown"
                  today={
                    filters.date_start
                      ? new Date(filters.date_start)
                      : new Date()
                  }
                  hidden={{ after: new Date() }}
                  selected={{
                    from: filters.date_start
                      ? new Date(filters.date_start)
                      : undefined,
                    to: filters.date_end
                      ? new Date(filters.date_end)
                      : undefined,
                  }}
                  onSelect={(range) => {
                    if (!range) return;
                    let newRange: Record<string, string> = {};

                    if (range.from === range.to) {
                      newRange = {
                        date_start: range.from
                          ? formatISO(range.from, { representation: "date" })
                          : filters.date_start,
                      };
                    } else {
                      newRange = {
                        date_start: range.from
                          ? formatISO(range.from, { representation: "date" })
                          : filters.date_start,
                        date_end: range.to
                          ? formatISO(range.to, { representation: "date" })
                          : "",
                      };
                    }

                    updateSearchParams(newRange);
                  }}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Status</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {payrollPaymentStatusArray?.map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filters?.status === name}
                    onCheckedChange={() => {
                      updateSearchParam(
                        "status",
                        filters.status === name ? "" : name,
                      );
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Year</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {getYears(25, defaultYear).map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filters?.year === name.toString()}
                    onCheckedChange={() => {
                      updateSearchParam(
                        "year",
                        filters.year === name.toString() ? "" : name.toString(),
                      );
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Month</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {Object.keys(months).map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filters?.month === name.toString()}
                    onCheckedChange={() => {
                      updateSearchParam(
                        "month",
                        filters.month === name.toString()
                          ? ""
                          : name.toString(),
                      );
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
