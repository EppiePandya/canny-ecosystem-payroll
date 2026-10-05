import { useInputControl } from "@conform-to/react";
import type React from "react";
import {
  type ChangeEventHandler,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Checkbox, type CheckboxProps } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { cn } from "@/utils";
import {
  Combobox,
  EditorCommandPalette,
  type ComboboxSelectOption,
} from "./combobox";
import { Button } from "./button";
import { parseStringValue } from "@canny_ecosystem/utils";
import { useIsomorphicLayoutEffect } from "@canny_ecosystem/utils/hooks/isomorphic-layout-effect";
import { Icon } from "./icon";
import {
  KitchenSinkToolbar,
  MDXEditor,
  type MDXEditorMethods,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";

export type ListOfErrors = Array<string | null | undefined> | null | undefined;

export function ErrorList({
  id,
  errors,
}: {
  errors?: ListOfErrors;
  id?: string;
}) {
  const errorsToRender = errors?.filter(Boolean);
  if (!errorsToRender?.length) return null;
  return (
    <ul id={id} className="flex flex-col gap-1">
      {errorsToRender.map((e) => (
        <li key={e} className="text-[10px] text-destructive">
          {e}
        </li>
      ))}
    </ul>
  );
}

export function Field({
  labelProps,
  inputProps,
  errors,
  className,
  errorClassName,
  prefix,
  suffix,
}: {
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  errors?: ListOfErrors;
  className?: string;
  errorClassName?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  const fallbackId = useId();
  const id = inputProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const isRequired = inputProps.required;

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <div className="flex flex-row gap-[1px]">
        <Label htmlFor={id} {...labelProps} />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && isRequired && "inline",
          )}
        >
          *
        </sub>
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-2 text-muted">{prefix}</span>}
        <Input
          id={id}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          {...inputProps}
          className={cn(
            prefix && "pl-8",
            suffix && "pr-8",
            inputProps.className,
          )}
        />
        {suffix && (
          <span className="absolute right-2 text-muted">{suffix}</span>
        )}
      </div>
      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
      </div>
    </div>
  );
}

export function TextareaField({
  labelProps,
  textareaProps,
  errors,
  className,
  errorClassName,
}: {
  labelProps: React.LabelHTMLAttributes<HTMLLabelElement>;
  textareaProps: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  errors?: ListOfErrors;
  className?: string;
  errorClassName?: string;
}) {
  const fallbackId = useId();
  const id = textareaProps.id ?? textareaProps.name ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const isRequired = textareaProps.required;

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <div className="flex flex-row gap-[1px]">
        <Label htmlFor={id} {...labelProps} />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && isRequired && "inline",
          )}
        >
          *
        </sub>
      </div>
      <Textarea
        id={id}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
        {...textareaProps}
      />
      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
      </div>
    </div>
  );
}

// BUG: when default value is true in schema, it is not changing back to false when unchecked, if the default is false, its working properly
// BUG UPDATE: it only works when the default value is false, it is not working in any other case
export function CheckboxField({
  labelProps,
  buttonProps,
  errors,
  className,
  errorClassName,
}: {
  labelProps: JSX.IntrinsicElements["label"];
  buttonProps: CheckboxProps & {
    name: string;
    form: string;
    value?: string;
    disabled?: boolean;
  };
  errors?: ListOfErrors;
  className?: string;
  errorClassName?: string;
}) {
  const { key, ...checkboxProps } = buttonProps;
  const fallbackId = useId();
  const id = buttonProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const isRequired = buttonProps.required;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Checkbox
          {...checkboxProps}
          id={id}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          checked={buttonProps.checked}
          onCheckedChange={buttonProps.onCheckedChange}
          onFocus={buttonProps.onFocus}
          onBlur={buttonProps.onBlur}
          type="button"
        />
        <Label
          htmlFor={id}
          {...labelProps}
          className="self-center text-foreground"
        />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && isRequired && "inline",
          )}
        >
          *
        </sub>
      </div>
      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
      </div>
    </div>
  );
}

