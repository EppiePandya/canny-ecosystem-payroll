import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useFetcher, useLocation, useRevalidator } from "@remix-run/react";
import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import { useToast } from "@canny_ecosystem/ui/use-toast";

const formatAmount = (val: number) =>
  `₹${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export interface ReimbursementItem {
  id: string;
  amount: number | string;
  note?: string | null;
  type?: string | null;
  status?: string | null;
  submitted_date?: string | null;
  created_at?: string | null;
  employee_id?: string | null;
  employees?:
    | {
        first_name?: string | null;
        middle_name?: string | null;
        last_name?: string | null;
        employee_code?: string | null;
      }
    | {
        first_name?: string | null;
        middle_name?: string | null;
        last_name?: string | null;
        employee_code?: string | null;
      }[]
    | null;
}

export function AddReimbursementModal({
  isOpen,
  onOpenChange,
  payrollId,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  payrollId: string;
}) {
  const fetcher = useFetcher<any>();
  const submitFetcher = useFetcher<any>();
  const location = useLocation();
  const { revalidate } = useRevalidator();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch reimbursements when modal opens
  useEffect(() => {
    if (isOpen) {
      fetcher.load(`/payroll/run-payroll/${payrollId}/add-reimbursement`);
      setSelectedIds(new Set());
      setSearchQuery("");
    }
  }, [isOpen, payrollId]);

  // Handle success from submit fetcher & clear client cache
  useEffect(() => {
    if (submitFetcher.data) {
      if (submitFetcher.data.status === "success") {
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
        clearExactCacheEntry(cacheKeyPrefix.run_payroll);
        toast({
          title: "Success",
          description: submitFetcher.data.message,
          variant: "success",
        });
        revalidate();
        onOpenChange(false);
      } else if (submitFetcher.data.status === "info") {
        toast({
          title: "Info",
          description: submitFetcher.data.message,
          variant: "default",
        });
      } else if (submitFetcher.data.status === "error") {
        toast({
          title: "Error",
          description: submitFetcher.data.message,
          variant: "destructive",
        });
      }
    }
  }, [submitFetcher.data, payrollId, onOpenChange, toast, revalidate]);

  const reimbursements: ReimbursementItem[] = fetcher.data?.reimbursements || [];
  const isLoading = fetcher.state === "loading";
  const isSubmitting = submitFetcher.state === "submitting";

  const filteredReimbursements = reimbursements.filter((r) => {
    const emp: any = Array.isArray(r.employees) ? r.employees[0] : r.employees;
    const fullNameParts = `${emp?.first_name || ""} ${emp?.middle_name || ""} ${
      emp?.last_name || ""
    }`.trim();
    const fullName = (emp?.name || fullNameParts).toLowerCase();
    const code = (emp?.employee_code || "").toLowerCase();
    const note = (r.note || "").toLowerCase();
    const type = (r.type || "").toLowerCase();
    const q = searchQuery.toLowerCase();

    return (
      fullName.includes(q) || code.includes(q) || note.includes(q) || type.includes(q)
    );
  });

  const toggleSelectAll = () => {
    if (
      selectedIds.size === filteredReimbursements.length &&
      filteredReimbursements.length > 0
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReimbursements.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const totalSelectedAmount = reimbursements
    .filter((r) => selectedIds.has(r.id))
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const handleSubmit = () => {
    if (selectedIds.size === 0) return;

    submitFetcher.submit(
      {
        payrollId,
        selectedReimbursementIds: JSON.stringify(Array.from(selectedIds)),
      },
      {
        method: "POST",
        action: `/payroll/run-payroll/${payrollId}/add-reimbursement${location.search}`,
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 gap-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Icon name="plus-circled" className="h-5 w-5 text-primary" />
            Add Reimbursement to Payroll
          </DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search by employee name, code, note or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            <Icon
              name="magnifying-glass"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            />
          </div>
          {filteredReimbursements.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>
              {selectedIds.size === filteredReimbursements.length &&
              filteredReimbursements.length > 0
                ? "Deselect All"
                : "Select All"}
            </Button>
          )}
        </div>

        {/* List of Reimbursements */}
        <div className="flex-1 overflow-y-auto border rounded-md min-h-[250px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Icon name="spinner" className="h-6 w-6 animate-spin mr-2" />
              Loading reimbursements...
            </div>
          ) : filteredReimbursements.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Icon name="info-circled" className="h-8 w-8 text-muted-foreground/60" />
              <span>No reimbursements found.</span>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-muted/50 sticky top-0 border-b text-xs uppercase font-medium text-muted-foreground">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <Checkbox
                      checked={
                        selectedIds.size === filteredReimbursements.length &&
                        filteredReimbursements.length > 0
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Note / Type</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredReimbursements.map((r) => {
                  const isChecked = selectedIds.has(r.id);
                  const emp: any = Array.isArray(r.employees) ? r.employees[0] : r.employees;
                  const fullNameParts = `${emp?.first_name || ""} ${
                    emp?.middle_name || ""
                  } ${emp?.last_name || ""}`.trim();
                  const empName = emp?.name || fullNameParts || "N/A";
                  const empCode = emp?.employee_code || "";
                  const dateVal = r.submitted_date || r.created_at;
                  const formattedDate = dateVal
                    ? new Date(dateVal).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "-";

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-muted/40 cursor-pointer ${
                        isChecked ? "bg-primary/5" : ""
                      }`}
                      onClick={() => toggleSelect(r.id)}
                    >
                      <td
                        className="p-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="p-3 font-medium">
                        <div>{empName}</div>
                        {empCode && (
                          <div className="text-xs text-muted-foreground">
                            {empCode}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div>{r.note || r.type || "Reimbursement"}</div>
                        {r.type && r.note && (
                          <div className="text-xs text-muted-foreground">
                            {r.type}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize bg-secondary text-secondary-foreground border">
                          {r.status || "Approved"}
                        </span>
                      </td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">
                        {formatAmount(Number(r.amount) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info & Actions */}
        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
          <div className="text-sm font-medium">
            Selected: <span className="text-primary font-bold">{selectedIds.size}</span> item(s) (Total:{" "}
            <span className="text-primary font-bold">
              {formatAmount(totalSelectedAmount)}
            </span>
            )
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedIds.size === 0 || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Icon name="spinner" className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                `Add ${selectedIds.size} Reimbursement(s)`
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
