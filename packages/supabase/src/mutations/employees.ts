import {
  convertToNull,
  parseFullAddress,
  type employeeDocumentTypeArray,
} from "@canny_ecosystem/utils";
import type {
  EmployeeAddressDatabaseInsert,
  EmployeeAddressDatabaseUpdate,
  EmployeeBankDetailsDatabaseInsert,
  EmployeeBankDetailsDatabaseUpdate,
  EmployeeDatabaseInsert,
  EmployeeDatabaseUpdate,
  EmployeeGuardianDatabaseInsert,
  EmployeeGuardianDatabaseUpdate,
  EmployeeStatutoryDetailsDatabaseInsert,
  EmployeeStatutoryDetailsDatabaseUpdate,
  EmployeeWorkDetailsDatabaseInsert,
  EmployeeWorkDetailsDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";
import type { ImportEmployeeDetailsDataType } from "../queries";
import { QUERY_BATCH_SIZE } from "../constant";
import { checkEmployeeNameConflictInSite } from "../queries";

export async function createEmployee({
  supabase,
  employeeData,
  employeeStatutoryDetailsData,
  employeeBankDetailsData,
  employeeWorkDetailsData,
  employeeAddressesData,
  employeeGuardiansData,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  employeeData: EmployeeDatabaseInsert;
  employeeStatutoryDetailsData?: Omit<
    EmployeeStatutoryDetailsDatabaseInsert,
    "employee_id"
  >;
  employeeBankDetailsData?: Omit<
    EmployeeBankDetailsDatabaseInsert,
    "employee_id"
  >;
  employeeWorkDetailsData?: Omit<
    EmployeeWorkDetailsDatabaseInsert,
    "employee_id"
  >;
  employeeAddressesData?: Omit<EmployeeAddressDatabaseInsert, "employee_id">;
  employeeGuardiansData?: Omit<EmployeeGuardianDatabaseInsert, "employee_id">;
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

  // Name conflict check within site
  if (employeeWorkDetailsData?.site_id) {
    const { hasConflict, error: nameError } =
      await checkEmployeeNameConflictInSite({
        supabase,
        siteId: employeeWorkDetailsData.site_id,
        firstName: employeeData.first_name,
        middleName: employeeData.middle_name || "",
        lastName: employeeData.last_name || "",
      });

    if (nameError) {
      console.error(
        "Error checking name conflict in createEmployee:",
        nameError,
      );
    }

    if (hasConflict) {
      return {
        status: 400,
        employeeError: {
          message: `An employee with name '${employeeData.first_name} ${employeeData.last_name || ""
            }' already exists in this site. Please change the employee name manually.`,
        },
      };
    }
  }

  const { error, status, data } = await supabase
    .from("employees")
    .insert({
      ...employeeData,
      employee_code: employeeData.employee_code.trim(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("createEmployee Error:", error);
    return {
      data,
      status,
      employeeError: error,
      employeeStatutoryDetailsError: null,
      employeeBankDetailsError: null,
      employeeWorkDetailsError: null,
      employeeAddressesError: null,
      employeeGuardiansError: null,
    };
  }

  if (!data?.id) {
    return {
      data,
      status,
      employeeError: null,
      employeeStatutoryDetailsError: null,
      employeeBankDetailsError: null,
      employeeWorkDetailsError: null,
      employeeAddressesError: null,
      employeeGuardiansError: null,
    };
  }

  const [
    { error: statutoryError, status: statutoryStatus },
    { error: bankError, status: bankStatus },
    { error: projectError, status: projectStatus },
    { error: addressError, status: addressStatus },
    { error: guardianError, status: guardianStatus },
  ] = await Promise.all([
    employeeStatutoryDetailsData
      ? createEmployeeStatutoryDetails({
        supabase,
        data: { ...employeeStatutoryDetailsData, employee_id: data.id },
        bypassAuth,
      })
      : { error: null, status: null },
    employeeBankDetailsData
      ? createEmployeeBankDetails({
        supabase,
        data: { ...employeeBankDetailsData, employee_id: data.id },
        bypassAuth,
      })
      : { error: null, status: null },
    employeeWorkDetailsData
      ? createEmployeeWorkDetails({
        supabase,
        data: { ...employeeWorkDetailsData, employee_id: data.id },
        bypassAuth,
      })
      : { error: null, status: null },
    employeeAddressesData
      ? createEmployeeAddresses({
        supabase,
        data: { ...employeeAddressesData, employee_id: data.id },
        bypassAuth,
      })
      : { error: null, status: null },
    employeeGuardiansData
      ? createEmployeeGuardians({
        supabase,
        data: { ...employeeGuardiansData, employee_id: data.id },
        bypassAuth,
      })
      : { error: null, status: null },
  ]);

  const latestStatus =
    guardianStatus ||
    addressStatus ||
    projectStatus ||
    bankStatus ||
    statutoryStatus ||
    status;

  return {
    id: data.id,
    data,
    status: latestStatus,
    employeeError: null,
    employeeStatutoryDetailsError: statutoryError,
    employeeBankDetailsError: bankError,
    employeeWorkDetailsError: projectError,
    employeeAddressesError: addressError,
    employeeGuardiansError: guardianError,
  };
}

export async function updateEmployee({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeDatabaseUpdate;
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
    .from("employees")
    .update(updateData)
    .eq("id", data.id!);
  if (error) {
    console.error("updateEmployee Error:", error);
  }

  return { status, error };
}

export async function deleteEmployee({
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

  const { error, status } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteEmployee Error:", error);
  }

  return { status, error };
}

export async function createEmployeeStatutoryDetails({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeStatutoryDetailsDatabaseInsert;
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

  const { error, status } = await supabase
    .from("employee_statutory_details")
    .insert(data)
    .single();

  if (error) {
    console.error("createEmployeeStatutoryDetails Error:", error);
  }

  return { error, status };
}

export async function createEmployeeBankDetails({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeBankDetailsDatabaseInsert;
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

  const { error, status } = await supabase
    .from("employee_bank_details")
    .insert(data)
    .single();

  if (error) {
    console.error("createEmployeeBankDetails Error:", error);
  }

  return { error, status };
}

export async function createEmployeeAddresses({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeAddressDatabaseInsert;
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

  const { error, status } = await supabase
    .from("employee_addresses")
    .insert(data)
    .single();

  if (error) {
    console.error("createEmployeeAddresses Error:", error);
  }

  return { error, status };
}

export async function createEmployeeGuardians({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeGuardianDatabaseInsert;
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

  const { error, status } = await supabase
    .from("employee_guardians")
    .insert(data)
    .single();

  if (error) {
    console.error("createEmployeeGuardians Error:", error);
  }

  return { error, status };
}

export async function updateEmployeeStatutoryDetails({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeStatutoryDetailsDatabaseUpdate;
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
    .from("employee_statutory_details")
    .update(updateData)
    .eq("employee_id", data.employee_id!);
  if (error) {
    console.error("updateEmployeeStatutoryDetails Error:", error);
  }

  return { status, error };
}

export async function updateEmployeeBankDetails({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeBankDetailsDatabaseUpdate;
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
    .from("employee_bank_details")
    .update(updateData)
    .eq("employee_id", data.employee_id!);
  if (error) {
    console.error("updateEmployeeBankDetails Error:", error);
  }

  return { status, error };
}

export async function updateEmployeeAddress({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeAddressDatabaseUpdate;
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
    .from("employee_addresses")
    .update(updateData)
    .eq("id", data.id!);
  if (error) {
    console.error("updateEmployeeAddress Error:", error);
  }

  return { status, error };
}

export async function deleteEmployeeAddress({
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

  const { error, status } = await supabase
    .from("employee_addresses")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteEmployeeAddress Error:", error);
  }

  return { status, error };
}

export async function updateEmployeeGuardian({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeGuardianDatabaseUpdate;
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
    .from("employee_guardians")
    .update(updateData)
    .eq("id", data.id!);
  if (error) {
    console.error("updateEmployeeGuardian Error:", error);
  }

  return { status, error };
}

export async function deleteEmployeeGuardian({
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

  const { error, status } = await supabase
    .from("employee_guardians")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteEmployeeGuardian Error:", error);
  }

  return { status, error };
}

export async function createEmployeeWorkDetails({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeWorkDetailsDatabaseInsert;
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

  if (data.site_id) {
    // We need names to check for conflict.
    // If not in data, fetch from employees table.
    let firstName = (data as any).first_name;
    let middleName = (data as any).middle_name;
    let lastName = (data as any).last_name;

    if (!firstName && data.employee_id) {
      const { data: emp, error: empError } = await supabase
        .from("employees")
        .select("first_name, middle_name, last_name")
        .eq("id", data.employee_id)
        .single();

      if (!empError && emp) {
        firstName = emp.first_name;
        middleName = emp.middle_name || "";
        lastName = emp.last_name || "";
      }
    }

    if (firstName) {
      const { hasConflict, error: nameError } =
        await checkEmployeeNameConflictInSite({
          supabase,
          siteId: data.site_id,
          employeeId: data.employee_id,
          firstName,
          middleName: middleName || "",
          lastName: lastName || "",
        });

      if (hasConflict) {
        return {
          status: 400,
          error: {
            message: `An employee with name '${firstName} ${lastName || ""
              }' already exists in this site. Please change the employee name manually.`,
          },
        };
      }
    }
  }

  const { first_name, middle_name, last_name, ...sanitizedData } = data as any;

  const { error, status } = await supabase
    .from("work_details")
    .insert(sanitizedData)
    .single();

  if (error) {
    console.error("createEmployeeWorkDetails Error:", error);
  }

  return { error, status };
}

export async function updateEmployeeWorkDetails({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeWorkDetailsDatabaseUpdate;
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
    .from("work_details")
    .update(updateData)
    .eq("employee_id", data.employee_id!);

  if (error) {
    console.error("updateEmployeeWorkDetails Error:", error);
  }

  return { status, error };
}

export async function deleteEmployeeWorkDetails({
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

  const { error, status } = await supabase
    .from("work_details")
    .delete()
    .eq("employee_id", id);

  if (error) {
    console.error("deleteEmployeeWorkDetails Error:", error);
  }

  return { status, error };
}

export async function getEmployeeDetailsConflicts({
  supabase,
  importedData,
  matchingKey = "employee_code",
}: {
  supabase: TypedSupabaseClient;
  importedData: ImportEmployeeDetailsDataType[];
  matchingKey?: string;
}) {
  const employeeCodes = [
    ...new Set(importedData.map((emp) => emp.employee_code).filter(Boolean)),
  ];
  const uanNumbers = [
    ...new Set(importedData.map((emp) => emp.uan_number).filter(Boolean)),
  ];
  const esicNumbers = [
    ...new Set(importedData.map((emp) => emp.esic_number).filter(Boolean)),
  ];

  let conflictingRecords: any[] = [];

  // 1. Check by Employee Code in batches
  for (let i = 0; i < employeeCodes.length; i += QUERY_BATCH_SIZE) {
    const batch = employeeCodes.slice(i, i + QUERY_BATCH_SIZE);
    const { data: codeData, error: codeError } = await supabase
      .from("employees")
      .select(`
        id, 
        employee_code, 
        first_name, 
        middle_name, 
        last_name, 
        gender, 
        education, 
        marital_status, 
        is_active, 
        date_of_birth, 
        personal_email, 
        primary_mobile_number, 
        secondary_mobile_number, 
        nationality,
        employee_statutory_details!left(
          uan_number, 
          aadhaar_number, 
          pan_number, 
          pf_number, 
          esic_number, 
          driving_license_number, 
          driving_license_expiry, 
          passport_number, 
          passport_expiry,
          company_esic_details!left(
            esic_site_name
          )
        ),
        employee_bank_details!left(
          account_number, 
          ifsc_code, 
          bank_name, 
          branch_name
        )
      `)
      .in("employee_code", batch);

    if (codeError) {
      console.error("Error checking employee code conflicts batch:", codeError);
      return {
        conflictingIndices: [],
        conflictingRecords: [],
        error: codeError,
      };
    }
    if (codeData) conflictingRecords.push(...codeData);
  }

  // 2. Check by UAN (to prevent duplicates even if code is new) in batches
  if (uanNumbers.length > 0) {
    for (let i = 0; i < uanNumbers.length; i += QUERY_BATCH_SIZE) {
      const batch = uanNumbers.slice(i, i + QUERY_BATCH_SIZE);
      const { data: statData, error: statError } = await supabase
        .from("employee_statutory_details")
        .select("employee_id, uan_number")
        .in("uan_number", batch);

      if (!statError && statData && statData.length > 0) {
        const uanEmpIds = statData.map((d) => d.employee_id);

        // Fetch employees for these UANs in batches too if needed
        for (let j = 0; j < uanEmpIds.length; j += QUERY_BATCH_SIZE) {
          const idBatch = uanEmpIds.slice(j, j + QUERY_BATCH_SIZE);
          const { data: uanEmpData } = await supabase
            .from("employees")
            .select(`
              id, 
              employee_code, 
              first_name, 
              middle_name, 
              last_name, 
              gender, 
              education, 
              marital_status, 
              is_active, 
              date_of_birth, 
              personal_email, 
              primary_mobile_number, 
              secondary_mobile_number, 
              nationality,
              employee_statutory_details!left(
                uan_number, 
                aadhaar_number, 
                pan_number, 
                pf_number, 
                esic_number, 
                driving_license_number, 
                driving_license_expiry, 
                passport_number, 
                passport_expiry
              ),
              employee_bank_details!left(
                account_number, 
                ifsc_code, 
                bank_name, 
                branch_name
              )
            `)
            .in("id", idBatch);

          if (uanEmpData) {
            for (const emp of uanEmpData) {
              if (!conflictingRecords.some((r) => r.id === emp.id)) {
                conflictingRecords.push(emp);
              }
            }
          }
        }
      }
    }
  }

  // 3. Check by ESIC (to prevent duplicates even if code/UAN is new) in batches
  if (esicNumbers.length > 0) {
    for (let i = 0; i < esicNumbers.length; i += QUERY_BATCH_SIZE) {
      const batch = esicNumbers.slice(i, i + QUERY_BATCH_SIZE);
      const { data: statData, error: statError } = await supabase
        .from("employee_statutory_details")
        .select("employee_id, esic_number")
        .in("esic_number", batch);

      if (!statError && statData && statData.length > 0) {
        const esicEmpIds = statData.map((d) => d.employee_id);

        for (let j = 0; j < esicEmpIds.length; j += QUERY_BATCH_SIZE) {
          const idBatch = esicEmpIds.slice(j, j + QUERY_BATCH_SIZE);
          const { data: esicEmpData } = await supabase
            .from("employees")
            .select(`
              id, 
              employee_code, 
              first_name, 
              middle_name, 
              last_name, 
              gender, 
              education, 
              marital_status, 
              is_active, 
              date_of_birth, 
              personal_email, 
              primary_mobile_number, 
              secondary_mobile_number, 
              nationality,
              employee_statutory_details!left(
                uan_number, 
                aadhaar_number, 
                pan_number, 
                pf_number, 
                esic_number, 
                driving_license_number, 
                driving_license_expiry, 
                passport_number, 
                passport_expiry,
                company_esic_details!left(
                  esic_site_name
                )
              ),
              employee_bank_details!left(
                account_number, 
                ifsc_code, 
                bank_name, 
                branch_name
              )
            `)
            .in("id", idBatch);

          if (esicEmpData) {
            for (const emp of esicEmpData) {
              if (!conflictingRecords.some((r) => r.id === emp.id)) {
                conflictingRecords.push(emp);
              }
            }
          }
        }
      }
    }
  }

  const conflictingIndices = importedData.reduce(
    (indices: number[], record, index) => {
      const hasConflict = conflictingRecords?.some((existing: any) => {
        const uanMatch =
          record.uan_number &&
          (existing.employee_statutory_details?.uan_number ===
            record.uan_number ||
            (Array.isArray(existing.employee_statutory_details) &&
              existing.employee_statutory_details.some(
                (s: any) => s.uan_number === record.uan_number,
              )));

        const esicMatch =
          record.esic_number &&
          (existing.employee_statutory_details?.esic_number ===
            record.esic_number ||
            (Array.isArray(existing.employee_statutory_details) &&
              existing.employee_statutory_details.some(
                (s: any) => s.esic_number === record.esic_number,
              )));

        const codeMatch =
          existing.employee_code &&
          record.employee_code &&
          existing.employee_code.trim() === record.employee_code.trim();

        return uanMatch || codeMatch || esicMatch;
      });

      if (hasConflict) {
        indices.push(index);
      }
      return indices;
    },
    [],
  );

  return { conflictingIndices, conflictingRecords, error: null };
}

export async function createEmployeeDetailsFromImportedData({
  supabase,
  data,
  import_type,
  matching_key = "employee_code",
}: {
  supabase: TypedSupabaseClient;
  data: ImportEmployeeDetailsDataType[];
  import_type?: string;
  matching_key?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: { message: "No data provided" } };
  }

  const { conflictingRecords, error: conflictError } =
    await getEmployeeDetailsConflicts({
      supabase,
      importedData: data,
      matchingKey: matching_key,
    });

  if (conflictError) {
    return { status: 400, error: conflictError };
  }
  const insertedOrUpdatedEmployees: { id: string; employee_code: string }[] =
    [];

  if (import_type === "skip") {
    const newData = data.filter((record) => {
      const hasConflict = conflictingRecords?.some((existing: any) => {
        const uanMatch =
          record.uan_number &&
          (existing.employee_statutory_details?.uan_number ===
            record.uan_number ||
            (Array.isArray(existing.employee_statutory_details) &&
              existing.employee_statutory_details.some(
                (s: any) => s.uan_number === record.uan_number,
              )));
        const esicMatch =
          record.esic_number &&
          (existing.employee_statutory_details?.esic_number ===
            record.esic_number ||
            (Array.isArray(existing.employee_statutory_details) &&
              existing.employee_statutory_details.some(
                (s: any) => s.esic_number === record.esic_number,
              )));
        const codeMatch =
          existing.employee_code &&
          record.employee_code &&
          existing.employee_code.trim() === record.employee_code.trim();

        return uanMatch || codeMatch || esicMatch;
      });
      return !hasConflict;
    });

    if (newData.length === 0) {
      return {
        status: 404,
        error: { message: "No new records to import" },
      };
    }

    const BATCH_SIZE = 50;

    for (let i = 0; i < newData.length; i += BATCH_SIZE) {
      const batch = newData.slice(i, Math.min(i + BATCH_SIZE, newData.length));

      const sanitizedBatch = batch.map((item) => ({
        employee_code: item.employee_code,
        first_name: item.first_name,
        middle_name: item.middle_name,
        last_name: item.last_name,
        gender: item.gender,
        education: item.education,
        marital_status: item.marital_status,
        date_of_birth: item.date_of_birth,
        is_active: item.is_active,
        personal_email: item.personal_email || null,
        primary_mobile_number: item.primary_mobile_number,
        secondary_mobile_number: item.secondary_mobile_number || null,
        nationality: item.nationality,
        company_id: item.company_id,
      }));

      const { error: insertError, data: insertedBatch } = await supabase
        .from("employees")
        .insert(sanitizedBatch)
        .select("id, employee_code");

      if (insertError) {
        console.error("Error inserting batch:", insertError);
        return { status: 400, error: insertError };
      }
      if (insertedBatch) {
        insertedOrUpdatedEmployees.push(...insertedBatch);
      }
    }

    return {
      status: 200,
      employees: insertedOrUpdatedEmployees,
      message: "Succesfull added details",
      error: null,
    };
  }

  if (import_type === "overwrite") {
    const results = await Promise.all(
      data.map(async (record) => {
        const conflictingRecord = conflictingRecords?.find((existing: any) => {
          const uanMatch =
            record.uan_number &&
            (existing.employee_statutory_details?.uan_number ===
              record.uan_number ||
              (Array.isArray(existing.employee_statutory_details) &&
                existing.employee_statutory_details.some(
                  (s: any) => s.uan_number === record.uan_number,
                )));
          if (uanMatch) return true;

          const esicMatch =
            record.esic_number &&
            (existing.employee_statutory_details?.esic_number ===
              record.esic_number ||
              (Array.isArray(existing.employee_statutory_details) &&
                existing.employee_statutory_details.some(
                  (s: any) => s.esic_number === record.esic_number,
                )));
          if (esicMatch) return true;

          return !!(
            existing.employee_code &&
            record.employee_code &&
            existing.employee_code.trim() === record.employee_code.trim()
          );
        });

        if (conflictingRecord) {
          const updateData: any = {};
          const fields = [
            "first_name",
            "middle_name",
            "last_name",
            "gender",
            "education",
            "marital_status",
            "date_of_birth",
            "is_active",
            "personal_email",
            "primary_mobile_number",
            "secondary_mobile_number",
            "company_id",
            "avatar_url",
            "nationality",
          ];

          for (const field of fields) {
            const val = (record as any)[field];
            if (val !== undefined && val !== "" && val !== null) {
              updateData[field] = val;
            }
          }

          // The matching key is used only for lookup — never overwrite its value.
          if (matching_key !== "employee_code" && record.employee_code) {
            updateData.employee_code = record.employee_code;
          }
          // uan_number and esic_number live in employee_statutory_details,
          // not in employees — they are NOT in `fields` above so they cannot
          // be accidentally added here. sanitizeStatutoryRecord in
          // createEmployeeStatutoryFromImportedData strips the matching_key
          // from that table's update payload as well.

          let updateError: any = null;
          // Only hit the DB if there is at least one field to change.
          if (Object.keys(updateData).length > 0) {
            const { error } = await supabase
              .from("employees")
              .update(updateData)
              .eq("id", conflictingRecord.id);
            updateError = error;
          }

          // Always register the employee so statutory/bank updates can find it.
          if (!updateError) {
            insertedOrUpdatedEmployees.push({
              id: conflictingRecord.id,
              employee_code: record.employee_code,
              uan_number: record.uan_number,
              esic_number: record.esic_number,
            } as any);
          }
          return { type: "update", error: updateError };
        }

        return { type: "update", error: null, skipped: true };
      }),
    );

    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      console.error("Errors during processing:", errors);
      return {
        status: 400,
        error: errors[0].error,
        employees: insertedOrUpdatedEmployees,
      };
    }

    return {
      status: 200,
      message: "Successfully processed updates and new insertions",
      error: null,
      employees: insertedOrUpdatedEmployees,
    };
  }

  return {
    status: 500,
    insertedOrUpdatedEmployees,
    error: new Error("Invalid import_type"),
  };
}

export async function getEmployeeStatutoryConflicts({
  supabase,
  importedData,
}: {
  supabase: TypedSupabaseClient;
  importedData: EmployeeStatutoryDetailsDatabaseInsert[];
}) {
  const BATCH_SIZE = QUERY_BATCH_SIZE;
  const conflictingIndices = new Set<number>();
  let finalError: any = null;

  for (let i = 0; i < importedData.length; i += BATCH_SIZE) {
    const batch = importedData.slice(i, i + BATCH_SIZE);
    const employeeIds = [
      ...new Set(batch.map((emp) => emp.employee_id).filter(Boolean)),
    ];
    const aadhaarNumbers = [
      ...new Set(batch.map((emp) => emp.aadhaar_number).filter(Boolean)),
    ];
    const panNumbers = [
      ...new Set(batch.map((emp) => emp.pan_number).filter(Boolean)),
    ];
    const uanNumbers = [
      ...new Set(batch.map((emp) => emp.uan_number).filter(Boolean)),
    ];
    const pfNumbers = [
      ...new Set(batch.map((emp) => emp.pf_number).filter(Boolean)),
    ];
    const esicNumbers = [
      ...new Set(batch.map((emp) => emp.esic_number).filter(Boolean)),
    ];
    const drivings = [
      ...new Set(
        batch.map((emp) => emp.driving_license_number).filter(Boolean),
      ),
    ];
    const passports = [
      ...new Set(batch.map((emp) => emp.passport_number).filter(Boolean)),
    ];

    const orConditions: string[] = [];
    if (employeeIds.length > 0)
      orConditions.push(
        `employee_id.in.(${employeeIds.map((id) => `"${id}"`).join(",")})`,
      );
    if (aadhaarNumbers.length > 0)
      orConditions.push(
        `aadhaar_number.in.(${aadhaarNumbers.map((num) => `"${num}"`).join(",")})`,
      );
    if (panNumbers.length > 0)
      orConditions.push(
        `pan_number.in.(${panNumbers.map((num) => `"${num}"`).join(",")})`,
      );
    if (uanNumbers.length > 0)
      orConditions.push(
        `uan_number.in.(${uanNumbers.map((num) => `"${num}"`).join(",")})`,
      );
    if (pfNumbers.length > 0)
      orConditions.push(
        `pf_number.in.(${pfNumbers.map((num) => `"${num}"`).join(",")})`,
      );
    if (esicNumbers.length > 0)
      orConditions.push(
        `esic_number.in.(${esicNumbers.map((num) => `"${num}"`).join(",")})`,
      );
    if (drivings.length > 0)
      orConditions.push(
        `driving_license_number.in.(${drivings.map((num) => `"${num}"`).join(",")})`,
      );
    if (passports.length > 0)
      orConditions.push(
        `passport_number.in.(${passports.map((num) => `"${num}"`).join(",")})`,
      );

    if (orConditions.length === 0) continue;

    const { data: conflictingRecords, error } = await supabase
      .from("employee_statutory_details")
      .select(
        `
        employee_id,
        aadhaar_number,
        pan_number,
        uan_number,
        pf_number,
        esic_number,
        driving_license_number,
        passport_number
      `,
      )
      .or(orConditions.join(","));

    if (error) {
      console.error("Error fetching statutory conflicts batch:", error);
      finalError = error;
      break;
    }

    if (conflictingRecords) {
      batch.forEach((record, batchIndex) => {
        const globalIndex = i + batchIndex;
        const hasConflict = conflictingRecords.some(
          (existing) =>
            existing.employee_id === record.employee_id ||
            (record.aadhaar_number &&
              existing.aadhaar_number === record.aadhaar_number) ||
            (record.pan_number && existing.pan_number === record.pan_number) ||
            (record.uan_number && existing.uan_number === record.uan_number) ||
            (record.pf_number && existing.pf_number === record.pf_number) ||
            (record.esic_number &&
              existing.esic_number === record.esic_number) ||
            (record.driving_license_number &&
              existing.driving_license_number ===
              record.driving_license_number) ||
            (record.passport_number &&
              existing.passport_number === record.passport_number),
        );

        if (hasConflict) {
          conflictingIndices.add(globalIndex);
        }
      });
    }
  }

  return {
    conflictingIndices: Array.from(conflictingIndices),
    error: finalError,
  };
}

export async function createEmployeeStatutoryFromImportedData({
  supabase,
  data,
  import_type,
  matching_key,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeStatutoryDetailsDatabaseInsert[];
  import_type?: string;
  matching_key?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: { message: "No data provided" } };
  }

  const BATCH_SIZE = 100;
  const existingRecords: any[] = [];
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const employeeIds = [
      ...new Set(batch.map((entry) => entry.employee_id).filter(Boolean)),
    ];
    const aadhaarNumbers = [
      ...new Set(batch.map((entry) => entry.aadhaar_number).filter(Boolean)),
    ];
    const panNumbers = [
      ...new Set(batch.map((entry) => entry.pan_number).filter(Boolean)),
    ];
    const uanNumbers = [
      ...new Set(batch.map((entry) => entry.uan_number).filter(Boolean)),
    ];
    const pfNumbers = [
      ...new Set(batch.map((entry) => entry.pf_number).filter(Boolean)),
    ];
    const esicNumbers = [
      ...new Set(batch.map((entry) => entry.esic_number).filter(Boolean)),
    ];
    const drivings = [
      ...new Set(
        batch.map((entry) => entry.driving_license_number).filter(Boolean),
      ),
    ];
    const passports = [
      ...new Set(batch.map((entry) => entry.passport_number).filter(Boolean)),
    ];

    const orConditions: string[] = [];
    if (employeeIds.length > 0)
      orConditions.push(
        `employee_id.in.(${employeeIds.map((id) => `"${id}"`).join(",")})`,
      );
    if (aadhaarNumbers.length > 0)
      orConditions.push(
        `aadhaar_number.in.(${aadhaarNumbers.map((n) => `"${n}"`).join(",")})`,
      );
    if (panNumbers.length > 0)
      orConditions.push(
        `pan_number.in.(${panNumbers.map((n) => `"${n}"`).join(",")})`,
      );
    if (uanNumbers.length > 0)
      orConditions.push(
        `uan_number.in.(${uanNumbers.map((n) => `"${n}"`).join(",")})`,
      );
    if (pfNumbers.length > 0)
      orConditions.push(
        `pf_number.in.(${pfNumbers.map((n) => `"${n}"`).join(",")})`,
      );
    if (esicNumbers.length > 0)
      orConditions.push(
        `esic_number.in.(${esicNumbers.map((n) => `"${n}"`).join(",")})`,
      );
    if (drivings.length > 0)
      orConditions.push(
        `driving_license_number.in.(${drivings.map((n) => `"${n}"`).join(",")})`,
      );
    if (passports.length > 0)
      orConditions.push(
        `passport_number.in.(${passports.map((n) => `"${n}"`).join(",")})`,
      );

    if (orConditions.length === 0) continue;

    const { data: batchExisting, error: existingError } = await supabase
      .from("employee_statutory_details")
      .select(
        "employee_id, aadhaar_number, pan_number, uan_number, pf_number, esic_number, driving_license_number, passport_number",
      )
      .or(orConditions.join(","));

    if (existingError) {
      console.error("Error fetching existing records batch:", existingError);
      return { status: 400, error: existingError };
    }

    if (batchExisting) {
      existingRecords.push(...batchExisting);
    }
  }

  const normalize = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const existingSets = {
    ids: new Set(existingRecords?.map((e) => normalize(e.employee_id)) || []),
    aadhaars: new Set(
      existingRecords?.map((e) => normalize(e.aadhaar_number)) || [],
    ),
    pans: new Set(existingRecords?.map((e) => normalize(e.pan_number)) || []),
    uans: new Set(existingRecords?.map((e) => normalize(e.uan_number)) || []),
    pfs: new Set(existingRecords?.map((e) => normalize(e.pf_number)) || []),
    esics: new Set(existingRecords?.map((e) => normalize(e.esic_number)) || []),
    drivingLicenses: new Set(
      existingRecords?.map((e) => normalize(e.driving_license_number)) || [],
    ),
    passports: new Set(
      existingRecords?.map((e) => normalize(e.passport_number)) || [],
    ),
  };

  if (import_type === "skip") {
    const newData = data.filter((entry) => {
      const hasConflict =
        existingSets.ids.has(normalize(entry.employee_id)) ||
        (entry.aadhaar_number &&
          existingSets.aadhaars.has(normalize(entry.aadhaar_number))) ||
        (entry.pan_number &&
          existingSets.pans.has(normalize(entry.pan_number))) ||
        (entry.uan_number &&
          existingSets.uans.has(normalize(entry.uan_number))) ||
        (entry.pf_number && existingSets.pfs.has(normalize(entry.pf_number))) ||
        (entry.esic_number &&
          existingSets.esics.has(normalize(entry.esic_number))) ||
        (entry.driving_license_number &&
          existingSets.drivingLicenses.has(
            normalize(entry.driving_license_number),
          )) ||
        (entry.passport_number &&
          existingSets.passports.has(normalize(entry.passport_number)));

      return !hasConflict;
    });

    if (newData.length === 0) {
      return {
        status: 200,
        message: "No new data to insert after filtering duplicates",
      };
    }

    const sanitizeStatutoryRecord = (rec: any) => {
      const clean: any = {};
      for (const key of Object.keys(rec)) {
        if (rec[key] !== undefined && key !== "esic_site_name") {
          clean[key] = rec[key];
        }
      }
      return clean;
    };

    for (let i = 0; i < newData.length; i += BATCH_SIZE) {
      const batch = newData
        .slice(i, i + BATCH_SIZE)
        .map(sanitizeStatutoryRecord);
      const { error: insertError } = await supabase
        .from("employee_statutory_details")
        .insert(batch);
      if (insertError) {
        console.error("Error inserting batch (statutory):", insertError);
        return { status: 400, error: insertError };
      }
    }

    return {
      status: 200,
      message: "Successfully inserted new records",
      error: null,
    };
  }

  if (import_type === "overwrite") {
    const sanitizeStatutoryRecord = (rec: any) => {
      const clean: any = {};
      for (const key of Object.keys(rec)) {
        if (
          rec[key] !== undefined &&
          key !== "esic_site_name" &&
          key !== matching_key
        ) {
          clean[key] = rec[key];
        }
      }
      return clean;
    };

    const CONCURRENCY_LIMIT = 10;
    for (let i = 0; i < data.length; i += CONCURRENCY_LIMIT) {
      const batch = data.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(
        batch.map(async (record) => {
          const cleanRecord = sanitizeStatutoryRecord(record);
          const existingRecord = existingRecords?.find(
            (existing) =>
              normalize(existing.employee_id) ===
              normalize(record.employee_id) ||
              (record.aadhaar_number &&
                normalize(existing.aadhaar_number) ===
                normalize(record.aadhaar_number)) ||
              (record.pan_number &&
                normalize(existing.pan_number) ===
                normalize(record.pan_number)) ||
              (record.uan_number &&
                normalize(existing.uan_number) ===
                normalize(record.uan_number)) ||
              (record.pf_number &&
                normalize(existing.pf_number) ===
                normalize(record.pf_number)) ||
              (record.esic_number &&
                normalize(existing.esic_number) ===
                normalize(record.esic_number)) ||
              (record.driving_license_number &&
                normalize(existing.driving_license_number) ===
                normalize(record.driving_license_number)) ||
              (record.passport_number &&
                normalize(existing.passport_number) ===
                normalize(record.passport_number)),
          );

          if (existingRecord) {
            // Strip employee_id from the update payload — never mutate the PK.
            // Always target the correct row using existingRecord.employee_id.
            const { employee_id: _pk, ...updateFields } = cleanRecord as any;
            const { error: updateError } = await supabase
              .from("employee_statutory_details")
              .update(updateFields)
              .eq("employee_id", existingRecord.employee_id);

            return { type: "update", error: updateError };
          }

          // Fallback: upsert so a missed existingRecord detection never causes
          // a duplicate-PK error (e.g. when matching by esic_number only).
          const { error: upsertError } = await supabase
            .from("employee_statutory_details")
            .upsert(cleanRecord, { onConflict: "employee_id" });

          return { type: "upsert", error: upsertError };
        }),
      );

      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        console.error("Errors during batch processing (statutory):", errors);
        return { status: 400, error: errors[0].error };
      }
    }

    return {
      status: 200,
      message: "Successfully processed updates and new insertions",
      error: null,
    };
  }

  return {
    status: 500,
    error: new Error("Invalid import_type"),
  };
}

export async function getEmployeeBankDetailsConflicts({
  supabase,
  importedData,
}: {
  supabase: TypedSupabaseClient;
  importedData: EmployeeBankDetailsDatabaseInsert[];
}) {
  const employeeIds = [
    ...new Set(importedData.map((emp) => emp.employee_id).filter(Boolean)),
  ];
  const accountNumbers = [
    ...new Set(importedData.map((emp) => emp.account_number).filter(Boolean)),
  ];

  const orConditions: string[] = [];
  if (employeeIds.length > 0) {
    orConditions.push(
      `employee_id.in.(${employeeIds.map((id) => `"${id}"`).join(",")})`,
    );
  }
  if (accountNumbers.length > 0) {
    orConditions.push(
      `account_number.in.(${accountNumbers.map((num) => `"${num}"`).join(",")})`,
    );
  }

  if (orConditions.length === 0) {
    return { conflictingIndices: [], conflictingRecords: [], error: null };
  }

  const query = supabase
    .from("employee_bank_details")
    .select(
      `
      employee_id,
      account_number,
      account_holder_name,
      ifsc_code,
      account_type,
      bank_name,
      branch_name
    `,
    )
    .or(orConditions.join(","));

  const { data: conflictingRecords, error } = await query;

  if (error) {
    console.error("Error fetching conflicts:", error);
    return { conflictingIndices: [], conflictingRecords: [], error };
  }

  const conflictingIndices = importedData.reduce(
    (indices: number[], record, index) => {
      const hasConflict = conflictingRecords?.some(
        (existing) =>
          existing.employee_id === record.employee_id ||
          existing.account_number === record.account_number,
      );

      if (hasConflict) {
        indices.push(index);
      }
      return indices;
    },
    [],
  );

  return { conflictingIndices, conflictingRecords, error: null };
}

export async function createEmployeeBankDetailsFromImportedData({
  supabase,
  data,
  import_type,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeBankDetailsDatabaseInsert[];
  import_type?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: null };
  }

  const employeeIds = [
    ...new Set(data.map((entry) => entry.employee_id).filter(Boolean)),
  ];
  const accountNumbers = [
    ...new Set(data.map((entry) => entry.account_number).filter(Boolean)),
  ];

  const orConditions: string[] = [];
  if (employeeIds.length > 0)
    orConditions.push(`employee_id.in.(${employeeIds.join(",")})`);
  if (accountNumbers.length > 0)
    orConditions.push(`account_number.in.(${accountNumbers.join(",")})`);

  if (orConditions.length === 0) {
    return {
      status: 200,
      message: "No identifying fields provided",
      error: null,
    };
  }

  const { data: existingRecords, error: existingError } = await supabase
    .from("employee_bank_details")
    .select("employee_id, account_number")
    .or(orConditions.join(","));
  if (existingError) {
    console.error("Error fetching existing records:", existingError);
    return { status: 500, error: existingError };
  }

  const normalize = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const existingSets = {
    ids: new Set(existingRecords?.map((e) => normalize(e.employee_id)) || []),
    accounts: new Set(
      existingRecords?.map((e) => normalize(e.account_number)) || [],
    ),
  };

  if (import_type === "skip") {
    const newData = data.filter((entry) => {
      const hasConflict =
        existingSets.ids.has(normalize(entry.employee_id)) ||
        (entry.account_number &&
          existingSets.accounts.has(normalize(entry.account_number)));

      return !hasConflict;
    });

    if (newData.length === 0) {
      return {
        status: 404,
        error: { message: "No new data to insert after filtering duplicates" },
      };
    }

    const BATCH_SIZE = 50;

    for (let i = 0; i < newData.length; i += BATCH_SIZE) {
      const batch = newData.slice(i, Math.min(i + BATCH_SIZE, newData.length));

      const { error: insertError } = await supabase
        .from("employee_bank_details")
        .insert(batch);
      if (insertError) {
        console.error("Error inserting batch (bank):", insertError);
        return { status: 400, error: insertError };
      }
    }

    return {
      status: 200,
      message: "Successfully inserted new records",
      error: null,
    };
  }

  if (import_type === "overwrite") {
    const results = await Promise.all(
      data.map(async (record) => {
        const existingRecord = existingRecords?.find(
          (existing) =>
            normalize(existing.employee_id) === normalize(record.employee_id) ||
            (record.account_number &&
              normalize(existing.account_number) ===
              normalize(record.account_number)),
        );

        if (existingRecord) {
          const { error: updateError } = await supabase
            .from("employee_bank_details")
            .update(record)
            .eq("employee_id", existingRecord.employee_id);

          return { type: "update", error: updateError };
        }

        const { error: insertError } = await supabase
          .from("employee_bank_details")
          .insert(record);

        return { type: "insert", error: insertError };
      }),
    );

    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      console.error("Errors during processing (bank):", errors);
      return { status: 400, error: errors[0].error };
    }

    return {
      status: 200,
      message: "Successfully processed updates and new insertions",
      error: null,
    };
  }

  return {
    status: 500,
    error: new Error("Invalid import_type"),
  };
}

export async function createEmployeeAddressFromImportedData({
  supabase,
  data,
  import_type,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeAddressDatabaseInsert[];
  import_type?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: null };
  }

  const employeeIds = [...new Set(data.map((d) => d.employee_id))];
  const parsedData = data.map((d) => parseFullAddress(d));

  const { data: existingRecords } = await supabase
    .from("employee_addresses")
    .select("id, employee_id, address_type, is_primary, address_line_1, city")
    .in("employee_id", employeeIds.filter(Boolean) as string[]);

  const normalize = (val: any) =>
    String(val || "")
      .trim()
      .toLowerCase();

  if (import_type === "skip") {
    const newData = parsedData.filter(
      (d) =>
        !existingRecords?.find(
          (e) =>
            normalize(e.employee_id) === normalize(d.employee_id) &&
            (normalize(e.address_type) === normalize(d.address_type) ||
              (d.is_primary && e.is_primary) ||
              (!d.address_type && e.is_primary) ||
              (normalize(e.address_line_1) === normalize(d.address_line_1) &&
                normalize(e.city) === normalize(d.city))),
        ),
    );
    if (newData.length > 0) {
      const { error: insertError } = await supabase
        .from("employee_addresses")
        .insert(newData);
      if (insertError) return { status: 400, error: insertError };
    }
    return { status: 200, error: null };
  }

  if (import_type === "overwrite") {
    const results = await Promise.all(
      parsedData.map(async (record) => {
        const existingByType = existingRecords?.find(
          (e) =>
            normalize(e.employee_id) === normalize(record.employee_id) &&
            record.address_type &&
            normalize(e.address_type) === normalize(record.address_type),
        );

        const existingByPrimaryFallback = !existingByType
          ? existingRecords?.find(
            (e) =>
              normalize(e.employee_id) === normalize(record.employee_id) &&
              ((record.is_primary && e.is_primary) ||
                (!record.address_type && e.is_primary)),
          )
          : null;
        const existingByContent =
          !existingByType && !existingByPrimaryFallback
            ? existingRecords?.find(
              (e) =>
                normalize(e.employee_id) === normalize(record.employee_id) &&
                normalize(e.address_line_1) ===
                normalize(record.address_line_1) &&
                normalize(e.city) === normalize(record.city),
            )
            : null;

        const existing =
          existingByType || existingByPrimaryFallback || existingByContent;

        if (existing) {
          const { error: updateError } = await supabase
            .from("employee_addresses")
            .update(record)
            .eq("id", existing.id);
          return updateError;
        }
        const { error: insertError } = await supabase
          .from("employee_addresses")
          .insert(record);
        return insertError;
      }),
    );
    const errors = results.filter(Boolean);
    if (errors.length > 0) return { status: 400, error: errors[0] };
    return { status: 200, error: null };
  }

  return { status: 500, error: new Error("Invalid import_type") };
}

export async function getEmployeeGuardiansConflicts({
  supabase,
  importedData,
}: {
  supabase: TypedSupabaseClient;
  importedData: EmployeeGuardianDatabaseInsert[];
}) {
  const mobileNumbers = [
    ...new Set(importedData.map((emp) => emp.mobile_number).filter(Boolean)),
  ];
  const alternateMobileNumbers = [
    ...new Set(
      importedData.map((emp) => emp.alternate_mobile_number).filter(Boolean),
    ),
  ];
  const emails = [
    ...new Set(importedData.map((emp) => emp.email).filter(Boolean)),
  ];

  const orConditions: string[] = [];
  if (mobileNumbers.length > 0) {
    orConditions.push(
      `mobile_number.in.(${mobileNumbers.map((num) => `"${num}"`).join(",")})`,
    );
  }
  if (alternateMobileNumbers.length > 0) {
    orConditions.push(
      `alternate_mobile_number.in.(${alternateMobileNumbers
        .map((num) => `"${num}"`)
        .join(",")})`,
    );
  }
  if (emails.length > 0) {
    orConditions.push(
      `email.in.(${emails.map((email) => `"${email}"`).join(",")})`,
    );
  }

  if (orConditions.length === 0) {
    return { conflictingIndices: [], error: null };
  }

  const query = supabase
    .from("employee_guardians")
    .select(
      `
      mobile_number,
      alternate_mobile_number,
      email
    `,
    )
    .or(orConditions.join(","));

  const { data: conflictingRecords, error } = await query;

  if (error) {
    console.error("Error fetching conflicts:", error);
    return { conflictingIndices: [], error };
  }

  const conflictingIndices = importedData.reduce(
    (indices: number[], record, index) => {
      const hasConflict = conflictingRecords?.some(
        (existing) =>
          existing.mobile_number === record.mobile_number ||
          existing.alternate_mobile_number === record.alternate_mobile_number ||
          existing.email === record.email,
      );

      if (hasConflict) {
        indices.push(index);
      }
      return indices;
    },
    [],
  );

  return { conflictingIndices, error: null };
}

export async function createEmployeeGuardiansFromImportedData({
  supabase,
  data,
  import_type,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeGuardianDatabaseInsert[] | EmployeeGuardianDatabaseUpdate[];
  import_type?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: { message: "No data provided" } };
  }

  const normalize = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const orConditions = data.map((entry) =>
    [
      entry.mobile_number ? `mobile_number.eq.${entry.mobile_number}` : null,
      entry.alternate_mobile_number
        ? `alternate_mobile_number.eq.${entry.alternate_mobile_number}`
        : null,
      entry.email ? `email.eq.${entry.email}` : null,
    ]
      .filter(Boolean)
      .join(","),
  );

  const { data: existingRecords, error: fetchError } = await supabase
    .from("employee_guardians")
    .select("*")
    .or(orConditions.join(","));

  if (fetchError) {
    console.error("Error fetching existing records:", fetchError);
    return { status: 402, error: fetchError };
  }

  const existingSets = {
    mobileNumbers: new Set(
      existingRecords?.map((e) => normalize(e.mobile_number)) || [],
    ),
    alternateMobileNumbers: new Set(
      existingRecords?.map((e) => normalize(e.alternate_mobile_number)) || [],
    ),
    emails: new Set(existingRecords?.map((e) => normalize(e.email)) || []),
  };

  if (import_type === "skip") {
    const newData = data.filter((entry) => {
      const hasConflict =
        existingSets.mobileNumbers.has(normalize(entry.mobile_number)) ||
        existingSets.alternateMobileNumbers.has(
          normalize(entry.alternate_mobile_number),
        ) ||
        existingSets.emails.has(normalize(entry.email));

      return !hasConflict;
    });

    if (newData.length === 0) {
      return { status: 404, error: { message: "No new data found" } };
    }

    const { error, status } = await supabase
      .from("employee_guardians")
      .upsert(newData as EmployeeAddressDatabaseInsert[]);

    if (error) {
      console.error("Error inserting employee guardians data:", error);
      return { status: 400, error };
    }

    return { status, error };
  }

  if (import_type === "overwrite") {
    for (const entry of data) {
      const existing = existingRecords?.find(
        (record) =>
          normalize(record.mobile_number) === normalize(entry.mobile_number) ||
          normalize(record.alternate_mobile_number) ===
          normalize(entry.alternate_mobile_number) ||
          normalize(record.email) === normalize(entry.email),
      );

      if (existing) {
        let updateData: typeof entry = {};

        const keys = Object.keys(entry);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i] as keyof typeof entry;
          if (entry[key!] !== existing[key!]) {
            updateData = {
              ...updateData,
              [key]: entry[key!],
            };
          }
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from("employee_guardians")
            .update(updateData)
            .eq("id", existing.id);

          if (updateError) {
            console.error("Error updating record:", updateError);
          }
        }
      } else {
        const { error: insertError } = await supabase
          .from("employee_guardians")
          .insert(entry as EmployeeGuardianDatabaseInsert);

        if (insertError) {
          console.error("Error inserting new record:", insertError);
          return { status: 400, error: insertError };
        }
      }
    }

    return { status: 200, error: null };
  }

  return {
    status: 500,
    error: new Error("Invalid import_type"),
  };
}

export async function getEmployeeWorkDetailsConflicts({
  supabase,
  importedData,
}: {
  supabase: TypedSupabaseClient;
  importedData: (EmployeeWorkDetailsDatabaseInsert & {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  })[];
}) {
  const employeeIds = [
    ...new Set(
      importedData.map((emp) => emp.employee_id).filter(Boolean) as string[],
    ),
  ];
  const siteIds = [
    ...new Set(
      importedData.map((emp) => emp.site_id).filter(Boolean) as string[],
    ),
  ];

  const conflictingRecords: { employee_id: string }[] = [];
  const incomingNamesMap = new Map<
    string,
    { first_name: string; middle_name: string; last_name: string }
  >();

  const idsToFetchNames = employeeIds.filter((id) => {
    const record = importedData.find((r) => r.employee_id === id);
    return !record?.first_name;
  });

  if (idsToFetchNames.length > 0) {
    for (let i = 0; i < idsToFetchNames.length; i += QUERY_BATCH_SIZE) {
      const batch = idsToFetchNames.slice(i, i + QUERY_BATCH_SIZE);
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, middle_name, last_name")
        .in("id", batch);

      if (error) {
        console.error(
          "Error fetching employee names for conflict check:",
          error,
        );
        return { conflictingIndices: [], conflicts: [], error };
      }
      if (data) {
        for (const emp of data) {
          incomingNamesMap.set(emp.id, {
            first_name: emp.first_name,
            middle_name: emp.middle_name || "",
            last_name: emp.last_name || "",
          });
        }
      }
    }
  }

  for (let i = 0; i < employeeIds.length; i += QUERY_BATCH_SIZE) {
    const batch = employeeIds.slice(i, i + QUERY_BATCH_SIZE);
    const { data, error } = await supabase
      .from("work_details")
      .select("employee_id")
      .in("employee_id", batch);

    if (error) {
      console.error("Error fetching work details conflicts batch:", error);
      return { conflictingIndices: [], conflicts: [], error };
    }
    if (data) conflictingRecords.push(...data);
  }

  const siteEmployees: any[] = [];
  if (siteIds.length > 0) {
    for (let i = 0; i < siteIds.length; i += QUERY_BATCH_SIZE) {
      const batch = siteIds.slice(i, i + QUERY_BATCH_SIZE);
      const { data, error } = await supabase
        .from("work_details")
        .select(`
            site_id,
            employee_id,
            employees!inner(first_name, middle_name, last_name)
          `)
        .in("site_id", batch);

      if (error) {
        console.error(
          "Error fetching site employees for conflict check:",
          error,
        );
        return { conflictingIndices: [], conflicts: [], error };
      }
      if (data) siteEmployees.push(...data);
    }
  }

  const normalize = (val: any) =>
    String(val || "")
      .trim()
      .toLowerCase();

  const conflictingIndices = [];
  const conflicts = [];
  const processedNamesInBatch = new Map<string, string>(); // siteId + fullName -> employeeId

  for (let i = 0; i < importedData.length; i++) {
    const record = importedData[i];
    const empIdConflict = conflictingRecords.some(
      (existing) => existing.employee_id === record.employee_id,
    );

    const recordNames = record.first_name
      ? {
        first_name: record.first_name,
        middle_name: record.middle_name || "",
        last_name: record.last_name || "",
      }
      : record.employee_id
        ? incomingNamesMap.get(record.employee_id)
        : null;

    const recordFullName = recordNames
      ? `${normalize(recordNames.first_name)} ${normalize(
        recordNames.middle_name,
      )} ${normalize(recordNames.last_name)}`
        .trim()
        .replace(/\s+/g, " ")
      : "";

    const nameConflictRecord =
      recordNames &&
      siteEmployees.find((existing) => {
        if (existing.site_id !== record.site_id) return false;
        if (existing.employee_id === record.employee_id) return false;

        const existingFullName = `${normalize(
          existing.employees?.first_name,
        )} ${normalize(existing.employees?.middle_name)} ${normalize(
          existing.employees?.last_name,
        )}`
          .trim()
          .replace(/\s+/g, " ");

        return existingFullName === recordFullName;
      });

    const batchKey = `${record.site_id}_${recordFullName}`;
    const internalBatchConflict =
      recordFullName &&
      processedNamesInBatch.has(batchKey) &&
      processedNamesInBatch.get(batchKey) !== record.employee_id;

    if (empIdConflict) {
      conflictingIndices.push(i);
      conflicts.push({ index: i, type: "employee_id" });
    } else if (nameConflictRecord || internalBatchConflict) {
      conflictingIndices.push(i);
      conflicts.push({ index: i, type: "name" });
    }

    if (recordFullName && record.site_id) {
      processedNamesInBatch.set(batchKey, record.employee_id || "");
    }
  }

  return { conflictingIndices, conflicts, error: null };
}

export async function createEmployeeWorkDetailsFromImportedData({
  supabase,
  data,
  import_type,
}: {
  supabase: TypedSupabaseClient;
  data: (EmployeeWorkDetailsDatabaseInsert & {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  })[];
  import_type?: string;
}) {
  if (!data || data.length === 0) {
    return { status: 404, error: null };
  }

  const {
    conflictingIndices,
    conflicts,
    error: conflictError,
  } = await getEmployeeWorkDetailsConflicts({
    supabase,
    importedData: data,
  });

  if (conflictError) {
    return { status: 403, error: conflictError };
  }

  const normalize = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase();

  if (import_type === "skip") {
    const newData = data.filter(
      (_, index) => !conflictingIndices.includes(index),
    );

    if (newData.length === 0) {
      return {
        status: 404,
        error: { message: "No new entries added" },
      };
    }

    const sanitizedNewData = newData.map(
      ({
        first_name,
        middle_name,
        last_name,
        employee_code,
        department,
        site,
        project,
        ...rest
      }) => rest,
    );

    for (let i = 0; i < sanitizedNewData.length; i += QUERY_BATCH_SIZE) {
      const batch = sanitizedNewData.slice(i, i + QUERY_BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("work_details")
        .insert(batch);
      if (insertError) {
        console.error("Error inserting batch (work details):", insertError);
        return { status: 400, error: insertError };
      }
    }

    return { status: 200, error: null };
  }

  if (import_type === "overwrite") {
    for (let i = 0; i < data.length; i += QUERY_BATCH_SIZE) {
      const batch = data.slice(i, i + QUERY_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (record, batchIdx) => {
          const globalIndex = i + batchIdx;
          const conflict = conflicts.find((c) => c.index === globalIndex);

          const {
            first_name,
            middle_name,
            last_name,
            employee_code,
            department,
            site,
            project,
            ...sanitizedRecord
          } = record;

          if (conflict?.type === "employee_id") {
            const { error: updateError } = await supabase
              .from("work_details")
              .update(sanitizedRecord)
              .eq("employee_id", record.employee_id);

            return { type: "update", error: updateError };
          }

          if (conflict?.type === "name") {
            return {
              type: "error",
              error: new Error(
                `Name conflict: Another employee with the same name already exists in this site. Please change the employee name manually.`,
              ),
            };
          }

          const { error: insertError } = await supabase
            .from("work_details")
            .insert(sanitizedRecord);

          return { type: "insert", error: insertError };
        }),
      );

      const firstError = results.find((r) => r.error);
      if (firstError) {
        console.error(
          "Error during processing batch (work details):",
          firstError.error,
        );
        return { status: 400, error: firstError.error };
      }
    }

    return {
      status: 200,
      message: "Successfully processed updates and new insertions",
      error: null,
    };
  }

  return {
    status: 500,
    error: new Error("Invalid import_type"),
  };
}

export async function addEmployeeDocument({
  supabase,
  employee_id,
  document_type,
  url,
}: {
  supabase: TypedSupabaseClient;
  employee_id: string;
  document_type: (typeof employeeDocumentTypeArray)[number];
  url: string;
}) {
  const dataToBeInserted = convertToNull({ employee_id, document_type, url });
  const { status, error } = await supabase
    .from("employee_documents")
    .insert(dataToBeInserted);

  return { status, error };
}

export async function deleteEmployeeDocumentByEmployeeId({
  supabase,
  employeeId,
  documentType,
}: {
  supabase: TypedSupabaseClient;
  employeeId: string;
  documentType: (typeof employeeDocumentTypeArray)[number];
}) {
  const { error, status } = await supabase
    .from("employee_documents")
    .delete()
    .eq("employee_id", employeeId)
    .eq("document_type", documentType);

  return { status, error };
}
