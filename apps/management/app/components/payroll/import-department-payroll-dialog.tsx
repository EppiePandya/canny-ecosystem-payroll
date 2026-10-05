import { useState } from "react";
import { useUser } from "@/utils/user";
import { Button } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import {
  attribute,
  modalSearchParamNames,
} from "@canny_ecosystem/utils/constant";
import { AddSalaryEntrySheet } from "./add-salary-entry-sheet";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { AddPayrollFieldSheet } from "./add-payroll-field-sheet";
import { DivideFieldsSheet } from "./divide-fields-sheet";
import { AddReimbursementModal } from "./add-reimbursement-modal";
import { useSearchParams, useSubmit, useLocation, useNavigate } from "@remix-run/react";

export function ImportDepartmentPayrollDialog({
  uniqueFields,
  payrollId,
  allSiteOptions,
  existingEmployeeIds,
  payrollFields,
  selectedRows = [],
  payrollData,
}: {
  uniqueFields: { name: string; type: "earning" | "deduction" }[];
  payrollId: string;
  allSiteOptions: ComboboxSelectOption[];
  existingEmployeeIds: string[];
  payrollFields?: any[];
  selectedRows?: any[];
  payrollData?: any;
}) {
  const { role } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const submit = useSubmit();
  const location = useLocation();
  const navigate = useNavigate();

  const [isReimbursementModalOpen, setIsReimbursementModalOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          asChild
          className={cn(
            !hasPermission(role, `${createRole}:${attribute.payroll}`) &&
              "hidden",
          )}
        >
          <Button
            variant={selectedRows.length > 0 ? "muted" : "outline"}
            size="icon"
            className="h-10 w-10 border border-input"
          >
            <Icon name="plus" className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={10} align="end">
          <AddSalaryEntrySheet
            uniqueFields={uniqueFields}
            triggerChild={
              <div className="h-8 space-x-2 flex items-center px-2 hover:bg-muted">
                <Icon name="plus-circled" size="sm" className="mb-0.5" />
                <span className="text-sm">Add Salary Entry</span>
              </div>
            }
            allSiteOptions={allSiteOptions}
            existingEmployeeIds={existingEmployeeIds}
            payrollId={payrollId}
            payrollFields={payrollFields}
          />
          <AddPayrollFieldSheet
            triggerChild={
              <div className="h-8 space-x-2 flex items-center px-2 hover:bg-muted">
                <Icon name="plus-circled" size="sm" className="mb-0.5" />
                <span className="text-sm">Add Payroll Field</span>
              </div>
            }
            payrollId={payrollId}
          />
          {selectedRows.length > 0 && (
            <DivideFieldsSheet
              payrollId={payrollId}
              selectedRows={selectedRows}
              uniqueFields={uniqueFields}
              triggerChild={
                <div className="h-8 space-x-2 flex items-center px-2 cursor-pointer bg-muted text-muted-foreground hover:bg-muted/80 focus:bg-muted font-semibold rounded-sm">
                  <Icon
                    name="mixer"
                    size="sm"
                    className="mb-0.5 text-muted-foreground"
                  />
                  <span className="text-sm">Divide Fields</span>
                </div>
              }
            />
          )}
          <DropdownMenuItem
            onClick={() => {
              searchParams.set(
                "step",
                modalSearchParamNames.import_salary_payroll,
              );
              setSearchParams(searchParams);
            }}
            className="space-x-2 flex items-center"
          >
            <Icon name="import" size="sm" className="mb-0.5" />
            <span>Import Payroll</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              searchParams.set("step", "update-increment-payroll");
              setSearchParams(searchParams);
            }}
            className="space-x-2 flex items-center cursor-pointer"
          >
            <Icon name="import" size="sm" className="mb-0.5" />
            <span>Import Update Increment Payroll</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              navigate(
                `/payroll/run-payroll/${payrollId}/sync-salary-increments${location.search}`,
              );
            }}
            className="space-x-2 flex items-center cursor-pointer"
          >
            <Icon name="update" size="sm" className="mb-0.5" />
            <span>Update Payroll from Master Salary</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              submit(
                {
                  payrollId: payrollId,
                },
                {
                  method: "POST",
                  action: `/payroll/run-payroll/${payrollId}/add-loan${location.search}`,
                },
              );
            }}
            className="space-x-2 flex items-center cursor-pointer"
          >
            <Icon name="plus-circled" size="sm" className="mb-0.5" />
            <span>Add Loan</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              submit(
                {
                  payrollId: payrollId,
                },
                {
                  method: "POST",
                  action: `/payroll/run-payroll/${payrollId}/add-advance${location.search}`,
                },
              );
            }}
            className="space-x-2 flex items-center cursor-pointer"
          >
            <Icon name="plus-circled" size="sm" className="mb-0.5" />
            <span>Add Advance</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setIsReimbursementModalOpen(true);
            }}
            className="space-x-2 flex items-center cursor-pointer"
          >
            <Icon name="plus-circled" size="sm" className="mb-0.5" />
            <span>Add Other Reimb.</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddReimbursementModal
        isOpen={isReimbursementModalOpen}
        onOpenChange={setIsReimbursementModalOpen}
        payrollId={payrollId}
      />
    </>
  );
}

