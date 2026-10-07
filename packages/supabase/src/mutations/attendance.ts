import type {
  EmployeeMonthlyAttendanceDatabaseInsert,
  EmployeeMonthlyAttendanceDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";
import { getEmployeeIdsByIdentifiers } from "../queries";
import { setPayrollPendingByMonthYear } from "./payroll";
import { payoutMonths } from "@canny_ecosystem/utils/constant";

export async function AddAttendance({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeMonthlyAttendanceDatabaseUpdate;
}) {
  const { error, status } = await supabase
    .from("monthly_attendance")
    .insert(data as EmployeeMonthlyAttendanceDatabaseInsert);

  if (error) {
    console.error("AddAttendance Error", error);
    return { error, status };
  }

  const attendances = Array.isArray(data) ? data : [data];
  if (attendances.length > 0) {
    const monthYearsMap = new Map<
      string,
      { month: number; year: number; company_id: string }
    >();
    const employeeIds = [
      ...new Set(
        attendances.filter((a) => a.employee_id).map((a) => a.employee_id),
      ),
    ];

    if (employeeIds.length > 0) {
      const { data: employees } = await supabase
        .from("employees")
        .select("id, company_id")
        .in("id", employeeIds);

      const empToCompany = new Map(employees?.map((e) => [e.id, e.company_id]));

      for (const item of attendances) {
        const company_id = empToCompany.get(item.employee_id);
        if (company_id && item.month && item.year) {
          const key = `${company_id}-${item.month}-${item.year}`;
          monthYearsMap.set(key, {
            month: item.month,
            year: item.year,
            company_id,
          });
        }
      }

      if (monthYearsMap.size > 0) {
        await setPayrollPendingByMonthYear({
          supabase,
          monthYears: Array.from(monthYearsMap.values()),
        });
      }
    }
  }

  return { error, status };
}

export async function updateAttendance({
  supabase,
  data,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeMonthlyAttendanceDatabaseUpdate;
}) {
  const { error, status } = await supabase
    .from("monthly_attendance")
    .update(data)
    .eq("id", data.id!)
    .single();

  if (error) {
    console.error("updateOrAddAttendance Error", error);
    return { error, status };
  }

  return { error, status };
}

export async function createEmployeeAttendanceImportedData({
  supabase,
  data,
  intent,
}: {
  supabase: TypedSupabaseClient;
  data: EmployeeMonthlyAttendanceDatabaseInsert[];
  intent?: string;
}) {
  const sanitizeNumber = (val: any, defaultVal = 0) => {
    if (
      val === null ||
      val === undefined ||
      val === "" ||
      val === "N/A" ||
      val === "n/a" ||
      val === "--" ||
      val === "-"
    ) {
      return defaultVal;
    }
    const num = typeof val === "number" ? val : Number.parseFloat(String(val).trim());
    return Number.isNaN(num) ? defaultVal : num;
  };

  const dataWithTimestamp = data.map((item) => {
    const {
      employee_code,
      uan_number,
      employee_name,
      sheet_name,
      is_new_employee,
      isConflicting,
      sheet_employee_name,
      raw_row,
      is_site_header,
      is_missing_matching_key,
      avatar,
      casual_leave,
      paid_leave,
      earned_leave,
      sick_leave,
      maternity_leave,
      paternity_leave,
      weekly_off,
      ...dbFields
    } = item as any;

    return {
      ...dbFields,
      present_days: sanitizeNumber(dbFields.present_days, 0),
      working_days: sanitizeNumber(dbFields.working_days, 0),
      absent_days: sanitizeNumber(dbFields.absent_days, 0),
      overtime_hours: sanitizeNumber(dbFields.overtime_hours, 0),
      paid_holidays: sanitizeNumber(dbFields.paid_holidays, 0),
      casual_leaves: sanitizeNumber(dbFields.casual_leaves ?? casual_leave, 0),
      paid_leaves: sanitizeNumber(dbFields.paid_leaves ?? paid_leave ?? earned_leave, 0),
    };
  });

  const uniqueMap = new Map<string, any>();
  let fallbackIndex = 0;
  for (const item of dataWithTimestamp) {
    if (item.employee_id && item.month && item.year) {
      const key = `${item.employee_id}-${item.month}-${item.year}`;
      uniqueMap.set(key, item);
    } else {
      uniqueMap.set(`fallback-${fallbackIndex++}`, item);
    }
  }
  const uniqueDataWithTimestamp = Array.from(uniqueMap.values());

  const { error, status } = await supabase
    .from("monthly_attendance")
    .upsert(uniqueDataWithTimestamp, {
      onConflict: "employee_id,month,year",
      ignoreDuplicates: intent !== "update",
    })
    .select();

  if (error) {
    console.error("createAttendancesFromImportedData Error:", error);
    return { status, error };
  }

  if (data?.length) {
    const monthYearsMap = new Map<
      string,
      { month: number; year: number; company_id: string }
    >();

    const employeeIds = [...new Set(data.map((item) => item.employee_id))];
    const { data: employees } = await supabase
      .from("employees")
      .select("id, company_id")
      .in("id", employeeIds);

    const empToCompany = new Map(employees?.map((e) => [e.id, e.company_id]));

    for (const item of data) {
      const company_id = empToCompany.get(item.employee_id);
      if (company_id && item.month && item.year) {
        const key = `${company_id}-${item.month}-${item.year}`;
        monthYearsMap.set(key, {
          month: item.month,
          year: item.year,
          company_id,
        });
      }
    }

    if (monthYearsMap.size > 0) {
      await setPayrollPendingByMonthYear({
        supabase,
        monthYears: Array.from(monthYearsMap.values()),
      });
    }
  }

  return { status, error };
}

export async function deleteAttendanceById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  await supabase
    .from("salary_entries")
    .delete()
    .eq("monthly_attendance_id", id)
    .is("invoice_id", null);

  await supabase.from("daily_attendance").delete().eq("attendance_id", id);

  const { error, status } = await supabase
    .from("monthly_attendance")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteAttendanceById Error:", error);
    return { status, error };
  }

  if (status < 200 || status >= 300) {
    console.error("deleteAttendanceById Unexpected Supabase status:", status);
  }

  return { status, error: null };
}

