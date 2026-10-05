import type { ActionFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { PDFDocument } from "pdf-lib";
import { generateFormIPdf } from "@/components/employees/pdf/form-i-pdf";
import { generateFormIIIPdf } from "@/components/employees/pdf/form-iii-pdf";
import { generateFormIVPdf } from "@/components/employees/pdf/form-iv-pdf";
import { generateFormIVGratuityPdf } from "@/components/employees/pdf/form-iv-gratuity-pdf";
import { generateFormVPdf } from "@/components/employees/pdf/form-v-pdf";
import { generateFormVIIIPdf } from "@/components/employees/pdf/form-viii-pdf";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCompanyById,
  getLocationsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getMonthNameFromNumber } from "@canny_ecosystem/utils";
import ExcelJS from "exceljs";
import React from "react";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_OWNER,
} from "@/constant";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function mapSkillLevel(skill: string | null | undefined): string {
  if (!skill) return "";
  const s = skill.toLowerCase();
  if (s.includes("highly")) return "HS";
  if (s.includes("semi")) return "SS";
  if (s.includes("unskilled")) return "US";
  if (s.includes("skilled")) return "S";
  return skill.toUpperCase();
}

function mapAssignmentType(type: string | null | undefined): string {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t.includes("permanent") || t === "p") return "P";
  if (t.includes("temporary") || t === "t") return "T";
  if (t.includes("full_time") || t === "ft") return "FT";
  if (t.includes("part_time") || t === "pt") return "P/T";
  if (t.includes("probation") || t === "b") return "B";
  return type.toUpperCase();
}

function getFatherMotherSpouseName(guardians: any[], middleName?: string) {
  if (!guardians || guardians.length === 0) {
    return middleName || "";
  }
  const father = guardians.find(
    (g) => g.relationship?.toLowerCase() === "father",
  );
  if (father)
    return `${father.first_name || ""} ${father.last_name || ""}`.trim();
  const spouse = guardians.find(
    (g) =>
      g.relationship?.toLowerCase() === "spouse" ||
      g.relationship?.toLowerCase() === "husband" ||
      g.relationship?.toLowerCase() === "wife",
  );
  if (spouse)
    return `${spouse.first_name || ""} ${spouse.last_name || ""}`.trim();
  const mother = guardians.find(
    (g) => g.relationship?.toLowerCase() === "mother",
  );
  if (mother)
    return `${mother.first_name || ""} ${mother.last_name || ""}`.trim();
  return middleName || "";
}

function getNomineeName(guardians: any[]) {
  if (!guardians || guardians.length === 0) return "";
  const nominee =
    guardians.find(
      (g) =>
        g.relationship?.toLowerCase() === "spouse" ||
        g.relationship?.toLowerCase() === "husband" ||
        g.relationship?.toLowerCase() === "wife",
    ) || guardians[0];
  if (nominee) {
    return `${nominee.first_name || ""} ${nominee.last_name || ""} (${nominee.relationship || ""})`.trim();
  }
  return "";
}

function getFamilyDetails(guardians: any[]) {
  if (!guardians || guardians.length === 0) return "";
  return guardians
    .map(
      (g) =>
        `${g.first_name || ""} ${g.last_name || ""} (${g.relationship || ""})`,
    )
    .join(", ");
}

function getAddress(addresses: any[], type: "present" | "permanent") {
  if (!addresses || addresses.length === 0) return "";
  const addr = addresses.find(
    (a) =>
      a.address_type?.toLowerCase() === type ||
      (type === "present" && a.is_primary),
  );
  if (!addr) {
    return addresses[0] ? formatAddress(addresses[0]) : "";
  }
  return formatAddress(addr);
}

function formatAddress(addr: any) {
  if (!addr) return "";
  return `${addr.address_line_1 || ""}, ${addr.city || ""}, ${addr.state || ""} - ${addr.pincode || ""}`
    .replace(/^,\s*/, "")
    .trim();
}

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

function calculateYearsOfService(
  startDateStr: string | null | undefined,
  endDateStr: string | null | undefined,
): string {
  if (!startDateStr) return "";
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365.25);
  const months = Math.floor((diffDays % 365.25) / 30.4375);
  const days = Math.floor((diffDays % 365.25) % 30.4375);

  const parts = [];
  if (years > 0) parts.push(`${years} Year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} Month${months > 1 ? "s" : ""}`);
  if (days > 0) parts.push(`${days} Day${days > 1 ? "s" : ""}`);

  return parts.length > 0 ? parts.join(", ") : "0 Days";
}

