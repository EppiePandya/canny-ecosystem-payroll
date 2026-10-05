import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { DeleteEmployeeExit } from "./delete-employee-exit";
import { Link } from "@remix-run/react";
import { Icon } from "@canny_ecosystem/ui/icon";

export const ExitsDropdown = ({
  exitId,
  employeeId,
  triggerChild,
  hasDeathExit,
}: {
  exitId: string;
  employeeId: string;
  triggerChild: React.ReactElement;
  hasDeathExit?: boolean;
}) => {
  return (
    <DropdownMenu>
      {triggerChild}

      <DropdownMenuContent
        sideOffset={8}
        align="end"
        className="w-52 rounded-lg border bg-popover p-1 shadow-md"
      >
        <DropdownMenuGroup className="space-y-1">
          {!hasDeathExit && (
            <DropdownMenuItem asChild>
              <Link
                to={`/employees/${employeeId}/payments/${exitId}/create-employee-death-exit`}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-amber-600 hover:bg-amber-50"
              >
                <Icon name="exclaimation-triangle" size="xs" />
                Mark Death Exit
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DeleteEmployeeExit exitId={exitId} employeeId={employeeId} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
