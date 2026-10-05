import { Button } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  formatDateTime,
  getMonthNameFromNumber,
  numberToWords,
  roundToNearest,
} from "@canny_ecosystem/utils";
import {
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER,
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
} from "@/constant";
import * as ExcelJS from "exceljs";
import saveAs from "file-saver";
import { useSearchParams, useSubmit, useLocation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import { Calendar } from "@canny_ecosystem/ui/calendar";
import { formatISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@canny_ecosystem/ui/dialog";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";

function getExcelColumnLetter(colIndex: number): string {
  let letter = "";
  let temp = colIndex;
  while (temp > 0) {
    let modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter;
}

const isPFField = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "pf" ||
    lower === "epf" ||
    lower.includes("provident fund") ||
    lower.includes("provident_fund") ||
    lower.includes("pf contribution")
  );
};

const isESIField = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "esi" ||
    lower === "esic" ||
    lower.includes("esic contribution") ||
    lower.includes("esi contribution") ||
    lower.includes("state insurance")
  );
};

const isEarningColumn = (key: string, col?: ExportColumn) => {
  if (key.startsWith("custom_")) {
    return col?.customType === "earning";
  }
  return [
    "basic",
    "da",
    "vda",
    "other_allow",
    "hra",
    "leave_salary",
    "overtime",
    "bonus",
    "actual_wages",
    "per_day_ctc",
    "ctc_pm",
    "ph_wages",
  ].includes(key);
};

const isScEarningField = (key: string, col?: ExportColumn) => {
  if (["actual_wages", "per_day_ctc", "ctc_pm"].includes(key)) {
    return false;
  }
  if (key.startsWith("custom_")) {
    return col?.customType === "earning";
  }
  return [
    "basic",
    "da",
    "vda",
    "other_allow",
    "hra",
    "leave_salary",
    "overtime",
    "bonus",
    "ph_wages",
  ].includes(key);
};

const getScFieldLabel = (col: ExportColumn) => {
  switch (col.key) {
    case "basic":
      return "Basic";
    case "da":
      return "DA";
    case "vda":
      return "VDA";
    case "other_allow":
      return "Other Allowances";
    case "hra":
      return "HRA";
    case "leave_salary":
      return "Leave Salary";
    case "overtime":
      return "OT Amount";
    case "bonus":
      return "Bonus";
    case "ph_wages":
      return "PH Wages";
    default:
      return col.defaultHeader;
  }
};

const isDeductionColumn = (key: string, col?: ExportColumn) => {
  if (key.startsWith("custom_")) {
    return col?.customType === "deduction";
  }
  return ["pf", "esic", "ptax", "lwf", "loan", "advance", "total_ded"].includes(
    key,
  );
};

export interface ExportColumn {
  key: string;
  defaultHeader: string;
  width: number;
  enabled: boolean;
  customType?: "earning" | "deduction";
}

export const DEFAULT_COLUMNS: ExportColumn[] = [
  { key: "sr_no", defaultHeader: "Sr. No.", width: 8, enabled: true },
  { key: "emp_code", defaultHeader: "EMP.CODE", width: 15, enabled: true },
  { key: "esic_no", defaultHeader: "ESIC NO.", width: 15, enabled: true },
  { key: "uan_no", defaultHeader: "UAN NO.", width: 15, enabled: true },
  {
    key: "emp_name",
    defaultHeader: "Employee's Name",
    width: 35,
    enabled: true,
  },
  { key: "site_name", defaultHeader: "Site Name", width: 18, enabled: false },
  { key: "ot_hours", defaultHeader: "OT Hours", width: 12, enabled: true },
  {
    key: "days_present",
    defaultHeader: "No. Of Days Present",
    width: 18,
    enabled: true,
  },
  {
    key: "ph_days",
    defaultHeader: "PH Days",
    width: 12,
    enabled: true,
  },
  {
    key: "ph_wages",
    defaultHeader: "PH Wages",
    width: 15,
    enabled: true,
  },
  { key: "basic", defaultHeader: "Rate of Basic", width: 15, enabled: true },
  { key: "da", defaultHeader: "DA", width: 12, enabled: true },
  { key: "vda", defaultHeader: "VDA", width: 12, enabled: true },
  {
    key: "other_allow",
    defaultHeader: "Other Allowances",
    width: 18,
    enabled: true,
  },
  { key: "hra", defaultHeader: "HRA", width: 12, enabled: true },
  {
    key: "leave_salary",
    defaultHeader: "Leave Salary",
    width: 15,
    enabled: true,
  },
  { key: "overtime", defaultHeader: "OT Amount", width: 15, enabled: true },
  { key: "bonus", defaultHeader: "Bonus", width: 12, enabled: true },
  {
    key: "actual_wages",
    defaultHeader: "Actual Wages",
    width: 15,
    enabled: true,
  },
  { key: "pf", defaultHeader: "PF", width: 12, enabled: true },
  { key: "esic", defaultHeader: "ESIC", width: 12, enabled: true },
  { key: "ptax", defaultHeader: "P.Tax", width: 10, enabled: true },
  { key: "lwf", defaultHeader: "Add. LWF", width: 10, enabled: true },
  { key: "loan", defaultHeader: "Loan", width: 12, enabled: true },
  { key: "advance", defaultHeader: "Advance", width: 12, enabled: true },
  { key: "total_ded", defaultHeader: "Total Ded.", width: 15, enabled: true },
  { key: "net_pay", defaultHeader: "Net Pay", width: 15, enabled: true },
  {
    key: "per_day_ctc",
    defaultHeader: "Per Day C.T.C",
    width: 15,
    enabled: false,
  },
  { key: "ctc_pm", defaultHeader: "C.T.C. P.M", width: 15, enabled: false },
];

export interface SummaryRowConfig {
  key: string;
  label: string;
  enabled: boolean;
}

export const DEFAULT_SUMMARY_ROWS: SummaryRowConfig[] = [
  { key: "esic_not_app", label: "Esic not applicable", enabled: true },
  { key: "ph_wages", label: "PH Wages", enabled: true },
  { key: "basic", label: "Basic", enabled: true },
  { key: "da", label: "DA", enabled: true },
  { key: "vda", label: "VDA", enabled: true },
  { key: "other_allow", label: "Other Allowances", enabled: true },
  { key: "hra", label: "HRA", enabled: true },
  { key: "leave_salary", label: "Leave Salary", enabled: true },
  { key: "overtime", label: "OT Amount", enabled: true },
  { key: "bonus", label: "Bonus", enabled: true },
  { key: "pf_employer", label: "P.F. Employer", enabled: true },
  { key: "esic_employer", label: "ESIC Employer", enabled: true },
  { key: "service_charge", label: "Service Charge", enabled: true },
  { key: "ctc_total", label: "C.T.C. Total", enabled: true },
  { key: "gst", label: "G.S.T.", enabled: true },
  { key: "total_bill", label: "Total Bill Amount", enabled: true },
];

const isBasic = (name: string) => name.includes("basic");
const isDa = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "da" ||
    lower.includes("dearness") ||
    lower.startsWith("da_") ||
    lower.endsWith("_da") ||
    lower.includes("_da_")
  );
};
const isVda = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "vda" ||
    lower.includes("variable dearness") ||
    lower.startsWith("vda_") ||
    lower.endsWith("_vda") ||
    lower.includes("_vda_")
  );
};
const isOtherAllow = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower.includes("other allow") ||
    lower.includes("other_allow") ||
    lower.includes("other allowance") ||
    lower === "other" ||
    lower === "other allowances" ||
    lower === "other allowance"
  );
};
const isHra = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    lower === "hra" ||
    lower.includes("house rent") ||
    lower.startsWith("hra_") ||
    lower.endsWith("_hra") ||
    lower.includes("_hra_")
  );
};
const isBonus = (name: string) => {
  const lower = name.trim().toLowerCase();
  if (
    lower.includes("efficiency") ||
    lower.includes("performance") ||
    lower.includes("attendance") ||
    lower.includes("incentive") ||
    lower.includes("production")
  ) {
    return false;
  }
  return (
    lower === "bonus" ||
    lower === "statutory bonus" ||
    lower === "statutory_bonus" ||
    lower === "annual bonus" ||
    lower === "annual_bonus" ||
    lower === "statutory / annual bonus" ||
    lower === "statutory/annual bonus" ||
    lower === "bonus amount" ||
    lower === "bonus_amount"
  );
};
const isOvertime = (name: string) =>
  name === "ot" ||
  name.includes("overtime") ||
  name.includes("over time") ||
  name.includes("ot amount") ||
  name.includes("ot_amount");
const isLeaveSalary = (name: string) =>
  name.includes("leave salary") || name.includes("leave_salary");
const isPhWages = (name: string) =>
  name.includes("ph wages") ||
  name.includes("ph_wages") ||
  name.includes("phwages");

const isPf = (name: string) =>
  name.includes("pf") ||
  name.includes("epf") ||
  name.includes("provident fund");
const isEsic = (name: string) =>
  name.includes("esi") || name.includes("esic");
const isPTax = (name: string) =>
  name.includes("pt") ||
  name.includes("professional tax") ||
  name.includes("p.tax");
const isLwf = (name: string) =>
  name.includes("lwf") || name.includes("labour welfare fund");
const isLoan = (name: string) => name.includes("loan");
const isAdvance = (name: string) => name.includes("advance");

const getCustomFields = (data: any[]) => {
  const customEarnings = new Set<string>();
  const customDeductions = new Set<string>();

  for (const empRow of data) {
    const fields = empRow.salary_entries?.salary_field_values || [];
    for (const f of fields) {
      const name = (f.payroll_fields?.name || "").trim();
      const type = (f.payroll_fields?.type || "").trim().toLowerCase();
      if (!name) continue;

      const lowerName = name.toLowerCase();
      if (type === "earning") {
        if (
          !isBasic(lowerName) &&
          !isDa(lowerName) &&
          !isVda(lowerName) &&
          !isOtherAllow(lowerName) &&
          !isHra(lowerName) &&
          !isBonus(lowerName) &&
          !isOvertime(lowerName) &&
          !isLeaveSalary(lowerName) &&
          !isPhWages(lowerName)
        ) {
          customEarnings.add(name);
        }
      } else if (type === "deduction") {
        if (
          !isPf(lowerName) &&
          !isEsic(lowerName) &&
          !isPTax(lowerName) &&
          !isLwf(lowerName) &&
          !isLoan(lowerName) &&
          !isAdvance(lowerName)
        ) {
          customDeductions.add(name);
        }
      }
    }
  }

  return {
    earnings: Array.from(customEarnings),
    deductions: Array.from(customDeductions),
  };
};

const buildSiteColumns = (customFields: {
  earnings: string[];
  deductions: string[];
}) => {
  const cols: ExportColumn[] = [];
  const addedHeaders = new Set<string>();

  for (const col of DEFAULT_COLUMNS) {
    cols.push(col);
    addedHeaders.add(col.defaultHeader.toLowerCase().trim());
    if (col.key === "other_allow") {
      for (const name of customFields.earnings) {
        const norm = name.toLowerCase().trim();
        if (!addedHeaders.has(norm)) {
          addedHeaders.add(norm);
          cols.push({
            key: `custom_${name.toLowerCase().replace(/\s+/g, "_")}`,
            defaultHeader: name,
            width: 15,
            enabled: true,
            customType: "earning",
          });
        }
      }
    }
    if (col.key === "advance") {
      for (const name of customFields.deductions) {
        const norm = name.toLowerCase().trim();
        if (!addedHeaders.has(norm)) {
          addedHeaders.add(norm);
          cols.push({
            key: `custom_${name.toLowerCase().replace(/\s+/g, "_")}`,
            defaultHeader: name,
            width: 15,
            enabled: true,
            customType: "deduction",
          });
        }
      }
    }
  }
  return cols;
};

const buildSiteSummaryRows = (customFields: {
  earnings: string[];
  deductions: string[];
}) => {
  const rows: SummaryRowConfig[] = [];
  const bonusIdx = DEFAULT_SUMMARY_ROWS.findIndex((r) => r.key === "bonus");

  for (let i = 0; i < DEFAULT_SUMMARY_ROWS.length; i++) {
    rows.push(DEFAULT_SUMMARY_ROWS[i]);
    if (i === bonusIdx) {
      for (const name of customFields.earnings) {
        const key = `custom_${name.toLowerCase().replace(/\s+/g, "_")}`;
        rows.push({
          key,
          label: name,
          enabled: true,
        });
      }
    }
  }
  return rows;
};

const generateConvListSheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  titleText: string,
  employeesRows: any[],
  reimbursements: any[],
) => {
  const tableBorder = {
    top: { style: "thin" as const },
    left: { style: "thin" as const },
    bottom: { style: "thin" as const },
    right: { style: "thin" as const },
  };

  const cleanSheetName =
    sheetName.substring(0, 31).replace(/[\][*?:\/\\\\]/g, "") ||
    "EMP. Conv. List";
  let counter = 1;
  let uniqueSheetName = cleanSheetName;
  while (workbook.getWorksheet(uniqueSheetName)) {
    uniqueSheetName = `${cleanSheetName.substring(0, 28)}_${counter}`;
    counter++;
  }

  const reimbRegisterSheet = workbook.addWorksheet(uniqueSheetName);
  reimbRegisterSheet.views = [{ showGridLines: true }];

  reimbRegisterSheet.columns = [
    { key: "A", width: 5 },
    { key: "B", width: 22 },
    { key: "C", width: 18 },
    { key: "D", width: 35 },
    { key: "E", width: 18 },
  ];

  // Title row
  reimbRegisterSheet.mergeCells("B2:E2");
  const titleCell = reimbRegisterSheet.getCell("B2");
  titleCell.value = titleText;
  titleCell.font = { name: "Arial", size: 12, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Headers row
  reimbRegisterSheet.getRow(3).values = [
    "",
    "Location",
    "EMPLOYEE CODE",
    "EMPLOYEE NAME",
    "Allowances",
  ];
  reimbRegisterSheet.getRow(3).height = 25;
  for (const col of ["B", "C", "D", "E"]) {
    const cell = reimbRegisterSheet.getCell(`${col}3`);
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = tableBorder;
    if (col === "E") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFCE4D6" },
      };
    }
  }

  // Data rows
  let startReimbRow = 4;
  let currReimbRow = startReimbRow;
  for (const empRow of employeesRows) {
    const emp = empRow?.employee || empRow || {};
    const empName = [emp.first_name, emp.middle_name, emp.last_name]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    const empSiteName =
      empRow?.employee?.work_details?.site?.name ||
      empRow?.work_details?.site?.name ||
      emp?.work_details?.site?.name ||
      emp?.site_name ||
      titleText.split(" ")[0] ||
      "";

    const empReimbs = reimbursements.filter(
      (r) => r.employee_id === (empRow.employee_id || emp.id),
    );
    const reimbAmount = empReimbs.reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0,
    );

    reimbRegisterSheet.getRow(currReimbRow).values = [
      "",
      empSiteName,
      emp.employee_code || "",
      empName,
      reimbAmount,
    ];
    reimbRegisterSheet.getRow(currReimbRow).height = 20;

    for (const col of ["B", "C", "D", "E"]) {
      const cell = reimbRegisterSheet.getCell(`${col}${currReimbRow}`);
      cell.font = { name: "Arial", size: 10 };
      cell.border = tableBorder;
      if (col === "B" || col === "C") {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (col === "D") {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (col === "E") {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "0.00";
      }
    }
    currReimbRow++;
  }

  // Total row
  reimbRegisterSheet.getRow(currReimbRow).values = [
    "",
    "Total",
    "",
    "",
    {
      formula: `SUM(E${startReimbRow}:E${currReimbRow - 1})`,
      result: reimbursements.reduce(
        (sum, r) => sum + Number(r.amount || 0),
        0,
      ),
    },
  ];
  reimbRegisterSheet.getRow(currReimbRow).height = 20;
  reimbRegisterSheet.mergeCells(`B${currReimbRow}:D${currReimbRow}`);
  for (const col of ["B", "C", "D", "E"]) {
    const cell = reimbRegisterSheet.getCell(`${col}${currReimbRow}`);
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.border = tableBorder;
    if (col === "B") {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    } else if (col === "E") {
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.numFmt = "0.00";
    }
  }
};

const generateConvInvoiceSheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  reimbInvoice: any,
  currentSiteObj: any,
  companyLocation: any,
  companyData: any,
) => {
  const tableBorder = {
    top: { style: "thin" as const },
    left: { style: "thin" as const },
    bottom: { style: "thin" as const },
    right: { style: "thin" as const },
  };

  const cleanSheetName =
    sheetName.substring(0, 31).replace(/[\][*?:\/\\\\]/g, "") || "CONV.";
  let counter = 1;
  let uniqueSheetName = cleanSheetName;
  while (workbook.getWorksheet(uniqueSheetName)) {
    uniqueSheetName = `${cleanSheetName.substring(0, 28)}_${counter}`;
    counter++;
  }

  const reimbBillSheet = workbook.addWorksheet(uniqueSheetName);

  reimbBillSheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };

  reimbBillSheet.columns = [
    { key: "A", width: 8 },
    { key: "B", width: 15 },
    { key: "C", width: 12 },
    { key: "D", width: 12 },
    { key: "E", width: 12 },
    { key: "F", width: 18 },
    { key: "G", width: 18 },
    { key: "H", width: 8 },
  ];

  reimbBillSheet.views = [{ showGridLines: true }];

  // Header - Title Block
  reimbBillSheet.mergeCells("A8:H8");
  const reimbTitle = reimbBillSheet.getCell("A8");
  reimbTitle.value = "TAX - INVOICE";
  reimbTitle.font = {
    name: "Arial",
    size: 14,
    bold: true,
    underline: true,
  };
  reimbTitle.alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getRow(8).height = 30;

  // Invoice metadata
  reimbBillSheet.getRow(9).values = [
    `Invoice No. ${reimbInvoice.invoice_number}`,
    "",
    "",
    "",
    "",
    "",
    `Date :- ${
      reimbInvoice.date
        ? new Date(reimbInvoice.date).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : ""
    }`,
    "",
  ];
  reimbBillSheet.mergeCells("A9:D9");
  reimbBillSheet.mergeCells("G9:H9");
  reimbBillSheet.getCell("A9").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  reimbBillSheet.getCell("G9").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };

  reimbBillSheet.getRow(11).values = [
    "M/S.",
    companyData?.name || "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells("B11:H11");
  reimbBillSheet.getCell("B11").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  reimbBillSheet.getCell("A11").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };

  const invLoc = invoice?.company_locations;
  const currentSiteLoc = currentSiteObj?.company_locations;
  const activeConvLoc = invLoc || companyLocation || currentSiteLoc || currentSiteObj;

  const addressLine1 =
    invLoc?.address_line_1 ||
    companyLocation?.address_line_1 ||
    currentSiteLoc?.address_line_1 ||
    currentSiteObj?.address_line_1 ||
    "";
  const addressLine2 =
    invLoc?.address_line_2 ||
    companyLocation?.address_line_2 ||
    currentSiteLoc?.address_line_2 ||
    currentSiteObj?.address_line_2 ||
    "";
  const cCity = activeConvLoc?.city || "";
  const cState = activeConvLoc?.state || "";
  const cPincode = activeConvLoc?.pincode || "";
  const cityState = [
    [cCity, cPincode].filter(Boolean).join("-"),
    cState ? cState.toUpperCase() : "",
  ]
    .filter(Boolean)
    .join(", ");

  reimbBillSheet.getRow(12).values = [
    "",
    addressLine1,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells("B12:H12");
  reimbBillSheet.getCell("B12").font = { name: "Arial", size: 10 };

  reimbBillSheet.getRow(13).values = [
    "",
    addressLine2,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells("B13:H13");
  reimbBillSheet.getCell("B13").font = { name: "Arial", size: 10 };

  reimbBillSheet.getRow(14).values = [
    "",
    cityState,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells("B14:H14");
  reimbBillSheet.getCell("B14").font = { name: "Arial", size: 10 };

  const convGstinVal =
    invLoc?.gst_number ||
    companyLocation?.gst_number ||
    currentSiteObj?.gst_number ||
    currentSiteLoc?.gst_number ||
    "";
  reimbBillSheet.getRow(15).values = [
    "",
    `GSTIN. :- ${convGstinVal}`,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells("B15:H15");
  reimbBillSheet.getCell("B15").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };

  const contactPerson = companyLocation?.contact_person || "";
  reimbBillSheet.getRow(16).values = [
    "",
    `Contact Person :- ${contactPerson}`,
    "",
    "",
    "",
    "P. O. No. :- -",
    "",
    "",
  ];
  reimbBillSheet.mergeCells("B16:E16");
  reimbBillSheet.mergeCells("F16:H16");
  reimbBillSheet.getCell("B16").font = { name: "Arial", size: 10 };
  reimbBillSheet.getCell("F16").font = { name: "Arial", size: 10 };

  // Invoice table headers
  let currReimbBillRow = 17;
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "Sr. No.",
    "Particulars",
    "",
    "",
    "",
    "",
    "Amount Rs.",
    "Ps.",
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);

  for (const col of ["A", "B", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = tableBorder;
  }
  for (const col of ["C", "D", "E", "F"]) {
    reimbBillSheet.getCell(`${col}${currReimbBillRow}`).border = tableBorder;
  }
  reimbBillSheet.getRow(currReimbBillRow).height = 25;

  // Calculate values first
  const reimbPayrollData = (reimbInvoice.payroll_data || []) as any[];
  const savedChargeRate = Number(reimbInvoice.charge_amount || 0);

  const beforeService = reimbPayrollData.reduce(
    (sum: number, item: any) => sum + Number(item.amount || 0),
    0,
  );

  const serviceCharge =
    savedChargeRate > 0
      ? roundToNearest((beforeService * savedChargeRate) / 100)
      : 0;

  const totalValue =
    roundToNearest(beforeService) + roundToNearest(serviceCharge);

  const cgstValue = reimbInvoice.include_cgst
    ? roundToNearest((totalValue * 9) / 100)
    : 0;
  const sgstValue = reimbInvoice.include_sgst
    ? roundToNearest((totalValue * 9) / 100)
    : 0;
  const igstValue = reimbInvoice.include_igst
    ? roundToNearest((totalValue * 18) / 100)
    : 0;

  const grandTotalValue = totalValue + cgstValue + sgstValue + igstValue;

  const componentsStartRow = 19;

  currReimbBillRow = 19;
  const subjectLines = (reimbInvoice.subject || "").split("\n");
  subjectLines.forEach((line: string, idx: number) => {
    reimbBillSheet.getRow(currReimbBillRow).values = [
      idx === 0 ? 1 : "",
      line.trim(),
      "",
      "",
      "",
      "",
      idx === 0 ? beforeService : "",
      idx === 0 ? 0 : "",
    ];
    reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);
    reimbBillSheet.getCell(`A${currReimbBillRow}`).alignment = {
      horizontal: "center" as const,
      vertical: "top" as const,
    };
    reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
      horizontal: "left" as const,
      vertical: "top" as const,
      wrapText: true,
    };
    reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
      horizontal: "right" as const,
      vertical: "top" as const,
    };
    reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
    reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
      horizontal: "center" as const,
      vertical: "top" as const,
    };
    for (const col of ["A", "B", "G", "H"]) {
      reimbBillSheet.getCell(`${col}${currReimbBillRow}`).font = {
        name: "Arial",
        size: 10,
      };
    }

    reimbBillSheet.getCell(`A${currReimbBillRow}`).border = tableBorder;
    for (const col of ["B", "C", "D", "E", "F"]) {
      reimbBillSheet.getCell(`${col}${currReimbBillRow}`).border = tableBorder;
    }
    reimbBillSheet.getCell(`G${currReimbBillRow}`).border = tableBorder;
    reimbBillSheet.getCell(`H${currReimbBillRow}`).border = tableBorder;
    reimbBillSheet.getRow(currReimbBillRow).height = idx === 0 ? 40 : 20;

    currReimbBillRow++;
  });

  const componentsEndRow = currReimbBillRow - 1;

  // Tall empty space row
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    reimbBillSheet.getCell(`${col}${currReimbBillRow}`).border = tableBorder;
  }
  reimbBillSheet.getRow(currReimbBillRow).height = 150;
  currReimbBillRow++;

  // Total row
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    "Total",
    "",
    "",
    "",
    "",
    {
      formula: `SUM(G${componentsStartRow}:G${componentsEndRow})`,
      result: beforeService,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = { name: "Arial", size: 10, bold: true };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const beforeServiceChargeRow = currReimbBillRow;
  currReimbBillRow++;

  // Empty separator row
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    reimbBillSheet.getCell(`${col}${currReimbBillRow}`).border = tableBorder;
  }
  currReimbBillRow++;

  // Service charge row
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    `Reimbursement Charge @ ${savedChargeRate}%`,
    "",
    "",
    "",
    "",
    {
      formula: `ROUND(G${beforeServiceChargeRow}*${savedChargeRate}/100, 0)`,
      result: serviceCharge,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);
  for (let col = 2; col <= 6; col++) {
    reimbBillSheet.getCell(currReimbBillRow, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
  }
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = { name: "Arial", size: 10, bold: true };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const serviceChargeRow = currReimbBillRow;
  currReimbBillRow++;

  // Total with service charge row
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    "Total",
    "",
    "",
    "",
    "",
    {
      formula: `G${beforeServiceChargeRow}+G${serviceChargeRow}`,
      result: totalValue,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:F${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = { name: "Arial", size: 10, bold: true };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const totalWithChargeRow = reimbBillSheet.lastRow?.number || currReimbBillRow;
  currReimbBillRow++;

  // GST & Grand Total details
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    `HSN CODE NO. ${CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER}`,
    "",
    "",
    "",
    "C.G.S.T @ 9%",
    {
      formula: `ROUND(IF(${
        reimbInvoice.include_cgst ? "TRUE" : "FALSE"
      }, G${totalWithChargeRow}*0.09, 0), 0)`,
      result: cgstValue,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:E${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`F${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const cgstRowIndex = currReimbBillRow;
  currReimbBillRow++;

  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    `PAN NO. ${companyLocation?.pan_number || ""}`,
    "",
    "",
    "",
    "S.G.S.T @ 9%",
    {
      formula: `ROUND(IF(${
        reimbInvoice.include_sgst ? "TRUE" : "FALSE"
      }, G${totalWithChargeRow}*0.09, 0), 0)`,
      result: sgstValue,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:E${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`F${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const sgstRowIndex = currReimbBillRow;
  currReimbBillRow++;

  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    `GSTIN. :- ${companyLocation?.gst_number || ""}`,
    "",
    "",
    "",
    "I.G.S.T @ 18%",
    {
      formula: `ROUND(IF(${
        reimbInvoice.include_igst ? "TRUE" : "FALSE"
      }, G${totalWithChargeRow}*0.18, 0), 0)`,
      result: igstValue,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:E${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`F${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const igstRowIndex = currReimbBillRow;
  currReimbBillRow++;

  // TOTAL GSTIN AMOUNT row
  const totalGstValue = cgstValue + sgstValue + igstValue;
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    `TOTAL GSTIN AMOUNT ${totalGstValue}`,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:E${currReimbBillRow}`);
  for (let col = 1; col <= 5; col++) {
    reimbBillSheet.getCell(currReimbBillRow, col).border = tableBorder;
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };

  for (let col = 6; col <= 8; col++) {
    reimbBillSheet.getCell(currReimbBillRow, col).border = tableBorder;
  }
  currReimbBillRow++;

  // Grand Total row
  reimbBillSheet.getRow(currReimbBillRow).values = [
    "",
    "",
    "",
    "",
    "",
    "Grand Total",
    {
      formula: `G${totalWithChargeRow}+G${cgstRowIndex}+G${sgstRowIndex}+G${igstRowIndex}`,
      result: grandTotalValue,
    },
    0,
  ];
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:E${currReimbBillRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = reimbBillSheet.getCell(`${col}${currReimbBillRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  reimbBillSheet.getCell(`B${currReimbBillRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`F${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  reimbBillSheet.getCell(`G${currReimbBillRow}`).numFmt = "#,##0";
  reimbBillSheet.getCell(`H${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  currReimbBillRow++;

  // Words row
  reimbBillSheet.mergeCells(`A${currReimbBillRow}:H${currReimbBillRow}`);
  const wordsCell = reimbBillSheet.getCell(`A${currReimbBillRow}`);
  const wordsText = numberToWords(grandTotalValue);
  wordsCell.value = `Rupees :- ${
    wordsText.charAt(0).toUpperCase() + wordsText.slice(1)
  } Only`;
  wordsCell.font = {
    name: "Arial",
    size: 10,
    bold: true,
    italic: true,
  };
  wordsCell.alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    reimbBillSheet.getCell(`${col}${currReimbBillRow}`).border = tableBorder;
  }

  currReimbBillRow++;

  // Note Section
  reimbBillSheet.getCell(`A${currReimbBillRow}`).value =
    "Payment made only cross Cheque or DD favour of";
  reimbBillSheet.getCell(`A${currReimbBillRow}`).font = {
    name: "Arial",
    size: 8,
    italic: true,
  };

  currReimbBillRow++;
  const noteTargetCell = reimbBillSheet.getCell(`B${currReimbBillRow}`);
  noteTargetCell.value = {
    richText: [
      {
        text: `${CANNY_MANAGEMENT_SERVICES_NAME} `,
        font: { name: "Arial", size: 10, bold: true },
      },
      {
        text: "payable at Ahmedabad",
        font: { name: "Arial", size: 10 },
      },
    ],
  };
  reimbBillSheet.mergeCells(`B${currReimbBillRow}:H${currReimbBillRow}`);
  noteTargetCell.alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };

  currReimbBillRow += 2;

  // Signature Block
  reimbBillSheet.getCell(`E${currReimbBillRow}`).value =
    `For, ${CANNY_MANAGEMENT_SERVICES_NAME.toUpperCase()}`;
  reimbBillSheet.getCell(`E${currReimbBillRow}`).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  reimbBillSheet.mergeCells(`E${currReimbBillRow}:H${currReimbBillRow}`);
  reimbBillSheet.getCell(`E${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  currReimbBillRow += 4;

  reimbBillSheet.getCell(`E${currReimbBillRow}`).value = "Authorised signatory";
  reimbBillSheet.getCell(`E${currReimbBillRow}`).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  reimbBillSheet.mergeCells(`E${currReimbBillRow}:H${currReimbBillRow}`);
  reimbBillSheet.getCell(`E${currReimbBillRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  reimbBillSheet.getCell(`A${currReimbBillRow}`).value =
    "Receiver's signature with seal";
  reimbBillSheet.getCell(`A${currReimbBillRow}`).font = {
    name: "Arial",
    size: 10,
    italic: true,
  };
  reimbBillSheet.mergeCells(`A${currReimbBillRow}:C${currReimbBillRow}`);
  for (let col = 1; col <= 3; col++) {
    reimbBillSheet.getCell(currReimbBillRow, col).border = {
      top: { style: "thin" },
    };
  }
  reimbBillSheet.getCell(`A${currReimbBillRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
};

const generateSalaryInvoiceSheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  invoice: any,
  currentSiteObj: any,
  companyLocation: any,
  companyData: any,
  leaveSalaryRate?: number,
) => {
  if (!invoice) return;

  const cleanSheetName =
    sheetName.substring(0, 31).replace(/[\][*?:\/\\\\]/g, "") || "BILL";
  let counter = 1;
  let uniqueSheetName = cleanSheetName;
  while (workbook.getWorksheet(uniqueSheetName)) {
    uniqueSheetName = `${cleanSheetName.substring(0, 28)}_${counter}`;
    counter++;
  }

  const billSheet = workbook.addWorksheet(uniqueSheetName);

  billSheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };

  billSheet.columns = [
    { key: "A", width: 8 },
    { key: "B", width: 15 },
    { key: "C", width: 12 },
    { key: "D", width: 12 },
    { key: "E", width: 12 },
    { key: "F", width: 18 },
    { key: "G", width: 18 },
    { key: "H", width: 8 },
  ];

  billSheet.views = [{ showGridLines: true }];

  // Header - Title Block
  billSheet.mergeCells("A8:H8");
  const titleCell = billSheet.getCell("A8");
  titleCell.value = "TAX - INVOICE";
  titleCell.font = {
    name: "Arial",
    size: 14,
    bold: true,
    color: { argb: "FF002060" },
    underline: true,
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const invoiceNo = invoice.invoice_number || "";
  const invoiceDate = invoice.date
    ? new Date(invoice.date).toLocaleDateString("en-GB")
    : "";
  billSheet.getCell("A9").value = `Invoice No. ${invoiceNo}`;
  billSheet.getCell("A9").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.getCell("G9").value = `Date :- ${invoiceDate}`;
  billSheet.getCell("G9").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.getCell("G9").alignment = { horizontal: "right" };

  billSheet.getCell("A11").value = "M/S.";
  billSheet.getCell("A11").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.getCell("B11").value = companyData?.name || "";
  billSheet.getCell("B11").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.mergeCells("B11:H11");

  const invLoc = invoice?.company_locations;
  const currentSiteLoc = currentSiteObj?.company_locations;
  const activeLoc = invLoc || companyLocation || currentSiteLoc || currentSiteObj;

  const locAddress1 =
    invLoc?.address_line_1 ||
    companyLocation?.address_line_1 ||
    currentSiteLoc?.address_line_1 ||
    currentSiteObj?.address_line_1 ||
    "";

  billSheet.getCell("B12").value = locAddress1;
  billSheet.mergeCells("B12:H12");
  for (let col = 2; col <= 8; col++) {
    billSheet.getCell(12, col).border = { bottom: { style: "thin" } };
  }

  const locAddress2 =
    invLoc?.address_line_2 ||
    companyLocation?.address_line_2 ||
    currentSiteLoc?.address_line_2 ||
    currentSiteObj?.address_line_2 ||
    "";

  billSheet.getCell("B13").value = locAddress2;
  billSheet.mergeCells("B13:H13");
  for (let col = 2; col <= 8; col++) {
    billSheet.getCell(13, col).border = { bottom: { style: "thin" } };
  }

  const bCity = activeLoc?.city || "";
  const bState = activeLoc?.state || "";
  const bPincode = activeLoc?.pincode || "";

  const locCityState = [
    [bCity, bPincode].filter(Boolean).join("-"),
    bState ? bState.toUpperCase() : "",
  ]
    .filter(Boolean)
    .join(", ");

  billSheet.getCell("B14").value = locCityState;
  billSheet.mergeCells("B14:H14");
  for (let col = 2; col <= 8; col++) {
    billSheet.getCell(14, col).border = { bottom: { style: "thin" } };
  }

  const gstinVal =
    invLoc?.gst_number ||
    companyLocation?.gst_number ||
    currentSiteObj?.gst_number ||
    currentSiteLoc?.gst_number ||
    "";
  billSheet.getCell("B15").value = `GSTIN. :- ${gstinVal}`;
  billSheet.getCell("B15").font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.mergeCells("B15:H15");
  for (let col = 2; col <= 8; col++) {
    billSheet.getCell(15, col).border = { bottom: { style: "thin" } };
  }

  const contactName = invoice.user_id || "";
  billSheet.getCell("B16").value = `Contact Person :- ${contactName}`;
  billSheet.mergeCells("B16:E16");
  for (let col = 2; col <= 5; col++) {
    billSheet.getCell(16, col).border = { bottom: { style: "thin" } };
  }
  billSheet.getCell("F16").value = `P. O. No. :- -`;
  billSheet.mergeCells("F16:H16");
  for (let col = 6; col <= 8; col++) {
    billSheet.getCell(16, col).border = { bottom: { style: "thin" } };
  }

  const tableBorder = {
    top: { style: "thin" as const },
    left: { style: "thin" as const },
    bottom: { style: "thin" as const },
    right: { style: "thin" as const },
  };

  let currRow = 17;
  billSheet.getRow(currRow).values = [
    "Sr. No.",
    "Particulars",
    "",
    "",
    "",
    "",
    "Amount Rs.",
    "Ps.",
  ];
  billSheet.mergeCells(`B${currRow}:F${currRow}`);

  for (const col of ["A", "B", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = tableBorder;
  }
  for (const col of ["C", "D", "E", "F"]) {
    billSheet.getCell(`${col}${currRow}`).border = tableBorder;
  }
  billSheet.getRow(currRow).height = 25;

  currRow = 19;
  const subjectLines = (invoice.subject || "").split("\n");
  subjectLines.forEach((line: string, idx: number) => {
    billSheet.getRow(currRow).values = [
      idx === 0 ? 1 : "",
      line.trim(),
      "",
      "",
      "",
      "",
      "",
      "",
    ];
    billSheet.mergeCells(`B${currRow}:F${currRow}`);
    billSheet.getCell(`A${currRow}`).alignment = {
      horizontal: "center" as const,
      vertical: "top" as const,
    };
    billSheet.getCell(`B${currRow}`).alignment = {
      horizontal: "left" as const,
      vertical: "top" as const,
      wrapText: true,
    };
    billSheet.getCell(`A${currRow}`).font = { name: "Arial", size: 10 };
    billSheet.getCell(`B${currRow}`).font = { name: "Arial", size: 10 };

    billSheet.getCell(`A${currRow}`).border = tableBorder;
    for (const col of ["B", "C", "D", "E", "F"]) {
      billSheet.getCell(`${col}${currRow}`).border = tableBorder;
    }
    billSheet.getCell(`G${currRow}`).border = tableBorder;
    billSheet.getCell(`H${currRow}`).border = tableBorder;
    billSheet.getRow(currRow).height = idx === 0 ? 40 : 20;

    currRow++;
  });

  const invoicePayrollData = (invoice.payroll_data || []) as any[];
  const filteredPayrollData = invoicePayrollData
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .filter((item) => {
      if (item.type === "earning") return true;
      if (item.type === "deduction") {
        return isPFField(item.field) || isESIField(item.field);
      }
      return true;
    });

  const type = invoice.type || "salary";
  const savedChargeRate = Number(invoice.charge_amount || 0);

  const totalGross = filteredPayrollData
    .filter((item: any) => item.type === "earning")
    .reduce((sum: number, item: any) => sum + Number(item.amount), 0);

  const pfAmount = Number(
    filteredPayrollData.find((item: any) => isPFField(item.field))?.amount ?? 0,
  );
  const esiAmount = Number(
    filteredPayrollData.find((item: any) => isESIField(item.field))?.amount ?? 0,
  );

  const beforeService =
    roundToNearest(totalGross) +
    roundToNearest(pfAmount) +
    roundToNearest(esiAmount);

  const defaultFields = [
    "basic",
    "hra",
    "other allowance",
    "other allowances",
    "vda",
    "da",
  ];

  let serviceChargeBase = filteredPayrollData
    .filter((item: any) => item.in_service_charge === true)
    .reduce((acc: number, curr: any) => acc + Number(curr.amount ?? 0), 0);

  const useFallbackFields =
    serviceChargeBase === 0 && savedChargeRate > 0 && type === "salary";

  if (useFallbackFields) {
    serviceChargeBase = filteredPayrollData
      .filter((item: any) =>
        defaultFields.includes(item.field.trim().toLowerCase()),
      )
      .reduce((acc: number, curr: any) => acc + Number(curr.amount ?? 0), 0);
  }

  const serviceCharge =
    savedChargeRate > 0
      ? type === "salary"
        ? roundToNearest((serviceChargeBase * savedChargeRate) / 100)
        : roundToNearest(
            (filteredPayrollData.reduce(
              (sum: number, item: any) => sum + Number(item.amount),
              0,
            ) *
              savedChargeRate) /
              100,
          )
      : 0;

  const totalValue =
    type === "salary"
      ? roundToNearest(beforeService) + roundToNearest(serviceCharge)
      : roundToNearest(
          Number(filteredPayrollData[0]?.amount || 0) + serviceCharge,
        );

  const cgstValue = invoice.include_cgst
    ? roundToNearest((totalValue * 9) / 100)
    : 0;
  const sgstValue = invoice.include_sgst
    ? roundToNearest((totalValue * 9) / 100)
    : 0;
  const igstValue = invoice.include_igst
    ? roundToNearest((totalValue * 18) / 100)
    : 0;

  const grandTotalValue = totalValue + cgstValue + sgstValue + igstValue;
  const totalGstValue = igstValue === 0 ? cgstValue + sgstValue : igstValue;

  const componentsStartRow = currRow;
  const serviceChargeCellRefs: string[] = [];

  for (const item of filteredPayrollData) {
    const isIncludedInServiceCharge =
      item.in_service_charge === true ||
      (useFallbackFields &&
        defaultFields.includes(item.field.trim().toLowerCase()));

    if (isIncludedInServiceCharge) {
      serviceChargeCellRefs.push(`G${currRow}`);
    }

    let fieldDisplay = item.field;
    const lowerField = item.field.trim().toLowerCase();
    if (lowerField === "basic") {
      fieldDisplay = "Wages ( Basic)";
    } else if (lowerField === "da") {
      fieldDisplay = "D. A.";
    } else if (lowerField === "hra") {
      fieldDisplay = "HRA";
    } else if (
      lowerField === "other allowance" ||
      lowerField === "other allowances"
    ) {
      fieldDisplay = "Fixed Others";
    } else if (
      lowerField === "overtime" ||
      lowerField === "ot" ||
      lowerField === "over time" ||
      lowerField === "ot amount" ||
      lowerField === "ot_amount"
    ) {
      fieldDisplay = "O.T";
    } else if (lowerField === "bonus") {
      fieldDisplay = "Bonus @ 8.33%";
    } else if (
      lowerField === "leave salary" ||
      lowerField.includes("leave salary")
    ) {
      fieldDisplay = `Leave @ ${leaveSalaryRate || 5}%`;
    } else if (isPFField(item.field)) {
      fieldDisplay = "P.F. 13.00%";
    } else if (isESIField(item.field)) {
      fieldDisplay = "ESIC 3.25%";
    }

    billSheet.getRow(currRow).values = [
      "",
      fieldDisplay,
      "",
      "",
      "",
      "",
      Number(item.amount || 0),
      0,
    ];
    billSheet.mergeCells(`B${currRow}:F${currRow}`);

    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      const cell = billSheet.getCell(`${col}${currRow}`);
      cell.border = tableBorder;
      cell.font = { name: "Arial", size: 10 };
    }

    billSheet.getCell(`B${currRow}`).alignment = {
      horizontal: "right" as const,
      vertical: "middle" as const,
    };
    billSheet.getCell(`G${currRow}`).alignment = {
      horizontal: "right" as const,
      vertical: "middle" as const,
    };
    billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
    billSheet.getCell(`H${currRow}`).alignment = {
      horizontal: "center" as const,
      vertical: "middle" as const,
    };

    currRow++;
  }

  const componentsEndRow = currRow - 1;

  // Insert tall empty row
  billSheet.getRow(currRow).values = ["", "", "", "", "", "", "", ""];
  billSheet.mergeCells(`B${currRow}:F${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    billSheet.getCell(`${col}${currRow}`).border = tableBorder;
  }
  billSheet.getRow(currRow).height = 150;
  currRow++;

  // Total row
  billSheet.getRow(currRow).values = [
    "",
    "Total",
    "",
    "",
    "",
    "",
    {
      formula: `SUM(G${componentsStartRow}:G${componentsEndRow})`,
      result: beforeService,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:F${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = { name: "Arial", size: 10, bold: true };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const beforeServiceChargeRow = currRow;
  currRow++;

  // Empty separator row
  billSheet.getRow(currRow).values = ["", "", "", "", "", "", "", ""];
  billSheet.mergeCells(`B${currRow}:F${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    billSheet.getCell(`${col}${currRow}`).border = tableBorder;
  }
  currRow++;

  let serviceChargeFormula: string;
  if (savedChargeRate <= 0) {
    serviceChargeFormula = "0";
  } else if (serviceChargeCellRefs.length === 0) {
    serviceChargeFormula = `ROUND(G${beforeServiceChargeRow}*${savedChargeRate}/100, 0)`;
  } else if (serviceChargeCellRefs.length === filteredPayrollData.length) {
    serviceChargeFormula = `ROUND(G${beforeServiceChargeRow}*${savedChargeRate}/100, 0)`;
  } else {
    serviceChargeFormula = `ROUND((${serviceChargeCellRefs.join("+")})*${savedChargeRate}/100, 0)`;
  }

  // Service charge row
  billSheet.getRow(currRow).values = [
    "",
    `Service Charge @ ${savedChargeRate}%`,
    "",
    "",
    "",
    "",
    {
      formula: serviceChargeFormula,
      result: serviceCharge,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:F${currRow}`);
  for (let col = 2; col <= 6; col++) {
    billSheet.getCell(currRow, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
  }
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = { name: "Arial", size: 10, bold: true };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const serviceChargeRow = currRow;
  currRow++;

  // Total with service charge row
  billSheet.getRow(currRow).values = [
    "",
    "Total",
    "",
    "",
    "",
    "",
    {
      formula: `G${beforeServiceChargeRow}+G${serviceChargeRow}`,
      result: totalValue,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:F${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = { name: "Arial", size: 10, bold: true };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const totalWithChargeRow = billSheet.lastRow?.number || currRow;
  currRow++;

  // GST & Grand Total details
  billSheet.getRow(currRow).values = [
    "",
    `HSN CODE NO. ${CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER}`,
    "",
    "",
    "",
    "C.G.S.T @ 9%",
    {
      formula: `ROUND(IF(${invoice.include_cgst ? "TRUE" : "FALSE"}, G${totalWithChargeRow}*0.09, 0), 0)`,
      result: cgstValue,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:E${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`F${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const cgstRowIndex = currRow;
  currRow++;

  billSheet.getRow(currRow).values = [
    "",
    `PAN NO. ${companyLocation?.pan_number || ""}`,
    "",
    "",
    "",
    "S.G.S.T @ 9%",
    {
      formula: `ROUND(IF(${invoice.include_sgst ? "TRUE" : "FALSE"}, G${totalWithChargeRow}*0.09, 0), 0)`,
      result: sgstValue,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:E${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`F${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const sgstRowIndex = currRow;
  currRow++;

  billSheet.getRow(currRow).values = [
    "",
    `GSTIN. :- ${companyLocation?.gst_number || ""}`,
    "",
    "",
    "",
    "I.G.S.T @ 18%",
    {
      formula: `ROUND(IF(${invoice.include_igst ? "TRUE" : "FALSE"}, G${totalWithChargeRow}*0.18, 0), 0)`,
      result: igstValue,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:E${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`F${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  const igstRowIndex = currRow;
  currRow++;

  // TOTAL GSTIN AMOUNT row
  billSheet.getRow(currRow).values = [
    "",
    `TOTAL GSTIN AMOUNT ${totalGstValue}`,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  billSheet.mergeCells(`B${currRow}:E${currRow}`);
  for (let col = 1; col <= 5; col++) {
    billSheet.getCell(currRow, col).border = tableBorder;
  }
  billSheet.getCell(`B${currRow}`).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };

  for (let col = 6; col <= 8; col++) {
    billSheet.getCell(currRow, col).border = tableBorder;
  }
  currRow++;

  // Grand Total row
  billSheet.getRow(currRow).values = [
    "",
    "",
    "",
    "",
    "",
    "Grand Total",
    {
      formula: `G${totalWithChargeRow}+G${cgstRowIndex}+G${sgstRowIndex}+G${igstRowIndex}`,
      result: grandTotalValue,
    },
    0,
  ];
  billSheet.mergeCells(`B${currRow}:E${currRow}`);
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const cell = billSheet.getCell(`${col}${currRow}`);
    cell.border = tableBorder;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
  }
  billSheet.getCell(`B${currRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`F${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).alignment = {
    horizontal: "right" as const,
    vertical: "middle" as const,
  };
  billSheet.getCell(`G${currRow}`).numFmt = "#,##0";
  billSheet.getCell(`H${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  currRow++;

  // Words row
  billSheet.mergeCells(`A${currRow}:H${currRow}`);
  const wordsCell = billSheet.getCell(`A${currRow}`);
  const wordsText = numberToWords(grandTotalValue);
  wordsCell.value = `Rupees :- ${wordsText.charAt(0).toUpperCase() + wordsText.slice(1)} Only`;
  wordsCell.font = {
    name: "Arial",
    size: 10,
    bold: true,
    italic: true,
  };
  wordsCell.alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    billSheet.getCell(`${col}${currRow}`).border = tableBorder;
  }

  currRow++;

  // Note Section
  billSheet.getCell(`A${currRow}`).value =
    "Payment made only cross Cheque or DD favour of";
  billSheet.getCell(`A${currRow}`).font = {
    name: "Arial",
    size: 8,
    italic: true,
  };

  currRow++;
  const noteTargetCell = billSheet.getCell(`B${currRow}`);
  noteTargetCell.value = {
    richText: [
      {
        text: `${CANNY_MANAGEMENT_SERVICES_NAME} `,
        font: { name: "Arial", size: 10, bold: true },
      },
      {
        text: "payable at Ahmedabad",
        font: { name: "Arial", size: 10 },
      },
    ],
  };
  billSheet.mergeCells(`B${currRow}:H${currRow}`);
  noteTargetCell.alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };

  currRow += 2;

  // Signature Block
  billSheet.getCell(`E${currRow}`).value =
    `For, ${CANNY_MANAGEMENT_SERVICES_NAME.toUpperCase()}`;
  billSheet.getCell(`E${currRow}`).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.mergeCells(`E${currRow}:H${currRow}`);
  billSheet.getCell(`E${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  currRow += 4;

  billSheet.getCell(`E${currRow}`).value = "Authorised signatory";
  billSheet.getCell(`E${currRow}`).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  billSheet.mergeCells(`E${currRow}:H${currRow}`);
  billSheet.getCell(`E${currRow}`).alignment = {
    horizontal: "center" as const,
    vertical: "middle" as const,
  };

  billSheet.getCell(`A${currRow}`).value = "Receiver's signature with seal";
  billSheet.getCell(`A${currRow}`).font = {
    name: "Arial",
    size: 10,
    italic: true,
  };
  billSheet.mergeCells(`A${currRow}:C${currRow}`);
  for (let col = 1; col <= 3; col++) {
    billSheet.getCell(currRow, col).border = { top: { style: "thin" } };
  }
  billSheet.getCell(`A${currRow}`).alignment = {
    horizontal: "left" as const,
    vertical: "middle" as const,
  };
};

export function ExportBar({
  rows,
  data,
  className,
  totalNet,
  onCancel,
  payrollData,
  companyData,
  companyLocation,
  companyRelations,
  env,
  payrollFields,
}: {
  rows: number;
  data: any[];
  className: string;
  totalNet: number;
  onCancel?: () => void;
  payrollData?: any;
  companyData?: any;
  companyLocation?: any;
  companyRelations?: any;
  allSiteOptions?: { label: string; value: string | number }[];
  env?: SupabaseEnv;
  payrollFields?: any[];
}) {
  const { supabase } = useSupabase({ env: env as any });
  const submit = useSubmit();
  const location = useLocation();

  const dbSalaryEntryIds = data
    .filter((row: any) => row.source === "db" && row.salary_entries?.id)
    .map((row: any) => row.salary_entries.id);

  const handleDeleteEntries = () => {
    if (dbSalaryEntryIds.length === 0) return;

    submit(
      {
        intent: "delete-entries",
        entryIds: JSON.stringify(dbSalaryEntryIds),
      },
      {
        method: "POST",
        action: `${location.pathname}${location.search}`,
      },
    );
  };

  const [searchParams] = useSearchParams();
  const [includeCtc, setIncludeCtc] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"site-wise" | "combined">(
    "site-wise",
  );
  const [activeSiteTab, setActiveSiteTab] = useState<string>("");
  const [siteColumns, setSiteColumns] = useState<
    Record<string, ExportColumn[]>
  >({});
  const [siteSummaryRows, setSiteSummaryRows] = useState<
    Record<string, SummaryRowConfig[]>
  >({});
  const [siteIncludeInvoice, setSiteIncludeInvoice] = useState<
    Record<string, boolean>
  >({});
  const [siteIncludeReimbInvoice, setSiteIncludeReimbInvoice] = useState<
    Record<string, boolean>
  >({});
  const [includeConvList, setIncludeConvList] = useState(true);
  const [convExportMode, setConvExportMode] = useState<
    "site-wise" | "combined"
  >("site-wise");
  const [siteServiceChargeOn, setSiteServiceChargeOn] = useState<
    Record<string, string[]>
  >({});
  const [salaryInvoices, setSalaryInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (!supabase || !payrollData?.company_id) return;
    const fetchSalaryInvoices = async () => {
      try {
        const directInvoiceIds = Array.from(
          new Set(
            data
              .map((r) => r.salary_entries?.invoice_id)
              .filter(Boolean) as string[],
          ),
        );

        let invoicesList: any[] = [];
        if (directInvoiceIds.length > 0) {
          const { data: invData } = await supabase
            .from("invoice")
            .select("*")
            .in("id", directInvoiceIds);
          if (invData) {
            invoicesList = [...invData];
          }
        }

        // Also merge any embedded invoice objects from rows if present
        for (const row of data) {
          if (row.salary_entries?.invoice) {
            const embInv = row.salary_entries.invoice;
            if (!invoicesList.some((inv) => inv.id === embInv.id)) {
              invoicesList.push(embInv);
            }
          }
        }

        const addressIds = Array.from(
          new Set(
            invoicesList
              .map((inv) => inv.company_address_id)
              .filter(Boolean) as string[],
          ),
        );

        if (addressIds.length > 0) {
          const { data: locList } = await supabase
            .from("company_locations")
            .select("*")
            .in("id", addressIds);

          if (locList && locList.length > 0) {
            const locMap = new Map<string, any>(locList.map((l: any) => [l.id, l]));
            invoicesList = invoicesList.map((inv) => ({
              ...inv,
              company_locations:
                locMap.get(inv.company_address_id) || inv.company_locations,
            }));
          }
        }

        setSalaryInvoices(invoicesList);
      } catch (err) {
        console.error("Error fetching salary invoices in ExportBar:", err);
      }
    };
    fetchSalaryInvoices();
  }, [supabase, payrollData?.company_id, data]);

  const findSalaryInvoice = (targetSiteData: typeof data, siteKey?: string) => {
    // Check embedded invoice object or matching direct invoice_id from salary entries
    for (const row of targetSiteData) {
      const invId =
        row.salary_entries?.invoice_id || row.salary_entries?.invoice?.id;
      if (invId) {
        const found = salaryInvoices.find((inv) => inv.id === invId);
        if (found) return found;
      }
      if (row.salary_entries?.invoice) {
        const emb = row.salary_entries.invoice;
        const match = salaryInvoices.find(
          (inv) =>
            inv.id === emb.id ||
            (emb.invoice_number && inv.invoice_number === emb.invoice_number),
        );
        if (match) return match;
        return emb;
      }
    }

    return null;
  };

  const getInitialServiceChargeKeys = (
    serviceChargesOnStr: string,
    availableCols: ExportColumn[],
  ): string[] => {
    const norm = (serviceChargesOnStr || "basic,other allowances,hra")
      .toLowerCase()
      .trim();

    if (norm === "ctc" || norm === "gross" || norm === "all") {
      return availableCols
        .filter((col) => isEarningColumn(col.key, col))
        .map((col) => col.key);
    }

    const parts = norm.split(",").map((p) => p.trim());
    const selected: string[] = [];

    const addIf = (key: string, cond: boolean) => {
      if (cond && !selected.includes(key)) {
        selected.push(key);
      }
    };

    addIf(
      "ph_wages",
      parts.includes("ph wages") ||
      parts.includes("ph_wages") ||
      parts.includes("basic"),
    );
    addIf("basic", parts.includes("basic"));
    addIf("da", parts.includes("da") || parts.includes("basic"));
    addIf("vda", parts.includes("vda") || parts.includes("basic"));
    addIf(
      "other_allow",
      parts.includes("other allowances") ||
      parts.includes("other_allowances") ||
      parts.includes("basic"),
    );
    addIf("hra", parts.includes("hra") || parts.includes("basic"));
    addIf(
      "leave_salary",
      parts.includes("leave salary") || parts.includes("leave_salary"),
    );
    addIf("overtime", parts.includes("overtime") || parts.includes("ot"));
    addIf("bonus", parts.includes("bonus"));

    for (const col of availableCols) {
      if (col.key.startsWith("custom_") && col.customType === "earning") {
        const headerNorm = col.defaultHeader.toLowerCase().trim();
        const keyNorm = col.key.substring(7).toLowerCase().trim();
        if (
          parts.includes(headerNorm) ||
          parts.includes(keyNorm) ||
          parts.includes("basic") ||
          parts.includes("gross")
        ) {
          addIf(col.key, true);
        }
      }
    }

    return selected;
  };

  const toggleServiceChargeField = (key: string) => {
    if (!activeSiteTab) return;
    setSiteServiceChargeOn((prev) => {
      const currentCols = siteColumns[activeSiteTab] || DEFAULT_COLUMNS;
      const current =
        prev[activeSiteTab] ||
        getInitialServiceChargeKeys("basic,other allowances,hra", currentCols);
      const exists = current.includes(key);
      const updated = exists
        ? current.filter((k) => k !== key)
        : [...current, key];
      return {
        ...prev,
        [activeSiteTab]: updated,
      };
    });
  };

  const handleSelectAllServiceChargeFields = () => {
    if (!activeSiteTab) return;
    const currentCols = siteColumns[activeSiteTab] || DEFAULT_COLUMNS;
    const earningKeys = currentCols
      .filter((col) => isScEarningField(col.key, col))
      .map((col) => col.key);

    setSiteServiceChargeOn((prev) => ({
      ...prev,
      [activeSiteTab]: earningKeys,
    }));
  };

  const handleClearAllServiceChargeFields = () => {
    if (!activeSiteTab) return;
    setSiteServiceChargeOn((prev) => ({
      ...prev,
      [activeSiteTab]: [],
    }));
  };
  const [reimbursementEntries, setReimbursementEntries] = useState<any[]>([]);
  const [reimbursementInvoices, setReimbursementInvoices] = useState<any[]>([]);
  const [reimbStartDate, setReimbStartDate] = useState<string>("");
  const [reimbEndDate, setReimbEndDate] = useState<string>("");

  useEffect(() => {
    if (payrollData?.month && payrollData?.year) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const getLastDayOfMonth = (y: number, m: number) =>
        new Date(Date.UTC(y, m, 0)).getUTCDate();

      const start = `${payrollData.year}-${pad(payrollData.month)}-01`;
      const end = `${payrollData.year}-${pad(payrollData.month)}-${pad(getLastDayOfMonth(payrollData.year, payrollData.month))}`;

      setReimbStartDate(start);
      setReimbEndDate(end);
    }
  }, [payrollData?.month, payrollData?.year]);

  useEffect(() => {
    if (
      !supabase ||
      !payrollData?.company_id ||
      !reimbStartDate ||
      !reimbEndDate
    )
      return;
    const fetchReimbursementData = async () => {
      try {
        const { data: reimbData, error: reimbError } = await supabase
          .from("reimbursements")
          .select(
            "id, employee_id, amount, note, type, invoice_id, company_id, submitted_date, status, employees!left(id, first_name, middle_name, last_name, employee_code)",
          )
          .eq("company_id", payrollData.company_id)
          .gte("submitted_date", reimbStartDate)
          .lte("submitted_date", `${reimbEndDate}T23:59:59.999Z`);

        if (reimbError) {
          console.error("Error querying reimbursements:", reimbError);
          return;
        }

        if (reimbData) {
          setReimbursementEntries(reimbData);

          const invoiceIds = Array.from(
            new Set(
              reimbData.map((r) => r.invoice_id).filter(Boolean) as string[],
            ),
          );

          if (invoiceIds.length > 0) {
            const { data: invData } = await supabase
              .from("invoice")
              .select("*")
              .in("id", invoiceIds);
            let reimbInvs = invData ? [...invData] : [];
            const reimbAddrIds = Array.from(
              new Set(
                reimbInvs
                  .map((inv) => inv.company_address_id)
                  .filter(Boolean) as string[],
              ),
            );
            if (reimbAddrIds.length > 0) {
              const { data: locList } = await supabase
                .from("company_locations")
                .select("*")
                .in("id", reimbAddrIds);
              if (locList && locList.length > 0) {
                const locMap = new Map<string, any>(locList.map((l: any) => [l.id, l]));
                reimbInvs = reimbInvs.map((inv) => ({
                  ...inv,
                  company_locations:
                    locMap.get(inv.company_address_id) || inv.company_locations,
                }));
              }
            }
            setReimbursementInvoices(reimbInvs);
          } else {
            setReimbursementInvoices([]);
          }
        } else {
          setReimbursementEntries([]);
          setReimbursementInvoices([]);
        }
      } catch (err) {
        console.error("Error fetching reimbursement data in ExportBar:", err);
      }
    };
    fetchReimbursementData();
  }, [supabase, payrollData?.company_id, reimbStartDate, reimbEndDate]);

  const groupedData: Record<string, typeof data> = {};
  for (const empRow of data) {
    const siteName =
      empRow?.employee?.work_details?.site?.name || "Salary Register";
    if (!groupedData[siteName]) {
      groupedData[siteName] = [];
    }
    groupedData[siteName].push(empRow);
  }

  const toggleSummaryRowEnabled = (key: string) => {
    if (!activeSiteTab) return;
    setSiteSummaryRows((prev) => {
      const current = prev[activeSiteTab] || DEFAULT_SUMMARY_ROWS;
      return {
        ...prev,
        [activeSiteTab]: current.map((r) =>
          r.key === key ? { ...r, enabled: !r.enabled } : r,
        ),
      };
    });
  };

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index || !activeSiteTab) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const currentCols = siteColumns[activeSiteTab] || DEFAULT_COLUMNS;
    const updated = [...currentCols];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, moved);

    setSiteColumns((prev) => ({
      ...prev,
      [activeSiteTab]: updated,
    }));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    if (!activeSiteTab) return;
    const currentCols = siteColumns[activeSiteTab] || DEFAULT_COLUMNS;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentCols.length) return;
    const updated = [...currentCols];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    setSiteColumns((prev) => ({
      ...prev,
      [activeSiteTab]: updated,
    }));
  };

  const toggleColumnEnabled = (key: string) => {
    if (!activeSiteTab) return;
    setSiteColumns((prev) => {
      const current = prev[activeSiteTab] || DEFAULT_COLUMNS;
      return {
        ...prev,
        [activeSiteTab]: current.map((c) =>
          c.key === key ? { ...c, enabled: !c.enabled } : c,
        ),
      };
    });
  };

  const handleReset = () => {
    if (!activeSiteTab) return;
    const customFields = getCustomFields(data);
    const siteCols = buildSiteColumns(customFields);
    setSiteColumns((prev) => ({
      ...prev,
      [activeSiteTab]: siteCols.map((col) => {
        if (col.key === "per_day_ctc" || col.key === "ctc_pm") {
          return { ...col, enabled: includeCtc };
        }
        return col;
      }),
    }));
    setSiteSummaryRows((prev) => ({
      ...prev,
      [activeSiteTab]: buildSiteSummaryRows(customFields),
    }));
    setSiteServiceChargeOn((prev) => ({
      ...prev,
      [activeSiteTab]: getInitialServiceChargeKeys(
        "basic,other allowances,hra",
        siteCols,
      ),
    }));
  };

  const handleSelectAll = () => {
    if (!activeSiteTab) return;
    setSiteColumns((prev) => {
      const current = prev[activeSiteTab] || DEFAULT_COLUMNS;
      return {
        ...prev,
        [activeSiteTab]: current.map((col) => ({ ...col, enabled: true })),
      };
    });
    setSiteSummaryRows((prev) => {
      const current = prev[activeSiteTab] || DEFAULT_SUMMARY_ROWS;
      return {
        ...prev,
        [activeSiteTab]: current.map((row) => ({ ...row, enabled: true })),
      };
    });
  };

  const handleClearAll = () => {
    if (!activeSiteTab) return;
    setSiteColumns((prev) => {
      const current = prev[activeSiteTab] || DEFAULT_COLUMNS;
      return {
        ...prev,
        [activeSiteTab]: current.map((col) => ({ ...col, enabled: false })),
      };
    });
    setSiteSummaryRows((prev) => {
      const current = prev[activeSiteTab] || DEFAULT_SUMMARY_ROWS;
      return {
        ...prev,
        [activeSiteTab]: current.map((row) => ({ ...row, enabled: false })),
      };
    });
  };

  const handleOpenExportDialog = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    const sites = Array.from(
      new Set(
        data.map(
          (empRow) =>
            empRow?.employee?.work_details?.site?.name || "Salary Register",
        ),
      ),
    );
    if (sites.length === 0) sites.push("Salary Register");

    const customFields = getCustomFields(data);
    const siteDefaultCols = buildSiteColumns(customFields);

    const newSiteCols = { ...siteColumns };
    const newSiteSums = { ...siteSummaryRows };
    const newSiteIncludeInvoice = { ...siteIncludeInvoice };
    const newSiteIncludeReimbInvoice = { ...siteIncludeReimbInvoice };
    const newSiteServiceChargeOn = { ...siteServiceChargeOn };

    let initialServiceChargesOn = "basic,other allowances,hra";
    if (companyRelations && Array.isArray(companyRelations)) {
      const relations =
        companyRelations.find(
          (r: any) => r.relationship_type?.toLowerCase() === "manpower",
        ) ?? companyRelations[0];

      const manpowerVersions = relations?.relationship_manpower_version ?? [];
      const payrollDate = new Date(
        payrollData?.year || new Date().getFullYear(),
        (payrollData?.month || 1) - 1,
        15,
      );

      const sortedVersions = [...manpowerVersions].sort(
        (a: any, b: any) =>
          new Date(b.start_date || 0).getTime() -
          new Date(a.start_date || 0).getTime(),
      );

      const activeVersion =
        sortedVersions.find((v: any) => {
          const startDate = new Date(v.start_date);
          const endDate = v.end_date ? new Date(v.end_date) : null;
          return (
            payrollDate >= startDate && (!endDate || payrollDate <= endDate)
          );
        }) || sortedVersions[0];

      if (activeVersion?.service_charges_on) {
        initialServiceChargesOn = activeVersion.service_charges_on;
      }
    }

    const sitesToInitialize = [...sites, "All Sites"];

    for (const site of sitesToInitialize) {
      if (!newSiteCols[site]) {
        newSiteCols[site] = siteDefaultCols.map((col) => {
          if (col.key === "per_day_ctc" || col.key === "ctc_pm") {
            return { ...col, enabled: includeCtc };
          }
          if (site === "All Sites" && col.key === "site_name") {
            return { ...col, enabled: true };
          }
          return col;
        });
      } else {
        const existingKeys = new Set(newSiteCols[site].map((c) => c.key));
        const existingHeaders = new Set(
          newSiteCols[site].map((c) => c.defaultHeader.toLowerCase().trim()),
        );
        const mergedCols = [...newSiteCols[site]];
        for (const col of siteDefaultCols) {
          const colHeaderNorm = col.defaultHeader.toLowerCase().trim();
          if (!existingKeys.has(col.key) && !existingHeaders.has(colHeaderNorm)) {
            existingKeys.add(col.key);
            existingHeaders.add(colHeaderNorm);
            if (col.customType === "earning") {
              const otherAllowIdx = mergedCols.findIndex(
                (c) => c.key === "other_allow",
              );
              if (otherAllowIdx !== -1) {
                mergedCols.splice(otherAllowIdx + 1, 0, col);
              } else {
                mergedCols.push(col);
              }
            } else if (col.customType === "deduction") {
              const advanceIdx = mergedCols.findIndex(
                (c) => c.key === "advance",
              );
              if (advanceIdx !== -1) {
                mergedCols.splice(advanceIdx + 1, 0, col);
              } else {
                mergedCols.push(col);
              }
            } else {
              mergedCols.push(col);
            }
          }
        }
        newSiteCols[site] = mergedCols.map((col) => {
          if (col.key === "per_day_ctc" || col.key === "ctc_pm") {
            return { ...col, enabled: includeCtc };
          }
          if (site === "All Sites" && col.key === "site_name") {
            return { ...col, enabled: true };
          }
          return col;
        });
      }
      const siteDefaultSummaryRows = buildSiteSummaryRows(customFields);
      if (!newSiteSums[site]) {
        newSiteSums[site] = siteDefaultSummaryRows;
      } else {
        const existingKeys = new Set(newSiteSums[site].map((r) => r.key));
        const mergedSums = [...newSiteSums[site]];
        for (const row of siteDefaultSummaryRows) {
          if (!existingKeys.has(row.key)) {
            existingKeys.add(row.key);
            const bonusIdx = mergedSums.findIndex((r) => r.key === "bonus");
            if (bonusIdx !== -1) {
              mergedSums.splice(bonusIdx + 1, 0, row);
            } else {
              mergedSums.push(row);
            }
          }
        }
        newSiteSums[site] = mergedSums;
      }

      if (!newSiteServiceChargeOn[site]) {
        newSiteServiceChargeOn[site] = getInitialServiceChargeKeys(
          initialServiceChargesOn,
          newSiteCols[site] || siteDefaultCols,
        );
      }

      if (site === "All Sites") {
        const hasInvoice = !!findSalaryInvoice(data, "All Sites");
        newSiteIncludeInvoice[site] = hasInvoice;
        const hasReimbInvoice =
          reimbursementEntries.length > 0 &&
          reimbursementEntries.some((r) => r.invoice_id);
        newSiteIncludeReimbInvoice[site] = hasReimbInvoice;
      } else {
        if (newSiteIncludeInvoice[site] === undefined) {
          const siteData = groupedData[site] || [];
          const siteInvoice = findSalaryInvoice(siteData, site);
          newSiteIncludeInvoice[site] = !!siteInvoice;
        }
        if (newSiteIncludeReimbInvoice[site] === undefined) {
          const siteData = groupedData[site] || [];
          const siteEmployeeIds = new Set(
            siteData.map((row) => row.employee_id),
          );
          const siteReimbs = reimbursementEntries.filter((r) =>
            siteEmployeeIds.has(r.employee_id),
          );
          const reimbInvoiceId = siteReimbs.find(
            (r) => r.invoice_id,
          )?.invoice_id;
          newSiteIncludeReimbInvoice[site] = !!reimbInvoiceId;
        }
      }
    }

    setSiteColumns(newSiteCols);
    setSiteSummaryRows(newSiteSums);
    setSiteIncludeInvoice(newSiteIncludeInvoice);
    setSiteIncludeReimbInvoice(newSiteIncludeReimbInvoice);
    setSiteServiceChargeOn(newSiteServiceChargeOn);
    setConvExportMode(exportMode === "combined" ? "combined" : "site-wise");
    setIncludeConvList(reimbursementEntries.length > 0);
    if (exportMode === "combined") {
      setActiveSiteTab("All Sites");
    } else {
      setActiveSiteTab((prev) => (sites.includes(prev) ? prev : sites[0]));
    }
    setIsDialogOpen(true);
  };

  const handleExport = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    const workbook = new ExcelJS.Workbook();
    workbook.calcProperties.fullCalcOnLoad = false;

    const groupedData: Record<string, typeof data> = {};
    if (exportMode === "combined") {
      const sortedData = [...data].sort((a, b) => {
        const siteA =
          a?.employee?.work_details?.site?.name || "Salary Register";
        const siteB =
          b?.employee?.work_details?.site?.name || "Salary Register";
        return siteA.localeCompare(siteB);
      });
      groupedData["All Sites"] = sortedData;
      for (const empRow of data) {
        const siteName =
          empRow?.employee?.work_details?.site?.name || "Salary Register";
        if (!groupedData[siteName]) {
          groupedData[siteName] = [];
        }
        groupedData[siteName].push(empRow);
      }
    } else {
      for (const empRow of data) {
        const siteName =
          empRow?.employee?.work_details?.site?.name || "Salary Register";
        if (!groupedData[siteName]) {
          groupedData[siteName] = [];
        }
        groupedData[siteName].push(empRow);
      }
    }

    let serviceChargeRate = 3.5;
    let serviceChargesOn = "basic,other allowances,hra";
    if (companyRelations && Array.isArray(companyRelations)) {
      const relations =
        companyRelations.find(
          (r: any) => r.relationship_type?.toLowerCase() === "manpower",
        ) ?? companyRelations[0];

      const manpowerVersions = relations?.relationship_manpower_version ?? [];
      const payrollDate = new Date(
        payrollData?.year || new Date().getFullYear(),
        (payrollData?.month || 1) - 1,
        15,
      );

      const sortedVersions = [...manpowerVersions].sort(
        (a: any, b: any) =>
          new Date(b.start_date || 0).getTime() -
          new Date(a.start_date || 0).getTime(),
      );

      const activeVersion =
        sortedVersions.find((v: any) => {
          const startDate = new Date(v.start_date);
          const endDate = v.end_date ? new Date(v.end_date) : null;
          return (
            payrollDate >= startDate && (!endDate || payrollDate <= endDate)
          );
        }) || sortedVersions[0];

      if (activeVersion) {
        serviceChargeRate = Number(activeVersion.service_charge) || 3.5;
        serviceChargesOn = (
          activeVersion.service_charges_on || "basic,other allowances,hra"
        ).toLowerCase();
      }
    }

    let targetCompanyId =
      companyData?.id ||
      payrollData?.company_id ||
      payrollData?.companies?.id;

    if (!targetCompanyId && data && data.length > 0) {
      for (const item of data) {
        const candidate =
          item?.company_id ||
          item?.employee?.company_id ||
          item?.employee?.work_details?.company_id ||
          item?.employee?.employee_work_details?.company_id ||
          (Array.isArray(item?.employee?.employee_work_details)
            ? item.employee.employee_work_details[0]?.company_id
            : null);
        if (candidate) {
          targetCompanyId = candidate;
          break;
        }
      }
    }

    const esiMap = new Map<string, any>();
    let fetchedCompanyEsiLimit: number | null = null;
    let fetchedCompanyEsiEmpRate: number | null = null;
    let fetchedCompanyEsiEmprRate: number | null = null;

    if (supabase) {
      try {
        let esiRecords: any[] = [];
        if (targetCompanyId) {
          const { data: list } = await supabase
            .from("employee_state_insurance")
            .select("id, max_limit, employee_contribution, employer_contribution, is_default")
            .eq("company_id", targetCompanyId);
          if (list) esiRecords = list;
        }

        if (esiRecords.length === 0 && data && data.length > 0) {
          const esicIds = new Set<string>();
          for (const item of data) {
            const emp = item?.employee || item;
            const esicId =
              emp?.employee_statutory_details?.esic_id ||
              (Array.isArray(emp?.employee_statutory_details)
                ? emp.employee_statutory_details[0]?.esic_id
                : null);
            if (esicId) esicIds.add(esicId);
          }
          if (esicIds.size > 0) {
            const { data: list } = await supabase
              .from("employee_state_insurance")
              .select("id, max_limit, employee_contribution, employer_contribution, is_default")
              .in("id", Array.from(esicIds));
            if (list) esiRecords = list;
          }
        }

        if (esiRecords.length === 0) {
          const { data: list } = await supabase
            .from("employee_state_insurance")
            .select("id, max_limit, employee_contribution, employer_contribution, is_default");
          if (list) esiRecords = list;
        }

        if (esiRecords.length > 0) {
          for (const rec of esiRecords) {
            if (rec.id) esiMap.set(String(rec.id), rec);
          }

          const activeEsi =
            esiRecords.find((e: any) => e.is_default && e.max_limit !== null && e.max_limit !== undefined) ||
            esiRecords.find((e: any) => e.max_limit !== null && e.max_limit !== undefined) ||
            esiRecords[0];

          if (
            activeEsi?.max_limit !== undefined &&
            activeEsi?.max_limit !== null
          ) {
            fetchedCompanyEsiLimit = Number(activeEsi.max_limit);
          }
          if (
            activeEsi?.employee_contribution !== undefined &&
            activeEsi?.employee_contribution !== null
          ) {
            const rawRate = Number(activeEsi.employee_contribution);
            fetchedCompanyEsiEmpRate = rawRate < 1 ? rawRate * 100 : rawRate;
          }
          if (
            activeEsi?.employer_contribution !== undefined &&
            activeEsi?.employer_contribution !== null
          ) {
            const rawRate = Number(activeEsi.employer_contribution);
            fetchedCompanyEsiEmprRate = rawRate < 1 ? rawRate * 100 : rawRate;
          }
        }
      } catch (err) {
        console.error("Error fetching company ESI limit:", err);
      }
    }

    for (const [siteName, siteData] of Object.entries(groupedData)) {
      if (exportMode === "combined" && siteName !== "All Sites") continue;
      if (exportMode === "site-wise" && siteName === "All Sites") continue;

      const shouldGenerateMainSheet =
        exportMode === "site-wise" || siteName === "All Sites";

      let finalSheetName =
        siteName === "All Sites"
          ? "Salary Register"
          : siteName.substring(0, 31).replace(/[\][*?:\/\\\\]/g, "") ||
          "Salary Register";
      let counter = 1;
      let uniqueSheetName = finalSheetName;
      while (workbook.getWorksheet(uniqueSheetName)) {
        uniqueSheetName = `${finalSheetName.substring(0, 28)}_${counter}`;
        counter++;
      }
      const sheet = shouldGenerateMainSheet
        ? workbook.addWorksheet(uniqueSheetName)
        : null;

      const extractEsiObj = (empRow: any) => {
        if (!empRow) return null;
        const emp = empRow.employee || empRow;
        const assignment = Array.isArray(emp?.employee_salary_assignment)
          ? emp.employee_salary_assignment[0]
          : emp?.employee_salary_assignment;

        let rawStat = assignment?.employee_salary_statutory_components;
        if (assignment?.use_payment_template) {
          const templateObj = Array.isArray(assignment?.payment_templates)
            ? assignment.payment_templates[0]
            : assignment?.payment_templates;
          const versions = Array.isArray(templateObj?.payment_template_versions)
            ? templateObj.payment_template_versions
            : [];
          const activeVer = versions
            .filter(
              (v: any) =>
                !v.effective_date ||
                new Date(v.effective_date) <= payrollDateForStatutory,
            )
            .sort(
              (a: any, b: any) =>
                new Date(b.effective_date).getTime() -
                new Date(a.effective_date).getTime(),
            )[0];
          if (activeVer?.payment_statutory_components) {
            rawStat = activeVer.payment_statutory_components;
          }
        }
        const statutory = Array.isArray(rawStat) ? rawStat[0] : rawStat;

        return (
          (Array.isArray(statutory?.esi) ? statutory.esi[0] : statutory?.esi) ||
          (Array.isArray(statutory?.esic) ? statutory.esic[0] : statutory?.esic) ||
          (Array.isArray(statutory?.employee_state_insurance)
            ? statutory.employee_state_insurance[0]
            : statutory?.employee_state_insurance) ||
          (Array.isArray(emp?.employee_statutory_details?.employee_state_insurance)
            ? emp.employee_statutory_details.employee_state_insurance[0]
            : emp?.employee_statutory_details?.employee_state_insurance) ||
          (Array.isArray(emp?.employee_statutory_details?.company_esic_details)
            ? emp.employee_statutory_details.company_esic_details[0]
            : emp?.employee_statutory_details?.company_esic_details) ||
          null
        );
      };

      let detectedEsiMaxLimit: number | null = null;
      for (const row of data) {
        const esiCandidate = extractEsiObj(row);
        if (
          esiCandidate?.max_limit !== undefined &&
          esiCandidate?.max_limit !== null
        ) {
          detectedEsiMaxLimit = Number(esiCandidate.max_limit);
          if (detectedEsiMaxLimit > 0) break;
        }
      }

      const firstEmp = siteData[0]?.employee;
      const firstAssignment = Array.isArray(firstEmp?.employee_salary_assignment)
        ? firstEmp.employee_salary_assignment[0]
        : firstEmp?.employee_salary_assignment;
      let rawFirstStatutory =
        firstAssignment?.employee_salary_statutory_components;

      if (firstAssignment?.use_payment_template) {
        const firstTemplate = Array.isArray(firstAssignment?.payment_templates)
          ? firstAssignment.payment_templates[0]
          : firstAssignment?.payment_templates;
        const versions =
          firstTemplate?.payment_template_versions || [];
        const activeVersion = versions
          .filter(
            (v: any) =>
              !v.effective_date ||
              new Date(v.effective_date) <= payrollDateForStatutory,
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.effective_date).getTime() -
              new Date(a.effective_date).getTime(),
          )[0];
        if (activeVersion?.payment_statutory_components) {
          rawFirstStatutory = activeVersion.payment_statutory_components;
        }
      }

      const firstStatutory = Array.isArray(rawFirstStatutory)
        ? rawFirstStatutory[0]
        : rawFirstStatutory;

      const firstPf = Array.isArray(firstStatutory?.pf)
        ? firstStatutory.pf[0]
        : firstStatutory?.pf;
      const firstEsi = extractEsiObj(siteData[0]) || (Array.isArray(firstStatutory?.esi)
        ? firstStatutory.esi[0]
        : firstStatutory?.esi);
      const firstBonus = Array.isArray(firstStatutory?.bonus)
        ? firstStatutory.bonus[0]
        : firstStatutory?.bonus;
      const firstLeaveSalary = Array.isArray(firstStatutory?.leave_salary)
        ? firstStatutory.leave_salary[0]
        : firstStatutory?.leave_salary;

      const pfEmployeeRate = firstPf?.employee_contribution
        ? Number(firstPf.employee_contribution)
        : 12;
      const pfEmployerRate = firstPf?.employer_contribution
        ? Number(firstPf.employer_contribution)
        : 13;
      const esiEmployeeRate = firstEsi?.employee_contribution
        ? Number(firstEsi.employee_contribution)
        : 0.75;
      const esiEmployerRate = firstEsi?.employer_contribution
        ? Number(firstEsi.employer_contribution)
        : 3.25;
      const bonusRate = firstBonus?.percentage
        ? Number(firstBonus.percentage)
        : 8.33;
      let siteLeaveSalaryRate = firstLeaveSalary?.percentage
        ? Number(firstLeaveSalary.percentage)
        : 0;

      if (!siteLeaveSalaryRate && siteData.length > 0) {
        for (const empRow of siteData) {
          const fields = empRow.salary_entries?.salary_field_values || [];
          const lsField = fields.find((f: any) => {
            const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
            const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
            return isLeaveSalary(name) || isLeaveSalary(disp);
          });
          if (
            lsField?.payroll_fields &&
            (lsField.payroll_fields.calculation_type === "percentage_of_basic" ||
              lsField.payroll_fields.calculation_type === "percentage_of_basic_da") &&
            Number(lsField.payroll_fields.amount ?? lsField.payroll_fields.value ?? 0) > 0
          ) {
            siteLeaveSalaryRate = Number(
              lsField.payroll_fields.amount ?? lsField.payroll_fields.value,
            );
            break;
          }

          const lSal =
            fields.find(
              (f: any) =>
                f?.payroll_fields?.name &&
                isLeaveSalary(f.payroll_fields.name.trim().toLowerCase()),
            )?.amount || 0;
          const bSal =
            fields.find(
              (f: any) =>
                f?.payroll_fields?.name &&
                isBasic(f.payroll_fields.name.trim().toLowerCase()),
            )?.amount || 0;
          const dSal =
            fields.find(
              (f: any) =>
                f?.payroll_fields?.name &&
                isDa(f.payroll_fields.name.trim().toLowerCase()),
            )?.amount || 0;

          if (Number(lSal) > 0 && Number(bSal) + Number(dSal) > 0) {
            const calcRate =
              (Number(lSal) / (Number(bSal) + Number(dSal))) * 100;
            const roundedRate = Math.round(calcRate * 100) / 100;
            siteLeaveSalaryRate =
              Math.abs(roundedRate - Math.round(roundedRate)) < 0.05
                ? Math.round(roundedRate)
                : roundedRate;
            if (siteLeaveSalaryRate > 0) break;
          }
        }
      }

      if (!siteLeaveSalaryRate) {
        siteLeaveSalaryRate = 5;
      }
      const leaveSalaryRate = siteLeaveSalaryRate;

      const customFields = getCustomFields(data);
      const siteDefaultCols = buildSiteColumns(customFields);
      const currentCols = siteColumns[siteName] || siteDefaultCols;
      const summaryRows = siteSummaryRows[siteName] || DEFAULT_SUMMARY_ROWS;
      const activeColumns = currentCols.filter((col) => col.enabled);

      const actualWagesIdx = activeColumns.findIndex(
        (col) => col.key === "actual_wages",
      );

      const isBonusBeforeActualWages = (() => {
        const bonusIdx = activeColumns.findIndex((col) => col.key === "bonus");
        return bonusIdx !== -1 && actualWagesIdx !== -1 && bonusIdx < actualWagesIdx;
      })();


      if (shouldGenerateMainSheet && sheet) {
        sheet.columns = activeColumns.map((col) => {
          let header = col.defaultHeader;
          if (col.key === "bonus") header = `Bonus ${bonusRate}%`;
          if (col.key === "pf") header = `PF ${pfEmployeeRate}%`;
          if (col.key === "esic") header = `ESIC ${esiEmployeeRate}%`;
          if (col.key === "leave_salary") {
            header = `Leave Salary @ ${leaveSalaryRate}% Basic + DA`;
          }
          return {
            header,
            key: col.key,
            width: col.width,
          };
        });

        sheet.spliceRows(1, 0, [], [], [], []);

        const companyName = companyData?.name || "";
        const currentSiteObj = siteData[0]?.employee?.work_details?.site;
        const currentSiteLoc = currentSiteObj?.company_locations;

        const siteAddrLine1 = [
          currentSiteObj?.address_line_1,
          currentSiteObj?.address_line_2,
        ]
          .filter(Boolean)
          .join(", ");

        const siteAddrLine2 = [
          currentSiteObj?.city,
          currentSiteObj?.state,
          currentSiteObj?.pincode,
        ]
          .filter(Boolean)
          .join(", ");

        const siteLocAddrLine1 = [
          currentSiteLoc?.address_line_1,
          currentSiteLoc?.address_line_2,
        ]
          .filter(Boolean)
          .join(", ");

        const siteLocAddrLine2 = [
          currentSiteLoc?.city,
          currentSiteLoc?.state,
          currentSiteLoc?.pincode,
        ]
          .filter(Boolean)
          .join(", ");

        const compLocAddrLine1 = [
          companyLocation?.address_line_1,
          companyLocation?.address_line_2,
        ]
          .filter(Boolean)
          .join(", ");

        const compLocAddrLine2 = [
          companyLocation?.city,
          companyLocation?.state,
          companyLocation?.pincode,
        ]
          .filter(Boolean)
          .join(", ");

        const addressLine1 =
          siteAddrLine1 || siteLocAddrLine1 || compLocAddrLine1;
        const addressLine2 =
          siteAddrLine2 || siteLocAddrLine2 || compLocAddrLine2;

        const monthName = payrollData?.month
          ? getMonthNameFromNumber(payrollData.month)
          : "Month";
        const year = payrollData?.year || "Year";

        const colMap: Record<string, string> = {};
        for (let idx = 0; idx < activeColumns.length; idx++) {
          const col = activeColumns[idx];
          if (col) {
            colMap[col.key] = getExcelColumnLetter(idx + 1);
          }
        }

        const numCols = activeColumns.length;
        let leftRange = "A1:A1";
        let centerRange = "B1:B1";
        let rightRange = "C1:C1";
        let centerRange2 = "B2:B2";
        let rightRange2 = "C2:C2";
        let centerRange3 = "B3:B3";
        let rightRange3 = "C3:C3";
        let centerRange4 = "B4:B4";
        let rightRange4 = "C4:C4";

        let leftCell = "A1";
        let centerCell = "B1";
        let rightCell = "C1";
        let centerCell2 = "B2";
        let rightCell2 = "C2";
        let centerCell3 = "B3";
        let rightCell3 = "C3";
        let centerCell4 = "B4";
        let rightCell4 = "C4";

        if (numCols >= 6) {
          const leftEndIdx = Math.max(1, Math.floor(numCols * 0.18));
          const centerStartIdx = leftEndIdx + 1;
          const centerEndIdx = Math.max(
            centerStartIdx + 1,
            Math.floor(numCols * 0.6),
          );
          const rightStartIdx = centerEndIdx + 1;
          const rightEndIdx = numCols;

          leftRange = `A1:${getExcelColumnLetter(leftEndIdx)}1`;
          centerRange = `${getExcelColumnLetter(centerStartIdx)}1:${getExcelColumnLetter(centerEndIdx)}1`;
          rightRange = `${getExcelColumnLetter(rightStartIdx)}1:${getExcelColumnLetter(rightEndIdx)}1`;

          centerRange2 = `${getExcelColumnLetter(centerStartIdx)}2:${getExcelColumnLetter(centerEndIdx)}2`;
          rightRange2 = `${getExcelColumnLetter(rightStartIdx)}2:${getExcelColumnLetter(rightEndIdx)}2`;

          centerRange3 = `${getExcelColumnLetter(centerStartIdx)}3:${getExcelColumnLetter(centerEndIdx)}3`;
          rightRange3 = `${getExcelColumnLetter(rightStartIdx)}3:${getExcelColumnLetter(rightEndIdx)}3`;

          centerRange4 = `${getExcelColumnLetter(centerStartIdx)}4:${getExcelColumnLetter(centerEndIdx)}4`;
          rightRange4 = `${getExcelColumnLetter(rightStartIdx)}4:${getExcelColumnLetter(rightEndIdx)}4`;

          leftCell = "A1";
          centerCell = `${getExcelColumnLetter(centerStartIdx)}1`;
          rightCell = `${getExcelColumnLetter(rightStartIdx)}1`;
          centerCell2 = `${getExcelColumnLetter(centerStartIdx)}2`;
          rightCell2 = `${getExcelColumnLetter(rightStartIdx)}2`;
          centerCell3 = `${getExcelColumnLetter(centerStartIdx)}3`;
          rightCell3 = `${getExcelColumnLetter(rightStartIdx)}3`;
          centerCell4 = `${getExcelColumnLetter(centerStartIdx)}4`;
          rightCell4 = `${getExcelColumnLetter(rightStartIdx)}4`;
        } else if (numCols >= 3) {
          leftRange = "A1:A1";
          centerRange = `B1:${getExcelColumnLetter(Math.min(numCols, 2))}1`;
          rightRange = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}1:${getExcelColumnLetter(numCols)}1`;

          centerRange2 = `B2:${getExcelColumnLetter(Math.min(numCols, 2))}2`;
          rightRange2 = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}2:${getExcelColumnLetter(numCols)}2`;

          centerRange3 = `B3:${getExcelColumnLetter(Math.min(numCols, 2))}3`;
          rightRange3 = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}3:${getExcelColumnLetter(numCols)}3`;

          centerRange4 = `B4:${getExcelColumnLetter(Math.min(numCols, 2))}4`;
          rightRange4 = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}4:${getExcelColumnLetter(numCols)}4`;

          leftCell = "A1";
          centerCell = "B1";
          rightCell = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}1`;
          centerCell2 = "B2";
          rightCell2 = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}2`;
          centerCell3 = "B3";
          rightCell3 = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}3`;
          centerCell4 = "B4";
          rightCell4 = `${getExcelColumnLetter(Math.min(numCols, 2) + 1)}4`;
        }

        const addressParts = CANNY_MANAGEMENT_SERVICES_ADDRESS.split(",").map(
          (p) => p.trim(),
        );

        if (leftRange && leftRange !== "A1:A1") sheet.mergeCells(leftRange);
        const r1Left = sheet.getCell(leftCell);
        r1Left.value = "Contract At:-";
        r1Left.font = { bold: true };
        r1Left.alignment = { horizontal: "left", vertical: "middle" };

        if (centerRange && centerRange !== "B1:B1")
          sheet.mergeCells(centerRange);
        const r1Center = sheet.getCell(centerCell);
        r1Center.value = companyName;
        r1Center.font = { bold: true, size: 14 };
        r1Center.alignment = { horizontal: "center", vertical: "middle" };

        if (rightRange && rightRange !== "C1:C1") sheet.mergeCells(rightRange);
        const r1Right = sheet.getCell(rightCell);
        r1Right.value = CANNY_MANAGEMENT_SERVICES_NAME;
        r1Right.font = { bold: true };
        r1Right.alignment = { horizontal: "left", vertical: "middle" };

        if (centerRange2 && centerRange2 !== "B2:B2")
          sheet.mergeCells(centerRange2);
        const r2Center = sheet.getCell(centerCell2);
        r2Center.value = addressLine1;
        r2Center.alignment = { horizontal: "center", vertical: "middle" };

        if (rightRange2 && rightRange2 !== "C2:C2")
          sheet.mergeCells(rightRange2);
        const r2Right = sheet.getCell(rightCell2);
        r2Right.value = `${addressParts[0]}, ${addressParts[1]},`;
        r2Right.alignment = { horizontal: "left", vertical: "middle" };

        if (centerRange3 && centerRange3 !== "B3:B3")
          sheet.mergeCells(centerRange3);
        const r3Center = sheet.getCell(centerCell3);
        r3Center.value = addressLine2;
        r3Center.alignment = { horizontal: "center", vertical: "middle" };

        if (rightRange3 && rightRange3 !== "C3:C3")
          sheet.mergeCells(rightRange3);
        const r3Right = sheet.getCell(rightCell3);
        r3Right.value = `${addressParts[2]}, ${addressParts[3]}, ${addressParts[4]},`;
        r3Right.alignment = { horizontal: "left", vertical: "middle" };

        if (centerRange4 && centerRange4 !== "B4:B4")
          sheet.mergeCells(centerRange4);
        const r4Center = sheet.getCell(centerCell4);
        r4Center.value = `Salary For the Month of ${monthName.toUpperCase()} - ${year}`;
        r4Center.font = { bold: true };
        r4Center.alignment = { horizontal: "center", vertical: "middle" };

        if (rightRange4 && rightRange4 !== "C4:C4")
          sheet.mergeCells(rightRange4);
        const r4Right = sheet.getCell(rightCell4);
        r4Right.value = `${addressParts[5]}, ${addressParts[6]}, ${addressParts[7]}`;
        r4Right.alignment = { horizontal: "left", vertical: "middle" };

        sheet.getRow(1).height = 20;
        sheet.getRow(2).height = 15;
        sheet.getRow(3).height = 15;
        sheet.getRow(4).height = 20;

        const headerRow = sheet.getRow(5);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD3D3D3" },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
        headerRow.height = 30;

        const hasPhDaysColumn = activeColumns.some(
          (col) => col.key === "ph_days",
        );
        const hasPhWagesColumn = activeColumns.some(
          (col) => col.key === "ph_wages",
        );

        let totalDaysPresent = 0;
        let totalPhDays = 0;
        let totalPhWages = 0;
        let totalBasic = 0;
        let totalDa = 0;
        let totalVda = 0;
        let totalOtherAllowances = 0;
        let totalHra = 0;
        let totalLeaveSalary = 0;
        let totalOtHours = 0;
        let totalOvertime = 0;
        let totalBonus = 0;
        let totalActualWages = 0;
        let totalPf = 0;
        let totalEsic = 0;
        let totalPtax = 0;
        let totalLwf = 0;
        let totalLoan = 0;
        let totalAdvance = 0;
        let totalTotalDed = 0;
        let totalNetPay = 0;
        let totalCtcPm = 0;
        let totalPfWages = 0;
        let totalEsicWages = 0;
        let totalEsicNotApplicableWages = 0;
        let totalServiceChargeBase = 0;
        let totalEmployerPf = 0;
        let totalEmployerEsic = 0;

        const isComponentConsideredForEpf = (predicate: (name: string) => boolean) => {
          for (const empRow of siteData) {
            const fieldValues = empRow.salary_entries?.salary_field_values || [];
            for (const f of fieldValues) {
              const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
              const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
              if (predicate(name) || predicate(disp)) {
                if (
                  f?.consider_for_epf === true ||
                  f?.payroll_fields?.consider_for_epf === true
                ) {
                  return true;
                }
              }
            }

            const emp = empRow?.employee || empRow;
            const assignment = Array.isArray(emp?.employee_salary_assignment)
              ? emp.employee_salary_assignment[0]
              : emp?.employee_salary_assignment || emp?.salary_assignment;

            if (assignment) {
              const directComps = assignment?.employee_salary_components || [];
              for (const comp of directComps) {
                const pf = comp?.payment_fields || comp;
                const name = (pf?.name || "").trim().toLowerCase();
                const disp = (pf?.display_name || "").trim().toLowerCase();
                if ((name && predicate(name)) || (disp && predicate(disp))) {
                  if (comp?.consider_for_epf === true || pf?.consider_for_epf === true) {
                    return true;
                  }
                }
              }

              const templateObj = Array.isArray(assignment?.payment_templates)
                ? assignment.payment_templates[0]
                : assignment?.payment_templates;
              const versions = Array.isArray(templateObj?.payment_template_versions)
                ? templateObj.payment_template_versions
                : [];
              for (const ver of versions) {
                const tComps = ver?.payment_template_components || [];
                for (const comp of tComps) {
                  const pf = comp?.payment_fields || comp;
                  const name = (pf?.name || "").trim().toLowerCase();
                  const disp = (pf?.display_name || "").trim().toLowerCase();
                  if ((name && predicate(name)) || (disp && predicate(disp))) {
                    if (comp?.consider_for_epf === true || pf?.consider_for_epf === true) {
                      return true;
                    }
                  }
                }
              }
            }
          }

          if (payrollFields && Array.isArray(payrollFields)) {
            for (const pf of payrollFields) {
              const name = (pf?.name || "").trim().toLowerCase();
              const disp = (pf?.display_name || "").trim().toLowerCase();
              if ((name && predicate(name)) || (disp && predicate(disp))) {
                if (pf?.consider_for_epf === true) {
                  return true;
                }
              }
            }
          }

          return false;
        };

        const isDaConsideredForEpf = isComponentConsideredForEpf(isDa);
        const isVdaConsideredForEpf = isComponentConsideredForEpf(isVda);
        const isOtherAllowConsideredForEpf = isComponentConsideredForEpf(isOtherAllow);
        const isLeaveSalaryConsideredForEpf = isComponentConsideredForEpf(isLeaveSalary);
        const isHraConsideredForEpf = isComponentConsideredForEpf(isHra);
        const isOtConsideredForEpf = isComponentConsideredForEpf(isOvertime);
        const isBonusConsideredForEpf = isComponentConsideredForEpf(isBonus);
        const isPhWagesConsideredForEpf = isComponentConsideredForEpf(isPhWages);

        const isComponentConsideredForEsic = (predicate: (name: string) => boolean) => {
          for (const empRow of siteData) {
            const fieldValues = empRow.salary_entries?.salary_field_values || [];
            for (const f of fieldValues) {
              const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
              const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
              if (predicate(name) || predicate(disp)) {
                if (
                  f?.consider_for_esic === true ||
                  f?.payroll_fields?.consider_for_esic === true
                ) {
                  return true;
                }
              }
            }

            const emp = empRow?.employee || empRow;
            const assignment = Array.isArray(emp?.employee_salary_assignment)
              ? emp.employee_salary_assignment[0]
              : emp?.employee_salary_assignment || emp?.salary_assignment;

            if (assignment) {
              const directComps = assignment?.employee_salary_components || [];
              for (const comp of directComps) {
                const pf = comp?.payment_fields || comp;
                const name = (pf?.name || "").trim().toLowerCase();
                const disp = (pf?.display_name || "").trim().toLowerCase();
                if ((name && predicate(name)) || (disp && predicate(disp))) {
                  if (comp?.consider_for_esic === true || pf?.consider_for_esic === true) {
                    return true;
                  }
                }
              }

              const templateObj = Array.isArray(assignment?.payment_templates)
                ? assignment.payment_templates[0]
                : assignment?.payment_templates;
              const versions = Array.isArray(templateObj?.payment_template_versions)
                ? templateObj.payment_template_versions
                : [];
              for (const ver of versions) {
                const tComps = ver?.payment_template_components || [];
                for (const comp of tComps) {
                  const pf = comp?.payment_fields || comp;
                  const name = (pf?.name || "").trim().toLowerCase();
                  const disp = (pf?.display_name || "").trim().toLowerCase();
                  if ((name && predicate(name)) || (disp && predicate(disp))) {
                    if (comp?.consider_for_esic === true || pf?.consider_for_esic === true) {
                      return true;
                    }
                  }
                }
              }
            }
          }

          if (payrollFields && Array.isArray(payrollFields)) {
            for (const pf of payrollFields) {
              const name = (pf?.name || "").trim().toLowerCase();
              const disp = (pf?.display_name || "").trim().toLowerCase();
              if ((name && predicate(name)) || (disp && predicate(disp))) {
                if (pf?.consider_for_esic === true) {
                  return true;
                }
              }
            }
          }

          return false;
        };

        const isDaConsideredForEsic = isComponentConsideredForEsic(isDa);
        const isVdaConsideredForEsic = isComponentConsideredForEsic(isVda);
        const isOtherAllowConsideredForEsic = isComponentConsideredForEsic(isOtherAllow);
        const isLeaveSalaryConsideredForEsic = isComponentConsideredForEsic(isLeaveSalary);
        const isHraConsideredForEsic = isComponentConsideredForEsic(isHra);
        const isOtConsideredForEsic = isComponentConsideredForEsic(isOvertime);
        const isBonusConsideredForEsic = isComponentConsideredForEsic(isBonus);
        const isPhWagesConsideredForEsic = true;

        let lastSiteName = "";
        let currentRowNum = 6;

        for (let index = 0; index < siteData.length; index++) {
          const empRow = siteData[index];
          if (!empRow) continue;
          const emp = empRow?.employee || {};
          const currentSiteName =
            emp.work_details?.site?.name || "Salary Register";

          if (exportMode === "combined" && currentSiteName !== lastSiteName) {
            lastSiteName = currentSiteName;
            const separatorRowData = activeColumns.map((col) => {
              if (col.key === "emp_name") {
                return currentSiteName.toUpperCase();
              }
              return "";
            });
            const separatorRow = sheet.addRow(separatorRowData);
            for (let colIdx = 1; colIdx <= activeColumns.length; colIdx++) {
              const cell = separatorRow.getCell(colIdx);
              cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
              const colKey = activeColumns[colIdx - 1]?.key;
              if (colKey === "emp_name") {
                cell.font = { bold: true, color: { argb: "FFFF0000" } };
                cell.alignment = { horizontal: "left" };
              }
            }
            currentRowNum++;
          }
          const statDetails = Array.isArray(emp.employee_statutory_details)
            ? emp.employee_statutory_details[0]
            : emp.employee_statutory_details || {};

          const esicNo = statDetails?.esic_number || "N/A";
          const uanNo = statDetails?.uan_number || "N/A";
          const empName = [emp.first_name, emp.middle_name, emp.last_name]
            .filter(Boolean)
            .join(" ")
            .toUpperCase();
          const daysPresent =
            Number(empRow.present_days || 0) +
            Number(empRow.paid_leaves || 0) +
            (hasPhDaysColumn ? 0 : Number(empRow.paid_holidays || 0)) +
            Number(empRow.casual_leaves || 0);

          const totalPaidDays =
            Number(empRow.present_days || 0) +
            Number(empRow.paid_leaves || 0) +
            Number(empRow.paid_holidays || 0) +
            Number(empRow.casual_leaves || 0);

          const assignment = Array.isArray(emp.employee_salary_assignment)
            ? emp.employee_salary_assignment[0]
            : emp.employee_salary_assignment;
          let rawStatutory = assignment?.employee_salary_statutory_components;
          let activeVersion: any = null;
          if (assignment?.use_payment_template) {
            const templateObj = Array.isArray(assignment?.payment_templates)
              ? assignment.payment_templates[0]
              : assignment?.payment_templates;
            const versions =
              templateObj?.payment_template_versions || [];
            activeVersion = versions
              .filter(
                (v: any) =>
                  !v.effective_date ||
                  new Date(v.effective_date) <= payrollDateForStatutory,
              )
              .sort(
                (a: any, b: any) =>
                  new Date(b.effective_date).getTime() -
                  new Date(a.effective_date).getTime(),
              )[0];
            if (activeVersion?.payment_statutory_components) {
              rawStatutory = activeVersion.payment_statutory_components;
            }
          }

          const statutory = Array.isArray(rawStatutory)
            ? rawStatutory[0]
            : rawStatutory;

          const pfObj = Array.isArray(statutory?.pf)
            ? statutory.pf[0]
            : statutory?.pf || firstPf;
          const esiObj = extractEsiObj(empRow) || (Array.isArray(statutory?.esi)
            ? statutory.esi[0]
            : statutory?.esi || firstEsi);
          const bonusObj = Array.isArray(statutory?.bonus)
            ? statutory.bonus[0]
            : statutory?.bonus || firstBonus;

          const pfEmployeeRate = pfObj?.employee_contribution
            ? Number(pfObj.employee_contribution)
            : 12;
          const pfEmployerRate = pfObj?.employer_contribution
            ? Number(pfObj.employer_contribution)
            : 13;

          const empStatDetails = Array.isArray(emp?.employee_statutory_details)
            ? emp.employee_statutory_details[0]
            : emp?.employee_statutory_details || {};
          const assignedEsicId = empStatDetails?.esic_id || statutory?.esic_id || statutory?.esi_id;
          const mappedEsiObj = assignedEsicId ? esiMap.get(String(assignedEsicId)) : null;
          const activeEsiObj = mappedEsiObj || esiObj;

          const rawEsiEmpContribution = activeEsiObj?.employee_contribution ?? esiObj?.employee_contribution;
          const esiEmployeeRate =
            rawEsiEmpContribution !== undefined && rawEsiEmpContribution !== null
              ? (Number(rawEsiEmpContribution) < 1 ? Number(rawEsiEmpContribution) * 100 : Number(rawEsiEmpContribution))
              : (fetchedCompanyEsiEmpRate ?? 0.75);

          const rawEsiEmprContribution = activeEsiObj?.employer_contribution ?? esiObj?.employer_contribution;
          const esiEmployerRate =
            rawEsiEmprContribution !== undefined && rawEsiEmprContribution !== null
              ? (Number(rawEsiEmprContribution) < 1 ? Number(rawEsiEmprContribution) * 100 : Number(rawEsiEmprContribution))
              : (fetchedCompanyEsiEmprRate ?? 3.25);

          const esiMaxLimit =
            activeEsiObj?.max_limit !== undefined && activeEsiObj?.max_limit !== null
              ? Number(activeEsiObj.max_limit)
              : (esiObj?.max_limit !== undefined && esiObj?.max_limit !== null
                ? Number(esiObj.max_limit)
                : (fetchedCompanyEsiLimit ?? detectedEsiMaxLimit ?? 21000));

          const bonusRate = bonusObj?.percentage
            ? Number(bonusObj.percentage)
            : 8.33;


          const fields = empRow.salary_entries?.salary_field_values || [];

          const getField = (matchName: string) => {
            const found = fields.find((f: any) =>
              f?.payroll_fields?.name
                ?.toLowerCase()
                .includes(matchName.toLowerCase()),
            );
            return Number(found?.amount || 0);
          };
          const getExactField = (matchName: string) => {
            const found = fields.find(
              (f: any) =>
                f?.payroll_fields?.name?.toLowerCase() ===
                matchName.toLowerCase(),
            );
            return Number(found?.amount || 0);
          };

          const getCustomFieldValue = (colKey: string) => {
            if (!colKey.startsWith("custom_")) return 0;
            const cleanKey = colKey.substring(7);
            const found = fields.find((f: any) => {
              const fname = (f.payroll_fields?.name || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_");
              return fname === cleanKey;
            });
            return found ? Number(found.amount || 0) : 0;
          };



          const findFieldAmount = (predicate: (name: string) => boolean) => {
            const found = fields.find(
              (f: any) =>
                f?.payroll_fields?.name &&
                predicate(f.payroll_fields.name.trim().toLowerCase()),
            );
            return Number(found?.amount || 0);
          };

          const basic = findFieldAmount(isBasic);
          const da = findFieldAmount(isDa);
          const vda = findFieldAmount(isVda);
          const hra = findFieldAmount(isHra);
          let bonus = findFieldAmount(isBonus);
          const overtimeHours = Number(empRow.overtime_hours || 0);
          const overtime = findFieldAmount(isOvertime);
          const leaveSalary = findFieldAmount(isLeaveSalary);

          let leaveSalaryRate = statutory?.leave_salary?.percentage
            ? Number(statutory.leave_salary.percentage)
            : 0;

          if (!leaveSalaryRate) {
            const lsField = fields.find((f: any) => {
              const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
              const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
              return isLeaveSalary(name) || isLeaveSalary(disp);
            });
            if (
              lsField?.payroll_fields &&
              (lsField.payroll_fields.calculation_type === "percentage_of_basic" ||
                lsField.payroll_fields.calculation_type === "percentage_of_basic_da") &&
              Number(lsField.payroll_fields.amount ?? lsField.payroll_fields.value ?? 0) > 0
            ) {
              leaveSalaryRate = Number(
                lsField.payroll_fields.amount ?? lsField.payroll_fields.value,
              );
            }
          }

          if (!leaveSalaryRate && leaveSalary > 0) {
            const baseWages = basic + da;
            if (baseWages > 0) {
              const calcRate = (leaveSalary / baseWages) * 100;
              const roundedRate = Math.round(calcRate * 100) / 100;
              leaveSalaryRate =
                Math.abs(roundedRate - Math.round(roundedRate)) < 0.05
                  ? Math.round(roundedRate)
                  : roundedRate;
            }
          }

          if (!leaveSalaryRate) {
            leaveSalaryRate = siteLeaveSalaryRate || 5;
          }

          let otherAllow = 0;
          let actualWages = 0;
          let totalEarn = 0;

          for (const f of fields) {
            if (f.payroll_fields?.type === "earning") {
              totalEarn += Number(f.amount || 0);
              const fname = (f.payroll_fields?.name || "").trim().toLowerCase();
              if (isOtherAllow(fname)) {
                otherAllow += Number(f.amount || 0);
              } else if (
                !isBasic(fname) &&
                !isDa(fname) &&
                !isVda(fname) &&
                !isHra(fname) &&
                !isBonus(fname) &&
                !isOvertime(fname) &&
                !isLeaveSalary(fname) &&
                (!hasPhWagesColumn || !isPhWages(fname))
              ) {
                const customKey = `custom_${fname.replace(/\s+/g, "_")}`;
                const isCustomColActive = activeColumns.some(
                  (col) => col.key === customKey,
                );
                if (!isCustomColActive) {
                  otherAllow += Number(f.amount || 0);
                }
              }
            }
          }

          const phDays = Number(empRow.paid_holidays || 0);
          const dbPhWages = findFieldAmount(isPhWages);
          const year =
            empRow.year || payrollData?.year || new Date().getFullYear();
          const month = empRow.month || payrollData?.month || 1;
          const workingDays =
            empRow.working_days ?? new Date(year, month, 0).getDate();
          const oneDaySalaryRate =
            daysPresent > 0
              ? (basic + da + vda) / daysPresent
              : workingDays > 0
                ? (basic + da + vda) / workingDays
                : 0;
          const phWages = dbPhWages > 0 ? dbPhWages : oneDaySalaryRate * phDays;

          actualWages =
            basic + da + vda + hra + otherAllow + overtime + leaveSalary;
          if (phWages > 0 && hasPhWagesColumn) {
            actualWages += phWages;
          }
          for (const col of activeColumns) {
            if (
              col.key.startsWith("custom_") &&
              col.customType === "earning"
            ) {
              const colIdx = activeColumns.findIndex((c) => c.key === col.key);
              if (actualWagesIdx === -1 || colIdx < actualWagesIdx) {
                actualWages += getCustomFieldValue(col.key);
              }
            }
          }


          if (isBonusBeforeActualWages) {
            actualWages += bonus;
          }

          const pf =
            getField("pf") || getField("epf") || getField("provident fund");
          const esic = getField("esi") || getField("esic");
          const ptax =
            getField("pt") || getField("professional tax") || getField("p.tax");
          const lwf = getField("lwf") || getField("labour welfare fund");
          const loan =
            getExactField("loan") ||
            getField("loan") ||
            getField("employee_loan");
          const advance =
            getExactField("advance") ||
            getField("advance") ||
            getField("employee_advance");

          let totalExpenseEarnings = 0;


          let totalDed = pf + esic + ptax + lwf + loan + advance;
          for (const col of activeColumns) {
            if (
              col.key.startsWith("custom_") &&
              col.customType === "deduction"
            ) {
              totalDed += getCustomFieldValue(col.key);
            }
          }
          let postWageCustomEarnings = 0;
          for (const col of activeColumns) {
            if (
              col.key.startsWith("custom_") &&
              col.customType === "earning"
            ) {
              const colIdx = activeColumns.findIndex((c) => c.key === col.key);
              if (actualWagesIdx !== -1 && colIdx > actualWagesIdx) {
                postWageCustomEarnings += getCustomFieldValue(col.key);
              }
            }
          }

          let calcNet = empRow.calculation?.netAmount;
          if (
            calcNet === undefined &&
            empRow.monthly_ctc &&
            empRow.basic_percent
          ) {
            try {
              const calc = calculateSalaryBreakdown({
                monthlyCtc: Number(empRow.monthly_ctc || 0),
                basicPercent: Number(empRow.basic_percent || 0),
                isProRata: empRow.is_pro_rata ?? true,
                payableDays: Number(empRow.present_days || 0),
                workingDays: Number(empRow.working_days || 0),
                overtimeHours: Number(empRow.overtime_hours || 0),
                holidayConfig: (holidayConfig as any) || [],
                attendance: {
                  paidHolidays: Number(empRow.paid_holidays || 0),
                  paidLeaves: Number(empRow.paid_leaves || 0),
                  casualLeaves: Number(empRow.casual_leaves || 0),
                  overtimeHours: Number(empRow.overtime_hours || 0),
                },
                components: (payrollFields as any) || [],
                statutory: rawStatutory || {},
                month: empRow.month || payrollData?.month,
              });
              calcNet = calc.netAmount;
            } catch (e) {
              // fallback
            }
          }

          const netPay =
            calcNet ??
            (actualWages +
              (isBonusBeforeActualWages ? 0 : bonus) +
              postWageCustomEarnings -
              totalDed);

          const pfWages = pf > 0 ? (pf * 100) / pfEmployeeRate : 0;
          const employerPf =
            pf > 0 ? (pf * pfEmployerRate) / pfEmployeeRate : 0;

          const isEsicApplicable =
            statDetails?.is_esic_applicable === true || esic > 0;
          const employerEsic = isEsicApplicable
            ? esic > 0
              ? (esic * esiEmployerRate) / esiEmployeeRate
              : 0
            : 0;
          const esicWages = esic > 0 ? (esic * 100) / esiEmployeeRate : 0;

          const selectedScKeys =
            siteServiceChargeOn[siteName] ??
            getInitialServiceChargeKeys(serviceChargesOn, activeColumns);

          let scBase = 0;
          if (selectedScKeys.includes("ph_wages")) scBase += phWages;
          if (selectedScKeys.includes("basic")) scBase += basic;
          if (selectedScKeys.includes("da")) scBase += da;
          if (selectedScKeys.includes("vda")) scBase += vda;
          if (selectedScKeys.includes("other_allow")) {
            scBase += otherAllow;
          }
          if (selectedScKeys.includes("hra")) scBase += hra;
          if (selectedScKeys.includes("leave_salary")) scBase += leaveSalary;
          if (selectedScKeys.includes("overtime")) scBase += overtime;
          if (selectedScKeys.includes("bonus")) scBase += bonus;

          for (const col of activeColumns) {
            if (col.key.startsWith("custom_") && col.customType === "earning") {
              if (selectedScKeys.includes(col.key)) {
                scBase += getCustomFieldValue(col.key);
              }
            }
          }

          const serviceCharge = (scBase * serviceChargeRate) / 100;
          const ctcPm =
            actualWages +
            (isBonusBeforeActualWages ? 0 : bonus) +
            postWageCustomEarnings +
            employerPf +
            employerEsic +
            serviceCharge;
          const perDayCtc = workingDays > 0 ? ctcPm / workingDays : 0;

          totalDaysPresent += daysPresent;
          totalPhDays += phDays;
          totalPhWages += phWages;
          totalBasic += basic;
          totalDa += da;
          totalVda += vda;
          totalOtherAllowances += otherAllow;
          totalHra += hra;
          totalLeaveSalary += leaveSalary;
          totalOtHours += overtimeHours;
          totalOvertime += overtime;
          totalBonus += bonus;
          totalActualWages += actualWages;
          totalPf += pf;
          totalEsic += esic;
          totalPtax += ptax;
          totalLwf += lwf;
          totalLoan += loan;
          totalAdvance += advance;
          totalTotalDed += totalDed;
          totalNetPay += netPay;
          totalCtcPm += ctcPm;

          totalPfWages += pfWages;
          totalEmployerPf += employerPf;
          totalEmployerEsic += employerEsic;
          if (isEsicApplicable && esic > 0) totalEsicWages += esicWages;
          else totalEsicNotApplicableWages += actualWages;
          totalServiceChargeBase += scBase;

          const rowNum = currentRowNum;

          const daysPresentRef = colMap["days_present"]
            ? `${colMap["days_present"]}${rowNum}`
            : String(daysPresent);
          const basicRef = colMap["basic"]
            ? `${colMap["basic"]}${rowNum}`
            : String(Math.round(basic));
          const actualWagesRef = colMap["actual_wages"]
            ? `${colMap["actual_wages"]}${rowNum}`
            : String(Math.round(actualWages));
          const ctcPmRef = colMap["ctc_pm"]
            ? `${colMap["ctc_pm"]}${rowNum}`
            : String(Math.round(ctcPm));

          const getRowValue = (key: string) => {
            switch (key) {
              case "sr_no":
                return index + 1;
              case "emp_code":
                return emp.employee_code || "";
              case "site_name":
                return emp.work_details?.site?.name || "Salary Register";
              case "esic_no":
                return esicNo;
              case "uan_no":
                return uanNo;
              case "emp_name":
                return empName;
              case "ot_hours":
                return overtimeHours;
              case "days_present":
                return daysPresent;
              case "ph_days":
                return Number(empRow.paid_holidays || 0);
              case "ph_wages": {
                return phWages > 0 ? Math.round(phWages) : 0;
              }
              case "basic": {
                const hasDbPhWages = dbPhWages > 0;
                const divisor = hasDbPhWages ? daysPresent : totalPaidDays;
                const multiplierRef =
                  !hasDbPhWages && !hasPhWagesColumn && colMap["ph_days"]
                    ? `(${daysPresentRef}+${colMap["ph_days"]}${rowNum})`
                    : daysPresentRef;

                return basic > 0
                  ? {
                    formula: `ROUND(${divisor > 0 ? (basic / divisor).toFixed(4) : 0}*${multiplierRef}, 0)`,
                    result: Math.round(
                      hasPhWagesColumn && divisor > 0 && !hasDbPhWages
                        ? (basic / divisor) * daysPresent
                        : basic,
                    ),
                  }
                  : 0;
              }
              case "da": {
                const hasDbPhWages = dbPhWages > 0;
                const divisor = hasDbPhWages ? daysPresent : totalPaidDays;
                const multiplierRef =
                  !hasDbPhWages && !hasPhWagesColumn && colMap["ph_days"]
                    ? `(${daysPresentRef}+${colMap["ph_days"]}${rowNum})`
                    : daysPresentRef;

                return da > 0
                  ? {
                    formula: `ROUND(${divisor > 0 ? (da / divisor).toFixed(4) : 0}*${multiplierRef}, 0)`,
                    result: Math.round(
                      hasPhWagesColumn && divisor > 0 && !hasDbPhWages
                        ? (da / divisor) * daysPresent
                        : da,
                    ),
                  }
                  : 0;
              }
              case "vda": {
                const hasDbPhWages = dbPhWages > 0;
                const divisor = hasDbPhWages ? daysPresent : totalPaidDays;
                const multiplierRef =
                  !hasDbPhWages && !hasPhWagesColumn && colMap["ph_days"]
                    ? `(${daysPresentRef}+${colMap["ph_days"]}${rowNum})`
                    : daysPresentRef;

                return vda > 0
                  ? {
                    formula: `ROUND(${divisor > 0 ? (vda / divisor).toFixed(4) : 0}*${multiplierRef}, 0)`,
                    result: Math.round(
                      hasPhWagesColumn && divisor > 0 && !hasDbPhWages
                        ? (vda / divisor) * daysPresent
                        : vda,
                    ),
                  }
                  : 0;
              }
              case "other_allow": {
                const multiplierRef = colMap["ph_days"]
                  ? `(${daysPresentRef}+${colMap["ph_days"]}${rowNum})`
                  : daysPresentRef;
                return otherAllow > 0
                  ? {
                    formula: `ROUND(${totalPaidDays > 0 ? (otherAllow / totalPaidDays).toFixed(4) : 0}*${multiplierRef}, 0)`,
                    result: Math.round(otherAllow),
                  }
                  : 0;
              }
              case "hra": {
                const multiplierRef = colMap["ph_days"]
                  ? `(${daysPresentRef}+${colMap["ph_days"]}${rowNum})`
                  : daysPresentRef;
                return hra > 0
                  ? {
                    formula: `ROUND(${totalPaidDays > 0 ? (hra / totalPaidDays).toFixed(4) : 0}*${multiplierRef}, 0)`,
                    result: Math.round(hra),
                  }
                  : 0;
              }
              case "leave_salary": {
                const leaveSalaryBasicRef = colMap["basic"]
                  ? `${colMap["basic"]}${rowNum}`
                  : String(Math.round(basic));
                const leaveSalaryDaRef = colMap["da"]
                  ? `${colMap["da"]}${rowNum}`
                  : String(Math.round(da));

                const parts = [leaveSalaryBasicRef];
                if (da > 0) parts.push(leaveSalaryDaRef);
                if (colMap["vda"]) parts.push(`${colMap["vda"]}${rowNum}`);
                if (colMap["ph_wages"])
                  parts.push(`${colMap["ph_wages"]}${rowNum}`);

                const formulaPartsStr =
                  parts.length > 1 ? `(${parts.join("+")})` : parts[0];
                return leaveSalary > 0
                  ? {
                    formula: `ROUND(${formulaPartsStr}*${leaveSalaryRate}%, 0)`,
                    result: Math.round(leaveSalary),
                  }
                  : 0;
              }
              case "overtime": {
                return Math.round(overtime);
              }
              case "bonus": {
                const bonusParts: string[] = [];

                if (colMap["basic"]) {
                  bonusParts.push(`${colMap["basic"]}${rowNum}`);
                } else if (basic > 0) {
                  bonusParts.push(String(Math.round(basic)));
                }

                const checkAndAddBonusPart = (
                  colKey: string,
                  amount: number,
                  predicate: (name: string) => boolean,
                  defaultInclude = false,
                ) => {
                  if (amount <= 0) return;

                  let isBonusEligible = false;
                  let foundComponent = false;

                  // 1. Check in salary_field_values
                  const f = fields.find((f: any) => {
                    const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
                    const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
                    return (name && predicate(name)) || (disp && predicate(disp));
                  });

                  if (f) {
                    foundComponent = true;
                    if (
                      f?.consider_for_bonus === true ||
                      f?.payroll_fields?.consider_for_bonus === true
                    ) {
                      isBonusEligible = true;
                    } else if (
                      f?.consider_for_bonus === false ||
                      f?.payroll_fields?.consider_for_bonus === false
                    ) {
                      isBonusEligible = false;
                    } else {
                      isBonusEligible = defaultInclude;
                    }
                  }

                  // 2. Check in employee salary assignment / template components
                  if (!foundComponent || (f && f.consider_for_bonus === undefined && f?.payroll_fields?.consider_for_bonus === undefined)) {
                    const emp = empRow?.employee || empRow;
                    const assignment = Array.isArray(emp?.employee_salary_assignment)
                      ? emp.employee_salary_assignment[0]
                      : emp?.employee_salary_assignment || emp?.salary_assignment;

                    if (assignment) {
                      const directComps = assignment?.employee_salary_components || [];
                      for (const comp of directComps) {
                        const pf = comp?.payment_fields || comp;
                        const name = (pf?.name || "").trim().toLowerCase();
                        const disp = (pf?.display_name || "").trim().toLowerCase();
                        if ((name && predicate(name)) || (disp && predicate(disp))) {
                          foundComponent = true;
                          isBonusEligible =
                            comp?.consider_for_bonus === true ||
                            pf?.consider_for_bonus === true ||
                            (defaultInclude && comp?.consider_for_bonus !== false && pf?.consider_for_bonus !== false);
                          break;
                        }
                      }

                      if (!foundComponent) {
                        const templateObj = Array.isArray(assignment?.payment_templates)
                          ? assignment.payment_templates[0]
                          : assignment?.payment_templates;
                        const versions = Array.isArray(templateObj?.payment_template_versions)
                          ? templateObj.payment_template_versions
                          : [];
                        for (const ver of versions) {
                          const tComps = ver?.payment_template_components || [];
                          for (const comp of tComps) {
                            const pf = comp?.payment_fields || comp;
                            const name = (pf?.name || "").trim().toLowerCase();
                            const disp = (pf?.display_name || "").trim().toLowerCase();
                            if ((name && predicate(name)) || (disp && predicate(disp))) {
                              foundComponent = true;
                              isBonusEligible =
                                comp?.consider_for_bonus === true ||
                                pf?.consider_for_bonus === true ||
                                (defaultInclude && comp?.consider_for_bonus !== false && pf?.consider_for_bonus !== false);
                              break;
                            }
                          }
                          if (foundComponent) break;
                        }
                      }
                    }
                  }

                  // 3. Check in payrollFields prop if available
                  if (!foundComponent && payrollFields && Array.isArray(payrollFields)) {
                    for (const pf of payrollFields) {
                      const name = (pf?.name || "").trim().toLowerCase();
                      const disp = (pf?.display_name || "").trim().toLowerCase();
                      if ((name && predicate(name)) || (disp && predicate(disp))) {
                        if (pf?.consider_for_bonus === true) {
                          foundComponent = true;
                          isBonusEligible = true;
                          break;
                        }
                      }
                    }
                  }

                  if (!foundComponent) {
                    isBonusEligible = defaultInclude;
                  }

                  if (isBonusEligible) {
                    if (colMap[colKey]) {
                      bonusParts.push(`${colMap[colKey]}${rowNum}`);
                    } else {
                      bonusParts.push(String(Math.round(amount)));
                    }
                  }
                };

                checkAndAddBonusPart("da", da, isDa, true);
                checkAndAddBonusPart("vda", vda, isVda, true);
                checkAndAddBonusPart("hra", hra, isHra, false);
                checkAndAddBonusPart("other_allow", otherAllow, isOtherAllow, false);
                checkAndAddBonusPart("leave_salary", leaveSalary, isLeaveSalary, false);
                checkAndAddBonusPart("ph_wages", phWages, isPhWages, false);

                for (const col of activeColumns) {
                  if (
                    col.key.startsWith("custom_") &&
                    col.customType === "earning"
                  ) {
                    const customVal = getCustomFieldValue(col.key);
                    if (customVal > 0) {
                      const cleanKey = col.key.substring(7);
                      const customPredicate = (n: string) =>
                        n.replace(/\s+/g, "_") === cleanKey;
                      checkAndAddBonusPart(col.key, customVal, customPredicate, false);
                    }
                  }
                }

                const formulaPartsStr =
                  bonusParts.length > 1
                    ? `(${bonusParts.join("+")})`
                    : bonusParts[0] || "0";

                return bonus > 0
                  ? {
                    formula: `ROUND(${formulaPartsStr}*(${bonusRate}/100), 0)`,
                    result: Math.round(bonus),
                  }
                  : 0;
              }
              case "actual_wages": {
                const actualWagesParts: string[] = [];
                if (colMap["basic"])
                  actualWagesParts.push(`${colMap["basic"]}${rowNum}`);
                else if (basic > 0)
                  actualWagesParts.push(String(Math.round(basic)));

                if (colMap["da"])
                  actualWagesParts.push(`${colMap["da"]}${rowNum}`);
                else if (da > 0) actualWagesParts.push(String(Math.round(da)));

                if (colMap["vda"])
                  actualWagesParts.push(`${colMap["vda"]}${rowNum}`);
                else if (vda > 0)
                  actualWagesParts.push(String(Math.round(vda)));

                if (colMap["ph_wages"])
                  actualWagesParts.push(`${colMap["ph_wages"]}${rowNum}`);
                else if (phWages > 0)
                  actualWagesParts.push(String(Math.round(phWages)));

                if (colMap["other_allow"])
                  actualWagesParts.push(`${colMap["other_allow"]}${rowNum}`);
                else if (otherAllow > 0)
                  actualWagesParts.push(String(Math.round(otherAllow)));

                if (colMap["hra"])
                  actualWagesParts.push(`${colMap["hra"]}${rowNum}`);
                else if (hra > 0)
                  actualWagesParts.push(String(Math.round(hra)));

                if (colMap["leave_salary"])
                  actualWagesParts.push(`${colMap["leave_salary"]}${rowNum}`);
                else if (leaveSalary > 0)
                  actualWagesParts.push(String(Math.round(leaveSalary)));

                if (colMap["overtime"])
                  actualWagesParts.push(`${colMap["overtime"]}${rowNum}`);
                else if (overtime > 0)
                  actualWagesParts.push(String(Math.round(overtime)));

                if (isBonusBeforeActualWages) {
                  if (colMap["bonus"])
                    actualWagesParts.push(`${colMap["bonus"]}${rowNum}`);
                  else if (bonus > 0)
                    actualWagesParts.push(String(Math.round(bonus)));
                }

                for (const col of activeColumns) {
                  if (
                    col.key.startsWith("custom_") &&
                    col.customType === "earning"
                  ) {
                    const colIdx = activeColumns.findIndex((c) => c.key === col.key);
                    if (actualWagesIdx === -1 || colIdx < actualWagesIdx) {
                      const val = getCustomFieldValue(col.key);
                      if (colMap[col.key]) {
                        actualWagesParts.push(`${colMap[col.key]}${rowNum}`);
                      } else if (val > 0) {
                        actualWagesParts.push(String(Math.round(val)));
                      }
                    }
                  }
                }


                const formulaStr =
                  actualWagesParts.length > 0
                    ? `SUM(${actualWagesParts.join(",")})`
                    : "0";
                return {
                  formula: formulaStr,
                  result: Math.round(actualWages),
                };
              }
              case "pf": {
                const pfParts: string[] = [];
                if (colMap["basic"])
                  pfParts.push(`${colMap["basic"]}${rowNum}`);
                else if (basic > 0) pfParts.push(String(Math.round(basic)));

                const checkAndAddPfPart = (
                  colKey: string,
                  amount: number,
                  predicate: (name: string) => boolean,
                  siteConsidered: boolean,
                  defaultInclude = false,
                ) => {
                  if (amount <= 0) return;

                  let isPfEligible = false;
                  let foundComponent = false;

                  // 1. Check in salary_field_values
                  const f = fields.find((f: any) => {
                    const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
                    const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
                    return (name && predicate(name)) || (disp && predicate(disp));
                  });

                  if (f) {
                    if (
                      f?.consider_for_epf === true ||
                      f?.payroll_fields?.consider_for_epf === true
                    ) {
                      foundComponent = true;
                      isPfEligible = true;
                    } else if (
                      f?.consider_for_epf === false ||
                      f?.payroll_fields?.consider_for_epf === false
                    ) {
                      // Handled by further checks
                    }
                  }

                  // 2. Check in employee salary assignment / template components
                  if (!isPfEligible) {
                    const emp = empRow?.employee || empRow;
                    const assignment = Array.isArray(emp?.employee_salary_assignment)
                      ? emp.employee_salary_assignment[0]
                      : emp?.employee_salary_assignment || emp?.salary_assignment;

                    if (assignment) {
                      const directComps = assignment?.employee_salary_components || [];
                      for (const comp of directComps) {
                        const pf = comp?.payment_fields || comp;
                        const name = (pf?.name || "").trim().toLowerCase();
                        const disp = (pf?.display_name || "").trim().toLowerCase();
                        if ((name && predicate(name)) || (disp && predicate(disp))) {
                          foundComponent = true;
                          if (comp?.consider_for_epf === true || pf?.consider_for_epf === true) {
                            isPfEligible = true;
                          } else if (comp?.consider_for_epf === false || pf?.consider_for_epf === false) {
                            isPfEligible = false;
                          }
                          break;
                        }
                      }

                      if (!foundComponent || !isPfEligible) {
                        const templateObj = Array.isArray(assignment?.payment_templates)
                          ? assignment.payment_templates[0]
                          : assignment?.payment_templates;
                        const versions = Array.isArray(templateObj?.payment_template_versions)
                          ? templateObj.payment_template_versions
                          : [];
                        for (const ver of versions) {
                          const tComps = ver?.payment_template_components || [];
                          for (const comp of tComps) {
                            const pf = comp?.payment_fields || comp;
                            const name = (pf?.name || "").trim().toLowerCase();
                            const disp = (pf?.display_name || "").trim().toLowerCase();
                            if ((name && predicate(name)) || (disp && predicate(disp))) {
                              foundComponent = true;
                              if (comp?.consider_for_epf === true || pf?.consider_for_epf === true) {
                                isPfEligible = true;
                              } else if (comp?.consider_for_epf === false || pf?.consider_for_epf === false) {
                                isPfEligible = false;
                              }
                              break;
                            }
                          }
                          if (isPfEligible) break;
                        }
                      }
                    }
                  }

                  // 3. Check in payrollFields / payment_fields prop if available
                  if (!foundComponent && payrollFields && Array.isArray(payrollFields)) {
                    for (const pf of payrollFields) {
                      const name = (pf?.name || "").trim().toLowerCase();
                      const disp = (pf?.display_name || "").trim().toLowerCase();
                      if ((name && predicate(name)) || (disp && predicate(disp))) {
                        if (pf?.consider_for_epf === true) {
                          foundComponent = true;
                          isPfEligible = true;
                          break;
                        }
                      }
                    }
                  }

                  if (!foundComponent) {
                    isPfEligible = siteConsidered || defaultInclude;
                  } else if (!isPfEligible && siteConsidered) {
                    isPfEligible = true;
                  }

                  if (isPfEligible) {
                    if (colMap[colKey]) {
                      pfParts.push(`${colMap[colKey]}${rowNum}`);
                    } else {
                      pfParts.push(String(Math.round(amount)));
                    }
                  }
                };

                checkAndAddPfPart("da", da, isDa, isDaConsideredForEpf, true);
                checkAndAddPfPart("vda", vda, isVda, isVdaConsideredForEpf, true);
                checkAndAddPfPart("other_allow", otherAllow, isOtherAllow, isOtherAllowConsideredForEpf, false);
                checkAndAddPfPart("hra", hra, isHra, isHraConsideredForEpf, false);
                checkAndAddPfPart("leave_salary", leaveSalary, isLeaveSalary, isLeaveSalaryConsideredForEpf, false);
                checkAndAddPfPart("overtime", overtime, isOvertime, isOtConsideredForEpf, false);
                checkAndAddPfPart("ph_wages", phWages, isPhWages, isPhWagesConsideredForEpf, false);
                checkAndAddPfPart(
                  "bonus",
                  bonus,
                  isBonus,
                  isBonusConsideredForEpf,
                  statutory?.bonus?.consider_for_epf === true,
                );

                for (const col of activeColumns) {
                  if (
                    col.key.startsWith("custom_") &&
                    col.customType === "earning"
                  ) {
                    const customVal = getCustomFieldValue(col.key);
                    if (customVal > 0) {
                      const cleanKey = col.key.substring(7);
                      const customPredicate = (n: string) =>
                        n.replace(/\s+/g, "_") === cleanKey;
                      const isCustomConsidered = isComponentConsideredForEpf(customPredicate);
                      checkAndAddPfPart(col.key, customVal, customPredicate, isCustomConsidered, false);
                    }
                  }
                }

                const formulaPartsStr = pfParts.join("+");
                return pf > 0
                  ? {
                    formula: `ROUND((${formulaPartsStr})*(${pfEmployeeRate}/100), 0)`,
                    result: Math.round(pf),
                  }
                  : 0;
              }
              case "esic": {
                const esiParts: string[] = [];

                let isBasicConsideredForEsic = true;
                const basicField = fields.find((f: any) => {
                  const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
                  const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
                  return isBasic(name) || isBasic(disp);
                });
                if (basicField) {
                  if (
                    basicField.consider_for_esic === false ||
                    basicField?.payroll_fields?.consider_for_esic === false
                  ) {
                    isBasicConsideredForEsic = false;
                  }
                }
                if (isBasicConsideredForEsic) {
                  if (colMap["basic"]) {
                    esiParts.push(`${colMap["basic"]}${rowNum}`);
                  } else if (basic > 0) {
                    esiParts.push(String(Math.round(basic)));
                  }
                }

                const checkAndAddEsiPart = (
                  colKey: string,
                  amount: number,
                  predicate: (name: string) => boolean,
                  siteConsidered: boolean,
                  defaultInclude = false,
                ) => {
                  if (amount <= 0) return;

                  let isEsiEligible = false;
                  let foundComponent = false;

                  // 1. Check in salary_field_values
                  const f = fields.find((f: any) => {
                    const name = (f?.payroll_fields?.name || "").trim().toLowerCase();
                    const disp = (f?.payroll_fields?.display_name || "").trim().toLowerCase();
                    return (name && predicate(name)) || (disp && predicate(disp));
                  });

                  if (f) {
                    foundComponent = true;
                    if (
                      f?.consider_for_esic === true ||
                      f?.payroll_fields?.consider_for_esic === true
                    ) {
                      isEsiEligible = true;
                    } else if (
                      f?.consider_for_esic === false ||
                      f?.payroll_fields?.consider_for_esic === false
                    ) {
                      isEsiEligible = false;
                    } else {
                      isEsiEligible = siteConsidered || defaultInclude;
                    }
                  }

                  // 2. Check in employee salary assignment / template components
                  if (
                    !foundComponent ||
                    (f &&
                      f.consider_for_esic === undefined &&
                      f?.payroll_fields?.consider_for_esic === undefined)
                  ) {
                    const emp = empRow?.employee || empRow;
                    const assignment = Array.isArray(emp?.employee_salary_assignment)
                      ? emp.employee_salary_assignment[0]
                      : emp?.employee_salary_assignment || emp?.salary_assignment;

                    if (assignment) {
                      const directComps = assignment?.employee_salary_components || [];
                      for (const comp of directComps) {
                        const pf = comp?.payment_fields || comp;
                        const name = (pf?.name || "").trim().toLowerCase();
                        const disp = (pf?.display_name || "").trim().toLowerCase();
                        if ((name && predicate(name)) || (disp && predicate(disp))) {
                          foundComponent = true;
                          isEsiEligible =
                            comp?.consider_for_esic === true ||
                            pf?.consider_for_esic === true ||
                            (defaultInclude &&
                              comp?.consider_for_esic !== false &&
                              pf?.consider_for_esic !== false);
                          break;
                        }
                      }

                      if (!foundComponent) {
                        const templateObj = Array.isArray(assignment?.payment_templates)
                          ? assignment.payment_templates[0]
                          : assignment?.payment_templates;
                        const versions = Array.isArray(templateObj?.payment_template_versions)
                          ? templateObj.payment_template_versions
                          : [];
                        for (const ver of versions) {
                          const tComps = ver?.payment_template_components || [];
                          for (const comp of tComps) {
                            const pf = comp?.payment_fields || comp;
                            const name = (pf?.name || "").trim().toLowerCase();
                            const disp = (pf?.display_name || "").trim().toLowerCase();
                            if ((name && predicate(name)) || (disp && predicate(disp))) {
                              foundComponent = true;
                              isEsiEligible =
                                comp?.consider_for_esic === true ||
                                pf?.consider_for_esic === true ||
                                (defaultInclude &&
                                  comp?.consider_for_esic !== false &&
                                  pf?.consider_for_esic !== false);
                              break;
                            }
                          }
                          if (foundComponent) break;
                        }
                      }
                    }
                  }

                  // 3. Check in payrollFields prop if available
                  if (!foundComponent && payrollFields && Array.isArray(payrollFields)) {
                    for (const pf of payrollFields) {
                      const name = (pf?.name || "").trim().toLowerCase();
                      const disp = (pf?.display_name || "").trim().toLowerCase();
                      if ((name && predicate(name)) || (disp && predicate(disp))) {
                        if (pf?.consider_for_esic === true) {
                          foundComponent = true;
                          isEsiEligible = true;
                          break;
                        }
                      }
                    }
                  }

                  if (!foundComponent) {
                    isEsiEligible = siteConsidered || defaultInclude;
                  }

                  if (isEsiEligible) {
                    if (colMap[colKey]) {
                      esiParts.push(`${colMap[colKey]}${rowNum}`);
                    } else {
                      esiParts.push(String(Math.round(amount)));
                    }
                  }
                };

                checkAndAddEsiPart("da", da, isDa, isDaConsideredForEsic, true);
                checkAndAddEsiPart("vda", vda, isVda, isVdaConsideredForEsic, true);
                checkAndAddEsiPart("other_allow", otherAllow, isOtherAllow, isOtherAllowConsideredForEsic, false);
                checkAndAddEsiPart("hra", hra, isHra, isHraConsideredForEsic, false);
                checkAndAddEsiPart("leave_salary", leaveSalary, isLeaveSalary, isLeaveSalaryConsideredForEsic, false);
                checkAndAddEsiPart("overtime", overtime, isOvertime, isOtConsideredForEsic, false);
                checkAndAddEsiPart("ph_wages", phWages, isPhWages, true, true);
                checkAndAddEsiPart(
                  "bonus",
                  bonus,
                  isBonus,
                  isBonusConsideredForEsic,
                  statutory?.bonus?.consider_for_esic === true,
                );

                for (const col of activeColumns) {
                  if (
                    col.key.startsWith("custom_") &&
                    col.customType === "earning"
                  ) {
                    const customVal = getCustomFieldValue(col.key);
                    if (customVal > 0) {
                      const cleanKey = col.key.substring(7);
                      const customPredicate = (n: string) =>
                        n.replace(/\s+/g, "_") === cleanKey;
                      const isCustomConsidered = fields.some((f: any) => {
                        const fname = (f.payroll_fields?.name || "").trim().toLowerCase().replace(/\s+/g, "_");
                        const fdisp = (f.payroll_fields?.display_name || "").trim().toLowerCase().replace(/\s+/g, "_");
                        return (
                          (fname === cleanKey || fdisp === cleanKey) &&
                          (f?.consider_for_esic === true || f?.payroll_fields?.consider_for_esic === true)
                        );
                      });
                      checkAndAddEsiPart(col.key, customVal, customPredicate, isCustomConsidered, false);
                    }
                  }
                }

                const esiWageBaseFormula =
                  esiParts.length > 1
                    ? `(${esiParts.join("+")})`
                    : esiParts[0] || "0";

                const esiFormula =
                  esiMaxLimit > 0
                    ? `ROUND(IF(${esiWageBaseFormula}<=${esiMaxLimit}, ${esiWageBaseFormula}*(${esiEmployeeRate}/100), 0), 0)`
                    : `ROUND(${esiWageBaseFormula}*(${esiEmployeeRate}/100), 0)`;

                return esic > 0
                  ? {
                    formula: esiFormula,
                    result: Math.round(esic),
                  }
                  : 0;
              }
              case "ptax":
                return Math.round(ptax);
              case "lwf":
                return Math.round(lwf);
              case "loan":
                return Math.round(loan);
              case "advance":
                return Math.round(advance);
              case "total_ded": {
                const totalDedParts: string[] = [];
                if (colMap["pf"])
                  totalDedParts.push(`${colMap["pf"]}${rowNum}`);
                else if (pf > 0) totalDedParts.push(String(Math.round(pf)));

                if (colMap["esic"])
                  totalDedParts.push(`${colMap["esic"]}${rowNum}`);
                else if (esic > 0) totalDedParts.push(String(Math.round(esic)));

                if (colMap["ptax"])
                  totalDedParts.push(`${colMap["ptax"]}${rowNum}`);
                else if (ptax > 0) totalDedParts.push(String(Math.round(ptax)));

                if (colMap["lwf"])
                  totalDedParts.push(`${colMap["lwf"]}${rowNum}`);
                else if (lwf > 0) totalDedParts.push(String(Math.round(lwf)));

                if (colMap["loan"])
                  totalDedParts.push(`${colMap["loan"]}${rowNum}`);
                else if (loan > 0) totalDedParts.push(String(Math.round(loan)));

                if (colMap["advance"])
                  totalDedParts.push(`${colMap["advance"]}${rowNum}`);
                else if (advance > 0)
                  totalDedParts.push(String(Math.round(advance)));

                for (const col of activeColumns) {
                  if (
                    col.key.startsWith("custom_") &&
                    col.customType === "deduction"
                  ) {
                    const val = getCustomFieldValue(col.key);
                    if (colMap[col.key]) {
                      totalDedParts.push(`${colMap[col.key]}${rowNum}`);
                    } else if (val > 0) {
                      totalDedParts.push(String(Math.round(val)));
                    }
                  }
                }

                const formulaStr =
                  totalDedParts.length > 0
                    ? `SUM(${totalDedParts.join(",")})`
                    : "0";
                return {
                  formula: formulaStr,
                  result: Math.round(totalDed),
                };
              }
              case "net_pay": {
                const wagesCell = colMap["actual_wages"]
                  ? `${colMap["actual_wages"]}${rowNum}`
                  : String(Math.round(actualWages));
                const totalDedCell = colMap["total_ded"]
                  ? `${colMap["total_ded"]}${rowNum}`
                  : String(Math.round(totalDed));

                const parts = [wagesCell];

                if (!isBonusBeforeActualWages && bonus > 0) {
                  if (colMap["bonus"]) {
                    parts.push(`${colMap["bonus"]}${rowNum}`);
                  } else {
                    parts.push(String(Math.round(bonus)));
                  }
                }

                for (const col of activeColumns) {
                  if (
                    col.key.startsWith("custom_") &&
                    col.customType === "earning"
                  ) {
                    const colIdx = activeColumns.findIndex((c) => c.key === col.key);
                    if (actualWagesIdx !== -1 && colIdx > actualWagesIdx) {
                      const val = getCustomFieldValue(col.key);
                      if (val > 0) {
                        if (colMap[col.key]) {
                          parts.push(`${colMap[col.key]}${rowNum}`);
                        } else {
                          parts.push(String(Math.round(val)));
                        }
                      }
                    }
                  }
                }

                const formulaStr = `${parts.join("+")}-${totalDedCell}`;
                return {
                  formula: formulaStr,
                  result: Math.round(netPay),
                };
              }
              case "per_day_ctc":
                return {
                  formula: `ROUND(${ctcPmRef}/${workingDays}, 0)`,
                  result: Math.round(perDayCtc),
                };
              case "ctc_pm":
                return Math.round(ctcPm);
              default:
                if (key.startsWith("custom_")) {
                  return getCustomFieldValue(key);
                }
                return "";
            }
          };

          const rowData = activeColumns.map((col) => getRowValue(col.key));
          const row = sheet.addRow(rowData);

          const leftAlignKeys = [
            "sr_no",
            "emp_code",
            "site_name",
            "esic_no",
            "uan_no",
            "emp_name",
          ];
          for (let colIdx = 1; colIdx <= activeColumns.length; colIdx++) {
            const cell = row.getCell(colIdx);
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
            const colKey = activeColumns[colIdx - 1]?.key;
            if (colKey && leftAlignKeys.includes(colKey)) {
              cell.alignment = { horizontal: "left" };
            } else {
              cell.alignment = { horizontal: "right" };
            }
          }

          currentRowNum++;
        }

        const lastRowIndex = currentRowNum - 1;

        const getTotalValueForKey = (key: string, colLetter: string) => {
          switch (key) {
            case "sr_no":
            case "emp_code":
            case "site_name":
            case "esic_no":
            case "uan_no":
              return "";
            case "emp_name":
              return "Total";
            case "ot_hours":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalOtHours),
              };
            case "days_present":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: totalDaysPresent,
              };
            case "ph_days":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: totalPhDays,
              };
            case "ph_wages":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalPhWages),
              };
            case "basic":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalBasic),
              };
            case "da":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalDa),
              };
            case "vda":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalVda),
              };
            case "other_allow":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalOtherAllowances),
              };
            case "hra":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalHra),
              };
            case "leave_salary":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalLeaveSalary),
              };
            case "overtime":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalOvertime),
              };
            case "bonus":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalBonus),
              };
            case "actual_wages":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalActualWages),
              };
            case "pf":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalPf),
              };
            case "esic":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalEsic),
              };
            case "ptax":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalPtax),
              };
            case "lwf":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalLwf),
              };
            case "loan":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalLoan),
              };
            case "advance":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalAdvance),
              };
            case "total_ded":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalTotalDed),
              };
            case "net_pay":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalNetPay),
              };
            case "per_day_ctc": {
              const ctcPmCol = colMap["ctc_pm"];
              const siteYear = payrollData?.year || new Date().getFullYear();
              const siteMonth = payrollData?.month || 1;
              const siteWorkingDays =
                siteData[0]?.working_days ??
                new Date(siteYear, siteMonth, 0).getDate();
              const ctcPmTotalRef = ctcPmCol
                ? `${ctcPmCol}${lastRowIndex + 1}`
                : String(Math.round(totalCtcPm));
              return {
                formula: ctcPmCol
                  ? `ROUND(${ctcPmTotalRef}/${siteWorkingDays}, 0)`
                  : `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result:
                  siteWorkingDays > 0
                    ? Math.round(totalCtcPm / siteWorkingDays)
                    : 0,
              };
            }
            case "ctc_pm":
              return {
                formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                result: Math.round(totalCtcPm),
              };
            default:
              if (key.startsWith("custom_")) {
                let customSum = 0;
                for (const empRow of siteData) {
                  const fields =
                    empRow.salary_entries?.salary_field_values || [];
                  const cleanKey = key.substring(7);
                  const found = fields.find((f: any) => {
                    const fname = (f.payroll_fields?.name || "")
                      .trim()
                      .toLowerCase()
                      .replace(/\s+/g, "_");
                    return fname === cleanKey;
                  });
                  customSum += found ? Number(found.amount || 0) : 0;
                }
                return {
                  formula: `SUM(${colLetter}6:${colLetter}${lastRowIndex})`,
                  result: Math.round(customSum),
                };
              }
              return "";
          }
        };

        const totalRowData = activeColumns.map((col) => {
          const colLetter = colMap[col.key];
          return getTotalValueForKey(col.key, colLetter);
        });

        const totalRow = sheet.addRow(totalRowData);

        const totalLabelIndex = activeColumns.findIndex(
          (col) => col.key === "emp_name",
        );
        const totalLabelColNum =
          totalLabelIndex !== -1 ? totalLabelIndex + 1 : 5;

        totalRow.eachCell((cell, colNumber) => {
          cell.font = { bold: true };
          if (colNumber >= totalLabelColNum) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFF00" },
            };
          }
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          const colKey = activeColumns[colNumber - 1]?.key;
          if (
            colKey &&
            ["sr_no", "emp_code", "esic_no", "uan_no", "emp_name"].includes(
              colKey,
            )
          ) {
            if (colKey === "emp_name") {
              cell.alignment = { horizontal: "left" };
            }
          } else {
            cell.alignment = { horizontal: "right" };
          }
        });

        sheet.addRow([]);
        const totalRowNumber = lastRowIndex + 1;
        let currentSummaryRow = totalRowNumber + 2;

        let rowEsicNotApp = 0;
        let rowPhWages = 0;
        let rowBasic = 0;
        let rowDa = 0;
        let rowVda = 0;
        let rowOther = 0;
        let rowHra = 0;
        let rowLeaveSalary = 0;
        let rowOvertime = 0;
        let rowBonus = 0;
        let rowPfEmp = 0;
        let rowEsicEmp = 0;
        let rowService = 0;
        let rowCtc = 0;
        let rowGst = 0;
        let rowBill = 0;

        const rowCustomMap: Record<string, number> = {};

        const isSummaryRowEnabled = (key: string) => {
          return summaryRows.find((r) => r.key === key)?.enabled !== false;
        };

        if (colMap["esic"] && isSummaryRowEnabled("esic_not_app")) {
          rowEsicNotApp = currentSummaryRow++;
        }

        const startSumRow = currentSummaryRow;

        if (colMap["ph_wages"] && isSummaryRowEnabled("ph_wages"))
          rowPhWages = currentSummaryRow++;
        if (colMap["basic"] && isSummaryRowEnabled("basic"))
          rowBasic = currentSummaryRow++;
        if (colMap["da"] && isSummaryRowEnabled("da"))
          rowDa = currentSummaryRow++;
        if (colMap["vda"] && isSummaryRowEnabled("vda"))
          rowVda = currentSummaryRow++;
        if (colMap["other_allow"] && isSummaryRowEnabled("other_allow"))
          rowOther = currentSummaryRow++;
        if (colMap["hra"] && isSummaryRowEnabled("hra"))
          rowHra = currentSummaryRow++;
        if (colMap["leave_salary"] && isSummaryRowEnabled("leave_salary"))
          rowLeaveSalary = currentSummaryRow++;
        if (colMap["overtime"] && isSummaryRowEnabled("overtime"))
          rowOvertime = currentSummaryRow++;
        if (colMap["bonus"] && isSummaryRowEnabled("bonus"))
          rowBonus = currentSummaryRow++;

        for (const col of activeColumns) {
          if (
            col.key.startsWith("custom_") &&
            col.customType === "earning"
          ) {
            if (isSummaryRowEnabled(col.key)) {
              rowCustomMap[col.key] = currentSummaryRow++;
            }
          }
        }

        if (colMap["pf"] && isSummaryRowEnabled("pf_employer"))
          rowPfEmp = currentSummaryRow++;
        if (colMap["esic"] && isSummaryRowEnabled("esic_employer"))
          rowEsicEmp = currentSummaryRow++;

        if (isSummaryRowEnabled("service_charge")) {
          rowService = currentSummaryRow++;
        }
        const endSumRow = currentSummaryRow - 1;

        if (isSummaryRowEnabled("ctc_total")) rowCtc = currentSummaryRow++;
        if (isSummaryRowEnabled("gst")) rowGst = currentSummaryRow++;
        if (isSummaryRowEnabled("total_bill")) rowBill = currentSummaryRow++;

        const esicCol = colMap["esic"];
        const wagesCol = colMap["actual_wages"];
        const esicNotAppValue =
          esicCol && wagesCol
            ? {
              formula: `SUMIF(${esicCol}6:${esicCol}${lastRowIndex}, 0, ${wagesCol}6:${wagesCol}${lastRowIndex})`,
              result: Math.round(totalEsicNotApplicableWages),
            }
            : Math.round(totalEsicNotApplicableWages);

        const phWagesCol = colMap["ph_wages"];
        const phWagesValue = phWagesCol
          ? {
            formula: `${phWagesCol}${totalRowNumber}`,
            result: Math.round(totalPhWages),
          }
          : Math.round(totalPhWages);

        const basicCol = colMap["basic"];
        const basicValue = basicCol
          ? {
            formula: `${basicCol}${totalRowNumber}`,
            result: Math.round(totalBasic),
          }
          : Math.round(totalBasic);

        const daCol = colMap["da"];
        const daValue = daCol
          ? {
            formula: `${daCol}${totalRowNumber}`,
            result: Math.round(totalDa),
          }
          : Math.round(totalDa);

        const vdaCol = colMap["vda"];
        const vdaValue = vdaCol
          ? {
            formula: `${vdaCol}${totalRowNumber}`,
            result: Math.round(totalVda),
          }
          : Math.round(totalVda);

        const otherAllowCol = colMap["other_allow"];
        const activeCustomEarningCols = activeColumns.filter((col) => {
          if (!col.key.startsWith("custom_") || col.customType !== "earning" || !colMap[col.key])
            return false;
          const colIdx = activeColumns.findIndex((c) => c.key === col.key);
          return actualWagesIdx === -1 || colIdx < actualWagesIdx;
        });


        const unhandledCustomEarningCols = activeCustomEarningCols.filter(
          (col) => !isSummaryRowEnabled(col.key),
        );

        let totalCustomEarnings = 0;
        for (const col of unhandledCustomEarningCols) {
          for (const empRow of siteData) {
            const fields = empRow.salary_entries?.salary_field_values || [];
            const cleanKey = col.key.substring(7);
            const found = fields.find((f: any) => {
              const fname = (f.payroll_fields?.name || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_");
              return fname === cleanKey;
            });
            totalCustomEarnings += found ? Number(found.amount || 0) : 0;
          }
        }

        let totalPostWageCustomEarnings = 0;
        for (const col of activeColumns) {
          if (
            col.key.startsWith("custom_") &&
            col.customType === "earning"
          ) {
            const colIdx = activeColumns.findIndex((c) => c.key === col.key);
            if (actualWagesIdx !== -1 && colIdx > actualWagesIdx) {
              for (const empRow of siteData) {
                const fields = empRow.salary_entries?.salary_field_values || [];
                const cleanKey = col.key.substring(7);
                const found = fields.find((f: any) => {
                  const fname = (f.payroll_fields?.name || "")
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, "_");
                  return fname === cleanKey;
                });
                totalPostWageCustomEarnings += found ? Number(found.amount || 0) : 0;
              }
            }
          }
        }

        let otherAllowValue: any = Math.round(
          totalOtherAllowances + totalCustomEarnings,
        );
        if (otherAllowCol) {
          let formulaStr = `${otherAllowCol}${totalRowNumber}`;
          let resultVal = totalOtherAllowances;

          if (phWagesCol && rowPhWages === 0 && !isSummaryRowEnabled("ph_wages")) {
            formulaStr += `+${phWagesCol}${totalRowNumber}`;
            resultVal += totalPhWages;
          }

          for (const col of unhandledCustomEarningCols) {
            formulaStr += `+${colMap[col.key]}${totalRowNumber}`;
          }
          resultVal += totalCustomEarnings;

          otherAllowValue = {
            formula: formulaStr,
            result: Math.round(resultVal),
          };
        } else {
          const formulaParts: string[] = [];
          let resultVal = 0;

          if (phWagesCol && rowPhWages === 0 && !isSummaryRowEnabled("ph_wages")) {
            formulaParts.push(`${phWagesCol}${totalRowNumber}`);
            resultVal += totalPhWages;
          }

          for (const col of unhandledCustomEarningCols) {
            formulaParts.push(`${colMap[col.key]}${totalRowNumber}`);
          }
          resultVal += totalCustomEarnings;

          if (formulaParts.length > 0) {
            otherAllowValue = {
              formula: formulaParts.join("+"),
              result: Math.round(resultVal),
            };
          }
        }

        const hraCol = colMap["hra"];
        const hraValue = hraCol
          ? {
            formula: `${hraCol}${totalRowNumber}`,
            result: Math.round(totalHra),
          }
          : Math.round(totalHra);

        const leaveSalaryCol = colMap["leave_salary"];
        const leaveSalaryValue = leaveSalaryCol
          ? {
            formula: `${leaveSalaryCol}${totalRowNumber}`,
            result: Math.round(totalLeaveSalary),
          }
          : Math.round(totalLeaveSalary);

        const overtimeCol = colMap["overtime"];
        const overtimeValue = overtimeCol
          ? {
            formula: `${overtimeCol}${totalRowNumber}`,
            result: Math.round(totalOvertime),
          }
          : Math.round(totalOvertime);

        const bonusCol = colMap["bonus"];
        const bonusValue = bonusCol
          ? {
            formula: `${bonusCol}${totalRowNumber}`,
            result: Math.round(totalBonus),
          }
          : Math.round(totalBonus);

        const pfCol = colMap["pf"];
        const pfValue = pfCol
          ? {
            formula: `ROUND(${pfCol}${totalRowNumber}/${pfEmployeeRate}*${pfEmployerRate}, 0)`,
            result: Math.round(totalEmployerPf),
          }
          : Math.round(totalEmployerPf);

        const esicColObj = colMap["esic"];
        const esicValue = esicColObj
          ? {
            formula: `ROUND(${esicColObj}${totalRowNumber}/${esiEmployeeRate}*${esiEmployerRate}, 0)`,
            result: Math.round(totalEmployerEsic),
          }
          : Math.round(totalEmployerEsic);

        const getLabel = (key: string, defaultLabel: string) => {
          return summaryRows.find((r) => r.key === key)?.label || defaultLabel;
        };

        const summaryData: [string, any][] = [];

        if (rowEsicNotApp > 0) {
          summaryData.push([
            getLabel("esic_not_app", "Esic not applicable"),
            esicNotAppValue,
          ]);
        }
        if (rowPhWages > 0) {
          summaryData.push([getLabel("ph_wages", "PH Wages"), phWagesValue]);
        }
        if (rowBasic > 0) {
          summaryData.push([getLabel("basic", "Basic"), basicValue]);
        }
        if (rowDa > 0) {
          summaryData.push([getLabel("da", "DA"), daValue]);
        }
        if (rowVda > 0) {
          summaryData.push([getLabel("vda", "VDA"), vdaValue]);
        }
        if (rowOther > 0) {
          summaryData.push([
            getLabel("other_allow", "Other Allw."),
            otherAllowValue,
          ]);
        }
        if (rowHra > 0) {
          summaryData.push([getLabel("hra", "HRA"), hraValue]);
        }
        if (rowLeaveSalary > 0) {
          summaryData.push([
            getLabel("leave_salary", "Leave Salary"),
            leaveSalaryValue,
          ]);
        }
        if (rowOvertime > 0) {
          summaryData.push([getLabel("overtime", "OT Amount"), overtimeValue]);
        }
        if (rowBonus > 0) {
          summaryData.push([
            getLabel("bonus", `Bonus ${bonusRate}%`),
            bonusValue,
          ]);
        }

        for (const col of activeColumns) {
          if (
            col.key.startsWith("custom_") &&
            col.customType === "earning"
          ) {
            const rowNum = rowCustomMap[col.key];
            if (rowNum && rowNum > 0) {
              const colLetter = colMap[col.key];
              let customSum = 0;
              for (const empRow of siteData) {
                const fields = empRow.salary_entries?.salary_field_values || [];
                const cleanKey = col.key.substring(7);
                const found = fields.find((f: any) => {
                  const fname = (f.payroll_fields?.name || "")
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, "_");
                  return fname === cleanKey;
                });
                customSum += found ? Number(found.amount || 0) : 0;
              }
              const customVal = colLetter
                ? {
                  formula: `${colLetter}${totalRowNumber}`,
                  result: Math.round(customSum),
                }
                : Math.round(customSum);
              summaryData.push([
                getLabel(col.key, col.defaultHeader),
                customVal,
              ]);
            }
          }
        }

        if (rowPfEmp > 0) {
          summaryData.push([
            getLabel("pf_employer", `P.F. Employer @ ${pfEmployerRate}%`),
            pfValue,
          ]);
        }
        if (rowEsicEmp > 0) {
          summaryData.push([
            getLabel("esic_employer", `ESIC Employer @ ${esiEmployerRate}%`),
            esicValue,
          ]);
        }

        let scFormulaBase = "";
        const selectedScKeys =
          siteServiceChargeOn[siteName] ??
          getInitialServiceChargeKeys(serviceChargesOn, activeColumns);

        const scCells: string[] = [];

        if (selectedScKeys.includes("ph_wages")) {
          if (rowPhWages > 0) scCells.push(`G${rowPhWages}`);
          else if (totalPhWages > 0) scCells.push(String(Math.round(totalPhWages)));
        }
        if (selectedScKeys.includes("basic")) {
          if (rowBasic > 0) scCells.push(`G${rowBasic}`);
          else if (totalBasic > 0) scCells.push(String(Math.round(totalBasic)));
        }
        if (selectedScKeys.includes("da")) {
          if (rowDa > 0) scCells.push(`G${rowDa}`);
          else if (totalDa > 0) scCells.push(String(Math.round(totalDa)));
        }
        if (selectedScKeys.includes("vda")) {
          if (rowVda > 0) scCells.push(`G${rowVda}`);
          else if (totalVda > 0) scCells.push(String(Math.round(totalVda)));
        }
        if (selectedScKeys.includes("other_allow")) {
          if (rowOther > 0) scCells.push(`G${rowOther}`);
          else if (totalOtherAllowances > 0)
            scCells.push(String(Math.round(totalOtherAllowances)));
        }
        if (selectedScKeys.includes("hra")) {
          if (rowHra > 0) scCells.push(`G${rowHra}`);
          else if (totalHra > 0) scCells.push(String(Math.round(totalHra)));
        }
        if (selectedScKeys.includes("leave_salary")) {
          if (rowLeaveSalary > 0) scCells.push(`G${rowLeaveSalary}`);
          else if (totalLeaveSalary > 0)
            scCells.push(String(Math.round(totalLeaveSalary)));
        }
        if (selectedScKeys.includes("overtime")) {
          if (rowOvertime > 0) scCells.push(`G${rowOvertime}`);
          else if (totalOvertime > 0)
            scCells.push(String(Math.round(totalOvertime)));
        }
        if (selectedScKeys.includes("bonus")) {
          if (rowBonus > 0) scCells.push(`G${rowBonus}`);
          else if (totalBonus > 0)
            scCells.push(String(Math.round(totalBonus)));
        }

        for (const col of activeColumns) {
          if (
            col.key.startsWith("custom_") &&
            col.customType === "earning"
          ) {
            if (selectedScKeys.includes(col.key)) {
              const rNum = rowCustomMap[col.key];
              if (rNum && rNum > 0) {
                scCells.push(`G${rNum}`);
              }
            }
          }
        }

        scFormulaBase = scCells.length > 0 ? `(${scCells.join("+")})` : "0";

        const calculatedCtcTotal =
          totalActualWages +
          (isBonusBeforeActualWages ? 0 : totalBonus) +
          totalPostWageCustomEarnings +
          totalEmployerPf +
          totalEmployerEsic +
          (totalServiceChargeBase * serviceChargeRate) / 100;

        if (rowService > 0) {
          summaryData.push([
            `Service Charge @ ${serviceChargeRate}%`,
            {
              formula: `ROUND(${scFormulaBase}*${serviceChargeRate}/100, 0)`,
              result: Math.round(
                (totalServiceChargeBase * serviceChargeRate) / 100,
              ),
            },
          ]);
        }

        if (rowCtc > 0) {
          summaryData.push([
            "C.T.C. Total",
            {
              formula: `SUM(G${startSumRow}:G${endSumRow})`,
              result: Math.round(calculatedCtcTotal),
            },
          ]);
        }

        if (rowGst > 0) {
          const gstFormula =
            rowCtc > 0
              ? `ROUND(G${rowCtc}*0.18, 0)`
              : String(Math.round(calculatedCtcTotal * 0.18));
          summaryData.push([
            `G.S.T. @ 18.00 %`,
            {
              formula: gstFormula,
              result: Math.round(calculatedCtcTotal * 0.18),
            },
          ]);
        }

        if (rowBill > 0) {
          const billFormula =
            rowCtc > 0 && rowGst > 0
              ? `G${rowCtc}+G${rowGst}`
              : rowCtc > 0
                ? `G${rowCtc}+${Math.round(calculatedCtcTotal * 0.18)}`
                : rowGst > 0
                  ? `${Math.round(calculatedCtcTotal)}+G${rowGst}`
                  : String(Math.round(calculatedCtcTotal * 1.18));
          summaryData.push([
            "Total Bill Amount",
            {
              formula: billFormula,
              result: Math.round(calculatedCtcTotal * 1.18),
            },
          ]);
        }

        for (const sd of summaryData) {
          const sRow = sheet.addRow(["", "", "", "", "", sd[0], sd[1]]);
          const labelCell = sRow.getCell(6);
          const valCell = sRow.getCell(7);

          labelCell.font = { bold: true };
          labelCell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
          };

          valCell.border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          valCell.alignment = { horizontal: "right" };
        }
      }
    }

    // Pre-fetch all invoice company_locations if not yet populated
    if (supabase) {
      const allInvsToCheck = [...salaryInvoices, ...reimbursementInvoices];
      for (const row of data) {
        if (row.salary_entries?.invoice) allInvsToCheck.push(row.salary_entries.invoice);
      }
      const neededAddressIds = Array.from(
        new Set(
          allInvsToCheck
            .map((inv) => inv?.company_address_id)
            .filter(Boolean) as string[],
        ),
      );
      if (neededAddressIds.length > 0) {
        const { data: locList } = await supabase
          .from("company_locations")
          .select("*")
          .in("id", neededAddressIds);
        if (locList && locList.length > 0) {
          const locMap = new Map<string, any>(locList.map((l: any) => [l.id, l]));
          for (const inv of allInvsToCheck) {
            if (inv && inv.company_address_id) {
              inv.company_locations =
                locMap.get(inv.company_address_id) || inv.company_locations;
            }
          }
        }
      }
    }

    // --- Tax Invoice (BILL) Sheets Generation ---
    const generatedSalaryInvoiceIds = new Set<string>();

    const getInvoiceSheetTitle = (
      prefix: "BILL" | "CONV.",
      invoiceObj: any,
      fallbackName: string,
      targetData: typeof data,
    ) => {
      const invoiceEmployees = targetData.filter((row) => {
        const invId =
          row.salary_entries?.invoice_id || row.salary_entries?.invoice?.id;
        return (
          invId === invoiceObj?.id ||
          (invoiceObj?.invoice_number &&
            row.salary_entries?.invoice?.invoice_number ===
              invoiceObj.invoice_number)
        );
      });

      const effectiveRows =
        invoiceEmployees.length > 0 ? invoiceEmployees : targetData;

      const projectNames = Array.from(
        new Set(
          effectiveRows
            .map((row) => {
              const emp = row?.employee || row;
              const wd = emp?.work_details;
              const wdObj = Array.isArray(wd) ? wd[0] : wd;
              return (
                wdObj?.project?.name ||
                wdObj?.projects?.name ||
                wdObj?.site?.projects?.name ||
                wdObj?.site?.project?.name ||
                emp?.work_details?.project?.name ||
                emp?.work_details?.projects?.name ||
                row?.project?.name ||
                row?.projects?.name ||
                ""
              ).trim();
            })
            .filter(Boolean),
        ),
      );

      const siteNames = Array.from(
        new Set(
          effectiveRows
            .map((row) => {
              const emp = row?.employee || row;
              const wd = emp?.work_details;
              const wdObj = Array.isArray(wd) ? wd[0] : wd;
              return (
                wdObj?.site?.name ||
                wdObj?.sites?.name ||
                emp?.work_details?.site?.name ||
                emp?.work_details?.sites?.name ||
                row?.site?.name ||
                row?.sites?.name ||
                ""
              ).trim();
            })
            .filter(Boolean),
        ),
      );

      let chosenName = "";
      if (siteNames.length > 1 && projectNames.length === 1) {
        // Multi-site invoice for a single project (e.g. Project "New Delhi" having Rajasthan, New Delhi, UP/Haryana sites)
        chosenName = projectNames[0];
      } else if (siteNames.length === 1) {
        // Single site invoice/sheet (e.g. "Karnataka" or "Tuticorin")
        chosenName = siteNames[0];
      } else if (projectNames.length === 1) {
        chosenName = projectNames[0];
      } else if (projectNames.length > 1) {
        chosenName = projectNames.join(", ");
      } else if (siteNames.length > 1) {
        chosenName = siteNames.join(", ");
      } else {
        chosenName = fallbackName;
      }

      return `${prefix} - ${chosenName}`;
    };

    if (exportMode === "combined") {
      if (siteIncludeInvoice["All Sites"]) {
        const primaryInvoice = findSalaryInvoice(data, "All Sites");
        if (primaryInvoice) {
          const primarySiteObj = data[0]?.employee?.work_details?.site;
          const invoiceSheetTitle = getInvoiceSheetTitle(
            "BILL",
            primaryInvoice,
            "Salary Register",
            data,
          );
          generateSalaryInvoiceSheet(
            workbook,
            invoiceSheetTitle,
            primaryInvoice,
            primarySiteObj,
            companyLocation,
            companyData,
          );
        }
      }
    } else {
      for (const [siteName, siteData] of Object.entries(groupedData)) {
        if (siteName === "All Sites") continue;

        if (siteIncludeInvoice[siteName]) {
          const siteInvoice = findSalaryInvoice(siteData, siteName);
          if (siteInvoice) {
            const invKey = siteInvoice.id || siteInvoice.invoice_number;
            if (!generatedSalaryInvoiceIds.has(invKey)) {
              generatedSalaryInvoiceIds.add(invKey);
              const siteObj = siteData[0]?.employee?.work_details?.site;
              const invoiceSheetTitle = getInvoiceSheetTitle(
                "BILL",
                siteInvoice,
                siteName,
                data,
              );
              generateSalaryInvoiceSheet(
                workbook,
                invoiceSheetTitle,
                siteInvoice,
                siteObj,
                companyLocation,
                companyData,
              );
            }
          }
        }
      }
    }

    // --- Conveyance (Reimbursement) Sheets Generation ---
    const localMonthName = getMonthNameFromNumber(payrollData?.month ?? 0);
    const localYear = payrollData?.year || "";

    if (
      includeConvList ||
      Object.values(siteIncludeReimbInvoice).some(Boolean)
    ) {
      if (convExportMode === "combined") {
        // 1. Single Combined Conveyance List Sheet
        if (includeConvList && reimbursementEntries.length > 0) {
          const sortedCombinedData =
            exportMode === "combined" && groupedData["All Sites"]
              ? groupedData["All Sites"]
              : [...data].sort((a, b) => {
                  const siteA =
                    a?.employee?.work_details?.site?.name || "Salary Register";
                  const siteB =
                    b?.employee?.work_details?.site?.name || "Salary Register";
                  return siteA.localeCompare(siteB);
                });

          const projectNames = Array.from(
            new Set(
              sortedCombinedData
                .map((row) => {
                  const emp = row?.employee || row;
                  const wd = emp?.work_details;
                  const wdObj = Array.isArray(wd) ? wd[0] : wd;
                  return (
                    wdObj?.project?.name ||
                    wdObj?.projects?.name ||
                    wdObj?.site?.projects?.name ||
                    wdObj?.site?.project?.name ||
                    emp?.work_details?.project?.name ||
                    emp?.work_details?.projects?.name ||
                    row?.project?.name ||
                    row?.projects?.name ||
                    ""
                  ).trim();
                })
                .filter(Boolean),
            ),
          );
          const distinctSiteNames = Array.from(
            new Set(
              sortedCombinedData
                .map((row) => {
                  const emp = row?.employee || row;
                  const wd = emp?.work_details;
                  const wdObj = Array.isArray(wd) ? wd[0] : wd;
                  return (
                    wdObj?.site?.name ||
                    wdObj?.sites?.name ||
                    emp?.work_details?.site?.name ||
                    emp?.work_details?.sites?.name ||
                    row?.site?.name ||
                    row?.sites?.name ||
                    ""
                  ).trim();
                })
                .filter(Boolean),
            ),
          );
          let combListTitle = "EMP. Conv. List - Salary Register";
          if (distinctSiteNames.length > 1 && projectNames.length === 1) {
            combListTitle = `EMP. Conv. List - ${projectNames[0]}`;
          } else if (distinctSiteNames.length === 1) {
            combListTitle = `EMP. Conv. List - ${distinctSiteNames[0]}`;
          } else if (projectNames.length === 1) {
            combListTitle = `EMP. Conv. List - ${projectNames[0]}`;
          }

          generateConvListSheet(
            workbook,
            combListTitle,
            `All Sites ${localMonthName}-${localYear}`,
            sortedCombinedData,
            reimbursementEntries,
          );
        }

        // 2. Single Combined Conveyance Tax Invoice Sheet
        const shouldIncludeCombinedReimbInv =
          siteIncludeReimbInvoice["All Sites"] ??
          Object.values(siteIncludeReimbInvoice).some(Boolean);

        if (shouldIncludeCombinedReimbInv && reimbursementInvoices.length > 0) {
          const distinctInvoiceIds = Array.from(
            new Set(
              reimbursementEntries
                .map((r) => r.invoice_id)
                .filter(Boolean) as string[],
            ),
          );
          const activeInvoices = distinctInvoiceIds
            .map((id) => reimbursementInvoices.find((inv) => inv.id === id))
            .filter(Boolean);

          const invoicesToGenerate = activeInvoices;

          for (const reimbInvoice of invoicesToGenerate) {
            const invoiceSheetName = getInvoiceSheetTitle(
              "CONV.",
              reimbInvoice,
              invoicesToGenerate.length === 1
                ? "Salary Register"
                : reimbInvoice.invoice_number || "Invoice",
              data,
            );

            const primarySiteObj = data[0]?.employee?.work_details?.site;
            generateConvInvoiceSheet(
              workbook,
              invoiceSheetName,
              reimbInvoice,
              primarySiteObj,
              companyLocation,
              companyData,
            );
          }
        }
      } else {
        // Site-wise Conveyance Sheets
        for (const [siteName, siteData] of Object.entries(groupedData)) {
          if (siteName === "All Sites") continue;

          const siteEmployeeIds = new Set(
            siteData.map((row) => row.employee_id),
          );
          const siteReimbursements = reimbursementEntries.filter((r) =>
            siteEmployeeIds.has(r.employee_id),
          );

          if (siteReimbursements.length > 0) {
            if (includeConvList) {
              generateConvListSheet(
                workbook,
                `EMP. Conv. List - ${siteName}`,
                `${siteName} ${localMonthName}-${localYear}`,
                siteData,
                siteReimbursements,
              );
            }

            const shouldIncludeSiteReimbInv =
              siteIncludeReimbInvoice[siteName] ??
              (exportMode === "combined"
                ? siteIncludeReimbInvoice["All Sites"]
                : false);

            if (shouldIncludeSiteReimbInv) {
              const reimbInvoiceId = siteReimbursements.find(
                (r) => r.invoice_id,
              )?.invoice_id;
              const reimbInvoice = reimbInvoiceId
                ? reimbursementInvoices.find(
                    (inv) => inv.id === reimbInvoiceId,
                  )
                : null;

              if (reimbInvoice) {
                const siteObj = siteData[0]?.employee?.work_details?.site;
                const reimbInvSheetTitle = getInvoiceSheetTitle(
                  "CONV.",
                  reimbInvoice,
                  siteName,
                  data,
                );
                generateConvInvoiceSheet(
                  workbook,
                  reimbInvSheetTitle,
                  reimbInvoice,
                  siteObj,
                  companyLocation,
                  companyData,
                );
              }
            }
          }
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const filename = `Salary_Register_${payrollData?.month || "month"
      }_${payrollData?.year || "year"}_${formatDateTime(Date.now())}.xlsx`;
    saveAs(blob, filename);
  };

  const getDatesInMonth = (year: number, month: number) => {
    const dates: string[] = [];
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= lastDay; day++) {
      dates.push(`${year}-${pad(month)}-${pad(day)}`);
    }
    return dates;
  };

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthIndex = parseInt(month, 10) - 1;
    const monthName =
      monthIndex >= 0 && monthIndex < 12 ? monthNames[monthIndex] : month;
    return `${day} ${monthName} ${year}`;
  };

  const datesOptions = getDatesInMonth(
    payrollData?.year || 2026,
    payrollData?.month || 5,
  );

  const activeColumns = siteColumns[activeSiteTab] || DEFAULT_COLUMNS;
  const activeSummaryRows =
    siteSummaryRows[activeSiteTab] || DEFAULT_SUMMARY_ROWS;
  const sitesList = Object.keys(siteColumns).filter(
    (site) => site !== "All Sites",
  );

  return (
    <div
      className={cn(
        "z-40 fixed bottom-32 md:bottom-24 left-0 right-0 mx-auto h-14 w-max shadow-md rounded-full flex gap-10 justify-between items-center p-2 text-sm border dark:border-muted-foreground/30 bg-card text-card-foreground",
        className,
      )}
    >
      {onCancel && (
        <Button
          variant="ghost"
          onClick={onCancel}
          className="h-full bg-muted rounded-full text-muted-foreground hover:bg-muted hover:text-muted-foreground"
        >
          Cancel
        </Button>
      )}
      <div className="ml-2 flex items-center space-x-1 rounded-md">
        <p className="font-semibold">{rows} Employee Selected</p>
      </div>
      <div className="h-full tracking-wide font-medium rounded-full hidden md:flex justify-between items-center px-6 border dark:border-muted-foreground/30 ">
        Net Amount: <span className="ml-1.5">{totalNet}</span>
      </div>
      <div className="h-full flex justify-center items-center gap-4">
        <Button
          onClick={handleOpenExportDialog}
          variant="outline"
          size="lg"
          className="h-full rounded-full border-primary text-primary hover:bg-primary/10"
        >
          Export
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="flex-none p-6 pb-4 border-b border-border bg-muted/10">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Icon name="table" size="sm" className="text-primary" />
              Customize Export Columns
            </DialogTitle>
            <DialogDescription>
              Select columns to include in the Excel sheet and drag or use
              buttons to define their order.
            </DialogDescription>
          </DialogHeader>

          {/* Export Mode Selector */}
          <div className="flex-none px-6 py-3 border-b border-border bg-muted/5 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Export Mode
            </span>
            <div className="flex border border-input rounded-full p-0.5 bg-background shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setExportMode("site-wise");
                  setConvExportMode("site-wise");
                  const rawSites = Array.from(
                    new Set(
                      data.map(
                        (empRow) =>
                          empRow?.employee?.work_details?.site?.name ||
                          "Salary Register",
                      ),
                    ),
                  );
                  if (rawSites.length === 0) rawSites.push("Salary Register");
                  setActiveSiteTab(rawSites[0]);
                }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-150",
                  exportMode === "site-wise"
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Site-wise Sheets (Default)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMode("combined");
                  setConvExportMode("combined");
                  setActiveSiteTab("All Sites");
                }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-150",
                  exportMode === "combined"
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Single Combined Sheet
              </button>
            </div>
          </div>

          {/* Site selector tabs */}
          {exportMode === "site-wise" && sitesList.length > 1 && (
            <div className="flex-none px-6 py-3 bg-muted/20 border-b border-border overflow-x-auto flex gap-1.5 scrollbar-none">
              {sitesList.map((site) => (
                <button
                  key={site}
                  type="button"
                  onClick={() => setActiveSiteTab(site)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150",
                    activeSiteTab === site
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {site}
                </button>
              ))}
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex-none flex justify-between items-center px-6 py-2 border-b border-border bg-muted/5 text-xs">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear All
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset to Default
            </Button>
          </div>

          {/* Columns List - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 max-h-[55vh]">
            {/* Invoice Sheet Option */}
            <div className="pb-4 border-b border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Icon name="table" size="xs" className="text-primary" />
                Tax Invoice Sheet
              </h3>
              {(() => {
                const siteData =
                  activeSiteTab === "All Sites"
                    ? data
                    : groupedData[activeSiteTab] || [];
                const invoice = findSalaryInvoice(siteData, activeSiteTab);

                if (invoice) {
                  return (
                    <div className="flex items-center justify-between p-3 rounded-lg border border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          id="invoice-include"
                          checked={siteIncludeInvoice[activeSiteTab] ?? false}
                          onCheckedChange={(checked) => {
                            setSiteIncludeInvoice((prev) => ({
                              ...prev,
                              [activeSiteTab]: Boolean(checked),
                            }));
                          }}
                        />
                        <div className="flex flex-col">
                          <label
                            htmlFor="invoice-include"
                            className="text-sm font-semibold select-none cursor-pointer text-foreground"
                          >
                            Include Tax Invoice Sheet
                          </label>
                          <span className="text-[11px] text-green-600 font-medium">
                            {activeSiteTab === "All Sites"
                              ? "Invoices found for selected sites"
                              : `Invoice Found: ${invoice.invoice_number}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="exclaimation-triangle" size="xs" />
                      <span className="text-sm font-semibold">
                        No Invoice Created
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      An invoice has not been generated for the selected
                      employees of this site yet. You must create an invoice
                      first to include the TAX - INVOICE sheet.
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Conveyance (Reimbursement) Sheets Option */}
            <div className="pb-4 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Icon name="table" size="xs" className="text-primary" />
                  Conveyance / Reimbursement Export
                </h3>
                <span className="text-[11px] font-semibold text-foreground bg-muted px-2 py-0.5 rounded-full">
                  {reimbursementEntries.length} found
                </span>
              </div>

              {/* Reimbursement Date Range Selectors */}
              <div className="grid grid-cols-2 gap-3 bg-muted/20 p-3 rounded-lg border border-border">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Reimbursements From
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 px-2.5 justify-start text-left font-normal text-xs bg-background border border-input rounded-md shadow-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <Icon
                          name="calendar"
                          className="mr-2 h-3.5 w-3.5 text-muted-foreground"
                        />
                        {reimbStartDate
                          ? formatDateLabel(reimbStartDate)
                          : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        today={
                          reimbStartDate ? new Date(reimbStartDate) : new Date()
                        }
                        hidden={{ after: new Date() }}
                        selected={
                          reimbStartDate ? new Date(reimbStartDate) : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            setReimbStartDate(
                              formatISO(date, { representation: "date" }),
                            );
                          }
                        }}
                        defaultMonth={
                          reimbStartDate
                            ? new Date(reimbStartDate)
                            : new Date(
                                payrollData?.year || 2026,
                                (payrollData?.month || 5) - 1,
                              )
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Reimbursements To
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 px-2.5 justify-start text-left font-normal text-xs bg-background border border-input rounded-md shadow-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <Icon
                          name="calendar"
                          className="mr-2 h-3.5 w-3.5 text-muted-foreground"
                        />
                        {reimbEndDate
                          ? formatDateLabel(reimbEndDate)
                          : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        today={
                          reimbEndDate ? new Date(reimbEndDate) : new Date()
                        }
                        hidden={{ after: new Date() }}
                        selected={
                          reimbEndDate ? new Date(reimbEndDate) : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            setReimbEndDate(
                              formatISO(date, { representation: "date" }),
                            );
                          }
                        }}
                        defaultMonth={
                          reimbEndDate
                            ? new Date(reimbEndDate)
                            : new Date(
                                payrollData?.year || 2026,
                                (payrollData?.month || 5) - 1,
                              )
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Include EMP. Conv. List Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="include-conv-list"
                    checked={includeConvList}
                    onCheckedChange={(checked) =>
                      setIncludeConvList(Boolean(checked))
                    }
                  />
                  <div className="flex flex-col">
                    <label
                      htmlFor="include-conv-list"
                      className="text-sm font-semibold select-none cursor-pointer text-foreground"
                    >
                      Include Conveyance List Sheet (EMP. Conv. List)
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Generates employee conveyance & allowance breakdown sheet
                    </span>
                  </div>
                </div>
              </div>

              {/* Conveyance Format Selector (Site-wise vs Single Combined "One") */}
              {(includeConvList || siteIncludeReimbInvoice[activeSiteTab]) && (
                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Conveyance Sheet Format
                    </span>
                    <div className="flex border border-input rounded-full p-0.5 bg-background shadow-sm">
                      <button
                        type="button"
                        onClick={() => setConvExportMode("site-wise")}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium transition-all duration-150",
                          convExportMode === "site-wise"
                            ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Site-wise Sheets
                      </button>
                      <button
                        type="button"
                        onClick={() => setConvExportMode("combined")}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium transition-all duration-150",
                          convExportMode === "combined"
                            ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Single Combined Sheet (One)
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {convExportMode === "combined"
                      ? "All sites' conveyance data will be combined into 1 sheet (EMP. Conv. List - Salary Register)."
                      : "Each site will have its own separate conveyance sheet (EMP. Conv. List - <SiteName>)."}
                  </p>
                </div>
              )}

              {/* Include Reimbursement Tax Invoice (CONV.) */}
              {(() => {
                const siteData =
                  activeSiteTab === "All Sites"
                    ? data
                    : groupedData[activeSiteTab] || [];
                const siteEmployeeIds = new Set(
                  siteData.map((row) => row.employee_id),
                );
                const siteReimbs = reimbursementEntries.filter((r) =>
                  siteEmployeeIds.has(r.employee_id),
                );
                const reimbInvoiceId = siteReimbs.find(
                  (r) => r.invoice_id,
                )?.invoice_id;
                const reimbInvoice = reimbInvoiceId
                  ? reimbursementInvoices.find(
                      (inv) => inv.id === reimbInvoiceId,
                    )
                  : null;

                if (reimbInvoice) {
                  return (
                    <div className="flex items-center justify-between p-3 rounded-lg border border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          id="reimb-invoice-include"
                          checked={
                            siteIncludeReimbInvoice[activeSiteTab] ?? false
                          }
                          onCheckedChange={(checked) => {
                            setSiteIncludeReimbInvoice((prev) => ({
                              ...prev,
                              [activeSiteTab]: Boolean(checked),
                            }));
                          }}
                        />
                        <div className="flex flex-col">
                          <label
                            htmlFor="reimb-invoice-include"
                            className="text-sm font-semibold select-none cursor-pointer text-foreground"
                          >
                            Include Reimbursement Tax Invoice (CONV.)
                          </label>
                          <span className="text-[11px] text-green-600 font-medium">
                            {activeSiteTab === "All Sites"
                              ? "Reimbursement invoices found for selected sites"
                              : `Invoice Found: ${reimbInvoice.invoice_number}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="exclaimation-triangle" size="xs" />
                      <span className="text-sm font-semibold">
                        No Reimbursement Invoice Created
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      A reimbursement invoice has not been generated for the
                      selected employees of this site yet.
                    </p>
                  </div>
                );
              })()}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                Sheet Columns ({activeColumns.filter((c) => c.enabled).length}/
                {activeColumns.length})
              </h3>
              <div className="space-y-2">
                {activeColumns.map((col, idx) => {
                  const isOver = dragOverIndex === idx;
                  const isDragged = draggedIndex === idx;

                  return (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={() => handleDrop(idx)}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border bg-card transition-all duration-150 group",
                        isDragged
                          ? "opacity-40 border-primary border-dashed"
                          : "border-border",
                        isOver
                          ? "bg-primary/10 border-primary scale-[1.01]"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing p-1"
                          title="Drag to reorder"
                        >
                          <Icon name="caret-sort" size="sm" />
                        </div>

                        <Checkbox
                          id={`col-${col.key}`}
                          checked={col.enabled}
                          onCheckedChange={() => toggleColumnEnabled(col.key)}
                        />
                        <label
                          htmlFor={`col-${col.key}`}
                          className={cn(
                            "text-sm font-medium select-none cursor-pointer transition-colors",
                            isEarningColumn(col.key, col)
                              ? "text-green hover:opacity-85"
                              : isDeductionColumn(col.key, col)
                                ? "text-red-600 dark:text-red-500 hover:opacity-85"
                                : "text-foreground group-hover:text-primary",
                          )}
                        >
                          <span className="text-muted-foreground/60 mr-2 font-mono">
                            {idx + 1}.
                          </span>
                          {col.defaultHeader}
                        </label>
                      </div>

                      {/* Ordering Buttons */}
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md"
                          disabled={idx === 0}
                          onClick={() => moveColumn(idx, "up")}
                          title="Move Up"
                        >
                          <Icon name="chevron-up" size="xs" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md"
                          disabled={idx === activeColumns.length - 1}
                          onClick={() => moveColumn(idx, "down")}
                          title="Move Down"
                        >
                          <Icon name="chevron-down" size="xs" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pt-4 border-t border-border">
                Bottom Summary Rows (
                {activeSummaryRows.filter((r) => r.enabled).length}/
                {activeSummaryRows.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {activeSummaryRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors group"
                  >
                    <Checkbox
                      id={`sum-${row.key}`}
                      checked={row.enabled}
                      onCheckedChange={() => toggleSummaryRowEnabled(row.key)}
                    />
                    <label
                      htmlFor={`sum-${row.key}`}
                      className="text-xs font-medium select-none cursor-pointer text-foreground group-hover:text-primary transition-colors"
                    >
                      {row.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Service Charge Calculation Fields */}
            {activeSummaryRows.find((r) => r.key === "service_charge")
              ?.enabled !== false && (
                <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Icon name="calculator" size="xs" className="text-primary" />
                      Include in Service Charge / Tax Calculation (
                      {(siteServiceChargeOn[activeSiteTab] || []).length}/
                      {
                        activeColumns.filter((c) => isScEarningField(c.key, c))
                          .length
                      }
                      )
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={handleSelectAllServiceChargeFields}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={handleClearAllServiceChargeFields}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Select which earning fields are counted towards Service Charge calculation in the exported sheet:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {activeColumns
                      .filter((col) => isScEarningField(col.key, col))
                      .map((col) => {
                        const activeScList =
                          siteServiceChargeOn[activeSiteTab] || [];
                        const isChecked = activeScList.includes(col.key);
                        return (
                          <div
                            key={`sc-field-${col.key}`}
                            className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors group"
                          >
                            <Checkbox
                              id={`sc-field-${col.key}`}
                              checked={isChecked}
                              onCheckedChange={() =>
                                toggleServiceChargeField(col.key)
                              }
                            />
                            <label
                              htmlFor={`sc-field-${col.key}`}
                              className="text-xs font-medium select-none cursor-pointer text-foreground group-hover:text-primary transition-colors flex-1"
                            >
                              {getScFieldLabel(col)}
                            </label>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
          </div>

          <DialogFooter className="flex-none p-6 pt-4 border-t border-border bg-muted/10">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={(e) => {
                setIsDialogOpen(false);
                handleExport(e);
              }}
              disabled={
                !activeSiteTab ||
                activeColumns.filter((c) => c.enabled).length === 0
              }
              className="flex items-center gap-2"
            >
              <Icon name="download" size="sm" />
              Export Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
