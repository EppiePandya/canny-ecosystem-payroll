import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { DeleteVehicle } from "./delete-vehicle";
import { useNavigate, useSubmit } from "@remix-run/react";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";

export const VehicleOptionsDropdown = ({
  vehicle,
  triggerChild,
}: {
  vehicle: any;
  triggerChild: React.ReactElement;
}) => {
  const submit = useSubmit();
  const navigate = useNavigate();
  const { role } = useUser();

  const handleIncident = () => {
    submit(
      {
        id: vehicle.id,
      },
      {
        method: "POST",
        action: `/events/incidents/${vehicle.id}/create-incident-vehicle`,
      },
    );
  };

  const payeeId = vehicle.usage_payee_id ?? vehicle.owner_payee_id;

  const handleReimbursement = () => {
    if (payeeId) {
      navigate(`/employees/payee/${payeeId}/create-reimbursements?vehicleId=${vehicle.id}`);
    }
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            className={cn(
              !hasPermission(role, `${createRole}:${attribute.incidents}`) &&
                "hidden",
            )}
            onClick={handleIncident}
          >
            Report Incident
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              !hasPermission(role, `${createRole}:${attribute.incidents}`) &&
                "hidden",
            )}
          />
          <DropdownMenuItem
            className={cn(
              (!payeeId || !hasPermission(role, `${createRole}:${attribute.settingPayee}`)) &&
                "hidden",
            )}
            onClick={handleReimbursement}
          >
            Create Reimbursement
          </DropdownMenuItem>
          <DropdownMenuSeparator
            className={cn(
              (!payeeId || !hasPermission(role, `${createRole}:${attribute.settingPayee}`)) &&
                "hidden",
            )}
          />
          <DeleteVehicle vehicleId={vehicle.id} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

