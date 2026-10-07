import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFetcher, useSearchParams } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { roundToNearest, isPhWagesComponent } from "@canny_ecosystem/utils";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@canny_ecosystem/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { LoadingSpinner } from "@/components/loading-spinner";

interface ExcelSalaryTableProps {
  data: any[];
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  payrollId: string;
  editable?: boolean;
  onSuccess?: (updatedEntry: any) => void;
  totalCount: number;
  page: number;
  limit: number;
  isLoading?: boolean;
}

interface EditHistoryItem {
  rowId: string;
  fieldKey: string;
  previousValue: number | string;
  newValue: number | string;
}

// Fixed standard columns from Image 1 UI
const STANDARD_EXCEL_COLUMNS = [
  { key: "employee_code", label: "EMPLOYEE CODE", isEditable: false },
  { key: "employee_name", label: "EMPLOYEE NAME", isEditable: false },
  { key: "present_days", label: "PRESENT DAYS", isEditable: true },
  { key: "monthly_ctc", label: "MONTHLY CTC", isEditable: true },
  { key: "Basic", label: "BASIC", isEditable: true },
  { key: "PH Wages", label: "PH WAGES", isEditable: true },
  { key: "Bonus", label: "BONUS", isEditable: true },
  { key: "ESI", label: "ESI", isEditable: true },
  { key: "PF", label: "PF", isEditable: true },
  {
    key: "Conveyance Allowance",
    label: "CONVEYANCE ALLOWANCE",
    isEditable: true,
  },
  { key: "PT", label: "PT", isEditable: true },
  { key: "HRA", label: "HRA", isEditable: true },
  { key: "net_pay", label: "NET PAY", isEditable: false },
];

