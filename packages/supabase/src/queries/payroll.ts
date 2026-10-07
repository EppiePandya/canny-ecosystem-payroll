import {
  defaultMonth,
  defaultYear,
  formatUTCDate,
  parseMonthNumber,
} from "@canny_ecosystem/utils";
import type {
  PayrollDatabaseRow,
  InferredType,
  TypedSupabaseClient,
  EmployeeDatabaseRow,
  SalaryEntriesDatabaseRow,
  SalaryFieldValuesDatabaseRow,
  PayrollFieldsDatabaseRow,
  InvoiceDatabaseRow,
} from "../types";

import { SINGLE_QUERY_LIMIT, SOFT_QUERY_LIMIT } from "../constant";
import type { DashboardFilters } from "./employee-exit";

export type PayrollFilters = {
  date_start?: string | undefined | null;
  date_end?: string | undefined | null;
  status?: string | undefined | null;
  name?: string | undefined | null;
  month?: string | undefined | null;
  year?: string | undefined | null;
};

export type PayrollHistoryFilters = {
  year?: string | undefined | null;
};

export type ImportSalaryPayrollDataType = {
  employee_code: EmployeeDatabaseRow["employee_code"];
};

export async function getPendingOrSubmittedPayrollsByCompanyId({
  supabase,
  companyId,
  params,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  params: {
    to: number;
    from: number;
    searchQuery?: string;
    filters?: PayrollFilters | null;
  };
}) {
  const { from, to, filters, searchQuery } = params;
  const { date_start, date_end, status, month, year } = filters ?? {};
  const columns = [
    "id",
    "title",
    "total_employees",
    "status",
    "run_date",
    "total_net_amount",
    "month",
    "year",
    "company_id",
    "created_at",
  ] as const;

  let query = supabase
    .from("payroll")
    .select(`${columns.join(",")}, salary_entries(count)`, { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .in("status", ["pending", "submitted"]);

  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray?.length > 0 && searchQueryArray?.length <= 3) {
      for (const searchQueryElement of searchQueryArray) {
        query.or(`title.ilike.*${searchQueryElement}*`);
      }
    } else {
      query.or(`title.ilike.*${searchQuery}*`);
    }
  }

  const dateFilters = [{ field: "run_date", start: date_start, end: date_end }];
  for (const { field, start, end } of dateFilters) {
    if (start) query.gte(field, formatUTCDate(start));
    if (end) query.lte(field, formatUTCDate(end));
  }

  if (month) {
    query = query.eq("month", parseMonthNumber(month));
    query = query.eq("year", defaultYear);
  }
  if (year) {
    query = query.eq("year", Number(year));
  }
  if (month && year) {
    query = query.eq("month", parseMonthNumber(month));
    query = query.eq("year", Number(year));
  }

  if (status) {
    query.eq("status", status as PayrollDatabaseRow["status"]);
  }

  const { data, count, error } = await query.range(from, to);

  if (error)
    console.error("getPendingOrSubmittedPayrollsByCompanyId Error", error);

  const mappedData = data?.map((p: any) => {
    const actualCount =
      Array.isArray(p.salary_entries) && p.salary_entries[0] !== undefined
        ? Number(p.salary_entries[0].count)
        : p.total_employees;

    return {
      ...p,
      total_employees: actualCount,
    };
  });

  return { data: mappedData, meta: { count: count }, error };
}

export async function getApprovedPayrollsByCompanyId({
  supabase,
  companyId,
  params,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  params: {
    to: number;
    from: number;
    searchQuery?: string;
    filters?: PayrollFilters | null;
  };
}) {
  const { from, to, filters, searchQuery } = params;
  const { date_start, date_end, status, month, year } = filters ?? {};
  const columns = [
    "id",
    "title",
    "total_employees",
    "status",
    "run_date",
    "total_net_amount",
    "month",
    "year",
    "company_id",
    "created_at",
  ] as const;

  let query = supabase
    .from("payroll")
    .select(`${columns.join(",")}, salary_entries(count)`, { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .in("status", ["approved"]);

  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray?.length > 0 && searchQueryArray?.length <= 3) {
      for (const searchQueryElement of searchQueryArray) {
        query.or(`title.ilike.*${searchQueryElement}*`);
      }
    } else {
      query.or(`title.ilike.*${searchQuery}*`);
    }
  }

  const dateFilters = [{ field: "run_date", start: date_start, end: date_end }];
  for (const { field, start, end } of dateFilters) {
    if (start) query.gte(field, formatUTCDate(start));
    if (end) query.lte(field, formatUTCDate(end));
  }
  if (month) {
    query = query.eq("month", parseMonthNumber(month));
    query = query.eq("year", defaultYear);
  }
  if (year) {
    query = query.eq("year", Number(year));
  }
  if (month && year) {
    query = query.eq("month", parseMonthNumber(month));
    query = query.eq("year", Number(year));
  }

  if (status) {
    query.eq("status", status as PayrollDatabaseRow["status"]);
  }

  const { data, count, error } = await query.range(from, to);
  if (error) console.error("getApprovedPayrollsByCompanyId Error", error);

  const mappedData = data?.map((p: any) => {
    const actualCount =
      Array.isArray(p.salary_entries) && p.salary_entries[0] !== undefined
        ? Number(p.salary_entries[0].count)
        : p.total_employees;

    return {
      ...p,
      total_employees: actualCount,
    };
  });

  return { data: mappedData, meta: { count: count }, error };
}

