import { defaultMonth, defaultYear, parseMonthNumber } from "@canny_ecosystem/utils";
import type {
  EmployeeDatabaseRow,
  EmployeeExitRow,
  TypedSupabaseClient,
} from "../types";
import { months } from "@canny_ecosystem/utils/constant";

export type ImportExitPayrollDataType = Pick<
  EmployeeExitRow,
  "employee_id" | "id" | "exit_reason" | "note"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
};

export type ExitsPayrollEntriesWithEmployee = Omit<
  ImportExitPayrollDataType,
  "created_at"
> & {
  employees: Pick<
    EmployeeDatabaseRow,
    | "first_name"
    | "middle_name"
    | "last_name"
    | "employee_code"
    | "company_id"
    | "id"
  >;
};
export type DashboardFilters = {
  month?: string | undefined | null;
  year?: string | undefined | null;
};
export type ExitFilterType = {
  last_working_day_start?: string | undefined | null;
  last_working_day_end?: string | undefined | null;
  exit_reason?: string | undefined | null;
  project?: string | undefined | null;
  site?: string | undefined | null;
  in_invoice?: string | undefined | null;
  recently_added?: string | undefined | null;
};

export type ImportExitDataType = Pick<
  EmployeeExitRow,
  "last_working_day" | "note" | "exit_reason"
> & { employee_code: string };

export type ExitDataType = Pick<
  EmployeeExitRow,
  "id" | "employee_id" | "last_working_day" | "note" | "exit_reason"
> & {
  employees: Pick<
    EmployeeDatabaseRow,
    "first_name" | "middle_name" | "last_name" | "employee_code"
  > & {
    work_details: {
      sites: { name: string; projects: { name: string } };
    };
  };
};

export const getEmployeeExitByEmployeeId = async ({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) => {
  const columns = [
    "id",
    "employee_id",
    "last_working_day",
    "esic_exit_date",
    "exit_reason",
    "note",
  ] as const;

  const { data, error } = await supabase
    .from("employee_exit")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error("getEmployeeExitByEmployeeId Error", error);
  }

  return { data, error };
};

