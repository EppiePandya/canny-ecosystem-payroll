import { useState, useEffect } from "react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import * as XLSX from "xlsx";
import { getExcelColName } from "./mail-helpers";

interface MailAttachmentPreviewModalProps {
  previewAttachment: any | null;
  onClose: () => void;
}

export function MailAttachmentPreviewModal({
  previewAttachment,
  onClose,
}: MailAttachmentPreviewModalProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [excelData, setExcelData] = useState<{
    sheetNames: string[];
    activeSheet: string;
    sheets: Record<string, any[][]>;
  } | null>(null);
  const [excelSearch, setExcelSearch] = useState("");

  useEffect(() => {
    if (!previewAttachment) {
      setIsMaximized(false);
    } else {
      const filename = previewAttachment.filename || "";
      const contentType = previewAttachment.contentType || "";
      const isExcel =
        /\.(xlsx?|csv|ods)$/i.test(filename) ||
        contentType.includes("excel") ||
        contentType.includes("spreadsheet") ||
        contentType.includes("csv");

      if (isExcel) {
        setIsMaximized(true);
      }
    }
  }, [previewAttachment]);

  useEffect(() => {
    if (!previewAttachment || !previewAttachment.contentUrl) {
      setExcelData(null);
      setExcelSearch("");
      return;
    }

    const filename = previewAttachment.filename || "";
    const contentType = previewAttachment.contentType || "";
    const isExcel =
      /\.(xlsx?|csv|ods)$/i.test(filename) ||
      contentType.includes("excel") ||
      contentType.includes("spreadsheet") ||
      contentType.includes("csv");

    if (!isExcel) {
      setExcelData(null);
      setExcelSearch("");
      return;
    }

    try {
      const base64Parts = previewAttachment.contentUrl.split(",");
      const base64Data =
        base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];

      if (base64Data) {
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const xlsxLib: any = (XLSX as any).default || XLSX;
        const workbook = xlsxLib.read(bytes, { type: "array" });
        const sheetNames = workbook.SheetNames || [];
        const parsedSheets: Record<string, any[][]> = {};

        for (const name of sheetNames) {
          const worksheet = workbook.Sheets[name];
          if (worksheet) {
            const rawRows = xlsxLib.utils.sheet_to_json(worksheet, {
              header: 1,
              blankrows: false,
              defval: "",
            });
            parsedSheets[name] = rawRows;
          }
        }

        const initialSheet = sheetNames[0] || "";
        setExcelData({
          sheetNames,
          activeSheet: initialSheet,
          sheets: parsedSheets,
        });
      }
    } catch (err) {
      console.error("Failed to parse Excel attachment preview:", err);
      setExcelData(null);
    }
  }, [previewAttachment]);

  if (!previewAttachment) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        onClose();
        setIsMaximized(false);
      }}
    >
      <div
        className={`bg-card border shadow-2xl flex flex-col overflow-hidden transition-all duration-200 animate-in zoom-in-95 ${
          isMaximized
            ? "fixed inset-0 z-50 w-screen h-screen rounded-none max-w-none max-h-none"
            : "max-w-[98vw] w-full h-[94vh] rounded-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lightbox Header */}
        <div className="p-3 border-b flex items-center justify-between bg-card/90 shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-4">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/20">
              {excelData ? "XLS" : "FILE"}
            </div>
            <h3
              className="text-sm font-bold text-foreground truncate"
              title={previewAttachment.filename}
            >
              {previewAttachment.filename}
            </h3>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
              {(previewAttachment.size / 1024).toFixed(1)} KB
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {previewAttachment.contentUrl && (
              <a
                href={previewAttachment.contentUrl}
                download={previewAttachment.filename}
                className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                Download
              </a>
            )}

            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isMaximized ? "Restore size" : "Maximize view"}
            >
              {isMaximized ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h6v6" />
                  <path d="M9 21H3v-6" />
                  <path d="M21 3l-7 7" />
                  <path d="M3 21l7-7" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                setIsMaximized(false);
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Icon name="cross" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Lightbox Body */}
        <div className="flex-1 min-h-0 bg-muted/20 flex flex-col items-center justify-center overflow-hidden">
          {excelData ? (
            <div className="w-full h-full flex flex-col overflow-hidden bg-background">
              {/* Sheet Switcher & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b px-3 py-2 bg-muted/40 gap-2 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">
                    Sheets:
                  </span>
                  {excelData.sheetNames.map((sheet) => {
                    const isActive = excelData.activeSheet === sheet;
                    return (
                      <button
                        key={sheet}
                        type="button"
                        onClick={() =>
                          setExcelData((prev) =>
                            prev ? { ...prev, activeSheet: sheet } : prev
                          )
                        }
                        className={`px-3 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all ${
                          isActive
                            ? "bg-background text-foreground shadow-sm border border-border/80"
                            : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        }`}
                      >
                        📊 {sheet}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-64 shrink-0">
                  <Input
                    value={excelSearch}
                    onChange={(e) => setExcelSearch(e.target.value)}
                    placeholder="Search in sheet..."
                    className="h-8 text-xs bg-background pr-7"
                  />
                  {excelSearch && (
                    <button
                      type="button"
                      onClick={() => setExcelSearch("")}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Excel Table Grid */}
              <div className="flex-1 overflow-auto bg-background p-1">
                {(() => {
                  const rows = excelData.sheets[excelData.activeSheet] || [];
                  if (rows.length === 0) {
                    return (
                      <div className="p-12 text-center text-xs text-muted-foreground">
                        This worksheet is empty.
                      </div>
                    );
                  }

                  const q = excelSearch.toLowerCase().trim();
                  const filteredRows = q
                    ? rows.filter((r) =>
                        r.some((cell) =>
                          String(cell || "")
                            .toLowerCase()
                            .includes(q)
                        )
                      )
                    : rows;

                  const maxCols = Math.max(
                    0,
                    ...filteredRows.map((r) => r.length)
                  );
                  const colCount = Math.max(maxCols, 12);

                  return (
                    <div className="overflow-auto max-h-full border rounded-lg shadow-inner bg-background">
                      <table className="w-full border-collapse text-left text-xs font-mono select-text">
                        {/* Standard Excel Column Headers (A, B, C, D, E, F, G, H...) */}
                        <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-md border-b text-center text-[11px] font-bold text-muted-foreground shadow-sm">
                          <tr>
                            <th className="w-12 px-2 py-1.5 border-r border-b text-center font-bold text-muted-foreground bg-muted/80 sticky left-0 z-30 select-none">
                              #
                            </th>
                            {Array.from({ length: colCount }).map((_, cIdx) => (
                              <th
                                key={cIdx}
                                className="px-3 py-1.5 border-r border-b font-bold text-foreground bg-muted/60 whitespace-nowrap min-w-[130px] uppercase text-center select-none"
                              >
                                {getExcelColName(cIdx)}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y font-sans text-foreground text-xs">
                          {filteredRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className="hover:bg-muted/50 transition-colors group"
                            >
                              {/* Row Number (1, 2, 3...) */}
                              <td className="w-12 px-2 py-1.5 border-r border-b text-center text-[11px] font-bold text-muted-foreground bg-muted/30 sticky left-0 z-10 select-none group-hover:bg-muted/60">
                                {rIdx + 1}
                              </td>

                              {/* Data Cells */}
                              {Array.from({ length: colCount }).map(
                                (_, cIdx) => {
                                  const val =
                                    row[cIdx] !== undefined
                                      ? String(row[cIdx])
                                      : "";
                                  const isNum =
                                    !isNaN(Number(val)) && val.trim() !== "";

                                  return (
                                    <td
                                      key={cIdx}
                                      className={`px-3 py-1.5 border-r border-b whitespace-nowrap max-w-xs overflow-hidden text-ellipsis font-medium ${
                                        isNum
                                          ? "text-right font-mono text-foreground"
                                          : "text-left"
                                      }`}
                                      title={val}
                                    >
                                      {val}
                                    </td>
                                  );
                                }
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : ((previewAttachment.contentType || "").startsWith("image/") ||
              /\.(png|jpe?g|gif|webp|svg)$/i.test(
                previewAttachment.filename
              )) &&
            previewAttachment.contentUrl ? (
            <img
              src={previewAttachment.contentUrl}
              alt={previewAttachment.filename}
              className="max-h-[75vh] max-w-full object-contain rounded-lg border shadow-lg bg-background"
            />
          ) : ((previewAttachment.contentType || "").includes("pdf") ||
              /\.pdf$/i.test(previewAttachment.filename)) &&
            previewAttachment.contentUrl ? (
            <iframe
              src={previewAttachment.contentUrl}
              title={previewAttachment.filename}
              className="w-full h-[75vh] rounded-lg border bg-background"
            />
          ) : (
            <div className="text-center p-8 space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a1 1 0 0 0 1 1h4" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground truncate">
                  {previewAttachment.filename}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Direct preview is not supported for{" "}
                  {previewAttachment.filename.split(".").pop()?.toUpperCase()}{" "}
                  files. Click download below to save and open.
                </p>
              </div>
              {previewAttachment.contentUrl && (
                <a
                  href={previewAttachment.contentUrl}
                  download={previewAttachment.filename}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 shadow-md transition-all"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </svg>
                  Download {previewAttachment.filename}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
