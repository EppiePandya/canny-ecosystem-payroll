import { formatUTCDate, normalizeEnum } from "@canny_ecosystem/utils";
import type {
  EmployeeAddressDatabaseRow,
  EmployeeBankDetailsDatabaseRow,
  EmployeeDatabaseRow,
  EmployeeDocumentsDatabaseRow,
  EmployeeGuardianDatabaseRow,
  EmployeeMonthlyAttendanceDatabaseRow,
  EmployeeStatutoryDetailsDatabaseRow,
  EmployeeWorkDetailsDatabaseRow,
  InferredType,
  ProjectDatabaseRow,
  SiteDatabaseRow,
  TypedSupabaseClient,
} from "../types";

import {
  HARD_QUERY_LIMIT,
  HARDEST_QUERY_LIMIT,
  MID_QUERY_LIMIT,
  SINGLE_QUERY_LIMIT,
  QUERY_BATCH_SIZE,
} from "../constant";

export type EmployeeFilters = {
  dob_start?: string | undefined | null;
  dob_end?: string | undefined | null;
  education?: string | undefined | null;
  gender?: string | undefined | null;
  status?: string | undefined | null;
  project?: string | undefined | null;
  site?: string | undefined | null;
  assignment_type?: string | undefined | null;
  position?: string | undefined | null;
  skill_level?: string | undefined | null;
  doj_start?: string | undefined | null;
  doj_end?: string | undefined | null;
  dol_start?: string | undefined | null;
  dol_end?: string | undefined | null;
};

export type GetEmployeesByCompanyIdParams = {
  to: number;
  from: number;
  sort?: [string, "asc" | "desc"];
  searchQuery?: string;
  filters?: EmployeeFilters | null;
};

export type ImportEmployeeWorkDetailsDataType = {
  employee_code: string;
  department?: string;
  position?: string;
  start_date?: string;
  end_date?: string;
  assignment_type?: string;
  skill_level?: string;
  site?: string;
  project?: string;
  department_id?: string;
  site_id?: string;
  project_id?: string;
};

export type EmployeeDataType = Pick<
  EmployeeDatabaseRow,
  | "id"
  | "employee_code"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "date_of_birth"
  | "primary_mobile_number"
  | "education"
  | "is_active"
  | "gender"
> & {
  work_details: Pick<
    EmployeeWorkDetailsDatabaseRow,
    | "employee_id"
    | "assignment_type"
    | "position"
    | "skill_level"
    | "start_date"
    | "end_date"
    | "employee_code"
    | "project_id"
    | "department_id"
  > & {
    sites: {
      id: SiteDatabaseRow["id"];
      name: SiteDatabaseRow["name"];
      projects: {
        id: ProjectDatabaseRow["id"];
        name: ProjectDatabaseRow["name"];
      };
    };
  } & {
    department: {
      id: SiteDatabaseRow["id"];
      name: SiteDatabaseRow["name"];
    };
  };
} & {
  employee_statutory_details: Pick<
    EmployeeStatutoryDetailsDatabaseRow,
    | "aadhaar_number"
    | "pan_number"
    | "uan_number"
    | "pf_number"
    | "esic_number"
    | "is_esic_applicable"
    | "esic_id"
  >;
} & {
  employee_bank_details: Pick<
    EmployeeBankDetailsDatabaseRow,
    "account_number" | "bank_name"
  >;
} & {
  employee_addresses: Pick<EmployeeAddressDatabaseRow, "is_primary">[];
} & {
  employee_guardians: Pick<
    EmployeeGuardianDatabaseRow,
    "is_emergency_contact"
  >[];
};

export async function getEmployeesByCompanyId({
  supabase,
  companyId,
  params,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  params: GetEmployeesByCompanyIdParams;
}) {
  const { sort, from, to, filters, searchQuery } = params;

  const {
    dob_start,
    dob_end,
    education,
    gender,
    status,
    project,
    site,
    assignment_type,
    position,
    skill_level,
    doj_start,
    doj_end,
    dol_start,
    dol_end,
  } = (filters ?? {}) as any;

  const foreignFilters =
    project ||
    site ||
    assignment_type ||
    position ||
    skill_level ||
    doj_start ||
    doj_end ||
    dol_start ||
    dol_end;

  const columns = [
    "id",
    "employee_code",
    "first_name",
    "middle_name",
    "last_name",
    "photo",
    "date_of_birth",
    "gender",
    "education",
    "marital_status",
    "primary_mobile_number",
    "secondary_mobile_number",
    "personal_email",
    "is_active",
    "company_id",
  ] as const;

  const query = supabase
    .from("employees")
    .select(
      `${columns.join(",")},
        work_details!work_details_employee_id_fkey!${
          foreignFilters ? "inner" : "left"
        }(employee_id, assignment_type, skill_level, position, start_date, end_date, project_id,
        projects!${project ? "inner" : "left"}(id, name),
        sites!${foreignFilters ? "inner" : "left"}(id, name)
      ),
      employee_statutory_details!left(aadhaar_number, pan_number, uan_number, pf_number, esic_number, is_esic_applicable, esic_id, company_esic_details!left(id, esic_site_name, esic_id_number::text)),
      employee_bank_details!left(account_number, bank_name)`,
      { count: "exact" },
    )
    .order("start_date", { foreignTable: "work_details", ascending: false })
    .eq("company_id", companyId);

  if (sort) {
    const [column, direction] = sort;
    const baseCols = [
      "first_name",
      "last_name",
      "employee_code",
      "date_of_birth",
      "education",
      "gender",
      "primary_mobile_number",
    ];

    if (baseCols.includes(column)) {
      query.order(column, { ascending: direction === "asc" });
    } else {
      query.order("created_at", { ascending: false });
    }
  } else {
    query.order("created_at", { ascending: false });
  }
  query.order("id", { ascending: true });

  if (searchQuery) {
    const searchTerms = searchQuery.split(" ").filter(Boolean);
    if (searchTerms.length > 0) {
      for (const term of searchTerms) {
        query.or(
          `first_name.ilike.%${term}%,middle_name.ilike.%${term}%,last_name.ilike.%${term}%,employee_code.ilike.%${term}%,primary_mobile_number.ilike.%${term}%`,
        );
      }
    }
  }

  const dateFilters = [
    { field: "date_of_birth", start: dob_start, end: dob_end },
    {
      field: "work_details.start_date",
      start: doj_start,
      end: doj_end,
    },
    {
      field: "work_details.end_date",
      start: dol_start,
      end: dol_end,
    },
  ];

  for (const { field, start, end } of dateFilters) {
    if (start) query.gte(field, formatUTCDate(start));
    if (end) query.lte(field, formatUTCDate(end));
  }

  if (status) {
    query.eq("is_active", status === "active");
  }
  if (gender) {
    query.eq("gender", gender.toLowerCase());
  }
  if (education) {
    query.eq("education", education.toLowerCase());
  }
  if (project) {
    query.eq("work_details.projects.name", project);
  }
  if (site) {
    query.eq("work_details.sites.name", site);
  }
  if (assignment_type) {
    query.eq("work_details.assignment_type", assignment_type);
  }
  if (position) {
    query.eq("work_details.position", position);
  }
  if (skill_level) {
    query.eq("work_details.skill_level", skill_level);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("getEmployeesByCompanyId Error", error);
  }

  if (data && data.length > 0) {
    const uniqueEmployeesMap = new Map<string, any>();
    for (const emp of data) {
      if (!uniqueEmployeesMap.has(emp.id)) {
        uniqueEmployeesMap.set(emp.id, {
          ...emp,
          work_details: Array.isArray(emp.work_details)
            ? emp.work_details
            : emp.work_details
              ? [emp.work_details]
              : [],
        });
      } else {
        const existing = uniqueEmployeesMap.get(emp.id);
        const newWds = Array.isArray(emp.work_details)
          ? emp.work_details
          : emp.work_details
            ? [emp.work_details]
            : [];
        const existingWdKeys = new Set(
          existing.work_details.map(
            (w: any) => `${w.start_date}-${w.site_id}-${w.project_id}`,
          ),
        );
        for (const wd of newWds) {
          const key = `${wd.start_date}-${wd.site_id}-${wd.project_id}`;
          if (!existingWdKeys.has(key)) {
            existing.work_details.push(wd);
            existingWdKeys.add(key);
          }
        }
      }
    }
    const deduplicatedData = Array.from(uniqueEmployeesMap.values());
    const employeeIds = deduplicatedData.map((emp) => emp.id);
    const [addressesResult, guardiansResult] = await Promise.all([
      supabase
        .from("employee_addresses")
        .select("employee_id, is_primary")
        .in("employee_id", employeeIds),
      supabase
        .from("employee_guardians")
        .select("employee_id, id")
        .in("employee_id", employeeIds),
    ]);

    const addresses = addressesResult.data || [];
    const guardians = guardiansResult.data || [];

    deduplicatedData.forEach((emp: any) => {
      emp.employee_addresses = addresses.filter(
        (addr: any) => addr.employee_id === emp.id,
      );
      emp.employee_guardians = guardians.filter(
        (g: any) => g.employee_id === emp.id,
      );
    });

    return {
      data: deduplicatedData,
      meta: { count: count },
      error,
    };
  }

  return {
    data: data ?? [],
    meta: { count: count },
    error,
  };
}