export async function getPayrollById({
  supabase,
  payrollId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
}) {
  const columns = [
    "id",
    "title",
    "total_employees",
    "status",
    "run_date",
    "project_id",
    "month",
    "site_id",
    "year",
    "total_net_amount",
    "company_id",
    "project_id",
    "site_id",
    "created_at",
  ] as const;

  const { data, error } = await supabase
    .from("payroll")
    .select(`${columns.join(",")},sites(name),projects(name),salary_entries(count)`)
    .eq("id", payrollId)
    .maybeSingle<any>();

  if (error) console.error("getPayrollById Error", error);

  const actualCount =
    Array.isArray((data as any)?.salary_entries) &&
    (data as any).salary_entries[0] !== undefined
      ? Number((data as any).salary_entries[0].count)
      : data?.total_employees;

  const resultData = data
    ? {
        ...data,
        total_employees: actualCount,
      }
    : null;

  return { data: resultData as any, error };
}

export type PayrollField = {
  id?: string;
  name: string;
  type: string;
  display_name?: string | null;
  calculation_type?: string;
};

export type SalaryFieldValue = {
  id?: string;
  amount: number;
  payroll_fields: PayrollField;
};

export type SalaryEntry = {
  id?: string;
  payroll_id?: string;
  invoice_id?: string | null;
  monthly_ctc?: number | null;
  invoice?: {
    id?: string;
    invoice_number: string | null;
    date: string | null;
    subject: string | null;
    type: string;
    include_charge: boolean;
    charge_amount: number | null;
    include_cgst: boolean;
    include_sgst: boolean;
    include_igst: boolean;
    user_id: string | null;
    additional_text: string | null;
    payroll_data: any[] | null;
  } | null;
  salary_field_values: SalaryFieldValue[];
};

export type StatutoryComponents = {
  pf?: any;
  esi?: any;
  pt?: any;
  lwf?: any;
  bonus?: any;
};

export type PaymentTemplate = {
  id: string;
  name: string;
  payment_template_components: any[];
};

export type SalaryAssignment = {
  template: PaymentTemplate | null;
  statutory: StatutoryComponents | null;
  use_payment_template: boolean;
  monthly_ctc?: number | null;
  basic_percent?: number | null;
  employee_salary_components?: any[];
};

export type WorkDetails = {
  employee_id?: string;
  site_id?: string;
  project_id?: string;
  department_id?: string;
  start_date?: string;
  end_date?: string | null;
  project?: { name?: string } | null;
  site?: { id?: string; name?: string; company_locations?: any } | null;
  department?: { id?: string; name?: string; sites?: any } | null;
};

export type SalaryEntryWithEmployee = {
  id: string;
  month: number;
  year: number;
  present_days: number;
  working_days: number;
  absent_days: number;
  paid_leaves: number;
  paid_holidays: number;
  casual_leaves: number;
  overtime_hours?: number;

  employee: {
    id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    employee_code: string;

    work_details: WorkDetails | null;
    salary_assignment: SalaryAssignment | null;
  };

  salary_entries: SalaryEntry;
};

