import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { DeleteEsicConfig } from "../delete-esic-config";
import { useNavigate } from "@remix-run/react";
import { useUser } from "@/utils/user";

export const EsicConfigOptionsDropdown = ({
  id,
  triggerChild,
}: {
  id: string;
  triggerChild: React.ReactElement;
}) => {
  const { role } = useUser();
  const navigate = useNavigate();

  const handleEdit = () => {
    navigate(`/modules/esic-config/${id}/update-esic-config`);
  };

  return (
    <DropdownMenu>
      {triggerChild}
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem className="flex" onClick={handleEdit}>
            Edit ESIC Config
          </DropdownMenuItem>
          <DropdownMenuSeparator className="flex" />
          <DeleteEsicConfig id={id} role={role} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
