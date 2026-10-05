import { useState, useEffect, useMemo } from "react";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  unstable_parseMultipartFormData as parseMultipartFormData,
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
} from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  Form,
  useNavigation,
  useRevalidator,
  useNavigate,
  useFetcher,
} from "@remix-run/react";
import { SENDER_NAME, getSenderEmail, createTransporter } from "@/utils/server/mail.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getCompanies,
  getUsersByCompanyId,
  getEmployeesByCompanyId,
  getInvoicesByCompanyId,
  getApprovedPayrollsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { generateInvoicePDFBuffer } from "../payroll+/invoices+/$invoiceId.preview-invoice";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { safeRedirect } from "@/utils/server/http.server";
import { DEFAULT_ROUTE } from "@/constant";
import { hasPermission, readRole } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { fetchInboxEmails, fetchSingleEmailDetails, type InboxEmail } from "@/utils/server/imap.server";
import * as XLSX from "xlsx";

import {
  createReimbursementsFromData,
  createReimbursementFromAdvance,
} from "@canny_ecosystem/supabase/mutations";
import { isGoodStatus } from "@canny_ecosystem/utils";

function getExcelColName(n: number): string {
  let result = "";
  let temp = n;
  while (temp >= 0) {
    result = String.fromCharCode((temp % 26) + 65) + result;
    temp = Math.floor(temp / 26) - 1;
  }
  return result;
}

// ─── Loader ────────────────────────────────────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(user?.role!, `${readRole}:${attribute.chat}`) &&
    !hasPermission(user?.role!, `${readRole}:${attribute.approvals}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit")) || 10;
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const searchQuery = url.searchParams.get("search") || url.searchParams.get("q") || "";

  const [
    companiesRes,
    usersRes,
    employeesRes,
    allUsersRes,
    allEmployeesRes,
    invoicesRes,
    payrollsRes,
    inboxResult,
  ] = await Promise.all([
    getCompanies({ supabase }),
    getUsersByCompanyId({ supabase, companyId }),
    getEmployeesByCompanyId({
      supabase,
      companyId,
      params: { from: 0, to: 10000 },
    }),
    supabase
      .from("users")
      .select("id, avatar, first_name, last_name, email, role, mobile_number, is_active, company_id"),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, middle_name, last_name, email, personal_email, company_id, user_id")
      .range(0, 10000),
    getInvoicesByCompanyId({
      supabase,
      companyId,
      params: { from: 0, to: 100 },
    }),
    getApprovedPayrollsByCompanyId({
      supabase,
      companyId,
      params: { from: 0, to: 100 },
    }),
    fetchInboxEmails(
      limit,
      url.searchParams.get("sync") === "true" || url.searchParams.get("refresh") === "true",
      searchQuery
    ),
  ]);

  return json({
    companies: companiesRes.data || [],
    users: (usersRes.data || []).filter((u: any) => u.email),
    employees: employeesRes.data || [],
    allUsers: allUsersRes.data || [],
    allEmployees: allEmployeesRes.data || [],
    invoices: invoicesRes.data || [],
    approvedPayrolls: payrollsRes.data || [],
    inboxEmails: inboxResult.emails || [],
    inboxError: inboxResult.error,
    searchQuery,
    limit,
    companyId,
    senderEmail: getSenderEmail(),
    senderName: SENDER_NAME,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(user?.role!, `${readRole}:${attribute.chat}`) &&
    !hasPermission(user?.role!, `${readRole}:${attribute.approvals}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  try {
    const clonedReq = request.clone();
    const rawForm = await clonedReq.formData();
    const intent = rawForm.get("intent") as string;

    if (intent === "fetch_email_details") {
      const uid = Number(rawForm.get("uid"));
      if (uid) {
        const fullEmail = await fetchSingleEmailDetails(uid);
        if (fullEmail) {
          return json({ status: "email_details_success", email: fullEmail });
        }
      }
      return json({ status: "error", message: "Failed to fetch email details." });
    }

    if (intent === "create_advance" || intent === "create_advances_step1") {
      try {
        const submitted_date = (rawForm.get("submitted_date") as string) || new Date().toISOString().split("T")[0];
        const type = (rawForm.get("type") as string) || "expenses";
        const note = (rawForm.get("note") as string) || "";
        const formCompanyId = rawForm.get("company_id") as string;
        const { companyId: defaultCompanyId } = await getCompanyIdOrFirstCompany(request, supabase);
        const companyId = formCompanyId || defaultCompanyId;

        const bulkJson = rawForm.get("bulk_items_json") as string;
        let bulkItemsList: any[] = [];
        if (bulkJson) {
          try {
            bulkItemsList = JSON.parse(bulkJson);
          } catch (err) { }
        }

        if (bulkItemsList && bulkItemsList.length > 0) {
          const unassignedItem = bulkItemsList.find(
            (item) => !item.employeeId || !(parseFloat(item.amount) || 0)
          );
          if (unassignedItem) {
            return json({
              status: "error",
              message: "Please select an employee and enter a valid amount for all claim rows before submitting.",
            });
          }

          const advanceItems = bulkItemsList.filter((i) => (i.type || type) === "advances");
          const createdAdvancesMap: Record<string, string> = {};

          for (const item of advanceItems) {
            const { data: createdAdvance, error: advErr } = await supabase
              .from("employee_advance_details")
              .insert({
                company_id: companyId,
                employee_id: item.employeeId,
                advance_name: item.note || `Advance claim for ${item.name}`,
                advance_date: submitted_date,
                amount: parseFloat(item.amount) || 0,
                is_paid: false,
              })
              .select()
              .single();

            if (createdAdvance && createdAdvance.id) {
              createdAdvancesMap[item.id] = createdAdvance.id;
            }
          }

          const updatedRows = bulkItemsList.map((item) => ({
            ...item,
            advanceId: createdAdvancesMap[item.id] || item.advanceId || "",
          }));

          return json({
            status: "advance_step1_success",
            message: `${Object.keys(createdAdvancesMap).length} Employee Advance(s) Created Successfully! Opening Reimbursement Claim Form...`,
            createdBulkRows: updatedRows,
          });
        }

        const employee_id = rawForm.get("employee_id") as string;
        const amountStr = (rawForm.get("amount") as string) || "0";
        const amount = parseFloat(amountStr) || 0;

        if (!employee_id) {
          return json({
            status: "error",
            message: "Please select an employee for the company before submitting.",
          });
        }

        const { data: createdAdvance, error: advErr } = await supabase
          .from("employee_advance_details")
          .insert({
            company_id: companyId,
            employee_id,
            advance_name: note || "Advance claim from Email",
            advance_date: submitted_date,
            amount,
            is_paid: false,
          })
          .select()
          .single();

        if (advErr || !createdAdvance?.id) {
          return json({
            status: "error",
            message: advErr?.message || "Failed to create employee advance.",
          });
        }

        return json({
          status: "advance_step1_success",
          message: "Employee Advance Created Successfully! Opening Reimbursement Claim Form...",
          singleAdvance: {
            advanceId: createdAdvance.id,
            employee_id,
            amount,
            note,
            type,
            submitted_date,
          },
        });
      } catch (err: any) {
        return json({ status: "error", message: err.message });
      }
    }

    if (intent === "create_reimbursement") {
      try {
        const submitted_date = (rawForm.get("submitted_date") as string) || new Date().toISOString().split("T")[0];
        const status = (rawForm.get("status") as string) || "approved";
        const type = (rawForm.get("type") as string) || "expenses";
        const note = (rawForm.get("note") as string) || "";
        const user_id = rawForm.get("user_id") as string;
        const formCompanyId = rawForm.get("company_id") as string;
        const { companyId: defaultCompanyId } = await getCompanyIdOrFirstCompany(request, supabase);
        const companyId = formCompanyId || defaultCompanyId;

        const bulkJson = rawForm.get("bulk_items_json") as string;
        let bulkItemsList: any[] = [];
        if (bulkJson) {
          try {
            bulkItemsList = JSON.parse(bulkJson);
          } catch (err) { }
        }

        if (bulkItemsList && bulkItemsList.length > 0) {
          const unassignedItem = bulkItemsList.find(
            (item) => !item.employeeId || !(parseFloat(item.amount) || 0)
          );
          if (unassignedItem) {
            return json({
              status: "error",
              message: "Please select an employee and enter a valid amount for all claim rows before submitting.",
            });
          }

          const validBulkItems = bulkItemsList.filter(
            (item) => item.employeeId && (parseFloat(item.amount) || 0) > 0
          );

          let createdCount = 0;

          const advanceItemsWithId = validBulkItems.filter((i) => i.advanceId);
          const otherItems = validBulkItems.filter((i) => !i.advanceId);

          for (const item of advanceItemsWithId) {
            const { status: reimbStatus } = await createReimbursementFromAdvance({
              supabase,
              data: {
                company_id: companyId,
                submitted_date,
                status: status as any,
                type: (item.type || type) as any,
                note: item.note || note || `Bulk claim for ${item.name}`,
                employee_id: item.employeeId,
                user_id: user_id || undefined,
                amount: parseFloat(item.amount) || 0,
              },
              advanceId: item.advanceId,
            });
            if (isGoodStatus(reimbStatus)) {
              createdCount++;
            }
          }

          if (otherItems.length > 0) {
            const insertData = otherItems.map((item) => ({
              company_id: companyId,
              submitted_date,
              status: status as any,
              type: (item.type || type) as any,
              note: item.note || note || `Bulk claim for ${item.name}`,
              employee_id: item.employeeId,
              user_id: user_id || undefined,
              amount: parseFloat(item.amount) || 0,
            }));

            const { status: mutStatus } = await createReimbursementsFromData({
              supabase,
              reimbursementsData: insertData,
            });
            if (isGoodStatus(mutStatus)) {
              createdCount += insertData.length;
            }
          }

          if (createdCount > 0) {
            return json({
              status: "reimbursement_success",
              message: `${createdCount} Bulk Reimbursement Claim(s) Created & Linked Successfully!`,
            });
          }
          return json({
            status: "error",
            message: "Failed to create bulk reimbursements.",
          });
        }

        const employee_id = rawForm.get("employee_id") as string;
        const amountStr = (rawForm.get("amount") as string) || "0";
        const amount = parseFloat(amountStr) || 0;
        const advanceId = rawForm.get("advance_id") as string;

        if (!employee_id) {
          return json({
            status: "error",
            message: "Please select an employee for the company before submitting.",
          });
        }

        if (advanceId) {
          const { status: mutStatus, error } = await createReimbursementFromAdvance({
            supabase,
            data: {
              company_id: companyId,
              submitted_date,
              status: status as any,
              type: type as any,
              note,
              employee_id,
              user_id: user_id || undefined,
              amount,
            },
            advanceId,
          });

          if (isGoodStatus(mutStatus)) {
            return json({
              status: "reimbursement_success",
              message: "Employee Advance & Reimbursement Claim Created Successfully!",
            });
          }
          return json({
            status: "error",
            message: error?.message || "Failed to create reimbursement from advance.",
          });
        } else {
          const { status: mutStatus, error } = await createReimbursementsFromData({
            supabase,
            reimbursementsData: [
              {
                company_id: companyId,
                submitted_date,
                status: status as any,
                type: type as any,
                note,
                employee_id,
                user_id: user_id || undefined,
                amount,
              },
            ],
          });

          if (isGoodStatus(mutStatus)) {
            return json({
              status: "reimbursement_success",
              message: "Employee Reimbursement Created Successfully!",
            });
          }
          return json({
            status: "error",
            message: error?.message || "Failed to create reimbursement.",
          });
        }
      } catch (err: any) {
        return json({ status: "error", message: err.message });
      }
    }
  } catch (e) {
    // Continue
  }

  try {
    const uploadHandler = createMemoryUploadHandler({
      maxPartSize: 10 * 1024 * 1024,
    });
    const formData = await parseMultipartFormData(request, uploadHandler);

    const toRaw = formData.get("to") as string;
    const subject = (formData.get("subject") as string)?.trim();
    const body = (formData.get("body") as string)?.trim();

    const toList = toRaw
      ? toRaw
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      : [];

    if (!toList.length || !subject || !body) {
      return json({
        status: "error",
        message: "Please fill all fields and select at least one recipient.",
      });
    }

    const attachments = [];

    const selectedInvoicesJSON = formData.get("selectedInvoices") as string;
    if (selectedInvoicesJSON) {
      try {
        const parsedInvoices = JSON.parse(selectedInvoicesJSON) as {
          id: string;
          name: string;
          url: string;
        }[];
        const { companyId } = await getCompanyIdOrFirstCompany(
          request,
          supabase,
        );
        for (const inv of parsedInvoices) {
          if (inv.url) {
            try {
              const response = await fetch(inv.url);
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                attachments.push({
                  filename: `${inv.name}.pdf`,
                  content: buffer,
                });
              }
            } catch (fetchErr) {
              console.error(`Exception during fetch for ${inv.url}:`, fetchErr);
            }
          } else {
            try {
              const buffer = await generateInvoicePDFBuffer({
                invoiceId: inv.id,
                supabase,
                companyId,
              });
              attachments.push({
                filename: `${inv.name}.pdf`,
                content: buffer,
              });
            } catch (genErr) {
              console.error(
                `Failed to generate PDF dynamically for invoice ${inv.name}:`,
                genErr,
              );
            }
          }
        }
      } catch (jsonErr) {
        console.error("Failed to parse selected invoices JSON:", jsonErr);
      }
    }

    const selectedSalaryRunsJSON = formData.get("selectedSalaryRuns") as string;
    if (selectedSalaryRunsJSON) {
      try {
        const parsedSalaryRuns = JSON.parse(selectedSalaryRunsJSON) as {
          id: string;
          name: string;
        }[];
        const { companyId } = await getCompanyIdOrFirstCompany(
          request,
          supabase,
        );
        const { generateSalarySlipsPDFBuffer } = await import(
          "../payroll+/run-payroll+/$payrollId+/_reports+/salary-slips"
        );
        for (const run of parsedSalaryRuns) {
          try {
            const buffer = await generateSalarySlipsPDFBuffer({
              payrollId: run.id,
              supabase,
              companyId,
            });
            attachments.push({
              filename: `Salary_Slips_${run.name.replace(/\s+/g, "_")}.pdf`,
              content: buffer,
            });
          } catch (err) {
            console.error(
              `Failed to generate Salary Slips PDF for run ${run.name}:`,
              err,
            );
          }
        }
      } catch (jsonErr) {
        console.error("Failed to parse selected salary runs JSON:", jsonErr);
      }
    }

    const attachmentsRaw = formData.getAll("attachments") as any[];
    for (const file of attachmentsRaw) {
      if (file && typeof file === "object" && file.name && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        attachments.push({
          filename: file.name,
          content: Buffer.from(arrayBuffer),
        });
      }
    }

    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${getSenderEmail()}>`,
      to: toList.join(", "),
      subject,
      text:
        body +
        "\n\nIf you want to see in this more details so visit our website: https://canny-management.vercel.app",
      html:
        body.replace(/\r?\n/g, "<br />") +
        '<br /><br />If you want to see in this more details so visit our website: <a href="https://canny-management.vercel.app">canny-management.vercel.app</a>',
      attachments,
    });

    return json({
      status: "success",
      message: `Email sent to ${toList.length} recipient(s).`,
    });
  } catch (err: any) {
    console.error("Gmail SMTP error:", err);
    return json({
      status: "error",
      message: err?.message || "Unexpected error while sending.",
    });
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function isUpdatesEmail(email: InboxEmail): boolean {
  const senderAddress = (email.from.address || "").toLowerCase().trim();
  const senderName = (email.from.name || "").toLowerCase().trim();
  const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`.trim();
  const lowerText = fullText.toLowerCase();

  // Bank payment alerts, salary credits, ipaycheck, automated notifications
  if (
    /ipaycheck|i-paycheck|paycheck|payslip|salary|payroll|e-payment|epayment|bankcredit|bank credit|credit alert|debit alert|bank alert|neft|rtgs|imps|nach|ach|nodal|paymentadvice|payment advice|payment confirmation|transaction alert|bank statement|system update|notification|alerts|auto-generated/i.test(senderAddress) ||
    /ipaycheck|i-paycheck|paycheck|payslip|icici bank|hdfc bank|sbi bank|axis bank|kotak|bank e-payment|credit alert|debit alert|payment confirmation|payment advice|transaction alert/i.test(senderName)
  ) {
    return true;
  }

  if (
    /ipaycheck|i-paycheck|paycheck|payslip|salary slip|salary credited|salary payment|e-payment for m\/s|we have credited|credited your account|debited from your account|credit alert|debit alert|transaction alert|payment advice|payment confirmation|utr no|bank e-payment|icici bank|hdfc bank|sbi bank|axis bank|kotak bank|bank credit|neft transfer|rtgs transfer|imps transfer|account balance|statement of account/i.test(lowerText)
  ) {
    return true;
  }

  return false;
}

