import fs from "node:fs";
import {
  json,
  useLoaderData,
  useLocation,
  useNavigate,
  useFetcher,
  useSearchParams,
} from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { getCompanySalaryFields } from "@canny_ecosystem/supabase/queries/salary-import";
import { useRequestInfo } from "@/utils/request-info";
import * as XLSX from "xlsx";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Label } from "@canny_ecosystem/ui/label";
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  suggestSalaryImportConfig,
  classifyHeadersWithAI,
} from "@/utils/ai/salary-import";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const filePathParam = url.searchParams.get("filePath");

  let serverParsedData = null;
  if (filePathParam) {
    try {
      if (fs.existsSync(filePathParam)) {
        const buffer = fs.readFileSync(filePathParam);
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const names = workbook.SheetNames;
        const sheets: Record<string, any[][]> = {};

        for (const name of names) {
          const worksheet = workbook.Sheets[name];
          const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
          const jsonData: any[][] = [];
          for (let r = range.s.r; r <= range.e.r; ++r) {
            const row: any[] = [];
            for (let c = range.s.c; c <= range.e.c; ++c) {
              const cellRef = XLSX.utils.encode_cell({ r, c });
              const cell = worksheet[cellRef];
              if (cell && cell.f) {
                row.push({ f: `=${cell.f}`, v: cell.v ?? "", w: cell.w ?? "" });
              } else {
                row.push(cell ? cell.v ?? "" : "");
              }
            }
            jsonData.push(row);
          }
          sheets[name] = jsonData;
        }

        const firstSheetName = names[0];
        const initialData = sheets[firstSheetName];

        serverParsedData = {
          sheetNames: names,
          selectedSheet: firstSheetName,
          allSheetsData: sheets,
          rawData: initialData,
          endRow: initialData.length,
          filePath: filePathParam,
        };
      }
    } catch (e) {
      console.error("Error reading file on server loader:", e);
    }
  }

  return json({
    serverParsedData,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "suggest-salary-config") {
    const sampleRows = JSON.parse(formData.get("sampleRows") as string);
    const totalRows = Number(formData.get("totalRows"));
    const paymentFields = formData.get("paymentFields")
      ? JSON.parse(formData.get("paymentFields") as string)
      : [];

    const configResult = await suggestSalaryImportConfig({
      sampleRows,
      totalRows,
    });

    const headerRowIdx = Math.max(0, (configResult.headerRow || 1) - 1);
    const rawHeaderRow = sampleRows[headerRowIdx] || sampleRows[0] || [];
    const headerStrings: string[] = rawHeaderRow.map((cell: any) => {
      if (cell && typeof cell === "object" && "v" in cell)
        return String(cell.v || "");
      return String(cell || "");
    });

    let empCodeColIdx = configResult.empCodeColIdx;
    let netPayableColIdx = configResult.netPayableColIdx;
    let presentDaysColIdx = configResult.presentDaysColIdx;
    let basicColIdx: number | null = null;
    let basicColIdx2: number | null = null;
    let overtimeColIdx: number | null = null;
    let pfColIdx: number | null = null;
    let esiColIdx: number | null = null;
    let ptColIdx: number | null = null;
    let bonusColIdx: number | null = null;
    let lwfColIdx: number | null = null;

    const matchedComponents: Array<{ dbId: string; colIdx: number }> = [];

    try {
      const classificationMap = await classifyHeadersWithAI(
        headerStrings,
        paymentFields,
      );

      headerStrings.forEach((hdr, colIdx) => {
        const trimmed = hdr.trim();
        if (!trimmed) return;
        const cls = classificationMap.get(trimmed);
        if (!cls) return;

        if (cls.category === "employee_code" && empCodeColIdx === null) {
          empCodeColIdx = colIdx;
        } else if (
          cls.category === "present_days" &&
          presentDaysColIdx === null
        ) {
          presentDaysColIdx = colIdx;
        } else if (
          cls.category === "overtime_hours" &&
          overtimeColIdx === null
        ) {
          overtimeColIdx = colIdx;
        } else if (cls.category === "earning") {
          const sysKey = cls.systemKey.toUpperCase();
          if (sysKey === "BASIC" || trimmed.toUpperCase().includes("BASIC")) {
            if (basicColIdx === null) {
              basicColIdx = colIdx;
            } else if (basicColIdx2 === null) {
              basicColIdx2 = colIdx;
            }
          } else {
            const match = paymentFields.find((f: any) => {
              const fName = (f.name || f.display_name || "").toUpperCase();
              return (
                fName === sysKey ||
                sysKey.includes(fName) ||
                fName.includes(sysKey) ||
                trimmed.toUpperCase().includes(fName)
              );
            });
            if (match) {
              matchedComponents.push({ dbId: match.id, colIdx });
            }
          }
        } else if (cls.category === "deduction") {
          const sysKey = cls.systemKey.toUpperCase();
          const upperHdr = trimmed.toUpperCase();
          if (
            (sysKey.includes("PF") ||
              upperHdr.includes("PF") ||
              upperHdr.includes("EPF")) &&
            pfColIdx === null
          ) {
            pfColIdx = colIdx;
          } else if (
            (sysKey.includes("ESI") ||
              upperHdr.includes("ESI") ||
              upperHdr.includes("ESIC")) &&
            esiColIdx === null
          ) {
            esiColIdx = colIdx;
          } else if (
            (sysKey.includes("PT") ||
              upperHdr.includes("PT") ||
              upperHdr.includes("PROFESSIONAL TAX")) &&
            ptColIdx === null
          ) {
            ptColIdx = colIdx;
          } else if (
            (sysKey.includes("BONUS") || upperHdr.includes("BONUS")) &&
            bonusColIdx === null
          ) {
            bonusColIdx = colIdx;
          } else if (
            (sysKey.includes("LWF") || upperHdr.includes("LWF")) &&
            lwfColIdx === null
          ) {
            lwfColIdx = colIdx;
          } else {
            const match = paymentFields.find((f: any) => {
              const fName = (f.name || f.display_name || "").toUpperCase();
              return (
                fName === sysKey ||
                sysKey.includes(fName) ||
                fName.includes(sysKey) ||
                upperHdr.includes(fName)
              );
            });
            if (match) {
              matchedComponents.push({ dbId: match.id, colIdx });
            }
          }
        }
      });
    } catch (e) {
      console.error("Error classifying headers with AI:", e);
    }

    return json({
      ...configResult,
      empCodeColIdx,
      netPayableColIdx,
      presentDaysColIdx,
      basicColIdx,
      basicColIdx2,
      overtimeColIdx,
      pfColIdx,
      esiColIdx,
      ptColIdx,
      bonusColIdx,
      lwfColIdx,
      matchedComponents,
    });
  }

  return json({});
}

