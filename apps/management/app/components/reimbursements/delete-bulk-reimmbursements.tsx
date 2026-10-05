import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry } from "@/utils/cache";
import type { ReimbursementDataType } from "@canny_ecosystem/supabase/queries";
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
import { useSubmit } from "@remix-run/react";
import { useState } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export const DeleteBulkReimbursements = ({
  selectedRows,
  className,
}: {
  selectedRows: ReimbursementDataType[];
  className?: string | undefined;
}) => {
  const [isLoading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string[]>([]);
  const submit = useSubmit();
  const { toast } = useToast();

  const handleCancleBulkReimbursements = () => {
    setInputError([]);
    setInputValue("");
    setLoading(false);
  };

  const handleDeleteBulkReimbursements = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    if (inputValue === DELETE_TEXT) {
      setLoading(true);

      const validEntries = selectedRows.filter(
        (entry: any) => !entry.invoice_id?.length,
      );
      const skippedCount = selectedRows.length - validEntries.length;

      if (skippedCount > 0) {
        toast({
          title: "Information",
          description: `${skippedCount} ${
            skippedCount === 1 ? "entry" : "entries"
          } skipped because an invoice is already created for them.`,
        });
      }

      if (validEntries.length === 0) {
        setLoading(false);
        return;
      }

      clearCacheEntry(`${cacheKeyPrefix.reimbursements}`);
      submit(
        {
          reimbursementDeleteData: JSON.stringify(validEntries),
          failedRedirect: "/approvals/reimbursements",
        },
        {
          method: "POST",
          action: "/approvals/reimbursements/delete-bulk-reimbursements",
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
          (!selectedRows.length ||
            selectedRows.every((row: any) => row.invoice_id?.length > 0)) &&
            "hidden",
          className,
        )}
      >
        <Icon name="trash" className="h-[18px] w-[18px]" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            Reimbursement and remove it's data from our servers.
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
          <AlertDialogCancel onClick={handleCancleBulkReimbursements}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={handleDeleteBulkReimbursements}
            onSelect={handleDeleteBulkReimbursements}
          >
            {isLoading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
