import { useState, useEffect } from "react";
import { json, useLoaderData, useLocation } from "@remix-run/react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Button } from "@canny_ecosystem/ui/button";
import { StatusButton } from "@canny_ecosystem/ui/status-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import type { ImportEmployeeStatutoryHeaderSchemaObject } from "@canny_ecosystem/utils";
import {
  getEmployeeIdsByEmployeeCodes,
  getCompanyEsicDetailsByCompanyId,
  type ImportEmployeeStatutoryDataType,
} from "@canny_ecosystem/supabase/queries";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  ImportEmployeeStatutoryHeaderSchema,
  ImportEmployeeStatutoryDataSchema,
  transformStringArrayIntoOptions,
  replaceUnderscore,
  pipe,
  replaceDash,
  formatExcelDate,
} from "@canny_ecosystem/utils";
import type { z } from "zod";
import { getEmployeeStatutoryConflicts } from "@canny_ecosystem/supabase/mutations";
import { EmployeeStatutoryImportData } from "@/components/employees/import-export/employee-statutory-import-data";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useImportStoreForEmployeeStatutory } from "@/store/import";
import type { EmployeeStatutoryDetailsDatabaseInsert } from "@canny_ecosystem/supabase/types";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Input } from "@canny_ecosystem/ui/input";

type FieldConfig = {
  key: keyof z.infer<typeof ImportEmployeeStatutoryHeaderSchemaObject>;
  required?: boolean;
};

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "employee_code",
    required: true,
  },
  {
    key: "aadhaar_number",
    required: false,
  },
  {
    key: "pan_number",
    required: false,
  },
  {
    key: "uan_number",
    required: false,
  },
  {
    key: "pf_number",
    required: false,
  },
  {
    key: "esic_number",
    required: false,
  },
  {
    key: "esic_site_name",
    required: false,
  },
  {
    key: "driving_license_number",
    required: false,
  },
  {
    key: "driving_license_expiry",
    required: false,
  },
  {
    key: "passport_number",
    required: false,
  },
  {
    key: "passport_expiry",
    required: false,
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const { data: companyEsicDetails } = await getCompanyEsicDetailsByCompanyId({
    supabase,
    companyId,
  });

  return json({ env, companyEsicDetails: companyEsicDetails ?? [] });
}

