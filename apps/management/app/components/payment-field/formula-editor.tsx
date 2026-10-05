import { useMemo, useRef, useState } from "react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { Textarea } from "@canny_ecosystem/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@canny_ecosystem/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import {
  DERIVED_FORMULA_COMPONENTS,
  FORMULA_FUNCTIONS,
  FORMULA_OPERATORS,
  evaluateFormula,
  getUsedFormulaComponents,
  validateFormula,
} from "@canny_ecosystem/utils";

export type FormulaComponentOption = {
  name: string;
  description?: string;
};

function ToolbarButton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer select-none">
      {children}
      <Icon name="chevron-down" size="xs" className="text-muted-foreground" />
    </span>
  );
}

export function FormulaEditor({
  name,
  value,
  onChange,
  salaryComponents,
}: {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  salaryComponents: FormulaComponentOption[];
}) {
  const [componentMenuOpen, setComponentMenuOpen] = useState(false);
  const [sampleValues, setSampleValues] = useState<Record<string, number>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const componentNames = useMemo(() => {
    const names = salaryComponents.map((c) => c.name);
    for (const derived of DERIVED_FORMULA_COMPONENTS) {
      if (!names.some((n) => n.toLowerCase() === derived.name.toLowerCase())) {
        names.push(derived.name);
      }
    }
    return names;
  }, [salaryComponents]);

  const validation = useMemo(
    () => (value.trim() ? validateFormula(value, componentNames) : null),
    [value, componentNames],
  );

  const usedComponents = useMemo(
    () =>
      validation?.valid ? getUsedFormulaComponents(value, componentNames) : [],
    [validation, value, componentNames],
  );

  const previewResult = useMemo(() => {
    if (!validation?.valid) return null;
    try {
      const variables: Record<string, number> = {};
      for (const componentName of componentNames) {
        variables[componentName] = sampleValues[componentName] ?? 0;
      }
      return evaluateFormula(value, variables);
    } catch {
      return null;
    }
  }, [validation, value, componentNames, sampleValues]);

  const insertIntoFormula = (text: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsSpaceBefore = before.length > 0 && !before.endsWith(" ");
    const inserted = `${needsSpaceBefore ? " " : ""}${text} `;
    onChange(`${before}${inserted}${after}`);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = start + inserted.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="border border-input rounded-md overflow-hidden">
        <div className="flex items-center border-b border-input bg-muted/40">
          <Popover open={componentMenuOpen} onOpenChange={setComponentMenuOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="focus-visible:outline-none">
                <ToolbarButton>Add Component</ToolbarButton>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[320px] p-0"
              align="start"
              sideOffset={4}
            >
              <Command>
                <CommandInput placeholder="Search components" />
                <CommandList className="max-h-56">
                  <CommandEmpty>No components found.</CommandEmpty>
                  {salaryComponents.length > 0 && (
                    <CommandGroup heading="Salary Components">
                      {salaryComponents.map((component) => (
                        <CommandItem
                          key={component.name}
                          value={component.name}
                          onSelect={() => {
                            insertIntoFormula(component.name);
                            setComponentMenuOpen(false);
                          }}
                        >
                          {component.name}
                          {component.description ? (
                            <span className="ml-auto text-xs text-muted-foreground truncate max-w-32">
                              {component.description}
                            </span>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  <CommandGroup heading="Other Components">
                    {DERIVED_FORMULA_COMPONENTS.map((component) => (
                      <CommandItem
                        key={component.name}
                        value={component.name}
                        onSelect={() => {
                          insertIntoFormula(component.name);
                          setComponentMenuOpen(false);
                        }}
                      >
                        {component.name}
                        <span className="ml-auto text-xs text-muted-foreground truncate max-w-36">
                          {component.description}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="h-5 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="focus-visible:outline-none">
                <ToolbarButton>Add Function</ToolbarButton>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              {FORMULA_FUNCTIONS.map((fn) => (
                <DropdownMenuItem
                  key={fn.name}
                  onClick={() => insertIntoFormula(`${fn.name}(`)}
                  className="flex flex-col items-start gap-0.5 cursor-pointer"
                >
                  <span className="font-medium">{fn.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {fn.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-5 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="focus-visible:outline-none">
                <ToolbarButton>Add Operator</ToolbarButton>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={4}
              className="grid grid-cols-2 min-w-[220px]"
            >
              {FORMULA_OPERATORS.map((op) => (
                <DropdownMenuItem
                  key={op.symbol}
                  onClick={() => insertIntoFormula(op.symbol)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className="font-mono font-semibold w-6 text-center">
                    {op.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {op.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Textarea
          ref={textareaRef}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Basic * 0.4 or IF(Gross > 21000, 0, Gross * 0.0075)"
          className="min-h-24 border-0 rounded-none shadow-none font-mono text-sm focus-visible:ring-0 resize-y"
        />
      </div>
      {value.trim() ? (
        validation?.valid ? (
          <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
            <Icon name="check-circle" size="xs" />
            Formula is valid
          </p>
        ) : (
          <p className="text-xs text-destructive flex items-center gap-1">
            <Icon name="cross" size="xs" />
            {validation?.error}
          </p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          Build the formula from salary components, functions and operators.
        </p>
      )}

      {validation?.valid && usedComponents.length > 0 && (
        <div className="mt-2 border border-input rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Test this formula with sample values
          </p>
          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2">
            {usedComponents.map((componentName) => (
              <div key={componentName} className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {componentName}
                </span>
                <Input
                  type="number"
                  className="h-8"
                  value={sampleValues[componentName] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    setSampleValues((prev) => ({
                      ...prev,
                      [componentName]: Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Result</span>
            <span className="font-semibold">
              {previewResult !== null
                ? (Math.round(previewResult * 100) / 100).toLocaleString()
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
