import type React from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canny_ecosystem/ui/sheet";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useState, useMemo } from "react";
import {
  Combobox,
  type ComboboxSelectOption,
} from "@canny_ecosystem/ui/combobox";
import { Label } from "@canny_ecosystem/ui/label";
import { Input } from "@canny_ecosystem/ui/input";
import { Button } from "@canny_ecosystem/ui/button";
import {
  useFetcher,
  useSearchParams,
  useSubmit,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

export function AddSalaryEntrySheet({
  uniqueFields,
  triggerChild,
  payrollId,
  allSiteOptions,
  existingEmployeeIds = [],
  payrollFields,
}: {
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  triggerChild: React.ReactNode;
  payrollId: string;
  allSiteOptions: ComboboxSelectOption[];
  existingEmployeeIds?: string[];
  payrollFields?: any[];
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const submit = useSubmit();
  const location = useLocation();
  const fetcher = useFetcher<ComboboxSelectOption[]>();

  const [site, setSite] = useState(searchParams.get("site") || "");
  const [employee, setEmployee] = useState("");
  const [presents, setPresents] = useState("");

  const employees = useMemo(() => {
    const fetched = fetcher.data ?? [];
    if (!existingEmployeeIds.length) return fetched;
    return fetched.filter(
      (emp) => !existingEmployeeIds.includes(String(emp.value)),
    );
  }, [fetcher.data, existingEmployeeIds]);

  const isLoadingEmployees = fetcher.state === "loading";

  useEffect(() => {
    if (site && open) {
      const url = `/api-eligible-employees?siteId=${site}&payrollId=${payrollId}`;
      fetcher.load(url);
    }
  }, [site, open, payrollId]);

  const fieldsToDisplay = useMemo(() => {
    if (payrollFields && payrollFields.length > 0) {
      return payrollFields.map((field) => ({
        name: field.name,
        type: field.type as "earning" | "deduction",
      }));
    }
    return uniqueFields;
  }, [payrollFields, uniqueFields]);

  const [fieldConfigs, setFieldConfigs] = useState(() => {
    return fieldsToDisplay.map((field) => ({
      id: null,
      key: field.name,
      type: field.type,
      amount: 0,
    }));
  });

  useEffect(() => {
    if (!open) {
      const updatedConfigs = fieldsToDisplay.map((field) => ({
        id: null,
        key: field.name,
        type: field.type,
        amount: 0,
      }));
      setFieldConfigs(updatedConfigs);
    }
  }, [fieldsToDisplay, open]);

  const handleFinalSubmit = () => {
    const finalData = {
      employee_id: employee,
      present_days: presents,
      working_days: 26,
      salary_data: fieldConfigs,
    };
    submit(
      {
        payrollId: payrollId,
        salaryEntryData: JSON.stringify(finalData),
        failedRedirect: `/payroll/run-payroll/${payrollId}${location.search}`,
      },
      {
        method: "POST",
        action: `/payroll/run-payroll/${payrollId}/add-salary-entry${location.search}`,
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className={cn("cursor-pointer py-2")}>
        {triggerChild}
      </SheetTrigger>
      <SheetContent className="flex flex-col w-[600px] max-sm:w-full h-full">
        <SheetHeader className="px-6 pt-4 pb-8 flex-shrink-0">
          <SheetTitle className="flex justify-between">
            <div>
              <h1 className="text-primary text-3xl">Add Salary Entry</h1>
            </div>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="mb-8 flex flex-col gap-1">
            <Label className="text-sm font-medium">Site</Label>
            <Combobox
              options={allSiteOptions || []}
              placeholder="Select Site first for employees"
              value={site}
              onChange={(value: string) => {
                if (value?.length) {
                  setSite(value);
                  setEmployee(""); // Reset employee when site changes
                }
              }}
            />
          </div>
          <div className="w-full grid grid-cols-2 max-sm:grid-cols-1 gap-4 mb-8">
            <div className="mb-8 flex flex-col gap-1">
              <Label className="text-sm font-medium">Employee</Label>
              <Combobox
                options={employees}
                placeholder={
                  isLoadingEmployees
                    ? "Loading employees..."
                    : site
                      ? "Select Employee"
                      : "Select Site first"
                }
                value={employee}
                onChange={(value: string) => {
                  setEmployee(value);
                }}
                disabled={isLoadingEmployees || !site}
              />
            </div>
            <div className="mb-8 flex flex-col gap-1">
              <Label className="text-sm font-medium">Present Days</Label>
              <Input
                placeholder="Enter the present days"
                onChange={(e) => setPresents(e.target.value)}
              />
            </div>
          </div>
          {fieldConfigs.map((field) => (
            <div key={field.key} className="flex flex-col relative gap-1">
              <div className="flex flex-row justify-between items-center">
                <div className="flex gap-1">
                  <label className="text-sm text-muted-foreground capitalize">
                    {field.key}
                  </label>
                </div>
              </div>

              <Input
                value={field.amount}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setFieldConfigs((prev) =>
                    prev.map((f) =>
                      f.key === field.key ? { ...f, amount: value } : f,
                    ),
                  );
                }}
                placeholder={"Enter Amount"}
              />
            </div>
          ))}
        </div>
        <SheetFooter className="mt-auto flex-shrink-0">
          <SheetClose asChild>
            <Button variant={"default"} onClick={handleFinalSubmit}>
              Add
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