export const getSalaryEntriesByPayrollId = async ({
  supabase,
  payrollId,
  month,
  year,
  companyId,
  limit = 20,
  offset = 0,
  searchQuery,
  siteIds,
  departmentIds,
  projectIds,
  esicIds,
  sortField,
  sortOrder = "asc",
  attendanceId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
  month: number;
  year: number;
  companyId: string;
  limit?: number;
  offset?: number;
  searchQuery?: string;
  siteIds?: string[];
  departmentIds?: string[];
  projectIds?: string[];
  esicIds?: string[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
  attendanceId?: string;
}) => {
  const { data: payroll } = await getPayrollById({ supabase, payrollId });
  const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10);

  const statutoryJoin =
    esicIds && esicIds.length > 0
      ? "employee_statutory_details!inner"
      : "employee_statutory_details!left";

  let query = (supabase.from("monthly_attendance") as any)
    .select(
      `
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      absent_days,
      paid_leaves,
      paid_holidays,
      casual_leaves,
      employee_id,

      employees!inner (
        id,
        first_name,
        middle_name,
        last_name,
        employee_code,

        work_details!work_details_employee_id_fkey!inner (
          employee_id,
          site_id,
          project_id,
          department_id,
          start_date,
          end_date,
          project:projects!left(name),
          site:sites (
            id,
            name,
            address_line_1,
            address_line_2,
            city,
            state,
            pincode,
            company_locations!left(name,address_line_1,address_line_2,city,state,pincode)
          ),
          department:departments (
            id,
            name,
            sites!left(name)
          )
        ),
        ${statutoryJoin} (
          aadhaar_number,
          pan_number,
          uan_number,
          pf_number,
          esic_number,
          esic_id
        ),
        employee_bank_details!left (
          account_number,
          bank_name
        ),
        employee_salary_assignment (
          *,
          employee_salary_components (
            *,
            payment_fields (*)
          ),
          employee_salary_statutory_components (
            pf:employee_provident_fund (*),
            esi:employee_state_insurance (*),
            pt:professional_tax (*),
            bonus:statutory_bonus (*),
            lwf:labour_welfare_fund (*)
          ),
          payment_templates (
            id,
            name,
            payment_template_versions (
              id,
              effective_date,
              monthly_ctc,
              basic_percent,
              is_pro_rata,
              payment_template_components (
                *,
                payment_fields (*)
              ),
              payment_statutory_components (
                pf:employee_provident_fund (*),
                esi:employee_state_insurance (*),
                pt:professional_tax (*),
                bonus:statutory_bonus (*),
                lwf:labour_welfare_fund (*)
              )
            )
          )
        )
      ),

      salary_entries!inner (
        id,
        created_at,
        payroll_id,
        monthly_ctc,
        invoice_id,
        invoice:invoice_id (
          id,
          invoice_number,
          date,
          subject,
          type,
          include_charge,
          charge_amount,
          include_cgst,
          include_sgst,
          include_igst,
          user_id,
          additional_text,
          payroll_data
        ),
        salary_field_values (
          id,
          amount,
          consider_for_epf,
          payroll_fields (
            id,
            name,
            type
          )
        )
      )
      `,
      { count: "exact" },
    )
    .eq("month", month)
    .eq("year", year)
    .eq("employees.company_id", payroll?.company_id || companyId)
    .lte("employees.work_details.start_date", endOfMonth)
    .eq("salary_entries.payroll_id", payrollId);

  if (attendanceId) {
    query = query.eq("id", attendanceId);
  }

  if (searchQuery) {
    query = query.or(
      `first_name.ilike.%${searchQuery}%,middle_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,employee_code.ilike.%${searchQuery}%`,
      { foreignTable: "employees" },
    );
  }

  if (siteIds && siteIds.length > 0) {
    query = query.in("employees.work_details.site_id", siteIds);
  }

  if (departmentIds && departmentIds.length > 0) {
    query = query.in("employees.work_details.department_id", departmentIds);
  }

  if (projectIds && projectIds.length > 0) {
    query = query.in("employees.work_details.project_id", projectIds);
  }

  if (esicIds && esicIds.length > 0) {
    query = query.in("employees.employee_statutory_details.esic_id", esicIds);
  }

  const validAttendanceSortColumns = new Set([
    "id",
    "present_days",
    "working_days",
    "overtime_hours",
    "absent_days",
    "paid_leaves",
    "paid_holidays",
    "casual_leaves",
    "created_at",
  ]);

  if (sortField) {
    if (sortField === "name") {
      query = query.order("first_name", {
        foreignTable: "employees",
        ascending: sortOrder === "asc",
      });
    } else if (sortField === "employee_code") {
      query = query.order("employee_code", {
        foreignTable: "employees",
        ascending: sortOrder === "asc",
      });
    } else if (validAttendanceSortColumns.has(sortField)) {
      query = query.order(sortField, { ascending: sortOrder === "asc" });
    } else {
      query = query.order("created_at", { ascending: true });
    }
  } else {
    query = query.order("created_at", { ascending: true });
  }

  if (payroll?.site_id && (!siteIds || siteIds.length === 0)) {
    query = query.eq("employees.work_details.site_id", payroll.site_id);
  }

  // If the user is explicitly filtering by sites, don't restrict to the payroll's original project
  // otherwise they might not see the data for the sites they just selected.
  const isFilteringSites = siteIds && siteIds.length > 0;
  if (
    payroll?.project_id &&
    (!projectIds || projectIds.length === 0) &&
    !isFilteringSites
  ) {
    query = query.eq("employees.work_details.project_id", payroll.project_id);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);

  if (error) return { data: null, count: 0, error };

  const mergedData = (data?.map((att: any) => {
    const workDetails = att.employees?.work_details;
    const workDetail = Array.isArray(workDetails)
      ? workDetails.sort(
        (a: any, b: any) =>
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
      )[0]
      : workDetails;

    // Filter salary entries to only include those for this payroll
    const salaryEntries = Array.isArray(att.salary_entries)
      ? att.salary_entries.find((se: any) => se.payroll_id === payrollId)
      : att.salary_entries?.payroll_id === payrollId
        ? att.salary_entries
        : null;
    const today = new Date();
    const rawAssignments = att.employees?.employee_salary_assignment ?? [];
    const assignments = (
      Array.isArray(rawAssignments) ? rawAssignments : [rawAssignments]
    )
      .filter(
        (a: any) => !a.effective_date || new Date(a.effective_date) <= today,
      )
      .sort((a: any, b: any) => {
        const dateA = new Date(a.effective_date || 0).getTime();
        const dateB = new Date(b.effective_date || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      });

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDayOfMonthStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

    const validAssignmentsForMonth = assignments.filter((a: any) => {
      if (!a.effective_date) return true;
      return a.effective_date <= lastDayOfMonthStr;
    });

    const salaryAssignment =
      validAssignmentsForMonth[0] || assignments[0] || null;

    return {
      ...att,
      employee: {
        id: att.employees?.id,
        first_name: att.employees?.first_name,
        middle_name: att.employees?.middle_name,
        last_name: att.employees?.last_name,
        employee_code: att.employees?.employee_code,
        work_details: workDetail,
        salary_assignment: salaryAssignment,
        employee_statutory_details: att.employees?.employee_statutory_details
          ? Array.isArray(att.employees.employee_statutory_details)
            ? att.employees.employee_statutory_details[0]
            : att.employees.employee_statutory_details
          : null,
        employee_bank_details: att.employees?.employee_bank_details
          ? Array.isArray(att.employees.employee_bank_details)
            ? att.employees.employee_bank_details[0]
            : att.employees.employee_bank_details
          : null,
      },
      salary_entries: salaryEntries,
    };
  }) || []) as SalaryEntryWithEmployee[];

  const uniqueMergedMap = new Map<string, SalaryEntryWithEmployee>();
  for (const item of mergedData) {
    const key = item.employee?.id || item.employee_id || item.id;
    if (!uniqueMergedMap.has(key)) {
      uniqueMergedMap.set(key, item);
    }
  }
  const deduplicatedMergedData = Array.from(uniqueMergedMap.values());

  if (!sortField) {
    deduplicatedMergedData.sort((a, b) => {
      const timeA = new Date(
        (a as any).salary_entries?.created_at || (a as any).created_at || 0,
      ).getTime();
      const timeB = new Date(
        (b as any).salary_entries?.created_at || (b as any).created_at || 0,
      ).getTime();
      return timeA - timeB;
    });
  }

  return {
    data: deduplicatedMergedData,
    count: count ?? 0,
    error: null,
  };
};

export const getSalaryEntriesByPayrollAndEmployeeId = async ({
  supabase,
  payrollId,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
  employeeId: string;
}) => {
  const query = supabase
    .from("monthly_attendance")
    .select(
      `
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      absent_days,
      working_hours,
      paid_holidays,
      paid_leaves,
      casual_leaves,
      employee:employee_id (
        id,
        first_name,
        middle_name,
        last_name,
        employee_code,
        employee_bank_details (
          bank_name,
          account_number
        ),
        employee_salary_assignment (
          *,
          employee_salary_components (
            *,
            payment_fields (*)
          ),
          employee_salary_statutory_components (
            pf:employee_provident_fund (*),
            esi:employee_state_insurance (*),
            pt:professional_tax (*),
            bonus:statutory_bonus (*),
            lwf:labour_welfare_fund (*)
          ),
          payment_templates (
            id,
            name,
            payment_template_versions (
              id,
              effective_date,
              monthly_ctc,
              basic_percent,
              is_pro_rata,
              payment_template_components (
                *,
                payment_fields (*)
              ),
              payment_statutory_components (
                pf:employee_provident_fund (*),
                esi:employee_state_insurance (*),
                pt:professional_tax (*),
                bonus:statutory_bonus (*),
                lwf:labour_welfare_fund (*)
              )
            )
          )
        )
      ),
      
      salary_entries!inner (
        id,
        payroll_id,
        monthly_ctc,
        salary_field_values!inner (
          id,
          amount,
          consider_for_epf,
          payroll_fields!inner (
            id,
            name,
            type
          )
        )
      )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("salary_entries.payroll_id", payrollId)
    .limit(SINGLE_QUERY_LIMIT)
    .maybeSingle();

  const { data: rawData, error } = await query;

  if (error) {
    console.error("getSalaryEntriesByPayrollAndEmployeeId Error", error);
  }

  const rawEmployee: any = rawData?.employee;
  const rawAssignments = rawEmployee?.employee_salary_assignment || [];
  const assignmentList = Array.isArray(rawAssignments)
    ? rawAssignments
    : rawAssignments
      ? [rawAssignments]
      : [];
  const today = new Date();
  const validAssignments = assignmentList
    .filter((a: any) => !a.effective_date || new Date(a.effective_date) <= today)
    .sort(
      (a: any, b: any) =>
        new Date(b.effective_date || 0).getTime() -
        new Date(a.effective_date || 0).getTime(),
    );
  const salaryAssignment = validAssignments[0] || assignmentList[0] || null;

  const data = rawData
    ? {
        ...rawData,
        employee: rawEmployee
          ? {
              ...rawEmployee,
              salary_assignment: salaryAssignment,
            }
          : null,
        salary_entries: Array.isArray(rawData.salary_entries)
          ? rawData.salary_entries[0]
          : rawData.salary_entries,
      }
    : null;

  return { data, error };
};

export async function getSalaryEntryById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = ["id", "payroll_id", "monthly_attendance_id"] as const;

  const { data, error } = await supabase
    .from("salary_entries")
    .select(`${columns.join(",")}`)
    .eq("id", id)
    .single<InferredType<SalaryEntriesDatabaseRow, (typeof columns)[number]>>();

  if (error) console.error("getSalaryEntryById Error", error);

  return { data, error };
}

export async function getApprovedPayrollsAmountsByCompanyIdByMonths({
  supabase,
  companyId,
  filters,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  filters?: DashboardFilters;
}) {
  const columns = ["run_date", "total_net_amount"] as const;

  const monthFilter = parseMonthNumber(filters?.month, defaultMonth);
  const yearFilter = filters?.year ? Number(filters?.year) : defaultYear;

  const { data: currentMonth, error: currentMonthError } = await supabase
    .from("payroll")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .in("status", ["approved"])
    .eq("month", monthFilter)
    .eq("year", yearFilter)
    .order("created_at", { ascending: false })
    .returns<InferredType<PayrollDatabaseRow, (typeof columns)[number]>[]>();

  if (currentMonthError)
    console.error(
      "getApprovedPayrollsByCompanyIdByMonths Error",
      currentMonthError,
    );

  const { data: previousMonth, error: previousMonthError } = await supabase
    .from("payroll")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .in("status", ["approved"])
    .eq("month", monthFilter - 1)
    .eq("year", yearFilter)
    .order("created_at", { ascending: false })
    .returns<InferredType<PayrollDatabaseRow, (typeof columns)[number]>[]>();

  if (previousMonthError)
    console.error(
      "getApprovedPayrollsByCompanyIdByMonths Error",
      previousMonthError,
    );

  return { currentMonth, currentMonthError, previousMonth, previousMonthError };
}

export async function getApprovedPayrollsByCompanyIdByYears({
  supabase,
  companyId,
  filters,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  filters?: DashboardFilters;
}) {
  const payrollColumns = ["month", "year", "total_net_amount"] as const;
  const restColumns = ["paid_date", "payroll_data"] as const;
  const filterMonth = parseMonthNumber(filters?.month, defaultMonth);
  const filterYear = filters?.year ? Number(filters.year) : defaultYear;

  const startOfYear = new Date(
    Date.UTC(Number(filterYear) - 1, filterMonth, 1),
  );

  const endOfYear = new Date(Number(filterYear), filterMonth, 1);

  const startMonth = filterMonth === 12 ? 1 : filterMonth + 1;
  const startYear = filterMonth === 12 ? filterYear : filterYear - 1;
  const endMonth = filterMonth;
  const endYear = filterYear;

  const { data: payrollData, error: payrollError } = await supabase
    .from("payroll")
    .select(payrollColumns.join(","))
    .eq("company_id", companyId)
    .in("status", ["approved"])
    .or(
      `and(year.eq.${startYear},month.gte.${startMonth}),and(year.eq.${endYear},month.lte.${endMonth})`,
    )

    .order("run_date", { ascending: true })
    .returns<
      InferredType<PayrollDatabaseRow, (typeof payrollColumns)[number]>[]
    >();

  if (payrollError) {
    console.error("getApprovedPayrollsByCompanyIdByYears Error", payrollError);
    return { data: null, payrollError };
  }

  const { data: restData, error: restError } = await supabase
    .from("invoice")
    .select(restColumns.join(","))
    .eq("company_id", companyId)
    .in("type", ["reimbursement", "exit"])
    .in("is_paid", [true])
    .gte("paid_date", startOfYear.toISOString())
    .lt("paid_date", endOfYear.toISOString())
    .order("paid_date", { ascending: true })
    .returns<
      InferredType<InvoiceDatabaseRow, (typeof restColumns)[number]>[]
    >();

  if (restError) {
    console.error("getApprovedPayrollsByCompanyIdByYears Error", restError);
    return { data: null, restError };
  }

  const groupedByMonthObj: Record<string, typeof payrollData> = {};

  const tempDate = new Date(startOfYear);

  for (let i = 0; i < 12; i++) {
    const month = tempDate.toLocaleString("default", { month: "short" });
    const year = tempDate.getFullYear();
    const key = `${month} ${year}`;
    groupedByMonthObj[key] = [];
    tempDate.setMonth(tempDate.getMonth() + 1);
  }

  for (const item of payrollData) {
    const monthName = new Date(item.year!, item.month! - 1).toLocaleString(
      "default",
      { month: "short" },
    );
    const key = `${monthName} ${item.year}`;

    if (groupedByMonthObj[key]) {
      groupedByMonthObj[key].push(item);
    }
  }

  const groupedByMonth = Object.entries(groupedByMonthObj).map(
    ([month, data]) => ({
      month,
      data,
    }),
  );

  for (const item of restData) {
    const date = new Date(item.paid_date ?? "");
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();
    const key = `${month} ${year}`;
    const amount = Number((item.payroll_data as any)?.[0]?.amount ?? 0);

    const monthEntry: any = groupedByMonth.find((entry) => entry.month === key);

    if (monthEntry) {
      if (monthEntry.data.length > 0) {
        monthEntry.data[0].total_net_amount += amount;
      } else {
        monthEntry.data.push({ total_net_amount: amount });
      }
    }
  }

  return { data: groupedByMonth };
}

export async function getSalaryEntriesForSalaryRegisterAndAll({
  supabase,
  payrollId,
  month,
  year,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
  month: number;
  year: number;
}) {
  const { data: payroll } = await getPayrollById({ supabase, payrollId });
  const payrollMonth = payroll?.month ?? month;
  const payrollYear = payroll?.year ?? year;
  const companyId = payroll?.company_id ?? "";

  const { data: entries, error } = await getSalaryEntriesByPayrollId({
    supabase,
    payrollId,
    month: payrollMonth,
    year: payrollYear,
    companyId,
    limit: 10000,
  });

  if (error) {
    console.error("getSalaryEntriesForSalaryRegisterAndAll error:", error);
    return { data: null, error };
  }

  return { data: entries || [], error: null };
}

export async function getSalaryEntriesByEmployeeId({
  supabase,
  employeeId,
  filters,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
  filters: DashboardFilters;
}) {
  const filterYear = filters?.year ? Number(filters.year) : defaultYear;
  const query = supabase
    .from("monthly_attendance")
    .select(
      `
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      absent_days,
      employee:employee_id (
        id,
        first_name,
        middle_name,
        last_name,
        employee_code
      ),
      salary_entries!inner (
        id,
        payroll_id,
        salary_field_values!inner (
          id,
          amount,
          consider_for_epf,
          payroll_fields!inner (
            id,
            name,
            type
          )
        )
      )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("year", filterYear)
    .gte("month", 1)
    .lte("month", 12);

  const { data, error } = await query;

  if (error) {
    console.error("getSalaryEntriesByEmployeeId Error", error);
  }

  return { data, error };
}

export async function getSalaryFieldValuesById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = ["id", "amount"] as const;

  const { data, error } = await supabase
    .from("salary_field_values")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<SalaryFieldValuesDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getSalaryFieldValuesById Error", error);
  }

  return { data, error };
}

