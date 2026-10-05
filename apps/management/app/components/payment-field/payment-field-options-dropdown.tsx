import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useNavigate } from "@remix-run/react";
import { DeletePaymentField } from "./delete-payment-field";
import { deleteRole, hasPermission, updateRole } from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";

export const PaymentFieldOptionsDropdown = ({
  paymentField,
  triggerChild,
}: {
  paymentField: {
    id: string;
    returnTo?: string;
  };
  triggerChild: React.ReactElement;
}) => {
  const { role } = useUser();

  const navigate = useNavigate();

  const handleEdit = () => {
    navigate(
      `/payment-components/payment-fields/${paymentField.id}/update-payment-field`,
    );
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuSeparator
          className={cn(
            !hasPermission(role, `${updateRole}:${attribute.paymentFields}`) &&
              !hasPermission(
                role,
                `${deleteRole}:${attribute.paymentFields}`,
              ) &&
              "hidden",
          )}
        />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={handleEdit}
            className={cn(
              "hidden",
              hasPermission(role, `${updateRole}:${attribute.paymentFields}`) &&
                "flex",
            )}
          >
            Edit payment field
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              "hidden",
              hasPermission(role, `${deleteRole}:${attribute.paymentFields}`) &&
                "flex",
            )}
          />
          <DeletePaymentField paymentFieldId={paymentField.id} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