type SearchableSelectFieldProps = {
  options: ComboboxSelectOption[] | null | null[];
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  errors?: ListOfErrors;
  className?: string;
  errorClassName?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onInput?: (value: string) => void;
  allowDeselect?: boolean;
};

export function SearchableSelectField({
  options,
  labelProps,
  inputProps,
  errors,
  className,
  errorClassName,
  placeholder,
  onChange,
  onInput,
  allowDeselect = true,
}: SearchableSelectFieldProps) {
  const fallbackId = useId();
  const id = inputProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const isRequired = inputProps.required;

  const input = useInputControl({
    name: inputProps.name!,
    formId: inputProps.form!,
    initialValue: inputProps.defaultValue as string,
  });

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <div className="flex">
        <Label {...labelProps} />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && isRequired && "inline",
          )}
        >
          *
        </sub>
      </div>
      <input
        type="hidden"
        id={id}
        name={inputProps.name}
        value={input.value ?? ""}
        onChange={
          input.change as unknown as ChangeEventHandler<HTMLInputElement>
        }
        onBlur={input.blur}
      />
      <Combobox
        key={input.value}
        options={options}
        value={input.value ?? ""}
        onChange={(value) => {
          const finalValue = Array.isArray(value) ? value[0] ?? "" : value;

          if (!allowDeselect && !finalValue && input.value) {
            return;
          }
          input.change(finalValue);
          onChange?.(finalValue);
        }}
        onInput={onInput}
        placeholder={placeholder ?? inputProps.placeholder}
        disabled={inputProps.disabled || inputProps.readOnly}
      />
      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
      </div>
    </div>
  );
}

export type ConformControlledSelectFieldProps = {
  name: string;
  options: ComboboxSelectOption[] | null | null[];
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  value: string;
  onChange: (value: string) => void;
  errors?: ListOfErrors;
  className?: string;
  errorClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

export function ConformControlledSelectField({
  name,
  options,
  labelProps,
  value,
  onChange,
  errors,
  className,
  errorClassName,
  placeholder,
  disabled,
  required,
}: ConformControlledSelectFieldProps) {
  const fallbackId = useId();
  const id = `${name}-${fallbackId}`;
  const errorId = errors?.length ? `${id}-error` : undefined;

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <div className="flex">
        <Label htmlFor={id} {...labelProps} />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && required && "inline",
          )}
        >
          *
        </sub>
      </div>
      <input type="hidden" name={name} value={value} />
      <Combobox
        key={value}
        options={options}
        value={value}
        onChange={(val) => {
          const finalValue = Array.isArray(val) ? val[0] ?? "" : val;
          onChange(finalValue);
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
      </div>
    </div>
  );
}

type JSONBFieldProps = {
  labelProps: React.LabelHTMLAttributes<HTMLLabelElement>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  errors?: string[];
  className?: string;
  errorClassName?: string;
};

