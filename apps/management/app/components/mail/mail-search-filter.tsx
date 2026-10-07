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
import { useSearchParams } from "@remix-run/react";
import { Calendar } from "@canny_ecosystem/ui/calendar";
import { replaceUnderscore } from "@canny_ecosystem/utils";
import { useTypingAnimation } from "@canny_ecosystem/utils/hooks/typing-animation";

export type MailFilters = {
  category?: string | null;
  status?: string | null;
  attachment?: string | null;
  starred?: string | null;
  date_start?: string | null;
  date_end?: string | null;
};

export const MAIL_PLACEHOLDERS = [
  "Search emails by sender or subject...",
  "Attendance and leave update emails",
  "Reimbursement claim receipts and invoices",
  "Employee advance requests and claims",
  "New joinee onboarding documents",
  "Employee resignation or exit emails",
  "Emails with attachments (PDF, Excel, Images)",
  "Search unread messages in inbox",
  "Salary slip and payroll notifications",
];

export const MAIL_CATEGORIES = [
  { value: "all", label: "All Mails" },
  { value: "primary", label: "Primary" },
  { value: "attendance", label: "Attendance" },
  { value: "new_joinee", label: "New Joinee" },
  { value: "employee_left", label: "Employee Left" },
  { value: "advance", label: "Advance" },
  { value: "expenses", label: "Expenses" },
  { value: "updates", label: "Updates" },
  { value: "promotions", label: "Promotions" },
];