export async function getPayrollFieldByPayrollId({
  supabase,
  payrollId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
}) {
  const columns = ["id", "name", "type", "payroll_id", "created_at"] as const;
  const { data, error } = await supabase
    .from("payroll_fields")
    .select(columns.join(","))
    .eq("payroll_id", payrollId)
    .returns<
      InferredType<PayrollFieldsDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) {
    console.error("getPayrollFieldsByPayrollId Error", error);
  }

  return { data, error };
}

export async function getSalaryEntriesForInvoiceByInvoiceId({
  supabase,
  invoiceId,
}: {
  supabase: TypedSupabaseClient;
  invoiceId: string;
}) {
  const { data, error } = await supabase
    .from("monthly_attendance")
    .select(
      `
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      working_hours,
      paid_holidays,
      paid_leaves,
      casual_leaves,
      absent_days,
      employee:employee_id (
        id,
        company_id,
        first_name,
        middle_name,
        last_name,
        employee_code,
        work_details!work_details_employee_id_fkey!left (
          end_date,
          position,
          start_date
        ),
        employee_statutory_details!left (
          aadhaar_number,
          pan_number,
          uan_number,
          pf_number,
          esic_number
        ),
        employee_bank_details!left (
          account_number,
          bank_name
        )
      ),
      salary_entries!inner (
        id,
        invoice_id,
        salary_field_values!left (
          amount,
          payroll_fields!left (
            name,
            type
          )
        )
      )
    `,
    )
    .eq("salary_entries.invoice_id", invoiceId);

  if (error) {
    console.error("getSalaryEntriesForInvoiceByInvoiceId Error", error);
  }

  return { data, error: null };
}

