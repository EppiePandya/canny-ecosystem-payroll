import { useState, useEffect, useRef, useMemo } from "react";
import {
  json,
  useLoaderData,
  useLocation,
  useSubmit,
  useNavigate,
} from "@remix-run/react";
import Papa from "papaparse";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Input } from "@canny_ecosystem/ui/input";
import type { ImportEmployeeAttendanceHeaderSchemaObject } from "@canny_ecosystem/utils";
import type { ImportEmployeeAttendanceDataType } from "@canny_ecosystem/supabase/queries";
import {
  transformStringArrayIntoOptions,
  replaceUnderscore,
  pipe,
  replaceDash,
  defaultMonth,
  defaultYear,
} from "@canny_ecosystem/utils";
import { z } from "zod";
import { useImportStoreForEmployeeAttendance } from "@/store/import";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { payoutMonths } from "@canny_ecosystem/utils/constant";
import { EmployeeAttendanceImportData } from "@/components/employees/import-export/employee-attendance-import-data";
type FieldConfig = {
  key: keyof z.infer<typeof ImportEmployeeAttendanceHeaderSchemaObject>;
  required?: boolean;
};

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "employee_code",
  },
  {
    key: "uan_number",
  },
  {
    key: "employee_name",
  },
  {
    key: "present_days",
    required: true,
  },
  {
    key: "working_days",
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

const LocalHeaderSchema = z
  .object({
    employee_code: z.string().optional(),
    uan_number: z.string().optional(),
    employee_name: z.string().optional(),
    present_days: z.string({ required_error: "Present Days is required" }),
    working_days: z.string().optional(),
    overtime_hours: z.string().optional(),
    absent_days: z.string().optional(),
    paid_holidays: z.string().optional(),
    paid_leaves: z.string().optional(),
    casual_leaves: z.string().optional(),
  })
  .refine(
    (data) => data.employee_code || data.uan_number || data.employee_name,
    {
      message:
        "Either Employee Code, UAN Number or Employee Name is required for matching",
      path: ["employee_code"],
    },
  );

const convertToNumber = (val: any) => {
  if (val === "" || val === undefined || val === null) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

const LocalDataSchema = z.object({
  employee_code: z.string().optional(),
  uan_number: z.string().optional(),
  employee_name: z.string().optional(),
  sheet_name: z.string().optional(),
  raw_row: z.any().optional(),
  present_days: z.preprocess(convertToNumber, z.number()),
  working_days: z.preprocess(convertToNumber, z.number()),
  overtime_hours: z.preprocess(convertToNumber, z.number()),
  absent_days: z.preprocess(convertToNumber, z.number()),
  paid_holidays: z.preprocess(convertToNumber, z.number()),
  paid_leaves: z.preprocess(convertToNumber, z.number()),
  casual_leaves: z.preprocess(convertToNumber, z.number()),
});

import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  return json({ env, companyId });
}

export default function AttendanceImportFieldMapping() {
  const { env, companyId } = useLoaderData<typeof loader>();
  const { setImportData } = useImportStoreForEmployeeAttendance();
  const navigate = useNavigate();

  const [loadNext, setLoadNext] = useState(false);
  const location = useLocation();
  const hasParsed = useRef(false);
  const [file] = useState(location.state?.file);
  const [intent] = useState(location.state?.intent);
  const [headerArray, setHeaderArray] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [matchingKey, setMatchingKey] = useState<string>("employee_code");

  const defaultPreviousMonth = useMemo(() => {
    const today = new Date();
    const prevMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    return prevMonthDate.getMonth() + 1;
  }, []);

  const defaultPreviousYear = useMemo(() => {
    const today = new Date();
    const prevMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    return prevMonthDate.getFullYear();
  }, []);

  const [month, setMonth] = useState(defaultPreviousMonth);
  const [year, setYear] = useState(defaultPreviousYear);
  const [fallbackWorkingDays, setFallbackWorkingDays] = useState<string>("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [rawData, setRawData] = useState<any[][]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [allSheetsData, setAllSheetsData] = useState<Record<string, any[][]>>(
    {},
  );

  const [headerRow, setHeaderRow] = useState<number>(1);
  const [startRow, setStartRow] = useState<number>(2);
  const [endRow, setEndRow] = useState<number>(0);

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
    if (file && !hasParsed.current) {
      hasParsed.current = true;
      const keywords = [
        "employee",
        "code",
        "name",
        "id",
        "uan",
        "pf",
        "present",
        "working",
        "absent",
        "overtime",
        "ot",
        "leave",
        "holiday",
        "days",
        "hours",
      ];

      if (file.name.endsWith(".csv")) {
        Papa.parse(file, {
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<string[]>) => {
            const allRows = results.data;
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
            setRawData(allRows);
            setHeaderRow(foundIndex + 1);
            setStartRow(foundIndex + 2);
            setEndRow(findLastNonEmptyRow(allRows));
          },
          error: (error) => {
            console.error(
              "Attendance By Presents Header parsing error:",
              error,
            );
            setErrors((prev) => ({
              ...prev,
              parsing: "Error parsing headers",
            }));
          },
        });
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
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
            setRawData(initialData);
            setHeaderRow(foundIndex + 1);
            setStartRow(foundIndex + 2);
            setEndRow(findLastNonEmptyRow(initialData));
          } catch (error) {
            console.error(error);
            setErrors((prev) => ({
              ...prev,
              parsing: "Error reading Excel headers",
            }));
          }
        };
        reader.readAsArrayBuffer(file);
      }
    }
  }, [file]);

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const data = allSheetsData[sheetName] || [];
    setRawData(data);

    const keywords = [
      "employee",
      "code",
      "name",
      "id",
      "uan",
      "pf",
      "present",
      "working",
      "absent",
      "overtime",
      "ot",
      "leave",
      "holiday",
      "days",
      "hours",
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
    setFieldMapping({});
  };

  const getAutoMappedValue = (fieldKey: string) => {
    const cleanField = pipe(
      replaceUnderscore,
      replaceDash,
    )(fieldKey.toLowerCase());

    return (
      headerArray?.find((value) => {
        const v = value.toLowerCase();
        const cleanV = pipe(replaceUnderscore, replaceDash)(v);

        if (cleanV === cleanField) return true;

        if (
          fieldKey === "employee_code" &&
          (v.includes("code") || v.includes("id") || v === "emp")
        )
          return true;
        if (fieldKey === "uan_number" && v.includes("uan")) return true;
        if (
          fieldKey === "employee_name" &&
          (v.includes("name") || v.includes("employee"))
        )
          return true;
        if (
          fieldKey === "present_days" &&
          (v.includes("present") || v.includes("working day"))
        )
          return true;
        if (
          fieldKey === "overtime_hours" &&
          (v.includes("ot") || v.includes("overtime")) &&
          !v.includes("total")
        )
          return true;
        if (
          fieldKey === "absent_days" &&
          (v.includes("absent") || v.includes("loss pay") || v.includes("lwp"))
        )
          return true;
        if (fieldKey === "working_days" && v.includes("total working"))
          return true;
        if (fieldKey === "paid_holidays" && v.includes("holiday")) return true;
        if (fieldKey === "paid_leaves" && v.includes("leave")) return true;

        return false;
      }) || ""
    );
  };

  useEffect(() => {
    if (rawData.length >= headerRow && headerRow > 0) {
      const headers = (rawData[headerRow - 1] || [])
        .map((h) => (h !== null && h !== undefined ? String(h).trim() : ""))
        .filter((h) => h !== "");
      setHeaderArray(headers);
    } else {
      setHeaderArray([]);
    }
  }, [rawData, headerRow]);

  useEffect(() => {
    if (file && headerArray.length > 0) {
      const initialMapping = FIELD_CONFIGS.reduce(
        (mapping, field) => {
          const matchedHeader = getAutoMappedValue(field.key);
          if (matchedHeader) mapping[field.key] = matchedHeader;
          return mapping;
        },
        {} as Record<string, string>,
      );

      setFieldMapping((prev) => ({ ...initialMapping, ...prev }));

      // Auto-detect matching identifier based on available mapped keys
      if (initialMapping.employee_code) {
        setMatchingKey("employee_code");
      } else if (initialMapping.uan_number) {
        setMatchingKey("uan_number");
      } else if (initialMapping.employee_name) {
        setMatchingKey("employee_name");
      }
    }
  }, [headerArray, file]);

  const validateMapping = () => {
    try {
      if (!matchingKey) {
        setValidationErrors(["Matching Identifier is required"]);
        return false;
      }
      if (!fieldMapping[matchingKey]) {
        setValidationErrors([
          `${replaceUnderscore(matchingKey)} column is required for matching`,
        ]);
        return false;
      }
      if (!fieldMapping.present_days) {
        setValidationErrors(["Present Days column is required"]);
        return false;
      }

      setValidationErrors([]);
      return true;
    } catch (error) {
      console.error("Attendance Presents Validation error:", error);
      setValidationErrors(["An unexpected error occurred during validation"]);
      return false;
    }
  };

  const formatExcelID = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
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
      const result = z.array(LocalDataSchema).safeParse(data);
      if (!result.success) {
        const formattedErrors = result.error.errors.map(
          (err) =>
            `Row ${err.path[0]}: ${replaceUnderscore(String(err.path[1] || ""))}: ${err.message}`,
        );
        setValidationErrors(formattedErrors);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Attendance By Presents Data validation error:", error);
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

    const allowedFields = FIELD_CONFIGS.map((field) => field.key);

    const headers = rawData[headerRow - 1] || [];
    const dataRows = rawData.slice(startRow - 1, endRow);

    const jsonArray = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        const headerStr = h !== null && h !== undefined ? String(h).trim() : "";
        if (headerStr) {
          obj[headerStr] =
            row[i] !== undefined && row[i] !== null
              ? String(row[i]).trim()
              : "";
        }
      });
      return obj;
    });

    const finalData = jsonArray
      .filter((entry) =>
        Object.values(entry!).some((value) => String(value).trim() !== ""),
      )
      .map((entry) => {
        const cleanEntry = Object.fromEntries(
          Object.entries(entry as Record<string, any>)
            .map(([key, value]) => {
              const mappedKey = swappedFieldMapping[key] || key;
              return [mappedKey, value];
            })
            .filter(
              ([key, value]) =>
                key.trim() !== "" &&
                value !== null &&
                String(value).trim() !== "",
            )
            .filter(
              ([key]) =>
                allowedFields.includes(key as unknown as any) ||
                key === "sheet_name" ||
                key === "raw_row",
            )
            .map(([key, value]) => {
              if (key === "raw_row") return [key, value];
              let cleanValue = String(value).trim();
              if (
                key === "employee_code" ||
                key === "uan_number" ||
                key === "employee_name"
              ) {
                cleanValue = formatExcelID(value);
              }
              return [key, cleanValue];
            }),
        );

        const effectiveWorkingDays = fallbackWorkingDays.trim() || "26";
        if (!cleanEntry.working_days) {
          cleanEntry.working_days = effectiveWorkingDays;
        }

        cleanEntry.sheet_name = selectedSheet;
        cleanEntry.raw_row = entry;

        return cleanEntry;
      });

    const updatedData = finalData.map((entry) => ({
      ...entry,
      month,
      year,
    }));

    if (validateImportData(finalData)) {
      setImportData({
        data: updatedData as ImportEmployeeAttendanceDataType[],
      });

      setLoadNext(true);
    }
  };

  return (
    <section className="py-4 ">
      {loadNext ? (
        <EmployeeAttendanceImportData
          env={env}
          intent={intent}
          companyId={companyId}
          matchingKey={matchingKey}
          onBack={() => setLoadNext(false)}
        />
      ) : (
        <Card className="m-4 pax-auto lg:px-40">
          <CardHeader>
            <CardTitle>Map Fields</CardTitle>
            <CardDescription>
              Map your fields with the Attedance fields
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground capitalize">
                  Payroll Month
                </label>
                <Combobox
                  options={payoutMonths}
                  placeholder="Month"
                  value={String(month)}
                  onChange={(value: string) => {
                    setMonth(Number(value));
                  }}
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground capitalize">
                  Payroll Year
                </label>
                <Combobox
                  options={transformStringArrayIntoOptions([
                    `${defaultYear - 2}`,
                    `${defaultYear - 1}`,
                    `${defaultYear}`,
                  ] as unknown as string[])}
                  placeholder="Year"
                  value={String(year)}
                  onChange={(value: string) => {
                    setYear(Number(value));
                  }}
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
                  max={rawData.length}
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
                      max={rawData.length}
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
                      max={rawData.length}
                      value={endRow || ""}
                      onChange={(e) => setEndRow(parseInt(e.target.value) || 0)}
                      onBlur={() =>
                        setEndRow(
                          Math.min(rawData.length, Math.max(startRow, endRow)),
                        )
                      }
                      className="w-full px-2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground capitalize">
                  Working Days (Fallback)
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder={
                    fieldMapping.working_days ? "From sheet" : "26"
                  }
                  value={fieldMapping.working_days ? "" : fallbackWorkingDays}
                  onChange={(e) => setFallbackWorkingDays(e.target.value)}
                  disabled={Boolean(fieldMapping.working_days)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-4 p-5 bg-primary/5 rounded-xl border border-primary/20 shadow-sm mb-6 animate-in fade-in duration-300">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                      1
                    </span>
                    Selection for Record Matching
                  </h3>
                  <p className="text-xs text-muted-foreground ml-7">
                    Choose which unique identifier to use for locating existing
                    employees. This field is for{" "}
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
                        setValidationErrors([]);
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
                        options={transformStringArrayIntoOptions(headerArray)}
                        value={fieldMapping[matchingKey] || ""}
                        onChange={(value) => {
                          setFieldMapping((prev) => ({
                            ...prev,
                            [matchingKey]: (value as string) || "",
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

            {validationErrors.length > 0 && (
              <div className="mb-4 p-4 border border-red-200 bg-red-50 rounded">
                <h4 className="text-red-700 font-medium mb-2">
                  ValidationErrors:
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

            <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4 place-content-center justify-between gap-y-8 gap-x-10 mt-5">
              {FIELD_CONFIGS.filter((field) => field.key !== matchingKey).map(
                (field) => {
                  return (
                    <div key={field.key} className="flex flex-col">
                      <div className="flex flex-row gap-1 pb-1">
                        <label className="text-sm text-muted-foreground capitalize">
                          {replaceUnderscore(field.key)}
                        </label>
                        <sub
                          className={cn(
                            "hidden text-primary mt-1",
                            field.required && "inline",
                          )}
                        >
                          *
                        </sub>
                      </div>
                      <Combobox
                        options={transformStringArrayIntoOptions(headerArray)}
                        value={fieldMapping[field.key] || ""}
                        onChange={(value: string) =>
                          handleMapping(field.key, value)
                        }
                        placeholder={`Select ${replaceUnderscore(field.key)}`}
                        className={errors[field.key] ? "border-red-500" : ""}
                      />
                      {errors[field.key] && (
                        <span className="text-red-500 text-sm mt-1">
                          {errors[field.key]}
                        </span>
                      )}
                    </div>
                  );
                },
              )}
            </div>
            <div className="flex flex-col items-end gap-2 mt-5">
              {errors.general && (
                <span className="text-red-500 text-sm">{errors.general}</span>
              )}
              {errors.parsing && (
                <span className="text-red-500 text-sm">{errors.parsing}</span>
              )}
              <div className="flex items-center gap-4">
                <Button
                  className="w-24 h-10"
                  variant="outline"
                  onClick={() => navigate("/time-tracking/attendance")}
                >
                  Back
                </Button>
                <Button
                  className="w-24 h-10"
                  variant="default"
                  onClick={handleParsedData}
                >
                  Submit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