function isPromotionalEmail(email: InboxEmail): boolean {
  const senderAddress = (email.from.address || "").toLowerCase().trim();
  const senderName = (email.from.name || "").toLowerCase().trim();
  const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`.trim();
  const lowerText = fullText.toLowerCase();

  // Marketing, sales, promotions, newsletters, offers, digests
  if (
    /no-?reply|donotreply|do-not-reply|newsletter|marketing|promotions?|promo|offers?|deals?|sales?|digest|info@|news@|bulletin|campaign|advertising|store@|shop@|mall@/i.test(senderAddress) ||
    /custcomm|icicilombard|icicidirect|quora|experian|workindia|vodafone|vi\.in|aclemalls/i.test(senderAddress) ||
    /promotions?|offers?|deals?|sales?|marketing|newsletter/i.test(senderName)
  ) {
    return true;
  }

  if (
    /\b(sales?|special offer|limited offer|limited time|exclusive offer|discount|discounts|off your next|cashback|coupon|promo code|promotions?|marketing|newsletter|weekly digest|bulletin|shop now|buy now|order now|clearance|webinar|invitation to join|survey|try for free|free trial|upgrade now|subscription|renew now|renewal)\b/i.test(lowerText) ||
    /click here to view in browser|unsubscribe|privacy policy|terms and conditions|protect yourself from fraud/i.test(lowerText)
  ) {
    return true;
  }

  return false;
}

function getReimbursementCategory(email: InboxEmail): string | null {
  // Exclude updates (like ipaycheck/bank alerts) and promotional/sales emails from reimbursements
  if (isUpdatesEmail(email) || isPromotionalEmail(email)) {
    return null;
  }

  const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`.trim();
  if (!fullText) return null;
  const lowerText = fullText.toLowerCase();

  // Attendance Category: Check for attendance sheet / manpower deployment email
  const hasAttendanceAttachment = email.attachments?.some((a) =>
    /attendance|attendace|muster|manpower|deployment/i.test(a.filename || "")
  );

  if (
    /\b(attendance|attendace|manpower deployment|mustering|muster roll|daily attendance|attendance sheet|attendance format)\b/i.test(lowerText) ||
    hasAttendanceAttachment
  ) {
    return "Attendance";
  }

  // New Joinee Category: Check for new joinee / joining details / onboarding email
  const hasJoineeAttachment = email.attachments?.some((a) =>
    /joinee|joining|joiner|onboarding|new_employee|new_staff/i.test(a.filename || "")
  );

  if (
    /\b(new\s*joinee|new\s*joinees|new\s*joiner|new\s*joiners|new\s*joining|joinee|joinees|joining\s*detail|joining\s*details|new\s*employee|new\s*employees|onboarding|employee\s*onboarding)\b/i.test(lowerText) ||
    hasJoineeAttachment
  ) {
    return "New Joinee";
  }

  // Employee Left / Exit Category: Check for left, resign, resignation, etc.
  const hasLeftAttachment = email.attachments?.some((a) =>
    /left|resign|resignation|relieving|exit|termination|notice|lwd/i.test(a.filename || "")
  );

  if (
    /\b(left|resign|resignation|resigned|relieving|relieved|termination|terminated|exit|notice\s*period|last\s*working\s*day|lwd)\b/i.test(lowerText) ||
    hasLeftAttachment
  ) {
    return "Employee Left";
  }

  // Advance Category: Must match explicit advance keywords
  if (/\b(advance|advances|diesel advance|cash advance|travel advance)\b/i.test(lowerText)) {
    return "Reimbursement / Advance";
  }

  // Expenses Category: Must match explicit employee expense/claim/payment phrasing
  if (
    /\b(reimbursement|reimbursements|reimburse|expense claim|expenses claim|medical claim|travel claim|diesel claim|car repairing|repairing|fuel bill|taxi bill|hotel bill|kindly pay|please pay|kindly gpay|please credit|gpay|g-pay)\b/i.test(lowerText) ||
    (/\b(expense|expenses|bill|invoice|repair|repairing)\b/i.test(lowerText) && /\b(pay|rs|inr|₹|\$|amount|claim|credit)\b/i.test(lowerText))
  ) {
    return "Reimbursement / Expenses";
  }

  // Unknown Category: Only if explicit claim wording or direct user request with currency amount
  if (
    /\b(kindly|please|dear sir|dear ma'am|attached|bill|claim)\b/i.test(lowerText) &&
    /(?:rs\.?|₹|inr|\$|amount|total)[\s:=._-]*[\d,]{3,10}|\b[\d,]{3,10}(?:\.\d{1,2})?\s*(?:\/-|rs|inr|₹)/i.test(lowerText)
  ) {
    return "Reimbursement / Unknown";
  }

  return null;
}

function getEmailCategory(email: InboxEmail): "primary" | "attendance" | "new_joinee" | "employee_left" | "advance" | "expenses" | "reimbursement" | "updates" | "promotions" {
  if (isUpdatesEmail(email)) return "updates";
  if (isPromotionalEmail(email)) return "promotions";

  const reimbCat = getReimbursementCategory(email);
  if (reimbCat === "Attendance") return "attendance";
  if (reimbCat === "New Joinee") return "new_joinee";
  if (reimbCat === "Employee Left") return "employee_left";
  if (reimbCat === "Reimbursement / Advance") return "advance";
  if (reimbCat === "Reimbursement / Expenses") return "expenses";
  if (reimbCat) return "reimbursement";

  return "primary";
}

function isReimbursementEmail(email: InboxEmail): boolean {
  return getReimbursementCategory(email) !== null;
}

function extractStructuredReimbursementDetails(email?: InboxEmail): {
  code?: string;
  name?: string;
  amount?: string;
  location?: string;
} {
  if (!email) return {};
  const html = email.html || "";
  const rawText = `${email.subject || ""}\n${email.snippet || ""}\n${email.text || ""}`;
  const htmlPlain = html ? html.replace(/<[^>]+>/g, "\n") : "";
  const fullText = `${rawText}\n${htmlPlain}`;

  let extractedCode = "";
  let extractedName = "";
  let extractedAmount = "";
  let extractedLocation = "";

  // PARSER 1: HTML <table> Parsing
  if (html && /<table/i.test(html)) {
    try {
      const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      const rows: string[][] = rowMatches.map((trHtml) => {
        const cellMatches = trHtml.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || [];
        return cellMatches.map((cellHtml) =>
          cellHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").trim()
        );
      });

      for (let i = 0; i < rows.length - 1; i++) {
        const headerRow = rows[i];
        const valueRow = rows[i + 1];

        if (headerRow.length >= 2 && valueRow.length === headerRow.length) {
          const codeIdx = headerRow.findIndex((h) => /code|id|no/i.test(h));
          const nameIdx = headerRow.findIndex((h) => /name|employee/i.test(h) && !/code|id|no/i.test(h));
          const amountIdx = headerRow.findIndex((h) => /amount|sum|claim|total/i.test(h));
          const locIdx = headerRow.findIndex((h) => /location|city|branch|site/i.test(h));

          if (codeIdx !== -1 && valueRow[codeIdx]) extractedCode = valueRow[codeIdx];
          if (nameIdx !== -1 && valueRow[nameIdx]) extractedName = valueRow[nameIdx];
          if (amountIdx !== -1 && valueRow[amountIdx]) extractedAmount = valueRow[amountIdx];
          if (locIdx !== -1 && valueRow[locIdx]) extractedLocation = valueRow[locIdx];

          if (extractedCode || extractedName) break;
        }
      }

      if (!extractedCode && !extractedName) {
        for (const row of rows) {
          if (row.length >= 2) {
            const key = row[0].toLowerCase();
            const val = row[1];
            if (/code|id|no/i.test(key) && !extractedCode) extractedCode = val;
            else if (/name|employee/i.test(key) && !/code|id|no/i.test(key) && !extractedName) extractedName = val;
            else if (/amount|claim|total/i.test(key) && !extractedAmount) extractedAmount = val;
            else if (/location|city|branch/i.test(key) && !extractedLocation) extractedLocation = val;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // PARSER 2: Text Header Block followed by Value Block
  if (!extractedCode || !extractedName) {
    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const isHeaderLine = (l: string) =>
      /^(?:location|employee\s*code|emp\s*code|code|employee\s*name|emp\s*name|name|advance\s*amount|amount|claim\s*amount)$/i.test(l);

    for (let i = 0; i < lines.length - 3; i++) {
      let headerCount = 0;
      let j = i;
      while (j < lines.length && isHeaderLine(lines[j])) {
        headerCount++;
        j++;
      }

      if (headerCount >= 2 && j + headerCount <= lines.length) {
        const headerBlock = lines.slice(i, j);
        const valueBlock = lines.slice(j, j + headerCount);

        headerBlock.forEach((hdr, idx) => {
          const val = valueBlock[idx] || "";
          if (/code|id|no/i.test(hdr) && !extractedCode) extractedCode = val;
          else if (/name/i.test(hdr) && !extractedName) extractedName = val;
          else if (/amount|claim/i.test(hdr) && !extractedAmount) extractedAmount = val;
          else if (/location/i.test(hdr) && !extractedLocation) extractedLocation = val;
        });

        if (extractedCode || extractedName) break;
      }
    }
  }

  // PARSER 3: Standard Inline Label Extraction
  if (!extractedCode) {
    const codeMatch = fullText.match(
      /(?:employee\s*code|emp\s*code|staff\s*code|code|emp\s*id)\s*[:=\#-]?\s*([a-z0-9\/\._-]+)/i
    );
    if (codeMatch && codeMatch[1]) extractedCode = codeMatch[1].trim();
  }

  if (!extractedName) {
    const nameMatch = fullText.match(
      /(?:employee\s*name|emp\s*name|name)\s*[:=\#-]?\s*([a-z\s\.]+)/i
    );
    if (nameMatch && nameMatch[1]) {
      const candidate = nameMatch[1].trim();
      if (candidate.length >= 2 && !/amount|code|location|total/i.test(candidate)) {
        extractedName = candidate;
      }
    }
  }

  if (!extractedAmount) {
    const amtMatch = fullText.match(
      /(?:advance\s*amount|claim\s*amount|amount)\s*[:=\#-]?\s*(?:rs\.?|₹|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (amtMatch && amtMatch[1]) extractedAmount = amtMatch[1].replace(/,/g, "");
  }

  return {
    code: extractedCode,
    name: extractedName,
    amount: extractedAmount,
    location: extractedLocation,
  };
}

function parseDateToISO(dateStr: string): string {
  try {
    const cleanStr = dateStr.replace(/(?:st|nd|rd|th)/gi, "").trim();
    const parts = cleanStr.split(/[\/\.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch (e) {
    // fallback
  }
  return "";
}

function extractJoineeDetails(email?: InboxEmail): {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  doj?: string;
  dob?: string;
  gender?: string;
} {
  if (!email) return {};

  const subject = email.subject || "";
  const snippet = email.snippet || "";
  const bodyText = email.text || "";
  const html = email.html || "";
  const htmlPlain = html ? html.replace(/<[^>]+>/g, "\n") : "";
  const fullText = `${subject}\n${snippet}\n${bodyText}\n${htmlPlain}`;

  let rawName = "";
  let extractedEmail = "";
  let extractedPhone = "";
  let extractedDOJ = "";
  let extractedDOB = "";
  let extractedGender = "";

  // 1. EXTRACT NAME
  const subjNameMatch = subject.match(
    /(?:new\s*joinee|joining\s*details?\s*(?:of)?|onboarding|new\s*employee)\s*[:=\#-]?\s*([a-zA-Z\s\.]{2,40})/i
  );
  if (subjNameMatch && subjNameMatch[1]) {
    const cand = subjNameMatch[1].trim();
    if (cand.length >= 2 && !/details|sheet|info|list|report|data/i.test(cand)) {
      rawName = cand;
    }
  }

  if (!rawName) {
    const nameLabelMatch = fullText.match(
      /(?:candidate\s*name|employee\s*name|joinee\s*name|full\s*name|name)\s*[:=\#-]?\s*([a-zA-Z\s\.]{2,40})/i
    );
    if (nameLabelMatch && nameLabelMatch[1]) {
      const cand = nameLabelMatch[1].trim();
      if (cand.length >= 2 && !/details|sheet|info|code|id|date|joining/i.test(cand)) {
        rawName = cand;
      }
    }
  }

  // Check Aadhaar PDF line pattern (the line above DOB/Date of Birth in Aadhaar Cards/Forms)
  if (!rawName) {
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (/(?:dob|date\s*of\s*birth|year\s*of\s*birth)/i.test(lines[i]) && i > 0) {
        const prevLine = lines[i - 1].replace(/^to\s+/i, "").trim();
        if (/^[a-zA-Z\s\.]{2,40}$/.test(prevLine) && !/government|india|aadhaar|unique|identification|enrollment|download/i.test(prevLine)) {
          rawName = prevLine;
          break;
        }
      }
    }
  }

  // 2. EXTRACT EMAIL
  const emailLabelMatch = fullText.match(
    /(?:personal\s*email|email\s*id|work\s*email|email)\s*[:=\#-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  );
  if (emailLabelMatch && emailLabelMatch[1]) {
    extractedEmail = emailLabelMatch[1].trim();
  } else {
    const senderEmail = (email.from?.address || "").toLowerCase();
    const allEmails = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi) || [];
    const filteredEmail = allEmails.find((e) => e.toLowerCase() !== senderEmail && !/support|info|canny|admin/i.test(e));
    if (filteredEmail) {
      extractedEmail = filteredEmail;
    }
  }

  // 3. EXTRACT PHONE
  const phoneMatch = fullText.match(
    /(?:mobile\s*no\.?|contact\s*no\.?|phone\s*no\.?|mobile|contact|phone)\s*[:=\#-]?\s*(?:\+91[\-\s]?)?([6-9]\d{9})/i
  );
  if (phoneMatch && phoneMatch[1]) {
    extractedPhone = phoneMatch[1].trim();
  } else {
    const standalonePhone = fullText.match(/(?:\+91[\-\s]?)?([6-9]\d{9})\b/);
    if (standalonePhone && standalonePhone[1]) {
      extractedPhone = standalonePhone[1].trim();
    }
  }

  // 4. EXTRACT DOJ (Date of Joining)
  const dojMatch = fullText.match(
    /(?:date\s*of\s*joining|joining\s*date|doj)\s*[:=\#-]?\s*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]{3,9}\s+[0-9]{4})/i
  );
  if (dojMatch && dojMatch[1]) {
    extractedDOJ = parseDateToISO(dojMatch[1].trim());
  }

  // 5. EXTRACT DOB (Date of Birth)
  const dobMatch = fullText.match(
    /(?:date\s*of\s*birth|birth\s*date|dob)\s*[:=\#-]?\s*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]{3,9}\s+[0-9]{4})/i
  );
  if (dobMatch && dobMatch[1]) {
    extractedDOB = parseDateToISO(dobMatch[1].trim());
  }

  // 6. EXTRACT GENDER
  const genderMatch = fullText.match(/(?:gender|sex)\s*[:=\#-]?\s*(male|female|other)/i);
  if (genderMatch && genderMatch[1]) {
    extractedGender = genderMatch[1].toLowerCase();
  }

  let first_name = "";
  let middle_name = "";
  let last_name = "";

  if (rawName && /resignation|designation|registr|register|emp|code|details|joining|joinee|onboarding|sheet|report/i.test(rawName)) {
    rawName = "";
  }

  if (rawName) {
    const tokens = rawName.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      first_name = tokens[0];
    } else if (tokens.length === 2) {
      first_name = tokens[0];
      last_name = tokens[1];
    } else if (tokens.length >= 3) {
      first_name = tokens[0];
      middle_name = tokens.slice(1, -1).join(" ");
      last_name = tokens[tokens.length - 1];
    }
  }

  return {
    first_name,
    middle_name,
    last_name,
    email: extractedEmail,
    phone: extractedPhone,
    doj: extractedDOJ,
    dob: extractedDOB,
    gender: extractedGender,
  };
}

function findEmployeeMatchFromAllSources({
  email,
  senderEmail,
  senderName,
  employeesList,
}: {
  email?: InboxEmail;
  senderEmail: string;
  senderName: string;
  employeesList: any[];
}): any | null {
  if (!employeesList || employeesList.length === 0) return null;

  // 0. Check Structured Table / Key-Value Extraction First
  const structured = extractStructuredReimbursementDetails(email);
  if (structured.code) {
    const normExtracted = structured.code.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normExtracted && normExtracted.length >= 2) {
      const foundByStructuredCode = employeesList.find((emp) => {
        const rawEmpCode = (emp.employee_code || "").trim();
        if (!rawEmpCode) return false;
        const normEmpCode = rawEmpCode.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normEmpCode === normExtracted ||
          rawEmpCode.toLowerCase() === structured.code!.toLowerCase() ||
          (normExtracted.length >= 4 && (normEmpCode.endsWith(normExtracted) || normExtracted.endsWith(normEmpCode)))
        );
      });
      if (foundByStructuredCode) return foundByStructuredCode;
    }
  }

  const subject = email?.subject || "";
  const snippet = email?.snippet || "";
  const bodyText = email?.text || "";
  const htmlText = email?.html ? email.html.replace(/<[^>]+>/g, " ") : "";
  const attachments = (email?.attachments || []).map((a) => a.filename || "").join(" ");

  const rawFullText = `${subject} \n ${snippet} \n ${bodyText} \n ${htmlText} \n ${senderName} \n ${senderEmail} \n ${attachments}`;
  const normFullText = rawFullText.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

  const sEmail = (senderEmail || "").toLowerCase().trim();
  const sName = (senderName || "").toLowerCase().trim();

  const extractTokens = (str: string): string[] => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
  };

  const fullTextTokens = new Set(extractTokens(rawFullText));
  const senderNameTokens = extractTokens(sName);

  // --------------------------------------------------------------------------
  // PASS 1: MATCH BY EMPLOYEE CODE (HIGHEST PRIORITY)
  // Check if an explicit Employee Code label or code exists anywhere in subject/body/sender/attachments
  // --------------------------------------------------------------------------

  // 1A. Explicit Label Extraction
  const labelRegex = /(?:emp(?:loyee)?\s*(?:code|id|no|\#)?|code|staff\s*(?:code|id))\s*[:=\#-]?\s*([a-z0-9\/\._-]+)/gi;
  let match;
  while ((match = labelRegex.exec(rawFullText)) !== null) {
    const extractedCode = match[1]?.trim();
    if (extractedCode && extractedCode.length >= 2) {
      const normExtracted = extractedCode.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normExtracted && normExtracted.length >= 2) {
        const foundEmp = employeesList.find((emp) => {
          const rawEmpCode = (emp.employee_code || "").trim();
          if (!rawEmpCode) return false;
          const normEmpCode = rawEmpCode.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normEmpCode === normExtracted || rawEmpCode.toLowerCase() === extractedCode.toLowerCase();
        });
        if (foundEmp) {
          return foundEmp;
        }
      }
    }
  }

  // 1B. Scan all database employee codes in email subject/body/sender
  const compressedFullText = rawFullText.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const emp of employeesList) {
    const rawCode = (emp.employee_code || "").trim();
    if (!rawCode || rawCode.length < 2) continue;

    const normCode = rawCode.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normCode || normCode.length < 2) continue;

    const escCode = rawCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const isAlphaNum = /[a-zA-Z]/.test(rawCode);

    if (isAlphaNum) {
      const codeRegex = new RegExp(`\\b${escCode}\\b`, "i");
      if (codeRegex.test(rawFullText)) {
        return emp;
      }
      if (normCode.length >= 3 && compressedFullText.includes(normCode)) {
        return emp;
      }
    } else if (/^\d+$/.test(rawCode) && rawCode.length >= 2) {
      const numCodeRegex = new RegExp(`(?<=\\s|^|[\\(\\[:=-])${escCode}(?=\\s|$|[\\)\\].,;:-])`, "i");
      if (numCodeRegex.test(rawFullText)) {
        return emp;
      }
      // Check if numeric code appears after "code" or "emp"
      const LabeledNumRegex = new RegExp(`(?:emp|code|id|no)\\s*[:=\\#-]?\\s*${escCode}\\b`, "i");
      if (LabeledNumRegex.test(rawFullText)) {
        return emp;
      }
    }
  }

  // --------------------------------------------------------------------------
  // PASS 2: EXACT MATCH ON SENDER DISPLAY NAME (E.g. "Ajay Singh")
  // --------------------------------------------------------------------------
  if (senderNameTokens.length >= 1) {
    const exactNameMatch = employeesList.find((emp) => {
      const fn = (emp.first_name || "").trim();
      const mn = (emp.middle_name || "").trim();
      const ln = (emp.last_name || "").trim();

      const empTokens = extractTokens(`${fn} ${mn} ${ln}`);
      if (empTokens.length === 0) return false;

      const allInSender = empTokens.every((t) => senderNameTokens.includes(t));
      const senderInEmp = senderNameTokens.every((t) => empTokens.includes(t));
      return allInSender && senderInEmp;
    });

    if (exactNameMatch) return exactNameMatch;

    const candidateMatches = employeesList.filter((emp) => {
      const fn = (emp.first_name || "").trim();
      const ln = (emp.last_name || "").trim();

      const fnTokens = extractTokens(fn);
      const lnTokens = extractTokens(ln);

      if (fnTokens.length === 0) return false;

      if (lnTokens.length > 0) {
        const fnMatch = fnTokens.every((t) => senderNameTokens.includes(t));
        const lnMatch = lnTokens.every((t) => senderNameTokens.includes(t));
        return fnMatch && lnMatch;
      } else {
        const fnMatch = fnTokens.every((t) => senderNameTokens.includes(t));
        return fnMatch && senderNameTokens.length === fnTokens.length;
      }
    });

    if (candidateMatches.length === 1) {
      return candidateMatches[0];
    } else if (candidateMatches.length > 1) {
      // Multiple candidate employees match the name (e.g. multiple Ajay Singhs)
      // Do not auto-select an arbitrary one; return null so user picks from dropdown where all candidates are listed at top
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // PASS 3: MATCH FULL NAME IN EMAIL SUBJECT / BODY TEXT
  // --------------------------------------------------------------------------
  const fullTextNameMatches = employeesList.filter((emp) => {
    const fn = (emp.first_name || "").trim();
    const ln = (emp.last_name || "").trim();

    const fnTokens = extractTokens(fn);
    const lnTokens = extractTokens(ln);

    if (fnTokens.length === 0 || lnTokens.length === 0) return false;

    const fnMatch = fnTokens.every((t) => fullTextTokens.has(t));
    const lnMatch = lnTokens.every((t) => fullTextTokens.has(t));
    return fnMatch && lnMatch;
  });

  if (fullTextNameMatches.length === 1) {
    return fullTextNameMatches[0];
  } else if (fullTextNameMatches.length > 1) {
    // Multiple full-name matches exist; return null for user selection
    return null;
  }

  // --------------------------------------------------------------------------
  // PASS 4: MATCH BY EXACT SENDER EMAIL ADDRESS
  // --------------------------------------------------------------------------
  if (sEmail) {
    const exactEmailMatch = employeesList.find((emp) => {
      const pEmail = (emp.personal_email || "").toLowerCase().trim();
      const wEmail = (emp.email || "").toLowerCase().trim();
      return (pEmail && sEmail === pEmail) || (wEmail && sEmail === wEmail);
    });
    if (exactEmailMatch) return exactEmailMatch;
  }

  // --------------------------------------------------------------------------
  // PASS 5: FIRST NAME ONLY MATCH (ONLY IF EXACTLY 1 EMPLOYEE IN DB HAS THAT FIRST NAME)
  // --------------------------------------------------------------------------
  if (senderNameTokens.length >= 1) {
    const fnCandidates = employeesList.filter((emp) => {
      const fnTokens = extractTokens(emp.first_name || "");
      if (fnTokens.length === 0) return false;
      return fnTokens.every((t) => senderNameTokens.includes(t));
    });

    if (fnCandidates.length === 1) {
      return fnCandidates[0];
    }
  }

  return null;
}

function findBestUserMatch(
  senderEmail: string,
  senderName: string,
  usersList: any[] = []
): any | null {
  if (!senderEmail && !senderName) return null;
  const sEmail = senderEmail.toLowerCase().trim();
  const sName = senderName.toLowerCase().trim();

  if (sEmail) {
    const exactEmail = usersList.find((u: any) => {
      const uEmail = (u.email || "").toLowerCase().trim();
      return uEmail && sEmail === uEmail;
    });
    if (exactEmail) return exactEmail;
  }

  if (sName) {
    const bothNamesMatch = usersList.find((u: any) => {
      const fn = (u.first_name || "").toLowerCase().trim();
      const ln = (u.last_name || "").toLowerCase().trim();
      if (!fn || !ln || fn.length < 2 || ln.length < 2) return false;
      const fullName = `${fn} ${ln}`;
      const escFn = fn.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const escLn = ln.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return (
        sName === fullName ||
        (new RegExp(`\\b${escFn}\\b`, "i").test(sName) &&
          new RegExp(`\\b${escLn}\\b`, "i").test(sName))
      );
    });
    if (bothNamesMatch) return bothNamesMatch;
  }

  return null;
}

function findBestEmployeeMatch(
  senderEmail: string,
  senderName: string,
  employeesList: any[] = []
): any | null {
  return findEmployeeMatchFromAllSources({
    senderEmail,
    senderName,
    employeesList,
  });
}

function getCompanyForEmail(
  email: InboxEmail,
  allUsersList: any[] = [],
  allEmployeesList: any[] = [],
  companiesList: any[] = []
): { companyId: string; companyName: string } {
  const senderEmail = (email.from?.address || "").toLowerCase();
  const senderName = (email.from?.name || "").toLowerCase();

  const userMatch = findBestUserMatch(senderEmail, senderName, allUsersList);
  if (userMatch && userMatch.company_id) {
    const comp = companiesList.find((c: any) => c.id === userMatch.company_id);
    if (comp) return { companyId: comp.id, companyName: comp.name };
  }

  const empMatch = findEmployeeMatchFromAllSources({
    email,
    senderEmail,
    senderName,
    employeesList: allEmployeesList,
  });
  if (empMatch && empMatch.company_id) {
    const comp = companiesList.find((c: any) => c.id === empMatch.company_id);
    if (comp) return { companyId: comp.id, companyName: comp.name };
  }

  return { companyId: "", companyName: "" };
}

function extractReimbursementDetails(
  email: InboxEmail,
  employeesList: any[] = [],
  usersList: any[] = [],
  allEmployeesList: any[] = [],
  companiesList: any[] = []
) {
  const structuredData = extractStructuredReimbursementDetails(email);
  const htmlText = email.html ? email.html.replace(/<[^>]+>/g, " ") : "";
  const text = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""} ${htmlText}`;
  const lowerText = text.toLowerCase();

  let type = "expenses";
  if (/advance|advances|diesel advance|cash advance/i.test(lowerText)) {
    type = "advances";
  } else if (/travel|flight|cab|uber|ola|taxi|train|hotel|trip/i.test(lowerText)) {
    type = "travel";
  } else if (/medical|doctor|medicine|health|hospital|pharmacy/i.test(lowerText)) {
    type = "medical";
  } else if (/loan/i.test(lowerText)) {
    type = "loan";
  }

  let amount = structuredData.amount || "";
  if (!amount) {
    const currencyMatch = text.match(/(?:rs\.?|₹|inr|\$)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (currencyMatch && currencyMatch[1]) {
      amount = currencyMatch[1].replace(/,/g, "");
    }
  }

  if (!amount) {
    const amountMatch = text.match(
      /(?:amount|total|claim|credit|advance|reimbursement|pay|kindly pay|please pay)[\s:=._-]*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (amountMatch && amountMatch[1]) {
      const candidate = amountMatch[1].replace(/,/g, "");
      if (!/^(19|20)\d\d$/.test(candidate) || /₹|rs|inr|\$/i.test(text)) {
        amount = candidate;
      }
    }
  }

  if (!amount) {
    const slashMatch = text.match(/\b([\d,]{3,10})(?:\.\d{1,2})?\s*(?:\/-|rs|inr|₹)/i);
    if (slashMatch && slashMatch[1]) {
      amount = slashMatch[1].replace(/,/g, "");
    }
  }

  if (!amount) {
    const standaloneSlash = text.match(/\b([\d,]{3,10})\s*\/-/);
    if (standaloneSlash && standaloneSlash[1]) {
      amount = standaloneSlash[1].replace(/,/g, "");
    }
  }

  const senderEmail = (email.from?.address || "").toLowerCase();
  const senderName = (email.from?.name || "").toLowerCase();

  let matchedCompanyId = "";
  let matchedCompanyName = "";
  let matchedEmployeeId = "";
  let matchedUserId = "";

  const searchEmployees = allEmployeesList.length > 0 ? allEmployeesList : employeesList;

  // PRIORITY 1: Find best employee match using code, full name, email, or unique first name
  const matchedEmp = findEmployeeMatchFromAllSources({
    email,
    senderEmail,
    senderName,
    employeesList: searchEmployees,
  });

  if (matchedEmp) {
    matchedEmployeeId = matchedEmp.id;
    matchedCompanyId = matchedEmp.company_id || "";
    matchedUserId = matchedEmp.user_id || "";
  }

  // PRIORITY 2: Fallback User search if company/user wasn't resolved
  if (!matchedCompanyId || !matchedUserId) {
    const matchedUser = findBestUserMatch(senderEmail, senderName, usersList);
    if (matchedUser) {
      if (!matchedUserId) matchedUserId = matchedUser.id;
      if (!matchedCompanyId) matchedCompanyId = matchedUser.company_id || "";
      if (!matchedEmployeeId) {
        const linkedEmp = searchEmployees.find(
          (e: any) =>
            e.user_id === matchedUser.id ||
            (e.email && e.email.toLowerCase() === matchedUser.email?.toLowerCase()) ||
            (e.personal_email && e.personal_email.toLowerCase() === matchedUser.email?.toLowerCase())
        );
        if (linkedEmp) matchedEmployeeId = linkedEmp.id;
      }
    }
  }

  if (matchedCompanyId && companiesList.length > 0) {
    const comp = companiesList.find((c: any) => c.id === matchedCompanyId);
    if (comp) {
      matchedCompanyName = comp.name;
    }
  }

  const note = `${email.subject} (From: ${email.from?.name || email.from?.address || ""})`;

  let dateStr = new Date().toISOString().split("T")[0];
  if (email.date) {
    try {
      dateStr = new Date(email.date).toISOString().split("T")[0];
    } catch (e) {
      // ignore
    }
  }

  return {
    amount,
    type,
    note,
    date: dateStr,
    name: structuredData.name || senderName || "",
    employeeId: matchedEmployeeId,
    userId: matchedUserId,
    companyId: matchedCompanyId,
    companyName: matchedCompanyName,
    location: structuredData.location || "",
  };
}

function extractBulkReimbursementItems(
  emailInput: string | InboxEmail,
  employeesList: any[] = [],
  companyId: string = "",
  defaultType: string = "expenses"
): Array<{
  id: string;
  employeeId: string;
  name: string;
  amount: string;
  type: string;
  note: string;
}> {
  let emailText = "";
  let emailHtml = "";
  if (typeof emailInput === "string") {
    emailText = emailInput;
  } else if (emailInput && typeof emailInput === "object") {
    emailText = `${emailInput.subject || ""}\n${emailInput.text || ""}\n${emailInput.snippet || ""}`;
    emailHtml = emailInput.html || "";
  }

  const items: Array<{
    id: string;
    employeeId: string;
    name: string;
    amount: string;
    type: string;
    note: string;
  }> = [];

  const companyEmployees = companyId
    ? employeesList.filter((emp: any) => emp.company_id === companyId)
    : employeesList;

  const searchEmps = employeesList.length > 0 ? employeesList : companyEmployees;
  const seenKeys = new Set<string>();

  const findEmpMatch = (text: string) => {
    if (!text || text.length < 2) return null;
    const cleanText = text.trim();
    if (/location|branch|site|bathinda|punjab|delhi|mumbai|satna|m\.p|\(punjab\)|\(mp\)|\(pb\)/i.test(cleanText)) {
      return null;
    }
    const lowerText = cleanText.toLowerCase();
    const normText = cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Match by Employee Code (Normalized & Exact)
    const codeMatch = searchEmps.find((emp: any) => {
      const rawCode = (emp.employee_code || "").trim();
      if (!rawCode || rawCode.length < 2) return false;
      const lowerCode = rawCode.toLowerCase();
      const normCode = lowerCode.replace(/[^a-z0-9]/g, "");

      if (!normCode) return false;

      if (lowerText === lowerCode || normText === normCode) return true;

      if (normText.length >= 3 && normCode.length >= 3) {
        if (normText.endsWith(normCode) || normCode.endsWith(normText)) return true;
      }

      const escCode = rawCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      if (/[a-zA-Z]/.test(rawCode)) {
        return new RegExp(`\\b${escCode}\\b`, "i").test(cleanText);
      }

      if (/^\d+$/.test(rawCode) && rawCode.length >= 2) {
        return new RegExp(`(?<=\\s|^|[\\(\\[:=-])${escCode}(?=\\s|$|[\\)\\].,;:-])`, "i").test(cleanText);
      }
      return false;
    });
    if (codeMatch) return codeMatch;

    // 2. Exact Full Name Match (first_name + middle_name + last_name)
    const exactFullNameMatch = searchEmps.find((emp: any) => {
      const fn = (emp.first_name || "").toLowerCase().trim();
      const mn = (emp.middle_name || "").toLowerCase().trim();
      const ln = (emp.last_name || "").toLowerCase().trim();

      const fullName = [fn, mn, ln].filter(Boolean).join(" ").trim();
      const firstLast = `${fn} ${ln}`.trim();

      if (!fullName || fullName.length < 2) return false;

      const normFullName = fullName.replace(/[^a-z0-9]/g, "");
      const normFirstLast = firstLast.replace(/[^a-z0-9]/g, "");

      if (lowerText === fullName || lowerText === firstLast || normText === normFullName || normText === normFirstLast) {
        return true;
      }

      const textTokens = lowerText.split(/\s+/).filter(Boolean);
      const nameTokens = fullName.split(/\s+/).filter(Boolean);
      if (nameTokens.length >= 2 && nameTokens.every((t) => textTokens.includes(t))) {
        return true;
      }

      return false;
    });
    if (exactFullNameMatch) return exactFullNameMatch;

    // 3. First Name + Last Name Both Present in text
    const bothNamesMatch = searchEmps.find((emp: any) => {
      const fn = (emp.first_name || "").toLowerCase().trim();
      const ln = (emp.last_name || "").toLowerCase().trim();
      if (!fn || !ln || fn.length < 2 || ln.length < 2) return false;
      const escFn = fn.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const escLn = ln.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return (
        new RegExp(`\\b${escFn}\\b`, "i").test(lowerText) &&
        new RegExp(`\\b${escLn}\\b`, "i").test(lowerText)
      );
    });
    if (bothNamesMatch) return bothNamesMatch;

    // 4. First Name Match Only (If 1 unique candidate, auto-select. If multiple candidates exist, return null so user chooses from dropdown where all candidates are listed at top)
    const fnCandidates = searchEmps.filter((emp: any) => {
      const fn = (emp.first_name || "").toLowerCase().trim();
      if (!fn || fn.length < 3) return false;
      const escFn = fn.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return new RegExp(`\\b${escFn}\\b`, "i").test(lowerText);
    });
    if (fnCandidates.length === 1) {
      return fnCandidates[0];
    }

    return null;
  };

  const parseAmountStr = (text: string): string => {
    if (!text) return "";
    const m = text.match(/(?:rs\.?|₹|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m && m[1]) {
      const val = m[1].replace(/,/g, "");
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0 && num < 10000000) {
        return val;
      }
    }
    return "";
  };

  const addItem = (empId: string, name: string, amount: string, rawNote?: string) => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (!empId && /location|branch|site|bathinda|punjab|delhi|mumbai|satna|m\.p|\(punjab\)|\(mp\)/i.test(name)) {
      return;
    }
    const key = `${empId || name.toLowerCase()}_${amount}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const itemType = defaultType || "expenses";
    const displayName = name.replace(/[\/\\|_-]/g, " ").trim();
    items.push({
      id: `bulk_${Math.random().toString(36).substring(2, 9)}`,
      employeeId: empId,
      name: displayName,
      amount,
      type: itemType,
      note: rawNote || `${itemType === "advances" ? "Advance" : "Expense"} claim for ${displayName}`,
    });
  };

  // STRATEGY A: Parse HTML <table> / <tr> rows if emailHtml exists
  if (emailHtml && /<tr/i.test(emailHtml)) {
    const trMatches = emailHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const trHtml of trMatches) {
      const cellMatches = trHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      if (cellMatches.length < 2) continue;

      const cellTexts = cellMatches.map((cell) =>
        cell
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/\s+/g, " ")
          .trim()
      );

      const rowJoined = cellTexts.join(" ").toLowerCase();
      if (
        /location|employee code|employee name|advance amount|s\.no|serial no|total amount/i.test(
          rowJoined
        ) &&
        !/\d{3,}/.test(rowJoined)
      ) {
        continue;
      }

      let rowAmount = "";
      let matchedEmp: any = null;
      let fallbackName = "";

      for (const cell of cellTexts) {
        if (!cell) continue;

        if (!matchedEmp) {
          const emp = findEmpMatch(cell);
          if (emp) {
            matchedEmp = emp;
          } else if (
            /[a-zA-Z]{3,}/.test(cell) &&
            !/location|branch|site|bathinda|punjab|delhi|mumbai|satna|m\.p|\(punjab\)|\(mp\)|\(pb\)|pjl|rupees|only|thousand|hundred/i.test(cell)
          ) {
            if (!fallbackName) fallbackName = cell;
          }
        }

        if (!rowAmount) {
          if (
            /₹|rs\.?|inr|\$|\d[\d,]*\s*(?:rupees|\/-|only)/i.test(cell) ||
            /^[\d,]+(?:\.\d{1,2})?$/.test(cell.trim())
          ) {
            const parsed = parseAmountStr(cell);
            if (parsed) {
              if (parsed.length === 4 && (parsed.startsWith("202") || parsed.startsWith("199"))) {
                if (/₹|rs|inr|\$|rupees|\/-/i.test(cell)) {
                  rowAmount = parsed;
                }
              } else {
                rowAmount = parsed;
              }
            }
          }
        }
      }

      if (rowAmount && (matchedEmp || (fallbackName && !/location|branch|site|bathinda|punjab/i.test(fallbackName)))) {
        const empName = matchedEmp
          ? `${matchedEmp.first_name || ""} ${matchedEmp.last_name || ""}`.trim()
          : fallbackName;
        addItem(matchedEmp ? matchedEmp.id : "", empName, rowAmount);
      }
    }
  }

  // STRATEGY B: Parse Pipe '|' or Tab '\t' separated table lines
  if (items.length === 0 && emailText) {
    const lines = emailText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes("|") || trimmed.includes("\t") || /\s{3,}/.test(trimmed)) {
        const cells = trimmed
          .split(/[|\t]|(?:\s{3,})/)
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length >= 2) {
          const rowJoined = cells.join(" ").toLowerCase();
          if (
            /location|employee code|employee name|advance amount|total/i.test(rowJoined) &&
            !/\d{3,}/.test(rowJoined)
          ) {
            continue;
          }

          let rowAmount = "";
          let matchedEmp: any = null;
          let fallbackName = "";

          for (const cell of cells) {
            if (!matchedEmp) {
              const emp = findEmpMatch(cell);
              if (emp) matchedEmp = emp;
              else if (
                /[a-zA-Z]{3,}/.test(cell) &&
                !/pjl|satna|m\.p|location|rupees|only|thousand|hundred/i.test(cell)
              ) {
                if (!fallbackName) fallbackName = cell;
              }
            }
            if (!rowAmount) {
              const parsed = parseAmountStr(cell);
              if (parsed) rowAmount = parsed;
            }
          }

          if (rowAmount && (matchedEmp || fallbackName)) {
            const empName = matchedEmp
              ? `${matchedEmp.first_name || ""} ${matchedEmp.last_name || ""}`.trim()
              : fallbackName;
            addItem(matchedEmp ? matchedEmp.id : "", empName, rowAmount);
          }
        }
      }
    }
  }

  // STRATEGY C: Preserved Old Code Pattern (Single line format e.g. "Javed: 5000", "Rahul - 5000")
  if (items.length === 0 && emailText) {
    const lines = emailText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(
        /^(?:[0-9]+\.|\-|\*)?\s*([A-Za-z0-9\s.]{2,40})[\s:=._-]+\s*(?:rs\.?|₹|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i
      );

      if (match && match[1] && match[2]) {
        const namePart = match[1].replace(/[._-]/g, "").trim();
        const amountVal = match[2].replace(/,/g, "");

        if (
          /dear|thanks|regards|team|account|ifsc|date|limit|total|sub|cif|c|note|salary|please|deduct|below/i.test(
            namePart
          )
        ) {
          continue;
        }

        const amtNum = parseFloat(amountVal);
        if (amtNum > 0 && namePart.length >= 2) {
          const empMatch = findEmpMatch(namePart) || findEmpMatch(trimmed);
          const empId = empMatch ? empMatch.id : "";
          const empName = empMatch
            ? `${empMatch.first_name || ""} ${empMatch.last_name || ""}`.trim()
            : namePart;
          addItem(empId, empName, amountVal);
        }
      }
    }
  }

  return items;
}

function parseAttendanceGrid(rawGrid: any[][]): Array<{
  employee_code?: string;
  uan_number?: string;
  name?: string;
  attendance: Record<number, string>;
}> {
  if (!rawGrid || rawGrid.length === 0) return [];

  let headerRowIndex = -1;
  let codeColIdx = -1;
  let uanColIdx = -1;
  let nameColIdx = -1;
  let dayCols: Array<{ colIdx: number; dayNum: number }> = [];

  for (let r = 0; r < Math.min(rawGrid.length, 15); r++) {
    const row = rawGrid[r];
    if (!row || !Array.isArray(row)) continue;

    let foundCode = -1;
    let foundUan = -1;
    let foundName = -1;
    const tempDays: Array<{ colIdx: number; dayNum: number }> = [];

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || "").trim();
      const cellLower = cellVal.toLowerCase();

      if (/employee\s*code|emp\s*code|emp\s*id|^code$/i.test(cellLower)) {
        foundCode = c;
      } else if (/uan\s*number|uan\s*no|^uan$/i.test(cellLower)) {
        foundUan = c;
      } else if (/employee\s*name|emp\s*name|^name$|manpower/i.test(cellLower)) {
        foundName = c;
      }

      const dayNumMatch = cellVal.match(/^(?:0?([1-9]|[12]\d|3[01]))$/);
      if (dayNumMatch) {
        const dNum = parseInt(dayNumMatch[1], 10);
        if (dNum >= 1 && dNum <= 31) {
          tempDays.push({ colIdx: c, dayNum: dNum });
        }
      } else {
        const dateMatch = cellVal.match(/\b([0-3]?\d)[-/\s]([A-Za-z]{3}|\d{1,2})[-/\s]?(\d{2,4})?\b/);
        if (dateMatch) {
          const dNum = parseInt(dateMatch[1], 10);
          if (dNum >= 1 && dNum <= 31) {
            tempDays.push({ colIdx: c, dayNum: dNum });
          }
        }
      }
    }

    if ((foundCode !== -1 || foundUan !== -1 || foundName !== -1) && tempDays.length >= 3) {
      headerRowIndex = r;
      codeColIdx = foundCode;
      uanColIdx = foundUan;
      nameColIdx = foundName;
      dayCols = tempDays;
      break;
    }
  }

  if (headerRowIndex === -1) {
    for (let r = 0; r < Math.min(rawGrid.length, 15); r++) {
      const row = rawGrid[r];
      if (!row || !Array.isArray(row)) continue;
      const tempDays: Array<{ colIdx: number; dayNum: number }> = [];

      for (let c = 0; c < row.length; c++) {
        const cellVal = String(row[c] || "").trim();
        const dMatch = cellVal.match(/^(?:0?([1-9]|[12]\d|3[01]))$/);
        if (dMatch) {
          const dNum = parseInt(dMatch[1], 10);
          tempDays.push({ colIdx: c, dayNum: dNum });
        }
      }

      if (tempDays.length >= 10) {
        headerRowIndex = r;
        dayCols = tempDays;
        const minDayCol = Math.min(...tempDays.map((d) => d.colIdx));
        for (let c = 0; c < minDayCol; c++) {
          const sampleVal = String(rawGrid[r + 1]?.[c] || "").trim();
          if (/[a-zA-Z]{3,}\d+/.test(sampleVal) && codeColIdx === -1) {
            codeColIdx = c;
          } else if (/\d{12}/.test(sampleVal) && uanColIdx === -1) {
            uanColIdx = c;
          } else if (/[a-zA-Z\s]{3,}/.test(sampleVal) && nameColIdx === -1) {
            nameColIdx = c;
          }
        }
        if (nameColIdx === -1 && codeColIdx === -1) nameColIdx = 1;
        break;
      }
    }
  }

  if (headerRowIndex === -1) return [];

  const results: Array<{
    employee_code?: string;
    uan_number?: string;
    name?: string;
    attendance: Record<number, string>;
  }> = [];

  for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    if (!row || !Array.isArray(row)) continue;

    const empCode = codeColIdx !== -1 ? String(row[codeColIdx] || "").trim() : "";
    const uanNum = uanColIdx !== -1 ? String(row[uanColIdx] || "").trim() : "";
    const empName = nameColIdx !== -1 ? String(row[nameColIdx] || "").trim() : "";

    if (!empCode && !uanNum && !empName) continue;
    if (
      /total|sub-staff|monthly salary|grand total|summary|page \d/i.test(
        `${empCode} ${uanNum} ${empName}`
      )
    ) {
      continue;
    }

    const attendance: Record<number, string> = {};
    let hasAnyValue = false;

    for (const { colIdx, dayNum } of dayCols) {
      const rawVal = String(row[colIdx] || "").trim().toUpperCase();
      let status = "P";

      if (/^\(WOF\)$|^WOF$|^WO$|^WEEKLY OFF$|^W$|^OFF$|^SUNDAY$|^SUN$/.test(rawVal)) {
        status = "W";
      } else if (/^A$|^ABSENT$/.test(rawVal)) {
        status = "A";
      } else if (/^CL$/.test(rawVal)) {
        status = "CL";
      } else if (/^PL$/.test(rawVal)) {
        status = "PL";
      } else if (/^PH$/.test(rawVal)) {
        status = "PH";
      } else if (rawVal && rawVal !== "-" && rawVal !== "0") {
        status = "P";
        hasAnyValue = true;
      }

      attendance[dayNum] = status;
    }

    if (hasAnyValue || empCode || uanNum || empName) {
      results.push({
        employee_code: empCode,
        uan_number: uanNum,
        name: empName,
        attendance,
      });
    }
  }

  return results;
}

export default function ChatMailPage() {
  const {
    companies,
    users,
    invoices,
    approvedPayrolls,
    employees,
    allUsers,
    allEmployees,
    inboxEmails,
    inboxError,
    limit,
    searchQuery = "",
    companyId: currentCompanyId,
    senderEmail,
    senderName,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const emailFetcher = useFetcher<typeof action>();
  const { toast } = useToast();
  const isSending = navigation.state === "submitting";

  const [activeTab, setActiveTab] = useState<"inbox" | "compose">("inbox");
  const [selectedEmail, setSelectedEmail] = useState<InboxEmail | null>(null);
  const [inboxSearch, setInboxSearch] = useState(searchQuery);

  useEffect(() => {
    setInboxSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "EMPLOYEE_CREATED") {
        setEmployeeModalOpen(false);
        toast({
          title: "Employee Created Successfully",
          description: `New employee created successfully${event.data.employeeCode ? ` (${event.data.employeeCode})` : ""}.`,
          variant: "success",
        });
        revalidator.revalidate();
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [revalidator, toast]);

  const handleSearchSubmit = (val: string) => {
    const params = new URLSearchParams(window.location.search);
    if (val.trim()) {
      params.set("search", val.trim());
    } else {
      params.delete("search");
    }
    navigate(`?${params.toString()}`);
  };
  const currentCompany = ((companies as any[]) || []).find((c) => c.id === currentCompanyId);
  const currentCompanyName = currentCompany?.name || "";

  const [modalCompanyId, setModalCompanyId] = useState<string>("");
  const [categoryTab, setCategoryTab] = useState<"primary" | "all" | "attendance" | "new_joinee" | "employee_left" | "advance" | "expenses" | "promotions" | "social" | "updates">("primary");
  const [starredIds, setStarredIds] = useState<Record<string, boolean>>({});

  const [mailType, setMailType] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [attachedInvoices, setAttachedInvoices] = useState<any[]>([]);
  const [attachedSalaryRuns, setAttachedSalaryRuns] = useState<any[]>([]);

  const [reimbursementModalOpen, setReimbursementModalOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeModalUrl, setEmployeeModalUrl] = useState("");
  const [employeeModalTitle, setEmployeeModalTitle] = useState("");
  const [showEmailHeaderDetails, setShowEmailHeaderDetails] = useState(false);
  const [modalStep, setModalStep] = useState<"advance" | "reimbursement">("reimbursement");
  const [reimbursementData, setReimbursementData] = useState<any>(null);
  const [bulkRows, setBulkRows] = useState<
    Array<{
      id: string;
      employeeId: string;
      name: string;
      amount: string;
      type: string;
      note: string;
      advanceId?: string;
    }>
  >([]);
  const [previewAttachment, setPreviewAttachment] = useState<any | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [excelData, setExcelData] = useState<{
    sheetNames: string[];
    activeSheet: string;
    sheets: Record<string, any[][]>;
  } | null>(null);
  const [excelSearch, setExcelSearch] = useState("");

  const handleSelectEmail = (email: InboxEmail) => {
    setSelectedEmail(email);
    const needsFetch =
      !email.html ||
      (email.hasAttachments && email.attachments?.some((a) => !a.contentUrl));

    if (needsFetch) {
      const formData = new FormData();
      formData.append("intent", "fetch_email_details");
      formData.append("uid", String(email.uid));
      emailFetcher.submit(formData, { method: "post" });
    }
  };

  useEffect(() => {
    if (
      emailFetcher.data &&
      emailFetcher.data.status === "email_details_success" &&
      (emailFetcher.data as any).email
    ) {
      const fetched = (emailFetcher.data as any).email;
      setSelectedEmail((prev) => (prev && prev.uid === fetched.uid ? fetched : prev));
    }
  }, [emailFetcher.data]);

  const handleOpenAttachmentPreview = (att: any) => {
    setPreviewAttachment(att);
    const filename = att.filename || "";
    const contentType = att.contentType || "";
    const isExcel =
      /\.(xlsx?|csv|ods)$/i.test(filename) ||
      contentType.includes("excel") ||
      contentType.includes("spreadsheet") ||
      contentType.includes("csv");

    if (isExcel) {
      setIsMaximized(true);
    }
  };

  useEffect(() => {
    if (!previewAttachment || !previewAttachment.contentUrl) {
      setExcelData(null);
      setExcelSearch("");
      return;
    }

    const filename = previewAttachment.filename || "";
    const contentType = previewAttachment.contentType || "";
    const isExcel =
      /\.(xlsx?|csv|ods)$/i.test(filename) ||
      contentType.includes("excel") ||
      contentType.includes("spreadsheet") ||
      contentType.includes("csv");

    if (!isExcel) {
      setExcelData(null);
      setExcelSearch("");
      return;
    }

    try {
      const base64Parts = previewAttachment.contentUrl.split(",");
      const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];

      if (base64Data) {
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const workbook = XLSX.read(bytes, { type: "array" });
        const sheetNames = workbook.SheetNames || [];
        const parsedSheets: Record<string, any[][]> = {};

        for (const name of sheetNames) {
          const worksheet = workbook.Sheets[name];
          if (worksheet) {
            const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
              header: 1,
              blankrows: false,
              defval: "",
            });
            parsedSheets[name] = rawRows;
          }
        }

        const initialSheet = sheetNames[0] || "";
        setExcelData({
          sheetNames,
          activeSheet: initialSheet,
          sheets: parsedSheets,
        });
      }
    } catch (err) {
      console.error("Failed to parse Excel attachment preview:", err);
      setExcelData(null);
    }
  }, [previewAttachment]);

  const handleAddBulkRow = () => {
    setBulkRows((prev) => [
      ...prev,
      {
        id: `bulk_${Math.random().toString(36).substring(2, 9)}`,
        employeeId: "",
        name: "",
        amount: "",
        type: "expenses",
        note: "",
      },
    ]);
  };

  const handleUpdateBulkRow = (id: string, field: string, value: string) => {
    setBulkRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveBulkRow = (id: string) => {
    setBulkRows((prev) => prev.filter((row) => row.id !== id));
  };

  function employeeBelongsToSite(emp: any, locationText?: string): boolean {
    if (!emp || !locationText || locationText.length < 2) return false;

    const normLoc = locationText.toLowerCase().replace(/[^a-z0-9]/g, " ");
    const locTokens = normLoc
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/location|branch|site/i.test(t));
    if (locTokens.length === 0) return false;

    const empSiteFields: string[] = [];

    const addField = (val: any) => {
      if (typeof val === "string" && val.trim()) {
        empSiteFields.push(val.toLowerCase());
      }
    };

    addField(emp.site);
    addField(emp.site_name);
    addField(emp.location);
    addField(emp.branch);
    addField(emp.city);
    addField(emp.state);

    if (emp.work_details) {
      addField(emp.work_details.site_name);
      addField(emp.work_details.site?.name);
      addField(emp.work_details.sites?.name);
      addField(emp.work_details.site?.company_locations?.name);
      addField(emp.work_details.site?.company_locations?.city);
      addField(emp.work_details.site?.company_locations?.state);
      addField(emp.work_details.sites?.company_locations?.name);
      addField(emp.work_details.sites?.company_locations?.city);
      addField(emp.work_details.sites?.company_locations?.state);
    }

    if (emp.employeeProjectAssignmentData) {
      addField(emp.employeeProjectAssignmentData.location);
      addField(emp.employeeProjectAssignmentData.project_assignment_location);
      addField(emp.employeeProjectAssignmentData.site?.name);
      addField(emp.employeeProjectAssignmentData.sites?.company_locations?.name);
    }

    const combinedEmpSiteStr = empSiteFields.join(" ");
    if (!combinedEmpSiteStr) return false;

    return locTokens.some((token) => combinedEmpSiteStr.includes(token));
  }

  const getAvailableEmployees = (
    companyIdFilter?: string,
    searchNameHint?: string,
    locationHint?: string
  ) => {
    const empList =
      (allEmployees as any[]).length > 0
        ? (allEmployees as any[])
        : (employees as any[]);
    if (!empList || empList.length === 0) return [];

    const baseList = empList;

    const locText = locationHint || reimbursementData?.location || "";
    const nameHint = (searchNameHint || reimbursementData?.name || "").trim().toLowerCase();
    const nameTokens = nameHint ? nameHint.split(/\s+/).filter((t) => t.length >= 2) : [];

    const scored = baseList.map((emp: any) => {
      let score = 0;
      const fn = (emp.first_name || "").toLowerCase();
      const mn = (emp.middle_name || "").toLowerCase();
      const ln = (emp.last_name || "").toLowerCase();
      const code = (emp.employee_code || "").toLowerCase();
      const full = `${fn} ${mn} ${ln}`.trim();

      if (nameTokens.length > 0) {
        const matchesName = nameTokens.some(
          (t) => fn.includes(t) || mn.includes(t) || ln.includes(t) || code.includes(t) || full.includes(t)
        );
        if (matchesName) score += 20;

        if (nameTokens.length >= 2 && nameTokens.every((t) => full.includes(t))) {
          score += 10;
        }
      }

      if (locText && employeeBelongsToSite(emp, locText)) {
        score += 5;
      }

      if (companyIdFilter && emp.company_id === companyIdFilter) {
        score += 1;
      }

      return { emp, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const nameA = `${a.emp.first_name || ""} ${a.emp.last_name || ""}`.trim();
      const nameB = `${b.emp.first_name || ""} ${b.emp.last_name || ""}`.trim();
      return nameA.localeCompare(nameB);
    });

    let result = scored.map((s) => s.emp);

    if (searchNameHint && searchNameHint.trim().length > 0) {
      const searchClean = searchNameHint.trim().toLowerCase();
      const tokens = searchClean.split(/\s+/).filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        const filteredBySearch = scored.filter(({ emp, score }) => {
          if (score >= 20) return true;
          const fn = (emp.first_name || "").toLowerCase();
          const mn = (emp.middle_name || "").toLowerCase();
          const ln = (emp.last_name || "").toLowerCase();
          const code = (emp.employee_code || "").toLowerCase();
          const full = `${fn} ${mn} ${ln}`.trim();
          return tokens.some((t) => full.includes(t) || code.includes(t));
        });
        if (filteredBySearch.length > 0) {
          result = filteredBySearch.map((s) => s.emp);
        }
      }
    }

    const selectedIds = new Set<string>();
    if (reimbursementData?.employeeId) selectedIds.add(reimbursementData.employeeId);
    bulkRows.forEach((r) => {
      if (r.employeeId) selectedIds.add(r.employeeId);
    });

    selectedIds.forEach((empId) => {
      const emp = empList.find((e: any) => e.id === empId);
      if (emp && !result.some((e: any) => e.id === emp.id)) {
        result = [emp, ...result];
      }
    });

    return result;
  };

  const SearchableEmployeeSelect = ({
    value,
    onValueChange,
    nameHint,
    locationHint,
    companyId,
    placeholder = "Select Employee",
    className,
  }: {
    value: string;
    onValueChange: (id: string) => void;
    nameHint?: string;
    locationHint?: string;
    companyId?: string;
    placeholder?: string;
    className?: string;
  }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const availableEmployees = useMemo(() => {
      return getAvailableEmployees(companyId, search || nameHint, locationHint);
    }, [companyId, search, nameHint, locationHint]);

    const selectedEmp = useMemo(() => {
      if (!value) return null;
      const empList = (allEmployees as any[]).length > 0 ? (allEmployees as any[]) : (employees as any[]);
      return empList.find((e: any) => e.id === value);
    }, [value]);

    const displayLabel = selectedEmp
      ? `${selectedEmp.employee_code ? `[${selectedEmp.employee_code}] ` : ""}${[selectedEmp.first_name, selectedEmp.middle_name, selectedEmp.last_name].filter(Boolean).join(" ")}${selectedEmp.site ? ` (${selectedEmp.site})` : selectedEmp.location ? ` (${selectedEmp.location})` : ""}`
      : nameHint
        ? `⚠️ Select (${nameHint})`
        : placeholder;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-9 text-xs font-normal bg-background hover:bg-accent/50 border",
              !value && nameHint ? "border-amber-500 bg-amber-500/10 text-amber-500 font-semibold" : "",
              className
            )}
          >
            <span className="truncate">{displayLabel}</span>
            <Icon name="chevron-down" className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-2 bg-card border rounded-xl shadow-2xl z-[100]" align="start">
          <div className="flex items-center border-b pb-2 mb-2 px-1 gap-2">
            <Icon name="search" className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, site..."
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground text-foreground"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {availableEmployees.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No matching employees found</div>
            ) : (
              availableEmployees.map((emp: any) => {
                const code = emp.employee_code ? `[${emp.employee_code}] ` : "";
                const empName = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || emp.email || emp.personal_email || emp.id;
                const siteStr = emp.site ? ` (${emp.site})` : emp.location ? ` (${emp.location})` : "";
                const isSelected = emp.id === value;

                return (
                  <div
                    key={emp.id}
                    onClick={() => {
                      onValueChange(emp.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors",
                      isSelected ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-accent text-foreground"
                    )}
                  >
                    <div className="truncate pr-2">
                      <span className="font-mono text-[11px] opacity-90">{code}</span>
                      <span>{empName}</span>
                      <span className="text-[10px] opacity-75 ml-1">{siteStr}</span>
                    </div>
                    {isSelected && <Icon name="check" className="h-3.5 w-3.5 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const getAvailableUsers = (companyIdFilter?: string) => {
    const userList =
      (allUsers as any[]).length > 0
        ? (allUsers as any[])
        : (users as any[]);
    if (!userList || userList.length === 0) return [];
    if (!companyIdFilter) return userList;
    const filtered = userList.filter((u) => u.company_id === companyIdFilter);
    return filtered.length > 0 ? filtered : userList;
  };

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
        const emp = fullEmployeesList.find((e) => e.id === firstMatched.employeeId);
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

      const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.text || ""}`;
      const monthYearMatch = fullText.match(
        /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[-_\s]*([2-9]\d{3})\b/i
      );

      if (monthYearMatch) {
        const mStr = monthYearMatch[1].toUpperCase();
        const yNum = parseInt(monthYearMatch[2], 10);
        const monthMap: Record<string, number> = {
          JANUARY: 1, JAN: 1, FEBRUARY: 2, FEB: 2, MARCH: 3, MAR: 3,
          APRIL: 4, APR: 4, MAY: 5, JUNE: 6, JUN: 6, JULY: 7, JUL: 7,
          AUGUST: 8, AUG: 8, SEPTEMBER: 9, SEP: 9, OCTOBER: 10, OCT: 10,
          NOVEMBER: 11, NOV: 11, DECEMBER: 12, DEC: 12,
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

      const excelAtt = email.attachments?.find((att) =>
        /\.(xlsx?|csv|ods)$/i.test(att.filename || "") ||
        (att.contentType || "").includes("excel") ||
        (att.contentType || "").includes("spreadsheet") ||
        (att.contentType || "").includes("csv")
      );

      if (excelAtt && excelAtt.contentUrl) {
        const base64Parts = excelAtt.contentUrl.split(",");
        const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
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

      sessionStorage.setItem("imported_attendance_payload", JSON.stringify(payload));

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
        description: err?.message || "Failed to parse attendance data from email.",
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

    const joineeName = [details.first_name, details.middle_name, details.last_name].filter(Boolean).join(" ");
    setEmployeeModalTitle(joineeName ? `Add Employee: ${joineeName}` : "Add New Employee");
    setEmployeeModalUrl(`/employees/create-employee?${params.toString()}`);
    setEmployeeModalOpen(true);
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectMailType = (type: string) => {
    setMailType(type);
    setAttachedInvoices([]);
    setAttachedSalaryRuns([]);

    if (type === "invoice") {
      setSubject("Invoice Details");
      setBody(
        "Dear Team,\n\nPlease find attached the invoice details for your reference.\n\nBest regards,\nCanny Ecosystem",
      );
    } else if (type === "salary") {
      setSubject("Salary Slip Details");
      setBody(
        "Dear Team,\n\nPlease find attached the salary slips for your reference.\n\nBest regards,\nCanny Ecosystem",
      );
    } else {
      setSubject("");
      setBody("");
    }
  };

  const filteredUsers = (users as any[]).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q)
    );
  });

  const filteredInboxEmails = (inboxEmails as InboxEmail[]).filter((mail) => {
    // Search is handled on the backend side via IMAP search & Remix loader
    if (currentCompanyId) {
      const compInfo = getCompanyForEmail(
        mail,
        allUsers || [],
        allEmployees || [],
        companies || []
      );
      if (compInfo.companyId && compInfo.companyId !== currentCompanyId) {
        return false;
      }
    }

    const emailCat = getEmailCategory(mail);

    if (categoryTab === "primary") {
      if (emailCat === "updates" || emailCat === "promotions") return false;
    } else if (categoryTab === "attendance") {
      if (emailCat !== "attendance") return false;
    } else if (categoryTab === "new_joinee") {
      if (emailCat !== "new_joinee") return false;
    } else if (categoryTab === "employee_left") {
      if (emailCat !== "employee_left") return false;
    } else if (categoryTab === "advance") {
      if (emailCat !== "advance") return false;
    } else if (categoryTab === "expenses") {
      if (emailCat !== "expenses") return false;
    } else if (categoryTab === "updates") {
      if (emailCat !== "updates") return false;
    } else if (categoryTab === "promotions") {
      if (emailCat !== "promotions") return false;
    }

    return true;
  });

  const toggleUser = (email: string) => {
    setSelectedUsers((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const selectAll = () => {
    setSelectedUsers(filteredUsers.map((u) => u.email));
  };

  const clearAll = () => setSelectedUsers([]);

  const handleSelectInvoice = (invoiceId: string) => {
    if (invoiceId === "none") return;
    const selectedInv = (invoices as any[]).find((inv) => inv.id === invoiceId);
    if (
      selectedInv &&
      !attachedInvoices.some((item) => item.id === selectedInv.id)
    ) {
      setAttachedInvoices((prev) => [
        ...prev,
        {
          id: selectedInv.id,
          name: selectedInv.invoice_number,
          url: selectedInv.proof,
          type: selectedInv.type,
          subject: selectedInv.subject,
          date: selectedInv.date,
        },
      ]);
    }
  };

  const handleRemoveInvoice = (id: string) => {
    setAttachedInvoices((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectSalaryRun = (payrollId: string) => {
    if (payrollId === "none") return;
    const selectedRun = (approvedPayrolls as any[]).find(
      (p) => p.id === payrollId,
    );
    if (
      selectedRun &&
      !attachedSalaryRuns.some((item) => item.id === selectedRun.id)
    ) {
      setAttachedSalaryRuns((prev) => [
        ...prev,
        {
          id: selectedRun.id,
          name:
            selectedRun.title ||
            `Payroll Run ${selectedRun.month}-${selectedRun.year}`,
          month: selectedRun.month,
          year: selectedRun.year,
        },
      ]);
    }
  };

  const handleRemoveSalaryRun = (id: string) => {
    setAttachedSalaryRuns((prev) => prev.filter((item) => item.id !== id));
  };

  useEffect(() => {
    if (!actionData) return;
    if (actionData.status === "advance_step1_success") {
      toast({ title: "Step 1 Complete: Advances Created", description: actionData.message });
      setModalStep("reimbursement");
      if (actionData.createdBulkRows) {
        setBulkRows(actionData.createdBulkRows);
      }
      if (actionData.singleAdvance) {
        setReimbursementData((prev: any) => ({
          ...prev,
          advanceId: actionData.singleAdvance.advanceId,
          amount: actionData.singleAdvance.amount,
          note: actionData.singleAdvance.note,
        }));
      }
      setReimbursementModalOpen(true);
    } else if (actionData.status === "reimbursement_success") {
      toast({ title: "Success", description: actionData.message });
      setReimbursementModalOpen(false);
      setSelectedEmail(null);
    } else if (actionData.status === "success") {
      toast({ title: "Email Sent", description: actionData.message });
      setSelectedUsers([]);
      setAttachedInvoices([]);
      setAttachedSalaryRuns([]);
      setMailType(null);
      setActiveTab("inbox");
    } else {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: actionData.message,
      });
    }
  }, [actionData]);

  const unreadCount = (inboxEmails as InboxEmail[]).filter((e) => !e.seen).length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Top Header & Tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b px-4 py-3 gap-3 bg-card/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20">
            <Icon name="email" className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              Mail Workspace
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                {senderEmail}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Inbox and mail dispatcher for {senderEmail}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1 border">
            <button
              type="button"
              onClick={() => {
                setActiveTab("inbox");
                setSelectedEmail(null);
              }}
              className={`flex items-center justify-center gap-1.5 w-32 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "inbox"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-inbox"
              >
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              Inbox
              {unreadCount > 0 && (
                <span className="ml-1 text-[10px] bg-primary text-primary-foreground font-bold px-1.5 py-0.2 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("compose")}
              className={`flex items-center justify-center gap-1.5 w-32 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "compose"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-square-pen"
              >
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
              </svg>
              Compose Mail
            </button>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg bg-background px-2.5 h-9 shadow-sm">
            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Limit:</span>
            <Select
              value={String(limit || 10)}
              onValueChange={(val) => {
                navigate(`?limit=${val}`);
              }}
            >
              <SelectTrigger className="h-7 text-xs border-none bg-transparent shadow-none px-1 py-0 gap-1 font-semibold focus:ring-0">
                <SelectValue placeholder="10" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="10">10 Mails</SelectItem>
                <SelectItem value="25">25 Mails</SelectItem>
                <SelectItem value="50">50 Mails</SelectItem>
                <SelectItem value="100">100 Mails</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => revalidator.revalidate()}
            disabled={revalidator.state === "loading"}
            className="h-9 w-32 justify-center gap-1.5 text-xs font-semibold rounded-lg shadow-sm"
            title="Refresh Inbox"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`lucide lucide-refresh-cw ${revalidator.state === "loading" ? "animate-spin" : ""
                }`}
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            <span>Sync</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "inbox" ? (
          selectedEmail ? (
            /* Gmail-Style Full Page Email Reader View */
            <div className="w-full space-y-4 animate-in fade-in duration-150">
              {/* Top Navigation Toolbar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedEmail(null)}
                    className="h-8 px-3 text-xs font-semibold gap-1.5 shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                    </svg>
                    Back to Inbox
                  </Button>

                  <div className="min-w-0 flex items-center gap-2">
                    <h2 className="text-sm md:text-base font-bold text-foreground truncate">
                      {selectedEmail.subject}
                    </h2>
                    {(() => {
                      const compInfo = getCompanyForEmail(
                        selectedEmail,
                        allUsers || [],
                        allEmployees || [],
                        companies || []
                      );
                      return compInfo.companyName ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0 flex items-center gap-1">
                          🏢 {compInfo.companyName}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground self-end sm:self-center">
                  <span>{new Date(selectedEmail.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
              </div>

              {/* Sender Header Card */}
              {(() => {
                const compInfo = getCompanyForEmail(selectedEmail, allUsers || [], allEmployees || [], companies || []);
                const empMatch = findBestEmployeeMatch(selectedEmail.from.address, selectedEmail.from.name, (allEmployees?.length ? allEmployees : employees) || []);
                return (
                  <div
                    onClick={() => setShowEmailHeaderDetails((prev) => !prev)}
                    className="bg-card border rounded-xl p-4 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0 uppercase border border-primary/30">
                          {(selectedEmail.from.name || selectedEmail.from.address || "U").charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-foreground truncate">
                              {selectedEmail.from.name || selectedEmail.from.address}
                            </h3>
                            {selectedEmail.from.name && (
                              <span className="text-xs text-muted-foreground truncate">
                                &lt;{selectedEmail.from.address}&gt;
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            to {selectedEmail.to || senderEmail}
                            <span className="text-primary text-[10px] font-semibold underline ml-1">
                              {showEmailHeaderDetails ? "Hide Details ▲" : "Show Details ▼"}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-[11px] font-medium hidden sm:inline">
                          {new Date(selectedEmail.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <div className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform duration-200 ${showEmailHeaderDetails ? "rotate-180" : ""}`}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details Drawer (Gmail Style) */}
                    {showEmailHeaderDetails && (
                      <div className="pt-3 border-t border-border space-y-1.5 text-xs text-muted-foreground bg-muted/20 p-3 rounded-xl animate-in fade-in duration-150 font-sans">
                        <div className="flex items-baseline gap-4">
                          <span className="w-20 text-right font-medium text-muted-foreground shrink-0">from:</span>
                          <span className="text-foreground font-semibold">
                            {selectedEmail.from.name ? `${selectedEmail.from.name} ` : ""}
                            &lt;{selectedEmail.from.address}&gt;
                          </span>
                        </div>
                        <div className="flex items-baseline gap-4">
                          <span className="w-20 text-right font-medium text-muted-foreground shrink-0">to:</span>
                          <span className="text-foreground font-medium">
                            Canny Groups &lt;{selectedEmail.to || senderEmail}&gt;
                          </span>
                        </div>
                        <div className="flex items-baseline gap-4">
                          <span className="w-20 text-right font-medium text-muted-foreground shrink-0">date:</span>
                          <span className="text-foreground font-medium">
                            {new Date(selectedEmail.date).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-4">
                          <span className="w-20 text-right font-medium text-muted-foreground shrink-0">subject:</span>
                          <span className="text-foreground font-medium">{selectedEmail.subject}</span>
                        </div>
                        {selectedEmail.from.address && selectedEmail.from.address.includes("@") && (
                          <>
                            <div className="flex items-baseline gap-4">
                              <span className="w-20 text-right font-medium text-muted-foreground shrink-0">mailed-by:</span>
                              <span className="text-foreground font-medium">{selectedEmail.from.address.split("@")[1]}</span>
                            </div>
                            <div className="flex items-baseline gap-4">
                              <span className="w-20 text-right font-medium text-muted-foreground shrink-0">Signed by:</span>
                              <span className="text-foreground font-medium">{selectedEmail.from.address.split("@")[1]}</span>
                            </div>
                          </>
                        )}
                        <div className="flex items-baseline gap-4">
                          <span className="w-20 text-right font-medium text-muted-foreground shrink-0">security:</span>
                          <span className="text-foreground font-medium flex items-center gap-1">
                            🔒 Standard encryption (TLS)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Reimbursement / Attendance / New Joinee Claim Banner */}
              {getReimbursementCategory(selectedEmail) === "Attendance" ? (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        📅 Attendance Sheet Detected
                        <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                          ✨ Attendance Sheet
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Attendance sheet detected in this mail. Click "Add Attendance" to open entry page pre-filled with values.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAddAttendance(selectedEmail)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shrink-0 shadow-md font-semibold"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                      <path d="M12 14v4" /><path d="M10 16h4" />
                    </svg>
                    Add Attendance
                  </Button>
                </div>
              ) : getReimbursementCategory(selectedEmail) === "New Joinee" ? (
                <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        👤 New Joinee Details Detected
                        <span className="text-[10px] font-medium bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                          ✨ New Joinee
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Gemini AI identified new joinee / employee joining details in this mail. Click "Add Employee" to navigate to employee creation.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAddEmployeeFromEmail(selectedEmail)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 shrink-0 shadow-md font-semibold"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" x2="19" y1="8" y2="14" />
                      <line x1="16" x2="22" y1="11" y2="11" />
                    </svg>
                    Add Employee
                  </Button>
                </div>
              ) : getReimbursementCategory(selectedEmail) === "Employee Left" ? (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        🚪 Employee Exit / Resignation Detected
                        <span className="text-[10px] font-medium bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20 flex items-center gap-1">
                          ✨ Employee Left
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Gemini AI identified employee exit / resignation details in this mail. Click "Process Exit" to manage employee exits.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate("/employees/exits")}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5 shrink-0 shadow-md font-semibold"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Process Exit
                  </Button>
                </div>
              ) : getReimbursementCategory(selectedEmail) ? (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        {getReimbursementCategory(selectedEmail)} Claim Detected
                        <span className="text-[10px] font-medium bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                          ✨ Gemini AI Analyzed
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Gemini AI identified this claim. Create a website reimbursement claim pre-filled with data from this mail.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleGenerateReimbursement(selectedEmail)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 shrink-0 shadow-md font-semibold"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                    Generate Reimbursement
                  </Button>
                </div>
              ) : null}

              {/* Full Page Mail Content Body */}
              <div className="bg-card border rounded-xl p-6 min-h-[350px] shadow-sm">
                {selectedEmail.html ? (
                  <div
                    className="prose dark:prose-invert max-w-none text-xs leading-relaxed bg-transparent text-foreground [&_*]:!bg-transparent [&_*]:!text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: selectedEmail.html
                        .replace(/background-color\s*:\s*([^;"]+)/gi, (match, val) => {
                          const v = val.trim().toLowerCase();
                          if (v.includes("fff") || v.includes("255") || v.includes("white")) {
                            return "background-color: transparent";
                          }
                          return match;
                        })
                        .replace(/background\s*:\s*([^;"]+)/gi, (match, val) => {
                          const v = val.trim().toLowerCase();
                          if (v.includes("fff") || v.includes("255") || v.includes("white")) {
                            return "background: transparent";
                          }
                          return match;
                        })
                    }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-xs text-foreground leading-relaxed">
                    {selectedEmail.text || selectedEmail.snippet || "(No content)"}
                  </pre>
                )}

                {/* Attachments Section */}
                {selectedEmail.hasAttachments && selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="border-t border-border pt-4 mt-6">
                    <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      Attachments ({selectedEmail.attachments.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedEmail.attachments.map((att, index) => {
                        const isImage = (att.contentType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename);
                        const isPdf = (att.contentType || "").includes("pdf") || /\.pdf$/i.test(att.filename);

                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 rounded-xl border bg-muted/30 text-xs shadow-sm hover:border-primary/40 transition-all gap-3"
                          >
                            <div
                              onClick={() => {
                                if (att.contentUrl) {
                                  handleOpenAttachmentPreview(att);
                                } else {
                                  handleSelectEmail(selectedEmail);
                                }
                              }}
                              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
                            >
                              {isImage && att.contentUrl ? (
                                <img
                                  src={att.contentUrl}
                                  alt={att.filename}
                                  className="w-10 h-10 object-cover rounded-lg border shrink-0 bg-background group-hover:scale-105 transition-transform"
                                />
                              ) : isPdf ? (
                                <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-500 font-bold flex items-center justify-center text-[10px] shrink-0 border border-red-500/20 group-hover:bg-red-500/20">
                                  PDF
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 border border-emerald-500/20 uppercase group-hover:bg-emerald-500/20">
                                  {att.filename.split(".").pop()?.slice(0, 4) || "XLS"}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <span className="font-medium text-foreground block truncate group-hover:text-primary transition-colors" title={att.filename}>
                                  {att.filename}
                                </span>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                  {(att.size / 1024).toFixed(1)} KB
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  if (att.contentUrl) {
                                    handleOpenAttachmentPreview(att);
                                  } else {
                                    handleSelectEmail(selectedEmail);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                                title={att.contentUrl ? "View / Preview Attachment" : "Loading Attachment Details..."}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={!att.contentUrl && emailFetcher.state === "submitting" ? "animate-spin" : ""}>
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>

                              {att.contentUrl ? (
                                <a
                                  href={att.contentUrl}
                                  download={att.filename}
                                  className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 font-semibold text-[11px]"
                                  title="Download Attachment"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
                                  </svg>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectEmail(selectedEmail)}
                                  className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 font-semibold text-[11px]"
                                  title="Fetching Attachment Data..."
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={emailFetcher.state === "submitting" ? "animate-spin" : ""}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full space-y-3">
              {/* Search & Inbox Filters Bar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card border rounded-xl p-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
                  <Form
                    method="get"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSearchSubmit(inboxSearch);
                    }}
                    className="relative flex-1 min-w-0 flex items-center gap-1.5"
                  >
                    <div className="relative flex-1 min-w-0">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                        <Icon name="magnifying-glass" className="h-4 w-4" />
                      </div>
                      <Input
                        name="search"
                        placeholder="Search mail by sender, subject, or content..."
                        value={inboxSearch}
                        onChange={(e) => setInboxSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSearchSubmit(inboxSearch);
                          }
                        }}
                        className="pl-9 pr-8 h-9 text-xs focus-visible:ring-0 shadow-none border-none bg-muted/40"
                      />
                      {inboxSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setInboxSearch("");
                            handleSearchSubmit("");
                          }}
                          className="absolute inset-y-0 right-2.5 flex items-center text-muted-foreground hover:text-foreground p-1 rounded-md"
                          title="Clear Search"
                        >
                          <Icon name="cross" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      className="h-9 px-3 text-xs font-semibold shrink-0"
                    >
                      Search
                    </Button>
                  </Form>
                </div>

                {/* Category Tabs: Primary, Attendance, Advance, Expenses, Updates, Promotions, All Mails */}
                <div className="flex items-center gap-1 border-t md:border-t-0 pt-2 md:pt-0 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCategoryTab("primary")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "primary"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    Primary
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("attendance")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "attendance"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    📅 Attendance
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("new_joinee")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "new_joinee"
                      ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    👤 New Joinee
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("employee_left")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "employee_left"
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    🚪 Employee Left
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("advance")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "advance"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    💸 Advance
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("expenses")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "expenses"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    💳 Expenses
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("updates")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "updates"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" x2="12" y1="8" y2="12" />
                      <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                    Updates
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("promotions")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "promotions"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    Promotions
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("all")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${categoryTab === "all"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    All Mails
                  </button>
                </div>
              </div>

              {inboxError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="cross" className="h-4 w-4" />
                    <span>IMAP Sync Warning: {inboxError}</span>
                  </div>
                </div>
              )}

              {/* Gmail-Style Email List Table */}
              <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                <div className="divide-y divide-border">
                  {filteredInboxEmails.length === 0 ? (
                    <div className="p-12 text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        No emails found
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Your inbox for {senderEmail} is empty or no messages matched your search.
                      </p>
                    </div>
                  ) : (
                    filteredInboxEmails.map((email) => {
                      const isStarred = !!starredIds[email.id];
                      const categoryTag = getReimbursementCategory(email);
                      const emailCompany = getCompanyForEmail(email, allUsers || [], allEmployees || [], companies || []);

                      let rowBgClass = !email.seen ? "bg-card hover:bg-muted/60 border-l-transparent font-semibold text-foreground" : "bg-card/40 hover:bg-muted/60 border-l-transparent text-muted-foreground";
                      if (categoryTag === "Attendance") {
                        rowBgClass = "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-emerald-500 font-medium text-foreground shadow-sm";
                      } else if (categoryTag === "New Joinee") {
                        rowBgClass = "bg-indigo-500/10 hover:bg-indigo-500/15 border-l-indigo-500 font-medium text-foreground shadow-sm";
                      } else if (categoryTag === "Employee Left") {
                        rowBgClass = "bg-rose-500/10 hover:bg-rose-500/15 border-l-rose-500 font-medium text-foreground shadow-sm";
                      } else if (categoryTag) {
                        rowBgClass = "bg-primary/10 hover:bg-primary/15 border-l-primary font-medium text-foreground shadow-sm";
                      } else if (emailCompany.companyName) {
                        rowBgClass = "bg-blue-500/10 hover:bg-blue-500/15 border-l-blue-500 font-medium text-foreground shadow-sm";
                      }

                      return (
                        <div
                          key={email.id}
                          onClick={() => handleSelectEmail(email)}
                          className={`group flex items-center px-4 py-3 text-xs cursor-pointer transition-colors border-l-3 ${rowBgClass}`}
                        >
                          {/* Checkbox & Star */}
                          <div className="flex items-center gap-3 pr-3 flex-shrink-0">
                            <input
                              type="checkbox"
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-border h-3.5 w-3.5 cursor-pointer accent-primary"
                            />
                            <button
                              type="button"
                              onClick={(e) => toggleStar(email.id, e)}
                              className="text-muted-foreground hover:text-yellow-500 transition-colors"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill={isStarred ? "#eab308" : "none"}
                                stroke={isStarred ? "#eab308" : "currentColor"}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                          </div>

                          {/* Sender */}
                          <div className="w-44 md:w-56 truncate flex-shrink-0 font-medium text-foreground pr-2">
                            {email.from.name || email.from.address}
                          </div>

                          {/* Subject & Snippet */}
                          <div className="flex-1 min-w-0 flex items-center gap-2 pr-4 truncate">
                            {emailCompany.companyName && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20 flex-shrink-0 flex items-center gap-1" title={`Company: ${emailCompany.companyName}`}>
                                🏢 {emailCompany.companyName}
                              </span>
                            )}
                            {categoryTag === "Attendance" ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex-shrink-0 flex items-center gap-1">
                                📅 Attendance
                              </span>
                            ) : categoryTag === "New Joinee" ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex-shrink-0 flex items-center gap-1">
                                👤 New Joinee
                              </span>
                            ) : categoryTag === "Employee Left" ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex-shrink-0 flex items-center gap-1">
                                🚪 Employee Left
                              </span>
                            ) : categoryTag ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 flex-shrink-0 flex items-center gap-1">
                                {categoryTag}
                              </span>
                            ) : getEmailCategory(email) === "updates" ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex-shrink-0 flex items-center gap-1">
                                ℹ️ Updates
                              </span>
                            ) : null}
                            <span className="font-semibold text-foreground truncate">
                              {email.subject}
                            </span>
                            <span className="text-muted-foreground truncate hidden md:inline">
                              - {email.snippet}
                            </span>
                          </div>

                          {/* Attachments Indicator */}
                          {email.hasAttachments && (
                            <div className="pr-3 text-muted-foreground flex-shrink-0">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-paperclip"
                              >
                                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                              </svg>
                            </div>
                          )}

                          {/* Date */}
                          <div className="w-16 text-right flex-shrink-0 text-[11px] font-medium text-muted-foreground">
                            {formatDate(email.date)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )
        ) : (
          /* Compose Mail View */
          <div className="w-full space-y-6 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Icon name="email" className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Compose Mail
                </h1>
                <p className="text-xs text-muted-foreground">
                  Send emails and attachments to your team
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Mail Category
                </label>
                <p className="text-xs text-muted-foreground">
                  Select what type of email/attachment you are sending.
                </p>
              </div>

              <Select
                value={mailType || undefined}
                onValueChange={handleSelectMailType}
              >
                <SelectTrigger className="w-full h-10 bg-background border-border">
                  <SelectValue placeholder="Choose what you want to send..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice PDF</SelectItem>
                  <SelectItem value="salary">Salary Slips</SelectItem>
                  <SelectItem value="custom">Custom / Blank Mail</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!mailType ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card/30">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Icon name="email" className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  No Category Selected
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Please choose what you want to send from the dropdown above to open
                  the composer form.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {mailType === "invoice" && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Select Invoice to Attach
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Choose from existing invoices to attach as PDF.
                      </p>
                    </div>

                    <Select onValueChange={handleSelectInvoice}>
                      <SelectTrigger className="w-full h-10 bg-background border-border">
                        <SelectValue placeholder="Select an invoice..." />
                      </SelectTrigger>
                      <SelectContent>
                        {invoices.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No invoices found
                          </SelectItem>
                        ) : (
                          invoices.map((inv: any) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.invoice_number} ({inv.type} ·{" "}
                              {new Date(inv.date).toLocaleDateString("en-IN")})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>

                    {attachedInvoices.length > 0 && (
                      <div className="space-y-2 mt-4 pt-4 border-t border-border">
                        <h3 className="text-xs font-semibold text-foreground">
                          Attached Invoices
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {attachedInvoices.map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5 shadow-sm text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-foreground block truncate">
                                  {inv.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground block truncate">
                                  {inv.subject || "No Subject"}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveInvoice(inv.id)}
                                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors ml-2"
                              >
                                <Icon name="cross" className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {mailType === "salary" && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Select Salary Payroll Run
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Choose from approved payroll runs to attach salary slips as PDF.
                      </p>
                    </div>

                    <Select onValueChange={handleSelectSalaryRun}>
                      <SelectTrigger className="w-full h-10 bg-background border-border">
                        <SelectValue placeholder="Select a payroll run..." />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedPayrolls.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No approved payrolls found
                          </SelectItem>
                        ) : (
                          approvedPayrolls.map((run: any) => (
                            <SelectItem key={run.id} value={run.id}>
                              {run.title || `Payroll Run ${run.month}-${run.year}`}{" "}
                              (Rs. {run.total_net_amount?.toLocaleString("en-IN")})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Form
                  method="post"
                  encType="multipart/form-data"
                  className="space-y-5"
                >
                  <input
                    type="hidden"
                    name="selectedInvoices"
                    value={JSON.stringify(attachedInvoices)}
                  />
                  <input
                    type="hidden"
                    name="selectedSalaryRuns"
                    value={JSON.stringify(attachedSalaryRuns)}
                  />

                  <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      From (Sender)
                    </label>
                    <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg bg-muted/40 border border-border">
                      <Icon
                        name="email"
                        className="h-4 w-4 text-muted-foreground flex-shrink-0"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {senderName} &lt;{senderEmail}&gt;
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        To (Recipients)
                      </label>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-primary hover:underline font-medium"
                        >
                          Select All
                        </button>
                        <span className="text-muted-foreground">·</span>
                        <button
                          type="button"
                          onClick={clearAll}
                          className="text-muted-foreground hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Icon
                          name="magnifying-glass"
                          className="h-4 w-4 text-muted-foreground"
                        />
                      </div>
                      <Input
                        placeholder="Search users..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9 text-sm focus-visible:ring-0 shadow-none mb-2"
                      />
                    </div>

                    <Select
                      onValueChange={(email) => {
                        if (
                          email &&
                          email !== "none" &&
                          !selectedUsers.includes(email)
                        ) {
                          setSelectedUsers((prev) => [...prev, email]);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full h-10 bg-background border-border">
                        <SelectValue placeholder="Select a recipient..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredUsers.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No users found
                          </SelectItem>
                        ) : (
                          filteredUsers.map((u: any) => {
                            const fullName =
                              [u.first_name, u.last_name]
                                .filter(Boolean)
                                .join(" ") || u.email;
                            return (
                              <SelectItem
                                key={u.id}
                                value={u.email}
                                disabled={selectedUsers.includes(u.email)}
                              >
                                {fullName} ({u.email})
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>

                    {selectedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                        {selectedUsers.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full"
                          >
                            {email}
                            <button
                              type="button"
                              onClick={() => toggleUser(email)}
                              className="hover:opacity-70"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="hidden"
                    name="to"
                    value={selectedUsers.join(",")}
                  />

                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Subject
                    </label>
                    <Input
                      name="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter email subject..."
                      required
                      className="h-10 focus-visible:ring-0 shadow-none"
                    />
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Message
                    </label>
                    <textarea
                      name="body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      required
                      rows={8}
                      placeholder="Write your message here..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Attachments (PDF, Excel, Invoices, etc.)
                    </label>
                    <Input
                      type="file"
                      name="attachments"
                      multiple
                      className="h-10 focus-visible:ring-0 shadow-none cursor-pointer file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-1">
                    <Button
                      type="submit"
                      disabled={isSending || selectedUsers.length === 0}
                      className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isSending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-foreground" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Icon name="email" className="h-4 w-4" />
                          Send Email
                        </>
                      )}
                    </Button>
                  </div>
                </Form>
              </div>
            )}
          </div>
        )}
      </div>



      {/* Add Reimbursement Dialog Modal */}
      {reimbursementModalOpen && reimbursementData && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setReimbursementModalOpen(false)}
        >
          <div
            className={`bg-card border rounded-2xl ${bulkRows.length > 0 ? "max-w-3xl" : "max-w-xl"} w-full flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between bg-card/80">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  {modalStep === "advance" ? (
                    <>
                      <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[11px] uppercase font-extrabold tracking-wider border border-primary/30">
                        Step 1 of 2
                      </span>
                      {bulkRows.length > 0
                        ? `Add Bulk Advances (${bulkRows.length} Claims Detected)`
                        : "Add Employee Advance"}
                    </>
                  ) : (
                    <>
                      {bulkRows.length > 0
                        ? `Add Bulk Reimbursements (${bulkRows.length} Claims Detected)`
                        : "Add Reimbursement"}
                    </>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {modalStep === "advance"
                    ? "Step 1: Create Employee Advances in Employee Details tab. Submitting will create advances and automatically open Step 2 for Reimbursement claims."
                    : "Review pre-filled reimbursement claim details autofilled from email and click Submit to create."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReimbursementModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Icon name="cross" className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <Form method="post" className="p-6 space-y-4">
              <input
                type="hidden"
                name="intent"
                value={modalStep === "advance" ? "create_advances_step1" : "create_reimbursement"}
              />
              {reimbursementData?.advanceId && (
                <input
                  type="hidden"
                  name="advance_id"
                  value={reimbursementData.advanceId}
                />
              )}
              {bulkRows.length > 0 && (
                <input
                  type="hidden"
                  name="bulk_items_json"
                  value={JSON.stringify(bulkRows)}
                />
              )}

              {bulkRows.length > 0 ? (
                /* BULK REIMBURSEMENT MODE UI */
                <div className="space-y-4">
                  {modalStep === "advance" ? (
                    <div className="p-3 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-primary font-medium">
                      <span>
                        <strong>Step 1 (Advance Creation):</strong> Creating Advance records in Employee Details tab for {bulkRows.length} employee(s).
                      </span>
                      <span className="font-bold text-xs bg-primary/20 px-2 py-0.5 rounded-md border border-primary/20 shrink-0">
                        Total: ₹{bulkRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-primary font-medium">
                      <span>
                        <strong>Reimbursement Claim:</strong> Generating Reimbursement claims autofilled from email.
                      </span>
                      <span className="font-bold text-xs bg-primary/20 px-2 py-0.5 rounded-md border border-primary/20 shrink-0">
                        Total: ₹{bulkRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Submitted Date</label>
                      <Input
                        key={`date_${reimbursementData?.date || ""}`}
                        type="date"
                        name="submitted_date"
                        defaultValue={reimbursementData?.date}
                        required
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Company</label>
                      <Select
                        name="company_id"
                        value={modalCompanyId}
                        onValueChange={(val) => {
                          setModalCompanyId(val);
                          if (reimbursementData) {
                            const availEmps = getAvailableEmployees(val);
                            const isEmpValid = availEmps.some((e: any) => e.id === reimbursementData.employeeId);
                            const newEmpId = isEmpValid ? reimbursementData.employeeId : (availEmps[0]?.id || "");
                            const availUsers = getAvailableUsers(val);
                            const isUserValid = availUsers.some((u: any) => u.id === reimbursementData.userId);
                            const newUserId = isUserValid ? reimbursementData.userId : (availUsers[0]?.id || "");
                            setReimbursementData((prev: any) => ({
                              ...prev,
                              companyId: val,
                              employeeId: newEmpId,
                              userId: newUserId,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select Company" />
                        </SelectTrigger>
                        <SelectContent>
                          {((companies as any[]) || []).map((comp) => (
                            <SelectItem key={comp.id} value={comp.id}>
                              {comp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Approved By</label>
                      <Select
                        key={`user_bulk_${modalCompanyId}_${reimbursementData?.userId || ""}`}
                        name="user_id"
                        value={reimbursementData?.userId || ""}
                        onValueChange={(val) =>
                          setReimbursementData((prev: any) => ({ ...prev, userId: val }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select Authority" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableUsers(modalCompanyId).map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.email} {[u.first_name, u.last_name].filter(Boolean).join(" ") ? `(${[u.first_name, u.last_name].filter(Boolean).join(" ")})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Bulk Claim Rows Table */}
                  <div className="border rounded-xl overflow-hidden bg-background">
                    <div className="bg-muted/60 px-3 py-2 border-b grid grid-cols-12 gap-2 text-[11px] font-bold text-muted-foreground uppercase">
                      <div className="col-span-4">Employee</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-2">Amount (₹)</div>
                      <div className="col-span-3">Note</div>
                      <div className="col-span-1 text-center">Del</div>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y">
                      {bulkRows.map((row) => (
                        <div key={row.id} className="p-2 grid grid-cols-12 gap-2 items-center text-xs hover:bg-muted/30">
                          <div className="col-span-4">
                            <SearchableEmployeeSelect
                              value={row.employeeId || ""}
                              onValueChange={(val) => handleUpdateBulkRow(row.id, "employeeId", val)}
                              nameHint={row.name}
                              locationHint={reimbursementData?.location}
                              companyId={modalCompanyId}
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="col-span-2">
                            <Select
                              value={row.type}
                              onValueChange={(val) => handleUpdateBulkRow(row.id, "type", val)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="advances">Advances</SelectItem>
                                <SelectItem value="expenses">Expenses</SelectItem>
                                <SelectItem value="travel">Travel</SelectItem>
                                <SelectItem value="medical">Medical</SelectItem>
                                <SelectItem value="loan">Loan</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={row.amount}
                              onChange={(e) => handleUpdateBulkRow(row.id, "amount", e.target.value)}
                              placeholder="Amount"
                              className="h-8 text-xs font-semibold text-foreground"
                            />
                          </div>

                          <div className="col-span-3">
                            <Input
                              type="text"
                              value={row.note}
                              onChange={(e) => handleUpdateBulkRow(row.id, "note", e.target.value)}
                              placeholder="Note"
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="col-span-1 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveBulkRow(row.id)}
                              className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remove Row"
                            >
                              <Icon name="cross" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-2 border-t bg-muted/20 flex items-center justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddBulkRow}
                        className="h-7 text-xs font-semibold gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      >
                        + Add Claim Row
                      </Button>
                      <span className="text-xs text-muted-foreground font-medium">
                        {bulkRows.length} {bulkRows.length === 1 ? "claim row" : "claim rows"} configured
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* SINGLE REIMBURSEMENT MODE UI */
                <div className="space-y-4">
                  <div className="p-3 rounded-xl border border-primary/30 bg-primary/10 flex items-center gap-2 text-xs text-primary font-medium">
                    <span><strong>Autofilled from Email:</strong> Review pre-filled fields and click Submit to create reimbursement.</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Submitted Date</label>
                      <Input
                        key={`single_date_${reimbursementData?.date || ""}`}
                        type="date"
                        name="submitted_date"
                        defaultValue={reimbursementData?.date}
                        required
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Status</label>
                      <Select name="status" defaultValue="approved">
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Type</label>
                      <Select
                        key={`single_type_${reimbursementData?.type || ""}`}
                        name="type"
                        value={reimbursementData?.type || "expenses"}
                        onValueChange={(val) =>
                          setReimbursementData((prev: any) => ({ ...prev, type: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expenses">Expenses</SelectItem>
                          <SelectItem value="advances">Advances</SelectItem>
                          <SelectItem value="travel">Travel</SelectItem>
                          <SelectItem value="medical">Medical</SelectItem>
                          <SelectItem value="loan">Loan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Note</label>
                      <Input
                        key={`single_note_${reimbursementData?.note || ""}`}
                        name="note"
                        defaultValue={reimbursementData?.note}
                        placeholder="Enter Note"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Company</label>
                      <Select
                        name="company_id"
                        value={modalCompanyId}
                        onValueChange={(val) => {
                          setModalCompanyId(val);
                          if (reimbursementData) {
                            const availEmps = getAvailableEmployees(val);
                            const isEmpValid = availEmps.some((e: any) => e.id === reimbursementData.employeeId);
                            const newEmpId = isEmpValid ? reimbursementData.employeeId : (availEmps[0]?.id || "");
                            const availUsers = getAvailableUsers(val);
                            const isUserValid = availUsers.some((u: any) => u.id === reimbursementData.userId);
                            const newUserId = isUserValid ? reimbursementData.userId : (availUsers[0]?.id || "");
                            setReimbursementData((prev: any) => ({
                              ...prev,
                              companyId: val,
                              employeeId: newEmpId,
                              userId: newUserId,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Company" />
                        </SelectTrigger>
                        <SelectContent>
                          {((companies as any[]) || []).map((comp) => (
                            <SelectItem key={comp.id} value={comp.id}>
                              {comp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Select Employee</label>
                      <SearchableEmployeeSelect
                        value={reimbursementData?.employeeId || ""}
                        onValueChange={(val) =>
                          setReimbursementData((prev: any) => ({ ...prev, employeeId: val }))
                        }
                        nameHint={reimbursementData?.name}
                        locationHint={reimbursementData?.location}
                        companyId={modalCompanyId}
                        className="h-9 text-xs"
                      />
                      <input type="hidden" name="employee_id" value={reimbursementData?.employeeId || ""} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Amount</label>
                      <Input
                        key={`single_amount_${reimbursementData?.amount || ""}`}
                        type="number"
                        name="amount"
                        step="0.01"
                        defaultValue={reimbursementData?.amount}
                        placeholder="Enter Amount"
                        required
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Approved By</label>
                      <Select
                        key={`single_user_${modalCompanyId}_${reimbursementData?.userId || ""}`}
                        name="user_id"
                        value={reimbursementData?.userId || ""}
                        onValueChange={(val) =>
                          setReimbursementData((prev: any) => ({ ...prev, userId: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Authority" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableUsers(modalCompanyId).map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.email} {[u.first_name, u.last_name].filter(Boolean).join(" ") ? `(${[u.first_name, u.last_name].filter(Boolean).join(" ")})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReimbursementModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSending || (bulkRows.length > 0 && bulkRows.length === 0)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold px-4"
                >
                  {isSending
                    ? "Submitting..."
                    : modalStep === "advance"
                      ? bulkRows.length > 0
                        ? `Create ${bulkRows.length} Advances & Continue to Reimbursements →`
                        : "Create Advance & Continue →"
                      : bulkRows.length > 0
                        ? `Submit ${bulkRows.length} Reimbursements`
                        : "Submit Reimbursement"}
                </Button>
              </div>
            </Form>
          </div>
        </div>
      )}
      {/* Attachment Preview Lightbox Modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={() => {
            setPreviewAttachment(null);
            setIsMaximized(false);
          }}
        >
          <div
            className={`bg-card border shadow-2xl flex flex-col overflow-hidden transition-all duration-200 animate-in zoom-in-95 ${isMaximized
              ? "fixed inset-0 z-50 w-screen h-screen rounded-none max-w-none max-h-none"
              : "max-w-[98vw] w-full h-[94vh] rounded-2xl"
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="p-3 border-b flex items-center justify-between bg-card/90 shrink-0">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/20">
                  {excelData ? "XLS" : "FILE"}
                </div>
                <h3 className="text-sm font-bold text-foreground truncate" title={previewAttachment.filename}>
                  {previewAttachment.filename}
                </h3>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                  {(previewAttachment.size / 1024).toFixed(1)} KB
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {previewAttachment.contentUrl && (
                  <a
                    href={previewAttachment.contentUrl}
                    download={previewAttachment.filename}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                    Download
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title={isMaximized ? "Restore Window" : "Maximize Full Screen"}
                >
                  {isMaximized ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewAttachment(null);
                    setIsMaximized(false);
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Icon name="cross" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Lightbox Body */}
            <div className="flex-1 overflow-hidden flex flex-col bg-muted/20">
              {excelData ? (
                /* AUTHENTIC EXCEL SPREADSHEET VIEWER */
                <div className="flex flex-col w-full h-full bg-background overflow-hidden">
                  {/* Spreadsheet Header Bar */}
                  <div className="p-2 border-b bg-card flex items-center justify-between gap-3 text-xs shrink-0">
                    {/* Excel Sheet Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5">
                      {excelData.sheetNames.map((sheet) => {
                        const isActive = excelData.activeSheet === sheet;
                        return (
                          <button
                            key={sheet}
                            type="button"
                            onClick={() =>
                              setExcelData((prev) =>
                                prev ? { ...prev, activeSheet: sheet } : null
                              )
                            }
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${isActive
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold shadow-sm"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            </svg>
                            {sheet}
                          </button>
                        );
                      })}
                    </div>

                    {/* Filter Search Input */}
                    <div className="relative w-64 shrink-0">
                      <Input
                        placeholder="Search sheet rows..."
                        value={excelSearch}
                        onChange={(e) => setExcelSearch(e.target.value)}
                        className="h-8 text-xs pr-7"
                      />
                      {excelSearch && (
                        <button
                          type="button"
                          onClick={() => setExcelSearch("")}
                          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs font-bold"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Excel Table Grid */}
                  <div className="flex-1 overflow-auto bg-background p-1">
                    {(() => {
                      const rows = excelData.sheets[excelData.activeSheet] || [];
                      if (rows.length === 0) {
                        return (
                          <div className="p-12 text-center text-xs text-muted-foreground">
                            This worksheet is empty.
                          </div>
                        );
                      }

                      const q = excelSearch.toLowerCase().trim();
                      const filteredRows = q
                        ? rows.filter((r) =>
                          r.some((cell) =>
                            String(cell || "").toLowerCase().includes(q)
                          )
                        )
                        : rows;

                      const maxCols = Math.max(0, ...filteredRows.map((r) => r.length));
                      const colCount = Math.max(maxCols, 12);

                      return (
                        <div className="overflow-auto max-h-full border rounded-lg shadow-inner bg-background">
                          <table className="w-full border-collapse text-left text-xs font-mono select-text">
                            {/* Standard Excel Column Headers (A, B, C, D, E, F, G, H...) */}
                            <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-md border-b text-center text-[11px] font-bold text-muted-foreground shadow-sm">
                              <tr>
                                <th className="w-12 px-2 py-1.5 border-r border-b text-center font-bold text-muted-foreground bg-muted/80 sticky left-0 z-30 select-none">
                                  #
                                </th>
                                {Array.from({ length: colCount }).map((_, cIdx) => (
                                  <th
                                    key={cIdx}
                                    className="px-3 py-1.5 border-r border-b font-bold text-foreground bg-muted/60 whitespace-nowrap min-w-[130px] uppercase text-center select-none"
                                  >
                                    {getExcelColName(cIdx)}
                                  </th>
                                ))}
                              </tr>
                            </thead>

                            <tbody className="divide-y font-sans text-foreground text-xs">
                              {filteredRows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className="hover:bg-muted/50 transition-colors group"
                                >
                                  {/* Row Number (1, 2, 3...) */}
                                  <td className="w-12 px-2 py-1.5 border-r border-b text-center text-[11px] font-bold text-muted-foreground bg-muted/30 sticky left-0 z-10 select-none group-hover:bg-muted/60">
                                    {rIdx + 1}
                                  </td>

                                  {/* Data Cells */}
                                  {Array.from({ length: colCount }).map(
                                    (_, cIdx) => {
                                      const val =
                                        row[cIdx] !== undefined
                                          ? String(row[cIdx])
                                          : "";
                                      const isNum =
                                        !isNaN(Number(val)) && val.trim() !== "";

                                      return (
                                        <td
                                          key={cIdx}
                                          className={`px-3 py-1.5 border-r border-b whitespace-nowrap max-w-xs overflow-hidden text-ellipsis font-medium ${isNum
                                            ? "text-right font-mono text-foreground"
                                            : "text-left"
                                            }`}
                                          title={val}
                                        >
                                          {val}
                                        </td>
                                      );
                                    }
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : ((previewAttachment.contentType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(previewAttachment.filename)) && previewAttachment.contentUrl ? (
                <img
                  src={previewAttachment.contentUrl}
                  alt={previewAttachment.filename}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg border shadow-lg bg-background"
                />
              ) : ((previewAttachment.contentType || "").includes("pdf") || /\.pdf$/i.test(previewAttachment.filename)) && previewAttachment.contentUrl ? (
                <iframe
                  src={previewAttachment.contentUrl}
                  title={previewAttachment.filename}
                  className="w-full h-[75vh] rounded-lg border bg-background"
                />
              ) : (
                <div className="text-center p-8 space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a1 1 0 0 0 1 1h4" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground truncate">{previewAttachment.filename}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Direct preview is not supported for {previewAttachment.filename.split(".").pop()?.toUpperCase()} files. Click download below to save and open.
                    </p>
                  </div>
                  {previewAttachment.contentUrl && (
                    <a
                      href={previewAttachment.contentUrl}
                      download={previewAttachment.filename}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 shadow-md transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
                      </svg>
                      Download {previewAttachment.filename}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Create Employee Dialog Modal */}
      {employeeModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-card text-card-foreground border shadow-2xl rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b bg-muted/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="16" x2="22" y1="11" y2="11" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    {employeeModalTitle}
                    <span className="text-[10px] font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/30">
                      Autofilled from Email
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Review pre-filled details from email and complete employee registration.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEmployeeModalOpen(false)}
                className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span className="sr-only">Close</span>
              </Button>
            </div>

            {/* Modal Body: Embedded Form */}
            <div className="flex-1 w-full bg-background relative overflow-hidden">
              {employeeModalUrl ? (
                <iframe
                  src={employeeModalUrl}
                  className="w-full h-full border-none"
                  title="Create Employee Form"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
