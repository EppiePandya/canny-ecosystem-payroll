import { useState, useEffect } from "react";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useRevalidator,
  useNavigate,
  useFetcher,
  useSearchParams,
} from "@remix-run/react";
import { SENDER_NAME, getSenderEmail } from "@/utils/server/mail.server";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getCompanies,
  getUsersByCompanyId,
  getEmployeesByCompanyId,
  getInvoicesByCompanyId,
  getApprovedPayrollsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { safeRedirect } from "@/utils/server/http.server";
import { DEFAULT_ROUTE } from "@/constant";
import { hasPermission, readRole } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { fetchInboxEmails, type InboxEmail } from "@/utils/server/imap.server";

import { handleMailAction } from "./mail.server";
import { MailHeader } from "@/components/mail/mail-header";
import { MailListView } from "@/components/mail/mail-list-view";
import { MailDetailView } from "@/components/mail/mail-detail-view";
import { MailComposeView } from "@/components/mail/mail-compose-view";
import {
  MailReimbursementModal,
  type BulkRowItem,
} from "@/components/mail/mail-reimbursement-modal";
import { MailAttachmentPreviewModal } from "@/components/mail/mail-attachment-preview-modal";
import { MailEmployeeModal } from "@/components/mail/mail-employee-modal";
import { useMailDetailActions } from "@/components/mail/use-mail-detail-actions";
import { useMailInbox } from "@/components/mail/use-mail-inbox";
import { getGmailAutoReplyStatus } from "@/utils/server/gmail-auto-reply.server";
import {
  MailAutoReplyConfig,
  type AutoReplyStatusData,
} from "@/components/mail/mail-auto-reply-config";

// ─── Loader ────────────────────────────────────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase: sb, headers } = getSupabaseWithHeaders({ request });
  const supabase = sb as any;
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (
    !hasPermission(user?.role!, `${readRole}:${attribute.chat}`) &&
    !hasPermission(user?.role!, `${readRole}:${attribute.approvals}`)
  ) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit")) || 15;
  const rawPage = Number(url.searchParams.get("page")) || 1;
  const page = Math.max(rawPage, 1);
  const limit = rawLimit >= 100000 ? 100000 : Math.max(rawLimit, 1);
  const searchQuery =
    url.searchParams.get("name") ||
    url.searchParams.get("search") ||
    url.searchParams.get("q") ||
    "";

  const fetchLimit = 10000;

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
      fetchLimit,
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
    page,
    companyId,
    senderEmail: getSenderEmail(),
    senderName: SENDER_NAME,
    autoReplyStatus: getGmailAutoReplyStatus(),
  });
}


// ─── Action ────────────────────────────────────────────────────────────────

