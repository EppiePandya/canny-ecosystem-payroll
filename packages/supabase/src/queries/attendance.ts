import { months } from "@canny_ecosystem/utils/constant";
import type {
  EmployeeDatabaseRow,
  EmployeeMonthlyAttendanceDatabaseRow,
  EmployeeWorkDetailsDatabaseRow,
  InferredType,
  ProjectDatabaseRow,
  SiteDatabaseRow,
  TypedSupabaseClient,
} from "../types";
import {
  defaultMonth,
  defaultYear,
  previousMonth,
  previousMonthYear,
  formatUTCDate,
  parseMonthNumber,
} from "@canny_ecosystem/utils";

import { filterComparison } from "../constant";

export type AttendanceDataType = Pick<
  EmployeeDatabaseRow,
  | "id"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "employee_code"
  | "company_id"
> & {
  work_details: (Pick<EmployeeWorkDetailsDatabaseRow, "employee_id"> & {
    sites: {
      id: SiteDatabaseRow["id"];
      name: SiteDatabaseRow["name"];
      projects: {
        id: ProjectDatabaseRow["id"];
        name: ProjectDatabaseRow["name"];
      };
    };
  })[];
} & {
  monthly_attendance: Pick<
    EmployeeMonthlyAttendanceDatabaseRow,
    | "id"
    | "employee_id"
    | "present_days"
    | "working_hours"
    | "overtime_hours"
    | "month"
    | "year"
    | "working_days"
    | "absent_days"
    | "paid_holidays"
    | "casual_leaves"
    | "paid_leaves"
  > & {
    salary_entries: { id: string; invoice_id: string | null } | null;
    daily_records?: {
      attendance_id: string;
      date: string;
      present: boolean;
      holiday: boolean;
      holiday_type: string | null;
      overtime_hours: number | null;
      no_of_hours: number | null;
    }[];
  };
};

export type AttendanceReportDataType = Pick<
  EmployeeDatabaseRow,
  "id" | "first_name" | "middle_name" | "last_name" | "employee_code"
> & {
  work_details: (Pick<EmployeeWorkDetailsDatabaseRow, "employee_id"> & {
    sites: {
      id: SiteDatabaseRow["id"];
      name: SiteDatabaseRow["name"];
      projects: {
        id: ProjectDatabaseRow["id"];
        name: ProjectDatabaseRow["name"];
      };
    };
  })[];
} & {
    attendance: Pick<
      EmployeeMonthlyAttendanceDatabaseRow,
      "id" | "employee_id" | "working_days" | "present_days"
    >;
  }[];

export async function getAttendanceById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "employee_id",
    "month",
    "year",
    "working_days",
    "present_days",
    "absent_days",
    "overtime_hours",
    "working_hours",
    "paid_holidays",
    "paid_leaves",
    "casual_leaves",
  ] as const;

  const { data, error } = await supabase
    .from("monthly_attendance")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<
        EmployeeMonthlyAttendanceDatabaseRow,
        (typeof columns)[number]
      >
    >();

  if (error) {
    console.error("getAttendanceById Error", error);
  }

  return { data, error };
}

export async function getAttendanceByEmployeeId({
  supabase,
  employeeId,
  filters,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
  filters: { year: string | undefined };
}) {
  const filterYear = filters?.year ? Number(filters.year) : defaultYear;

  const columns = [
    "id",
    "employee_id",
    "month",
    "year",
    "working_days",
    "present_days",
    "absent_days",
    "overtime_hours",
    "working_hours",
    "paid_holidays",
    "paid_leaves",
    "casual_leaves",
  ] as const;

  const { data, error } = await supabase
    .from("monthly_attendance")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .eq("year", filterYear)
    .gte("month", 1)
    .lte("month", 12)
    .returns<EmployeeMonthlyAttendanceDatabaseRow[]>();

  if (error) {
    console.error("getAttendanceByEmployeeId Error", error);
  }

  return { data, error };
}

export type AttendanceFilters = {
  month?: string | undefined | null;
  year?: string | undefined | null;
  project?: string | undefined | null;
  site?: string | undefined | null;
  recently_added?: string | undefined | null;
};

