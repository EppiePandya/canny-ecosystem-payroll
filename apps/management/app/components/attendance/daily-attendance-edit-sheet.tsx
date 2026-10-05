import { useEffect, useRef } from "react";
import { useFetcher, useSearchParams } from "@remix-run/react";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@canny_ecosystem/ui/sheet";
import { Button } from "@canny_ecosystem/ui/button";
import { Label } from "@canny_ecosystem/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";

export function DailyAttendanceEditSheet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();

  const editId = searchParams.get("edit_daily_id");
  const dateStr = searchParams.get("edit_daily_date");
  const currentVal = searchParams.get("edit_daily_val") || "REMOVE";
  const currentOT = searchParams.get("edit_daily_ot") || "0";

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearchParams(
        (prev) => {
          prev.delete("edit_daily_id");
          prev.delete("edit_daily_date");
          prev.delete("edit_daily_val");
          prev.delete("edit_daily_ot");
          return prev;
        },
        { preventScrollReset: true },
      );
    }
  };

  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.success &&
      hasSubmitted.current
    ) {
      clearCacheEntry(cacheKeyPrefix.attendance);
      hasSubmitted.current = false;
      handleOpenChange(false);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    hasSubmitted.current = true;
    clearCacheEntry(cacheKeyPrefix.attendance);
    const formData = new FormData(e.currentTarget);
    formData.append("_action", "update-daily-attendance");
    formData.append("attendance_id", editId!);
    formData.append("date", dateStr!);
    fetcher.submit(formData, { method: "post" });
  };

  const isSaving = fetcher.state === "submitting";
  const isOTMode = currentVal === "OT";

  const options = [
    { value: "P", label: "Present (P)" },
    { value: "A", label: "Absent (A)" },
    { value: "WOF", label: "Weekly Off (WOF)" },
    { value: "PH", label: "Paid Holiday (PH)" },
    { value: "CL", label: "Casual Leave (CL)" },
    { value: "PL", label: "Paid Leave (PL)" },
    { value: "H", label: "Holiday (H)" },
    { value: "REMOVE", label: "Remove / Clear Value" },
  ];

  return (
    <Sheet open={!!editId && dateStr !== null} onOpenChange={handleOpenChange}>
      <SheetContent
        key={`${editId}-${dateStr}-${currentVal}`}
        className="flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>
            {isOTMode ? "Edit Overtime Hours" : "Edit Daily Attendance"}
          </SheetTitle>
          <SheetDescription>
            {isOTMode
              ? "Update the monthly overtime hours"
              : `Update the attendance status for ${dateStr}`}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 mt-6">
          <div className="flex-1 space-y-6">
            {!isOTMode && (
              <div className="flex flex-col gap-2">
                <Label>Attendance Status</Label>
                <Select
                  name="val"
                  defaultValue={
                    options.some((o) => o.value === currentVal)
                      ? currentVal
                      : "REMOVE"
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isOTMode && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="overtime_hours">Overtime Hours</Label>
                <input
                  id="overtime_hours"
                  name="overtime_hours"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={currentOT}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-auto pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