export async function getEmployeesByIds({
  supabase,
  employeeIds,
}: {
  supabase: TypedSupabaseClient;
  employeeIds: string[];
}) {
  if (!employeeIds.length) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      date_of_birth,
      education,
      primary_mobile_number,
      is_active,
      gender,
      photo,
      work_details!left(
        employee_id,
        assignment_type,
        skill_level,
        position,
        start_date,
        end_date,
        project_id,
        projects!left(
          id,
          name
        ),
        sites!left(
          id,
          name
        )
      ),

      employee_statutory_details!left(
        aadhaar_number,
        pan_number,
        uan_number,
        pf_number,
        esic_number,
        is_esic_applicable
      ),

      employee_bank_details!left(
        account_number,
        bank_name
      ),

      employee_addresses!left(
        address_line_1,
        city,
        state,
        country,
        pincode
      )
    `,
    )
    .in("id", employeeIds);

  if (error) {
    console.error("getEmployeesByIds error", error);
  }

  return { data, error };
}

export async function getActiveEmployeesByIdsFlat({
  supabase,
  employeeIds,
}: {
  supabase: TypedSupabaseClient;
  employeeIds: string[];
}) {
  if (!employeeIds.length) {
    return { data: [], error: null };
  }

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data, error } = await supabase
    .from("work_details")
    .select(
      `
      employee_id,
      position,
      start_date,
      departments(
        name
      ),
      employees!inner(
      first_name,
      middle_name,
      last_name,
      gender,
      marital_status,
      employee_code,
      employee_statutory_details(
        esic_number
      ),
      employee_guardians(
        first_name,
        last_name,
        relationship
      ),
        employee_addresses(
          address_line_1,
          address_line_2,
          city,
          state,
          pincode,
          is_primary
        ),
        employee_exit(
        last_working_day
      ),
      employee_salary_assignment(
        *,
        employee_salary_components(
          *,
          payment_fields(*)
        ),
        employee_salary_statutory_components (
          *,
          pf:employee_provident_fund (*),
          esi:employee_state_insurance (*),
          pt:professional_tax (*),
          bonus:statutory_bonus (*),
          lwf:labour_welfare_fund (*)
        ),
        payment_templates(
          id,
          name,
          payment_template_versions(
            monthly_ctc,
            basic_percent,
            effective_date,
            is_pro_rata,
            payment_template_components(
              *,
              payment_fields(*)
            ),
            payment_statutory_components (
              *,
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
 sites!inner(
        name,
        address_line_1,
        city,
        state,
        company_id,
        companies (
          name
        )
      ),
      projects!inner (
        name
      )
    `,
    )
    .in("employee_id", employeeIds)
    .not("start_date", "is", null);

  if (error) {
    console.error("getActiveEmployeesByIdsFlat error", error);
    return { data: [], error };
  }
  const flattenedData = data.map((row) => {
    const employee = row.employees;

    const primaryAddress =
      employee.employee_addresses?.find(
        (a: (typeof employee.employee_addresses)[number]) => a.is_primary,
      ) ?? employee.employee_addresses?.[0];

    const addressLines: string[] = [];
    if (primaryAddress?.address_line_1) {
      addressLines.push(primaryAddress.address_line_1);
    }
    if (primaryAddress?.address_line_2) {
      addressLines.push(primaryAddress.address_line_2);
    }
    const cityState = [primaryAddress?.city, primaryAddress?.state]
      .filter(Boolean)
      .join(", ");
    if (cityState) {
      addressLines.push(cityState);
    }
    if (primaryAddress?.pincode) {
      addressLines.push(`Pin Code -${primaryAddress.pincode}`);
    }

    const formattedAddress =
      addressLines.length > 0 ? addressLines.join("\n") : "";

    const employeeExitDate =
      (
        employee.employee_exit as unknown as
          | { last_working_day: string | null }[]
          | undefined
      )?.[0]?.last_working_day ?? null;

    const esicNumber = employee.employee_statutory_details?.esic_number ?? "";
    const activeSalaryAssignment = employee.employee_salary_assignment
      ?.filter(
        (assignment: any) =>
          new Date(assignment.effective_date).getTime() <= new Date().getTime(),
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.effective_date).getTime() -
          new Date(a.effective_date).getTime(),
      )[0];

    const fatherGuardian =
      (
        employee.employee_guardians as unknown as
          | { first_name?: string | null; last_name?: string | null; relationship?: string | null }[]
          | undefined
      )?.find(
        (g) => g.relationship?.toLowerCase() === "father",
      ) ?? (employee.employee_guardians as unknown as { first_name?: string | null; last_name?: string | null; relationship?: string | null }[] | undefined)?.[0];

    const guardianFatherName = [
      fatherGuardian?.first_name,
      fatherGuardian?.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    const middleName = employee.middle_name || guardianFatherName || "";
    const fatherName = guardianFatherName || employee.middle_name || "";

    return {
      employee_id: row.employee_id,
      first_name: employee.first_name || "",
      middle_name: middleName,
      father_name: fatherName,
      last_name: employee.last_name || "",
      employee_code: employee.employee_code,
      esic_number: esicNumber,
      position: row.position,
      department_name: row.departments?.name || "Not Found",
      joined_date: row.start_date,
      site_name: row.sites.name,
      site_address: row.sites.address_line_1,
      site_city: row.sites.city,
      site_state: row.sites.state,
      company_name: row.sites.companies?.name || "Not Found",
      project_name: row.projects?.name ?? "",
      employee_address: formattedAddress,
      gender: employee.gender,
      marital_status: (employee as any).marital_status,
      employee_exit_date: employeeExitDate,
      active_salary_assignment: activeSalaryAssignment,
    };
  });

  return { data: flattenedData, error: null };
}

export async function getEmployeeIdentityBySiteId({
  supabase,
  siteId,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
}) {
  const columns = ["id", "employee_code"] as const;

  const { data, error } = await supabase
    .from("employees")
    .select(
      `${columns.join(
        ",",
      )},work_details!work_details_employee_id_fkey!inner(site_id)`,
    )
    .eq("work_details.site_id", siteId)
    .limit(MID_QUERY_LIMIT)
    .returns<
      InferredType<EmployeeDatabaseRow, (typeof columns)[number]>[] | null
    >();

  if (error) {
    console.error("getEmployeesBySiteId Error", error);
  }

  return {
    data,
    error,
  };
}

export async function getEmployeesBySiteId({
  supabase,
  siteId,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
}) {
  const columns = [
    "id",
    "employee_code",
    "first_name",
    "middle_name",
    "last_name",
    "date_of_birth",
    "education",
    "primary_mobile_number",
    "is_active",
    "gender",
  ] as const;

  const { data, error } = await supabase
    .from("employees")
    .select(
      `${columns.join(",")}, work_details!work_details_employee_id_fkey!inner(employee_id, assignment_type, skill_level, position, start_date, end_date,
        site_id, sites!inner(name, projects(id, name))))`,
    )
    .eq("work_details.site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(MID_QUERY_LIMIT)
    .returns<EmployeeDataType[]>();

  if (error) {
    console.error("getEmployeesBySiteId Error", error);
  }

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }

  return {
    data: Array.from(uniqueEmployeesMap.values()),
    error,
  };
}

export async function getOnlyEmployeesBySiteId({
  supabase,
  siteId,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
}) {
  const columns = [
    "id",
    "employee_code",
    "first_name",
    "middle_name",
    "last_name",
    "date_of_birth",
    "education",
    "primary_mobile_number",
    "is_active",
    "gender",
  ] as const;

  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      ${columns.join(",")},
      employee_statutory_details!left(uan_number),
      work_details!work_details_employee_id_fkey!inner(
        employee_id,
        assignment_type,
        skill_level,
        position,
        start_date,
        end_date,
        site_id,
        department_id
      )
      `,
    )
    .eq("work_details.site_id", siteId)
    .eq("is_active", true) // ✅ THIS LINE ADDED
    .order("created_at", { ascending: false })
    .limit(MID_QUERY_LIMIT)
    .returns<EmployeeDataType[]>();

  if (error) {
    console.error("getOnlyEmployeesBySiteId Error", error);
  }

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }

  return {
    data: Array.from(uniqueEmployeesMap.values()),
    error,
  };
}

export async function getLatestEmployeeOfTheSite({
  supabase,
  siteId,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
}) {
  const { data, error } = await supabase
    .from("employees")
    .select("employee_code, work_details!inner(site_id)")
    .eq("work_details.site_id", siteId)
    .order("created_at,employee_code", { ascending: false })
    .limit(SINGLE_QUERY_LIMIT)
    .maybeSingle();

  if (error) {
    console.error("getLatestEmployeeOfTheSite Error", error);
  }

  return {
    data: data?.employee_code ?? null,
    error,
  };
}

export async function getLatestEmployeeByCompanyId({
  supabase,
  companyId,
  prefix,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  prefix?: string;
}) {
  let query = supabase
    .from("employees")
    .select("employee_code")
    .eq("company_id", companyId);

  if (prefix) {
    query = query.ilike("employee_code", `${prefix}%`);
  }

  const { data, error } = await query
    .order("employee_code", { ascending: false })
    .limit(10000);

  if (error) {
    console.error("getLatestEmployeeByCompanyId Error", error);
  }

  let filtered = data || [];
  if (prefix) {
    const regex = new RegExp(`^${prefix}\\d*$`, "i");
    filtered = (data || []).filter((item) => regex.test(item.employee_code));
  }

  if (filtered.length === 0) {
    return { data: null, error };
  }

  // Find the code with the highest numeric suffix
  let maxNumber = -1;
  let latestCode = filtered[0].employee_code;

  for (const item of filtered) {
    const code = item.employee_code;
    const match = code.match(/\d+$/);
    if (match) {
      const num = Number.parseInt(match[0], 10);
      if (num > maxNumber) {
        maxNumber = num;
        latestCode = code;
      }
    }
  }

  return {
    data: latestCode,
    error,
  };
}

export async function getEmployeeIdsByEmployeeCodes({
  supabase,
  employeeCodes,
}: {
  supabase: TypedSupabaseClient;
  employeeCodes: string[];
}) {
  const columns = [
    "employee_code",
    "id",
    "first_name",
    "middle_name",
    "last_name",
  ] as const;
  const BATCH_SIZE = QUERY_BATCH_SIZE;
  const allData: any[] = [];
  let finalError: any = null;

  for (let i = 0; i < employeeCodes.length; i += BATCH_SIZE) {
    const batch = employeeCodes.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("employees")
      .select(columns.join(","))
      .in("employee_code", batch);

    if (error) {
      console.error("getEmployeeIdsByEmployeeCodes Batch Error", error);
      finalError = error;
      break;
    }

    if (data) {
      allData.push(...data);
    }
  }

  if (finalError) {
    return { data: [], missing: [], error: finalError };
  }

  const foundCodes = allData.map((e) => e.employee_code);
  const missing = employeeCodes.filter((code) => !foundCodes.includes(code));

  return { data: allData, missing, error: null };
}

export async function getEmployeeIdsByUanNumber({
  supabase,
  uan_number,
}: {
  supabase: TypedSupabaseClient;
  uan_number: string[];
}) {
  const columns = ["uan_number", "employee_id"] as const;

  const { data, error } = await supabase
    .from("employee_statutory_details")
    .select(columns.join(","))
    .in("uan_number", uan_number)
    .returns<
      InferredType<
        EmployeeStatutoryDetailsDatabaseRow,
        (typeof columns)[number]
      >[]
    >();

  if (error) {
    console.error("getEmployeeIdsByUanNumber Error", error);
    return { data: [], missing: [], error };
  }

  const foundCodes = data.map((e) => e.uan_number);
  const missing = uan_number.filter(
    (uan_number) => !foundCodes.includes(uan_number),
  );

  return { data, missing, error };
}

export async function getEmployeeIdsByIdentifiers({
  supabase,
  identifiers,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  identifiers: string[];
  companyId?: string;
}) {
  const cleanIdentifiers = [
    ...new Set(identifiers.filter(Boolean).map((id) => String(id).trim())),
  ];

  if (cleanIdentifiers.length === 0)
    return { data: new Map<string, string>(), error: null };

  // Try matching by Employee Code
  let codeQuery = supabase
    .from("employees")
    .select("id, employee_code")
    .in("employee_code", cleanIdentifiers);

  if (companyId) {
    codeQuery = codeQuery.eq("company_id", companyId);
  }

  const { data: byCode, error: codeErr } = await codeQuery;

  if (codeErr) {
    console.error("Error fetching employees by code:", codeErr);
    return { data: null, error: codeErr };
  }

  // Try matching by UAN Number
  let uanQuery = supabase
    .from("employee_statutory_details")
    .select("employee_id, uan_number, employees!inner(company_id)")
    .in("uan_number", cleanIdentifiers);

  if (companyId) {
    uanQuery = uanQuery.eq("employees.company_id", companyId);
  }

  const { data: byUan, error: uanErr } = await uanQuery;

  if (uanErr) {
    console.error("Error fetching employees by UAN:", uanErr);
    return { data: null, error: uanErr };
  }

  let nameQuery = supabase
    .from("employees")
    .select("id, first_name, middle_name, last_name");

  if (companyId) {
    nameQuery = nameQuery.eq("company_id", companyId);
  }

  const { data: byName, error: nameErr } = await nameQuery;

  if (nameErr) {
    console.error("Error fetching employees by name:", nameErr);
    return { data: null, error: nameErr };
  }

  const results = new Map<string, string>();
  const clean = (s: any) =>
    String(s || "")
      .trim()
      .split(".")[0];
  const normalize = (val: any) => {
    if (!val) return "";
    let s = String(val).toLowerCase();
    s = s.replace(/\bnull\b/g, "");
    return s
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .sort()
      .join("");
  };

  byCode?.forEach((e) => results.set(clean(e.employee_code), e.id));

  byUan?.forEach((e) => {
    if (e.uan_number) results.set(clean(e.uan_number), e.employee_id!);
  });

  cleanIdentifiers.forEach((id) => {
    const normalizedId = normalize(id);
    if (!normalizedId || results.has(id)) return;

    const matchedEmp = byName?.find((e) => {
      const fullNormalized = normalize(
        `${e.first_name} ${e.middle_name || ""} ${e.last_name || ""}`,
      );
      const shortNormalized = normalize(`${e.first_name} ${e.last_name || ""}`);

      return (
        fullNormalized === normalizedId || shortNormalized === normalizedId
      );
    });

    if (matchedEmp) {
      results.set(id, matchedEmp.id);
    }
  });

  return { data: results, error: null };
}
export async function getEmployeeIdsByEsicNumber({
  supabase,
  esic_number,
}: {
  supabase: TypedSupabaseClient;
  esic_number: string[];
}) {
  const columns = ["esic_number", "employee_id"] as const;

  const { data, error } = await supabase
    .from("employee_statutory_details")
    .select(columns.join(","))
    .in("esic_number", esic_number)
    .returns<
      InferredType<
        EmployeeStatutoryDetailsDatabaseRow,
        (typeof columns)[number]
      >[]
    >();

  if (error) {
    console.error("getEmployeeIdsByesicNumber Error", error);
    return { data: [], missing: [], error };
  }

  const foundCodes = data.map((e) => e.esic_number);
  const missing = esic_number.filter(
    (esic_number) => !foundCodes.includes(esic_number),
  );

  return { data, missing, error };
}

export async function getEmployeeByAnyIdentifier({
  supabase,
  identifier,
}: {
  supabase: TypedSupabaseClient;
  identifier: string;
}) {
  const columns = ["id"] as const;

  const orClause = [
    `employee_code.eq.${identifier}`,
    `personal_email.eq.${identifier}`,
    `primary_mobile_number.eq.${identifier}`,
    `secondary_mobile_number.eq.${identifier}`,
  ].join(",");

  const { data, error } = await supabase
    .from("employees")
    .select(columns.join(","))
    .or(orClause)
    .single<InferredType<EmployeeDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getEmployeeByAnyIdentifier Error", error);
  }

  return { data, error };
}

export async function getEmployeeById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "employee_code",
    "first_name",
    "middle_name",
    "last_name",
    "photo",
    "date_of_birth",
    "gender",
    "education",
    "marital_status",
    "primary_mobile_number",
    "secondary_mobile_number",
    "personal_email",
    "is_active",
    "company_id",
  ] as const;

  const { data, error } = await supabase
    .from("employees")
    .select(columns.join(","))
    .eq("id", id)
    .single<InferredType<EmployeeDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getEmployeeById Error", error);
  }

  return { data, error };
}

