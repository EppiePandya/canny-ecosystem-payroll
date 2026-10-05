import type {
  PayrollDatabaseRow,
  TypedSupabaseClient,
} from "@canny_ecosystem/supabase/types";
import { formatDate, getMonthName } from "@canny_ecosystem/utils";
import { Card, CardContent } from "@canny_ecosystem/ui/card";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Link } from "@remix-run/react";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { SiteSelectorDialog } from "./site-selector-dialog";
import { ProjectSelectorDialog } from "./project-selector-dialog";

export function PayrollCard({
  data,
  supabase,
  statusTag,
}: {
  data: PayrollDatabaseRow;
  supabase: TypedSupabaseClient;
  statusTag?: "current" | "overdue";
}) {
  const renderStatusTag = () => {
    if (!statusTag) return null;
    return (
      <div
        className={cn(
          "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] shadow-sm border whitespace-nowrap",
          statusTag === "current"
            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            : "bg-rose-500/10 text-rose-600 border-rose-500/20 animate-pulse",
        )}
      >
        {statusTag}
      </div>
    );
  };
  const is_approved = data.status === "approved";

  return (
    <Card className="w-full relative select-text cursor-auto dark:border-[1.5px] flex flex-col justify-between overflow-visible">
      <CardContent className="h-full flex flex-col md:flex-row justify-between items-start md:items-center p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center flex-1 gap-2 md:gap-4 w-full">
          <div className="text-sm tracking-wide flex flex-row md:flex-col justify-between md:justify-center items-center text-center w-full flex-1">
            <h2 className="text-xs md:text-sm">No. Of Employees</h2>
            <p className="p-2 w-auto font-bold text-xs md:text-sm rounded-md">
              {data.total_employees}
            </p>
          </div>

          <div className="hidden md:flex text-sm tracking-wide flex-col justify-center items-center text-center flex-1">
            <h2>Month</h2>
            <p className="p-2 w-auto font-bold text-sm rounded-md">
              {getMonthName(data.month!)}
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center">
            {renderStatusTag()}
          </div>

          <div className="hidden md:flex text-sm tracking-wide flex-col justify-center items-center text-center flex-1">
            <h2>Year</h2>
            <p className="p-2 w-auto font-bold text-sm rounded-md">
              {data.year}
            </p>
          </div>

          <div className="flex md:hidden text-sm text-bolder tracking-wide flex-row justify-between items-center text-center w-full">
            <h2 className="text-xs md:text-sm">Date</h2>
            <div className="flex items-center gap-2">
              {renderStatusTag()}
              <p className="p-2 font-bold text-xs md:text-sm">
                {getMonthName(data.month!)} {data.year} (
                {formatDate(data.run_date ?? "-")})
              </p>
            </div>
          </div>

          <ProjectSelectorDialog payrollId={data.id} supabase={supabase} />
          <SiteSelectorDialog payrollId={data.id} supabase={supabase} />

          <Link
            prefetch="intent"
            to={
              is_approved
                ? `/payroll/payroll-history/${data.id}`
                : `/payroll/run-payroll/${data.id}`
            }
            className={cn(
              buttonVariants(),
              "border-2 border-primary flex-1 w-full",
            )}
          >
            {is_approved ? "View Pay History" : "Select All"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
