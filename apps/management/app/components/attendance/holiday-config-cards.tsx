import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { HolidayConfigDatabaseRow } from "@canny_ecosystem/supabase/types";
import { useState } from "react";
import { HolidayConfigDialog } from "./holiday-config-dialog";
import { useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";

const holidayConfigTypes = [
  { type: "overtime_hours", label: "Overtime Hours" },
  { type: "paid_holidays", label: "Paid Holidays" },
  { type: "paid_leaves", label: "Paid Leaves" },
  { type: "casual_leaves", label: "Casual Leaves" },
] as const;

export function HolidayConfigCards({
  configs,
  companyId,
}: {
  configs: HolidayConfigDatabaseRow[];
  companyId: string;
}) {
  const [selectedConfig, setSelectedConfig] = useState<{
    type: string;
    label: string;
    record?: HolidayConfigDatabaseRow;
  } | null>(null);
  const fetcher = useFetcher();

  const configMap = configs.reduce(
    (acc, config) => {
      acc[config.type] = config;
      return acc;
    },
    {} as Record<string, HolidayConfigDatabaseRow>,
  );

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this configuration?")) {
      clearCacheEntry(cacheKeyPrefix.attendance);
      fetcher.submit(
        { id, _action: "delete-holiday-config" },
        { method: "post" },
      );
    }
  };

  const { toast } = useToast();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as any;
      if (data.error) {
        toast({
          title: "Error",
          description: data.error.message || "Failed to delete holiday config",
          variant: "destructive",
        });
      } else {
        clearCacheEntry(cacheKeyPrefix.attendance);
        toast({
          title: "Success",
          description: "Holiday configuration deleted successfully",
        });
      }
    }
  }, [fetcher.state, fetcher.data, toast]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Holiday Configuration</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {holidayConfigTypes.map(({ type, label }) => {
          const config = configMap[type];
          return (
            <Card
              key={type}
              className={`relative flex flex-col justify-between transition-all duration-200 border ${
                config
                  ? "border-primary/20 bg-primary/5 dark:bg-primary/10 shadow-sm"
                  : "border-dashed border-muted-foreground/30 bg-muted/30"
              }`}
            >
              <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <div className="flex gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 rounded-full hover:bg-primary/10 hover:text-primary"
                          onClick={() =>
                            setSelectedConfig({ type, label, record: config })
                          }
                        >
                          <Icon name="edit" size="sm" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{config ? "Edit Config" : "Create Config"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {config && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(config.id)}
                          >
                            <Icon name="trash" size="sm" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete Config</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex items-baseline justify-between mt-1">
                  <div className="flex flex-col">
                    <span className="text-xl font-bold tracking-tight">
                      {config ? `${config.multiplier}x` : "-"}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      Multiplier
                    </span>
                  </div>
                  {config && (
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold tracking-tight">
                        {config.use_attendance_working_days
                          ? "Attendance"
                          : `${config.working_days ?? 0} Days`}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        Working Days
                      </span>
                    </div>
                  )}
                  {!config && (
                    <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground bg-muted rounded">
                      Not Set
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedConfig && (
        <HolidayConfigDialog
          open={!!selectedConfig}
          onOpenChange={(open) => !open && setSelectedConfig(null)}
          type={selectedConfig.type}
          label={selectedConfig.label}
          record={selectedConfig.record}
          companyId={companyId}
        />
      )}
    </div>
  );
}
