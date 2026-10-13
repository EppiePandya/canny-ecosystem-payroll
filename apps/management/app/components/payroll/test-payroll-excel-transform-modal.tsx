import { Badge } from "@canny_ecosystem/ui/badge";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@canny_ecosystem/ui/tabs";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { useRef, useState } from "react";

interface TransformDetails {
  sheetName: string;
  employeeNameCol: string | null;
  employeeCodeCol: string | null;
  esicCol: string | null;
  uanCol: string | null;
  attendance: string[];
  earnings: string[];
  grossCol: string | null;
  deductions: string[];
  netPayCol: string | null;
  excludedRateColumns: string[];
}

interface SheetData {
  sheetName: string;
  recordsCount: number;
  totalRows: number;
  columns: string[];
  details: TransformDetails;
  previewRows: (string | number)[][];
}

interface TransformResponse {
  success: boolean;
  originalFilename?: string;
  transformedFilename?: string;
  recordsCount?: number;
  totalRows?: number;
  lastRowText?: string;
  columns?: string[];
  details?: TransformDetails;
  emailSummaryText?: string;
  previewRows?: (string | number)[][];
  sheets?: SheetData[];
  base64Transformed?: string;
  error?: string;
}

export function TestPayrollExcelTransformModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TransformResponse | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [previewSearch, setPreviewSearch] = useState("");

  const resetState = () => {
    setSelectedFile(null);
    setResult(null);
    setIsLoading(false);
    setCopiedSummary(false);
    setSelectedSheetIndex(0);
    setPreviewSearch("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setSelectedSheetIndex(0);
      setPreviewSearch("");
    }
  };

  const runTransformationTest = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select an Excel or CSV file to test.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    setSelectedSheetIndex(0);
    setPreviewSearch("");

    try {
      // Read file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.includes(",") ? res.split(",")[1] : res;
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(selectedFile);
      const base64 = await base64Promise;

      const response = await fetch("/api/test-payroll-transform", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          base64,
        }),
      });

      const data: TransformResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to transform spreadsheet");
      }

      setResult(data);
      const sheetsCount = data.sheets?.length || 1;
      toast({
        title: "Transformation Successful",
        description: `Processed ${data.recordsCount} records across ${sheetsCount} sheet${sheetsCount > 1 ? "s" : ""} with column totals.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("[TestModal] Transformation error:", err);
      toast({
        title: "Transformation Failed",
        description:
          err.message || "Failed to process the spreadsheet with AI.",
        variant: "destructive",
      });
      setResult({
        success: false,
        error: err.message || "Transformation failed",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyEmailSummary = () => {
    if (!result?.emailSummaryText) return;
    navigator.clipboard.writeText(result.emailSummaryText);
    setCopiedSummary(true);
    toast({
      title: "Copied to Clipboard",
      description: "Email reply summary text copied successfully.",
      variant: "success",
    });
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleDownloadTransformedExcel = () => {
    if (!result?.base64Transformed || !result?.transformedFilename) return;

    try {
      const byteCharacters = atob(result.base64Transformed);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.transformedFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: "Download Failed",
        description: err.message || "Could not generate download file.",
        variant: "destructive",
      });
    }
  };

  // Resolve sheets data
  const sheets: SheetData[] =
    result?.sheets && result.sheets.length > 0
      ? result.sheets
      : result?.details
        ? [
            {
              sheetName: result.details.sheetName || "Transformed Payroll",
              recordsCount: result.recordsCount ?? 0,
              totalRows: result.totalRows ?? 0,
              columns: result.columns ?? [],
              details: result.details,
              previewRows: result.previewRows ?? [],
            },
          ]
        : [];

  const activeSheet: SheetData | undefined =
    sheets[selectedSheetIndex] || sheets[0];

  const activeDetails: TransformDetails | undefined =
    activeSheet?.details || result?.details;

  // Process rows for preview table (separating data rows and total row)
  const rawPreviewRows = activeSheet?.previewRows || [];
  const headerRow = rawPreviewRows[0] || [];
  const bodyRows = rawPreviewRows.slice(1);

  // Check if last row is the summary Total row
  const lastBodyRow = bodyRows[bodyRows.length - 1];
  const hasTotalRow =
    lastBodyRow &&
    String(lastBodyRow[0] ?? "").trim().toLowerCase() === "total";

  const dataRows = hasTotalRow ? bodyRows.slice(0, -1) : bodyRows;
  const totalRow = hasTotalRow ? lastBodyRow : null;

  // Filter data rows by search query
  const filteredDataRows = previewSearch.trim()
    ? dataRows.filter((r) =>
        r.some((c) =>
          String(c ?? "")
            .toLowerCase()
            .includes(previewSearch.trim().toLowerCase()),
        ),
      )
    : dataRows;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="space-y-1 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Icon name="magic" className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-bold">
                Test Payroll Excel Transform
              </DialogTitle>
            </div>
            <Badge variant="outline" className="text-xs bg-muted/60 font-mono">
              GEMINI Engine • Multi-Sheet Ready
            </Badge>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Transform all sheets and entries from client salary workbooks,
            extract attendance divisors, isolate earned wages from fixed rates,
            and preview all records with summary column totals.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* File Picker & Controls */}
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 transition-all">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="payroll-test-file-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="shrink-0"
                >
                  <Icon name="import" size="sm" className="mr-2" />
                  {selectedFile ? "Change Excel File" : "Choose Excel File"}
                </Button>

                {selectedFile ? (
                  <div className="truncate">
                    <p className="text-sm font-medium truncate max-w-xs sm:max-w-md">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Upload any .xlsx, .xls, .xlsm, or .csv payroll workbook (supports multi-sheet files)
                  </p>
                )}
              </div>

              {selectedFile && (
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="default"
                    onClick={runTransformationTest}
                    disabled={isLoading}
                    className="gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Spinner
                          size={16}
                          barClassName="bg-primary-foreground"
                        />
                        <span>Analyzing & Transforming All Sheets...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="magic" size="sm" />
                        <span>Run Test Transform</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Loading Animation Card */}
          {isLoading && (
            <Card className="border border-primary/20 bg-primary/5 p-6 text-center animate-pulse">
              <div className="flex flex-col items-center justify-center space-y-3">
                <Spinner size={28} barClassName="bg-primary" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    Running AI Payroll Analysis across all sheets...
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-lg mx-auto">
                    Inspecting sheets, extracting formulas and attendance divisors,
                    transforming all employee records, calculating column totals for amount fields,
                    and preparing unified output.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Error Message */}
          {!isLoading && result && !result.success && (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-destructive">
              <div className="flex items-start gap-3">
                <Icon
                  name="cross"
                  className="h-5 w-5 shrink-0 mt-0.5 text-destructive"
                />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">
                    Transformation Failed
                  </h4>
                  <p className="text-xs opacity-90">{result.error}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Success Results */}
          {!isLoading && result && result.success && (
            <div className="space-y-4">
              {/* Multi-Sheet Selector Pill Bar (when > 1 sheet exists) */}
              {sheets.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs bg-background font-medium gap-1">
                      <Icon name="file-text" className="h-3 w-3 text-primary" />
                      <span>{sheets.length} Sheets Transformed</span>
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Switch sheet to inspect entries:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sheets.map((s, idx) => (
                      <Button
                        key={`sheet-btn-${idx}-${s.sheetName}`}
                        type="button"
                        size="sm"
                        variant={selectedSheetIndex === idx ? "default" : "outline"}
                        onClick={() => {
                          setSelectedSheetIndex(idx);
                          setPreviewSearch("");
                        }}
                        className={`h-7 text-xs px-2.5 gap-1.5 transition-all ${
                          selectedSheetIndex === idx
                            ? "shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{s.sheetName}</span>
                        <Badge
                          variant={selectedSheetIndex === idx ? "secondary" : "outline"}
                          className="text-[10px] px-1 py-0 h-4 font-mono"
                        >
                          {s.recordsCount}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Tabs defaultValue="table" className="w-full space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <TabsList className="bg-muted">
                    <TabsTrigger value="table" className="text-xs gap-1.5">
                      <Icon name="table" size="sm" />
                      <span>Transformed Preview</span>
                      {activeSheet && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 font-mono">
                          {activeSheet.recordsCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="readable" className="text-xs gap-1.5">
                      <Icon name="info" size="sm" />
                      <span>Readable Values</span>
                    </TabsTrigger>
                    <TabsTrigger value="email" className="text-xs gap-1.5">
                      <Icon name="mail" size="sm" />
                      <span>Gmail Reply Body</span>
                    </TabsTrigger>
                  </TabsList>

                  {result.base64Transformed && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTransformedExcel}
                      className="text-xs gap-1.5 h-8 font-medium"
                    >
                      <Icon name="download" size="sm" />
                      Download Transformed Excel
                    </Button>
                  )}
                </div>

                {/* Tab 1: Transformed Sheet Preview Table with Totals */}
                <TabsContent value="table" className="space-y-3 m-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-semibold">
                        Sheet: {activeSheet?.sheetName}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Showing all {activeSheet?.recordsCount ?? 0} employee entries + Column Amount Totals
                      </span>
                    </div>
                    <div className="w-full sm:w-64">
                      <Input
                        type="text"
                        placeholder="Filter employees in sheet..."
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {headerRow.length > 0 ? (
                    <div
                      key={`table-container-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}
                      className="rounded-md border overflow-x-auto max-h-[460px] shadow-sm relative"
                    >
                      <Table key={`sheet-table-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}>
                        <TableHeader
                          key={`thead-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}
                          className="bg-muted/90 sticky top-0 z-20 backdrop-blur-md"
                        >
                          <TableRow key={`th-row-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}>
                            <TableHead className="text-xs font-bold whitespace-nowrap px-2.5 py-2 border-r text-center w-12 text-muted-foreground">
                              #
                            </TableHead>
                            {headerRow.map((hdr, cIdx) => (
                              <TableHead
                                key={`th-${selectedSheetIndex}-${cIdx}-${String(hdr || "")}`}
                                className="text-xs font-bold whitespace-nowrap px-3 py-2 border-r last:border-r-0 text-foreground"
                              >
                                {String(hdr ?? "")}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody key={`tbody-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}>
                          {/* Data rows */}
                          {filteredDataRows.map((row, rIdx) => {
                            const rowKey = String(row[2] || row[0] || `row-${rIdx}`);
                            return (
                              <TableRow
                                key={`row-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}-${rowKey}`}
                                className="hover:bg-muted/30"
                              >
                                <TableCell className="text-xs px-2.5 py-1.5 whitespace-nowrap border-r font-mono text-center text-muted-foreground select-none">
                                  {rIdx + 1}
                                </TableCell>
                                {row.map((cell, cIdx) => {
                                  const colKey = String(headerRow[cIdx] ?? `col-${cIdx}`);
                                  return (
                                    <TableCell
                                      key={`cell-${selectedSheetIndex}-${rowKey}-${colKey}`}
                                      className={`text-xs px-3 py-1.5 whitespace-nowrap border-r last:border-r-0 font-mono ${
                                        cIdx === 0
                                          ? "font-medium text-foreground"
                                          : "text-muted-foreground"
                                      }`}
                                    >
                                      {cell !== null && cell !== undefined
                                        ? typeof cell === "number"
                                          ? Math.round(cell)
                                          : String(cell)
                                        : ""}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}

                          {/* Filtered empty state */}
                          {filteredDataRows.length === 0 && (
                            <TableRow key={`empty-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}>
                              <TableCell
                                colSpan={headerRow.length + 1}
                                className="text-center py-6 text-xs text-muted-foreground italic"
                              >
                                No matching employees found for "{previewSearch}".
                              </TableCell>
                            </TableRow>
                          )}

                          {/* Summary Total Row */}
                          {totalRow && (
                            <TableRow
                              key={`total-row-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}
                              className="bg-primary/10 dark:bg-primary/20 font-bold border-t-2 border-primary sticky bottom-0 backdrop-blur-md shadow-sm hover:bg-primary/15 z-10"
                            >
                              <TableCell className="text-xs px-2.5 py-2 whitespace-nowrap border-r font-mono text-center text-primary font-bold">
                                Σ
                              </TableCell>
                              {totalRow.map((cell, cIdx) => {
                                const colKey = String(headerRow[cIdx] ?? `col-${cIdx}`);
                                const isAmountTotal =
                                  cell !== null &&
                                  cell !== undefined &&
                                  cell !== "" &&
                                  cIdx > 0;
                                return (
                                  <TableCell
                                    key={`total-cell-${selectedSheetIndex}-${colKey}`}
                                    className={`text-xs px-3 py-2 whitespace-nowrap border-r last:border-r-0 font-mono font-bold ${
                                      cIdx === 0
                                        ? "text-primary uppercase tracking-wider font-extrabold"
                                        : isAmountTotal
                                          ? "text-foreground font-semibold"
                                          : "text-muted-foreground font-normal"
                                    }`}
                                  >
                                    {cIdx === 0 ? (
                                      <span className="flex items-center gap-1 text-primary">
                                        <Icon name="check" size="sm" className="h-3 w-3" />
                                        TOTAL
                                      </span>
                                    ) : isAmountTotal ? (
                                      typeof cell === "number" ? (
                                        Math.round(cell).toLocaleString("en-IN", {
                                          maximumFractionDigits: 0,
                                        })
                                      ) : !Number.isNaN(Number(cell)) ? (
                                        Math.round(Number(cell)).toLocaleString("en-IN", {
                                          maximumFractionDigits: 0,
                                        })
                                      ) : (
                                        String(cell)
                                      )
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                      No preview rows available for this sheet.
                    </p>
                  )}
                </TabsContent>

                {/* Tab 2: Structured Readable Breakdown */}
                <TabsContent
                  value="readable"
                  key={`readable-tab-${selectedSheetIndex}-${activeSheet?.sheetName || "sheet"}`}
                  className="space-y-4 m-0"
                >
                  {/* Metrics Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        {sheets.length > 1 ? "Active Sheet Records" : "Total Records"}
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {activeSheet?.recordsCount ?? result.recordsCount ?? 0}
                      </p>
                      {sheets.length > 1 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {result.recordsCount} across {sheets.length} sheets
                        </p>
                      )}
                    </Card>
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Total Sheet Rows
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {activeSheet?.totalRows ?? result.totalRows ?? 0}
                      </p>
                    </Card>
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Headers Included
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {activeSheet?.columns?.length ?? result.columns?.length ?? 0}
                      </p>
                    </Card>
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Current Sheet Tab
                      </p>
                      <p
                        className="text-sm font-semibold truncate text-foreground mt-1"
                        title={activeSheet?.sheetName}
                      >
                        {activeSheet?.sheetName || "Sheet1"}
                      </p>
                    </Card>
                  </div>

                  {/* 2-Column Detail Cards for Active Sheet */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Card 1: Identifiers */}
                    <Card>
                      <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Employee Identification Columns
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-2 text-xs">
                        <div className="flex justify-between items-center py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            Employee Name:
                          </span>
                          <Badge
                            variant={
                              activeDetails?.employeeNameCol
                                ? "default"
                                : "outline"
                            }
                          >
                            {activeDetails?.employeeNameCol || "Not detected"}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            Employee Code:
                          </span>
                          <Badge
                            variant={
                              activeDetails?.employeeCodeCol
                                ? "default"
                                : "outline"
                            }
                          >
                            {activeDetails?.employeeCodeCol || "Not detected"}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            ESIC IP Number:
                          </span>
                          <Badge
                            variant={
                              activeDetails?.esicCol ? "default" : "outline"
                            }
                          >
                            {activeDetails?.esicCol || "None"}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-muted-foreground">PF UAN:</span>
                          <Badge
                            variant={
                              activeDetails?.uanCol ? "default" : "outline"
                            }
                          >
                            {activeDetails?.uanCol || "None"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Card 2: Attendance Data */}
                    <Card>
                      <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Attendance Extraction (Rules 1-4)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-2 text-xs">
                        {activeDetails?.attendance &&
                        activeDetails.attendance.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {activeDetails.attendance.map((att) => (
                              <Badge
                                key={att}
                                variant="secondary"
                                className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium"
                              >
                                {att}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground italic">
                            None detected
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Card 3: Earnings & Gross */}
                    <Card>
                      <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Active Calculated Earnings & Gross
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-3 text-xs">
                        <div>
                          <span className="text-muted-foreground font-medium block mb-1.5">
                            Calculated Earnings (Flowing into Gross):
                          </span>
                          {activeDetails?.earnings &&
                          activeDetails.earnings.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {activeDetails.earnings.map((e) => (
                                <Badge
                                  key={e}
                                  variant="secondary"
                                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium"
                                >
                                  {e}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">
                              None
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                          <span className="text-muted-foreground font-medium">
                            Gross Column Header:
                          </span>
                          <Badge
                            variant={
                              activeDetails?.grossCol ? "default" : "outline"
                            }
                            className="bg-emerald-600"
                          >
                            {activeDetails?.grossCol || "Not detected"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Card 4: Deductions & Net Pay */}
                    <Card>
                      <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Active Deductions & Net Pay
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-3 text-xs">
                        <div>
                          <span className="text-muted-foreground font-medium block mb-1.5">
                            Deductions (Subtracted from Gross):
                          </span>
                          {activeDetails?.deductions &&
                          activeDetails.deductions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {activeDetails.deductions.map((d) => (
                                <Badge
                                  key={d}
                                  variant="secondary"
                                  className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-medium"
                                >
                                  {d}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">
                              None
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                          <span className="text-muted-foreground font-medium">
                            Net Pay Column Header:
                          </span>
                          <Badge
                            variant={
                              activeDetails?.netPayCol ? "default" : "outline"
                            }
                            className="bg-primary"
                          >
                            {activeDetails?.netPayCol || "Not detected"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Excluded Rate Columns Alert */}
                  {activeDetails?.excludedRateColumns &&
                    activeDetails.excludedRateColumns.length > 0 && (
                      <Card className="border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="flex items-start gap-2.5">
                          <Icon
                            name="info"
                            className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                          />
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold text-amber-700 dark:text-amber-400">
                              Deliberately Excluded Fixed Monthly Master Rates:
                            </p>
                            <p className="text-muted-foreground">
                              {activeDetails.excludedRateColumns.join(" • ")}
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}
                </TabsContent>

                {/* Tab 3: Exact Gmail Auto-Reply Format */}
                <TabsContent value="email" className="space-y-3 m-0">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                      This is the plain-text summary block embedded into reply emails by{" "}
                      <code className="text-foreground font-mono">
                        gmail-auto-reply.ts
                      </code>{" "}
                      covering all transformed sheets:
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyEmailSummary}
                      className="text-xs gap-1.5 h-8"
                    >
                      <Icon
                        name={copiedSummary ? "check" : "bookmark"}
                        size="sm"
                      />
                      {copiedSummary ? "Copied!" : "Copy Summary"}
                    </Button>
                  </div>

                  <div className="rounded-lg border bg-zinc-950 p-4 text-zinc-100 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                    {result.emailSummaryText}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t mt-2">
          {result?.success ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetState}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Test Another File
            </Button>
          ) : (
            <div />
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

