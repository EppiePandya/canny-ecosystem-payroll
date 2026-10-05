import { defaultYear } from "@canny_ecosystem/utils";
import { months } from "@canny_ecosystem/utils/constant";
import { MID_QUERY_LIMIT } from "../constant";
import type {
  EmployeeDatabaseRow,
  EmployeeLoanDetailsDatabaseRow,
  InferredType,
  ProjectDatabaseRow,
  SiteDatabaseRow,
  TypedSupabaseClient,
} from "../types";

export type ImportEmployeeLoansDataType = {
  employee_code: string;
  loan_name: string;
  amount: number;
  monthly_installment: number;
  loan_date: string;
  number_of_months?: number;
  employee_id?: string;
  company_id?: string;
};

export type LoanDataType = Pick<
  EmployeeLoanDetailsDatabaseRow,
  | "id"
  | "employee_id"
  | "company_id"
  | "loan_name"
  | "amount"
  | "monthly_installment"
  | "reimbursement_id"
  | "is_paid"
  | "loan_date"
  | "number_of_months"
> & {
  loan_deduction: {
    salary_field_values: {
      amount: number;
    } | null;
  }[];
  employees: Pick<
    EmployeeDatabaseRow,
    "first_name" | "middle_name" | "last_name" | "employee_code"
  > & {
    work_details: {
      sites: Pick<SiteDatabaseRow, "id" | "name"> & {
        projects: Pick<ProjectDatabaseRow, "id" | "name">;
      };
    }[];
  };
  reimbursements: {
    id: string;
    amount: number;
    status: string;
    submitted_date: string;
    note: string | null;
    users: {
      email: string | null;
    } | null;
    invoice: {
      id: string;
      invoice_number: string | null;
    } | null;
    invoice_id: string | null;
  } | null;
};

export async function getEmployeeLoansByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = [
    "id",
    "employee_id",
    "company_id",
    "loan_name",
    "amount",
    "monthly_installment",
    "reimbursement_id",
    "is_paid",
    "loan_date",
    "created_at",
    "number_of_months",
  ] as const;

  const { data, error } = await supabase
    .from("employee_loan_details")
    .select(
      `${columns.join(",")}, employees(first_name, middle_name, last_name, employee_code), loan_deduction(salary_field_values(amount, salary_entries(payroll(month, year, run_date)))), reimbursements(id, amount, status, submitted_date, note, invoice_id, users(email), invoice(id, invoice_number))`,
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(MID_QUERY_LIMIT)
    .returns<
      InferredType<EmployeeLoanDetailsDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) console.error("getEmployeeLoansByEmployeeId Error", error);

  return { data, error };
}

export async function getEmployeeLoanById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "employee_id",
    "company_id",
    "loan_name",
    "amount",
    "monthly_installment",
    "reimbursement_id",
    "is_paid",
    "loan_date",
    "number_of_months",
  ] as const;

  const { data, error } = await supabase
    .from("employee_loan_details")

    .select(
      `${columns.join(",")}, employees(first_name, middle_name, last_name, employee_code), loan_deduction(salary_field_values(amount, salary_entries(payroll(month, year, run_date)))), reimbursements(id, amount, status, submitted_date, note, invoice_id, users(email), invoice(id, invoice_number))`,
    )
    .eq("id", id)
    .single<EmployeeLoanDetailsDatabaseRow>();

  if (error) console.error("getEmployeeLoanById Error", error);

  return { data, error };
}

export type EmployeeLoanFilters = {
  loan_date_start?: string | undefined | null;
  loan_date_end?: string | undefined | null;
  is_paid?: string | undefined | null;
  project?: string | undefined | null;
  name?: string | undefined | null;
  site?: string | undefined | null;
  in_reimbursement?: string | undefined | null;
  start_month?: string | undefined | null;
  start_year?: string | undefined | null;
  end_month?: string | undefined | null;
  end_year?: string | undefined | null;
  year?: string | undefined | null;
};

