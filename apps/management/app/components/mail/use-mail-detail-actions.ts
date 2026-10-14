import type { NavigateFunction } from "@remix-run/react";
import * as XLSX from "xlsx";
import type { InboxEmail } from "@/utils/server/imap.server";
import { getCompanyForEmail } from "./mail-helpers";
import {
  extractJoineeDetails,
  extractReimbursementDetails,
  extractBulkReimbursementItems,
} from "./mail-reimbursement-extractor";
import { parseAttendanceGrid } from "./mail-attendance-parser";
import type { BulkRowItem } from "./mail-reimbursement-modal";

interface UseMailDetailActionsProps {
  allUsers: any[];
  allEmployees: any[];
  companies: any[];
  employees: any[];
  users: any[];
  currentCompanyId?: string;
  setModalStep: (step: "advance" | "reimbursement") => void;
  setReimbursementData: (data: any) => void;
  setModalCompanyId: (id: string) => void;
  setBulkRows: (rows: BulkRowItem[]) => void;
  setReimbursementModalOpen: (open: boolean) => void;
  setEmployeeModalTitle: (title: string) => void;
  setEmployeeModalUrl: (url: string) => void;
  setEmployeeModalOpen: (open: boolean) => void;
  toast: any;
  navigate: NavigateFunction;
}

export function useMailDetailActions({
  allUsers,
  allEmployees,
  companies,
  employees,
  users,
  currentCompanyId,
  setModalStep,
  setReimbursementData,
  setModalCompanyId,
  setBulkRows,
  setReimbursementModalOpen,
  setEmployeeModalTitle,
  setEmployeeModalUrl,
  setEmployeeModalOpen,
  toast,
  navigate,
}: UseMailDetailActionsProps) {
  const handleGenerateReimbursement = (email: InboxEmail) => {
    const compInfo = getCompanyForEmail(
      email,
      allUsers as any[],
      allEmployees as any[],
      companies as any[]
    );
    const details = extractReimbursementDetails(
      email,
      employees as any[],
      users as any[],
      allEmployees as any[],
      companies as any[]
    );

    const fullEmployeesList =
      (allEmployees as any[]).length > 0
        ? (allEmployees as any[])
        : (employees as any[]);

    let targetCompanyId = compInfo.companyId || details.companyId || "";

    const detectedBulk = extractBulkReimbursementItems(
      email,
      fullEmployeesList,
      targetCompanyId,
      details.type || "expenses"
    );

    if (!targetCompanyId && detectedBulk.length > 0) {
      const firstMatched = detectedBulk.find((b) => b.employeeId);
      if (firstMatched) {
        const emp = fullEmployeesList.find(
          (e) => e.id === firstMatched.employeeId
        );
        if (emp?.company_id) {
          targetCompanyId = emp.company_id;
        }
      }
    }
    if (!targetCompanyId) targetCompanyId = currentCompanyId || "";

    const hasAdvances =
      detectedBulk.some((r) => r.type === "advances") ||
      details.type === "advances";

    setModalStep(hasAdvances ? "advance" : "reimbursement");
    setReimbursementData({
      ...details,
      companyId: targetCompanyId,
    });
    setModalCompanyId(targetCompanyId);
    setBulkRows(detectedBulk);
    setReimbursementModalOpen(true);
  };

  const handleAddAttendance = async (email: InboxEmail) => {
    try {
      let month = new Date().getMonth() + 1;
      let year = new Date().getFullYear();

      const fullText = `${email.subject || ""} ${email.snippet || ""} ${
        email.text || ""
      }`;
      const monthYearMatch = fullText.match(
        /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[-_\s]*([2-9]\d{3})\b/i
      );

      if (monthYearMatch) {
        const mStr = monthYearMatch[1].toUpperCase();
        const yNum = parseInt(monthYearMatch[2], 10);
        const monthMap: Record<string, number> = {
          JANUARY: 1,
          JAN: 1,
          FEBRUARY: 2,
          FEB: 2,
          MARCH: 3,
          MAR: 3,
          APRIL: 4,
          APR: 4,
          MAY: 5,
          JUNE: 6,
          JUN: 6,
          JULY: 7,
          JUL: 7,
          AUGUST: 8,
          AUG: 8,
          SEPTEMBER: 9,
          SEP: 9,
          OCTOBER: 10,
          OCT: 10,
          NOVEMBER: 11,
          NOV: 11,
          DECEMBER: 12,
          DEC: 12,
        };
        if (monthMap[mStr]) month = monthMap[mStr];
        if (yNum >= 2020 && yNum <= 2050) year = yNum;
      } else if (email.date) {
        const d = new Date(email.date);
        if (!isNaN(d.getTime())) {
          month = d.getMonth() + 1;
          year = d.getFullYear();
        }
      }

      let parsedRows: Array<{
        employee_code?: string;
        uan_number?: string;
        name?: string;
        attendance: Record<number, string>;
      }> = [];

      const excelAtt = email.attachments?.find(
        (att) =>
          /\.(xlsx?|csv|ods)$/i.test(att.filename || "") ||
          (att.contentType || "").includes("excel") ||
          (att.contentType || "").includes("spreadsheet") ||
          (att.contentType || "").includes("csv")
      );

      if (excelAtt && excelAtt.contentUrl) {
        const base64Parts = excelAtt.contentUrl.split(",");
        const base64Data =
          base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const xlsxLib: any = (XLSX as any).default || XLSX;
        const workbook = xlsxLib.read(bytes, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (sheetName) {
          const worksheet = workbook.Sheets[sheetName];
          const rawGrid: any[][] = xlsxLib.utils.sheet_to_json(worksheet, {
            header: 1,
            blankrows: false,
            defval: "",
          });

          parsedRows = parseAttendanceGrid(rawGrid);
        }
      }

      const payload = {
        source: "email",
        emailId: email.id,
        subject: email.subject,
        month,
        year,
        rows: parsedRows,
      };

      sessionStorage.setItem(
        "imported_attendance_payload",
        JSON.stringify(payload)
      );

      toast({
        title: "Opening Add Attendance",
        description: `Extracted attendance data for ${parsedRows.length} employee(s). Redirecting...`,
        variant: "success",
      });

      navigate("/time-tracking/attendance/create-bulk-daily-attendance");
    } catch (err: any) {
      console.error("Error extracting attendance from email:", err);
      toast({
        title: "Error extracting attendance",
        description:
          err?.message || "Failed to parse attendance data from email.",
        variant: "destructive",
      });
    }
  };

  const handleAddEmployeeFromEmail = (email: InboxEmail) => {
    const details = extractJoineeDetails(email);
    const params = new URLSearchParams();
    params.set("embed", "true");

    if (details.first_name) params.set("first_name", details.first_name);
    if (details.middle_name) params.set("middle_name", details.middle_name);
    if (details.last_name) params.set("last_name", details.last_name);
    if (details.email) params.set("email", details.email);
    if (details.phone) params.set("phone", details.phone);
    if (details.doj) params.set("date_of_joining", details.doj);
    if (details.dob) params.set("date_of_birth", details.dob);
    if (details.gender) params.set("gender", details.gender);

    const joineeName = [
      details.first_name,
      details.middle_name,
      details.last_name,
    ]
      .filter(Boolean)
      .join(" ");
    setEmployeeModalTitle(
      joineeName ? `Add Employee: ${joineeName}` : "Add New Employee"
    );
    setEmployeeModalUrl(`/employees/create-employee?${params.toString()}`);
    setEmployeeModalOpen(true);
  };

  return {
    handleGenerateReimbursement,
    handleAddAttendance,
    handleAddEmployeeFromEmail,
  };
}
