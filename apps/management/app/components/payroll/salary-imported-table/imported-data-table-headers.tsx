import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { TableHead, TableHeader, TableRow } from "@canny_ecosystem/ui/table";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { replaceUnderscore } from "@canny_ecosystem/utils";
import { flexRender } from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";

type Props = {
  table?: any;
  className?: string;
  loading?: boolean;
  fieldConfigs: FieldConfig[];
  onDeleteColumn?: (colKey: string) => void;
  onRenameColumn?: (colKey: string, newName: string) => void;
};

export const NON_DELETABLE_KEYS = new Set([
  "select",
  "sr_no",
  "employee_name",
  "employee_code",
  "uan_no",
  "esic_no",
  "working_days",
  "present_days",
  "gross",
  "deduction",
  "net_pay",
]);

export function ImportedDataTableHeader({
  table,
  className,
  loading,
  fieldConfigs,
  onDeleteColumn,
  onRenameColumn,
}: Props) {
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingColId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingColId]);

  const commitEdit = (colId: string) => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed.toLowerCase() !== colId.toLowerCase()) {
      onRenameColumn?.(colId, trimmed);
    }
    setEditingColId(null);
  };

  const ImportPayrollDataArray: string[] = ["select", "sr_no"];

  for (const { key } of fieldConfigs) {
    const lowerKey = key.toLowerCase();
    if (!ImportPayrollDataArray.includes(lowerKey)) {
      ImportPayrollDataArray.push(lowerKey);
    }
  }

  const getColDef = (id: string) =>
    table?.getAllLeafColumns()?.find((col: { id: string }) => {
      return col.id.toLowerCase() === id.toLowerCase();
    });

  return (
    <TableHeader
      className={cn(
        "sticky top-0 z-20 bg-background/95 backdrop-blur-xs border-b shadow-xs",
        className,
      )}
    >
      <TableRow className="h-[45px] hover:bg-transparent sticky top-0 bg-background/95 backdrop-blur-xs">
        {ImportPayrollDataArray?.map((id) => {
          const colDef = getColDef(id);
          const isSelect = id === "select";
          const isNonDeletable = NON_DELETABLE_KEYS.has(id.toLowerCase());
          const canDelete = Boolean(onDeleteColumn) && !isNonDeletable;
          const canEdit = Boolean(onRenameColumn) && !isNonDeletable;
          const isEditing = editingColId === id;

          if (isSelect) {
            return (
              <TableHead
                key={id}
                className="w-10 px-2 text-center sticky top-0 bg-background/95 backdrop-blur-xs"
              >
                {colDef &&
                  flexRender(
                    colDef.columnDef.header,
                    colDef.getContext
                      ? colDef.getContext()
                      : { table, column: colDef },
                  )}
              </TableHead>
            );
          }

          const headerTitle =
            loading ||
            (typeof colDef?.columnDef?.header === "function"
              ? flexRender(
                  colDef.columnDef.header,
                  colDef.getContext
                    ? colDef.getContext()
                    : { table, column: colDef },
                )
              : colDef?.columnDef?.header);

          const defaultDisplayText =
            typeof headerTitle === "string" && headerTitle
              ? headerTitle
              : replaceUnderscore(id);

          return (
            <TableHead
              key={id}
              className={cn(
                "px-4 py-2 group/col relative select-none sticky top-0 bg-background/95 backdrop-blur-xs",
                isNonDeletable ? "opacity-60" : "opacity-100",
                canEdit && "cursor-pointer",
              )}
              onDoubleClick={(e) => {
                if (canEdit && !isEditing) {
                  e.stopPropagation();
                  setEditingColId(id);
                  setEditingValue(String(defaultDisplayText || ""));
                }
              }}
              title={
                canEdit
                  ? "Double click to rename column"
                  : isNonDeletable
                    ? "Fixed column (non-editable)"
                    : undefined
              }
            >
              {isEditing ? (
                <div className="flex items-center gap-1 w-full">
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit(id);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingColId(null);
                      }
                    }}
                    onBlur={() => commitEdit(id)}
                    className="h-7 text-sm font-semibold px-2 py-0.5 rounded border border-primary bg-background text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-primary w-full min-w-[100px]"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1.5">
                  <Button
                    className={cn(
                      "p-0 hover:bg-transparent space-x-2 disabled:opacity-100 text-sm tracking-tight",
                      isNonDeletable
                        ? "opacity-80 font-medium"
                        : "opacity-100 font-semibold",
                      canEdit &&
                        "hover:text-primary transition-colors cursor-pointer",
                    )}
                    variant="ghost"
                    disabled={true}
                  >
                    <span className="capitalize">{headerTitle}</span>
                    {canEdit && (
                      <Icon
                        name="edit"
                        size="xs"
                        className="opacity-0 group-hover/col:opacity-60 text-muted-foreground ml-0.5 transition-opacity"
                      />
                    )}
                  </Button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteColumn?.(id);
                      }}
                      className="opacity-0 group-hover/col:opacity-100 hover:text-destructive text-muted-foreground transition-opacity p-0.5 rounded cursor-pointer"
                      title={`Delete Column "${id}"`}
                      aria-label={`Delete Column ${id}`}
                    >
                      <Icon name="trash" size="xs" />
                    </button>
                  )}
                </div>
              )}
            </TableHead>
          );
        })}
      </TableRow>
    </TableHeader>
  );
}
