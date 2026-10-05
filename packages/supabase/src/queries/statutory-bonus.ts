import type {
  EmployeeDatabaseRow,
  EmployeeWorkDetailsDatabaseRow,
  EmployeeYearlyBonusDetailsDatabaseRow,
  InferredType,
  PayrollDatabaseRow,
  ProjectDatabaseRow,
  SiteDatabaseRow,
  StatutoryBonusDatabaseRow,
  TypedSupabaseClient,
} from "../types";
import { SOFT_QUERY_LIMIT } from "../constant";

export type StatutoryBonusDataType = Pick<
  StatutoryBonusDatabaseRow,
  | "id"
  | "name"
  | "company_id"
  | "payment_frequency"
  | "percentage"
  | "payout_month"
  | "consider_for_esic"
  | "consider_for_epf"
>;

export const getStatutoryBonusById = async ({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) => {
  const columns = [
    "id",
    "name",
    "company_id",
    "payment_frequency",
    "percentage",
    "payout_month",
    "consider_for_esic",
    "consider_for_epf",
  ] as const;

  const { data, error } = await supabase
    .from("statutory_bonus")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<StatutoryBonusDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getStatutoryBonusById Error", error);
  }

  return { data, error };
};

export const getStatutoryBonusByCompanyId = async ({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) => {
  const columns = [
    "id",
    "name",
    "company_id",
    "payment_frequency",
    "percentage",
    "payout_month",
    "consider_for_esic",
    "consider_for_epf",
  ] as const;

  const { data, error } = await supabase
    .from("statutory_bonus")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<
      InferredType<StatutoryBonusDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) {
    console.error("getStatutoryBonusByCompanyId Error", error);
  }

  return { data, error };
};

export const getStatutoryBonusReportData = async ({
  supabase,
  companyId,
  startDate,
  endDate,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  startDate: string;
  endDate: string;
}) => {
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select(`
      id,
      first_name,
      middle_name,
      last_name,
      employee_code,
      employee_bank_details(account_number, bank_name, ifsc_code, account_holder_name)
    `)
    .eq("company_id", companyId);

  if (empError) return { data: null, error: empError };

  const { data: companyBonus, error: cbError } = await supabase
    .from("statutory_bonus")
    .select("percentage")
    .eq("company_id", companyId)
    .maybeSingle();

  const defaultPercentage = companyBonus?.percentage || 0;

  let payrollQuery = supabase
    .from("payroll")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "approved");

  if (startDate === endDate) {
    const date = new Date(startDate);
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    payrollQuery = payrollQuery.eq("year", y).eq("month", m);
  } else {
    const startYear = Number.parseInt(startDate.split("-")[0], 10);
    payrollQuery = payrollQuery.or(
      `and(year.eq.${startYear},month.gte.4),and(year.eq.${startYear + 1},month.lte.3)`,
    );
  }

  const { data: payrolls, error: payrollError } = await payrollQuery;

  if (payrollError) {
    console.error(
      "getStatutoryBonusReportData payroll fetch error",
      payrollError,
    );
    return { data: null, error: payrollError };
  }

  const payrollIds = payrolls.map((p) => p.id);

  if (payrollIds.length === 0) {
    return {
      data: { employees, defaultPercentage, payrollData: [] },
      error: null,
    };
  }

  const { data: payrollData, error: prError } = await supabase
    .from("salary_entries")
    .select(`
      monthly_attendance!inner(employee_id),
      salary_field_values(
        amount,
        payroll_fields(name, type)
      )
    `)
    .in("payroll_id", payrollIds)
    .limit(SOFT_QUERY_LIMIT);

  if (prError) {
    console.error("getStatutoryBonusReportData salary fetch error", prError);
  }

  return {
    data: {
      employees,
      defaultPercentage,
      payrollData: payrollData || [],
    },
    error: null,
  };
};

export type EmployeeYearlyBonusDetailsDataType =
  EmployeeYearlyBonusDetailsDatabaseRow & {
    invoice_id?: string | null;
    employees: Pick<
      EmployeeDatabaseRow,
      | "first_name"
      | "middle_name"
      | "last_name"
      | "employee_code"
      | "company_id"
    > & {
      work_details?:
        | (Pick<EmployeeWorkDetailsDatabaseRow, "project_id" | "site_id"> & {
            projects?: Pick<ProjectDatabaseRow, "id" | "name"> | null;
            sites?: Pick<SiteDatabaseRow, "id" | "name"> | null;
          })[]
        | null;
    };
    payroll: Pick<PayrollDatabaseRow, "month" | "year" | "created_at">;
  };

export const getEmployeeYearlyBonusDetails = async ({
  supabase,
  companyId,
  startYear,
  fromMonth = 4,
  toMonth = 3,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  startYear: number;
  fromMonth?: number;
  toMonth?: number;
}) => {
  // Logic to handle month range (e.g. Jan to Dec or Apr to Mar)
  let filterStr = "";
  if (fromMonth <= toMonth) {
    // Same calendar year (e.g. Jan 2026 to Dec 2026)
    filterStr = `and(year.eq.${startYear},month.gte.${fromMonth},month.lte.${toMonth})`;
  } else {
    // Across calendar years (e.g. Apr 2026 to Mar 2027)
    filterStr = `and(year.eq.${startYear},month.gte.${fromMonth}),and(year.eq.${startYear + 1},month.lte.${toMonth})`;
  }

  const { data, error } = await supabase
    .from("employee_yearly_bonus_details")
    .select(`
      *,
      invoice_id,
      employees!inner(
        first_name, 
        middle_name, 
        last_name, 
        employee_code, 
        company_id,
        work_details!work_details_employee_id_fkey(
          project_id,
          site_id,
          projects(id, name),
          sites(id, name)
        )
      ),
      payroll!inner(month, year, created_at)
    `)
    .eq("employees.company_id", companyId)
    .or(filterStr, { foreignTable: "payroll" })
    .returns<EmployeeYearlyBonusDetailsDataType[]>();

  if (error) {
    console.error("getEmployeeYearlyBonusDetails error", error);
  }

  const uniqueMap = new Map<string, any>();
  for (const item of data || []) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }

  return { data: Array.from(uniqueMap.values()), error };
};

export const getStatutoryBonusConfigByCompanyId = async ({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) => {
  const { data, error } = await supabase
    .from("statutory_bonus")
    .select("id, percentage, is_default, payment_frequency")
    .eq("company_id", companyId);

  if (error) {
    console.error("getStatutoryBonusConfigByCompanyId error", error);
  }
  return { data, error };
};

export const getSalaryEntriesByPayrollIdForBonus = async ({
  supabase,
  payrollId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
}) => {
  const { data, error } = await supabase
    .from("salary_entries")
    .select(`
      id,
      monthly_attendance!inner(employee_id),
      salary_field_values(
        amount, 
        payroll_fields!inner(name, type)
      )
    `)
    .eq("payroll_id", payrollId);

  if (error) {
    console.error("getSalaryEntriesByPayrollIdForBonus Error:", error);
  } else {
  }

  return { data, error };
};

export const getEmployeesWithBonusAssignments = async ({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) => {
  const { data, error } = await supabase
    .from("employees")
    .select(`
      id, 
      employee_salary_assignment(
        employee_salary_statutory_components(statutory_bonus_id)
      )
    `)
    .eq("company_id", companyId);

  if (error) {
    console.error("getEmployeesWithBonusAssignments error", error);
  }
  return { data, error };
};
