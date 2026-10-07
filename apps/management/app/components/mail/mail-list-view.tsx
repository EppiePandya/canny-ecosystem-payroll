import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@canny_ecosystem/ui/pagination";
import { MailSearchFilter } from "./mail-search-filter";
import { MailFilterList, type MailFilterListType } from "./mail-filter-list";
import {
  formatDate,
  getReimbursementCategory,
  getCompanyForEmail,
  getEmailCategory,
} from "./mail-helpers";
import type { InboxEmail } from "@/utils/server/imap.server";

interface MailListViewProps {
  inboxEmails: InboxEmail[];
  hasFilters: boolean;
  filterList: MailFilterListType;
  inboxError?: string | null;
  senderEmail: string;
  paginatedInboxEmails: InboxEmail[];
  selectedEmailIds: string[];
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<string[]>>;
  allCurrentPageSelected: boolean;
  handleToggleSelectAll: () => void;
  allVisibleStarred: boolean;
  someVisibleStarred: boolean;
  handleToggleStarAll: (e: React.MouseEvent) => void;
  sortField: "date" | "sender" | "subject";
  sortOrder: "asc" | "desc";
  handleSort: (field: "date" | "sender" | "subject") => void;
  starredIds: Record<string, boolean>;
  toggleStar: (id: string, e: React.MouseEvent) => void;
  handleSelectEmail: (email: InboxEmail) => void;
  allUsers: any[];
  allEmployees: any[];
  companies: any[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  limitParam: number;
  searchParams: URLSearchParams;
  setSearchParams: (
    params: URLSearchParams,
    options?: { preventScrollReset?: boolean }
  ) => void;
}

export function MailListView({
  inboxEmails,
  hasFilters,
  filterList,
  inboxError,
  senderEmail,
  paginatedInboxEmails,
  selectedEmailIds,
  setSelectedEmailIds,
  allCurrentPageSelected,
  handleToggleSelectAll,
  allVisibleStarred,
  someVisibleStarred,
  handleToggleStarAll,
  sortField,
  sortOrder,
  handleSort,
  starredIds,
  toggleStar,
  handleSelectEmail,
  allUsers,
  allEmployees,
  companies,
  totalCount,
  currentPage,
  totalPages,
  pageSize,
  limitParam,
  searchParams,
  setSearchParams,
}: MailListViewProps) {
  return (
    <div className="w-full flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
      {/* Search & Inbox Filters Bar like in /employees - PINNED (Does not scroll) */}
      <div className="w-full flex flex-row max-sm:flex-col max-sm:gap-y-3 items-center max-sm:items-start max-md:items-start justify-between pb-1 gap-2 shrink-0">
        <div className="flex w-full lg:w-4/5 flex-col md:flex-row items-start md:items-center gap-2 mr-4 min-w-0 flex-1">
          <MailSearchFilter disabled={inboxEmails.length === 0 && !hasFilters} />
          <MailFilterList filterList={filterList} />
        </div>
      </div>

      {inboxError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="cross" className="h-4 w-4" />
            <span>IMAP Sync Warning: {inboxError}</span>
          </div>
        </div>
      )}

      {/* Gmail-Style Email List Table */}
      <div className="flex-1 min-h-0 rounded-xl border bg-card overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1 min-h-0 flex flex-col">
          <div className="min-w-[640px] flex-1 min-h-0 flex flex-col">
            {/* Data Table Header - PINNED at top of table, text-sm font-semibold */}
            <div className="shrink-0 flex items-center px-4 py-3 bg-card border-b border-border text-sm font-semibold text-muted-foreground select-none border-l-[3px] border-l-transparent">
              {/* Select All Checkbox & Star */}
              <div className="flex items-center gap-3 pr-3 flex-shrink-0">
                <Checkbox
                  checked={allCurrentPageSelected}
                  onCheckedChange={() => handleToggleSelectAll()}
                  title={
                    allCurrentPageSelected
                      ? "Deselect all on this page"
                      : "Select all on this page"
                  }
                  aria-label="Select all"
                />
                <button
                  type="button"
                  onClick={handleToggleStarAll}
                  className={`w-4 h-4 flex items-center justify-center transition-colors cursor-pointer focus:outline-none rounded hover:scale-110 active:scale-95 ${
                    allVisibleStarred
                      ? "text-yellow-500 hover:text-yellow-600"
                      : someVisibleStarred
                        ? "text-yellow-500/80 hover:text-yellow-500"
                        : "text-muted-foreground/60 hover:text-yellow-500"
                  }`}
                  title={
                    allVisibleStarred
                      ? "Unstar all visible emails"
                      : "Star all visible emails"
                  }
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill={
                      allVisibleStarred
                        ? "#eab308"
                        : someVisibleStarred
                          ? "#eab308"
                          : "none"
                    }
                    fillOpacity={
                      allVisibleStarred
                        ? 1
                        : someVisibleStarred
                          ? 0.4
                          : 0
                    }
                    stroke={
                      allVisibleStarred || someVisibleStarred
                        ? "#eab308"
                        : "currentColor"
                    }
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              </div>

              {/* Sender Header */}
              <div className="w-44 md:w-56 truncate flex-shrink-0 pr-2">
                <button
                  type="button"
                  onClick={() => handleSort("sender")}
                  className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors group focus:outline-none"
                >
                  <span>Sender</span>
                  {sortField === "sender" ? (
                    <Icon
                      name={sortOrder === "asc" ? "chevron-up" : "chevron-down"}
                      className="h-3.5 w-3.5 text-primary"
                    />
                  ) : (
                    <Icon
                      name="caret-sort"
                      className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity"
                    />
                  )}
                </button>
              </div>

              {/* Subject Header */}
              <div className="flex-1 min-w-0 pr-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSort("subject")}
                  className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors group focus:outline-none"
                >
                  <span>Subject</span>
                  {sortField === "subject" ? (
                    <Icon
                      name={sortOrder === "asc" ? "chevron-up" : "chevron-down"}
                      className="h-3.5 w-3.5 text-primary"
                    />
                  ) : (
                    <Icon
                      name="caret-sort"
                      className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity"
                    />
                  )}
                </button>
                {selectedEmailIds.length > 0 && (
                  <span className="text-xs normal-case font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {selectedEmailIds.length} selected
                  </span>
                )}
              </div>

              {/* Attachment Header */}
              <div
                className="w-8 flex items-center justify-center flex-shrink-0"
                title="Has attachments"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-paperclip text-muted-foreground"
                >
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </div>

              {/* Date Header */}
              <div className="w-20 text-right flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors group focus:outline-none ml-auto"
                >
                  <span>Date</span>
                  {sortField === "date" ? (
                    <Icon
                      name={sortOrder === "asc" ? "chevron-up" : "chevron-down"}
                      className="h-3.5 w-3.5 text-primary"
                    />
                  ) : (
                    <Icon
                      name="caret-sort"
                      className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity"
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Table Body - ONLY ROWS SCROLL */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
              {paginatedInboxEmails.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    No emails found
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Your inbox for {senderEmail} is empty or no messages matched your search.
                  </p>
                </div>
              ) : (
                paginatedInboxEmails.map((email) => {
                  const isStarred = !!starredIds[email.id];
                  const isSelected = selectedEmailIds.includes(email.id);
                  const categoryTag = getReimbursementCategory(email);
                  const emailCompany = getCompanyForEmail(
                    email,
                    allUsers || [],
                    allEmployees || [],
                    companies || []
                  );

                  let rowBgClass = !email.seen
                    ? "bg-card hover:bg-muted/60 border-l-transparent font-semibold text-foreground"
                    : "bg-card/40 hover:bg-muted/60 border-l-transparent text-muted-foreground";
                  if (categoryTag === "Attendance") {
                    rowBgClass =
                      "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-emerald-500 font-medium text-foreground shadow-sm";
                  } else if (categoryTag === "New Joinee") {
                    rowBgClass =
                      "bg-indigo-500/10 hover:bg-indigo-500/15 border-l-indigo-500 font-medium text-foreground shadow-sm";
                  } else if (categoryTag === "Employee Left") {
                    rowBgClass =
                      "bg-rose-500/10 hover:bg-rose-500/15 border-l-rose-500 font-medium text-foreground shadow-sm";
                  } else if (categoryTag) {
                    rowBgClass =
                      "bg-primary/10 hover:bg-primary/15 border-l-primary font-medium text-foreground shadow-sm";
                  } else if (emailCompany.companyName) {
                    rowBgClass =
                      "bg-blue-500/10 hover:bg-blue-500/15 border-l-blue-500 font-medium text-foreground shadow-sm";
                  }

                  return (
                    <div
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className={`group flex items-center px-4 py-3 text-xs cursor-pointer transition-colors border-l-[3px] ${rowBgClass}`}
                    >
                      {/* Checkbox & Star */}
                      <div className="flex items-center gap-3 pr-3 flex-shrink-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            setSelectedEmailIds((prev) =>
                              prev.includes(email.id)
                                ? prev.filter((id) => id !== email.id)
                                : [...prev, email.id]
                            );
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select email from ${email.from.name || email.from.address}`}
                        />
                        <button
                          type="button"
                          onClick={(e) => toggleStar(email.id, e)}
                          className="text-muted-foreground hover:text-yellow-500 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill={isStarred ? "#eab308" : "none"}
                            stroke={isStarred ? "#eab308" : "currentColor"}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </button>
                      </div>

                      {/* Sender */}
                      <div className="w-44 md:w-56 truncate flex-shrink-0 font-medium text-foreground pr-2">
                        {email.from.name || email.from.address}
                      </div>

                      {/* Subject & Snippet */}
                      <div className="flex-1 min-w-0 flex items-center gap-2 pr-4 truncate">
                        {emailCompany.companyName && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20 flex-shrink-0 flex items-center gap-1"
                            title={`Company: ${emailCompany.companyName}`}
                          >
                            🏢 {emailCompany.companyName}
                          </span>
                        )}
                        {categoryTag === "Attendance" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex-shrink-0 flex items-center gap-1">
                            📅 Attendance
                          </span>
                        ) : categoryTag === "New Joinee" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex-shrink-0 flex items-center gap-1">
                            👤 New Joinee
                          </span>
                        ) : categoryTag === "Employee Left" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex-shrink-0 flex items-center gap-1">
                            🚪 Employee Left
                          </span>
                        ) : categoryTag ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 flex-shrink-0 flex items-center gap-1">
                            {categoryTag}
                          </span>
                        ) : getEmailCategory(email) === "updates" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex-shrink-0 flex items-center gap-1">
                            ℹ️ Updates
                          </span>
                        ) : null}
                        <span className="font-semibold text-foreground truncate">
                          {email.subject}
                        </span>
                        {email.snippet && email.snippet.trim() !== email.subject.trim() ? (
                          <span className="text-muted-foreground truncate hidden md:inline">
                            - {email.snippet}
                          </span>
                        ) : null}
                      </div>

                      {/* Attachments Indicator */}
                      <div className="w-8 flex items-center justify-center text-muted-foreground flex-shrink-0">
                        {email.hasAttachments ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-paperclip"
                          >
                            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                        ) : null}
                      </div>

                      {/* Date */}
                      <div className="w-20 text-right flex-shrink-0 text-[11px] font-medium text-muted-foreground">
                        {formatDate(email.date)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sticky Pagination Bar matching run-payrolls / salary-entry data-table */}
        <div className="sticky bottom-0 z-30 flex flex-col md:flex-row items-center justify-between px-4 py-3 bg-card border-t gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="text-sm text-muted-foreground order-2 md:order-1">
            Showing{" "}
            <span className="font-medium text-foreground">
              {totalCount === 0
                ? 0
                : Math.min(totalCount, (currentPage - 1) * pageSize + 1)}
            </span>
            –
            <span className="font-medium text-foreground">
              {Math.min(currentPage * pageSize, totalCount)}
            </span>{" "}
            of <span className="font-medium text-foreground">{totalCount}</span>{" "}
            rows
          </div>

          <div className="flex flex-row items-center gap-6 order-1 md:order-2 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Rows per page
              </span>
              <Select
                value={String(limitParam)}
                onValueChange={(value) => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.set("limit", value);
                  newParams.set("page", "1");
                  setSearchParams(newParams, { preventScrollReset: true });
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue
                    placeholder={
                      pageSize >= 100000 ? "All" : String(pageSize)
                    }
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 15, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                  <SelectItem value="100000">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <Pagination className="w-auto mx-0">
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set(
                          "page",
                          String(Math.max(1, currentPage - 1))
                        );
                        setSearchParams(newParams, {
                          preventScrollReset: true,
                        });
                      }}
                      disabled={currentPage <= 1}
                    >
                      <PaginationPrevious className="hover:bg-transparent p-0" />
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set("page", String(currentPage + 1));
                        setSearchParams(newParams, {
                          preventScrollReset: true,
                        });
                      }}
                      disabled={currentPage >= totalPages}
                    >
                      <PaginationNext className="hover:bg-transparent p-0" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
