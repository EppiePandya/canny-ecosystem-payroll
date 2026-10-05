import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useNavigate } from "@remix-run/react";
import { deleteRole, hasPermission, updateRole } from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { DeleteLetter } from "./delete-letter";

export const LetterOptionsDropDown = ({
  letterIds,
  triggerChild,
}: {
  letterIds: {
    id: string;
  };
  triggerChild: React.ReactElement;
}) => {
  const { role } = useUser();
  const navigate = useNavigate();

  const handleViewLetter = () => {
    navigate(`/modules/letters/${letterIds.id}`);
  };

  const handleLetterUpdate = () => {
    navigate(`/modules/letters/${letterIds.id}/update-letter`);
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleViewLetter}>
            View Letter
          </DropdownMenuItem>

          <DropdownMenuItem
            className={cn(
              !hasPermission(
                role,
                `${updateRole}:${attribute.letters}`,
              ) && "hidden",
            )}
            onClick={handleLetterUpdate}
          >
            Update Letter
          </DropdownMenuItem>

          {hasPermission(
            role,
            `${deleteRole}:${attribute.letters}`,
          ) && (
            <>
              <DropdownMenuSeparator />
              <DeleteLetter letterIds={letterIds} />
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
