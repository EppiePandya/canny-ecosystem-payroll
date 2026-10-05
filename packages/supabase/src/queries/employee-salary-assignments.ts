import type { TypedSupabaseClient } from "../types";

export async function getEmployeeSalaryAssignmentsByEmployeeId({
  supabase,
  employeeId,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
}) {
  const { data, error } = await supabase
    .from("employee_salary_assignment")
    .select(`
      *,
      payment_templates (
        name
      ),
      employee_salary_components (
        count
      )
    `)
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getEmployeeSalaryAssignmentsByEmployeeId Error", error);
  }

  return { data, error };
}

export async function getEmployeeSalaryAssignmentById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("employee_salary_assignment")
    .select(`
      *,
      employee_salary_components (
        *,
        payment_fields (
          *
        )
      ),
      payment_templates (
        id,
        name,
        payment_template_versions (
          id,
          monthly_ctc,
          basic_percent,
          effective_date,
          is_pro_rata,
          payment_template_components (
            *,
            payment_fields (*)
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
    `)
    .eq("id", id)
    .order("effective_date", {
      referencedTable: "payment_templates.payment_template_versions",
      ascending: false,
    })
    .limit(1, {
      referencedTable: "payment_templates.payment_template_versions",
    })
    .maybeSingle();

  if (error) {
    console.error("getEmployeeSalaryAssignmentById Error", error);
  }

  return { data, error };
}

export async function getLinkedEmployeesByTemplateId({
  supabase,
  templateId,
  params,
}: {
  supabase: TypedSupabaseClient;
  templateId: string;
  params: {
    from: number;
    to: number;
    searchQuery?: string;
  };
}) {
  const { from, to, searchQuery } = params;

  let query = supabase
    .from("employee_salary_assignment")
    .select(
      `
      use_payment_template,
      employees!inner (
        id,
        employee_code,
        first_name,
        middle_name,
        last_name
      )
    `,
      { count: "exact" },
    )
    .eq("template_id", templateId)
    .eq("use_payment_template", true);

  if (searchQuery) {
    const q = searchQuery;
    query = query.or(
      `employee_code.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
      { foreignTable: "employees" },
    );
  }

  const { data, count, error } = await query
    .range(from, to)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getLinkedEmployeesByTemplateId Error", error);
  }

  const rawEmployees = (data?.map((d: any) => d.employees) || []) as any[];
  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of rawEmployees) {
    if (emp && !uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }

  return {
    data: Array.from(uniqueEmployeesMap.values()),
    count,
    error,
  };
}

export async function getActiveSalaryAssignments({
  supabase,
  companyId,
  params,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  params: {
    to: number;
    from: number;
    sort?: [string, "asc" | "desc"];
    searchQuery?: string;
    filters?: any;
  };
}) {
  const { sort, from, to, filters, searchQuery } = params;
  const today = new Date().toISOString().split("T")[0];

  const { status, project, site, assignment_type, position, skill_level } =
    filters ?? {};

  const foreignFilters =
    project || site || assignment_type || position || skill_level;

  const query = supabase
    .from("employees")
    .select(
      `
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      is_active,
      work_details!work_details_employee_id_fkey!${
        foreignFilters ? "inner" : "left"
      }(
        employee_id, assignment_type, skill_level, position, start_date, end_date, project_id,
        projects!${project ? "inner" : "left"}(id, name),
        sites!${site ? "inner" : "left"}(id, name)
      ),
      employee_salary_assignment!inner(
        id,
        effective_date,
        monthly_ctc,
        basic_percent,
        basic_amount,
        is_pro_rata,
        use_payment_template,
        payment_templates(id, name)
      )
      `,
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .lte("employee_salary_assignment.effective_date", today);

  if (sort) {
    const [column, direction] = sort;
    if (["first_name", "employee_code"].includes(column)) {
      query.order(column, { ascending: direction === "asc" });
    }
  } else {
    query.order("created_at", { ascending: false });
  }

  query.order("effective_date", {
    foreignTable: "employee_salary_assignment",
    ascending: false,
  });
  query.limit(1, { foreignTable: "employee_salary_assignment" });
  query.order("start_date", { foreignTable: "work_details", ascending: false });
  query.limit(1, { foreignTable: "work_details" });

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

  if (status) {
    query.eq("is_active", status === "active");
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
    console.error("getActiveSalaryAssignments Error", error);
  }

  const uniqueEmployeesMap = new Map<string, any>();
  for (const emp of data || []) {
    if (!uniqueEmployeesMap.has(emp.id)) {
      uniqueEmployeesMap.set(emp.id, emp);
    }
  }

  return {
    data: Array.from(uniqueEmployeesMap.values()),
    meta: { count },
    error,
  };
}