export async function getEmployeeStatutoryDetailsById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "aadhaar_number",
    "pan_number",
    "uan_number",
    "pf_number",
    "esic_number",
    "is_esic_applicable",
    "esic_id",
    "driving_license_number",
    "driving_license_expiry",
    "passport_number",
    "passport_expiry",
    "employee_id",
  ] as const;

  const { data, error } = await supabase
    .from("employee_statutory_details")
    .select(
      `${columns.join(",")}, company_esic_details!left(id, esic_site_name, esic_id_number::text)`,
    )
    .eq("employee_id", id)
    .maybeSingle<any>();

  if (error) {
    console.error("getEmployeeStatutoryDetailsById Error", error);
  }

  return { data, error };
}

export async function getEmployeeBankDetailsById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "account_holder_name",
    "bank_name",
    "account_number",
    "ifsc_code",
    "branch_name",
    "account_type",
    "employee_id",
  ] as const;

  const { data, error } = await supabase
    .from("employee_bank_details")
    .select(columns.join(","))
    .eq("employee_id", id)
    .maybeSingle<
      InferredType<EmployeeBankDetailsDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getEmployeeBankDetailsById Error", error);
  }

  return { data, error };
}

export async function getEmployeeAddressesByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = [
    "id",
    "address_type",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "pincode",
    "is_primary",
    "latitude",
    "longitude",
    "employee_id",
  ] as const;

  const { data, error } = await supabase
    .from("employee_addresses")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .limit(HARD_QUERY_LIMIT)
    .returns<
      | InferredType<EmployeeAddressDatabaseRow, (typeof columns)[number]>[]
      | null
    >();

  if (error) {
    console.error("getEmployeeAddressesByEmployeeId Error", error);
  }

  return { data, error };
}

export async function getDefaultEmployeeAddressesByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = [
    "id",
    "address_type",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "pincode",
    "is_primary",
    "latitude",
    "longitude",
    "employee_id",
    "country",
  ] as const;

  const { data, error } = await supabase
    .from("employee_addresses")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .order("created_at", { ascending: false })
    .limit(SINGLE_QUERY_LIMIT)
    .single<InferredType<
      Omit<EmployeeAddressDatabaseRow, "created_at">,
      (typeof columns)[number]
    > | null>();

  if (error) {
    console.error("getDefaultEmployeeAddressesByEmployeeId Error", error);
  }

  return { data, error };
}

export async function getEmployeeGuardiansByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = [
    "id",
    "relationship",
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "mobile_number",
    "alternate_mobile_number",
    "email",
    "is_emergency_contact",
    "address_same_as_employee",
    "employee_id",
  ] as const;

  const { data, error } = await supabase
    .from("employee_guardians")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .limit(HARD_QUERY_LIMIT)
    .returns<
      | InferredType<EmployeeGuardianDatabaseRow, (typeof columns)[number]>[]
      | null
    >();

  if (error) {
    console.error("getEmployeeGuardiansByEmployeeId Error", error);
  }

  return { data, error };
}

export async function getEmployeeAddressById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "address_type",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "pincode",
    "is_primary",
    "latitude",
    "longitude",
    "employee_id",
  ] as const;

  const { data, error } = await supabase
    .from("employee_addresses")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<EmployeeAddressDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getEmployeeAddressById Error", error);
  }

  return { data, error };
}

