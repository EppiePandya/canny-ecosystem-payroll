import { useUser } from "@/utils/user";
import { Button } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import {
  attribute,
  modalSearchParamNames,
} from "@canny_ecosystem/utils/constant";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { AttendanceRegister } from "./attendance-register";
import type {
  CompanyDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { AttendanceHourlyRegister } from "./attendance-hourly-register";
import { AttendanceDailyRegister } from "./attendance-daily-register";
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
  const { role } = useUser();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        className={cn(role === "executive" && "hidden")}
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
            <AttendanceDailyRegister
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
        <DropdownMenuSeparator
          className={cn(
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
            !selectedRows.length && "hidden",
          )}
        />
        <DropdownMenuItem
          onClick={() => {
            navigate("create-bulk-attendance");
          }}
          className={cn(
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
            "space-x-2 flex items-center",
          )}
        >
          <Icon name="plus-circled" size="sm" />
          <span>Add Monthly Attendance</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            navigate("create-bulk-daily-attendance");
          }}
          className={cn(
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
            "space-x-2 flex items-center",
          )}
        >
          <Icon name="plus-circled" size="sm" />
          <span>Add Daily Attendance</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            navigate("create-bulk-daily-attendance-with-hours");
          }}
          className={cn(
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
            "space-x-2 flex items-center",
          )}
        >
          <Icon name="plus-circled" size="sm" />
          <span>Add Daily Attendance (Hours)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator
          className={cn(
            "space-x-2 flex items-center",
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
          )}
        />
        <DropdownMenuItem
          onClick={() => {
            searchParams.set(
              "step",
              modalSearchParamNames.import_monthly_attendance,
            );
            setSearchParams(searchParams);
          }}
          className={cn(
            "space-x-2 flex items-center",
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
          )}
        >
          <Icon name="import" size="sm" className="mb-0.5" />
          <span>Import Monthly Attendance</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            searchParams.set(
              "step",
              modalSearchParamNames.import_daily_attendance,
            );
            setSearchParams(searchParams);
          }}
          className={cn(
            "space-x-2 flex items-center",
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
          )}
        >
          <Icon name="import" size="sm" className="mb-0.5" />
          <span>Import Daily Attendance</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator
          className={cn(
            "space-x-2 flex items-center",
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
          )}
        />
        <DropdownMenuItem
          onClick={() => {
            searchParams.set(
              "step",
              modalSearchParamNames.import_update_monthly_attendance,
            );
            setSearchParams(searchParams);
          }}
          className={cn(
            "space-x-2 flex items-center",
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
          )}
        >
          <Icon name="import" size="sm" className="mb-0.5 text-orange-500" />
          <span>Import Update Monthly Attendance</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            searchParams.set(
              "step",
              modalSearchParamNames.import_update_daily_attendance,
            );
            setSearchParams(searchParams);
          }}
          className={cn(
            "space-x-2 flex items-center",
            !hasPermission(role, `${createRole}:${attribute.attendance}`) &&
              "hidden",
          )}
        >
          <Icon name="import" size="sm" className="mb-0.5 text-orange-500" />
          <span>Import Update Daily Attendance</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