export async function getMonthlyAttendanceByCompanyId({
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
    filters?: AttendanceFilters;
  };
}) {
  const { from, to, sort, searchQuery, filters } = params;
  const { month, year, project, site, recently_added } = filters ?? {};
  const siteNames = site
    ? site
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const foreignFilters = project || siteNames.length > 0;

  const columns = [
    "id",
    "first_name",
    "middle_name",
    "last_name",
    "employee_code",
    "company_id",
  ] as const;

  let query = supabase
    .from("employees")
    .select(
      `
      ${columns.join(",")},
      work_details!work_details_employee_id_fkey!${
        foreignFilters ? "inner" : "left"
      }(employee_id, assignment_type, skill_level, position, start_date, end_date, project_id, site_id,
        projects!${project ? "inner" : "left"}(id, name),
        sites!${siteNames.length > 0 ? "inner" : "left"}(id, name)
      ),
      monthly_attendance:monthly_attendance!inner(
        id,
        present_days,
        overtime_hours,
        month,
        year,
        working_days,
        absent_days,
        paid_holidays,
        paid_leaves,
        casual_leaves,
        daily_records:daily_attendance(attendance_id, date, present, holiday, holiday_type, overtime_hours, no_of_hours),
        salary_entries:salary_entries!left(id,invoice_id)
      )
    `,
      { count: "exact" },
    )
    .eq("company_id", companyId);

  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray.length > 0 && searchQueryArray.length <= 3) {
      for (const element of searchQueryArray) {
        query = query.or(
          `or(first_name.ilike.%${element}%,middle_name.ilike.%${element}%,last_name.ilike.%${element}%,employee_code.ilike.%${element}%)`,
        );
      }
    } else {
      query = query.or(
        `or(first_name.ilike.%${searchQuery}%,middle_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,employee_code.ilike.%${searchQuery}%)`,
      );
    }
  }

  const effectiveMonth = parseMonthNumber(month);
  const effectiveYear = year ? Number(year) : previousMonthYear;

  if (filters) {
    query = query
      .eq("monthly_attendance.month", effectiveMonth)
      .eq("monthly_attendance.year", effectiveYear);
  }
  if (project) {
    query = query.eq("work_details.projects.name", project);
  }

  if (siteNames.length === 1) {
    query = query.eq("work_details.sites.name", siteNames[0]);
  } else if (siteNames.length > 1) {
    query = query.in("work_details.sites.name", siteNames);
  }

  if (recently_added) {
    const now = new Date();
    const diff =
      filterComparison[recently_added as keyof typeof filterComparison];
    if (diff) {
      const startTime = new Date(now.getTime() - diff).toISOString();
      query = query.or(`created_at.gte.${startTime}`, {
        foreignTable: "monthly_attendance",
      });
    }
  }

  if (sort) {
    const [column, direction] = sort;
    if (column === "first_name") {
      query = query.order("first_name", { ascending: direction === "asc" });
    }

    if (column === "employee_code") {
      query = query.order("employee_code", { ascending: direction === "asc" });
    }
  } else {
    query = query.order("employee_code", { ascending: true });
  }

  const { data, count, error } = await query.range(from, to);
  if (error) {
    console.error("getMonthlyAttendanceByCompanyId Error", error);
  }

  const uniqueEmployeeMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeeMap.has(emp.id)) {
      uniqueEmployeeMap.set(emp.id, emp);
    }
  }
  const uniqueData = Array.from(uniqueEmployeeMap.values());

  const transformedData = uniqueData.map((employee: any) => ({
    ...employee,
    work_details: Array.isArray(employee.work_details)
      ? employee.work_details
      : employee.work_details
        ? [employee.work_details]
        : [],
    monthly_attendance: employee.monthly_attendance?.[0]
      ? {
          ...employee.monthly_attendance[0],
          salary_entries: employee.monthly_attendance[0].salary_entries ?? null,
        }
      : null,
  }));

  return {
    data: transformedData,
    count,
    error,
  };
}

export type AttendanceReportFilters = {
  start_month?: string | undefined | null;
  end_month?: string | undefined | null;
  start_year?: string | undefined | null;
  end_year?: string | undefined | null;
  project?: string | undefined | null;
  site?: string | undefined | null;
};

