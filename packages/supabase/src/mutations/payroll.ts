import type {
  PayrollDatabaseInsert,
  PayrollDatabaseUpdate,
  PayrollFieldsDatabaseInsert,
  PayrollFieldsDatabaseRow,
  PayrollFieldsDatabaseUpdate,
  SalaryEntriesDatabaseInsert,
  SalaryEntriesDatabaseUpdate,
  SalaryFieldValuesDatabaseInsert,
  SalaryFieldValuesDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";
import {
  getPayrollById,
  getPayrollFieldByPayrollId,
  getSalaryEntriesByPayrollAndEmployeeId,
  getSalaryEntriesByPayrollId,
} from "../queries";
import {
  calculateNetAmountAfterEntryCreated,
  calculateSalaryBreakdown,
  calculateSalaryTotalNetAmount,
  convertToNull,
  defaultMonth,
  defaultYear,
  isGoodStatus,
  roundValue,
} from "@canny_ecosystem/utils";

// Salary Payroll
export async function createSalaryPayroll({
  supabase,
  data,
  companyId,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: {
    title: string;
    site?: string | null;
    project?: string | null;
    run_date?: string;
    rawData: any[];
    status?: "pending" | "approved" | "submitted";
    type: "salary";
    salaryEntryData: Omit<SalaryEntriesDatabaseInsert, "payroll_id">[];
    totalEmployees: number;
    totalNetAmount: number;
    month: number;
    year: number;
    payrollFieldsData: PayrollFieldsDatabaseRow[];
  };
  companyId: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const {
    data: payrollData,
    status: payrollStatus,
    error: payrollError,
  } = await supabase
    .from("payroll")
    .insert({
      title: data.title,
      month: data.month,
      year: data.year,
      site_id: data?.site?.length ? data.site : null,
      project_id: data?.project?.length ? data.project : null,
      run_date: data.run_date ?? null,
      status: data?.status ?? "pending",
      total_employees: data.totalEmployees,
      total_net_amount: data.totalNetAmount,
      company_id: companyId,
    })
    .select("id,total_employees,total_net_amount")
    .single();

  if (!payrollData?.id || payrollError) {
    console.error("createSalaryPayroll payroll error", payrollError);
    return { status: payrollStatus, error: payrollError };
  }

  const finalPayrollFields = data.payrollFieldsData?.map((value) => ({
    ...value,
    payroll_id: payrollData.id,
  }));

  const {
    data: payrollFieldsData,
    status: payrollFieldsStatus,
    error: payrollFieldsError,
  } = await createPayrollFields({
    supabase,
    data: finalPayrollFields as unknown as PayrollFieldsDatabaseInsert[],
    onConflict: "name, payroll_id",
  });

  if (!payrollFieldsData || payrollFieldsError) {
    console.error("createPayrollFields payroll error", payrollFieldsError);
    return { status: payrollFieldsStatus, error: payrollFieldsError };
  }

  const salaryPayrollEntries = data.salaryEntryData?.map((value) => ({
    ...value,
    payroll_id: payrollData.id,
  }));

  const {
    data: salaryEntriesData,
    status: salaryEntriesStatus,
    error: salaryEntriesError,
  } = await createSalaryEntries({
    supabase,
    data: salaryPayrollEntries,
    onConflict: "monthly_attendance_id, payroll_id",
    bypassAuth,
  });

  if (salaryEntriesError || !salaryEntriesData) {
    console.error("createPayrollFields payroll error", salaryEntriesError);
    return { status: salaryEntriesStatus, error: salaryEntriesError };
  }

  if (salaryEntriesData.length === 0) {
    await deletePayroll({ id: payrollData.id, supabase });

    return {
      status: "error",
      message: "Salary of the employees for this month already exists",
      error: "Salary Entries of this month already exists",
    };
  }

  let skipped = 0;
  if (salaryEntriesData.length < data.salaryEntryData.length) {
    skipped = data.salaryEntryData.length - salaryEntriesData.length;
    const newTotalEmployees = payrollData.total_employees! - skipped;

    const unSkippedEmployeeIds = salaryEntriesData.map(
      (entry) => entry.monthly_attendance.employee_id,
    );

    const unSkippedRawData = data.rawData.filter((entry) =>
      unSkippedEmployeeIds.includes(entry.employee_id),
    );

    const newTotalNetAmount = calculateSalaryTotalNetAmount(unSkippedRawData);
    updatePayrollById({
      payrollId: payrollData.id,
      supabase,
      data: {
        total_employees: newTotalEmployees,
        total_net_amount: newTotalNetAmount,
      },
    });
  }
  const finalPayrollFieldEntries = [];

  const payrollFieldMap: { [key: string]: (typeof payrollFieldsData)[0] } = {};

  for (const field of payrollFieldsData) {
    const normalizedName = field.name.trim().toUpperCase();
    payrollFieldMap[normalizedName] = field;
  }

  for (const record of data.rawData) {
    const employeeId = record.employee_id;

    const salaryEntry = salaryEntriesData!.find(
      (entry) => entry.monthly_attendance?.employee_id === employeeId,
    );

    if (!salaryEntry) continue;

    for (const [normalizedKey, matchedField] of Object.entries(
      payrollFieldMap,
    )) {
      const rawKey = Object.keys(record).find(
        (k) => k.trim().toUpperCase() === normalizedKey,
      );

      const rawValue = rawKey ? record[rawKey] : undefined;

      let amount = 0;
      let consider_for_epf = false;

      if (
        rawValue &&
        typeof rawValue === "object" &&
        "amount" in rawValue &&
        typeof (rawValue as { amount?: unknown }).amount === "number"
      ) {
        amount = (rawValue as { amount: number }).amount;
        consider_for_epf = !!(rawValue as { consider_for_epf?: boolean })
          .consider_for_epf;
      }

      finalPayrollFieldEntries.push({
        payroll_field_id: matchedField.id,
        amount,
        salary_entry_id: salaryEntry.id,
        consider_for_epf,
      });
    }
  }

  const { status: salaryFieldEntriesStatus, error: salaryFieldEntriesError } =
    await createSalaryFieldValues({
      supabase,
      data: finalPayrollFieldEntries,
      bypassAuth,
    });

  if (isGoodStatus(salaryFieldEntriesStatus)) {
    return {
      status: "success",
      data: payrollData,
      message:
        skipped === 0
          ? "Salary entries created successfully"
          : `Salary entries created successfully with ${skipped} skipped entries`,
      error: null,
    };
  }

  return {
    status: payrollStatus ?? salaryEntriesStatus ?? salaryFieldEntriesStatus,
    data: payrollData,
    error: payrollError ?? salaryEntriesError ?? salaryFieldEntriesError,
    message: null,
  };
}

export async function createSalaryPayrollByDepartment({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: {
    salaryEntryData: Omit<SalaryEntriesDatabaseInsert, "payroll_id">[];
    totalEmployees: number;
    totalNetAmount: number;
    payrollId?: string;
    oldTotalEmployees: number;
    oldTotalNetAmount: number;
    rawData: any[];
    payrollFieldsData: PayrollFieldsDatabaseRow[];
  };
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const { status: payrollStatus, error: payrollError } = await supabase
    .from("payroll")
    .update({
      total_employees: data.totalEmployees,
      total_net_amount: data.totalNetAmount,
    })
    .eq("id", data.payrollId!);

  if (payrollError) {
    await supabase
      .from("payroll")
      .update({
        total_employees: data.oldTotalEmployees,
        total_net_amount: data.oldTotalNetAmount,
      })
      .eq("id", data.payrollId!);
    console.error(
      "createSalaryPayrollByDepartment payroll error",
      payrollError,
    );
    return { status: payrollStatus, error: payrollError };
  }
  const finalPayrollFields = data.payrollFieldsData?.map((value) => ({
    ...value,
    payroll_id: data.payrollId,
  }));

  let payrollFieldsData = [];

  const {
    data: payrollFields,
    status: payrollFieldsStatus,
    error: payrollFieldsError,
  } = await createPayrollFields({
    supabase,
    data: finalPayrollFields as unknown as PayrollFieldsDatabaseInsert[],
    onConflict: "name, payroll_id",
  });

  payrollFieldsData = payrollFields ?? [];

  if (!payrollFieldsData || payrollFieldsError) {
    console.error("createPayrollFields payroll error", payrollFieldsError);
    return { status: payrollFieldsStatus, error: payrollFieldsError };
  }
  if (finalPayrollFields.length !== payrollFieldsData.length) {
    const { data: defaultFields } = await getPayrollFieldByPayrollId({
      payrollId: data.payrollId!,
      supabase,
    });
    payrollFieldsData = [...payrollFieldsData, ...(defaultFields ?? [])];
  }

  const salaryPayrollEntries = data.salaryEntryData?.map((value) => ({
    ...value,
    payroll_id: data.payrollId!,
  }));

  const {
    data: salaryEntriesData,
    status: salaryEntriesStatus,
    error: salaryEntriesError,
  } = await createSalaryEntries({
    supabase,
    data: salaryPayrollEntries,
    onConflict: "monthly_attendance_id, payroll_id",
    bypassAuth,
  });

  if (salaryEntriesError || !salaryEntriesData) {
    console.error("createPayrollFields payroll error", salaryEntriesError);
    return { status: salaryEntriesStatus, error: salaryEntriesError };
  }
  if (salaryEntriesData.length === 0) {
    await supabase
      .from("payroll")
      .update({
        total_employees: data.oldTotalEmployees,
        total_net_amount: data.oldTotalNetAmount,
      })
      .eq("id", data.payrollId!);

    return {
      status: "error",
      message: "Salary of the employees for this month already exists",
      error: "Salary Entries of this month already exists",
    };
  }

  const finalPayrollFieldEntries = [];

  const payrollFieldMap: { [key: string]: (typeof payrollFieldsData)[0] } = {};

  for (const field of payrollFieldsData) {
    const normalizedName = field.name.trim().toUpperCase();
    payrollFieldMap[normalizedName] = field;
  }

  for (const record of data.rawData) {
    const employeeId = record.employee_id;

    const salaryEntry = salaryEntriesData!.find(
      (entry) => entry.monthly_attendance?.employee_id === employeeId,
    );

    if (!salaryEntry) continue;

    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.trim().toUpperCase();
      const matchedField = payrollFieldMap[normalizedKey];

      if (
        matchedField &&
        value &&
        typeof value === "object" &&
        value !== null &&
        "amount" in value &&
        typeof (value as { amount?: unknown }).amount === "number"
      ) {
        finalPayrollFieldEntries.push({
          payroll_field_id: matchedField.id,
          amount: (value as { amount: number }).amount,
          salary_entry_id: salaryEntry.id,
          consider_for_epf: !!(value as { consider_for_epf?: boolean })
            .consider_for_epf,
        });
      }
    }
  }

  const { status: salaryFieldEntriesStatus, error: salaryFieldEntriesError } =
    await createSalaryFieldValues({
      supabase,
      data: finalPayrollFieldEntries,
      bypassAuth,
    });

  if (isGoodStatus(salaryFieldEntriesStatus)) {
    if (data.payrollId) {
      await recalculatePayrollTotals({ supabase, payrollId: data.payrollId });
    }
    return {
      status: "success",
      message: "Salary entries created successfully",
      error: null,
    };
  }

  return {
    status: payrollStatus ?? salaryEntriesStatus ?? salaryFieldEntriesStatus,
    error: payrollError ?? salaryEntriesError ?? salaryFieldEntriesError,
    message: null,
  };
}
export async function deletePayroll({
  supabase,
  id,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  id: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }
  const { data: payroll } = await getPayrollById({ supabase, payrollId: id });

  const { data } = await getSalaryEntriesByPayrollId({
    payrollId: id,
    supabase,
    month: payroll?.month ?? defaultMonth,
    year: payroll?.year ?? defaultYear,
    companyId: payroll?.company_id ?? "",
  });

  const monthlyAttendanceIds = data
    ?.map((dat) => dat.monthly_attendance_id || (dat.monthly_attendance as any)?.id)
    .filter((id): id is string => Boolean(id));

  const { error, status } = await supabase
    .from("payroll")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deletePayroll Error:", error);
  }
  if (isGoodStatus(status) && monthlyAttendanceIds && monthlyAttendanceIds.length > 0) {
    await supabase
      .from("monthly_attendance")
      .delete()
      .in("id", monthlyAttendanceIds);
  }
  return { status, error };
}

export async function createSalaryEntries({
  supabase,
  data,
  onConflict,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: SalaryEntriesDatabaseInsert[];
  onConflict?: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }
  const uniqueMap = new Map<string, any>();
  for (const item of data) {
    const key = item.id
      ? item.id
      : `${item.payroll_id}-${item.monthly_attendance_id}`;
    uniqueMap.set(key, item);
  }
  const deduplicatedData = Array.from(uniqueMap.values());

  const {
    data: salaryEntriesData,
    status,
    error,
  } = await supabase
    .from("salary_entries")
    .upsert(deduplicatedData, {
      ignoreDuplicates: false,
      onConflict,
    })
    .select("id, monthly_attendance(employee_id)");

  if (error) {
    console.error("createSalaryEntries Error", error);
  }

  return { data: salaryEntriesData, status, error };
}

export async function deleteSalaryEntriesFromPayrollAndEmployeeId({
  supabase,
  payrollId,
  employeeId,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
  employeeId: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const { data: salaryEntriesData } =
    await getSalaryEntriesByPayrollAndEmployeeId({
      supabase,
      employeeId,
      payrollId,
    });

  let targetSalaryEntryId: string | undefined =
    salaryEntriesData?.salary_entries?.id;

  if (!targetSalaryEntryId) {
    const { data: directEntry } = await supabase
      .from("salary_entries")
      .select("id, monthly_attendance!inner(employee_id)")
      .eq("payroll_id", payrollId)
      .eq("monthly_attendance.employee_id", employeeId)
      .maybeSingle();

    if (directEntry?.id) {
      targetSalaryEntryId = directEntry.id;
    }
  }

  if (targetSalaryEntryId) {
    const { error, status } = await supabase
      .from("salary_entries")
      .delete()
      .eq("id", targetSalaryEntryId);

    if (isGoodStatus(status) || !error) {
      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });
      return { status: 200, error: null };
    }

    if (error) {
      console.error(
        "deleteSalaryEntriesFromPayrollAndEmployeeId Error:",
        error,
      );
    }

    return { status, error };
  }

  // If entry was not found, it is already deleted. Recalculate totals and return 200 success.
  await recalculatePayrollTotals({
    supabase,
    payrollId,
  });

  return { status: 200, error: null };
}

