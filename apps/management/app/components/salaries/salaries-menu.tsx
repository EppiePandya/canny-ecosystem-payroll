import { useUser } from "@/utils/user";
import { Button } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import { attribute, modalSearchParamNames } from "@canny_ecosystem/utils/constant";
import { useNavigate, useSearchParams } from "@remix-run/react";

export function SalariesMenu() {
  const { role } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        className={cn(role === "executive" && "hidden")}
      >
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 border border-input"
        >
          <Icon name="plus" className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={10} align="end">
        <DropdownMenuItem
          onClick={() => {
            navigate("add");
          }}
          className={cn(
            !hasPermission(
              role,
              `${createRole}:${attribute.paymentComponent}`,
            ) && "hidden",
            "space-x-2 flex items-center cursor-pointer",
          )}
        >
          <Icon name="plus-circled" size="sm" />
          <span>Add Salary</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            searchParams.set(
              "step",
              modalSearchParamNames.import_employee_increment,
            );
            setSearchParams(searchParams);
          }}
          className="space-x-2 flex items-center cursor-pointer"
        >
          <Icon name="import" size="sm" />
          <span>Import Increment</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
