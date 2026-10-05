import { useState, useEffect } from "react";
import {
  json,
  useLoaderData,
  useLocation,
  useSearchParams,
  useFetcher,
} from "@remix-run/react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Input } from "@canny_ecosystem/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import {
  getSiteNamesByCompanyId,
  getCompanyNameByCompanyId,
  getLatestEmployeeByCompanyId,
  getCompanyConfigByCompanyId,
  getProjectsByCompanyId,
  getDepartmentsByCompanyId,
  getCompanyEsicDetailsByCompanyId,
  type ImportEmployeeDetailsDataType,
} from "@canny_ecosystem/supabase/queries";
import {
  ImportEmployeeDetailsDataSchema,
  ImportSingleEmployeeDetailsDataSchema,
  transformStringArrayIntoOptions,
  replaceUnderscore,
  pipe,
  replaceDash,
  normalizeNames,
  normalizeDate,
  formatExcelDate,
  z,
  generateEmployeeCodes,
  generateCompanyPrefix,
  normalizeState,
} from "@canny_ecosystem/utils";
import { getEmployeeDetailsConflicts } from "@canny_ecosystem/supabase/mutations";
import { UnifiedEmployeeImportData } from "../../../../components/employees/import-export/unified-employee-import-data";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useImportStoreForEmployeeDetails } from "@/store/import";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { suggestFieldMapping } from "@/utils/ai/import-mapping";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { cn } from "@canny_ecosystem/ui/utils/cn";

type FieldConfig = {
  key: string;
  required?: boolean;
  section?: string;
};

const FIELD_CONFIGS: FieldConfig[] = [
  { key: "employee_code", section: "Employee Details", required: true },
  { key: "department", section: "Employee Details" },
  { key: "full_name", section: "Employee Details" },
  { key: "full_address", section: "Address" },
  { key: "guardian_full_name", section: "Guardian" },
  { key: "first_name", section: "Employee Details" },
  { key: "middle_name", section: "Employee Details" },
  { key: "last_name", section: "Employee Details" },
  { key: "gender", section: "Employee Details" },
  { key: "education", section: "Employee Details" },
  { key: "marital_status", section: "Employee Details" },
  { key: "date_of_birth", section: "Employee Details" },
  { key: "is_active", section: "Employee Details" },
  { key: "personal_email", section: "Employee Details" },
  { key: "primary_mobile_number", section: "Employee Details" },
  { key: "secondary_mobile_number", section: "Employee Details" },
  { key: "nationality", section: "Employee Details" },
  { key: "photo", section: "Employee Details" },
  { key: "site", section: "Work Details" },
  { key: "project", section: "Work Details" },

  { key: "assignment_type", section: "Work Details" },
  { key: "position", section: "Work Details" },
  { key: "start_date", section: "Work Details" },
  { key: "end_date", section: "Work Details" },
  { key: "skill_level", section: "Work Details" },

  { key: "aadhaar_number", section: "Statutory Details" },
  { key: "pan_number", section: "Statutory Details" },
  { key: "uan_number", section: "Statutory Details" },
  { key: "pf_number", section: "Statutory Details" },
  { key: "esic_number", section: "Statutory Details" },
  { key: "esic_site_name", section: "Statutory Details" },
  { key: "driving_license_number", section: "Statutory Details" },
  { key: "driving_license_expiry", section: "Statutory Details" },
  { key: "passport_number", section: "Statutory Details" },
  { key: "passport_expiry", section: "Statutory Details" },

  { key: "account_holder_name", section: "Bank Details" },
  { key: "account_number", section: "Bank Details" },
  { key: "ifsc_code", section: "Bank Details" },
  { key: "account_type", section: "Bank Details" },
  { key: "bank_name", section: "Bank Details" },
  { key: "branch_name", section: "Bank Details" },

  { key: "address_type", section: "Address" },
  { key: "address_line_1", section: "Address" },
  { key: "address_line_2", section: "Address" },
  { key: "city", section: "Address" },
  { key: "pincode", section: "Address" },
  { key: "state", section: "Address" },
  { key: "country", section: "Address" },
  { key: "is_primary", section: "Address" },
  { key: "latitude", section: "Address" },
  { key: "longitude", section: "Address" },

  { key: "permanent_full_address", section: "Permanent Address" },
  { key: "permanent_address_line_1", section: "Permanent Address" },
  { key: "permanent_address_line_2", section: "Permanent Address" },
  { key: "permanent_city", section: "Permanent Address" },
  { key: "permanent_pincode", section: "Permanent Address" },
  { key: "permanent_state", section: "Permanent Address" },
  { key: "permanent_country", section: "Permanent Address" },
  { key: "permanent_is_primary", section: "Permanent Address" },

  { key: "guardian_first_name", section: "Guardian" },
  { key: "guardian_last_name", section: "Guardian" },
  { key: "relationship", section: "Guardian" },
  { key: "guardian_date_of_birth", section: "Guardian" },
  { key: "guardian_gender", section: "Guardian" },
  { key: "guardian_email", section: "Guardian" },
  { key: "mobile_number", section: "Guardian" },
  { key: "alternate_mobile_number", section: "Guardian" },
  { key: "is_emergency_contact", section: "Guardian" },
  { key: "address_same_as_employee", section: "Guardian" },
];

