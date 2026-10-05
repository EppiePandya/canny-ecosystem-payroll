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
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { defaultYear, getYears } from "@canny_ecosystem/utils";
import { useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

export const PayrollHistoryFilter = ({ disabled }: { disabled?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const year = searchParams.get("year") || "";

  const updateSearchParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams, { preventScrollReset: true });
  };

  const deleteAllSearchParams = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("year");
    newParams.delete("name");
    setSearchParams(newParams, { preventScrollReset: true });
  };

  useHotkeys(["meta+f", "ctrl+f"], (evt) => {
    if (!disabled) {
      evt.preventDefault();
      setIsOpen((prev) => !prev);
    }
  });

  useHotkeys(
    "esc",
    () => {
      deleteAllSearchParams();
      setIsOpen(false);
    },
    {
      enableOnFormTags: true,
    },
  );
  return (
    <div>
      <div className="text-xl font-bold">
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <div className="border rounded-md flex p-2 space-x-4 w-full md:w-auto items-center">
            <form
              className="relative w-full md:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  onClick={() => setIsOpen((prev) => !prev)}
                  type="button"
                  className={cn(
                    "flex items-center justify-center opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100",
                    isOpen && "opacity-100",
                  )}
                >
                  <Icon name="mixer" className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </form>
          </div>

          <DropdownMenuContent
            className="w-full md:w-[220px]"
            align="end"
            sideOffset={19}
            alignOffset={-11}
          >
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
                        checked={year === name.toString()}
                        onCheckedChange={() => {
                          updateSearchParam(
                            "year",
                            year === name.toString() ? "" : name.toString(),
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
      </div>
    </div>
  );
};
