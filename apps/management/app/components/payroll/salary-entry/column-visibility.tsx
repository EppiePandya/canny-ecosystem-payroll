import { useSalaryEntriesStore } from "@/store/salary-entries";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export function ColumnVisibility({
  disabled,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const { columns, columnVisibility, setColumnVisibility } =
    useSalaryEntriesStore();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("h-10 w-10", className)}
          disabled={disabled}
        >
          <Icon name="column" className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[200px] p-0" align="end" sideOffset={8}>
        <div className="flex flex-col p-4 space-y-3 max-h-[352px] overflow-auto">
          {columns
            .filter((column: any) => column?.columnDef?.enableHiding !== false)
            .map((column: any) => {
              const isVisible =
                columnVisibility[column.id] ?? column.getIsVisible();

              return (
                <div key={column.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={column.id}
                    checked={isVisible}
                    onCheckedChange={(checked) => {
                      setColumnVisibility((prev: any) => ({
                        ...prev,
                        [column.id]: !!checked,
                      }));
                    }}
                  />
                  <label
                    htmlFor={column.id}
                    className="text-sm peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {column.columnDef.header?.toString() || column.id}
                  </label>
                </div>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
