import { useState, useEffect } from "react";
import { json, useLoaderData, useLocation } from "@remix-run/react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import type { ImportEmployeeBankDetailsHeaderSchemaObject } from "@canny_ecosystem/utils";
import {
  getEmployeeIdsByEmployeeCodes,
  type ImportEmployeeBankDetailsDataType,
} from "@canny_ecosystem/supabase/queries";
import {
  ImportEmployeeBankDetailsHeaderSchema,
  ImportEmployeeBankDetailsDataSchema,
  transformStringArrayIntoOptions,
  replaceUnderscore,
  pipe,
  replaceDash,
} from "@canny_ecosystem/utils";
import type { z } from "zod";
import { getEmployeeBankDetailsConflicts } from "@canny_ecosystem/supabase/mutations";
import { EmployeeBankDetailsImportData } from "@/components/employees/import-export/employee-bank-details-import-data";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useImportStoreForEmployeeBankDetails } from "@/store/import";
import type { EmployeeBankDetailsDatabaseInsert } from "@canny_ecosystem/supabase/types";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Input } from "@canny_ecosystem/ui/input";

type FieldConfig = {
  key: keyof z.infer<typeof ImportEmployeeBankDetailsHeaderSchemaObject>;
  required?: boolean;
};

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "employee_code",
    required: true,
  },
  {
    key: "account_holder_name",
  },
  {
    key: "account_number",
    required: true,
  },
  {
    key: "ifsc_code",
    required: true,
  },
  {
    key: "account_type",
  },
  { key: "bank_name", required: false },
  {
    key: "branch_name",
  },
];

export async function loader() {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  return json({ env });
}

