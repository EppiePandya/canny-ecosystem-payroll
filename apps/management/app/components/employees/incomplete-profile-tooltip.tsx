import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";
import { Icon } from "@canny_ecosystem/ui/icon";

export function IncompleteProfileTooltip({
  missingFields,
}: {
  missingFields: string[];
}) {
  if (missingFields.length === 0) return null;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger
        type="button"
        className="cursor-help inline-flex items-center leading-none flex-shrink-0"
      >
        <Icon name="info" className="h-[18px] w-[18px] text-yellow-500" />
      </TooltipTrigger>
      <TooltipContent
        side={"right"}
        align="start"
        collisionPadding={8}
        className="normal-case max-w-lg z-[9999] bg-muted text-muted-foreground border-gray-700 shadow-xl px-3 py-1.5"
      >
        <p className="font-bold">Add: {missingFields.join(", ")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