export function MailSearchFilter({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentQuery =
    searchParams.get("name") ||
    searchParams.get("search") ||
    searchParams.get("q") ||
    "";
  const [prompt, setPrompt] = useState(currentQuery);

  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const initialFilterParams: MailFilters = {
    category: "",
    status: "",
    attachment: "",
    starred: "",
    date_start: "",
    date_end: "",
  };

  const [filterParams, setFilterParams] = useState<MailFilters>(initialFilterParams);

  const animatedPlaceholder = useTypingAnimation(MAIL_PLACEHOLDERS, isFocused, {
    typingSpeed: 40,
    pauseDuration: 4000,
  });

  const deleteAllSearchParams = () => {
    const updated = new URLSearchParams(searchParams);
    for (const key of Object.keys(filterParams)) {
      updated.delete(key);
    }
    updated.delete("name");
    updated.delete("search");
    updated.delete("q");
    setSearchParams(updated);
  };

  // Sync state to URL searchParams when filter options change
  useEffect(() => {
    const updated = new URLSearchParams(searchParams);
    let changed = false;

    for (const [key, value] of Object.entries(filterParams)) {
      if (value !== null && value !== undefined && String(value).length) {
        if (updated.get(key) !== String(value)) {
          updated.set(key, String(value));
          changed = true;
        }
      } else {
        if (updated.has(key)) {
          updated.delete(key);
          changed = true;
        }
      }
    }

    if (changed) {
      setSearchParams(updated);
    }
  }, [filterParams]);

  // Sync URL searchParams to local filterParams and prompt
  useEffect(() => {
    const urlParams: MailFilters = {
      category: searchParams.get("category") || "",
      status: searchParams.get("status") || "",
      attachment: searchParams.get("attachment") || "",
      starred: searchParams.get("starred") || "",
      date_start: searchParams.get("date_start") || "",
      date_end: searchParams.get("date_end") || "",
    };

    setFilterParams((prev) => {
      let isSame = true;
      for (const [key, val] of Object.entries(urlParams)) {
        if ((prev as any)[key] !== val) {
          isSame = false;
          break;
        }
      }
      return isSame ? prev : urlParams;
    });

    const activeQuery =
      searchParams.get("name") ||
      searchParams.get("search") ||
      searchParams.get("q") ||
      "";
    setPrompt(activeQuery);
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

  const handleSearchChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const value = evt.target.value;
    setPrompt(value);
    if (!value) {
      const updated = new URLSearchParams(searchParams);
      updated.delete("name");
      updated.delete("search");
      updated.delete("q");
      setSearchParams(updated);
    }
  };

  const handleSubmit = () => {
    const updated = new URLSearchParams(searchParams);
    if (prompt.trim()) {
      updated.set("name", prompt.trim());
      updated.delete("search");
      updated.delete("q");
    } else {
      updated.delete("name");
      updated.delete("search");
      updated.delete("q");
    }
    setSearchParams(updated);
  };

  const hasValidFilters =
    Object.entries(filterParams).some(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        String(value).length > 0 &&
        key !== "name" &&
        !(key === "category" && value === "all"),
    ) || Boolean(currentQuery);

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
            name="search"
            className="absolute pointer-events-none left-3 top-[12.5px] opacity-60"
          />
          <Input
            tabIndex={-1}
            ref={inputRef}
            placeholder={
              disabled
                ? "No Email Data to Search And Filter"
                : animatedPlaceholder
            }
            disabled={disabled}
            className="pl-9 w-full h-10 md:w-[480px] pr-8 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70"
            value={prompt}
            onChange={handleSearchChange}
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
                hasValidFilters && "opacity-100 text-primary",
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
        align="start"
        sideOffset={19}
        alignOffset={-11}
      >
        {/* Category Filter */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Category</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                {MAIL_CATEGORIES.map((cat) => (
                  <DropdownMenuCheckboxItem
                    key={cat.value}
                    className="capitalize"
                    checked={
                      filterParams.category === cat.value ||
                      (!filterParams.category && cat.value === "all")
                    }
                    onCheckedChange={() => {
                      setFilterParams((prev) => ({
                        ...prev,
                        category: cat.value === "all" ? "all" : cat.value,
                      }));
                    }}
                  >
                    {cat.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Status Filter */}
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
                <DropdownMenuCheckboxItem
                  checked={!filterParams.status}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({ ...prev, status: "" }));
                  }}
                >
                  All Statuses
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterParams.status === "unread"}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({
                      ...prev,
                      status: prev.status === "unread" ? "" : "unread",
                    }));
                  }}
                >
                  Unread Only
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterParams.status === "read"}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({
                      ...prev,
                      status: prev.status === "read" ? "" : "read",
                    }));
                  }}
                >
                  Read Only
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Attachments Filter */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Attachments</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                <DropdownMenuCheckboxItem
                  checked={!filterParams.attachment}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({ ...prev, attachment: "" }));
                  }}
                >
                  All Mails
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterParams.attachment === "true"}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({
                      ...prev,
                      attachment: prev.attachment === "true" ? "" : "true",
                    }));
                  }}
                >
                  With Attachments
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterParams.attachment === "false"}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({
                      ...prev,
                      attachment: prev.attachment === "false" ? "" : "false",
                    }));
                  }}
                >
                  Without Attachments
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Starred Filter */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Starred</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                sideOffset={14}
                alignOffset={-4}
                className="p-0"
              >
                <DropdownMenuCheckboxItem
                  checked={!filterParams.starred}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({ ...prev, starred: "" }));
                  }}
                >
                  All Mails
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterParams.starred === "true"}
                  onCheckedChange={() => {
                    setFilterParams((prev) => ({
                      ...prev,
                      starred: prev.starred === "true" ? "" : "true",
                    }));
                  }}
                >
                  Starred Mails Only
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Date Filter */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Date Received</span>
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
                    filterParams.date_start
                      ? new Date(filterParams.date_start)
                      : new Date()
                  }
                  hidden={{ after: new Date() }}
                  selected={{
                    from: filterParams.date_start
                      ? new Date(filterParams.date_start)
                      : undefined,
                    to: filterParams.date_end
                      ? new Date(filterParams.date_end)
                      : undefined,
                  }}
                  onSelect={(range) => {
                    if (!range) return;
                    let newRange = {};

                    if (range.from === range.to) {
                      newRange = {
                        date_start: range.from
                          ? formatISO(range.from, { representation: "date" })
                          : String(filterParams.date_start),
                      };
                    } else {
                      newRange = {
                        date_start: range.from
                          ? formatISO(range.from, { representation: "date" })
                          : String(filterParams.date_start),
                        date_end: range.to
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
