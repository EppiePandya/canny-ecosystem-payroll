import { useUser } from "@/utils/user";
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
import { buttonVariants, Button } from "@canny_ecosystem/ui/button";
import { ErrorList } from "@canny_ecosystem/ui/forms";
import { Input } from "@canny_ecosystem/ui/input";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { deleteRole, hasPermission } from "@canny_ecosystem/utils";
import { attribute, DELETE_TEXT } from "@canny_ecosystem/utils/constant";
import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export const DeleteSalaryAssignments = ({
  assignmentIds,
  onSuccess,
  isBulk = false,
}: {
  assignmentIds: string[];
  onSuccess?: () => void;
  isBulk?: boolean;
}) => {
  const { role } = useUser();
  const [isLoading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string[]>([]);
  const fetcher = useFetcher();
  const { toast } = useToast();

  useEffect(() => {
    const data = fetcher.data as any;
    if (fetcher.state === "idle" && data && !data.error) {
      toast({
        title: "Success",
        description: `${assignmentIds.length} salary ${assignmentIds.length === 1 ? "assignment" : "assignments"} deleted successfully.`,
      });
      if (onSuccess) onSuccess();
      handleCancel();
    } else if (fetcher.state === "idle" && data?.error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: data.error,
      });
      setLoading(false);
    }
  }, [fetcher.state, fetcher.data]);

  const handleCancel = () => {
    setInputError([]);
    setInputValue("");
    setLoading(false);
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    if (inputValue === DELETE_TEXT) {
      setLoading(true);
      fetcher.submit(
        { ids: assignmentIds.join(",") },
        {
          method: "post",
          action: "/payment-components/salaries/bulk-delete",
        },
      );
    } else {
      e.preventDefault();
      setInputError(["Please type the correct text to confirm."]);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {isBulk ? (
          <Button
            variant="destructive-outline"
            size="icon"
            className="h-10 w-10 flex items-center justify-center shrink-0"
          >
            <Icon name="trash" className="h-[18px] w-[18px]" />
          </Button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 outline-none transition-colors rounded-sm",
              !hasPermission(role, `${deleteRole}:${attribute.employees}`) &&
                "hidden",
            )}
          >
            Delete Assignment
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            selected salary assignment(s) and remove their data from our
            servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <p className="text-sm text-foreground/80 mb-2">
            Please type{" "}
            <i className="text-foreground font-medium">{DELETE_TEXT}</i> to
            confirm.
          </p>
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setInputError([]);
            }}
            className="border border-input rounded-md h-10 w-full"
            placeholder="Confirm deletion"
            onPaste={(e) => {
              e.preventDefault();
              return false;
            }}
          />
          <ErrorList errors={inputError} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={handleDelete}
          >
            {isLoading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
