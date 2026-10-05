import type { ExitDataType } from "@canny_ecosystem/supabase/queries";
import type { EmployeeExitRow } from "@canny_ecosystem/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import { formatDate } from "@canny_ecosystem/utils";

type Props = {
  exit: EmployeeExitRow & ExitDataType;
};

export default function DeathExitDetailsDialog({ exit }: Props) {
  const death = exit?.death_exit;

  return (
    <Dialog>
      <DialogTrigger
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center  px-2 py-1 rounded-md text-primary font-semibold cursor-pointer"
      >
        Yes
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">
            Employee Death Exit Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <Detail label="Employee Name">
            {`${exit?.employees?.first_name ?? ""} ${exit?.employees?.last_name ?? ""}`}
          </Detail>

          <Detail label="Last Working Day">
            {formatDate(exit?.last_working_day)}
          </Detail>

          <Detail label="Death Reason">{death?.death_reason ?? "--"}</Detail>

          <Detail label="Date Of Death">
            {formatDate(death?.date_of_death)}
          </Detail>

          <Detail label="On Duty Esic">
            {death?.on_duty_esic ? "Yes" : "No"}
          </Detail>

          <Detail label="Final Settlement Date">
            {formatDate(exit?.final_settlement_date)}
          </Detail>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 border-b pb-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{children || "--"}</p>
    </div>
  );
}
