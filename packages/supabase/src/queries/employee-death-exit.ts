import type {
  EmployeeDatabaseRow,
  EmployeeDeathExitRow,
  TypedSupabaseClient,
} from "../types";

export type ImportDeathExitPayrollDataType = Pick<
  EmployeeDeathExitRow,
  | "rb_sheet"
  | "on_duty_esic"
  | "full_form"
  | "gratuity_form_l"
  | "gratuity_form_i"
  | "death_reason"
  | "date_of_death"
> & {
  employee_code: EmployeeDatabaseRow["employee_code"];
};

export type DeathExitsPayrollEntriesWithEmployee = Omit<
  ImportDeathExitPayrollDataType,
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
    | "id"
    | "note"
    | "gratuity_document"
    | "service_certificate"
    | "experience_letter"
    | "relieving_letter"
  >;
};
export type ImportDeathExitDataType = Pick<
  EmployeeDeathExitRow,
  | "rb_sheet"
  | "on_duty_esic"
  | "full_form"
  | "gratuity_form_l"
  | "gratuity_form_i"
  | "death_reason"
  | "date_of_death"
> & { employee_code: string };

export type DeathExitDataType = Pick<
  EmployeeDeathExitRow,
  "on_duty_esic" | "exit_id" | "death_reason" | "death_date"
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

export const getEmployeeDeathExitByExitId = async ({
  supabase,
  exitId,
}: {
  supabase: TypedSupabaseClient;
  exitId: string;
}) => {
  const result = await supabase
    .from("death_exit")
    .select(
      `
      exit_id,
      death_reason,
      date_of_death,
      on_duty_esic
      `,
    )
    .eq("exit_id", exitId)
    .maybeSingle();

  if (result.error) {
    console.error("getEmployeeDeathExitByExitId error 👉", result.error);
  }

  return result;
};
