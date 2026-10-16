import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImportedDataTableHeader } from "./imported-data-table-headers";

interface ImportedDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  conflictingIndex?: number[];
  fieldConfigs: FieldConfig[];
  canUndo?: boolean;
  canRedo?: boolean;
  undoCount?: number;
  redoCount?: number;
  onUndo?: () => void;
  onRedo?: () => void;
  onCellChange?: (rowIndex: number, colKey: string, newValue: string) => void;
  onBulkChange?: (
    updates: Array<{ rowIndex: number; colKey: string; newValue: string }>,
  ) => void;
  onDeleteSelectedRows?: (selectedIndices: number[]) => void;
  onDeleteColumn?: (colKey: string) => void;
  onRenameColumn?: (colKey: string, newName: string) => void;
  onOpenBulkUpdate?: (selectedIndices: number[]) => void;
  onOpenAddColumn?: () => void;
}

export function ImportedDataTable<TData, TValue>({
  columns,
  data,
  conflictingIndex,
  fieldConfigs,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  onCellChange,
  onBulkChange,
  onDeleteSelectedRows,
  onDeleteColumn,
  onRenameColumn,
  onOpenBulkUpdate,
  onOpenAddColumn,
}: ImportedDataTableProps<TData, TValue>) {
  const { toast } = useToast();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Active cell state (Excel selection)
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    colKey: string;
  } | null>(null);

  // Click-outside listener: unselects active cell when clicking outside table data cells
  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (!selectedCell) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Don't unselect if user clicked inside an open dialog (e.g. bulk update modal)
      if (target.closest("[role='dialog']")) {
        return;
      }

      // Check if click was inside a data cell of this table
      const dataCell = target.closest("td[data-cell='true']");
      if (dataCell && tableContainerRef.current?.contains(dataCell)) {
        return;
      }

      // Clicked anywhere else -> unselect cell
      setSelectedCell(null);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [selectedCell]);

  // Active editing state (Excel inline input)
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    colKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // TanStack Table row selection
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const tableLength = tableRows.length;

  // Ordered list of editable data columns (excluding sr_no and select)
  const dataColKeys = fieldConfigs.map((f) => f.key);

  const getCellRawValue = useCallback(
    (rowIdx: number, colKey: string): string => {
      const rowItem = data[rowIdx] as any;
      if (!rowItem) return "";
      const val = rowItem[colKey];
      if (val === undefined || val === null) return "";
      if (typeof val === "object" && "amount" in val) {
        return String(val.amount ?? "");
      }
      return String(val);
    },
    [data],
  );

  const startEditing = useCallback(
    (rowIndex: number, colKey: string, initialChar?: string) => {
      if (colKey === "sr_no" || colKey === "select") return;
      const rowItem = data[rowIndex] as any;
      if (
        conflictingIndex?.includes(rowIndex) ||
        rowItem?.has_error ||
        rowItem?.is_disabled
      ) {
        toast({
          title: "Row Disabled",
          description:
            rowItem?.error_message ||
            "This row has an error and is disabled for mutations.",
          variant: "destructive",
        });
        return;
      }
      const currentVal = getCellRawValue(rowIndex, colKey);
      setEditingCell({ rowIndex, colKey });
      setEditValue(initialChar !== undefined ? initialChar : currentVal);
      setSelectedCell({ rowIndex, colKey });
    },
    [data, conflictingIndex, getCellRawValue, toast],
  );

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, colKey } = editingCell;
    const currentVal = getCellRawValue(rowIndex, colKey);
    if (editValue !== currentVal) {
      onCellChange?.(rowIndex, colKey, editValue);
    }
    setEditingCell(null);
  }, [editingCell, editValue, getCellRawValue, onCellChange]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // Copy cell value to clipboard
  const handleCopy = useCallback(() => {
    if (!selectedCell || editingCell) return;
    const val = getCellRawValue(selectedCell.rowIndex, selectedCell.colKey);
    navigator.clipboard.writeText(val);
  }, [selectedCell, editingCell, getCellRawValue]);

  // Paste handler (multi-row / multi-col Excel support)
  const handlePasteData = useCallback(
    (pastedText: string) => {
      if (!selectedCell || !pastedText) return;
      const { rowIndex: startRow, colKey: startColKey } = selectedCell;
      const startColIdx = dataColKeys.indexOf(startColKey);
      if (startColIdx === -1) return;

      const lines = pastedText
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);

      if (lines.length === 0) return;

      const updates: Array<{
        rowIndex: number;
        colKey: string;
        newValue: string;
      }> = [];

      for (let r = 0; r < lines.length; r++) {
        const targetRow = startRow + r;
        if (targetRow >= data.length) break;

        const targetItem = data[targetRow] as any;
        if (
          conflictingIndex?.includes(targetRow) ||
          targetItem?.has_error ||
          targetItem?.is_disabled
        ) {
          continue; // skip disabled rows during paste
        }

        const line = lines[r];
        const cells = line.includes("\t") ? line.split("\t") : line.split(",");

        for (let c = 0; c < cells.length; c++) {
          const targetColIdx = startColIdx + c;
          if (targetColIdx >= dataColKeys.length) break;

          const targetColKey = dataColKeys[targetColIdx];
          const val = cells[c].trim();
          updates.push({
            rowIndex: targetRow,
            colKey: targetColKey,
            newValue: val,
          });
        }
      }

      if (updates.length > 0) {
        if (onBulkChange) {
          onBulkChange(updates);
        } else {
          for (const u of updates) {
            onCellChange?.(u.rowIndex, u.colKey, u.newValue);
          }
        }
      }
    },
    [selectedCell, dataColKeys, data.length, onBulkChange, onCellChange],
  );

  // Global keyboard shortcuts on table
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    // If currently editing inside the input, let input handler manage it
    if (editingCell) return;

    if (!selectedCell) {
      if (data.length > 0 && dataColKeys.length > 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          setSelectedCell({ rowIndex: 0, colKey: dataColKeys[0] });
          e.preventDefault();
        }
      }
      return;
    }

    // Escape: unselect cell
    if (e.key === "Escape") {
      e.preventDefault();
      setSelectedCell(null);
      return;
    }

    const { rowIndex, colKey } = selectedCell;
    const colIdx = dataColKeys.indexOf(colKey);

    // Copy: Ctrl+C / Cmd+C
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      handleCopy();
      return;
    }

    // Navigation: Arrow keys
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIndex > 0) {
        setSelectedCell({ rowIndex: rowIndex - 1, colKey });
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex < data.length - 1) {
        setSelectedCell({ rowIndex: rowIndex + 1, colKey });
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIdx > 0) {
        setSelectedCell({ rowIndex, colKey: dataColKeys[colIdx - 1] });
      }
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (colIdx < dataColKeys.length - 1) {
        setSelectedCell({ rowIndex, colKey: dataColKeys[colIdx + 1] });
      }
      return;
    }

    // Tab navigation
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) {
          setSelectedCell({ rowIndex, colKey: dataColKeys[colIdx - 1] });
        } else if (rowIndex > 0) {
          setSelectedCell({
            rowIndex: rowIndex - 1,
            colKey: dataColKeys[dataColKeys.length - 1],
          });
        }
      } else {
        if (colIdx < dataColKeys.length - 1) {
          setSelectedCell({ rowIndex, colKey: dataColKeys[colIdx + 1] });
        } else if (rowIndex < data.length - 1) {
          setSelectedCell({ rowIndex: rowIndex + 1, colKey: dataColKeys[0] });
        }
      }
      return;
    }

    const isCurrentRowDisabled =
      conflictingIndex?.includes(rowIndex) ||
      Boolean((data[rowIndex] as any)?.has_error) ||
      Boolean((data[rowIndex] as any)?.is_disabled);

    // Undo: Ctrl+Z / Cmd+Z
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "z" &&
      !e.shiftKey
    ) {
      e.preventDefault();
      onUndo?.();
      return;
    }

    // Redo: Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key.toLowerCase() === "y" ||
        (e.key.toLowerCase() === "z" && e.shiftKey))
    ) {
      e.preventDefault();
      onRedo?.();
      return;
    }

    // Enter / F2: Start editing
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if (!isCurrentRowDisabled) {
        startEditing(rowIndex, colKey);
      }
      return;
    }

    // Delete / Backspace: Clear cell
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (!isCurrentRowDisabled) {
        onCellChange?.(rowIndex, colKey, "");
      }
      return;
    }

    // Typing directly starts editing with character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!isCurrentRowDisabled) {
        startEditing(rowIndex, colKey, e.key);
      }
      return;
    }
  };

  // Keyboard navigation inside input while editing
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
      // Move to cell below
      if (selectedCell && selectedCell.rowIndex < data.length - 1) {
        setSelectedCell({
          rowIndex: selectedCell.rowIndex + 1,
          colKey: selectedCell.colKey,
        });
      }
      tableContainerRef.current?.focus();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      if (selectedCell) {
        const colIdx = dataColKeys.indexOf(selectedCell.colKey);
        if (e.shiftKey) {
          if (colIdx > 0) {
            setSelectedCell({
              rowIndex: selectedCell.rowIndex,
              colKey: dataColKeys[colIdx - 1],
            });
          }
        } else {
          if (colIdx < dataColKeys.length - 1) {
            setSelectedCell({
              rowIndex: selectedCell.rowIndex,
              colKey: dataColKeys[colIdx + 1],
            });
          }
        }
      }
      tableContainerRef.current?.focus();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      tableContainerRef.current?.focus();
      return;
    }
  };

  const handleNativePaste = (e: React.ClipboardEvent) => {
    if (editingCell) return; // Allow normal input pasting if typing in input
    const text = e.clipboardData.getData("text");
    if (text) {
      e.preventDefault();
      handlePasteData(text);
    }
  };

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedRowIndices = selectedRows.map((r) => r.index);

  const isPaymentColumn = useCallback(
    (colKey: string) => {
      const config = fieldConfigs.find(
        (f) => f.key.toLowerCase() === colKey.toLowerCase(),
      );
      if (config?.type === "earning" || config?.type === "deduction")
        return true;
      if (
        [
          "basic",
          "hra",
          "da",
          "lta",
          "bonus",
          "gross",
          "net_pay",
          "pf",
          "pt",
          "esic",
          "lwf",
          "deduction",
          "advance",
          "expense",
          "allowance",
          "fixed_allowance",
          "other_allowance",
          "conveyance_allowance",
          "transportation_allowance",
          "el_amount",
          "leave_salary",
          "ph_wage",
          "ot_amount",
        ].includes(colKey.toLowerCase())
      ) {
        return true;
      }
      return false;
    },
    [fieldConfigs],
  );

  const getColumnTotal = useCallback(
    (colKey: string) => {
      if (!isPaymentColumn(colKey)) return null;
      return (data as any[]).reduce((acc: number, row: any) => {
        if (!row) return acc;
        const val = row[colKey];
        let amount = 0;
        if (typeof val === "object" && val !== null && "amount" in val) {
          amount = Number(val.amount) || 0;
        } else if (typeof val === "number") {
          amount = val;
        } else if (typeof val === "string") {
          const parsed = Number(val.replace(/,/g, ""));
          amount = Number.isNaN(parsed) ? 0 : parsed;
        }
        return acc + amount;
      }, 0);
    },
    [data, isPaymentColumn],
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col space-y-3.5 w-full h-full overflow-hidden">
      {/* Excel Action Toolbar: Left-aligned shortcuts, Right-aligned actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-3 py-2 bg-muted/40 border rounded-md text-muted-foreground select-none shrink-0 mb-1">
        {/* Left Side: Keyboard Shortcuts Info */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-background border rounded text-[9px] font-mono shadow-2xs">
              Ctrl+Z
            </kbd>
            <span>Undo</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-background border rounded text-[9px] font-mono shadow-2xs">
              Ctrl+Y
            </kbd>
            <span>Redo</span>
          </span>
          <span className="flex items-center gap-1 hidden sm:flex">
            <kbd className="px-1.5 py-0.5 bg-background border rounded text-[9px] font-mono shadow-2xs">
              Double-click
            </kbd>
            <span>Edit</span>
          </span>
          <span className="flex items-center gap-1 hidden md:flex">
            <kbd className="px-1.5 py-0.5 bg-background border rounded text-[9px] font-mono shadow-2xs">
              Ctrl+C
            </kbd>
            <span>/</span>
            <kbd className="px-1.5 py-0.5 bg-background border rounded text-[9px] font-mono shadow-2xs">
              Ctrl+V
            </kbd>
          </span>

          {selectedRowIndices.length > 0 && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                {selectedRowIndices.length} row(s) selected
              </span>
            </>
          )}
        </div>

        {/* Right Side: Action Buttons: Undo/Redo, Bulk Actions, Add Column */}
        <div className="flex items-center gap-2">
          {/* Undo Button */}
          {onUndo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo}
              className={cn(
                "h-7 text-xs gap-1.5 px-2.5 transition-all",
                canUndo
                  ? "border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                  : "opacity-40 cursor-not-allowed",
              )}
              title="Undo last mutation (Ctrl+Z / Cmd+Z)"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
              <span>Undo{undoCount ? ` (${undoCount})` : ""}</span>
            </Button>
          )}

          {/* Redo Button */}
          {onRedo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRedo}
              disabled={!canRedo}
              className={cn(
                "h-7 text-xs gap-1.5 px-2.5 transition-all",
                canRedo
                  ? "border-blue-500/50 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                  : "opacity-40 cursor-not-allowed",
              )}
              title="Redo mutation (Ctrl+Y / Cmd+Y / Cmd+Shift+Z)"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
                />
              </svg>
              <span>Redo{redoCount ? ` (${redoCount})` : ""}</span>
            </Button>
          )}

          {selectedRowIndices.length > 0 && onDeleteSelectedRows && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onDeleteSelectedRows(selectedRowIndices)}
              className="h-7 text-xs gap-1.5 px-2.5"
            >
              <Icon name="trash" size="xs" />
              Delete Selected ({selectedRowIndices.length})
            </Button>
          )}

          {onOpenBulkUpdate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenBulkUpdate(selectedRowIndices)}
              className="h-7 text-xs gap-1.5 px-2.5 border-dashed"
            >
              <Icon name="update" size="xs" />
              Bulk Update Column
            </Button>
          )}

          {onOpenAddColumn && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenAddColumn}
              className="h-7 text-xs gap-1.5 px-2.5 border-dashed text-primary hover:bg-primary/5 border-primary/30"
            >
              <Icon name="plus" size="xs" />
              Add Column
            </Button>
          )}
        </div>
      </div>

      <div
        ref={tableContainerRef}
        role="grid"
        aria-label="Payroll Data Grid"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: spreadsheet grid container requires keyboard focus
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        onPaste={handleNativePaste}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (
            target === tableContainerRef.current ||
            target.tagName === "TABLE" ||
            target.tagName === "TBODY"
          ) {
            setSelectedCell(null);
          }
        }}
        className={cn(
          "relative border rounded focus:outline-none focus:ring-1 focus:ring-primary/40 flex-1 min-h-0 overflow-auto [scrollbar-width:thin] select-none",
          !tableLength && "border-none",
        )}
      >
        <table className="w-full bg-card caption-bottom text-sm text-left border-collapse select-none">
          <ImportedDataTableHeader
            table={table}
            className={cn(!tableLength && "hidden")}
            fieldConfigs={fieldConfigs}
            onDeleteColumn={onDeleteColumn}
            onRenameColumn={onRenameColumn}
          />
          <TableBody>
            {tableLength ? (
              tableRows.map((row, index) => {
                const isConflicting = conflictingIndex?.includes(index);
                const hasError = Boolean(
                  (row.original as any)?.has_error ||
                    (row.original as any)?.is_disabled,
                );
                const isRowDisabled = isConflicting || hasError;
                const hasExistingSalary = (row.original as any)
                  ?.has_existing_salary_entry;
                const isDuplicateRow = Boolean(
                  (row.original as any)?.is_duplicate,
                );

                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "relative h-[40px] md:h-[45px] cursor-default select-text transition-colors",
                      isRowDisabled &&
                        "bg-destructive/15 hover:bg-destructive/20 border-l-4 border-l-destructive cursor-not-allowed opacity-80",
                      !isRowDisabled && isConflicting && "bg-destructive/20",
                      !isRowDisabled &&
                        hasExistingSalary &&
                        "bg-red-500/10 hover:bg-red-500/15 dark:bg-red-950/20 dark:hover:bg-red-950/30",
                      !isRowDisabled &&
                        isDuplicateRow &&
                        "bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-950/25 dark:hover:bg-amber-950/35 border-l-4 border-l-amber-500",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colKey = cell.column.id;
                      const isSrNo = colKey === "sr_no";
                      const isSelect = colKey === "select";
                      const isSelected =
                        !isSrNo &&
                        !isSelect &&
                        selectedCell?.rowIndex === index &&
                        selectedCell?.colKey === colKey;
                      const isEditing =
                        !isSrNo &&
                        !isSelect &&
                        editingCell?.rowIndex === index &&
                        editingCell?.colKey === colKey;

                      return (
                        <TableCell
                          key={cell.id}
                          data-cell={!isSrNo && !isSelect ? "true" : undefined}
                          onClick={() => {
                            if (!isSrNo && !isSelect) {
                              setSelectedCell({ rowIndex: index, colKey });
                            }
                          }}
                          onDoubleClick={() => {
                            if (!isSrNo && !isSelect && !isRowDisabled) {
                              startEditing(index, colKey);
                            }
                          }}
                          className={cn(
                            "h-[52px] px-3 py-1 table-cell transition-all relative",
                            isSelected &&
                              !isEditing &&
                              "ring-2 ring-primary ring-inset bg-primary/10 shadow-sm",
                            isEditing &&
                              "p-0.5 ring-2 ring-primary bg-background",
                          )}
                        >
                          {isEditing ? (
                            <div className="relative w-full h-full flex items-center">
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                onBlur={commitEdit}
                                className="w-full h-8 px-2 py-0.5 text-xs font-mono bg-background border border-primary rounded shadow-inner focus:outline-none focus:ring-2 focus:ring-primary z-20"
                              />
                            </div>
                          ) : (
                            <div className="relative w-full h-full flex items-center">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                              {isSelected && (
                                <span
                                  className="absolute -bottom-1 -right-1 w-2 h-2 bg-primary rounded-[1px] pointer-events-none z-10"
                                  title="Active Cell"
                                />
                              )}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow className={cn(!tableLength && "border-none")}>
                <TableCell
                  colSpan={columns.length}
                  className="h-80 grid place-items-center text-center tracking-wide text-xl capitalize"
                >
                  No Payroll Found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {tableLength > 0 && (
            <TableFooter className="bg-muted/95 backdrop-blur-xs font-semibold border-t-2 border-primary/20 sticky bottom-0 z-20 shadow-md">
              <TableRow className="h-[48px] hover:bg-muted/80 sticky bottom-0 bg-muted/95 backdrop-blur-xs">
                {table.getVisibleLeafColumns().map((col) => {
                  const colKey = col.id;
                  if (colKey === "select") {
                    return (
                      <TableCell
                        key={col.id}
                        className="w-10 px-2 text-center text-xs text-muted-foreground font-mono font-bold sticky bottom-0 bg-muted/95 backdrop-blur-xs"
                      >
                        Σ
                      </TableCell>
                    );
                  }
                  if (colKey === "sr_no") {
                    return (
                      <TableCell
                        key={col.id}
                        className="px-4 py-2 font-bold text-xs uppercase tracking-wider text-foreground whitespace-nowrap sticky bottom-0 bg-muted/95 backdrop-blur-xs"
                      >
                        Total
                      </TableCell>
                    );
                  }

                  const total = getColumnTotal(colKey);
                  const config = fieldConfigs.find(
                    (f) => f.key.toLowerCase() === colKey.toLowerCase(),
                  );
                  const isEarning =
                    config?.type === "earning" ||
                    colKey === "net_pay" ||
                    colKey === "gross";
                  const isDeduction = config?.type === "deduction";

                  if (total === null) {
                    return (
                      <TableCell
                        key={col.id}
                        className="px-3 py-2 text-muted-foreground/40 text-xs text-center font-mono sticky bottom-0 bg-muted/95 backdrop-blur-xs"
                      >
                        --
                      </TableCell>
                    );
                  }

                  return (
                    <TableCell
                      key={col.id}
                      className={cn(
                        "px-3 py-2 text-xs font-mono font-bold tracking-tight whitespace-nowrap sticky bottom-0 bg-muted/95 backdrop-blur-xs",
                        isEarning && "text-emerald-700 dark:text-emerald-400",
                        isDeduction && "text-red-700 dark:text-red-400",
                      )}
                    >
                      ₹{Math.round(total).toLocaleString("en-IN")}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableFooter>
          )}
        </table>
      </div>
    </div>
  );
}
