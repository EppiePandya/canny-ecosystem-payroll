import { Button } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { fixedDecimal } from "@canny_ecosystem/utils";

interface BonusExportBarProps {
  selectedCount: number;
  totalAmount: number;
  onExport: () => void;
  className?: string;
}

export function BonusExportBar({
  selectedCount,
  totalAmount,
  onExport,
  className,
}: BonusExportBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "z-40 fixed bottom-16 md:bottom-8 left-0 right-0 mx-auto h-14 w-max shadow-md rounded-full flex gap-10 justify-between items-center p-2 text-sm border dark:border-muted-foreground/30 bg-card text-card-foreground",
        className,
      )}
    >
      <div className="ml-2 flex items-center space-x-1 rounded-md">
        <p className="font-semibold whitespace-nowrap">
          {selectedCount} Selected
        </p>
      </div>
      <div className="h-full flex justify-center items-center gap-2">
        <div className="h-full tracking-wide font-medium rounded-full hidden md:flex justify-between items-center px-6 border dark:border-muted-foreground/30 whitespace-nowrap">
          Amount: <span className="ml-1.5">{fixedDecimal(totalAmount)}</span>
        </div>
        <Button
          onClick={(e) => {
            e.preventDefault();
            onExport();
          }}
          variant="default"
          size="lg"
          className="h-full rounded-full px-8"
        >
          Export
        </Button>
      </div>
    </div>
  );
}