export async function getAttendanceReportByCompanyId({
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
    filters?: AttendanceReportFilters;
  };
}) {
  const currentYear = new Date().getFullYear();
  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear}-12-31`;
  const { sort, from, to, filters, searchQuery } = params;
  const { project, site, start_year, start_month, end_year, end_month } =
    filters ?? {};
  const foreignFilters = project || site;

  const columns = [
    "id",
    "employee_code",
    "first_name",
    "middle_name",
    "last_name",
  ] as const;

  const query = supabase
    .from("employees")
    .select(
      `
      ${columns.join(",")},
      work_details!work_details_employee_id_fkey!${
        foreignFilters ? "inner" : "left"
      }(
        sites!${foreignFilters ? "inner" : "left"}(id, name, projects!${
          project ? "inner" : "left"
        }(id, name))),
      attendance(
        id,
        date,
        present,
        employee_id
      )
    `,
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("attendance.present", true)
    .gte("attendance.date", startDate)
    .lte("attendance.date", endDate);

  if (sort) {
    const [column, direction] = sort;
    if (column === "employee_name") {
      query.order("first_name", { ascending: direction === "asc" });
    } else {
      query.order(column, { ascending: direction === "asc" });
    }
  }
  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray?.length > 0 && searchQueryArray?.length <= 3) {
      for (const searchQueryElement of searchQueryArray) {
        query.or(
          `first_name.ilike.%${searchQueryElement}%,middle_name.ilike.%${searchQueryElement}%,last_name.ilike.%${searchQueryElement}%,employee_code.ilike.%${searchQueryElement}%`,
        );
      }
    } else {
      query.or(
        `first_name.ilike.%${searchQuery}%,middle_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,employee_code.ilike.%${searchQuery}%`,
      );
    }
  }
  if (start_year || end_year) {
    let endDateLastDay = 30;
    if (end_year) {
      const year = Number.parseInt(end_year, 10);
      const month = new Date(`${end_month} 1, ${end_year}`).getMonth();
      endDateLastDay = new Date(year, month + 1, 0).getDate();
    }
    const start_date = new Date(`${start_month} 1, ${start_year} 12:00:00`);
    const end_date = new Date(
      `${end_month} ${endDateLastDay}, ${end_year} 12:00:00`,
    );
    if (start_year)
      query.gte(
        "attendance.date",
        formatUTCDate(start_date.toISOString().split("T")[0]),
      );
    if (end_year)
      query.lte(
        "attendance.date",
        formatUTCDate(end_date.toISOString().split("T")[0]),
      );
  }
  if (project) {
    query.eq("work_details.projects.name", project);
  }
  if (site) {
    query.eq("work_details.sites.name", site);
  }

  const { data, count, error } = await query
    .range(from, to)
    .returns<AttendanceReportDataType>();
  if (error) {
    console.error("getAttendanceReportByCompanyId Error", error);
    return { data: null, error };
  }

  const monthNames = Object.entries(months).reduce(
    (acc, [name, num]) => {
      acc[num] = name;
      return acc;
    },
    {} as { [key: number]: string },
  );

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }
  const uniqueData = Array.from(uniqueEmployeesMap.values());

  const processedData = uniqueData.map((employee) => {
    const { attendance, ...employeeInfo } = employee;
    const attendanceByMonth: Record<string, any[]> = {};

    if (Array.isArray(attendance) && attendance.length > 0) {
      for (const record of attendance) {
        if (record.date) {
          const recordDate = new Date(record.date);
          const month = monthNames[recordDate.getMonth() + 1];
          const year = recordDate.getFullYear();
          const monthYearKey = `${month} ${year}`;

          if (!attendanceByMonth[monthYearKey]) {
            attendanceByMonth[monthYearKey] = [];
          }

          attendanceByMonth[monthYearKey].push(record);
        }
      }
    }

    return {
      ...employeeInfo,
      attendance: attendanceByMonth,
    };
  });

  return {
    data: processedData,
    meta: { count: count },
    error: null,
  };
}

////////////////////////////////////////////////////////////////

export async function getMonthlyAttendanceBySiteIds({
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
    filters?: AttendanceFilters;
  };
}) {
  const { to, from, sort, searchQuery, filters } = params;
  const { month, year, project, site, recently_added } = filters ?? {};

  const columns = [
    "id",
    "first_name",
    "middle_name",
    "last_name",
    "employee_code",
    "company_id",
  ] as const;

  let query = supabase
    .from("employees")
    .select(
      `
      ${columns.join(",")},
      work_details!work_details_employee_id_fkey!inner(employee_id, assignment_type, skill_level, position, start_date, end_date, project_id, site_id,
        projects!${project ? "inner" : "left"}(id, name),
        sites!inner(id, name)
      ),
      monthly_attendance:monthly_attendance!inner(
        id,
        present_days,
        working_hours,
        overtime_hours,
        month,
        year,
        working_days,
        absent_days,
        paid_holidays,
        paid_leaves,
        casual_leaves,
        daily_records:daily_attendance(attendance_id, date, present, holiday, holiday_type, overtime_hours, no_of_hours),
        salary_entries:salary_entries!left(id,invoice_id)
      )
    `,
      { count: "exact" },
    )
    .in("work_details.sites.id", siteIds);

  if (searchQuery) {
    const searchQueryArray = searchQuery.split(" ");
    if (searchQueryArray.length > 0 && searchQueryArray.length <= 3) {
      for (const element of searchQueryArray) {
        query = query.or(
          `or(first_name.ilike.%${element}%,middle_name.ilike.%${element}%,last_name.ilike.%${element}%,employee_code.ilike.%${element}%)`,
        );
      }
    } else {
      query = query.or(
        `or(first_name.ilike.%${searchQuery}%,middle_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,employee_code.ilike.%${searchQuery}%)`,
      );
    }
  }

  const effectiveMonth = parseMonthNumber(month);
  const effectiveYear = year ? Number(year) : previousMonthYear;

  if (filters) {
    query = query
      .eq("monthly_attendance.month", effectiveMonth)
      .eq("monthly_attendance.year", effectiveYear);
  }
  if (project) {
    query = query.eq("work_details.projects.name", project);
  }

  if (site) {
    query = query.eq("work_details.sites.name", site);
  }

  if (recently_added) {
    const now = new Date();
    const diff =
      filterComparison[recently_added as keyof typeof filterComparison];
    if (diff) {
      const startTime = new Date(now.getTime() - diff).toISOString();
      query = query.or(`created_at.gte.${startTime}`, {
        foreignTable: "monthly_attendance",
      });
    }
  }

  if (sort) {
    const [column, direction] = sort;
    if (column === "first_name") {
      query = query.order("first_name", { ascending: direction === "asc" });
    }

    if (column === "employee_code") {
      query = query.order("employee_code", { ascending: direction === "asc" });
    }
  } else {
    query = query.order("employee_code", { ascending: true });
  }

  const { data, count, error } = await query.range(from, to);
  if (error) {
    console.error("getMonthlyAttendanceByCompanyId Error", error);
  }
  const uniqueEmployeeMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeeMap.has(emp.id)) {
      uniqueEmployeeMap.set(emp.id, emp);
    }
  }
  const uniqueData = Array.from(uniqueEmployeeMap.values());

  const transformedData = uniqueData.map((employee: any) => {
    const attendanceMonth =
      employee.monthly_attendance?.[0]?.month ?? effectiveMonth;
    const attendanceYear =
      employee.monthly_attendance?.[0]?.year ?? effectiveYear;
    const matchedSalaryEntry = employee.salary_entries?.find(
      (se: any) => se.month === attendanceMonth && se.year === attendanceYear,
    );

    return {
      ...employee,
      monthly_attendance: employee.monthly_attendance?.[0]
        ? {
            ...employee.monthly_attendance[0],
            salary_entries: matchedSalaryEntry ?? null,
          }
        : null,
      salary_entries: undefined,
    };
  });

  return {
    data: transformedData,
    count,
    error,
  };
}

export async function getDailyAttendanceByMonthlyId({
  supabase,
  attendanceId,
}: {
  supabase: TypedSupabaseClient;
  attendanceId: string;
}) {
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("*")
    .eq("attendance_id", attendanceId)
    .order("date", { ascending: true });

  if (error) {
    console.error("getDailyAttendanceByMonthlyId Error", error);
  }

  return { data, error };
}

export async function getMonthlyAttendanceByEmployeeIds({
  supabase,
  employeeIds,
  month,
  year,
}: {
  supabase: TypedSupabaseClient;
  employeeIds: string[];
  month: number;
  year: number;
}) {
  const { data, error } = await supabase
    .from("monthly_attendance")
    .select("employee_id, present_days")
    .in("employee_id", employeeIds)
    .eq("month", month)
    .eq("year", year);

  if (error) {
    console.error("getMonthlyAttendanceByEmployeeIds Error", error);
  }

  return { data, error };
}

export async function getEmployeesWithoutAttendance({
  supabase,
  companyId,
  month,
  year,
  filters,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  month: number;
  year: number;
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
      work_details!work_details_employee_id_fkey!${
        foreignFilters ? "inner" : "left"
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
      "getEmployeesWithoutAttendance - employees query error:",
      employeesError,
    );
    return { data: [], error: employeesError };
  }

  if (!allActiveEmployees || allActiveEmployees.length === 0) {
    return { data: [], error: null };
  }

  const { data: existingAttendance, error: attendanceError } = await supabase
    .from("monthly_attendance")
    .select("employee_id, employees!inner(company_id)")
    .eq("employees.company_id", companyId)
    .eq("month", month)
    .eq("year", year);

  if (attendanceError) {
    console.error(
      "getEmployeesWithoutAttendance - attendance query error:",
      attendanceError,
    );
    return { data: [], error: attendanceError };
  }

  const attendedEmployeeIds = new Set(
    (existingAttendance || []).map((att) => att.employee_id),
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

  const missingAttendanceEmployees = transformedEmployees.filter(
    (emp: any) => !attendedEmployeeIds.has(emp.id),
  );

  return {
    data: missingAttendanceEmployees,
    error: null,
  };
}