export const getEmployeeExitById = async ({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) => {
  const { data, error } = await supabase
    .from("employee_exit")
    .select(
      `
      id,
      employee_id,
      last_working_day,
      esic_exit_date,
      note,
      exit_reason,
      user_id
    `,
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("getEmployeeExitById error 👉", error);
  }

  return { data, error };
};

export const getEmployeeExits = async ({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) => {
  const columns = [
    "id",
    "employee_id",
    "last_working_day",
    "esic_exit_date",
    "exit_reason",
    "note",
  ] as const;

  const { data, error } = await supabase
    .from("employee_exit")
    .select(`
      ${columns.join(",")},

      death_exit (
        exit_id,
        death_reason,
        date_of_death,
        on_duty_esic
      )
    `)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getEmployeeExitByEmployeeId Error", error);
  }

  return { data, error };
};

export const getEmployeeExitWithDeathExit = async ({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) => {
  const columns = [
    "id",
    "employee_id",
    "last_working_day",
    "esic_exit_date",
    "exit_reason",
    "note",
  ] as const;
  const { data, error } = await supabase
    .from("employee_exit")
    .select(`
      ${columns.join(",")},
       employees (
        work_details (
          sites (
            id,
            name
          ),
          projects (
            id,
            name
          )
        )
      ),
      death_exit (
        exit_id,
        death_reason,
        date_of_death,
        on_duty_esic
      )
    `)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .returns<ExitDataType[]>();

  if (error) {
    console.error("getEmployeeExitWithDeathExit Error", error);
  }

  return { data, error };
};

export const getExitsBySiteIds = async ({
  supabase,
  siteIds,
  params,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
  params: {
    from: number;
    to: number;
    sort?: [string, "asc" | "desc"];
    searchQuery?: string;
    filters?: ExitFilterType;
  };
}) => {
  try {
    const { from, to, sort, searchQuery, filters } = params ?? {};

    const {
      last_working_day_start,
      last_working_day_end,
      exit_reason,
      in_invoice,
    } = filters ?? {};

    const columns = [
      "id",
      "employee_id",
      "last_working_day",
      "exit_reason",
      "note",
      "created_at",
    ] as const;

    let query = supabase
      .from("employee_exit")
      .select(
        `
      *,
      employees (
        first_name,
        middle_name,
        last_name,
        employee_code,
        id
      )
    `,
        { count: "exact" },
      )
      .range(from, to);

    if (last_working_day_start && last_working_day_end) {
      query = query
        .gte("last_working_day", last_working_day_start)
        .lte("last_working_day", last_working_day_end);
    }

    if (exit_reason) {
      query = query.eq("exit_reason", exit_reason);
    }

    if (searchQuery) {
      const terms = searchQuery.split(" ").slice(0, 3);
      for (const term of terms) {
        query = query.or(
          `first_name.ilike.*${term}*,middle_name.ilike.*${term}*,last_name.ilike.*${term}*,employee_code.ilike.*${term}*`,
          { referencedTable: "employees" },
        );
      }
    }

    if (last_working_day_start)
      query = query.gte("last_working_day", last_working_day_start);
    if (last_working_day_end)
      query = query.lte("last_working_day", last_working_day_end);

    if (sort) {
      const [column, direction] = sort;
      query = query.order(column, { ascending: direction === "asc" });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error("employee_exit query error:", error);
      return { data: [], meta: { count: 0 }, error };
    }

    const uniqueMap = new Map<string, any>();
    for (const item of data || []) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    }

    return {
      data: Array.from(uniqueMap.values()),
      meta: { count: count ?? 0 },
      error: null,
    };
  } catch (err) {
    console.error("employee_exit fatal:", err);
    return { data: [], meta: { count: 0 }, error: err };
  }
};

export const getExitsByCompanyId = async ({
  supabase,
  companyId,
  params,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  params: {
    from: number;
    to: number;
    sort?: [string, "asc" | "desc"];
    searchQuery?: string;
    filters?: ExitFilterType;
  };
}) => {
  const { from, to, sort, searchQuery, filters } = params ?? {};

  const {
    last_working_day_start,
    last_working_day_end,
    exit_reason,
    in_invoice,
  } = filters ?? {};

  const columns = [
    "id",
    "created_at",
    "employee_id",
    "last_working_day",
    "esic_exit_date",
    "exit_reason",
    "note",
  ] as const;

  let query = supabase
    .from("employee_exit")
    .select(
      `
    ${columns.join(",")},
    employees!inner(
      id,
      employee_code,
      first_name,
      last_name,
      company_id,
      work_details(
        site_id,
        sites(
          id,
          name,
          company_id
        ),
        projects(
          id,
          name
        )
      )
    ),
    death_exit(
      exit_id,
      death_reason,
      date_of_death,
      on_duty_esic
    )
    `,
      { count: "exact" },
    )
    .eq("employees.company_id", companyId);

  if (searchQuery) {
    const terms = searchQuery.split(" ").slice(0, 3);

    for (const term of terms) {
      query = query.or(
        `first_name.ilike.*${term}*,last_name.ilike.*${term}*,employee_code.ilike.*${term}*`,
        { referencedTable: "employees" },
      );
    }
  }

  if (last_working_day_start)
    query = query.gte("last_working_day", last_working_day_start);

  if (last_working_day_end)
    query = query.lte("last_working_day", last_working_day_end);

  // Removed invoice_id filtering as it no longer exists in schema

  if (sort) {
    const [column, direction] = sort;
    query = query.order(column, { ascending: direction === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("EXIT QUERY ERROR:", error);
    return { data: [], count: 0, error };
  }

  const uniqueMap = new Map<string, any>();
  for (const item of data || []) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }

  return {
    data: Array.from(uniqueMap.values()),
    count: count ?? 0,
    error: null,
  };
};

export const getExitsByCompanyIdByMonths = async ({
  supabase,
  companyId,
  filters,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  filters?: DashboardFilters;
}) => {
  const columns = ["id"] as const;
  const defMonth = defaultMonth - 1;
  const filterMonth = filters?.month ? parseMonthNumber(filters.month) : null;
  const filterYear = filters?.year && Number(filters.year);

  //For Current Month
  const startOfCurrentMonth = filterMonth
    ? new Date(Date.UTC(Number(filterYear ?? defaultYear), filterMonth - 1, 1))
    : new Date(Date.UTC(Number(filterYear ?? defaultYear), defMonth, 1));

  const endOfCurrentMonth = filterMonth
    ? new Date(Number(filterYear ?? defaultYear), filterMonth, 1)
    : new Date(Number(filterYear ?? defaultYear), defMonth + 1, 1);

  const currentQuery = supabase
    .from("employee_exit")
    .select(
      `${columns.join(",")},
          employees!inner(employee_code)`,
    )
    .eq("employees.company_id", companyId)
    .gte("created_at", startOfCurrentMonth.toISOString())
    .lt("created_at", endOfCurrentMonth.toISOString());

  const { data: currentMonthExits, error: currentMonthExitErrors } =
    await currentQuery;

  if (currentMonthExitErrors) {
    console.error("getExitsFor CurrentMonth Error", currentMonthExitErrors);
  }

  //For Previous Month
  const startOfPrevMonth = filterMonth
    ? new Date(Date.UTC(Number(filterYear ?? defaultYear), filterMonth - 2, 1))
    : new Date(Date.UTC(Number(filterYear ?? defaultYear), defMonth - 1, 1));
  const endOfPrevMonth = filterMonth
    ? new Date(Number(filterYear ?? defaultYear), filterMonth - 1, 1)
    : new Date(Number(filterYear ?? defaultYear), defMonth, 1);

  const prevQuery = supabase
    .from("employee_exit")
    .select(
      `${columns.join(",")},
          employees!inner(employee_code)`,
    )
    .eq("employees.company_id", companyId)
    .gte("created_at", startOfPrevMonth.toISOString())
    .lt("created_at", endOfPrevMonth.toISOString());

  const { data: previousMonthExits, error: previousMonthExitErrors } =
    await prevQuery;

  if (previousMonthExitErrors) {
    console.error("getExitsFor previousMonth Error", previousMonthExitErrors);
  }

  return {
    currentMonthExits,
    currentMonthExitErrors,
    previousMonthExits,
    previousMonthExitErrors,
  };
};

export async function getExitEntriesByPayrollIdForInvoicePreview({
  supabase,
  exitIds,
}: {
  supabase: TypedSupabaseClient;
  exitIds: string[];
}) {
  if (!exitIds || exitIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("employees")
    .select(
      `id, company_id, first_name, middle_name, last_name, employee_code, work_details!work_details_employee_id_fkey!left(
          end_date,
          position,
          start_date
        ),employee_exit!inner(id)`,
    )
    .in("employee_exit.id", exitIds)
    .returns<ExitsPayrollEntriesWithEmployee[]>();

  if (error) {
    console.error("getExitEntriesByPayrollIdForInvoicePreview Error", error);
  }

  const mapped = data?.map((emp: any) => ({
    ...emp,
    employee_exit: [
      {
        amount: 0,
      },
    ],
  }));

  return { data: mapped, error: null };
}

export const getExitsBySiteIdsByMonthsAndSiteIds = async ({
  supabase,
  siteIds,
  filters,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
  filters?: DashboardFilters;
}) => {
  const columns = ["id"] as const;
  const defMonth = defaultMonth - 1;
  const filterMonth = filters?.month ? parseMonthNumber(filters.month) : null;
  const filterYear = filters?.year && Number(filters.year);

  //For Current Month
  const startOfCurrentMonth = filterMonth
    ? new Date(Date.UTC(Number(filterYear ?? defaultYear), filterMonth - 1, 1))
    : new Date(Date.UTC(Number(filterYear ?? defaultYear), defMonth, 1));

  const endOfCurrentMonth = filterMonth
    ? new Date(Number(filterYear ?? defaultYear), filterMonth, 1)
    : new Date(Number(filterYear ?? defaultYear), defMonth + 1, 1);

  const currentQuery = supabase
    .from("employee_exit")
    .select(
      `${columns.join(",")},
          employees!inner(employee_code,work_details!work_details_employee_id_fkey!inner(
            sites!inner(
              id, name
            )
          ))`,
    )
    .in("employees.work_details.sites.id", siteIds)
    .gte("created_at", startOfCurrentMonth.toISOString())
    .lt("created_at", endOfCurrentMonth.toISOString());

  const { data: currentMonthExits, error: currentMonthExitErrors } =
    await currentQuery;

  if (currentMonthExitErrors) {
    console.error("getExitsFor CurrentMonth Error", currentMonthExitErrors);
  }

  //For Previous Month
  const startOfPrevMonth = filterMonth
    ? new Date(Date.UTC(Number(filterYear ?? defaultYear), filterMonth - 2, 1))
    : new Date(Date.UTC(Number(filterYear ?? defaultYear), defMonth - 1, 1));
  const endOfPrevMonth = filterMonth
    ? new Date(Number(filterYear ?? defaultYear), filterMonth - 1, 1)
    : new Date(Number(filterYear ?? defaultYear), defMonth, 1);

  const prevQuery = supabase
    .from("employee_exit")
    .select(
      `${columns.join(",")},
          employees!inner(employee_code,work_details!work_details_employee_id_fkey!inner(
            sites!inner(
              id, name
            )
          ))`,
    )
    .in("employees.work_details.sites.id", siteIds)
    .gte("created_at", startOfPrevMonth.toISOString())
    .lt("created_at", endOfPrevMonth.toISOString());

  const { data: previousMonthExits, error: previousMonthExitErrors } =
    await prevQuery;

  if (previousMonthExitErrors) {
    console.error("getExitsFor previousMonth Error", previousMonthExitErrors);
  }

  return {
    currentMonthExits,
    currentMonthExitErrors,
    previousMonthExits,
    previousMonthExitErrors,
  };
};

export async function getExitEntriesByInvoiceIdForInvoicePreview({
  supabase,
  invoiceId,
}: {
  supabase: TypedSupabaseClient;
  invoiceId: string;
}) {
  const { data, error } = await supabase
    .from("employees")
    .select(
      `id, company_id, first_name, middle_name, last_name, employee_code, work_details!work_details_employee_id_fkey!left(
          end_date,
          position,
          start_date
        ),employee_exit!inner(id, invoice_id)`,
    )
    .eq("employee_exit.invoice_id", invoiceId)
    .returns<ExitsPayrollEntriesWithEmployee[]>();

  if (error) {
    console.error("getExitEntriesByInvoiceIdForInvoicePreview Error", error);
  }

  const mapped = data?.map((emp: any) => ({
    ...emp,
    employee_exit: [
      {
        amount: 0,
      },
    ],
  }));

  return { data: mapped, error: null };
}
