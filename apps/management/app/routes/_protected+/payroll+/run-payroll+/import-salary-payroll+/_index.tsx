import { useState, useEffect, useRef } from "react";
import {
  json,
  useLoaderData,
  useLocation,
  useFetcher,
  useNavigate,
} from "@remix-run/react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Input } from "@canny_ecosystem/ui/input";
import type { ImportSalaryPayrollHeaderSchemaObject } from "@canny_ecosystem/utils";
import {
  getPayrollById,
  type ImportSalaryPayrollDataType,
} from "@canny_ecosystem/supabase/queries";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  transformStringArrayIntoOptions,
  replaceUnderscore,
  pipe,
  replaceDash,
  ImportSalaryPayrollHeaderSchema,
  ImportSalaryPayrollDataSchema,
  componentTypeArray,
  defaultYear,
  defaultMonth,
} from "@canny_ecosystem/utils";
import type { z } from "zod";
import { useImportStoreForSalaryPayroll } from "@/store/import";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { SalaryPayrollImportData } from "@/components/payroll/import-export/salary-payroll-import-data";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { suggestFieldMapping } from "@/utils/ai/import-mapping";

export type FieldConfig = {
  key: string;
  required?: boolean;
  type?: string;
};

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "employee_code",
  },
  {
    key: "uan_number",
  },
  {
    key: "esic_number",
  },
  {
    key: "present_days",
    required: true,
  },
];

const DEFAULT_PAYMENT_FIELDS = [
  { name: "BASIC", display_name: "BASIC", type: "earning" },
  { name: "HRA", display_name: "HRA", type: "earning" },
  { name: "DA", display_name: "DA", type: "earning" },
  { name: "SPECIAL_ALLOWANCE", display_name: "SPECIAL ALLOWANCE", type: "earning" },
  { name: "CONVEYANCE", display_name: "CONVEYANCE", type: "earning" },
  { name: "TRANSPORTATION", display_name: "TRANSPORTATION", type: "earning" },
  { name: "LTA", display_name: "LTA", type: "earning" },
  { name: "BONUS", display_name: "BONUS", type: "earning" },
  { name: "OVERTIME", display_name: "OVERTIME", type: "earning" },
  { name: "OVERTIME_AMOUNT", display_name: "OVERTIME AMOUNT", type: "earning" },
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
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);
  const rawPayrollId = url.searchParams.get("payrollId");
  const payrollId =
    rawPayrollId && rawPayrollId !== "undefined" ? rawPayrollId : null;

  let payrollFieldsData: any[] = [];
  if (payrollId) {
    const { data } = await supabase
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
  } else {
    const { data: companyFieldsData } = await supabase
      .from("payment_fields")
      .select("*")
      .eq("company_id", companyId)
      .order("name");

    for (const f of companyFieldsData || []) {
      const trimmedName = f.name.trim();
      combinedMap.set(trimmedName.toLowerCase(), {
        id: f.id,
        name: trimmedName,
        display_name: (f.display_name || f.name).trim(),
        type: f.type,
        calculation_type: f.calculation_type,
        formula: f.formula,
        is_pro_rata: f.is_pro_rata,
        fixed_type: f.fixed_type,
        is_overtime: f.is_overtime,
        consider_for_epf: f.consider_for_epf,
        consider_for_esic: f.consider_for_esic,
        consider_for_bonus: f.consider_for_bonus,
      });
    }
  }

  const dbPaymentFields = Array.from(combinedMap.values());

  return json({ env, companyId, dbPaymentFields });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "suggest-mapping") {
    const headers = JSON.parse(formData.get("headers") as string);
    const targetFields = JSON.parse(formData.get("targetFields") as string);
    const result = await suggestFieldMapping({ headers, targetFields });
    return json(result);
  }

  return json({});
}