export async function getEmployeeGuardianById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "id",
    "relationship",
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "mobile_number",
    "alternate_mobile_number",
    "email",
    "is_emergency_contact",
    "address_same_as_employee",
    "employee_id",
  ] as const;

  const { data, error } = await supabase
    .from("employee_guardians")
    .select(columns.join(","))
    .eq("id", id)
    .single<
      InferredType<EmployeeGuardianDatabaseRow, (typeof columns)[number]>
    >();

  if (error) {
    console.error("getEmployeeGuardianById Error", error);
  }

  return { data, error };
}

export type EmployeeWorkDetailsDataType = Omit<
  EmployeeWorkDetailsDatabaseRow,
  "created_at"
> & {
  sites: {
    id: string;
    name: string;
    projects: { id: string; name: string };
  };
} & {
  departments: {
    id: string;
    name: string;
  };
};

export async function getEmployeeWorkDetailsByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = [
    "employee_id",
    "site_id",
    "project_id",
    "position",
    "start_date",
    "end_date",
    "assignment_type",
    "skill_level",
    "department_id",
  ] as const;

  const { data, error } = await supabase
    .from("work_details")
    .select(
      `${columns.join(",")}, sites(id, name, company_locations!left(name,address_line_1,address_line_2,city,state,pincode)), projects(id, name), departments(id, name)`,
    )
    .order("created_at", { ascending: false })
    .eq("employee_id", employeeId)

    .returns<
      | InferredType<EmployeeWorkDetailsDatabaseRow, (typeof columns)[number]>[]
      | null
    >();

  if (error) {
    console.error("getEmployeeWorkDetailsByEmployeeId Error", error);
  }

  return { data, error };
}

export async function getEmployeeWorkDetailsByEmployeeIdForOthers({
  supabase,
  employeeId,
  month,
  year,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
  month: number;
  year: number;
}) {
  const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10);
  const columns = [
    "employee_id",
    "site_id",
    "position",
    "start_date",
    "end_date",
    "assignment_type",
    "skill_level",
    "department_id",
  ] as const;

  const { data, error } = await supabase
    .from("work_details")
    .select(
      `${columns.join(",")}, sites(id, name, company_locations!left(name,address_line_1,address_line_2,city,state,pincode)), projects(id, name), departments(id, name)`,
    )
    .order("created_at", { ascending: false })
    .eq("employee_id", employeeId)
    .lte("start_date", endOfMonth)
    .order("start_date", { ascending: false })
    .limit(SINGLE_QUERY_LIMIT)
    .maybeSingle();

  if (error) {
    console.error("getEmployeeWorkDetailsByEmployeeIdForOthers Error", error);
  }

  return { data, error };
}

export async function getEmployeeWorkDetailsById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = [
    "employee_id",
    "site_id",
    "project_id",
    "department_id",
    "position",
    "start_date",
    "end_date",
    "assignment_type",
    "skill_level",
  ] as const;

  const { data, error } = await supabase
    .from("work_details")
    .select(
      `${columns.join(",")}, sites(id, name, projects!project_id(id, name)),departments(id, name)`,
    )

    .eq("employee_id", id)
    .maybeSingle<EmployeeWorkDetailsDataType>();

  if (error) {
    console.error("getEmployeeWorkDetailsByEmployeeId Error", error);
  }

  return { data, error };
}
export type EmployeeReportDataType = Pick<
  EmployeeDatabaseRow,
  "id" | "employee_code" | "first_name" | "middle_name" | "last_name"
