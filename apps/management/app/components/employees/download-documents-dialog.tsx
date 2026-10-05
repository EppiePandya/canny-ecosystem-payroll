import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { employeeDocumentTypeArray } from "@canny_ecosystem/utils";
import { useState } from "react";

// Get unique document types to avoid duplicates like pan_card / driving_license
const uniqueDocumentTypes = Array.from(new Set(employeeDocumentTypeArray));

function getDocumentLabel(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function DownloadDocumentsDialog({
  open,
  onOpenChange,
  selectedRows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: any[];
}) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  // Filter document types based on search
  const filteredTypes = uniqueDocumentTypes.filter((type) =>
    getDocumentLabel(type).toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelectAll = () => {
    // Select all currently visible filtered types
    const newSelected = Array.from(
      new Set([...selectedTypes, ...filteredTypes]),
    );
    setSelectedTypes(newSelected);
  };

  const handleDeselectAll = () => {
    // Deselect all currently visible filtered types
    const newSelected = selectedTypes.filter(
      (type) => !filteredTypes.includes(type),
    );
    setSelectedTypes(newSelected);
  };

  const handleToggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleDownload = async () => {
    if (!selectedRows.length || !selectedTypes.length) return;

    setIsDownloading(true);
    const employeeIdsStr = selectedRows.map((e) => e.id).join(",");
    const documentTypesStr = selectedTypes.join(",");

    try {
      const formData = new FormData();
      formData.append("employeeIds", employeeIdsStr);
      formData.append("documentTypes", documentTypesStr);

      const res = await fetch("/employees/documents/download", {
        method: "POST",
        body: formData,
      });

      if (res.redirected) {
        throw new Error("Session expired. Please log in again.");
      }

      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || !contentType.includes("application/zip")) {
        const text = await res.text().catch(() => "");
        let message = "Failed to download documents";
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {}
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `employee_documents_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      toast({
        title: "Success",
        description: "Documents downloaded successfully.",
        variant: "success",
      });
      onOpenChange(false);
      // Reset state
      setSelectedTypes([]);
      setSearchTerm("");
    } catch (error: any) {
      console.error(
        "Fetch download failed, attempting native form download:",
        error,
      );

      // If browser fetch failed due to network / blob memory constraints (e.g. net::ERR_FAILED),
      // fall back to native browser form submission directly to disk
      if (
        error?.message?.includes("Failed to fetch") ||
        error?.name === "TypeError"
      ) {
        try {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/employees/documents/download";
          form.style.display = "none";

          const empInput = document.createElement("input");
          empInput.type = "hidden";
          empInput.name = "employeeIds";
          empInput.value = employeeIdsStr;
          form.appendChild(empInput);

          const typeInput = document.createElement("input");
          typeInput.type = "hidden";
          typeInput.name = "documentTypes";
          typeInput.value = documentTypesStr;
          form.appendChild(typeInput);

          document.body.appendChild(form);
          form.submit();
          form.remove();

          toast({
            title: "Downloading...",
            description: "Preparing documents download directly.",
            variant: "success",
          });
          onOpenChange(false);
          setSelectedTypes([]);
          setSearchTerm("");
          return;
        } catch (fallbackErr) {
          console.error("Fallback download error:", fallbackErr);
        }
      }

      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to download documents.",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[480px] p-6 gap-6 bg-background border rounded-lg shadow-xl overflow-hidden transition-all duration-300">
        <AlertDialogHeader className="space-y-1">
          <AlertDialogTitle className="text-xl font-bold tracking-tight">
            Download Employee Documents
          </AlertDialogTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select the document types you wish to download for the{" "}
            <span className="font-semibold text-foreground">
              {selectedRows.length}
            </span>{" "}
            selected employee{selectedRows.length > 1 ? "s" : ""}.
          </p>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4">
          {/* Search Box */}
          <div className="relative flex items-center border rounded-md px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-all">
            <Icon
              name="search"
              className="h-4 w-4 text-muted-foreground mr-2"
            />
            <input
              type="text"
              placeholder="Search document types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground focus:ring-0 focus:outline-none focus-visible:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name="cross" size="sm" />
              </button>
            )}
          </div>

          {/* Quick Action Toggles */}
          <div className="flex items-center justify-between text-xs font-semibold px-1">
            <span className="text-muted-foreground">
              {selectedTypes.length} of {uniqueDocumentTypes.length} selected
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-primary hover:underline"
              >
                Select All
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Scrollable Checkbox List */}
          <div className="border rounded-md divide-y overflow-y-auto max-h-[220px] bg-card transition-all">
            {filteredTypes.length > 0 ? (
              filteredTypes.map((type) => {
                const isChecked = selectedTypes.includes(type);
                return (
                  <label
                    key={type}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer select-none transition-colors duration-150",
                      isChecked && "bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => handleToggleType(type)}
                      id={`doc-checkbox-${type}`}
                    />
                    <span className="text-sm font-medium leading-none text-foreground capitalize">
                      {getDocumentLabel(type)}
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <Icon
                  name="plus-circled"
                  className="h-8 w-8 text-muted-foreground/60 mb-2 rotate-45"
                />
                <p className="text-sm font-semibold text-muted-foreground">
                  No matching document types found
                </p>
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter className="sm:flex-row gap-3 pt-2">
          <AlertDialogCancel
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              setSelectedTypes([]);
              setSearchTerm("");
            }}
            disabled={isDownloading}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={!selectedTypes.length || isDownloading}
            className="w-full sm:w-auto min-w-[100px] flex items-center justify-center gap-2"
          >
            {isDownloading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Downloading...
              </>
            ) : (
              <>
                <Icon name="download" className="h-4 w-4" />
                Download
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
