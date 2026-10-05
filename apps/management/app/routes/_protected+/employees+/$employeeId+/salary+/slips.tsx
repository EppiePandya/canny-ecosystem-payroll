import { FilterList } from "@/components/employees/salary/filter-list";
import { SalaryFilter } from "@/components/employees/salary/salary-filter";
import SalaryInfoCard from "@/components/employees/salary/salary-info-card";
import { ErrorBoundary } from "@/components/error-boundary";
import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clientCaching } from "@/utils/cache";
import {
  type DashboardFilters,
  getSalaryEntriesByEmployeeId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  type ClientLoaderFunctionArgs,
  defer,
  useLoaderData,
} from "@remix-run/react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";

import type { GroupedPayrollEntry } from "@/components/employees/salary/salary-info-card";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.searchParams);

  const employeeId = params.employeeId ?? "";
  const filters: DashboardFilters = {
    year: searchParams.get("year") ?? undefined,
  };

  try {
    const { data: salaryEntries, error } = await getSalaryEntriesByEmployeeId({
      supabase: supabase as any,
      employeeId,
      filters,
    });
    if (error) {
      console.error(error);
    }
    return defer({
      employeeId,
      salaryEntries,
      filters,
      error,
    });
  } catch (error) {
    return defer({
      employeeId: "",
      salaryEntries: null,
      filters,
      error,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  const url = new URL(args.request.url);

  return clientCaching(
    `${cacheKeyPrefix.employee_salary}${
      args.params.employeeId
    }${url.searchParams.toString()}`,
    args,
  );
}

clientLoader.hydrate = true;

export default function SalarySlips() {
  const { error, salaryEntries, filters, employeeId } =
    useLoaderData<typeof loader>();

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [startMonth, setStartMonth] = useState("1");
  const [startYear, setStartYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [endMonth, setEndMonth] = useState("12");
  const [endYear, setEndYear] = useState(new Date().getFullYear().toString());
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

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
    if (!isValidRange) return;
    setIsDownloading(true);
    try {
      const formData = new FormData();
      formData.append("startMonth", startMonth);
      formData.append("startYear", startYear);
      formData.append("endMonth", endMonth);
      formData.append("endYear", endYear);

      const res = await fetch(
        `/employees/${employeeId}/salary/slips/download`,
        {
          method: "POST",
          body: formData,
        },
      );

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
      setDownloadOpen(false);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Failed to download salary slips.",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (error) {
    clearCacheEntry(`${cacheKeyPrefix.employee_salary}${employeeId}`);
    return (
      <ErrorBoundary error={error} message="Failed to load employee details" />
    );
  }

  function groupPayrollData(data: unknown) {
    const grouped: { [id: string]: GroupedPayrollEntry } = {};

    if (!Array.isArray(data)) return [];

    for (const entry of data) {
      const id = entry.salary_entries?.payroll_id;
      if (!id) continue;

      if (!grouped[id]) {
        grouped[id] = {
          payroll_id: id,
          employee_id: entry.employee?.id,
          month: entry.month,
          year: entry.year,
          present_days: entry.present_days,
          overtime_hours: entry.overtime_hours,
          fields: {},
        };
      }

      const fieldValues = entry.salary_entries?.salary_field_values ?? [];

      for (const fieldValue of fieldValues) {
        const fieldName = fieldValue.payroll_fields?.name;
        const fieldType = fieldValue.payroll_fields?.type;
        const fieldAmount = fieldValue.amount;

        if (fieldName && fieldType !== undefined) {
          grouped[id].fields[fieldName] = {
            amount: fieldAmount,
            type: fieldType,
          };
        }
      }
    }

    return Object.values(grouped);
  }

  return (
    <section className="py-4 flex flex-col gap-4">
      <div className="flex justify-end">
        <div className="flex justify-between gap-3">
          <FilterList filters={filters as unknown as DashboardFilters} />
          <Button
            onClick={() => setDownloadOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Icon name="download" className="h-4 w-4" />
            Download Slips
          </Button>
          <SalaryFilter />
        </div>
      </div>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Download Salary Slips
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
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
            <div className="text-xs text-destructive font-medium mb-4">
              Start date must be before or equal to End date.
            </div>
          )}

          <DialogFooter className="flex gap-2 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setDownloadOpen(false)}
              disabled={isDownloading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!isValidRange || isDownloading}
              className="min-w-[100px]"
            >
              {isDownloading ? "Downloading..." : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(salaryEntries?.length ?? 0) > 0 ? (
        <div className="flex-1 w-full grid gap-6 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2 justify-start auto-rows-min">
          {groupPayrollData(salaryEntries ?? [])
            .reverse()
            .map((salary, index) => (
              <SalaryInfoCard
                key={index.toString()}
                salaryData={salary as unknown as GroupedPayrollEntry}
              />
            ))}
        </div>
      ) : (
        <div className="h-full w-full flex justify-center items-center text-xl">
          No Salary Data Found
        </div>
      )}
    </section>
  );
}