> & {
  employee_work_details: Pick<
    EmployeeWorkDetailsDatabaseRow,
    "employee_id" | "position" | "skill_level" | "start_date" | "end_date"
  > & {
    sites: {
      id: SiteDatabaseRow["id"];
      name: SiteDatabaseRow["name"];
      projects: {
        id: ProjectDatabaseRow["id"];
        name: ProjectDatabaseRow["name"];
      };
    };
  };
};

export type EmployeeReportFilters = {
  start_month?: string | undefined | null;
  end_month?: string | undefined | null;
  start_year?: string | undefined | null;
  end_year?: string | undefined | null;
  project?: string | undefined | null;
  site?: string | undefined | null;
};

export type GetEmployeesReportByCompanyIdParams = {
  to: number;
  from: number;
  sort?: [string, "asc" | "desc"];
  searchQuery?: string;
  filters?: EmployeeReportFilters | null;
};

export async function getEmployeesReportByCompanyId({
  supabase,
  companyId,
  params,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  params: GetEmployeesReportByCompanyIdParams;
}) {
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
      `${columns.join(",")},
        work_details!work_details_employee_id_fkey!${
          foreignFilters ? "inner" : "left"
        }(employee_id, assignment_type, skill_level, position, start_date, end_date,
        sites!${foreignFilters ? "inner" : "left"}(id, name, projects!${
          project ? "inner" : "left"
        }(id, name))
      )`,
      { count: "exact" },
    )
    .eq("company_id", companyId);

  // Sorting
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

    const start_date = new Date(`${start_month} 1, ${start_year}`);
    const end_date = new Date(`${end_month} ${endDateLastDay}, ${end_year}`);

    if (start_year)
      query.gte(
        "work_details.start_date",
        formatUTCDate(start_date.toISOString().split("T")[0]),
      );
    if (end_year)
      query.lte(
        "work_details.end_date",
        formatUTCDate(end_date.toISOString().split("T")[0]),
      );
  }

  if (project) {
    query.eq("work_details.sites.projects.name", project);
  }
  if (site) {
    query.eq("work_details.sites.name", site);
  }

  const { data, count, error } = await query
    .range(from, to)
    .returns<EmployeeReportDataType[]>();

  if (error) {
    console.error("getEmployeesReportByCompanyId Error", error);
    return { data: null, error };
  }

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }

  return {
    data: Array.from(uniqueEmployeesMap.values()),
    meta: { count: count },
    error: null,
  };
}

export async function getEmployeeDocumentById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = ["document_type", "url"] as const;

  const { data, error } = await supabase
    .from("employee_documents")
    .select(columns.join(","))
    .eq("id", id)
    .single<Pick<EmployeeDocumentsDatabaseRow, "document_type" | "url">>();

  if (error) console.error("getEmployeeDocumentById Error", error);

  return { data, error };
}

export async function getEmployeeDocuments({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = ["document_type", "url", "id"] as const;

  const { data, error } = await supabase
    .from("employee_documents")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(HARD_QUERY_LIMIT)
    .returns<
      InferredType<EmployeeDocumentsDatabaseRow, (typeof columns)[number]>[]
    >();

  if (error) console.error("getEmployeeDocuments Error", error);

  return { data, error };
}

export async function getEmployeeDocumentUrlByEmployeeIdAndDocumentName({
  supabase,
  employeeId,
  documentType,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
  documentType: string;
}) {
  const columns = ["url"] as const;

  const { data, error } = await supabase
    .from("employee_documents")
    .select(columns.join(","))
    .eq("employee_id", employeeId)
    .eq("document_type", documentType)
    .maybeSingle<EmployeeDocumentsDatabaseRow>();

  if (error) {
    console.error(
      "getEmployeeDocumentUrlByEmployeeIdAndDocumentName Error",
      error,
    );
    return { data, error };
  }

  return { data, error };
}

export type ImportEmployeeDetailsDataType = Partial<
  Pick<
    EmployeeDatabaseRow,
    | "employee_code"
    | "first_name"
    | "middle_name"
    | "last_name"
    | "gender"
    | "education"
    | "marital_status"
    | "nationality"
    | "is_active"
    | "date_of_birth"
    | "personal_email"
    | "primary_mobile_number"
    | "secondary_mobile_number"
    | "company_id"
    | "avatar_url"
  >
> &
  Partial<
    Pick<
      EmployeeWorkDetailsDatabaseRow,
      | "position"
      | "assignment_type"
      | "start_date"
      | "end_date"
      | "site_id"
      | "employee_code"
      | "employee_id"
      | "department_id"
      | "project_id"
      | "skill_level"
      | "probation_end_date"
    >
  > &
  Partial<
    Pick<
      EmployeeStatutoryDetailsDatabaseRow,
      | "uan_number"
      | "esic_number"
      | "aadhaar_number"
      | "pan_number"
      | "pf_number"
      | "passport_number"
      | "passport_expiry"
      | "driving_license_number"
      | "driving_license_expiry"
    >
  > & {
    site?: string;
    department?: string;
    project?: string;
  };

export type ImportEmployeeStatutoryDataType = Pick<
  EmployeeStatutoryDetailsDatabaseRow,
  | "aadhaar_number"
  | "pan_number"
  | "uan_number"
  | "pf_number"
  | "esic_number"
  | "esic_id"
  | "is_esic_applicable"
  | "driving_license_number"
  | "driving_license_expiry"
  | "passport_number"
  | "passport_expiry"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
  esic_site_name?: string;
};

export type ImportEmployeeBankDetailsDataType = Pick<
  EmployeeBankDetailsDatabaseRow,
  | "account_holder_name"
  | "account_number"
  | "ifsc_code"
  | "account_type"
  | "bank_name"
  | "branch_name"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
};

export type ImportEmployeeAddressDataType = Pick<
  EmployeeAddressDatabaseRow,
  | "address_type"
  | "address_line_1"
  | "address_line_2"
  | "city"
  | "pincode"
  | "state"
  | "country"
  | "latitude"
  | "longitude"
  | "is_primary"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
};

export type ImportEmployeeGuardiansDataType = Pick<
  EmployeeGuardianDatabaseRow,
  | "relationship"
  | "first_name"
  | "last_name"
  | "date_of_birth"
  | "gender"
  | "mobile_number"
  | "alternate_mobile_number"
  | "email"
  | "is_emergency_contact"
  | "address_same_as_employee"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
};

