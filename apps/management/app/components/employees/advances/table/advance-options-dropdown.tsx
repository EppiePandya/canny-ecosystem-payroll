import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { useNavigate, useParams } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  createRole,
  deleteRole,
  hasPermission,
  updateRole,
} from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { DeleteAdvance } from "../delete-advance";

export const AdvanceOptionsDropdown = ({
  id,
  triggerChild,
  reimbursementId,
  amount,
  advanceName,
  isPaid,
}: {
  id: string;
  triggerChild: React.ReactElement;
  reimbursementId?: string | null;
  amount?: number;
  advanceName?: string;
  isPaid?: boolean;
}) => {
  const { role } = useUser();
  const navigate = useNavigate();
  const { employeeId } = useParams();

  const handleEdit = () => {
    navigate(`/employees/${employeeId}/advances/${id}/update-advance`);
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            className={cn(
              "hidden",
              hasPermission(role, `${updateRole}:${attribute.employees}`) &&
                !isPaid &&
                "flex",
            )}
            onClick={handleEdit}
          >
            Edit Advance
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              "hidden",
              hasPermission(role, `${deleteRole}:${attribute.employees}`) &&
                !reimbursementId &&
                "flex",
            )}
          />
          <DropdownMenuItem
            className={cn(
              "hidden",
              hasPermission(
                role,
                `${createRole}:${attribute.employeeReimbursements}`,
              ) &&
                !reimbursementId &&
                "flex",
            )}
            onClick={() => {
              const qs = new URLSearchParams({ advanceId: id });
              navigate(
                `/employees/${employeeId}/reimbursements/add-reimbursement?${qs.toString()}`,
              );
            }}
          >
            Add Reimbursement
          </DropdownMenuItem>
          <DeleteAdvance id={id} role={role} hidden={!!reimbursementId} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
