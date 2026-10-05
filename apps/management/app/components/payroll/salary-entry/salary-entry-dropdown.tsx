import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { replaceDash } from "@canny_ecosystem/utils";
import { useNavigate, useSubmit, useLocation } from "@remix-run/react";
import { useState } from "react";
import { SalaryDetailsDialog } from "./salary-details-dialog";

export const SalaryEntryDropdown = ({
  data,
  triggerChild,
  editable = false,
}: {
  data: any;
  triggerChild: React.ReactElement;
  editable: boolean;
}) => {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  const payrollId = data?.salary_entries?.payroll_id;
  const employeeId = data?.employee.id;
  const assignment = data?.employee.salary_assignment;
  const today = new Date().toISOString().split("T")[0];
  const hasActiveAssignment =
    assignment &&
    (!assignment.effective_date || assignment.effective_date <= today);

  const handleClick = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    document: string,
  ) => {
    e.preventDefault();
    navigate(`${employeeId}/${document}`);
  };

  const employeeDocuments = ["salary-slip"];

  return (
    <>
      <DropdownMenu>
        {triggerChild}
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {employeeDocuments.map((document) => (
              <DropdownMenuItem
                key={document}
                onClick={(e) => handleClick(e, document)}
              >
                Preview {`${replaceDash(document)}`}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setShowDetails(true);
              }}
            >
              Show Details
            </DropdownMenuItem>
            {data?.salary_entries?.invoice?.invoice_number && (
              <DropdownMenuItem
                onSelect={() => {
                  sessionStorage.setItem("invoice_auto_open", "true");

                  navigate(
                    `/payroll/invoices?name=${data.salary_entries.invoice.invoice_number}`,
                  );
                }}
              >
                View Invoice
              </DropdownMenuItem>
            )}

            {!hasActiveAssignment && (
              <DropdownMenuItem
                onSelect={() => navigate(`/employees/${employeeId}/salary`)}
              >
                Add Salary
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className={cn(!editable && "hidden")} />

          <DropdownMenuGroup className={cn(!editable && "hidden")}>
            <DeleteSalaryEntry payrollId={payrollId} employeeId={employeeId} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <SalaryDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        data={data}
      />
    </>
  );
};

export const DeleteSalaryEntry = ({
  payrollId,
  employeeId,
}: {
  payrollId: string;
  employeeId: string;
}) => {
  const submit = useSubmit();
  const location = useLocation();

  const handleDelete = () => {
    submit(
      {
        is_active: false,
        returnTo: `/payroll/run-payroll/${payrollId}${location.search}`,
      },
      {
        method: "POST",
        action: `/payroll/run-payroll/${payrollId}/${employeeId}/delete-salary-entry${location.search}`,
      },
    );
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn(
          buttonVariants({ variant: "destructive-ghost", size: "full" }),
          "text-[13px] h-9",
        )}
      >
        Delete Salary Entry
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            salary entry and remove it's data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={handleDelete}
            onSelect={handleDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
