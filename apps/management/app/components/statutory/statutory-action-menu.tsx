import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
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
import { cn } from "@canny_ecosystem/ui/utils/cn";

import { useState } from "react";
import { CreateYearlyBonusModal } from "./create-yearly-bonus-modal";

interface StatutoryActionMenuProps {
  onCreateInvoice: () => void;
  onDownloadBankDetails: () => void;
  selectedCount: number;
  className?: string;
  payrolls: any[];
  bonusSettings: any;
  status?: string;
}

export function StatutoryActionMenu({
  onCreateInvoice,
  onDownloadBankDetails,
  selectedCount,
  className,
  payrolls,
  bonusSettings,
  status,
}: StatutoryActionMenuProps) {
  const [bonusModalOpen, setBonusModalOpen] = useState(false);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Create Yearly Bonus Button */}
      <div className={cn(status === "paid" && "hidden")}>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-[2.5rem]"
          onClick={() => setBonusModalOpen(true)}
        >
          <Icon name="plus" className="h-[18px] w-[18px]" />
        </Button>

        <CreateYearlyBonusModal
          open={bonusModalOpen}
          onOpenChange={setBonusModalOpen}
          payrolls={payrolls}
          bonusSettings={bonusSettings}
        />
      </div>

      {/* 3-Dot Menu */}
      <div
        className={cn((selectedCount === 0 || status === "paid") && "hidden")}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="muted" size="icon" className="h-10 w-[2.5rem]">
              <Icon name="dots-vertical" className="h-[18px] w-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={10}
            align="end"
            className="min-w-[200px]"
          >
            <DropdownMenuItem
              onClick={onCreateInvoice}
              className="space-x-3 py-2.5 cursor-pointer"
            >
              <Icon name="plus-circled" className="h-4 w-4" />
              <span className="font-medium text-sm text-foreground">
                Create Invoice
              </span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-white/5" />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="space-x-3 py-2.5 cursor-pointer"
                >
                  <Icon name="import" className="h-4 w-4" />
                  <span className="font-medium text-sm text-foreground">
                    Download Bank Advice
                  </span>
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-white/10">
                <AlertDialogHeader>
                  <AlertDialogTitle>Download Bank Details</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to download the bank advice for the
                    selected {selectedCount} employees?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-transparent border-white/10">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDownloadBankDetails}
                    className="bg-primary text-primary-foreground"
                  >
                    Download
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