export async function getEmployeeLoansByCompanyId({
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
    filters?: EmployeeLoanFilters | null;
  };
}) {
  const { from, to, sort, searchQuery, filters } = params;

  const {
    loan_date_start,
    loan_date_end,
    is_paid,
    project,
    site,
    in_reimbursement,
    start_month,
    start_year,
    end_month,
    end_year,
    year,
  } = filters ?? {};

  const foreignFilters = searchQuery || project || site;

  const columns = [
    "id",
    "employee_id",
    "company_id",
    "loan_name",
    "amount",
    "monthly_installment",
    "reimbursement_id",
    "is_paid",
    "loan_date",
    "created_at",
    "number_of_months",
  ] as const;

  const query = supabase
    .from("employee_loan_details")
    .select(
      `
        ${columns.join(",")},
        loan_deduction(salary_field_values(amount, salary_entries(payroll(month, year, run_date)))),
        employees!${
          foreignFilters ? "inner" : "left"
        }(first_name, middle_name, last_name, employee_code, work_details!work_details_employee_id_fkey!${
          foreignFilters ? "inner" : "left"
        }(sites!${foreignFilters ? "inner" : "left"}(id, name), projects!${
          project ? "inner" : "left"
        }(id, name))),
        reimbursements(id, amount, status, submitted_date, note, invoice_id, users(email), invoice(id, invoice_number))`,
      { count: "exact" },
    )
    .eq("company_id", companyId);

  if (sort) {
    const [column, direction] = sort;
    const loanCols = [
      "loan_name",
      "amount",
      "monthly_installment",
      "is_paid",
      "loan_date",
    ];

    if (loanCols.includes(column)) {
      query.order(column, { ascending: direction === "asc" });
    } else {
      query.order("created_at", { ascending: false });
    }
  } else {
    query.order("created_at", { ascending: false });
  }

  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray.length > 0 && searchQueryArray.length <= 3) {
      for (const part of searchQueryArray) {
        query.or(
          `first_name.ilike.*${part}*,middle_name.ilike.*${part}*,last_name.ilike.*${part}*,employee_code.ilike.*${part}*`,
          { referencedTable: "employees" },
        );
      }
    } else {
      query.or(
        `first_name.ilike.*${searchQuery}*,middle_name.ilike.*${searchQuery}*,last_name.ilike.*${searchQuery}*,employee_code.ilike.*${searchQuery}*`,
        { referencedTable: "employees" },
      );
    }
  }

  const finalStartDate = () => {
    const sYear = start_year || year;
    if (start_month && sYear) {
      return new Date(
        Date.UTC(Number(sYear), Number(months[start_month]) - 1, 1),
      );
    }
    if (start_month) {
      return new Date(
        Date.UTC(Number(defaultYear), Number(months[start_month]) - 1, 1),
      );
    }
    if (year) {
      return new Date(Date.UTC(Number(year), 0, 1));
    }
    if (loan_date_start) return new Date(loan_date_start);
  };

  const finalEndDate = () => {
    const eYear = end_year || year;
    if (end_month && eYear) {
      return new Date(Date.UTC(Number(eYear), Number(months[end_month]), 0));
    }
    if (end_month) {
      return new Date(
        Date.UTC(Number(defaultYear), Number(months[end_month]), 0),
      );
    }
    if (year) {
      return new Date(Date.UTC(Number(year), 11, 31));
    }
    if (loan_date_end) return new Date(loan_date_end);
  };

  const dateFilters = [
    {
      field: "loan_date",
      start: finalStartDate()?.toISOString().split("T")[0] || loan_date_start,
      end: finalEndDate()?.toISOString().split("T")[0] || loan_date_end,
    },
  ];

  for (const { field, start, end } of dateFilters) {
    if (start) query.gte(field, start);
    if (end) query.lte(field, end);
  }

  if (is_paid) query.eq("is_paid", is_paid === "true");
  if (project) query.eq("employees.work_details.projects.name", project);
  if (site) query.eq("employees.work_details.sites.name", site);
  if (in_reimbursement !== undefined && in_reimbursement !== null) {
    if (in_reimbursement === "true") query.not("reimbursement_id", "is", null);
    else query.is("reimbursement_id", null);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("getEmployeeLoansByCompanyId Error", error);
  }

  const uniqueMap = new Map<string, any>();
  for (const item of data || []) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }

  return { data: Array.from(uniqueMap.values()) as LoanDataType[] | null, meta: { count }, error };
}
export async function getEmployeeLoanByReimbursementId({
  supabase,
  reimbursementId,
}: {
  supabase: TypedSupabaseClient;
  reimbursementId: string;
}) {
  const { data, error } = await supabase
    .from("employee_loan_details")
    .select("id")
    .eq("reimbursement_id", reimbursementId)
    .maybeSingle();

  if (error) console.error("getEmployeeLoanByReimbursementId Error", error);

  return { data, error };
}
