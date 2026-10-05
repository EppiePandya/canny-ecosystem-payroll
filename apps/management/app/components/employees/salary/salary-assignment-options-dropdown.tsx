import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useNavigate, useParams } from "@remix-run/react";
import { deleteRole, hasPermission, updateRole } from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { DeleteSalaryAssignment } from "./delete-salary-assignment";
import { useState } from "react";
import { ViewEmployeeSalaryAssignmentDialog } from "./view-employee-salary-assignment-dialog";

export const SalaryAssignmentOptionsDropdown = ({
  assignmentId,
  triggerChild,
  data,
  env,
}: {
  assignmentId: string;
  triggerChild: React.ReactElement;
  data: any;
  env: any;
}) => {
  const { employeeId } = useParams();
  const { role } = useUser();
  const navigate = useNavigate();
  const [viewOpen, setViewOpen] = useState(false);

  const handleEdit = () => {
    navigate(`/employees/${employeeId}/salary/${assignmentId}`);
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuSeparator
          className={cn(
            !hasPermission(
              role,
              `${updateRole}:${attribute.employeePayments}`,
            ) &&
              !hasPermission(
                role,
                `${deleteRole}:${attribute.employeePayments}`,
              ) &&
              "hidden",
          )}
        />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setViewOpen(true)}>
            View Salary
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleEdit}
            className={cn(
              "hidden",
              hasPermission(
                role,
                `${updateRole}:${attribute.employeePayments}`,
              ) && "flex",
            )}
          >
            Edit Salary Record
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              "hidden",
              hasPermission(
                role,
                `${deleteRole}:${attribute.employeePayments}`,
              ) && "flex",
            )}
          />
          <DeleteSalaryAssignment assignmentId={assignmentId} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
      <ViewEmployeeSalaryAssignmentDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        data={data}
        env={env}
      />
    </DropdownMenu>
  );
};
