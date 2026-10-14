import {
  json,
  type ActionFunctionArgs,
} from "@remix-run/node";
import {
  unstable_parseMultipartFormData as parseMultipartFormData,
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
} from "@remix-run/node";
import { SENDER_NAME, getSenderEmail, createTransporter } from "@/utils/server/mail.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { safeRedirect } from "@/utils/server/http.server";
import { DEFAULT_ROUTE } from "@/constant";
import { hasPermission, readRole, isGoodStatus } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { fetchSingleEmailDetails } from "@/utils/server/imap.server";
import {
  createReimbursementsFromData,
  createReimbursementFromAdvance,
} from "@canny_ecosystem/supabase/mutations";
import { generateInvoicePDFBuffer } from "../payroll+/invoices+/$invoiceId.preview-invoice";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  updateAutoReplyConfig,
  getGmailAutoReplyStatus,
  triggerManualAutoReplyCheck,
} from "@/utils/server/gmail-auto-reply.server";

export async function handleMailAction({ request }: ActionFunctionArgs) {
  const { supabase: sb, headers } = getSupabaseWithHeaders({ request });
  const supabase: any = sb;
  const { user } = await getUserCookieOrFetchUser(request, supabase);

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

    if (intent === "update_auto_reply_config") {
      try {
        const enabled = rawForm.get("enabled") === "true";
        const keyword = ((rawForm.get("keyword") as string) || "AUTO_REPLY").trim();
        const replyMessage = ((rawForm.get("replyMessage") as string) || "Hello").trim();
        const pollIntervalSeconds = Number(rawForm.get("pollIntervalSeconds")) || 30;

        const updatedConfig = updateAutoReplyConfig({
          enabled,
          keyword,
          replyMessage,
          pollIntervalSeconds,
        });

        return json({
          status: "auto_reply_config_updated",
          message: enabled
            ? `Auto-reply is now RUNNING. Monitoring for emails containing "${keyword}".`
            : "Auto-reply is now DISABLED.",
          config: updatedConfig,
          autoReplyStatus: getGmailAutoReplyStatus(),
        });
      } catch (err: any) {
        return json({ status: "error", message: err?.message || "Failed to update auto reply settings." });
      }
    }

    if (intent === "sync_auto_reply_worker") {
      try {
        const result = await triggerManualAutoReplyCheck();
        return json({
          status: "auto_reply_sync_success",
          message: `Checked ${result.checkedCount} email(s). Auto-replies sent: ${result.repliedCount}.`,
          result,
          autoReplyStatus: getGmailAutoReplyStatus(),
        });
      } catch (err: any) {
        return json({ status: "error", message: err?.message || "Manual auto-reply check failed." });
      }
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


