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
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { payoutMonths } from "@canny_ecosystem/utils/constant";
import { useState, useMemo } from "react";
import { useTypingAnimation } from "@canny_ecosystem/utils/hooks/typing-animation";

const PLACEHOLDERS = [
  "Search bonuses for FY 2026-27",
  "Pending bonuses for employees in April",
  "Yearly bonuses for Project 'XYZ'",
  "Monthly salaries paid in March",
  "Bonus amount greater than 5000",
];

interface BonusSearchFilterProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedFY: string;
  onFYChange: (value: string) => void;
  selectedFrom: number;
  onFromChange: (value: number) => void;
  selectedTo: number;
  onToChange: (value: number) => void;
  fyOptions: string[];
  configStartMonth: number;
  selectedProject?: string;
  onProjectChange?: (value: string) => void;
  projectOptions?: { label: string; value: string }[];
  selectedSite?: string;
  onSiteChange?: (value: string) => void;
  siteOptions?: { label: string; value: string }[];
}

export function BonusSearchFilter({
  searchTerm,
  onSearchChange,
  selectedFY,
  onFYChange,
  selectedFrom,
  onFromChange,
  selectedTo,
  onToChange,
  fyOptions,
  configStartMonth,
  selectedProject = "all",
  onProjectChange,
  projectOptions = [],
  selectedSite = "all",
  onSiteChange,
  siteOptions = [],
}: BonusSearchFilterProps) {
  const [isFocused, setIsFocused] = useState(false);
  const animatedPlaceholder = useTypingAnimation(PLACEHOLDERS, isFocused, {
    typingSpeed: 40,
    pauseDuration: 4000,
  });

  const cycle = useMemo(() => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      months.push(((configStartMonth - 1 + i) % 12) + 1);
    }
    return months;
  }, [configStartMonth]);

  const hasActiveFilters =
    (selectedProject && selectedProject !== "all") ||
    (selectedSite && selectedSite !== "all");

  return (
    <div className="flex items-center w-full md:w-auto">
      <div className="relative w-full md:w-[480px]">
        <Icon
          name="search"
          className="absolute pointer-events-none left-3 top-[12.5px]"
        />
        <Input
          placeholder={animatedPlaceholder}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="pl-9 w-full h-10 md:w-[480px] pr-8 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70 bg-background"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="absolute z-10 right-3 top-[6px] transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100 p-1">
              <Icon name="mixer" />
              {hasActiveFilters && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 z-[9999]"
            align="end"
            sideOffset={18}
            alignOffset={-11}
          >
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Icon name="calendar" className="mr-2 h-4 w-4" />
                  <span>Fiscal Year</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent sideOffset={8}>
                    {fyOptions.map((fy) => (
                      <DropdownMenuCheckboxItem
                        key={fy}
                        checked={selectedFY === fy}
                        onCheckedChange={() => onFYChange(fy)}
                      >
                        {fy}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Icon
                    name="chevron-right"
                    className="mr-2 h-4 w-4 rotate-45"
                  />
                  <span>Month Range</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent sideOffset={8} className="p-2 w-48">
                    <div className="flex flex-col gap-3">
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground px-1">
                          From
                        </span>
                        <Select
                          value={selectedFrom.toString()}
                          onValueChange={(val) => {
                            const newFrom = Number(val);
                            onFromChange(newFrom);
                            if (
                              cycle.indexOf(newFrom) > cycle.indexOf(selectedTo)
                            ) {
                              onToChange(newFrom);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {cycle.map((m) => {
                              const [startYearStr, endYearPart] =
                                selectedFY.split("-");
                              const startYear = parseInt(startYearStr);
                              const endYear =
                                endYearPart?.length === 4
                                  ? parseInt(endYearPart)
                                  : Math.floor(startYear / 100) * 100 +
                                    parseInt(endYearPart || "0");
                              const year =
                                m < configStartMonth
                                  ? endYear || startYear + 1
                                  : startYear;
                              return (
                                <SelectItem
                                  key={m}
                                  value={m.toString()}
                                  className="text-xs"
                                >
                                  {
                                    payoutMonths.find((pm) => pm.value === m)
                                      ?.label
                                  }{" "}
                                  {year}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground px-1">
                          To
                        </span>
                        <Select
                          value={selectedTo.toString()}
                          onValueChange={(val) => onToChange(Number(val))}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {cycle.map((m) => {
                              const isDisabled =
                                cycle.indexOf(m) < cycle.indexOf(selectedFrom);
                              const [startYearStr, endYearPart] =
                                selectedFY.split("-");
                              const startYear = parseInt(startYearStr);
                              const endYear =
                                endYearPart?.length === 4
                                  ? parseInt(endYearPart)
                                  : Math.floor(startYear / 100) * 100 +
                                    parseInt(endYearPart || "0");
                              const year =
                                m < configStartMonth
                                  ? endYear || startYear + 1
                                  : startYear;
                              return (
                                <SelectItem
                                  key={m}
                                  value={m.toString()}
                                  className="text-xs"
                                  disabled={isDisabled}
                                >
                                  {
                                    payoutMonths.find((pm) => pm.value === m)
                                      ?.label
                                  }{" "}
                                  {year}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              {projectOptions && projectOptions.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Icon name="rows" className="mr-2 h-4 w-4" />
                    <span>Project</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent
                      sideOffset={8}
                      className="w-56 max-h-60 overflow-y-auto"
                    >
                      <DropdownMenuCheckboxItem
                        checked={selectedProject === "all"}
                        onCheckedChange={() => onProjectChange?.("all")}
                      >
                        All Projects
                      </DropdownMenuCheckboxItem>
                      {projectOptions.map((proj) => (
                        <DropdownMenuCheckboxItem
                          key={proj.value}
                          checked={selectedProject === proj.value}
                          onCheckedChange={() => onProjectChange?.(proj.value)}
                        >
                          {proj.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}

              {siteOptions && siteOptions.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Icon name="card-stack" className="mr-2 h-4 w-4" />
                    <span>Site</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent
                      sideOffset={8}
                      className="w-56 max-h-60 overflow-y-auto"
                    >
                      <DropdownMenuCheckboxItem
                        checked={selectedSite === "all"}
                        onCheckedChange={() => onSiteChange?.("all")}
                      >
                        All Sites
                      </DropdownMenuCheckboxItem>
                      {siteOptions.map((site) => (
                        <DropdownMenuCheckboxItem
                          key={site.value}
                          checked={selectedSite === site.value}
                          onCheckedChange={() => onSiteChange?.(site.value)}
                        >
                          {site.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