export const getSalaryEntriesByPayrollIdForAddingSalaryEntry = async ({
  supabase,
  payrollId,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
  companyId: string;
}) => {
  const query = supabase
    .from("monthly_attendance")
    .select(
      `
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      absent_days,
      employees!inner (
        id,
        first_name,
        middle_name,
        last_name,
        employee_code
      ),
      salary_entries!inner (
        id)       
    `,
    )
    .eq("salary_entries.payroll_id", payrollId)
    .eq("employees.company_id", companyId);

  const { data, error } = await query;

  if (error)
    console.error(
      "getSalaryEntriesByPayrollIdForAddingSalaryEntry Error",
      error,
    );

  return { data, error };
};

/////////////////////////////////////////////////////////////////////

export async function getApprovedPayrollsBySiteIdsAndProjectIds({
  supabase,
  siteIds,
  params,
  projectIds,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
  projectIds: string[];
  params: {
    from: number;
    to: number;
    searchQuery?: string;
    filters?: PayrollFilters | null;
  };
}) {
  const { from, to, filters, searchQuery } = params;
  const { date_start, date_end, status, month, year } = filters ?? {};
  const columns = [
    "id",
    "title",
    "total_employees",
    "status",
    "run_date",
    "total_net_amount",
    "month",
    "year",
    "company_id",
    "created_at",
  ] as const;

  let query = supabase
    .from("payroll")
    .select(columns.join(","), { count: "exact" })
    .or(
      `project_id.in.(${projectIds.join(",")}),site_id.in.(${siteIds.join(",")})`,
    )
    .order("created_at", { ascending: false })
    .in("status", ["approved"]);

  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray?.length > 0 && searchQueryArray?.length <= 3) {
      for (const searchQueryElement of searchQueryArray) {
        query.or(`title.ilike.*${searchQueryElement}*`);
      }
    } else {
      query.or(`title.ilike.*${searchQuery}*`);
    }
  }

  const dateFilters = [{ field: "run_date", start: date_start, end: date_end }];
  for (const { field, start, end } of dateFilters) {
    if (start) query.gte(field, formatUTCDate(start));
    if (end) query.lte(field, formatUTCDate(end));
  }
  if (month) {
    query = query.eq("month", parseMonthNumber(month));
    query = query.eq("year", defaultYear);
  }
  if (year) {
    query = query.eq("year", Number(year));
  }
  if (month && year) {
    query = query.eq("month", parseMonthNumber(month));
    query = query.eq("year", Number(year));
  }

  if (status) {
    query.eq("status", status as PayrollDatabaseRow["status"]);
  }

  const { data, count, error } = await query.range(from, to);
  if (error) console.error("getApprovedPayrollsBySiteIds Error", error);
  return { data, meta: { count: count }, error };
}