// ─── Action ────────────────────────────────────────────────────────────────
export async function action(args: ActionFunctionArgs) {
  return handleMailAction(args);
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
    searchQuery = "",
    companyId: currentCompanyId,
    senderEmail,
    senderName,
    autoReplyStatus,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const emailFetcher = useFetcher<typeof action>();
  const { toast } = useToast();
  const isSending = navigation.state === "submitting";
  const isMailLoading =
    navigation.state === "loading" ||
    navigation.state === "submitting" ||
    revalidator.state === "loading" ||
    emailFetcher.state === "loading" ||
    emailFetcher.state === "submitting";

  const [activeTab, setActiveTab] = useState<"inbox" | "compose">("inbox");
  const [selectedEmail, setSelectedEmail] = useState<InboxEmail | null>(null);

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

  const [modalCompanyId, setModalCompanyId] = useState<string>("");
  const [categoryTab] = useState<"all" | "primary" | "attendance" | "new_joinee" | "employee_left" | "advance" | "expenses" | "promotions" | "social" | "updates">("all");
  const [starredIds, setStarredIds] = useState<Record<string, boolean>>({});
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<"date" | "sender" | "subject">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mail_starred_ids");
      if (saved) {
        setStarredIds(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  const {
    limitParam,
    pageSize,
    filterList,
    hasFilters,
    totalCount,
    totalPages,
    currentPage,
    paginatedInboxEmails,
    allCurrentPageSelected,
    handleToggleSelectAll,
    allVisibleStarred,
    someVisibleStarred,
    handleToggleStarAll,
    toggleStar,
    handleSort,
  } = useMailInbox({
    inboxEmails: (inboxEmails as InboxEmail[]) || [],
    currentCompanyId,
    allUsers: allUsers || [],
    allEmployees: allEmployees || [],
    companies: companies || [],
    searchParams,
    categoryTab,
    starredIds,
    setStarredIds,
    selectedEmailIds,
    setSelectedEmailIds,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
  });

  const [mailType, setMailType] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [attachedInvoices, setAttachedInvoices] = useState<any[]>([]);
  const [attachedSalaryRuns, setAttachedSalaryRuns] = useState<any[]>([]);

  const [reimbursementModalOpen, setReimbursementModalOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeModalUrl, setEmployeeModalUrl] = useState("");
  const [employeeModalTitle, setEmployeeModalTitle] = useState("");
  const [showEmailHeaderDetails, setShowEmailHeaderDetails] = useState(false);
  const [modalStep, setModalStep] = useState<"advance" | "reimbursement">("reimbursement");
  const [reimbursementData, setReimbursementData] = useState<any>(null);
  const [bulkRows, setBulkRows] = useState<BulkRowItem[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<any | null>(null);

  const [fullEmailsCache, setFullEmailsCache] = useState<Record<number, InboxEmail>>({});

  const handleSelectEmail = (email: InboxEmail) => {
    if (fullEmailsCache[email.uid]) {
      setSelectedEmail(fullEmailsCache[email.uid]);
      return;
    }

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
      (emailFetcher.data as any).status === "email_details_success" &&
      (emailFetcher.data as any).email
    ) {
      const fetched: InboxEmail = (emailFetcher.data as any).email;
      setFullEmailsCache((prev) => ({ ...prev, [fetched.uid]: fetched }));
      setSelectedEmail((prev) => (prev && prev.uid === fetched.uid ? fetched : prev));
    }
  }, [emailFetcher.data]);

  const handleOpenAttachmentPreview = (att: any) => {
    setPreviewAttachment(att);
  };

  const {
    handleGenerateReimbursement,
    handleAddAttendance,
    handleAddEmployeeFromEmail,
  } = useMailDetailActions({
    allUsers: allUsers || [],
    allEmployees: allEmployees || [],
    companies: companies || [],
    employees: employees || [],
    users: users || [],
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
  });

  const handleSelectMailType = (type: string) => {
    setMailType(type);
    if (type === "salary") {
      setSubject("Monthly Salary Slips");
      setBody(
        "Dear Team,\n\nPlease find attached your salary slips for the recent payroll period.\n\nBest regards,\nHR Department"
      );
    } else if (type === "invoice") {
      setSubject("Invoice for Services");
      setBody(
        "Dear Sir/Madam,\n\nPlease find attached the invoice for services rendered.\n\nBest regards,\nAccounts Team"
      );
    } else {
      setSubject("");
      setBody("");
    }
  };

  const handleSelectInvoice = (invoiceId: string) => {
    const selectedInv = (invoices as any[]).find((inv) => inv.id === invoiceId);
    if (!selectedInv) return;

    if (attachedInvoices.some((inv) => inv.id === invoiceId)) {
      toast({
        title: "Already Attached",
        description: "This invoice is already attached.",
      });
      return;
    }

    setAttachedInvoices((prev) => [
      ...prev,
      {
        id: selectedInv.id,
        name: `Invoice ${selectedInv.invoice_number}.pdf`,
        subject: `Invoice ${selectedInv.invoice_number}`,
        invoiceNumber: selectedInv.invoice_number,
      },
    ]);
  };

  const handleRemoveInvoice = (id: string) => {
    setAttachedInvoices((prev) => prev.filter((inv) => inv.id !== id));
  };

  const handleSelectSalaryRun = (payrollId: string) => {
    const selectedRun = (approvedPayrolls as any[]).find(
      (run) => run.id === payrollId
    );
    if (!selectedRun) return;

    if (attachedSalaryRuns.some((run) => run.id === payrollId)) {
      toast({
        title: "Already Attached",
        description: "This salary run is already attached.",
      });
      return;
    }

    setAttachedSalaryRuns((prev) => [
      ...prev,
      {
        id: selectedRun.id,
        name: `Salary Slips - ${selectedRun.title || `Payroll ${selectedRun.month}-${selectedRun.year}`}.pdf`,
        subject: `Salary Slips ${selectedRun.title || ""}`,
        runTitle: selectedRun.title || `Payroll ${selectedRun.month}-${selectedRun.year}`,
      },
    ]);
  };

  const handleRemoveSalaryRun = (id: string) => {
    setAttachedSalaryRuns((prev) => prev.filter((run) => run.id !== id));
  };

  useEffect(() => {
    if (!actionData) return;
    const aData = actionData as any;
    if (aData.status === "advance_step1_success") {
      toast({ title: "Step 1 Complete: Advances Created", description: aData.message });
      setModalStep("reimbursement");
      if (aData.createdBulkRows) {
        setBulkRows(aData.createdBulkRows);
      }
      if (aData.singleAdvance) {
        setReimbursementData((prev: any) => ({
          ...prev,
          advanceId: aData.singleAdvance.advanceId,
          amount: aData.singleAdvance.amount,
          note: aData.singleAdvance.note,
        }));
      }
      setReimbursementModalOpen(true);
    } else if (aData.status === "reimbursement_success") {
      toast({ title: "Success", description: aData.message });
      setReimbursementModalOpen(false);
      setSelectedEmail(null);
    } else if (aData.status === "success") {
      toast({ title: "Email Sent", description: aData.message });
      setSelectedUsers([]);
      setAttachedInvoices([]);
      setAttachedSalaryRuns([]);
      setMailType(null);
      setActiveTab("inbox");
    } else {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: aData.message,
      });
    }
  }, [actionData, toast]);

  const unreadCount = (inboxEmails as InboxEmail[]).filter((e) => !e.seen).length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background relative">
      {/* Top Gmail-Style Horizontal Progress / Loading Bar */}
      {isMailLoading && (
        <div
          role="progressbar"
          aria-label="Loading emails"
          className="fixed top-0 left-0 right-0 z-[100] h-[2.5px] w-full overflow-hidden bg-primary/20 pointer-events-none"
        >
          <div className="mail-top-bar-primary bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]" />
          <div className="mail-top-bar-secondary bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]" />
        </div>
      )}

      {/* Top Header & Tab Navigation Bar */}
      <MailHeader
        senderEmail={senderEmail}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onBackToInbox={() => {
          setActiveTab("inbox");
          setSelectedEmail(null);
        }}
        unreadCount={unreadCount}
        isRevalidating={revalidator.state === "loading"}
        onRevalidate={() => revalidator.revalidate()}
      />

      {/* Gmail Auto-Reply Automation Configuration Bar */}
      <MailAutoReplyConfig autoReplyStatus={autoReplyStatus as AutoReplyStatusData} />

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-4">
        {activeTab === "inbox" ? (
          selectedEmail ? (
            <MailDetailView
              selectedEmail={selectedEmail}
              onBack={() => setSelectedEmail(null)}
              senderEmail={senderEmail}
              showEmailHeaderDetails={showEmailHeaderDetails}
              setShowEmailHeaderDetails={setShowEmailHeaderDetails}
              allUsers={allUsers || []}
              allEmployees={allEmployees || []}
              employees={employees || []}
              companies={companies || []}
              onAddAttendance={handleAddAttendance}
              onAddEmployeeFromEmail={handleAddEmployeeFromEmail}
              onGenerateReimbursement={handleGenerateReimbursement}
              onOpenAttachmentPreview={handleOpenAttachmentPreview}
              onSelectEmail={handleSelectEmail}
              emailFetcherState={emailFetcher.state}
            />
          ) : (
            <MailListView
              inboxEmails={(inboxEmails as InboxEmail[]) || []}
              hasFilters={hasFilters}
              filterList={filterList}
              inboxError={inboxError}
              senderEmail={senderEmail}
              paginatedInboxEmails={paginatedInboxEmails}
              selectedEmailIds={selectedEmailIds}
              setSelectedEmailIds={setSelectedEmailIds}
              allCurrentPageSelected={allCurrentPageSelected}
              handleToggleSelectAll={handleToggleSelectAll}
              allVisibleStarred={allVisibleStarred}
              someVisibleStarred={someVisibleStarred}
              handleToggleStarAll={handleToggleStarAll}
              sortField={sortField}
              sortOrder={sortOrder}
              handleSort={handleSort}
              starredIds={starredIds}
              toggleStar={toggleStar}
              handleSelectEmail={handleSelectEmail}
              allUsers={allUsers || []}
              allEmployees={allEmployees || []}
              companies={companies || []}
              totalCount={totalCount}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              limitParam={limitParam}
              searchParams={searchParams}
              setSearchParams={setSearchParams}
            />
          )
        ) : (
          <MailComposeView
            mailType={mailType}
            onSelectMailType={handleSelectMailType}
            invoices={invoices || []}
            approvedPayrolls={approvedPayrolls || []}
            attachedInvoices={attachedInvoices}
            onSelectInvoice={handleSelectInvoice}
            onRemoveInvoice={handleRemoveInvoice}
            attachedSalaryRuns={attachedSalaryRuns}
            onSelectSalaryRun={handleSelectSalaryRun}
            onRemoveSalaryRun={handleRemoveSalaryRun}
            users={users || []}
            senderEmail={senderEmail}
            senderName={senderName}
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            selectedUsers={selectedUsers}
            setSelectedUsers={setSelectedUsers}
            isSending={isSending}
          />
        )}
      </div>

      {/* Add Reimbursement Dialog Modal */}
      <MailReimbursementModal
        isOpen={reimbursementModalOpen && !!reimbursementData}
        onClose={() => setReimbursementModalOpen(false)}
        reimbursementData={reimbursementData}
        setReimbursementData={setReimbursementData}
        modalStep={modalStep}
        bulkRows={bulkRows}
        setBulkRows={setBulkRows}
        modalCompanyId={modalCompanyId}
        setModalCompanyId={setModalCompanyId}
        companies={companies || []}
        allEmployees={allEmployees || []}
        employees={employees || []}
        allUsers={allUsers || []}
        users={users || []}
        isSending={isSending}
      />

      {/* Attachment Preview Lightbox Modal */}
      <MailAttachmentPreviewModal
        previewAttachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      {/* Create Employee Dialog Modal */}
      <MailEmployeeModal
        isOpen={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        title={employeeModalTitle}
        url={employeeModalUrl}
      />
    </div>
  );
}
