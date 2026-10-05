import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { DeleteAttendance } from "./delete-attendance";
import { deleteRole, hasPermission, updateRole } from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { toast } from "@canny_ecosystem/ui/use-toast";

export const AttendanceOptionsDropdown = ({
  attendanceId,
  hasSalaryEntry,
  triggerChild,
  row,
}: {
  attendanceId: string;
  hasSalaryEntry?: boolean;
  triggerChild: React.ReactElement;
  row: any;
}) => {
  const { role } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleUpdate = () => {
    if (hasSalaryEntry) {
      toast({
        title: "Error",
        description: "cant update because salary entry is created in payroll",
        variant: "destructive",
      });
      return;
    }
    navigate(`/time-tracking/attendance/${attendanceId}/update-attendance`);
  };

  const hasDailyRecords =
    !!row.original?.monthly_attendance?.daily_records?.length;

  return (
    <>
      <DropdownMenu>
        {triggerChild}
        <DropdownMenuContent sideOffset={10} align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              className={cn(
                "gap-2 cursor-pointer",
                !hasDailyRecords && "hidden",
              )}
              onSelect={() => {
                searchParams.set("daily_attendance_id", attendanceId);
                setSearchParams(searchParams);
              }}
            >
              <Icon name="calendar" size="sm" />
              Daily Attendance
            </DropdownMenuItem>

            <DropdownMenuSeparator
              className={cn(!hasDailyRecords && "hidden")}
            />

            <DropdownMenuItem
              className={cn(
                "gap-2",
                !hasPermission(role, `${updateRole}:${attribute.attendance}`) &&
                  "hidden",
              )}
              onClick={handleUpdate}
            >
              <Icon name="edit" size="sm" />
              Update Summary
            </DropdownMenuItem>

            <DropdownMenuSeparator
              className={cn(
                "hidden",
                hasPermission(role, `${deleteRole}:${attribute.attendance}`) &&
                  "flex",
              )}
            />
            <DeleteAttendance attendanceId={attendanceId} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