const getCellValue = (cell: any) => {
  if (cell && typeof cell === "object" && "v" in cell) return cell.v;
  return cell;
};

export default function ImportSalariesMappingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const file = location.state?.file as File | undefined;

  const { env, serverParsedData } = useLoaderData<typeof loader>();
  const { supabase } = useSupabase({ env });
  const requestInfo = useRequestInfo();
  const companyId = requestInfo?.userPrefs?.companyId;

  const getPersistedState = () => {
    if (typeof window === "undefined") return null;
    if (location.state?.file) return null;
    const saved = sessionStorage.getItem("salary_import_state");
    return saved ? JSON.parse(saved) : null;
  };

  const savedState = getPersistedState();

  const [rawData, setRawData] = useState<any[][]>(
    serverParsedData?.rawData || savedState?.rawData || location.state?.rawData || [],
  );
  const [sheetNames, setSheetNames] = useState<string[]>(
    serverParsedData?.sheetNames || savedState?.sheetNames || location.state?.sheetNames || [],
  );
  const [selectedSheet, setSelectedSheet] = useState<string>(
    serverParsedData?.selectedSheet || savedState?.selectedSheet || location.state?.selectedSheet || "",
  );
  const [allSheetsData, setAllSheetsData] = useState<Record<string, any[][]>>(
    serverParsedData?.allSheetsData || savedState?.allSheetsData || location.state?.allSheetsData || {},
  );

  const [headerRow, setHeaderRow] = useState<number>(
    savedState?.headerRow || location.state?.headerRow || 1,
  );
  const [startRow, setStartRow] = useState<number>(
    savedState?.startRow || location.state?.startRow || 2,
  );
  const [endRow, setEndRow] = useState<number>(
    serverParsedData?.endRow || savedState?.endRow || location.state?.endRow || rawData?.length || 0,
  );
  const [previewRows, setPreviewRows] = useState<number>(
    savedState?.previewRows || location.state?.previewRows || 40,
  );
  const [empCodeColIdx, setEmpCodeColIdx] = useState<number | null>(
    savedState?.empCodeColIdx ?? location.state?.empCodeColIdx ?? null,
  );
  const [workingDays, setWorkingDays] = useState<number>(
    savedState?.workingDays || location.state?.workingDays || 26,
  );
  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const [effectiveDate, setEffectiveDate] = useState<string>(
    savedState?.effectiveDate ||
      location.state?.effectiveDate ||
      getTodayDateString(),
  );
  const [loading, setLoading] = useState(!rawData.length && !!file);

  const [availableFields, setAvailableFields] = useState<any>(null);
  const fetcher = useFetcher<any>();
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [hasTriggeredAI, setHasTriggeredAI] = useState(false);

  useEffect(() => {
    if (
      rawData.length > 0 &&
      empCodeColIdx === null &&
      !hasTriggeredAI &&
      !loading
    ) {
      setHasTriggeredAI(true);
      setIsProcessingAI(true);
      const sampleRows = rawData.slice(0, 15);
      fetcher.submit(
        {
          intent: "suggest-salary-config",
          sampleRows: JSON.stringify(sampleRows),
          totalRows: String(rawData.length),
          paymentFields: JSON.stringify(
            availableFields?.paymentFields?.map((f: any) => ({
              id: f.id,
              name: f.name || f.display_name,
            })) || [],
          ),
        },
        { method: "post" },
      );
    }
  }, [rawData, empCodeColIdx, hasTriggeredAI, loading, availableFields]);

  useEffect(() => {
    if (fetcher.data && fetcher.data.headerRow !== undefined) {
      const data = fetcher.data;
      if (data.headerRow) setHeaderRow(data.headerRow);
      if (data.startRow) setStartRow(data.startRow);
      if (data.endRow) setEndRow(data.endRow);
      if (data.empCodeColIdx !== null && data.empCodeColIdx !== undefined)
        setEmpCodeColIdx(data.empCodeColIdx);

      setMappings((prev: any) => {
        const next = { ...prev };
        if (
          data.netPayableColIdx !== null &&
          data.netPayableColIdx !== undefined
        ) {
          next.netPayableColIdx = data.netPayableColIdx;
        }
        if (
          data.presentDaysColIdx !== null &&
          data.presentDaysColIdx !== undefined
        ) {
          next.presentDaysColIdx = data.presentDaysColIdx;
        }
        if (data.basicColIdx !== null && data.basicColIdx !== undefined) {
          next.basic = {
            ...next.basic,
            colIdx: data.basicColIdx,
            colIdx2: data.basicColIdx2 ?? next.basic?.colIdx2 ?? null,
          };
        }
        if (data.overtimeColIdx !== null && data.overtimeColIdx !== undefined) {
          next.overtimeColIdx = data.overtimeColIdx;
        }

        // Statutory
        next.statutory = {
          ...next.statutory,
          pf:
            data.pfColIdx !== null && data.pfColIdx !== undefined
              ? { ...next.statutory?.pf, colIdx: data.pfColIdx }
              : next.statutory?.pf,
          esi:
            data.esiColIdx !== null && data.esiColIdx !== undefined
              ? { ...next.statutory?.esi, colIdx: data.esiColIdx }
              : next.statutory?.esi,
          pt:
            data.ptColIdx !== null && data.ptColIdx !== undefined
              ? { ...next.statutory?.pt, colIdx: data.ptColIdx }
              : next.statutory?.pt,
          bonus:
            data.bonusColIdx !== null && data.bonusColIdx !== undefined
              ? { ...next.statutory?.bonus, colIdx: data.bonusColIdx }
              : next.statutory?.bonus,
          lwf:
            data.lwfColIdx !== null && data.lwfColIdx !== undefined
              ? { ...next.statutory?.lwf, colIdx: data.lwfColIdx }
              : next.statutory?.lwf,
        };

        // Matched Components
        if (
          Array.isArray(data.matchedComponents) &&
          data.matchedComponents.length > 0
        ) {
          const newComps = data.matchedComponents.map((c: any) => ({
            id: crypto.randomUUID(),
            dbId: c.dbId,
            colIdx: c.colIdx,
            isMonthly: false,
          }));
          next.components = newComps;
        }

        return next;
      });

      setIsProcessingAI(false);
    } else if (fetcher.state === "idle" && isProcessingAI) {
      setIsProcessingAI(false);
    }
  }, [fetcher.data, fetcher.state]);

  const defaultMappings = {
    basic: { colIdx: null, colIdx2: null, isMonthly: false },
    overtimeColIdx: null,
    statutory: {
      pf: { colIdx: null, dbId: null },
      esi: { colIdx: null, dbId: null },
      bonus: { colIdx: null, dbId: null },
      lwf: { colIdx: null, dbId: null },
      pt: { colIdx: null, dbId: null },
    },
    locationColIdx: null,
    locationColIdxESIC: null,
    locationPTMapping: {} as Record<string, string>,
    locationESICMapping: {} as Record<string, string>,
    netPayableColIdx: null,
    presentDaysColIdx: null,
    components: [],
  };

  const getInitialMappings = () => {
    const saved = savedState?.mappings || location.state?.mappings;
    if (saved) {
      return {
        ...defaultMappings,
        ...saved,
        statutory: {
          ...defaultMappings.statutory,
          ...saved.statutory,
        },
      };
    }
    return defaultMappings;
  };

  const [mappings, setMappings] = useState<any>(getInitialMappings());
  const [loadingFields, setLoadingFields] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!mappings.locationESICMapping) {
      setMappings((prev: any) => ({ ...prev, locationESICMapping: {} }));
    }
  }, [mappings.locationPTMapping, mappings.locationESICMapping]);

  useEffect(() => {
    if (location.state?.file) {
      sessionStorage.removeItem("salary_import_state");
    }
  }, []);
  useEffect(() => {
    if (rawData.length > 0 || file) {
      setIsReady(true);
    }
  }, [rawData.length, file]);

  useEffect(() => {
    if (isReady && rawData.length === 0 && !file && !loading && !searchParams.get("filePath")) {
      const isInc =
        location.state?.isIncrement ||
        searchParams.get("isIncrement") === "true" ||
        savedState?.isIncrement;
      navigate(isInc ? "/payment-components/salaries" : "/employees");
    }
  }, [isReady, rawData.length, file, loading, navigate, location.state, searchParams, savedState]);

  useEffect(() => {
    if (rawData.length > 0) return;

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const names = workbook.SheetNames;
        const sheets: Record<string, any[][]> = {};

        for (const name of names) {
          const worksheet = workbook.Sheets[name];
          const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
          const jsonData: any[][] = [];
          for (let r = range.s.r; r <= range.e.r; ++r) {
            const row: any[] = [];
            for (let c = range.s.c; c <= range.e.c; ++c) {
              const cellRef = XLSX.utils.encode_cell({ r, c });
              const cell = worksheet[cellRef];
              if (cell && cell.f) {
                row.push({ f: `=${cell.f}`, v: cell.v ?? "", w: cell.w ?? "" });
              } else {
                row.push(cell ? cell.v ?? "" : "");
              }
            }
            jsonData.push(row);
          }
          sheets[name] = jsonData;
        }

        const firstSheetName = names[0];
        const initialData = sheets[firstSheetName];

        setSheetNames(names);
        setSelectedSheet(firstSheetName);
        setAllSheetsData(sheets);
        setRawData(initialData);
        setEndRow(initialData.length);
        setLoading(false);

        navigate(location.pathname, {
          replace: true,
          state: {
            isIncrement: location.state?.isIncrement,
            rawData: initialData,
            sheetNames: names,
            selectedSheet: firstSheetName,
            allSheetsData: sheets,
            headerRow: 1,
            startRow: 2,
            endRow: initialData.length,
          },
        });
      } catch (error) {
        console.error("Error parsing Excel:", error);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file, navigate, location.pathname, rawData.length]);

  useEffect(() => {
    if (companyId && !availableFields) {
      setLoadingFields(true);
      getCompanySalaryFields({ supabase, companyId })
        .then((fields) => {
          setAvailableFields(fields);
        })
        .finally(() => setLoadingFields(false));
    }
  }, [companyId, availableFields, supabase]);

  useEffect(() => {
    if (empCodeColIdx !== null) {
    }
  }, [empCodeColIdx]);

  useEffect(() => {
    if (rawData.length > 0) {
      const stateToSave = {
        isIncrement: location.state?.isIncrement || savedState?.isIncrement,
        rawData,
        sheetNames,
        selectedSheet,
        allSheetsData,
        headerRow,
        startRow,
        endRow,
        empCodeColIdx,
        previewRows,
        workingDays,
        effectiveDate,
        mappings,
      };
      sessionStorage.setItem(
        "salary_import_state",
        JSON.stringify(stateToSave),
      );

      navigate(location.pathname, {
        replace: true,
        state: { ...location.state, ...stateToSave, file: undefined },
      });
    }
  }, [
    rawData,
    sheetNames,
    selectedSheet,
    allSheetsData,
    headerRow,
    startRow,
    endRow,
    empCodeColIdx,
    previewRows,
    workingDays,
    mappings,
    navigate,
    location.pathname,
  ]);

  const headers = useMemo(() => {
    if (rawData.length >= headerRow && headerRow > 0) {
      return rawData[headerRow - 1].map((h, i) => ({
        label: String(getCellValue(h) || `Column ${i + 1}`),
        index: i,
      }));
    }
    return [];
  }, [rawData, headerRow]);

  const extractedCodes = useMemo(() => {
    if (empCodeColIdx === null || rawData.length === 0) return [];

    const codes: string[] = [];
    const actualStart = Math.max(0, startRow - 1);
    const actualEnd = Math.min(rawData.length, endRow);

    for (let i = actualStart; i < actualEnd; i++) {
      const code = getCellValue(rawData[i][empCodeColIdx]);
      if (code !== undefined && code !== null && String(code).trim() !== "") {
        codes.push(String(code));
      }
    }
    return codes;
  }, [rawData, startRow, endRow, empCodeColIdx]);

  const extractedData = useMemo(() => {
    if (empCodeColIdx === null || rawData.length === 0) return null;

    const rows: any[][] = [];
    const actualStart = Math.max(0, startRow - 1);
    const actualEnd = Math.min(rawData.length, endRow);

    for (let i = actualStart; i < actualEnd; i++) {
      const code = getCellValue(rawData[i][empCodeColIdx]);
      if (code !== undefined && code !== null && String(code).trim() !== "") {
        rows.push(rawData[i]);
      }
    }

    return {
      rows,
      headerRow: headerRow > 0 ? rawData[headerRow - 1] : [],
      empCodeColIdx,
    };
  }, [rawData, startRow, endRow, empCodeColIdx, headerRow]);

  const uniqueLocations = useMemo(() => {
    if (mappings.locationColIdx === null || rawData.length === 0) return [];
    const actualStart = Math.max(0, startRow - 1);
    const actualEnd = Math.min(rawData.length, endRow);
    const locations = new Set<string>();
    for (let i = actualStart; i < actualEnd; i++) {
      const val = getCellValue(rawData[i][mappings.locationColIdx]);
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        locations.add(String(val).trim());
      }
    }
    return Array.from(locations).sort();
  }, [rawData, startRow, endRow, mappings.locationColIdx]);

  const uniqueLocationsESIC = useMemo(() => {
    if (mappings.locationColIdxESIC === null || !rawData.length) return [];
    const locations = new Set<string>();
    for (let i = startRow - 1; i < endRow; i++) {
      const row = rawData[i];
      if (row?.[mappings.locationColIdxESIC]) {
        locations.add(
          String(getCellValue(row[mappings.locationColIdxESIC])).trim(),
        );
      }
    }
    return Array.from(locations).sort();
  }, [rawData, startRow, endRow, mappings.locationColIdxESIC]);

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const data = allSheetsData[sheetName] || [];
    setRawData(data);
    setEndRow(data.length);

    setMappings(defaultMappings);
    setEmpCodeColIdx(null);
    setHeaderRow(1);
    setStartRow(2);
    setHasTriggeredAI(false);
  };

  return (
    <div className="p-0 sm:p-1 space-y-2 w-full h-[calc(100vh-64px)] flex flex-col bg-muted/5 overflow-hidden">
      <div className="flex-none flex items-center justify-between px-4 pt-2 pb-1">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold tracking-tight text-primary">
            {location.state?.isIncrement || searchParams.get("isIncrement") === "true" || savedState?.isIncrement
              ? "Update Increment Salary — Mapping"
              : "Import Salaries — Mapping"}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Configure how your Excel data maps to employee salaries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50"
            disabled={loading || isProcessingAI || rawData.length === 0}
            onClick={() => {
              setIsProcessingAI(true);
              const sampleRows = rawData.slice(0, 15);
              fetcher.submit(
                {
                  intent: "suggest-salary-config",
                  sampleRows: JSON.stringify(sampleRows),
                  totalRows: String(rawData.length),
                },
                { method: "post" },
              );
            }}
          >
            <span>✨</span> Auto Fill
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const isInc =
                location.state?.isIncrement ||
                searchParams.get("isIncrement") === "true" ||
                savedState?.isIncrement;
              navigate(isInc ? "/payment-components/salaries" : "/employees");
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs px-6 font-semibold gap-1"
            disabled={
              empCodeColIdx === null ||
              mappings.netPayableColIdx === null ||
              loading ||
              extractedCodes.length === 0
            }
            onClick={() => {
              const isInc =
                location.state?.isIncrement ||
                searchParams.get("isIncrement") === "true" ||
                savedState?.isIncrement;
              const targetPath = isInc
                ? "/payment-components/salaries/import-salaries/salary-preview?isIncrement=true"
                : "/employees/import-salaries/salary-preview";

              navigate(targetPath, {
                state: {
                  employeeCodes: extractedCodes,
                  isIncrement: isInc,
                  effectiveDate,
                  workingDays,
                  payableDays: workingDays,
                  importData: {
                    ...extractedData,
                    effectiveDate,
                    mappings: {
                      ...mappings,
                      workingDays,
                    },
                  },
                },
              });
            }}
          >
            Next
            <span className="text-[10px] opacity-70">
              ({extractedCodes.length} codes)
            </span>
          </Button>
        </div>
      </div>

      {isProcessingAI && (
        <div className="mx-4 mb-1 p-3 bg-primary/5 border border-primary/25 border-dashed rounded-lg flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5">
            <span className="animate-spin text-base">✨</span>
            <div>
              <p className="text-xs font-semibold text-primary">
                Gemini AI is analyzing your spreadsheet...
              </p>
              <p className="text-[10px] text-muted-foreground">
                Auto-detecting Header Row, Range, Employee Code, Net Payable,
                and Present Days columns.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-none px-4 pb-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Select Sheet
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <Combobox
                value={selectedSheet}
                onChange={(val) => handleSheetChange(val)}
                disabled={loading || sheetNames.length <= 1}
                placeholder="Choose sheet..."
                className="h-8 text-xs w-full justify-between"
                options={sheetNames.map((name) => ({
                  value: name,
                  label: name,
                }))}
              />
            </CardContent>
          </Card>
          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Header Row
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                  R:
                </span>
                <Input
                  type="number"
                  min={1}
                  max={rawData.length}
                  value={headerRow}
                  onChange={(e) => setHeaderRow(Number(e.target.value))}
                  disabled={loading}
                  className="h-8 text-xs pl-6"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Import Range
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                    S:
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={rawData.length}
                    value={startRow}
                    onChange={(e) => setStartRow(Number(e.target.value))}
                    disabled={loading}
                    className="h-8 text-xs pl-6"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                    E:
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={rawData.length}
                    value={endRow}
                    onChange={(e) => setEndRow(Number(e.target.value))}
                    disabled={loading}
                    className="h-8 text-xs pl-6"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Employee Code Col
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <Combobox
                value={empCodeColIdx !== null ? String(empCodeColIdx) : ""}
                onChange={(val) =>
                  setEmpCodeColIdx(val === "" ? null : Number(val))
                }
                disabled={loading}
                placeholder={loading ? "Loading..." : "Choose column..."}
                className="h-8 text-xs w-full justify-between"
                options={headers.map((h) => ({
                  value: String(h.index),
                  label: h.label,
                }))}
              />
            </CardContent>
          </Card>

          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Base Working Days
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                  D:
                </span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={workingDays}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setWorkingDays(Number.isNaN(val) || val <= 0 ? 26 : val);
                  }}
                  disabled={loading}
                  className="h-8 text-xs pl-6"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Effective Date
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                disabled={loading}
                className="h-8 text-xs px-2 bg-background border-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </CardContent>
          </Card>

          <Card className="shadow-none border-muted/60 bg-background">
            <CardHeader className="p-2 px-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Extracted Codes
              </CardTitle>
              <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {extractedCodes.length}
              </span>
            </CardHeader>
            <CardContent className="p-2 px-3 pt-0">
              <div className="h-8 flex items-center gap-2 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-primary/10">
                {loading ? (
                  <Icon
                    name="update"
                    className="animate-spin h-3 w-3 text-muted-foreground"
                  />
                ) : empCodeColIdx !== null ? (
                  extractedCodes.length > 0 ? (
                    extractedCodes.slice(0, 10).map((code, i) => (
                      <span
                        key={`${code}-${i}`}
                        className="whitespace-nowrap px-1.5 py-0.5 bg-muted/50 rounded text-[9px] font-mono border border-muted-foreground/10"
                      >
                        {code}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">
                      No data
                    </span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground italic">
                    Select column
                  </span>
                )}
                {extractedCodes.length > 10 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{extractedCodes.length - 10}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col shadow-none border-x-0 sm:border-x rounded-none sm:rounded-sm border-t border-muted/60 bg-background overflow-hidden">
        <CardHeader className="flex-none flex flex-row items-center justify-between py-2 px-4 border-b">
          <div className="flex items-center gap-6">
            <CardTitle className="text-sm font-semibold">
              Excel Preview
            </CardTitle>
          </div>
        </CardHeader>

        {rawData.length > 0 && headerRow > 0 && (
          <div className="flex-1 min-h-0 flex flex-col border-b bg-muted/20">
            <div className="px-4 py-2 flex items-center justify-between border-b bg-background/50">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-primary/10 rounded">
                  <Icon name="table" className="h-3 w-3 text-primary" />
                </div>
                <h2 className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  Excel Column Mapping
                </h2>
              </div>
              {loadingFields && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground italic">
                  <Icon name="update" className="animate-spin h-3 w-3" />
                  Loading fields...
                </div>
              )}
            </div>

            <div className="p-6 pb-12 space-y-8 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/10">
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Icon name="magic" className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Salary Assignment
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-primary/10 rounded text-primary">
                        <Icon name="info" className="h-3 w-3" />
                      </div>
                      <label className="text-[10px] font-bold text-primary uppercase tracking-wider">
                        Validation: Net Payable Column (Required)
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Combobox
                          value={
                            mappings.netPayableColIdx !== null
                              ? String(mappings.netPayableColIdx)
                              : ""
                          }
                          onChange={(val) =>
                            setMappings((m: any) => ({
                              ...m,
                              netPayableColIdx: val === "" ? null : Number(val),
                            }))
                          }
                          placeholder="Pick Net Payable column"
                          className="h-9 text-xs w-full justify-between bg-background border-primary/30 hover:border-primary/60 transition-colors shadow-none focus:ring-1 focus:ring-primary"
                          options={headers.map((h) => ({
                            value: String(h.index),
                            label: h.label,
                          }))}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      This column will be used to verify the calculated net
                      payable in the next step.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-primary/10 rounded text-primary">
                        <Icon name="calendar" className="h-3 w-3" />
                      </div>
                      <label className="text-[10px] font-bold text-primary uppercase tracking-wider">
                        Attendance: Present Days Column (Optional)
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Combobox
                          value={
                            mappings.presentDaysColIdx !== null
                              ? String(mappings.presentDaysColIdx)
                              : "SKIP"
                          }
                          onChange={(val) =>
                            setMappings((m: any) => ({
                              ...m,
                              presentDaysColIdx:
                                val === "SKIP" || val === ""
                                  ? null
                                  : Number(val),
                            }))
                          }
                          placeholder="Pick Present Days column"
                          className="h-9 text-xs w-full justify-between bg-background border-primary/30 hover:border-primary/60 transition-colors shadow-none focus:ring-1 focus:ring-primary"
                          options={[
                            { value: "SKIP", label: "Ignore (Use Global)" },
                            ...headers.map((h) => ({
                              value: String(h.index),
                              label: h.label,
                            })),
                          ]}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      If selected, a separate calculation will be shown using
                      these days for comparison.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <div className="space-y-4 p-4 rounded-lg border bg-muted/20 border-muted/60">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Location Column (For Professional Tax)
                      </label>
                      <Combobox
                        value={
                          mappings.locationColIdx !== null
                            ? String(mappings.locationColIdx)
                            : "SKIP"
                        }
                        onChange={(val) =>
                          setMappings((m: any) => ({
                            ...m,
                            locationColIdx:
                              val === "SKIP" || val === "" ? null : Number(val),
                            statutory: {
                              ...m.statutory,
                              pt: { colIdx: null, dbId: null },
                            },
                          }))
                        }
                        placeholder="Pick Location column"
                        className="h-9 text-xs w-full justify-between bg-background border-muted-foreground/20 hover:border-primary/50 transition-colors shadow-none"
                        options={[
                          { value: "SKIP", label: "Ignore" },
                          ...headers.map((h) => ({
                            value: String(h.index),
                            label: h.label,
                          })),
                        ]}
                      />
                    </div>

                    {uniqueLocations.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-primary uppercase tracking-wider">
                            PT Mapping per Location
                          </label>
                          <span className="text-[9px] text-muted-foreground italic">
                            {uniqueLocations.length} unique locations
                          </span>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-auto pr-2 scrollbar-thin">
                          {uniqueLocations.map((loc) => (
                            <div
                              key={loc}
                              className="flex items-center gap-3 p-2 rounded bg-background border border-muted-foreground/10"
                            >
                              <span className="flex-1 text-[11px] font-medium truncate">
                                {loc}
                              </span>
                              <Combobox
                                value={
                                  mappings?.locationPTMapping?.[loc] || "SKIP"
                                }
                                onChange={(val) =>
                                  setMappings((m: any) => ({
                                    ...m,
                                    locationPTMapping: {
                                      ...(m?.locationPTMapping || {}),
                                      [loc]:
                                        val === "SKIP" || val === ""
                                          ? null
                                          : val,
                                    },
                                  }))
                                }
                                placeholder="PT Config"
                                className="h-7 text-[10px] w-40 bg-muted/30 border-none shadow-none focus:ring-1 justify-between"
                                options={[
                                  { value: "SKIP", label: "None" },
                                  ...(availableFields?.ptConfigs?.map(
                                    (c: any) => ({
                                      value: c.id,
                                      label: c.state,
                                    }),
                                  ) || []),
                                ]}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 p-4 rounded-lg border bg-muted/20 border-muted/60">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Location Column (For ESIC)
                      </label>
                      <Combobox
                        value={
                          mappings.locationColIdxESIC !== null
                            ? String(mappings.locationColIdxESIC)
                            : "SKIP"
                        }
                        onChange={(val) =>
                          setMappings((m: any) => ({
                            ...m,
                            locationColIdxESIC:
                              val === "SKIP" || val === "" ? null : Number(val),
                            statutory: {
                              ...m.statutory,
                              esi: { colIdx: null, dbId: null },
                            },
                          }))
                        }
                        placeholder="Pick Location column"
                        className="h-9 text-xs w-full justify-between bg-background border-muted-foreground/20 hover:border-primary/50 transition-colors shadow-none"
                        options={[
                          { value: "SKIP", label: "Ignore" },
                          ...headers.map((h) => ({
                            value: String(h.index),
                            label: h.label,
                          })),
                        ]}
                      />
                    </div>

                    {uniqueLocationsESIC.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-primary uppercase tracking-wider">
                            ESIC Mapping per Location
                          </label>
                          <span className="text-[9px] text-muted-foreground italic">
                            {uniqueLocationsESIC.length} unique locations
                          </span>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-auto pr-2 scrollbar-thin">
                          {uniqueLocationsESIC.map((loc) => (
                            <div
                              key={loc}
                              className="flex items-center gap-3 p-2 rounded bg-background border border-muted-foreground/10"
                            >
                              <span className="flex-1 text-[11px] font-medium truncate">
                                {loc}
                              </span>
                              <Combobox
                                value={
                                  mappings?.locationESICMapping?.[loc] || "SKIP"
                                }
                                onChange={(val) =>
                                  setMappings((m: any) => ({
                                    ...m,
                                    locationESICMapping: {
                                      ...(m?.locationESICMapping || {}),
                                      [loc]:
                                        val === "SKIP" || val === ""
                                          ? null
                                          : val,
                                    },
                                  }))
                                }
                                placeholder="ESIC Config"
                                className="h-7 text-[10px] w-40 bg-muted/30 border-none shadow-none focus:ring-1 justify-between"
                                options={[
                                  { value: "SKIP", label: "None" },
                                  ...(availableFields?.esiConfigs?.map(
                                    (c: any) => ({
                                      value: c.id,
                                      label: c.esi_number,
                                    }),
                                  ) || []),
                                ]}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <div className="space-y-3">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Basic / DA (Combine multiple columns if needed)
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <Combobox
                          value={
                            mappings?.basic?.colIdx !== null
                              ? String(mappings?.basic?.colIdx)
                              : "SKIP"
                          }
                          onChange={(val) =>
                            setMappings((m: any) => ({
                              ...m,
                              basic: {
                                ...m.basic,
                                colIdx:
                                  val === "SKIP" || val === ""
                                    ? null
                                    : Number(val),
                              },
                            }))
                          }
                          placeholder="Basic Col 1"
                          className="h-9 text-xs bg-background border-muted-foreground/20 hover:border-primary/50 transition-colors shadow-none w-full justify-between"
                          options={[
                            { value: "SKIP", label: "Ignore" },
                            ...headers.map((h) => ({
                              value: String(h.index),
                              label: h.label,
                            })),
                          ]}
                        />

                        <Combobox
                          value={
                            mappings?.basic?.colIdx2 !== null
                              ? String(mappings?.basic?.colIdx2)
                              : "SKIP"
                          }
                          onChange={(val) =>
                            setMappings((m: any) => ({
                              ...m,
                              basic: {
                                ...m.basic,
                                colIdx2:
                                  val === "SKIP" || val === ""
                                    ? null
                                    : Number(val),
                              },
                            }))
                          }
                          placeholder="Basic Col 2"
                          className="h-9 text-xs bg-background border-muted-foreground/20 hover:border-primary/50 transition-colors shadow-none w-full justify-between"
                          options={[
                            { value: "SKIP", label: "Ignore" },
                            ...headers.map((h) => ({
                              value: String(h.index),
                              label: h.label,
                            })),
                          ]}
                        />
                      </div>

                      {(mappings?.basic?.colIdx !== null ||
                        mappings?.basic?.colIdx2 !== null) && (
                          <div className="flex items-center gap-2 pt-1">
                            <Checkbox
                              id="basic-is-monthly"
                              checked={mappings?.basic?.isMonthly || false}
                              onCheckedChange={(checked) =>
                                setMappings((m: any) => ({
                                  ...m,
                                  basic: { ...m.basic, isMonthly: !!checked },
                                }))
                              }
                            />
                            <Label
                              htmlFor="basic-is-monthly"
                              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer"
                            >
                              is monthly
                            </Label>
                          </div>
                        )}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Overtime Hours
                        </label>
                        <Combobox
                          value={
                            mappings?.overtimeColIdx !== null
                              ? String(mappings?.overtimeColIdx)
                              : "SKIP"
                          }
                          onChange={(val) =>
                            setMappings((m: any) => ({
                              ...m,
                              overtimeColIdx:
                                val === "SKIP" || val === ""
                                  ? null
                                  : Number(val),
                            }))
                          }
                          placeholder="Select OT hours col"
                          className="h-9 text-xs bg-background border-muted-foreground/20 hover:border-primary/50 transition-colors shadow-none w-full justify-between"
                          options={[
                            { value: "SKIP", label: "Ignore" },
                            ...headers.map((h) => ({
                              value: String(h.index),
                              label: h.label,
                            })),
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Icon name="report" className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Statutory Components
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  {[
                    {
                      key: "pf",
                      label: "Provident Fund (PF)",
                      configs: availableFields?.pfConfigs,
                      displayKey: "epf_number",
                    },
                    {
                      key: "esi",
                      label: "ESIC",
                      configs: availableFields?.esiConfigs,
                      displayKey: "esi_number",
                    },
                    {
                      key: "bonus",
                      label: "Statutory Bonus",
                      configs: availableFields?.bonusConfigs,
                      displayKey: "name",
                    },
                    {
                      key: "lwf",
                      label: "Labour Welfare Fund (LWF)",
                      configs: availableFields?.lwfConfigs,
                      displayKey: "state",
                    },
                    {
                      key: "pt",
                      label: "Professional Tax (PT)",
                      configs: availableFields?.ptConfigs,
                      displayKey: "state",
                      disabled: mappings.locationColIdx !== null,
                    },
                  ].map((stat) => (
                    <div
                      key={stat.key}
                      className="space-y-3 p-4 rounded-lg border bg-background/50 border-muted/60"
                    >
                      <h4 className="text-[11px] font-bold text-primary uppercase tracking-tight">
                        {stat.label}
                      </h4>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">
                          DB Config
                        </label>
                        <Combobox
                          value={
                            mappings?.statutory?.[stat.key]?.dbId || "SKIP"
                          }
                          onChange={(val) =>
                            setMappings((m: any) => ({
                              ...m,
                              locationColIdx:
                                stat.key === "pt" && val !== "SKIP"
                                  ? null
                                  : m.locationColIdx,
                              locationColIdxESIC:
                                stat.key === "esi" && val !== "SKIP"
                                  ? null
                                  : m.locationColIdxESIC,
                              statutory: {
                                ...m.statutory,
                                [stat.key]: {
                                  ...m.statutory?.[stat.key],
                                  dbId:
                                    val === "SKIP" || val === "" ? null : val,
                                },
                              },
                            }))
                          }
                          disabled={
                            (stat as any).disabled ||
                            (stat.key === "esi" &&
                              mappings.locationColIdxESIC !== null)
                          }
                          placeholder={
                            (stat as any).disabled ||
                              (stat.key === "esi" &&
                                mappings.locationColIdxESIC !== null)
                              ? `${stat.key === "pt" ? "Location PT" : "Location ESIC"} Active`
                              : "Select config"
                          }
                          className="h-8 text-[11px] bg-background border-muted-foreground/10 hover:border-primary/30 shadow-none disabled:opacity-50 disabled:bg-muted w-full justify-between"
                          options={[
                            { value: "SKIP", label: "None" },
                            ...(stat.configs?.map((c: any) => ({
                              value: c.id,
                              label: c[stat.displayKey],
                            })) || []),
                          ]}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Icon name="plus" className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Salary Components
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] uppercase tracking-wider font-bold gap-1.5"
                    onClick={() =>
                      setMappings((m: any) => ({
                        ...m,
                        components: [
                          ...m.components,
                          { id: crypto.randomUUID(), dbId: null, colIdx: null },
                        ],
                      }))
                    }
                  >
                    <Icon name="plus" className="h-3 w-3" />
                    Add Component
                  </Button>
                </div>

                <div className="space-y-3">
                  {mappings.components.map((comp: any, index: number) => (
                    <div
                      key={comp.id || index}
                      className="group relative grid grid-cols-1 md:grid-cols-[1fr,1fr,40px] gap-4 items-end p-4 rounded-lg border bg-background/50 border-muted/60 transition-all hover:border-primary/20"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Field from Database
                        </label>
                        <Combobox
                          value={comp.dbId || ""}
                          onChange={(val) =>
                            setMappings((m: any) => {
                              const newComps = [...m.components];
                              newComps[index] = {
                                ...newComps[index],
                                dbId: val === "" ? null : val,
                              };
                              return { ...m, components: newComps };
                            })
                          }
                          placeholder="Select payment field"
                          className="h-9 text-xs bg-background border-muted-foreground/10 hover:border-primary/30 shadow-none w-full justify-between"
                          options={
                            availableFields?.paymentFields?.map((f: any) => ({
                              value: f.id,
                              label: f.name,
                            })) || []
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Field from Excel
                          </label>
                          <Combobox
                            value={
                              comp.colIdx !== null ? String(comp.colIdx) : ""
                            }
                            onChange={(val) =>
                              setMappings((m: any) => {
                                const newComps = [...m.components];
                                newComps[index] = {
                                  ...newComps[index],
                                  colIdx: val === "" ? null : Number(val),
                                };
                                return { ...m, components: newComps };
                              })
                            }
                            placeholder="Select Excel column"
                            className="h-9 text-xs bg-background border-muted-foreground/10 hover:border-primary/30 shadow-none w-full justify-between"
                            options={headers.map((h) => ({
                              value: String(h.index),
                              label: h.label,
                            }))}
                          />
                        </div>
                        {comp.colIdx !== null && (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`comp-${index}-is-monthly`}
                              checked={comp.isMonthly || false}
                              onCheckedChange={(checked) =>
                                setMappings((m: any) => {
                                  const newComps = [...m.components];
                                  newComps[index] = {
                                    ...newComps[index],
                                    isMonthly: !!checked,
                                  };
                                  return { ...m, components: newComps };
                                })
                              }
                            />
                            <Label
                              htmlFor={`comp-${index}-is-monthly`}
                              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer"
                            >
                              is monthly
                            </Label>
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setMappings((m: any) => ({
                            ...m,
                            components: m.components.filter(
                              (_: any, i: number) => i !== index,
                            ),
                          }))
                        }
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {mappings.components.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20 text-muted-foreground">
                      <p className="text-xs italic">
                        No salary components mapped yet.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {loading && (
          <CardContent className="p-0 flex-none h-32 overflow-auto relative border-t">
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[2px] z-30">
              <Icon
                name="update"
                className="animate-spin h-8 w-8 text-primary mb-2"
              />
              <span className="text-sm font-semibold text-primary animate-pulse">
                Parsing Spreadsheet...
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Please wait while we process your data
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
