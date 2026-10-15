import type { FieldConfig } from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Table,
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
  onCellChange?: (rowIndex: number, colKey: string, newValue: string) => void;
  onBulkChange?: (
    updates: Array<{ rowIndex: number; colKey: string; newValue: string }>,
  ) => void;
  onDeleteSelectedRows?: (selectedIndices: number[]) => void;
  onDeleteColumn?: (colKey: string) => void;
  onOpenBulkUpdate?: (selectedIndices: number[]) => void;
  onOpenAddColumn?: () => void;
}

export function ImportedDataTable<TData, TValue>({
  columns,
  data,
  conflictingIndex,
  fieldConfigs,
  onCellChange,
  onBulkChange,
  onDeleteSelectedRows,
  onDeleteColumn,
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
      const currentVal = getCellRawValue(rowIndex, colKey);
      setEditingCell({ rowIndex, colKey });
      setEditValue(initialChar !== undefined ? initialChar : currentVal);
      setSelectedCell({ rowIndex, colKey });
    },
    [getCellRawValue],
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
    toast({
      title: "Copied to clipboard",
      description: `Value: "${val}" copied.`,
      variant: "success",
    });
  }, [selectedCell, editingCell, getCellRawValue, toast]);

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
        toast({
          title: "Pasted Data",
          description: `Successfully pasted ${updates.length} cell(s) across ${lines.length} row(s).`,
          variant: "success",
        });
      }
    },
    [selectedCell, dataColKeys, data.length, onBulkChange, onCellChange, toast],
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

    // Enter / F2: Start editing
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEditing(rowIndex, colKey);
      return;
    }

    // Delete / Backspace: Clear cell
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onCellChange?.(rowIndex, colKey, "");
      return;
    }

    // Typing directly starts editing with character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startEditing(rowIndex, colKey, e.key);
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

  const selectedColConfig = fieldConfigs.find(
    (f) => f.key === selectedCell?.colKey,
  );
  const selectedDisplayValue = selectedCell
    ? getCellRawValue(selectedCell.rowIndex, selectedCell.colKey)
    : "";

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
    <div className="relative mb-8 space-y-2">
      {/* Excel Status Bar & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-2.5 py-1.5 bg-muted/40 border rounded-md text-muted-foreground select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="font-semibold text-foreground">
              {selectedCell
                ? `Cell [Row ${selectedCell.rowIndex + 1}, ${selectedColConfig?.key?.toUpperCase() || selectedCell.colKey}]`
                : "Ready"}
            </span>
            {selectedCell && (
              <span className="text-primary font-medium">
                = {selectedDisplayValue || `""`}
              </span>
            )}
          </div>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-xs">
            {tableLength} {tableLength === 1 ? "Employee" : "Employees"} loaded
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

        {/* Toolbar Buttons: Bulk Actions, Add Column, Excel Shortcuts */}
        <div className="flex items-center gap-2">
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

          <div className="items-center gap-2 text-[11px] text-muted-foreground/70 hidden lg:flex pl-2 border-l border-border/50">
            <span className="flex items-center gap-0.5">
              <kbd className="px-1 py-0.2 bg-background border rounded text-[9px]">
                Double-click
              </kbd>{" "}
              Edit
            </span>
            <span className="flex items-center gap-0.5">
              <kbd className="px-1 py-0.2 bg-background border rounded text-[9px]">
                Ctrl+C
              </kbd>{" "}
              /{" "}
              <kbd className="px-1 py-0.2 bg-background border rounded text-[9px]">
                Ctrl+V
              </kbd>
            </span>
          </div>
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
        className={cn(
          "relative border overflow-x-auto rounded focus:outline-none focus:ring-1 focus:ring-primary/40",
          !tableLength && "border-none",
        )}
      >
        <div className="relative">
          <Table>
            <ImportedDataTableHeader
              table={table}
              className={cn(!tableLength && "hidden")}
              fieldConfigs={fieldConfigs}
              onDeleteColumn={onDeleteColumn}
            />
            <TableBody>
              {tableLength ? (
                tableRows.map((row, index) => {
                  const isConflicting = conflictingIndex?.includes(index);
                  const hasExistingSalary = (row.original as any)
                    ?.has_existing_salary_entry;

                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "relative h-[40px] md:h-[45px] cursor-default select-text transition-colors",
                        isConflicting && "bg-destructive/20",
                        hasExistingSalary &&
                          "bg-red-500/10 hover:bg-red-500/15 dark:bg-red-950/20 dark:hover:bg-red-950/30",
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
                            onClick={() => {
                              if (!isSrNo && !isSelect) {
                                setSelectedCell({ rowIndex: index, colKey });
                              }
                            }}
                            onDoubleClick={() => {
                              if (!isSrNo && !isSelect) {
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
              <TableFooter className="bg-muted/70 font-semibold border-t-2 border-primary/20 sticky bottom-0 z-20 shadow-xs">
                <TableRow className="h-[48px] hover:bg-muted/80">
                  {table.getVisibleLeafColumns().map((col) => {
                    const colKey = col.id;
                    if (colKey === "select") {
                      return (
                        <TableCell
                          key={col.id}
                          className="w-10 px-2 text-center text-xs text-muted-foreground font-mono font-bold"
                        >
                          Σ
                        </TableCell>
                      );
                    }
                    if (colKey === "sr_no") {
                      return (
                        <TableCell
                          key={col.id}
                          className="px-4 py-2 font-bold text-xs uppercase tracking-wider text-foreground whitespace-nowrap"
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
                          className="px-3 py-2 text-muted-foreground/40 text-xs text-center font-mono"
                        >
                          --
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell
                        key={col.id}
                        className={cn(
                          "px-3 py-2 text-xs font-mono font-bold tracking-tight whitespace-nowrap",
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
          </Table>
        </div>
      </div>
    </div>
  );
}
