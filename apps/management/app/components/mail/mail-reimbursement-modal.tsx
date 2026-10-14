import { useState, useMemo } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export interface BulkRowItem {
  id: string;
  employeeId: string;
  name: string;
  amount: string;
  type: string;
  note: string;
  advanceId?: string;
}

interface MailReimbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  reimbursementData: any;
  setReimbursementData: React.Dispatch<React.SetStateAction<any>>;
  modalStep: "advance" | "reimbursement";
  bulkRows: BulkRowItem[];
  setBulkRows: React.Dispatch<React.SetStateAction<BulkRowItem[]>>;
  modalCompanyId: string;
  setModalCompanyId: (id: string) => void;
  companies: any[];
  allEmployees: any[];
  employees: any[];
  allUsers: any[];
  users: any[];
  isSending: boolean;
}

function employeeBelongsToSite(emp: any, locationText?: string): boolean {
  if (!emp || !locationText || locationText.length < 2) return false;

  const normLoc = locationText.toLowerCase().replace(/[^a-z0-9]/g, " ");
  const locTokens = normLoc
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/location|branch|site/i.test(t));
  if (locTokens.length === 0) return false;

  const empSiteFields: string[] = [];

  const addField = (val: any) => {
    if (typeof val === "string" && val.trim()) {
      empSiteFields.push(val.toLowerCase());
    }
  };

  addField(emp.site);
  addField(emp.site_name);
  addField(emp.location);
  addField(emp.branch);
  addField(emp.city);
  addField(emp.state);

  if (emp.work_details) {
    addField(emp.work_details.site_name);
    addField(emp.work_details.site?.name);
    addField(emp.work_details.sites?.name);
    addField(emp.work_details.site?.company_locations?.name);
    addField(emp.work_details.site?.company_locations?.city);
    addField(emp.work_details.site?.company_locations?.state);
    addField(emp.work_details.sites?.company_locations?.name);
    addField(emp.work_details.sites?.company_locations?.city);
    addField(emp.work_details.sites?.company_locations?.state);
  }

  if (emp.employeeProjectAssignmentData) {
    addField(emp.employeeProjectAssignmentData.location);
    addField(emp.employeeProjectAssignmentData.project_assignment_location);
    addField(emp.employeeProjectAssignmentData.site?.name);
    addField(emp.employeeProjectAssignmentData.sites?.company_locations?.name);
  }

  const combinedEmpSiteStr = empSiteFields.join(" ");
  if (!combinedEmpSiteStr) return false;

  return locTokens.some((token) => combinedEmpSiteStr.includes(token));
}

