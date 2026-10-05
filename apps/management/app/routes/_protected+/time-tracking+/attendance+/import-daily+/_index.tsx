import { useState, useEffect, useRef, useMemo } from "react";
import {
  json,
  useLoaderData,
  useLocation,
  useNavigate,
} from "@remix-run/react";
import Papa from "papaparse";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { z } from "zod";
import {
  transformStringArrayIntoOptions,
  replaceUnderscore,
  replaceDash,
  pipe,
  normalizeDate,
} from "@canny_ecosystem/utils";
import { payoutMonths } from "@canny_ecosystem/utils/constant";
import type { ActionFunctionArgs } from "@remix-run/node";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { GEMINI_LITE } from "@/utils/ai/chat/constant";
import { useSubmit, useActionData } from "@remix-run/react";
import { useImportStoreForDailyAttendance } from "@/store/import";
import { EmployeeDailyAttendanceImportData } from "@/components/employees/import-export/employee-daily-attendance-import-data";
import { useToast } from "@canny_ecosystem/ui/use-toast";

const ImportDailyAttendanceHeaderSchemaObject = z.object({
  employee_code: z.string().optional(),
  uan_number: z.string().optional(),
  employee_name: z.string().optional(),
  date: z.string().optional(),
  present: z.string().optional(),
  in_time: z.string().optional(),
  out_time: z.string().optional(),
  overtime_hours: z.string().optional(),
});

const ImportDailyAttendanceDataSchema = z.object({
  data: z.array(
    z.object({
      employee_code: z.string().optional(),
      uan_number: z.string().optional(),
      employee_name: z.string().optional(),
      sheet_name: z.string().optional(),
      raw_row: z.any().optional(),
      date: z.string().min(1, "Date is Required"),
      present: z.string().min(1, "Present is Required"),
      in_time: z.string().optional(),
      out_time: z.string().optional(),
      overtime_hours: z.string().optional(),
    }),
  ),
});

type FieldConfig = {
  key: keyof z.infer<typeof ImportDailyAttendanceHeaderSchemaObject>;
  required?: boolean;
};

const FIELD_CONFIGS: FieldConfig[] = [
  { key: "employee_code" },
  { key: "uan_number" },
  { key: "employee_name" },
  { key: "date", required: true },
  { key: "present", required: true },
  { key: "in_time" },
  { key: "out_time" },
  { key: "overtime_hours" },
];

import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getSupabaseWithSessionAndHeaders } from "@canny_ecosystem/supabase/server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, session } = await getSupabaseWithSessionAndHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  return json({ env, companyId, session });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const headersStr = formData.get("headers") as string;

    if (!headersStr)
      return json({ error: "No headers provided" }, { status: 400 });

    const headers = JSON.parse(headersStr);

    const result = await generateObject({
      model: google(GEMINI_LITE),
      system: `You are a data analysis assistant analyzing an Attendance Spreadsheet.
      Your job is to identify the following columns from the provided list of headers:
      1. employeeCodeKey: The string that represents Employee Code / ID / Emp No. (e.g., "Code", "Emp ID", "Employee No").
      2. uanNumberKey: The string that represents UAN Number, PF Number, or "UAN". Look for "UAN" or "PF" anywhere in the string.
      3. employeeNameKey: The string that represents Employee Name.
      4. dateKeys: Choose ALL strings that represent calendar dates (e.g., "01-Jan", "1/4/2024", "2024-04-01", or sequential numbers like 1, 2, 3 if they represent days of the month).
      5. overtimeHoursKey: The string that represents Overtime Hours (OT).

      - If something doesn't exist, leave it empty or an empty array.
      - Do NOT match serial numbers or sequence numbers (like "Sr. No", "S.No", "Serial") as employeeCodeKey.`,
      prompt: `List of headers to analyze: ${JSON.stringify(headers)}`,
      schema: z.object({
        employeeCodeKey: z.string().optional(),
        uanNumberKey: z.string().optional(),
        employeeNameKey: z.string().optional(),
        dateKeys: z.array(z.string()),
        overtimeHoursKey: z.string().optional(),
      }),
    });

    return json({ analysis: result.object });
  } catch (error: any) {
    console.error("Gemini header analysis error:", error);
    return json(
      {
        error:
          "Failed to analyze Excel structure: " +
          String(error?.message || error),
      },
      { status: 500 },
    );
  }
}

