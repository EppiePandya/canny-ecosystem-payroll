import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";

export function GenerateLetterLoader({ open }: { open: boolean }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-[400px] text-center">
        <AlertDialogHeader>
          <AlertDialogTitle>Generating Letters…</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="mt-3 mb-4">
          <p className="text-sm text-muted-foreground">
            Please wait while we prepare your letters.
          </p>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
