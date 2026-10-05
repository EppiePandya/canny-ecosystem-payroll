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
import {
  defaultMonth,
  defaultYear,
  ImportVehicleUsageDataSchema,
  ImportVehicleUsageHeaderSchema,
} from "@canny_ecosystem/utils";
import {
  transformStringArrayIntoOptions,
  replaceUnderscore,
  pipe,
  replaceDash,
} from "@canny_ecosystem/utils";
import type { z } from "zod";

import { useImportStoreForVehicleUsage } from "@/store/import";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Label } from "@canny_ecosystem/ui/label";
import { VehicleUsageImportData } from "@/components/vehicles/usage/import-export/vehicle-usage-import-data";
import { payoutMonths } from "@canny_ecosystem/utils/constant";

type FieldConfig = {
  key: keyof z.infer<typeof ImportVehicleUsageHeaderSchema>;
  required?: boolean;
};

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "registration_number",
    required: true,
  },
  {
    key: "kilometers",
  },
  {
    key: "fuel_in_liters",
  },
  {
    key: "fuel_amount",
  },
  {
    key: "toll_amount",
  },
  {
    key: "maintainance_amount",
  },
];

export async function loader() {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  return json({ env });
}

export default function VehicleUsageFieldMapping() {
  const { env } = useLoaderData<typeof loader>();

  const { setImportData } = useImportStoreForVehicleUsage();

  const [loadNext, setLoadNext] = useState(false);

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const location = useLocation();
  const [file] = useState(location.state?.file);
  const [headerArray, setHeaderArray] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [allRows, setAllRows] = useState<any[][]>([]);
  const [headerIndex, setHeaderIndex] = useState<number>(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!file) return;

    const keywords = [
      "vehicle",
      "registration",
      "kilometer",
      "kms",
      "fuel",
      "liters",
      "ltr",
      "toll",
      "maintenance",
      "expenses",
    ];

    const detectHeaderAndRows = (rows: any[][]) => {
      let foundIndex = 0;
      for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const row = rows[i] || [];
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

      const headers = (rows[foundIndex] || [])
        .map((h) => String(h || "").trim());

      const uiHeaders = headers.filter((h) => h !== "");

      setHeaderIndex(foundIndex);
      setHeaderArray(uiHeaders);
      setAllRows(rows);
    };

    if (file.name.endsWith(".csv")) {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<string[]>) => {
          detectHeaderAndRows(results.data);
        },
        error: (error) => {
          console.error("Vehicle Usage Header parsing error:", error);
          setErrors((prev) => ({ ...prev, parsing: "Error parsing headers" }));
        },
      });
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, {
            type: "array",
            cellDates: true,
          });

          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
            header: 1,
            raw: true,
            defval: "",
          });

          detectHeaderAndRows(rows);
        } catch (err: any) {
          console.error("Excel parsing error:", err);
          setErrors((prev) => ({ ...prev, parsing: `Error parsing Excel: ${err.message}` }));
        }
      };
      reader.readAsArrayBuffer(file);
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
      const mappingResult = ImportVehicleUsageHeaderSchema.safeParse(
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
      console.error("Vehicle Usage Validation error:", error);
      setValidationErrors(["An unexpected error occurred during validation"]);
      return false;
    }
  };

  const validateImportData = (data: any[]) => {
    try {
      const result = ImportVehicleUsageDataSchema.safeParse({ data });
      if (!result.success) {
        const formattedErrors = result.error.errors.map(
          (err) => `${err.path[2]}: ${err.message}`,
        );
        setValidationErrors(formattedErrors);
        return null;
      }
      return result.data.data;
    } catch (error) {
      console.error("Vehicle usage Data validation error:", error);
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

    if (allRows.length === 0) {
      setErrors((prev) => ({ ...prev, general: "No data parsed from file" }));
      return;
    }

    try {
      const allowedFields = FIELD_CONFIGS.map((field) => field.key);
      const headers = allRows[headerIndex] || [];

      const colIndexToKeyMap: Record<number, string> = {};
      headers.forEach((header, index) => {
        const headerStr = String(header || "").trim();
        const fieldKey = Object.keys(fieldMapping).find(
          (k) => fieldMapping[k] === headerStr
        );
        if (fieldKey) {
          colIndexToKeyMap[index] = fieldKey;
        }
      });

      const finalData: any[] = [];

      for (let r = headerIndex + 1; r < allRows.length; r++) {
        const row = allRows[r];
        if (!row || row.length === 0) continue;

        const isRowEmpty = row.every((val) => String(val || "").trim() === "");
        if (isRowEmpty) continue;

        const cleanEntry: Record<string, any> = {};
        allowedFields.forEach((f) => {
          if (f === "registration_number") {
            cleanEntry[f] = "";
          } else {
            cleanEntry[f] = "0";
          }
        });

        row.forEach((val, cIndex) => {
          const key = colIndexToKeyMap[cIndex];
          if (key && allowedFields.includes(key as any)) {
            const valStr = String(val || "").trim();
            if (valStr !== "") {
              cleanEntry[key] = valStr;
            }
          }
        });

        if (cleanEntry.registration_number && cleanEntry.registration_number.trim() !== "") {
          finalData.push({ ...cleanEntry, month, year });
        }
      }

      const validatedData = validateImportData(finalData);
      if (validatedData) {
        setImportData({
          data: validatedData as any[],
        });

        setLoadNext(true);
      }
    } catch (err: any) {
      console.error("Mapping data error:", err);
      setErrors((prev) => ({ ...prev, general: `Mapping error: ${err.message}` }));
    }
  };

  return (
    <section className="py-4 ">
      {loadNext ? (
        <VehicleUsageImportData env={env} />
      ) : (
        <Card className="m-4 px-auto lg:px-40">
          <CardHeader>
            <CardTitle>Map Fields</CardTitle>
            <CardDescription>
              Map your fields with the vehicle usage fields
            </CardDescription>
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
            <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-6 gap-8 mb-4">
              <div className="flex  flex-col gap-1">
                <Label className="text-sm font-medium">Month</Label>

                <Combobox
                  options={payoutMonths}
                  placeholder="Select Payroll Month"
                  value={month}
                  onChange={(value: string) => {
                    setMonth(Number(value));
                  }}
                />
              </div>

              <div className=" flex flex-col gap-1">
                <Label className="text-sm font-medium">Year</Label>
                <Combobox
                  options={transformStringArrayIntoOptions([
                    `${defaultYear - 2}`,
                    `${defaultYear - 1}`,
                    `${defaultYear}`,
                  ] as unknown as string[])}
                  placeholder="Select Payroll Year"
                  value={year}
                  onChange={(value: string) => {
                    setYear(Number(value));
                  }}
                />
              </div>
            </div>
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
