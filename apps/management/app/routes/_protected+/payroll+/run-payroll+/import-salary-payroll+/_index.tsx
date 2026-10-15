import { SalaryPayrollImportData } from "@/components/payroll/import-export/salary-payroll-import-data";
import { useImportStoreForSalaryPayroll } from "@/store/import";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import type { PayrollTransformJsonResult } from "@/utils/server/payroll-excel-transform.server";
import { transformPayrollExcelToJson } from "@/utils/server/payroll-excel-transform.server";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  type ImportSalaryPayrollDataType,
  getPayrollById,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  SIZE_1KB,
  SIZE_1MB,
  defaultMonth,
  defaultYear,
} from "@canny_ecosystem/utils";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, useLoaderData, useLocation } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type FieldConfig = {
  key: string;
  required?: boolean;
  type?: string;
};

// Backward-compatibility helper for department payroll import
export function getDisambiguatedHeaders(rawRow: any[]): string[] {
  if (!rawRow || !Array.isArray(rawRow)) return [];
  const rawHeaders = rawRow.map((h) =>
    h === null || h === undefined ? "" : String(h).trim(),
  );
  const headerCounts = new Map<string, number>();
  for (const h of rawHeaders) {
    if (!h) continue;
    const lower = h.toLowerCase();
    headerCounts.set(lower, (headerCounts.get(lower) || 0) + 1);
  }
  return rawHeaders.map((h, colIdx) => {
    if (!h) return "";
    const lower = h.toLowerCase();
    if ((headerCounts.get(lower) || 0) > 1) {
      return `${h} (Col ${colIdx + 1})`;
    }
    return h;
  });
}

const DEFAULT_PAYMENT_FIELDS = [
  { name: "BASIC", display_name: "BASIC", type: "earning" },
  { name: "HRA", display_name: "HRA", type: "earning" },
  { name: "DA", display_name: "DA", type: "earning" },
  {
    name: "SPECIAL_ALLOWANCE",
    display_name: "SPECIAL ALLOWANCE",
    type: "earning",
  },
  { name: "ALLOWANCE", display_name: "ALLOWANCE", type: "earning" },
  { name: "FIXED_ALLOWANCE", display_name: "FIXED ALLOWANCE", type: "earning" },
  { name: "OTHER_ALLOWANCE", display_name: "OTHER ALLOWANCE", type: "earning" },
  {
    name: "CONVEYANCE_ALLOWANCE",
    display_name: "CONVEYANCE ALLOWANCE",
    type: "earning",
  },
  {
    name: "TRANSPORTATION_ALLOWANCE",
    display_name: "TRANSPORTATION ALLOWANCE",
    type: "earning",
  },
  { name: "EL_AMOUNT", display_name: "EL AMOUNT", type: "earning" },
  { name: "CONVEYANCE", display_name: "CONVEYANCE", type: "earning" },
  { name: "TRANSPORTATION", display_name: "TRANSPORTATION", type: "earning" },
  { name: "LTA", display_name: "LTA", type: "earning" },
  { name: "BONUS", display_name: "BONUS", type: "earning" },
  { name: "OVERTIME", display_name: "OVERTIME", type: "earning" },
  { name: "OVERTIME_AMOUNT", display_name: "OVERTIME AMOUNT", type: "earning" },
  { name: "ACTUAL_WAGES", display_name: "ACTUAL WAGES", type: "earning" },
  { name: "NET_PAY", display_name: "NET PAY", type: "earning" },
  {
    name: "TOTAL_DEDUCTIONS",
    display_name: "TOTAL DEDUCTIONS",
    type: "deduction",
  },
  { name: "PF", display_name: "PF", type: "deduction" },
  { name: "ESI", display_name: "ESI", type: "deduction" },
  { name: "PT", display_name: "PT", type: "deduction" },
  { name: "LWF", display_name: "LWF", type: "deduction" },
  { name: "ADVANCE", display_name: "ADVANCE", type: "deduction" },
  { name: "TDS", display_name: "TDS", type: "deduction" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );

  const url = new URL(request.url);
  const rawPayrollId = url.searchParams.get("payrollId");
  const payrollId =
    rawPayrollId && rawPayrollId !== "undefined" ? rawPayrollId : null;

  let payrollFieldsData: any[] = [];
  if (payrollId) {
    const { data } = await (supabase as any)
      .from("payroll_fields")
      .select("id, name, type")
      .eq("payroll_id", payrollId)
      .order("name");

    payrollFieldsData = data || [];
  }

  const combinedMap = new Map<string, any>();

  for (const f of DEFAULT_PAYMENT_FIELDS) {
    const trimmedName = f.name.trim();
    combinedMap.set(trimmedName.toLowerCase(), {
      ...f,
      name: trimmedName,
      display_name: f.display_name.trim(),
    });
  }

  if (payrollFieldsData.length > 0) {
    for (const f of payrollFieldsData) {
      const trimmedName = f.name.trim();
      combinedMap.set(trimmedName.toLowerCase(), {
        id: f.id,
        name: trimmedName,
        display_name: trimmedName,
        type: f.type,
      });
    }
  }

  const dbPaymentFields = Array.from(combinedMap.values());

  return json({ env, companyId, dbPaymentFields });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return json(
        { success: false, error: "No file provided" },
        { status: 400 },
      );
    }

    const fileObj = file as File;
    const arrayBuffer = await fileObj.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await transformPayrollExcelToJson(
      buffer,
      fileObj.name || "payroll.xlsx",
    );

    return json({ ...result, success: true });
  } catch (error: any) {
    console.error("AI Transform Route Action Error:", error);
    return json(
      {
        success: false,
        error: error?.message || "Failed to transform payroll Excel file.",
      },
      { status: 500 },
    );
  }
}

