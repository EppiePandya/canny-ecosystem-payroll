import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { toast } from "@canny_ecosystem/ui/use-toast";
import { Icon } from "@canny_ecosystem/ui/icon";

interface GenerateStatutoryFormsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: Array<{ id: string; employee_code: string }>;
  env?: any;
}

export function GenerateStatutoryFormsDialog({
  open,
  onOpenChange,
  selectedRows,
}: GenerateStatutoryFormsDialogProps) {
  const [selectedForms, setSelectedForms] = React.useState<string[]>([
    "form_i",
  ]);
  const [format, setFormat] = React.useState<"pdf" | "excel">("pdf");
  const [isGenerating, setIsGenerating] = React.useState(false);

  const availableForms = [
    {
      id: "form_i",
      name: "Form I (Employee Register)",
      description: "See clause (i) of sub-rule (1) of rule 51",
    },
    {
      id: "form_iii",
      name: "Form III (Nomination Form)",
      description: "See rules 32 (1), (2), (3) and (4)",
    },
    {
      id: "form_iv_gratuity",
      name: "Form IV (Gratuity Application)",
      description:
        "See rule 33(7) - Application for gratuity by an Employee/nominee/legal heir",
    },
    {
      id: "form_iv",
      name: "Form IV (Register of Wages, Overtime, Fines, Deductions)",
      description: "See clause (ii) of sub-rule (1) of rule 51",
    },
    {
      id: "form_v",
      name: "Form V (Wage Slip)",
      description: "See rule 52 - Individual employee monthly wage slip",
    },
    {
      id: "form_viii",
      name: "Form VIII (Nomination Form)",
      description:
        "See clause (a) of sub-rule (1) of rule 45 - Nomination Form",
    },
  ];

  const handleToggleForm = (id: string) => {
    setSelectedForms((prev) =>
      prev.includes(id)
        ? prev.filter((formId) => formId !== id)
        : [...prev, id],
    );
  };

  const handleDownload = async () => {
    if (!selectedRows.length) {
      toast({
        variant: "destructive",
        title: "No employees selected",
        description: "Please select one or more employees first.",
      });
      return;
    }

    if (!selectedForms.length) {
      toast({
        variant: "destructive",
        title: "No forms selected",
        description: "Please select at least one statutory form to generate.",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.append("employeeIds", selectedRows.map((e) => e.id).join(","));
      formData.append("format", format);
      formData.append("forms", selectedForms.join(","));

      const res = await fetch("/employees/statutory-forms/generate-bulk", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData?.message || "Failed to generate statutory forms",
        );
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      const contentDisposition = res.headers.get("Content-Disposition");
      let fileName = `form_i_employee_register.${format === "pdf" ? "pdf" : "xlsx"}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match?.[1]) fileName = match[1];
      }

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: `Successfully generated ${format.toUpperCase()} report.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description:
          error.message || "Something went wrong while generating files.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-6 bg-card border border-border shadow-xl rounded-xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Icon name="briefcase" className="h-5 w-5 text-primary" />
            Generate Statutory Forms
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Select the statutory registers or forms to generate for the{" "}
            <span className="font-semibold text-foreground">
              {selectedRows.length}
            </span>{" "}
            selected employee(s).
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Generating statutory forms...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Please wait while we fetch details and build your files.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Available Forms
              </label>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {availableForms.map((form) => {
                  const isChecked = selectedForms.includes(form.id);
                  return (
                    <div
                      key={form.id}
                      onClick={() => handleToggleForm(form.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          {form.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {form.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat("pdf")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ${
                    format === "pdf"
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Icon
                    name="pdf"
                    className={`h-6 w-6 ${
                      format === "pdf"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      PDF Document
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Formatted printable dossiers
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat("excel")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ${
                    format === "excel"
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Icon
                    name="excel"
                    className={`h-6 w-6 ${
                      format === "excel"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Excel Spreadsheet
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Multi-sheet workbook registers
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={isGenerating || !selectedForms.length}
            className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Generate & Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
