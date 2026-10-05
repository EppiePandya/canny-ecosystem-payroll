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
import { useRef, useState, useEffect } from "react";
import { useSearchParams } from "@remix-run/react";
import {
  assignmentTypeArray,
  replaceUnderscore,
  skillLevelArray,
  positionArray,
} from "@canny_ecosystem/utils";

export function SalariesSearchFilter({
  disabled,
  projectArray,
  siteArray,
}: {
  disabled?: boolean;
  projectArray: string[];
  siteArray: string[];
}) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilterParams = {
    status: "",
    project: "",
    site: "",
    assignment_type: "",
    position: "",
    skill_level: "",
  };

  const [filterParams, setFilterParams] = useState(initialFilterParams);

  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    let changed = false;
    for (const [key, value] of Object.entries(filterParams)) {
      if (value) {
        if (newParams.get(key) !== value) {
          newParams.set(key, value);
          changed = true;
        }
      } else {
        if (newParams.has(key)) {
          newParams.delete(key);
          changed = true;
        }
      }
    }
    if (changed) {
      setSearchParams(newParams);
    }
  }, [filterParams]);

  useEffect(() => {
    setPrompt(searchParams.get("name") || "");
    setFilterParams({
      status: searchParams.get("status") || "",
      project: searchParams.get("project") || "",
      site: searchParams.get("site") || "",
      assignment_type: searchParams.get("assignment_type") || "",
      position: searchParams.get("position") || "",
      skill_level: searchParams.get("skill_level") || "",
    });
  }, [searchParams]);

  const handleSearch = (evt: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(evt.target.value);
  };

  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === "Enter") {
      const newParams = new URLSearchParams(searchParams);
      if (prompt) {
        newParams.set("name", prompt);
      } else {
        newParams.delete("name");
      }
      setSearchParams(newParams);
    }
  };

  const hasValidFilters = Object.values(filterParams).some((v) => v.length > 0);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex space-x-4 w-full md:w-auto items-center">
        <div className="relative w-full md:w-auto">
          <Icon
            name="search"
            className="absolute pointer-events-none left-3 top-[12.5px]"
          />
          <Input
            ref={inputRef}
            placeholder="Search salaries (Press Enter)..."
            disabled={disabled}
            className="pl-9 w-full h-10 md:w-[480px] pr-8 focus-visible:ring-0 placeholder:opacity-50"
            value={prompt}
            onChange={handleSearch}
            onKeyDown={handleKeyDown}
          />

          <DropdownMenuTrigger disabled={disabled} asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "absolute z-10 right-3 top-[6px] opacity-70",
                !disabled && "transition-opacity hover:opacity-100",
                hasValidFilters && "opacity-100",
                isOpen && "opacity-100",
              )}
            >
              <Icon name="mixer" />
            </button>
          </DropdownMenuTrigger>
        </div>
      </div>

      <DropdownMenuContent className="w-[200px]" align="end">
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {["active", "inactive"].map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    className="capitalize"
                    checked={filterParams.status === s}
                    onCheckedChange={() =>
                      setFilterParams((p) => ({
                        ...p,
                        status: p.status === s ? "" : s,
                      }))
                    }
                  >
                    {s}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Project</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {projectArray.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={filterParams.project === p}
                    onCheckedChange={() =>
                      setFilterParams((prev) => ({
                        ...prev,
                        project: prev.project === p ? "" : p,
                      }))
                    }
                  >
                    {p}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Site</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {siteArray.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={filterParams.site === s}
                    onCheckedChange={() =>
                      setFilterParams((prev) => ({
                        ...prev,
                        site: prev.site === s ? "" : s,
                      }))
                    }
                  >
                    {s}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assignment Type</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {assignmentTypeArray.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={filterParams.assignment_type === t}
                    onCheckedChange={() =>
                      setFilterParams((prev) => ({
                        ...prev,
                        assignment_type: prev.assignment_type === t ? "" : t,
                      }))
                    }
                  >
                    {replaceUnderscore(t)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Position</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {positionArray.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={filterParams.position === p}
                    onCheckedChange={() =>
                      setFilterParams((prev) => ({
                        ...prev,
                        position: prev.position === p ? "" : p,
                      }))
                    }
                  >
                    {replaceUnderscore(p)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Skill Level</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {skillLevelArray.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={filterParams.skill_level === s}
                    onCheckedChange={() =>
                      setFilterParams((prev) => ({
                        ...prev,
                        skill_level: prev.skill_level === s ? "" : s,
                      }))
                    }
                  >
                    {replaceUnderscore(s)}
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
