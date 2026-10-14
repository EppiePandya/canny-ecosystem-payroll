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

interface SheetData {
  sheetName: string;
  recordsCount: number;
  totalRows: number;
  columns: string[];
  details: {
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
    removedColumns?: Array<{ header: string; reason: string }>;
  };
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
  details?: any;
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
        description: `Cleaned ${data.recordsCount} records across ${sheetsCount} sheet${sheetsCount > 1 ? "s" : ""}.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("[TestModal] Transformation error:", err);
      toast({
        title: "Transformation Failed",
        description: err.message || "Failed to process the spreadsheet.",
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
      description: "Summary text copied successfully.",
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

  // Resolve sheets
  const sheets: SheetData[] =
    result?.sheets && result.sheets.length > 0
      ? result.sheets
      : result?.details
        ? [
            {
              sheetName: result.details.sheetName || "Sheet1",
              recordsCount: result.recordsCount ?? 0,
              totalRows: result.totalRows ?? 0,
              columns: result.columns ?? [],
              details: result.details,
              previewRows: result.previewRows ?? [],
            },
          ]
        : [];

  const safeSheetIndex =
    selectedSheetIndex >= 0 && selectedSheetIndex < sheets.length
      ? selectedSheetIndex
      : 0;

  const activeSheet: SheetData | undefined =
    sheets[safeSheetIndex] || sheets[0];

  const rawPreviewRows = activeSheet?.previewRows || [];
  const headerRow = rawPreviewRows[0] || [];
  const bodyRows = rawPreviewRows.slice(1);

  const lastBodyRow = bodyRows[bodyRows.length - 1];
  const hasTotalRow =
    lastBodyRow &&
    String(lastBodyRow[0] ?? "")
      .trim()
      .toLowerCase() === "total";

  const dataRows = hasTotalRow ? bodyRows.slice(0, -1) : bodyRows;
  const totalRow = hasTotalRow ? lastBodyRow : null;

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
              Auto Formula & Header Clean
            </Badge>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Automatically isolates real headers, extracts matching employee
            rows, preserves all formula-used cells, and removes unused metadata
            and empty columns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* File Picker */}
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
                    Upload any .xlsx, .xls, .xlsm, or .csv payroll workbook
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
                        <span>Analyzing & Transforming...</span>
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

          {/* Loading Card */}
          {isLoading && (
            <Card className="border border-primary/20 bg-primary/5 p-6 text-center animate-pulse">
              <div className="flex flex-col items-center justify-center space-y-3">
                <Spinner size={28} barClassName="bg-primary" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    Cleaning & Transforming Workbook...
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-lg mx-auto">
                    Detecting header rows, filtering matching employee records,
                    preserving all cells participating in formulas, and
                    discarding unused columns.
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
              {/* Sheet Switcher */}
              {sheets.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs bg-background font-medium gap-1"
                    >
                      <Icon name="file-text" className="h-3 w-3 text-primary" />
                      <span>{sheets.length} Sheets</span>
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sheets.map((s, idx) => (
                      <Button
                        key={`sheet-btn-${idx}-${s.sheetName}`}
                        type="button"
                        size="sm"
                        variant={safeSheetIndex === idx ? "default" : "outline"}
                        onClick={() => {
                          setSelectedSheetIndex(idx);
                          setPreviewSearch("");
                        }}
                        className={`h-7 text-xs px-2.5 gap-1.5 transition-all ${
                          safeSheetIndex === idx
                            ? "shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{s.sheetName}</span>
                        <Badge
                          variant={
                            safeSheetIndex === idx ? "secondary" : "outline"
                          }
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
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4 font-mono"
                        >
                          {activeSheet.recordsCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="columns" className="text-xs gap-1.5">
                      <Icon name="info" size="sm" />
                      <span>Columns & Details</span>
                    </TabsTrigger>
                    <TabsTrigger value="email" className="text-xs gap-1.5">
                      <Icon name="mail" size="sm" />
                      <span>Email Summary</span>
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

                {/* Tab 1: Transformed Preview Table */}
                <TabsContent value="table" className="space-y-3 m-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="text-xs font-semibold"
                      >
                        Sheet: {activeSheet?.sheetName}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {activeSheet?.recordsCount ?? 0} employee records •{" "}
                        {headerRow.length} columns kept
                      </span>
                    </div>
                    <div className="w-full sm:w-64">
                      <Input
                        type="text"
                        placeholder="Filter records..."
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {headerRow.length > 0 ? (
                    <div
                      key={`sheet-viewport-${safeSheetIndex}-${activeSheet?.sheetName || "sheet"}`}
                      className="rounded-md border overflow-x-auto max-h-[460px] shadow-sm relative"
                    >
                      <Table
                        key={`sheet-table-${safeSheetIndex}-${activeSheet?.sheetName || "sheet"}`}
                      >
                        <TableHeader className="bg-muted/90 sticky top-0 z-20 backdrop-blur-md">
                          <TableRow key={`s${safeSheetIndex}-th-row`}>
                            <TableHead className="text-xs font-bold whitespace-nowrap px-2.5 py-2 border-r text-center w-12 text-muted-foreground">
                              #
                            </TableHead>
                            {headerRow.map((hdr, cIdx) => (
                              <TableHead
                                key={`s${safeSheetIndex}-th-${cIdx}-${String(hdr || "")}`}
                                className="text-xs font-bold whitespace-nowrap px-3 py-2 border-r last:border-r-0 text-foreground"
                              >
                                {String(hdr ?? "")}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody key={`s${safeSheetIndex}-tbody`}>
                          {filteredDataRows.map((row, rIdx) => {
                            const rowId = `s${safeSheetIndex}-r${rIdx}-${String(row[0] ?? "")}-${String(row[1] ?? "")}`;
                            return (
                              <TableRow
                                key={rowId}
                                className="hover:bg-muted/30"
                              >
                                <TableCell className="text-xs px-2.5 py-1.5 whitespace-nowrap border-r font-mono text-center text-muted-foreground select-none">
                                  {rIdx + 1}
                                </TableCell>
                                {row.map((cell, cIdx) => (
                                  <TableCell
                                    key={`${rowId}-c${cIdx}-${headerRow[cIdx] || cIdx}`}
                                    className={`text-xs px-3 py-1.5 whitespace-nowrap border-r last:border-r-0 font-mono ${
                                      cIdx === 0
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {cell !== null && cell !== undefined
                                      ? typeof cell === "number"
                                        ? cell.toLocaleString("en-IN")
                                        : String(cell)
                                      : ""}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}

                          {filteredDataRows.length === 0 && (
                            <TableRow key={`s${safeSheetIndex}-empty-row`}>
                              <TableCell
                                colSpan={headerRow.length + 1}
                                className="text-center py-6 text-xs text-muted-foreground italic"
                              >
                                No matching records found for "{previewSearch}".
                              </TableCell>
                            </TableRow>
                          )}

                          {/* Sticky Total Row */}
                          {totalRow && (
                            <TableRow
                              key={`s${safeSheetIndex}-total-row`}
                              className="bg-primary/10 dark:bg-primary/20 font-bold border-t-2 border-primary sticky bottom-0 backdrop-blur-md shadow-sm z-10"
                            >
                              <TableCell className="text-xs px-2.5 py-2 whitespace-nowrap border-r font-mono text-center text-primary font-bold">
                                Σ
                              </TableCell>
                              {totalRow.map((cell, cIdx) => {
                                const isAmount =
                                  cell !== null &&
                                  cell !== undefined &&
                                  cell !== "" &&
                                  cIdx > 0;
                                return (
                                  <TableCell
                                    key={`s${safeSheetIndex}-total-col-${headerRow[cIdx] || cIdx}`}
                                    className={`text-xs px-3 py-2 whitespace-nowrap border-r last:border-r-0 font-mono font-bold ${
                                      cIdx === 0
                                        ? "text-primary uppercase tracking-wider font-extrabold"
                                        : isAmount
                                          ? "text-foreground font-semibold"
                                          : "text-muted-foreground font-normal"
                                    }`}
                                  >
                                    {cIdx === 0
                                      ? "TOTAL"
                                      : isAmount
                                        ? typeof cell === "number"
                                          ? cell.toLocaleString("en-IN")
                                          : !Number.isNaN(Number(cell))
                                            ? Number(cell).toLocaleString(
                                                "en-IN",
                                              )
                                            : String(cell)
                                        : "—"}
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
                      No preview available.
                    </p>
                  )}
                </TabsContent>

                {/* Tab 2: Columns & Details */}
                <TabsContent value="columns" className="space-y-4 m-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Total Records
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {activeSheet?.recordsCount ?? result.recordsCount ?? 0}
                      </p>
                    </Card>
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Worksheet Rows
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {activeSheet?.totalRows ?? result.totalRows ?? 0}
                      </p>
                    </Card>
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Columns Kept
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {activeSheet?.columns?.length ??
                          result.columns?.length ??
                          0}
                      </p>
                    </Card>
                    <Card className="p-3 bg-card/60">
                      <p className="text-xs text-muted-foreground">
                        Current Sheet
                      </p>
                      <p className="text-sm font-semibold truncate text-foreground mt-1">
                        {activeSheet?.sheetName || "Sheet1"}
                      </p>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Kept Columns Card */}
                    <Card
                      key={`kept-card-${safeSheetIndex}-${activeSheet?.sheetName}`}
                    >
                      <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Kept Columns (Payroll, Identifiers & Formulas)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-1.5 text-xs">
                        {activeSheet?.columns &&
                        activeSheet.columns.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {activeSheet.columns.map((col, idx) => (
                              <Badge
                                key={`kept-${safeSheetIndex}-${idx}-${col}`}
                                variant="secondary"
                                className="font-mono text-xs px-2 py-0.5"
                              >
                                {col}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            None
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Removed Columns Card */}
                    <Card
                      key={`removed-card-${safeSheetIndex}-${activeSheet?.sheetName}`}
                    >
                      <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Removed Unused / Empty Columns
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-1.5 text-xs">
                        {activeSheet?.details?.removedColumns &&
                        activeSheet.details.removedColumns.length > 0 ? (
                          <div className="space-y-1.5">
                            {activeSheet.details.removedColumns.map((rc) => (
                              <div
                                key={`rc-${safeSheetIndex}-${rc.header}-${rc.reason}`}
                                className="flex items-center justify-between py-1 border-b border-border/40 last:border-0"
                              >
                                <span className="font-mono text-muted-foreground">
                                  {rc.header}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground"
                                >
                                  {rc.reason}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            All columns with data participating in calculations
                            were preserved.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Tab 3: Email Summary */}
                <TabsContent value="email" className="space-y-3 m-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Summary generated for automated confirmation reply:
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyEmailSummary}
                      className="text-xs gap-1.5 h-7"
                    >
                      <Icon name={copiedSummary ? "check" : "copy"} size="sm" />
                      {copiedSummary ? "Copied" : "Copy Summary Text"}
                    </Button>
                  </div>

                  <Card className="p-4 bg-muted/30 font-mono text-xs whitespace-pre-wrap leading-relaxed border">
                    {result.emailSummaryText || "No email summary generated."}
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
