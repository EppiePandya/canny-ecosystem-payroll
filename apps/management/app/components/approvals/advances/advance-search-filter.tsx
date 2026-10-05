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
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  type SubmitOptions,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "@remix-run/react";
import { Calendar } from "@canny_ecosystem/ui/calendar";
import { booleanArray, defaultYear, getYears } from "@canny_ecosystem/utils";

import type { EmployeeAdvanceFilters } from "@canny_ecosystem/supabase/queries";
import { useDebounce } from "@canny_ecosystem/utils/hooks/debounce";
import { useTypingAnimation } from "@canny_ecosystem/utils/hooks/typing-animation";
import { months } from "@canny_ecosystem/utils/constant";

export const PLACEHOLDERS = [
  "Check 'Personal Advance' for John Doe",
  "Search 'Home Advance' or EMP2045",
  "Advances taken after Jan 2022 for Project 'ABC'",
  "Pending advances for Site 'ABC' under Project 'XYZ'",
  "Advances for Site 'ABC' not linked to Reimbursement",
];

export function AdvanceSearchFilter({
  disabled,
  projectArray,
  siteArray,
}: {
  disabled?: boolean;
  projectArray?: string[];
  siteArray?: string[];
}) {
  const [prompt, setPrompt] = useState("");
  const navigation = useNavigation();
  const submit = useSubmit();
  const [isFocused, setIsFocused] = useState(false);

  const debounceSubmit = useDebounce((target: any, options?: SubmitOptions) => {
    submit(target, options);
  }, 300);

  const animatedPlaceholder = useTypingAnimation(PLACEHOLDERS, isFocused, {
    typingSpeed: 40,
    pauseDuration: 4000,
  });

  const isSubmitting =
    navigation.state === "submitting" ||
    (navigation.state === "loading" &&
      navigation.location.pathname === "/approvals/advances" &&
      navigation.location.search.length);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilterParams: EmployeeAdvanceFilters = {
    advance_date_start: "",
    advance_date_end: "",
    is_paid: "",
    name: "",
    project: "",
    site: "",
    in_reimbursement: "",
    start_month: "",
    start_year: "",
    end_month: "",
    end_year: "",
    year: "",
  };

  const [filterParams, setFilterParams] = useState(initialFilterParams);

  const deleteAllSearchParams = () => {
    for (const [key, _val] of Object.entries(filterParams)) {
      searchParams.delete(key);
    }
    setSearchParams(searchParams);
  };

  useEffect(() => {
    const updatedParams = new URLSearchParams(searchParams);
    let changed = false;

    for (const [key, value] of Object.entries(filterParams)) {
      if (value !== null && value !== undefined && String(value)?.length) {
        if (updatedParams.get(key) !== String(value)) {
          updatedParams.set(key, String(value));
          changed = true;
        }
      } else {
        if (updatedParams.has(key)) {
          updatedParams.delete(key);
          changed = true;
        }
      }
    }

    if (changed) {
      setSearchParams(updatedParams);
    }
  }, [filterParams]);

  const searchParamsList: EmployeeAdvanceFilters = {
    advance_date_start: searchParams.get("advance_date_start"),
    advance_date_end: searchParams.get("advance_date_end"),
    is_paid: searchParams.get("is_paid"),
    name: searchParams.get("name"),
    project: searchParams.get("project"),
    site: searchParams.get("site"),
    in_reimbursement: searchParams.get("in_reimbursement"),
    start_month: searchParams.get("start_month"),
    start_year: searchParams.get("start_year"),
    end_month: searchParams.get("end_month"),
    end_year: searchParams.get("end_year"),
    year: searchParams.get("year"),
  };

  useEffect(() => {
    const nameParam = searchParams.get("name");
    if (nameParam !== null && nameParam !== prompt) {
      setPrompt(nameParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const newFilters: Partial<EmployeeAdvanceFilters> = {};
    let changed = false;

    for (const [key, value] of Object.entries(searchParamsList)) {
      const currentValue = filterParams[key as keyof EmployeeAdvanceFilters];
      const newValue = value || "";
      if (currentValue !== newValue) {
        newFilters[key as keyof EmployeeAdvanceFilters] = newValue;
        changed = true;
      }
    }

    if (changed) {
      setFilterParams((prev) => ({ ...prev, ...newFilters }));
    }
  }, [searchParams]);

  useHotkeys(
    "esc",
    () => {
      setPrompt("");
      deleteAllSearchParams();
      setFilterParams(initialFilterParams);
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
      setFilterParams(initialFilterParams);
      setPrompt("");
    }
  };

  const handleSubmit = () => {
    if (prompt.split(" ").length > 1) {
      debounceSubmit(
        { prompt: prompt },
        {
          action: "/approvals/advances?index",
          method: "POST",
        },
      );
    } else {
      setFilterParams((prev) => ({ ...prev, name: prompt }));
    }
  };

  const hasValidFilters =
    Object.entries(filterParams).filter(
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
            placeholder={
              disabled
                ? "No Advance Data to Search And Filter"
                : "Search by Name, Code or Advance Name..."
            }
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
              <span>Advance Date</span>
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
                    filterParams.advance_date_start
                      ? new Date(filterParams.advance_date_start)
                      : new Date()
                  }
                  hidden={{ after: new Date() }}
                  selected={{
                    from: filterParams.advance_date_start
                      ? new Date(filterParams.advance_date_start)
                      : undefined,
                    to: filterParams.advance_date_end
                      ? new Date(filterParams.advance_date_end)
                      : undefined,
                  }}
                  onSelect={(range) => {
                    if (!range) return;
                    let newRange: Partial<EmployeeAdvanceFilters> = {};

                    if (range.from === range.to) {
                      newRange = {
                        advance_date_start: range.from
                          ? formatISO(range.from, { representation: "date" })
                          : String(filterParams.advance_date_start),
                      };
                    } else {
                      newRange = {
                        advance_date_start: range.from
                          ? formatISO(range.from, { representation: "date" })
                          : String(filterParams.advance_date_start),
                        advance_date_end: range.to
                          ? formatISO(range.to, { representation: "date" })
                          : "",
                      };
                    }

                    setFilterParams((prev) => ({ ...prev, ...newRange }));
                  }}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Is Paid</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {booleanArray.map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filterParams?.is_paid === name}
                    onCheckedChange={() => {
                      setFilterParams((prev) => ({
                        ...prev,
                        is_paid: name,
                      }));
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup className={cn(!projectArray?.length && "hidden")}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Project</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {projectArray?.map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filterParams?.project === name}
                    onCheckedChange={() => {
                      setFilterParams((prev) => ({
                        ...prev,
                        project: name,
                      }));
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup className={cn(!projectArray?.length && "hidden")}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Site</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {siteArray?.map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filterParams?.site === name}
                    onCheckedChange={() => {
                      setFilterParams((prev) => ({
                        ...prev,
                        site: name,
                      }));
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
              <span>Is In Reimbursement</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {booleanArray.map((name, index) => (
                  <DropdownMenuCheckboxItem
                    key={name + index.toString()}
                    className="capitalize"
                    checked={filterParams?.in_reimbursement === name}
                    onCheckedChange={() => {
                      setFilterParams((prev) => ({
                        ...prev,
                        in_reimbursement: name,
                      }));
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
              <span>Start Month and Year</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-2 flex gap-4 max-h-[300px] overflow-y-auto"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-muted-foreground mb-1 px-2">
                    Month
                  </span>
                  {Object.keys(months).map((name, index) => (
                    <DropdownMenuCheckboxItem
                      key={`start-${name}-${index}`}
                      className="capitalize"
                      checked={filterParams?.start_month === name.toString()}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => {
                        setFilterParams((prev) => ({
                          ...prev,
                          start_month: name.toString(),
                        }));
                      }}
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
                <div className="flex flex-col border-l pl-4">
                  <span className="text-xs font-semibold text-muted-foreground mb-1 px-2">
                    Year
                  </span>
                  {getYears(25, defaultYear).map((name, index) => (
                    <DropdownMenuCheckboxItem
                      key={`start-year-${name}-${index}`}
                      className="capitalize"
                      checked={filterParams?.start_year === name.toString()}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => {
                        setFilterParams((prev) => ({
                          ...prev,
                          start_year: name.toString(),
                        }));
                      }}
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>End Month and Year</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-2 flex gap-4 max-h-[300px] overflow-y-auto"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-muted-foreground mb-1 px-2">
                    Month
                  </span>
                  {Object.keys(months).map((name, index) => (
                    <DropdownMenuCheckboxItem
                      key={`end-${name}-${index}`}
                      className="capitalize"
                      checked={filterParams?.end_month === name.toString()}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => {
                        setFilterParams((prev) => ({
                          ...prev,
                          end_month: name.toString(),
                        }));
                      }}
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
                <div className="flex flex-col border-l pl-4">
                  <span className="text-xs font-semibold text-muted-foreground mb-1 px-2">
                    Year
                  </span>
                  {getYears(25, defaultYear).map((name, index) => (
                    <DropdownMenuCheckboxItem
                      key={`end-year-${name}-${index}`}
                      className="capitalize"
                      checked={filterParams?.end_year === name.toString()}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => {
                        setFilterParams((prev) => ({
                          ...prev,
                          end_year: name.toString(),
                        }));
                      }}
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
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
                    checked={filterParams?.year === name.toString()}
                    onCheckedChange={() => {
                      setFilterParams((prev) => ({
                        ...prev,
                        year: name.toString(),
                      }));
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
