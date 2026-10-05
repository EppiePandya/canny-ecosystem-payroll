import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@canny_ecosystem/ui/chart";
import { useMemo } from "react";

const chartConfig = {
  count: {
    label: "Active Employees",
  },
} satisfies ChartConfig;

export function ActiveEmployeesBySite({ chartData }: { chartData: any[] }) {
  // Process Active Employees data
  const activeChartData = useMemo(() => {
    const siteCounts: Record<string, Record<string, number>> = {};

    for (const item of chartData) {
      const workDetails = Array.isArray(item.work_details)
        ? item.work_details[0]
        : item.work_details;

      if (!workDetails) continue;

      const project =
        workDetails.projects?.name || workDetails.sites?.projects?.name;
      const site = workDetails.sites?.name;

      if (!site) continue;

      const projectKey = project || site;

      if (!siteCounts[projectKey]) {
        siteCounts[projectKey] = {};
      }

      siteCounts[projectKey][site] = (siteCounts[projectKey][site] || 0) + 1;
    }

    const finalData = Object.entries(siteCounts).map(([project, sites]) => {
      const totalCount = Object.values(sites).reduce((a, b) => a + b, 0);
      return {
        project,
        count: totalCount,
        sites,
      };
    });

    // Sort descending by employee count
    return finalData.sort((a, b) => b.count - a.count);
  }, [chartData]);

  // Dynamic height to give items enough vertical space
  const activeHeight = Math.max(380, activeChartData.length * 35);

  // Custom active employees tooltip
  const CustomActiveTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border text-popover-foreground px-3 py-2 rounded-lg shadow-xl flex flex-col gap-1.5 text-xs min-w-[180px]">
          <div className="font-semibold border-b border-border pb-1 mb-0.5 text-primary">
            {data.project}
          </div>
          <div className="flex justify-between items-center font-semibold">
            <span>Total Employees:</span>
            <span className="text-primary">{data.count}</span>
          </div>
          {data.sites && Object.keys(data.sites).length > 0 && (
            <div className="flex flex-col gap-1 mt-1 pl-1.5 border-l border-primary/30">
              {Object.entries(data.sites).map(([site, count]) => (
                <div
                  key={site}
                  className="flex items-center justify-between text-[11px] text-muted-foreground"
                >
                  <span>{site}</span>
                  <span className="font-mono">{count as number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col h-[520px]">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">
          Employees by Module
        </CardTitle>
        <CardDescription className="text-xs">
          Active workforce distribution grouped by module
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto pr-2 scrollbar-none pb-2">
        {activeChartData.length > 0 ? (
          <ChartContainer
            config={chartConfig}
            style={{ height: `${activeHeight}px`, width: "100%" }}
          >
            <BarChart
              data={activeChartData}
              layout="vertical"
              margin={{ left: -10, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid
                horizontal={false}
                strokeDasharray="3 3"
                className="stroke-muted/15"
              />
              <XAxis type="number" hide />
              <YAxis
                dataKey="project"
                type="category"
                tickLine={false}
                axisLine={false}
                width={100}
                className="fill-muted-foreground text-[10px] font-medium"
                tickFormatter={(val) =>
                  val.length > 15 ? `${val.substring(0, 13)}...` : val
                }
              />
              <ChartTooltip
                content={<CustomActiveTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--chart-1))"
                radius={[0, 4, 4, 0]}
                barSize={14}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No active employee data available.
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-1.5 text-[11px] text-muted-foreground pt-2 border-t border-border/40">
        <div className="leading-none flex items-center gap-1">
          <span>Hover over a bar to inspect branch/site distribution.</span>
        </div>
      </CardFooter>
    </Card>
  );
}