function calculateGratuityAmount(
  wages: number | null | undefined,
  startDateStr: string | null | undefined,
  endDateStr: string | null | undefined,
): string {
  if (!wages || !startDateStr) return "";
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const yearsDecimal = diffDays / 365.25;
  const roundedYears = Math.round(yearsDecimal);
  const amount = (wages * 15 * roundedYears) / 26;
  return `${amount.toFixed(2)}/-`;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const employeeIdsRaw = formData.get("employeeIds")?.toString();
  const formatType = formData.get("format")?.toString() || "pdf"; // "pdf" or "excel"

  if (!employeeIdsRaw) {
    return new Response(
      JSON.stringify({ message: "Employee IDs are required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { supabase } = getSupabaseWithHeaders({ request });
  const employeeIds = employeeIdsRaw.split(",");

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  if (!companyId) throw new Error("Company ID Not Found");

  const [companyRes, locationsRes] = await Promise.all([
    getCompanyById({ supabase, id: companyId }),
    getLocationsByCompanyId({ supabase, companyId }),
  ]);

  const companyDetails = companyRes.data;
  const companyLocations = locationsRes.data;

  if (!companyDetails) throw new Error("Company Details Not Found");

  const primaryLocation =
    companyLocations?.find((l) => l.is_primary) || companyLocations?.[0];

  const { data: attendanceList } = await supabase
    .from("monthly_attendance")
    .select(`
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      employee_id,
      salary_entries!left (
        id,
        monthly_ctc,
        salary_field_values (
          id,
          amount,
          payroll_fields (
            name,
            display_name
          )
        )
      )
    `)
    .in("employee_id", employeeIds);

  const employeeAttendanceMap: Record<string, any[]> = {};
  if (attendanceList && attendanceList.length > 0) {
    attendanceList.forEach((record: any) => {
      const empId = record.employee_id;
      if (!employeeAttendanceMap[empId]) {
        employeeAttendanceMap[empId] = [];
      }
      employeeAttendanceMap[empId].push(record);
    });

    Object.keys(employeeAttendanceMap).forEach((empId) => {
      employeeAttendanceMap[empId].sort((a: any, b: any) => {
        const yearA = parseInt(a.year, 10) || 0;
        const yearB = parseInt(b.year, 10) || 0;
        const monthA = parseInt(a.month, 10) || 0;
        const monthB = parseInt(b.month, 10) || 0;
        if (yearB !== yearA) return yearB - yearA;
        return monthB - monthA;
      });
    });
  }

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select(`
      id,
      employee_code,
      first_name,
      middle_name,
      last_name,
      date_of_birth,
      education,
      primary_mobile_number,
      personal_email,
      is_active,
      gender,
      photo,
      nationality,
      marital_status,
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
        bank_name,
        ifsc_code
      ),
      employee_exit!left(
        last_working_day,
        exit_reason,
        death_exit!left(
          date_of_death,
          death_reason
        )
      )
    `)
    .in("id", employeeIds);

  if (employeesError || !employees) {
    console.error("Error fetching employees for Form I:", employeesError);
    return new Response(
      JSON.stringify({ message: "Failed to fetch employee details" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const [workDetailsRes, addressesRes, guardiansRes, salaryRes] =
    await Promise.all([
      supabase
        .from("work_details")
        .select(`
        employee_id,
        assignment_type,
        skill_level,
        position,
        start_date,
        end_date,
        project_id,
        projects!left(id, name),
        sites!left(id, name, address_line_1, city, state, pincode),
        departments!left(id, name)
      `)
        .in("employee_id", employeeIds),
      supabase
        .from("employee_addresses")
        .select(`
        employee_id,
        address_type,
        address_line_1,
        city,
        state,
        country,
        pincode,
        is_primary
      `)
        .in("employee_id", employeeIds),
      supabase
        .from("employee_guardians")
        .select(`
        employee_id,
        relationship,
        first_name,
        last_name,
        date_of_birth
      `)
        .in("employee_id", employeeIds),
      supabase
        .from("employee_salary_assignment")
        .select(`
        employee_id,
        id,
        monthly_ctc,
        effective_date
      `)
        .in("employee_id", employeeIds),
    ]);

  if (employees && employees.length > 0) {
    const workDetails = workDetailsRes.data || [];
    const addresses = addressesRes.data || [];
    const guardians = guardiansRes.data || [];
    const salaryAssignments = salaryRes.data || [];

    employees.forEach((emp: any) => {
      emp.work_details = workDetails.filter((w) => w.employee_id === emp.id);
      emp.employee_addresses = addresses.filter(
        (a) => a.employee_id === emp.id,
      );
      emp.employee_guardians = guardians.filter(
        (g) => g.employee_id === emp.id,
      );
      emp.employee_salary_assignment = salaryAssignments.filter(
        (s) => s.employee_id === emp.id,
      );
    });
  }

  const selectedForms = formData.get("forms")?.toString().split(",") || [
    "form_i",
  ];

  const formattedEmployeesFormI = employees.map((employee) => {
    const workDetails = Array.isArray(employee.work_details)
      ? employee.work_details[0]
      : employee.work_details;
    const statutoryDetails = Array.isArray(employee.employee_statutory_details)
      ? employee.employee_statutory_details[0]
      : employee.employee_statutory_details;
    const bankDetails = Array.isArray(employee.employee_bank_details)
      ? employee.employee_bank_details[0]
      : employee.employee_bank_details;
    const exitDetails = Array.isArray(employee.employee_exit)
      ? employee.employee_exit[0]
      : employee.employee_exit;

    const salaryAssignments = Array.isArray(employee.employee_salary_assignment)
      ? employee.employee_salary_assignment
      : employee.employee_salary_assignment
        ? [employee.employee_salary_assignment]
        : [];
    const activeSalaryAssignment = salaryAssignments.sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];

    const guardians = employee.employee_guardians || [];
    const addresses = employee.employee_addresses || [];

    const ownerName = CANNY_MANAGEMENT_SERVICES_OWNER;

    return {
      employeeCode: employee.employee_code || "",
      name: (employee.first_name || "").toUpperCase(),
      surname: (employee.last_name || "").toUpperCase(),
      gender: employee.gender ? formatUnderscoreText(employee.gender) : "",
      fatherMotherSpouseName: getFatherMotherSpouseName(
        guardians,
        employee.middle_name,
      ),
      dateOfBirth: formatDate(employee.date_of_birth),
      placeOfBirth: "", // Blank since not in DB
      nationality: employee.nationality || "Indian",
      educationLevel: employee.education
        ? formatUnderscoreText(employee.education)
        : "",
      dateOfJoining: formatDate(workDetails?.start_date),
      designation: workDetails?.position
        ? formatUnderscoreText(workDetails.position)
        : "",
      category: mapSkillLevel(workDetails?.skill_level),
      typeOfEmployment: mapAssignmentType(workDetails?.assignment_type),
      detailsOfPosting: workDetails?.sites?.name || "",
      pay: activeSalaryAssignment?.monthly_ctc
        ? `Monthly CTC: ${activeSalaryAssignment.monthly_ctc}/-`
        : "",
      promotion: "",
      mobileNumber: employee.primary_mobile_number || "",
      uan: statutoryDetails?.uan_number || "",
      pan: statutoryDetails?.pan_number || "",
      nominee: getNomineeName(guardians),
      familyDetails: getFamilyDetails(guardians),
      epsNps: statutoryDetails?.pf_number ? "EPS" : "",
      esicIp: statutoryDetails?.esic_number || "",
      aadhaar: statutoryDetails?.aadhaar_number || "",
      bankAccountNumber: bankDetails?.account_number || "",
      bankName: bankDetails?.bank_name || "",
      branchIfsc: bankDetails?.ifsc_code || "",
      presentAddress: getAddress(addresses, "present"),
      permanentAddress: getAddress(addresses, "permanent"),
      serviceBookNo: "",
      dateOfExit: formatDate(exitDetails?.last_working_day),
      reasonForExit: exitDetails?.exit_reason || "",
      markOfIdentification: "",
      photoAttached: employee.photo ? "Attached" : "No",
      specimenSignature: "",
      remarks: "",
      // Meta
      establishmentName: workDetails?.sites?.name || companyDetails.name || "",
      employerName: CANNY_MANAGEMENT_SERVICES_NAME,
      ownerName: ownerName,
      employerPanTan: primaryLocation?.pan_number || "",
      registrationNumber: companyDetails.registration_number || "",
    };
  });

  // Format data for Form III
  const formattedEmployeesFormIII = employees.map((employee) => {
    const workDetails = Array.isArray(employee.work_details)
      ? employee.work_details[0]
      : employee.work_details;
    const statutoryDetails = Array.isArray(employee.employee_statutory_details)
      ? employee.employee_statutory_details[0]
      : employee.employee_statutory_details;

    const guardians = employee.employee_guardians || [];
    const addresses = employee.employee_addresses || [];
    const permAddr =
      addresses.find(
        (a: any) => a.address_type?.toLowerCase() === "permanent",
      ) || addresses[0];

    const nameFull =
      `${employee.first_name || ""} ${employee.middle_name || ""} ${employee.last_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    // Superannuation date = DOB + 58 years
    let dateOfSuperannuation = "";
    if (employee.date_of_birth) {
      const dob = new Date(employee.date_of_birth);
      if (!isNaN(dob.getTime())) {
        dob.setFullYear(dob.getFullYear() + 58);
        const day = String(dob.getDate()).padStart(2, "0");
        const month = String(dob.getMonth() + 1).padStart(2, "0");
        const year = dob.getFullYear();
        dateOfSuperannuation = `${day}-${month}-${year}`;
      }
    }

    const companyAddress = [
      primaryLocation?.address_line_1,
      primaryLocation?.city,
      primaryLocation?.state,
      primaryLocation?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const establishmentName =
      workDetails?.sites?.name || companyDetails.name || "";
    const establishmentAddress =
      [
        workDetails?.sites?.address_line_1,
        workDetails?.sites?.city,
        workDetails?.sites?.state,
        workDetails?.sites?.pincode,
      ]
        .filter(Boolean)
        .join(", ") || companyAddress;

    const nominees = guardians.map((g: any) => ({
      nameFull: `${g.first_name || ""} ${g.last_name || ""}`
        .replace(/\s+/g, " ")
        .trim(),
      relationship: g.relationship || "",
      age: g.age ? String(g.age) : "",
      aadhaar: g.aadhaar_number || g.aadhaar || "",
      proportion: g.proportion ? `${g.proportion}%` : "100%",
    }));

    const village = permAddr?.address_line_1 || "";
    const postOffice = "";
    const thana = "";
    const subDivision = "";
    const district = permAddr?.city || "";
    const state = permAddr?.state || "";
    const pincode = permAddr?.pincode || "";

    return {
      employeeCode: employee.employee_code || "",
      nameFull,
      fatherSpouseName: getFatherMotherSpouseName(
        guardians,
        employee.middle_name,
      ),
      dateOfBirth: formatDate(employee.date_of_birth),
      uan: statutoryDetails?.uan_number || "",
      gender: employee.gender ? formatUnderscoreText(employee.gender) : "",
      religion: "",
      maritalStatus: "",
      department: (() => {
        const deptObj = Array.isArray(workDetails?.departments)
          ? workDetails.departments[0]
          : workDetails?.departments;
        return deptObj?.name || "";
      })(),
      postHeld: workDetails?.position
        ? `${formatUnderscoreText(workDetails.position)}`
        : "",
      dateOfAppointment: formatDate(workDetails?.start_date),
      dateOfSuperannuation,
      // Permanent Address
      village,
      postOffice,
      thana,
      subDivision,
      district,
      state,
      pincode,
      personalEmail: employee.personal_email || "",
      mobileNumber: employee.primary_mobile_number || "",
      establishmentName,
      establishmentAddress,
      nominees,
    };
  });

  // Format data for Form IV
  const formattedEmployeesFormIV = employees.map((employee) => {
    const workDetails = Array.isArray(employee.work_details)
      ? employee.work_details[0]
      : employee.work_details;
    const statutoryDetails = Array.isArray(employee.employee_statutory_details)
      ? employee.employee_statutory_details[0]
      : employee.employee_statutory_details;
    const bankDetails = Array.isArray(employee.employee_bank_details)
      ? employee.employee_bank_details[0]
      : employee.employee_bank_details;

    // Fetch the latest monthly attendance for this employee
    const records = employeeAttendanceMap[employee.id] || [];
    const latestRecord = records[0];

    const daysWorked = latestRecord ? latestRecord.present_days ?? 0 : 26;
    const otHours = latestRecord ? latestRecord.overtime_hours ?? 0 : 0;
    const salaryEntry = latestRecord?.salary_entries;

    let basic = 0;
    let da = 0;
    let hra = 0;
    let allowances = 0;
    let pf = 0;
    let esi = 0;
    let pt = 0;
    let net = 0;
    let rateBasic = 0;
    let rateDa = 0;
    let rateAllowances = 0;

    const salaryAssignments = Array.isArray(employee.employee_salary_assignment)
      ? employee.employee_salary_assignment
      : employee.employee_salary_assignment
        ? [employee.employee_salary_assignment]
        : [];
    const activeSalaryAssignment = salaryAssignments.sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];

    const monthlyCtc = activeSalaryAssignment?.monthly_ctc || 0;

    if (salaryEntry && salaryEntry.salary_field_values) {
      const fields = salaryEntry.salary_field_values;
      const findAmount = (name: string) => {
        const f = fields.find(
          (x: any) =>
            x.payroll_fields?.name === name ||
            x.payroll_fields?.display_name === name,
        );
        return f ? Math.round(Number(f.amount || 0)) : 0;
      };

      basic = findAmount("Basic");
      da = findAmount("DA") || findAmount("Dearness Allowance");
      hra = findAmount("HRA") || findAmount("House Rent Allowance");
      allowances =
        findAmount("Allowances") ||
        findAmount("Other Allowances") ||
        findAmount("Special Allowance");
      pf =
        findAmount("EPF") ||
        findAmount("PF") ||
        findAmount("Employee Provident Fund");
      esi =
        findAmount("ESIC") ||
        findAmount("ESI") ||
        findAmount("Employee State Insurance");
      pt = findAmount("PT") || findAmount("Professional Tax");

      const gross = monthlyCtc || basic + da + hra + allowances;
      net = gross - pf - esi - pt;

      const divDays = daysWorked > 0 ? daysWorked : 26;
      rateBasic = Math.round(basic / divDays);
      rateDa = Math.round(da / divDays);
      rateAllowances = Math.round((hra + allowances) / divDays);
    } else {
      if (monthlyCtc > 0) {
        basic = Math.round(monthlyCtc * 0.5);
        da = Math.round(monthlyCtc * 0.1);
        allowances = monthlyCtc - basic - da;
        pf = Math.round(basic * 0.12);
        esi = Math.round((basic + da) * 0.0075);
        pt = monthlyCtc > 20000 ? 200 : 150;
        net = monthlyCtc - pf - esi - pt;
      } else {
        const skill = String(
          workDetails?.skill_level || "semi_skilled",
        ).toLowerCase();
        if (skill.includes("high")) {
          rateBasic = 550;
          rateDa = 70;
        } else if (skill.includes("semi")) {
          rateBasic = 462;
          rateDa = 61;
        } else if (skill.includes("unskilled")) {
          rateBasic = 400;
          rateDa = 50;
        } else {
          rateBasic = 500;
          rateDa = 65;
        }
        rateAllowances = 0;
        basic = Math.round(rateBasic * daysWorked);
        da = Math.round(rateDa * daysWorked);
        const gross = basic + da;
        pf = Math.round(basic * 0.12);
        esi = Math.round(gross * 0.0075);
        pt = gross > 20000 ? 200 : 150;
        net = gross - pf - esi - pt;
      }

      const divDays = daysWorked > 0 ? daysWorked : 26;
      rateBasic = rateBasic || Math.round(basic / divDays);
      rateDa = rateDa || Math.round(da / divDays);
      rateAllowances = rateAllowances || Math.round(allowances / divDays);
    }

    const earnedBasic = basic;
    const earnedDa = da;
    const earnedAllowances = allowances;
    const normalRate = rateBasic + rateDa + rateAllowances;
    const earnedOt = Math.round((normalRate / 8) * 2 * otHours);
    const totalEarned = earnedBasic + earnedDa + earnedAllowances + earnedOt;

    const activeMonthName = latestRecord
      ? getMonthNameFromNumber(parseInt(latestRecord.month, 10))
      : getMonthNameFromNumber(new Date().getMonth() + 1);
    const activeYear = latestRecord
      ? latestRecord.year
      : String(new Date().getFullYear());

    const wagePeriodStr = `${activeMonthName} ${activeYear}`;

    const companyAddress = [
      primaryLocation?.address_line_1,
      primaryLocation?.city,
      primaryLocation?.state,
      primaryLocation?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const establishmentName =
      workDetails?.sites?.name || companyDetails.name || "";
    const establishmentAddress =
      [
        workDetails?.sites?.address_line_1,
        workDetails?.sites?.city,
        workDetails?.sites?.state,
        workDetails?.sites?.pincode,
      ]
        .filter(Boolean)
        .join(", ") || companyAddress;

    return {
      employeeCode: employee.employee_code || "",
      name: (employee.first_name || "").toUpperCase(),
      surname: (employee.last_name || "").toUpperCase(),
      designation: workDetails?.position
        ? formatUnderscoreText(workDetails.position)
        : "",
      department: (() => {
        const deptObj = Array.isArray(workDetails?.departments)
          ? workDetails.departments[0]
          : workDetails?.departments;
        return deptObj?.name || "";
      })(),
      paymentDuration: "Monthly",
      wagePeriod: wagePeriodStr,
      daysWorked,
      otHours,
      rateBasic,
      rateDa,
      rateAllowances,
      earnedBasic,
      earnedDa,
      earnedAllowances,
      earnedOt,
      totalEarned,
      deductionEpf: pf,
      deductionEsic: esi,
      deductionSociety: 0,
      deductionIt: 0,
      deductionInsurance: 0,
      deductionAdvances: 0,
      deductionFines: 0,
      deductionDamages: 0,
      totalDeductions: pf + esi + pt,
      deductionOthers: pt,
      netPayment: totalEarned - (pf + esi + pt),
      paymentDate: latestRecord
        ? `07-${String(latestRecord.month).padStart(2, "0")}-${latestRecord.year}`
        : "",
      receiptId: bankDetails?.account_number
        ? `Bank A/c: ${bankDetails.account_number}`
        : "",
      fineOmissions: "",
      fineAmount: 0,
      damageNeglect: "",
      employerSignature: "Canny Management Services",
      // Meta
      establishmentName,
      employerName: CANNY_MANAGEMENT_SERVICES_NAME,
      ownerName: CANNY_MANAGEMENT_SERVICES_OWNER,
      employerPanTan: primaryLocation?.pan_number || "",
      registrationNumber: companyDetails.registration_number || "",
    };
  });

  // Format data for Form IV Gratuity
  const formattedEmployeesFormIVGratuity = employees.map((employee) => {
    const workDetails = Array.isArray(employee.work_details)
      ? employee.work_details[0]
      : employee.work_details;
    const statutoryDetails = Array.isArray(employee.employee_statutory_details)
      ? employee.employee_statutory_details[0]
      : employee.employee_statutory_details;
    const bankDetails = Array.isArray(employee.employee_bank_details)
      ? employee.employee_bank_details[0]
      : employee.employee_bank_details;
    const exitDetails = Array.isArray(employee.employee_exit)
      ? employee.employee_exit[0]
      : employee.employee_exit;

    const guardians = employee.employee_guardians || [];
    const addresses = employee.employee_addresses || [];

    const isClaimedByNominee =
      exitDetails?.exit_reason?.toLowerCase() === "death" ||
      !!exitDetails?.death_exit?.date_of_death;

    const primaryGuardian =
      guardians.find(
        (g: any) =>
          g.relationship?.toLowerCase() === "spouse" ||
          g.relationship?.toLowerCase() === "husband" ||
          g.relationship?.toLowerCase() === "wife",
      ) || guardians[0];

    const nomineeName = primaryGuardian
      ? `${primaryGuardian.first_name || ""} ${primaryGuardian.last_name || ""}`.trim()
      : "";

    const nomineeRelationship = primaryGuardian?.relationship || "";

    const employeeName =
      `${employee.first_name || ""} ${employee.middle_name || ""} ${employee.last_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    const companyAddress = [
      primaryLocation?.address_line_1,
      primaryLocation?.city,
      primaryLocation?.state,
      primaryLocation?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const establishmentName =
      workDetails?.sites?.name || companyDetails.name || "";
    const establishmentAddress =
      [
        workDetails?.sites?.address_line_1,
        workDetails?.sites?.city,
        workDetails?.sites?.state,
        workDetails?.sites?.pincode,
      ]
        .filter(Boolean)
        .join(", ") || companyAddress;

    const salaryAssignments = Array.isArray(employee.employee_salary_assignment)
      ? employee.employee_salary_assignment
      : employee.employee_salary_assignment
        ? [employee.employee_salary_assignment]
        : [];
    const activeSalaryAssignment = salaryAssignments.sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];

    const lastDrawnSalary = activeSalaryAssignment?.monthly_ctc || 0;

    const gratuityAmount = calculateGratuityAmount(
      lastDrawnSalary,
      workDetails?.start_date,
      exitDetails?.last_working_day,
    );

    return {
      establishmentName,
      establishmentAddress,
      applicantName: isClaimedByNominee ? nomineeName : employeeName,
      employeeName,
      isClaimedByNominee,
      terminationDate: formatDate(exitDetails?.last_working_day),
      causeOfTermination: exitDetails?.exit_reason
        ? formatUnderscoreText(exitDetails.exit_reason)
        : "",
      yearsOfService: calculateYearsOfService(
        workDetails?.start_date,
        exitDetails?.last_working_day,
      ),
      employeeCode: employee.employee_code || "",
      employeeMaritalStatus: employee.marital_status
        ? formatUnderscoreText(employee.marital_status)
        : "",
      employeeAddress:
        getAddress(addresses, "permanent") || getAddress(addresses, "present"),
      nomineeName,
      nomineeMaritalStatus: "",
      nomineeRelationship,
      nomineeAddress: "",
      dateOfDeath: exitDetails?.death_exit?.date_of_death
        ? formatDate(exitDetails.death_exit.date_of_death)
        : "",
      nomineeReferenceNo: "",
      department: (() => {
        const deptObj = Array.isArray(workDetails?.departments)
          ? workDetails.departments[0]
          : workDetails?.departments;
        return deptObj?.name || "";
      })(),
      position: workDetails?.position
        ? formatUnderscoreText(workDetails.position)
        : "",
      dateOfJoining: formatDate(workDetails?.start_date),
      lastDrawnSalary: lastDrawnSalary ? String(lastDrawnSalary) : "",
      gratuityAmount,
      bankAccountNumber: bankDetails?.account_number || "",
      bankName: bankDetails?.bank_name || "",
      place: primaryLocation?.city || "Mumbai",
      date: formatDate(new Date().toISOString()),
    };
  });

  // Format data for Form V
  const formattedEmployeesFormV = employees.map((employee) => {
    const workDetails = Array.isArray(employee.work_details)
      ? employee.work_details[0]
      : employee.work_details;
    const statutoryDetails = Array.isArray(employee.employee_statutory_details)
      ? employee.employee_statutory_details[0]
      : employee.employee_statutory_details;
    const bankDetails = Array.isArray(employee.employee_bank_details)
      ? employee.employee_bank_details[0]
      : employee.employee_bank_details;

    // Fetch the latest monthly attendance for this employee
    const records = employeeAttendanceMap[employee.id] || [];
    const latestRecord = records[0];

    const daysWorked = latestRecord ? latestRecord.present_days ?? 0 : 26;
    const otHours = latestRecord ? latestRecord.overtime_hours ?? 0 : 0;
    const salaryEntry = latestRecord?.salary_entries;

    let basic = 0;
    let da = 0;
    let hra = 0;
    let allowances = 0;
    let pf = 0;
    let esi = 0;
    let pt = 0;
    let net = 0;
    let rateBasic = 0;
    let rateDa = 0;
    let rateAllowances = 0;

    const salaryAssignments = Array.isArray(employee.employee_salary_assignment)
      ? employee.employee_salary_assignment
      : employee.employee_salary_assignment
        ? [employee.employee_salary_assignment]
        : [];
    const activeSalaryAssignment = salaryAssignments.sort(
      (a: any, b: any) =>
        new Date(b.effective_date).getTime() -
        new Date(a.effective_date).getTime(),
    )[0];

    const monthlyCtc = activeSalaryAssignment?.monthly_ctc || 0;

    if (salaryEntry && salaryEntry.salary_field_values) {
      const fields = salaryEntry.salary_field_values;
      const findAmount = (name: string) => {
        const f = fields.find(
          (x: any) =>
            x.payroll_fields?.name === name ||
            x.payroll_fields?.display_name === name,
        );
        return f ? Math.round(Number(f.amount || 0)) : 0;
      };

      basic = findAmount("Basic");
      da = findAmount("DA") || findAmount("Dearness Allowance");
      hra = findAmount("HRA") || findAmount("House Rent Allowance");
      allowances =
        findAmount("Allowances") ||
        findAmount("Other Allowances") ||
        findAmount("Special Allowance");
      pf =
        findAmount("EPF") ||
        findAmount("PF") ||
        findAmount("Employee Provident Fund");
      esi =
        findAmount("ESIC") ||
        findAmount("ESI") ||
        findAmount("Employee State Insurance");
      pt = findAmount("PT") || findAmount("Professional Tax");

      const gross = monthlyCtc || basic + da + hra + allowances;
      net = gross - pf - esi - pt;

      const divDays = daysWorked > 0 ? daysWorked : 26;
      rateBasic = Math.round(basic / divDays);
      rateDa = Math.round(da / divDays);
      rateAllowances = Math.round((hra + allowances) / divDays);
    } else {
      if (monthlyCtc > 0) {
        basic = Math.round(monthlyCtc * 0.5);
        da = Math.round(monthlyCtc * 0.1);
        allowances = monthlyCtc - basic - da;
        pf = Math.round(basic * 0.12);
        esi = Math.round((basic + da) * 0.0075);
        pt = monthlyCtc > 20000 ? 200 : 150;
        net = monthlyCtc - pf - esi - pt;
      } else {
        const skill = String(
          workDetails?.skill_level || "semi_skilled",
        ).toLowerCase();
        if (skill.includes("high")) {
          rateBasic = 550;
          rateDa = 70;
        } else if (skill.includes("semi")) {
          rateBasic = 462;
          rateDa = 61;
        } else if (skill.includes("unskilled")) {
          rateBasic = 400;
          rateDa = 50;
        } else {
          rateBasic = 500;
          rateDa = 65;
        }
        rateAllowances = 0;
        basic = Math.round(rateBasic * daysWorked);
        da = Math.round(rateDa * daysWorked);
        const gross = basic + da;
        pf = Math.round(basic * 0.12);
        esi = Math.round(gross * 0.0075);
        pt = gross > 20000 ? 200 : 150;
        net = gross - pf - esi - pt;
      }

      const divDays = daysWorked > 0 ? daysWorked : 26;
      rateBasic = rateBasic || Math.round(basic / divDays);
      rateDa = rateDa || Math.round(da / divDays);
      rateAllowances = rateAllowances || Math.round(allowances / divDays);
    }

    const earnedBasic = basic;
    const earnedDa = da;
    const earnedAllowances = allowances;
    const normalRate = rateBasic + rateDa + rateAllowances;
    const earnedOt = Math.round((normalRate / 8) * 2 * otHours);
    const totalEarned = earnedBasic + earnedDa + earnedAllowances + earnedOt;

    const activeMonthName = latestRecord
      ? getMonthNameFromNumber(parseInt(latestRecord.month, 10))
      : getMonthNameFromNumber(new Date().getMonth() + 1);
    const activeYear = latestRecord
      ? latestRecord.year
      : String(new Date().getFullYear());

    const wagePeriodStr = `${activeMonthName} ${activeYear}`;

    const companyAddress = [
      primaryLocation?.address_line_1,
      primaryLocation?.city,
      primaryLocation?.state,
      primaryLocation?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const establishmentName =
      workDetails?.sites?.name || companyDetails.name || "";
    const establishmentAddress =
      [
        workDetails?.sites?.address_line_1,
        workDetails?.sites?.city,
        workDetails?.sites?.state,
        workDetails?.sites?.pincode,
      ]
        .filter(Boolean)
        .join(", ") || companyAddress;

    const employeeName =
      `${employee.first_name || ""} ${employee.middle_name || ""} ${employee.last_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    const guardians = employee.employee_guardians || [];

    return {
      dateOfIssue: latestRecord
        ? `07-${String(latestRecord.month).padStart(2, "0")}-${latestRecord.year}`
        : formatDate(new Date().toISOString()),
      establishmentName,
      establishmentAddress,
      period: wagePeriodStr,
      employeeName,
      fatherMotherSpouseName: getFatherMotherSpouseName(
        guardians,
        employee.middle_name,
      ),
      designation: workDetails?.position
        ? formatUnderscoreText(workDetails.position)
        : "",
      uan: statutoryDetails?.uan_number || "",
      bankAccountNumber: bankDetails?.account_number || "",
      wagePeriod: wagePeriodStr,
      rateBasic,
      rateDa,
      rateAllowances,
      daysWorked,
      earnedOt,
      totalEarned,
      deductionEpf: pf,
      deductionEsic: esi,
      deductionOthers: pt,
      totalDeductions: pf + esi + pt,
      netPayment: totalEarned - (pf + esi + pt),
    };
  });

  // Format data for Form VIII
  const formattedEmployeesFormVIII = employees.map((employee) => {
    const workDetails = Array.isArray(employee.work_details)
      ? employee.work_details[0]
      : employee.work_details;
    const statutoryDetails = Array.isArray(employee.employee_statutory_details)
      ? employee.employee_statutory_details[0]
      : employee.employee_statutory_details;

    const guardians = employee.employee_guardians || [];
    const addresses = employee.employee_addresses || [];
    const permAddr =
      addresses.find(
        (a: any) => a.address_type?.toLowerCase() === "permanent",
      ) || addresses[0];
    const tempAddr =
      addresses.find((a: any) => a.address_type?.toLowerCase() === "present") ||
      addresses[0];

    const employeeName =
      `${employee.first_name || ""} ${employee.middle_name || ""} ${employee.last_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    const companyAddress = [
      primaryLocation?.address_line_1,
      primaryLocation?.city,
      primaryLocation?.state,
      primaryLocation?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const establishmentName =
      workDetails?.sites?.name || companyDetails.name || "";
    const establishmentAddress =
      [
        workDetails?.sites?.address_line_1,
        workDetails?.sites?.city,
        workDetails?.sites?.state,
        workDetails?.sites?.pincode,
      ]
        .filter(Boolean)
        .join(", ") || companyAddress;

    const nominees = guardians.map((g: any) => {
      let dobStr = "";
      if (g.date_of_birth) {
        dobStr = formatDate(g.date_of_birth);
      } else if (g.age) {
        const yearOfBirth = new Date().getFullYear() - parseInt(g.age, 10);
        dobStr = `01-01-${yearOfBirth}`;
      }

      return {
        name: `${g.first_name || ""} ${g.last_name || ""}`
          .replace(/\s+/g, " ")
          .trim(),
        address: g.address || formatAddress(tempAddr),
        relationship: g.relationship || "",
        dateOfBirth: dobStr,
        share: g.proportion || (100 / (guardians.length || 1)).toFixed(0),
        guardianDetails: g.guardian_name
          ? `${g.guardian_name} (${g.guardian_relationship || ""}), ${g.guardian_address || ""}`
          : "",
      };
    });

    return {
      employeeCode: employee.employee_code || "",
      employeeName,
      fatherSpouseName: getFatherMotherSpouseName(
        guardians,
        employee.middle_name,
      ),
      dateOfBirth: formatDate(employee.date_of_birth),
      gender: employee.gender ? formatUnderscoreText(employee.gender) : "",
      maritalStatus: employee.marital_status
        ? formatUnderscoreText(employee.marital_status)
        : "",
      permanentAddress: formatAddress(permAddr),
      temporaryAddress: formatAddress(tempAddr),
      nominees,
      establishmentName,
      establishmentAddress,
      employerName: CANNY_MANAGEMENT_SERVICES_NAME,
    };
  });

  if (formatType === "pdf") {
    try {
      const mergedPdf = await PDFDocument.create();

      if (selectedForms.includes("form_i")) {
        const bytes = await generateFormIPdf(formattedEmployeesFormI);
        const doc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }
      if (selectedForms.includes("form_iii")) {
        const bytes = await generateFormIIIPdf(formattedEmployeesFormIII);
        const doc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }
      if (selectedForms.includes("form_iv_gratuity")) {
        const bytes = await generateFormIVGratuityPdf(formattedEmployeesFormIVGratuity);
        const doc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }
      if (selectedForms.includes("form_iv")) {
        const bytes = await generateFormIVPdf(formattedEmployeesFormIV);
        const doc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }
      if (selectedForms.includes("form_v")) {
        const bytes = await generateFormVPdf(formattedEmployeesFormV);
        const doc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }
      if (selectedForms.includes("form_viii")) {
        const bytes = await generateFormVIIIPdf(formattedEmployeesFormVIII);
        const doc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }

      const pdfBuffer = Buffer.from(await mergedPdf.save());

      let filename = "statutory_forms.pdf";
      if (selectedForms.length === 1) {
        if (selectedForms[0] === "form_i") {
          filename = "form_i_employee_register.pdf";
        } else if (selectedForms[0] === "form_iii") {
          filename = "form_iii_nomination_form.pdf";
        } else if (selectedForms[0] === "form_iv_gratuity") {
          filename = "form_iv_gratuity_application.pdf";
        } else if (selectedForms[0] === "form_iv") {
          filename = "form_iv_wages_overtime_register.pdf";
        } else if (selectedForms[0] === "form_v") {
          filename = "form_v_wage_slip.pdf";
        } else if (selectedForms[0] === "form_viii") {
          filename = "form_viii_nomination_form.pdf";
        }
      }

      return new Response(pdfBuffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=${filename}`,
        },
      });
    } catch (pdfErr) {
      console.error("PDF generation failed:", pdfErr);
      return new Response(
        JSON.stringify({ message: "Failed to generate PDF" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } else if (formatType === "excel") {
    try {
      const workbook = new ExcelJS.Workbook();

      employees.forEach((employee, empIdx) => {
        const empFormI = formattedEmployeesFormI[empIdx];
        const empFormIII = formattedEmployeesFormIII[empIdx];
        const empFormIV = formattedEmployeesFormIV[empIdx];
        const empFormIVGratuity = formattedEmployeesFormIVGratuity[empIdx];
        const empFormV = formattedEmployeesFormV[empIdx];
        const empFormVIII = formattedEmployeesFormVIII[empIdx];
        const code = employee.employee_code || `Employee_${empIdx + 1}`;

        if (selectedForms.includes("form_i")) {
          const sheet = workbook.addWorksheet(
            selectedForms.length > 1 ? `${code}_Form_I` : code,
          );

          // Set column widths
          sheet.getColumn(1).width = 8; // Sl
          sheet.getColumn(2).width = 45; // Particulars
          sheet.getColumn(3).width = 50; // Details

          // Title Rows
          sheet.mergeCells("A2:C2");
          const t1 = sheet.getCell("A2");
          t1.value = "Form I";
          t1.font = { name: "Arial", bold: true, size: 11 };
          t1.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(2).height = 18;

          sheet.mergeCells("A3:C3");
          const t2 = sheet.getCell("A3");
          t2.value = "(See clause (i) of sub-rule (1) of rule 51)";
          t2.font = { name: "Arial", italic: true, size: 8.5 };
          t2.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(3).height = 16;

          sheet.mergeCells("A4:C4");
          const t3 = sheet.getCell("A4");
          t3.value = "EMPLOYEE REGISTER";
          t3.font = { name: "Arial", bold: true, size: 10 };
          t3.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          sheet.getRow(4).height = 18;

          // Apply borders to header cells (rows 2 to 4)
          for (let r = 2; r <= 4; r++) {
            for (let c = 1; c <= 3; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Meta Details Rows (Rows 5 to 9)
          const metaData = [
            ["Name of the Establishment", empFormI.establishmentName],
            ["Name of the Employer", empFormI.employerName],
            ["Name of the Owner", empFormI.ownerName],
            ["PAN/TAN of the Employer", empFormI.employerPanTan],
            [
              "Registration Number of the establishment (Labour Identification Number (LIN) shall be the Registration Number of the Establishment)",
              empFormI.registrationNumber,
            ],
          ];

          metaData.forEach((row, rIdx) => {
            const rowNum = 5 + rIdx;
            sheet.mergeCells(`A${rowNum}:B${rowNum}`);
            const cellA = sheet.getCell(`A${rowNum}`);
            cellA.value = row[0];
            cellA.font = { name: "Arial", bold: true, size: 9 };
            cellA.alignment = { wrapText: true, vertical: "middle" };

            const cellC = sheet.getCell(`C${rowNum}`);
            cellC.value = row[1];
            cellC.font = { name: "Arial", size: 9 };
            cellC.alignment = { wrapText: true, vertical: "middle" };

            // Set height (especially for the registration number row which will wrap)
            sheet.getRow(rowNum).height = rowNum === 9 ? 32 : 20;

            // Borders
            const cells = [`A${rowNum}`, `B${rowNum}`, `C${rowNum}`];
            cells.forEach((ref) => {
              sheet.getCell(ref).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            });
          });

          // 36 fields data (Rows 10 to 45)
          const fields = [
            ["Employee Code", empFormI.employeeCode],
            ["Name", empFormI.name],
            ["Surname", empFormI.surname],
            ["Gender", empFormI.gender],
            ["Father's/Mother's/Spouse Name", empFormI.fatherMotherSpouseName],
            ["Date of Birth", empFormI.dateOfBirth],
            ["Place of Birth", empFormI.placeOfBirth],
            ["Nationality", empFormI.nationality],
            ["Education Level", empFormI.educationLevel],
            ["Date of Joining", empFormI.dateOfJoining],
            ["Designation", empFormI.designation],
            ["Category (HS/S/SS/US)*", empFormI.category],
            ["Type of Employment (P/T/FT/T/B)**", empFormI.typeOfEmployment],
            ["Details of Posting", empFormI.detailsOfPosting],
            ["Pay", empFormI.pay],
            ["Promotion", empFormI.promotion],
            ["Mobile Number", empFormI.mobileNumber],
            ["Universal Account Number (UAN)", empFormI.uan],
            ["PAN", empFormI.pan],
            [
              "Nominee (To be filled on the basis of Nomination form)",
              empFormI.nominee,
            ],
            ["Details of Family", empFormI.familyDetails],
            ["EPS/NPS", empFormI.epsNps],
            ["ESIC IP No.", empFormI.esicIp],
            ["AADHAAR NO.", empFormI.aadhaar],
            ["Bank A/c Number", empFormI.bankAccountNumber],
            ["Bank", empFormI.bankName],
            ["Branch (IFSC)", empFormI.branchIfsc],
            ["Present Address", empFormI.presentAddress],
            ["Permanent Address", empFormI.permanentAddress],
            ["Service Book No.", empFormI.serviceBookNo],
            ["Date of Exit", empFormI.dateOfExit],
            ["Reason for Exit", empFormI.reasonForExit],
            ["Mark of Identification", empFormI.markOfIdentification],
            ["Photo", empFormI.photoAttached],
            ["Specimen Signature/Thumb Impression", empFormI.specimenSignature],
            ["Remarks", empFormI.remarks],
          ];

          fields.forEach((field, fIdx) => {
            const rowNum = 10 + fIdx;
            const r = sheet.getRow(rowNum);
            r.getCell(1).value = fIdx + 1;
            r.getCell(2).value = field[0];
            r.getCell(3).value = field[1];
            // Present/Permanent addresses might wrap, let's wrap them
            const needsWrap = [20, 21, 28, 29].includes(fIdx + 1);
            r.height = needsWrap ? 28 : 18;

            r.getCell(1).alignment = {
              horizontal: "center",
              vertical: "middle",
            };
            r.getCell(2).font = { name: "Arial", bold: true, size: 9 };
            r.getCell(2).alignment = { vertical: "middle", wrapText: true };
            r.getCell(3).font = { name: "Arial", size: 9 };
            r.getCell(3).alignment = { vertical: "middle", wrapText: true };

            for (let c = 1; c <= 3; c++) {
              r.getCell(c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });

          // Footnotes at the bottom (Rows 46 and 47)
          sheet.mergeCells("A46:C46");
          const fn1 = sheet.getCell("A46");
          fn1.value = "* (Highly Skilled/Skilled/Semi skilled/Unskilled)";
          fn1.font = { name: "Arial", italic: true, size: 8.5 };
          fn1.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          sheet.getRow(46).height = 18;

          sheet.mergeCells("A47:C47");
          const fn2 = sheet.getCell("A47");
          fn2.value = "** (Permanent/Temporary/Fixed Term/Trainee/Badli)";
          fn2.font = { name: "Arial", italic: true, size: 8.5 };
          fn2.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          sheet.getRow(47).height = 18;

          // Apply borders for footnotes
          for (let r = 46; r <= 47; r++) {
            for (let c = 1; c <= 3; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }
        }

        if (selectedForms.includes("form_iii")) {
          const sheet = workbook.addWorksheet(
            selectedForms.length > 1 ? `${code}_Form_III` : code,
          );

          // Set column widths
          sheet.getColumn(1).width = 12; // Sl. No
          sheet.getColumn(2).width = 48; // Details of employee
          sheet.getColumn(3).width = 40; // Value

          // Title Rows
          sheet.mergeCells("A2:C2");
          const t1 = sheet.getCell("A2");
          t1.value = "FORM-III";
          t1.font = { name: "Arial", bold: true, size: 11 };
          t1.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(2).height = 18;

          sheet.mergeCells("A3:C3");
          const t2 = sheet.getCell("A3");
          t2.value = "[(See rules 32 (1),(2), (3) and (4)]";
          t2.font = { name: "Arial", italic: true, size: 8.5 };
          t2.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(3).height = 16;

          sheet.mergeCells("A4:C4");
          const t3 = sheet.getCell("A4");
          t3.value = "[For the purpose of Chapter-V]";
          t3.font = { name: "Arial", italic: true, size: 8.5 };
          t3.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(4).height = 16;

          sheet.mergeCells("A5:C5");
          const t4 = sheet.getCell("A5");
          t4.value = "Nomination/Fresh Nomination/Modification of Nomination";
          t4.font = { name: "Arial", bold: true, size: 10 };
          t4.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(5).height = 18;

          sheet.mergeCells("A6:C6");
          const t5 = sheet.getCell("A6");
          t5.value = "(Strike out the words not applicable)";
          t5.font = { name: "Arial", italic: true, size: 8.5 };
          t5.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(6).height = 16;

          // Apply borders to header cells (rows 2 to 6)
          for (let r = 2; r <= 6; r++) {
            for (let c = 1; c <= 3; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Row 7: Headers
          const h1 = sheet.getCell("A7");
          h1.value = "Sl. No.";
          h1.font = { name: "Arial", bold: true, size: 9 };
          h1.alignment = { horizontal: "center", vertical: "middle" };

          sheet.mergeCells("B7:C7");
          const h2 = sheet.getCell("B7");
          h2.value = "Details of the employee:";
          h2.font = { name: "Arial", bold: true, size: 9 };
          h2.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          sheet.getRow(7).height = 20;

          for (let c = 1; c <= 3; c++) {
            sheet.getCell(7, c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          // Rows 8 to 18: Main Fields
          const fields = [
            ["Name of employee in full", empFormIII.nameFull],
            ["Father's/Spouse's name", empFormIII.fatherSpouseName],
            ["Date of Birth (- - /- - /- - - -)", empFormIII.dateOfBirth],
            ["Universal Account Number(if available):", empFormIII.uan],
            ["Sex", empFormIII.gender],
            ["Religion", empFormIII.religion],
            [
              "Whether unmarried/married/widow/widower",
              empFormIII.maritalStatus,
            ],
            ["Department/Branch/Section where employed", empFormIII.department],
            [
              "Post held with Ticket No. or Serial No., if any",
              empFormIII.postHeld,
            ],
            ["Date of appointment", empFormIII.dateOfAppointment],
            ["Date of superannuation", empFormIII.dateOfSuperannuation],
          ];

          fields.forEach((field, fIdx) => {
            const rowNum = 8 + fIdx;
            const r = sheet.getRow(rowNum);
            r.getCell(1).value = fIdx + 1;
            r.getCell(2).value = field[0];
            r.getCell(3).value = field[1];
            r.height = 18;

            r.getCell(1).alignment = {
              horizontal: "center",
              vertical: "middle",
            };
            r.getCell(2).font = { name: "Arial", size: 9 };
            r.getCell(2).alignment = { vertical: "middle", wrapText: true };
            r.getCell(3).font = { name: "Arial", size: 9 };
            r.getCell(3).alignment = { vertical: "middle", wrapText: true };

            for (let c = 1; c <= 3; c++) {
              r.getCell(c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });

          // Row 19: Permanent address header
          const r19 = sheet.getRow(19);
          r19.getCell(1).value = 12;
          sheet.mergeCells("B19:C19");
          const cellB19 = sheet.getCell("B19");
          cellB19.value = "Permanent address:";
          cellB19.font = { name: "Arial", bold: true, size: 9 };
          cellB19.alignment = {
            horizontal: "left",
            vertical: "middle",
            indent: 1,
          };
          r19.height = 20;

          for (let c = 1; c <= 3; c++) {
            r19.getCell(c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          // Rows 20 to 28: Permanent address components
          const addrFields = [
            ["Village:", empFormIII.village],
            ["Post-Office:", empFormIII.postOffice],
            ["Thana:", empFormIII.thana],
            ["Sub-Division:", empFormIII.subDivision],
            ["District:", empFormIII.district],
            ["State:", empFormIII.state],
            ["Pin-Code:", empFormIII.pincode],
            ["E-mail ID:", empFormIII.personalEmail],
            ["Mobile Number:", empFormIII.mobileNumber],
          ];

          addrFields.forEach((field, aIdx) => {
            const rowNum = 20 + aIdx;
            const r = sheet.getRow(rowNum);
            r.getCell(1).value = "";
            r.getCell(2).value = field[0];
            r.getCell(3).value = field[1];
            r.height = 18;

            r.getCell(1).alignment = {
              horizontal: "center",
              vertical: "middle",
            };
            r.getCell(2).font = { name: "Arial", size: 9 };
            r.getCell(2).alignment = { vertical: "middle", wrapText: true };
            r.getCell(3).font = { name: "Arial", size: 9 };
            r.getCell(3).alignment = { vertical: "middle", wrapText: true };

            for (let c = 1; c <= 3; c++) {
              r.getCell(c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });
        }

        if (selectedForms.includes("form_iv")) {
          const sheet = workbook.addWorksheet(
            selectedForms.length > 1 ? `${code}_Form_IV` : code,
          );

          // Set column widths
          sheet.getColumn(1).width = 8; // Sl. No
          sheet.getColumn(2).width = 45; // Particulars
          sheet.getColumn(3).width = 50; // Details

          // Title Rows
          sheet.mergeCells("A2:C2");
          const t1 = sheet.getCell("A2");
          t1.value = "FORM-IV";
          t1.font = { name: "Arial", bold: true, size: 11 };
          t1.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(2).height = 18;

          sheet.mergeCells("A3:C3");
          const t2 = sheet.getCell("A3");
          t2.value = "(See clause (ii) of sub rule (1) of rule 51)";
          t2.font = { name: "Arial", italic: true, size: 8.5 };
          t2.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(3).height = 16;

          sheet.mergeCells("A4:C4");
          const t3 = sheet.getCell("A4");
          t3.value =
            "REGISTER OF WAGES, OVERTIME, ADVANCES, FINES AND DEDUCTIONS FOR DAMAGE AND LOSS";
          t3.font = { name: "Arial", bold: true, size: 10 };
          t3.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(4).height = 20;

          // Apply borders to header cells (rows 2 to 4)
          for (let r = 2; r <= 4; r++) {
            for (let c = 1; c <= 3; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Meta Details Rows (Rows 5 to 9)
          const metaData = [
            ["Name of the Establishment", empFormIV.establishmentName],
            ["Name of the Employer", empFormIV.employerName],
            ["Name of the Owner", empFormIV.ownerName],
            ["PAN/TAN of the Employer", empFormIV.employerPanTan],
            [
              "Registration Number of the establishment (Labour Identification Number (LIN) shall be the Registration Number of the Establishment)",
              empFormIV.registrationNumber,
            ],
          ];

          metaData.forEach((row, rIdx) => {
            const rowNum = 5 + rIdx;
            sheet.mergeCells(`A${rowNum}:B${rowNum}`);
            const cellA = sheet.getCell(`A${rowNum}`);
            cellA.value = row[0];
            cellA.font = { name: "Arial", bold: true, size: 9 };
            cellA.alignment = { wrapText: true, vertical: "middle" };

            const cellC = sheet.getCell(`C${rowNum}`);
            cellC.value = row[1];
            cellC.font = { name: "Arial", size: 9 };
            cellC.alignment = { wrapText: true, vertical: "middle" };

            sheet.getRow(rowNum).height = rowNum === 9 ? 32 : 20;

            const cells = [`A${rowNum}`, `B${rowNum}`, `C${rowNum}`];
            cells.forEach((ref) => {
              sheet.getCell(ref).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            });
          });

          // 33 Fields (Rows 10 to 42)
          const fields = [
            ["Employee Code / Sr. No in Register", empFormIV.employeeCode],
            ["Name of the Employee", `${empFormIV.name} ${empFormIV.surname}`],
            ["Designation", empFormIV.designation],
            ["Department", empFormIV.department],
            ["Duration of Payment of wages", empFormIV.paymentDuration],
            ["Wage Period From-To", empFormIV.wagePeriod],
            [
              "Total no. of days worked during the wage period",
              empFormIV.daysWorked,
            ],
            ["Total overtime hours worked", empFormIV.otHours],
            ["Rate of wages - Basic", empFormIV.rateBasic],
            ["Rate of wages - DA", empFormIV.rateDa],
            ["Rate of wages - Allowances", empFormIV.rateAllowances],
            ["Amount of wages earned - Basic", empFormIV.earnedBasic],
            ["Amount of wages earned - DA", empFormIV.earnedDa],
            ["Amount of wages earned - Allowances", empFormIV.earnedAllowances],
            ["Amount of wages earned - Overtime", empFormIV.earnedOt],
            [
              "Amount of wages earned - Total wages earned",
              empFormIV.totalEarned,
            ],
            ["Deductions - EPF", empFormIV.deductionEpf],
            ["Deductions - ESIC", empFormIV.deductionEsic],
            ["Deductions - Society", empFormIV.deductionSociety],
            ["Deductions - Income Tax", empFormIV.deductionIt],
            ["Deductions - Insurance", empFormIV.deductionInsurance],
            ["Deductions - Advances", empFormIV.deductionAdvances],
            ["Deductions - Recovery of Fine", empFormIV.deductionFines],
            [
              "Deductions - Recovery on account of Damages/Losses",
              empFormIV.deductionDamages,
            ],
            ["Deductions - Others (PT)", empFormIV.deductionOthers],
            ["Deductions - Total Deductions", empFormIV.totalDeductions],
            ["Net Payment", empFormIV.netPayment],
            ["Date of Payment", empFormIV.paymentDate],
            ["Receipt by employee/Bank transaction ID", empFormIV.receiptId],
            [
              "Nature of acts and omissions for which fine imposed with date",
              empFormIV.fineOmissions,
            ],
            ["Amount of fine imposed", empFormIV.fineAmount],
            [
              "Damage or loss caused to the employer by neglect or default",
              empFormIV.damageNeglect,
            ],
            [
              "Signature of Employer/Employer Representative",
              empFormIV.employerSignature,
            ],
          ];

          fields.forEach((field, fIdx) => {
            const rowNum = 10 + fIdx;
            const r = sheet.getRow(rowNum);
            r.getCell(1).value = fIdx + 1;
            r.getCell(2).value = field[0];
            r.getCell(3).value = field[1];
            r.height = 18;

            r.getCell(1).alignment = {
              horizontal: "center",
              vertical: "middle",
            };
            r.getCell(2).font = { name: "Arial", bold: true, size: 9 };
            r.getCell(2).alignment = { vertical: "middle", wrapText: true };
            r.getCell(3).font = { name: "Arial", size: 9 };
            r.getCell(3).alignment = { vertical: "middle", wrapText: true };

            for (let c = 1; c <= 3; c++) {
              r.getCell(c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });
        }

        if (selectedForms.includes("form_iv_gratuity")) {
          const sheet = workbook.addWorksheet(
            selectedForms.length > 1 ? `${code}_Form_IV_Grat` : code,
          );

          // Hide gridlines
          sheet.views = [{ showGridLines: false }];

          // Set column widths to give it a spacious look
          sheet.getColumn(1).width = 110;

          const addTextRow = (
            rowNum: number,
            text: string,
            options?: {
              bold?: boolean;
              italic?: boolean;
              align?: "left" | "center" | "right";
              size?: number;
              height?: number;
            },
          ) => {
            const cell = sheet.getCell(`A${rowNum}`);
            cell.value = text;
            cell.font = {
              name: "Arial",
              bold: options?.bold ?? false,
              italic: options?.italic ?? false,
              size: options?.size ?? 10,
            };
            cell.alignment = {
              horizontal: options?.align ?? "left",
              vertical: "middle",
              wrapText: true,
            };
            if (options?.height) {
              sheet.getRow(rowNum).height = options.height;
            } else {
              sheet.getRow(rowNum).height = 20;
            }
          };

          // Title
          addTextRow(2, "FORM-IV", { bold: true, align: "center", size: 11 });
          addTextRow(3, "[(See rule 33(7))]", {
            italic: true,
            align: "center",
            size: 8.5,
          });
          addTextRow(
            4,
            "Application for gratuity by an Employee/nominee/legal heir",
            { bold: true, align: "center", size: 10.5 },
          );
          addTextRow(5, "(Strike out the words not applicable)", {
            italic: true,
            align: "center",
            size: 8.5,
          });

          // To
          addTextRow(7, "To,", { bold: true });
          addTextRow(8, `     ${empFormIVGratuity.establishmentName}`, {
            bold: true,
          });
          addTextRow(9, `     (${empFormIVGratuity.establishmentAddress})`, {
            italic: true,
          });

          // Salutation
          addTextRow(11, "Sir/Madam,", { bold: true });

          // Body
          const applicantLabel = empFormIVGratuity.isClaimedByNominee
            ? empFormIVGratuity.nomineeName
            : empFormIVGratuity.employeeName;
          const bodyText = `     I, ${applicantLabel || "................................................"}, ${empFormIVGratuity.isClaimedByNominee ? `as nominee of late ${empFormIVGratuity.employeeName} / as a legal heir of late ${empFormIVGratuity.employeeName}` : "[name of employee]"}, want to apply for payment of gratuity to which I am entitled under sub-section (1) of section 53 of the Code on Social Security, 2020 (36 of 2020) on account of-`;
          addTextRow(12, bodyText, { height: 35 });

          // Options
          const optA = `     (a) ${empFormIVGratuity.isClaimedByNominee ? "[ ]" : "[x]"} my superannuation/retirement/resignation after completion of not less than five years of continuous service/total disablement due to accident/total disablement due to disease/ on termination of contract period under fixed term employment with effect from the ${empFormIVGratuity.terminationDate || "......................"} or;`;
          addTextRow(13, optA, { height: 35 });

          const optB = `     (b) ${empFormIVGratuity.isClaimedByNominee && empFormIVGratuity.dateOfDeath ? "[x]" : "[ ]"} death of the aforesaid employee while in service/superannuation on ${empFormIVGratuity.terminationDate || "......................"} after completion of ${empFormIVGratuity.yearsOfService || ".........."} years of service/total disablement of the aforesaid employee due to accident or disease while in service with effect from the ${empFormIVGratuity.terminationDate || "......................"} or;`;
          addTextRow(14, optB, { height: 35 });

          const optC = `     (c) ${empFormIVGratuity.isClaimedByNominee && !empFormIVGratuity.dateOfDeath ? "[x]" : "[ ]"} death of aforesaid employee of your establishment while in service/superannuation on ${empFormIVGratuity.terminationDate || "......................"} without making any nomination after completion of ${empFormIVGratuity.yearsOfService || ".........."} years of service/total disablement of the aforesaid employee due to accident or disease while in service with effect from ${empFormIVGratuity.terminationDate || "......................"}.`;
          addTextRow(15, optC, { height: 35 });

          addTextRow(
            17,
            "Necessary particulars relating to my appointment are given in the statement below.",
            { bold: true },
          );

          // Statement Points
          addTextRow(
            19,
            `1. Name of employee in full, (if the gratuity is claimed by an employee): ${!empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.employeeName : "........................................................"}`,
          );
          addTextRow(
            20,
            `   a. Marital status of employee(unmarried/married/widow/widower): ${!empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.employeeMaritalStatus : "................................"}`,
          );
          addTextRow(
            21,
            `   b. Address in full of employee: ${!empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.employeeAddress : "................................................................................"}`,
          );

          addTextRow(23, "   or", { bold: true, italic: true });

          addTextRow(
            25,
            `2. Name of nominee/legal heir, (if the gratuity is claimed by nominee/legal heir): ${empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.nomineeName : "........................................................"}`,
          );
          addTextRow(
            26,
            `   a. Name of Employee: ${empFormIVGratuity.employeeName || "........................................................"}`,
          );
          addTextRow(
            27,
            `   b. Marital status of nominee/legal heir(unmarried/married/widow/widower): ${empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.nomineeMaritalStatus || "................................" : "................................"}`,
          );
          addTextRow(
            28,
            `   c. Relationship of nominee/legal heir with the employee: ${empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.nomineeRelationship : "................................"}`,
          );
          addTextRow(
            29,
            `   d. Address in full of nominee/legal heir: ${empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.nomineeAddress || "................................................................................" : "................................................................................"}`,
          );
          addTextRow(
            30,
            `   e. Date of death and proof of death of the employee: ${empFormIVGratuity.isClaimedByNominee ? empFormIVGratuity.dateOfDeath : "................................"}`,
          );
          addTextRow(
            31,
            `   f. Reference No. of recorded nomination, if available: ${empFormIVGratuity.nomineeReferenceNo || "................................"}`,
          );

          addTextRow(
            33,
            `3. Department/Branch/Section where last employed: ${empFormIVGratuity.department || "........................................................"}`,
          );
          addTextRow(
            34,
            `4. Post held by employee: ${empFormIVGratuity.position || "........................................................"}`,
          );
          addTextRow(
            35,
            `5. Date of appointment: ${empFormIVGratuity.dateOfJoining || "................................"}`,
          );
          addTextRow(
            36,
            `6. Date and cause of termination of service: ${empFormIVGratuity.terminationDate ? `${empFormIVGratuity.terminationDate} (${empFormIVGratuity.causeOfTermination})` : "........................................................"}`,
          );
          addTextRow(
            37,
            `7. Date of Death: ${empFormIVGratuity.dateOfDeath || "................................"}`,
          );
          addTextRow(
            38,
            `8. Total period of service of the employee: ${empFormIVGratuity.yearsOfService || "................................"}`,
          );
          addTextRow(
            39,
            `9. Total wages last drawn by the employee: ${empFormIVGratuity.lastDrawnSalary ? `${empFormIVGratuity.lastDrawnSalary}/-` : "................................"}`,
          );
          addTextRow(
            40,
            `10. Total gratuity payable to the employee/ share of gratuity claimed by a nominee/legal heir: ${empFormIVGratuity.gratuityAmount || "................................"}`,
          );
          addTextRow(
            41,
            `11. Payment may please be made by crossed bank cheque/credit in my bank account no.....: ${empFormIVGratuity.bankAccountNumber ? `A/c No: ${empFormIVGratuity.bankAccountNumber} (${empFormIVGratuity.bankName || "Bank"})` : "................................................................................"}`,
          );

          // Sign-off
          addTextRow(
            43,
            `Place: ${empFormIVGratuity.place || "......................"}`,
          );
          addTextRow(
            44,
            `Date: ${empFormIVGratuity.date || "......................"}`,
          );

          const cellSign = sheet.getCell("A46");
          cellSign.value =
            "Yours faithfully,\n\nSignature/Thumb-impression of the\napplicant employee/nominee/legal heir.";
          cellSign.font = { name: "Arial", bold: true, size: 9.5 };
          cellSign.alignment = {
            horizontal: "right",
            vertical: "middle",
            wrapText: true,
          };
        }

        if (selectedForms.includes("form_v")) {
          const sheet = workbook.addWorksheet(
            selectedForms.length > 1 ? `${code}_Form_V` : code,
          );

          // Set column widths
          sheet.getColumn(1).width = 8; // Sl
          sheet.getColumn(2).width = 45; // Particulars
          sheet.getColumn(3).width = 50; // Details

          // Title Rows
          sheet.mergeCells("A2:C2");
          const t1 = sheet.getCell("A2");
          t1.value = "FORM V";
          t1.font = { name: "Arial", bold: true, size: 11 };
          t1.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(2).height = 18;

          sheet.mergeCells("A3:C3");
          const t2 = sheet.getCell("A3");
          t2.value = "(See rule 52)";
          t2.font = { name: "Arial", italic: true, size: 8.5 };
          t2.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(3).height = 16;

          sheet.mergeCells("A4:C4");
          const t3 = sheet.getCell("A4");
          t3.value = "WAGE SLIP";
          t3.font = { name: "Arial", bold: true, size: 10 };
          t3.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(4).height = 18;

          // Apply borders to header cells (rows 2 to 4)
          for (let r = 2; r <= 4; r++) {
            for (let c = 1; c <= 3; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Top Meta Rows (Rows 5 to 8)
          const metaData = [
            ["Date of issue", empFormV.dateOfIssue],
            ["Name of the Establishment", empFormV.establishmentName],
            ["Address", empFormV.establishmentAddress],
            ["Period", empFormV.period],
          ];

          metaData.forEach((row, rIdx) => {
            const rowNum = 5 + rIdx;
            sheet.mergeCells(`A${rowNum}:B${rowNum}`);
            const cellA = sheet.getCell(`A${rowNum}`);
            cellA.value = row[0];
            cellA.font = { name: "Arial", bold: true, size: 9 };
            cellA.alignment = { wrapText: true, vertical: "middle" };

            const cellC = sheet.getCell(`C${rowNum}`);
            cellC.value = row[1];
            cellC.font = { name: "Arial", size: 9 };
            cellC.alignment = { wrapText: true, vertical: "middle" };

            sheet.getRow(rowNum).height = 20;

            const cells = [`A${rowNum}`, `B${rowNum}`, `C${rowNum}`];
            cells.forEach((ref) => {
              sheet.getCell(ref).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            });
          });

          // Numbered rows (1 to 12) starting at row 9
          const rowsList = [
            ["1.", "Name of employee", empFormV.employeeName],
            [
              "2.",
              "Father’s/Mother’s/Spouse Name",
              empFormV.fatherMotherSpouseName,
            ],
            ["3.", "Designation", empFormV.designation],
            ["4.", "UAN", empFormV.uan],
            ["5.", "Bank Account Number", empFormV.bankAccountNumber],
            ["6.", "Wage period", empFormV.wagePeriod],
            ["7.", "Rate of wages payable", ""],
            ["", "   a. Basic", empFormV.rateBasic],
            ["", "   b. DA", empFormV.rateDa],
            ["", "   c. Allowances", empFormV.rateAllowances],
            ["8.", "Total attendance/unit of work done", empFormV.daysWorked],
            ["9.", "Overtime wages", empFormV.earnedOt],
            ["10.", "Gross wages payable", empFormV.totalEarned],
            ["11.", "Total deductions", ""],
            ["", "   a. PF", empFormV.deductionEpf],
            ["", "   b. ESI", empFormV.deductionEsic],
            ["", "   c. Others", empFormV.deductionOthers],
            ["12.", "Net wages paid", empFormV.netPayment],
          ];

          rowsList.forEach((row, rIdx) => {
            const rowNum = 9 + rIdx;
            sheet.getRow(rowNum).height = 20;

            const cellA = sheet.getCell(`A${rowNum}`);
            cellA.value = row[0];
            cellA.font = { name: "Arial", size: 9 };
            cellA.alignment = { horizontal: "center", vertical: "middle" };

            const cellB = sheet.getCell(`B${rowNum}`);
            cellB.value = row[1];
            const isMainRowHeader =
              row[0] === "7." ||
              row[0] === "11." ||
              row[0] === "1." ||
              row[0] === "2." ||
              row[0] === "3." ||
              row[0] === "4." ||
              row[0] === "5." ||
              row[0] === "6." ||
              row[0] === "8." ||
              row[0] === "9." ||
              row[0] === "10." ||
              row[0] === "12.";
            cellB.font = { name: "Arial", bold: isMainRowHeader, size: 9 };
            cellB.alignment = {
              vertical: "middle",
              indent: row[0] === "" ? 1 : 0,
            };

            const cellC = sheet.getCell(`C${rowNum}`);
            cellC.value = row[2];
            cellC.font = { name: "Arial", size: 9 };
            cellC.alignment = { vertical: "middle" };

            for (let c = 1; c <= 3; c++) {
              sheet.getCell(rowNum, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });

          // Signature Block inside the box
          const sigRowNum = 9 + rowsList.length;
          sheet.mergeCells(`A${sigRowNum}:C${sigRowNum}`);
          const cellSign = sheet.getCell(`A${sigRowNum}`);
          cellSign.value = "*Employer / Pay-in-charge signature";
          cellSign.font = { name: "Arial", bold: true, size: 9 };
          cellSign.alignment = { horizontal: "left", vertical: "bottom" };
          sheet.getRow(sigRowNum).height = 60;

          for (let c = 1; c <= 3; c++) {
            sheet.getCell(sigRowNum, c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          // Footer note outside the box (one blank row then the note)
          const noteRowNum = sigRowNum + 2;
          sheet.mergeCells(`A${noteRowNum}:C${noteRowNum}`);
          const cellNote = sheet.getCell(`A${noteRowNum}`);
          cellNote.value =
            "Note: Required in case register is maintained physically";
          cellNote.font = { name: "Arial", italic: true, size: 8.5 };
          cellNote.alignment = { horizontal: "left", vertical: "middle" };
          sheet.getRow(noteRowNum).height = 20;
        }

        if (selectedForms.includes("form_viii")) {
          const sheet = workbook.addWorksheet(
            selectedForms.length > 1 ? `${code}_Form_VIII` : code,
          );

          // Column widths
          sheet.getColumn(1).width = 8;
          sheet.getColumn(2).width = 45;
          sheet.getColumn(3).width = 50;

          // Title
          sheet.mergeCells("A2:C2");
          const t1 = sheet.getCell("A2");
          t1.value = "FORM-VIII";
          t1.font = { name: "Arial", bold: true, size: 11 };
          t1.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(2).height = 18;

          sheet.mergeCells("A3:C3");
          const t2 = sheet.getCell("A3");
          t2.value = "[See clause (a) of sub-rule (1) of rule 45]";
          t2.font = { name: "Arial", italic: true, size: 8.5 };
          t2.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(3).height = 16;

          sheet.mergeCells("A4:C4");
          const t3 = sheet.getCell("A4");
          t3.value = "NOMINATION FORM";
          t3.font = { name: "Arial", bold: true, size: 10 };
          t3.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(4).height = 18;

          for (let r = 2; r <= 4; r++) {
            for (let c = 1; c <= 3; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Numbered fields 1 to 6
          const fieldsData = [
            [
              "1.",
              "Name of person making nomination (In block letters)",
              empFormVIII.employeeName.toUpperCase(),
            ],
            ["2.", "Father’s/Spouse’s Name", empFormVIII.fatherSpouseName],
            ["3.", "Date of Birth", empFormVIII.dateOfBirth],
            ["4.", "Sex", empFormVIII.gender],
            ["5.", "Marital Status", empFormVIII.maritalStatus],
            ["6.", "Address", ""],
            ["", "   a. Permanent", empFormVIII.permanentAddress],
            ["", "   b. Temporary", empFormVIII.temporaryAddress],
          ];

          fieldsData.forEach((row, rIdx) => {
            const rowNum = 5 + rIdx;
            sheet.getRow(rowNum).height = 20;

            const cellA = sheet.getCell(`A${rowNum}`);
            cellA.value = row[0];
            cellA.font = { name: "Arial", size: 9 };
            cellA.alignment = { horizontal: "center", vertical: "middle" };

            const cellB = sheet.getCell(`B${rowNum}`);
            cellB.value = row[1];
            cellB.font = { name: "Arial", bold: row[0] !== "", size: 9 };
            cellB.alignment = { vertical: "middle" };

            const cellC = sheet.getCell(`C${rowNum}`);
            cellC.value = row[2];
            cellC.font = { name: "Arial", size: 9 };
            cellC.alignment = { vertical: "middle", wrapText: true };

            for (let c = 1; c <= 3; c++) {
              sheet.getCell(rowNum, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });

          // Intro paragraph
          const introRowNum = 5 + fieldsData.length;
          sheet.mergeCells(`A${introRowNum}:C${introRowNum}`);
          const cellIntro = sheet.getCell(`A${introRowNum}`);
          cellIntro.value =
            "I hereby nominate the person(s)/cancel the nomination made by me previously and nominate the person(s) mentioned below to receive any amount due to me from the employer in the event of my death:-";
          cellIntro.font = { name: "Arial", italic: true, size: 8.5 };
          cellIntro.alignment = { wrapText: true, vertical: "middle" };
          sheet.getRow(introRowNum).height = 30;

          for (let c = 1; c <= 3; c++) {
            sheet.getCell(introRowNum, c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          // Nomination Table Headers
          const tableHeaderRowNum = introRowNum + 1;
          const headers = [
            "Name of nominee /nominees\n(1)",
            "Address\n(2)",
            "Nominee's relationship\n(3)",
            "Date of Birth\n(4)",
            "Total share (%)\n(5)",
            "Guardian details\n(6)",
          ];

          sheet.getColumn(4).width = 15;
          sheet.getColumn(5).width = 15;
          sheet.getColumn(6).width = 30;

          sheet.getRow(tableHeaderRowNum).height = 35;
          headers.forEach((h, hIdx) => {
            const cell = sheet.getCell(tableHeaderRowNum, hIdx + 1);
            cell.value = h;
            cell.font = { name: "Arial", bold: true, size: 8.5 };
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });

          const displayedNominees = [...empFormVIII.nominees];
          while (displayedNominees.length < 8) {
            displayedNominees.push({
              name: "",
              address: "",
              relationship: "",
              dateOfBirth: "",
              share: "",
              guardianDetails: "",
            });
          }

          displayedNominees.forEach((nom, nIdx) => {
            const rNum = tableHeaderRowNum + 1 + nIdx;
            sheet.getRow(rNum).height = 24;

            const rowData = [
              nom.name,
              nom.address,
              nom.relationship,
              nom.dateOfBirth,
              nom.share ? `${nom.share}%` : "",
              nom.guardianDetails,
            ];

            rowData.forEach((val, cIdx) => {
              const cell = sheet.getCell(rNum, cIdx + 1);
              cell.value = val;
              cell.font = { name: "Arial", size: 8.5 };
              cell.alignment = {
                horizontal: "center",
                vertical: "middle",
                wrapText: true,
              };
              cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            });
          });

          // Certifications
          const certStartRow = tableHeaderRowNum + 9;
          const certs = [
            "1. Certified that I have no family and if I acquire a family hereafter, the above nomination shall be deemed as cancelled.",
            "2. Certified that my father/mother is/are dependent upon me.",
            "3. Strike out whichever is not applicable.",
          ];

          certs.forEach((cert, cIdx) => {
            const rNum = certStartRow + cIdx;
            sheet.mergeCells(`A${rNum}:F${rNum}`);
            const cell = sheet.getCell(`A${rNum}`);
            cell.value = cert;
            cell.font = { name: "Arial", size: 8.5 };
            cell.alignment = { vertical: "middle" };
            sheet.getRow(rNum).height = 18;

            for (let c = 1; c <= 6; c++) {
              sheet.getCell(rNum, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          });

          // Signature row
          const signRow = certStartRow + 3;
          sheet.mergeCells(`A${signRow}:F${signRow}`);
          const cellSign = sheet.getCell(`A${signRow}`);
          cellSign.value =
            "\n\nSignature or the thumb impression of the employee";
          cellSign.font = { name: "Arial", bold: true, size: 9 };
          cellSign.alignment = { horizontal: "right", vertical: "bottom" };
          sheet.getRow(signRow).height = 40;

          for (let c = 1; c <= 6; c++) {
            sheet.getCell(signRow, c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          // Page 2: CERTIFICATE BY EMPLOYER
          const certTitleRow = signRow + 2;
          sheet.mergeCells(`A${certTitleRow}:F${certTitleRow}`);
          const cellCertTitle = sheet.getCell(`A${certTitleRow}`);
          cellCertTitle.value = "CERTIFICATE BY EMPLOYER";
          cellCertTitle.font = { name: "Arial", bold: true, size: 10 };
          cellCertTitle.alignment = {
            horizontal: "center",
            vertical: "middle",
          };
          sheet.getRow(certTitleRow).height = 20;

          const certBodyRow = certTitleRow + 1;
          sheet.mergeCells(`A${certBodyRow}:F${certBodyRow + 2}`);
          const cellCertBody = sheet.getCell(`A${certBodyRow}`);
          cellCertBody.value = `Certified that the above declaration and nomination has been signed/thumb impressed before me by Shri/Smt/Ku ${empFormVIII.employeeName} employed in my establishment after he/she has read the entry/entries or have been read over to him/her by me and got confirmed by him/her in either of the cases.`;
          cellCertBody.font = { name: "Arial", size: 9 };
          cellCertBody.alignment = { vertical: "middle", wrapText: true };
          sheet.getRow(certBodyRow).height = 20;
          sheet.getRow(certBodyRow + 1).height = 20;
          sheet.getRow(certBodyRow + 2).height = 20;

          for (let r = certTitleRow; r <= certBodyRow + 2; r++) {
            for (let c = 1; c <= 6; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Employer fields grid
          const empFields = [
            [
              "Signature of the employer or other authorised officer",
              "",
              "Designation",
              "",
            ],
            [
              "Place",
              empFormVIII.establishmentAddress
                .split(",")
                .slice(-2, -1)[0]
                ?.trim() || "Mumbai",
              "Date",
              "",
            ],
          ];

          let currRow = certBodyRow + 3;
          empFields.forEach((row) => {
            sheet.mergeCells(`A${currRow}:B${currRow}`);
            const cellA = sheet.getCell(`A${currRow}`);
            cellA.value = row[0];
            cellA.font = { name: "Arial", bold: true, size: 8.5 };
            cellA.alignment = { vertical: "middle" };

            const cellC = sheet.getCell(`C${currRow}`);
            cellC.value = row[1];
            cellC.font = { name: "Arial", size: 8.5 };
            cellC.alignment = { vertical: "middle" };

            sheet.mergeCells(`D${currRow}:E${currRow}`);
            const cellD = sheet.getCell(`D${currRow}`);
            cellD.value = row[2];
            cellD.font = { name: "Arial", bold: true, size: 8.5 };
            cellD.alignment = { vertical: "middle" };

            const cellF = sheet.getCell(`F${currRow}`);
            cellF.value = row[3];
            cellF.font = { name: "Arial", size: 8.5 };
            cellF.alignment = { vertical: "middle" };

            sheet.getRow(currRow).height = 22;

            for (let c = 1; c <= 6; c++) {
              sheet.getCell(currRow, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
            currRow++;
          });

          // Establishment Details row
          sheet.mergeCells(`A${currRow}:B${currRow + 1}`);
          const cellEstLabel = sheet.getCell(`A${currRow}`);
          cellEstLabel.value =
            "Name and Address of the Factory/Establishment and rubber stamp thereof";
          cellEstLabel.font = { name: "Arial", bold: true, size: 8.5 };
          cellEstLabel.alignment = { vertical: "middle", wrapText: true };

          sheet.mergeCells(`C${currRow}:F${currRow + 1}`);
          const cellEstVal = sheet.getCell(`C${currRow}`);
          cellEstVal.value = `${empFormVIII.establishmentName}\n${empFormVIII.establishmentAddress}`;
          cellEstVal.font = { name: "Arial", size: 8.5 };
          cellEstVal.alignment = { vertical: "middle", wrapText: true };

          sheet.getRow(currRow).height = 20;
          sheet.getRow(currRow + 1).height = 20;

          for (let r = currRow; r <= currRow + 1; r++) {
            for (let c = 1; c <= 6; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }
          currRow += 2;

          // Acknowledgement by Employee
          const ackTitleRow = currRow + 1;
          sheet.mergeCells(`A${ackTitleRow}:F${ackTitleRow}`);
          const cellAckTitle = sheet.getCell(`A${ackTitleRow}`);
          cellAckTitle.value = "ACKNOWLEDGEMENT BY THE EMPLOYEE";
          cellAckTitle.font = { name: "Arial", bold: true, size: 10 };
          cellAckTitle.alignment = { horizontal: "center", vertical: "middle" };
          sheet.getRow(ackTitleRow).height = 20;

          const ackBodyRow = ackTitleRow + 1;
          sheet.mergeCells(`A${ackBodyRow}:F${ackBodyRow + 1}`);
          const cellAckBody = sheet.getCell(`A${ackBodyRow}`);
          cellAckBody.value =
            "Received the duplicate copy of nomination in Form-VIII filed by me and duty certified by the employer.";
          cellAckBody.font = { name: "Arial", size: 9 };
          cellAckBody.alignment = { vertical: "middle", wrapText: true };
          sheet.getRow(ackBodyRow).height = 20;
          sheet.getRow(ackBodyRow + 1).height = 20;

          for (let r = ackTitleRow; r <= ackBodyRow + 1; r++) {
            for (let c = 1; c <= 6; c++) {
              sheet.getCell(r, c).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // Date and Employee signature row
          const ackSignRow = ackBodyRow + 2;
          sheet.mergeCells(`A${ackSignRow}:B${ackSignRow}`);
          const cellAckDateLabel = sheet.getCell(`A${ackSignRow}`);
          cellAckDateLabel.value = "Date";
          cellAckDateLabel.font = { name: "Arial", bold: true, size: 8.5 };
          cellAckDateLabel.alignment = { vertical: "middle" };

          const cellAckDateVal = sheet.getCell(`C${ackSignRow}`);
          cellAckDateVal.font = { name: "Arial", size: 8.5 };
          cellAckDateVal.alignment = { vertical: "middle" };

          sheet.mergeCells(`D${ackSignRow}:E${ackSignRow}`);
          const cellAckSignLabel = sheet.getCell(`D${ackSignRow}`);
          cellAckSignLabel.value = "Signature of the Employee";
          cellAckSignLabel.font = { name: "Arial", bold: true, size: 8.5 };
          cellAckSignLabel.alignment = { vertical: "middle" };

          const cellAckSignVal = sheet.getCell(`F${ackSignRow}`);
          cellAckSignVal.font = { name: "Arial", size: 8.5 };
          cellAckSignVal.alignment = { vertical: "middle" };

          sheet.getRow(ackSignRow).height = 24;
          for (let c = 1; c <= 6; c++) {
            sheet.getCell(ackSignRow, c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }
        }
      });

      const excelBuffer = await workbook.xlsx.writeBuffer();

      return new Response(excelBuffer as any, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=statutory_forms.xlsx",
        },
      });
    } catch (excelErr) {
      console.error("Excel generation failed:", excelErr);
      return new Response(
        JSON.stringify({ message: "Failed to generate Excel" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response(JSON.stringify({ message: "Invalid format type" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
};