export default function EmployeeBankDetailsImportFieldMapping() {
  const { env } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });

  const { setImportData } = useImportStoreForEmployeeBankDetails();

  const [loadNext, setLoadNext] = useState(false);
  const [hasConflict, setHasConflict] = useState<number[]>([]);

  const location = useLocation();
  const [file] = useState(location.state?.file);
  const [headerArray, setHeaderArray] = useState<string[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [allSheetsData, setAllSheetsData] = useState<Record<string, any[][]>>(
    {},
  );
  const [excelRawData, setExcelRawData] = useState<any[][]>([]);
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [startRow, setStartRow] = useState<number>(2);
  const [endRow, setEndRow] = useState<number>(0);

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

    // Auto-detect header row
    const keywords = [
      "employee",
      "code",
      "name",
      "id",
      "account",
      "holder",
      "ifsc",
      "bank",
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

  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const addTrace = (msg: string) => {};

  useEffect(() => {
    if (file) {
      addTrace(
        `File initialized: ${file.name} (${file.size} bytes). Parsing headers...`,
      );
      if (file.name.endsWith(".csv")) {
        Papa.parse(file, {
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<string[]>) => {
            const allRows = results.data;
            if (allRows.length === 0) return;

            // Auto-detect header row
            const keywords = [
              "employee",
              "code",
              "name",
              "id",
              "account",
              "holder",
              "ifsc",
              "bank",
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
            addTrace(`CSV header parsing error: ${error.message}`);
            console.error("Employee Bank Header parsing error:", error);
            setErrors((prev) => ({
              ...prev,
              general: `Error parsing CSV headers: ${error.message}`,
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

            // Auto-detect header row
            const keywords = [
              "employee",
              "code",
              "name",
              "id",
              "account",
              "holder",
              "ifsc",
              "bank",
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
          } catch (error: any) {
            addTrace(`Excel header parsing error: ${error.message}`);
            console.error("Employee Bank Excel Header parsing error:", error);
            setErrors((prev) => ({
              ...prev,
              general: `Error parsing Excel headers: ${error.message}`,
            }));
          }
        };
        reader.readAsArrayBuffer(file);
      }
    } else {
      addTrace(
        "No file was received in route state. This usually occurs if the browser was refreshed.",
      );
    }
  }, [file]);

  useEffect(() => {
    if (headerArray.length > 0) {
      const initialMapping = FIELD_CONFIGS.reduce(
        (mapping, field) => {
          const matchedHeader = headerArray.find(
            (value) =>
              pipe(replaceUnderscore, replaceDash)(value?.toLowerCase()) ===
              pipe(replaceUnderscore, replaceDash)(field.key?.toLowerCase()),
          );

          if (matchedHeader) {
            mapping[field.key] = matchedHeader;
          }

          return mapping;
        },
        {} as Record<string, string>,
      );

      addTrace(`Auto-mapped fields: ${JSON.stringify(initialMapping)}`);
      setFieldMapping(initialMapping);
    }
  }, [headerArray]);

  const validateMapping = () => {
    try {
      const mappingResult = ImportEmployeeBankDetailsHeaderSchema.safeParse(
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
        addTrace(
          `Mapping validation errors: ${JSON.stringify(formattedErrors)}`,
        );
        setValidationErrors(formattedErrors);
        return false;
      }

      setValidationErrors([]);
      return true;
    } catch (error: any) {
      addTrace(`Exception in validateMapping: ${error.message}`);
      console.error("Employee Bank Validation error:", error);
      setValidationErrors(["An unexpected error occurred during validation"]);
      return false;
    }
  };

  const validateImportData = (data: any[]) => {
    try {
      const result = ImportEmployeeBankDetailsDataSchema.safeParse({ data });
      if (!result.success) {
        const formattedErrors = result.error.errors.map(
          (err) => `${err.path[2]}: ${err.message}`,
        );
        addTrace(`Data validation errors: ${JSON.stringify(formattedErrors)}`);
        setValidationErrors(formattedErrors);
        return null;
      }
      return result.data.data;
    } catch (error: any) {
      addTrace(`Exception in validateImportData: ${error.message}`);
      console.error("Employee Bank Data validation error:", error);
      setValidationErrors([
        "An unexpected error occurred during data validation",
      ]);
      return null;
    }
  };

  const handleMapping = (key: string, value: string) => {
    addTrace(`Manually mapped field [${key}] -> "${value}"`);
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
    addTrace("Submit button clicked. Starting validation...");
    if (!validateMapping()) {
      addTrace("Field mapping validation failed. Aborting submit.");
      return;
    }
    addTrace("Field mapping is valid. Swapping mapping keys...");

    const swappedFieldMapping = Object.fromEntries(
      Object.entries(fieldMapping)
        .filter(([_, value]) => value && String(value).trim() !== "")
        .map(([key, value]) => [String(value).trim(), key]),
    );
    addTrace(
      `Swapped field mapping mapping: ${JSON.stringify(swappedFieldMapping)}`,
    );

    const processFinalData = async (data: any[]) => {
      try {
        addTrace(
          `Starting final data processing on ${data.length} parsed rows...`,
        );
        const allowedFields = FIELD_CONFIGS.map((field) => field.key);
        const finalData = data
          .filter((entry) =>
            Object.values(entry!).some((value) => String(value).trim() !== ""),
          )
          .map((entry) => {
            const cleanEntry = Object.fromEntries(
              Object.entries(entry as Record<string, any>)
                .filter(
                  ([key, value]) =>
                    key.trim() !== "" &&
                    value !== null &&
                    String(value).trim() !== "",
                )
                .filter(([key]) =>
                  allowedFields.includes(
                    key as keyof ImportEmployeeBankDetailsDataType,
                  ),
                )
                .map(([key, value]) => [key, value]),
            );
            return cleanEntry;
          });
        addTrace(
          `Cleaned parsed records. Row count: ${finalData.length}. Validating data schema...`,
        );

        const validatedData = validateImportData(finalData);
        if (validatedData) {
          addTrace(
            `Data schema validation succeeded. Row count: ${validatedData.length}. Fetching employee IDs for employee codes...`,
          );
          const employeeCodes = validatedData.map(
            (value: any) => value.employee_code,
          );
          const { data: employees, error: idByCodeError } =
            await getEmployeeIdsByEmployeeCodes({
              supabase,
              employeeCodes,
            });

          if (idByCodeError) {
            addTrace(
              `Error querying employee IDs by code: ${idByCodeError.message}`,
            );
            throw idByCodeError;
          }
          addTrace(
            `Successfully fetched ${employees?.length || 0} employee records from database.`,
          );

          const updatedData = validatedData.map((item: any) => {
            const employeeId = employees?.find(
              (e) => e.employee_code === item.employee_code,
            )?.id;

            const { employee_code, ...rest } = item;
            return {
              ...rest,
              ...(employeeId ? { employee_id: employeeId } : {}),
            };
          });

          setImportData({
            data: validatedData as ImportEmployeeBankDetailsDataType[],
          });
          addTrace(
            "Stored import data in state store. Fetching database conflicts...",
          );

          const { conflictingIndices, error } =
            await getEmployeeBankDetailsConflicts({
              supabase,
              importedData: updatedData as EmployeeBankDetailsDatabaseInsert[],
            });

          if (error) {
            addTrace(`Conflict checking query failed: ${error.message}`);
            throw error;
          }
          addTrace(
            `Conflict checking complete. Conflicting rows count: ${conflictingIndices.length}`,
          );

          setHasConflict(conflictingIndices);
          addTrace("Setting loadNext = true. Transitioning to next view...");
          setLoadNext(true);
        } else {
          addTrace(
            "Data schema validation failed. Please check validation errors box.",
          );
        }
      } catch (error: any) {
        addTrace(
          `CRITICAL EXCEPTION inside processFinalData: ${error.message}`,
        );
        console.error("Error processing final data:", error);
        setErrors((prev) => ({
          ...prev,
          general:
            error.message || "An unexpected error occurred during processing.",
        }));
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
        return newRow;
      });

      await processFinalData(mappedData);
    }
  };

  return (
    <section className="py-4 ">
      {loadNext ? (
        <EmployeeBankDetailsImportData
          conflictingIndices={hasConflict}
          env={env}
          mappedKeys={Object.keys(fieldMapping).filter((k) => fieldMapping[k])}
        />
      ) : (
        <Card className="m-4 px-auto lg:px-40">
          <CardHeader>
            <CardTitle>Map Fields</CardTitle>
            <CardDescription>
              Map your fields with the Employee fields
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Sheet, Header and Range Configurations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
              {/* Select Sheet Card */}
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

              {/* Header Row Card */}
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

              {/* Import Range Card */}
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

            <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-y-8 gap-x-10 mt-5">
              {FIELD_CONFIGS.map((field) => (
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
              ))}

              <div />
              <div className="flex flex-col items-end gap-2">
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
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
