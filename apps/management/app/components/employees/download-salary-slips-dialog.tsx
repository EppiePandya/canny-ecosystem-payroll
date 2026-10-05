import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@canny_ecosystem/ui/alert-dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";

export function DownloadSalarySlipsDialog({
  open,
  onOpenChange,
  selectedRows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: any[];
}) {
  const { toast } = useToast();
  const [startMonth, setStartMonth] = useState("1");
  const [startYear, setStartYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [endMonth, setEndMonth] = useState("12");
  const [endYear, setEndYear] = useState(new Date().getFullYear().toString());
  const [isDownloading, setIsDownloading] = useState(false);

  const monthsList = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const currentYear = new Date().getFullYear();
  const yearsList = Array.from({ length: currentYear - 2020 + 2 }, (_, i) =>
    (2020 + i).toString(),
  );

  const startNum = Number(startYear) * 100 + Number(startMonth);
  const endNum = Number(endYear) * 100 + Number(endMonth);
  const isValidRange = startNum <= endNum;

  const handleDownload = async () => {
    if (!selectedRows.length || !isValidRange) return;

    setIsDownloading(true);
    try {
      const formData = new FormData();
      formData.append("employeeIds", selectedRows.map((e) => e.id).join(","));
      formData.append("startMonth", startMonth);
      formData.append("startYear", startYear);
      formData.append("endMonth", endMonth);
      formData.append("endYear", endYear);

      const res = await fetch("/employees/salary/slips/download-bulk", {
        method: "POST",
        body: formData,
      });

      if (res.redirected) {
        throw new Error("Session expired. Please log in again.");
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/zip")) {
        const text = await res.text();
        let message = "Failed to download salary slips";
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
      a.download = `salary_slips_${startYear}_${startMonth}_to_${endYear}_${endMonth}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Salary slips downloaded successfully.",
        variant: "success",
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to download salary slips.",
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
            Download Salary Slips
          </AlertDialogTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select the month/year range to download salary slips for the{" "}
            <span className="font-semibold text-foreground">
              {selectedRows.length}
            </span>{" "}
            selected employee{selectedRows.length > 1 ? "s" : ""}.
          </p>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              From Month
            </label>
            <Select value={startMonth} onValueChange={setStartMonth}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {monthsList.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              From Year
            </label>
            <Select value={startYear} onValueChange={setStartYear}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {yearsList.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              To Month
            </label>
            <Select value={endMonth} onValueChange={setEndMonth}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {monthsList.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              To Year
            </label>
            <Select value={endYear} onValueChange={setEndYear}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {yearsList.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isValidRange && (
          <div className="text-xs text-destructive font-medium">
            Start date must be before or equal to End date.
          </div>
        )}

        <AlertDialogFooter className="sm:flex-row gap-3 pt-2">
          <AlertDialogCancel
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isDownloading}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={!isValidRange || isDownloading}
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