export function MailReimbursementModal({
  isOpen,
  onClose,
  reimbursementData,
  setReimbursementData,
  modalStep,
  bulkRows,
  setBulkRows,
  modalCompanyId,
  setModalCompanyId,
  companies,
  allEmployees,
  employees,
  allUsers,
  users,
  isSending,
}: MailReimbursementModalProps) {
  const getAvailableUsers = (companyIdFilter?: string) => {
    const userList =
      (allUsers as any[]).length > 0
        ? (allUsers as any[])
        : (users as any[]);
    if (!companyIdFilter) return userList;
    const filtered = userList.filter((u) => u.company_id === companyIdFilter);
    return filtered.length > 0 ? filtered : userList;
  };

  const handleAddBulkRow = () => {
    setBulkRows((prev) => [
      ...prev,
      {
        id: `bulk_${Math.random().toString(36).substring(2, 9)}`,
        employeeId: "",
        name: "",
        amount: "",
        type: "expenses",
        note: "",
      },
    ]);
  };

  const handleUpdateBulkRow = (id: string, field: string, value: string) => {
    setBulkRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveBulkRow = (id: string) => {
    setBulkRows((prev) => prev.filter((row) => row.id !== id));
  };

  const getAvailableEmployees = (
    companyIdFilter?: string,
    searchNameHint?: string,
    locationHint?: string
  ) => {
    const empList =
      (allEmployees as any[]).length > 0
        ? (allEmployees as any[])
        : (employees as any[]);
    if (!empList || empList.length === 0) return [];

    const baseList = empList;

    const locText = locationHint || reimbursementData?.location || "";
    const nameHint = (searchNameHint || reimbursementData?.name || "").trim().toLowerCase();
    const nameTokens: string[] = nameHint ? nameHint.split(/\s+/).filter((t: string) => t.length >= 2) : [];

    const scored = baseList.map((emp: any) => {
      let score = 0;
      const fn = (emp.first_name || "").toLowerCase();
      const mn = (emp.middle_name || "").toLowerCase();
      const ln = (emp.last_name || "").toLowerCase();
      const code = (emp.employee_code || "").toLowerCase();
      const full = `${fn} ${mn} ${ln}`.trim();

      if (nameTokens.length > 0) {
        const matchesName = nameTokens.some(
          (t: string) => fn.includes(t) || mn.includes(t) || ln.includes(t) || code.includes(t) || full.includes(t)
        );
        if (matchesName) score += 20;

        if (nameTokens.length >= 2 && nameTokens.every((t: string) => full.includes(t))) {
          score += 10;
        }
      }

      if (locText && employeeBelongsToSite(emp, locText)) {
        score += 5;
      }

      if (companyIdFilter && emp.company_id === companyIdFilter) {
        score += 1;
      }

      return { emp, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const nameA = `${a.emp.first_name || ""} ${a.emp.last_name || ""}`.trim();
      const nameB = `${b.emp.first_name || ""} ${b.emp.last_name || ""}`.trim();
      return nameA.localeCompare(nameB);
    });

    let result = scored.map((s) => s.emp);

    if (searchNameHint && searchNameHint.trim().length > 0) {
      const searchClean = searchNameHint.trim().toLowerCase();
      const tokens: string[] = searchClean.split(/\s+/).filter((t: string) => t.length >= 2);
      if (tokens.length > 0) {
        const filteredBySearch = scored.filter(({ emp, score }) => {
          if (score >= 20) return true;
          const fn = (emp.first_name || "").toLowerCase();
          const mn = (emp.middle_name || "").toLowerCase();
          const ln = (emp.last_name || "").toLowerCase();
          const code = (emp.employee_code || "").toLowerCase();
          const full = `${fn} ${mn} ${ln}`.trim();
          return tokens.some((t: string) => full.includes(t) || code.includes(t));
        });
        if (filteredBySearch.length > 0) {
          result = filteredBySearch.map((s) => s.emp);
        }
      }
    }

    const selectedIds = new Set<string>();
    if (reimbursementData?.employeeId) selectedIds.add(reimbursementData.employeeId);
    bulkRows.forEach((r) => {
      if (r.employeeId) selectedIds.add(r.employeeId);
    });

    selectedIds.forEach((empId) => {
      const emp = empList.find((e: any) => e.id === empId);
      if (emp && !result.some((e: any) => e.id === emp.id)) {
        result = [emp, ...result];
      }
    });

    return result;
  };

  const SearchableEmployeeSelect = ({
    value,
    onValueChange,
    nameHint,
    locationHint,
    companyId,
    className,
  }: {
    value?: string;
    onValueChange: (val: string) => void;
    nameHint?: string;
    locationHint?: string;
    companyId?: string;
    className?: string;
  }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const availableEmployees = useMemo(() => {
      return getAvailableEmployees(companyId, nameHint, locationHint);
    }, [companyId, nameHint, locationHint]);

    const selectedEmp = useMemo(() => {
      if (!value) return null;
      const empList = (allEmployees as any[]).length > 0 ? (allEmployees as any[]) : (employees as any[]);
      return empList.find((e: any) => e.id === value);
    }, [value]);

    const displayLabel = selectedEmp
      ? `${selectedEmp.employee_code ? `[${selectedEmp.employee_code}] ` : ""}${[
          selectedEmp.first_name,
          selectedEmp.middle_name,
          selectedEmp.last_name,
        ]
          .filter(Boolean)
          .join(" ") || selectedEmp.email || selectedEmp.id}${
          selectedEmp.site
            ? ` (${selectedEmp.site})`
            : selectedEmp.location
            ? ` (${selectedEmp.location})`
            : ""
        }`
      : "Select Employee";

    const filtered = useMemo(() => {
      if (!search.trim()) return availableEmployees;
      const q = search.toLowerCase().trim();
      return availableEmployees.filter((emp: any) => {
        const full = `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`.toLowerCase();
        const code = (emp.employee_code || "").toLowerCase();
        const email = (emp.email || emp.personal_email || "").toLowerCase();
        const site = (emp.site || emp.location || "").toLowerCase();
        return full.includes(q) || code.includes(q) || email.includes(q) || site.includes(q);
      });
    }, [search, availableEmployees]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left font-normal truncate",
              className
            )}
          >
            <span className={cn("truncate", !selectedEmp && "text-muted-foreground")}>
              {displayLabel}
            </span>
            <Icon name="search" className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-2 shadow-xl border rounded-xl" align="start">
          <div className="space-y-2">
            <div className="relative">
              <Input
                placeholder="Search name, code, site..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs pr-7"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs font-bold"
                >
                  ×
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-border/40">
              {filtered.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No employee found matching &quot;{search}&quot;
                </div>
              ) : (
                filtered.map((emp: any) => {
                  const code = emp.employee_code ? `[${emp.employee_code}] ` : "";
                  const empName =
                    [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") ||
                    emp.email ||
                    emp.personal_email ||
                    emp.id;
                  const siteStr = emp.site ? ` (${emp.site})` : emp.location ? ` (${emp.location})` : "";
                  const isSelected = emp.id === value;

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        onValueChange(emp.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between",
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      <div className="truncate pr-2">
                        <span className={isSelected ? "text-primary-foreground" : "font-mono font-bold text-primary"}>
                          {code}
                        </span>
                        <span>{empName}</span>
                        <span className={isSelected ? "text-primary-foreground/80 text-[10px]" : "text-muted-foreground text-[10px]"}>
                          {siteStr}
                        </span>
                      </div>
                      {isSelected && <Icon name="check-circle" className="h-3 w-3 shrink-0 ml-1" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  if (!isOpen || !reimbursementData) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`bg-card border rounded-2xl ${
          bulkRows.length > 0 ? "max-w-3xl" : "max-w-xl"
        } w-full flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b flex items-center justify-between bg-card/80">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              {modalStep === "advance" ? (
                <>
                  <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[11px] uppercase font-extrabold tracking-wider border border-primary/30">
                    Step 1 of 2
                  </span>
                  {bulkRows.length > 0
                    ? `Add Bulk Advances (${bulkRows.length} Claims Detected)`
                    : "Add Employee Advance"}
                </>
              ) : (
                <>
                  {bulkRows.length > 0
                    ? `Add Bulk Reimbursements (${bulkRows.length} Claims Detected)`
                    : "Add Reimbursement"}
                </>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {modalStep === "advance"
                ? "Step 1: Create Employee Advances in Employee Details tab. Submitting will create advances and automatically open Step 2 for Reimbursement claims."
                : "Review pre-filled reimbursement claim details autofilled from email and click Submit to create."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon name="cross" className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <Form method="post" className="p-6 space-y-4">
          <input
            type="hidden"
            name="intent"
            value={modalStep === "advance" ? "create_advances_step1" : "create_reimbursement"}
          />
          {reimbursementData?.advanceId && (
            <input
              type="hidden"
              name="advance_id"
              value={reimbursementData.advanceId}
            />
          )}
          {bulkRows.length > 0 && (
            <input
              type="hidden"
              name="bulk_items_json"
              value={JSON.stringify(bulkRows)}
            />
          )}

          {bulkRows.length > 0 ? (
            /* BULK REIMBURSEMENT MODE UI */
            <div className="space-y-4">
              {modalStep === "advance" ? (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-primary font-medium">
                  <span>
                    <strong>Step 1 (Advance Creation):</strong> Creating Advance records in Employee Details tab for {bulkRows.length} employee(s).
                  </span>
                  <span className="font-bold text-xs bg-primary/20 px-2 py-0.5 rounded-md border border-primary/20 shrink-0">
                    Total: ₹{bulkRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString("en-IN")}
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-primary font-medium">
                  <span>
                    <strong>Reimbursement Claim:</strong> Generating Reimbursement claims autofilled from email.
                  </span>
                  <span className="font-bold text-xs bg-primary/20 px-2 py-0.5 rounded-md border border-primary/20 shrink-0">
                    Total: ₹{bulkRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Submitted Date</label>
                  <Input
                    key={`date_${reimbursementData?.date || ""}`}
                    type="date"
                    name="submitted_date"
                    defaultValue={reimbursementData?.date}
                    required
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Company</label>
                  <Select
                    name="company_id"
                    value={modalCompanyId}
                    onValueChange={(val) => {
                      setModalCompanyId(val);
                      if (reimbursementData) {
                        const availEmps = getAvailableEmployees(val);
                        const isEmpValid = availEmps.some((e: any) => e.id === reimbursementData.employeeId);
                        const newEmpId = isEmpValid ? reimbursementData.employeeId : (availEmps[0]?.id || "");
                        const availUsers = getAvailableUsers(val);
                        const isUserValid = availUsers.some((u: any) => u.id === reimbursementData.userId);
                        const newUserId = isUserValid ? reimbursementData.userId : (availUsers[0]?.id || "");
                        setReimbursementData((prev: any) => ({
                          ...prev,
                          companyId: val,
                          employeeId: newEmpId,
                          userId: newUserId,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Company" />
                    </SelectTrigger>
                    <SelectContent>
                      {((companies as any[]) || []).map((comp) => (
                        <SelectItem key={comp.id} value={comp.id}>
                          {comp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Approved By</label>
                  <Select
                    key={`user_bulk_${modalCompanyId}_${reimbursementData?.userId || ""}`}
                    name="user_id"
                    value={reimbursementData?.userId || ""}
                    onValueChange={(val) =>
                      setReimbursementData((prev: any) => ({ ...prev, userId: val }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Authority" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableUsers(modalCompanyId).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.email} {[u.first_name, u.last_name].filter(Boolean).join(" ") ? `(${[u.first_name, u.last_name].filter(Boolean).join(" ")})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Bulk Claim Rows Table */}
              <div className="border rounded-xl overflow-hidden bg-background">
                <div className="bg-muted/60 px-3 py-2 border-b grid grid-cols-12 gap-2 text-[11px] font-bold text-muted-foreground uppercase">
                  <div className="col-span-4">Employee</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-2">Amount (₹)</div>
                  <div className="col-span-3">Note</div>
                  <div className="col-span-1 text-center">Del</div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y">
                  {bulkRows.map((row) => (
                    <div key={row.id} className="p-2 grid grid-cols-12 gap-2 items-center text-xs hover:bg-muted/30">
                      <div className="col-span-4">
                        <SearchableEmployeeSelect
                          value={row.employeeId || ""}
                          onValueChange={(val) => handleUpdateBulkRow(row.id, "employeeId", val)}
                          nameHint={row.name}
                          locationHint={reimbursementData?.location}
                          companyId={modalCompanyId}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <Select
                          value={row.type || "expenses"}
                          onValueChange={(val) => handleUpdateBulkRow(row.id, "type", val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="expenses">Expenses</SelectItem>
                            <SelectItem value="advances">Advances</SelectItem>
                            <SelectItem value="travel">Travel</SelectItem>
                            <SelectItem value="medical">Medical</SelectItem>
                            <SelectItem value="loan">Loan</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => handleUpdateBulkRow(row.id, "amount", e.target.value)}
                          placeholder="Amount"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          value={row.note}
                          onChange={(e) => handleUpdateBulkRow(row.id, "note", e.target.value)}
                          placeholder="Note / Purpose"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveBulkRow(row.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-2 border-t bg-muted/20 flex justify-between items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddBulkRow}
                    className="h-7 text-xs text-primary font-medium gap-1"
                  >
                    <Icon name="plus" className="h-3 w-3" />
                    Add Another Employee Claim
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {bulkRows.length} item(s) to process
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* SINGLE REIMBURSEMENT MODE UI */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Submitted Date</label>
                  <Input
                    key={`date_${reimbursementData?.date || ""}`}
                    type="date"
                    name="submitted_date"
                    defaultValue={reimbursementData?.date}
                    required
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Receipt Link (Optional)</label>
                  <Input
                    key={`receipt_${reimbursementData?.receipt_url || ""}`}
                    type="url"
                    name="receipt_url"
                    defaultValue={reimbursementData?.receipt_url}
                    placeholder="https://..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Type</label>
                  <Select
                    key={`single_type_${reimbursementData?.type || ""}`}
                    name="type"
                    value={reimbursementData?.type || "expenses"}
                    onValueChange={(val) =>
                      setReimbursementData((prev: any) => ({ ...prev, type: val }))
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expenses">Expenses</SelectItem>
                      <SelectItem value="advances">Advances</SelectItem>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="medical">Medical</SelectItem>
                      <SelectItem value="loan">Loan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Note</label>
                  <Input
                    key={`single_note_${reimbursementData?.note || ""}`}
                    name="note"
                    defaultValue={reimbursementData?.note}
                    placeholder="Enter Note"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Company</label>
                  <Select
                    name="company_id"
                    value={modalCompanyId}
                    onValueChange={(val) => {
                      setModalCompanyId(val);
                      if (reimbursementData) {
                        const availEmps = getAvailableEmployees(val);
                        const isEmpValid = availEmps.some((e: any) => e.id === reimbursementData.employeeId);
                        const newEmpId = isEmpValid ? reimbursementData.employeeId : (availEmps[0]?.id || "");
                        const availUsers = getAvailableUsers(val);
                        const isUserValid = availUsers.some((u: any) => u.id === reimbursementData.userId);
                        const newUserId = isUserValid ? reimbursementData.userId : (availUsers[0]?.id || "");
                        setReimbursementData((prev: any) => ({
                          ...prev,
                          companyId: val,
                          employeeId: newEmpId,
                          userId: newUserId,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select Company" />
                    </SelectTrigger>
                    <SelectContent>
                      {((companies as any[]) || []).map((comp) => (
                        <SelectItem key={comp.id} value={comp.id}>
                          {comp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Select Employee</label>
                  <SearchableEmployeeSelect
                    value={reimbursementData?.employeeId || ""}
                    onValueChange={(val) =>
                      setReimbursementData((prev: any) => ({ ...prev, employeeId: val }))
                    }
                    nameHint={reimbursementData?.name}
                    locationHint={reimbursementData?.location}
                    companyId={modalCompanyId}
                    className="h-9 text-xs"
                  />
                  <input type="hidden" name="employee_id" value={reimbursementData?.employeeId || ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Amount</label>
                  <Input
                    key={`single_amount_${reimbursementData?.amount || ""}`}
                    type="number"
                    name="amount"
                    step="0.01"
                    defaultValue={reimbursementData?.amount}
                    placeholder="Enter Amount"
                    required
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Approved By</label>
                  <Select
                    key={`single_user_${modalCompanyId}_${reimbursementData?.userId || ""}`}
                    name="user_id"
                    value={reimbursementData?.userId || ""}
                    onValueChange={(val) =>
                      setReimbursementData((prev: any) => ({ ...prev, userId: val }))
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select Authority" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableUsers(modalCompanyId).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.email} {[u.first_name, u.last_name].filter(Boolean).join(" ") ? `(${[u.first_name, u.last_name].filter(Boolean).join(" ")})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSending || (bulkRows.length > 0 && bulkRows.length === 0)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold px-4"
            >
              {isSending
                ? "Submitting..."
                : modalStep === "advance"
                  ? bulkRows.length > 0
                    ? `Create ${bulkRows.length} Advances & Continue to Reimbursements →`
                    : "Create Advance & Continue →"
                  : bulkRows.length > 0
                    ? `Submit ${bulkRows.length} Reimbursements`
                    : "Submit Reimbursement"}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