export type ImportEmployeeAttendanceDataType = Pick<
  EmployeeMonthlyAttendanceDatabaseRow,
  | "month"
  | "year"
  | "working_days"
  | "present_days"
  | "working_hours"
  | "overtime_hours"
  | "absent_days"
  | "paid_holidays"
  | "paid_leaves"
  | "casual_leaves"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
  employee_name?: string;
  uan_number?: string;
  sheet_name?: string;
  is_new_employee?: boolean;
};

export type ImportEmployeeAttendanceByPresentsDataType = {
  employee_code: string;
  present_days: number;
  month?: number;
  year?: number;
};

export async function getSiteIdByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const columns = ["id"] as const;

  const { data, error } = await supabase
    .from("employees")
    .select(
      `${columns.join(",")}, work_details!work_details_employee_id_fkey!inner(site_id)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .eq("id", employeeId)
    .single<
      Pick<EmployeeDatabaseRow, "id"> & {
        work_details: {
          site: SiteDatabaseRow["id"];
        };
      }
    >();

  if (error) {
    console.error("getSiteIdByEmployeeId Error", error);
  }

  return {
    data,
    error,
  };
}

export async function getActiveEmployeesByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = ["employee_code"] as const;

  const activeQuery = supabase
    .from("employees")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .in("is_active", [true]);

  const { data: activeEmployees, error: activeEmployeeError } =
    await activeQuery;

  if (activeEmployeeError) {
    console.error("getActiveEmployeesByCompanyId Error", activeEmployeeError);
  }

  const totalQuery = supabase
    .from("employees")
    .select(columns.join(","))
    .eq("company_id", companyId);

  const { data: totalEmployees, error: totalEmployeeError } = await totalQuery;

  if (totalEmployeeError) {
    console.error("getTotalEmployeesByCompanyId Error", totalEmployeeError);
  }

  const activeQueryBySites = supabase
    .from("employees")
    .select(
      `${columns.join(
        ",",
      )},work_details!work_details_employee_id_fkey!left(sites!left(id, name, projects!left(id, name)))`,
    )
    .eq("company_id", companyId)
    .eq("is_active", true);

  const { data: activeEmployeesBySites, error: activeEmployeeErrorBySites } =
    await activeQueryBySites;

  if (activeEmployeeErrorBySites) {
    console.error(
      "getActiveEmployeesByCompanyId Error",
      activeEmployeeErrorBySites,
    );
  }

  return {
    activeEmployees,
    activeEmployeeError,
    totalEmployees,
    totalEmployeeError,
    activeEmployeeErrorBySites,
    activeEmployeesBySites,
  };
}

export async function getAllEmployeeTablesData({
  supabase,
}: {
  supabase: TypedSupabaseClient;
}) {
  const [
    employees,
    employeeBankDetails,
    employeeStatutoryDetails,
    employeeAddressesDetails,
    employeeGuardiansDetails,
    employeeWorkDetails,
    projectDetails,
    siteDetails,
  ] = await Promise.all([
    supabase.from("employees").select("*").limit(HARDEST_QUERY_LIMIT),
    supabase
      .from("employee_bank_details")
      .select("*")
      .limit(HARDEST_QUERY_LIMIT),
    supabase
      .from("employee_statutory_details")
      .select("*")
      .limit(HARDEST_QUERY_LIMIT),
    supabase.from("employee_addresses").select("*").limit(HARDEST_QUERY_LIMIT),
    supabase.from("employee_guardians").select("*").limit(HARDEST_QUERY_LIMIT),
    supabase.from("work_details").select("*").limit(HARDEST_QUERY_LIMIT),
    supabase.from("projects").select("*").limit(HARDEST_QUERY_LIMIT),
    supabase.from("sites").select("*").limit(HARDEST_QUERY_LIMIT),
  ]);

  const error =
    employees.error ||
    employeeBankDetails.error ||
    employeeStatutoryDetails.error ||
    employeeAddressesDetails.error ||
    employeeGuardiansDetails.error ||
    employeeWorkDetails.error ||
    projectDetails.error ||
    siteDetails.error;

  if (error) {
    console.error("getAllEmployeeRelatedData Error:", error);
  }

  return {
    data: {
      employees: employees.data,
      employee_bank_details: employeeBankDetails.data,
      employee_statutory_details: employeeStatutoryDetails.data,
      employee_addresses: employeeAddressesDetails.data,
      employee_guardians: employeeGuardiansDetails.data,
      work_details: employeeWorkDetails.data,
      projects: projectDetails.data,
      site: siteDetails.data,
    },
    error,
  };
}

export async function getEmployeesBySiteIds({
  supabase,
  siteIds,
  params,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
  params: GetEmployeesByCompanyIdParams;
}) {
  const { sort, from, to, filters, searchQuery } = params;

  const {
    dob_start,
    dob_end,
    education,
    gender,
    status,
    assignment_type,
    position,
    skill_level,
    doj_start,
    doj_end,
    dol_start,
    dol_end,
    site,
  } = filters ?? {};

  const columns = [
    "id",
    "employee_code",
    "first_name",
    "middle_name",
    "last_name",
    "date_of_birth",
    "education",
    "primary_mobile_number",
    "is_active",
    "gender",
  ] as const;

  const query = supabase
    .from("employees")
    .select(
      `${columns.join(",")}, work_details!work_details_employee_id_fkey!inner(
        employee_id,
        assignment_type,
        skill_level,
        position,
        start_date,
        end_date,
        site_id,
        sites!inner(name, projects(id, name))
      )`,
      { count: "exact" },
    )
    .in("work_details.site_id", siteIds);

  if (sort) {
    const [column, direction] = sort;
    const baseCols = [
      "first_name",
      "last_name",
      "employee_code",
      "date_of_birth",
      "education",
      "gender",
      "is_active",
      "primary_mobile_number",
    ];
    if (column === "full_name") {
      query.order("first_name", { ascending: direction === "asc" });
    }
    if (baseCols.includes(column)) {
      query.order(column, { ascending: direction === "asc" });
    } else {
      query.order("created_at", { ascending: false });
    }
  } else {
    query.order("created_at", { ascending: false });
  }
  query.order("id", { ascending: true });

  if (searchQuery) {
    const searchTerms = searchQuery.split(" ").filter(Boolean);
    if (searchTerms.length > 0) {
      for (const term of searchTerms) {
        query.or(
          `first_name.ilike.%${term}%,middle_name.ilike.%${term}%,last_name.ilike.%${term}%,employee_code.ilike.%${term}%`,
        );
      }
    }
  }

  const dateFilters = [
    { field: "date_of_birth", start: dob_start, end: dob_end },
    {
      field: "work_details.start_date",
      start: doj_start,
      end: doj_end,
    },
    {
      field: "work_details.end_date",
      start: dol_start,
      end: dol_end,
    },
  ];

  for (const { field, start, end } of dateFilters) {
    if (start) query.gte(field, formatUTCDate(start));
    if (end) query.lte(field, formatUTCDate(end));
  }

  if (status) {
    query.eq("is_active", status === "active");
  }
  if (gender) {
    query.eq("gender", gender.toLowerCase());
  }
  if (education) {
    query.eq("education", education.toLowerCase());
  }
  if (assignment_type) {
    query.eq("work_details.assignment_type", assignment_type);
  }
  if (position) {
    query.eq("work_details.position", position);
  }
  if (site) {
    query.eq("work_details.sites.name", site);
  }
  if (skill_level) {
    query.eq("work_details.skill_level", skill_level);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("getEmployeesBySiteIds Error", error);
  }

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }

  return {
    data: Array.from(uniqueEmployeesMap.values()),
    meta: { count: count },
    error,
  };
}

export async function getActiveEmployeesBySiteIds({
  supabase,
  siteIds,
}: {
  supabase: TypedSupabaseClient;
  siteIds: string[];
}) {
  const columns = ["employee_code"] as const;

  const activeQuery = supabase
    .from("employees")
    .select(
      `${columns.join(",")},work_details!work_details_employee_id_fkey!inner(
        sites!inner(name, projects(id, name))
      )`,
    )
    .in("work_details.site_id", siteIds)
    .in("is_active", [true]);

  const { data: activeEmployees, error: activeEmployeeError } =
    await activeQuery;

  if (activeEmployeeError) {
    console.error("getActiveEmployeesByCompanyId Error", activeEmployeeError);
  }

  const totalQuery = supabase
    .from("employees")
    .select(
      `${columns.join(",")},work_details!work_details_employee_id_fkey!inner(
        sites!inner(name, projects(id, name))
      )`,
    )
    .in("work_details.site_id", siteIds);

  const { data: totalEmployees, error: totalEmployeeError } = await totalQuery;

  if (totalEmployeeError) {
    console.error("getTotalEmployeesByCompanyId Error", totalEmployeeError);
  }

  const activeQueryBySites = supabase
    .from("employees")
    .select(
      `${columns.join(
        ",",
      )},work_details!work_details_employee_id_fkey!left(sites!left(id, name, projects!left(id, name)))`,
    )
    .in("work_details.site_id", siteIds)
    .eq("is_active", true);

  const { data: activeEmployeesBySites, error: activeEmployeeErrorBySites } =
    await activeQueryBySites;

  if (activeEmployeeErrorBySites) {
    console.error(
      "getActiveEmployeesByCompanyId Error",
      activeEmployeeErrorBySites,
    );
  }

  const dedupByCode = (arr: any[] | null) => {
    if (!arr) return arr;
    const map = new Map<string, any>();
    for (const item of arr) {
      if (item.employee_code && !map.has(item.employee_code)) {
        map.set(item.employee_code, item);
      }
    }
    return Array.from(map.values());
  };

  return {
    activeEmployees: dedupByCode(activeEmployees),
    activeEmployeeError,
    totalEmployees: dedupByCode(totalEmployees),
    totalEmployeeError,
    activeEmployeeErrorBySites,
    activeEmployeesBySites: dedupByCode(activeEmployeesBySites),
  };
}

export async function getEmployeeWorkDetailsByEmployeeIdForOthersforexit({
  supabase,
  employeeId,
  month,
  year,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
  month: number;
  year: number;
}) {
  const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("work_details")
    .select(
      `
      employee_id,
      site_id,
      start_date,
      end_date,
      sites (
        id,
        name,
        projects (
          name
        )
      )
    `,
    )
    .eq("employee_id", employeeId)
    .lte("start_date", endOfMonth)
    .order("start_date", { ascending: false });

  if (error) {
    console.error("getEmployeeWorkDetailsByEmployeeId Error", error);
  }

  return { data: data ?? [], error };
}

export async function checkEmployeeNameConflictInSite({
  supabase,
  siteId,
  employeeId,
  firstName,
  middleName,
  lastName,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
  employeeId?: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
}) {
  const normalizeSet = (f: any, m: any, l: any) => {
    return [f, m, l]
      .map((v) =>
        String(v || "")
          .toLowerCase()
          .trim(),
      )
      .filter((v) => v !== "" && v !== "null")
      .sort()
      .join("");
  };

  const { data, error } = await supabase
    .from("work_details")
    .select(`
      site_id,
      employee_id,
      employees!inner(first_name, middle_name, last_name)
    `)
    .eq("site_id", siteId);

  if (error) return { hasConflict: false, error };

  const targetNameSet = normalizeSet(firstName, middleName, lastName);

  const hasConflict = data.some((existing: any) => {
    if (employeeId && existing.employee_id === employeeId) return false;

    const existingNameSet = normalizeSet(
      existing.employees?.first_name,
      existing.employees?.middle_name,
      existing.employees?.last_name,
    );

    return existingNameSet === targetNameSet;
  });

  return { hasConflict, error: null };
}

export async function getNextNameSuffixInSite({
  supabase,
  siteId,
  firstName,
  middleName,
  lastName,
}: {
  supabase: TypedSupabaseClient;
  siteId: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
}) {
  const normalize = (val: any) =>
    String(val || "")
      .trim()
      .toLowerCase();

  const { data, error } = await supabase
    .from("work_details")
    .select(`
      employees!inner(first_name, middle_name, last_name)
    `)
    .eq("site_id", siteId);

  if (error) return { suffix: 1, error };

  const baseFirstName = normalize(firstName);
  const baseMiddleName = normalize(middleName);
  const baseLastName = normalize(lastName);

  let maxSuffix = 0;

  data.forEach((existing: any) => {
    const ef = normalize(existing.employees?.first_name);
    const em = normalize(existing.employees?.middle_name);
    const el = normalize(existing.employees?.last_name);

    if (ef === baseFirstName && em === baseMiddleName) {
      if (el === baseLastName) {
        maxSuffix = Math.max(maxSuffix, 0);
      } else if (el.startsWith(baseLastName + " ")) {
        const suffixStr = el.substring(baseLastName.length + 1);
        const suffix = parseInt(suffixStr);
        if (!isNaN(suffix)) {
          maxSuffix = Math.max(maxSuffix, suffix);
        }
      }
    }
  });

  return { suffix: maxSuffix + 1, error: null };
}