export type SheetDataEntry = {
  sheetName: string;
  fieldConfigs: FieldConfig[];
  records: any[];
  isImported: boolean;
  importedCount?: number;
};

export function ImportPayrollStepper({ currentStep }: { currentStep: 1 | 2 }) {
  return (
    <div className="w-full max-w-xl mx-auto px-4 mb-6">
      <div className="flex items-center justify-between relative">
        {/* Background track line */}
        <div className="absolute top-1/2 left-10 right-10 h-0.5 -translate-y-1/2 bg-muted-foreground/20 z-0" />
        {/* Active track line */}
        <div
          className={cn(
            "absolute top-1/2 left-10 h-0.5 -translate-y-1/2 bg-primary transition-all duration-300 z-0",
            currentStep === 1 ? "w-0" : "right-10",
          )}
        />

        {/* Step 1 */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm",
              currentStep === 1
                ? "border-2 border-primary bg-primary text-primary-foreground ring-4 ring-primary/20"
                : "border-2 border-primary bg-primary text-primary-foreground",
            )}
          >
            {currentStep > 1 ? (
              <Icon
                name="check"
                size="sm"
                className="text-primary-foreground"
              />
            ) : (
              "1"
            )}
          </div>
          <div className="mt-2 text-center">
            <p className="text-xs font-bold text-foreground">Step 1</p>
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">
              Upload & AI Analysis
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm",
              currentStep === 2
                ? "border-2 border-primary bg-primary text-primary-foreground ring-4 ring-primary/20"
                : "border-2 border-border bg-card text-muted-foreground",
            )}
          >
            2
          </div>
          <div className="mt-2 text-center">
            <p
              className={cn(
                "text-xs font-bold",
                currentStep === 2 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Step 2
            </p>
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">
              Review, Edit & Import
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Builds Step 2 FieldConfigs and records for a single sheet
 */
export function buildSheetRecordsAndConfigs(params: {
  sheetName: string;
  columns: string[];
  records: Array<Record<string, any>>;
  month: number;
  year: number;
  runDate: string;
}): SheetDataEntry {
  const { sheetName, columns, records, month, year, runDate } = params;

  const DEDUCTION_KEYS = new Set([
    "pf",
    "esic",
    "pt",
    "lwf",
    "deduction",
    "advance",
    "expense",
  ]);

  const ATTENDANCE_KEYS = new Set([
    "working_days",
    "present_days",
    "ph",
    "pl",
    "cl",
    "ml",
    "el",
    "ot_hours",
    "ot_days",
  ]);

  const IDENTITY_KEYS = new Set([
    "employee_name",
    "employee_code",
    "uan_no",
    "uan_number",
    "esic_no",
    "esic_number",
  ]);

  const allResultCols = columns || [];

  // 1. Identity field configs
  const orderedFieldConfigs: FieldConfig[] = [];

  if (allResultCols.includes("employee_name")) {
    orderedFieldConfigs.push({ key: "employee_name", required: true });
  }
  if (allResultCols.includes("employee_code")) {
    orderedFieldConfigs.push({ key: "employee_code" });
  }
  if (
    allResultCols.includes("uan_no") ||
    allResultCols.includes("uan_number")
  ) {
    orderedFieldConfigs.push({ key: "uan_number", required: true });
  }
  if (
    allResultCols.includes("esic_no") ||
    allResultCols.includes("esic_number")
  ) {
    orderedFieldConfigs.push({ key: "esic_number" });
  }

  // 2. Attendance field configs
  for (const col of allResultCols) {
    if (ATTENDANCE_KEYS.has(col)) {
      orderedFieldConfigs.push({
        key: col,
        required: col === "present_days" || col === "working_days",
      });
    }
  }

  // 3. Earnings field configs
  for (const col of allResultCols) {
    if (
      !IDENTITY_KEYS.has(col) &&
      !ATTENDANCE_KEYS.has(col) &&
      !DEDUCTION_KEYS.has(col) &&
      col !== "net_pay" &&
      col !== "sheet_name"
    ) {
      orderedFieldConfigs.push({
        key: col,
        type: "earning",
        required: col === "basic",
      });
    }
  }

  // 4. Deductions field configs
  for (const col of allResultCols) {
    if (DEDUCTION_KEYS.has(col)) {
      orderedFieldConfigs.push({ key: col, type: "deduction" });
    }
  }

  // 5. Net Pay
  if (allResultCols.includes("net_pay")) {
    orderedFieldConfigs.push({
      key: "net_pay",
      type: "earning",
      required: true,
    });
  }

  // Map each record from AI preserving exact original array index
  const step2Records = (records || []).map((rec) => {
    const row: Record<string, any> = {
      sheet_name: rec.sheet_name || sheetName,
      raw_row: rec,
      month,
      year,
      run_date: runDate,
    };

    // Identity
    row.employee_name = rec.employee_name || "";
    row.employee_code =
      rec.employee_code !== undefined && rec.employee_code !== null
        ? String(rec.employee_code).trim()
        : "";
    const uan = String(rec.uan_number || rec.uan_no || "").trim();
    row.uan_number = uan;
    row.uan_no = uan;
    const esic = String(rec.esic_number || rec.esic_no || "").trim();
    row.esic_number = esic;
    row.esic_no = esic;

    // Attendance
    for (const key of ATTENDANCE_KEYS) {
      if (key in rec) {
        const val = rec[key];
        row[key] =
          val !== undefined && val !== ""
            ? Number.isNaN(Number(val))
              ? val
              : Number(val)
            : 0;
      }
    }

    // Earnings
    for (const col of allResultCols) {
      if (
        !IDENTITY_KEYS.has(col) &&
        !ATTENDANCE_KEYS.has(col) &&
        !DEDUCTION_KEYS.has(col) &&
        col !== "sheet_name"
      ) {
        const val = rec[col];
        const num = typeof val === "number" ? val : Number(val) || 0;
        row[col] = {
          amount: num,
          type: "earning",
          consider_for_epf: false,
          consider_for_esic: false,
        };
      }
    }

    // Deductions
    for (const col of allResultCols) {
      if (DEDUCTION_KEYS.has(col)) {
        const val = rec[col];
        const num = typeof val === "number" ? val : Number(val) || 0;
        row[col] = {
          amount: num,
          type: "deduction",
          consider_for_epf: false,
          consider_for_esic: false,
        };
      }
    }

    return row;
  });

  return {
    sheetName,
    fieldConfigs: orderedFieldConfigs,
    records: step2Records as ImportSalaryPayrollDataType[],
    isImported: false,
    importedCount: 0,
  };
}

/**
 * Builds Step 2 FieldConfigs and ImportSalaryPayrollDataType records
 * directly from the structured AI transform output across all sheets.
 */
export function buildStep2DataFromAiResult(params: {
  aiResult: PayrollTransformJsonResult;
  month: number;
  year: number;
  runDate: string;
  initialIntent?: string;
  matchingKey?: string;
}) {
  const {
    aiResult,
    month,
    year,
    runDate,
    initialIntent = "skip",
    matchingKey = "employee_code",
  } = params;

  const sheets: SheetDataEntry[] = [];

  if (aiResult.sheets && aiResult.sheets.length > 0) {
    for (const sheet of aiResult.sheets) {
      if (sheet.records && sheet.records.length > 0) {
        sheets.push(
          buildSheetRecordsAndConfigs({
            sheetName: sheet.sheetName,
            columns:
              sheet.columns && sheet.columns.length > 0
                ? sheet.columns
                : aiResult.columns || [],
            records: sheet.records,
            month,
            year,
            runDate,
          }),
        );
      }
    }
  }

  if (sheets.length === 0) {
    sheets.push(
      buildSheetRecordsAndConfigs({
        sheetName: "Sheet 1",
        columns: aiResult.columns || [],
        records: aiResult.records || [],
        month,
        year,
        runDate,
      }),
    );
  }

  const activeSheet = sheets[0];

  return {
    sheets,
    fieldConfigs: activeSheet.fieldConfigs,
    importData: {
      intent: initialIntent,
      matchingKey,
      data: activeSheet.records,
    },
  };
}

export default function ImportSalaryPayroll() {
  const { env, companyId } = useLoaderData<typeof loader>();
  const location = useLocation();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env });

  const { setImportData } = useImportStoreForSalaryPayroll();

  const [selectedFile, setSelectedFile] = useState<File | null>(() => {
    return location.state?.file || null;
  });
  const [loadNext, setLoadNext] = useState<boolean>(false);
  const [isTransforming, setIsTransforming] = useState<boolean>(false);
  const [transformError, setTransformError] = useState<string | null>(null);
  const [transformStepText, setTransformStepText] = useState<string>("");

  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [sheetsData, setSheetsData] = useState<SheetDataEntry[]>([]);

  const today = new Date();
  const [month, setMonth] = useState<number>(defaultMonth);
  const [year, setYear] = useState<number>(defaultYear);
  const [runDate, setRunDate] = useState<string>(
    today.toISOString().split("T")[0],
  );

  const payrollId = (() => {
    const stateId = location.state?.payrollId;
    if (stateId && stateId !== "undefined") return stateId;
    const searchParams = new URLSearchParams(location.search);
    const queryId = searchParams.get("payrollId");
    if (queryId && queryId !== "undefined") return queryId;
    return null;
  })();

  const initialIntent = (() => {
    if (location.state?.intent) return location.state.intent;
    const searchParams = new URLSearchParams(location.search);
    const isIncrement =
      searchParams.get("isIncrement") === "true" ||
      Boolean(location.state?.isIncrement);
    if (isIncrement) return "overwrite";
    return "skip";
  })();

  // Fetch target payroll details for month, year, run_date
  useEffect(() => {
    async function fetchPayrollDetails() {
      if (payrollId && payrollId !== "undefined") {
        const { data: payroll } = await getPayrollById({
          supabase,
          payrollId: payrollId,
        });
        if (payroll) {
          if (payroll.month) setMonth(payroll.month);
          if (payroll.year) setYear(payroll.year);
          if (payroll.run_date) setRunDate(payroll.run_date.split("T")[0]);
        }
      }
    }
    fetchPayrollDetails();
  }, [payrollId, supabase]);

  // AI Transformation caller
  const runAiTransformation = useCallback(
    async (fileToProcess: File) => {
      setIsTransforming(true);
      setTransformError(null);
      setTransformStepText("Reading uploaded file and preparing sheets...");

      try {
        const formData = new FormData();
        formData.append("file", fileToProcess);

        setTransformStepText(
          "Analyzing sheet structure, headers & calculations with Gemini AI...",
        );

        const response = await fetch("/api/transform-payroll-excel", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData.error || `Server responded with status ${response.status}`,
          );
        }

        const data: PayrollTransformJsonResult = await response.json();

        if (!data.success) {
          throw new Error(
            (data as any).error || "Failed to transform payroll data with AI.",
          );
        }

        setTransformStepText(
          "Structuring records and building payroll data...",
        );

        const {
          sheets: newSheets,
          fieldConfigs: newConfigs,
          importData: newImportData,
        } = buildStep2DataFromAiResult({
          aiResult: data,
          month,
          year,
          runDate,
          initialIntent,
          matchingKey: "employee_code",
        });

        setSheetsData(newSheets);
        setFieldConfigs(newConfigs);
        setImportData(newImportData);

        toast({
          title: "AI Transformation Complete",
          description: `Extracted ${data.recordsCount || data.records?.length || 0} employee records across ${data.sheets?.length || 1} sheet(s).`,
          variant: "success",
        });

        // Directly transition to Step 2
        setLoadNext(true);
      } catch (err: any) {
        console.error("AI Transformation Error:", err);
        setTransformError(
          err.message ||
            "An error occurred while transforming the file. Please try again.",
        );
        toast({
          title: "Transformation Failed",
          description: err.message || "Unable to transform file with AI.",
          variant: "destructive",
        });
      } finally {
        setIsTransforming(false);
      }
    },
    [month, year, runDate, initialIntent, setImportData, toast],
  );

  // Automatically start transformation if file was passed from dialog
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (selectedFile && !hasAutoStarted.current && !loadNext) {
      hasAutoStarted.current = true;
      runAiTransformation(selectedFile);
    }
  }, [selectedFile, loadNext, runAiTransformation]);

  const handleManualFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      runAiTransformation(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      runAiTransformation(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const formatFileSize = (size: number) => {
    if (size < SIZE_1KB) return `${size} Bytes`;
    if (size < SIZE_1MB) return `${(size / SIZE_1KB).toFixed(2)} KB`;
    return `${(size / SIZE_1MB).toFixed(2)} MB`;
  };

  return (
    <section className="py-4">
      <ImportPayrollStepper currentStep={loadNext ? 2 : 1} />

      {loadNext ? (
        <SalaryPayrollImportData
          env={env}
          fieldConfigs={fieldConfigs}
          initialSheetsData={sheetsData}
          payrollId={payrollId || undefined}
          companyId={companyId}
          onBack={() => setLoadNext(false)}
        />
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="border shadow-lg overflow-hidden bg-card/90 backdrop-blur-xs">
            <CardHeader className="border-b bg-muted/20 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-xs">
                    <Icon
                      name="magic"
                      size="md"
                      className="text-primary animate-pulse"
                    />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold tracking-tight">
                      AI Payroll Sheet Transformation
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Direct AI transformation: converts Excel/CSV sheets into
                      structured payroll data
                    </CardDescription>
                  </div>
                </div>

                <div className="px-3 py-1.5 bg-primary/5 border border-primary/15 rounded-lg text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                    Target Period
                  </p>
                  <p className="text-xs font-semibold text-primary">
                    {new Date(year, month - 1).toLocaleString("default", {
                      month: "long",
                    })}{" "}
                    {year}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-8">
              {isTransforming ? (
                /* Step 1: AI Processing Loader */
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon
                        name="magic"
                        size="md"
                        className="text-primary animate-bounce"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 max-w-md">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      Transforming Payroll with AI...
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium">
                      {transformStepText ||
                        "Analyzing sheet data and matching fields..."}
                    </p>
                    {selectedFile && (
                      <p className="text-xs text-muted-foreground/70 font-mono mt-2">
                        {selectedFile.name} ({formatFileSize(selectedFile.size)}
                        )
                      </p>
                    )}
                  </div>

                  <div className="w-full max-w-sm bg-muted/60 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full animate-pulse w-3/4" />
                  </div>

                  <p className="text-xs text-muted-foreground/60 max-w-xs">
                    Gemini AI is detecting columns, attendance, wage components,
                    and statutory deductions. This typically takes 3-6 seconds.
                  </p>
                </div>
              ) : transformError ? (
                /* Error State */
                <div className="py-8 space-y-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
                    <Icon name="exclaimation-triangle" size="lg" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <h3 className="text-lg font-semibold text-destructive">
                      Transformation Failed
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {transformError}
                    </p>
                  </div>

                  <div className="flex justify-center gap-4 pt-2">
                    {selectedFile && (
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => runAiTransformation(selectedFile)}
                        className="gap-2"
                      >
                        <Icon name="update" size="sm" />
                        Try Again with AI
                      </Button>
                    )}
                    <label>
                      <input
                        type="file"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleManualFileSelect}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        asChild
                        className="cursor-pointer gap-2"
                      >
                        <span>
                          <Icon name="import" size="sm" />
                          Choose Another File
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              ) : (
                /* Step 1: File Upload / Re-upload Dropzone */
                <div className="space-y-6">
                  <div
                    role="button"
                    tabIndex={0}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        document.getElementById("manual-file-input")?.click();
                      }
                    }}
                    className="border-2 border-dashed border-primary/20 hover:border-primary/50 bg-primary/2 hover:bg-primary/5 rounded-2xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-4"
                    onClick={() => {
                      document.getElementById("manual-file-input")?.click();
                    }}
                  >
                    <input
                      id="manual-file-input"
                      type="file"
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={handleManualFileSelect}
                      className="hidden"
                    />

                    <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                      <Icon name="import" size="lg" className="text-primary" />
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-base font-semibold text-foreground">
                        {selectedFile
                          ? selectedFile.name
                          : "Choose or drag payroll file here"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Supports Excel (.xlsx, .xls) and CSV (.csv) formats up
                        to 500MB
                      </p>
                      {selectedFile && (
                        <p className="text-xs font-mono text-primary font-medium pt-1">
                          Size: {formatFileSize(selectedFile.size)}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 pointer-events-none mt-2"
                    >
                      <Icon name="magnifying-glass" size="sm" />
                      Browse File
                    </Button>
                  </div>

                  {selectedFile && (
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        variant="default"
                        size="lg"
                        onClick={() => runAiTransformation(selectedFile)}
                        className="gap-2 font-semibold shadow-md"
                      >
                        <Icon name="magic" size="sm" />
                        Transform with AI & Proceed to Step 2
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