export async function getApprovedPayrollsAmountsBySiteIdsAndProjectIdsByMonths({
  supabase,
  siteIds,
  projectIds,
  filters,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
  projectIds: string[];
  filters?: DashboardFilters;
}) {
  const columns = ["run_date", "total_net_amount"] as const;

  const monthFilter = parseMonthNumber(filters?.month, defaultMonth);
  const yearFilter = filters?.year ? Number(filters?.year) : defaultYear;

  const { data: currentMonth, error: currentMonthError } = await supabase
    .from("payroll")
    .select(columns.join(","))
    .or(
      `project_id.in.(${projectIds.join(",")}),site_id.in.(${siteIds.join(",")})`,
    )
    .in("status", ["approved"])
    .eq("month", monthFilter)
    .eq("year", yearFilter)
    .order("created_at", { ascending: false })
    .returns<InferredType<PayrollDatabaseRow, (typeof columns)[number]>[]>();

  if (currentMonthError)
    console.error(
      "getApprovedPayrollsByCompanyIdByMonths Error",
      currentMonthError,
    );

  const { data: previousMonth, error: previousMonthError } = await supabase
    .from("payroll")
    .select(columns.join(","))
    .or(
      `project_id.in.(${projectIds.join(",")}),site_id.in.(${siteIds.join(",")})`,
    )
    .in("status", ["approved"])
    .eq("month", monthFilter - 1)
    .eq("year", yearFilter)
    .order("created_at", { ascending: false })
    .returns<InferredType<PayrollDatabaseRow, (typeof columns)[number]>[]>();

  if (previousMonthError)
    console.error(
      "getApprovedPayrollsByCompanyIdByMonths Error",
      previousMonthError,
    );

  return { currentMonth, currentMonthError, previousMonth, previousMonthError };
}

