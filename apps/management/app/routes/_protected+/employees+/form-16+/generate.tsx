import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getCompanyById,
  getLocationsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import {
  numberToWordsIndian,
  CANNY_MANAGEMENT_SERVICES_COMPANY_ID,
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_PAN_NUMBER,
  CANNY_MANAGEMENT_SERVICES_OWNER,
} from "@/constant";
import ExcelJS from "exceljs";

// Helper to sanitize database string inputs
function formatUnderscoreText(str: string | null | undefined) {
  if (!str) return "";
  return str
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => {
      if (word.toLowerCase() === "iti") return "ITI";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");

  const today = new Date();
  const currentMonth = today.getMonth(); // 0 = Jan, 3 = Apr
  const currentYear = today.getFullYear();
  const defaultFinancialYear =
    currentMonth >= 3
      ? `${currentYear - 1}-${String(currentYear).slice(-2)}`
      : `${currentYear - 2}-${String(currentYear - 1).slice(-2)}`;

  const financialYear =
    url.searchParams.get("financialYear") || defaultFinancialYear;

  if (!employeeId) {
    return json({ message: "Employee ID is required" }, { status: 400 });
  }

  const { supabase } = getSupabaseWithHeaders({ request });

  // 1. Fetch Company Details
  // Fetch Canny Management Services details as the Deductor
  const [companyRes, locationsRes] = await Promise.all([
    getCompanyById({ supabase, id: CANNY_MANAGEMENT_SERVICES_COMPANY_ID }),
    getLocationsByCompanyId({
      supabase,
      companyId: CANNY_MANAGEMENT_SERVICES_COMPANY_ID,
    }),
  ]);

  const companyDetails = companyRes?.data;
  const companyLocations = locationsRes?.data;

  const primaryLoc =
    companyLocations?.find((l) => l.is_primary) || companyLocations?.[0];
  const employerName = CANNY_MANAGEMENT_SERVICES_NAME;
  const employerAddress = CANNY_MANAGEMENT_SERVICES_ADDRESS;
  const employerPan = CANNY_MANAGEMENT_SERVICES_PAN_NUMBER;
  const employerTan = primaryLoc?.tan_number || "";

  // 2. Fetch Employee Details
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select(`
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      date_of_birth,
      gender,
      nationality,
      marital_status,
      employee_statutory_details!left(
        pan_number
      ),
      employee_addresses!left(
        address_type,
        address_line_1,
        city,
        state,
        pincode,
        is_primary
      ),
      employee_guardians!left(
        relationship,
        first_name,
        last_name
      )
    `)
    .eq("id", employeeId)
    .single();

  if (employeeError || !employee) {
    return json(
      { message: "Failed to fetch employee details" },
      { status: 500 },
    );
  }

  const employeeFullName = [
    employee.first_name,
    employee.middle_name,
    employee.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  const addresses = Array.isArray(employee.employee_addresses)
    ? employee.employee_addresses
    : employee.employee_addresses
      ? [employee.employee_addresses]
      : [];

  const permAddr =
    addresses.find((a: any) => a.address_type?.toLowerCase() === "permanent") ||
    addresses.find((a: any) => a.is_primary) ||
    addresses?.[0];

  const employeeAddressLine1 = permAddr ? permAddr.address_line_1 || "" : "";
  const employeeAddressLine2 = permAddr
    ? `${permAddr.city || ""}, ${permAddr.state || ""} ${permAddr.pincode || ""}`.trim()
    : "";

  const statutoryDetails = Array.isArray(employee.employee_statutory_details)
    ? employee.employee_statutory_details[0]
    : employee.employee_statutory_details;

  const employeePan = statutoryDetails?.pan_number || "";

  // 3. Fetch Work Details for Designation
  const { data: workDetails } = await supabase
    .from("work_details")
    .select("position")
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false });

  const employeeDesignation = workDetails?.[0]?.position
    ? formatUnderscoreText(workDetails[0].position)
    : "";

  // 4. Fetch Guardian (Father) for Verification
  const guardians = Array.isArray(employee.employee_guardians)
    ? employee.employee_guardians
    : employee.employee_guardians
      ? [employee.employee_guardians]
      : [];

  const father = guardians.find(
    (g: any) => g.relationship?.toLowerCase() === "father",
  );
  const verifierFathersName = "";

  // 5. Fetch Salary / Attendance Details for Financial Year
  const { data: attendanceList } = await supabase
    .from("monthly_attendance")
    .select(`
      id,
      month,
      year,
      salary_entries!left (
        id,
        monthly_ctc,
        salary_field_values (
          id,
          amount,
          payroll_fields (
            name,
            type
          )
        )
      )
    `)
    .eq("employee_id", employeeId);

  // Parse Financial Year
  const startYear = parseInt(financialYear.split("-")[0], 10);
  const endYear = startYear + 1;

  const filteredAttendance = (attendanceList || []).filter((r) => {
    const y = parseInt(r.year, 10);
    const m = parseInt(r.month, 10);
    if (y === startYear && m >= 4 && m <= 12) return true;
    if (y === endYear && m >= 1 && m <= 3) return true;
    return false;
  });

  let salary17_1 = 0;
  let providentFund = 0;
  let esic = 0;
  let lwf = 0;
  let professionalTax = 0;
  let bonus = 0;
  let leave = 0;
  let conveyance = 0;
  let fixedAllowance = 0;

  for (const record of filteredAttendance) {
    const entries = Array.isArray(record.salary_entries)
      ? record.salary_entries
      : record.salary_entries
        ? [record.salary_entries]
        : [];
    const entry = entries[0];
    if (!entry) continue;

    const fieldValues = entry.salary_field_values || [];
    for (const val of fieldValues) {
      const fieldName = (val.payroll_fields?.name || "").toLowerCase().trim();
      const fieldType = (val.payroll_fields?.type || "earning")
        .toLowerCase()
        .trim();
      const amount = Math.round(Number(val.amount || 0));

      if (
        fieldName === "epf" ||
        fieldName === "pf" ||
        fieldName === "provident fund" ||
        fieldName === "employee provident fund"
      ) {
        providentFund += amount;
      } else if (
        fieldName === "esic" ||
        fieldName === "esi" ||
        fieldName === "employee state insurance"
      ) {
        esic += amount;
      } else if (fieldName === "lwf" || fieldName === "labour welfare fund") {
        lwf += amount;
      } else if (
        fieldName === "pt" ||
        fieldName === "professional tax" ||
        fieldName === "tax on employment"
      ) {
        professionalTax += amount;
      } else if (fieldName === "bonus") {
        bonus += amount;
      } else if (
        fieldName === "leave" ||
        fieldName === "leave encashment" ||
        fieldName === "lta"
      ) {
        leave += amount;
      } else if (fieldName === "conveyance") {
        conveyance += amount;
      } else if (fieldName === "fixed allowance") {
        fixedAllowance += amount;
      } else if (fieldType === "earning") {
        salary17_1 += amount;
      }
    }
  }

  // Add allowances back to 17(1) gross, as the gross salary contains allowance.
  salary17_1 += bonus + leave + conveyance + fixedAllowance;

  const periodFrom = `01-04-${startYear}`;
  const periodTo = `31-03-${endYear}`;
  const assessmentYear = `${endYear}-${String(endYear + 1).slice(-2)}`;

  const formattedToday = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;

  return json({
    employerName,
    employerAddress,
    employerPan,
    employerTan,
    employeeName: employeeFullName,
    employeeDesignation,
    employeePan,
    employeeAddressLine1,
    employeeAddressLine2,
    assessmentYear,
    periodFrom,
    periodTo,
    q1Receipt: "",
    q1TaxDeducted: 0,
    q1TaxDeposited: 0,
    q2Receipt: "",
    q2TaxDeducted: 0,
    q2TaxDeposited: 0,
    q3Receipt: "",
    q3TaxDeducted: 0,
    q3TaxDeposited: 0,
    q4Receipt: "",
    q4TaxDeducted: 0,
    q4TaxDeposited: 0,
    salary17_1,
    salary17_2: 0,
    salary17_3: 0,
    fixedAllowance,
    bonus,
    leave,
    conveyance,
    entertainmentAllowance: 0,
    professionalTax,
    otherIncomeText: "",
    otherIncome: 0,
    providentFund,
    esic,
    lwf,
    other80c: 0,
    other80ccc: 0,
    other80ccd: 0,
    otherChapterVia: 0,
    taxOnTotalIncome: 0,
    educationCess: 0,
    lessRelief89: 0,
    verifierName:
      companyDetails?.owner_name ||
      CANNY_MANAGEMENT_SERVICES_OWNER ||
      "S.V. CHAUHAN",
    verifierFathersName,
    verifierCapacity: "Director",
    place: "AHMEDABAD",
    date: formattedToday,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const data = JSON.parse(formData.get("data")?.toString() || "{}");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("FORM 16");

  // Grid lines
  sheet.views = [{ showGridLines: true }];

  // Column Widths
  sheet.getColumn(1).width = 45; // Column A
  sheet.getColumn(2).width = 25; // Column B
  sheet.getColumn(3).width = 18; // Column C
  sheet.getColumn(4).width = 18; // Column D
  sheet.getColumn(5).width = 18; // Column E

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: "FF000000" } },
    left: { style: "thin" as const, color: { argb: "FF000000" } },
    bottom: { style: "thin" as const, color: { argb: "FF000000" } },
    right: { style: "thin" as const, color: { argb: "FF000000" } },
  };

  const centerAlign = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };
  const leftAlign = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  const rightAlign = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };

  const fontRegular = { name: "Arial", size: 10 };
  const fontBold = { name: "Arial", bold: true, size: 10 };
  const fontItalic = { name: "Arial", italic: true, size: 9 };

  const formatCell = (
    rowNum: number,
    colNum: number,
    value: any,
    options?: {
      mergeTo?: { r: number; c: number };
      font?: any;
      alignment?: any;
      border?: any;
      numFormat?: string;
    },
  ) => {
    const cell = sheet.getCell(rowNum, colNum);
    cell.value = value;
    if (options?.font) cell.font = options.font;
    if (options?.alignment) cell.alignment = options.alignment;
    if (options?.border) cell.border = options.border;
    if (options?.numFormat) cell.numFmt = options.numFormat;

    if (options?.mergeTo) {
      sheet.mergeCells(rowNum, colNum, options.mergeTo.r, options.mergeTo.c);
      for (let r = rowNum; r <= options.mergeTo.r; r++) {
        for (let c = colNum; c <= options.mergeTo.c; c++) {
          const rangeCell = sheet.getCell(r, c);
          if (options?.font) rangeCell.font = options.font;
          if (options?.alignment) rangeCell.alignment = options.alignment;
          if (options?.border) rangeCell.border = options.border;
        }
      }
    }
  };

  // --- PART A ---
  formatCell(1, 1, "form 16", {
    mergeTo: { r: 1, c: 5 },
    font: { name: "Arial", bold: true, size: 12 },
    alignment: centerAlign,
  });
  formatCell(2, 1, "[See rule 31(1)(a)]", {
    mergeTo: { r: 2, c: 5 },
    font: { name: "Arial", bold: true, size: 10 },
    alignment: centerAlign,
  });
  formatCell(3, 1, "PART A", {
    mergeTo: { r: 3, c: 5 },
    font: { name: "Arial", bold: true, size: 11 },
    alignment: centerAlign,
  });
  formatCell(
    4,
    1,
    "Certificate under section 203 of the Income-tax Act, 1961 for Tax deducted at source on salary",
    {
      mergeTo: { r: 4, c: 5 },
      font: { name: "Arial", size: 10 },
      alignment: centerAlign,
    },
  );

  // Employer & Employee Name/Designation box
  formatCell(5, 1, "Name and Address of the Employer", {
    mergeTo: { r: 5, c: 2 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(5, 3, "Name and Designation of the Employee", {
    mergeTo: { r: 5, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  const employerDetailsText = `${data.employerName}\n${data.employerAddress}`;
  const employeeDetailsText = `${data.employeeName}\n\n${data.employeeDesignation}`;
  formatCell(6, 1, employerDetailsText, {
    mergeTo: { r: 9, c: 2 },
    font: fontRegular,
    alignment: { vertical: "top", horizontal: "left", wrapText: true },
    border: thinBorder,
  });
  formatCell(6, 3, employeeDetailsText, {
    mergeTo: { r: 9, c: 5 },
    font: fontRegular,
    alignment: { vertical: "top", horizontal: "left", wrapText: true },
    border: thinBorder,
  });

  // PAN / TAN row
  formatCell(10, 1, "PAN of the Deductor", {
    mergeTo: { r: 10, c: 2 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(10, 3, "TAN of the Deductor", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(10, 4, "PAN of the Employee", {
    mergeTo: { r: 10, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(11, 1, data.employerPan, {
    mergeTo: { r: 11, c: 2 },
    font: fontRegular,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(11, 3, data.employerTan, {
    font: fontRegular,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(11, 4, data.employeePan, {
    mergeTo: { r: 11, c: 5 },
    font: fontRegular,
    alignment: centerAlign,
    border: thinBorder,
  });

  // CIT / AY / Period row
  formatCell(12, 1, "CIT (TDS)", {
    mergeTo: { r: 12, c: 2 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(12, 3, "Assessment Year", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(12, 4, "Period", {
    mergeTo: { r: 12, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  const employeeAddressText = `${data.employeeName}\n${data.employeeAddressLine1}\n${data.employeeAddressLine2}`;
  formatCell(13, 1, employeeAddressText, {
    mergeTo: { r: 15, c: 2 },
    font: fontRegular,
    alignment: { vertical: "top", horizontal: "left", wrapText: true },
    border: thinBorder,
  });
  formatCell(13, 3, data.assessmentYear, {
    mergeTo: { r: 15, c: 3 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(13, 4, "From", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(13, 5, "To", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(14, 4, data.periodFrom, {
    mergeTo: { r: 15, c: 4 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(14, 5, data.periodTo, {
    mergeTo: { r: 15, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  // Summary of tax deducted
  formatCell(16, 1, "Summary of tax deducted at source", {
    mergeTo: { r: 16, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(17, 1, "Quarter", {
    mergeTo: { r: 18, c: 1 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(
    17,
    2,
    "Receipt Numbers of original statements of TDS under sub-section (3) of section 200",
    {
      mergeTo: { r: 18, c: 3 },
      font: fontBold,
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      border: thinBorder,
    },
  );
  formatCell(17, 4, "Amount of tax deducted in respect of the employee", {
    mergeTo: { r: 18, c: 4 },
    font: fontBold,
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: thinBorder,
  });
  formatCell(
    17,
    5,
    "Amount of tax deposited/remitted in respect of the employee",
    {
      mergeTo: { r: 18, c: 5 },
      font: fontBold,
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      border: thinBorder,
    },
  );

  const quarters = [
    {
      label: "Quarter 1",
      receipt: data.q1Receipt,
      deducted: Number(data.q1TaxDeducted || 0),
      deposited: Number(data.q1TaxDeposited || 0),
    },
    {
      label: "Quarter 2",
      receipt: data.q2Receipt,
      deducted: Number(data.q2TaxDeducted || 0),
      deposited: Number(data.q2TaxDeposited || 0),
    },
    {
      label: "Quarter 3",
      receipt: data.q3Receipt,
      deducted: Number(data.q3TaxDeducted || 0),
      deposited: Number(data.q3TaxDeposited || 0),
    },
    {
      label: "Quarter 4",
      receipt: data.q4Receipt,
      deducted: Number(data.q4TaxDeducted || 0),
      deposited: Number(data.q4TaxDeposited || 0),
    },
  ];

  quarters.forEach((q, idx) => {
    const row = 20 + idx;
    formatCell(row, 1, q.label, {
      font: fontRegular,
      alignment: centerAlign,
      border: thinBorder,
    });
    formatCell(row, 2, q.receipt, {
      mergeTo: { r: row, c: 3 },
      font: fontRegular,
      alignment: centerAlign,
      border: thinBorder,
    });
    formatCell(row, 4, q.deducted, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
    formatCell(row, 5, q.deposited, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
  });

  // Total Row
  formatCell(24, 1, "Total", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(24, 2, "", {
    mergeTo: { r: 24, c: 3 },
    font: fontRegular,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(
    24,
    4,
    { formula: "=SUM(D20:D23)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );
  formatCell(
    24,
    5,
    { formula: "=SUM(E20:E23)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // --- PART B ---
  formatCell(25, 1, "PART B (Refer Note 1)", {
    mergeTo: { r: 25, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(
    26,
    1,
    "Details of Salary Paid and any other income and tax deducted",
    {
      mergeTo: { r: 26, c: 5 },
      font: fontBold,
      alignment: centerAlign,
      border: thinBorder,
    },
  );

  formatCell(27, 1, "", { mergeTo: { r: 27, c: 2 }, border: thinBorder });
  formatCell(27, 3, "Rs.", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(27, 4, "Rs.", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(27, 5, "Rs.", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(28, 1, "1. Gross Salary", {
    mergeTo: { r: 28, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(28, 3, "", { border: thinBorder });
  formatCell(28, 4, "", { border: thinBorder });
  formatCell(28, 5, "", { border: thinBorder });

  formatCell(29, 1, "(a) Salary as per provisions contained in sec. 17(1)", {
    mergeTo: { r: 29, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(29, 3, Number(data.salary17_1 || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(29, 4, "", { border: thinBorder });
  formatCell(29, 5, "", { border: thinBorder });

  formatCell(
    30,
    1,
    "(b) Value of perquisites u/s 17(2) (as per Form No. 12BB, wherever applicable)",
    {
      mergeTo: { r: 30, c: 2 },
      font: fontRegular,
      alignment: { horizontal: "left", vertical: "middle", wrapText: true },
      border: thinBorder,
    },
  );
  formatCell(30, 3, Number(data.salary17_2 || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(30, 4, "", { border: thinBorder });
  formatCell(30, 5, "", { border: thinBorder });

  formatCell(
    31,
    1,
    "(c) Profits in lieu of salary under section 17(3)(as per Form No. 12BB, wherever applicable)",
    {
      mergeTo: { r: 31, c: 2 },
      font: fontRegular,
      alignment: { horizontal: "left", vertical: "middle", wrapText: true },
      border: thinBorder,
    },
  );
  formatCell(31, 3, Number(data.salary17_3 || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(31, 4, "", { border: thinBorder });
  formatCell(31, 5, "", { border: thinBorder });

  formatCell(32, 1, "(d) Total", {
    mergeTo: { r: 32, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(32, 3, "", { border: thinBorder });
  formatCell(
    32,
    4,
    { formula: "=SUM(C29:C31)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );
  formatCell(32, 5, "", { border: thinBorder });

  // Blank row inside table
  formatCell(33, 1, "", { mergeTo: { r: 33, c: 2 }, border: thinBorder });
  formatCell(33, 3, "", { border: thinBorder });
  formatCell(33, 4, "", { border: thinBorder });
  formatCell(33, 5, "", { border: thinBorder });

  // Less: Allowance
  formatCell(34, 1, "2. Less: Allowance to the extent exempt U/s 10", {
    mergeTo: { r: 34, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(34, 3, "", { border: thinBorder });
  formatCell(34, 4, "", { border: thinBorder });
  formatCell(34, 5, "", { border: thinBorder });

  formatCell(35, 1, "Allowance", {
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(35, 2, "Rs.", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(35, 3, "", { border: thinBorder });
  formatCell(35, 4, "", { border: thinBorder });
  formatCell(35, 5, "", { border: thinBorder });

  formatCell(36, 1, "FIXED ALLOWANCE", {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(36, 2, Number(data.fixedAllowance || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(36, 3, "", { border: thinBorder });
  formatCell(36, 4, "", { border: thinBorder });
  formatCell(36, 5, "", { border: thinBorder });

  formatCell(37, 1, "BONUS", {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(37, 2, Number(data.bonus || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(37, 3, "", { border: thinBorder });
  formatCell(37, 4, "", { border: thinBorder });
  formatCell(37, 5, "", { border: thinBorder });

  formatCell(38, 1, "LEAVE", {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(38, 2, Number(data.leave || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(38, 3, "", { border: thinBorder });
  formatCell(38, 4, "", { border: thinBorder });
  formatCell(38, 5, "", { border: thinBorder });

  formatCell(39, 1, "CONVEYANCE", {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(39, 2, Number(data.conveyance || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(39, 3, "", { border: thinBorder });
  formatCell(
    39,
    4,
    { formula: "=SUM(B36:B39)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );
  formatCell(39, 5, "", { border: thinBorder });

  // Blank row
  formatCell(40, 1, "", { mergeTo: { r: 40, c: 2 }, border: thinBorder });
  formatCell(40, 3, "", { border: thinBorder });
  formatCell(40, 4, "", { border: thinBorder });
  formatCell(40, 5, "", { border: thinBorder });

  // Balance
  formatCell(41, 1, "3. Balance (1-2)", {
    mergeTo: { r: 41, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(41, 3, "", { border: thinBorder });
  // Note: we write the standard formula here: =D32-D39
  formatCell(
    41,
    4,
    { formula: "=D32-D39" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );
  formatCell(41, 5, "", { border: thinBorder });

  // Deductions
  formatCell(42, 1, "4. Deductions :", {
    mergeTo: { r: 42, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(42, 3, "", { border: thinBorder });
  formatCell(42, 4, "", { border: thinBorder });
  formatCell(42, 5, "", { border: thinBorder });

  formatCell(43, 1, "(a) Entertainment Allowance", {
    mergeTo: { r: 43, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(43, 3, Number(data.entertainmentAllowance || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(43, 4, "", { border: thinBorder });
  formatCell(43, 5, "", { border: thinBorder });

  formatCell(44, 1, "(b) Tax on Employment", {
    mergeTo: { r: 44, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(44, 3, Number(data.professionalTax || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(44, 4, "", { border: thinBorder });
  formatCell(44, 5, "", { border: thinBorder });

  formatCell(45, 1, "5. Aggregate of 4(a) and (b)", {
    mergeTo: { r: 45, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(45, 3, "", { border: thinBorder });
  formatCell(
    45,
    4,
    { formula: "=SUM(C43:C44)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );
  formatCell(45, 5, "", { border: thinBorder });

  // Income chargeable under head Salaries
  formatCell(46, 1, "6. Income chargeable under the head 'Salaries' (3-5)", {
    mergeTo: { r: 46, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(46, 3, "", { border: thinBorder });
  formatCell(46, 4, "", { border: thinBorder });
  formatCell(
    46,
    5,
    { formula: "=D41-D45" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(47, 1, "", { mergeTo: { r: 47, c: 2 }, border: thinBorder });
  formatCell(47, 3, "", { border: thinBorder });
  formatCell(47, 4, "", { border: thinBorder });
  formatCell(47, 5, "", { border: thinBorder });

  // Add: other income
  formatCell(48, 1, "7. Add: Any other income reported by the employees", {
    mergeTo: { r: 48, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(48, 3, "", { border: thinBorder });
  formatCell(48, 4, "", { border: thinBorder });
  formatCell(48, 5, "", { border: thinBorder });

  formatCell(49, 1, "Income", {
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(49, 2, "Rs.", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(49, 3, "", { border: thinBorder });
  formatCell(49, 4, "", { border: thinBorder });
  formatCell(49, 5, "", { border: thinBorder });

  const otherIncomeLabel = data.otherIncomeText || "Other Income";
  formatCell(50, 1, otherIncomeLabel, {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(50, 2, Number(data.otherIncome || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(50, 3, "", { border: thinBorder });
  formatCell(50, 4, "", { border: thinBorder });
  formatCell(50, 5, "", { border: thinBorder });

  formatCell(51, 1, "", {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(51, 2, 0, {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(51, 3, "", { border: thinBorder });
  formatCell(51, 4, "", { border: thinBorder });
  formatCell(51, 5, "", { border: thinBorder });

  formatCell(52, 1, "", {
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(52, 2, 0, {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(52, 3, "", { border: thinBorder });
  formatCell(52, 4, "", { border: thinBorder });
  formatCell(52, 5, "", { border: thinBorder });

  formatCell(53, 1, "", { mergeTo: { r: 53, c: 2 }, border: thinBorder });
  formatCell(53, 3, "", { border: thinBorder });
  formatCell(
    53,
    4,
    { formula: "=SUM(B50:B52)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );
  formatCell(53, 5, "", { border: thinBorder });

  // Gross total income
  formatCell(54, 1, "8. Gross Total income (6+7)", {
    mergeTo: { r: 54, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(54, 3, "", { border: thinBorder });
  formatCell(54, 4, "", { border: thinBorder });
  formatCell(
    54,
    5,
    { formula: "=E46+D53" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // Spacing rows
  for (let r = 55; r <= 60; r++) {
    formatCell(r, 1, "", { mergeTo: { r, c: 5 } });
  }

  // --- PART B PAGE 2 ---
  formatCell(61, 1, ":: 2 ::", {
    mergeTo: { r: 61, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(62, 1, "9. Deductions under Chapter VI A", {
    mergeTo: { r: 62, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(62, 3, "", { border: thinBorder });
  formatCell(62, 4, "", { border: thinBorder });
  formatCell(62, 5, "", { border: thinBorder });

  formatCell(63, 1, " (A) sections 80C, 80CCC and 80CCD", {
    mergeTo: { r: 63, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(63, 3, "", { border: thinBorder });
  formatCell(63, 4, "", { border: thinBorder });
  formatCell(63, 5, "", { border: thinBorder });

  formatCell(64, 1, "", { mergeTo: { r: 64, c: 2 }, border: thinBorder });
  formatCell(64, 3, "", { border: thinBorder });
  formatCell(64, 4, "", { border: thinBorder });
  formatCell(64, 5, "", { border: thinBorder });

  formatCell(65, 1, "(a) Section 80 C", {
    mergeTo: { r: 65, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(65, 3, "", { border: thinBorder });
  formatCell(65, 4, "Gross Amount", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(65, 5, "Deductible Amount", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(66, 1, "      (i) PROVIDENT FUND", {
    mergeTo: { r: 66, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(66, 3, "", { border: thinBorder });
  formatCell(66, 4, Number(data.providentFund || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(
    66,
    5,
    { formula: "=MIN(D66, 150000)" },
    {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(67, 1, "      (ii) ESIC", {
    mergeTo: { r: 67, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(67, 3, "", { border: thinBorder });
  formatCell(67, 4, Number(data.esic || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(
    67,
    5,
    { formula: "=D67" },
    {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(68, 1, "      (iii) LWF", {
    mergeTo: { r: 68, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(68, 3, "", { border: thinBorder });
  formatCell(68, 4, Number(data.lwf || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(
    68,
    5,
    { formula: "=D68" },
    {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(69, 1, "      (iv) Other 80C", {
    mergeTo: { r: 69, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(69, 3, "", { border: thinBorder });
  formatCell(69, 4, Number(data.other80c || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(
    69,
    5,
    { formula: "=D69" },
    {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  for (let r = 70; r <= 73; r++) {
    formatCell(r, 1, `      (${r - 65})`, {
      mergeTo: { r, c: 2 },
      font: fontRegular,
      alignment: leftAlign,
      border: thinBorder,
    });
    formatCell(r, 3, "", { border: thinBorder });
    formatCell(r, 4, 0, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
    formatCell(r, 5, 0, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
  }

  formatCell(74, 1, "   (b) section 80 CCC", {
    mergeTo: { r: 74, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(74, 3, "", { border: thinBorder });
  formatCell(74, 4, Number(data.other80ccc || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(
    74,
    5,
    { formula: "=D74" },
    {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(75, 1, "   (c) section 80 CCD", {
    mergeTo: { r: 75, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(75, 3, "", { border: thinBorder });
  formatCell(75, 4, Number(data.other80ccd || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(
    75,
    5,
    { formula: "=D75" },
    {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(76, 1, "Total", {
    mergeTo: { r: 76, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(76, 3, "", { border: thinBorder });
  formatCell(76, 4, "", { border: thinBorder });
  formatCell(
    76,
    5,
    { formula: "=SUM(E66:E75)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // Note notes
  formatCell(
    77,
    1,
    "Note: 1. Aggregate amount deductible under section 80 C shall not exceed one lakh rupees.",
    {
      mergeTo: { r: 77, c: 5 },
      font: fontItalic,
      alignment: leftAlign,
      border: thinBorder,
    },
  );
  formatCell(
    78,
    1,
    "2. Aggregate amount deductible under the three sections, i.e. 80C, 80CCC, 80CCD shall not exceed one lakh rupees",
    {
      mergeTo: { r: 78, c: 5 },
      font: fontItalic,
      alignment: leftAlign,
      border: thinBorder,
    },
  );

  for (let r = 79; r <= 80; r++) {
    formatCell(r, 1, "", { mergeTo: { r, c: 5 }, border: thinBorder });
  }
  formatCell(81, 1, "", { mergeTo: { r: 81, c: 5 }, border: thinBorder });

  // (B) other sections
  formatCell(
    82,
    1,
    "(B) other sections (e.g. 80E, 80G etc.) under Chapter VI-A",
    {
      mergeTo: { r: 82, c: 2 },
      font: fontBold,
      alignment: leftAlign,
      border: thinBorder,
    },
  );
  formatCell(82, 3, "Gross Amount", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(82, 4, "Qualifying Amount", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(82, 5, "Deductible Amount", {
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(83, 1, "", { mergeTo: { r: 83, c: 2 }, border: thinBorder });
  formatCell(83, 3, "", { border: thinBorder });
  formatCell(83, 4, "", { border: thinBorder });
  formatCell(83, 5, "", { border: thinBorder });

  formatCell(84, 1, "      (i) Other VI-A Section", {
    mergeTo: { r: 84, c: 2 },
    font: fontRegular,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(84, 3, Number(data.otherChapterVia || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(84, 4, Number(data.otherChapterVia || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });
  formatCell(84, 5, Number(data.otherChapterVia || 0), {
    font: fontRegular,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });

  for (let r = 85; r <= 88; r++) {
    formatCell(r, 1, `      (${r - 83})`, {
      mergeTo: { r, c: 2 },
      font: fontRegular,
      alignment: leftAlign,
      border: thinBorder,
    });
    formatCell(r, 3, 0, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
    formatCell(r, 4, 0, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
    formatCell(r, 5, 0, {
      font: fontRegular,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    });
  }

  formatCell(89, 1, "Total", {
    mergeTo: { r: 89, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(89, 3, "", { border: thinBorder });
  formatCell(89, 4, "", { border: thinBorder });
  formatCell(
    89,
    5,
    { formula: "=SUM(E84:E88)" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // 10. Aggregate of deductible amount
  formatCell(90, 1, "10. Aggregate of deductible amount under Chapter VI A", {
    mergeTo: { r: 90, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(90, 3, "", { border: thinBorder });
  formatCell(90, 4, "", { border: thinBorder });
  formatCell(
    90,
    5,
    { formula: "=E76+E89" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  formatCell(91, 1, "", { mergeTo: { r: 91, c: 2 }, border: thinBorder });
  formatCell(91, 3, "", { border: thinBorder });
  formatCell(91, 4, "", { border: thinBorder });
  formatCell(91, 5, "", { border: thinBorder });

  // 11. Total income
  formatCell(92, 1, "11. Total Income", {
    mergeTo: { r: 92, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(92, 3, "", { border: thinBorder });
  formatCell(92, 4, "", { border: thinBorder });
  formatCell(
    92,
    5,
    { formula: "=E54-E90" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // 12. Tax on total income
  formatCell(93, 1, "12. Tax on total income", {
    mergeTo: { r: 93, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(93, 3, "", { border: thinBorder });
  formatCell(93, 4, "", { border: thinBorder });
  formatCell(93, 5, Number(data.taxOnTotalIncome || 0), {
    font: fontBold,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });

  // 13. Cess
  formatCell(94, 1, "13. Education cess @ 3% (on tax computed at S.No. 12)", {
    mergeTo: { r: 94, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(94, 3, "", { border: thinBorder });
  formatCell(94, 4, "", { border: thinBorder });
  formatCell(
    94,
    5,
    { formula: "=E93*0.03" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // 14. Tax Payable
  formatCell(95, 1, "14. Tax Payable (12+13)", {
    mergeTo: { r: 95, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(95, 3, "", { border: thinBorder });
  formatCell(95, 4, "", { border: thinBorder });
  formatCell(
    95,
    5,
    { formula: "=E93+E94" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // 15. Relief under sec 89
  formatCell(96, 1, "15. Less: Relief under section 89 (attach details)", {
    mergeTo: { r: 96, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(96, 3, "", { border: thinBorder });
  formatCell(96, 4, "", { border: thinBorder });
  formatCell(96, 5, Number(data.lessRelief89 || 0), {
    font: fontBold,
    alignment: rightAlign,
    border: thinBorder,
    numFormat: "##,##,##0",
  });

  // 16. Tax Payable (14-15)
  formatCell(97, 1, "16. Tax Payable (14-15)", {
    mergeTo: { r: 97, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(97, 3, "", { border: thinBorder });
  formatCell(97, 4, "", { border: thinBorder });
  formatCell(
    97,
    5,
    { formula: "=E95-E96" },
    {
      font: fontBold,
      alignment: rightAlign,
      border: thinBorder,
      numFormat: "##,##,##0",
    },
  );

  // --- Verification ---
  formatCell(98, 1, "Verification", {
    mergeTo: { r: 98, c: 5 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  // Calculate total tax deducted from sum of quarters
  const totalTaxDeducted =
    Number(data.q1TaxDeducted || 0) +
    Number(data.q2TaxDeducted || 0) +
    Number(data.q3TaxDeducted || 0) +
    Number(data.q4TaxDeducted || 0);

  const totalTaxDeductedInWords =
    totalTaxDeducted > 0
      ? numberToWordsIndian(totalTaxDeducted).toUpperCase()
      : "NIL";

  const verificationText = `I, ${data.verifierName}, son of ${data.verifierFathersName} working in the capacity of ${data.verifierCapacity} do hereby certify that a sum of Rs.${totalTaxDeducted}/- [Rs. ${totalTaxDeductedInWords} Only] has been deducted and deposited to the credit of the Central Government. I further certify that the information given above is true, complete and correct and is based on the books of account, documents, TDS statements, TDS deposited and other available records.`;

  formatCell(99, 1, verificationText, {
    mergeTo: { r: 101, c: 5 },
    font: fontRegular,
    alignment: { vertical: "top", horizontal: "left", wrapText: true },
    border: thinBorder,
  });

  // Place & Date / Stamp Grid
  formatCell(102, 1, "Place", {
    mergeTo: { r: 103, c: 1 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(102, 2, data.place, {
    mergeTo: { r: 103, c: 2 },
    font: fontRegular,
    alignment: centerAlign,
    border: thinBorder,
  });

  formatCell(104, 1, "Date", {
    mergeTo: { r: 106, c: 1 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });
  formatCell(104, 2, data.date, {
    mergeTo: { r: 106, c: 2 },
    font: fontBold,
    alignment: centerAlign,
    border: thinBorder,
  });

  // Signature box
  formatCell(102, 3, "", { mergeTo: { r: 105, c: 5 }, border: thinBorder });
  formatCell(106, 3, "Signature of person responsible for deduction of tax", {
    mergeTo: { r: 106, c: 5 },
    font: fontItalic,
    alignment: centerAlign,
    border: thinBorder,
  });

  // Signatures Details
  formatCell(107, 1, `Designation: ${data.verifierCapacity}`, {
    mergeTo: { r: 107, c: 2 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });
  formatCell(107, 3, `Full Name: ${data.verifierName}`, {
    mergeTo: { r: 107, c: 5 },
    font: fontBold,
    alignment: leftAlign,
    border: thinBorder,
  });

  // Set Row Heights
  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 20;
  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 20;
  sheet.getRow(5).height = 22;
  sheet.getRow(10).height = 22;
  sheet.getRow(11).height = 22;
  sheet.getRow(12).height = 22;
  sheet.getRow(16).height = 22;
  sheet.getRow(17).height = 20;
  sheet.getRow(18).height = 20;
  sheet.getRow(24).height = 22;
  sheet.getRow(25).height = 22;
  sheet.getRow(26).height = 22;
  sheet.getRow(27).height = 22;
  sheet.getRow(28).height = 22;
  sheet.getRow(32).height = 22;
  sheet.getRow(34).height = 22;
  sheet.getRow(35).height = 22;
  sheet.getRow(41).height = 22;
  sheet.getRow(42).height = 22;
  sheet.getRow(45).height = 22;
  sheet.getRow(46).height = 22;
  sheet.getRow(48).height = 22;
  sheet.getRow(49).height = 22;
  sheet.getRow(54).height = 22;
  sheet.getRow(61).height = 22;
  sheet.getRow(62).height = 22;
  sheet.getRow(63).height = 22;
  sheet.getRow(65).height = 22;
  sheet.getRow(76).height = 22;
  sheet.getRow(82).height = 22;
  sheet.getRow(89).height = 22;
  sheet.getRow(90).height = 22;
  sheet.getRow(92).height = 22;
  sheet.getRow(93).height = 22;
  sheet.getRow(94).height = 22;
  sheet.getRow(95).height = 22;
  sheet.getRow(96).height = 22;
  sheet.getRow(97).height = 22;
  sheet.getRow(98).height = 22;
  sheet.getRow(106).height = 20;
  sheet.getRow(107).height = 22;

  try {
    const excelBuffer = await workbook.xlsx.writeBuffer();
    return new Response(excelBuffer as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=Form_16_${data.employeeName.replace(/\s+/g, "_")}.xlsx`,
      },
    });
  } catch (error) {
    console.error("Excel generation failed:", error);
    return json({ message: "Failed to generate Excel sheet" }, { status: 500 });
  }
};