export default function DailyAttendanceImportFieldMapping() {
  const { env, companyId, session } = useLoaderData<typeof loader>();
  const { setImportData } = useImportStoreForDailyAttendance();
  const { toast } = useToast();
  const navigate = useNavigate();

  const ATTENDANCE_CATEGORIES = [
    { label: "Present", value: "P" },
    { label: "Absent", value: "A" },
    { label: "Half Day", value: "HD" },
    { label: "Weekly Off", value: "WO" },
    { label: "Holiday", value: "H" },
    { label: "Casual Leave", value: "CL" },
    { label: "Earned Leave", value: "EL" },
    { label: "Medical Leave", value: "ML" },
    { label: "Paid Leave", value: "PL" },
  ];

  const years = Array.from({ length: 11 }, (_, i) =>
    (new Date().getFullYear() - 10 + i).toString(),
  );
  const months = payoutMonths.map((m) => m.label);

  const [loadNext, setLoadNext] = useState(false);
  const location = useLocation();
  const [file] = useState(location.state?.file);
  const [intent] = useState(location.state?.intent);
  const [headerArray, setHeaderArray] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const ActionData = useActionData<{
    analysis?: {
      employeeCodeKey?: string;
      uanNumberKey?: string;
      employeeNameKey?: string;
      dateKeys: string[];
      overtimeHoursKey?: string;
    };
    error?: string;
  }>();
  const submit = useSubmit();

  const [matchingKey, setMatchingKey] = useState<string>("employee_code");

  const defaultPreviousMonth = useMemo(() => {
    const today = new Date();
    const prevMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    return prevMonthDate.toLocaleString("default", { month: "long" });
  }, []);

  const defaultPreviousYear = useMemo(() => {
    const today = new Date();
    const prevMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    return prevMonthDate.getFullYear().toString();
  }, []);

  const [selectedMonth, setSelectedMonth] =
    useState<string>(defaultPreviousMonth);
  const [selectedYear, setSelectedYear] = useState<string>(defaultPreviousYear);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [manualMapping, setManualMapping] = useState<{
    empCode: string;
    uanNumber: string;
    empName: string;
    dateCols: string[];
    overtimeHours: string;
  }>({
    empCode: "",
    uanNumber: "",
    empName: "",
    dateCols: [],
    overtimeHours: "",
  });
  const [showManualMapping, setShowManualMapping] = useState(false);
  const [currentStep, setCurrentStep] = useState<"columns" | "values">(
    "columns",
  );
  const [uniqueValues, setUniqueValues] = useState<string[]>([]);
  const [valueMapping, setValueMapping] = useState<Record<string, string>>({});

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [allSheetsData, setAllSheetsData] = useState<Record<string, any[][]>>(
    {},
  );
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [startRow, setStartRow] = useState<number>(2);
  const [endRow, setEndRow] = useState<number>(0);
  const [excelRawData, setExcelRawData] = useState<any[]>([]);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const [sheetLayoutMode, setSheetLayoutMode] = useState<
    "auto" | "single" | "two-row"
  >("auto");

  const isOtSubRow = (row: any[]): boolean => {
    if (!row || !Array.isArray(row)) return false;
    for (let col = 0; col < Math.min(row.length, 15); col++) {
      const str = String(row[col] || "").trim().toUpperCase();
      if (str === "OT" || str === "O.T." || str === "OVERTIME" || str.includes("OVERTIME")) {
        return true;
      }
    }
    return false;
  };

  const detectTwoRowFormat = (rows: any[][]): boolean => {
    let otCount = 0;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      if (isOtSubRow(rows[i])) {
        otCount++;
      }
    }
    return otCount > 0;
  };

  const findLastNonEmptyRow = (rows: any[][]) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i] || [];
      const isNotEmpty = row.some(
        (cell) =>
          cell !== null && cell !== undefined && String(cell).trim() !== "",
      );
      if (isNotEmpty) {
        return i + 1;
      }
    }
    return rows.length;
  };

  useEffect(() => {
    if (excelRawData.length >= headerRow && headerRow > 0) {
      const actualHeaders = excelRawData[headerRow - 1] || [];
      const cleanHeaders = actualHeaders
        .filter((h) => h !== null && String(h).trim() !== "")
        .map((h) => String(h).trim());

      const filteredHeaders = cleanHeaders
        .filter((h) => {
          const trimmed = String(h).trim();
          const l = trimmed.toLowerCase();
          const num = Number(trimmed);
          if (trimmed === "") return false;

          if (
            l === "p" ||
            l === "a" ||
            l === "l" ||
            l === "h" ||
            l === "hd" ||
            l === "wo" ||
            l === "status" ||
            (l.includes("total") && !l.includes("ot"))
          ) {
            return false;
          }

          if (isNaN(num)) return true;
          if (num > 0 && num <= 31) return true;
          if (num >= 40000 && num <= 60000) return true;
          return false;
        })
        .map((h) => String(h).trim());

      const aiReadyHeaders = filteredHeaders.map((h) => {
        if (!isNaN(Number(h)) && Number(h) >= 40000 && Number(h) <= 60000) {
          try {
            const d = new Date((Number(h) - 25569) * 86400 * 1000);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            const day = String(d.getUTCDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
          } catch (e) {
            return String(h);
          }
        }
        return String(h);
      });

      setDetectedHeaders(filteredHeaders);

      let guessedEmpCode =
        filteredHeaders.find((h) => {
          const l = h.toLowerCase();
          if (l.includes("sr") || l.includes("serial") || l.includes("s.no"))
            return false;
          return (
            (l.includes("code") ||
              l.match(/\bid\b/) ||
              l.match(/\bemp no\b/)) &&
            !l.includes("uan")
          );
        }) || "";
      if (!guessedEmpCode)
        guessedEmpCode =
          filteredHeaders.find(
            (h) => h.toLowerCase() === "employee" || h.toLowerCase() === "emp",
          ) || "";

      const guessedUanNumber =
        filteredHeaders.find((h) => {
          const l = h.toLowerCase();
          return l.includes("uan");
        }) || "";

      const guessedEmpName =
        filteredHeaders.find((h) => h.toLowerCase().includes("name")) || "";
      const guessedOtHrs =
        filteredHeaders.find((h) => {
          const l = h.toLowerCase();
          return (
            (l.includes("ot") || l.includes("overtime")) && !l.includes("total")
          );
        }) || "";
      const guessedDateCols = filteredHeaders.filter((h) => {
        const l = String(h).toLowerCase();
        if (
          l.includes("name") ||
          l.includes("code") ||
          l.includes("id") ||
          l.includes("uan") ||
          l.includes("sr") ||
          l.includes("location") ||
          l.includes("shift") ||
          l.includes("total") ||
          l.includes("ot") ||
          l.includes("overtime")
        )
          return false;
        if (h.match(/\d{1,2}-[a-zA-Z]{3,9}-\d{2,4}/)) return true;
        if (h.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) return true;

        const num = Number(h);
        if (!isNaN(num)) {
          if (num > 0 && num <= 31) return true;
          if (num >= 40000 && num <= 60000) return true;
        }
        if (
          l === "p" ||
          l === "a" ||
          l === "present" ||
          l === "absent" ||
          l === "status"
        )
          return false;
        return false;
      });

      setManualMapping({
        empCode: guessedEmpCode,
        uanNumber: guessedUanNumber,
        empName: guessedEmpName,
        dateCols: guessedDateCols,
        overtimeHours: guessedOtHrs,
        // @ts-ignore
        _aiHeaders: aiReadyHeaders,
      });
    } else {
      setDetectedHeaders([]);
    }
  }, [excelRawData, headerRow]);

  const formatExcelID = (val: any) => {
    if (val === undefined || val === null || val === "") return "";

    if (typeof val === "number") {
      if (val > 1000000) {
        return BigInt(Math.round(val)).toString();
      }
      return String(val);
    }

    const strVal = String(val).trim();
    const num = Number(strVal);
    if (!isNaN(num) && strVal.length > 0) {
      if (num > 1000000) {
        return BigInt(Math.round(num)).toString();
      }
    }
    return strVal;
  };

  const validateImportData = (data: any[]): boolean => {
    try {
      const result = ImportDailyAttendanceDataSchema.safeParse({ data });
      if (!result.success) {
        const formattedErrors = result.error.errors.map(
          (err) => `${err.path[2]}: ${err.message}`,
        );
        setValidationErrors(formattedErrors);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Daily Attendance Data validation", error);
      setValidationErrors(["Unexpected error during validation"]);
      return false;
    }
  };

  const processFlattenedData = (analysis: any) => {
    try {
      const employeeCodeKey = analysis.employeeCodeKey || analysis.empCode;
      const uanNumberKey = analysis.uanNumberKey || analysis.uanNumber;
      const employeeNameKey = analysis.employeeNameKey || analysis.empName;
      const overtimeHoursKey =
        analysis.overtimeHoursKey || analysis.overtimeHours;

      let dateKeys = analysis.dateKeys || analysis.dateCols || [];

      const dateKeysInOrder = detectedHeaders.filter((h, i) => {
        const aiHeader = (manualMapping as any)._aiHeaders
          ? (manualMapping as any)._aiHeaders[i]
          : h;
        return (
          dateKeys.includes(String(h)) || dateKeys.includes(String(aiHeader))
        );
      });
      dateKeys = dateKeysInOrder;

      const mappedMatchingCol =
        matchingKey === "employee_code"
          ? employeeCodeKey
          : matchingKey === "uan_number"
            ? uanNumberKey
            : employeeNameKey;

      if (!mappedMatchingCol || dateKeys.length === 0) {
        const msg = !mappedMatchingCol
          ? `${replaceUnderscore(matchingKey)} column is required for matching`
          : "Please select Date columns.";
        setErrors((prev) => ({ ...prev, general: msg }));
        toast({
          title: "Mapping Incomplete",
          description: msg,
          variant: "destructive",
        });
        setIsProcessingExcel(false);
        setShowManualMapping(true);
        return;
      }

      setErrors((prev) => {
        const n = { ...prev };
        delete n.general;
        return n;
      });

      const flattenedRecords: any[] = [];
      const headers = excelRawData[headerRow - 1] || [];
      const dataRows = excelRawData.slice(startRow - 1, endRow);

      const findIndex = (target: any) => {
        if (!target) return -1;

        const clean = (s: any) =>
          String(s || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        const targetClean = clean(target);

        let idx = headers.findIndex((h) => clean(h) === targetClean);

        if (idx === -1) {
          idx = headers.findIndex((h) => {
            if (!isNaN(Number(h)) && Number(h) >= 40000 && Number(h) <= 60000) {
              try {
                const d = new Date((Number(h) - 25569) * 86400 * 1000);
                const y = d.getUTCFullYear();
                const m = String(d.getUTCMonth() + 1).padStart(2, "0");
                const day = String(d.getUTCDate()).padStart(2, "0");
                const dateStr = `${y}-${m}-${day}`;
                return clean(dateStr) === targetClean;
              } catch (e) {
                return false;
              }
            }
            return false;
          });
        }

        return idx;
      };

      const empCodeIdx = findIndex(employeeCodeKey);
      const uanIdx = findIndex(uanNumberKey);
      const empNameIdx = employeeNameKey ? findIndex(employeeNameKey) : -1;
      const otHrsIdx = overtimeHoursKey ? findIndex(overtimeHoursKey) : -1;
      const cleanDateKeys = dateKeys.filter(
        (dk: string) =>
          dk !== employeeCodeKey &&
          dk !== uanNumberKey &&
          dk !== employeeNameKey &&
          dk !== overtimeHoursKey,
      );
      const dateIndices = cleanDateKeys
        .map((dk: string) => ({ original: dk, index: findIndex(dk) }))
        .filter((d: { original: string; index: number }) => d.index !== -1);

      if (empCodeIdx === -1 && uanIdx === -1) {
        console.error(
          "[Import Debug] Neither Employee code nor UAN column found in header row:",
          headerRow,
        );
      }

      if (uniqueValues.length === 0 || Object.keys(valueMapping).length === 0) {
        const detectedUniqueValues = new Set<string>();
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (isOtSubRow(row)) continue;
          const empCode = formatExcelID(row[empCodeIdx]);
          const uanNumber = formatExcelID(row[uanIdx]);
          const empNameRaw =
            empNameIdx !== -1 ? String(row[empNameIdx] || "").trim() : "";

          if (
            (!empCode || String(empCode).trim() === "") &&
            (!uanNumber || String(uanNumber).trim() === "") &&
            (!empNameRaw || empNameRaw === "")
          ) {
            continue;
          }

          for (const { index: dateIdx } of dateIndices) {
            const rawStatus = String(row[dateIdx] || "")
              .trim()
              .toUpperCase();
            if (
              rawStatus &&
              rawStatus.toLowerCase() !== "undefined" &&
              rawStatus !== "" &&
              isNaN(Number(rawStatus))
            ) {
              detectedUniqueValues.add(rawStatus);
            }
          }
        }

        const uniqueList = Array.from(detectedUniqueValues).sort();
        setUniqueValues(uniqueList);

        const initialMapping: Record<string, string> = {};
        uniqueList.forEach((val) => {
          const l = val.toLowerCase();
          if (l === "p" || l === "present" || l === "g")
            initialMapping[val] = "P";
          else if (l === "a" || l === "absent" || l === "ab")
            initialMapping[val] = "A";
          else if (l === "hd" || l === "half day" || l === "halfday" || l === "hf" || l === "0.5")
            initialMapping[val] = "HD";
          else if (l === "wo" || l === "wof" || l === "weekly off" || l === "w")
            initialMapping[val] = "WO";
          else if (l === "h" || l === "holiday" || l === "ph")
            initialMapping[val] = "H";
          else if (l === "cl") initialMapping[val] = "CL";
          else if (l === "el") initialMapping[val] = "EL";
          else if (l === "ml") initialMapping[val] = "ML";
          else if (l === "pl") initialMapping[val] = "PL";
          else if (l === "r") initialMapping[val] = "P";
        });
        setValueMapping(initialMapping);
        setCurrentStep("values");
        setIsProcessingExcel(false);
        return;
      }

      const activeTwoRow =
        sheetLayoutMode === "two-row" ||
        (sheetLayoutMode === "auto" && detectTwoRowFormat(dataRows));

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (activeTwoRow && isOtSubRow(row)) {
          continue;
        }

        const empCode = formatExcelID(row[empCodeIdx]);
        const uanNumber = formatExcelID(row[uanIdx]);
        const empNameRaw =
          empNameIdx !== -1 ? String(row[empNameIdx] || "").trim() : "";

        if (
          (!empCode || String(empCode).trim() === "") &&
          (!uanNumber || String(uanNumber).trim() === "") &&
          (!empNameRaw || empNameRaw === "")
        ) {
          continue;
        }

        const nextRow = i + 1 < dataRows.length ? dataRows[i + 1] : null;
        const otRow =
          activeTwoRow && nextRow && isOtSubRow(nextRow) ? nextRow : null;

        let empName = "";
        if (empNameIdx !== -1) {
          empName = String(row[empNameIdx] || "").trim();
        }

        let overtimeHours = "0";
        if (otHrsIdx !== -1) {
          overtimeHours = String(row[otHrsIdx] || "0").trim();
        }

        const dayNumbers = dateIndices
          .map((d) => {
            const num = Number(d.original);
            if (!isNaN(num) && num >= 40000 && num <= 60000) {
              const date = new Date((num - 25569) * 86400 * 1000);
              return date.getUTCDate();
            }
            const match = String(d.original).match(/^(\d{1,2})/);
            return match ? parseInt(match[1]) : null;
          })
          .filter((n) => n !== null) as number[];

        let isSplitMonth = false;
        if (dayNumbers.length > 1) {
          for (let dIdx = 1; dIdx < dayNumbers.length; dIdx++) {
            if (dayNumbers[dIdx] < dayNumbers[dIdx - 1]) {
              isSplitMonth = true;
              break;
            }
          }
        }

        let dayIdx = 0;
        for (const { original: rawDateKey, index: dateIdx } of dateIndices) {
          const rawStatus = String(row[dateIdx] || "")
            .trim()
            .toUpperCase();

          if (rawStatus && rawStatus.toLowerCase() !== "undefined") {
            const mappedStatus = valueMapping[rawStatus] || rawStatus;
            let cleanDate = rawDateKey;
            try {
              const numHeader = Number(rawDateKey);
              if (
                !isNaN(numHeader) &&
                numHeader >= 40000 &&
                numHeader <= 60000
              ) {
                const d = new Date((numHeader - 25569) * 86400 * 1000);
                const y = d.getUTCFullYear();
                const m = String(d.getUTCMonth() + 1).padStart(2, "0");
                const day = String(d.getUTCDate()).padStart(2, "0");
                cleanDate = `${y}-${m}-${day}`;
              } else {
                const dayMatch = String(rawDateKey).match(/^(\d{1,2})/);
                const dayNum = dayMatch ? parseInt(dayMatch[1]) : null;

                if (dayNum !== null && dayNum <= 31) {
                  let targetMonthIdx = months.indexOf(selectedMonth);
                  let targetYearNum = Number(selectedYear);

                  if (isSplitMonth && dayNum > 20) {
                    targetMonthIdx -= 1;
                    if (targetMonthIdx < 0) {
                      targetMonthIdx = 11;
                      targetYearNum -= 1;
                    }
                  }

                  const targetDate = new Date(
                    targetYearNum,
                    targetMonthIdx,
                    dayNum,
                  );
                  const y = targetDate.getFullYear();
                  const m = String(targetDate.getMonth() + 1).padStart(2, "0");
                  const d = String(targetDate.getDate()).padStart(2, "0");
                  cleanDate = `${y}-${m}-${d}`;
                } else {
                  const normalized = normalizeDate(rawDateKey);
                  if (normalized) {
                    cleanDate = String(normalized);
                  }
                }
              }
            } catch (e) {}

            const rawRowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              if (h) rawRowObj[String(h)] = row[idx];
            });

            let calculatedOt = "0";
            if (otRow && dateIdx < otRow.length) {
              const otVal = String(otRow[dateIdx] || "").trim();
              if (otVal !== "" && !isNaN(Number(otVal)) && Number(otVal) > 0) {
                calculatedOt = otVal;
              }
            }
            if (calculatedOt === "0" && dayIdx === 0) {
              calculatedOt = overtimeHours;
            }

            flattenedRecords.push({
              employee_code: empCode ? String(empCode) : "",
              uan_number: uanNumber ? String(uanNumber) : "",
              employee_name: empName,
              sheet_name: selectedSheet,
              raw_row: rawRowObj,
              date: cleanDate,
              present: mappedStatus,
              target_month: selectedMonth,
              target_year: selectedYear,
              overtime_hours: calculatedOt,
              excel_row_index: i,
            });
            dayIdx++;
          }
        }

        if (otRow) {
          i++;
        }
      }

      if (flattenedRecords.length === 0) {
        const msg =
          "No attendance data found for the selected columns. Please check your mapping.";
        setErrors((prev) => ({ ...prev, general: msg }));
        toast({
          title: "Empty Result",
          description: msg,
          variant: "destructive",
        });
        setIsProcessingExcel(false);
        return;
      }

      if (validateImportData(flattenedRecords)) {
        // @ts-ignore
        setImportData({ data: flattenedRecords });
        setLoadNext(true);
      } else {
        setIsProcessingExcel(false);
      }
    } catch (err) {
      console.error(err);
      const msg = "Processing Error: " + String(err);
      setErrors((prev) => ({ ...prev, general: msg }));
      toast({
        title: "Internal Error",
        description: msg,
        variant: "destructive",
      });
      setIsProcessingExcel(false);
    }
  };

  useEffect(() => {
    if (ActionData?.analysis && excelRawData.length > 0) {
      const analysis = { ...ActionData.analysis };

      setManualMapping((prev) => ({
        ...prev,
        empCode: analysis.employeeCodeKey || prev.empCode,
        uanNumber: analysis.uanNumberKey || prev.uanNumber,
        empName: analysis.employeeNameKey || prev.empName,
        dateCols:
          analysis.dateKeys.length > 0 ? analysis.dateKeys : prev.dateCols,
        overtimeHours: analysis.overtimeHoursKey || prev.overtimeHours,
      }));

      processFlattenedData(analysis);
    } else if (ActionData?.error) {
      setErrors((prev) => ({ ...prev, general: ActionData.error }));
      setIsProcessingExcel(false);
      setShowManualMapping(true);
    }
  }, [ActionData, excelRawData]);
  const hasParsed = useRef(false);

  useEffect(() => {
    if (file && !hasParsed.current) {
      hasParsed.current = true;
      if (file.name.endsWith(".csv")) {
        Papa.parse(file, {
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<string[]>) => {
            const allRows = results.data;
            if (allRows.length === 0) return;

            const keywords = [
              "employee",
              "code",
              "name",
              "id",
              "date",
              "present",
              "absent",
              "status",
            ];
            let foundIndex = 0;
            for (let i = 0; i < Math.min(allRows.length, 50); i++) {
              const row = allRows[i] || [];
              const cleanRow = row
                .map((h) => String(h || "").trim())
                .filter((h) => h !== "");
              const hasKeyword = cleanRow.some((h) =>
                keywords.some((k) => h.toLowerCase().includes(k)),
              );
              if (cleanRow.length >= 2 && hasKeyword) {
                foundIndex = i;
                break;
              }
            }

            setSheetNames([file.name]);
            setSelectedSheet(file.name);
            setAllSheetsData({ [file.name]: allRows });
            setExcelRawData(allRows);
            setHeaderRow(foundIndex + 1);
            setStartRow(foundIndex + 2);
            setEndRow(findLastNonEmptyRow(allRows));
          },
          error: (error) => {
            console.error("Attendance CSV Header parsing error:", error);
            setErrors((prev) => ({
              ...prev,
              parsing: "Error parsing headers",
            }));
            hasParsed.current = false;
          },
        });
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        handleParsedExcelData();
      }
    }
  }, [file]);

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const data = allSheetsData[sheetName] || [];
    setExcelRawData(data);

    const keywords = [
      "employee",
      "code",
      "name",
      "id",
      "date",
      "present",
      "absent",
      "status",
    ];
    let foundIndex = 0;
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      const row = data[i] || [];
      const cleanRow = row
        .map((h) => String(h || "").trim())
        .filter((h) => h !== "");
      const hasKeyword = cleanRow.some((h) =>
        keywords.some((k) => h.toLowerCase().includes(k)),
      );
      if (cleanRow.length >= 2 && hasKeyword) {
        foundIndex = i;
        break;
      }
    }

    setHeaderRow(foundIndex + 1);
    setStartRow(foundIndex + 2);
    setEndRow(findLastNonEmptyRow(data));
  };

  const handleSubmitToAi = () => {
    if (detectedHeaders.length === 0) return;
    setIsProcessingExcel(true);

    // @ts-ignore
    const headersToSend = manualMapping._aiHeaders || detectedHeaders;

    submit(
      {
        headers: JSON.stringify(headersToSend),
      },
      { method: "POST" },
    );
  };

  const handleParsedExcelData = async () => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, {
          type: "array",
          cellNF: true,
          cellText: true,
          cellV: true,
        });

        const sheets: Record<string, any[][]> = {};
        const names = workbook.SheetNames;
        for (const name of names) {
          const worksheet = workbook.Sheets[name];
          sheets[name] = XLSX.utils.sheet_to_json<any[]>(worksheet, {
            header: 1,
            raw: true,
            defval: "",
          });
        }

        const initialSheet = names[0];
        const initialData = sheets[initialSheet] || [];

        let foundIndex = 0;
        const keywords = [
          "employee",
          "code",
          "name",
          "id",
          "date",
          "present",
          "absent",
          "status",
        ];
        for (let i = 0; i < Math.min(initialData.length, 50); i++) {
          const row = initialData[i] || [];
          const cleanRow = row
            .map((h) => String(h || "").trim())
            .filter((h) => h !== "");
          const hasKeyword = cleanRow.some((h) =>
            keywords.some((k) => h.toLowerCase().includes(k)),
          );
          if (cleanRow.length >= 2 && hasKeyword) {
            foundIndex = i;
            break;
          }
        }

        setSheetNames(names);
        setSelectedSheet(initialSheet);
        setAllSheetsData(sheets);
        setExcelRawData(initialData);
        setHeaderRow(foundIndex + 1);
        setStartRow(foundIndex + 2);
        setEndRow(findLastNonEmptyRow(initialData));
      } catch (error) {
        console.error(error);
        setErrors((prev) => ({ ...prev, parsing: "Error parsing Excel data" }));
        setShowManualMapping(true);
        hasParsed.current = false;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <section className="p-4">
      {loadNext ? (
        <EmployeeDailyAttendanceImportData
          env={env}
          session={session}
          intent={intent}
          companyId={companyId}
          matchingKey={matchingKey}
          onBack={() => setLoadNext(false)}
        />
      ) : (
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Attendance Import Processing</CardTitle>
            <CardDescription>
              Select the payroll timeframe and scan your spreadsheet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationErrors.length > 0 && (
              <div className="mb-6 p-4 border border-red-500/10 bg-red-500/5 rounded-lg text-xs">
                <h4 className="text-red-500 font-bold mb-2 uppercase">
                  Structure Issues Found:
                </h4>
                <ul className="grid grid-cols-2 gap-y-1">
                  {validationErrors.map((error, index) => (
                    <li
                      key={index}
                      className="text-red-500/80 truncate flex items-center gap-1.5"
                    >
                      <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground capitalize">
                    Sheet Layout
                  </label>
                  <Combobox
                    options={[
                      { label: "Auto-Detect", value: "auto" },
                      { label: "Standard (1 Row)", value: "single" },
                      { label: "2-Row (Status + OT)", value: "two-row" },
                    ]}
                    placeholder="Layout"
                    value={sheetLayoutMode}
                    onChange={(val) =>
                      setSheetLayoutMode(
                        val as "auto" | "single" | "two-row",
                      )
                    }
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground capitalize">
                    Payroll Month
                  </label>
                  <Combobox
                    options={transformStringArrayIntoOptions(months)}
                    placeholder="Month"
                    value={selectedMonth}
                    onChange={(val) => setSelectedMonth(val)}
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground capitalize">
                    Payroll Year
                  </label>
                  <Combobox
                    options={transformStringArrayIntoOptions(years)}
                    placeholder="Year"
                    value={selectedYear}
                    onChange={(val) => setSelectedYear(val)}
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground capitalize">
                    Select Sheet
                  </label>
                  <Combobox
                    options={transformStringArrayIntoOptions(sheetNames)}
                    placeholder="Sheet"
                    value={selectedSheet}
                    onChange={handleSheetChange}
                    disabled={sheetNames.length <= 1}
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground capitalize">
                    Header Row
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={headerRow || ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setHeaderRow(val);
                      if (startRow <= val) {
                        setStartRow(val + 1);
                      }
                    }}
                    onBlur={() => setHeaderRow(Math.max(1, headerRow))}
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground capitalize">
                    Import Range
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 w-1/2">
                      <span className="text-sm text-muted-foreground font-medium">
                        S:
                      </span>
                      <Input
                        type="number"
                        min={headerRow + 1}
                        value={startRow || ""}
                        onChange={(e) =>
                          setStartRow(parseInt(e.target.value) || 0)
                        }
                        onBlur={() =>
                          setStartRow(Math.max(headerRow + 1, startRow))
                        }
                        className="w-full px-2"
                      />
                    </div>
                    <div className="flex items-center gap-1 w-1/2">
                      <span className="text-sm text-muted-foreground font-medium">
                        E:
                      </span>
                      <Input
                        type="number"
                        min={startRow}
                        value={endRow || ""}
                        onChange={(e) =>
                          setEndRow(parseInt(e.target.value) || 0)
                        }
                        onBlur={() => setEndRow(Math.max(startRow, endRow))}
                        className="w-full px-2"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-primary/5 rounded-xl border border-primary/20 shadow-sm animate-in fade-in duration-300">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                        1
                      </span>
                      Selection for Record Matching
                    </h3>
                    <p className="text-xs text-muted-foreground ml-7">
                      Choose which unique identifier to use for locating
                      existing employees. This field is for{" "}
                      <span className="font-bold text-foreground italic underline">
                        matching only
                      </span>{" "}
                      and its value cannot be updated through this import.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-7 mt-1">
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Matching Identifier{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <Combobox
                        options={[
                          { label: "Employee Code", value: "employee_code" },
                          { label: "Employee Name", value: "employee_name" },
                          { label: "UAN Number", value: "uan_number" },
                        ]}
                        value={matchingKey}
                        onChange={(val) => {
                          setMatchingKey(val as string);
                          setErrors((prev) => {
                            const n = { ...prev };
                            delete n.general;
                            return n;
                          });
                        }}
                        placeholder="Select matching identifier"
                        className="w-full"
                      />
                    </div>

                    {matchingKey && (
                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Column for {replaceUnderscore(matchingKey)}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <Combobox
                          options={transformStringArrayIntoOptions(
                            detectedHeaders,
                          )}
                          value={
                            matchingKey === "employee_code"
                              ? manualMapping.empCode
                              : matchingKey === "uan_number"
                                ? manualMapping.uanNumber
                                : manualMapping.empName
                          }
                          onChange={(value) => {
                            setManualMapping((prev) => ({
                              ...prev,
                              empCode:
                                matchingKey === "employee_code"
                                  ? (value as string)
                                  : prev.empCode,
                              uanNumber:
                                matchingKey === "uan_number"
                                  ? (value as string)
                                  : prev.uanNumber,
                              empName:
                                matchingKey === "employee_name"
                                  ? (value as string)
                                  : prev.empName,
                            }));
                          }}
                          placeholder={`Select ${replaceUnderscore(matchingKey)} column`}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {currentStep === "values" ? (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex flex-col">
                      <h4 className="text-sm font-bold text-foreground">
                        Attendance Value Mapping
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Map the unique values found in your sheet to standard
                        categories.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCurrentStep("columns");
                        setUniqueValues([]);
                        setValueMapping({});
                      }}
                    >
                      Back to Columns
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[400px] overflow-auto p-1">
                    {uniqueValues.map((val) => (
                      <div
                        key={val}
                        className="flex flex-col gap-1.5 p-3 rounded-xl border bg-card/50 shadow-sm"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            Sheet Value
                          </span>
                          <span
                            className="text-sm font-semibold text-foreground truncate max-w-[220px]"
                            title={val}
                          >
                            {val}
                          </span>
                        </div>
                        <Combobox
                          options={ATTENDANCE_CATEGORIES}
                          value={valueMapping[val]}
                          onChange={(mappedVal) =>
                            setValueMapping((prev) => ({
                              ...prev,
                              [val]: mappedVal,
                            }))
                          }
                          placeholder="Map to..."
                          className="w-full h-9 text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full h-11 font-bold"
                    disabled={isProcessingExcel}
                    onClick={() => {
                      setIsProcessingExcel(true);
                      const analysis = showManualMapping
                        ? {
                            employeeCodeKey: manualMapping.empCode,
                            uanNumberKey: manualMapping.uanNumber,
                            employeeNameKey: manualMapping.empName,
                            dateKeys: manualMapping.dateCols,
                            overtimeHoursKey: manualMapping.overtimeHours,
                          }
                        : ActionData?.analysis || {};

                      setTimeout(() => {
                        processFlattenedData(analysis);
                      }, 50);
                    }}
                  >
                    {isProcessingExcel
                      ? "Processing..."
                      : "Finalize & Preview Data"}
                  </Button>
                </div>
              ) : showManualMapping ? (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex flex-col">
                      <h4 className="text-sm font-bold text-foreground">
                        Manual Column Mapping
                      </h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowManualMapping(false)}
                    >
                      Try AI Again
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    {matchingKey !== "employee_code" && (
                      <div className="flex flex-col gap-1.5 animate-in fade-in duration-300">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground ml-1">
                          Employee Code
                        </span>
                        <Combobox
                          options={transformStringArrayIntoOptions(
                            detectedHeaders,
                          )}
                          value={manualMapping.empCode}
                          onChange={(val) => {
                            setManualMapping((prev) => ({
                              ...prev,
                              empCode: val,
                            }));
                          }}
                          placeholder="Select Code col"
                          className="w-full h-10"
                        />
                      </div>
                    )}
                    {matchingKey !== "uan_number" && (
                      <div className="flex flex-col gap-1.5 animate-in fade-in duration-300">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground ml-1">
                          UAN Number
                        </span>
                        <Combobox
                          options={transformStringArrayIntoOptions(
                            detectedHeaders,
                          )}
                          value={manualMapping.uanNumber}
                          onChange={(val) => {
                            setManualMapping((prev) => ({
                              ...prev,
                              uanNumber: val,
                            }));
                          }}
                          placeholder="Select UAN col"
                          className="w-full h-10"
                        />
                      </div>
                    )}
                    {matchingKey !== "employee_name" && (
                      <div className="flex flex-col gap-1.5 animate-in fade-in duration-300">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground ml-1">
                          Employee Name
                        </span>
                        <Combobox
                          options={transformStringArrayIntoOptions(
                            detectedHeaders,
                          )}
                          value={manualMapping.empName}
                          onChange={(val) => {
                            setManualMapping((prev) => ({
                              ...prev,
                              empName: val,
                            }));
                          }}
                          placeholder="Select Name col"
                          className="w-full h-10"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground ml-1">
                        OT Hours
                      </span>
                      <Combobox
                        options={transformStringArrayIntoOptions(
                          detectedHeaders,
                        )}
                        value={manualMapping.overtimeHours}
                        onChange={(val) =>
                          setManualMapping((prev) => ({
                            ...prev,
                            overtimeHours: val,
                          }))
                        }
                        placeholder="Select OT col"
                        className="w-full h-10"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground ml-1">
                      Date Columns ({manualMapping.dateCols.length})
                    </span>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 p-3 rounded-lg border bg-muted/10 max-h-48 overflow-auto">
                      {detectedHeaders
                        .filter((h) => {
                          const l = String(h).toLowerCase();
                          if (
                            h === manualMapping.empCode ||
                            h === manualMapping.uanNumber ||
                            h === manualMapping.empName ||
                            h === manualMapping.overtimeHours
                          )
                            return false;
                          if (
                            l.includes("sr") ||
                            l.includes("location") ||
                            l.includes("shift") ||
                            l.includes("name") ||
                            l.includes("code") ||
                            l.includes("id") ||
                            l.includes("uan") ||
                            l.includes("ot") ||
                            l.includes("overtime") ||
                            l.includes("total")
                          )
                            return false;
                          return true;
                        })
                        .map((h) => {
                          let displayHeader = h;
                          if (!isNaN(Number(h)) && Number(h) > 40000) {
                            try {
                              const d = new Date(
                                (Number(h) - 25569) * 86400 * 1000,
                              );
                              displayHeader = d.toLocaleDateString("default", {
                                day: "numeric",
                                month: "short",
                              });
                            } catch (e) {}
                          }
                          return (
                            <label
                              key={h}
                              className={`group flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all cursor-pointer ${manualMapping.dateCols.includes(h) ? "bg-primary border-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={manualMapping.dateCols.includes(h)}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setManualMapping((prev) => ({
                                      ...prev,
                                      dateCols: [...prev.dateCols, h],
                                    }));
                                  else
                                    setManualMapping((prev) => ({
                                      ...prev,
                                      dateCols: prev.dateCols.filter(
                                        (x) => x !== h,
                                      ),
                                    }));
                                }}
                              />
                              <span className="text-[10px] font-bold text-center leading-tight truncate w-full">
                                {displayHeader}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      className="w-1/2 h-11 font-bold"
                      onClick={() => navigate("/time-tracking/attendance")}
                    >
                      Back
                    </Button>
                    <Button
                      className="w-1/2 h-11 font-bold"
                      disabled={isProcessingExcel}
                      onClick={() => {
                        setIsProcessingExcel(true);
                        setTimeout(() => {
                          processFlattenedData({
                            employeeCodeKey: manualMapping.empCode,
                            uanNumberKey: manualMapping.uanNumber,
                            employeeNameKey: manualMapping.empName,
                            dateKeys: manualMapping.dateCols,
                            overtimeHoursKey: manualMapping.overtimeHours,
                          });
                        }, 50);
                      }}
                    >
                      {isProcessingExcel
                        ? "Processing..."
                        : "Confirm & Sync Attendance"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8">
                  <p className="text-sm font-medium text-muted-foreground">
                    Submit for AI analysis or map the columns manually.
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      className="w-40 h-11 font-bold"
                      onClick={() => navigate("/time-tracking/attendance")}
                    >
                      Back
                    </Button>
                    <Button
                      className="w-40 h-11 font-bold"
                      onClick={handleSubmitToAi}
                      disabled={
                        isProcessingExcel || detectedHeaders.length === 0
                      }
                    >
                      {isProcessingExcel ? "Analyzing..." : "Submit to AI"}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-40 h-11 font-bold"
                      onClick={() => {
                        if (detectedHeaders.length > 0) {
                          setShowManualMapping(true);
                        } else {
                          handleParsedExcelData(false);
                          setShowManualMapping(true);
                        }
                      }}
                    >
                      Map Manually
                    </Button>
                  </div>
                </div>
              )}

              {errors.general && !showManualMapping && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 text-[11px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
                  {errors.general}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
