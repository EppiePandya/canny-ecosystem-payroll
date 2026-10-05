import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Combobox,
  type ComboboxSelectOption,
} from "@canny_ecosystem/ui/combobox";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getPaymentTemplatesByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useCompanyId } from "@/utils/company";

import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";

export function BulkSalaryAssignmentDialog({
  selectedRows,
  env,
  open,
  onOpenChange,
}: {
  selectedRows: any[];
  env: SupabaseEnv;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingMode, setSubmittingMode] = useState<"create" | "increment" | null>(null);
  const { toast } = useToast();

  const { companyId } = useCompanyId();
  const { supabase } = useSupabase({ env });

  const [templateOptions, setTemplateOptions] = useState<
    ComboboxSelectOption[]
  >([]);

  async function fetchTemplates() {
    try {
      const { data, error } = await getPaymentTemplatesByCompanyId({
        supabase: supabase as any,
        companyId: companyId!,
      });
      if (!data || error) throw new Error("Failed to fetch templates");

      setTemplateOptions(
        data?.map((template) => ({
          value: template.id,
          label: template.name,
        })) || [],
      );
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch templates",
      });
    }
  }

  useEffect(() => {
    if (open && !templateOptions.length) {
      fetchTemplates();
    }
  }, [open, templateOptions.length]);

  async function handleAssign(mode: "create" | "increment") {
    if (!selectedTemplate || !selectedRows.length) return;
    setIsSubmitting(true);
    setSubmittingMode(mode);

    try {
      const employeeIds = selectedRows.map((e) => e.id);

      const payload = {
        employeeIds,
        templateId: selectedTemplate,
        effectiveDate: effectiveDate || undefined,
        mode,
      };

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));

      const res = await fetch("/api/bulk-salary-assignment", {
        method: "POST",
        body: formData,
      });

      const resData = await res.json();

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Error",
          description: resData?.message || "Failed to assign salaries",
        });
        return;
      }

      const {
        successCount = 0,
        failedCount = 0,
        skippedCount = 0,
        status,
      } = resData;

      if (status === "success") {
        toast({
          title: "Bulk Assignment Result",
          description: `✅ Assigned ${successCount} employee${successCount !== 1 ? "s" : ""} successfully${skippedCount > 0 ? ` · ⚠️ Skipped ${skippedCount}` : ""}.`,
          variant: "success",
        });
      } else if (status === "partial") {
        toast({
          title: "Bulk Assignment Result",
          description: `✅ Success: ${successCount} · ❌ Failed: ${failedCount}${skippedCount > 0 ? ` · ⚠️ Skipped: ${skippedCount}` : ""}`,
          variant: "destructive",
        });
      } else if (status === "skipped") {
        toast({
          title: "Already Assigned",
          description: `⚠️ All ${skippedCount} selected employee${skippedCount !== 1 ? "s" : ""} already have a salary assignment.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Assignment Failed",
          description: `❌ Failed to assign salary to ${failedCount} employee${failedCount !== 1 ? "s" : ""}${skippedCount > 0 ? ` · ⚠️ Skipped: ${skippedCount}` : ""}.`,
          variant: "destructive",
        });
      }

      onOpenChange(false);
      setSelectedTemplate("");
      setEffectiveDate("");
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong during assignment.",
      });
    } finally {
      setIsSubmitting(false);
      setSubmittingMode(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Salary (Bulk)</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 px-1">
          <p className="text-sm text-muted-foreground">
            Selected employees: <b>{selectedRows.length}</b>
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Payment Template</label>
            <Combobox
              className="w-full"
              dialogClassName="w-max"
              options={templateOptions}
              value={selectedTemplate}
              onChange={(value) => setSelectedTemplate(value)}
              placeholder="Select a template"
            />
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-medium">
              Effective Date (Optional)
            </label>
            <input
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Overrides the template's default effective date if provided.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleAssign("create")}
            disabled={!selectedTemplate || isSubmitting}
          >
            {submittingMode === "create" ? "Creating..." : "Create"}
          </Button>
          <Button
            type="button"
            onClick={() => handleAssign("increment")}
            disabled={!selectedTemplate || isSubmitting}
          >
            {submittingMode === "increment" ? "Incrementing..." : "Increment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
