import { DEFAULT_ROUTE } from "@/constant";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  defer,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import { Suspense, useState } from "react";
import {
  hasPermission,
  readRole,
  searchInObject,
} from "@canny_ecosystem/utils";
import { safeRedirect } from "@/utils/server/http.server";
import { attribute } from "@canny_ecosystem/utils/constant";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { getEmployeeLettersByEmployeeId } from "@canny_ecosystem/supabase/queries";
import { ErrorBoundary } from "@/components/error-boundary";
import { Card, CardContent, CardHeader, CardTitle } from "@canny_ecosystem/ui/card";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import type { EmployeeLetterDatabaseRow } from "@canny_ecosystem/supabase/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase);
  const employeeId = params.employeeId;

  if (!hasPermission(user?.role!, `${readRole}:${attribute.employees}`))
    return safeRedirect(DEFAULT_ROUTE, { headers });

  if (!employeeId) return safeRedirect("/employees", { headers });

  try {
    const lettersPromise = getEmployeeLettersByEmployeeId({
      supabase,
      employeeId,
    });

    return defer({
      lettersPromise: lettersPromise as any,
    });
  } catch (error) {
    console.error("Employee letters error in loader:", error);
    return defer({
      lettersPromise: Promise.resolve({ data: [] }),
    });
  }
}

function formatLetterType(type: string) {
  if (!type) return "Letter";
  return type
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cleanLetterHtml(content: string | null | undefined): string {
  if (!content) return "";
  let text = content;

  // 1. Remove/format marker tags like ${address}, ${center}, ${pageBreak}
  text = text.replace(/&rupee;|&inr;|&#8377;/gi, "₹");
  text = text.replace(/\$\{address\}/gi, "");
  text = text.replace(/\$\{center\}([\s\S]*?)\$\{\/center\}/gi, '<div style="text-align: center;">$1</div>');
  text = text.replace(/\$\{center\}/gi, '<div style="text-align: center;">');
  text = text.replace(/\$\{pageBreak\}/gi, '<hr class="my-6 border-t-2 border-dashed border-gray-300" />');
  text = text.replace(/\$\{pagebreak\}/gi, '<hr class="my-6 border-t-2 border-dashed border-gray-300" />');

  // 2. Strip any remaining raw ${...} placeholders
  text = text.replace(/\$\{([^}]+)\}/g, "");

  // 3. Convert markdown bold **text** to <strong>text</strong>
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // 4. Normalize HTML tags to lines
  const normalized = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|ul|ol|li)\b[^>]*>/gi, "");

  const rawLines = normalized.split("\n");
  const processedLines: string[] = [];
  let inRecipient = true;

  for (const raw of rawLines) {
    const line = raw.trim();
    const stripped = line.replace(/<[^>]+>/g, "").trim();

    if (!stripped) {
      if (!inRecipient && processedLines.length > 0 && processedLines[processedLines.length - 1] !== "<br />") {
        processedLines.push("<br />");
      }
      continue;
    }

    const isSalutationOrBody =
      stripped.length > 70 ||
      /^(dear\b|subject\s*:|to whom|with reference|this has reference|we are pleased|with the following)/i.test(
        stripped,
      );

    if (inRecipient) {
      if (isSalutationOrBody) {
        inRecipient = false;
        processedLines.push("<br />"); // Clean gap before Dear...
      }
    }

    processedLines.push(line);
  }

  return processedLines.join("<br />");
}


export default function EmployeeLettersIndex() {
  const { employeeId } = useParams();
  const { lettersPromise } = useLoaderData<typeof loader>();
  const [searchString, setSearchString] = useState("");
  const [selectedLetter, setSelectedLetter] =
    useState<EmployeeLetterDatabaseRow | null>(null);

  const handlePrint = () => {
    if (!selectedLetter?.content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const cleanedContent = cleanLetterHtml(selectedLetter.content);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${selectedLetter.subject || "Employee Letter"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; color: #111; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ccc; padding-bottom: 15px; }
            .content { font-size: 14px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="content">${cleanedContent}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-4 py-2">
      <Suspense fallback={<LoadingSpinner className="h-1/3" />}>
        <Await resolve={lettersPromise}>
          {({ data, error }: { data: EmployeeLetterDatabaseRow[]; error: any }) => {
            if (error) {
              return (
                <ErrorBoundary
                  error={error}
                  message="Failed to load employee letters"
                />
              );
            }

            const letters = data || [];
            const filteredLetters = letters.filter((item) =>
              searchInObject(item, searchString),
            );

            return (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="relative w-full sm:w-72">
                    <Icon
                      name="search"
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      placeholder="Search letters..."
                      value={searchString}
                      onChange={(e) => setSearchString(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">
                    Total Letters: {filteredLetters.length}
                  </div>
                </div>

                {filteredLetters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center my-6">
                    <Icon
                      name="file-text"
                      className="h-12 w-12 text-muted-foreground mb-3"
                    />
                    <h3 className="text-base font-semibold">No letters found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {searchString
                        ? "No letters match your search criteria."
                        : "No letters have been generated for this employee yet."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredLetters.map((letter) => (
                      <Card
                        key={letter.id}
                        className="hover:shadow-md transition-shadow flex flex-col justify-between cursor-pointer border hover:border-primary/50"
                        onClick={() => setSelectedLetter(letter)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant="secondary" className="capitalize">
                              {formatLetterType(letter.letter_type)}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {letter.date
                                ? new Date(letter.date).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "N/A"}
                            </span>
                          </div>
                          {letter.subject && (
                            <CardTitle className="text-sm font-semibold mt-2 line-clamp-2">
                              {letter.subject}
                            </CardTitle>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground space-y-3">
                          {letter.content && (
                            <div
                              className="line-clamp-3 text-foreground/80 text-xs"
                              dangerouslySetInnerHTML={{
                                __html: cleanLetterHtml(letter.content),
                              }}
                            />
                          )}
                          <div className="flex items-center justify-end pt-2 border-t text-primary font-medium text-xs gap-1">
                            <span>Read Letter</span>
                            <Icon name="chevron-right" className="h-3.5 w-3.5" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Letter Reading Modal */}
                <Dialog
                  open={Boolean(selectedLetter)}
                  onOpenChange={(open) => {
                    if (!open) setSelectedLetter(null);
                  }}
                >
                  <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                    <DialogHeader className="border-b pb-3">
                      <div className="flex items-center justify-between gap-4 pr-6">
                        <div>
                          <DialogTitle className="text-lg font-semibold">
                            {selectedLetter?.subject || formatLetterType(selectedLetter?.letter_type || "")}
                          </DialogTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Generated on:{" "}
                            {selectedLetter?.date
                              ? new Date(selectedLetter.date).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "long",
                                  year: "numeric",
                                })
                              : "N/A"}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {formatLetterType(selectedLetter?.letter_type || "")}
                        </Badge>
                      </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900 rounded-md my-2 border">
                      {selectedLetter?.content ? (
                        <div
                          className="prose dark:prose-invert max-w-none text-sm leading-relaxed bg-background p-8 rounded border shadow-sm"
                          dangerouslySetInnerHTML={{
                            __html: cleanLetterHtml(selectedLetter.content),
                          }}
                        />

                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-10">
                          No content available for this letter.
                        </p>
                      )}
                    </div>

                    <DialogFooter className="flex items-center justify-between border-t pt-3 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrint}
                        className="flex items-center gap-1.5"
                      >
                        <Icon name="printer" className="h-4 w-4" />
                        <span>Print / Save PDF</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSelectedLetter(null)}
                      >
                        Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            );
          }}
        </Await>
      </Suspense>
    </div>
  );
}
