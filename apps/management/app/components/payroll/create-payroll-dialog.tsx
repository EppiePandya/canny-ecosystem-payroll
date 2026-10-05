import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import { StatusButton } from "@canny_ecosystem/ui/status-button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export function CreatePayrollDialog() {
  const fetcher = useFetcher<any>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");

  useEffect(() => {
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      setStatus("pending");
    } else if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        setStatus("success");
        toast({
          title: "Success",
          description: "Payroll created successfully",
          variant: "success",
        });

        setTimeout(() => {
          setOpen(false);
          if (fetcher.data.payrollId) {
            navigate(`/payroll/run-payroll/${fetcher.data.payrollId}`);
          }
        }, 1500);
      } else if (fetcher.data.error) {
        setStatus("error");
        toast({
          title: "Error",
          description: fetcher.data.error,
          variant: "destructive",
        });
        setTimeout(() => setStatus("idle"), 2000);
      }
    }
  }, [fetcher.state, fetcher.data, toast, navigate]);

  const handleCreate = () => {
    fetcher.submit({ intent: "create-payroll" }, { method: "post" });
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTimeout(() => setStatus("idle"), 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          Create Payroll
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold">
            Create Payroll
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-10">
          <StatusButton
            status={
              status === "pending"
                ? "pending"
                : status === "success"
                  ? "success"
                  : "idle"
            }
            onClick={handleCreate}
            className={cn(
              "w-40 h-12 text-lg font-medium transition-all duration-200",
              status === "success" &&
                "bg-green-600 hover:bg-green-600 text-white cursor-default",
            )}
            disabled={status !== "idle"}
          >
            {status === "idle" && "Create"}
            {status === "pending" && "Creating..."}
            {status === "success" && "Done"}
            {status === "error" && "Create"}
          </StatusButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
