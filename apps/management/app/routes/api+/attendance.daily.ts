import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");
  const siteId = url.searchParams.get("siteId");
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");

  if ((!employeeId && !siteId) || !month || !year) {
    return json(
      { status: "error", message: "Missing parameters" },
      { status: 400 },
    );
  }

  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  let employeeIds: string[] = [];

  if (employeeId) {
    // Resolve employee UUID from code if needed
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id")
      .or(`employee_code.eq."${employeeId}",id.eq."${employeeId}"`)
      .maybeSingle();

    if (empError)
      return json(
        { status: "error", message: empError.message },
        { status: 500 },
      );
    if (employee) employeeIds.push(employee.id);
  } else if (siteId) {
    // Get all employees for this site
    const { data: siteEmployees, error: siteError } = await supabase
      .from("employee_work_details")
      .select("employee_id")
      .eq("site_id", siteId);

    if (siteError)
      return json(
        { status: "error", message: siteError.message },
        { status: 500 },
      );
    employeeIds = siteEmployees.map((e) => e.employee_id);
  }

  if (employeeIds.length === 0) {
    return json({ status: "success", data: [] });
  }

  // Get the monthly attendance records to get the IDs
  const { data: monthlyAttendances, error: monthlyError } = await supabase
    .from("monthly_attendance")
    .select("id, employee_id, overtime_hours")
    .in("employee_id", employeeIds)
    .eq("month", monthNum)
    .eq("year", yearNum);

  if (monthlyError) {
    return json(
      { status: "error", message: monthlyError.message },
      { status: 500 },
    );
  }

  if (!monthlyAttendances || monthlyAttendances.length === 0) {
    return json({ status: "success", data: [] });
  }

  const attendanceIds = monthlyAttendances.map((m) => m.id);

  // Get the daily attendance records
  const { data: dailyAttendance, error: dailyError } = await supabase
    .from("daily_attendance")
    .select("*, monthly_attendance(employee_id)")
    .in("attendance_id", attendanceIds);

  if (dailyError) {
    return json(
      { status: "error", message: dailyError.message },
      { status: 500 },
    );
  }

  // Flatten the response to include employee_id
  const flattenedData = dailyAttendance.map((d: any) => ({
    ...d,
    employee_id: d.monthly_attendance?.employee_id,
  }));

  return json({
    status: "success",
    data: flattenedData,
    monthlyData: monthlyAttendances,
  });
}
