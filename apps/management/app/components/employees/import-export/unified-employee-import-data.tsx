import { ImportedDataColumns } from "@/components/employees/imported-employee-details-table/columns";
import { ImportedDataTable } from "@/components/employees/imported-employee-details-table/imported-data-table";
import { cacheKeyPrefix } from "@/constant";
import { useImportStoreForEmployeeDetails } from "@/store/import";
import { clearCacheEntry } from "@/utils/cache";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  createEmployeeDetailsFromImportedData,
  createEmployeeWorkDetailsFromImportedData,
  createEmployeeStatutoryFromImportedData,
  createEmployeeBankDetailsFromImportedData,
  createEmployeeAddressFromImportedData,
  getEmployeeDetailsConflicts,
  getEmployeeWorkDetailsConflicts,
} from "@canny_ecosystem/supabase/mutations";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { Button } from "@canny_ecosystem/ui/button";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  isGoodStatus,
  normalizeNames,
  normalizeEnum,
  normalizeDate,
  isPlaceholder,
  normalizeSuperFuzzy,
  formatExcelDate,
} from "@canny_ecosystem/utils";
import { useNavigate } from "@remix-run/react";
import { LoadingSpinner } from "@/components/loading-spinner";

import { useState, useEffect } from "react";
import {
  getDepartmentsByCompanyId,
  getSitesByCompanyId,
  getProjectsByCompanyId,
} from "@canny_ecosystem/supabase/queries";

