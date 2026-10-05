import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import JSZip from "jszip";
import { generateSalarySlipPdf } from "@/components/employees/pdf/salary-slip-pdf";
import { getMonthNameFromNumber } from "@canny_ecosystem/utils";
import {
  getCompanyById,
  getCompanyConfigByCompanyId,
  getEmployeeStatutoryDetailsById,
  getEmployeeWorkDetailsByEmployeeIdForOthers,
  getPrimaryLocationByCompanyId,
} from "@canny_ecosystem/supabase/queries";

const isPFField = (name: string) => {
  const lower = (name || "").trim().toLowerCase();
  return (
    lower === "pf" ||
    lower === "epf" ||
    lower.includes("provident fund") ||
    lower.includes("provident_fund") ||
    lower.includes("pf contribution")
  );
};

const isESIField = (name: string) => {
  const lower = (name || "").trim().toLowerCase();
  return (
    lower === "esi" ||
    lower === "esic" ||
    lower.includes("esic contribution") ||
    lower.includes("esi contribution") ||
    lower.includes("state insurance")
  );
};

function getEmployerContributions(fieldValues: any[] = []) {
  const explicit = fieldValues
    .filter(
      (x: any) =>
        x.payroll_fields?.type === "employer_contribution" ||
        x.payroll_fields?.type === "employer" ||
        x.payroll_fields?.name?.toLowerCase().includes("employer"),
    )
    .map((x: any) => ({
      name: x.payroll_fields?.name,
      amount: x.amount,
    }));

  if (explicit.length > 0) return explicit;

  const derived: { name: string; amount: number }[] = [];
  const deductions = fieldValues.filter(
    (x: any) => x.payroll_fields?.type === "deduction",
  );

  for (const ded of deductions) {
    const fieldName = ded.payroll_fields?.name || "";
    const amount = Number(ded.amount) || 0;
    if (amount <= 0) continue;

    if (isPFField(fieldName)) {
      derived.push({
        name: "PF",
        amount: Math.round((amount * 13) / 12),
      });
    } else if (isESIField(fieldName)) {
      derived.push({
        name: "ESIC",
        amount: Math.round((amount * 3.25) / 0.75),
      });
    }
  }

  return derived;
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const employeeIdsRaw = formData.get("employeeIds") as string;
    const startMonth = Number(formData.get("startMonth"));
    const startYear = Number(formData.get("startYear"));
    const endMonth = Number(formData.get("endMonth"));
    const endYear = Number(formData.get("endYear"));

    if (!employeeIdsRaw || !startMonth || !startYear || !endMonth || !endYear) {
      return json(
        { success: false, message: "Missing required parameters" },
        { status: 400 },
      );
    }

    const employeeIds = employeeIdsRaw.split(",").filter(Boolean);
    if (employeeIds.length === 0) {
      return json(
        { success: false, message: "No employees selected" },
        { status: 400 },
      );
    }

    const { supabase } = getSupabaseWithHeaders({ request });

    // Fetch candidate monthly_attendance records containing salary entries for all chosen employees
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("monthly_attendance")
      .select(`
        id,
        employee_id,
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
          company_id,
          first_name,
          middle_name,
          last_name,
          employee_code,
          employee_bank_details (
            bank_name,
            account_number
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
      `)
      .in("employee_id", employeeIds)
      .gte("year", startYear)
      .lte("year", endYear);

    if (attendanceError) {
      return json(
        { success: false, message: attendanceError.message },
        { status: 500 },
      );
    }

    // Filter by months in memory
    const startVal = startYear * 100 + startMonth;
    const endVal = endYear * 100 + endMonth;
    const filteredEntries = (attendanceData || []).filter((row) => {
      const rowVal = row.year * 100 + row.month;
      return rowVal >= startVal && rowVal <= endVal;
    });

    if (filteredEntries.length === 0) {
      return json(
        {
          success: false,
          message: "No salary slips found in the selected range",
        },
        { status: 404 },
      );
    }

    // Fetch unique company IDs
    const companyIds = Array.from(
      new Set(
        filteredEntries
          .map((row) => row.employee?.company_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    );

    const companyCache: { [id: string]: any } = {};
    const locationCache: { [id: string]: any } = {};
    const configCache: { [id: string]: any } = {};
    for (const cid of companyIds) {
      const { data: comp } = await getCompanyById({
        supabase: supabase as any,
        id: cid,
      });
      const { data: loc } = await getPrimaryLocationByCompanyId({
        supabase: supabase as any,
        companyId: cid,
      });
      const { data: config } = await getCompanyConfigByCompanyId({
        supabase: supabase as any,
        companyId: cid,
      });
      companyCache[cid] = comp;
      locationCache[cid] = loc;
      configCache[cid] = config;
    }

    // Fetch statutory details for all selected employee IDs
    const statutoryCache: { [id: string]: any } = {};
    for (const eid of employeeIds) {
      const { data: stat } = await getEmployeeStatutoryDetailsById({
        supabase: supabase as any,
        id: eid,
      });
      statutoryCache[eid] = stat;
    }

    const zip = new JSZip();

    // Loop through each entry, build data and render pdf
    for (const row of filteredEntries) {
      const employee = row.employee;
      if (!employee) continue;

      const employeeId = employee.id;
      const companyId = employee.company_id;
      const employeeCompanyData = companyCache[companyId];
      const employeeCompanyLocationData = locationCache[companyId];
      const employeeCompanyConfig = configCache[companyId];
      const employeeStatutoryDetails = statutoryCache[employeeId];

      const { data: employeeProjectAssignmentData } =
        await getEmployeeWorkDetailsByEmployeeIdForOthers({
          supabase: supabase as any,
          employeeId,
          month: row.month,
          year: row.year,
        });

      const bankDetailsRaw = employee.employee_bank_details;
      const bankDetails = Array.isArray(bankDetailsRaw)
        ? bankDetailsRaw[0]
        : bankDetailsRaw;

      // Extract raw salary entries (handle both array and object formats)
      const salaryEntry = Array.isArray(row.salary_entries)
        ? row.salary_entries[0]
        : row.salary_entries;
      const fieldValues = salaryEntry?.salary_field_values || [];

      const slipData = {
        month: getMonthNameFromNumber(row.month),
        year: row.year,
        companyData: {
          name: employeeCompanyData?.name || "",
          address_line_1: employeeCompanyLocationData?.address_line_1 || "",
          address_line_2: employeeCompanyLocationData?.address_line_2 || "",
          city: employeeCompanyLocationData?.city || "",
          state: employeeCompanyLocationData?.state || "",
          pincode: employeeCompanyLocationData?.pincode || "",
          company_salary_prefix: employeeCompanyConfig?.company_salary_prefix || "",
          show_employer_contribution: employeeCompanyConfig?.show_employer_contribution ?? false,
        },
        employee: {
          employeeData: {
            first_name: employee.first_name,
            middle_name: employee.middle_name,
            last_name: employee.last_name,
            employee_code: employee.employee_code,
          },
          employeeProjectAssignmentData: {
            position: employeeProjectAssignmentData?.position || "",
            start_date: employeeProjectAssignmentData?.start_date || "",
            location:
              employeeProjectAssignmentData?.sites?.company_locations?.name ||
              "",
            department: employeeProjectAssignmentData?.departments?.name || "",
          },
          employeeStatutoryDetails: employeeStatutoryDetails || ({} as any),
          attendance: {
            working_days: row.working_days || 0,
            paid_days: row.present_days || 0,
            paid_leaves: row.paid_leaves || 0,
            casual_leaves: row.casual_leaves || 0,
            absents: row.absent_days || 0,
            overtime_hours: row.overtime_hours || 0,
          },
          bankDetails: {
            bank: bankDetails?.bank_name || "",
            account_number: bankDetails?.account_number || "",
          },
          earnings:
            fieldValues
              .filter(
                (x: any) =>
                  Number(x.amount || 0) > 0 &&
                  (x.payroll_fields?.type || x.type) !== "deduction" &&
                  (x.payroll_fields?.type || x.type) !== "employer_contribution" &&
                  (x.payroll_fields?.type || x.type) !== "employer" &&
                  !(x.payroll_fields?.name || x.name || "").toLowerCase().includes("employer"),
              )
              .map((x: any) => ({
                name: x.payroll_fields?.name || x.name,
                amount: Number(x.amount || 0),
              })) || [],
          deductions:
            fieldValues
              .filter(
                (x: any) =>
                  Number(x.amount || 0) > 0 &&
                  (x.payroll_fields?.type || x.type) === "deduction",
              )
              .map((x: any) => ({
                name: x.payroll_fields?.name || x.name,
                amount: Number(x.amount || 0),
              })) || [],
          employerContributions: getEmployerContributions(fieldValues),
        },
      };

      const buffer = await generateSalarySlipPdf(slipData as any);

      const employeeName = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
      ]
        .filter(Boolean)
        .join(" ");

      const folderName = employee.employee_code
        ? `${employeeName} - ${employee.employee_code}`
        : employeeName;

      const fileName = `salary_slip_${row.year}_${String(row.month).padStart(2, "0")}.pdf`;
      zip.file(`${folderName}/${fileName}`, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=salary_slips_bulk.zip`,
      },
    });
  } catch (error: any) {
    console.error("Bulk download slips error:", error);
    return json(
      { success: false, message: error?.message || "Failed to generate zip" },
      { status: 500 },
    );
  }
}
