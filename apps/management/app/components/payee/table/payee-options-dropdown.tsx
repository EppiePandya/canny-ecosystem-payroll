import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { DeletePayee } from "./delete-payee";
import { useNavigate } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  createRole,
  deleteRole,
  hasPermission,
  updateRole,
} from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";

export const PayeeOptionsDropdown = ({
  id,
  name,
  triggerChild,
}: {
  id: string;
  name: string;
  triggerChild: React.ReactElement;
}) => {
  const { role } = useUser();
  const navigate = useNavigate();
  const handleEdit = () => {
    navigate(`/employees/payee/${id}/update-payee`);
  };

  const handleCreateReimbursement = () => {
    navigate(`/employees/payee/${id}/create-reimbursements`);
  };

  const handleCheckReimbursement = () => {
    navigate(`/approvals/reimbursements?payee=${name}`);
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            className={cn(
              "hidden",
              hasPermission(role, `${createRole}:${attribute.settingPayee}`) &&
                "flex",
            )}
            onClick={handleCreateReimbursement}
          >
            Create Reimbursement
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              "hidden",
              hasPermission(role, `${createRole}:${attribute.settingPayee}`) &&
                "flex",
            )}
          />
          <DropdownMenuItem
            className={cn(
              "hidden",
              hasPermission(role, `${updateRole}:${attribute.settingPayee}`) &&
                "flex",
            )}
            onClick={handleEdit}
          >
            Edit Payee Data
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              "hidden",
              hasPermission(role, `${updateRole}:${attribute.settingPayee}`) &&
                "flex",
            )}
          />
          <DropdownMenuItem onClick={handleCheckReimbursement}>
            Check Reimbursement
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              "hidden",
              hasPermission(role, `${deleteRole}:${attribute.settingPayee}`) &&
                "flex",
            )}
          />
          <DeletePayee id={id} role={role} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