export function JSONBField({
  labelProps,
  inputProps,
  errors,
  className,
  errorClassName,
}: JSONBFieldProps) {
  const fallbackId = useId();
  const id = inputProps.id ?? fallbackId;
  const isRequired = inputProps.required;

  const [pairs, setPairs] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);

  useIsomorphicLayoutEffect(() => {
    try {
      const parsedValue = JSON.parse(
        inputProps.defaultValue?.toString() || "{}",
      );
      const initialPairs = Object.entries(parsedValue).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setPairs(
        initialPairs.length > 0 ? initialPairs : [{ key: "", value: "" }],
      );
    } catch (error) {
      console.error("Failed to parse JSONB value:", error);
    }
  }, [inputProps.defaultValue]);

  const updateJSONBValue = (newPairs: { key: string; value: string }[]) => {
    const jsonbValue = newPairs.reduce(
      (acc, { key, value }) => {
        if (key) {
          try {
            acc[key] = parseStringValue(value);
          } catch {
            acc[key] = value;
          }
        }
        return acc;
      },
      {} as Record<string, any>,
    );
    const event = {
      target: {
        name: inputProps.name,
        value: JSON.stringify(jsonbValue),
      },
    } as React.ChangeEvent<HTMLInputElement>;
    inputProps?.onChange?.(event);
  };

  const handleKeyChange = (index: number, newKey: string) => {
    const newPairs = [...pairs];
    newPairs[index].key = newKey;
    setPairs(newPairs);
    updateJSONBValue(newPairs);
  };

  const handleValueChange = (index: number, newValue: string) => {
    const newPairs = [...pairs];
    newPairs[index].value = newValue;
    setPairs(newPairs);
    updateJSONBValue(newPairs);
  };

  const addPair = () => {
    const newPairs = [...pairs, { key: "", value: "" }];
    setPairs(newPairs);
    updateJSONBValue(newPairs);
  };

  const removePair = (index: number) => {
    const newPairs = pairs.filter((_, i) => i !== index);
    setPairs(newPairs);
    updateJSONBValue(newPairs);
  };

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <div className="flex">
        <Label htmlFor={inputProps.id} {...labelProps} />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && isRequired && "inline",
          )}
        >
          *
        </sub>
      </div>
      {pairs.map((pair, index) => (
        <div key={index.toString()} className="flex gap-2 mb-2">
          <Input
            placeholder="Key"
            value={pair.key}
            onChange={(e) => handleKeyChange(index, e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Value"
            value={pair.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => removePair(index)}
            variant="destructive-outline"
            className="px-3"
          >
            <Icon name="cross" size="md" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        onClick={addPair}
        variant="primary-outline"
        className="mt-2"
      >
        Add Key-Value Pair
      </Button>
      <input
        {...inputProps}
        type="hidden"
        id={id}
        defaultValue={undefined}
        value={JSON.stringify(
          pairs.reduce(
            (acc, { key, value }) => {
              if (key) acc[key] = parseStringValue(value);
              return acc;
            },
            {} as Record<string, string>,
          ),
        )}
      />
      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errors && errors.length > 0 ? <ErrorList errors={errors} /> : null}
      </div>
    </div>
  );
}

export type FieldConfig = {
  key: string;
  type: "number" | "text" | "checkbox";
  placeholder?: string;
};

export type RangeFieldProps = {
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  inputProps: {
    id?: string;
    name: string;
    required?: boolean;
    defaultValue?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  };
  errors?: string[];
  className?: string;
  errorClassName?: string;
  fields: FieldConfig[];
};

export const RangeField = ({
  labelProps,
  inputProps,
  errors,
  className,
  errorClassName,
  fields,
}: RangeFieldProps) => {
  const fallbackId = useId();
  const id = inputProps.id ?? fallbackId;
  const isRequired = inputProps.required;

  const [ranges, setRanges] = useState<Array<Record<string, any>>>([
    (() => {
      const acc: Record<string, any> = {};
      for (const field of fields) {
        acc[field.key] = "";
      }
      return acc;
    })(),
  ]);

  useEffect(() => {
    try {
      if (inputProps.defaultValue) {
        const parsedValue = JSON.parse(inputProps.defaultValue);
        if (Array.isArray(parsedValue)) {
          const normalized = parsedValue.map((range) => {
            const obj: Record<string, any> = { ...range };
            for (const field of fields) {
              if (field.type === "checkbox") {
                obj[field.key] = !!(
                  obj[field.key] === true || obj[field.key] === "on"
                );
              }
            }
            return obj;
          });

          setRanges(normalized);
        }
      }
    } catch (error) {
      console.error("Failed to parse range value:", error);
    }
  }, [inputProps.defaultValue]);

  const updateValue = (newRanges: Array<Record<string, any>>) => {
    const event = {
      target: {
        name: inputProps.name,
        value: JSON.stringify(newRanges),
      },
    } as React.ChangeEvent<HTMLInputElement>;

    inputProps?.onChange?.(event);
  };

  const handleFieldChange = (
    index: number,
    fieldKey: string,
    value: string | boolean,
  ) => {
    const newRanges = [...ranges];
    newRanges[index] = {
      ...newRanges[index],
      [fieldKey]:
        fields.find((f) => f.key === fieldKey)?.type === "number"
          ? Number(value) || 0
          : fields.find((f) => f.key === fieldKey)?.type === "checkbox"
            ? Boolean(value)
            : value,
    };
    setRanges(newRanges);
    updateValue(newRanges);
  };

  const addRange = () => {
    const newRange = fields.reduce(
      (acc: Record<string, any>, field) => {
        acc[field.key] = field.type === "number" ? 0 : "";
        return acc;
      },
      {} as Record<string, any>,
    );

    const newRanges = [...ranges, newRange];
    setRanges(newRanges);
    updateValue(newRanges);
  };

  const removeRange = (index: number) => {
    const newRanges = ranges.filter((_, i) => i !== index);
    setRanges(newRanges);
    updateValue(newRanges);
  };

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <div className="flex mb-1.5">
        <Label htmlFor={inputProps.id} {...labelProps} />
        <sub
          className={cn(
            "hidden text-primary",
            labelProps?.children && isRequired && "inline",
          )}
        >
          *
        </sub>
      </div>

      {ranges.map((range, index) => (
        <div key={String(index)} className="flex gap-2 mb-2">
          {fields.map((field) =>
            field.type === "checkbox" ? (
              <Checkbox
                key={field.key}
                id={`${id}-${index}-${field.key}`}
                checked={!!range[field.key]}
                onCheckedChange={(checked: any) => {
                  handleFieldChange(index, field.key, checked);
                }}
                className="w-9 h-9"
              />
            ) : (
              <Input
                key={field.key}
                type={field.type}
                placeholder={field.placeholder || field.key}
                value={range[field.key]}
                onChange={(e) => {
                  handleFieldChange(index, field.key, e.target.value);
                }}
                className="flex-1"
              />
            ),
          )}
          <Button
            type="button"
            onClick={() => removeRange(index)}
            variant="destructive-outline"
            className="px-3"
          >
            <Icon name="cross" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        onClick={addRange}
        variant="primary-outline"
        className="mt-2"
      >
        Add Range
      </Button>

      <input
        {...inputProps}
        type="hidden"
        id={id}
        defaultValue={undefined}
        value={JSON.stringify(ranges)}
      />

      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errors && errors.length > 0 ? (
          <div className="text-destructive">
            {errors.map((error, index) => (
              <div key={String(index)}>{error}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

type EditorCommandOption = {
  value: string;
  label: string;
};

export function getEditorCommandOptions(): EditorCommandOption[] {
  return [
    { value: "firstName", label: "First Name" },
    { value: "middleName", label: "Middle Name" },
    { value: "fatherName", label: "Father Name" },
    { value: "lastName", label: "Last Name" },
    { value: "mrMrsFirstNameLastName", label: "Mr Mrs First Name Last Name" },
    {
      value: "mrMrsFirstMiddleLastName",
      label: "Mr Mrs First Middle Last Name",
    },
    { value: "employeeAddress", label: "Employee Address" },
    { value: "employeeCode", label: "Employee Code" },
    { value: "esicNumber", label: "Esic Number" },
    { value: "joinedDate", label: "Joining Date (22/02/2026)" },
    {
      value: "joinedDateOrdinal",
      label: "Joining Date Formatted (1st Sep 2026)",
    },
    { value: "exitDate", label: "Exit Date" },
    { value: "exitDateOrdinal", label: "Exit Date Formatted (1st Sep 2026)" },
    { value: "resignationDate", label: "Resignation Date" },
    { value: "todayDate", label: "Today Date" },
    { value: "departmentName", label: "Department Name" },
    { value: "currentMonthYear", label: "Current Month Year" },
    { value: "companyName", label: "Company Name" },
    { value: "employeeDesignation", label: "Employee Designation" },
    { value: "projectName", label: "Project Name" },
    { value: "joinedDate|ordinal", label: "Joining Date (Ordinal)" },
    { value: "joinedDate|add:1:year", label: "Joining Date + 1 Year" },
    {
      value: "joinedDate|add:1:year|ordinal",
      label: "Joining Date + 1 Year (Ordinal)",
    },
    { value: "joinedDate|add:6:month", label: "Joining Date + 6 Months" },
    { value: "joinedDate|sub:1:month", label: "Joining Date - 1 Month" },
    { value: "todayDate|add:15:day", label: "Today Date + 15 Days" },
    { value: "exitDate|sub:1:month", label: "Exit Date - 1 Month" },
    { value: "siteName", label: "Site Name" },
    { value: "siteAddress", label: "Site Address" },
    { value: "siteCity", label: "Site City" },
    { value: "center", label: "Center" },
    { value: "pageBreak", label: "Page Break" },
    { value: "monthlyBasicDa", label: "Monthly Basic + DA" },
    { value: "monthlyCtc", label: "Monthly CTC" },
    { value: "monthlyGross", label: "Monthly Gross" },
    { value: "netPay", label: "Net Pay" },
    { value: "netPay:26", label: "Net Pay (26 Days)" },
    { value: "netPay:27", label: "Net Pay (27 Days)" },
    { value: "salaryStructure", label: "Salary Structure Table" },
    { value: "signature", label: "Signature Block" },
    {
      value: "employeeSignatureWithName",
      label: "Employee Signature With Name",
    },
    { value: "employeeSignature", label: "Employee Signature" },
    {
      value: "employeeSignatureWithLetterName",
      label: "Employee Signature With Letter Name",
    },
  ];
}

const MENU_HEIGHT = 380;
const MENU_WIDTH = 320;

export function MarkdownField({
  labelProps,
  inputProps,
  theme = "light",
  errors,
  className,
  errorClassName,
}: {
  labelProps: LabelHTMLAttributes<HTMLLabelElement>;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  theme?: "dark" | "light" | "system";
  errors?: string[];
  className?: string;
  errorClassName?: string;
}) {
  const { isDocument } = useIsDocument();

  const [markdownValue, setMarkdownValue] = useState<string>(
    String(inputProps.defaultValue ?? ""),
  );

  const [commandOpen, setCommandOpen] = useState(false);
  const [commandPosition, setCommandPosition] = useState({ x: 0, y: 0 });

  const commandOptions = getEditorCommandOptions();

  const fallbackId = useId();
  const id = inputProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;

  const [isExpanded, setIsExpanded] = useState(false);

  const COLLAPSED_HEIGHT = 300;

  const handleMarkdownChange = (value: string | undefined) => {
    const finalValue = value ?? "";
    setMarkdownValue(finalValue);

    if (inputProps.onChange) {
      inputProps.onChange({
        target: { name: inputProps.name, value: finalValue },
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const openMenuAtCursor = (x: number, y: number) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = x;
    let newY = y;

    const spaceBelow = viewportHeight - y;
    const spaceAbove = y;

    if (spaceBelow < MENU_HEIGHT && spaceAbove > MENU_HEIGHT) {
      newY = y - MENU_HEIGHT;
    }

    const spaceRight = viewportWidth - x;
    const spaceLeft = x;

    if (spaceRight < MENU_WIDTH && spaceLeft > MENU_WIDTH) {
      newX = x - MENU_WIDTH;
    }

    newX = Math.max(8, Math.min(newX, viewportWidth - MENU_WIDTH - 8));
    newY = Math.max(8, Math.min(newY, viewportHeight - MENU_HEIGHT - 8));

    setCommandPosition({ x: newX, y: newY });
    setCommandOpen(true);
  };

  const mdxRef = useRef<MDXEditorMethods>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const commandPaletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!commandOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        commandPaletteRef.current &&
        !commandPaletteRef.current.contains(event.target as Node)
      ) {
        setCommandOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [commandOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandOpen(false);
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0).cloneRange();
        range.collapse(true);

        const rects = range.getClientRects();
        let left = 0;
        let bottom = 0;

        if (rects.length > 0) {
          left = rects[0].left;
          bottom = rects[0].bottom;
        } else {
          const container =
            range.startContainer.nodeType === Node.ELEMENT_NODE
              ? (range.startContainer as Element)
              : range.startContainer.parentElement;

          if (container) {
            const containerRect = container.getBoundingClientRect();
            left = containerRect.left;
            bottom = containerRect.bottom;
          } else {
            const activeEl = document.activeElement;
            if (activeEl) {
              const activeRect = activeEl.getBoundingClientRect();
              left = activeRect.left;
              bottom = activeRect.bottom;
            } else {
              return;
            }
          }
        }

        openMenuAtCursor(left, bottom);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function insertAtCursor(value: string) {
    mdxRef.current?.focus();
    mdxRef.current?.insertMarkdown(`\${${value}}`);
  }

  if (!isDocument) return null;

  return (
    <div className={className}>
      <Label htmlFor={id} {...labelProps} />
      <sub
        className={cn(
          "hidden text-primary",
          inputProps?.children && inputProps.required && "inline",
        )}
      >
        *
      </sub>

      <input
        type="hidden"
        id={id}
        name={inputProps.name}
        value={markdownValue}
        onChange={inputProps.onChange}
      />

      <div
        className={cn(
          "relative transition-all duration-300 ease-in-out",
          !isExpanded && "overflow-hidden",
        )}
        style={!isExpanded ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
      >
        <div ref={editorRef}>
          <MDXEditor
            ref={mdxRef}
            placeholder={inputProps.placeholder}
            markdown={markdownValue}
            onChange={handleMarkdownChange}
            plugins={[
              toolbarPlugin({ toolbarContents: () => <KitchenSinkToolbar /> }),
              listsPlugin(),
              quotePlugin(),
              headingsPlugin(),
              linkPlugin(),
              linkDialogPlugin(),
              imagePlugin(),
              tablePlugin(),
              thematicBreakPlugin(),
              frontmatterPlugin(),
              codeMirrorPlugin({
                codeBlockLanguages: {
                  js: "JavaScript",
                  css: "CSS",
                  txt: "text",
                  tsx: "TypeScript",
                },
              }),
              diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: "" }),
              markdownShortcutPlugin(),
            ]}
            className={cn("border rounded", theme === "dark" && "dark-theme")}
          />
        </div>
        {commandOpen && (
          <div
            ref={commandPaletteRef}
            style={{
              position: "fixed",
              left: commandPosition.x,
              top: commandPosition.y,
              zIndex: 100,
              width: 320,
            }}
            className="rounded-md border bg-background shadow-lg p-2"
          >
            <EditorCommandPalette
              options={commandOptions}
              onClose={() => setCommandOpen(false)}
              onSelect={(value) => {
                insertAtCursor(value);
                setCommandOpen(false);
              }}
            />
          </div>
        )}

        {!isExpanded && (
          <div className="pointer-events-none absolute bottom-0 left-0 h-16 w-full bg-gradient-to-t from-background to-transparent" />
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="mt-2 text-sm text-primary hover:underline"
      >
        {isExpanded ? "Collapse editor" : "Expand editor"}
      </button>

      <div className={cn("min-h-6 px-4 pb-2", errorClassName)}>
        {errorId && <ErrorList id={errorId} errors={errors} />}
      </div>
    </div>
  );
}
