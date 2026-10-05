import { useState, useMemo } from "react";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  hasPermission,
  readRole,
  getMonthNameFromNumber,
} from "@canny_ecosystem/utils";
import { attribute, payoutMonths } from "@canny_ecosystem/utils/constant";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import {
  getSitesByCompanyId,
  getProjectsByCompanyId,
  getPrimaryLocationByCompanyId,
  getCompanyNameByCompanyId,
  getLocationsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { safeRedirect } from "@/utils/server/http.server";
import {
  DEFAULT_ROUTE,
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_OWNER,
} from "@/constant";
import { json, type LoaderFunctionArgs } from "@remix-run/node";

import ExcelJS from "exceljs";
import saveAs from "file-saver";
import { addOtRegisterSheet } from "./ot-register";
import { addMusterRollWageRegisterSheet } from "./muster-roll-wage-register";
import { addFormDRegisterSheet } from "./form-d-register";
import { addFormXXRegisterSheet } from "./form-xx-register";
import { addFormXXIRegisterSheet } from "./form-xxi-register";
import { addFormXXIIRegisterSheet } from "./form-xxii-register";
import { addFormXXIIIRegisterSheet } from "./form-xxiii-register";
import {
  addFormBRegisterSheet,
  addFormBSimplianceRegisterSheet,
} from "./form-b-register";
import { addCotecnaSalaryRegisterSheet } from "./cotecna-salary-register";
import { getDailyAttendance } from "./forms-1234-utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (!hasPermission(user?.role!, `${readRole}:${attribute.modules}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "5";
  const year = url.searchParams.get("year") || "2026";
  const site = url.searchParams.get("site") || "all";
  const project = url.searchParams.get("project") || "all";
  const cycle = url.searchParams.get("cycle") || "1-31";

  const monthNum = Number(month);
  const yearNum = Number(year);
  const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
  const prevYearNum = monthNum === 1 ? yearNum - 1 : yearNum;

  const [
    sitesResponse,
    projectsResponse,
    companyNameResponse,
    companyAddressResponse,
  ] = await Promise.all([
    getSitesByCompanyId({ supabase, companyId }),
    getProjectsByCompanyId({ supabase, companyId }),
    getCompanyNameByCompanyId({ supabase, id: companyId }),
    getPrimaryLocationByCompanyId({ supabase, companyId }),
  ]);

  let query = supabase
    .from("monthly_attendance")
    .select(
      `
      id,
      month,
      year,
      present_days,
      overtime_hours,
      working_days,
      absent_days,
      paid_leaves,
      paid_holidays,
      casual_leaves,
      employee_id,
      daily_records:daily_attendance(attendance_id, date, present, holiday, holiday_type, overtime_hours),
      employees!inner (
        id,
        employee_code,
        first_name,
        middle_name,
        last_name,
        date_of_birth,
        gender,
        education,
        primary_mobile_number,
        work_details!work_details_employee_id_fkey!inner (
          employee_id,
          assignment_type,
          skill_level,
          position,
          start_date,
          end_date,
          site_id,
          project_id,
          sites (
            id,
            name
          ),
          projects (
            id,
            name
          )
        ),
        employee_statutory_details!left (
          uan_number,
          pan_number,
          aadhaar_number,
          pf_number,
          esic_number,
          is_esic_applicable
        ),
        employee_bank_details!left (
          account_number,
          bank_name,
          ifsc_code
        ),
        employee_addresses!left (
          address_type,
          address_line_1,
          city,
          state,
          country,
          pincode,
          is_primary
        ),
        employee_exit!left (
          last_working_day,
          exit_reason
        ),
        employee_loan_details!left (
          id,
          loan_name,
          amount,
          monthly_installment,
          loan_date,
          number_of_months,
          is_paid
        ),
        employee_advance_details!left (
          id,
          advance_name,
          amount,
          advance_date,
          is_paid
        )
      ),
      salary_entries!left (
        id,
        monthly_ctc,
        invoice_id,
        payroll!left (
          id,
          month,
          year,
          run_date
        ),
        salary_field_values (
          id,
          amount,
          payroll_fields (
            id,
            name,
            type
          )
        )
      )
    `,
    );

  if (cycle !== "1-31") {
    query = query.or(
      `and(month.eq.${monthNum},year.eq.${yearNum}),and(month.eq.${prevMonthNum},year.eq.${prevYearNum})`,
    );
  } else {
    query = query.eq("month", monthNum).eq("year", yearNum);
  }
  query = query.eq("employees.company_id" as any, companyId);

  if (site !== "all") {
    query = query.eq("employees.work_details.site_id" as any, site);
  }
  if (project !== "all") {
    query = query.eq("employees.work_details.project_id" as any, project);
  }

  const { data: attendanceData, error } = await query;
  if (error) {
    console.error("Error loading register attendance:", error);
  }

  let companyAddress = companyAddressResponse?.data || null;
  if (!companyAddress) {
    const { data: locations } = await getLocationsByCompanyId({
      supabase,
      companyId,
    });
    if (locations && locations.length > 0) {
      companyAddress = locations[0];
    }
  }
  return json({
    sites: sitesResponse.data || [],
    projects: projectsResponse.data || [],
    attendanceData: attendanceData || [],
    companyName: companyNameResponse?.data || null,
    companyAddress,
  });
}

const yearsList = [
  { value: "2024", label: "2024" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
  { value: "2027", label: "2027" },
];

const getAttendanceDays = (
  month: number,
  year: number,
  cycle: string = "1-31",
) => {
  const days: { day: number; isPrevMonth: boolean }[] = [];
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  if (cycle === "21-20") {
    const prevMonthTotalDays = new Date(prevYear, prevMonth, 0).getDate();
    for (let d = 21; d <= prevMonthTotalDays; d++) {
      days.push({ day: d, isPrevMonth: true });
    }
    for (let d = 1; d <= 20; d++) {
      days.push({ day: d, isPrevMonth: false });
    }
  } else if (cycle === "26-25") {
    const prevMonthTotalDays = new Date(prevYear, prevMonth, 0).getDate();
    for (let d = 26; d <= prevMonthTotalDays; d++) {
      days.push({ day: d, isPrevMonth: true });
    }
    for (let d = 1; d <= 25; d++) {
      days.push({ day: d, isPrevMonth: false });
    }
  } else {
    // Default "1-31" (Calendar Month: 1st to end of month)
    const currentMonthTotalDays = new Date(year, month, 0).getDate();
    for (let d = 1; d <= currentMonthTotalDays; d++) {
      days.push({ day: d, isPrevMonth: false });
    }
  }

  return days;
};

const getBase64FromUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  } catch (err) {
    console.error("Failed to fetch image from URL:", url, err);
    return null;
  }
};

