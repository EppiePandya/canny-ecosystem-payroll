import type { UserDatabaseRow } from "@canny_ecosystem/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { ErrorList } from "@canny_ecosystem/ui/forms";
import { Input } from "@canny_ecosystem/ui/input";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { deleteRole, hasPermission } from "@canny_ecosystem/utils";
import { attribute, DELETE_TEXT } from "@canny_ecosystem/utils/constant";
import { useSubmit } from "@remix-run/react";
import { useState } from "react";
import { Icon } from "@canny_ecosystem/ui/icon";

export const DeleteManpowerVersion = ({
  role,
  relationshipId,
  versionId,
}: {
  relationshipId: string;
  versionId: string;
  role: UserDatabaseRow["role"];
}) => {
  const [isLoading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const submit = useSubmit();

  const handleCancelDelete = () => {
    setInputError([]);
    setInputValue("");
    setLoading(false);
    setIsDialogOpen(false);
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    if (inputValue === DELETE_TEXT) {
      setLoading(true);
      submit(
        {},
        {
          method: "post",
          action: `/settings/relationships/${relationshipId}/${versionId}/delete-manpower-version`,
          replace: true,
        },
      );
    } else {
      e.preventDefault();
      setInputError(["Please type the correct text to confirm."]);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "muted" }),
            "px-2 h-min outline-none",
            !hasPermission(
              role,
              `${deleteRole}:${attribute.settingRelationships}`,
            ) && "hidden",
          )}
        >
          <Icon name="dots-vertical" size="xs" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => setIsDialogOpen(true)}
            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
          >
            Delete Version
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              manpower version and remove its data from our servers.
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
            <AlertDialogCancel onClick={handleCancelDelete}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={handleDelete}
            >
              {isLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
