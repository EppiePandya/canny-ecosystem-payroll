import { useImportStoreForSalaryPayroll } from "@/store/import";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { getMonthlyAttendanceByEmployeeIds } from "@canny_ecosystem/supabase/queries";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { Label } from "@canny_ecosystem/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@canny_ecosystem/ui/sheet";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { replaceUnderscore } from "@canny_ecosystem/utils";
import { useNavigate, useNavigation } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateUnmatchedEmployeePanel } from "@/components/employees/import-export/create-unmatched-employee-panel";
import type {
  FieldConfig,
  SheetDataEntry,
} from "@/routes/_protected+/payroll+/run-payroll+/import-salary-payroll+/_index";
import { ImportedDataColumns } from "../salary-imported-table/columns";
import { ImportedDataTable } from "../salary-imported-table/imported-data-table";
import { NON_DELETABLE_KEYS } from "../salary-imported-table/imported-data-table-headers";

const isValidIdentifier = (val: any) => {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  return (
    s !== "" &&
    s !== "null" &&
    s !== "undefined" &&
    s !== "n/a" &&
    s !== "na" &&
    s !== "-" &&
    s !== "new" &&
    s !== "new employee" &&
    s !== "new_employee"
  );
};

const getRecordAmount = (val: any): number => {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "object" && val !== null && "amount" in val) {
    return Number(val.amount) || 0;
  }
  if (typeof val === "number") return val;
  const parsed = Number(String(val).replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const setRecordAmount = (
  existingVal: any,
  newAmount: number,
  type: "earning" | "deduction" = "earning",
) => {
  const rounded = Math.round(newAmount);
  if (typeof existingVal === "object" && existingVal !== null) {
    return {
      ...existingVal,
      amount: rounded,
      type: existingVal.type || type,
    };
  }
  return {
    amount: rounded,
    type,
    consider_for_epf: false,
    consider_for_esic: false,
  };
};

const getInsertIndexForNewColumn = (
  configs: FieldConfig[],
  type: "earning" | "deduction",
): number => {
  if (type === "earning") {
    // "if it s earning then it should be just before left side of gross"
    const grossIdx = configs.findIndex((f) => f.key.toLowerCase() === "gross");
    if (grossIdx !== -1) return grossIdx;

    const firstDedOrNetIdx = configs.findIndex(
      (f) => f.type === "deduction" || f.key.toLowerCase() === "net_pay",
    );
    if (firstDedOrNetIdx !== -1) return firstDedOrNetIdx;

    return configs.length;
  }

  // "and same in deduction it should be just beside deduction"
  const totalDedIdx = configs.findIndex(
    (f) => f.key.toLowerCase() === "deduction",
  );
  if (totalDedIdx !== -1) {
    return totalDedIdx;
  }

  const netPayIdx = configs.findIndex((f) => f.key.toLowerCase() === "net_pay");
  if (netPayIdx !== -1) {
    return netPayIdx;
  }

  let lastDedIdx = -1;
  for (let i = 0; i < configs.length; i++) {
    if (configs[i].type === "deduction") {
      lastDedIdx = i;
    }
  }
  if (lastDedIdx !== -1) {
    return lastDedIdx + 1;
  }

  return configs.length;
};

const mergeTwoRecords = (
  primary: any,
  dup: any,
  fieldConfigs: FieldConfig[],
): any => {
  const merged = { ...primary };

  // 1. Working Days: keep max
  const primaryWorkingDays = Number(primary.working_days);
  const dupWorkingDays = Number(dup.working_days);
  if (!Number.isNaN(primaryWorkingDays) && !Number.isNaN(dupWorkingDays)) {
    merged.working_days = Math.max(primaryWorkingDays, dupWorkingDays);
  } else if (!Number.isNaN(dupWorkingDays)) {
    merged.working_days = dupWorkingDays;
  }

  // 2. Attendance fields: numeric sum
  const attendanceKeys = [
    "present_days",
    "ph",
    "pl",
    "cl",
    "ml",
    "el",
    "ot_hours",
    "ot_days",
    "weekly_off",
    "absent_days",
    "holiday",
    "paid_days",
  ];

  for (const attKey of attendanceKeys) {
    if (attKey in primary || attKey in dup) {
      const v1 = Number(primary[attKey]) || 0;
      const v2 = Number(dup[attKey]) || 0;
      if (v1 !== 0 || v2 !== 0 || attKey in primary || attKey in dup) {
        merged[attKey] = v1 + v2;
      }
    }
  }

  // 3. Financial / Payment columns configured in fieldConfigs
  const handledConfigKeys = new Set<string>();

  for (const config of fieldConfigs) {
    const key = config.key;
    handledConfigKeys.add(key);

    if (config.type === "earning" || config.type === "deduction") {
      const a1 = getRecordAmount(primary[key]);
      const a2 = getRecordAmount(dup[key]);
      const combinedAmount = Math.round(a1 + a2);
      const existingVal = primary[key] ?? dup[key];

      merged[key] = setRecordAmount(existingVal, combinedAmount, config.type);
    }
  }

  // 4. Any other unconfigured keys on dup that are payment amounts or numeric values
  const allOtherKeys = new Set([...Object.keys(primary), ...Object.keys(dup)]);
  for (const key of allOtherKeys) {
    if (handledConfigKeys.has(key)) continue;
    if (
      key === "working_days" ||
      attendanceKeys.includes(key) ||
      key === "employee_name" ||
      key === "employee_code" ||
      key === "uan_no" ||
      key === "uan_number" ||
      key === "esic_no" ||
      key === "esic_number" ||
      key === "sr_no" ||
      key === "is_duplicate" ||
      key === "primary_index" ||
      key === "primary_sr_no" ||
      key === "_sheetRowIndex" ||
      key === "is_site_header" ||
      key === "is_new_employee" ||
      key === "employee_id" ||
      key === "has_existing_salary_entry" ||
      key === "raw_row"
    ) {
      continue;
    }

    const val1 = primary[key];
    const val2 = dup[key];

    const isAmountObj =
      (val1 && typeof val1 === "object" && "amount" in val1) ||
      (val2 && typeof val2 === "object" && "amount" in val2);

    if (isAmountObj) {
      const a1 = getRecordAmount(val1);
      const a2 = getRecordAmount(val2);
      const type = val1?.type || val2?.type || "earning";
      merged[key] = setRecordAmount(val1 ?? val2, Math.round(a1 + a2), type);
    } else if (typeof val1 === "number" || typeof val2 === "number") {
      const n1 = typeof val1 === "number" ? val1 : Number(val1) || 0;
      const n2 = typeof val2 === "number" ? val2 : Number(val2) || 0;
      merged[key] = n1 + n2;
    } else if (!merged[key] && val2) {
      merged[key] = val2;
    }
  }

  // 5. Ensure net_pay is assigned if missing
  if (
    "net_pay" in merged &&
    getRecordAmount(merged.net_pay) === 0 &&
    "gross" in merged &&
    "deduction" in merged
  ) {
    const g = getRecordAmount(merged.gross);
    const d = getRecordAmount(merged.deduction);
    merged.net_pay = setRecordAmount(
      merged.net_pay,
      Math.max(0, g - d),
      "earning",
    );
  }

  return merged;
};

export function SalaryPayrollImportData({
  env,
  fieldConfigs: propFieldConfigs,
  initialSheetsData,
  payrollId: propPayrollId,
  companyId,
  onBack,
}: {
  env: SupabaseEnv;
  fieldConfigs?: FieldConfig[];
  initialSheetsData?: SheetDataEntry[];
  payrollId?: string;
  companyId: string;
  onBack?: (payrollId?: string) => void;
}) {
  const navigation = useNavigation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env });
  const { importData, setImportData } = useImportStoreForSalaryPayroll();

  // Multi-sheet state
  const [sheetsData, setSheetsData] = useState<SheetDataEntry[]>(() => {
    if (initialSheetsData && initialSheetsData.length > 0) {
      return initialSheetsData;
    }
    return [
      {
        sheetName: "Sheet 1",
        fieldConfigs: propFieldConfigs || [],
        records: importData.data || [],
        isImported: false,
        importedCount: 0,
      },
    ];
  });

  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [currentPayrollId, setCurrentPayrollId] = useState<string | undefined>(
    propPayrollId,
  );

  useEffect(() => {
    if (initialSheetsData && initialSheetsData.length > 0) {
      setSheetsData(initialSheetsData);
    }
  }, [initialSheetsData]);

  const activeSheet = sheetsData[activeSheetIndex] || sheetsData[0];
  const activeFieldConfigs =
    activeSheet?.fieldConfigs || propFieldConfigs || [];
  const activeRecords = activeSheet?.records || [];

  const [searchString, setSearchString] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showUnmatchedView, setShowUnmatchedView] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set());

  // Database employees and sites cache
  const [allEmps, setAllEmps] = useState<any[]>([]);
  const [allSites, setAllSites] = useState<any[]>([]);
  const [existingEmployeeIds, setExistingEmployeeIds] = useState<Set<string>>(
    new Set(),
  );

  // Modal states: Bulk Update, Bulk Delete, Add Column, Delete Column
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [bulkColKey, setBulkColKey] = useState("");
  const [bulkScope, setBulkScope] = useState<"all" | "selected">("all");
  const [bulkValue, setBulkValue] = useState("");
  const [selectedIndicesForBulk, setSelectedIndicesForBulk] = useState<
    number[]
  >([]);

  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [indicesToDelete, setIndicesToDelete] = useState<number[]>([]);

  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("earning");
  const [newColDefaultAmount, setNewColDefaultAmount] = useState<number>(0);

  const [colToDelete, setColToDelete] = useState<string | null>(null);

  // Undo / Redo history stacks (stores up to 30 snapshots of all sheets data)
  const [undoStack, setUndoStack] = useState<SheetDataEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<SheetDataEntry[][]>([]);
  const [conflictingIndices, setConflictingIndices] = useState<number[]>([]);

  // Horizontal scroll tracking for Sheets tab bar
  const sheetsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkSheetsScroll = useCallback(() => {
    const el = sheetsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    checkSheetsScroll();
    const timer = setTimeout(checkSheetsScroll, 80);
    window.addEventListener("resize", checkSheetsScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkSheetsScroll);
    };
  }, [checkSheetsScroll, sheetsData]);

  useEffect(() => {
    const el = sheetsScrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(
      `[data-active="true"]`,
    ) as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
    checkSheetsScroll();
  }, [activeSheetIndex, checkSheetsScroll]);

  const pushToHistory = useCallback((currentSheets: SheetDataEntry[]) => {
    setUndoStack((prev) => [
      ...prev.slice(-29),
      structuredClone(currentSheets),
    ]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    setRedoStack((prev) => [...prev.slice(-29), structuredClone(sheetsData)]);
    setUndoStack(newUndoStack);
    setSheetsData(previousState);

    const safeSheetIdx = Math.min(activeSheetIndex, previousState.length - 1);
    const currentSheet = previousState[safeSheetIdx];
    if (currentSheet) {
      setImportData({
        ...importData,
        data: currentSheet.records,
      });
    }
  }, [undoStack, sheetsData, activeSheetIndex, importData, setImportData]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    setUndoStack((prev) => [...prev.slice(-29), structuredClone(sheetsData)]);
    setRedoStack(newRedoStack);
    setSheetsData(nextState);

    const safeSheetIdx = Math.min(activeSheetIndex, nextState.length - 1);
    const currentSheet = nextState[safeSheetIdx];
    if (currentSheet) {
      setImportData({
        ...importData,
        data: currentSheet.records,
      });
    }
  }, [redoStack, sheetsData, activeSheetIndex, importData, setImportData]);

  // Global keyboard shortcuts for Undo (Ctrl+Z / Cmd+Z) and Redo (Ctrl+Y / Cmd+Y / Cmd+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (!cmdOrCtrl) return;

      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (
        e.key.toLowerCase() === "y" ||
        (e.key.toLowerCase() === "z" && e.shiftKey)
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  // Fetch all company employees and sites once (or on refreshTrigger)
  useEffect(() => {
    let active = true;
    async function fetchCompanyMasterData() {
      let emps: any[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("employees")
          .select(
            "id, employee_code, first_name, middle_name, last_name, employee_statutory_details(uan_number, esic_number), work_details(site_id, sites(name))",
          )
          .eq("company_id", companyId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error || !data || data.length === 0) break;
        emps = [...emps, ...data];
        if (data.length < pageSize) break;
        page++;
      }

      const { data: sitesData } = await supabase
        .from("sites")
        .select("id, name")
        .eq("company_id", companyId);

      if (active) {
        setAllEmps(emps);
        setAllSites(sitesData || []);
      }
    }

    fetchCompanyMasterData();
    return () => {
      active = false;
    };
  }, [supabase, companyId, refreshTrigger]);

  // Fetch existing salary entries for payrollId to detect existing records
  useEffect(() => {
    let active = true;
    async function fetchExistingEntries() {
      if (!currentPayrollId) {
        setExistingEmployeeIds(new Set());
        return;
      }
      const { data: existingEntries, error } = await supabase
        .from("salary_entries")
        .select("monthly_attendance(employee_id)")
        .eq("payroll_id", currentPayrollId);

      if (!error && existingEntries && active) {
        const empIds = new Set<string>();
        for (const entry of existingEntries) {
          const ma = entry.monthly_attendance;
          if (ma) {
            if (Array.isArray(ma)) {
              if (ma[0]?.employee_id) empIds.add(ma[0].employee_id);
            } else if ((ma as any).employee_id) {
              empIds.add((ma as any).employee_id);
            }
          }
        }
        setExistingEmployeeIds(empIds);
      }
    }

    fetchExistingEntries();
    return () => {
      active = false;
    };
  }, [currentPayrollId, supabase]);

  // Helpers for employee and site matching
  const normalizeSiteName = useCallback((name: any) => {
    return String(name || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "");
  }, []);

  const getNormalizedWords = useCallback((val: any) => {
    if (!val) return [];
    let s = String(val).toLowerCase();
    s = s.replace(/\bnull\b/g, "");
    return s
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .sort();
  }, []);

  const getEmployeeSiteNames = useCallback((emp: any): string[] => {
    if (!emp.work_details) return [];
    const wds = Array.isArray(emp.work_details)
      ? emp.work_details
      : [emp.work_details];
    return wds
      .map((wd: any) => wd?.sites?.name || wd?.site?.name)
      .filter(Boolean);
  }, []);

  const isSiteMatch = useCallback(
    (sheetName: string, siteNames: string[]) => {
      if (!sheetName || siteNames.length === 0) return false;
      const normalizedSheet = normalizeSiteName(sheetName);
      if (!normalizedSheet) return false;

      return siteNames.some((siteName) => {
        const normalizedSite = normalizeSiteName(siteName);
        if (!normalizedSite) return false;
        return (
          normalizedSheet === normalizedSite ||
          normalizedSheet.includes(normalizedSite) ||
          normalizedSite.includes(normalizedSheet)
        );
      });
    },
    [normalizeSiteName],
  );

  const isSheetNameASite = useCallback(
    (sheetName: string) => {
      if (!sheetName) return false;
      const allSiteNames = allSites.map((s) => s.name).filter(Boolean);
      return isSiteMatch(sheetName, allSiteNames);
    },
    [allSites, isSiteMatch],
  );

  // Duplicate employee detection within the active sheet:
  // Matches when employee_name, employee_code, uan_no (or uan_number), and esic_no (or esic_number)
  // are all identical together.
  const duplicatesInfo = useMemo(() => {
    const seenMap = new Map<string, number>();
    const duplicateMap = new Map<number, number>();
    const duplicatesList: Array<{ dupIndex: number; primaryIndex: number }> =
      [];

    activeRecords.forEach((rec: any, idx: number) => {
      if (!rec || rec.is_site_header) return;

      const rawName = rec.employee_name ?? "";
      const rawCode = rec.employee_code ?? "";
      const rawUan = rec.uan_no ?? rec.uan_number ?? "";
      const rawEsic = rec.esic_no ?? rec.esic_number ?? "";

      const normName = String(rawName)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      const normCode = String(rawCode).trim().toLowerCase();
      const normUan = String(rawUan).trim().toLowerCase();
      const normEsic = String(rawEsic).trim().toLowerCase();

      // If both name and code are completely empty, skip (e.g. spacer rows)
      if (!normName && !normCode) return;

      const key = `${normName}__${normCode}__${normUan}__${normEsic}`;

      if (seenMap.has(key)) {
        const primaryIdx = seenMap.get(key)!;
        duplicateMap.set(idx, primaryIdx);
        duplicatesList.push({ dupIndex: idx, primaryIndex: primaryIdx });
      } else {
        seenMap.set(key, idx);
      }
    });

    return {
      duplicateMap,
      duplicatesList,
      duplicateIndices: new Set(duplicateMap.keys()),
    };
  }, [activeRecords]);

  // Derive enrichedData for activeSheet.records
  const enrichedData = useMemo(() => {
    const normalize = (val: any) =>
      String(val || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, "");

    let currentSiteName: string | null = null;

    return activeRecords.map((item: any, originalIndex: number) => {
      const rawName = (item as any).employee_name || "";
      const normalizedRawName = normalizeSiteName(rawName);

      // 1. Check if the row's Name column matches any database site name
      const nameMatchingSite = allSites.find((s) => {
        const normalizedSite = normalizeSiteName(s.name);
        return (
          normalizedSite &&
          normalizedRawName &&
          (normalizedRawName === normalizedSite ||
            normalizedRawName.includes(normalizedSite) ||
            normalizedSite.includes(normalizedRawName))
        );
      });

      // 2. Check if any cell in the raw row matches any database site name
      let cellMatchingSiteName: string | null = null;
      const rawRow = (item as any).raw_row || {};
      const cells = Object.values(rawRow).map((v) => String(v || "").trim());
      for (const cell of cells) {
        if (!cell) continue;
        const normalizedCell = normalizeSiteName(cell);
        const matchedSite = allSites.find((s) => {
          const normalizedSite = normalizeSiteName(s.name);
          return (
            normalizedSite &&
            normalizedCell &&
            (normalizedCell === normalizedSite ||
              normalizedCell.includes(normalizedSite) ||
              normalizedSite.includes(normalizedCell))
          );
        });
        if (matchedSite) {
          cellMatchingSiteName = matchedSite.name;
          break;
        }
      }

      if (nameMatchingSite) {
        currentSiteName = nameMatchingSite.name;
      } else if (cellMatchingSiteName) {
        currentSiteName = cellMatchingSiteName;
      }

      const isCodeEmpty =
        !(item as any).employee_code ||
        String((item as any).employee_code).trim() === "";
      const rowUan = item.uan_no || (item as any).uan_number;
      const rowEsic = item.esic_no || (item as any).esic_number;
      const isUanEmpty = !rowUan || String(rowUan).trim() === "";
      const isSiteHeader = !!nameMatchingSite && isCodeEmpty && isUanEmpty;

      if (isSiteHeader) {
        return {
          ...item,
          is_site_header: true,
          is_new_employee: false,
          is_missing_matching_key: false,
          employee_id: null,
          has_existing_salary_entry: false,
          _sheetRowIndex: originalIndex,
        };
      }

      const itemCode = normalize(item.employee_code);
      const itemUan = normalize(rowUan);
      const itemEsic = normalize(rowEsic);
      const sheetName = item.sheet_name || activeSheet?.sheetName;
      const activeSite = currentSiteName || sheetName;

      const matchedData = allEmps?.find((e) => {
        if (
          isValidIdentifier(item.employee_code) &&
          isValidIdentifier(e.employee_code) &&
          normalize(e.employee_code) === itemCode
        )
          return true;

        const statutoryDetails = Array.isArray(e.employee_statutory_details)
          ? e.employee_statutory_details[0]
          : e.employee_statutory_details;

        const uan = statutoryDetails?.uan_number;
        if (
          isValidIdentifier(rowUan) &&
          isValidIdentifier(uan) &&
          normalize(uan) === itemUan
        )
          return true;

        const esic = statutoryDetails?.esic_number;
        if (
          isValidIdentifier(rowEsic) &&
          isValidIdentifier(esic) &&
          normalize(esic) === itemEsic
        )
          return true;

        return false;
      });

      let finalMatchedData = matchedData;
      if (!finalMatchedData && item.employee_name) {
        const itemNameWords = getNormalizedWords(item.employee_name);
        if (itemNameWords.length > 0) {
          let candidates = allEmps
            ?.map((e) => {
              const dbWords = getNormalizedWords(
                `${e.first_name} ${e.middle_name || ""} ${e.last_name || ""}`,
              );

              if (itemNameWords.length === 0 || dbWords.length === 0)
                return null;

              const inputSet = new Set(itemNameWords);
              const targetSet = new Set(dbWords);

              const common = itemNameWords.filter((w) => targetSet.has(w));
              const inputLeftovers = itemNameWords.filter(
                (w) => !targetSet.has(w),
              );
              const targetLeftovers = dbWords.filter((w) => !inputSet.has(w));

              const isExact =
                inputLeftovers.length === 0 && targetLeftovers.length === 0;
              if (isExact) {
                return { employee: e, score: 0 };
              }

              const minCommon = Math.min(
                itemNameWords.length,
                dbWords.length,
                2,
              );
              const w1 = inputLeftovers[0];
              const w2 = targetLeftovers[0];
              const hasInitialMatch =
                inputLeftovers.length === 1 &&
                targetLeftovers.length === 1 &&
                w1 &&
                w2 &&
                ((w1.length === 1 && w2.startsWith(w1)) ||
                  (w2.length === 1 && w1.startsWith(w2)));

              const adjustedMinCommon = hasInitialMatch ? 1 : minCommon;
              if (common.length < adjustedMinCommon) return null;

              if (inputLeftovers.length <= 1 && targetLeftovers.length <= 1) {
                if (
                  inputLeftovers.length === 0 ||
                  targetLeftovers.length === 0
                ) {
                  const leftoversCount =
                    inputLeftovers.length + targetLeftovers.length;
                  return { employee: e, score: 10 + leftoversCount };
                }
                const w1_inner = inputLeftovers[0];
                const w2_inner = targetLeftovers[0];
                if (
                  (w1_inner.length === 1 && w2_inner.startsWith(w1_inner)) ||
                  (w2_inner.length === 1 && w1_inner.startsWith(w2_inner))
                ) {
                  return { employee: e, score: 5 };
                }
              }
              return null;
            })
            .filter((c): c is { employee: any; score: number } => c !== null);

          if (candidates && candidates.length > 0) {
            if (activeSite && isSheetNameASite(activeSite)) {
              candidates = candidates.filter((c) => {
                const candidateSiteNames = getEmployeeSiteNames(c.employee);
                if (candidateSiteNames.length === 0) return true;
                return isSiteMatch(activeSite, candidateSiteNames);
              });

              candidates.sort((a, b) => {
                const aSiteNames = getEmployeeSiteNames(a.employee);
                const bSiteNames = getEmployeeSiteNames(b.employee);
                const aMatch =
                  aSiteNames.length > 0 && isSiteMatch(activeSite, aSiteNames);
                const bMatch =
                  bSiteNames.length > 0 && isSiteMatch(activeSite, bSiteNames);

                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;

                return a.score - b.score;
              });
            } else {
              candidates.sort((a, b) => a.score - b.score);
            }

            if (candidates.length > 0) {
              finalMatchedData = candidates[0].employee;
            }
          }
        }
      }

      const employeeId = finalMatchedData?.id || null;
      const hasExistingSalaryEntry = employeeId
        ? existingEmployeeIds.has(employeeId)
        : false;

      return {
        ...item,
        employee_name: finalMatchedData
          ? `${finalMatchedData.first_name} ${finalMatchedData.middle_name || ""} ${finalMatchedData.last_name || ""}`
              .replace(/\s+/g, " ")
              .trim()
          : item.employee_name || "Unknown",
        employee_code: finalMatchedData
          ? finalMatchedData.employee_code
          : item.employee_code,
        uan_no:
          item.uan_no ||
          (item as any).uan_number ||
          (finalMatchedData && "employee_statutory_details" in finalMatchedData
            ? Array.isArray(finalMatchedData.employee_statutory_details)
              ? (finalMatchedData.employee_statutory_details[0] as any)
                  ?.uan_number
              : (finalMatchedData.employee_statutory_details as any)?.uan_number
            : undefined),
        esic_no:
          item.esic_no ||
          (item as any).esic_number ||
          (finalMatchedData && "employee_statutory_details" in finalMatchedData
            ? Array.isArray(finalMatchedData.employee_statutory_details)
              ? (finalMatchedData.employee_statutory_details[0] as any)
                  ?.esic_number
              : (finalMatchedData.employee_statutory_details as any)
                  ?.esic_number
            : undefined),
        uan_number:
          item.uan_no ||
          (item as any).uan_number ||
          (finalMatchedData && "employee_statutory_details" in finalMatchedData
            ? Array.isArray(finalMatchedData.employee_statutory_details)
              ? (finalMatchedData.employee_statutory_details[0] as any)
                  ?.uan_number
              : (finalMatchedData.employee_statutory_details as any)?.uan_number
            : undefined),
        esic_number:
          item.esic_no ||
          (item as any).esic_number ||
          (finalMatchedData && "employee_statutory_details" in finalMatchedData
            ? Array.isArray(finalMatchedData.employee_statutory_details)
              ? (finalMatchedData.employee_statutory_details[0] as any)
                  ?.esic_number
              : (finalMatchedData.employee_statutory_details as any)
                  ?.esic_number
            : undefined),
        is_new_employee: !finalMatchedData,
        employee_id: employeeId,
        has_existing_salary_entry: hasExistingSalaryEntry,
        _sheetRowIndex: originalIndex,
        is_duplicate: duplicatesInfo.duplicateMap.has(originalIndex),
        primary_index: duplicatesInfo.duplicateMap.get(originalIndex),
        primary_sr_no: (() => {
          const pIdx = duplicatesInfo.duplicateMap.get(originalIndex);
          if (pIdx === undefined) return undefined;
          const pRec = activeRecords[pIdx];
          return pRec?.sr_no ? Number(pRec.sr_no) : pIdx + 1;
        })(),
      };
    });
  }, [
    activeRecords,
    allEmps,
    allSites,
    activeSheet?.sheetName,
    duplicatesInfo,
    existingEmployeeIds,
    getEmployeeSiteNames,
    getNormalizedWords,
    isSheetNameASite,
    isSiteMatch,
    normalizeSiteName,
  ]);

  // Filter enriched data with searchString for the table
  const tableData = useMemo(() => {
    if (!searchString.trim()) {
      return enrichedData.filter((item) => !item.is_site_header);
    }
    const lower = searchString.toLowerCase();
    return enrichedData
      .filter((item) => !item.is_site_header)
      .filter((item) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== "avatar" &&
            key !== "employee_id" &&
            key !== "is_new_employee" &&
            key !== "has_existing_salary_entry" &&
            String(value).toLowerCase().includes(lower),
        ),
      );
  }, [enrichedData, searchString]);

  const unmatchedEmployees = useMemo(() => {
    const unmatched = enrichedData
      .filter(
        (item) =>
          item.is_new_employee && !item.is_site_header && !item.is_duplicate,
      )
      .reduce((acc: any[], current) => {
        const hasMatch = acc.some((item) => {
          if (
            isValidIdentifier(item.employee_code) &&
            isValidIdentifier(current.employee_code) &&
            item.employee_code === current.employee_code
          ) {
            return true;
          }
          if (
            isValidIdentifier(item.uan_number) &&
            isValidIdentifier(current.uan_number) &&
            item.uan_number === current.uan_number
          ) {
            return true;
          }
          if (
            isValidIdentifier(item.employee_name) &&
            isValidIdentifier(current.employee_name) &&
            item.employee_name.toLowerCase().trim() !== "unknown" &&
            item.employee_name.toLowerCase().trim() ===
              current.employee_name.toLowerCase().trim()
          ) {
            return true;
          }
          return false;
        });
        if (!hasMatch) {
          acc.push(current);
        }
        return acc;
      }, []);

    return unmatched.filter((emp) => {
      const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
      return !skippedKeys.has(key);
    });
  }, [enrichedData, skippedKeys]);

  const handleSkip = (emp: any) => {
    const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
    setSkippedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleSkipAll = () => {
    setSkippedKeys((prev) => {
      const next = new Set(prev);
      for (const emp of unmatchedEmployees) {
        const key = `${emp.employee_code || ""}-${emp.uan_number || ""}-${emp.employee_name || ""}`;
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    if (navigation.state === "idle" && isImporting) {
      setIsImporting(false);
    }
  }, [navigation.state, isImporting]);

  // Pure cell value updater
  const updateCellValue = useCallback(
    (
      item: any,
      colKey: string,
      rawNewValue: string | number,
      fieldConfigsList: FieldConfig[],
    ) => {
      const newItem = { ...item };
      const config = fieldConfigsList.find((f) => f.key === colKey);
      const isDeduction =
        config?.type === "deduction" ||
        ["pf", "esic", "pt", "lwf", "deduction", "advance", "expense"].includes(
          colKey,
        );
      const isEarning =
        config?.type === "earning" ||
        (!isDeduction &&
          ![
            "employee_name",
            "employee_code",
            "uan_number",
            "uan_no",
            "esic_number",
            "esic_no",
            "working_days",
            "present_days",
            "ph",
            "pl",
            "cl",
            "ml",
            "el",
            "ot_hours",
            "ot_days",
            "sheet_name",
            "raw_row",
            "avatar",
            "employee_id",
            "is_new_employee",
            "has_existing_salary_entry",
          ].includes(colKey));

      if (isEarning || isDeduction) {
        const existingVal = item[colKey];
        const oldAmount = getRecordAmount(existingVal);
        const parsedAmount =
          typeof rawNewValue === "number"
            ? rawNewValue
            : Number(
                String(rawNewValue || "")
                  .trim()
                  .replace(/,/g, ""),
              ) || 0;
        const delta = parsedAmount - oldAmount;

        newItem[colKey] = {
          amount: parsedAmount,
          type: isDeduction ? "deduction" : "earning",
          consider_for_epf: existingVal?.consider_for_epf ?? false,
          consider_for_esic: existingVal?.consider_for_esic ?? false,
        };

        if (delta !== 0) {
          const lowerColKey = colKey.toLowerCase();
          if (
            isEarning &&
            lowerColKey !== "gross" &&
            lowerColKey !== "net_pay"
          ) {
            if ("gross" in newItem) {
              const curGross = getRecordAmount(newItem.gross);
              newItem.gross = setRecordAmount(
                newItem.gross,
                curGross + delta,
                "earning",
              );
            }
            if ("net_pay" in newItem) {
              const curNet = getRecordAmount(newItem.net_pay);
              newItem.net_pay = setRecordAmount(
                newItem.net_pay,
                Math.max(0, curNet + delta),
                "earning",
              );
            }
          } else if (isDeduction && lowerColKey !== "deduction") {
            const dedKey = "deduction" in newItem ? "deduction" : null;
            if (dedKey) {
              const curDed = getRecordAmount(newItem[dedKey]);
              newItem[dedKey] = setRecordAmount(
                newItem[dedKey],
                curDed + delta,
                "deduction",
              );
            }
            if ("net_pay" in newItem) {
              const curNet = getRecordAmount(newItem.net_pay);
              newItem.net_pay = setRecordAmount(
                newItem.net_pay,
                Math.max(0, curNet - delta),
                "earning",
              );
            }
          }
        }
      } else if (
        [
          "working_days",
          "present_days",
          "ph",
          "pl",
          "cl",
          "ml",
          "el",
          "ot_hours",
          "ot_days",
        ].includes(colKey)
      ) {
        const parsed =
          typeof rawNewValue === "number"
            ? rawNewValue
            : Number.isNaN(Number(rawNewValue))
              ? rawNewValue
              : Number(rawNewValue);
        newItem[colKey] = parsed;
      } else {
        const strVal = String(rawNewValue ?? "").trim();
        newItem[colKey] = strVal;
        if (colKey === "uan_number") newItem.uan_no = strVal;
        if (colKey === "esic_number") newItem.esic_no = strVal;
        if (colKey === "uan_no") newItem.uan_number = strVal;
        if (colKey === "esic_no") newItem.esic_number = strVal;
      }

      return newItem;
    },
    [],
  );

  // Cell change handler
  const handleCellChange = useCallback(
    (rowIndex: number, colKey: string, rawNewValue: string) => {
      const targetRecord = activeRecords[rowIndex];
      if (
        targetRecord?.has_error ||
        targetRecord?.is_disabled ||
        conflictingIndices.includes(rowIndex)
      ) {
        toast({
          title: "Row Disabled",
          description:
            targetRecord?.error_message ||
            "This row has an error and is disabled for mutations.",
          variant: "destructive",
        });
        return;
      }

      pushToHistory(sheetsData);

      setSheetsData((prevSheets) => {
        const updated = [...prevSheets];
        const sheet = { ...updated[activeSheetIndex] };
        const records = [...sheet.records];
        if (rowIndex >= 0 && rowIndex < records.length) {
          records[rowIndex] = updateCellValue(
            records[rowIndex],
            colKey,
            rawNewValue,
            activeFieldConfigs,
          );
          sheet.records = records;
          updated[activeSheetIndex] = sheet;
        }
        return updated;
      });
    },
    [
      activeRecords,
      conflictingIndices,
      sheetsData,
      pushToHistory,
      activeSheetIndex,
      activeFieldConfigs,
      updateCellValue,
      toast,
    ],
  );

  // Bulk cell change handler (e.g. from copy-paste)
  const handleBulkChange = useCallback(
    (
      updates: Array<{ rowIndex: number; colKey: string; newValue: string }>,
    ) => {
      const validUpdates = updates.filter(({ rowIndex }) => {
        const rec = activeRecords[rowIndex];
        return (
          !rec?.has_error &&
          !rec?.is_disabled &&
          !conflictingIndices.includes(rowIndex)
        );
      });
      if (validUpdates.length === 0) return;

      pushToHistory(sheetsData);

      setSheetsData((prevSheets) => {
        const updated = [...prevSheets];
        const sheet = { ...updated[activeSheetIndex] };
        const records = [...sheet.records];
        for (const { rowIndex, colKey, newValue } of validUpdates) {
          if (rowIndex >= 0 && rowIndex < records.length) {
            records[rowIndex] = updateCellValue(
              records[rowIndex],
              colKey,
              newValue,
              activeFieldConfigs,
            );
          }
        }
        sheet.records = records;
        updated[activeSheetIndex] = sheet;
        return updated;
      });
    },
    [
      activeRecords,
      conflictingIndices,
      sheetsData,
      pushToHistory,
      activeSheetIndex,
      activeFieldConfigs,
      updateCellValue,
    ],
  );

  // Switch sheet handler: preserves all changes of current and target sheet
  const handleSwitchSheet = useCallback(
    (targetIndex: number) => {
      if (targetIndex >= 0 && targetIndex < sheetsData.length) {
        setActiveSheetIndex(targetIndex);
        setSearchString("");
        setImportData({
          ...importData,
          data: sheetsData[targetIndex].records,
        });
      }
    },
    [sheetsData, importData, setImportData],
  );

  // Add Column handler
  const confirmAddColumn = () => {
    const cleanName = newColName.trim();
    if (!cleanName) return;
    const colKey = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    if (activeFieldConfigs.some((f) => f.key.toLowerCase() === colKey)) {
      toast({
        title: "Column Already Exists",
        description: `Column "${cleanName}" already exists on this sheet.`,
        variant: "destructive",
      });
      return;
    }

    const defaultAmount = Number(newColDefaultAmount) || 0;
    const colType = (newColType === "deduction" ? "deduction" : "earning") as
      | "earning"
      | "deduction";

    pushToHistory(sheetsData);

    setSheetsData((prevSheets) => {
      const updated = [...prevSheets];
      const sheet = { ...updated[activeSheetIndex] };

      const insertIndex = getInsertIndexForNewColumn(
        sheet.fieldConfigs,
        colType,
      );
      const newConfigs: FieldConfig[] = [...sheet.fieldConfigs];
      newConfigs.splice(insertIndex, 0, { key: colKey, type: colType });

      const newRecords = sheet.records.map((rec) => {
        const newRec = {
          ...rec,
          [colKey]: {
            amount: defaultAmount,
            type: colType,
            consider_for_epf: false,
            consider_for_esic: false,
          },
        };

        if (defaultAmount !== 0) {
          if (colType === "earning") {
            // "if it s earning then it should be just before left side of gross and gross value should increase with new column value and same for net pay"
            if ("gross" in newRec) {
              const curGross = getRecordAmount(newRec.gross);
              newRec.gross = setRecordAmount(
                newRec.gross,
                curGross + defaultAmount,
                "earning",
              );
            }
            if ("net_pay" in newRec) {
              const curNet = getRecordAmount(newRec.net_pay);
              newRec.net_pay = setRecordAmount(
                newRec.net_pay,
                curNet + defaultAmount,
                "earning",
              );
            }
          } else {
            // "and same in deduction it should be just beside deduction, deduction total increase and net pay change accordingly"
            const dedKey = "deduction" in newRec ? "deduction" : null;
            if (dedKey) {
              const curDed = getRecordAmount(newRec[dedKey]);
              newRec[dedKey] = setRecordAmount(
                newRec[dedKey],
                curDed + defaultAmount,
                "deduction",
              );
            }
            if ("net_pay" in newRec) {
              const curNet = getRecordAmount(newRec.net_pay);
              newRec.net_pay = setRecordAmount(
                newRec.net_pay,
                Math.max(0, curNet - defaultAmount),
                "earning",
              );
            }
          }
        }

        return newRec;
      });

      sheet.fieldConfigs = newConfigs;
      sheet.records = newRecords;
      updated[activeSheetIndex] = sheet;
      return updated;
    });

    setIsAddColOpen(false);
    setNewColName("");
    setNewColDefaultAmount(0);
  };

  // Delete Column handler
  const confirmDeleteColumn = () => {
    if (!colToDelete) return;
    const targetKey = colToDelete.toLowerCase();
    const targetConfig = activeFieldConfigs.find(
      (f) => f.key.toLowerCase() === targetKey,
    );
    const isEarning =
      targetConfig?.type === "earning" &&
      targetKey !== "gross" &&
      targetKey !== "net_pay";
    const isDeduction =
      targetConfig?.type === "deduction" && targetKey !== "deduction";

    pushToHistory(sheetsData);

    setSheetsData((prevSheets) => {
      const updated = [...prevSheets];
      const sheet = { ...updated[activeSheetIndex] };
      const newConfigs = sheet.fieldConfigs.filter(
        (f) => f.key.toLowerCase() !== targetKey,
      );
      const newRecords = sheet.records.map((rec) => {
        const copy = { ...rec };
        const colVal = copy[targetKey];
        const removedAmount = getRecordAmount(colVal);

        if (removedAmount !== 0) {
          if (isEarning) {
            if ("gross" in copy) {
              const curGross = getRecordAmount(copy.gross);
              copy.gross = setRecordAmount(
                copy.gross,
                Math.max(0, curGross - removedAmount),
                "earning",
              );
            }
            if ("net_pay" in copy) {
              const curNet = getRecordAmount(copy.net_pay);
              copy.net_pay = setRecordAmount(
                copy.net_pay,
                Math.max(0, curNet - removedAmount),
                "earning",
              );
            }
          } else if (isDeduction) {
            const dedKey = "deduction" in copy ? "deduction" : null;
            if (dedKey) {
              const curDed = getRecordAmount(copy[dedKey]);
              copy[dedKey] = setRecordAmount(
                copy[dedKey],
                Math.max(0, curDed - removedAmount),
                "deduction",
              );
            }
            if ("net_pay" in copy) {
              const curNet = getRecordAmount(copy.net_pay);
              copy.net_pay = setRecordAmount(
                copy.net_pay,
                curNet + removedAmount,
                "earning",
              );
            }
          }
        }

        // Keep copy[targetKey] intact so row values are preserved
        return copy;
      });
      sheet.fieldConfigs = newConfigs;
      sheet.records = newRecords;
      updated[activeSheetIndex] = sheet;
      return updated;
    });

    setColToDelete(null);
  };

  // Rename Column handler
  const handleRenameColumn = useCallback(
    (oldKey: string, newName: string) => {
      const cleanName = newName.trim();
      if (!cleanName) return;
      const newKey = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (oldKey.toLowerCase() === newKey.toLowerCase()) return;

      if (NON_DELETABLE_KEYS.has(newKey.toLowerCase())) {
        toast({
          title: "Reserved Column Name",
          description: `"${cleanName}" is a reserved system column name.`,
          variant: "destructive",
        });
        return;
      }

      if (
        activeFieldConfigs.some(
          (f) =>
            f.key.toLowerCase() === newKey.toLowerCase() &&
            f.key.toLowerCase() !== oldKey.toLowerCase(),
        )
      ) {
        toast({
          title: "Column Already Exists",
          description: `A column named "${cleanName}" already exists on sheet "${activeSheet.sheetName}".`,
          variant: "destructive",
        });
        return;
      }

      pushToHistory(sheetsData);

      setSheetsData((prevSheets) => {
        const updated = [...prevSheets];
        const sheet = { ...updated[activeSheetIndex] };

        // 1. Update fieldConfigs
        const newConfigs = sheet.fieldConfigs.map((f) => {
          if (f.key.toLowerCase() === oldKey.toLowerCase()) {
            return { ...f, key: newKey };
          }
          return f;
        });

        // 2. Update records keys
        const newRecords = sheet.records.map((rec) => {
          const copy = { ...rec };
          if (oldKey in copy) {
            copy[newKey] = copy[oldKey];
            delete copy[oldKey];
          }
          return copy;
        });

        sheet.fieldConfigs = newConfigs;
        sheet.records = newRecords;
        updated[activeSheetIndex] = sheet;
        return updated;
      });
    },
    [activeFieldConfigs, activeSheetIndex],
  );

  // Bulk Delete Rows handler
  const confirmBulkDelete = () => {
    if (deleteConfirmText !== "DELETE" || indicesToDelete.length === 0) return;

    // Do not delete rows that are disabled or have errors
    const validIndicesToDelete = indicesToDelete.filter((idx) => {
      const rec = activeRecords[idx];
      return (
        !rec?.has_error &&
        !rec?.is_disabled &&
        !conflictingIndices.includes(idx)
      );
    });

    if (validIndicesToDelete.length === 0) {
      toast({
        title: "Action Skipped",
        description:
          "Selected rows are disabled or have errors and cannot be deleted.",
        variant: "warning",
      });
      setIsBulkDeleteOpen(false);
      setDeleteConfirmText("");
      setIndicesToDelete([]);
      return;
    }

    pushToHistory(sheetsData);

    setSheetsData((prevSheets) => {
      const updated = [...prevSheets];
      const sheet = { ...updated[activeSheetIndex] };
      const targetSet = new Set(validIndicesToDelete);
      // Strictly preserves original Excel relative order
      const remaining = sheet.records.filter((_, idx) => !targetSet.has(idx));
      sheet.records = remaining;
      updated[activeSheetIndex] = sheet;
      return updated;
    });

    setIsBulkDeleteOpen(false);
    setDeleteConfirmText("");
    setIndicesToDelete([]);
  };

  // Bulk Update Column handler
  const confirmBulkUpdate = () => {
    if (!bulkColKey || bulkValue === "") return;

    pushToHistory(sheetsData);

    setSheetsData((prevSheets) => {
      const updated = [...prevSheets];
      const sheet = { ...updated[activeSheetIndex] };
      const targetSet =
        bulkScope === "selected" ? new Set(selectedIndicesForBulk) : null;

      const records = sheet.records.map((rec, idx) => {
        if (targetSet && !targetSet.has(idx)) return rec;
        // Skip disabled rows or rows with error
        if (
          rec.has_error ||
          rec.is_disabled ||
          conflictingIndices.includes(idx)
        ) {
          return rec;
        }
        return updateCellValue(rec, bulkColKey, bulkValue, activeFieldConfigs);
      });

      sheet.records = records;
      updated[activeSheetIndex] = sheet;
      return updated;
    });

    setIsBulkUpdateOpen(false);
    setBulkValue("");
    setBulkColKey("");
  };

  // Editable columns for Bulk Update dialog
  const editableColOptions = useMemo(() => {
    return activeFieldConfigs
      .filter((f) => f.key !== "sr_no" && f.key !== "select")
      .map((f) => ({
        label: replaceUnderscore(f.key) || f.key,
        value: f.key,
      }));
  }, [activeFieldConfigs]);

  // Handler for merging a single duplicate row into its primary row
  const handleMergeDuplicate = useCallback(
    (dupSheetIdx: number) => {
      const primaryIdx = duplicatesInfo.duplicateMap.get(dupSheetIdx);
      if (primaryIdx === undefined) return;

      const primaryRecord = activeRecords[primaryIdx];
      const dupRecord = activeRecords[dupSheetIdx];
      if (!primaryRecord || !dupRecord) return;

      const primaryPresent = Number(primaryRecord.present_days) || 0;
      const dupPresent = Number(dupRecord.present_days) || 0;
      const totalPresent = primaryPresent + dupPresent;

      if (totalPresent > 31) {
        toast({
          title: "Cannot Merge Rows",
          description: `Cannot merge rows for "${primaryRecord.employee_name || "Employee"}": combined present days (${totalPresent}) would exceed the maximum limit of 31 days.`,
          variant: "destructive",
        });
        return;
      }

      pushToHistory(sheetsData);

      setSheetsData((prevSheets) => {
        const updated = [...prevSheets];
        const sheet = { ...updated[activeSheetIndex] };
        const records = [...sheet.records];

        if (!records[primaryIdx] || !records[dupSheetIdx]) return prevSheets;

        records[primaryIdx] = mergeTwoRecords(
          records[primaryIdx],
          records[dupSheetIdx],
          activeFieldConfigs,
        );
        records.splice(dupSheetIdx, 1);

        sheet.records = records;
        updated[activeSheetIndex] = sheet;
        return updated;
      });
    },
    [
      duplicatesInfo.duplicateMap,
      activeRecords,
      pushToHistory,
      sheetsData,
      activeSheetIndex,
      activeFieldConfigs,
      toast,
    ],
  );

  // Handler for merging all duplicate rows into their primary rows at once
  const handleMergeAllDuplicates = useCallback(() => {
    if (duplicatesInfo.duplicatesList.length === 0) return;

    const records = activeRecords;
    const primaryToDups = new Map<number, number[]>();
    for (const { dupIndex, primaryIndex } of duplicatesInfo.duplicatesList) {
      if (!primaryToDups.has(primaryIndex)) {
        primaryToDups.set(primaryIndex, []);
      }
      primaryToDups.get(primaryIndex)!.push(dupIndex);
    }

    const exceedingNames: string[] = [];
    const validPrimaryToDups = new Map<number, number[]>();
    const validDupIndicesSet = new Set<number>();

    for (const [primaryIdx, dupIndices] of primaryToDups.entries()) {
      const primaryRecord = records[primaryIdx];
      if (!primaryRecord) continue;

      let totalPresent = Number(primaryRecord.present_days) || 0;
      for (const dupIdx of dupIndices) {
        totalPresent += Number(records[dupIdx]?.present_days) || 0;
      }

      if (totalPresent > 31) {
        exceedingNames.push(
          `${primaryRecord.employee_name || "Employee"} (${totalPresent} days)`,
        );
      } else {
        validPrimaryToDups.set(primaryIdx, dupIndices);
        for (const dupIdx of dupIndices) {
          validDupIndicesSet.add(dupIdx);
        }
      }
    }

    if (exceedingNames.length > 0) {
      toast({
        title: "Cannot Merge Some Duplicate Rows",
        description: `Cannot merge rows where combined present days exceed 31: ${exceedingNames.join(", ")}.`,
        variant: "destructive",
      });
    }

    if (validPrimaryToDups.size === 0) {
      return;
    }

    pushToHistory(sheetsData);

    setSheetsData((prevSheets) => {
      const updated = [...prevSheets];
      const sheet = { ...updated[activeSheetIndex] };
      const currentRecords = [...sheet.records];

      for (const [primaryIdx, dupIndices] of validPrimaryToDups.entries()) {
        let merged = currentRecords[primaryIdx];
        for (const dupIdx of dupIndices) {
          if (currentRecords[dupIdx]) {
            merged = mergeTwoRecords(
              merged,
              currentRecords[dupIdx],
              activeFieldConfigs,
            );
          }
        }
        currentRecords[primaryIdx] = merged;
      }

      sheet.records = currentRecords.filter(
        (_, idx) => !validDupIndicesSet.has(idx),
      );
      updated[activeSheetIndex] = sheet;
      return updated;
    });
  }, [
    duplicatesInfo.duplicatesList,
    activeRecords,
    pushToHistory,
    sheetsData,
    activeSheetIndex,
    activeFieldConfigs,
    toast,
  ]);

  // Memoized table column definitions with mergeDuplicate callback
  const tableColumns = useMemo(
    () => ImportedDataColumns(activeFieldConfigs, handleMergeDuplicate),
    [activeFieldConfigs, handleMergeDuplicate],
  );

  // Sheet-by-sheet import handler
  const handleFinalImport = async () => {
    if (activeSheet.isImported && activeSheet.records.length === 0) {
      toast({
        title: "Already Imported",
        description: `Sheet "${activeSheet.sheetName}" is already imported.`,
        variant: "success",
      });
      return;
    }

    if (unmatchedEmployees.length > 0) {
      setShowUnmatchedView(true);
      toast({
        title: "Unmatched Employees Detected",
        description: `Please register or skip all ${unmatchedEmployees.length} unmatched employee(s) before importing.`,
        variant: "warning",
      });
      return;
    }

    setIsImporting(true);

    try {
      const isOverwrite = importData.intent === "overwrite";

      // Rows eligible for import
      const readyRows = enrichedData.filter(
        (item) =>
          item.employee_id &&
          (isOverwrite || !item.has_existing_salary_entry) &&
          !item.is_site_header,
      );

      if (readyRows.length === 0) {
        setIsImporting(false);
        toast({
          title: "No Rows to Import",
          description:
            "There are no eligible employee records on this sheet to import. Please check matches.",
          variant: "warning",
        });
        return;
      }

      // Verify attendance against existing database records
      const resolvedEmployeeIds = readyRows.map((item) => item.employee_id);
      const month =
        (readyRows[0] as any)?.month || (activeSheet.records[0] as any)?.month;
      const year =
        (readyRows[0] as any)?.year || (activeSheet.records[0] as any)?.year;

      if (month && year) {
        const { data: existingAttendance, error: attendanceError } =
          await getMonthlyAttendanceByEmployeeIds({
            supabase,
            employeeIds: resolvedEmployeeIds,
            month,
            year,
          });

        if (attendanceError) {
          setIsImporting(false);
          toast({
            title: "Error",
            description: "Failed to verify attendance data",
            variant: "destructive",
          });
          return;
        }

        const attendanceMap = new Map(
          existingAttendance?.map((a) => [a.employee_id, a.present_days]),
        );

        const invalidEntries = readyRows.filter((item) => {
          const systemPresentDays = attendanceMap.get(item.employee_id);
          const importedPresentDays = Number(item.present_days);
          return (
            systemPresentDays !== undefined &&
            systemPresentDays !== importedPresentDays
          );
        });

        if (invalidEntries.length > 0) {
          setIsImporting(false);
          const invalidEmpIds = new Set(
            invalidEntries.map((e) => e.employee_id).filter(Boolean),
          );

          // Find row indices in tableData to highlight and disable
          const badIndices: number[] = [];
          tableData.forEach((row, idx) => {
            if (row.employee_id && invalidEmpIds.has(row.employee_id)) {
              badIndices.push(idx);
            }
          });
          setConflictingIndices(badIndices);

          // Mark records on current sheet with has_error and is_disabled
          setSheetsData((prevSheets) => {
            const updated = [...prevSheets];
            const sheet = { ...updated[activeSheetIndex] };
            sheet.records = sheet.records.map((rec) => {
              if (rec.employee_id && invalidEmpIds.has(rec.employee_id)) {
                return {
                  ...rec,
                  has_error: true,
                  is_disabled: true,
                  error_message:
                    "Attendance present days mismatch with database records. Please update attendance.",
                };
              }
              return rec;
            });
            updated[activeSheetIndex] = sheet;
            return updated;
          });

          toast({
            title: "Import Failed - Rows Disabled",
            description: `${invalidEntries.length} employee row(s) have attendance mismatch and have been disabled for mutations.`,
            variant: "destructive",
          });
          return;
        }
      }

      // Clean payload - only include active field configs and system/attendance keys
      const activeKeys = new Set(
        activeFieldConfigs.map((f) => f.key.toLowerCase()),
      );
      const systemKeys = new Set([
        "employee_id",
        "month",
        "year",
        "salary_entry_id",
        "working_days",
        "present_days",
        "working_hours",
        "overtime_hours",
        "absent_days",
        "paid_holidays",
        "paid_leaves",
        "casual_leaves",
      ]);

      const cleanedData = readyRows.map((item) => {
        const {
          employee_code,
          uan_number,
          uan_no,
          esic_number,
          esic_no,
          is_new_employee,
          sheet_name,
          has_existing_salary_entry,
          avatar,
          is_site_header,
          raw_row,
          has_error,
          is_disabled,
          error_message,
          ...rest
        } = item;

        const filtered: Record<string, any> = {};
        for (const [k, v] of Object.entries(rest)) {
          const lk = k.toLowerCase();
          if (activeKeys.has(lk) || systemKeys.has(lk)) {
            filtered[k] = v;
          }
        }
        return filtered;
      });

      const updatedCount = readyRows.length;
      const skippedCount = activeSheet.records.length - updatedCount;

      const formData = new FormData();
      formData.append(
        "type",
        isOverwrite ? "salary-update-import" : "salary-import",
      );
      formData.append(
        "title",
        importData.title ||
          `Payroll ${month}/${year} - ${activeSheet.sheetName}`,
      );
      formData.append("salaryImportData", JSON.stringify(cleanedData));
      formData.append("skipped", String(skippedCount));
      formData.append("updated", String(updatedCount));
      formData.append("different", currentPayrollId ? "different" : "no");
      formData.append("payrollId", currentPayrollId || "");
      formData.append(
        "failedRedirect",
        currentPayrollId
          ? `/payroll/run-payroll/${currentPayrollId}`
          : "/payroll/run-payroll",
      );

      const res = await fetch("/create-payroll", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.message || errJson.error || "Failed to import payroll sheet",
        );
      }

      const resJson = await res.json();

      if (resJson.status === "error") {
        throw new Error(
          resJson.message || resJson.error || "Import failed on server",
        );
      }

      const newPayrollId = resJson.payrollId || currentPayrollId;
      if (newPayrollId && !currentPayrollId) {
        setCurrentPayrollId(newPayrollId);
      }

      // Identify imported rows and remove them from activeSheet
      const importedEmpIds = new Set(
        readyRows.map((r) => r.employee_id).filter(Boolean),
      );
      const importedCodes = new Set(
        readyRows.map((r) => r.employee_code).filter(Boolean),
      );
      const importedUans = new Set(
        readyRows.map((r) => r.uan_no || r.uan_number).filter(Boolean),
      );

      // Remaining rows strictly maintain their original Excel order
      const remainingRecords = activeSheet.records.filter((rec: any) => {
        if (rec.employee_id && importedEmpIds.has(rec.employee_id))
          return false;
        if (rec.employee_code && importedCodes.has(rec.employee_code))
          return false;
        const recUan = rec.uan_no || rec.uan_number;
        if (recUan && importedUans.has(recUan)) return false;
        return true;
      });

      const wasFullyImported = remainingRecords.length === 0;

      setSheetsData((prevSheets) => {
        const updated = [...prevSheets];
        const sheet = { ...updated[activeSheetIndex] };
        sheet.records = remainingRecords;
        if (wasFullyImported) {
          sheet.isImported = true;
          sheet.importedCount = (sheet.importedCount || 0) + updatedCount;
        }
        updated[activeSheetIndex] = sheet;
        return updated;
      });

      if (wasFullyImported) {
        toast({
          title: "Sheet Imported Successfully",
          description: `Imported all ${updatedCount} employee records from "${activeSheet.sheetName}".`,
          variant: "success",
        });

        // Find next pending sheet to switch to
        const nextPendingIndex = sheetsData.findIndex(
          (s, idx) => idx !== activeSheetIndex && !s.isImported,
        );
        if (nextPendingIndex !== -1) {
          setActiveSheetIndex(nextPendingIndex);
          toast({
            title: "Next Sheet Active",
            description: `Now displaying "${sheetsData[nextPendingIndex].sheetName}".`,
          });
        }
      } else {
        toast({
          title: "Partial Import Complete",
          description: `Imported ${updatedCount} records. ${remainingRecords.length} skipped or unimported row(s) remaining on "${activeSheet.sheetName}".`,
          variant: "warning",
        });
        // User stays on same sheet with the remaining rows
      }
    } catch (err: any) {
      console.error("Sheet import failed:", err);
      toast({
        title: "Import Error",
        description: err.message || "Failed to import sheet records.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const allSheetsImported =
    sheetsData.length > 0 && sheetsData.every((s) => s.isImported);

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {/* Step 2 Import Loader Overlay */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md transition-all animate-in fade-in duration-200">
          <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-card/95 border rounded-2xl shadow-2xl max-w-sm text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon
                  name="import"
                  size="md"
                  className="text-primary animate-pulse"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-foreground">
                Importing Sheet "{activeSheet.sheetName}"
              </h3>
              <p className="text-xs text-muted-foreground font-medium">
                Uploading {activeSheet.records.length} employee records to
                payroll...
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Please do not close or refresh this tab.
              </p>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        </div>
      )}

      {/* Multi-Sheet Filter / Tabs switcher - Single-line horizontally scrollable with indicator */}
      {sheetsData.length > 1 && (
        <div className="flex items-center justify-between gap-3 p-2.5 mb-4 bg-card border rounded-xl shadow-xs shrink-0 relative">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1 flex items-center gap-1.5 shrink-0">
              <Icon name="table" size="xs" />
              Sheets:
            </span>
          </div>

          {/* Horizontally scrollable sheet tabs */}
          <div className="flex-1 min-w-0 relative flex items-center overflow-hidden">
            {canScrollLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-r from-card via-card/95 to-transparent pr-6">
                <button
                  type="button"
                  onClick={() => {
                    sheetsScrollRef.current?.scrollBy({
                      left: -220,
                      behavior: "smooth",
                    });
                  }}
                  className="flex items-center justify-center w-6 h-7 rounded-md bg-background/95 hover:bg-muted border shadow-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title="Scroll left"
                >
                  <Icon name="chevron-left" size="xs" />
                </button>
              </div>
            )}

            <div
              ref={sheetsScrollRef}
              onScroll={checkSheetsScroll}
              className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5 px-0.5 w-full scroll-smooth"
            >
              {sheetsData.map((sheet, idx) => {
                const isActive = idx === activeSheetIndex;
                return (
                  <button
                    key={sheet.sheetName}
                    data-active={isActive ? "true" : "false"}
                    type="button"
                    onClick={() => handleSwitchSheet(idx)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer shrink-0 whitespace-nowrap",
                      isActive
                        ? "bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/30"
                        : "bg-background border-border hover:bg-muted/50 text-foreground",
                    )}
                  >
                    <span>{sheet.sheetName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      ({sheet.records.length})
                    </span>
                    {sheet.isImported ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <Icon name="check" size="xs" />
                        Imported
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        Pending
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-l from-card via-card/95 to-transparent pl-6">
                <button
                  type="button"
                  onClick={() => {
                    sheetsScrollRef.current?.scrollBy({
                      left: 220,
                      behavior: "smooth",
                    });
                  }}
                  className="flex items-center justify-center w-6 h-7 rounded-md bg-background/95 hover:bg-muted border shadow-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title="Scroll right"
                >
                  <Icon name="chevron-right" size="xs" />
                </button>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground font-medium flex items-center gap-2 shrink-0 pl-3 border-l">
            <span>
              Progress:{" "}
              <strong className="text-foreground">
                {sheetsData.filter((s) => s.isImported).length}
              </strong>{" "}
              of{" "}
              <strong className="text-foreground">{sheetsData.length}</strong>{" "}
              Sheets Imported
            </span>
          </div>
        </div>
      )}

      {/* Header controls: Search & Import buttons with comfortable vertical spacing */}
      <div className="w-full flex items-center justify-between mb-4 shrink-0">
        <div className="w-full flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs gap-1.5 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
              onClick={() => {
                const targetPayrollId = currentPayrollId || propPayrollId;
                if (onBack) {
                  onBack(targetPayrollId);
                } else {
                  const redirectUrl = targetPayrollId
                    ? `/payroll/run-payroll/${targetPayrollId}`
                    : "/payroll/run-payroll";
                  navigate(redirectUrl);
                }
              }}
            >
              <Icon name="chevron-left" size="sm" />
              Back
            </Button>
            <div className="relative w-[28rem] max-w-full">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Icon
                  name="magnifying-glass"
                  size="sm"
                  className="text-gray-400"
                />
              </div>
              <Input
                placeholder={`Search in ${activeSheet.sheetName}...`}
                value={searchString}
                onChange={(e) => setSearchString(e.target.value)}
                className="pl-8 h-10 w-full focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {allSheetsImported ? (
              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold shadow-md"
                onClick={() => {
                  const redirectUrl = currentPayrollId
                    ? `/payroll/run-payroll/${currentPayrollId}`
                    : "/payroll/run-payroll";
                  navigate(redirectUrl);
                }}
              >
                <Icon name="check" size="sm" />
                All Sheets Imported &rarr; Go to Payroll
              </Button>
            ) : activeSheet.isImported && activeSheet.records.length === 0 ? (
              <Button
                variant="outline"
                disabled
                className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 gap-1.5"
              >
                <Icon name="check" size="sm" />
                Sheet "{activeSheet.sheetName}" Imported
              </Button>
            ) : (
              <div className="flex items-center gap-2.5">
                {duplicatesInfo.duplicatesList.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleMergeAllDuplicates}
                    className="gap-2 font-semibold border-amber-500/60 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 shadow-xs"
                    title="Merge all duplicate employee rows in this sheet into their primary rows"
                  >
                    <Icon name="table" size="sm" className="text-amber-500" />
                    Merge Duplicates ({duplicatesInfo.duplicatesList.length})
                  </Button>
                )}

                {unmatchedEmployees.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowUnmatchedView(true)}
                    className="gap-2 font-semibold border-amber-500/60 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 shadow-xs"
                  >
                    <Icon
                      name="employee"
                      size="sm"
                      className="text-amber-500"
                    />
                    New Employees ({unmatchedEmployees.length})
                  </Button>
                )}

                <Button
                  variant="default"
                  onClick={handleFinalImport}
                  disabled={
                    isImporting ||
                    activeSheet.records.length === 0 ||
                    unmatchedEmployees.length > 0
                  }
                  className="gap-2 font-semibold shadow-sm min-w-[190px]"
                  title={
                    unmatchedEmployees.length > 0
                      ? "Resolve new employees before importing"
                      : undefined
                  }
                >
                  {isImporting ? (
                    <>
                      <Icon name="update" size="sm" className="animate-spin" />
                      Importing Sheet...
                    </>
                  ) : (
                    <>
                      <Icon name="import" size="sm" />
                      Import Sheet "{activeSheet.sheetName}" (
                      {activeSheet.records.length})
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Data Grid */}
      <ImportedDataTable
        data={tableData}
        columns={tableColumns}
        fieldConfigs={activeFieldConfigs}
        conflictingIndex={conflictingIndices}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCellChange={handleCellChange}
        onBulkChange={handleBulkChange}
        onDeleteColumn={(colKey) => setColToDelete(colKey)}
        onRenameColumn={handleRenameColumn}
        onDeleteSelectedRows={(selectedIndices) => {
          setIndicesToDelete(selectedIndices);
          setIsBulkDeleteOpen(true);
        }}
        onOpenBulkUpdate={(selectedIndices) => {
          setSelectedIndicesForBulk(selectedIndices);
          setBulkScope(selectedIndices.length > 0 ? "selected" : "all");
          setIsBulkUpdateOpen(true);
        }}
        onOpenAddColumn={() => setIsAddColOpen(true)}
      />

      {/* Bulk Delete Confirmation Dialog with "DELETE" text input */}
      <AlertDialog
        open={isBulkDeleteOpen}
        onOpenChange={(open) => {
          setIsBulkDeleteOpen(open);
          if (!open) setDeleteConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove{" "}
              <strong className="text-foreground">
                {indicesToDelete.length} employee row(s)
              </strong>{" "}
              from sheet{" "}
              <strong className="text-foreground">
                "{activeSheet.sheetName}"
              </strong>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm text-foreground/80">
              Please type{" "}
              <strong className="font-mono text-destructive">DELETE</strong> to
              confirm:
            </p>
            <Input
              type="text"
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Confirm your action"
              className="border border-input rounded-md h-10 w-full font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText !== "DELETE"}
              onClick={confirmBulkDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
            >
              Delete Rows
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Update Column Dialog */}
      <Dialog open={isBulkUpdateOpen} onOpenChange={setIsBulkUpdateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Update Column</DialogTitle>
            <DialogDescription>
              Update values column-wise for rows in sheet "
              {activeSheet.sheetName}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Column</Label>
              <Combobox
                options={editableColOptions}
                value={bulkColKey}
                onChange={(val: string) => setBulkColKey(val)}
                placeholder="Choose column..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Apply To</Label>
              <div className="flex items-center gap-4 text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkScope"
                    checked={bulkScope === "all"}
                    onChange={() => setBulkScope("all")}
                    className="accent-primary"
                  />
                  <span>All rows ({activeSheet.records.length})</span>
                </label>
                {selectedIndicesForBulk.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bulkScope"
                      checked={bulkScope === "selected"}
                      onChange={() => setBulkScope("selected")}
                      className="accent-primary"
                    />
                    <span>Selected rows ({selectedIndicesForBulk.length})</span>
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New Value</Label>
              <Input
                type="text"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder="Enter new value"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsBulkUpdateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              type="button"
              disabled={!bulkColKey || bulkValue === ""}
              onClick={confirmBulkUpdate}
            >
              Apply Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Side Sheet */}
      <Sheet open={isAddColOpen} onOpenChange={setIsAddColOpen}>
        <SheetContent className="flex flex-col w-[500px] max-sm:w-full h-full">
          <SheetHeader className="px-6 pt-4 pb-6 flex-shrink-0 border-b">
            <SheetTitle className="text-xl font-bold text-foreground">
              Add New Column
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Add an earning or deduction column to sheet "
              {activeSheet.sheetName}".
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Column Name</Label>
              <Input
                placeholder="e.g. BONUS, SPECIAL_ALLOWANCE, ADVANCE"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="h-10 uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Column Type</Label>
              <Combobox
                options={[
                  { label: "Earning", value: "earning" },
                  { label: "Deduction", value: "deduction" },
                ]}
                value={newColType}
                onChange={(val: string) => setNewColType(val)}
                placeholder="Select Type"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Default Amount</Label>
              <Input
                type="number"
                placeholder="0"
                value={newColDefaultAmount}
                onChange={(e) => setNewColDefaultAmount(Number(e.target.value))}
                className="h-10"
              />
            </div>
          </div>
          <SheetFooter className="p-6 border-t mt-auto">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsAddColOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              type="button"
              disabled={!newColName.trim() || !newColType}
              onClick={confirmAddColumn}
            >
              Add Column
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Column Confirmation Dialog */}
      <AlertDialog
        open={Boolean(colToDelete)}
        onOpenChange={(open) => {
          if (!open) setColToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Column "{colToDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove column "{colToDelete}" and all its
              values from sheet "{activeSheet.sheetName}". This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setColToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={confirmDeleteColumn}
            >
              Delete Column
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unmatched Employees Panel */}
      {showUnmatchedView && unmatchedEmployees.length > 0 && (
        <Dialog open={showUnmatchedView} onOpenChange={setShowUnmatchedView}>
          <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] p-6 overflow-hidden flex flex-col">
            <CreateUnmatchedEmployeePanel
              unmatchedList={unmatchedEmployees.map((emp) => ({
                employee_name: emp.employee_name || "Unknown",
                employee_code: emp.employee_code,
                uan_number: emp.uan_number,
              }))}
              companyId={companyId}
              supabase={supabase}
              existingMatchedEmployeeIds={(tableData || [])
                .map((item: any) => item.employee_id)
                .filter((id): id is string => Boolean(id))}
              onSuccess={() => {
                toast({
                  title: "Employee Registered",
                  description: "Updating payroll and re-matching...",
                  variant: "success",
                });
                setRefreshTrigger((prev) => prev + 1);
              }}
              onClose={() => setShowUnmatchedView(false)}
              onSkip={handleSkip}
              onSkipAll={handleSkipAll}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
