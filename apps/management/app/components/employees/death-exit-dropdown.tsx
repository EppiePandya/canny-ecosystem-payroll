import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
} from "@canny_ecosystem/ui/dropdown-menu";
import { DeleteEmployeeDeathExits } from "./delete-employee-death-exit";

export const DeathExitDropdown = ({
  exitId,
  employeeId,
  triggerChild,
}: {
  exitId: string;
  employeeId: string;
  triggerChild: React.ReactElement;
}) => {
  return (
    <DropdownMenu>
      {triggerChild}

      <DropdownMenuContent
        sideOffset={8}
        align="end"
        className="w-52 rounded-lg border bg-popover p-1 shadow-md"
      >
        <DropdownMenuGroup>
          <DeleteEmployeeDeathExits exitId={exitId} employeeId={employeeId} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
