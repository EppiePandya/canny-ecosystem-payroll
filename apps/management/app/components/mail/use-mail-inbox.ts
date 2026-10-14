import { useMemo } from "react";
import type { InboxEmail } from "@/utils/server/imap.server";
import type { MailFilterListType } from "./mail-filter-list";
import {
  getCompanyForEmail,
  getEmailCategory,
} from "./mail-helpers";

interface UseMailInboxProps {
  inboxEmails: InboxEmail[];
  currentCompanyId?: string;
  allUsers: any[];
  allEmployees: any[];
  companies: any[];
  searchParams: URLSearchParams;  
  categoryTab: string;
  starredIds: Record<string, boolean>;
  setStarredIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedEmailIds: string[];
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<string[]>>;
  sortField: "date" | "sender" | "subject";
  setSortField: React.Dispatch<
    React.SetStateAction<"date" | "sender" | "subject">
  >;
  sortOrder: "asc" | "desc";
  setSortOrder: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
}

export function useMailInbox({
  inboxEmails,
  currentCompanyId,
  allUsers,
  allEmployees,
  companies,
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
}: UseMailInboxProps) {
  const pageParam = Math.max(1, Number(searchParams.get("page")) || 1);
  const limitParam = Number(searchParams.get("limit")) || 15;
  const pageSize = limitParam >= 100000 ? 100000 : Math.max(1, limitParam);

  const activeCategory = searchParams.get("category") || categoryTab;
  const statusParam = searchParams.get("status");
  const attachmentParam = searchParams.get("attachment");
  const starredParam = searchParams.get("starred");
  const dateStartParam = searchParams.get("date_start");
  const dateEndParam = searchParams.get("date_end");
  const activeNameQuery =
    searchParams.get("name") ||
    searchParams.get("search") ||
    searchParams.get("q") ||
    "";

  const filterList: MailFilterListType = {
    name: activeNameQuery || null,
    category:
      activeCategory && activeCategory !== "all" && activeCategory !== "primary"
        ? activeCategory
        : null,
    status: statusParam || null,
    attachment: attachmentParam || null,
    starred: starredParam || null,
    date_start: dateStartParam || null,
    date_end: dateEndParam || null,
  };

  const hasFilters = Object.values(filterList).some((val) => Boolean(val));

  const filteredInboxEmails = useMemo(() => {
    return (inboxEmails as InboxEmail[]).filter((mail) => {
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

      // Instant client-side text search (subject, sender, snippet, text)
      if (activeNameQuery) {
        const q = activeNameQuery.toLowerCase();
        const matchSubject = mail.subject?.toLowerCase().includes(q);
        const matchFromName = mail.from?.name?.toLowerCase().includes(q);
        const matchFromAddr = mail.from?.address?.toLowerCase().includes(q);
        const matchSnippet = mail.snippet?.toLowerCase().includes(q);
        const matchText = mail.text?.toLowerCase().includes(q);
        if (
          !matchSubject &&
          !matchFromName &&
          !matchFromAddr &&
          !matchSnippet &&
          !matchText
        ) {
          return false;
        }
      }

      const emailCat = getEmailCategory(mail);

      if (activeCategory === "primary") {
        if (emailCat === "updates" || emailCat === "promotions") return false;
      } else if (activeCategory === "attendance") {
        if (emailCat !== "attendance") return false;
      } else if (activeCategory === "new_joinee") {
        if (emailCat !== "new_joinee") return false;
      } else if (activeCategory === "employee_left") {
        if (emailCat !== "employee_left") return false;
      } else if (activeCategory === "advance") {
        if (emailCat !== "advance") return false;
      } else if (activeCategory === "expenses") {
        if (emailCat !== "expenses") return false;
      } else if (activeCategory === "updates") {
        if (emailCat !== "updates") return false;
      } else if (activeCategory === "promotions") {
        if (emailCat !== "promotions") return false;
      }

      // Read status filter
      if (statusParam === "unread" && mail.seen) return false;
      if (statusParam === "read" && !mail.seen) return false;

      // Attachments filter
      if (attachmentParam === "true" && !mail.hasAttachments) return false;
      if (attachmentParam === "false" && mail.hasAttachments) return false;

      // Starred filter
      if (starredParam === "true" && !starredIds[mail.id]) return false;

      // Date range filter
      if (dateStartParam) {
        const mailTime = new Date(mail.date).getTime();
        const startTime = new Date(dateStartParam).setHours(0, 0, 0, 0);
        if (mailTime < startTime) return false;
      }
      if (dateEndParam) {
        const mailTime = new Date(mail.date).getTime();
        const endTime = new Date(dateEndParam).setHours(23, 59, 59, 999);
        if (mailTime > endTime) return false;
      }

      return true;
    });
  }, [
    inboxEmails,
    currentCompanyId,
    allUsers,
    allEmployees,
    companies,
    activeNameQuery,
    activeCategory,
    statusParam,
    attachmentParam,
    starredParam,
    starredIds,
    dateStartParam,
    dateEndParam,
  ]);

  const sortedInboxEmails = useMemo(() => {
    const list = [...filteredInboxEmails];
    list.sort((a, b) => {
      if (sortField === "date") {
        const timeA = new Date(a.date).getTime() || 0;
        const timeB = new Date(b.date).getTime() || 0;
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      }
      if (sortField === "sender") {
        const senderA = (a.from?.name || a.from?.address || "").toLowerCase();
        const senderB = (b.from?.name || b.from?.address || "").toLowerCase();
        return sortOrder === "asc"
          ? senderA.localeCompare(senderB)
          : senderB.localeCompare(senderA);
      }
      if (sortField === "subject") {
        const subA = (a.subject || "").toLowerCase();
        const subB = (b.subject || "").toLowerCase();
        return sortOrder === "asc"
          ? subA.localeCompare(subB)
          : subB.localeCompare(subA);
      }
      return 0;
    });
    return list;
  }, [filteredInboxEmails, sortField, sortOrder]);

  const totalCount = sortedInboxEmails.length;
  const totalPages =
    pageSize >= 100000 ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(pageParam, totalPages);

  const paginatedInboxEmails = useMemo(() => {
    if (pageSize >= 100000) return sortedInboxEmails;
    const startIndex = (currentPage - 1) * pageSize;
    return sortedInboxEmails.slice(startIndex, startIndex + pageSize);
  }, [sortedInboxEmails, currentPage, pageSize]);

  const handleSort = (field: "date" | "sender" | "subject") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const allCurrentPageSelected =
    paginatedInboxEmails.length > 0 &&
    paginatedInboxEmails.every((email) => selectedEmailIds.includes(email.id));

  const handleToggleSelectAll = () => {
    if (allCurrentPageSelected) {
      const pageIds = new Set(paginatedInboxEmails.map((e) => e.id));
      setSelectedEmailIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const pageIds = paginatedInboxEmails.map((e) => e.id);
      setSelectedEmailIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const allVisibleStarred =
    paginatedInboxEmails.length > 0 &&
    paginatedInboxEmails.every((e) => !!starredIds[e.id]);

  const someVisibleStarred =
    !allVisibleStarred && paginatedInboxEmails.some((e) => !!starredIds[e.id]);

  const handleToggleStarAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const visibleIds = paginatedInboxEmails.map((mail) => mail.id);
    if (visibleIds.length === 0) return;

    setStarredIds((prev) => {
      const next = { ...prev };
      const shouldStar = !allVisibleStarred;

      visibleIds.forEach((id) => {
        if (shouldStar) {
          next[id] = true;
        } else {
          delete next[id];
        }
      });

      try {
        localStorage.setItem("mail_starred_ids", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      try {
        localStorage.setItem("mail_starred_ids", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return {
    pageParam,
    limitParam,
    pageSize,
    filterList,
    hasFilters,
    filteredInboxEmails,
    sortedInboxEmails,
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
  };
}
