import { useState } from "react";
import { cn } from "@/utils/cn";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Icon } from "./icon";
import { replaceUnderscore } from "@canny_ecosystem/utils";

export interface ComboboxSelectOption {
  value: string | number;
  label: string;
  pseudoLabel?: string;
  pseudoValue?: string;
}

interface ComboboxProps {
  options: ComboboxSelectOption[] | null | null[];
  value: string | number;
  pseudoValue?: string;
  onChange: (value: string, { pseudoValue }: { pseudoValue?: string }) => void;
  onInput?: (value: string) => void;
  placeholder?: string;
  className?: string;
  dialogClassName?: string;
  disabled?: boolean;
  modal?: boolean;
}

export function Combobox({
  options,
  value,
  pseudoValue,
  onChange,
  onInput,
  placeholder = "Select an option...",
  className,
  dialogClassName,
  disabled,
  modal = true,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = options?.find(
    (option) => String(option?.value) === String(value),
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          disabled={disabled}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "truncate justify-between",
            !selectedOption && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate flex-1 text-left">
            {replaceUnderscore(
              selectedOption ? selectedOption?.label : placeholder,
            )}
          </span>
          <Icon
            name="caret-sort"
            size="sm"
            className="ml-2 shrink-0 opacity-50"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-0", dialogClassName)}>
        <Command>
          <CommandInput
            placeholder="Search options..."
            onValueChange={(value) => onInput?.(value)}
          />
          <CommandEmpty className="w-full py-6 text-center">
            No option found.
          </CommandEmpty>
          <CommandList>
            <CommandGroup>
              {options?.map((option) => (
                <CommandItem
                  key={option?.value}
                  value={String(
                    (option?.value ?? "") +
                      (option?.label ?? "") +
                      (option?.pseudoLabel ?? ""),
                  )}
                  onSelect={() => {
                    onChange(
                      String(option?.value) === String(value)
                        ? ""
                        : String(option?.value),
                      {
                        pseudoValue:
                          String(option?.pseudoValue) === String(pseudoValue)
                            ? ""
                            : String(option?.pseudoValue),
                      },
                    );
                    setOpen(false);
                  }}
                  className="max-w-96 flex flex-row"
                >
                  <Icon
                    name="check"
                    size="sm"
                    className={cn(
                      "mr-2 shrink-0",
                      String(value) === String(option?.value)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <p className="truncate min-w-0 flex-1">
                    {replaceUnderscore(option?.label)}
                  </p>
                  <p
                    className={cn(
                      "text-muted-foreground ml-6 w-28 truncate",
                      !option?.pseudoLabel && "hidden",
                    )}
                  >
                    {option?.pseudoLabel}
                  </p>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EditorCommandPalette({
  options,
  onSelect,
  onClose,
}: {
  options: ComboboxSelectOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Command>
      <CommandInput autoFocus placeholder="Type a command…" />
      <CommandEmpty>No command found.</CommandEmpty>
      <CommandList>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              onSelect={() => {
                onSelect(String(option.value));
                onClose();
              }}
            >
              {replaceUnderscore(option.label)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