export default function PayrollImportFieldMapping() {
  const today = new Date();
  const { env, companyId, dbPaymentFields } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });
  const location = useLocation();
  const navigate = useNavigate();

  const getPersistedState = () => {
    if (typeof window === "undefined") return null;
    if (location.state?.file) return null;
    const saved = sessionStorage.getItem("payroll_salary_import_state");
    return saved ? JSON.parse(saved) : null;
  };

  const savedState = getPersistedState();

  const [dbFields, setDbFields] = useState<any[]>(dbPaymentFields || []);
  const [fieldTypes, setFieldTypes] = useState<
    Record<string, "earning" | "deduction">
  >(() => {
    if (savedState?.fieldTypes) return savedState.fieldTypes;
    const initialTypes: Record<string, "earning" | "deduction"> = {};
    for (const field of dbPaymentFields || []) {
      initialTypes[field.name] = field.type;
    }
    return initialTypes;
  });
  const { importData, setImportData } = useImportStoreForSalaryPayroll();

  const [addExcelHeader, setAddExcelHeader] = useState("");
  const [addDbField, setAddDbField] = useState("");
  const [customFieldName, setCustomFieldName] = useState("");
  const [customFieldType, setCustomFieldType] = useState("earning");

  const [addField, setAddField] = useState("");
  const [addFieldValue, setAddFieldValue] = useState("");
  const [addFieldValueType, setAddFieldValueType] = useState("");
  const [month, setMonth] = useState(savedState?.month || defaultMonth);
  const [year, setYear] = useState(savedState?.year || defaultYear);

  const [runDate, setRunDate] = useState(
    savedState?.runDate || today.toISOString().split("T")[0],
  );
  const [open, setOpen] = useState(false);
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>(() => {
    if (savedState?.fieldConfigs) return savedState.fieldConfigs;
    return [
      ...FIELD_CONFIGS,
      {
        key: "working_days",
      },
      {
        key: "working_hours",
      },
      {
        key: "overtime_hours",
      },
      {
        key: "absent_days",
      },
      {
        key: "paid_holidays",
      },
      {
        key: "paid_leaves",
      },
      {
        key: "casual_leaves",
      },
    ];
  });

  const [loadNext, setLoadNext] = useState<boolean>(
    savedState?.loadNext || false,
  );
  const [file] = useState(location.state?.file);
  const [initialIntent] = useState(() => {
    if (savedState?.initialIntent) return savedState.initialIntent;
    if (location.state?.intent) return location.state.intent;
    const searchParams = new URLSearchParams(location.search);
    const isIncrement =
      searchParams.get("isIncrement") === "true" ||
      Boolean(location.state?.isIncrement);
    if (isIncrement) return "overwrite";
    return "skip";
  });
  const [matchingKey, setMatchingKey] = useState<string>(
    savedState?.matchingKey || "employee_code",
  );
  const [payrollId] = useState(() => {
    if (savedState?.payrollId) return savedState.payrollId;
    const stateId = location.state?.payrollId;
    if (stateId && stateId !== "undefined") return stateId;
    const searchParams = new URLSearchParams(location.search);
    const queryId = searchParams.get("payrollId");
    if (queryId && queryId !== "undefined") return queryId;
    return null;
  });
  const [sheetNames, setSheetNames] = useState<string[]>(
    savedState?.sheetNames || [],
  );
  const [selectedSheet, setSelectedSheet] = useState<string>(
    savedState?.selectedSheet || "",
  );
  const [allSheetsData, setAllSheetsData] = useState<Record<string, any[][]>>(
    savedState?.allSheetsData || {},
  );
  const [excelRawData, setExcelRawData] = useState<any[][]>(
    savedState?.excelRawData || [],
  );
  const [headerRow, setHeaderRow] = useState<number>(
    savedState?.headerRow !== undefined ? savedState.headerRow : 1,
  );
  const [startRow, setStartRow] = useState<number>(
    savedState?.startRow !== undefined ? savedState.startRow : 2,
  );
  const [endRow, setEndRow] = useState<number>(
    savedState?.endRow !== undefined ? savedState.endRow : 0,
  );
  const [headerArray, setHeaderArray] = useState<string[]>(
    savedState?.headerArray || [],
  );
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(
    savedState?.fieldMapping || {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  useEffect(() => {
    async function fetchPayrollFields() {
      if (!payrollId || payrollId === "undefined") return;
      const { data, error } = await supabase
        .from("payroll_fields")
        .select("id, name, type")
        .eq("payroll_id", payrollId)
        .order("name");

      if (error) {
        console.error("Error fetching payroll fields:", error);
        return;
      }

      if (data && data.length > 0) {
        const mappedFields = data.map((f: any) => ({
          id: f.id,
          name: f.name.trim(),
          display_name: f.name.trim(),
          type: f.type,
        }));
        setDbFields(() => {
          const map = new Map<string, any>();
          for (const f of DEFAULT_PAYMENT_FIELDS) {
            const trimmedName = f.name.trim();
            map.set(trimmedName.toLowerCase(), {
              ...f,
              name: trimmedName,
              display_name: f.display_name.trim(),
            });
          }
          for (const item of mappedFields) {
            map.set(item.name.toLowerCase(), item);
          }
          return Array.from(map.values());
        });

        setFieldTypes((prev) => {
          if (savedState?.fieldTypes) return prev;
          const newTypes = { ...prev };
          for (const field of mappedFields) {
            newTypes[field.name] = field.type;
          }
          return newTypes;
        });
      }
    }
    fetchPayrollFields();
  }, [payrollId, supabase]);

  const findLastNonEmptyRow = (rows: any[][]) => {
    if (rows.length === 0) return 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (
        row &&
        row.some(
          (cell) =>
            cell !== null && cell !== undefined && String(cell).trim() !== "",
        )
      ) {
        return i + 1;
      }
    }
    return rows.length;
  };

  useEffect(() => {
    if (excelRawData.length > 0 && headerRow > 0) {
      const rawHeaders = excelRawData[headerRow - 1] || [];
      const cleanHeaders = rawHeaders
        .map((h) => (h === null || h === undefined ? "" : String(h).trim()))
        .filter((h) => h !== "");
      setHeaderArray(cleanHeaders);
    }
  }, [excelRawData, headerRow]);

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
      "basic",
      "salary",
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

  const fetcher = useFetcher<any>();

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

  const handleAISuggestion = () => {
    setIsProcessingAI(true);
    const targetFields = fieldConfigs.map((f) => f.key);
    fetcher.submit(
      {
        intent: "suggest-mapping",
        headers: JSON.stringify(headerArray),
        targetFields: JSON.stringify(targetFields),
      },
      { method: "post" },
    );
  };

  useEffect(() => {
    if (fetcher.data?.mapping) {
      const mapping = fetcher.data.mapping as Record<string, string>;
      setFieldMapping((prev) => ({
        ...prev,
        ...mapping,
      }));

      const mappedKeys = Object.keys(mapping);
      setFieldConfigs((prev) => {
        const updated = [...prev];
        for (const key of mappedKeys) {
          if (!updated.some((f) => f.key.toLowerCase() === key.toLowerCase())) {
            const dbMatch = dbFields.find(
              (db) => db.name.toLowerCase() === key.toLowerCase(),
            );
            updated.push({
              key,
              type: dbMatch?.type || "earning",
              required: false,
            });
          }
        }
        return updated;
      });

      setIsProcessingAI(false);
    } else if (fetcher.state === "idle" && isProcessingAI) {
      setIsProcessingAI(false);
    }
  }, [fetcher.data, fetcher.state, dbFields]);

  useEffect(() => {
    if (file) {
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
              "basic",
              "salary",
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
            console.error("Payroll Header parsing error:", error);
            setErrors((prev) => ({
              ...prev,
              parsing: "Error parsing headers",
            }));
          },
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, {
              type: "array",
              cellDates: true,
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
            const keywords = [
              "employee",
              "code",
              "name",
              "id",
              "date",
              "present",
              "absent",
              "status",
              "basic",
              "salary",
            ];
            let foundIndex = 0;
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
            console.error("Payroll Excel Header parsing error:", error);
            setErrors((prev) => ({
              ...prev,
              parsing: "Error parsing Excel headers",
            }));
          }
        };
        reader.readAsArrayBuffer(file);
      }
    }
  }, [file]);

  useEffect(() => {
    if (headerArray.length > 0 && Object.keys(fieldMapping).length === 0) {
      const initialMapping: Record<string, string> = {};
      const newConfigsToAdd: FieldConfig[] = [];
      const newTypesToAdd: Record<string, "earning" | "deduction"> = {};

      for (const field of fieldConfigs) {
        const matchedHeader = headerArray.find(
          (value) =>
            pipe(replaceUnderscore, replaceDash)(value?.toLowerCase()) ===
            pipe(replaceUnderscore, replaceDash)(field.key?.toLowerCase()),
        );
        if (matchedHeader) {
          initialMapping[field.key] = matchedHeader;
        }
      }

      for (const dbField of dbFields) {
        const matchedHeader = headerArray.find(
          (value) =>
            pipe(replaceUnderscore, replaceDash)(value?.toLowerCase()) ===
            pipe(replaceUnderscore, replaceDash)(dbField.name?.toLowerCase()),
        );
        if (matchedHeader) {
          initialMapping[dbField.name] = matchedHeader;
          if (
            !fieldConfigs.some(
              (f) => f.key.toLowerCase() === dbField.name.toLowerCase(),
            ) &&
            !newConfigsToAdd.some(
              (f) => f.key.toLowerCase() === dbField.name.toLowerCase(),
            )
          ) {
            newConfigsToAdd.push({
              key: dbField.name,
              type: dbField.type,
              required: false,
            });
          }
          if (dbField.type) {
            newTypesToAdd[dbField.name] = dbField.type as "earning" | "deduction";
          }
        }
      }

      if (newConfigsToAdd.length > 0) {
        setFieldConfigs((prev) => {
          const updated = [...prev];
          for (const item of newConfigsToAdd) {
            if (
              !updated.some(
                (f) => f.key.toLowerCase() === item.key.toLowerCase(),
              )
            ) {
              updated.push(item);
            }
          }
          return updated;
        });
      }

      if (Object.keys(newTypesToAdd).length > 0) {
        setFieldTypes((prev) => ({
          ...prev,
          ...newTypesToAdd,
        }));
      }

      setFieldMapping(initialMapping);

      if (headerArray.length > 5 && !fetcher.data && !isProcessingAI) {
        handleAISuggestion();
      }
    }
  }, [headerArray, dbFields]);

  const availableHeaders = headerArray.filter(
    (header) =>
      !Object.values(fieldMapping).includes(header) &&
      !fieldConfigs.some(
        (config) =>
          pipe(replaceUnderscore, replaceDash)(config?.key.toLowerCase()) ===
          pipe(replaceUnderscore, replaceDash)(header.toLowerCase()),
      ),
  );

  const validateMapping = () => {
    try {
      if (initialIntent === "overwrite") {
        if (!matchingKey || !fieldMapping[matchingKey]) {
          setValidationErrors([
            `Please map the ${replaceUnderscore(
              matchingKey || "identifier",
            )} column`,
          ]);
          return false;
        }
      }

      const mappingResult = ImportSalaryPayrollHeaderSchema.safeParse(
        Object.fromEntries(
          Object.entries(fieldMapping).map(([key, value]) => [
            key,
            value || undefined,
          ]),
        ),
      );

      if (!mappingResult.success) {
        const formattedErrors = mappingResult.error.errors.map(
          (err) => err.message,
        );

        setValidationErrors(formattedErrors);
        return false;
      }

      setValidationErrors([]);
      return true;
    } catch (error) {
      console.error("Payroll Validation error:", error);
      setValidationErrors(["An unexpected error occurred during validation"]);
      return false;
    }
  };

  const validateImportData = (data: any[]) => {
    try {
      const result = ImportSalaryPayrollDataSchema.safeParse({ data });

      if (!result.success) {
        console.error("Payroll Data validation error:", result.error);
        const formattedErrors = result.error.errors.map((err: any) => {
          const rowInfo =
            err.path[1] !== undefined ? `Row ${Number(err.path[1]) + 1}: ` : "";
          const fieldInfo = err.path[2]
            ? `${replaceUnderscore(String(err.path[2]))} - `
            : "";
          return `${rowInfo}${fieldInfo}${err.message}`;
        });

        setValidationErrors(formattedErrors);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Payroll Data validation error:", error);
      setValidationErrors([
        "An unexpected error occurred during data validation",
      ]);
      return false;
    }
  };

  const handleMapping = (key: string, value: string) => {
    setFieldMapping((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
    setValidationErrors([]);
  };

  const handleParsedData = async () => {
    if (!validateMapping()) {
      return;
    }

    const swappedFieldMapping = Object.fromEntries(
      Object.entries(fieldMapping).map(([key, value]) => [value, key]),
    );

    const processFinalData = async (data: any[]) => {
      const allowedFields = fieldConfigs.map((field) => field.key);
      const resolvedFieldTypes = fieldConfigs.map((field) => ({
        key: field.key,
        type: fieldTypes[field.key] || field.type,
      }));

      const finalData = data
        .filter((entry) => {
          const empCodeValue = String(entry!["employee_code"] || "").trim();

          if (!empCodeValue) return false;

          const mappedValues = Object.entries(entry!)
            .filter(([key]) => allowedFields.includes(key))
            .map(([_, v]) => String(v || "").trim());

          return mappedValues.some((v) => v !== "");
        })
        .map((entry) => {
          const cleanEntry = Object.fromEntries(
            Object.entries(entry as Record<string, any>)
              .filter(
                ([key, value]) =>
                  key.trim() !== "" &&
                  value !== null &&
                  String(value).trim() !== "",
              )
              .filter(
                ([key]) =>
                  allowedFields
                    .map((field) => field.toLowerCase())
                    .includes(key.toLowerCase()) ||
                  key === "sheet_name" ||
                  key === "raw_row",
              )
              .map(([key, value]) => {
                if (key === "raw_row") return [key, value];
                return [key, String(value).trim()];
              }),
          );
          return cleanEntry;
        });

      if (validateImportData(finalData)) {
        const fieldTypeMap: Record<string, string | undefined> = {};
        for (const { key, type } of resolvedFieldTypes) {
          fieldTypeMap[key.toLowerCase()] = type;
        }
        const finalImport = finalData.map((row) => {
          const transformedRow: Record<string, any> = {};

          for (const key in row) {
            if (key === "sheet_name" || key === "raw_row") {
              transformedRow[key] = row[key];
              continue;
            }
            const config = fieldConfigs.find(
              (f) => f.key.toLowerCase() === key.toLowerCase(),
            );
            const type = resolvedFieldTypes.find(
              (f) => f.key.toLowerCase() === key.toLowerCase(),
            )?.type;
            const actualKey = config?.key || key;

            if (type) {
              transformedRow[actualKey] = {
                amount: Number.isNaN(Number(row[key]))
                  ? row[key]
                  : Number.parseFloat(row[key]),
                type,
                consider_for_epf: false,
              };
            } else {
              transformedRow[actualKey] = row[key];
            }
          }
          transformedRow.month = month;
          transformedRow.year = year;
          transformedRow.run_date = runDate;
          return transformedRow;
        });

        setImportData({
          intent: initialIntent,
          matchingKey: matchingKey,
          data: finalImport as ImportSalaryPayrollDataType[],
        });

        setLoadNext(true);
      }
    };

    if (excelRawData.length > 0) {
      const rawHeaders = excelRawData[headerRow - 1] || [];
      const headers = rawHeaders.map((h) =>
        h === null || h === undefined ? "" : String(h).trim(),
      );

      const actualStart = Math.max(0, startRow - 1);
      const actualEnd = Math.min(excelRawData.length, endRow);
      const dataRows = excelRawData.slice(actualStart, actualEnd);

      const mappedData = dataRows.map((row) => {
        const newRow: any = {};
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const header = headers[colIdx];
          if (!header) continue;
          const targetField = swappedFieldMapping[header];
          if (targetField !== undefined && targetField !== null) {
            newRow[targetField] = row[colIdx];
          }
        }
        newRow.sheet_name = selectedSheet;
        const rawRowObj: Record<string, any> = {};
        headers.forEach((h, idx) => {
          if (h) rawRowObj[String(h)] = row[idx];
        });
        newRow.raw_row = rawRowObj;
        return newRow;
      });

      await processFinalData(mappedData);
    }
  };

  useEffect(() => {
    if (location.state?.file) {
      sessionStorage.removeItem("payroll_salary_import_state");
    }
  }, []);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (excelRawData.length > 0 || file) {
      setIsReady(true);
    }
  }, [excelRawData.length, file]);

  useEffect(() => {
    if (isReady && excelRawData.length === 0 && !file) {
      const redirectUrl = payrollId
        ? `/payroll/run-payroll/${payrollId}`
        : "/payroll/run-payroll";
      navigate(redirectUrl);
    }
  }, [isReady, excelRawData.length, file, payrollId, navigate]);

  useEffect(() => {
    if (excelRawData.length > 0) {
      const stateToSave = {
        excelRawData,
        sheetNames,
        selectedSheet,
        allSheetsData,
        headerRow,
        startRow,
        endRow,
        headerArray,
        fieldMapping,
        fieldConfigs,
        fieldTypes,
        initialIntent,
        matchingKey,
        payrollId,
        month,
        year,
        runDate,
        loadNext,
      };
      sessionStorage.setItem(
        "payroll_salary_import_state",
        JSON.stringify(stateToSave),
      );

      navigate(location.pathname + location.search, {
        replace: true,
        state: { ...location.state, ...stateToSave, file: undefined },
      });
    }
  }, [
    excelRawData,
    sheetNames,
    selectedSheet,
    allSheetsData,
    headerRow,
    startRow,
    endRow,
    headerArray,
    fieldMapping,
    fieldConfigs,
    fieldTypes,
    initialIntent,
    matchingKey,
    payrollId,
    month,
    year,
    runDate,
    loadNext,
    navigate,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    if (
      loadNext &&
      (!importData.data || importData.data.length === 0) &&
      excelRawData.length > 0
    ) {
      handleParsedData();
    }
  }, [loadNext, importData.data, excelRawData]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement;

      if (dialogRef.current?.contains(target)) return;

      if (
        target.closest("[cmdk-root]") ||
        target.closest("[role='listbox']") ||
        target.closest(".popover-content")
      ) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  return (
    <section className="py-4 ">
      {loadNext ? (
        <SalaryPayrollImportData
          env={env}
          fieldConfigs={fieldConfigs}
          payrollId={payrollId}
          companyId={companyId}
          onBack={() => setLoadNext(false)}
        />
      ) : (
        <Card className="m-4 px-auto lg:px-40">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Map Fields</CardTitle>
                <CardDescription>
                  Map your fields with the Payroll fields
                </CardDescription>
              </div>
              <div className="flex gap-4 items-center">
                <div className="px-4 py-2 bg-primary/5 border border-primary/10 rounded-lg">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-0.5">
                    Target Period
                  </p>
                  <p className="text-sm font-semibold text-primary">
                    {new Date(2000, month - 1).toLocaleString("default", {
                      month: "long",
                    })}{" "}
                    {year}
                  </p>
                </div>
              </div>
            </div>

            {initialIntent === "overwrite" && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed border-primary/20 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    name="info-circled"
                    size="sm"
                    className="text-primary"
                  />
                  <span className="text-sm font-semibold uppercase tracking-wider text-primary">
                    Update Configuration
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Match Employees By <span className="text-red-500">*</span>
                    </label>
                    <Combobox
                      options={[
                        { label: "Employee Code", value: "employee_code" },
                        { label: "UAN Number", value: "uan_number" },
                      ]}
                      value={matchingKey}
                      onChange={(value) => setMatchingKey(value as string)}
                      placeholder="Select Identifier"
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
                        options={transformStringArrayIntoOptions(headerArray)}
                        value={fieldMapping[matchingKey] || ""}
                        onChange={(value) => {
                          setFieldMapping((prev) => ({
                            ...prev,
                            [matchingKey]: (value as string) || "",
                          }));
                        }}
                        placeholder={`Select ${replaceUnderscore(
                          matchingKey,
                        )} column`}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {validationErrors.length > 0 && (
              <div className="mb-4 p-4 border border-red-200 bg-red-50 rounded">
                <h4 className="text-red-700 font-medium mb-2">
                  Validation Errors:
                </h4>
                <ul className="grid grid-cols-3 max-sm:grid-cols-1 gap-y-1">
                  {validationErrors.map((error, index) => (
                    <li
                      key={error.toString() + index.toString()}
                      className="text-red-600 text-sm"
                    >
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
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
                  min="1"
                  value={headerRow || ""}
                  onChange={(e) => setHeaderRow(parseInt(e.target.value) || 0)}
                  onBlur={() => setHeaderRow(Math.max(1, headerRow))}
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm text-muted-foreground capitalize">
                  Import Range
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1">
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
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-sm text-muted-foreground font-medium">
                      E:
                    </span>
                    <Input
                      type="number"
                      min={startRow}
                      value={endRow || ""}
                      onChange={(e) => setEndRow(parseInt(e.target.value) || 0)}
                      onBlur={() => setEndRow(Math.max(startRow, endRow))}
                      className="w-full px-2"
                    />
                  </div>
                </div>
              </div>
            </div>

            {isProcessingAI && (
              <div className="mb-6 flex flex-col items-center justify-center p-6 border border-dashed border-primary/30 rounded-xl bg-primary/5 animate-in fade-in duration-500">
                <div className="flex items-center gap-3">
                  <span className="animate-spin text-2xl">✨</span>
                  <p className="text-sm font-semibold text-primary tracking-tight">
                    Gemini AI is analyzing & matching your spreadsheet
                    headers...
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-10">
              {[
                {
                  label: "Details Matching",
                  keys: ["employee_code", "uan_number", "esic_number"],
                },
                {
                  label: "Attendance Details",
                  keys: [
                    "present_days",
                    "working_days",
                    "working_hours",
                    "overtime_hours",
                    "absent_days",
                    "paid_holidays",
                    "paid_leaves",
                    "casual_leaves",
                  ],
                },
                { label: "Other Components", type: "other" },
              ].map((section) => {
                const sectionFields = fieldConfigs.filter((f) =>
                  section.keys
                    ? section.keys.includes(f.key)
                    : ![
                      "employee_code",
                      "uan_number",
                      "esic_number",
                      "present_days",
                      "working_days",
                      "working_hours",
                      "overtime_hours",
                      "absent_days",
                      "paid_holidays",
                      "paid_leaves",
                      "casual_leaves",
                    ].includes(f.key),
                );

                if (sectionFields.length === 0) return null;

                return (
                  <div key={section.label} className="flex flex-col gap-6">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/70 border-b border-muted pb-2 flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-primary rounded-full" />
                      {section.label}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                      {sectionFields
                        .filter(
                          (f) =>
                            initialIntent !== "overwrite" ||
                            f.key !== matchingKey,
                        )
                        .map((field) => (
                          <div
                            key={field.key}
                            className="flex flex-col gap-1.5 relative group"
                          >
                            <div className="flex justify-between items-center mb-0.5">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                                {replaceUnderscore(field.key)}
                                {field.required && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </label>
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  setFieldConfigs((prev) =>
                                    prev.filter((f) => f.key !== field.key),
                                  )
                                }
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove"
                              >
                                ✕
                              </Button>
                            </div>

                            <Combobox
                              options={transformStringArrayIntoOptions(
                                headerArray,
                              )}
                              value={fieldMapping[field.key] || ""}
                              onChange={(value: string) =>
                                handleMapping(field.key, value)
                              }
                              placeholder={`Select ${replaceUnderscore(field.key)} column`}
                              className={cn(
                                "h-10 transition-all",
                                errors[field.key]
                                  ? "border-red-500 bg-red-50/10"
                                  : "border-primary/10 hover:border-primary/40 focus:border-primary",
                              )}
                            />

                            {![
                              "employee_code",
                              "uan_number",
                              "esic_number",
                              "present_days",
                              "working_days",
                              "working_hours",
                              "overtime_hours",
                              "absent_days",
                              "paid_holidays",
                              "paid_leaves",
                              "casual_leaves",
                            ].includes(field.key) && (
                                <div className="flex flex-col gap-2 mt-1 px-1">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`is-earning-${field.key}`}
                                      checked={
                                        (fieldTypes[field.key] || field.type) ===
                                        "earning"
                                      }
                                      onCheckedChange={(checked) => {
                                        setFieldTypes((prev) => ({
                                          ...prev,
                                          [field.key]: checked
                                            ? "earning"
                                            : "deduction",
                                        }));
                                      }}
                                    />
                                    <label
                                      htmlFor={`is-earning-${field.key}`}
                                      className="text-[10px] font-medium text-muted-foreground cursor-pointer select-none"
                                    >
                                      Is Earning Component
                                    </label>
                                  </div>
                                </div>
                              )}

                            {errors[field.key] && (
                              <span className="text-[10px] font-medium text-red-500 animate-in slide-in-from-top-1">
                                {errors[field.key]}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              variant={"primary-outline"}
              className="w-full gap-2 mt-10"
              onClick={() => {
                setOpen(true);
              }}
            >
              <Icon
                name="plus"
                size="lg"
                className="shrink-0 flex justify-center items-center"
              />
              Add Component Mapping
            </Button>
            <div
              className={cn(
                "fixed inset-0 z-50 bg-black/80",
                !open && "hidden",
              )}
            >
              <div
                ref={dialogRef}
                className={cn(
                  "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 duration-200",
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-lg font-semibold">
                    Add Component Mapping
                  </h1>
                  <button type="button" onClick={() => setOpen(false)}>
                    <Icon name="cross" size="sm" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Select Column from Excel
                    </label>
                    <Combobox
                      options={transformStringArrayIntoOptions(
                        availableHeaders,
                      )}
                      placeholder="Select Excel Column"
                      value={addExcelHeader}
                      onChange={(value: string) => {
                        setAddExcelHeader(value);
                      }}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Map to Database Payroll Field
                    </label>
                    <Combobox
                      options={[
                        {
                          label: "+ Create Custom Field...",
                          value: "__custom__",
                        },
                        ...(dbFields || [])
                          .filter(
                            (f: any) =>
                              !Object.keys(fieldMapping).some(
                                (k) => k.toLowerCase() === f.name.toLowerCase(),
                              ),
                          )
                          .map((f: any) => ({
                            label: `${f.display_name || f.name} (${f.type})`,
                            value: f.name,
                          })),
                      ]}
                      placeholder="Select Database Field"
                      value={addDbField}
                      onChange={(value: string) => {
                        setAddDbField(value);
                      }}
                      className="w-full"
                    />
                  </div>

                  {addDbField === "__custom__" && (
                    <div className="space-y-4 border border-dashed border-primary/20 p-4 rounded-lg bg-primary/5 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Custom Field Name
                        </label>
                        <Input
                          placeholder="e.g. SPECIAL_ALLOWANCE"
                          value={customFieldName}
                          onChange={(e) => setCustomFieldName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full flex justify-end items-center mt-6 gap-4">
                  <Button
                    variant="muted"
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className=""
                    disabled={
                      !addExcelHeader ||
                      !addDbField ||
                      (addDbField === "__custom__" && !customFieldName)
                    }
                    onClick={() => {
                      if (!addExcelHeader) return;

                      let targetKey = "";
                      let targetType = "";

                      if (addDbField === "__custom__") {
                        if (!customFieldName) return;
                        targetKey = customFieldName.trim();
                        targetType = customFieldType;
                      } else {
                        const selectedDbField = dbFields?.find(
                          (f: any) => f.name === addDbField,
                        );
                        if (!selectedDbField) return;
                        targetKey = selectedDbField.name;
                        targetType = selectedDbField.type;
                      }

                      if (!targetKey) return;

                      setFieldConfigs((prev) => {
                        if (prev.some((f) => f.key === targetKey)) {
                          return prev;
                        }
                        return [
                          ...prev,
                          {
                            key: targetKey,
                            required: false,
                            type: targetType,
                          },
                        ];
                      });

                      setFieldTypes((prev) => ({
                        ...prev,
                        [targetKey]: targetType as "earning" | "deduction",
                      }));

                      handleMapping(targetKey, addExcelHeader);

                      setAddExcelHeader("");
                      setAddDbField("");
                      setCustomFieldName("");
                      setOpen(false);
                    }}
                  >
                    Set
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-end gap-2">
              {errors.general && (
                <span className="text-red-500 text-sm">{errors.general}</span>
              )}
              <Button
                className="w-24"
                variant="default"
                onClick={handleParsedData}
              >
                Submit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