export function ExcelSalaryTable({
  data,
  uniqueFields,
  payrollId,
  editable = true,
  onSuccess,
  totalCount,
  page,
  limit,
  isLoading = false,
}: ExcelSalaryTableProps) {
  const fetcher = useFetcher<any>();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [localData, setLocalData] = useState<any[]>(data);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    fieldKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pendingEdits, setPendingEdits] = useState<
    Map<
      string,
      {
        row: any;
        fieldKey: string;
        previousValue: number | string;
        newValue: number | string;
      }
    >
  >(new Map());

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  // Handle server updates
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success || fetcher.data.status === "success") {
        setPendingEdits(new Map());
        onSuccess?.(fetcher.data.updatedEntry);
        toast({
          title: "Saved Successfully",
          description: "All pending changes have been saved",
          variant: "success",
        });
      } else if (
        fetcher.data.status === "error" ||
        fetcher.data.success === false
      ) {
        toast({
          title: "Save Failed",
          description: fetcher.data.message || "Failed to save changes",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, onSuccess, toast]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Combine standard columns with any extra dynamic unique fields, ensuring NET PAY is the last column
  const allColumns = useMemo(() => {
    const standardWithoutNet = STANDARD_EXCEL_COLUMNS.filter(
      (c) => c.key.toLowerCase() !== "net_pay",
    );
    const standardKeys = new Set(
      standardWithoutNet.map((c) => c.key.toLowerCase()),
    );
    const extraCols = uniqueFields
      .filter(
        (uf) =>
          !standardKeys.has(uf.name.toLowerCase()) &&
          uf.name.toLowerCase() !== "net_pay",
      )
      .map((uf) => ({
        key: uf.name,
        label: uf.name.toUpperCase(),
        isEditable: true,
      }));

    const netPayCol = STANDARD_EXCEL_COLUMNS.find(
      (c) => c.key.toLowerCase() === "net_pay",
    )!;

    return [...standardWithoutNet, ...extraCols, netPayCol];
  }, [uniqueFields]);

  // Dynamic Net Pay calculator
  const getNetAmount = (row: any) => {
    const sfvs = row.salary_entries?.salary_field_values || [];
    if (sfvs.length > 0) {
      const netPayEntry = sfvs.find((sfv: any) => {
        const n = (sfv.payroll_fields?.name || sfv.name || "")
          .toUpperCase()
          .replace(/[^A-Z]/g, "");
        return n === "NETPAY" || n === "NETSALARY";
      });
      if (netPayEntry && netPayEntry.amount != null) {
        return Number(netPayEntry.amount);
      }
    }
    if (row.calculation?.netAmount !== undefined && row.calculation?.netAmount !== null) {
      return Number(row.calculation.netAmount);
    }
    if (sfvs.length > 0) {
      let totalEarnings = 0;
      let totalDeductions = 0;
      for (const sfv of sfvs) {
        const amt = Number(sfv.amount || 0);
        const name = (sfv.payroll_fields?.name || sfv.name || "").toLowerCase();
        const type = sfv.payroll_fields?.type || sfv.type;
        const isDeduction =
          type === "deduction" ||
          name.includes("esi") ||
          name.includes("pf") ||
          name.includes("pt");

        if (isDeduction) {
          totalDeductions += amt;
        } else {
          totalEarnings += amt;
        }
      }
      if (totalEarnings > 0 || totalDeductions > 0) {
        return totalEarnings - totalDeductions;
      }
    }
    return 0;
  };

  // Helper to extract value for a cell
  const getCellValue = (row: any, fieldKey: string) => {
    if (fieldKey === "employee_code") {
      return row.employee?.employee_code || "--";
    }

    if (fieldKey === "employee_name") {
      const emp = row.employee;
      if (!emp) return "--";
      const fullName = `${emp.first_name ?? ""} ${emp.middle_name ?? ""} ${emp.last_name ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
      return fullName || "--";
    }

    if (fieldKey === "present_days") {
      return row.calculation?.adjustedPayableDays ?? row.present_days ?? 0;
    }

    if (fieldKey === "net_pay") {
      return getNetAmount(row);
    }

    if (fieldKey === "monthly_ctc") {
      return (
        row.calculation?.monthlyCtc ?? row.salary_entries?.monthly_ctc ?? 0
      );
    }

    const isPh = isPhWagesComponent({ name: fieldKey });
    if (isPh) {
      const earning = row.calculation?.earnings?.find(
        (e: any) =>
          isPhWagesComponent(e) ||
          e.name?.trim().toLowerCase() === fieldKey.trim().toLowerCase(),
      );
      if (earning != null) return Number(earning.amount || 0);
    }

    // Check persisted field values
    const valObj = row.salary_entries?.salary_field_values?.find(
      (entry: any) =>
        entry.payroll_fields?.name?.trim().toLowerCase() ===
        fieldKey.trim().toLowerCase(),
    );
    if (valObj != null && valObj.amount != null) {
      return Number(valObj.amount);
    }

    // Fallback to computed breakdown
    const earning = row.calculation?.earnings?.find(
      (e: any) =>
        e.name?.trim().toLowerCase() === fieldKey.trim().toLowerCase(),
    );
    if (earning != null) return Number(earning.amount || 0);

    const deduction = row.calculation?.deductions?.find(
      (d: any) =>
        d.name?.trim().toLowerCase() === fieldKey.trim().toLowerCase(),
    );
    if (deduction != null) return Number(deduction.amount || 0);

    return 0;
  };

  const handleCellClick = (
    rowId: string,
    fieldKey: string,
    currentValue: any,
  ) => {
    if (
      !editable ||
      fieldKey === "employee_code" ||
      fieldKey === "employee_name" ||
      fieldKey === "net_pay"
    )
      return;
    setEditingCell({ rowId, fieldKey });
    setEditValue(String(currentValue ?? 0));
  };

  // Sticky positioning calculation for key pinned left and right columns
  const getStickyColumnStyles = (key: string, isHeader: boolean = false) => {
    switch (key) {
      case "employee_code":
        return {
          className: cn(
            "sticky left-0",
            isHeader
              ? "z-30 bg-[#12151e]"
              : "z-10 bg-[#0c0d12] group-hover:bg-[#151924]",
          ),
          style: { left: "0px" },
        };
      case "employee_name":
        return {
          className: cn(
            "sticky left-[130px]",
            isHeader
              ? "z-30 bg-[#12151e]"
              : "z-10 bg-[#0c0d12] group-hover:bg-[#151924]",
          ),
          style: { left: "130px" },
        };
      case "present_days":
        return {
          className: cn(
            "sticky left-[310px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.5)] border-r-2 border-[#202533]",
            isHeader
              ? "z-30 bg-[#12151e]"
              : "z-10 bg-[#0c0d12] group-hover:bg-[#151924]",
          ),
          style: { left: "310px" },
        };
      case "net_pay":
        return {
          className: cn(
            "sticky right-0 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.5)] border-l-2 border-[#202533]",
            isHeader
              ? "z-30 bg-[#12151e]"
              : "z-10 bg-[#0c0d12] group-hover:bg-[#151924]",
          ),
          style: { right: "0px" },
        };
      default:
        return { className: "", style: {} };
    }
  };

  const saveCellEdit = (
    row: any,
    fieldKey: string,
    rawVal: string,
    recordHistory = true,
  ) => {
    setEditingCell(null);
    const numValue = parseFloat(rawVal);
    if (isNaN(numValue)) return;

    const currentVal = getCellValue(row, fieldKey);
    if (Number(currentVal) === numValue) return;

    const editKey = `${row.id}::${fieldKey}`;

    if (recordHistory) {
      setEditHistory((prev) => [
        ...prev,
        {
          rowId: row.id,
          fieldKey,
          previousValue: currentVal,
          newValue: numValue,
        },
      ]);
    }

    setPendingEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(editKey);
      const originalVal = existing ? existing.previousValue : currentVal;

      if (Number(originalVal) === numValue) {
        next.delete(editKey);
      } else {
        next.set(editKey, {
          row,
          fieldKey,
          previousValue: originalVal,
          newValue: numValue,
        });
      }
      return next;
    });

    if (fieldKey === "present_days") {
      setLocalData((prev) =>
        prev.map((r) => {
          if (r.id === row.id) {
            return {
              ...r,
              present_days: numValue,
              calculation: {
                ...r.calculation,
                adjustedPayableDays: numValue,
              },
            };
          }
          return r;
        }),
      );
    } else if (fieldKey === "monthly_ctc") {
      // Optimistic update
      setLocalData((prev) =>
        prev.map((r) => {
          if (r.id === row.id) {
            return {
              ...r,
              calculation: {
                ...r.calculation,
                monthlyCtc: numValue,
              },
              salary_entries: {
                ...r.salary_entries,
                monthly_ctc: numValue,
              },
            };
          }
          return r;
        }),
      );
    } else {
      // Specific component update
      const valObj = row.salary_entries?.salary_field_values?.find(
        (entry: any) =>
          entry.payroll_fields?.name?.trim().toLowerCase() ===
          fieldKey.trim().toLowerCase(),
      );

      let payrollFieldTemplate = valObj?.payroll_fields;
      if (!payrollFieldTemplate) {
        for (const item of localData) {
          const found = item.salary_entries?.salary_field_values?.find(
            (entry: any) =>
              entry.payroll_fields?.name?.trim().toLowerCase() ===
              fieldKey.trim().toLowerCase(),
          );
          if (found?.payroll_fields) {
            payrollFieldTemplate = found.payroll_fields;
            break;
          }
        }
      }

      const isDeduction =
        fieldKey.toLowerCase().includes("esi") ||
        fieldKey.toLowerCase().includes("pf") ||
        fieldKey.toLowerCase().includes("pt");

      const fieldType =
        valObj?.payroll_fields?.type ||
        payrollFieldTemplate?.type ||
        (isDeduction ? "deduction" : "earning");

      // Optimistic update
      setLocalData((prev) =>
        prev.map((r) => {
          if (r.id === row.id) {
            const existingSfvs = [
              ...(r.salary_entries?.salary_field_values || []),
            ];
            const sfvIndex = existingSfvs.findIndex(
              (sfv: any) =>
                sfv.payroll_fields?.name?.trim().toLowerCase() ===
                fieldKey.trim().toLowerCase(),
            );

            if (sfvIndex >= 0) {
              existingSfvs[sfvIndex] = {
                ...existingSfvs[sfvIndex],
                amount: numValue,
              };
            } else {
              existingSfvs.push({
                amount: numValue,
                payroll_fields: { name: fieldKey, type: fieldType },
              });
            }

            return {
              ...r,
              salary_entries: {
                ...r.salary_entries,
                salary_field_values: existingSfvs,
              },
            };
          }
          return r;
        }),
      );
    }
  };

  const handleSaveAll = () => {
    if (pendingEdits.size === 0) return;

    const groupedMap = new Map<
      string,
      {
        monthly_attendance_id: string;
        salary_entries_id?: string;
        is_monthly_ctc?: boolean;
        amount?: number;
        present_days?: number;
        fields: any[];
      }
    >();

    for (const [, edit] of pendingEdits) {
      const { row, fieldKey, newValue } = edit;
      const attendanceId = row.id;

      if (!groupedMap.has(attendanceId)) {
        groupedMap.set(attendanceId, {
          monthly_attendance_id: attendanceId,
          salary_entries_id: row.salary_entries?.id,
          fields: [],
        });
      }

      const item = groupedMap.get(attendanceId)!;

      if (fieldKey === "present_days") {
        item.present_days = Number(newValue);
      } else if (fieldKey === "monthly_ctc") {
        item.is_monthly_ctc = true;
        item.amount = Number(newValue);
      } else {
        const valObj = row.salary_entries?.salary_field_values?.find(
          (entry: any) =>
            entry.payroll_fields?.name?.trim().toLowerCase() ===
            fieldKey.trim().toLowerCase(),
        );

        let payrollFieldTemplate = valObj?.payroll_fields;
        if (!payrollFieldTemplate) {
          for (const d of localData) {
            const found = d.salary_entries?.salary_field_values?.find(
              (entry: any) =>
                entry.payroll_fields?.name?.trim().toLowerCase() ===
                fieldKey.trim().toLowerCase(),
            );
            if (found?.payroll_fields) {
              payrollFieldTemplate = found.payroll_fields;
              break;
            }
          }
        }

        const isDeduction =
          fieldKey.toLowerCase().includes("esi") ||
          fieldKey.toLowerCase().includes("pf") ||
          fieldKey.toLowerCase().includes("pt");

        const fieldType =
          valObj?.payroll_fields?.type ||
          payrollFieldTemplate?.type ||
          (isDeduction ? "deduction" : "earning");

        item.fields.push({
          payrollFields_id: payrollFieldTemplate?.id,
          salaryFieldValues_id: valObj?.id,
          name: fieldKey,
          type: fieldType,
          amount: Number(newValue),
        });
      }
    }

    const payload = Array.from(groupedMap.values());
    const formData = new FormData();
    formData.append("fieldsData", JSON.stringify(payload));

    fetcher.submit(formData, {
      method: "POST",
      action: `/payroll/run-payroll/${payrollId}/upsert-salary-entry-value`,
    });
  };

  const handleUndo = () => {
    if (editHistory.length === 0) return;
    const lastEdit = editHistory[editHistory.length - 1];
    setEditHistory((prev) => prev.slice(0, -1));

    const targetRow = localData.find((r) => r.id === lastEdit.rowId);
    if (targetRow) {
      saveCellEdit(
        targetRow,
        lastEdit.fieldKey,
        String(lastEdit.previousValue),
        false,
      );
      toast({
        title: "Undo Successful",
        description: `Reverted ${lastEdit.fieldKey} back to ${lastEdit.previousValue}`,
        variant: "success",
      });
    }
  };

  // Keyboard shortcut for Undo (Ctrl+Z / Cmd+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !editingCell
      ) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [editHistory, localData, editingCell]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: any,
    fieldKey: string,
  ) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      saveCellEdit(row, fieldKey, editValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  return (
    <div className="flex flex-col w-full rounded-lg border border-[#1e2330] bg-[#0c0d12] shadow-2xl overflow-hidden font-sans text-xs relative">
      {(isLoading || fetcher.state !== "idle") && (
        <div className="absolute inset-0 z-50 bg-[#0c0d12]/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 transition-all duration-300 pointer-events-auto">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-300 animate-pulse">
            Processing...
          </span>
        </div>
      )}
      {/* Top Status Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-[#121620] border-b border-[#1f2432] gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center justify-center w-5 h-5 rounded bg-slate-800 text-slate-300">
            <Icon name="file-spreadsheet" className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold tracking-wide text-[#e2e8f0]">
            EXCEL SPREADSHEET MODE
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Cell Editing Enabled
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={editHistory.length === 0 || fetcher.state !== "idle"}
            className={cn(
              "h-7 px-2.5 ml-2 text-xs gap-1.5 bg-[#1a1f2c] border-[#2a3142] text-[#f1f5f9] hover:bg-[#252c3d] disabled:opacity-40 transition-all",
              editHistory.length > 0 &&
              "border-amber-500/50 text-amber-300 hover:bg-amber-500/10",
            )}
            title="Undo last edit (Ctrl+Z)"
          >
            <svg
              className="w-3.5 h-3.5"
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
            <span>Undo ({editHistory.length})</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleSaveAll}
            disabled={pendingEdits.size === 0 || fetcher.state !== "idle"}
            className={cn(
              "h-7 px-3 text-xs gap-1.5 font-medium transition-all",
              pendingEdits.size > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow"
                : "bg-slate-800 border border-slate-700 text-slate-400 opacity-60 cursor-not-allowed",
            )}
            title="Save all pending changes"
          >
            {fetcher.state !== "idle" ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Icon name="check" className="w-3.5 h-3.5" />
                <span>
                  Save{pendingEdits.size > 0 ? ` (${pendingEdits.size})` : ""}
                </span>
              </>
            )}
          </Button>
        </div>
        <div className="text-[#94a3b8] text-[11px] flex items-center gap-3">
          {fetcher.state !== "idle" ? (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Saving changes...
            </span>
          ) : pendingEdits.size > 0 ? (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {pendingEdits.size} unsaved edit
              {pendingEdits.size > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              All changes saved
            </span>
          )}
        </div>
      </div>

      {/* Spreadsheet Table Container */}
      <div className="overflow-x-auto max-h-[calc(100vh-380px)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#3b82f6_#12151e] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-[#12151e] [&::-webkit-scrollbar-thumb]:bg-primary [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/80">
        <table className="w-full text-left border-collapse select-none">
          <thead>
            <tr className="bg-[#12151e] border-b border-[#202533] sticky top-0 z-20">
              {allColumns.map((col) => {
                const sticky = getStickyColumnStyles(col.key, true);
                return (
                  <th
                    key={col.key}
                    style={sticky.style}
                    className={cn(
                      "px-4 py-3 text-[11px] font-bold text-[#94a3b8] tracking-wider whitespace-nowrap uppercase border-r border-[#1a1f2c] last:border-r-0",
                      col.key === "employee_code"
                        ? "text-left min-w-[130px] max-w-[130px]"
                        : col.key === "employee_name"
                          ? "text-left min-w-[180px] max-w-[180px]"
                          : col.key === "present_days"
                            ? "text-center min-w-[110px] max-w-[110px]"
                            : col.key === "net_pay"
                              ? "text-right min-w-[120px] max-w-[120px] text-sky-400"
                              : "text-right min-w-[120px]",
                      sticky.className,
                    )}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#181d2a] bg-[#0c0d12]">
            {localData.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-[#151924] transition-colors group"
              >
                {allColumns.map((col) => {
                  const val = getCellValue(row, col.key);
                  const isEditing =
                    editingCell?.rowId === row.id &&
                    editingCell?.fieldKey === col.key;
                  const sticky = getStickyColumnStyles(col.key, false);

                  return (
                    <td
                      key={col.key}
                      style={sticky.style}
                      onClick={() => handleCellClick(row.id, col.key, val)}
                      className={cn(
                        "px-3 py-2.5 border-r border-[#181c28] last:border-r-0 whitespace-nowrap font-medium transition-all relative",
                        col.key === "employee_code"
                          ? "text-left text-[#e2e8f0] font-mono tracking-wide min-w-[130px] max-w-[130px]"
                          : col.key === "employee_name"
                            ? "text-left text-[#e2e8f0] min-w-[180px] max-w-[180px] truncate"
                            : col.key === "present_days"
                              ? "text-center text-emerald-400 font-semibold font-mono min-w-[110px] max-w-[110px]"
                              : col.key === "net_pay"
                                ? "text-right text-sky-400 font-bold font-mono min-w-[120px] max-w-[120px]"
                                : "text-right text-[#f1f5f9] font-mono",
                        col.isEditable &&
                        editable &&
                        "cursor-pointer hover:bg-[#1a202c]",
                        isEditing &&
                        "p-0 border-2 border-primary bg-[#121622] z-20",
                        sticky.className,
                      )}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="number"
                          step="any"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveCellEdit(row, col.key, editValue)}
                          onKeyDown={(e) => handleKeyDown(e, row, col.key)}
                          className="w-full h-full px-3 py-2 bg-[#121622] text-[#ffffff] font-mono text-right text-xs outline-none border-none focus:ring-0"
                        />
                      ) : (
                        <span>
                          {col.key === "employee_code" || col.key === "employee_name"
                            ? val
                            : col.key === "present_days"
                              ? val
                              : col.key === "net_pay"
                                ? `₹${roundToNearest(Number(val)).toLocaleString("en-IN")}`
                                : Number(val) === 0
                                  ? "0"
                                  : roundToNearest(Number(val)).toLocaleString(
                                    "en-IN",
                                  )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spreadsheet Bottom Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between px-4 py-3 bg-[#12151e] border-t border-[#1e2332] gap-4 text-[#94a3b8]">
        <div className="text-xs">
          Showing{" "}
          <span className="font-semibold text-[#f1f5f9]">
            {Math.min(totalCount, (page - 1) * limit + 1)}
          </span>
          –
          <span className="font-semibold text-[#f1f5f9]">
            {Math.min(page * limit, totalCount)}
          </span>{" "}
          of <span className="font-semibold text-[#f1f5f9]">{totalCount}</span>{" "}
          rows
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap">Rows per page</span>
            <Select
              value={String(limit)}
              onValueChange={(value) => {
                const newParams = new URLSearchParams(searchParams);
                newParams.set("limit", value);
                newParams.set("page", "1");
                setSearchParams(newParams, { preventScrollReset: true });
              }}
            >
              <SelectTrigger className="h-8 w-[70px] bg-[#1a1f2c] border-[#2a3142] text-[#f1f5f9]">
                <SelectValue placeholder={limit === 100000 ? "All" : limit} />
              </SelectTrigger>
              <SelectContent
                side="top"
                className="bg-[#1a1f2c] border-[#2a3142] text-[#f1f5f9]"
              >
                {[25, 50, 100, 250, 500].map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize}
                  </SelectItem>
                ))}
                <SelectItem value="100000">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-[#f1f5f9]">
              Page {page} of {Math.ceil(totalCount / limit) || 1}
            </div>
            <Pagination className="w-auto mx-0">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-[#1a1f2c] border-[#2a3142] text-[#f1f5f9] hover:bg-[#252c3d]"
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      newParams.set("page", String(Math.max(1, page - 1)));
                      setSearchParams(newParams, { preventScrollReset: true });
                    }}
                    disabled={page <= 1}
                  >
                    <PaginationPrevious className="hover:bg-transparent p-0" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-[#1a1f2c] border-[#2a3142] text-[#f1f5f9] hover:bg-[#252c3d]"
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      newParams.set("page", String(page + 1));
                      setSearchParams(newParams, { preventScrollReset: true });
                    }}
                    disabled={page >= Math.ceil(totalCount / limit)}
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
  );
}
