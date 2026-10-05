import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@canny_ecosystem/ui/command";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import { cn } from "@canny_ecosystem/ui/utils/cn";

import {
  Await,
  type ClientLoaderFunctionArgs,
  defer,
  Outlet,
  redirect,
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
import { Suspense, useEffect, useState, useRef } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PayrollCard } from "@/components/payroll/payroll-card";
import {
  getPendingOrSubmittedPayrollsByCompanyId,
  type PayrollFilters,
} from "@canny_ecosystem/supabase/queries";
import { ErrorBoundary } from "@/components/error-boundary";
import { clearCacheEntry, clientCaching } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { formatDate } from "@canny_ecosystem/utils";
import { ImportSalaryPayrollModal } from "@/components/payroll/import-export/import-salary-modal-payroll";
import type { PayrollDatabaseRow } from "@canny_ecosystem/supabase/types";
import { useInView } from "react-intersection-observer";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import { generatePayrollFilter } from "@/utils/ai/payroll";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";

import { months } from "@canny_ecosystem/utils/constant";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";

const pageSize = 15;

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const url = new URL(request.url);
    const searchParams = new URLSearchParams(url.searchParams);
    const query = searchParams.get("name") ?? null;

    const filters: PayrollFilters = {
      date_start: searchParams.get("date_start") ?? null,
      date_end: searchParams.get("date_end") ?? null,
      status: searchParams.get("status") ?? null,
      month: searchParams.get("month") ?? null,
      year: searchParams.get("year") ?? null,
    };

    const payrollsPromise = getPendingOrSubmittedPayrollsByCompanyId({
      supabase,
      companyId: companyId ?? "",
      params: {
        from: 0,
        to: pageSize - 1,
        filters,
        searchQuery: query ?? undefined,
      },
    });

    return defer({ payrollsPromise, query, filters, env, companyId });
  } catch (error) {
    console.error("Run Payroll Error", error);
    return defer({
      payrollsPromise: Promise.resolve({ data: [], error: null }),
      query: "",
      filters: null,
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL!,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
      },
      companyId: null,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.run_payroll, args);
}

clientLoader.hydrate = true;

export async function action({ request }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  try {
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "create-payroll") {
      const now = new Date();
      const monthInput = formData.get("month");
      const yearInput = formData.get("year");
      const targetMonth = monthInput ? Number(monthInput) : now.getMonth() + 1;
      const targetYear = yearInput ? Number(yearInput) : now.getFullYear();

      const monthName = Object.keys(months).find(
        (key) => Number(months[key]) === targetMonth,
      );
      const { data: existingPayroll } = await supabase
        .from("payroll")
        .select("id")
        .eq("company_id", companyId! as any)
        .eq("month", targetMonth as any)
        .eq("year", targetYear as any)
        .maybeSingle();

      if (existingPayroll) {
        return json({
          success: true,
          alreadyExists: true,
          payrollId: (existingPayroll as any).id,
        });
      }

      const { data: payroll, error: payrollCreateError } = await supabase
        .from("payroll")
        .insert({
          company_id: companyId!,
          month: targetMonth,
          year: targetYear,
          title: `Payroll - ${monthName} ${targetYear}`,
          status: "pending",
          total_employees: 0,
          run_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (payrollCreateError) throw payrollCreateError;

      return json({ success: true, payrollId: (payroll as any).id });
    }

    const url = new URL(request.url);
    const formDataPrompt = await request.formData();
    const prompt = formDataPrompt.get("prompt") as string;

    const { object } = await generatePayrollFilter({ input: prompt });

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(object)) {
      if (value !== null && value !== undefined && String(value)?.length) {
        searchParams.append(key, value.toString());
      }
    }

    url.search = searchParams.toString();

    return redirect(url.toString());
  } catch (error: any) {
    console.error("Payroll Error in action function:", error);
    return json(
      { error: error.message || "Failed to process payroll request" },
      { status: 500 },
    );
  }
}