export async function updatePayroll({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: PayrollDatabaseUpdate;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("payroll")
    .update(updateData)
    .eq("id", data.id!)
    .select("id, status")
    .single();

  if (error) {
    console.error("updatePayroll Error:", error);
  }

  return { status, error };
}

//////////////////////////////////////////////////////////////////

export async function createPayroll({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: PayrollDatabaseInsert;
}) {
  const { error, status } = await supabase.from("payroll").insert(data);
  if (error) {
    console.error("createPayroll Error:", error);
  }

  return { status, error };
}

export async function updatePayrollById({
  payrollId,
  supabase,
  data,
}: {
  payrollId: string;
  supabase: TypedSupabaseClient;
  data: PayrollDatabaseUpdate;
}) {
  const { error, status } = await supabase
    .from("payroll")
    .update(data)
    .eq("id", payrollId ?? "")
    .single();

  if (error) {
    console.error("updatePayrollById Error:", error);
  }

  return { error, status };
}

export async function recalculatePayrollTotals({
  supabase,
  payrollId,
}: {
  supabase: TypedSupabaseClient;
  payrollId: string;
}) {
  try {
    // 1. Get all salary entries for this payroll (to count employees)
    const { data: entries, error: entriesError } = await supabase
      .from("salary_entries")
      .select("id")
      .eq("payroll_id", payrollId);

    if (entriesError || !entries) {
      console.error("recalculatePayrollTotals entriesError:", entriesError);
      return { totalNetAmount: 0, totalEmployees: 0 };
    }

    if (entries.length === 0) {
      await supabase
        .from("payroll")
        .update({
          total_employees: 0,
          total_net_amount: 0,
        })
        .eq("id", payrollId);

      return { totalNetAmount: 0, totalEmployees: 0 };
    }

    const entryIds = entries.map((e) => e.id).filter(Boolean);

    // 2. Get all field values for this payroll
    const { data: fieldValues, error: valuesError } = await supabase
      .from("salary_field_values")
      .select(`
        amount,
        payroll_fields!inner (
          name,
          type
        )
      `)
      .in("salary_entry_id", entryIds);

    if (valuesError) {
      console.error("recalculatePayrollTotals valuesError:", valuesError);
    }

    let totalNetAmount = 0;

    if (fieldValues) {
      const cleanUpper = (s: string) =>
        String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

      const isNetPayName = (name: string) => {
        const n = cleanUpper(name);
        return (
          n === "NET" ||
          n === "NETPAY" ||
          n === "NETSALARY" ||
          n === "NETAMOUNT" ||
          n === "NETPAYABLE" ||
          n === "NETPAYABLEAMOUNT"
        );
      };

      const hasNetPayField = fieldValues.some((fv: any) =>
        isNetPayName(fv.payroll_fields?.name || ""),
      );

      if (hasNetPayField) {
        for (const fv of fieldValues) {
          if (isNetPayName(fv.payroll_fields?.name || "")) {
            totalNetAmount += Number(fv.amount) || 0;
          }
        }
      } else {
        const hasIndividualEarnings = fieldValues.some((fv: any) => {
          const n = cleanUpper(fv.payroll_fields?.name || "");
          const t = (fv.payroll_fields?.type || "").toLowerCase();
          return t === "earning" && !["ACTUALWAGES", "ACTUALWAGE"].includes(n);
        });

        for (const fv of fieldValues) {
          const amount = Number(fv.amount) || 0;
          const type = fv.payroll_fields?.type;
          const n = cleanUpper(fv.payroll_fields?.name || "");

          if (type === "earning") {
            if (
              (n === "ACTUALWAGES" || n === "ACTUALWAGE") &&
              hasIndividualEarnings
            ) {
              // skip subtotal
            } else {
              totalNetAmount += amount;
            }
          } else if (type === "deduction") {
            if (
              n === "TOTALDEDUCTIONS" ||
              n === "TOTALDED" ||
              n === "TOTALDEDUCTION"
            ) {
              // skip subtotal
            } else {
              totalNetAmount -= amount;
            }
          }
        }
      }
    }

    // 3. Update the payroll record
    const { error: updateError } = await supabase
      .from("payroll")
      .update({
        total_employees: entries.length,
        total_net_amount: totalNetAmount,
      })
      .eq("id", payrollId);

    if (updateError) {
      console.error("recalculatePayrollTotals updateError:", updateError);
    }

    return { totalNetAmount, totalEmployees: entries.length };
  } catch (err) {
    console.error("recalculatePayrollTotals unexpected error:", err);
    return { totalNetAmount: 0, totalEmployees: 0 };
  }
}

export async function createPayrollFields({
  supabase,
  data,
  onConflict,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: PayrollFieldsDatabaseInsert[];
  onConflict?: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const {
    data: payrollFieldData,
    status,
    error,
  } = await supabase
    .from("payroll_fields")
    .upsert(data, {
      ignoreDuplicates: true,
      onConflict,
    })
    .select("id, name");

  if (error) {
    console.error("createPayrollFields Error", error);
  }

  return { data: payrollFieldData, status, error };
}

export async function createSalaryFieldValues({
  supabase,
  data,
  onConflict = "salary_entry_id, payroll_field_id",
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: SalaryFieldValuesDatabaseInsert[];
  onConflict?: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const roundedData = data.map((item) => ({
    ...item,
    amount: item.amount != null ? roundValue(Number(item.amount)) : item.amount,
  }));

  const uniqueMap = new Map<string, (typeof roundedData)[0]>();
  for (const item of roundedData) {
    const key = `${item.salary_entry_id}-${item.payroll_field_id}`;
    uniqueMap.set(key, item);
  }
  const deduplicatedData = Array.from(uniqueMap.values());

  const { status, error } = await supabase
    .from("salary_field_values")
    .upsert(deduplicatedData, { onConflict });

  if (error) {
    console.error("createSalaryFieldValues Error", error);
  }

  return { status, error };
}

export async function updateSalaryFieldValuesById({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: SalaryFieldValuesDatabaseUpdate;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      status: 400,
      error: "No email found",
    };
  }

  const updateData = convertToNull(data);
  if (updateData.amount != null) {
    updateData.amount = roundValue(Number(updateData.amount));
  }

  const { error, status } = await supabase
    .from("salary_field_values")
    .update(updateData)
    .eq("id", data.id ?? "")
    .single();

  if (error) console.error("updateSalaryFieldValuesById Error:", error);

  return { error, status };
}

export async function updatePayrollFieldsById({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: PayrollFieldsDatabaseUpdate;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      status: 400,
      error: "No email found",
    };
  }

  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("payroll_fields")
    .update(updateData)
    .eq("id", data.id ?? "")
    .single();

  if (error) console.error("updatePayrollFieldsById Error:", error);

  return { error, status };
}

export async function updateSalaryEntryById({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: SalaryEntriesDatabaseUpdate;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      status: 400,
      error: "No email found",
    };
  }

  const { error, status } = await supabase
    .from("salary_entries")
    .update(data)
    .eq("id", data.id!)
    .single();

  if (error) console.error("updateSalaryEntryById Error:", error);

  return { error, status };
}

