import { useNavigate } from "@remix-run/react";
import { Button } from "@canny_ecosystem/ui/button";
import type { InboxEmail } from "@/utils/server/imap.server";
import {
  getCompanyForEmail,
  findBestEmployeeMatch,
  getReimbursementCategory,
} from "./mail-helpers";

interface MailDetailViewProps {
  selectedEmail: InboxEmail;
  onBack: () => void;
  senderEmail: string;
  showEmailHeaderDetails: boolean;
  setShowEmailHeaderDetails: React.Dispatch<React.SetStateAction<boolean>>;
  allUsers: any[];
  allEmployees: any[];
  employees: any[];
  companies: any[];
  onAddAttendance: (email: InboxEmail) => void;
  onAddEmployeeFromEmail: (email: InboxEmail) => void;
  onGenerateReimbursement: (email: InboxEmail) => void;
  onOpenAttachmentPreview: (att: any) => void;
  onSelectEmail: (email: InboxEmail) => void;
  emailFetcherState?: string;
}

export function MailDetailView({
  selectedEmail,
  onBack,
  senderEmail,
  showEmailHeaderDetails,
  setShowEmailHeaderDetails,
  allUsers,
  allEmployees,
  employees,
  companies,
  onAddAttendance,
  onAddEmployeeFromEmail,
  onGenerateReimbursement,
  onOpenAttachmentPreview,
  onSelectEmail,
  emailFetcherState,
}: MailDetailViewProps) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto w-full space-y-4 animate-in fade-in duration-150 pr-1">
      {/* Top Navigation Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border rounded-xl p-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-8 px-3 text-xs font-semibold gap-1.5 shrink-0"
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
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back to Inbox
          </Button>

          <div className="min-w-0 flex items-center gap-2">
            <h2 className="text-sm md:text-base font-bold text-foreground truncate">
              {selectedEmail.subject}
            </h2>
            {(() => {
              const compInfo = getCompanyForEmail(
                selectedEmail,
                allUsers || [],
                allEmployees || [],
                companies || []
              );
              return compInfo.companyName ? (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0 flex items-center gap-1">
                  🏢 {compInfo.companyName}
                </span>
              ) : null;
            })()}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground self-end sm:self-center">
          <span>
            {new Date(selectedEmail.date).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>

      {/* Sender Header Card */}
      {(() => {
        const compInfo = getCompanyForEmail(
          selectedEmail,
          allUsers || [],
          allEmployees || [],
          companies || []
        );
        const empMatch = findBestEmployeeMatch(
          selectedEmail.from.address,
          selectedEmail.from.name,
          (allEmployees?.length ? allEmployees : employees) || []
        );
        return (
          <div
            onClick={() => setShowEmailHeaderDetails((prev) => !prev)}
            className="bg-card border rounded-xl p-4 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0 uppercase border border-primary/30">
                  {(
                    selectedEmail.from.name ||
                    selectedEmail.from.address ||
                    "U"
                  ).charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-foreground truncate">
                      {selectedEmail.from.name || selectedEmail.from.address}
                    </h3>
                    {selectedEmail.from.name && (
                      <span className="text-xs text-muted-foreground truncate">
                        &lt;{selectedEmail.from.address}&gt;
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    to {selectedEmail.to || senderEmail}
                    <span className="text-primary text-[10px] font-semibold underline ml-1">
                      {showEmailHeaderDetails
                        ? "Hide Details ▲"
                        : "Show Details ▼"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-[11px] font-medium hidden sm:inline">
                  {new Date(selectedEmail.date).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <div className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform duration-200 ${
                      showEmailHeaderDetails ? "rotate-180" : ""
                    }`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Expanded Details Drawer (Gmail Style) */}
            {showEmailHeaderDetails && (
              <div className="pt-3 border-t border-border space-y-1.5 text-xs text-muted-foreground bg-muted/20 p-3 rounded-xl animate-in fade-in duration-150 font-sans">
                <div className="flex items-baseline gap-4">
                  <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                    from:
                  </span>
                  <span className="text-foreground font-semibold">
                    {selectedEmail.from.name ? `${selectedEmail.from.name} ` : ""}
                    &lt;{selectedEmail.from.address}&gt;
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                    to:
                  </span>
                  <span className="text-foreground font-medium">
                    Canny Groups &lt;{selectedEmail.to || senderEmail}&gt;
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                    date:
                  </span>
                  <span className="text-foreground font-medium">
                    {new Date(selectedEmail.date).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                    subject:
                  </span>
                  <span className="text-foreground font-medium">
                    {selectedEmail.subject}
                  </span>
                </div>
                {selectedEmail.from.address &&
                  selectedEmail.from.address.includes("@") && (
                    <>
                      <div className="flex items-baseline gap-4">
                        <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                          mailed-by:
                        </span>
                        <span className="text-foreground font-medium">
                          {selectedEmail.from.address.split("@")[1]}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-4">
                        <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                          Signed by:
                        </span>
                        <span className="text-foreground font-medium">
                          {selectedEmail.from.address.split("@")[1]}
                        </span>
                      </div>
                    </>
                  )}
                <div className="flex items-baseline gap-4">
                  <span className="w-20 text-right font-medium text-muted-foreground shrink-0">
                    security:
                  </span>
                  <span className="text-foreground font-medium flex items-center gap-1">
                    🔒 Standard encryption (TLS)
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Reimbursement / Attendance / New Joinee Claim Banner */}
      {getReimbursementCategory(selectedEmail) === "Attendance" ? (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                📅 Attendance Sheet Detected
                <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  ✨ Attendance Sheet
                </span>
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Attendance sheet detected in this mail. Click &quot;Add Attendance&quot; to open entry page pre-filled with values.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onAddAttendance(selectedEmail)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shrink-0 shadow-md font-semibold"
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
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
              <path d="M12 14v4" />
              <path d="M10 16h4" />
            </svg>
            Add Attendance
          </Button>
        </div>
      ) : getReimbursementCategory(selectedEmail) === "New Joinee" ? (
        <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                👤 New Joinee Details Detected
                <span className="text-[10px] font-medium bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                  ✨ New Joinee
                </span>
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Gemini AI identified new joinee / employee joining details in this mail. Click &quot;Add Employee&quot; to navigate to employee creation.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onAddEmployeeFromEmail(selectedEmail)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 shrink-0 shadow-md font-semibold"
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" x2="19" y1="8" y2="14" />
              <line x1="16" x2="22" y1="11" y2="11" />
            </svg>
            Add Employee
          </Button>
        </div>
      ) : getReimbursementCategory(selectedEmail) === "Employee Left" ? (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                🚪 Employee Exit / Resignation Detected
                <span className="text-[10px] font-medium bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20 flex items-center gap-1">
                  ✨ Employee Left
                </span>
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Gemini AI identified employee exit / resignation details in this mail. Click &quot;Process Exit&quot; to manage employee exits.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate("/employees/exits")}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5 shrink-0 shadow-md font-semibold"
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Process Exit
          </Button>
        </div>
      ) : getReimbursementCategory(selectedEmail) ? (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                {getReimbursementCategory(selectedEmail)} Claim Detected
                <span className="text-[10px] font-medium bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                  ✨ Gemini AI Analyzed
                </span>
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Gemini AI identified this claim. Create a website reimbursement claim pre-filled with data from this mail.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onGenerateReimbursement(selectedEmail)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 shrink-0 shadow-md font-semibold"
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
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            Generate Reimbursement
          </Button>
        </div>
      ) : null}

      {/* Full Page Mail Content Body */}
      <div className="bg-card border rounded-xl p-6 min-h-[350px] shadow-sm">
        {emailFetcherState === "loading" || emailFetcherState === "submitting" || (!selectedEmail.html && !selectedEmail.text) ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-muted-foreground">
            <svg
              className="animate-spin h-7 w-7 text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <p className="text-xs font-medium text-foreground">Loading email content...</p>
            <p className="text-[11px] text-muted-foreground">Fetching complete email body and attachments</p>
          </div>
        ) : selectedEmail.html ? (
          <div
            className="prose dark:prose-invert max-w-none text-xs leading-relaxed bg-transparent text-foreground [&_*]:!bg-transparent [&_*]:!text-foreground"
            dangerouslySetInnerHTML={{
              __html: selectedEmail.html
                .replace(
                  /background-color\s*:\s*([^;"]+)/gi,
                  (match, val) => {
                    const v = val.trim().toLowerCase();
                    if (
                      v.includes("fff") ||
                      v.includes("255") ||
                      v.includes("white")
                    ) {
                      return "background-color: transparent";
                    }
                    return match;
                  }
                )
                .replace(
                  /background\s*:\s*([^;"]+)/gi,
                  (match, val) => {
                    const v = val.trim().toLowerCase();
                    if (
                      v.includes("fff") ||
                      v.includes("255") ||
                      v.includes("white")
                    ) {
                      return "background: transparent";
                    }
                    return match;
                  }
                ),
            }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-xs text-foreground leading-relaxed">
            {selectedEmail.text || selectedEmail.snippet || "(No content)"}
          </pre>
        )}

        {/* Attachments Section */}
        {selectedEmail.hasAttachments &&
          selectedEmail.attachments &&
          selectedEmail.attachments.length > 0 && (
            <div className="border-t border-border pt-4 mt-6">
              <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
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
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                Attachments ({selectedEmail.attachments.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {selectedEmail.attachments.map((att, index) => {
                  const isImage =
                    (att.contentType || "").startsWith("image/") ||
                    /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename);
                  const isPdf =
                    (att.contentType || "").includes("pdf") ||
                    /\.pdf$/i.test(att.filename);

                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-xl border bg-muted/30 text-xs shadow-sm hover:border-primary/40 transition-all gap-3"
                    >
                      <div
                        onClick={() => {
                          if (att.contentUrl) {
                            onOpenAttachmentPreview(att);
                          } else {
                            onSelectEmail(selectedEmail);
                          }
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
                      >
                        {isImage && att.contentUrl ? (
                          <img
                            src={att.contentUrl}
                            alt={att.filename}
                            className="w-10 h-10 object-cover rounded-lg border shrink-0 bg-background group-hover:scale-105 transition-transform"
                          />
                        ) : isPdf ? (
                          <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-500 font-bold flex items-center justify-center text-[10px] shrink-0 border border-red-500/20 group-hover:bg-red-500/20">
                            PDF
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 border border-emerald-500/20 uppercase group-hover:bg-emerald-500/20">
                            {att.filename.split(".").pop()?.slice(0, 4) ||
                              "XLS"}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <span
                            className="font-medium text-foreground block truncate group-hover:text-primary transition-colors"
                            title={att.filename}
                          >
                            {att.filename}
                          </span>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            {(att.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (att.contentUrl) {
                              onOpenAttachmentPreview(att);
                            } else {
                              onSelectEmail(selectedEmail);
                            }
                          }}
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          title={
                            att.contentUrl
                              ? "View / Preview Attachment"
                              : "Loading Attachment Details..."
                          }
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
                            className={
                              !att.contentUrl &&
                              emailFetcherState === "submitting"
                                ? "animate-spin"
                                : ""
                            }
                          >
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>

                        {att.contentUrl ? (
                          <a
                            href={att.contentUrl}
                            download={att.filename}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 font-semibold text-[11px]"
                            title="Download Attachment"
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
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectEmail(selectedEmail)}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 font-semibold text-[11px]"
                            title="Fetching Attachment Data..."
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
                              className={
                                emailFetcherState === "submitting"
                                  ? "animate-spin"
                                  : ""
                              }
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" x2="12" y1="15" y2="3" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