const EMPLOYEE_FIELDS = [
  "employee_code",
  "full_name",
  "full_address",
  "guardian_full_name",
  "department",
  "site",
  "project",
  "first_name",
  "middle_name",
  "last_name",
  "gender",
  "education",
  "marital_status",
  "date_of_birth",
  "is_active",
  "personal_email",
  "primary_mobile_number",
  "secondary_mobile_number",
  "assignment_type",
  "position",
  "start_date",
  "end_date",
  "skill_level",
  "uan_number",
  "pan_number",
  "esic_number",
  "esic_site_name",
  "aadhaar_number",
  "pf_number",
  "passport_number",
  "passport_expiry",
  "driving_license_number",
  "driving_license_expiry",
  "nationality",
  "full_address",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "pincode",
  "country",
  "is_primary",
  "address_type",
  "permanent_full_address",
  "permanent_address_line_1",
  "permanent_address_line_2",
  "permanent_city",
  "permanent_state",
  "permanent_pincode",
  "permanent_country",
  "permanent_is_primary",
  "photo",
  "site_id",
  "project_id",
  "department_id",
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const { data: sites } = await getSiteNamesByCompanyId({
    supabase,
    companyId,
  });

  const { data: projects } = await getProjectsByCompanyId({
    supabase,
    companyId,
  });

  const { data: departments } = await getDepartmentsByCompanyId({
    supabase,
    companyId,
  });

  const siteOptions = sites?.map((site) => ({
    label: site?.name,
    pseudoLabel: site?.projects?.name,
    pseudoValue: site?.prefix,
    value: site?.id,
  }));

  const projectOptions = projects?.map((project) => ({
    label: project.name,
    value: project.id,
  }));

  const departmentOptions = departments?.map((dept) => ({
    label: dept.name,
    value: dept.id,
  }));

  const { data: companyData } = await getCompanyNameByCompanyId({
    supabase: supabase as any,
    id: companyId,
  });

  const { data: companyConfig } = await getCompanyConfigByCompanyId({
    supabase: supabase as any,
    companyId,
  });

  // Fetch prefixes from company_prefix table
  let { data: companyPrefixes, error: prefixesError } = await (
    supabase.from("company_prefix") as any
  )
    .select("name, site_id, is_default, site:sites!site_id(name)")
    .eq("company_id", companyId);

  if (prefixesError || !companyPrefixes) {
    const fallbackResult = await (supabase.from("company_prefix") as any)
      .select("name, site_id, is_default, site:sites!site_id(name)")
      .eq("company_id", companyId);
    companyPrefixes = fallbackResult.data;
  }

  const prefixLatestCodeMap: Record<string, string | null> = {};

  if (companyPrefixes) {
    for (const prefixRow of companyPrefixes) {
      if (prefixRow.name) {
        const { data: latest } = await getLatestEmployeeByCompanyId({
          supabase: supabase as any,
          companyId,
          prefix: prefixRow.name,
        });
        prefixLatestCodeMap[prefixRow.name] = latest;
      }
    }
  }

  const defaultPrefixRow =
    companyPrefixes?.find((p: any) => p.is_default === true) ||
    companyPrefixes?.find((p: any) => p.site_id === null);
  const companyPrefix =
    defaultPrefixRow?.name || generateCompanyPrefix(companyData?.name ?? "");

  if (prefixLatestCodeMap[companyPrefix] === undefined) {
    const { data: latest } = await getLatestEmployeeByCompanyId({
      supabase: supabase as any,
      companyId,
      prefix: companyPrefix,
    });
    prefixLatestCodeMap[companyPrefix] = latest;
  }

  const { data: companyEsicDetails } = await getCompanyEsicDetailsByCompanyId({
    supabase: supabase as any,
    companyId,
  });

  return json({
    env,
    companyId,
    siteOptions,
    projectOptions,
    departmentOptions,
    companyPrefix,
    companyPrefixes: companyPrefixes || [],
    prefixLatestCodeMap,
    companyEsicDetails: companyEsicDetails || [],
  });
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

export default function EmployeeDetailsImportFieldMapping() {
  const {
    env,
    companyId,
    siteOptions,
    projectOptions,
    departmentOptions,
    companyPrefix,
    companyPrefixes,
    prefixLatestCodeMap,
    companyEsicDetails,
  } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });
  const [searchParams, setSearchParams] = useSearchParams();
  const [site, setSite] = useState("");
  const [pseudoValue, setPseudoValue] = useState("");
  const { setImportData } = useImportStoreForEmployeeDetails();

  const [autoGenerateCode, setAutoGenerateCode] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = useState(companyPrefix || "");

  useEffect(() => {
    if (companyPrefix) {
      setSelectedPrefix(companyPrefix);
    }
  }, [companyPrefix]);

  const prefixOptions =
    companyPrefixes?.map((p: any) => {
      const isDefault = p.is_default === true || p.name === companyPrefix;
      return {
        label: p.name ?? "",
        value: p.name ?? "",
        pseudoLabel: `${p.site?.name ? p.site.name : "Global"}${
          isDefault ? " (Default)" : ""
        }`,
      };
    }) || [];

  if (
    companyPrefix &&
    !prefixOptions.some((opt: any) => opt.value === companyPrefix)
  ) {
    prefixOptions.unshift({
      label: companyPrefix,
      value: companyPrefix,
      pseudoLabel: "Default",
    });
  }

  const [loadNext, setLoadNext] = useState(false);
  const [hasConflict, setHasConflict] = useState<number[]>([]);

  const location = useLocation();
  const [file] = useState(location.state?.file);
  const [initialIntent] = useState(location.state?.intent || "skip");
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

    const keywords = [
      "employee",
      "code",
      "name",
      "id",
      "first",
      "last",
      "gender",
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

  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [matchingKey, setMatchingKey] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fetcher = useFetcher<any>();

  const handleAISuggestion = () => {
    const targetFields = FIELD_CONFIGS.map((f) => f.key);
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
      setFieldMapping((prev) => ({
        ...prev,
        ...(fetcher.data.mapping as Record<string, string>),
      }));
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (headerArray.length > 0) {
      const hasEmployeeCode = headerArray.some((h) => {
        const normalized = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normalized.includes("employeecode") ||
          normalized === "code" ||
          normalized === "empcode"
        );
      });
      if (!hasEmployeeCode) {
        setAutoGenerateCode(true);
      }
    }
  }, [headerArray]);

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
              "first",
              "last",
              "gender",
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
            console.error("Employee Import Header parsing error:", error);
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
              "first",
              "last",
              "gender",
              "status",
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
            console.error("Employee Import Excel Header parsing error:", error);
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
    if (initialIntent === "overwrite") {
      if (!fieldMapping[matchingKey]) {
        setValidationErrors([
          `${replaceUnderscore(matchingKey)}: Required for matching`,
        ]);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return false;
      }
      return true;
    }

    const requiredFields = FIELD_CONFIGS.filter((f) => f.required);
    const missingFields = requiredFields.filter((f) => {
      if (autoGenerateCode && f.key === "employee_code") return false;
      if (site && f.key === "site") return false;
      return !fieldMapping[f.key];
    });

    if (missingFields.length > 0) {
      const formattedErrors = missingFields.map(
        (f) => `${replaceUnderscore(f.key)}: Required`,
      );
      setValidationErrors(formattedErrors);

      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
    return true;
  };

  const validateImportData = (data: any[]) => {
    try {
      let schema: any = ImportEmployeeDetailsDataSchema;

      if (initialIntent === "overwrite") {
        schema = z.object({
          data: z.array(
            ImportSingleEmployeeDetailsDataSchema.partial().extend({
              uan_number: z.string().optional(),
              esic_number: z.string().optional(),
              aadhaar_number: z.string().optional(),
              pan_number: z.string().optional(),
              [matchingKey]: z.preprocess(
                (val) => (val === undefined || val === null ? "" : String(val)),
                z.string().min(1, { message: "Required for matching" }),
              ),
            }),
          ),
        });
      } else if (autoGenerateCode) {
        schema = z.object({
          data: z.array(
            ImportSingleEmployeeDetailsDataSchema.extend({
              employee_code: z.string().optional(),
            }),
          ),
        });
      }

      const result = schema.safeParse({ data });
      if (!result.success) {
        const formattedErrors = result.error.errors.map((err: any) => {
          const rowIndex = err.path[1];
          const fieldName = err.path[2];
          const value = data[Number(rowIndex)][fieldName];
          return `Row ${Number(rowIndex) + 1}: ${fieldName} ${value ? `("${value}")` : ""} - ${err.message}`;
        });
        setValidationErrors(formattedErrors);
        return null;
      }
      return result.data.data;
    } catch (error) {
      console.error("Employee Import Data validation error:", error);
      setValidationErrors([
        "An unexpected error occurred during data validation",
      ]);
      return null;
    }
  };

  const handleParsedData = async () => {
    if (!validateMapping()) {
      return;
    }

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
              .filter(([key]) => allowedFields.includes(key))
              .map(([key, value]) => {
                let processedValue = value;
                if (typeof value === "number") {
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
                  } else if (key === "state") {
                    processedValue = normalizeState(processedValue);
                  }
                }

                if (
                  [
                    "date_of_birth",
                    "guardian_date_of_birth",
                    "passport_expiry",
                    "driving_license_expiry",
                    "start_date",
                    "end_date",
                  ].includes(key)
                ) {
                  if (
                    processedValue instanceof Date &&
                    !isNaN(processedValue.getTime())
                  ) {
                    processedValue = formatExcelDate(processedValue);
                  } else {
                    processedValue = normalizeDate(processedValue);
                  }
                }
                return [
                  key,
                  processedValue === "" ? undefined : processedValue,
                ];
              }),
          );

          if (cleanEntry.full_name) {
            let name = String(cleanEntry.full_name).trim();
            name = name.replace(/^(Mr\.|Ms\.|Mrs\.|Shri|Smt\.)\s+/i, "");

            const parts = name.split(/\s+/);
            if (parts.length === 1) {
              cleanEntry.first_name = normalizeNames(parts[0]);
            } else if (parts.length === 2) {
              cleanEntry.first_name = normalizeNames(parts[0]);
              cleanEntry.last_name = normalizeNames(parts[1]);
            } else {
              cleanEntry.first_name = normalizeNames(parts[0]);
              cleanEntry.last_name = normalizeNames(parts[parts.length - 1]);
              cleanEntry.middle_name = normalizeNames(
                parts.slice(1, parts.length - 1).join(" "),
              );
            }
          }

          if (cleanEntry.guardian_full_name) {
            const gParts = String(cleanEntry.guardian_full_name)
              .trim()
              .split(/\s+/);
            cleanEntry.guardian_first_name = gParts[0];
            if (gParts.length > 1) {
              cleanEntry.guardian_last_name = gParts[gParts.length - 1];
            }
          }
          if (cleanEntry.full_address) {
            const addr = String(cleanEntry.full_address).trim();
            cleanEntry.address_line_1 = addr;
            cleanEntry.address_type = cleanEntry.address_type || "Present";
            cleanEntry.is_primary = cleanEntry.is_primary || "false";

            const pinMatch = addr.match(/\b\d{6}\b/);
            if (pinMatch) cleanEntry.pincode = pinMatch[0];

            const toTitleCase = (str: string) =>
              str
                .toLowerCase()
                .split(" ")
                .map((word) => word.trim())
                .filter(Boolean)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            const states = [
              "ANDHRA PRADESH",
              "ARUNACHAL PRADESH",
              "ASSAM",
              "BIHAR",
              "CHHATTISGARH",
              "GOA",
              "GUJARAT",
              "HARYANA",
              "HIMACHAL PRADESH",
              "JHARKHAND",
              "KARNATAKA",
              "KERALA",
              "MADHYA PRADESH",
              "MAHARASHTRA",
              "MANIPUR",
              "MEGHALAYA",
              "MIZORAM",
              "NAGALAND",
              "ODISHA",
              "PUNJAB",
              "RAJASTHAN",
              "SIKKIM",
              "TAMIL NADU",
              "TELANGANA",
              "TRIPURA",
              "UTTAR PRADESH",
              "UTTARAKHAND",
              "WEST BENGAL",
              "DELHI",
            ];

            let foundState = "";
            for (const s of states) {
              if (addr.toUpperCase().includes(s)) {
                cleanEntry.state = normalizeState(s);
                foundState = s;
                break;
              }
            }

            if (foundState) {
              const beforeState = addr
                .toUpperCase()
                .split(foundState)[0]
                .trim();
              const parts = beforeState
                .split(/[\s,]+/)
                .filter((p) => !p.match(/\d/));
              if (parts.length > 0) {
                cleanEntry.city = toTitleCase(parts[parts.length - 1]);
              }
            }
          }

          if (cleanEntry.permanent_full_address) {
            const addr = String(cleanEntry.permanent_full_address).trim();
            cleanEntry.permanent_address_line_1 = addr;
            cleanEntry.permanent_is_primary =
              cleanEntry.permanent_is_primary || "false";

            const pinMatch = addr.match(/\b\d{6}\b/);
            if (pinMatch) cleanEntry.permanent_pincode = pinMatch[0];

            const toTitleCase = (str: string) =>
              str
                .toLowerCase()
                .split(" ")
                .map((word) => word.trim())
                .filter(Boolean)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            const states = [
              "ANDHRA PRADESH",
              "ARUNACHAL PRADESH",
              "ASSAM",
              "BIHAR",
              "CHHATTISGARH",
              "GOA",
              "GUJARAT",
              "HARYANA",
              "HIMACHAL PRADESH",
              "JHARKHAND",
              "KARNATAKA",
              "KERALA",
              "MADHYA PRADESH",
              "MAHARASHTRA",
              "MANIPUR",
              "MEGHALAYA",
              "MIZORAM",
              "NAGALAND",
              "ODISHA",
              "PUNJAB",
              "RAJASTHAN",
              "SIKKIM",
              "TAMIL NADU",
              "TELANGANA",
              "TRIPURA",
              "UTTAR PRADESH",
              "UTTARAKHAND",
              "WEST BENGAL",
              "DELHI",
            ];

            let foundState = "";
            for (const s of states) {
              if (addr.toUpperCase().includes(s)) {
                cleanEntry.permanent_state = normalizeState(s);
                foundState = s;
                break;
              }
            }

            if (foundState) {
              const beforeState = addr
                .toUpperCase()
                .split(foundState)[0]
                .trim();
              const parts = beforeState
                .split(/[\s,]+/)
                .filter((p) => !p.match(/\d/));
              if (parts.length > 0) {
                cleanEntry.permanent_city = toTitleCase(
                  parts[parts.length - 1],
                );
              }
            }
          }

          const normalizeFuzzy = (val: any) =>
            String(val || "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");

          const siteFromSheet = cleanEntry.site;
          let matchedSiteId = undefined;

          if (siteFromSheet) {
            const cleanSiteInput = normalizeFuzzy(siteFromSheet);
            const foundSite = siteOptions?.find((opt: any) => {
              const labelFuzzy = normalizeFuzzy(opt.label);
              const pseudoFuzzy = normalizeFuzzy(opt.pseudoValue);
              const valueFuzzy = normalizeFuzzy(opt.value);

              return (
                labelFuzzy === cleanSiteInput ||
                pseudoFuzzy === cleanSiteInput ||
                valueFuzzy === cleanSiteInput
              );
            });

            if (foundSite) {
              matchedSiteId = foundSite.value;
            } else {
              const isUUID =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  String(siteFromSheet),
                );
              if (isUUID) matchedSiteId = String(siteFromSheet);
            }
          }

          const projectFromSheet = (cleanEntry as any).project;
          let matchedProjectId = undefined;

          if (projectFromSheet) {
            const cleanProjectInput = normalizeFuzzy(projectFromSheet);
            const foundProject = projectOptions?.find((opt: any) => {
              const labelFuzzy = normalizeFuzzy(opt.label);
              const valueFuzzy = normalizeFuzzy(opt.value);

              return (
                labelFuzzy === cleanProjectInput ||
                valueFuzzy === cleanProjectInput
              );
            });

            if (foundProject) {
              matchedProjectId = foundProject.value;
            } else {
              const isUUID =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  String(projectFromSheet),
                );
              if (isUUID) matchedProjectId = String(projectFromSheet);
            }
          }

          const departmentFromSheet = cleanEntry.department;
          let matchedDepartmentId = undefined;

          if (departmentFromSheet) {
            const cleanDeptInput = normalizeFuzzy(departmentFromSheet);
            const foundDept = departmentOptions?.find((opt: any) => {
              const labelFuzzy = normalizeFuzzy(opt.label);
              const valueFuzzy = normalizeFuzzy(opt.value);

              return (
                labelFuzzy === cleanDeptInput || valueFuzzy === cleanDeptInput
              );
            });

            if (foundDept) {
              matchedDepartmentId = foundDept.value;
            } else {
              const isUUID =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  String(departmentFromSheet),
                );
              if (isUUID) matchedDepartmentId = String(departmentFromSheet);
            }
          }

          return {
            ...cleanEntry,
            is_active: cleanEntry.is_active || "true",
            is_emergency_contact: cleanEntry.is_emergency_contact || "false",
            address_same_as_employee:
              cleanEntry.address_same_as_employee || "false",
            site_id: matchedSiteId,
            project_id: matchedProjectId,
            department_id: matchedDepartmentId,
            employee_code: (cleanEntry as any).employee_code,
          };
        });

      let finalProcessedData = finalData;

      if (autoGenerateCode) {
        const generatedCodes = generateEmployeeCodes(
          selectedPrefix,
          finalData.length,
          prefixLatestCodeMap[selectedPrefix] ?? undefined,
        );

        finalProcessedData = finalData.map((entry, index) => ({
          ...entry,
          employee_code: generatedCodes[index],
        }));
      }

      const filteredProcessedData = finalProcessedData.filter((entry: any) => {
        if (initialIntent === "overwrite") {
          const matchVal = entry[matchingKey];
          if (!matchVal || String(matchVal).toLowerCase().trim() === "new")
            return false;
        }
        return true;
      });

      const coreData = filteredProcessedData.map((entry: any) => {
        const coreEntry: any = {};
        for (const k of EMPLOYEE_FIELDS) {
          if (entry[k] !== undefined) coreEntry[k] = entry[k];
        }
        coreEntry.site_id = entry.site_id;
        coreEntry.project_id = entry.project_id;
        coreEntry.department_id = entry.department_id;
        return coreEntry;
      });

      const validatedCoreData = await validateImportData(coreData);
      if (validatedCoreData) {
        const finalMergedData = filteredProcessedData.map(
          (originalEntry: any, index: number) => ({
            ...originalEntry,
            ...validatedCoreData[index],
            site_id: validatedCoreData[index].site_id || originalEntry.site_id,
            project_id:
              validatedCoreData[index].project_id || originalEntry.project_id,
            department_id:
              validatedCoreData[index].department_id ||
              originalEntry.department_id,
          }),
        );

        setImportData({
          data: finalMergedData as ImportEmployeeDetailsDataType[],
        });
        const { conflictingIndices, error } = await getEmployeeDetailsConflicts(
          {
            supabase,
            importedData: finalMergedData as ImportEmployeeDetailsDataType[],
          },
        );

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
    }
  };

  const sections = FIELD_CONFIGS.reduce(
    (acc, field) => {
      const sec = field.section ?? "Other";
      if (!acc[sec]) acc[sec] = [];
      acc[sec].push(field);
      return acc;
    },
    {} as Record<string, FieldConfig[]>,
  );

  return (
    <section className="py-4">
      {loadNext ? (
        <UnifiedEmployeeImportData
          conflictingIndices={hasConflict}
          env={env}
          companyId={companyId}
          initialImportType={initialIntent}
          matchingKey={matchingKey}
          defaultSiteId={site}
          mappedKeys={Object.keys(fieldMapping).filter((k) => fieldMapping[k])}
          companyEsicDetails={companyEsicDetails}
        />
      ) : (
        <Card className="m-4 px-auto lg:px-10">
          <CardHeader>
            <CardTitle>Map Fields</CardTitle>
            <CardDescription className="flex justify-between items-center">
              <div className="flex flex-col gap-2">
                <span>
                  Map your spreadsheet columns to Employee fields — all sections
                  in one sheet
                </span>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="auto-generate-code"
                      checked={autoGenerateCode}
                      onCheckedChange={(checked) =>
                        setAutoGenerateCode(checked === true)
                      }
                    />
                    <label
                      htmlFor="auto-generate-code"
                      className="text-sm font-medium text-foreground cursor-pointer animate-in fade-in"
                    >
                      Auto-generate Employee Codes
                    </label>
                  </div>

                  {autoGenerateCode && prefixOptions.length > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200 min-w-[200px]">
                      <span className="text-xs text-muted-foreground font-semibold shrink-0">
                        with Prefix:
                      </span>
                      <Combobox
                        key={selectedPrefix}
                        options={prefixOptions}
                        value={selectedPrefix}
                        onChange={(val) => {
                          if (val) setSelectedPrefix(val as string);
                        }}
                        placeholder="Prefix"
                        className="w-48 capitalize text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                onClick={handleAISuggestion}
                disabled={fetcher.state !== "idle" || headerArray.length === 0}
              >
                <span className="flex items-center gap-1.5">
                  {fetcher.state !== "idle" ? (
                    <span className="animate-spin text-lg">✨</span>
                  ) : (
                    <span>✨</span>
                  )}
                  Auto Match Fields (AI)
                </span>
              </Button>
            </CardDescription>
            {initialIntent === "overwrite" && (
              <div className="mt-4 p-5 bg-primary/5 rounded-xl border border-primary/20 shadow-sm">
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
                          { label: "UAN Number", value: "uan_number" },
                          { label: "ESIC Number", value: "esic_number" },
                        ]}
                        value={matchingKey}
                        onChange={(val) => setMatchingKey(val as string)}
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
            )}
          </CardHeader>
          <CardContent>
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

            <div className="hidden">
              <Combobox
                options={siteOptions ?? []}
                value={site}
                pseudoValue={pseudoValue}
                onChange={(site, { pseudoValue }) => {
                  setPseudoValue(pseudoValue!);
                  setSite(site);
                  if (site?.length) {
                    searchParams.set("site", site);
                  } else {
                    searchParams.delete("site");
                  }
                  setSearchParams(searchParams);
                }}
                placeholder={"Select Site"}
                className="w-full"
              />
            </div>

            {Object.entries(sections).map(([sectionName, fields]) => (
              <div key={sectionName} className="mb-8">
                <h3 className="text-sm font-semibold text-foreground border-b pb-1.5 mb-4">
                  {sectionName}
                </h3>
                <div className="grid grid-cols-2 max-sm:grid-cols-1 place-content-center justify-between gap-y-6 gap-x-10">
                  {fields
                    .filter((field) => {
                      if (
                        initialIntent === "overwrite" &&
                        field.key === matchingKey
                      )
                        return false;
                      return true;
                    })
                    .map((field) => {
                      const isSmartField = [
                        "full_name",
                        "full_address",
                        "guardian_full_name",
                      ].includes(field.key);
                      return (
                        <div
                          key={field.key}
                          className={cn(
                            "flex flex-col",
                            isSmartField && "sm:col-span-2",
                          )}
                        >
                          <div className="flex flex-row items-center gap-2 pb-1">
                            <label className="text-sm text-muted-foreground capitalize">
                              {replaceUnderscore(field.key)}
                              {field.required &&
                                initialIntent !== "overwrite" &&
                                !(
                                  autoGenerateCode &&
                                  field.key === "employee_code"
                                ) &&
                                !(site && field.key === "site") && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                            </label>
                          </div>
                          <Combobox
                            options={transformStringArrayIntoOptions(
                              headerArray,
                            )}
                            value={fieldMapping[field.key] || ""}
                            onChange={(value) => {
                              setFieldMapping((prev) => ({
                                ...prev,
                                [field.key]: (value as string) || "",
                              }));
                            }}
                            placeholder={`Select ${replaceUnderscore(field.key)}`}
                            className="w-full"
                            disabled={
                              autoGenerateCode && field.key === "employee_code"
                            }
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            <div className="flex flex-col items-end gap-2 mt-4">
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