export async function createAttendanceByPayrollImportAndGiveID({
  supabase,
  month,
  year,
  employee_id,
  insertData,
}: {
  supabase: TypedSupabaseClient;
  year: number;
  month: number;
  employee_id: string;
  insertData: Partial<EmployeeMonthlyAttendanceDatabaseInsert>;
}) {
  const cleanInsertData: Record<string, any> = {};
  for (const key in insertData) {
    const val = (insertData as any)[key];
    if (val !== undefined && val !== null) {
      if (key === "created_at") {
        cleanInsertData[key] = val;
      } else if (typeof val === "string") {
        const num = Number.parseFloat(val);
        cleanInsertData[key] = Number.isNaN(num) ? val : num;
      } else {
        cleanInsertData[key] = val;
      }
    }
  }

  const { data, error, status } = await supabase
    .from("monthly_attendance")
    .insert([
      {
        ...cleanInsertData,
        employee_id,
        month,
        year,
      },
    ])
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existingData, error: selectError } = await supabase
        .from("monthly_attendance")
        .select("id")
        .eq("employee_id", employee_id)
        .eq("month", month)
        .eq("year", year)
        .single();

      if (selectError || !existingData) {
        console.error("Error fetching existing attendance:", selectError);
        return { data: null, error: selectError || new Error("Not found") };
      }

      // Update existing record with the new values
      const { error: updateError } = await supabase
        .from("monthly_attendance")
        .update(cleanInsertData)
        .eq("id", existingData.id);

      if (updateError) {
        console.error("Error updating existing attendance on conflict:", updateError);
        return { data: null, error: updateError };
      }

      return { data: existingData, error: null, status: 200 };
    }

    console.error("createAttendanceByPayrollImportAndGiveID Error:", error);
    return { data: null, error, status };
  }

  if (!error && data?.id) {
    const { data: employees } = await supabase
      .from("employees")
      .select("id, company_id")
      .eq("id", employee_id);

    const company_id = employees?.[0]?.company_id;
    if (company_id) {
      await setPayrollPendingByMonthYear({
        supabase,
        monthYears: [{ month, year, company_id }],
      });
    }
  }

  return { data, error: null, status };
}