export async function getApprovedPayrollsBySiteIdsAndProjectIdsByYears({
  supabase,
  siteIds,
  projectIds,
  filters,
  locationId,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
  projectIds: string[];
  filters?: DashboardFilters;
  locationId: string;
}) {
  const payrollColumns = ["month", "year", "total_net_amount"] as const;
  const restColumns = ["paid_date", "payroll_data"] as const;
  const filterMonth = parseMonthNumber(filters?.month, defaultMonth);
  const filterYear = filters?.year ? Number(filters.year) : defaultYear;

  const startOfYear = new Date(
    Date.UTC(Number(filterYear) - 1, filterMonth, 1),
  );

  const endOfYear = new Date(Number(filterYear), filterMonth, 1);

  const startMonth = filterMonth === 12 ? 1 : filterMonth + 1;
  const startYear = filterMonth === 12 ? filterYear : filterYear - 1;
  const endMonth = filterMonth;
  const endYear = filterYear;

  const { data: payrollData, error: payrollError } = await supabase
    .from("payroll")
    .select(payrollColumns.join(","))
    .or(
      `project_id.in.(${projectIds.join(",")}),site_id.in.(${siteIds.join(",")})`,
    )
    .in("status", ["approved"])
    .or(
      `and(year.eq.${startYear},month.gte.${startMonth}),and(year.eq.${endYear},month.lte.${endMonth})`,
    )

    .order("run_date", { ascending: true })
    .returns<
      InferredType<PayrollDatabaseRow, (typeof payrollColumns)[number]>[]
    >();

  if (payrollError) {
    console.error("getApprovedPayrollsByCompanyIdByYears Error", payrollError);
    return { data: null, payrollError };
  }

  const { data: restData, error: restError } = await supabase
    .from("invoice")
    .select(restColumns.join(","))
    .eq("company_address_id", locationId)
    .in("type", ["reimbursement", "exit"])
    .in("is_paid", [true])
    .gte("paid_date", startOfYear.toISOString())
    .lt("paid_date", endOfYear.toISOString())
    .order("paid_date", { ascending: true })
    .returns<
      InferredType<InvoiceDatabaseRow, (typeof restColumns)[number]>[]
    >();

  if (restError) {
    console.error("getApprovedPayrollsByCompanyIdByYears Error", restError);
    return { data: null, restError };
  }

  const groupedByMonthObj: Record<string, typeof payrollData> = {};

  const tempDate = new Date(startOfYear);

  for (let i = 0; i < 12; i++) {
    const month = tempDate.toLocaleString("default", { month: "short" });
    const year = tempDate.getFullYear();
    const key = `${month} ${year}`;
    groupedByMonthObj[key] = [];
    tempDate.setMonth(tempDate.getMonth() + 1);
  }

  for (const item of payrollData) {
    const monthName = new Date(item.year!, item.month! - 1).toLocaleString(
      "default",
      { month: "short" },
    );
    const key = `${monthName} ${item.year}`;

    if (groupedByMonthObj[key]) {
      groupedByMonthObj[key].push(item);
    }
  }

  const groupedByMonth = Object.entries(groupedByMonthObj).map(
    ([month, data]) => ({
      month,
      data,
    }),
  );

  for (const item of restData) {
    const date = new Date(item.paid_date ?? "");
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();
    const key = `${month} ${year}`;
    const amount = Number((item.payroll_data as any)?.[0]?.amount ?? 0);

    const monthEntry: any = groupedByMonth.find((entry) => entry.month === key);

    if (monthEntry) {
      if (monthEntry.data.length > 0) {
        monthEntry.data[0].total_net_amount += amount;
      } else {
        monthEntry.data.push({ total_net_amount: amount });
      }
    }
  }

  return { data: groupedByMonth };
}