export async function deletePayrollFieldById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { error, status } = await supabase
    .from("payroll_fields")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deletePayrollFieldById Error:", error);
  }

  return { status, error };
}

type UpdateWorkingDaysPayload = {
  employee_id: string;
  month: number;
  year: number;
  working_days: number;
};

export const updateWorkingDaysBulk = async ({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: UpdateWorkingDaysPayload[];
}) => {
  try {
    const { data: updatedRows, error } = await supabase
      .from("monthly_attendance")
      .upsert(
        data.map((row) => ({
          employee_id: row.employee_id,
          month: row.month,
          year: row.year,
          working_days: row.working_days,
        })),
        {
          onConflict: "employee_id,month,year",
        },
      )
      .select("id");

    if (error) throw error;

    return {
      success: true,
      attendanceIds: updatedRows?.map((r) => r.id) || [],
    };
  } catch (error) {
    console.error("updateWorkingDaysBulk error:", error);
    return { success: false, error };
  }
};

export async function recalculateAndPersistSalaryEntriesForAttendances({
  supabase,
  attendanceIds,
  payrollId,
  preserveFieldIds,
}: {
  supabase: TypedSupabaseClient;
  attendanceIds: string[];
  payrollId: string;
  preserveFieldIds?: Set<string>;
}) {
  const { data: payrollData } = await supabase
    .from("payroll")
    .select("company_id, month, year")
    .eq("id", payrollId)
    .single();

  const companyId = payrollData?.company_id;
  const payrollMonth = payrollData?.month;
  const payrollYear = payrollData?.year;

  const { data: holidayConfig } = companyId
    ? await supabase
      .from("holiday_config")
      .select("type, multiplier, working_days, use_attendance_working_days")
      .eq("company_id", companyId)
    : { data: [] };

  const { data: attendances, error: fetchError } = await (supabase as any)
    .from("monthly_attendance")
    .select(`
      *,
      employee:employees (
        id,
        salary_assignment:employee_salary_assignment (
          *,
            payment_templates (
              *,
              payment_template_versions (
                monthly_ctc,
                basic_percent,
                is_pro_rata,
                effective_date,
                payment_template_components (*, payment_fields(*)),
                payment_statutory_components (
                  pf:employee_provident_fund (*),
                  esi:employee_state_insurance (*),
                  pt:professional_tax (*),
                  bonus:statutory_bonus (*),
                  lwf:labour_welfare_fund (*)
                )
              )
            ),
          employee_salary_components (*, payment_fields(*)),
          employee_salary_statutory_components (
            pf:employee_provident_fund (*),
            esi:employee_state_insurance (*),
            pt:professional_tax (*),
            bonus:statutory_bonus (*),
            lwf:labour_welfare_fund (*)
          )
        )
      )
    `)
    .in("id", attendanceIds);

  if (fetchError) throw fetchError;

  const { data: existingFields } = await supabase
    .from("payroll_fields")
    .select("id, name")
    .eq("payroll_id", payrollId);

  const fieldMap = new Map(
    existingFields?.map((f) => [f.name.toLowerCase(), f.id]),
  );

  for (const attendance of attendances) {
    const employee = (attendance as any).employee;
    const salaryAssignments = employee?.salary_assignment;

    const payrollLastDate =
      payrollYear && payrollMonth
        ? new Date(payrollYear, payrollMonth, 0)
        : null;

    const payrollFirstDate =
      payrollYear && payrollMonth
        ? new Date(payrollYear, payrollMonth - 1, 1)
        : null;

    const parseDateString = (dateStr: string) => {
      const parts = dateStr.split("-");
      if (parts.length !== 3) return new Date(dateStr);
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      return new Date(y, m - 1, d);
    };

    const assignments = Array.isArray(salaryAssignments)
      ? salaryAssignments
      : salaryAssignments
        ? [salaryAssignments]
        : [];

    const validAssignments = payrollLastDate
      ? assignments.filter((a: any) => {
        if (!a.effective_date) return true;
        return parseDateString(a.effective_date) <= payrollLastDate;
      })
      : assignments;

    const assignment =
      validAssignments.sort(
        (a: any, b: any) =>
          new Date(b.effective_date).getTime() -
          new Date(a.effective_date).getTime(),
      )[0] || assignments[0];

    if (!assignment) continue;

    const hasCustomComponents =
      Array.isArray(assignment.employee_salary_components) &&
      assignment.employee_salary_components.length > 0;

    const useTemplateVal = assignment.use_payment_template && !hasCustomComponents;

    let templateVersion: any = null;
    if (useTemplateVal) {
      const templateVersions =
        assignment.payment_templates?.payment_template_versions || [];

      const validVersions = payrollFirstDate
        ? templateVersions.filter((v: any) => {
          if (!v.effective_date) return true;
          return parseDateString(v.effective_date) <= payrollFirstDate;
        })
        : templateVersions;

      if (validVersions.length === 0) continue;

      templateVersion = validVersions.sort(
        (a: any, b: any) =>
          new Date(b.effective_date).getTime() -
          new Date(a.effective_date).getTime(),
      )[0];

      if (!templateVersion) continue;
    }

    const { data: existingSalaryEntry } = await supabase
      .from("salary_entries")
      .select("id, monthly_ctc")
      .eq("payroll_id", payrollId)
      .eq("monthly_attendance_id", attendance.id)
      .maybeSingle();

    const customMonthlyCtc = existingSalaryEntry?.monthly_ctc;

    const monthlyCtc =
      customMonthlyCtc !== null && customMonthlyCtc !== undefined
        ? Number(customMonthlyCtc)
        : useTemplateVal
          ? Number(templateVersion?.monthly_ctc || 0)
          : Number(assignment.monthly_ctc || 0);

    const basicPercent = useTemplateVal
      ? Number(templateVersion?.basic_percent || 0)
      : Number(assignment.basic_percent || 0);

    const isProRata = useTemplateVal
      ? templateVersion?.is_pro_rata
      : assignment.is_pro_rata;

    const resolvedComponents = useTemplateVal
      ? templateVersion?.payment_template_components
      : assignment.employee_salary_components;

    const { data: existingFieldValues } = existingSalaryEntry?.id
      ? await supabase
          .from("salary_field_values")
          .select("payroll_field_id, amount, payroll_fields(name)")
          .eq("salary_entry_id", existingSalaryEntry.id)
      : { data: [] };

    const existingFieldMap = new Map<string, number>();
    if (existingFieldValues) {
      for (const efv of existingFieldValues) {
        const fieldName = (efv.payroll_fields as any)?.name?.toLowerCase() || "";
        const fieldId = efv.payroll_field_id;
        const amount = Number(efv.amount || 0);
        if (fieldName) {
          existingFieldMap.set(fieldName, amount);
        }
        if (fieldId) {
          existingFieldMap.set(fieldId, amount);
        }
      }
    }

    const componentsWithActualAmounts = (resolvedComponents || []).map((c: any) => {
      const fieldId = c.payment_field_id || c.payment_fields?.id || c.id;
      const fieldName = (c.payment_fields?.name || c.name || "").toLowerCase();
      
      let amount = c.amount;
      if (fieldId && existingFieldMap.has(fieldId)) {
        amount = existingFieldMap.get(fieldId)!;
      } else if (fieldName && existingFieldMap.has(fieldName)) {
        amount = existingFieldMap.get(fieldName)!;
      }
      
      return {
        ...c,
        amount,
      };
    });

    const rawStatutory = useTemplateVal
      ? templateVersion?.payment_statutory_components
      : assignment.employee_salary_statutory_components;

    const statutory: any = {};
    const resolveStatutory = (s: any) => {
      if (!s) return;
      if (s.pf) statutory.pf = Array.isArray(s.pf) ? s.pf[0] : s.pf;
      if (s.esi) statutory.esi = Array.isArray(s.esi) ? s.esi[0] : s.esi;
      if (s.pt) statutory.pt = Array.isArray(s.pt) ? s.pt[0] : s.pt;
      if (s.bonus)
        statutory.bonus = Array.isArray(s.bonus) ? s.bonus[0] : s.bonus;
      if (s.lwf) statutory.lwf = Array.isArray(s.lwf) ? s.lwf[0] : s.lwf;
    };
    if (Array.isArray(rawStatutory)) {
      for (const s of rawStatutory) resolveStatutory(s);
    } else {
      resolveStatutory(rawStatutory);
    }

    const payableDays = attendance.present_days || 0;

    const basicCompField = componentsWithActualAmounts?.find((c: any) => {
      const f = c.payment_fields || c;
      const n = (f?.name || f?.display_name || "").toLowerCase().trim();
      return n === "basic" || n === "basic pay" || n === "basic salary";
    });
    const basicFormulaToUse =
      assignment.basic_formula ||
      (useTemplateVal ? templateVersion?.basic_formula : null) ||
      basicCompField?.payment_fields?.formula ||
      null;

    const explicitBasicAmount = useTemplateVal
      ? Number(templateVersion?.basic_amount || assignment?.basic_amount || 0)
      : Number(assignment?.basic_amount || templateVersion?.basic_amount || 0);

    const basicCompAmt = basicCompField
      ? Number(basicCompField.amount ?? basicCompField.value ?? 0)
      : 0;

    const persistedBasicVal =
      existingFieldMap.get("basic") ??
      existingFieldMap.get("basic pay") ??
      existingFieldMap.get("basic salary");

    let basicAmountToUse = explicitBasicAmount || basicCompAmt;
    if (!basicAmountToUse && persistedBasicVal !== undefined && persistedBasicVal > 0) {
      if (isProRata && payableDays > 0 && (attendance.working_days || 0) > 0) {
        basicAmountToUse = Math.round(
          (persistedBasicVal / payableDays) * (attendance.working_days || 0),
        );
      } else {
        basicAmountToUse = persistedBasicVal;
      }
    }

    const calculation = calculateSalaryBreakdown({
      monthlyCtc,
      basicPercent,
      basicAmount: basicAmountToUse,
      basicFormula: basicFormulaToUse,
      calculationDirection:
        assignment.calculation_direction ||
        templateVersion?.calculation_direction ||
        null,
      isProRata: !!isProRata,
      payableDays,
      workingDays: attendance.working_days || 0,
      overtimeHours: attendance.overtime_hours || 0,
      holidayConfig: (holidayConfig as any) || [],
      attendance: {
        paidHolidays: attendance.paid_holidays || 0,
        paidLeaves: attendance.paid_leaves || 0,
        casualLeaves: attendance.casual_leaves || 0,
        overtimeHours: attendance.overtime_hours || 0,
      },
      components: componentsWithActualAmounts,
      statutory,
      month: attendance.month || data.month,
    });

    const { data: salaryEntry, error: entryError } = await supabase
      .from("salary_entries")
      .upsert(
        {
          payroll_id: payrollId,
          monthly_attendance_id: attendance.id,
        },
        { onConflict: "payroll_id,monthly_attendance_id" },
      )
      .select()
      .single();

    if (entryError) {
      console.error("Error upserting salary entry:", entryError);
      continue;
    }

    const { data: existingValues } = await supabase
      .from("salary_field_values")
      .select("payroll_field_id, amount")
      .eq("salary_entry_id", salaryEntry.id);

    const existingValueMap = new Map<string, number>(
      existingValues?.map((sfv) => [sfv.payroll_field_id, Number(sfv.amount)]) || []
    );

    const allCalculatedFields = [
      ...calculation.earnings.map((e) => ({
        name: e.name,
        amount: e.amount,
        type: "earning",
      })),
      ...calculation.deductions.map((d) => ({
        name: d.name,
        amount: d.amount,
        type: "deduction",
      })),
    ];

    const fieldValuesToUpsert = [];

    for (const field of allCalculatedFields) {
      let fieldId = fieldMap.get(field.name.toLowerCase());

      if (!fieldId) {
        const { data: newField, error: fieldError } = await supabase
          .from("payroll_fields")
          .insert({
            payroll_id: payrollId,
            name: field.name,
            type: field.type,
          })
          .select()
          .maybeSingle();

        if (fieldError || !newField) continue;

        fieldId = newField.id;
        fieldMap.set(field.name.toLowerCase(), fieldId);
      }

      if (preserveFieldIds?.has(fieldId)) {
        continue;
      }

      let amountToSave = field.amount;
      if (amountToSave === 0 && existingValueMap.has(fieldId)) {
        const existingAmt = existingValueMap.get(fieldId);
        if (existingAmt != null && existingAmt !== 0) {
          amountToSave = existingAmt;
        }
      }

      fieldValuesToUpsert.push({
        salary_entry_id: salaryEntry.id,
        payroll_field_id: fieldId,
        amount: roundValue(amountToSave),
      });
    }

    if (fieldValuesToUpsert.length > 0) {
      const uniqueValuesMap = new Map<string, (typeof fieldValuesToUpsert)[0]>();
      for (const item of fieldValuesToUpsert) {
        const key = `${item.salary_entry_id}-${item.payroll_field_id}`;
        uniqueValuesMap.set(key, item);
      }
      const deduplicatedValues = Array.from(uniqueValuesMap.values());

      const { error: valuesError } = await supabase
        .from("salary_field_values")
        .upsert(deduplicatedValues, {
          onConflict: "salary_entry_id,payroll_field_id",
        });

      if (valuesError) {
        console.error("Error upserting salary field values:", valuesError);
      }
    }
  }
}

export async function setPayrollPendingByMonthYear({
  supabase,
  monthYears,
}: {
  supabase: TypedSupabaseClient;
  monthYears: { month: number; year: number; company_id: string }[];
}) {
  if (!monthYears?.length) return;

  for (const { month, year, company_id } of monthYears) {
    const { error } = await supabase
      .from("payroll")
      .update({ status: "pending" })
      .eq("company_id", company_id)
      .eq("month", month)
      .eq("year", year)
      .neq("status", "pending");

    if (error) {
      console.error(
        `Error updating payroll to pending for ${month}/${year}:`,
        error,
      );
    }
  }
}