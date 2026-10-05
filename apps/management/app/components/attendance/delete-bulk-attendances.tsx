import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry } from "@/utils/cache";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { ErrorList } from "@canny_ecosystem/ui/forms";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { DELETE_TEXT } from "@canny_ecosystem/utils/constant";
import { useLocation, useSubmit } from "@remix-run/react";
import { useState } from "react";

export const DeleteBulkAttendances = ({
  selectedRows,
  className,
}: {
  selectedRows: any[];
  className?: string | undefined;
}) => {
  const [isLoading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string[]>([]);
  const submit = useSubmit();
  const location = useLocation();

  const handleCancleBulkAttendances = () => {
    setInputError([]);
    setInputValue("");
    setLoading(false);
  };

  const handleDeleteBulkAttendances = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    const updates = selectedRows.filter(
      (entry: any) =>
        !entry.monthly_attendance?.salary_entries?.invoice_id?.length,
    );

    if (inputValue.trim() === DELETE_TEXT) {
      if (!updates.length) {
        setInputError([
          "The selected records are linked to an invoice and cannot be deleted.",
        ]);
        return;
      }
      setLoading(true);
      clearCacheEntry(`${cacheKeyPrefix.attendance}`);
      submit(
        {
          attendancesDeleteData: JSON.stringify(updates),
          failedRedirect: `${location.pathname}${location.search}`,
        },
        {
          method: "POST",
          action: "/time-tracking/attendance/delete-bulk-attendances",
        },
      );
    } else {
      e.preventDefault();
      setInputError(["Please type the correct text to confirm."]);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn(
          buttonVariants({ variant: "destructive-outline", size: "icon" }),
          "h-10 w-10",
          !selectedRows.length && "hidden",
          className,
        )}
      >
        <Icon name="trash" className="h-[18px] w-[18px]" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            selected attendance records and remove them from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <p className="text-sm text-foreground/80">
            Please type{" "}
            <i className="text-foreground font-medium">{DELETE_TEXT}</i> to
            confirm.
          </p>
          <Input
            type="text"
            autoFocus
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setInputError([]);
            }}
            className="border border-input rounded-md h-10 w-full"
            placeholder="Confirm your action"
            onPaste={(e) => {
              e.preventDefault();
              return false;
            }}
          />
          <ErrorList errors={inputError} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancleBulkAttendances}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={handleDeleteBulkAttendances}
            onSelect={handleDeleteBulkAttendances}
          >
            {isLoading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