export async function getEmployeesWithoutSalaryEntries({
  supabase,
  companyId,
  payrollId,
  filters,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  payrollId: string;
  filters?: {
    project?: string | null;
    site?: string | null;
  };
}) {
  const { project, site } = filters ?? {};
  const siteNames = site
    ? site
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    : [];
  const foreignFilters = project || siteNames.length > 0;

  let employeesQuery = supabase
    .from("employees")
    .select(`
      id,
      first_name,
      middle_name,
      last_name,
      employee_code,
      work_details!work_details_employee_id_fkey!${foreignFilters ? "inner" : "left"
      }(
        employee_id,
        projects!${project ? "inner" : "left"}(id, name),
        sites!${siteNames.length > 0 ? "inner" : "left"}(id, name),
        departments!left(id, name)
      )
    `)
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (project) {
    employeesQuery = employeesQuery.eq("work_details.projects.name", project);
  }

  if (siteNames.length === 1) {
    employeesQuery = employeesQuery.eq("work_details.sites.name", siteNames[0]);
  } else if (siteNames.length > 1) {
    employeesQuery = employeesQuery.in("work_details.sites.name", siteNames);
  }

  const { data: allActiveEmployees, error: employeesError } =
    await employeesQuery.order("employee_code", { ascending: true });

  if (employeesError) {
    console.error(
      "getEmployeesWithoutSalaryEntries - employees query error:",
      employeesError,
    );
    return { data: [], error: employeesError };
  }

  if (!allActiveEmployees || allActiveEmployees.length === 0) {
    return { data: [], error: null };
  }

  const { data: existingSalaryEntries, error: salaryError } = await supabase
    .from("salary_entries")
    .select("monthly_attendance!inner(employee_id)")
    .eq("payroll_id", payrollId);

  if (salaryError) {
    console.error(
      "getEmployeesWithoutSalaryEntries - salary entries query error:",
      salaryError,
    );
    return { data: [], error: salaryError };
  }

  const enteredEmployeeIds = new Set(
    (existingSalaryEntries || []).flatMap((se: any) => {
      const ma = se.monthly_attendance;
      if (Array.isArray(ma)) {
        return ma.map((m) => m.employee_id);
      }
      return ma ? [ma.employee_id] : [];
    }),
  );

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of allActiveEmployees) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }
  const uniqueActiveEmployees = Array.from(uniqueEmployeesMap.values());

  const transformedEmployees = uniqueActiveEmployees.map((employee: any) => ({
    ...employee,
    work_details: Array.isArray(employee.work_details)
      ? employee.work_details
      : employee.work_details
        ? [employee.work_details]
        : [],
  }));

  const missingSalaryEmployees = transformedEmployees.filter(
    (emp: any) => !enteredEmployeeIds.has(emp.id),
  );

  return {
    data: missingSalaryEmployees,
    error: null,
  };
}