export async function updateMultipleAttendances({
  supabase,
  attendancesData,
}: {
  supabase: TypedSupabaseClient;
  attendancesData: EmployeeMonthlyAttendanceDatabaseUpdate[];
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

  for (const entry of attendancesData) {
    const updateObj: Record<string, any> = {};
    if (entry.month) updateObj.month = entry.month;
    if (entry.year) updateObj.year = entry.year;
    if (entry.working_days) updateObj.working_days = entry.working_days;

    if (Object.keys(updateObj).length === 0) continue;

    const { error, status } = await supabase
      .from("monthly_attendance")
      .update(updateObj)
      .eq("id", entry.id!);

    if (error) {
      console.error("Error updating entry:", error);
      return { error, status };
    }
  }

  return { error: null, status: 200 };
}

export async function deleteMultipleAttendances({
  supabase,
  attendanceIds,
}: {
  supabase: TypedSupabaseClient;
  attendanceIds: string[];
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

  if (!attendanceIds || attendanceIds.length === 0) {
    return {
      status: 400,
      error: "No attendance IDs provided",
    };
  }

  await supabase
    .from("salary_entries")
    .delete()
    .in("monthly_attendance_id", attendanceIds)
    .is("invoice_id", null);

  await supabase
    .from("daily_attendance")
    .delete()
    .in("attendance_id", attendanceIds);

  const { error, status } = await supabase
    .from("monthly_attendance")
    .delete()
    .in("id", attendanceIds);

  if (error) {
    console.error("Error deleting attendances:", error);
    return { error, status };
  }

  return { error: null, status };
}

export async function getEmployeeAttendanceConflicts({
  supabase,
  importedData,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  importedData: any[];
  companyId?: string;
}) {
  if (!importedData || importedData.length === 0) {
    return { conflictingIndices: [], error: null };
  }

  const employeeCodes = [
    ...new Set(importedData.map((d: any) => d.employee_code).filter(Boolean)),
  ];
  const uanNumbers = [
    ...new Set(importedData.map((d: any) => d.uan_number).filter(Boolean)),
  ];
  const names = [
    ...new Set(importedData.map((d: any) => d.employee_name).filter(Boolean)),
  ];

  const { data: empMap, error: empErr } = await getEmployeeIdsByIdentifiers({
    supabase,
    identifiers: [...employeeCodes, ...uanNumbers, ...names],
    companyId,
  });

  if (empErr || !empMap) {
    return { conflictingIndices: [], error: empErr };
  }

  const employeeIds = Array.from(empMap.values());
  if (employeeIds.length === 0) {
    return { conflictingIndices: [], error: null };
  }

  const monthYears = Array.from(
    new Set(importedData.map((d) => `${d.month}-${d.year}`)),
  );

  let allExisting: any[] = [];

  for (const my of monthYears) {
    const [m, y] = my.split("-").map(Number);
    const { data, error } = await supabase
      .from("monthly_attendance")
      .select("employee_id, month, year")
      .in("employee_id", employeeIds) // Filter by our company's employee IDs
      .eq("month", m)
      .eq("year", y);

    if (!error && data) {
      allExisting.push(...data);
    }
  }

  const existingKeys = new Set(
    allExisting.map((e) => `${e.employee_id}-${e.month}-${e.year}`),
  );

  const conflictingIndices = importedData.reduce(
    (indices: number[], record, index) => {
      const employeeId =
        empMap.get(String(record.employee_code || "").trim()) ||
        empMap.get(String(record.uan_number || "").trim()) ||
        empMap.get(String(record.employee_name || "").trim());

      if (employeeId) {
        const key = `${employeeId}-${record.month}-${record.year}`;
        if (existingKeys.has(key)) {
          indices.push(index);
        }
      }
      return indices;
    },
    [],
  );

  return { conflictingIndices, error: null };
}

export async function deleteMultipleMonthlyAndYearlyAttendances({
  supabase,
  ids,
  type,
}: {
  supabase: TypedSupabaseClient;
  ids: string[];
  type: "month" | "year";
}) {
  const table = type === "month" ? "month_attendance" : "yearly_attendance";

  const { error, status } = await supabase
    .from(table as any)
    .delete()
    .in("id", ids);

  if (error) {
    console.error(`Error deleting from ${table}:`, error);
  }

  return { error, status };
}

export async function createDailyAttendancesFromImportedData({
  supabase,
  data,
  intent,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  data: any[];
  intent?: string;
  companyId?: string;
}) {
  try {
    const cleanId = (id: any) => {
      const s = String(id || "").trim();
      if (s.includes(".")) return s.split(".")[0];
      return s;
    };
    const identifiers = [
      ...new Set(
        data
          .flatMap((d: any) => [
            cleanId(d.employee_code),
            cleanId(d.uan_number),
            cleanId(d.employee_name),
          ])
          .filter(Boolean),
      ),
    ];
    const { data: empMap, error: empErr } = await getEmployeeIdsByIdentifiers({
      supabase,
      identifiers,
      companyId,
    });

    if (empErr || !empMap) {
      console.error("Failed to fetch employees for daily attendance:", empErr);
      return { status: 500, error: empErr || new Error("Employees not found") };
    }

    const empCodeToId = empMap;

    const holidayDates = new Set<string>();
    const employeeIds = Array.from(empCodeToId.values());
    if (employeeIds.length > 0) {
      const { data: empWithCompany } = await supabase
        .from("employees")
        .select("company_id")
        .eq("id", employeeIds[0])
        .single();

      if (empWithCompany?.company_id) {
        const { data: holidays } = await supabase
          .from("holidays")
          .select("start_date, no_of_days")
          .eq("company_id", empWithCompany.company_id);

        if (holidays) {
          for (const h of holidays) {
            const start = new Date(h.start_date);
            for (let i = 0; i < (h.no_of_days || 1); i++) {
              const d = new Date(start);

              d.setUTCDate(d.getUTCDate() + i);
              holidayDates.add(d.toISOString().split("T")[0]);
            }
          }
        }
      }
    }
    // -------------------------------

    const monthToNumber = (m: string | number) => {
      if (typeof m === "number") return m;
      const found = payoutMonths.find(
        (pm) => pm.label.toLowerCase() === String(m).toLowerCase(),
      );
      return found ? found.value : new Date().getMonth() + 1;
    };

    // Group records by employee_id + month + year
    const groupedTasks = new Map<
      string,
      {
        employee_id: string;
        month: number;
        year: number;
        overtime_hours: number;
        records: any[];
      }
    >();
    const attendanceIdToOvertime = new Map<string, number>();

    for (const record of data) {
      let employee_id = record.employee_id;
      if (!employee_id) {
        const empIdentifier =
          cleanId(record.uan_number) ||
          cleanId(record.employee_code) ||
          cleanId(record.employee_name);
        employee_id = empCodeToId.get(empIdentifier);

        if (!employee_id && record.uan_number) {
          employee_id = empCodeToId.get(cleanId(record.uan_number));
        }
        if (!employee_id && record.employee_code) {
          employee_id = empCodeToId.get(cleanId(record.employee_code));
        }
        if (!employee_id && record.employee_name) {
          employee_id = empCodeToId.get(cleanId(record.employee_name));
        }
      }

      if (!employee_id) continue;

      let month: number;
      let year: number;

      if (record.target_month && record.target_year) {
        month = monthToNumber(record.target_month);
        year = Number(record.target_year);
      } else {
        const dateObj = new Date(record.date);
        month = dateObj.getMonth() + 1;
        year = dateObj.getFullYear();
      }

      const key = `${employee_id}-${month}-${year}`;
      if (!groupedTasks.has(key)) {
        groupedTasks.set(key, {
          employee_id,
          month,
          year,
          overtime_hours: Number(record.overtime_hours || 0),
          records: [],
        });
      }
      groupedTasks.get(key)!.records.push(record);
    }

    const dailyAttendanceInserts: any[] = [];

    for (const group of groupedTasks.values()) {
      let attendance_id: string | undefined;

      const { data: existingMonthly, error: monthlyErr } = await supabase
        .from("monthly_attendance")
        .select("id")
        .eq("employee_id", group.employee_id)
        .eq("month", group.month)
        .eq("year", group.year)
        .maybeSingle();

      if (existingMonthly?.id) {
        attendance_id = existingMonthly.id;
      } else {
        const { data: newMonthly, error: insertErr } = await supabase
          .from("monthly_attendance")
          .insert({
            employee_id: group.employee_id,
            month: group.month,
            year: group.year,

            present_days: 0,
            absent_days: 0,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("Failed to auto-create monthly record:", insertErr);
        }
        attendance_id = newMonthly?.id;
      }

      if (!attendance_id) continue;
      attendanceIdToOvertime.set(attendance_id, group.overtime_hours);

      for (const rec of group.records) {
        let normalizedDate: string = rec.date;
        try {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) {
            const dateObj = new Date(rec.date);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, "0");
            const d = String(dateObj.getDate()).padStart(2, "0");
            normalizedDate = `${y}-${m}-${d}`;
          }
        } catch (e) {
          normalizedDate = rec.date;
        }

        const val = String(rec.present || "")
          .trim()
          .toUpperCase();
        if (!val) continue;

        const isHolidayMatch = holidayDates.has(normalizedDate);

        const isPresent =
          val === "P" ||
          val === "WOF" ||
          val === "(WOF)" ||
          val === "WO" ||
          val === "W" ||
          val === "PH" ||
          (val === "H" && isHolidayMatch) ||
          (val === "HD" && isHolidayMatch) ||
          val === "CL" ||
          val === "EL" ||
          val === "ML" ||
          val === "PL";

        const isHoliday =
          val === "WOF" ||
          val === "(WOF)" ||
          val === "WO" ||
          val === "W" ||
          val === "PH" ||
          (val === "H" && isHolidayMatch) ||
          (val === "HD" && isHolidayMatch) ||
          val === "CL" ||
          val === "EL" ||
          val === "ML" ||
          val === "PL";

        const hours =
          rec.hours !== undefined && rec.hours !== null ? Number(rec.hours) : 8;

        const newDailyInsert: any = {
          attendance_id,
          date: normalizedDate,
          present: isPresent,
          holiday: isHoliday,
          no_of_hours: hours,
          overtime_hours: Math.round(Number(rec.overtime_hours || 0)),
        };

        if (val === "WOF" || val === "(WOF)" || val === "WO" || val === "W") {
          newDailyInsert.holiday_type = "weekly";
        } else if (val === "CL") {
          newDailyInsert.holiday_type = "casual_leave";
        } else if (val === "PH" || (isHolidayMatch && isPresent)) {
          newDailyInsert.holiday_type = "paid_holiday";
        } else if (val === "EL" || val === "ML" || val === "PL") {
          newDailyInsert.holiday_type = "paid_leave";
        } else if (val === "H" || val === "HD") {
        }

        if (
          rec.in_time &&
          typeof rec.in_time === "string" &&
          rec.in_time.trim().length > 0
        )
          newDailyInsert.in_time = rec.in_time;
        if (
          rec.out_time &&
          typeof rec.out_time === "string" &&
          rec.out_time.trim().length > 0
        )
          newDailyInsert.out_time = rec.out_time;

        dailyAttendanceInserts.push(newDailyInsert);
      }
    }

    if (dailyAttendanceInserts.length === 0) {
      return {
        status: 400,
        error: new Error("No valid records found to insert."),
      };
    }

    const uniqueRecordsMap = new Map<string, any>();
    for (const record of dailyAttendanceInserts) {
      const internalKey = `${record.attendance_id}-${record.date}`;
      uniqueRecordsMap.set(internalKey, record);
    }
    const finalAttendanceInserts = Array.from(uniqueRecordsMap.values());

    if (intent !== "update") {
      const attendanceIds = [
        ...new Set(finalAttendanceInserts.map((r) => r.attendance_id)),
      ];
      const dates = [...new Set(finalAttendanceInserts.map((r) => r.date))];

      const { data: existingDaily, error: checkErr } = await supabase
        .from("daily_attendance")
        .select("attendance_id, date")
        .in("attendance_id", attendanceIds)
        .in("date", dates);

      if (checkErr) {
        console.error("Error checking existing daily attendance:", checkErr);
      }

      if (existingDaily && existingDaily.length > 0) {
        const existingKeys = new Set(
          existingDaily.map((r: any) => `${r.attendance_id}-${r.date}`),
        );
        const conflictingRecords = finalAttendanceInserts.filter((r) =>
          existingKeys.has(`${r.attendance_id}-${r.date}`),
        );

        if (conflictingRecords.length > 0) {
          return {
            status: 409,
            error: new Error(
              "Attendance for this employee and period already exists. If you want to update it, please use the 'Update daily attendance' option.",
            ),
          };
        }
      }
    }

    const groupedDeletes = new Map<string, string[]>();
    for (const record of finalAttendanceInserts) {
      if (!groupedDeletes.has(record.attendance_id)) {
        groupedDeletes.set(record.attendance_id, []);
      }
      groupedDeletes.get(record.attendance_id)!.push(record.date);
    }

    if (intent === "update") {
      for (const [attendance_id, dates] of groupedDeletes.entries()) {
        await supabase
          .from("daily_attendance")
          .delete()
          .eq("attendance_id", attendance_id)
          .in("date", dates);
      }
    }

    const { error: insertErr, status } = await supabase
      .from("daily_attendance")
      .upsert(finalAttendanceInserts, {
        onConflict: "attendance_id,date",
        ignoreDuplicates: intent === "update" ? false : true,
      });

    if (insertErr) {
      console.error("Targeted Refresh Insert Error:", insertErr);
      return { error: insertErr, status };
    }

    for (const attendance_id of groupedDeletes.keys()) {
      const { data: allDaily } = await supabase
        .from("daily_attendance")
        .select("present, no_of_hours, holiday, holiday_type, overtime_hours")
        .eq("attendance_id", attendance_id);

      if (allDaily) {
        const presents = allDaily.filter(
          (d) => d.present && !d.holiday && d.holiday_type !== "weekly",
        ).length;

        const absents = allDaily.filter((d) => !d.present && !d.holiday).length;

        const paidHolidays = allDaily.filter(
          (d) => d.holiday && d.holiday_type === "paid_holiday",
        ).length;
        const paidLeaves = allDaily.filter(
          (d) => d.holiday && d.holiday_type === "paid_leave",
        ).length;
        const casualLeaves = allDaily.filter(
          (d) => d.holiday && d.holiday_type === "casual_leave",
        ).length;

        const otHours = allDaily.reduce(
          (sum, d: any) => sum + Number(d.overtime_hours || 0),
          0,
        );

        await supabase
          .from("monthly_attendance")
          .update({
            present_days: presents,
            absent_days: absents,
            paid_holidays: paidHolidays,
            paid_leaves: paidLeaves,
            casual_leaves: casualLeaves,
            overtime_hours: otHours,
          })
          .eq("id", attendance_id);
      }
    }

    return { status: 200, error: null };
  } catch (error) {
    console.error(
      "Exception in createDailyAttendancesFromImportedData:",
      error,
    );
    return { status: 500, error };
  }
}