export default function RegisterIndexPage() {
  const { sites, projects, attendanceData, companyName, companyAddress } =
    useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProject = searchParams.get("project") || "all";
  const selectedSite = searchParams.get("site") || "all";
  const selectedMonth = searchParams.get("month") || "5";
  const selectedYear = searchParams.get("year") || "2026";
  const selectedCycle = searchParams.get("cycle") || "1-31";

  const selectedSiteObj = useMemo(() => {
    return selectedSite !== "all"
      ? sites.find((s: any) => String(s.id) === selectedSite)
      : null;
  }, [sites, selectedSite]);

  const effectiveCompanyAddress = useMemo(() => {
    if (
      selectedSiteObj &&
      (selectedSiteObj.address_line_1 ||
        selectedSiteObj.address_line_2 ||
        selectedSiteObj.city)
    ) {
      return {
        address_line_1: selectedSiteObj.address_line_1,
        address_line_2: selectedSiteObj.address_line_2,
        city: selectedSiteObj.city,
        state: selectedSiteObj.state,
        pincode: selectedSiteObj.pincode,
      };
    }
    return companyAddress;
  }, [selectedSiteObj, companyAddress]);

  const activeSiteOrProject =
    selectedSite !== "all" ? selectedSite : selectedProject;

  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [registerType, setRegisterType] = useState<
    "abcd" | "1234" | "a1234" | "simpliances" | "cotecna"
  >("abcd");

  const [exportAllCotecna, setExportAllCotecna] = useState(true);
  const [selectedCotecnaForms, setSelectedCotecnaForms] = useState({
    salarySheet: true,
  });

  const toggleCotecnaForm = (formKey: "salarySheet") => {
    setSelectedCotecnaForms((prev) => {
      const next = { ...prev, [formKey]: !prev[formKey] };
      setExportAllCotecna(next.salarySheet);
      return next;
    });
  };

  const handleExportAllCotecnaChange = (checked: boolean) => {
    setExportAllCotecna(checked);
    setSelectedCotecnaForms({
      salarySheet: checked,
    });
  };

  const [exportAll, setExportAll] = useState(true);
  const [selectedForms, setSelectedForms] = useState({
    a: true,
    b: true,
    c: true,
    d: true,
  });

  const toggleForm = (formKey: "a" | "b" | "c" | "d") => {
    setSelectedForms((prev) => {
      const next = { ...prev, [formKey]: !prev[formKey] };
      const allChecked = next.a && next.b && next.c && next.d;
      setExportAll(allChecked);
      return next;
    });
  };

  const handleExportAllChange = (checked: boolean) => {
    setExportAll(checked);
    setSelectedForms({
      a: checked,
      b: checked,
      c: checked,
      d: checked,
    });
  };

  const [exportAllA1234, setExportAllA1234] = useState(true);
  const [selectedA1234Forms, setSelectedA1234Forms] = useState({
    f1: true,
    f2: true,
    f3: true,
    f4: true,
  });

  const toggleA1234Form = (formKey: "f1" | "f2" | "f3" | "f4") => {
    setSelectedA1234Forms((prev) => {
      const next = { ...prev, [formKey]: !prev[formKey] };
      const allChecked = next.f1 && next.f2 && next.f3 && next.f4;
      setExportAllA1234(allChecked);
      return next;
    });
  };

  const handleExportAllA1234Change = (checked: boolean) => {
    setExportAllA1234(checked);
    setSelectedA1234Forms({
      f1: checked,
      f2: checked,
      f3: checked,
      f4: checked,
    });
  };

  const [exportAllSimpliance, setExportAllSimpliance] = useState(true);
  const [selectedSimplianceForms, setSelectedSimplianceForms] = useState({
    b: true,
    ot: true,
    d: true,
    musterRollCumWage: true,
  });
  const [includeSignature, setIncludeSignature] = useState(true);

  const toggleSimplianceForm = (
    formKey: "b" | "ot" | "d" | "musterRollCumWage",
  ) => {
    setSelectedSimplianceForms((prev) => {
      const next = { ...prev, [formKey]: !prev[formKey] };
      const allChecked = next.b && next.ot && next.d && next.musterRollCumWage;
      setExportAllSimpliance(allChecked);
      return next;
    });
  };

  const handleExportAllSimplianceChange = (checked: boolean) => {
    setExportAllSimpliance(checked);
    setSelectedSimplianceForms({
      b: checked,
      ot: checked,
      d: checked,
      musterRollCumWage: checked,
    });
  };

  const previewData = useMemo(() => {
    const employeeMap = new Map<string, any>();
    for (const row of attendanceData || []) {
      const empId = row.employee_id || row.employees?.id;
      if (!empId) continue;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          ...row,
          daily_records: [...(row.daily_records || [])],
        });
      } else {
        const existing = employeeMap.get(empId);
        if (row.daily_records && row.daily_records.length > 0) {
          const existingDates = new Set(
            existing.daily_records.map((r: any) => r.date),
          );
          for (const dr of row.daily_records) {
            if (!existingDates.has(dr.date)) {
              existing.daily_records.push(dr);
            }
          }
        }
        if (
          row.month === Number(selectedMonth) &&
          row.year === Number(selectedYear)
        ) {
          existing.present_days = row.present_days;
          existing.overtime_hours = row.overtime_hours;
          existing.working_days = row.working_days;
          existing.absent_days = row.absent_days;
          existing.paid_leaves = row.paid_leaves;
          existing.paid_holidays = row.paid_holidays;
          existing.casual_leaves = row.casual_leaves;
          existing.salary_entries = row.salary_entries;
        }
      }
    }
    const combinedData = Array.from(employeeMap.values());
    let list = combinedData.map((row: any) => {
      const emp = row.employees;
      const work = Array.isArray(emp?.work_details)
        ? emp.work_details[0]
        : emp?.work_details || {};
      const statutory = emp?.employee_statutory_details || {};
      const bank = emp?.employee_bank_details || {};
      const allSalaryEntries = Array.isArray(row.salary_entries)
        ? row.salary_entries
        : row.salary_entries
          ? [row.salary_entries]
          : [];

      let salaryEntry = allSalaryEntries.find((se: any) => {
        const pMonth = se.payroll?.month;
        const pYear = se.payroll?.year;
        return (
          pMonth === Number(selectedMonth) && pYear === Number(selectedYear)
        );
      });

      if (!salaryEntry && allSalaryEntries.length > 0) {
        salaryEntry = allSalaryEntries[allSalaryEntries.length - 1];
      }

      const formatAddr = (addr: any) => {
        if (!addr) return "";
        const parts = [
          addr.address_line_1,
          addr.city,
          addr.state,
          addr.pincode,
        ].filter((p) => p && String(p).trim() !== "");
        return parts.join(", ").toUpperCase();
      };

      const addresses = emp?.employee_addresses || [];
      const presentAddrObj =
        addresses.find(
          (a: any) =>
            a.address_type?.toLowerCase() === "present" || a.is_primary,
        ) || addresses[0];
      const permAddrObj = addresses.find(
        (a: any) => a.address_type?.toLowerCase() === "permanent",
      );

      const presentAddress = presentAddrObj ? formatAddr(presentAddrObj) : "-";
      let permanentAddress = "-";
      if (permAddrObj) {
        const permStr = formatAddr(permAddrObj);
        if (permStr && permStr !== presentAddress) {
          permanentAddress = permStr;
        } else {
          permanentAddress = "AS ABOVE";
        }
      } else if (presentAddress !== "-") {
        permanentAddress = "AS ABOVE";
      }

      const exitDetails = Array.isArray(emp?.employee_exit)
        ? emp.employee_exit[0]
        : emp?.employee_exit;

      let rateBasic = 462;
      let rateDa = 61;
      let basic = 0;
      let da = 0;
      let specialBasic = 0;
      let leaveEncash = 0;
      let yearlyBonus = 0;
      let hra = 0;
      let allowances = 0;
      let otherAllow = 0;
      let fixedAllowance = 0;
      let gross = 0;
      let pf = 0;
      let esi = 0;
      let pt = 0;
      let net = 0;
      let lwf = 0;
      let loan = 0;
      let advance = 0;

      const daysWorked = row.present_days ?? 0;
      const otHours = row.overtime_hours ?? 0;

      if (salaryEntry && salaryEntry.salary_field_values) {
        const fields = salaryEntry.salary_field_values;
        const getExactField = (matchName: string) => {
          const found = fields.find(
            (f: any) =>
              f.payroll_fields?.name?.toLowerCase().trim() ===
              matchName.toLowerCase().trim(),
          );
          return Number(found?.amount || 0);
        };

        const getField = (matchName: string) => {
          const exact = getExactField(matchName);
          if (exact > 0) return exact;
          const found = fields.find((f: any) => {
            const fname = f.payroll_fields?.name?.toLowerCase().trim() || "";
            const mname = matchName.toLowerCase().trim();
            const regex = new RegExp(`\\b${mname}\\b`, "i");
            return regex.test(fname);
          });
          return Number(found?.amount || 0);
        };

        basic = getExactField("basic") || getField("basic");
        da =
          getExactField("da") ||
          getField("da") ||
          getExactField("dearness allowance") ||
          getField("dearness allowance");
        hra = getExactField("hra") || getField("hra");

        leaveEncash =
          getExactField("leave salary") ||
          getField("leave salary") ||
          getExactField("leave encash") ||
          getField("leave encash");

        const otAmount =
          getExactField("overtime") ||
          getField("overtime") ||
          getExactField("ot amount") ||
          getField("ot amount") ||
          getExactField("ot") ||
          getExactField("o.t.") ||
          getExactField("o.t");

        specialBasic =
          getExactField("special basic") ||
          getField("special basic") ||
          getExactField("special basic / o.t.") ||
          getField("special basic / o.t.") ||
          otAmount;

        yearlyBonus =
          getExactField("bonus") ||
          getField("bonus") ||
          getExactField("st bonus yearly") ||
          getField("st bonus yearly") ||
          getExactField("yearly bonus") ||
          getField("yearly bonus") ||
          getExactField("statutory bonus") ||
          getField("statutory bonus");

        otherAllow = 0;
        fixedAllowance = 0;
        for (const f of fields) {
          if (f.payroll_fields?.type === "earning") {
            const fname = f.payroll_fields?.name?.toLowerCase().trim() || "";
            if (
              fname !== "basic" &&
              fname !== "da" &&
              fname !== "dearness allowance" &&
              fname !== "hra" &&
              fname !== "bonus" &&
              fname !== "st bonus yearly" &&
              fname !== "yearly bonus" &&
              fname !== "statutory bonus" &&
              !fname.includes("overtime") &&
              !fname.includes("leave salary") &&
              !fname.includes("leave encash") &&
              !fname.includes("special basic") &&
              fname !== "ot" &&
              fname !== "o.t"
            ) {
              if (fname.includes("fixed")) {
                fixedAllowance += Number(f.amount || 0);
              } else {
                otherAllow += Number(f.amount || 0);
              }
            }
          }
        }
        allowances = otherAllow + fixedAllowance;

        pf =
          getExactField("pf") ||
          getField("pf") ||
          getField("epf") ||
          getField("provident fund");
        esi =
          getExactField("esi") ||
          getField("esi") ||
          getField("esic");
        pt =
          getExactField("pt") ||
          getField("pt") ||
          getField("professional tax") ||
          getField("p.tax");
        lwf =
          getExactField("lwf") ||
          getField("lwf") ||
          getField("labour welfare fund");
        loan =
          getExactField("loan") ||
          getField("loan") ||
          getField("employee_loan") ||
          getField("loan deduction") ||
          getField("recovery");
        advance =
          getExactField("advance") ||
          getField("advance") ||
          getField("employee_advance") ||
          getField("advance deduction");

        gross =
          basic +
          da +
          (specialBasic > 0 ? specialBasic : 0) +
          leaveEncash +
          yearlyBonus +
          hra +
          allowances;
        net = gross - pf - esi - pt - lwf - loan - advance;

        if (daysWorked > 0) {
          rateBasic = Math.round(basic / daysWorked);
          rateDa = Math.round(da / daysWorked);
        }
      } else {
        const skill = String(work.skill_level || "semi_skilled").toLowerCase();
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

        basic = Math.round(rateBasic * daysWorked);
        da = Math.round(rateDa * daysWorked);
        gross = basic + da;
        pf = Math.round(basic * 0.12);
        esi = Math.round(gross * 0.0075);
        pt = gross > 20000 ? 200 : 150;
        net = gross - pf - esi - pt;
        lwf = 0;
        loan = 0;
        advance = 0;
      }

      const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
      };

      const mapSkillToCategory = (skill: string) => {
        if (!skill) return "SS";
        const s = skill.toLowerCase();
        if (s.includes("high")) return "HS";
        if (s.includes("semi")) return "SS";
        if (s.includes("unskilled")) return "US";
        return "S";
      };

      const paidHolidays = row.paid_holidays ?? 0;

      const empLoans = Array.isArray(emp?.employee_loan_details)
        ? emp.employee_loan_details
        : emp?.employee_loan_details
          ? [emp.employee_loan_details]
          : Array.isArray(emp?.employee_loans)
            ? emp.employee_loans
            : emp?.employee_loans
              ? [emp.employee_loans]
              : [];
      const empAdvances = Array.isArray(emp?.employee_advance_details)
        ? emp.employee_advance_details
        : emp?.employee_advance_details
          ? [emp.employee_advance_details]
          : Array.isArray(emp?.employee_advances)
            ? emp.employee_advances
            : emp?.employee_advances
              ? [emp.employee_advances]
              : [];

      let dbLoanAmount = 0;
      let dbAdvanceAmount = 0;
      let dbRecoveryType = "-";
      let dbParticulars = "-";
      let dbRecoveryDate = "-";
      let dbInstalments = 0;

      if (empLoans.length > 0) {
        const activeLoans = empLoans.filter((l: any) => l.is_paid !== true);
        const lObj = activeLoans[0] || empLoans[0];
        dbLoanAmount = Number(lObj?.amount || lObj?.monthly_installment || 0);
        dbRecoveryType = "Loan";
        dbParticulars = lObj?.loan_name || "Employee Loan";
        dbRecoveryDate = formatDate(lObj?.loan_date);
        dbInstalments = Number(lObj?.number_of_months || 0);
      } else if (empAdvances.length > 0) {
        const activeAdv = empAdvances.filter((a: any) => a.is_paid !== true);
        const aObj = activeAdv[0] || empAdvances[0];
        dbAdvanceAmount = Number(aObj?.amount || 0);
        dbRecoveryType = "Advance";
        dbParticulars = aObj?.advance_name || "Employee Advance";
        dbRecoveryDate = formatDate(aObj?.advance_date);
        dbInstalments = 1;
      }

      if (loan === 0 && dbLoanAmount > 0) {
        loan = dbLoanAmount;
      }
      if (advance === 0 && dbAdvanceAmount > 0) {
        advance = dbAdvanceAmount;
      }

      const totalLoanAdvanceAmount = loan + advance;

      const recoveryType =
        totalLoanAdvanceAmount > 0
          ? dbRecoveryType !== "-"
            ? dbRecoveryType
            : loan > 0 && advance > 0
              ? "Loan & Advance"
              : loan > 0
                ? "Loan"
                : "Advance"
          : "-";

      const recoveryParticulars =
        dbParticulars !== "-"
          ? dbParticulars
          : totalLoanAdvanceAmount > 0
            ? "Loan/Advance"
            : "-";

      const recoveryDate =
        dbRecoveryDate !== "-"
          ? dbRecoveryDate
          : totalLoanAdvanceAmount > 0
            ? totalLoanAdvanceAmount
            : 0;

      const loanAmount = net || 0;

      const defaultCompleteDate = `28.${String(Number(selectedMonth)).padStart(2, "0")}.${selectedYear}`;
      const completeDate =
        dbRecoveryDate !== "-" ? dbRecoveryDate : defaultCompleteDate;

      const instalments =
        totalLoanAdvanceAmount > 0
          ? dbInstalments > 0
            ? dbInstalments
            : 1
          : 0;

      const remarks = totalLoanAdvanceAmount > 0 ? "LOAN" : "SALARY";

      return {
        code: emp?.employee_code || "EMP",
        name: (emp?.first_name || "").toUpperCase(),
        surname: (emp?.last_name || "").toUpperCase(),
        fullName: [emp?.first_name, emp?.middle_name, emp?.last_name]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .toUpperCase(),
        gender:
          (emp?.gender || "Male").toUpperCase() === "MALE" ? "Male" : "Female",
        fatherSpouse: (emp?.middle_name || "-").toUpperCase(),
        dob: formatDate(emp?.date_of_birth),
        nationality: "Indian",
        education: emp?.education ? emp.education.toUpperCase() : "Ssc",
        doj: formatDate(work.start_date),
        designation: work.position
          ? work.position.replace(/_/g, " ").toUpperCase()
          : "SAMPLER",
        category: mapSkillToCategory(work.skill_level),
        employmentType: work.assignment_type
          ? work.assignment_type.replace(/_/g, " ").toUpperCase()
          : "TEMPORARY",
        mobile: emp?.primary_mobile_number || "-",
        uan: statutory.uan_number || "-",
        pan: statutory.pan_number || "-",
        esic: statutory.esic_number || "-",
        lwfApplicable: statutory.is_esic_applicable === false ? "No" : "Yes",
        aadhaar: statutory.aadhaar_number || "-",
        bankAc: bank.account_number || "-",
        bankName: bank.bank_name || "-",
        branchIfsc: bank.ifsc_code || "-",
        presentAddress,
        permanentAddress,
        serviceBookNo: "-",
        dateOfExit: formatDate(exitDetails?.last_working_day),
        reasonForExit: exitDetails?.exit_reason || "-",
        markOfIdentification: "-",
        rateBasic,
        rateDa,
        daysWorked,
        otHours,
        basic,
        da,
        specialBasic,
        leaveEncash,
        yearlyBonus,
        hra,
        allowances,
        pf,
        esi,
        pt,
        lwf,
        loan,
        advance,
        recoveryType,
        recoveryParticulars,
        recoveryDate,
        loanAmount,
        showCause: "No",
        explanation: "No",
        instalments,
        firstMonth: "-",
        lastMonth: "-",
        completeDate,
        remarks,
        siteId: work.site_id || "all",
        projectId: work.project_id || "all",
        siteName: work.sites?.name || "Default Site",
        projectName: work.projects?.name || "Default Project",
        workingDays: row.working_days ?? 30,
        presentDays: row.present_days ?? 0,
        absentDays: row.absent_days ?? 0,
        paidLeaves: row.paid_leaves ?? 0,
        casualLeaves: row.casual_leaves ?? 0,
        paidHolidays: row.paid_holidays ?? 0,
        dailyRecords: row.daily_records || [],
        fixedAllowance,
        otherAllowance: otherAllow,
        gross,
        net,
        monthlyCtc: Number(salaryEntry?.monthly_ctc || 0),
        salaryEntry,
      };
    });

    if (selectedSite !== "all") {
      list = list.filter((item: any) => String(item.siteId) === selectedSite);
    }
    if (selectedProject !== "all") {
      list = list.filter(
        (item: any) => String(item.projectId) === selectedProject,
      );
    }

    return list;
  }, [attendanceData, selectedSite, selectedProject]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const activeMonthName = getMonthNameFromNumber(Number(selectedMonth));

      const dataToExport = previewData;

      const workbook = new ExcelJS.Workbook();

      const signatureUrl =
        "https://oghojvhpbxanipiuxwbu.supabase.co/storage/v1/object/public/canny-ecosystem/letter-components/sukhadevsir's%20signature.png";

      const signatureBase64 = includeSignature
        ? await getBase64FromUrl(signatureUrl)
        : null;

      const selectedProjectObj =
        selectedProject !== "all"
          ? projects.find((p: any) => String(p.id) === selectedProject)
          : null;
      const selectedSiteObj =
        selectedSite !== "all"
          ? sites.find((s: any) => String(s.id) === selectedSite)
          : null;
      const cleanProjectName = selectedProjectObj
        ? selectedProjectObj.name.toUpperCase()
        : "ALL PROJECTS";
      const cleanSiteName = selectedSiteObj
        ? selectedSiteObj.name.toUpperCase()
        : "ALL SITES";

      if (selectedForms.a) {
        const sheetA = workbook.addWorksheet("FORM A");

        sheetA.mergeCells("A1:AE1");
        sheetA.getCell("A1").value = "SCHEDULE";
        sheetA.getCell("A1").font = { bold: true, italic: true, size: 11 };
        sheetA.getCell("A1").alignment = { horizontal: "center" };

        sheetA.mergeCells("A2:AE2");
        sheetA.getCell("A2").value = "[See rule 2(1)]";
        sheetA.getCell("A2").font = { italic: true, size: 10 };
        sheetA.getCell("A2").alignment = { horizontal: "center" };

        sheetA.mergeCells("A3:AE3");
        sheetA.getCell("A3").value = "FORM A";
        sheetA.getCell("A3").font = { bold: true, size: 12 };
        sheetA.getCell("A3").alignment = { horizontal: "center" };

        sheetA.mergeCells("A4:AE4");
        sheetA.getCell("A4").value = "FORMAT OF EMPLOYEE REGISTER";
        sheetA.getCell("A4").font = { bold: true, size: 14 };
        sheetA.getCell("A4").alignment = { horizontal: "center" };

        sheetA.mergeCells("A5:AE5");
        sheetA.getCell("A5").value = "[Part A : For all Establishments]";
        sheetA.getCell("A5").font = { italic: true, size: 10 };
        sheetA.getCell("A5").alignment = { horizontal: "center" };

        sheetA.mergeCells("A6:AE6");
        sheetA.getCell("A6").value =
          `Name of the Establishment: ${CANNY_MANAGEMENT_SERVICES_NAME}   Project: ${cleanProjectName}   Site: ${cleanSiteName}   Name of Owner: ${CANNY_MANAGEMENT_SERVICES_OWNER}`;
        sheetA.getCell("A6").font = { bold: true, size: 10 };

        const headersA = [
          "Sl. No.",
          "Employee Code",
          "Name",
          "Surname",
          "Gender",
          "Father's/Spouse Name",
          "Date of Birth",
          "Nationality",
          "Education Level",
          "Date of Joining",
          "Designation",
          "Category *(HS/S/SS/US)*",
          "Type of Employment",
          "Mobile",
          "UAN",
          "PAN",
          "ESIC IP",
          "LWF",
          "AADHAAR",
          "Bank A/c Number",
          "Bank Name",
          "Bank Branch",
          "Branch (IFSC)",
          "Present Address",
          "Permanent Address",
          "Servie Book No.",
          "Date of Exit",
          "Reason for Exit",
          "Mark of Identification",
          "Photo Specimen Signature/Thumb Impression",
          "Remarks",
        ];
        const headerRowA = sheetA.addRow(headersA);
        headerRowA.height = 30;
        headerRowA.eachCell((cell) => {
          cell.font = { bold: true, size: 10 };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });

        const indexesA = Array.from({ length: 31 }, (_, i) => String(i + 1));
        const indexRowA = sheetA.addRow(indexesA);
        indexRowA.eachCell((cell) => {
          cell.font = { italic: true, size: 9 };
          cell.alignment = { horizontal: "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });

        const groupedA: { [key: string]: any[] } = {};
        for (const emp of dataToExport) {
          const sn = emp.siteName || "DEFAULT SITE";
          if (!groupedA[sn]) groupedA[sn] = [];
          groupedA[sn].push(emp);
        }
        let slNoA = 0;
        for (const siteName of Object.keys(groupedA)) {
          const siteRow = sheetA.addRow([]);
          sheetA.mergeCells(siteRow.number, 1, siteRow.number, 31);
          sheetA.getCell(siteRow.number, 1).value = siteName.toUpperCase();
          sheetA.getCell(siteRow.number, 1).font = {
            bold: true,
            color: { argb: "FFFF0000" },
            size: 10,
          };
          sheetA.getCell(siteRow.number, 1).alignment = {
            horizontal: "left",
            vertical: "middle",
          };

          for (const emp of groupedA[siteName]) {
            slNoA++;
            const rowData = [
              slNoA,
              emp.code,
              emp.name,
              emp.surname,
              emp.gender,
              emp.fatherSpouse,
              emp.dob,
              emp.nationality,
              emp.education,
              emp.doj,
              emp.designation,
              emp.category,
              emp.employmentType,
              emp.mobile,
              emp.uan,
              emp.pan,
              emp.esic,
              emp.lwfApplicable,
              emp.aadhaar,
              emp.bankAc,
              emp.bankName,
              "-",
              emp.branchIfsc,
              emp.presentAddress,
              emp.permanentAddress,
              emp.serviceBookNo,
              emp.dateOfExit,
              emp.reasonForExit,
              emp.markOfIdentification,
              "-",
              emp.remarks,
            ];
            const added = sheetA.addRow(rowData);
            added.eachCell((cell) => {
              cell.border = {
                top: { style: "thin", color: { argb: "FF000000" } },
                left: { style: "thin", color: { argb: "FF000000" } },
                bottom: { style: "thin", color: { argb: "FF000000" } },
                right: { style: "thin", color: { argb: "FF000000" } },
              };
              cell.alignment = { vertical: "middle" };
            });
          }
        }
        sheetA.columns.forEach((col, idx) => {
          if (idx === 2 || idx === 3 || idx === 5 || idx === 10 || idx === 23 || idx === 24) {
            col.width = 35;
          } else if (idx === 20 || idx === 22) {
            col.width = 25;
          } else {
            col.width = 16;
          }
        });
      }

      if (selectedForms.b) {
        await addFormBRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          null,
          signatureBase64,
        );
      }

      if (selectedForms.c) {
        const sheetC = workbook.addWorksheet("FORM C");

        sheetC.mergeCells("A2:O2");
        sheetC.getCell("A2").value = "FORM C";
        sheetC.getCell("A2").font = { bold: true, size: 12 };
        sheetC.getCell("A2").alignment = { horizontal: "center" };

        sheetC.mergeCells("A3:O3");
        sheetC.getCell("A3").value =
          "REGISTER OF LOAN/RECOVERIES AND DAMAGE OR LOSS";
        sheetC.getCell("A3").font = { bold: true, size: 14 };
        sheetC.getCell("A3").alignment = { horizontal: "center" };

        sheetC.mergeCells("A5:O5");
        sheetC.getCell("A5").value =
          `Name of Establishment: Canny Management Services Pvt. Ltd.   Project: ${cleanProjectName}   Site: ${cleanSiteName}`;
        sheetC.getCell("A5").font = { bold: true, size: 10 };

        const headersC = [
          "Sl. No.",
          "Employee Code",
          "Employee Name",
          "Recovery Type *(Damage/Loss/Loan)*",
          "Particulars",
          "Date of Damage/Loss/Loan",
          "Amount",
          "Show Cause *(Yes/No)*",
          "Explanation *(Yes/No)*",
          "Number of Instalments",
          "First Month",
          "Last Month",
          "Date of Complete Recovery",
          "Remarks",
        ];
        const headerRowC = sheetC.addRow(headersC);
        headerRowC.height = 30;
        headerRowC.eachCell((cell) => {
          cell.font = { bold: true, size: 9 };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });

        const indexesC = Array.from({ length: 14 }, (_, i) => String(i + 1));
        const indexRowC = sheetC.addRow(indexesC);
        indexRowC.eachCell((cell) => {
          cell.font = { italic: true, size: 8 };
          cell.alignment = { horizontal: "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });

        const groupedC: { [key: string]: any[] } = {};
        for (const emp of dataToExport) {
          const sn = emp.siteName || "DEFAULT SITE";
          if (!groupedC[sn]) groupedC[sn] = [];
          groupedC[sn].push(emp);
        }
        let slNoC = 0;
        for (const siteName of Object.keys(groupedC)) {
          const siteRow = sheetC.addRow([]);
          sheetC.mergeCells(siteRow.number, 1, siteRow.number, 14);
          sheetC.getCell(siteRow.number, 1).value = siteName.toUpperCase();
          sheetC.getCell(siteRow.number, 1).font = {
            bold: true,
            color: { argb: "FFFF0000" },
            size: 10,
          };
          sheetC.getCell(siteRow.number, 1).alignment = {
            horizontal: "left",
            vertical: "middle",
          };

          for (const emp of groupedC[siteName]) {
            slNoC++;
            const rowData = [
              slNoC,
              emp.code,
              emp.fullName,
              emp.recoveryType,
              emp.recoveryParticulars,
              emp.recoveryDate,
              emp.loanAmount,
              emp.showCause,
              emp.explanation,
              emp.instalments,
              emp.firstMonth,
              emp.lastMonth,
              emp.completeDate,
              emp.remarks,
            ];
            const added = sheetC.addRow(rowData);
            added.eachCell((cell) => {
              cell.border = {
                top: { style: "thin", color: { argb: "FF000000" } },
                left: { style: "thin", color: { argb: "FF000000" } },
                bottom: { style: "thin", color: { argb: "FF000000" } },
                right: { style: "thin", color: { argb: "FF000000" } },
              };
              cell.alignment = { vertical: "middle" };
            });
          }
        }
        sheetC.columns.forEach((col, idx) => {
          if (idx === 2) {
            col.width = 35;
          } else if (idx === 1 || idx === 3 || idx === 5) {
            col.width = 18;
          } else if (idx === 12) {
            col.width = 22;
          } else {
            col.width = 16;
          }
        });
      }

      if (selectedForms.d) {
        const sheetD = workbook.addWorksheet("FORM D");

        sheetD.pageSetup = {
          paperSize: 9, // A4
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitles: "1:7",
          margins: {
            left: 0.2,
            right: 0.2,
            top: 0.3,
            bottom: 0.3,
            header: 0.1,
            footer: 0.1,
          },
        };
        sheetD.views = [{ showGridLines: true }];

        const cycleDays = getAttendanceDays(
          parseInt(selectedMonth),
          parseInt(selectedYear),
          selectedCycle,
        );

        const prevMonthNum =
          parseInt(selectedMonth) === 1 ? 12 : parseInt(selectedMonth) - 1;
        const prevYearNum =
          parseInt(selectedMonth) === 1
            ? parseInt(selectedYear) - 1
            : parseInt(selectedYear);
        const currentMonthTotalDays = new Date(
          parseInt(selectedYear),
          parseInt(selectedMonth),
          0,
        ).getDate();

        let periodStart = "";
        let periodEnd = "";

        if (selectedCycle === "21-20") {
          periodStart = `21.${String(prevMonthNum).padStart(2, "0")}.${prevYearNum}`;
          periodEnd = `20.${String(parseInt(selectedMonth)).padStart(2, "0")}.${selectedYear}`;
        } else if (selectedCycle === "26-25") {
          periodStart = `26.${String(prevMonthNum).padStart(2, "0")}.${prevYearNum}`;
          periodEnd = `25.${String(parseInt(selectedMonth)).padStart(2, "0")}.${selectedYear}`;
        } else {
          periodStart = `01.${String(parseInt(selectedMonth)).padStart(2, "0")}.${selectedYear}`;
          periodEnd = `${String(currentMonthTotalDays).padStart(2, "0")}.${String(parseInt(selectedMonth)).padStart(2, "0")}.${selectedYear}`;
        }

        const totalCols = 12 + cycleDays.length;

        // Pre-populate rows 1 to 8 to avoid row conflicts in ExcelJS
        for (let i = 1; i <= 8; i++) {
          sheetD.addRow([]);
        }

        sheetD.getRow(2).height = 22;
        sheetD.getRow(3).height = 22;
        sheetD.getRow(4).height = 20;
        sheetD.getRow(5).height = 20;

        // Title row 2
        sheetD.mergeCells(2, 1, 2, totalCols);
        sheetD.getCell(2, 1).value = "FORM D";
        sheetD.getCell(2, 1).font = { bold: true, size: 12, name: "Calibri" };
        sheetD.getCell(2, 1).alignment = {
          horizontal: "center",
          vertical: "middle",
        };

        // Title row 3
        sheetD.mergeCells(3, 1, 3, totalCols);
        sheetD.getCell(3, 1).value = "FORMAT OF ATTENDANCE REGISTER";
        sheetD.getCell(3, 1).font = { bold: true, size: 14, name: "Calibri" };
        sheetD.getCell(3, 1).alignment = {
          horizontal: "center",
          vertical: "middle",
        };

        // Header row 4 (Establishment & Owner details) - Merge A4:C4 so yellow background is localized
        sheetD.mergeCells(4, 1, 4, 3);
        const clientCompany =
          companyName?.name || CANNY_MANAGEMENT_SERVICES_NAME;
        const ownerName = CANNY_MANAGEMENT_SERVICES_OWNER;
        sheetD.getCell(4, 1).value =
          `Name of the Establishment: ${clientCompany}   Name of Owner: ${ownerName}`;
        sheetD.getCell(4, 1).font = { bold: true, size: 11, name: "Calibri" };
        sheetD.getCell(4, 1).alignment = {
          horizontal: "left",
          vertical: "middle",
        };

        // Header row 5 (Period) - Merge A5:C5 so yellow background is localized
        sheetD.mergeCells(5, 1, 5, 3);
        sheetD.getCell(5, 1).value =
          `For the Period: ${periodStart} to ${periodEnd}`;
        sheetD.getCell(5, 1).font = { bold: true, size: 11, name: "Calibri" };
        sheetD.getCell(5, 1).alignment = {
          horizontal: "left",
          vertical: "middle",
        };

        // Apply yellow background to merged headers on columns A-C
        for (let c = 1; c <= 3; c++) {
          sheetD.getCell(4, c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF00" },
          };
          sheetD.getCell(5, c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF00" },
          };
        }

        // Column 1 (Sl. No.) - Row 6 & 7 merged
        sheetD.mergeCells(6, 1, 7, 1);
        sheetD.getCell(6, 1).value = "Sl.\nNumber\nin\nEmployee\nregister";

        // Column 2 (Name) - Row 6 & 7 merged
        sheetD.mergeCells(6, 2, 7, 2);
        sheetD.getCell(6, 2).value = "Name";

        // Column 3 (Relay # or set work) - Row 6 & 7 merged
        sheetD.mergeCells(6, 3, 7, 3);
        sheetD.getCell(6, 3).value = "Relay # or\nset work";

        // Column 4 (Days) - Row 6 merged across days
        sheetD.mergeCells(6, 4, 6, 3 + cycleDays.length);
        sheetD.getCell(6, 4).value =
          "Place of work* Date\n1 2 3 4.........31\nIN / OUT";

        cycleDays.forEach((d, i) => {
          const colIndex = 4 + i;
          sheetD.getCell(7, colIndex).value = d.day;
        });

        // Column 5 (Summary No. of Days) - Row 6 merged across 7 columns
        const summaryStartCol = 4 + cycleDays.length;
        const summaryEndCol = summaryStartCol + 6;
        sheetD.mergeCells(6, summaryStartCol, 6, summaryEndCol);
        sheetD.getCell(6, summaryStartCol).value = "Summary No. of Days";

        const subHeaders = [
          "Pres\nent",
          "WOF",
          "A",
          "L",
          "H",
          "M. Days",
          "Paid\ndays",
        ];
        subHeaders.forEach((sh, i) => {
          const colIndex = summaryStartCol + i;
          sheetD.getCell(7, colIndex).value = sh;
        });

        // Column 6 (Remarks No. of hours) - Row 6 & 7 merged
        const remarksCol = summaryEndCol + 1;
        sheetD.mergeCells(6, remarksCol, 7, remarksCol);
        sheetD.getCell(6, remarksCol).value = "Remarks\nNo. of\nhours";

        // Column 7 (**Signature of Register Keeper) - Row 6 & 7 merged
        const sigCol = summaryEndCol + 2;
        sheetD.mergeCells(6, sigCol, 7, sigCol);
        sheetD.getCell(6, sigCol).value = "**Signature\nof\nRegister\nKeeper";

        // Indices Row 8
        sheetD.getCell(8, 1).value = 1;
        sheetD.getCell(8, 2).value = 2;
        sheetD.getCell(8, 3).value = 3;

        sheetD.mergeCells(8, 4, 8, 3 + cycleDays.length);
        sheetD.getCell(8, 4).value = 4;

        sheetD.mergeCells(8, summaryStartCol, 8, summaryEndCol);
        sheetD.getCell(8, summaryStartCol).value = 5;

        sheetD.getCell(8, remarksCol).value = 6;
        sheetD.getCell(8, sigCol).value = 7;

        // Apply Styles to Header rows 6, 7, 8
        const headerRowNumbers = [6, 7, 8];
        const thinBorder = {
          top: { style: "thin" as const, color: { argb: "FF000000" } },
          left: { style: "thin" as const, color: { argb: "FF000000" } },
          bottom: { style: "thin" as const, color: { argb: "FF000000" } },
          right: { style: "thin" as const, color: { argb: "FF000000" } },
        };

        for (const r of headerRowNumbers) {
          sheetD.getRow(r).height = r === 8 ? 22 : r === 6 ? 32 : 28;
          for (let c = 1; c <= totalCols; c++) {
            const cell = sheetD.getCell(r, c);
            cell.font = {
              bold: true,
              size: r === 8 ? 9 : r === 6 && c === 2 ? 11 : 10,
              name: "Calibri",
              italic: r === 8,
            };
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
            cell.border = thinBorder;

            // Apply yellow fill to Summary header and its sub-headers
            if (
              (r === 6 && c >= summaryStartCol && c <= summaryEndCol) ||
              (r === 7 && c >= summaryStartCol && c <= summaryEndCol)
            ) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFFFF00" },
              };
            }
          }
        }

        const groupedD: { [key: string]: any[] } = {};
        for (const emp of dataToExport) {
          const sn = emp.siteName || "DEFAULT SITE";
          if (!groupedD[sn]) groupedD[sn] = [];
          groupedD[sn].push(emp);
        }

        let slNoD = 0;
        for (const siteName of Object.keys(groupedD)) {
          const siteRow = sheetD.addRow([]);
          sheetD.mergeCells(siteRow.number, 1, siteRow.number, totalCols);
          sheetD.getCell(siteRow.number, 1).value = siteName.toUpperCase();
          sheetD.getCell(siteRow.number, 1).font = {
            bold: true,
            color: { argb: "FFFF0000" },
            size: 10,
          };
          sheetD.getCell(siteRow.number, 1).alignment = {
            horizontal: "left",
            vertical: "middle",
          };

          for (const emp of groupedD[siteName]) {
            slNoD++;
            const attendanceRow = getDailyAttendance(
              cycleDays,
              parseInt(selectedYear),
              parseInt(selectedMonth),
              prevYearNum,
              prevMonthNum,
              emp,
              false, // use W instead of W/Off to match reference screenshot
            );

            const presents = attendanceRow.filter((x) => x === "P").length;
            const offs = attendanceRow.filter(
              (x) => x === "W/Off" || x === "W",
            ).length;
            const leaves = attendanceRow.filter(
              (x) => x === "CL" || x === "L",
            ).length;
            const holidays = attendanceRow.filter(
              (x) => x === "PH" || x === "H",
            ).length;
            const absents = attendanceRow.filter((x) => x === "A").length;

            const rowData = [
              slNoD,
              emp.fullName,
              emp.doj,
              ...attendanceRow,
              presents,
              offs,
              absents,
              leaves, // L
              holidays, // H
              0, // M. Days
              cycleDays.length, // Paid days
              "", // Remarks No. of hours
              "", // Signature
            ];
            const added = sheetD.addRow(rowData);
            added.height = 24;
            added.eachCell((cell, colNum) => {
              cell.border = thinBorder;
              cell.font = { name: "Calibri", size: 10 };
              cell.alignment = {
                vertical: "middle",
                horizontal: colNum === 2 ? "left" : "center",
                wrapText: false,
              };
            });
          }
        }

        if (sheetD.columns) {
          let cIndex = 0;
          for (const col of sheetD.columns) {
            const colNum = cIndex + 1;
            if (colNum === 1) {
              col.width = 4.5;
            } else if (colNum === 2) {
              col.width = 26;
            } else if (colNum === 3) {
              col.width = 10;
            } else if (colNum >= 4 && colNum <= 3 + cycleDays.length) {
              col.width = 3.0;
            } else if (colNum === 4 + cycleDays.length) {
              col.width = 6.0;
            } else if (
              colNum >= 5 + cycleDays.length &&
              colNum <= 8 + cycleDays.length
            ) {
              col.width = 4.5;
            } else if (colNum === 9 + cycleDays.length) {
              col.width = 6.0;
            } else if (colNum === 10 + cycleDays.length) {
              col.width = 6.0;
            } else if (colNum === 11 + cycleDays.length) {
              col.width = 8.0;
            } else if (colNum === 12 + cycleDays.length) {
              col.width = 10.0;
            }
            cIndex++;
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const projectPart = selectedProjectObj
        ? selectedProjectObj.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_PROJECTS";
      const sitePart = selectedSiteObj
        ? selectedSiteObj.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_SITES";
      const filenamePrefix = `${projectPart}_${sitePart}`;

      const formsSuffixList: string[] = [];
      if (selectedForms.a) formsSuffixList.push("A");
      if (selectedForms.b) formsSuffixList.push("B");
      if (selectedForms.c) formsSuffixList.push("C");
      if (selectedForms.d) formsSuffixList.push("D");
      const formsStr =
        formsSuffixList.length > 0
          ? `Form_${formsSuffixList.join(",")}`
          : "No_Forms";

      const filename = `${filenamePrefix}_${formsStr}_${activeMonthName.toUpperCase()}_${selectedYear}.xlsx`;

      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
    } catch (err) {
      console.error("Export failure:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportA1234 = async () => {
    setIsExporting(true);
    try {
      const activeMonthName = getMonthNameFromNumber(Number(selectedMonth));
      const dataToExport = previewData;
      const workbook = new ExcelJS.Workbook();

      const signatureUrl =
        "https://oghojvhpbxanipiuxwbu.supabase.co/storage/v1/object/public/canny-ecosystem/letter-components/sukhadevsir's%20signature.png";

      const signatureBase64 = includeSignature
        ? await getBase64FromUrl(signatureUrl)
        : null;

      if (selectedA1234Forms.f1) {
        await addFormXXRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
        );
      }

      if (selectedA1234Forms.f2) {
        await addFormXXIRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
        );
      }

      if (selectedA1234Forms.f3) {
        await addFormXXIIRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
        );
      }

      if (selectedA1234Forms.f4) {
        await addFormXXIIIRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
        );
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const projObjA1234 =
        selectedProject !== "all"
          ? projects.find((p: any) => String(p.id) === selectedProject)
          : null;
      const siteObjA1234 =
        selectedSite !== "all"
          ? sites.find((s: any) => String(s.id) === selectedSite)
          : null;
      const projectPartA1234 = projObjA1234
        ? projObjA1234.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_PROJECTS";
      const sitePartA1234 = siteObjA1234
        ? siteObjA1234.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_SITES";
      const filenamePrefixA1234 = `${projectPartA1234}_${sitePartA1234}`;

      const formsSuffixList: string[] = [];
      if (selectedA1234Forms.f1) formsSuffixList.push("XX");
      if (selectedA1234Forms.f2) formsSuffixList.push("XXI");
      if (selectedA1234Forms.f3) formsSuffixList.push("XXII");
      if (selectedA1234Forms.f4) formsSuffixList.push("XXIII");
      const formsStr =
        formsSuffixList.length > 0
          ? `CLRA_${formsSuffixList.join(",")}`
          : "No_Forms";

      const filename = `${filenamePrefixA1234}_${formsStr}_${activeMonthName.toUpperCase()}_${selectedYear}.xlsx`;

      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
    } catch (err) {
      console.error("Export failure:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSimpliance = async () => {
    setIsExporting(true);
    try {
      const activeMonthName = getMonthNameFromNumber(Number(selectedMonth));
      const dataToExport = previewData;
      const workbook = new ExcelJS.Workbook();

      const signatureUrl =
        "https://oghojvhpbxanipiuxwbu.supabase.co/storage/v1/object/public/canny-ecosystem/letter-components/sukhadevsir's%20signature.png";

      const signatureBase64 = includeSignature
        ? await getBase64FromUrl(signatureUrl)
        : null;

      if (selectedSimplianceForms.b) {
        await addFormBSimplianceRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          null,
          signatureBase64,
        );
      }

      if (selectedSimplianceForms.ot) {
        await addOtRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
        );
      }

      if (selectedSimplianceForms.musterRollCumWage) {
        await addMusterRollWageRegisterSheet(
          workbook,
          dataToExport,
          activeMonthName,
          selectedMonth,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
        );
      }

      if (selectedSimplianceForms.d) {
        await addFormDRegisterSheet(
          workbook,
          dataToExport,
          selectedMonth,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          activeSiteOrProject,
          null,
          signatureBase64,
          selectedCycle,
        );
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const projObjSimp =
        selectedProject !== "all"
          ? projects.find((p: any) => String(p.id) === selectedProject)
          : null;
      const siteObjSimp =
        selectedSite !== "all"
          ? sites.find((s: any) => String(s.id) === selectedSite)
          : null;
      const projectPartSimp = projObjSimp
        ? projObjSimp.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_PROJECTS";
      const sitePartSimp = siteObjSimp
        ? siteObjSimp.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_SITES";
      const filenamePrefixSimp = `${projectPartSimp}_${sitePartSimp}`;

      const formsSuffixList: string[] = [];
      if (selectedSimplianceForms.b) formsSuffixList.push("B");
      if (selectedSimplianceForms.ot) formsSuffixList.push("OT");
      if (selectedSimplianceForms.d) formsSuffixList.push("D");
      if (selectedSimplianceForms.musterRollCumWage) formsSuffixList.push("MR");
      const formsStr =
        formsSuffixList.length > 0
          ? `Simpliance_${formsSuffixList.join(",")}`
          : "No_Forms";

      const filename = `${filenamePrefixSimp}_${formsStr}_${activeMonthName.toUpperCase()}_${selectedYear}.xlsx`;

      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
    } catch (err) {
      console.error("Export failure:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCotecna = async () => {
    setIsExporting(true);
    try {
      const activeMonthName = getMonthNameFromNumber(Number(selectedMonth));
      const shortMonthName = getMonthNameFromNumber(Number(selectedMonth), true);
      const dataToExport = previewData;
      const workbook = new ExcelJS.Workbook();

      if (selectedCotecnaForms.salarySheet) {
        await addCotecnaSalaryRegisterSheet(
          workbook,
          dataToExport,
          shortMonthName,
          selectedMonth,
          selectedYear,
          companyName,
          effectiveCompanyAddress,
          sites,
          projects,
        );
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const projObj =
        selectedProject !== "all"
          ? projects.find((p: any) => String(p.id) === selectedProject)
          : null;
      const siteObj =
        selectedSite !== "all"
          ? sites.find((s: any) => String(s.id) === selectedSite)
          : null;
      const projectPart = projObj
        ? projObj.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_PROJECTS";
      const sitePart = siteObj
        ? siteObj.name.replace(/\s+/g, "_").toUpperCase()
        : "ALL_SITES";
      const companyPart = companyName?.name
        ? companyName.name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()
        : "COMPANY";
      const filenamePrefix = `${companyPart}_${projectPart}_${sitePart}`;

      const filename = `${filenamePrefix}_MONTHLY_SALARY_SHEET_${activeMonthName.toUpperCase()}_${selectedYear}.xlsx`;

      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
    } catch (err) {
      console.error("Export failure:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-140px)] px-4 py-3">
      <div className="w-full max-w-2xl bg-card text-card-foreground border rounded-xl shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl">
        <div className="p-5 space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Statutory Register Exporter
            </h2>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Select parameters and registers to export as a formatted Excel
              workbook.
            </p>
          </div>

          <div className="border-t border-border/40 my-1" />

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Select Register Format
            </label>
            <Select
              value={registerType}
              onValueChange={(
                val: "abcd" | "a1234" | "simpliances" | "cotecna",
              ) => {
                setRegisterType(val);
              }}
            >
              <SelectTrigger className="w-full h-10 bg-background text-sm transition-all border border-input focus:ring-1 focus:ring-primary font-medium">
                <SelectValue placeholder="Select Register Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abcd" className="text-sm">
                  ABCD Forms (Form A, B, C, D)
                </SelectItem>
                <SelectItem value="a1234" className="text-sm">
                  CLRA Forms (Form XX, XXI, XXII, XXIII)
                </SelectItem>
                <SelectItem value="simpliances" className="text-sm">
                  Simpliances
                </SelectItem>
                <SelectItem value="cotecna" className="text-sm">
                  Monthly Salary Register
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border/40 my-1" />

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. Choose Parameters
            </h3>

            <div className="space-y-3">
              {/* Row 1: Project and Site */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Project
                  </label>
                  <Select
                    value={selectedProject}
                    onValueChange={(val) => {
                      setSearchParams((prev) => {
                        prev.set("project", val);
                        prev.set("site", "all");
                        return prev;
                      });
                    }}
                  >
                    <SelectTrigger className="w-full h-10 bg-background text-sm transition-all border border-input focus:ring-1 focus:ring-primary font-medium">
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        All Projects
                      </SelectItem>
                      {projects.map((project: any) => (
                        <SelectItem
                          key={project.id}
                          value={String(project.id)}
                          className="text-sm"
                        >
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Site
                  </label>
                  <Select
                    value={selectedSite}
                    onValueChange={(val) => {
                      setSearchParams((prev) => {
                        prev.set("site", val);
                        return prev;
                      });
                    }}
                  >
                    <SelectTrigger className="w-full h-10 bg-background text-sm transition-all border border-input focus:ring-1 focus:ring-primary font-medium">
                      <SelectValue placeholder="All Sites" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        All Sites
                      </SelectItem>
                      {sites
                        .filter(
                          (site: any) =>
                            selectedProject === "all" ||
                            String(site.project_id) === selectedProject,
                        )
                        .map((site: any) => (
                          <SelectItem
                            key={site.id}
                            value={String(site.id)}
                            className="text-sm"
                          >
                            {site.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Month, Year, and Attendance Cycle */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Month
                  </label>
                  <Select
                    value={selectedMonth}
                    onValueChange={(val) => {
                      setSearchParams((prev) => {
                        prev.set("month", val);
                        return prev;
                      });
                    }}
                  >
                    <SelectTrigger className="w-full h-10 bg-background text-sm transition-all border border-input focus:ring-1 focus:ring-primary font-medium">
                      <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {payoutMonths.map((month) => (
                        <SelectItem
                          key={month.value}
                          value={String(month.value)}
                          className="text-sm"
                        >
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Year
                  </label>
                  <Select
                    value={selectedYear}
                    onValueChange={(val) => {
                      setSearchParams((prev) => {
                        prev.set("year", val);
                        return prev;
                      });
                    }}
                  >
                    <SelectTrigger className="w-full h-10 bg-background text-sm transition-all border border-input focus:ring-1 focus:ring-primary font-medium">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearsList.map((year) => (
                        <SelectItem
                          key={year.value}
                          value={year.value}
                          className="text-sm"
                        >
                          {year.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Attendance Cycle
                  </label>
                  <Select
                    value={selectedCycle}
                    onValueChange={(val) => {
                      setSearchParams((prev) => {
                        prev.set("cycle", val);
                        return prev;
                      });
                    }}
                  >
                    <SelectTrigger className="w-full h-10 bg-background text-sm transition-all border border-input focus:ring-1 focus:ring-primary font-medium">
                      <SelectValue placeholder="Cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-31" className="text-sm">
                        1st to 31st (Calendar Month)
                      </SelectItem>
                      <SelectItem value="21-20" className="text-sm">
                        21st to 20th Cycle
                      </SelectItem>
                      <SelectItem value="26-25" className="text-sm">
                        26th to 25th Cycle
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 my-1" />

          {registerType === "abcd" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  2. Select Form Registers
                </h3>

                <div className="flex items-center space-x-1.5">
                  <Checkbox
                    id="export-all-abcd"
                    checked={exportAll}
                    onCheckedChange={(checked) =>
                      handleExportAllChange(!!checked)
                    }
                  />
                  <label
                    htmlFor="export-all-abcd"
                    className="text-[11px] font-bold text-primary cursor-pointer hover:underline"
                  >
                    Select All
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleForm("a")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleForm("a");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedForms.a
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedForms.a}
                    onCheckedChange={() => toggleForm("a")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM A
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Employee Register
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleForm("b")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleForm("b");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedForms.b
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedForms.b}
                    onCheckedChange={() => toggleForm("b")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM B
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Wages Register
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleForm("c")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleForm("c");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedForms.c
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedForms.c}
                    onCheckedChange={() => toggleForm("c")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM C
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Loan/Recoveries
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleForm("d")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleForm("d");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedForms.d
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedForms.d}
                    onCheckedChange={() => toggleForm("d")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM D
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Attendance Register
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {registerType === "a1234" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  2. Select Form Registers
                </h3>

                <div className="flex items-center space-x-1.5">
                  <Checkbox
                    id="export-all-a1234"
                    checked={exportAllA1234}
                    onCheckedChange={(checked) =>
                      handleExportAllA1234Change(!!checked)
                    }
                  />
                  <label
                    htmlFor="export-all-a1234"
                    className="text-[11px] font-bold text-primary cursor-pointer hover:underline"
                  >
                    Select All
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleA1234Form("f1")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleA1234Form("f1");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedA1234Forms.f1
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedA1234Forms.f1}
                    onCheckedChange={() => toggleA1234Form("f1")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM XX
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Deductions for Damage/Loss
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleA1234Form("f2")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleA1234Form("f2");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedA1234Forms.f2
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedA1234Forms.f2}
                    onCheckedChange={() => toggleA1234Form("f2")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM XXI
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Register of Fines
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleA1234Form("f3")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleA1234Form("f3");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedA1234Forms.f3
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedA1234Forms.f3}
                    onCheckedChange={() => toggleA1234Form("f3")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM XXII
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Register of Advances
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleA1234Form("f4")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleA1234Form("f4");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedA1234Forms.f4
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedA1234Forms.f4}
                    onCheckedChange={() => toggleA1234Form("f4")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM XXIII
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Overtime Register
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {registerType === "simpliances" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  2. Select Form Registers
                </h3>

                <div className="flex items-center space-x-1.5">
                  <Checkbox
                    id="export-all-simpliance"
                    checked={exportAllSimpliance}
                    onCheckedChange={(checked) =>
                      handleExportAllSimplianceChange(!!checked)
                    }
                  />
                  <label
                    htmlFor="export-all-simpliance"
                    className="text-[11px] font-bold text-primary cursor-pointer hover:underline"
                  >
                    Select All
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSimplianceForm("b")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSimplianceForm("b");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedSimplianceForms.b
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedSimplianceForms.b}
                    onCheckedChange={() => toggleSimplianceForm("b")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM B
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Wages Register
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSimplianceForm("ot")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSimplianceForm("ot");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedSimplianceForms.ot
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedSimplianceForms.ot}
                    onCheckedChange={() => toggleSimplianceForm("ot")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      OT REGISTER
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Overtime Register
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSimplianceForm("musterRollCumWage")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSimplianceForm("musterRollCumWage");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedSimplianceForms.musterRollCumWage
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedSimplianceForms.musterRollCumWage}
                    onCheckedChange={() =>
                      toggleSimplianceForm("musterRollCumWage")
                    }
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      MUSTER ROLL CUM WAGE
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Muster Roll-cum-Wage Register
                    </span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSimplianceForm("d")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSimplianceForm("d");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedSimplianceForms.d
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedSimplianceForms.d}
                    onCheckedChange={() => toggleSimplianceForm("d")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      FORM D
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Attendance Register
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {registerType === "cotecna" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  2. Select Form Registers
                </h3>

                <div className="flex items-center space-x-1.5">
                  <Checkbox
                    id="export-all-cotecna"
                    checked={exportAllCotecna}
                    onCheckedChange={(checked) =>
                      handleExportAllCotecnaChange(!!checked)
                    }
                  />
                  <label
                    htmlFor="export-all-cotecna"
                    className="text-[11px] font-bold text-primary cursor-pointer hover:underline"
                  >
                    Select All
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCotecnaForm("salarySheet")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCotecnaForm("salarySheet");
                    }
                  }}
                  className={cn(
                    "flex items-center p-2.5 rounded-lg border cursor-pointer select-none transition-all duration-200 hover:bg-accent/40",
                    selectedCotecnaForms.salarySheet
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                      : "border-border/70",
                  )}
                >
                  <Checkbox
                    checked={selectedCotecnaForms.salarySheet}
                    onCheckedChange={() => toggleCotecnaForm("salarySheet")}
                    className="mr-2 animate-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">
                      MONTHLY SALARY SHEET
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Monthly Wage & Billing Register
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Include Signature Option */}
          <div className="flex items-center space-x-2 py-3 border-t border-border mt-4">
            <Checkbox
              id="include-signature-checkbox"
              checked={includeSignature}
              onCheckedChange={(checked) => setIncludeSignature(!!checked)}
            />
            <label
              htmlFor="include-signature-checkbox"
              className="text-xs font-semibold text-foreground cursor-pointer select-none"
            >
              Include Signature in Export
            </label>
          </div>

          <div className="pt-1.5">
            {registerType === "abcd" && (
              <>
                <Button
                  onClick={() => handleExport()}
                  disabled={
                    isExporting ||
                    (!selectedForms.a &&
                      !selectedForms.b &&
                      !selectedForms.c &&
                      !selectedForms.d)
                  }
                  className="w-full h-11 rounded-lg flex items-center justify-center gap-2 font-bold text-xs tracking-wide transition-all shadow-md active:scale-[0.98]"
                  size="lg"
                >
                  {isExporting ? (
                    <>
                      <Icon name="update" className="h-4 w-4 animate-spin" />
                      <span>Compiling Spreadsheets...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="download" className="h-4 w-4" />
                      <span>Export Selected Registers</span>
                    </>
                  )}
                </Button>

                {!selectedForms.a &&
                  !selectedForms.b &&
                  !selectedForms.c &&
                  !selectedForms.d && (
                    <p className="text-center text-[9px] text-red-500 font-semibold mt-1.5 animate-pulse">
                      * Please select at least one form register above to
                      export.
                    </p>
                  )}
              </>
            )}

            {registerType === "a1234" && (
              <>
                <Button
                  onClick={() => handleExportA1234()}
                  disabled={
                    isExporting ||
                    (!selectedA1234Forms.f1 &&
                      !selectedA1234Forms.f2 &&
                      !selectedA1234Forms.f3 &&
                      !selectedA1234Forms.f4)
                  }
                  className="w-full h-11 rounded-lg flex items-center justify-center gap-2 font-bold text-xs tracking-wide transition-all shadow-md active:scale-[0.98]"
                  size="lg"
                >
                  {isExporting ? (
                    <>
                      <Icon name="update" className="h-4 w-4 animate-spin" />
                      <span>Compiling Spreadsheets...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="download" className="h-4 w-4" />
                      <span>Export Selected Registers</span>
                    </>
                  )}
                </Button>

                {!selectedA1234Forms.f1 &&
                  !selectedA1234Forms.f2 &&
                  !selectedA1234Forms.f3 &&
                  !selectedA1234Forms.f4 && (
                    <p className="text-center text-[9px] text-red-500 font-semibold mt-1.5 animate-pulse">
                      * Please select at least one form register above to
                      export.
                    </p>
                  )}
              </>
            )}

            {registerType === "simpliances" && (
              <>
                <Button
                  onClick={() => handleExportSimpliance()}
                  disabled={
                    isExporting ||
                    (!selectedSimplianceForms.b &&
                      !selectedSimplianceForms.ot &&
                      !selectedSimplianceForms.d &&
                      !selectedSimplianceForms.musterRollCumWage)
                  }
                  className="w-full h-11 rounded-lg flex items-center justify-center gap-2 font-bold text-xs tracking-wide transition-all shadow-md active:scale-[0.98]"
                  size="lg"
                >
                  {isExporting ? (
                    <>
                      <Icon name="update" className="h-4 w-4 animate-spin" />
                      <span>Compiling Spreadsheets...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="download" className="h-4 w-4" />
                      <span>Export Selected Registers</span>
                    </>
                  )}
                </Button>

                {!selectedSimplianceForms.b &&
                  !selectedSimplianceForms.ot &&
                  !selectedSimplianceForms.d &&
                  !selectedSimplianceForms.musterRollCumWage && (
                    <p className="text-center text-[9px] text-red-500 font-semibold mt-1.5 animate-pulse">
                      * Please select at least one form register above to
                      export.
                    </p>
                  )}
              </>
            )}

            {registerType === "cotecna" && (
              <>
                <Button
                  onClick={() => handleExportCotecna()}
                  disabled={
                    isExporting || !selectedCotecnaForms.salarySheet
                  }
                  className="w-full h-11 rounded-lg flex items-center justify-center gap-2 font-bold text-xs tracking-wide transition-all shadow-md active:scale-[0.98]"
                  size="lg"
                >
                  {isExporting ? (
                    <>
                      <Icon name="update" className="h-4 w-4 animate-spin" />
                      <span>Compiling Spreadsheets...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="download" className="h-4 w-4" />
                      <span>Export Selected Registers</span>
                    </>
                  )}
                </Button>

                {!selectedCotecnaForms.salarySheet && (
                  <p className="text-center text-[9px] text-red-500 font-semibold mt-1.5 animate-pulse">
                    * Please select at least one form register above to
                    export.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