export default function EmployeeStatutoryImportFieldMapping() {
  const { env, companyEsicDetails } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });

  const { setImportData } = useImportStoreForEmployeeStatutory();

  const [loadNext, setLoadNext] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
      "aadhaar",
      "pan",
      "uan",
      "pf",
      "esic",
      "passport",
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

  useEffect(() => {
    if (file) {
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
              "aadhaar",
              "pan",
              "uan",
              "pf",
              "esic",
              "passport",
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
            console.error("Employee Statutory Header parsing error:", error);
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

            // Auto-detect header row
            const keywords = [
              "employee",
              "code",
              "aadhaar",
              "pan",
              "uan",
              "pf",
              "esic",
              "passport",
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
            console.error(
              "Employee Statutory Excel Header parsing error:",
              error,
            );
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

      setFieldMapping(initialMapping);
    }
  }, [headerArray]);

  const validateMapping = () => {
    try {
      const mappingResult = ImportEmployeeStatutoryHeaderSchema.safeParse(
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
      console.error("Employee Statutory Validation error:", error);
      setValidationErrors(["An unexpected error occurred during validation"]);
      return false;
    }
  };

  const validateImportData = (data: any[]) => {
    try {
      const result = ImportEmployeeStatutoryDataSchema.safeParse({ data });
      if (!result.success) {
        const formattedErrors = result.error.errors.map((err) => {
          const rowIndex = err.path[1];
          const fieldName = err.path[2];
          const value = data[Number(rowIndex)][fieldName as string];
          return `Row ${Number(rowIndex) + 1}: ${fieldName} ${value ? `("${value}")` : ""} - ${err.message}`;
        });
        setValidationErrors(formattedErrors);
        return null;
      }
      return result.data.data;
    } catch (error) {
      console.error("Employee Statutory Data validation error:", error);
      setValidationErrors([
        "An unexpected error occurred during data validation",
      ]);
      return null;
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
    setIsLoading(true);
    setValidationErrors([]);

    const swappedFieldMapping = Object.fromEntries(
      Object.entries(fieldMapping)
        .filter(([_, value]) => value && String(value).trim() !== "")
        .map(([key, value]) => [String(value).trim(), key]),
    );

    const processFinalData = async (data: any[]) => {
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
                  key as keyof z.infer<
                    typeof ImportEmployeeStatutoryHeaderSchemaObject
                  >,
                ),
              )
              .map(([key, value]) => {
                let processedValue = value;
                if (
                  value instanceof Date &&
                  !isNaN((value as Date).getTime())
                ) {
                  processedValue = formatExcelDate(value as Date);
                } else if (typeof value === "number") {
                  processedValue = Number.isInteger(value)
                    ? value.toFixed(0)
                    : String(value);
                }

                if (typeof processedValue === "string") {
                  processedValue = processedValue.trim();
                  if (["aadhaar_number", "uan_number"].includes(key)) {
                    processedValue = processedValue.replace(/[^0-9]/g, "");
                  } else if (key === "pan_number") {
                    processedValue = processedValue
                      .replace(/[^A-Za-z0-9]/g, "")
                      .toUpperCase();
                    if (
                      ["NOTAVAILABLE", "NA", "NOT_AVAILABLE", "NONE"].includes(
                        processedValue,
                      )
                    ) {
                      processedValue = "";
                    }
                  } else if (
                    ["esic_number", "pf_number", "employee_code"].includes(key)
                  ) {
                    processedValue = processedValue.replace(
                      /[^A-Za-z0-9\-]/g,
                      "",
                    );
                  }
                }
                return [
                  key,
                  processedValue === "" ? undefined : processedValue,
                ];
              }),
          );
          return cleanEntry;
        });

      const validatedData = validateImportData(finalData);
      if (validatedData) {
        const employeeCodes = validatedData.map(
          (value: any) => value.employee_code,
        );

        const { data: employees, error: idByCodeError } =
          await getEmployeeIdsByEmployeeCodes({
            supabase,
            employeeCodes,
          });

        if (idByCodeError) {
          throw idByCodeError;
        }

        const updatedData = validatedData.map((item: any) => {
          const employeeId = employees?.find(
            (e) => e.employee_code === item.employee_code,
          )?.id;

          const { employee_code, esic_site_name, ...rest } = item;
          let esic_id: string | undefined = undefined;
          let is_esic_applicable: boolean | undefined = undefined;

          if (esic_site_name && companyEsicDetails?.length) {
            const cleanSite = String(esic_site_name).trim().toLowerCase();
            const matched = companyEsicDetails.find(
              (esic: any) =>
                (esic.esic_site_name &&
                  String(esic.esic_site_name).trim().toLowerCase() ===
                    cleanSite) ||
                (esic.esic_id_number &&
                  String(esic.esic_id_number).trim().toLowerCase() ===
                    cleanSite),
            );
            if (matched) {
              esic_id = matched.id;
              is_esic_applicable = true;
            }
          }

          return {
            ...rest,
            ...(employeeId ? { employee_id: employeeId } : {}),
            ...(esic_id ? { esic_id, is_esic_applicable } : {}),
          };
        });

        setImportData({
          data: validatedData as ImportEmployeeStatutoryDataType[],
        });

        const { conflictingIndices, error } =
          await getEmployeeStatutoryConflicts({
            supabase,
            importedData:
              updatedData as EmployeeStatutoryDetailsDatabaseInsert[],
          });

        if (error) {
          throw error;
        }

        setHasConflict(conflictingIndices);
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
        return newRow;
      });

      await processFinalData(mappedData);
      setIsLoading(false);
    }
  };

  return (
    <section className="py-4 ">
      {loadNext ? (
        <EmployeeStatutoryImportData
          conflictingIndices={hasConflict}
          env={env}
          mappedKeys={Object.keys(fieldMapping).filter((k) => fieldMapping[k])}
          companyEsicDetails={companyEsicDetails}
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
                <StatusButton
                  className="w-24"
                  variant="default"
                  onClick={handleParsedData}
                  status={isLoading ? "pending" : "idle"}
                >
                  Submit
                </StatusButton>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
