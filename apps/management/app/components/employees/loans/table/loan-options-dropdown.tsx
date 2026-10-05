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
import { DeleteLoan } from "../delete-loan";

export const LoanOptionsDropdown = ({
  id,
  triggerChild,
  reimbursementId,
  amount,
  loanName,
  isPaid,
}: {
  id: string;
  triggerChild: React.ReactElement;
  reimbursementId?: string | null;
  amount?: number;
  loanName?: string;
  isPaid?: boolean;
}) => {
  const { role } = useUser();
  const navigate = useNavigate();
  const { employeeId } = useParams();

  const handleEdit = () => {
    navigate(`/employees/${employeeId}/loans/${id}/update-loan`);
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
            Edit Loan
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
              const qs = new URLSearchParams({ loanId: id });
              navigate(
                `/employees/${employeeId}/reimbursements/add-reimbursement?${qs.toString()}`,
              );
            }}
          >
            Add Reimbursement
          </DropdownMenuItem>
          <DeleteLoan id={id} role={role} hidden={!!reimbursementId} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