export default function RunPayrollIndex() {
  const { payrollsPromise, filters, query, companyId, env } =
    useLoaderData<typeof loader>();
  const { ref, inView } = useInView();
  const { supabase } = useSupabase({ env });
  const { toast } = useToast();
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const lastDataRef = useRef<any>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedYear, setSelectedYear] = useState(String(currentYear));

  const isFutureDate =
    Number(selectedYear) > currentYear ||
    (Number(selectedYear) === currentYear &&
      Number(selectedMonth) > currentMonth);

  const createPayrollFetcher = useFetcher();

  useEffect(() => {
    createPayrollFetcher.submit(
      { intent: "create-payroll" },
      { method: "post" },
    );
  }, []);

  useEffect(() => {
    if (isCreateOpen) {
      setSelectedMonth(String(currentMonth));
      setSelectedYear(String(currentYear));
    }
  }, [isCreateOpen]);

  useEffect(() => {
    const data = createPayrollFetcher.data as any;
    if (!data) {
      lastDataRef.current = null;
      return;
    }

    if (data === lastDataRef.current) return;
    lastDataRef.current = data;

    if (data.error) {
      if (isCreateOpen) {
        toast({
          title: "Error Creating Payroll",
          description: data.error,
          variant: "destructive",
          duration: 3000,
        });
      } else {
        setPayrollError(data.error);
      }
    } else if (data.alreadyExists && isCreateOpen) {
      toast({
        title: "Payroll Already Exists",
        description:
          "A payroll already exists for the selected month and year.",
        variant: "destructive",
        duration: 3000,
      });
    } else {
      setPayrollError(null);
    }

    if (data.success) {
      setIsCreateOpen(false);
    }
  }, [createPayrollFetcher.data, isCreateOpen, toast]);

  return (
    <section className="px-4 p-2">
      <div className="w-full flex items-center justify-end mb-4 py-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsCreateOpen(true)}
          className="h-10 w-10"
        >
          <Icon name="plus" className="h-[18px] w-[18px]" />
        </Button>
      </div>
      <div className="w-full flex flex-col items-end justify-between">
        <Suspense fallback={<LoadingSpinner className="my-20" />}>
          <Await resolve={payrollsPromise}>
            {(result) => {
              clearCacheEntry(cacheKeyPrefix.run_payroll);

              const innitial = result.data;
              const meta = "meta" in result ? result.meta : undefined;
              const error = result.error;
              if (error)
                return (
                  <ErrorBoundary
                    error={error}
                    message="Error in fetching payroll"
                  />
                );

              const { isDocument } = useIsDocument();
              const [hasNextPage, setHasNextPage] = useState(
                Boolean(
                  meta?.count && innitial?.length
                    ? meta.count > innitial.length
                    : false,
                ),
              );

              const [data, setData] = useState(innitial);
              const [from, setFrom] = useState(pageSize);
              useEffect(() => {
                setData(innitial);
                setFrom(pageSize);
                setHasNextPage(
                  Boolean(
                    meta?.count && innitial?.length
                      ? meta.count > innitial.length
                      : false,
                  ),
                );
              }, [innitial]);

              const loadMorePayrolls = async () => {
                const formattedFrom = from;
                const to = formattedFrom + pageSize - 1;

                try {
                  if (companyId) {
                    const { data: moreData } =
                      await getPendingOrSubmittedPayrollsByCompanyId({
                        supabase,
                        companyId,
                        params: {
                          from: formattedFrom,
                          to,
                          filters,
                          searchQuery: query ?? undefined,
                        },
                      });

                    if (moreData?.length) {
                      setData((prevData: any) => [...prevData, ...moreData]);
                      setFrom(to + 1);
                      setHasNextPage(moreData.length === pageSize);
                      length;
                    } else {
                      setHasNextPage(false);
                    }
                  }
                } catch (error) {
                  console.error("Error loading more payrolls", error);
                  setHasNextPage(false);
                }
              };

              useEffect(() => {
                if (inView) {
                  loadMorePayrolls();
                }
              }, [inView]);

              return (
                <>
                  <Command className="overflow-visible">
                    <CommandEmpty
                      className={cn(
                        "w-full py-40 capitalize text-lg tracking-wide text-center",
                        !isDocument && "hidden",
                      )}
                    >
                      No payrolls found.
                    </CommandEmpty>
                    <CommandList className="max-h-full overflow-x-visible overflow-y-visible">
                      <CommandGroup className="p-0 overflow-visible">
                        <div className="w-full grid gap-8 grid-cols-1">
                          {(() => {
                            const now = new Date();
                            const currentMonth = now.getMonth() + 1;
                            const currentYear = now.getFullYear();

                            const currentPayrolls =
                              data?.filter(
                                (p: any) =>
                                  p.month === currentMonth &&
                                  p.year === currentYear,
                              ) || [];
                            const otherPayrolls =
                              data?.filter(
                                (p: any) =>
                                  !(
                                    p.month === currentMonth &&
                                    p.year === currentYear
                                  ),
                              ) || [];

                            const renderPayroll = (payroll: any) => {
                              if (!payroll) return null;
                              const isCurrent =
                                payroll.month === currentMonth &&
                                payroll.year === currentYear;
                              return (
                                <CommandItem
                                  key={payroll.id}
                                  value={
                                    payroll.id +
                                    payroll?.commission +
                                    formatDate(payroll?.run_date) +
                                    payroll?.status +
                                    payroll?.total_employees +
                                    payroll?.total_net_amount +
                                    formatDate(payroll?.created_at)
                                  }
                                  className="data-[selected=true]:bg-inherit data-[selected=true]:text-foreground px-0 py-0"
                                >
                                  <PayrollCard
                                    data={
                                      payroll as unknown as PayrollDatabaseRow
                                    }
                                    key={payroll.id}
                                    supabase={supabase}
                                    statusTag={
                                      isCurrent ? "current" : "overdue"
                                    }
                                  />
                                </CommandItem>
                              );
                            };

                            return (
                              <>
                                {currentPayrolls.map(renderPayroll)}
                                {payrollError && (
                                  <div className="w-full bg-destructive/5 dark:bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-3 items-start animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex-1 min-w-0 text-left">
                                      <h4 className="text-sm font-semibold text-destructive">
                                        Error Creating Payroll
                                      </h4>
                                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                        {payrollError}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {currentPayrolls.length > 0 &&
                                  otherPayrolls.length > 0 && (
                                    <div className="flex items-center gap-4">
                                      <div className="flex-1 h-px bg-border" />
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                                        Previous Payrolls
                                      </span>
                                      <div className="flex-1 h-px bg-border" />
                                    </div>
                                  )}
                                {otherPayrolls.map(renderPayroll)}
                              </>
                            );
                          })()}
                        </div>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {hasNextPage && innitial?.length && (
                    <div
                      className="flex items-center justify-center mt-6 mx-auto"
                      ref={ref}
                    >
                      <div className="flex items-center space-x-2 px-6 py-5">
                        <Spinner />
                        <span className="text-sm text-[#606060]">
                          Loading more...
                        </span>
                      </div>
                    </div>
                  )}
                </>
              );
            }}
          </Await>
        </Suspense>
      </div>

      <ImportSalaryPayrollModal />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Payroll</DialogTitle>
            <DialogDescription>
              Select the month and year to run the payroll for. Note that you
              cannot create payroll for future dates.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="month-select"
                className="text-right text-sm font-medium text-muted-foreground"
              >
                Month
              </label>
              <div className="col-span-3">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger id="month-select" className="w-full">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(months).map(([name, num]) => (
                      <SelectItem key={name} value={String(num)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="year-select"
                className="text-right text-sm font-medium text-muted-foreground"
              >
                Year
              </label>
              <div className="col-span-3">
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger id="year-select" className="w-full">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: currentYear - 2024 + 1 }, (_, i) =>
                      String(2024 + i),
                    )
                      .reverse()
                      .map((yr) => (
                        <SelectItem key={yr} value={yr}>
                          {yr}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isFutureDate && (
              <p className="text-xs text-destructive text-center font-medium mt-1">
                You cannot create a payroll for a future date.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createPayrollFetcher.state !== "idle"}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isFutureDate || createPayrollFetcher.state !== "idle"}
              onClick={() => {
                createPayrollFetcher.submit(
                  {
                    intent: "create-payroll",
                    month: selectedMonth,
                    year: selectedYear,
                  },
                  { method: "post" },
                );
              }}
            >
              {createPayrollFetcher.state !== "idle"
                ? "Creating..."
                : "Create Payroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Outlet />
    </section>
  );
}
