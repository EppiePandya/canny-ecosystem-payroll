import { useState } from "react";
import { Form } from "@remix-run/react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";

interface MailComposeViewProps {
  mailType: string | null;
  onSelectMailType: (type: string) => void;
  invoices: any[];
  approvedPayrolls: any[];
  attachedInvoices: any[];
  onSelectInvoice: (invoiceId: string) => void;
  onRemoveInvoice: (id: string) => void;
  attachedSalaryRuns: any[];
  onSelectSalaryRun: (payrollId: string) => void;
  onRemoveSalaryRun: (id: string) => void;
  users: any[];
  senderEmail: string;
  senderName: string;
  subject: string;
  setSubject: (subject: string) => void;
  body: string;
  setBody: (body: string) => void;
  selectedUsers: string[];
  setSelectedUsers: React.Dispatch<React.SetStateAction<string[]>>;
  isSending: boolean;
}

export function MailComposeView({
  mailType,
  onSelectMailType,
  invoices,
  approvedPayrolls,
  attachedInvoices,
  onSelectInvoice,
  onRemoveInvoice,
  attachedSalaryRuns,
  onSelectSalaryRun,
  onRemoveSalaryRun,
  users,
  senderEmail,
  senderName,
  subject,
  setSubject,
  body,
  setBody,
  selectedUsers,
  setSelectedUsers,
  isSending,
}: MailComposeViewProps) {
  const [search, setSearch] = useState("");

  const filteredUsers = (users as any[]).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q)
    );
  });

  const toggleUser = (email: string) => {
    setSelectedUsers((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const selectAll = () => {
    const allEmails = filteredUsers.map((u) => u.email).filter(Boolean);
    setSelectedUsers(allEmails);
  };

  const clearAll = () => setSelectedUsers([]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto w-full space-y-6 py-2 pr-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
          <Icon name="email" className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Compose Mail</h1>
          <p className="text-xs text-muted-foreground">
            Send emails and attachments to your team
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Select Mail Category
          </label>
          <p className="text-xs text-muted-foreground">
            Select what type of email/attachment you are sending.
          </p>
        </div>

        <Select
          value={mailType || undefined}
          onValueChange={onSelectMailType}
        >
          <SelectTrigger className="w-full h-10 bg-background border-border">
            <SelectValue placeholder="Choose what you want to send..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invoice">Invoice PDF</SelectItem>
            <SelectItem value="salary">Salary Slips</SelectItem>
            <SelectItem value="custom">Custom / Blank Mail</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!mailType ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card/30">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Icon name="email" className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            No Category Selected
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Please choose what you want to send from the dropdown above to open
            the composer form.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {mailType === "invoice" && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Invoice to Attach
                </label>
                <p className="text-xs text-muted-foreground">
                  Choose from existing invoices to attach as PDF.
                </p>
              </div>

              <Select onValueChange={onSelectInvoice}>
                <SelectTrigger className="w-full h-10 bg-background border-border">
                  <SelectValue placeholder="Select an invoice..." />
                </SelectTrigger>
                <SelectContent>
                  {invoices.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No invoices found
                    </SelectItem>
                  ) : (
                    invoices.map((inv: any) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoice_number} ({inv.type} ·{" "}
                        {new Date(inv.date).toLocaleDateString("en-IN")})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {attachedInvoices.length > 0 && (
                <div className="space-y-2 mt-4 pt-4 border-t border-border">
                  <h3 className="text-xs font-semibold text-foreground">
                    Attached Invoices
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {attachedInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5 shadow-sm text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground block truncate">
                            {inv.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {inv.subject || "No Subject"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveInvoice(inv.id)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <Icon name="cross" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {mailType === "salary" && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Salary Payroll Run
                </label>
                <p className="text-xs text-muted-foreground">
                  Choose from approved payroll runs to attach salary slips as PDF.
                </p>
              </div>

              <Select onValueChange={onSelectSalaryRun}>
                <SelectTrigger className="w-full h-10 bg-background border-border">
                  <SelectValue placeholder="Select a payroll run..." />
                </SelectTrigger>
                <SelectContent>
                  {approvedPayrolls.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No approved payrolls found
                    </SelectItem>
                  ) : (
                    approvedPayrolls.map((run: any) => (
                      <SelectItem key={run.id} value={run.id}>
                        {run.title || `Payroll Run ${run.month}-${run.year}`}{" "}
                        (Rs. {run.total_net_amount?.toLocaleString("en-IN")})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {attachedSalaryRuns.length > 0 && (
                <div className="space-y-2 mt-4 pt-4 border-t border-border">
                  <h3 className="text-xs font-semibold text-foreground">
                    Attached Salary Runs
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {attachedSalaryRuns.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5 shadow-sm text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground block truncate">
                            {run.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {run.subject || "No Subject"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveSalaryRun(run.id)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <Icon name="cross" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Form
            method="post"
            encType="multipart/form-data"
            className="space-y-5"
          >
            <input
              type="hidden"
              name="selectedInvoices"
              value={JSON.stringify(attachedInvoices)}
            />
            <input
              type="hidden"
              name="selectedSalaryRuns"
              value={JSON.stringify(attachedSalaryRuns)}
            />

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                From (Sender)
              </label>
              <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg bg-muted/40 border border-border">
                <Icon
                  name="email"
                  className="h-4 w-4 text-muted-foreground flex-shrink-0"
                />
                <span className="text-sm font-medium text-foreground">
                  {senderName} &lt;{senderEmail}&gt;
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  To (Recipients)
                </label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-primary hover:underline font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Icon
                    name="magnifying-glass"
                    className="h-4 w-4 text-muted-foreground"
                  />
                </div>
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm focus-visible:ring-0 shadow-none mb-2"
                />
              </div>

              <Select
                onValueChange={(email) => {
                  if (
                    email &&
                    email !== "none" &&
                    !selectedUsers.includes(email)
                  ) {
                    setSelectedUsers((prev) => [...prev, email]);
                  }
                }}
              >
                <SelectTrigger className="w-full h-10 bg-background border-border">
                  <SelectValue placeholder="Select a recipient..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No users found
                    </SelectItem>
                  ) : (
                    filteredUsers.map((u: any) => {
                      const fullName =
                        [u.first_name, u.last_name]
                          .filter(Boolean)
                          .join(" ") || u.email;
                      return (
                        <SelectItem
                          key={u.id}
                          value={u.email}
                          disabled={selectedUsers.includes(u.email)}
                        >
                          {fullName} ({u.email})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>

              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                  {selectedUsers.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => toggleUser(email)}
                        className="hover:opacity-70"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <input
              type="hidden"
              name="to"
              value={selectedUsers.join(",")}
            />

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Subject
              </label>
              <Input
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
                required
                className="h-10 focus-visible:ring-0 shadow-none"
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Message
              </label>
              <textarea
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={8}
                placeholder="Write your message here..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Attachments (PDF, Excel, Invoices, etc.)
              </label>
              <Input
                type="file"
                name="attachments"
                multiple
                className="h-10 focus-visible:ring-0 shadow-none cursor-pointer file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <Button
                type="submit"
                disabled={isSending || selectedUsers.length === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-foreground" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Icon name="email" className="h-4 w-4" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          </Form>
        </div>
      )}
    </div>
  );
}
