import { Button } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { AttendanceRegister } from "./attendance-register";
import type {
  CompanyDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { AttendanceHourlyRegister } from "./attendance-hourly-register";
import type { AttendanceDataType } from "@canny_ecosystem/supabase/queries";

export function AttendanceMenu({
  selectedRows,
  companyName,
  companyAddress,
}: {
  selectedRows: AttendanceDataType[];
  companyName?: CompanyDatabaseRow;
  companyAddress?: LocationDatabaseRow;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        className={selectedRows?.length ? "flex" : "hidden"}
      >
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10  border border-input"
        >
          <Icon name="plus" className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={10} align="end">
        <div className={cn("flex flex-col", !selectedRows?.length && "hidden")}>
          <div
            className={cn(
              "flex flex-col gap-1",
              !selectedRows?.length && "hidden",
            )}
          >
            <AttendanceRegister
              selectedRows={selectedRows}
              companyName={companyName}
              companyAddress={companyAddress}
            />
            <AttendanceHourlyRegister
              selectedRows={selectedRows}
              companyName={companyName}
              companyAddress={companyAddress}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