export function UnifiedEmployeeImportData({
  env,
  conflictingIndices,
  companyId,
  initialImportType,
  matchingKey = "employee_code",
  defaultSiteId,
  mappedKeys,
  companyEsicDetails,
}: {
  env: SupabaseEnv;
  conflictingIndices: number[];
  companyId: string;
  initialImportType?: string;
  matchingKey?: string;
  defaultSiteId?: string;
  mappedKeys?: string[];
  companyEsicDetails?: any[];
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supabase } = useSupabase({ env });
  const { importData } = useImportStoreForEmployeeDetails();
  const [conflictingIndex, setConflictingIndex] =
    useState<number[]>(conflictingIndices);

  const visibleColumns = ImportedDataColumns.filter((col) => {
    const accessorKey = (col as any).accessorKey;
    if (col.id === "actions" || accessorKey === "sr_no") return true;
    if (!accessorKey) return true;

    if (accessorKey === matchingKey) return true;

    if (accessorKey === "employee_code") {
      const hasCodes = importData.data?.some(
        (row) =>
          row.employee_code !== undefined &&
          row.employee_code !== null &&
          String(row.employee_code).trim() !== "",
      );
      if (hasCodes) return true;
    }

    if (mappedKeys?.includes(accessorKey)) return true;

    if (
      mappedKeys?.includes("full_name") &&
      ["first_name", "last_name", "middle_name"].includes(accessorKey)
    )
      return true;
    if (
      mappedKeys?.includes("full_address") &&
      ["address_line_1", "address_line_2", "city", "state", "pincode"].includes(
        accessorKey,
      )
    )
      return true;
    if (
      mappedKeys?.includes("permanent_full_address") &&
      [
        "permanent_address_line_1",
        "permanent_address_line_2",
        "permanent_city",
        "permanent_state",
        "permanent_pincode",
      ].includes(accessorKey)
    )
      return true;
    if (
      mappedKeys?.includes("guardian_full_name") &&
      ["guardian_first_name", "guardian_last_name"].includes(accessorKey)
    )
      return true;

    return false;
  });
  const [searchString, setSearchString] = useState("");
  const [importType, setImportType] = useState<string>(
    initialImportType === "overwrite" ? "overwrite" : "skip",
  );
  const [tableData, setTableData] = useState(importData.data);
  const [enrichedData, setEnrichedData] = useState(importData.data);
  const [isImporting, setIsImporting] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [deptRes, siteRes, projRes] = await Promise.all([
          getDepartmentsByCompanyId({ supabase, companyId }),
          getSitesByCompanyId({ supabase, companyId }),
          getProjectsByCompanyId({ supabase, companyId }),
        ]);
        if (deptRes.data) setDepartments(deptRes.data);
        if (siteRes.data) setSites(siteRes.data);
        if (projRes.data) setProjects(projRes.data);
      } catch (err) {
        console.error("Error fetching import context data:", err);
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchData();
  }, [supabase, companyId]);

  const fetchConflicts = async () => {
    try {
      const coreData = importData?.data?.map((entry: any) => ({
        employee_code: entry.employee_code,
        primary_mobile_number: entry.primary_mobile_number,
        secondary_mobile_number: entry.secondary_mobile_number,
        personal_email: entry.personal_email,
        uan_number: entry.uan_number,
        esic_number: entry.esic_number,
      }));

      const { conflictingIndices, conflictingRecords, error } =
        await getEmployeeDetailsConflicts({
          supabase,
          importedData: coreData as any,
          matchingKey,
        });

      if (error) {
        throw error;
      }

      const workData = importData?.data?.map((entry: any) => {
        const cleanSiteInput = isPlaceholder(entry.site)
          ? ""
          : normalizeSuperFuzzy(entry.site);
        const siteId =
          sites?.find(
            (s: any) => normalizeSuperFuzzy(s.name) === cleanSiteInput,
          )?.id || defaultSiteId;

        return {
          site_id: siteId,
          first_name: entry.first_name,
          middle_name: entry.middle_name,
          last_name: entry.last_name,
          employee_id: "",
        };
      });

      const { conflictingIndices: wdConflicts, error: wdError } =
        await getEmployeeWorkDetailsConflicts({
          supabase,
          importedData: workData as any,
        });

      if (wdError) {
        console.error("Work Details Error fetching conflicts:", wdError);
      }

      setConflictingIndex([
        ...new Set([...conflictingIndices, ...(wdConflicts || [])]),
      ]);

      const enriched = importData?.data?.map((entry: any) => {
        const conflictingRecord = conflictingRecords?.find((existing: any) => {
          const uanMatch =
            entry.uan_number &&
            (existing.employee_statutory_details?.uan_number ===
              entry.uan_number ||
              (Array.isArray(existing.employee_statutory_details) &&
                existing.employee_statutory_details.some(
                  (s: any) => s.uan_number === entry.uan_number,
                )));
          const esicMatch =
            entry.esic_number &&
            (existing.employee_statutory_details?.esic_number ===
              entry.esic_number ||
              (Array.isArray(existing.employee_statutory_details) &&
                existing.employee_statutory_details.some(
                  (s: any) => s.esic_number === entry.esic_number,
                )));
          const codeMatch = existing.employee_code === entry.employee_code;
          return uanMatch || codeMatch || esicMatch;
        });

        if (conflictingRecord) {
          const statutoryDetails = Array.isArray(
            conflictingRecord.employee_statutory_details,
          )
            ? conflictingRecord.employee_statutory_details[0]
            : conflictingRecord.employee_statutory_details;

          const bankDetails = Array.isArray(
            conflictingRecord.employee_bank_details,
          )
            ? conflictingRecord.employee_bank_details[0]
            : conflictingRecord.employee_bank_details;

          return {
            ...entry,
            existing_employee_code: conflictingRecord.employee_code,
            existing_first_name: conflictingRecord.first_name,
            existing_middle_name: conflictingRecord.middle_name,
            existing_last_name: conflictingRecord.last_name,
            existing_gender: conflictingRecord.gender,
            existing_education: conflictingRecord.education,
            existing_marital_status: conflictingRecord.marital_status,
            existing_is_active: conflictingRecord.is_active,
            existing_date_of_birth: conflictingRecord.date_of_birth,
            existing_personal_email: conflictingRecord.personal_email,
            existing_primary_mobile_number:
              conflictingRecord.primary_mobile_number,
            existing_secondary_mobile_number:
              conflictingRecord.secondary_mobile_number,
            existing_nationality: conflictingRecord.nationality,

            existing_uan_number: statutoryDetails?.uan_number,
            existing_aadhaar_number: statutoryDetails?.aadhaar_number,
            existing_pan_number: statutoryDetails?.pan_number,
            existing_pf_number: statutoryDetails?.pf_number,
            existing_esic_number: statutoryDetails?.esic_number,
            existing_esic_site_name:
              statutoryDetails?.company_esic_details?.esic_site_name,
            existing_driving_license_number:
              statutoryDetails?.driving_license_number,
            existing_driving_license_expiry:
              statutoryDetails?.driving_license_expiry,
            existing_passport_number: statutoryDetails?.passport_number,
            existing_passport_expiry: statutoryDetails?.passport_expiry,

            existing_account_number: bankDetails?.account_number,
            existing_ifsc_code: bankDetails?.ifsc_code,
            existing_bank_name: bankDetails?.bank_name,
            existing_branch_name: bankDetails?.branch_name,
          };
        }
        return entry;
      });

      setEnrichedData(enriched);
    } catch (err) {
      console.error("Error fetching conflicts:", err);
    }
  };

  useEffect(() => {
    if (importData) {
      fetchConflicts();
    }
  }, [importData, sites, departments, projects, defaultSiteId]);

  useEffect(() => {
    const filteredData = enrichedData.filter((item) =>
      Object.entries(item).some(
        ([key, value]) =>
          key !== "avatar" &&
          key !== "existing_account_number" &&
          key !== "existing_ifsc_code" &&
          String(value).toLowerCase().includes(searchString.toLowerCase()),
      ),
    );
    setTableData(filteredData);
  }, [searchString, enrichedData]);

  const handleFinalImport = async () => {
    if (!importData?.data?.length) return;

    if (!importType && conflictingIndex?.length > 0) {
      toast({
        title: "Selection Required",
        description:
          "Please select 'Skip' for records that already exist in the database.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);

    try {
      const departmentMap = new Map(
        (departments ?? []).map((d) => [normalizeSuperFuzzy(d.name), d.id]),
      );

      const siteMap = new Map();
      const sitePrefixMap = new Map();
      for (const s of sites || []) {
        siteMap.set(normalizeSuperFuzzy(s.name), s.id);
        if (s.prefix) sitePrefixMap.set(normalizeSuperFuzzy(s.prefix), s.id);
      }

      const projectMap = new Map(
        (projects || []).map((p) => [normalizeSuperFuzzy(p.name), p.id]),
      );
      const siteToProjectMap = new Map(
        (sites || [])
          .filter((s) => s.project_id)
          .map((s) => [s.id, s.project_id]),
      );

      const validateUUID = (id: any) => {
        if (
          !id ||
          typeof id !== "string" ||
          id.trim() === "" ||
          id === "undefined" ||
          id === "null"
        )
          return undefined;
        return id;
      };

      const convertScientificToString = (val: any) => {
        if (val === null || val === undefined || isPlaceholder(val)) return "";
        const str = String(val);
        if (
          (str.includes("e") || str.includes("E")) &&
          !Number.isNaN(Number(val))
        ) {
          return Number(val).toLocaleString("fullwide", { useGrouping: false });
        }
        return str.trim();
      };

      const safeNumeric = (val: any) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
      };

      const missingSites = new Set<string>();
      const missingProjects = new Set<string>();
      const missingDepartments = new Set<string>();

      const preData = importData.data
        .filter((item: any) => {
          const hasEmployeeId =
            item.employee_code || item.uan_number || item.esic_number;
          const hasAnyData = Object.values(item).some(
            (val) =>
              val !== null &&
              val !== undefined &&
              String(val).trim() !== "" &&
              String(val).trim() !== "--",
          );
          return hasEmployeeId && hasAnyData;
        })
        .map((item: any) => {
          const departmentId = validateUUID(
            departmentMap.get(normalizeNames(item.department || "")),
          );

          const isPlaceholder = (val: any) => {
            const s = String(val || "")
              .trim()
              .toLowerCase();
            return (
              !s ||
              s === "--" ||
              s === "-" ||
              s === "." ||
              s === "n/a" ||
              s === "null" ||
              s === "undefined"
            );
          };

          let resolvedSiteId =
            validateUUID(item.site_id) || validateUUID(defaultSiteId); // Dropdown fallback
          if (!isPlaceholder(item.site)) {
            const siteFuzzy = normalizeSuperFuzzy(item.site);
            const matchedSiteId =
              validateUUID(siteMap.get(siteFuzzy)) ||
              validateUUID(sitePrefixMap.get(siteFuzzy));

            if (matchedSiteId) {
              resolvedSiteId = matchedSiteId;
            } else {
              missingSites.add(item.site);
            }
          }

          let resolvedProjectId = validateUUID(
            siteToProjectMap.get(resolvedSiteId),
          );
          if (!isPlaceholder(item.project)) {
            const projectFuzzy = normalizeSuperFuzzy(item.project);
            const matchedProjectId = validateUUID(projectMap.get(projectFuzzy));

            if (matchedProjectId) {
              resolvedProjectId = matchedProjectId;
            } else {
              missingProjects.add(item.project);
            }
          }

          let matchedDeptId = undefined;
          if (!isPlaceholder(item.department)) {
            const deptFuzzy = normalizeSuperFuzzy(item.department);
            matchedDeptId = validateUUID(departmentMap.get(deptFuzzy));

            if (!matchedDeptId) {
              missingDepartments.add(item.department);
            }
          }

          return {
            ...item,
            resolvedSiteId,
            resolvedProjectId,
            department_id: matchedDeptId || validateUUID(item.department_id),
          };
        });

      const errorMessages = [];
      if (missingSites.size > 0)
        errorMessages.push(`Sites: ${Array.from(missingSites).join(", ")}`);
      if (missingProjects.size > 0)
        errorMessages.push(
          `Projects: ${Array.from(missingProjects).join(", ")}`,
        );
      if (missingDepartments.size > 0)
        errorMessages.push(
          `Departments: ${Array.from(missingDepartments).join(", ")}`,
        );

      if (errorMessages.length > 0) {
        toast({
          title: "Import Blocked",
          description: `Missing ${errorMessages.join(" | ")} found. Please add the records highlighted in red before importing.`,
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      const excelSerialToDate = (serial: any): string | undefined => {
        const num = Number(serial);
        if (!Number.isInteger(num) || num < 1 || num > 99999) return undefined;

        const date = new Date(
          (num - 1) * 86400000 + new Date("1900-01-01").getTime(),
        );
        return date.toISOString().split("T")[0];
      };

      const safeDateConvert = (val: any): string | undefined => {
        if (!val) return undefined;
        if (val instanceof Date && !isNaN(val.getTime())) {
          return formatExcelDate(val);
        }
        const normalized = normalizeDate(val) as string | undefined;
        if (normalized) return normalized;
        return excelSerialToDate(val);
      };

      const employeesData = preData.map((entry) => ({
        employee_code: String(entry.employee_code || "").trim(),
        first_name: normalizeNames(entry.first_name),
        middle_name: normalizeNames(entry.middle_name),
        last_name: normalizeNames(entry.last_name),
        date_of_birth: safeDateConvert(entry.date_of_birth),
        gender: normalizeEnum(entry.gender),
        education: normalizeEnum(entry.education),
        marital_status: normalizeEnum(entry.marital_status),

        primary_mobile_number:
          convertScientificToString(entry.primary_mobile_number)?.substring(
            0,
            15,
          ) || (importType === "overwrite" ? undefined : "0000000000"),
        secondary_mobile_number:
          convertScientificToString(entry.secondary_mobile_number)?.substring(
            0,
            15,
          ) || undefined,
        personal_email: entry.personal_email,
        is_active:
          typeof entry.is_active === "string"
            ? entry.is_active.toLowerCase() === "true"
            : Boolean(entry.is_active),
        uan_number: entry.uan_number,
        esic_number: entry.esic_number,
        nationality: entry.nationality,
        company_id: companyId,
      }));

      const deduplicateByMatchKey = (data: any[]) => {
        const map = new Map();
        const actualKey = matchingKey || "employee_code";
        for (const item of data) {
          const key = String(item[actualKey] || "").trim();
          if (key) map.set(key, item);
        }
        return Array.from(map.values());
      };

      const {
        error: employeeError,
        status: employeeStatus,
        employees,
      } = await createEmployeeDetailsFromImportedData({
        data: deduplicateByMatchKey(
          employeesData.filter(
            (e) => !!e.employee_code || !!e.uan_number || !!e.esic_number,
          ),
        ),
        import_type: importType,
        matching_key: matchingKey,
        supabase,
      });

      if (employeeError) throw employeeError;

      const actualKey = matchingKey || "employee_code";
      const empToIdMap = Object.fromEntries(
        (employees || []).map((emp: any) => [
          String(emp[actualKey] || "").trim(),
          emp.id,
        ]),
      );

      const getPayload = (fields: string[]) => {
        const helperFields = [
          "full_name",
          "full_address",
          "guardian_full_name",
        ];
        const remapFields: Record<string, string> = {
          guardian_first_name: "first_name",
          guardian_last_name: "last_name",
          guardian_mobile_number: "mobile_number",
          guardian_date_of_birth: "date_of_birth",
          guardian_gender: "gender",
          guardian_email: "email",
        };

        const payloadData = preData
          .filter((entry) => {
            const actualKey = matchingKey || "employee_code";
            const identifier = String(entry[actualKey] || "").trim();
            const empId = validateUUID(empToIdMap[identifier]);
            if (!empId) return false;

            return fields.some(
              (f) =>
                entry[f] !== undefined &&
                entry[f] !== null &&
                String(entry[f]).trim() !== "",
            );
          })
          .map((entry) => {
            const actualKey = matchingKey || "employee_code";
            const identifier = String(entry[actualKey] || "").trim();
            const empId = validateUUID(empToIdMap[identifier]);
            const payload: any = { employee_id: empId };
            for (const field of fields) {
              if (helperFields.includes(field)) continue;

              const val = entry[field];
              if (
                val !== undefined &&
                val !== null &&
                String(val).trim() !== ""
              ) {
                const targetKey = remapFields[field] || field;

                if (
                  field.startsWith("is_") ||
                  field.startsWith("has_") ||
                  field === "address_same_as_employee"
                ) {
                  payload[targetKey] =
                    typeof val === "string"
                      ? val.toLowerCase() === "true"
                      : Boolean(val);
                } else if (
                  [
                    "driving_license_expiry",
                    "passport_expiry",
                    "start_date",
                    "end_date",
                    "date_of_birth",
                    "guardian_date_of_birth",
                  ].includes(field)
                ) {
                  if (val instanceof Date && !isNaN(val.getTime())) {
                    payload[targetKey] = formatExcelDate(val);
                  } else {
                    const cleanDate = String(val)
                      .replace(/[\s\/]/g, "-")
                      .trim();
                    payload[targetKey] = normalizeDate(cleanDate);
                  }
                } else if (
                  [
                    "uan_number",
                    "aadhaar_number",
                    "account_number",
                    "mobile_number",
                    "alternate_mobile_number",
                    "ifsc_code",
                    "pincode",
                  ].includes(field)
                ) {
                  payload[targetKey] = convertScientificToString(
                    val,
                  )?.substring(0, 30);
                } else if (["latitude", "longitude"].includes(field)) {
                  payload[targetKey] = safeNumeric(val);
                } else {
                  if (
                    targetKey === "first_name" ||
                    targetKey === "last_name" ||
                    targetKey === "middle_name"
                  ) {
                    payload[targetKey] = normalizeNames(String(val));
                  } else {
                    payload[targetKey] = val;
                  }
                }
              }
            }
            return payload;
          });
        return payloadData;
      };

      const guardiansData = getPayload([
        "guardian_full_name",
        "guardian_first_name",
        "guardian_last_name",
        "relationship",
        "guardian_mobile_number",
        "guardian_date_of_birth",
        "guardian_gender",
        "guardian_email",
        "is_emergency_contact",
        "address_same_as_employee",
      ]);
      if (guardiansData.length > 0) {
        const empIds = guardiansData.map((g) => g.employee_id).filter(Boolean);
        const { data: existingGuardians } = await supabase
          .from("employee_guardians")
          .select("id, employee_id")
          .in("employee_id", empIds);
        const existingMap = Object.fromEntries(
          (existingGuardians || []).map((g) => [g.employee_id, g.id]),
        );

        for (const item of guardiansData) {
          const existingId = existingMap[item.employee_id];
          if (existingId) {
            const { error: upError } = await supabase
              .from("employee_guardians")
              .update(item)
              .eq("id", existingId);
            if (upError) throw upError;
          } else {
            const { error: insError } = await supabase
              .from("employee_guardians")
              .insert(item);
            if (insError) throw insError;
          }
        }
      }

      const addressesData: any[] = [];

      const isYesOrTrueOrPrimary = (val: any) => {
        if (val === undefined || val === null) return false;
        const s = String(val).trim().toLowerCase();
        return s === "true" || s === "yes" || s === "y" || s === "primary";
      };

      for (const entry of preData) {
        const actualKey = matchingKey || "employee_code";
        const identifier = String(entry[actualKey] || "").trim();
        const empId = validateUUID(empToIdMap[identifier]);
        if (!empId) continue;

        const hasPresent = [
          entry.address_line_1,
          entry.address_line_2,
          entry.city,
          entry.state,
          entry.pincode,
          entry.full_address,
        ].some((f) => f !== undefined && f !== null && String(f).trim() !== "");

        const hasPermanent = [
          entry.permanent_address_line_1,
          entry.permanent_address_line_2,
          entry.permanent_city,
          entry.permanent_state,
          entry.permanent_pincode,
          entry.permanent_full_address,
        ].some((f) => f !== undefined && f !== null && String(f).trim() !== "");

        if (!hasPresent && !hasPermanent) continue;

        let presentIsPrimary = isYesOrTrueOrPrimary(entry.is_primary);
        let permanentIsPrimary = isYesOrTrueOrPrimary(
          entry.permanent_is_primary,
        );

        if (presentIsPrimary && permanentIsPrimary) {
          presentIsPrimary = true;
          permanentIsPrimary = false;
        } else if (!presentIsPrimary && !permanentIsPrimary) {
          permanentIsPrimary = true;
          presentIsPrimary = false;
        }

        if (hasPresent && !hasPermanent) {
          presentIsPrimary = true;
        }

        if (!hasPresent && hasPermanent) {
          permanentIsPrimary = true;
        }

        if (hasPresent) {
          const presentAddr: any = {
            employee_id: empId,
            address_type: entry.address_type || "Present",
            is_primary: presentIsPrimary,
            address_line_1: entry.address_line_1 || entry.full_address,
            address_line_2: entry.address_line_2 || null,
            city: entry.city || null,
            state: entry.state || null,
            pincode:
              convertScientificToString(entry.pincode)?.substring(0, 30) ||
              null,
            country: entry.country || "India",
            latitude: entry.latitude ? safeNumeric(entry.latitude) : null,
            longitude: entry.longitude ? safeNumeric(entry.longitude) : null,
          };
          addressesData.push(presentAddr);
        }

        if (hasPermanent) {
          const permanentAddr: any = {
            employee_id: empId,
            address_type: entry.permanent_address_type || "Permanent",
            is_primary: permanentIsPrimary,
            address_line_1:
              entry.permanent_address_line_1 || entry.permanent_full_address,
            address_line_2: entry.permanent_address_line_2 || null,
            city: entry.permanent_city || null,
            state: entry.permanent_state || null,
            pincode:
              convertScientificToString(entry.permanent_pincode)?.substring(
                0,
                30,
              ) || null,
            country: entry.permanent_country || "India",
            latitude: null,
            longitude: null,
          };
          addressesData.push(permanentAddr);
        }
      }

      if (addressesData.length > 0) {
        const { error: addressError } =
          await createEmployeeAddressFromImportedData({
            data: addressesData,
            import_type: importType,
            supabase,
          });
        if (addressError) throw addressError;
      }

      const workDetailsData = preData
        .filter((entry) => {
          const actualKey = matchingKey || "employee_code";
          const identifier = String(entry[actualKey] || "").trim();
          return validateUUID(empToIdMap[identifier]);
        })
        .map((entry) => {
          const actualKey = matchingKey || "employee_code";
          const identifier = String(entry[actualKey] || "").trim();
          return {
            employee_id: validateUUID(empToIdMap[identifier]),
            site_id: validateUUID(entry.resolvedSiteId),
            position: entry.position,
            start_date: safeDateConvert(entry.start_date),
            end_date: safeDateConvert(entry.end_date),
            assignment_type: entry.assignment_type,
            skill_level: entry.skill_level,
            project_id: validateUUID(entry.resolvedProjectId),
            department_id: validateUUID(entry.department_id),
            first_name: entry.first_name,
            middle_name: entry.middle_name,
            last_name: entry.last_name,
          };
        });

      if (workDetailsData.length > 0) {
        const { error: wdError } =
          await createEmployeeWorkDetailsFromImportedData({
            data: workDetailsData,
            import_type: importType,
            supabase,
          });
        if (wdError) throw wdError;
      }

      const statutoryData = getPayload([
        "uan_number",
        "aadhaar_number",
        "pan_number",
        "has_uan",
        "has_esic",
        "esic_number",
        "has_lwf",
        "lwf_number",
        "has_ptax",
        "ptax_number",
        "pf_number",
        "passport_number",
        "passport_expiry",
        "driving_license_number",
        "driving_license_expiry",
        "esic_site_name",
      ]);
      if (statutoryData.length > 0) {
        const resolvedStatutoryData = statutoryData.map((item: any) => {
          const { esic_site_name, ...rest } = item;
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
            ...(esic_id ? { esic_id, is_esic_applicable } : {}),
          };
        });

        const deduplicatedStatutory = Array.from(
          new Map(
            resolvedStatutoryData.map((d) => [d.employee_id, d]),
          ).values(),
        );
        const { error: statError } =
          await createEmployeeStatutoryFromImportedData({
            data: deduplicatedStatutory,
            import_type: importType,
            matching_key: matchingKey,
            supabase,
          });
        if (statError) throw statError;
      }

      const bankData = getPayload([
        "bank_name",
        "account_number",
        "ifsc_code",
        "account_holder_name",
        "branch_name",
      ]);
      if (bankData.length > 0) {
        const deduplicatedBank = Array.from(
          new Map(bankData.map((d) => [d.employee_id, d])).values(),
        );
        const { error: bankError } =
          await createEmployeeBankDetailsFromImportedData({
            data: deduplicatedBank,
            import_type: importType,
            supabase,
          });
        if (bankError) throw bankError;
      }

      setIsImporting(false);

      if (isGoodStatus(employeeStatus)) {
        toast({
          title: "Success",
          description: "All employee details imported successfully",
          variant: "success",
        });

        clearCacheEntry(cacheKeyPrefix.employee_overview);
        clearCacheEntry(cacheKeyPrefix.employee_work_portfolio);
        clearCacheEntry(cacheKeyPrefix.employees);
        navigate("/employees");
      }
    } catch (e: any) {
      setIsImporting(false);
      toast({
        title: "Error",
        description:
          e.message || JSON.stringify(e) || "Failed to import details",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="px-4 relative">
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background/80",
          isImporting || isLoadingData ? "block" : "hidden",
        )}
      >
        <LoadingSpinner className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0" />
      </div>
      <div className="w-full flex items-center justify-between pb-4">
        <div className="w-full  flex justify-between items-center">
          <div className="relative w-[30rem] ">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Icon
                name="magnifying-glass"
                size="sm"
                className="text-gray-400"
              />
            </div>
            <Input
              placeholder="Search Employees"
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              className="pl-8 h-10 w-full focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-3">
            {initialImportType !== "overwrite" && (
              <Combobox
                className={cn(
                  "w-52 h-10",
                  conflictingIndex?.length > 0 ? "flex" : "hidden",
                )}
                options={[
                  { label: "Skip", value: "skip" },
                  { label: "Overwrite", value: "overwrite" },
                ]}
                value={importType}
                onChange={(value: string) => {
                  setImportType(value);
                }}
                placeholder={"Select Import Type"}
              />
            )}
            <Button variant={"default"} onClick={handleFinalImport}>
              Import
            </Button>
          </div>
        </div>
      </div>
      <input type="hidden" name="import_type" value={importType} />
      <input
        name="stringified_data"
        type="hidden"
        value={JSON.stringify(importData)}
      />
      <ImportedDataTable
        data={tableData}
        columns={visibleColumns}
        conflictingIndex={conflictingIndex}
      />
    </section>
  );
}
