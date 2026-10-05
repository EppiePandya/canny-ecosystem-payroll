import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useFetcher,
  Form,
  Link,
  useSearchParams,
  useLocation,
} from "@remix-run/react";
import { useState, useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import {
  getStorageMode,
  listInputFiles,
  readExcelFile,
  archiveInputFile,
  getLocalPayrollBasePath,
  getLocalDocumentsBasePath,
  getLocalInvoiceBasePath,
  getLocalReimbursementBasePath,
  listPendingDocumentFiles,
  listPendingInvoiceFiles,
  listPendingReimbursementFiles,
  readReimbursementFileBuffer,
  archiveReimbursementFile,
  getCompanyFileFilter,
  getGoogleDriveDiagnostics,
  type StorageFileItem,
  type StorageInvoiceFileItem,
  type StorageReimbursementFileItem,
} from "@/utils/server/folder-storage.server";
import {
  parseReimbursementFileBuffer,
  parseReimbursementExcelBuffer,
  createBatchReimbursements,
  type ParseReimbursementSheetResult,
  type ParsedReimbursementRow,
} from "@/utils/automation/reimbursement-pipeline.server";
import {
  processPayrollExcel,
  type ProcessPayrollResult,
} from "@/utils/automation/excel-pipeline.server";
import {
  processAllPendingDocuments,
  processSingleEmployeeDocument,
  classifyDocumentTypeFast,
  matchEmployeeByNameOrCode,
  type DocumentSyncBatchResult,
  type ProcessDocumentReport,
} from "@/utils/automation/document-pipeline.server";
import {
  processAllPendingInvoices,
  processSingleInvoice,
  type InvoiceSyncBatchResult,
  type ProcessInvoiceReport,
} from "@/utils/automation/invoice-pipeline.server";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { getMonthNameFromNumber } from "@canny_ecosystem/utils";
import { FooterTabs } from "@/components/footer-tabs";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  TableCell,
  TableHead,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";

export interface SyncFileReport {
  filename: string;
  payrollResult: ProcessPayrollResult;
  movedToProcessed: boolean;
  renamedName?: string;
  archiveError?: string;
}

export interface SyncResultData {
  type: "excel";
  success: boolean;
  message: string;
  timestamp: string;
  filesFound: number;
  filesProcessed: number;
  reports: SyncFileReport[];
}

export interface DocumentActionData {
  type: "documents";
  batchResult: DocumentSyncBatchResult;
}

export interface InvoiceActionData {
  type: "invoices";
  batchResult: InvoiceSyncBatchResult;
}

export interface ReimbursementActionData {
  type: "reimbursements";
  success: boolean;
  message: string;
  createdCount?: number;
  createdAdvancesCount?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
}

export interface PreviewReimbursementActionData {
  type: "preview_reimbursement";
  success: boolean;
  message?: string;
  preview?: ParseReimbursementSheetResult;
  filePath?: string;
  fileName?: string;
}

export type ActionDataResponse =
  | SyncResultData
  | DocumentActionData
  | InvoiceActionData
  | ReimbursementActionData
  | PreviewReimbursementActionData;

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const mode = getStorageMode();
  const inputFolderPath =
    mode === "google_drive"
      ? "Google Drive: My Drive/Payroll/Input"
      : `${getLocalPayrollBasePath()}\\Input`;
  const documentsFolderPath =
    mode === "google_drive"
      ? "Google Drive: My Drive/Payroll/documents"
      : getLocalDocumentsBasePath();
  const invoiceFolderPath =
    mode === "google_drive"
      ? "Google Drive: My Drive/Payroll/Invoice"
      : getLocalInvoiceBasePath();
  const reimbursementFolderPath =
    mode === "google_drive"
      ? "Google Drive: My Drive/Payroll/Reimbursement"
      : getLocalReimbursementBasePath();

  try {
    // 1. Fetch pending Excel files
    const rawExcelFiles = await listInputFiles();
    const filterUtil = await getCompanyFileFilter({
      supabase,
      activeCompanyId: companyId,
    });
    const pendingExcelFiles = await filterUtil.filterFiles(rawExcelFiles);

    // 2. Fetch pending Employee Document files
    const rawDocFiles = await listPendingDocumentFiles();
    const filteredDocFiles = await filterUtil.filterDocFiles(rawDocFiles);

    // 3. Fetch pending Invoice files
    const rawInvoiceFiles = await listPendingInvoiceFiles();
    const pendingInvoiceFiles = await filterUtil.filterInvoiceFiles(rawInvoiceFiles);

    // 4. Fetch pending Reimbursement files
    const rawReimbursementFiles = await listPendingReimbursementFiles();
    const pendingReimbursementFiles = await filterUtil.filterReimbursementFiles(rawReimbursementFiles);

    // 5. Fetch active employees to create preview match info
    const { data: allEmployees } = await supabase
      .from("employees")
      .select("id, employee_code, first_name, middle_name, last_name, company_id")
      .eq("company_id", companyId);

    const pendingDocsWithPreview = filteredDocFiles
      .map((file) => {
        const matched = matchEmployeeByNameOrCode({
          candidateString: file.employeeFolderName || file.name,
          allEmployees: allEmployees || [],
        });
        const classification = classifyDocumentTypeFast(
          file.name,
          file.employeeFolderName
        );

        return {
          ...file,
          matchedEmployee: matched,
          previewDocumentType: classification?.documentType || "aadhaar_card",
          confidence: classification?.confidence || 0.7,
        };
      })
      .filter((file) => {
        if (
          file.companySubfolder &&
          filterUtil.isFileForActiveCompanyFolder(file.companySubfolder)
        ) {
          return true;
        }
        return Boolean(file.matchedEmployee);
      });

    const googleDriveDiag = await getGoogleDriveDiagnostics();

    return json({
      pendingExcelFiles,
      pendingDocs: pendingDocsWithPreview,
      pendingInvoiceFiles,
      pendingReimbursementFiles,
      inputFolderPath,
      documentsFolderPath,
      invoiceFolderPath,
      reimbursementFolderPath,
      companyName: filterUtil.activeCompanyName || "Active Company",
      mode,
      googleDriveDiag,
    });
  } catch (err: any) {
    const googleDriveDiag = await getGoogleDriveDiagnostics().catch(() => null);
    return json({
      pendingExcelFiles: [] as StorageFileItem[],
      pendingDocs: [] as any[],
      pendingInvoiceFiles: [] as StorageInvoiceFileItem[],
      pendingReimbursementFiles: [] as StorageReimbursementFileItem[],
      inputFolderPath,
      documentsFolderPath,
      invoiceFolderPath,
      reimbursementFolderPath,
      companyName: "Active Company",
      mode,
      googleDriveDiag,
      error: err.message || String(err),
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() || "import_excel";

  // Intent: Preview Reimbursement Sheet & Match Employees
  if (intent === "preview_reimbursement") {
    const filePath = formData.get("filePath")?.toString();
    const pendingReimbursements = await listPendingReimbursementFiles();
    const targetFile = pendingReimbursements.find((f) => {
      if (!filePath) return false;
      const cleanPath = filePath.replace(/\\/g, "/").toLowerCase();
      const cleanFull = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
      const cleanId = (f.id || "").replace(/\\/g, "/").toLowerCase();
      const cleanRel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
      return (
        f.id === filePath ||
        f.fullPath === filePath ||
        cleanFull === cleanPath ||
        cleanId === cleanPath ||
        cleanRel === cleanPath
      );
    });

    if (!targetFile) {
      return json<PreviewReimbursementActionData>({
        type: "preview_reimbursement",
        success: false,
        message: "Target reimbursement file not found",
      });
    }

    try {
      const buffer = await readReimbursementFileBuffer(targetFile);
      const preview = await parseReimbursementFileBuffer({
        buffer,
        fileName: targetFile.name,
        companyId,
        supabase,
      });

      return json<PreviewReimbursementActionData>({
        type: "preview_reimbursement",
        success: true,
        preview,
        filePath: targetFile.fullPath || targetFile.id,
        fileName: targetFile.name,
      });
    } catch (err: any) {
      console.error("Preview reimbursement error:", err);
      return json<PreviewReimbursementActionData>({
        type: "preview_reimbursement",
        success: false,
        message: err.message || "Failed to parse reimbursement sheet",
      });
    }
  }

  // Intent: Batch Create Reimbursements from parsed sheet
  if (intent === "create_reimbursements") {
    const filePath = formData.get("filePath")?.toString();
    const itemsRaw = formData.get("items")?.toString() || "[]";
    const submittedDate =
      formData.get("submittedDate")?.toString() ||
      new Date().toISOString().split("T")[0];
    const reimbursementType =
      formData.get("reimbursementType")?.toString() || "expenses";
    const reimbursementStatus =
      formData.get("reimbursementStatus")?.toString() || "approved";
    const defaultNote = formData.get("note")?.toString();

    let items: any[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      items = [];
    }

    const { user } = await getUserCookieOrFetchUser(request, supabase);
    const createSplitAdvances = formData.get("createSplitAdvances") === "true";
    const createCombinedInvoice = formData.get("createCombinedInvoice") !== "false";
    const invoiceMode = (formData.get("invoiceMode")?.toString() || "combined") as "separate" | "combined";
    const invoiceAmountRaw = formData.get("invoiceAmount")?.toString();
    const customInvoiceAmount = invoiceAmountRaw ? parseFloat(invoiceAmountRaw) : undefined;
    const invoiceDetailsRaw = formData.get("invoiceDetails")?.toString();
    let invoiceDetails: any = undefined;
    if (invoiceDetailsRaw) {
      try {
        invoiceDetails = JSON.parse(invoiceDetailsRaw);
      } catch {}
    }

    const result = await createBatchReimbursements({
      supabase,
      companyId,
      userId: user?.id,
      items,
      submittedDate,
      type: reimbursementType,
      status: reimbursementStatus,
      defaultNote,
      createSplitAdvances,
      createCombinedInvoice,
      invoiceMode,
      customInvoiceAmount:
        !isNaN(customInvoiceAmount as number) &&
        (customInvoiceAmount as number) > 0
          ? customInvoiceAmount
          : undefined,
      invoiceDetails,
    });

    if (result.success && filePath) {
      const pendingReimbursements = await listPendingReimbursementFiles();
      const targetFile = pendingReimbursements.find((f) => {
        const cleanPath = filePath.replace(/\\/g, "/").toLowerCase();
        const cleanFull = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
        const cleanId = (f.id || "").replace(/\\/g, "/").toLowerCase();
        const cleanRel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
        return (
          f.id === filePath ||
          f.fullPath === filePath ||
          cleanFull === cleanPath ||
          cleanId === cleanPath ||
          cleanRel === cleanPath
        );
      });
      if (targetFile) {
        await archiveReimbursementFile(targetFile);
      }
    }

    return json<ReimbursementActionData>({
      type: "reimbursements",
      success: result.success,
      message: result.message,
      createdCount: result.createdCount,
      createdAdvancesCount: result.createdAdvancesCount,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      invoiceAmount: result.totalAmount,
    });
  }

  // Intent: Archive/Mark Done Reimbursement File
  if (intent === "archive_reimbursement") {
    const filePath = formData.get("filePath")?.toString();
    if (filePath) {
      const pendingReimbursements = await listPendingReimbursementFiles();
      const targetFile = pendingReimbursements.find((f) => {
        const cleanPath = filePath.replace(/\\/g, "/").toLowerCase();
        const cleanFull = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
        const cleanId = (f.id || "").replace(/\\/g, "/").toLowerCase();
        const cleanRel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
        return (
          f.id === filePath ||
          f.fullPath === filePath ||
          cleanFull === cleanPath ||
          cleanId === cleanPath ||
          cleanRel === cleanPath
        );
      });
      if (targetFile) {
        await archiveReimbursementFile(targetFile);
      }
    }

    return json<ReimbursementActionData>({
      type: "reimbursements",
      success: true,
      message: "Reimbursement file marked as processed",
    });
  }

  // Intent: Import Single Invoice with AI
  if (intent === "import_single_invoice") {
    const filePath = formData.get("filePath")?.toString();
    const pendingInvoices = await listPendingInvoiceFiles();
    const targetFile = pendingInvoices.find((f) => {
      if (!filePath) return false;
      const cleanPath = filePath.replace(/\\/g, "/").toLowerCase();
      const cleanFull = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
      const cleanId = (f.id || "").replace(/\\/g, "/").toLowerCase();
      const cleanRel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
      return (
        f.id === filePath ||
        f.fullPath === filePath ||
        cleanFull === cleanPath ||
        cleanId === cleanPath ||
        cleanRel === cleanPath
      );
    });

    if (!targetFile) {
      return json<InvoiceActionData>({
        type: "invoices",
        batchResult: {
          success: false,
          message: "Target invoice file not found",
          timestamp: new Date().toLocaleTimeString(),
          filesFound: 0,
          filesProcessed: 0,
          reports: [],
        },
      });
    }

    const report = await processSingleInvoice({
      fileItem: targetFile,
      supabase,
      activeCompanyId: companyId,
    });

    return json<InvoiceActionData>({
      type: "invoices",
      batchResult: {
        success: report.status === "success" || report.status === "skipped",
        message: report.message,
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 1,
        filesProcessed:
          report.status === "success" || report.status === "skipped" ? 1 : 0,
        reports: [report],
      },
    });
  }

  // Intent: Import All or Selected Pending Invoices with AI
  if (intent === "import_invoices") {
    const selectedFilesRaw = formData.get("selectedFiles")?.toString();
    let filePathsFilter: string[] | undefined = undefined;
    if (selectedFilesRaw) {
      try {
        const parsed = JSON.parse(selectedFilesRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          filePathsFilter = parsed;
        }
      } catch {}
    }

    const batchResult = await processAllPendingInvoices({
      supabase,
      companyId,
      filePathsFilter,
    });
    return json<InvoiceActionData>({
      type: "invoices",
      batchResult,
    });
  }

  // Intent: Import Single Employee Document with AI
  if (intent === "import_single_document") {
    const filePath = formData.get("filePath")?.toString();
    const rawDocs = await listPendingDocumentFiles();
    const filterUtil = await getCompanyFileFilter({
      supabase,
      activeCompanyId: companyId,
    });
    const docFiles = await filterUtil.filterDocFiles(rawDocs);
    const targetFile = docFiles.find((f) => {
      if (!filePath) return false;
      const cleanPath = filePath.replace(/\\/g, "/").toLowerCase();
      const cleanFull = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
      const cleanId = (f.id || "").replace(/\\/g, "/").toLowerCase();
      const cleanRel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
      return (
        f.id === filePath ||
        f.fullPath === filePath ||
        cleanFull === cleanPath ||
        cleanId === cleanPath ||
        cleanRel === cleanPath
      );
    });

    if (!targetFile) {
      return json<DocumentActionData>({
        type: "documents",
        batchResult: {
          success: false,
          message: "Target document file not found",
          timestamp: new Date().toLocaleTimeString(),
          filesFound: 0,
          filesProcessed: 0,
          filesSkipped: 0,
          reports: [],
        },
      });
    }

    const { data: allEmployees } = await supabase
      .from("employees")
      .select("id, employee_code, first_name, middle_name, last_name, company_id")
      .eq("company_id", companyId);

    const report = await processSingleEmployeeDocument({
      fileItem: targetFile,
      supabase,
      allEmployees: allEmployees || [],
    });

    return json<DocumentActionData>({
      type: "documents",
      batchResult: {
        success: report.status === "success",
        message: report.message,
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 1,
        filesProcessed: report.status === "success" ? 1 : 0,
        filesSkipped: report.status === "skipped" ? 1 : 0,
        reports: [report],
      },
    });
  }

  // Intent: Import Employee Documents with AI
  if (intent === "import_documents") {
    const selectedFilesRaw = formData.get("selectedFiles")?.toString();
    let filePathsFilter: string[] | undefined = undefined;
    if (selectedFilesRaw) {
      try {
        const parsed = JSON.parse(selectedFilesRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          filePathsFilter = parsed;
        }
      } catch {}
    }

    const batchResult = await processAllPendingDocuments({
      supabase,
      companyId,
      filePathsFilter,
    });
    return json<DocumentActionData>({
      type: "documents",
      batchResult,
    });
  }

  // Intent: Import Single Excel Sheet
  if (intent === "import_single_excel") {
    const filename = formData.get("filename")?.toString();
    const filePath = formData.get("filePath")?.toString();

    const rawFiles = await listInputFiles();
    const filterUtil = await getCompanyFileFilter({
      supabase,
      activeCompanyId: companyId,
    });
    const excelFiles = await filterUtil.filterFiles(rawFiles);

    const targetFile = excelFiles.find((f) => f.name === filename || f.id === filePath || f.fullPath === filePath);

    if (!targetFile) {
      return json<SyncResultData>({
        type: "excel",
        success: false,
        message: "Target Excel file not found",
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 0,
        filesProcessed: 0,
        reports: [],
      });
    }

    try {
      const forceOverwrite = formData.get("forceOverwrite") === "true";
      const fileBuffer = await readExcelFile(targetFile);
      const payrollResult = await processPayrollExcel({
        fileBuffer,
        filename: targetFile.name,
        supabase,
        overrideCompanyId: companyId || undefined,
        forceOverwrite,
      });

      let movedToProcessed = false;
      let renamedName: string | undefined = undefined;
      let archiveError: string | undefined = undefined;

      if (payrollResult.status === "success") {
        const archiveRes = await archiveInputFile(targetFile, {
          suggestedTitle: payrollResult.payrollTitle,
        });
        movedToProcessed = archiveRes.success;
        renamedName = archiveRes.archivedName;
        archiveError = archiveRes.error;
        if (!archiveRes.success) {
          console.error("Failed to rename file after import:", archiveRes.error);
        }
      }

      return json<SyncResultData>({
        type: "excel",
        success: payrollResult.status === "success",
        message: payrollResult.message,
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 1,
        filesProcessed: payrollResult.status === "success" ? 1 : 0,
        reports: [
          {
            filename: targetFile.name,
            payrollResult,
            movedToProcessed,
            renamedName,
            archiveError,
          },
        ],
      });
    } catch (err: any) {
      return json<SyncResultData>({
        type: "excel",
        success: false,
        message: err.message || String(err),
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 1,
        filesProcessed: 0,
        reports: [
          {
            filename: targetFile.name,
            payrollResult: {
              status: "error",
              message: err.message || String(err),
              month: 0,
              year: 0,
              totalEmployees: 0,
              totalNetAmount: 0,
              variances: [],
              error: err,
            },
            movedToProcessed: false,
          },
        ],
      });
    }
  }

  // Intent: Manually Mark Single Excel as Processed (Rename without re-importing)
  if (intent === "mark_file_processed") {
    const filename = formData.get("filename")?.toString();
    const filePath = formData.get("filePath")?.toString();

    const rawFiles = await listInputFiles();
    const filterUtil = await getCompanyFileFilter({
      supabase,
      activeCompanyId: companyId,
    });
    const excelFiles = await filterUtil.filterFiles(rawFiles);

    const targetFile = excelFiles.find((f) => f.name === filename || f.id === filePath || f.fullPath === filePath);

    if (!targetFile) {
      return json<SyncResultData>({
        type: "excel",
        success: false,
        message: "Target Excel file not found",
        timestamp: new Date().toLocaleTimeString(),
        filesFound: 0,
        filesProcessed: 0,
        reports: [],
      });
    }

    const archiveRes = await archiveInputFile(targetFile);

    return json<SyncResultData>({
      type: "excel",
      success: archiveRes.success,
      message: archiveRes.success
        ? `File marked as processed and renamed to ${archiveRes.archivedName}`
        : `Could not rename file: ${archiveRes.error || "File may be locked by Excel"}`,
      timestamp: new Date().toLocaleTimeString(),
      filesFound: 1,
      filesProcessed: archiveRes.success ? 1 : 0,
      reports: [
        {
          filename: targetFile.name,
          payrollResult: {
            status: archiveRes.success ? "success" : "error",
            message: archiveRes.success
              ? `Renamed to ${archiveRes.archivedName}`
              : archiveRes.error || "Failed to rename file",
            month: 0,
            year: 0,
            totalEmployees: 0,
            totalNetAmount: 0,
            variances: [],
          },
          movedToProcessed: archiveRes.success,
          renamedName: archiveRes.archivedName,
          archiveError: archiveRes.error,
        },
      ],
    });
  }

  // Intent: Import Excel Payroll
  const rawFiles = await listInputFiles();
  const filterUtil = await getCompanyFileFilter({
    supabase,
    activeCompanyId: companyId,
  });
  let excelFiles = await filterUtil.filterFiles(rawFiles);

  const selectedFilesRaw = formData.get("selectedFiles")?.toString();
  if (selectedFilesRaw) {
    try {
      const selectedPaths = JSON.parse(selectedFilesRaw) as string[];
      if (Array.isArray(selectedPaths) && selectedPaths.length > 0) {
        excelFiles = excelFiles.filter((f) => {
          const pathOrId = f.fullPath || f.id;
          return selectedPaths.includes(pathOrId) || selectedPaths.includes(f.name);
        });
      }
    } catch {}
  }

  if (excelFiles.length === 0) {
    return json<SyncResultData>({
      type: "excel",
      success: true,
      message: "No pending Excel files found to import.",
      timestamp: new Date().toLocaleTimeString(),
      filesFound: 0,
      filesProcessed: 0,
      reports: [],
    });
  }

  const reports: SyncFileReport[] = [];

  for (const file of excelFiles) {
    try {
      const fileBuffer = await readExcelFile(file);
      const payrollResult = await processPayrollExcel({
        fileBuffer,
        filename: file.name,
        supabase,
        overrideCompanyId: companyId || undefined,
      });

      let movedToProcessed = false;
      let renamedName: string | undefined = undefined;
      let archiveError: string | undefined = undefined;

      if (payrollResult.status === "success") {
        const archiveRes = await archiveInputFile(file, {
          suggestedTitle: payrollResult.payrollTitle,
        });
        movedToProcessed = archiveRes.success;
        renamedName = archiveRes.archivedName;
        archiveError = archiveRes.error;
        if (!archiveRes.success) {
          console.error("Failed to rename file after batch import:", archiveRes.error);
        }
      }

      reports.push({
        filename: file.name,
        payrollResult,
        movedToProcessed,
        renamedName,
        archiveError,
      });
    } catch (err: any) {
      reports.push({
        filename: file.name,
        payrollResult: {
          status: "error",
          message: err.message || String(err),
          month: 0,
          year: 0,
          totalEmployees: 0,
          totalNetAmount: 0,
          variances: [],
          error: err,
        },
        movedToProcessed: false,
      });
    }
  }

  const successCount = reports.filter(
    (r) => r.payrollResult.status === "success"
  ).length;

  return json<SyncResultData>({
    type: "excel",
    success: true,
    message: `Processed ${successCount} of ${excelFiles.length} file(s).`,
    timestamp: new Date().toLocaleTimeString(),
    filesFound: excelFiles.length,
    filesProcessed: successCount,
    reports,
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDocTypeName(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ExcelRowAction({
  filename,
  filePath,
  isSubmittingGlobal,
}: {
  filename: string;
  filePath: string;
  isSubmittingGlobal: boolean;
}) {
  const fetcher = useFetcher<SyncResultData>();
  const { toast } = useToast();
  const [showAlreadyImportedDialog, setShowAlreadyImportedDialog] = useState(false);

  const isImporting = fetcher.state === "submitting";
  const firstReport = fetcher.data?.reports?.[0];
  const isAlreadyImported =
    firstReport?.payrollResult?.status === "already_imported" ||
    firstReport?.payrollResult?.isAlreadyImported;

  useEffect(() => {
    if (fetcher.data && fetcher.data.type === "excel") {
      const report = fetcher.data.reports?.[0];
      if (fetcher.data.success && report?.payrollResult?.status === "success") {
        const autoCount = report.payrollResult.autoCreatedEmployees?.length || 0;
        const autoNote = autoCount > 0
          ? ` (${autoCount} new employee(s) auto-created: ${report.payrollResult.autoCreatedEmployees?.map((e: any) => `${e.name} [${e.code}]`).join(", ")})`
          : "";

        if (report.movedToProcessed) {
          toast({
            title: autoCount > 0 ? "🎉 Payroll Imported & New Joinees Registered!" : "📊 Payroll Excel Imported & Renamed!",
            description: `Imported successfully${autoNote} and renamed to: ${report.renamedName || `[PROCESSED] ${report.filename}`}`,
          });
        } else {
          toast({
            title: "⚠️ Imported to Database, but File Not Renamed",
            description:
              report.archiveError ||
              `Imported successfully${autoNote}. Could not rename ${report.filename} (file may be open in Excel). Please close Excel and click "Mark Done".`,
            variant: "destructive",
          });
        }
      } else if (report?.payrollResult?.status === "already_imported" || report?.payrollResult?.isAlreadyImported) {
        // Open popup dialog instead of long toast
        setShowAlreadyImportedDialog(true);
      } else if (fetcher.data.success && report?.movedToProcessed) {
        toast({
          title: "🏷️ File Marked as Processed",
          description: `Renamed to: ${report.renamedName || `[PROCESSED] ${report.filename}`}`,
        });
      } else if (!fetcher.data.success && report?.payrollResult?.status !== "already_imported") {
        toast({
          title: "❌ Operation Failed",
          description:
            report?.payrollResult?.message ||
            fetcher.data.message ||
            "Failed to process Excel file",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.data, toast]);

  return (
    <>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {isAlreadyImported ? (
          <>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="mark_file_processed" />
              <input type="hidden" name="filename" value={filename} />
              <input type="hidden" name="filePath" value={filePath} />
              <Button
                type="submit"
                size="sm"
                disabled={isImporting || isSubmittingGlobal}
              >
                {isImporting ? "Processing..." : "Mark Done"}
              </Button>
            </fetcher.Form>

            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="import_single_excel" />
              <input type="hidden" name="filename" value={filename} />
              <input type="hidden" name="filePath" value={filePath} />
              <input type="hidden" name="forceOverwrite" value="true" />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isImporting || isSubmittingGlobal}
              >
                {isImporting ? "Overwriting..." : "Overwrite"}
              </Button>
            </fetcher.Form>
          </>
        ) : (
          <>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="import_single_excel" />
              <input type="hidden" name="filename" value={filename} />
              <input type="hidden" name="filePath" value={filePath} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isImporting || isSubmittingGlobal}
              >
                {isImporting ? "Importing..." : "Import"}
              </Button>
            </fetcher.Form>

            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="mark_file_processed" />
              <input type="hidden" name="filename" value={filename} />
              <input type="hidden" name="filePath" value={filePath} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={isImporting || isSubmittingGlobal}
              >
                Mark Done
              </Button>
            </fetcher.Form>
          </>
        )}
      </div>

      {/* Standard Popup Dialog when payroll is already imported */}
      <Dialog open={showAlreadyImportedDialog} onOpenChange={setShowAlreadyImportedDialog}>
        <DialogContent className="sm:max-w-[440px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Payroll Already Imported</DialogTitle>
            <DialogDescription>
              The payroll data from this file has already been imported into the system.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">File</span>
                <span className="font-medium text-foreground truncate max-w-[240px]" title={filename}>
                  {filename}
                </span>
              </div>
              {firstReport?.payrollResult?.month && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium text-foreground">
                    {getMonthNameFromNumber(firstReport.payrollResult.month)} {firstReport.payrollResult.year}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Existing Records</span>
                <span className="font-medium text-foreground">
                  {firstReport?.payrollResult?.totalEmployees || 0} Employees
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-normal">
              If this file was already processed, click <strong className="text-foreground">Mark Done</strong> to archive it so it no longer appears in the pending list. If you need to re-process this file, click <strong className="text-foreground">Overwrite</strong>.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAlreadyImportedDialog(false)}
            >
              Cancel
            </Button>

            <fetcher.Form method="post" onSubmit={() => setShowAlreadyImportedDialog(false)}>
              <input type="hidden" name="intent" value="import_single_excel" />
              <input type="hidden" name="filename" value={filename} />
              <input type="hidden" name="filePath" value={filePath} />
              <input type="hidden" name="forceOverwrite" value="true" />
              <Button
                type="submit"
                variant="outline"
                disabled={isImporting || isSubmittingGlobal}
              >
                Overwrite
              </Button>
            </fetcher.Form>

            <fetcher.Form method="post" onSubmit={() => setShowAlreadyImportedDialog(false)}>
              <input type="hidden" name="intent" value="mark_file_processed" />
              <input type="hidden" name="filename" value={filename} />
              <input type="hidden" name="filePath" value={filePath} />
              <Button
                type="submit"
                disabled={isImporting || isSubmittingGlobal}
              >
                Mark Done
              </Button>
            </fetcher.Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvoiceRowAction({
  filePath,
  isSubmittingGlobal,
}: {
  filePath: string;
  isSubmittingGlobal: boolean;
}) {
  const fetcher = useFetcher<InvoiceActionData>();
  const { toast } = useToast();

  const isCreating = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data && fetcher.data.type === "invoices") {
      const batch = fetcher.data.batchResult;
      const firstReport = batch?.reports?.[0];
      if (batch?.success && firstReport?.status === "success") {
        toast({
          title: "✨ Invoice Ingested Successfully!",
          description: firstReport.message || `Processed ${firstReport.filename}`,
        });
      } else if (firstReport?.status === "skipped") {
        toast({
          title: "ℹ️ Invoice Already Processed",
          description: firstReport.message,
        });
      } else {
        toast({
          title: "❌ Ingestion Failed",
          description: firstReport?.message || batch?.message || "Failed to import invoice",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.data, toast]);

  return (
    <fetcher.Form method="post" onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="intent" value="import_single_invoice" />
      <input type="hidden" name="filePath" value={filePath} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={isCreating || isSubmittingGlobal}
        className="text-[11px] h-7 px-2.5 font-medium border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
      >
        {isCreating ? "Creating..." : "✨ Create"}
      </Button>
    </fetcher.Form>
  );
}

function DocumentRowAction({
  filePath,
  isSubmittingGlobal,
}: {
  filePath: string;
  isSubmittingGlobal: boolean;
}) {
  const fetcher = useFetcher<DocumentActionData>();
  const { toast } = useToast();

  const isSaving = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data && fetcher.data.type === "documents") {
      const batch = fetcher.data.batchResult;
      const firstReport = batch?.reports?.[0];
      if (batch?.success && firstReport?.status === "success") {
        toast({
          title: "✨ Document Auto-Saved!",
          description: firstReport.message || `Processed ${firstReport.filename}`,
        });
      } else if (firstReport?.status === "skipped") {
        toast({
          title: "ℹ️ Document Skipped",
          description: firstReport.message,
        });
      } else {
        toast({
          title: "❌ Ingestion Failed",
          description:
            firstReport?.message || batch?.message || "Failed to auto-save document",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.data, toast]);

  return (
    <fetcher.Form method="post" onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="intent" value="import_single_document" />
      <input type="hidden" name="filePath" value={filePath} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={isSaving || isSubmittingGlobal}
        className="text-[11px] h-7 px-2.5 font-medium border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
      >
        {isSaving ? "Saving..." : "✨ Auto-Save"}
      </Button>
    </fetcher.Form>
  );
}

interface ReviewRowItem {
  id: string;
  serialNo: string;
  sheetEmployeeName: string;
  sheetEmployeeCode: string;
  matchedEmployee?: {
    id: string;
    employee_code: string;
    name: string;
    confidence: number;
    siteName?: string;
    projectName?: string;
  };
  matchedPayee?: {
    id: string;
    name: string;
    bankName?: string;
    accountNumber?: string;
  };
  autoCreatePayee?: {
    name: string;
    account_holder_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch_name?: string;
    type?: string;
  };
  candidateEmployees?: Array<{
    id: string;
    employee_code: string;
    fullName: string;
    siteName?: string;
    projectName?: string;
  }>;
  candidatePayees?: Array<{
    id: string;
    name: string;
    bank_name?: string;
    account_number?: string;
  }>;
  activity: string;
  location: string;
  previousBalance: number;
  advanceAmount: number;
  advances?: Array<{ name: string; amount: number }>;
  totalBalancePlusAdvance: number;
  expenseAmount: number;
  inHand: number;
  netRemaining: number;
  amount: number;
  included: boolean;
}

function ReimbursementFileRow({
  file,
  onOpenReview,
  isSubmittingGlobal,
}: {
  file: StorageReimbursementFileItem;
  onOpenReview: (file: StorageReimbursementFileItem) => void;
  isSubmittingGlobal: boolean;
}) {
  const archiveFetcher = useFetcher<ReimbursementActionData>();
  const isArchiving = archiveFetcher.state === "submitting";
  const isPdf = file.name.toLowerCase().endsWith(".pdf");

  return (
    <TableRow className="h-12 border-b border-border/40 hover:bg-muted/40 transition-colors">
      <TableCell className="px-4 py-2 align-middle">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-[10px] uppercase border",
              isPdf
                ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            )}
          >
            {isPdf ? "PDF" : "XLS"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="font-medium text-foreground block truncate max-w-md hover:underline cursor-pointer"
                title={file.name}
                onClick={() => onOpenReview(file)}
              >
                {file.name}
              </span>
              {isPdf && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold whitespace-nowrap">
                  ✨ Gemini AI PDF
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground font-mono truncate block">
              {file.companySubfolder ? `${file.companySubfolder} / ` : ""}{file.relativePath || file.name}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-2 text-muted-foreground text-xs align-middle">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted border border-border/60">
          {file.monthFolder || "Root"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-2 text-muted-foreground text-xs align-middle font-mono">
        {formatBytes(file.size)}
      </TableCell>
      <TableCell className="px-4 py-2 text-right align-middle">
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            onClick={() => onOpenReview(file)}
            disabled={isSubmittingGlobal || isArchiving}
            className="text-xs h-7 px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <span>⚡ Review & Import</span>
          </Button>

          <archiveFetcher.Form method="post">
            <input type="hidden" name="intent" value="archive_reimbursement" />
            <input type="hidden" name="filePath" value={file.fullPath || file.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={isSubmittingGlobal || isArchiving}
              className="text-xs h-7 px-2.5 text-muted-foreground hover:text-foreground"
            >
              {isArchiving ? "Marking..." : "Mark Done"}
            </Button>
          </archiveFetcher.Form>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReimbursementReviewDialog({
  file,
  isOpen,
  onClose,
}: {
  file: StorageReimbursementFileItem | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const previewFetcher = useFetcher<PreviewReimbursementActionData>();
  const submitFetcher = useFetcher<ReimbursementActionData>();
  const archiveFetcher = useFetcher<ReimbursementActionData>();
  const { toast } = useToast();

  const [items, setItems] = useState<ReviewRowItem[]>([]);
  const [amountMode, setAmountMode] = useState<"split" | "net" | "expense">("split");
  const [submittedDate, setSubmittedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [defaultNote, setDefaultNote] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [autoCreateInvoice, setAutoCreateInvoice] = useState<boolean>(true);
  const [invoiceMode, setInvoiceMode] = useState<"separate" | "combined">("combined");

  const isLoadingPreview =
    previewFetcher.state === "submitting" || previewFetcher.state === "loading";
  const isSubmittingCreation = submitFetcher.state === "submitting";
  const isArchiving = archiveFetcher.state === "submitting";

  // Trigger preview fetch when dialog opens
  useEffect(() => {
    if (isOpen && file) {
      previewFetcher.submit(
        {
          intent: "preview_reimbursement",
          filePath: file.fullPath || file.id,
        },
        { method: "post" }
      );
    }
  }, [isOpen, file]);

  // Load preview data into local editable items
  useEffect(() => {
    if (previewFetcher.data?.success && previewFetcher.data.preview) {
      const p = previewFetcher.data.preview;
      setDefaultNote(
        p.hasEmployeeSheet === false && p.invoiceDetails?.particulars
          ? p.invoiceDetails.particulars
          : p.sheetTitle
          ? p.sheetTitle
          : `Travelling Expenses ${p.month || ""}'${p.year || ""}`.trim()
      );

      if (p.hasEmployeeSheet === false) {
        setAmountMode("expense");
      }

      // Best effort default date based on detected month
      if (p.year && p.month) {
        try {
          const monthIndex = [
            "jan", "feb", "mar", "apr", "may", "jun",
            "jul", "aug", "sep", "oct", "nov", "dec"
          ].findIndex((m) => p.month?.toLowerCase().startsWith(m));

          if (monthIndex !== -1) {
            const rawYear = p.year.replace(/[^0-9]/g, "");
            const fullYear =
              rawYear.length === 2 ? 2000 + parseInt(rawYear) : parseInt(rawYear);
            const lastDay = new Date(fullYear, monthIndex + 1, 0).getDate();
            const mm = String(monthIndex + 1).padStart(2, "0");
            const dd = String(lastDay).padStart(2, "0");
            setSubmittedDate(`${fullYear}-${mm}-${dd}`);
          }
        } catch {}
      }

      const rowList = Array.isArray(p.rows)
        ? p.rows
        : Array.isArray((p as any).items)
        ? (p as any).items
        : [];

      setItems(
        rowList.map((r: any, idx: number) => {
          const empName = r.employeeName || r.rawName || "";
          const empCode = r.employeeCode || r.rawCode || "";
          const advAmt = r.advanceAmount ?? 0;
          const remAmt = r.netRemaining ?? r.remainingAmount ?? 0;
          const expAmt = r.expenseAmount ?? 0;
          const splitTotal = advAmt + remAmt > 0 ? advAmt + remAmt : expAmt;
          const matched = r.matchedEmployee
            ? {
                id: r.matchedEmployee.id,
                employee_code: r.matchedEmployee.employee_code,
                name: r.matchedEmployee.fullName || r.matchedEmployee.name || "",
                confidence: r.matchedEmployee.confidence ?? 1.0,
                siteName: r.matchedEmployee.siteName || "",
                projectName: r.matchedEmployee.projectName || "",
              }
            : undefined;

          const matchedPayee = r.matchedPayee;
          const autoCreatePayee = r.autoCreatePayee;
          const candidatePayees = r.candidatePayees || [];

          return {
            id: `${r.serialNo || idx}-${empCode || empName}`,
            serialNo: String(r.serialNo || idx + 1),
            sheetEmployeeName: empName,
            sheetEmployeeCode: empCode,
            matchedEmployee: matched,
            matchedPayee,
            autoCreatePayee,
            candidateEmployees: r.candidateEmployees || [],
            candidatePayees,
            advances: r.advances || [],
            activity: r.activity || "",
            location: r.location || "",
            previousBalance: r.previousBalance ?? 0,
            advanceAmount: advAmt,
            totalBalancePlusAdvance:
              r.totalBalancePlusAdvance ??
              (r.previousBalance ?? 0) + advAmt,
            expenseAmount: expAmt,
            inHand: r.inHandAmount ?? r.inHand ?? 0,
            netRemaining: remAmt,
            amount: splitTotal,
            included: Boolean((matched || matchedPayee || autoCreatePayee) && (splitTotal > 0 || expAmt > 0)),
          };
        })
      );
    }
  }, [previewFetcher.data]);

  // Handle successful creation
  useEffect(() => {
    if (submitFetcher.data) {
      if (submitFetcher.data.success) {
        toast({
          title: submitFetcher.data.invoiceNumber
            ? `🎉 Reimbursements & Combined Invoice #${submitFetcher.data.invoiceNumber} Created!`
            : "🎉 Advances & Reimbursements Created Successfully!",
          description:
            submitFetcher.data.message ||
            `Created reimbursement entries and generated combined invoice.`,
        });
        onClose();
      } else {
        toast({
          title: "❌ Creation Failed",
          description: submitFetcher.data.message || "Failed to create entries",
          variant: "destructive",
        });
      }
    }
  }, [submitFetcher.data, toast, onClose]);

  // Handle successful archiving
  useEffect(() => {
    if (archiveFetcher.data && archiveFetcher.data.success) {
      toast({
        title: "🏷️ File Marked as Processed",
        description: archiveFetcher.data.message,
      });
      onClose();
    }
  }, [archiveFetcher.data, toast, onClose]);

  // Toggle amount calculation source mode
  const handleAmountModeChange = (mode: "split" | "net" | "expense") => {
    setAmountMode(mode);
    setItems((prev) =>
      prev.map((item) => {
        let newAmt = 0;
        if (mode === "split") {
          newAmt = (item.advanceAmount || 0) + (item.netRemaining || 0);
          if (newAmt === 0 && item.expenseAmount > 0) newAmt = item.expenseAmount;
        } else if (mode === "net") {
          newAmt = Math.max(0, item.netRemaining);
        } else {
          newAmt = item.expenseAmount;
        }
        return {
          ...item,
          amount: newAmt,
          included: item.matchedEmployee ? newAmt > 0 : false,
        };
      })
    );
  };

  const handleRowAmountChange = (id: string, newAmt: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, amount: newAmt } : it))
    );
  };

  const handleRowToggle = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, included: !it.included } : it))
    );
  };

  const handleAssignEmployee = (
    rowId: string,
    emp: { id: string; employee_code: string; fullName: string; siteName?: string; projectName?: string }
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return {
          ...it,
          matchedEmployee: {
            id: emp.id,
            employee_code: emp.employee_code,
            name: emp.fullName,
            confidence: 1.0,
            siteName: emp.siteName,
            projectName: emp.projectName,
          },
          matchedPayee: undefined,
          autoCreatePayee: undefined,
          included: (it.amount || 0) > 0 || (it.expenseAmount || 0) > 0,
        };
      })
    );
  };

  const handleAssignPayee = (
    rowId: string,
    payee: { id: string; name: string; bank_name?: string; account_number?: string; ifsc_code?: string }
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return {
          ...it,
          matchedEmployee: undefined,
          matchedPayee: {
            id: payee.id,
            name: payee.name,
            bank_name: payee.bank_name,
            account_number: payee.account_number,
            ifsc_code: payee.ifsc_code,
          },
          autoCreatePayee: undefined,
          included: (it.amount || 0) > 0 || (it.expenseAmount || 0) > 0,
        };
      })
    );
  };

  const handleSetAutoCreatePayee = (rowId: string, autoPayee: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return {
          ...it,
          matchedEmployee: undefined,
          matchedPayee: undefined,
          autoCreatePayee: autoPayee,
          included: (it.amount || 0) > 0 || (it.expenseAmount || 0) > 0,
        };
      })
    );
  };

  const handleUnassignRecipient = (rowId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return {
          ...it,
          matchedEmployee: undefined,
          matchedPayee: undefined,
          autoCreatePayee: undefined,
          included: false,
        };
      })
    );
  };

  const filteredItems = items.filter((it) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      it.sheetEmployeeName.toLowerCase().includes(q) ||
      it.sheetEmployeeCode.toLowerCase().includes(q) ||
      it.location.toLowerCase().includes(q) ||
      it.activity.toLowerCase().includes(q) ||
      (it.matchedEmployee?.name || "").toLowerCase().includes(q) ||
      (it.matchedEmployee?.employee_code || "").toLowerCase().includes(q) ||
      (it.matchedPayee?.name || "").toLowerCase().includes(q) ||
      (it.autoCreatePayee?.name || "").toLowerCase().includes(q)
    );
  });

  const totalIncluded = items.filter((it) => it.included).length;
  const totalAmountToCreate = items
    .filter((it) => it.included)
    .reduce((sum, it) => sum + (it.amount || 0), 0);
  const matchedCount = items.filter(
    (it) => Boolean(it.matchedEmployee || it.matchedPayee || it.autoCreatePayee)
  ).length;

  const handleSelectAll = (checked: boolean) => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        included: checked && Boolean(it.matchedEmployee || it.matchedPayee || it.autoCreatePayee),
      }))
    );
  };

  const isAllSelected =
    filteredItems.length > 0 &&
    filteredItems.every(
      (it) => it.included || (!it.matchedEmployee && !it.matchedPayee && !it.autoCreatePayee)
    );

  const handleSubmitReimbursements = () => {
    if (!file) return;

    const validItems = items
      .filter(
        (it) =>
          it.included &&
          (it.matchedEmployee || it.matchedPayee || it.autoCreatePayee) &&
          (it.amount > 0 || (it.advanceAmount || 0) + (it.netRemaining || 0) > 0)
      )
      .map((it) => ({
        employee_id: it.matchedEmployee?.id,
        payee_id: it.matchedPayee?.id,
        autoCreatePayee: it.autoCreatePayee,
        amount: it.amount,
        advanceAmount: it.advanceAmount,
        advances: it.advances,
        netRemaining: it.netRemaining,
        expenseAmount: it.expenseAmount,
        note: `${defaultNote}${it.location ? ` - ${it.location}` : ""}${it.activity ? ` (${it.activity})` : ""}`,
      }));

    if (validItems.length === 0) {
      toast({
        title: "No valid items selected",
        description: "Please ensure at least one recipient (employee or payee) is selected with an amount > 0.",
        variant: "destructive",
      });
      return;
    }

    submitFetcher.submit(
      {
        intent: "create_reimbursements",
        filePath: file.fullPath || file.id,
        items: JSON.stringify(validItems),
        submittedDate,
        reimbursementType: "expenses",
        reimbursementStatus: "approved",
        note: defaultNote,
        createSplitAdvances: amountMode === "split" ? "true" : "false",
        createCombinedInvoice: autoCreateInvoice ? "true" : "false",
        invoiceMode,
        invoiceDetails: preview?.invoiceDetails ? JSON.stringify(preview.invoiceDetails) : "",
        invoiceAmount: preview?.invoiceDetails?.billableAmount
          ? String(preview.invoiceDetails.billableAmount)
          : preview?.totalExpenseAmount
          ? String(preview.totalExpenseAmount)
          : "",
      },
      { method: "post" }
    );
  };

  const handleArchiveOnly = () => {
    if (!file) return;
    archiveFetcher.submit(
      {
        intent: "archive_reimbursement",
        filePath: file.fullPath || file.id,
      },
      { method: "post" }
    );
  };

  const preview = previewFetcher.data?.preview;
  const allEmployees = preview?.allEmployees || [];
  const allPayees = preview?.allPayees || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[96vw] max-w-7xl h-[92vh] max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden bg-background border-border shadow-2xl">
        <DialogHeader className="p-4 px-5 pb-2.5 border-b border-border/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <span>
                  {preview?.hasEmployeeSheet === false
                    ? "Direct Expense / Vendor Memo & Tax Invoice"
                    : "Travelling Expenses Import & Employee Matching"}
                </span>
                {preview?.fileType === "pdf" ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 font-semibold">
                    <span>✨ Gemini Multimodal PDF OCR</span>
                  </span>
                ) : preview?.aiDetected ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center gap-1 font-semibold">
                    <span>✨ Gemini AI Auto-Detected</span>
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {file?.name}
                {preview?.sheetTitle ? ` — ${preview.sheetTitle}` : ""}
              </DialogDescription>
            </div>

            {/* Mode Selector */}
            <div className="flex items-center rounded-lg border border-border/70 p-0.5 bg-muted/30 text-xs shrink-0">
              <button
                type="button"
                onClick={() => handleAmountModeChange("split")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-all text-xs flex items-center gap-1.5",
                  amountMode === "split"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Creates individual Advances & Reimbursements (handles 1, 2, 3+ advances) and combines into invoice"
              >
                <span>⚡ Multi-Split (Advances + Rem)</span>
              </button>
              <button
                type="button"
                onClick={() => handleAmountModeChange("net")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-all text-xs",
                  amountMode === "net"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Net Rem Only (REM)
              </button>
              <button
                type="button"
                onClick={() => handleAmountModeChange("expense")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-all text-xs",
                  amountMode === "expense"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Total Expense (EXP)
              </button>
            </div>
          </div>

          {/* Page 1 Invoice Details Banner (for PDFs with Page 1 Tax Invoice) */}
          {preview?.invoiceDetails && (
            <div className="mt-2 p-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs flex flex-wrap items-center justify-between gap-2 text-blue-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-blue-400 flex items-center gap-1">
                  <span>📄 Page 1 Invoice Detected:</span>
                </span>
                <span className="text-foreground font-semibold">
                  {preview.invoiceDetails.clientName || "Client"}
                </span>
                {preview.invoiceDetails.location && (
                  <span className="text-muted-foreground font-mono text-[11px]">
                    📍 {preview.invoiceDetails.location}
                  </span>
                )}
                {preview.invoiceDetails.period && (
                  <span className="text-muted-foreground text-[11px]">
                    🗓️ {preview.invoiceDetails.period}
                  </span>
                )}
                <span className="text-foreground font-medium ml-1">
                  Base Bill: <strong className="text-primary font-bold">₹{preview.invoiceDetails.billableAmount?.toLocaleString("en-IN")}</strong>
                </span>
                {preview.invoiceDetails.serviceChargeAmount && (
                  <span className="text-muted-foreground text-[11px]">
                    + {preview.invoiceDetails.serviceChargeRate || 2}% Service Charge (₹{preview.invoiceDetails.serviceChargeAmount.toLocaleString("en-IN")})
                  </span>
                )}
                {preview.invoiceDetails.igstAmount && (
                  <span className="text-muted-foreground text-[11px]">
                    + 18% IGST (₹{preview.invoiceDetails.igstAmount.toLocaleString("en-IN")})
                  </span>
                )}
              </div>
              {preview.invoiceDetails.grandTotal && (
                <div className="flex items-center gap-1 text-xs font-mono font-bold text-primary bg-primary/20 px-2 py-0.5 rounded border border-primary/30">
                  <span>Grand Total: ₹{preview.invoiceDetails.grandTotal.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          )}

          {/* Direct Vendor Memo Banner when hasEmployeeSheet is false */}
          {preview?.hasEmployeeSheet === false && (
            <div className="mt-1.5 p-2 rounded-md bg-purple-500/10 border border-purple-500/25 text-xs flex flex-wrap items-center justify-between gap-2 text-purple-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-purple-400 flex items-center gap-1">
                  <span>⚡ Page 2 Vendor Memo (No Employee Roster Sheet):</span>
                </span>
                <span className="text-foreground font-semibold">
                  {preview.vendorDetails?.name || "Direct Vendor"}
                </span>
                {preview.vendorDetails?.mobile && (
                  <span className="text-muted-foreground text-[11px]">
                    📞 {preview.vendorDetails.mobile}
                  </span>
                )}
                {preview.vendorDetails?.bankName && (
                  <span className="text-muted-foreground text-[11px]">
                    🏦 {preview.vendorDetails.bankName} (A/C: {preview.vendorDetails.accountNumber || "N/A"}, IFSC: {preview.vendorDetails.ifscCode || "N/A"})
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                Creates Reimbursement for Payee first ➔ Creates Tax Invoice
              </span>
            </div>
          )}

          {/* Multi-Split Approach Helper Banner */}
          {amountMode === "split" && preview?.hasEmployeeSheet !== false && (
            <div className="mt-1.5 p-1.5 px-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-emerald-400">✨ Multi-Advance Invoicing:</span>
                <span>
                  Creates individual <strong>Advance</strong> &amp; <strong>Reimbursement</strong> records for each advance plus <strong>Remaining Settlement</strong>.
                </span>
              </div>
              <span className="font-mono text-emerald-400 font-medium">
                Combines all into single invoice
              </span>
            </div>
          )}
        </DialogHeader>

        {isLoadingPreview ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-foreground">
              Parsing Travelling Expenses sheet...
            </p>
            <p className="text-xs text-muted-foreground">
              Reading columns and matching employee codes with database...
            </p>
          </div>
        ) : previewFetcher.data && !previewFetcher.data.success ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-rose-400 font-semibold text-sm">
              Failed to Parse Spreadsheet
            </p>
            <p className="text-xs text-muted-foreground">
              {previewFetcher.data.message}
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Top Stat Bar - High Density */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40 border-b border-border/40 bg-muted/15 text-xs">
              <div className="px-5 py-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-medium">
                  Total Sheet Rows
                </span>
                <span className="text-base font-bold text-foreground mt-0.5 block">
                  {items.length} <span className="text-xs font-normal text-muted-foreground">Employees</span>
                </span>
              </div>

              <div className="px-5 py-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-medium">
                  Matched in System
                </span>
                <span className="text-base font-bold text-emerald-400 mt-0.5 block">
                  {matchedCount} / {items.length}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({items.length > 0 ? Math.round((matchedCount / items.length) * 100) : 0}%)
                  </span>
                </span>
              </div>

              <div className="px-5 py-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-medium">
                  Total Expense (EXP)
                </span>
                <span className="text-base font-bold text-foreground mt-0.5 block">
                  ₹{items.reduce((s, it) => s + (it.expenseAmount || 0), 0).toLocaleString()}
                </span>
              </div>

              <div className="px-5 py-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-medium">
                  Total Net Remaining (REM)
                </span>
                <span className="text-base font-bold text-primary mt-0.5 block">
                  ₹{items.reduce((s, it) => s + Math.max(0, it.netRemaining || 0), 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Config & Search Bar */}
            <div className="px-5 py-2.5 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 bg-card/60">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-sm">
                  <Icon
                    name="search"
                    className="absolute pointer-events-none left-2.5 top-[9px] w-3.5 h-3.5 text-muted-foreground"
                  />
                  <Input
                    type="text"
                    placeholder="Search name, code, or location..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="pl-8 h-8 text-xs placeholder:text-muted-foreground/60 w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Submitted Date:
                  </span>
                  <Input
                    type="date"
                    value={submittedDate}
                    onChange={(e) => setSubmittedDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Note:
                  </span>
                  <Input
                    type="text"
                    value={defaultNote}
                    onChange={(e) => setDefaultNote(e.target.value)}
                    placeholder="Note prefix"
                    className="h-8 text-xs w-64 md:w-80"
                  />
                </div>
              </div>
            </div>

            {/* Automatic Invoice Banner */}
            <div className="px-5 py-2 bg-primary/10 border-b border-primary/20 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="auto-invoice-checkbox"
                  checked={autoCreateInvoice}
                  onCheckedChange={(c) => setAutoCreateInvoice(Boolean(c))}
                />
                <label
                  htmlFor="auto-invoice-checkbox"
                  className="font-medium text-foreground cursor-pointer flex items-center gap-1.5"
                >
                  <span className="font-semibold text-primary">🧾 Final Step: Automatically Create Invoices</span>
                  <span className="text-muted-foreground hidden sm:inline">
                    (Links Advance ➔ Reimbursement ➔ Invoice ID with reimbursement charges & GST)
                  </span>
                </label>
              </div>

              {autoCreateInvoice && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Mode:</span>
                  <select
                    value={invoiceMode}
                    onChange={(e) => setInvoiceMode(e.target.value as "separate" | "combined")}
                    className="text-[11px] font-medium bg-card border border-border text-foreground rounded px-2 py-0.5 cursor-pointer"
                  >
                    <option value="combined">Single Combined Invoice (Recommended)</option>
                    <option value="separate">Separate Invoice per Employee</option>
                  </select>
                </div>
              )}
            </div>

            {/* Rows Table */}
            <div className="flex-1 min-h-[320px] overflow-auto">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="h-9">
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 w-10 p-0 text-center align-middle">
                      <Checkbox
                        checked={isAllSelected ? true : totalIncluded > 0 ? "indeterminate" : false}
                        onCheckedChange={(c) => handleSelectAll(Boolean(c))}
                      />
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 w-12 px-3 text-left">
                      S#
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-3 min-w-[180px] text-left">
                      {preview?.hasEmployeeSheet === false ? "Bill / Memo Item" : "Sheet Employee"}
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-3 min-w-[270px] text-left">
                      {preview?.hasEmployeeSheet === false ? "Company Payee / Recipient" : "Matched System Employee"}
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-3 w-32 text-left">
                      Loc / Activity
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-3 text-right w-28">
                      {amountMode === "split" ? "Advance (Part 1)" : "Adv+Bal"}
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-3 text-right w-28">
                      Expense (EXP)
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-3 text-right w-28">
                      {amountMode === "split" ? "Rem (Part 2)" : "Net Rem"}
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 px-4 text-right w-36">
                      {amountMode === "split" ? "Combined Total" : "Reimbursement Amt"}
                    </TableHead>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isMatched = Boolean(
                      item.matchedEmployee || item.matchedPayee || item.autoCreatePayee
                    );

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "h-10 hover:bg-muted/30 transition-colors",
                          !item.included && "opacity-50",
                          !isMatched && "bg-amber-500/[0.03]"
                        )}
                      >
                        <TableCell className="w-10 p-0 text-center align-middle border-b border-border/30">
                          <Checkbox
                            checked={item.included}
                            disabled={!isMatched}
                            onCheckedChange={() => handleRowToggle(item.id)}
                          />
                        </TableCell>

                        <TableCell className="w-12 px-3 font-mono text-muted-foreground border-b border-border/30">
                          {item.serialNo}
                        </TableCell>

                        <TableCell className="px-3 border-b border-border/30">
                          <div className="font-medium text-foreground">
                            {item.sheetEmployeeName}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {item.sheetEmployeeCode ? `Emp: ${item.sheetEmployeeCode}` : "Attachment Memo"}
                          </div>
                        </TableCell>

                        <TableCell className="px-3 border-b border-border/30">
                          {item.matchedEmployee ? (
                            <div className="flex flex-col gap-0.5 max-w-[280px]">
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group w-fit max-w-[280px]">
                                <span className="truncate">
                                  {item.matchedEmployee?.name} (#{item.matchedEmployee?.employee_code})
                                </span>
                                <button
                                  type="button"
                                  title="Unlink / Select different employee"
                                  onClick={() => handleUnassignRecipient(item.id)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-muted-foreground transition-opacity ml-0.5 flex-shrink-0"
                                >
                                  <Icon name="x" className="w-3 h-3" />
                                </button>
                              </div>
                              {(item.matchedEmployee?.siteName || item.matchedEmployee?.projectName) && (
                                <div className="text-[10px] text-emerald-300/70 truncate pl-1">
                                  {[
                                    item.matchedEmployee.siteName ? `Site: ${item.matchedEmployee.siteName}` : null,
                                    item.matchedEmployee.projectName ? `Proj: ${item.matchedEmployee.projectName}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" / ")}
                                </div>
                              )}
                            </div>
                          ) : item.matchedPayee ? (
                            <div className="flex flex-col gap-0.5 max-w-[280px]">
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 group w-fit max-w-[280px]">
                                <span className="truncate font-semibold">
                                  🏢 {item.matchedPayee.name}
                                </span>
                                <button
                                  type="button"
                                  title="Unlink payee"
                                  onClick={() => handleUnassignRecipient(item.id)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-muted-foreground transition-opacity ml-0.5 flex-shrink-0"
                                >
                                  <Icon name="x" className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-[10px] text-purple-300/80 truncate pl-1">
                                {item.matchedPayee.bank_name ? `Bank: ${item.matchedPayee.bank_name}` : "Company Payee"}
                                {item.matchedPayee.account_number ? ` • A/C: ${item.matchedPayee.account_number}` : ""}
                              </div>
                            </div>
                          ) : item.autoCreatePayee ? (
                            <div className="flex flex-col gap-0.5 max-w-[280px]">
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 group w-fit max-w-[280px]">
                                <span className="truncate font-semibold">
                                  ✨ Auto-Create Payee: {item.autoCreatePayee.name}
                                </span>
                                <button
                                  type="button"
                                  title="Cancel auto-create"
                                  onClick={() => handleUnassignRecipient(item.id)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-muted-foreground transition-opacity ml-0.5 flex-shrink-0"
                                >
                                  <Icon name="x" className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-[10px] text-cyan-300/80 truncate pl-1">
                                {item.autoCreatePayee.bank_name ? `Bank: ${item.autoCreatePayee.bank_name}` : "New Payee"}
                                {item.autoCreatePayee.account_number ? ` • A/C: ${item.autoCreatePayee.account_number}` : ""}
                              </div>
                            </div>
                          ) : item.candidateEmployees && item.candidateEmployees.length > 1 ? (
                            <div className="flex items-center gap-1">
                              <select
                                aria-label="Select similar employee"
                                className="text-[11px] bg-amber-500/15 border border-amber-500/50 text-amber-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-amber-400 focus:outline-hidden max-w-[280px] cursor-pointer"
                                defaultValue=""
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  const found = item.candidateEmployees?.find((c: any) => c.id === selectedId);
                                  if (found) {
                                    handleAssignEmployee(item.id, found);
                                  }
                                }}
                              >
                                <option value="" disabled className="bg-card text-foreground">
                                  ⚠️ {item.candidateEmployees.length} similar names:
                                </option>
                                {item.candidateEmployees.map((cand: any) => {
                                  const meta = [
                                    cand.siteName ? `Site: ${cand.siteName}` : null,
                                    cand.projectName ? `Proj: ${cand.projectName}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" / ");
                                  return (
                                    <option key={cand.id} value={cand.id} className="bg-card text-foreground">
                                      {cand.fullName} (#{cand.employee_code}){meta ? ` — ${meta}` : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                                ⚠️ Select Recipient
                              </span>
                              <select
                                aria-label="Pick recipient"
                                className="text-[10px] bg-muted/50 border border-border text-muted-foreground hover:text-foreground rounded px-1 py-0.5 max-w-[170px] cursor-pointer"
                                defaultValue=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.startsWith("payee:")) {
                                    const pid = val.replace("payee:", "");
                                    const found = allPayees.find((p: any) => p.id === pid);
                                    if (found) handleAssignPayee(item.id, found);
                                  } else if (val.startsWith("emp:")) {
                                    const eid = val.replace("emp:", "");
                                    const found = allEmployees.find((emp: any) => emp.id === eid);
                                    if (found) handleAssignEmployee(item.id, found);
                                  } else if (val === "__AUTO_CREATE_VENDOR__" && preview?.vendorDetails) {
                                    handleSetAutoCreatePayee(item.id, {
                                      name: preview.vendorDetails.name,
                                      bank_name: preview.vendorDetails.bankName,
                                      account_number: preview.vendorDetails.accountNumber,
                                      ifsc_code: preview.vendorDetails.ifscCode,
                                      branch_name: preview.vendorDetails.branchName,
                                      mobile: preview.vendorDetails.mobile,
                                    });
                                  }
                                }}
                              >
                                <option value="" disabled className="bg-card text-foreground">
                                  Select Recipient...
                                </option>
                                {preview?.vendorDetails && (
                                  <option value="__AUTO_CREATE_VENDOR__" className="bg-card text-cyan-400 font-semibold">
                                    ✨ Auto-Create: {preview.vendorDetails.name}
                                  </option>
                                )}
                                {allPayees.length > 0 && (
                                  <optgroup label="Company Payees">
                                    {allPayees.map((p: any) => (
                                      <option key={p.id} value={`payee:${p.id}`} className="bg-card text-foreground">
                                        🏢 {p.name} {p.bank_name ? `(${p.bank_name})` : ""}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {allEmployees.length > 0 && (
                                  <optgroup label="Company Employees">
                                    {allEmployees.map((emp: any) => {
                                      const meta = [
                                        emp.siteName ? `Site: ${emp.siteName}` : null,
                                        emp.projectName ? `Proj: ${emp.projectName}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" / ");
                                      return (
                                        <option key={emp.id} value={`emp:${emp.id}`} className="bg-card text-foreground">
                                          {emp.fullName} (#{emp.employee_code}){meta ? ` — ${meta}` : ""}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}
                              </select>
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="px-3 text-muted-foreground text-[11px] border-b border-border/30">
                          {item.location || "—"} {item.activity ? `(${item.activity})` : ""}
                        </TableCell>

                        <TableCell className="px-3 text-right font-mono text-muted-foreground border-b border-border/30">
                          ₹{(amountMode === "split" ? item.advanceAmount : item.totalBalancePlusAdvance).toLocaleString()}
                        </TableCell>

                        <TableCell className="px-3 text-right font-mono text-foreground font-medium border-b border-border/30">
                          ₹{item.expenseAmount.toLocaleString()}
                        </TableCell>

                        <TableCell className="px-3 text-right font-mono text-primary font-medium border-b border-border/30">
                          ₹{item.netRemaining.toLocaleString()}
                        </TableCell>

                        <TableCell className="px-4 text-right border-b border-border/30">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground text-xs">₹</span>
                            <Input
                              type="number"
                              disabled={!item.included}
                              value={item.amount}
                              onChange={(e) =>
                                handleRowAmountChange(item.id, parseFloat(e.target.value) || 0)
                              }
                              className="h-7 w-24 text-right font-mono text-xs px-2 py-0"
                            />
                          </div>
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="p-4 border-t border-border/60 bg-muted/15 flex flex-row items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Selected <strong className="text-foreground font-semibold">{totalIncluded}</strong> of {items.length} {preview?.hasEmployeeSheet === false ? "reimbursement items" : "employees"}
            {totalIncluded > 0 && (
              <span className="ml-2 text-primary font-semibold">
                (Total: ₹{totalAmountToCreate.toLocaleString()})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingCreation || isArchiving}
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingCreation || isArchiving}
              onClick={handleArchiveOnly}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {isArchiving ? "Marking..." : "Mark Done Only"}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isSubmittingCreation || isArchiving || totalIncluded === 0}
              onClick={handleSubmitReimbursements}
              className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs"
            >
              {isSubmittingCreation
                ? "Creating Reimbursement & Invoice..."
                : preview?.hasEmployeeSheet === false && autoCreateInvoice
                ? `⚡ Create Reimbursement (₹${totalAmountToCreate.toLocaleString()}) + Invoice (₹${(preview?.invoiceDetails?.grandTotal || totalAmountToCreate).toLocaleString()})`
                : autoCreateInvoice
                ? amountMode === "split"
                  ? `⚡ Create ${totalIncluded} Split Advance & Reimb + ${invoiceMode === "separate" ? "Separate Invoices" : "Combined Invoice"}`
                  : `⚡ Create ${totalIncluded} Reimbursement(s) + ${invoiceMode === "separate" ? "Separate Invoices" : "Combined Invoice"}`
                : amountMode === "split"
                ? `⚡ Create ${totalIncluded} Split Advance & Reimb (₹${totalAmountToCreate.toLocaleString()})`
                : `⚡ Create ${totalIncluded} Reimbursement(s)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FolderAutomationRoute() {
  const {
    pendingExcelFiles,
    pendingDocs,
    pendingInvoiceFiles,
    pendingReimbursementFiles,
    inputFolderPath,
    documentsFolderPath,
    invoiceFolderPath,
    reimbursementFolderPath,
    companyName,
    mode,
    googleDriveDiag,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (actionData) {
      if (actionData.type === "reimbursements") {
        if (actionData.success) {
          toast({
            title: actionData.invoiceNumber
              ? `🎉 Invoice #${actionData.invoiceNumber} Generated!`
              : "🎉 Reimbursements Processed!",
            description: actionData.message || `Processed ${actionData.createdCount || 0} reimbursement entries`,
          });
        } else {
          toast({
            title: "❌ Reimbursement Operation Failed",
            description: actionData.message || "Failed to process reimbursements",
            variant: "destructive",
          });
        }
      } else if (actionData.type === "invoices") {
        const batch = actionData.batchResult;
        if (batch?.success) {
          toast({
            title: "✨ Invoices Processed!",
            description: batch.message || `Processed ${batch.filesProcessed} invoice(s)`,
          });
        } else {
          toast({
            title: "❌ Ingestion Failed",
            description: batch?.message || "Failed to process invoices",
            variant: "destructive",
          });
        }
      } else if (actionData.type === "documents") {
        const batch = actionData.batchResult;
        toast({
          title: "📁 Documents Processed",
          description: `Processed ${batch?.filesProcessed} document(s)`,
        });
      } else if (actionData.type === "excel") {
        const alreadyImportedCount = (actionData.reports || []).filter(
          (r) => r.payrollResult?.status === "already_imported" || r.payrollResult?.isAlreadyImported
        ).length;
        const unrenamedCount = (actionData.reports || []).filter(
          (r) => r.payrollResult?.status === "success" && !r.movedToProcessed
        ).length;
        if (alreadyImportedCount > 0 && actionData.filesProcessed === 0) {
          toast({
            title: "ℹ️ Payroll Already Imported",
            description: `This sheet is already imported in the database. Click "Mark Done" to mark it as processed so it won't show here again.`,
          });
        } else if (unrenamedCount > 0) {
          toast({
            title: "⚠️ Excel Import Finished with Warnings",
            description: `${actionData.message} (${unrenamedCount} file(s) could not be renamed because they may be open in Excel).`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "📊 Payroll Excel Processed & Renamed",
            description: actionData.message,
          });
        }
      }
    }
  }, [actionData, toast]);

  const isSubmitting = navigation.state === "submitting";
  const submittingIntent = navigation.formData?.get("intent")?.toString();
  const submittingFilePath = navigation.formData?.get("filePath")?.toString();

  const activeTab =
    searchParams.get("tab") ||
    (actionData?.type === "reimbursements"
      ? "reimbursements"
      : actionData?.type === "invoices"
      ? "invoices"
      : actionData?.type === "documents"
      ? "documents"
      : "payroll");

  // Selection Checkbox State for Invoices
  const [selectedInvoicePaths, setSelectedInvoicePaths] = useState<string[]>([]);
  // Selection Checkbox State for Payroll Excel
  const [selectedExcelPaths, setSelectedExcelPaths] = useState<string[]>([]);
  // Selection Checkbox State for Employee Documents
  const [selectedDocPaths, setSelectedDocPaths] = useState<string[]>([]);
  const [docSearchQuery, setDocSearchQuery] = useState<string>("");

  // Reimbursement State
  const [selectedReviewFile, setSelectedReviewFile] = useState<StorageReimbursementFileItem | null>(null);
  const [reimbursementSearchQuery, setReimbursementSearchQuery] = useState<string>("");

  const filteredReimbursementFiles = (pendingReimbursementFiles || []).filter((f) => {
    if (!reimbursementSearchQuery) return true;
    const q = reimbursementSearchQuery.toLowerCase();
    const fullText = `${f.name} ${f.relativePath} ${f.companySubfolder || ""} ${f.monthFolder || ""}`.toLowerCase();
    return fullText.includes(q);
  });

  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>("");
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("");

  const knownSiteNames = [
    "KARAIKAL", "CHENNAI", "TUTICORIN", "NAGPUR", "SOLAPUR",
    "MAHARASHTRA", "AHMEDABAD", "PORBANDAR", "GANDHIDHAM", "THANE",
    "TNPL", "VISHAKAPATNAM", "MADHYA PRADESH"
  ];

  const availableSites = Array.from(
    new Set(
      (pendingInvoiceFiles || []).flatMap((f) => {
        const text = `${f.name} ${f.relativePath}`.toUpperCase();
        return knownSiteNames.filter((site) => text.includes(site));
      })
    )
  ).sort();

  const availableMonths = Array.from(
    new Set(
      (pendingInvoiceFiles || []).map((f) => f.monthFolder).filter(Boolean) as string[]
    )
  ).sort();

  const filteredInvoiceFiles = (pendingInvoiceFiles || []).filter((f) => {
    const fullText = `${f.name} ${f.relativePath} ${f.monthFolder || ""}`.toLowerCase();
    
    // 1. Search Query
    if (invoiceSearchQuery) {
      if (!fullText.includes(invoiceSearchQuery.toLowerCase())) return false;
    }

    // 2. Site Filter from Dropdown Popover
    if (selectedSiteFilter) {
      if (!fullText.includes(selectedSiteFilter.toLowerCase())) return false;
    }

    // 3. Month Filter from Dropdown Popover
    if (selectedMonthFilter) {
      if (
        !f.monthFolder?.toLowerCase().includes(selectedMonthFilter.toLowerCase()) &&
        !fullText.includes(selectedMonthFilter.toLowerCase())
      )
        return false;
    }

    return true;
  });

  const allFilteredPaths = filteredInvoiceFiles.map((f) => f.fullPath || f.id);
  const isAllInvoicesSelected =
    allFilteredPaths.length > 0 &&
    allFilteredPaths.every((p) => selectedInvoicePaths.includes(p));

  const toggleSelectAllInvoices = () => {
    if (isAllInvoicesSelected) {
      setSelectedInvoicePaths([]);
    } else {
      setSelectedInvoicePaths(allFilteredPaths);
    }
  };

  const toggleInvoiceSelection = (pathStr: string) => {
    setSelectedInvoicePaths((prev) =>
      prev.includes(pathStr)
        ? prev.filter((p) => p !== pathStr)
        : [...prev, pathStr]
    );
  };

  // Filter and Selection for Employee Documents
  const filteredDocFiles = (pendingDocs || []).filter((file: any) => {
    const fullText = `${file.name} ${file.employeeFolderName || ""} ${file.matchedEmployee?.name || ""} ${file.matchedEmployee?.employee_code || ""} ${file.previewDocumentType || ""}`.toLowerCase();
    if (docSearchQuery && !fullText.includes(docSearchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const allFilteredDocPaths = filteredDocFiles.map((f: any) => f.fullPath || f.id);
  const isAllDocsSelected =
    allFilteredDocPaths.length > 0 &&
    allFilteredDocPaths.every((p: string) => selectedDocPaths.includes(p));

  const toggleSelectAllDocs = () => {
    if (isAllDocsSelected) {
      setSelectedDocPaths([]);
    } else {
      setSelectedDocPaths(allFilteredDocPaths);
    }
  };

  const toggleDocSelection = (pathStr: string) => {
    setSelectedDocPaths((prev) =>
      prev.includes(pathStr)
        ? prev.filter((p) => p !== pathStr)
        : [...prev, pathStr]
    );
  };

  const allPendingExcelPaths = (pendingExcelFiles || []).map(
    (f) => f.fullPath || f.id
  );
  const isAllExcelSelected =
    allPendingExcelPaths.length > 0 &&
    allPendingExcelPaths.every((p) => selectedExcelPaths.includes(p));

  const toggleSelectAllExcel = () => {
    if (isAllExcelSelected) {
      setSelectedExcelPaths([]);
    } else {
      setSelectedExcelPaths(allPendingExcelPaths);
    }
  };

  const toggleExcelSelection = (pathStr: string) => {
    setSelectedExcelPaths((prev) =>
      prev.includes(pathStr)
        ? prev.filter((p) => p !== pathStr)
        : [...prev, pathStr]
    );
  };

  useEffect(() => {
    if (actionData && actionData.type === "excel") {
      setSelectedExcelPaths([]);
    } else if (actionData && actionData.type === "documents") {
      setSelectedDocPaths([]);
    }
  }, [actionData]);

  const sideNavItems = [
    {
      id: "payroll",
      name: "Payroll Salary Sheet",
      count: pendingExcelFiles?.length || 0,
      link: "/chat/folder-automation?tab=payroll",
    },
    {
      id: "documents",
      name: "Employee Documents",
      count: pendingDocs?.length || 0,
      link: "/chat/folder-automation?tab=documents",
    },
    {
      id: "invoices",
      name: "Legacy Tax Invoices",
      count: pendingInvoiceFiles?.length || 0,
      link: "/chat/folder-automation?tab=invoices",
    },
    {
      id: "reimbursements",
      name: "Reimbursements",
      count: pendingReimbursementFiles?.length || 0,
      link: "/chat/folder-automation?tab=reimbursements",
    },
  ];

  const footerTabsItems = [
    { path: "/chat/folder-automation?tab=payroll", label: "Payroll Sheet" },
    { path: "/chat/folder-automation?tab=documents", label: "Documents" },
    { path: "/chat/folder-automation?tab=invoices", label: "Invoices" },
    { path: "/chat/folder-automation?tab=reimbursements", label: "Reimbursements" },
  ];

  return (
    <div className="flex w-full flex-1 h-full min-h-0 overflow-hidden bg-background">
      {/* Left Standard Secondary Sidebar matching Canny Ecosystem exactly */}
      <aside className="hidden md:flex py-4 flex-col items-start justify-start overflow-hidden bg-background border-r flex-shrink-0 w-64">
        <nav className="no-scrollbar h-full w-full overflow-x-hidden overflow-y-scroll flex flex-col justify-between px-3 pb-4 gap-4">
          <ul className="h-full w-full flex flex-col gap-1.5 items-stretch pb-4">
            {sideNavItems.map(({ id, name, count, link }) => {
              const isActive = activeTab === id;
              return (
                <Link
                  key={id}
                  to={link}
                  prefetch="intent"
                  className={cn(
                    "min-h-max flex cursor-pointer text-start text-sm justify-between items-center w-full px-3.5 rounded py-2.5 tracking-wide hover:bg-accent gap-2 transition-colors",
                    isActive
                      ? "bg-primary/25 text-primary font-medium hover:bg-primary/25"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="flex-1 truncate font-medium">{name}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold flex-shrink-0",
                        isActive
                          ? "bg-primary/30 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </ul>
        </nav>
      </aside>

      <FooterTabs items={footerTabsItems} pathname={pathname} Link={Link} />

      {/* Right Page Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 space-y-4">
        {/* Top Header */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>
                {activeTab === "payroll"
                  ? "Payroll Salary Sheet Import"
                  : activeTab === "documents"
                  ? "Employee Documents Auto-Save"
                  : activeTab === "invoices"
                  ? "Legacy Tax Invoice Auto Creation"
                  : "Staff Reimbursement & Expense Import"}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              <span>Monitored Directory:</span>{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[11px]">
                {activeTab === "payroll"
                  ? inputFolderPath
                  : activeTab === "documents"
                  ? documentsFolderPath
                  : activeTab === "invoices"
                  ? invoiceFolderPath
                  : reimbursementFolderPath}
              </code>
              {mode === "google_drive" && googleDriveDiag?.connected && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connected ({googleDriveDiag.resolvedFolderName || "Drive"})
                </span>
              )}
              {mode === "google_drive" && !googleDriveDiag?.connected && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Not Shared Yet (0 Folders)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Form method="get">
              <input type="hidden" name="tab" value={activeTab} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                className="text-xs"
              >
                {isSubmitting && !submittingIntent ? "Scanning..." : "🔄 Refresh"}
              </Button>
            </Form>

            {activeTab === "payroll" && selectedExcelPaths.length > 0 && (
              <Form method="post">
                <input type="hidden" name="intent" value="import_excel" />
                <input
                  type="hidden"
                  name="selectedFiles"
                  value={JSON.stringify(selectedExcelPaths)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting && submittingIntent === "import_excel"
                    ? "Importing..."
                    : `📊 Import Selected (${selectedExcelPaths.length}) Excel Sheet(s)`}
                </Button>
              </Form>
            )}

            {activeTab === "documents" && selectedDocPaths.length > 0 && (
              <Form method="post">
                <input type="hidden" name="intent" value="import_documents" />
                <input
                  type="hidden"
                  name="selectedFiles"
                  value={JSON.stringify(selectedDocPaths)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting && submittingIntent === "import_documents"
                    ? "Auto-Saving..."
                    : `✨ Auto-Save Selected (${selectedDocPaths.length}) Document(s)`}
                </Button>
              </Form>
            )}

            {activeTab === "invoices" && selectedInvoicePaths.length > 0 && (
              <Form method="post">
                <input type="hidden" name="intent" value="import_invoices" />
                <input
                  type="hidden"
                  name="selectedFiles"
                  value={JSON.stringify(selectedInvoicePaths)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting && submittingIntent === "import_invoices"
                    ? "Reading & Ingesting..."
                    : `✨ Auto-Create Selected (${selectedInvoicePaths.length}) Invoice(s)`}
                </Button>
              </Form>
            )}
          </div>
        </div>

        {/* Google Drive Setup Warning Alert */}
        {mode === "google_drive" && !googleDriveDiag?.connected && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200/90 space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-amber-400 text-sm">
              <Icon name="exclaimation-triangle" className="w-4 h-4 text-amber-400" />
              <span>Google Drive Setup Required: Share Folder with Service Account</span>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Google Drive is currently blocking access because the folder has not been shared with the system&apos;s Service Account (accessible folders: 0).
            </p>
            <div className="bg-card/80 p-3 rounded-md border border-border/70 space-y-2">
              <div className="font-semibold text-foreground text-xs">How to fix in 30 seconds:</div>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
                <li>
                  Open <span className="text-foreground font-semibold">Google Drive</span> in your browser.
                </li>
                <li>
                  Right-click your <span className="text-foreground font-semibold">Payroll</span> (or <span className="text-foreground font-semibold">Input</span>) folder and choose <span className="text-foreground font-semibold">Share</span> &rarr; <span className="text-foreground font-semibold">Share</span>.
                </li>
                <li>
                  In the &ldquo;Add people and groups&rdquo; box, paste this service account email:
                  <div className="mt-1">
                    <code className="bg-muted px-2 py-1 rounded text-primary font-mono select-all inline-block text-[11px] border border-border">
                      {googleDriveDiag?.serviceAccountEmail || "canny-drive@canny-ecosystem-510010.iam.gserviceaccount.com"}
                    </code>
                  </div>
                </li>
                <li>
                  Make sure role is set to <span className="text-foreground font-semibold">Editor</span> (or Viewer), then click <span className="text-foreground font-semibold">Send</span> / <span className="text-foreground font-semibold">Share</span>.
                </li>
                <li>
                  Return here and click the <span className="text-foreground font-semibold">🔄 Refresh</span> button above.
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* ==================== MODULE 1: PAYROLL SALARY SHEET ==================== */}
        {activeTab === "payroll" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
            {!pendingExcelFiles || pendingExcelFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/10 rounded-lg border border-dashed border-border/60">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Icon name="check" className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  No Pending Excel Sheets in Input Folder
                </p>
                <p className="text-xs text-muted-foreground max-w-md mt-1">
                  Drop your monthly payroll Excel file into{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
                    {inputFolderPath}
                  </code>{" "}
                  to import.
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 border border-border/70 rounded-md overflow-y-auto bg-card shadow-xs">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-card shadow-xs border-b border-border/70">
                    <tr className="h-10 bg-card">
                      <TableHead className="w-12 min-w-12 max-w-12 p-0 text-center align-middle sticky top-0 bg-card z-20 border-b border-border/70">
                        <div className="flex items-center justify-center w-full">
                          <Checkbox
                            checked={
                              isAllExcelSelected
                                ? true
                                : selectedExcelPaths.length > 0
                                ? "indeterminate"
                                : false
                            }
                            onCheckedChange={toggleSelectAllExcel}
                          />
                        </div>
                      </TableHead>
                      <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[300px] sticky top-0 bg-card z-20 border-b border-border/70">
                        Excel File Name
                      </TableHead>
                      <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[200px] sticky top-0 bg-card z-20 border-b border-border/70">
                        Target Company
                      </TableHead>
                      <TableHead className="px-4 py-2 font-medium text-muted-foreground text-right align-middle w-32 sticky top-0 bg-card z-20 border-b border-border/70">
                        Action
                      </TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {pendingExcelFiles.map((file) => {
                      const filePath = file.fullPath || file.id;
                      const isSelected = selectedExcelPaths.includes(filePath);

                      return (
                        <TableRow
                          key={file.name}
                          data-state={isSelected ? "selected" : undefined}
                          onClick={() => toggleExcelSelection(filePath)}
                          className={cn(
                            "h-10 border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer select-none",
                            isSelected && "bg-primary/5"
                          )}
                        >
                          <TableCell
                            className="w-12 min-w-12 max-w-12 p-0 text-center align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center w-full">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleExcelSelection(filePath)}
                              />
                            </div>
                          </TableCell>

                          <TableCell className="px-4 py-2 align-middle">
                            <div className="flex items-center space-x-3">
                              <div className="w-7 h-7 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-[10px] uppercase flex-shrink-0">
                                XLS
                              </div>
                              <span
                                className="font-medium text-foreground truncate"
                                title={file.name}
                              >
                                {file.name}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="px-4 py-2 text-muted-foreground font-normal align-middle truncate">
                            {companyName}
                          </TableCell>

                          <TableCell
                            className="px-4 py-2 text-right align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExcelRowAction
                              filename={file.name}
                              filePath={filePath}
                              isSubmittingGlobal={isSubmitting}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Excel Execution Results */}
            {actionData && actionData.type === "excel" && (
              <div className="flex-shrink-0 max-h-48 overflow-y-auto mt-2 rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name="check" className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Excel Import Results ({actionData.timestamp})
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {actionData.filesProcessed} / {actionData.filesFound} Processed
                  </span>
                </div>

                <div className="space-y-2">
                  {(actionData.reports || []).map((report) => (
                    <div
                      key={report.filename}
                      className="p-3 rounded border border-border/60 bg-muted/20 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground truncate max-w-xl">
                          {report.filename}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            report.payrollResult.status === "success"
                              ? "bg-primary/10 text-primary"
                              : report.payrollResult.status === "already_imported" || report.payrollResult.isAlreadyImported
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {report.payrollResult.status === "success"
                            ? "SUCCESS"
                            : report.payrollResult.status === "already_imported" || report.payrollResult.isAlreadyImported
                            ? "ALREADY IMPORTED"
                            : "ERROR"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {report.payrollResult.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== MODULE 2: EMPLOYEE DOCUMENTS ==================== */}
        {activeTab === "documents" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
            {!pendingDocs || pendingDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/10 rounded-lg border border-dashed border-border/60">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Icon name="check" className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  No Pending Documents in Local Folder
                </p>
                <p className="text-xs text-muted-foreground max-w-md mt-1">
                  Save Aadhaar, PAN card, or bank passbooks inside employee folders like{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
                    {documentsFolderPath}\&lt;Employee Name&gt;
                  </code>
                  .
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Search Bar matching Invoices & Employees page */}
                <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full md:w-auto">
                    <Icon
                      name="search"
                      className="absolute pointer-events-none left-3 top-[12.5px] opacity-70"
                    />
                    <Input
                      type="text"
                      placeholder="Search document files or employee name..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                      className="pl-9 w-full h-10 md:w-[480px] pr-4 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                      Showing <span className="text-foreground font-semibold">{filteredDocFiles.length}</span> of {pendingDocs.length} documents
                    </div>
                  </div>
                </div>

                {/* Data Table */}
                <div className="flex-1 min-h-0 border border-border/70 rounded-md overflow-y-auto bg-card shadow-xs">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-card shadow-xs border-b border-border/70">
                      <tr className="h-10 bg-card">
                        <TableHead className="w-12 min-w-12 max-w-12 p-0 text-center align-middle sticky top-0 bg-card z-20 border-b border-border/70">
                          <div className="flex items-center justify-center w-full">
                            <Checkbox
                              checked={
                                isAllDocsSelected
                                  ? true
                                  : selectedDocPaths.length > 0
                                  ? "indeterminate"
                                  : false
                              }
                              onCheckedChange={toggleSelectAllDocs}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[280px] sticky top-0 bg-card z-20 border-b border-border/70">
                          Document File
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[200px] sticky top-0 bg-card z-20 border-b border-border/70">
                          Target Employee
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle w-36 sticky top-0 bg-card z-20 border-b border-border/70">
                          Detected Type
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle w-24 sticky top-0 bg-card z-20 border-b border-border/70">
                          Size
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-right align-middle w-28 sticky top-0 bg-card z-20 border-b border-border/70">
                          Action
                        </TableHead>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredDocFiles.map((file: any) => {
                        const filePath = file.fullPath || file.id;
                        const isSelected = selectedDocPaths.includes(filePath);
                        const extClean = (file.extension || ".jpg").replace(".", "").toUpperCase();

                        return (
                          <TableRow
                            key={file.id}
                            data-state={isSelected ? "selected" : undefined}
                            onClick={() => toggleDocSelection(filePath)}
                            className={cn(
                              "h-11 border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer select-none",
                              isSelected && "bg-primary/5"
                            )}
                          >
                            <TableCell
                              className="w-12 min-w-12 max-w-12 p-0 text-center align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center w-full">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleDocSelection(filePath)}
                                />
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-2 align-middle">
                              <div className="flex items-center space-x-3">
                                <div
                                  className={cn(
                                    "w-7 h-7 rounded flex items-center justify-center font-bold text-[10px] uppercase flex-shrink-0",
                                    extClean === "PDF"
                                      ? "bg-rose-500/10 text-rose-500"
                                      : "bg-blue-500/10 text-blue-500"
                                  )}
                                >
                                  {extClean}
                                </div>
                                <div className="min-w-0">
                                  <span
                                    className="font-medium text-foreground truncate block"
                                    title={file.name}
                                  >
                                    {file.name}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground truncate block">
                                    📁 {file.employeeFolderName ? `${file.employeeFolderName}/` : ""}{file.name}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-2 align-middle">
                              {file.matchedEmployee ? (
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground truncate">
                                    {file.matchedEmployee.name}
                                  </span>
                                  {file.matchedEmployee.employee_code && (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      Code: {file.matchedEmployee.employee_code}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-amber-500/80 font-medium italic text-[11px]">
                                  Unmatched
                                </span>
                              )}
                            </TableCell>

                            <TableCell className="px-4 py-2 align-middle">
                              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20 inline-block whitespace-nowrap">
                                {formatDocTypeName(file.previewDocumentType)}
                              </span>
                            </TableCell>

                            <TableCell className="px-4 py-2 text-muted-foreground font-normal align-middle">
                              {formatBytes(file.size)}
                            </TableCell>

                            <TableCell
                              className="px-4 py-2 text-right align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DocumentRowAction
                                filePath={filePath}
                                isSubmittingGlobal={isSubmitting}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Document Execution Results */}
            {actionData && actionData.type === "documents" && (
              <div className="flex-shrink-0 max-h-48 overflow-y-auto mt-2 rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name="check" className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Document Auto-Save Results ({actionData.batchResult.timestamp})
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {actionData.batchResult.filesProcessed} /{" "}
                    {actionData.batchResult.filesFound} Ingested
                  </span>
                </div>

                <div className="space-y-2">
                  {actionData.batchResult.reports.map(
                    (report: ProcessDocumentReport) => (
                      <div
                        key={report.filename + report.relativePath}
                        className="p-3 rounded border border-border/60 bg-muted/20 text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold text-foreground">
                            {report.filename}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            ({report.employeeName || "Unmatched"})
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            report.status === "success"
                              ? "bg-primary/10 text-primary"
                              : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== MODULE 3: LEGACY TAX INVOICES ==================== */}
        {activeTab === "invoices" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
            {!pendingInvoiceFiles || pendingInvoiceFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/10 rounded-lg border border-dashed border-border/60">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Icon name="check" className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  No Pending Invoices in Local Folder
                </p>
                <p className="text-xs text-muted-foreground max-w-md mt-1 mb-3">
                  Save Tax Invoice PDFs inside network folders like{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
                    {invoiceFolderPath}\&lt;YEAR&gt;\&lt;MONTH-YEAR&gt;\&lt;DATE&gt;
                  </code>
                  .
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Standard Ecosystem Search Bar matching Employees page with interactive filter popover */}
                <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <DropdownMenu open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                    <div className="relative w-full md:w-auto">
                      <Icon
                        name="search"
                        className="absolute pointer-events-none left-3 top-[12.5px] opacity-70"
                      />
                      <Input
                        type="text"
                        placeholder="Search invoice files..."
                        value={invoiceSearchQuery}
                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                        className="pl-9 w-full h-10 md:w-[480px] pr-8 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70 text-xs"
                      />
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setIsFilterOpen((prev) => !prev)}
                          className={cn(
                            "absolute z-10 right-3 top-[6px] opacity-70 hover:opacity-100 transition-opacity",
                            (selectedSiteFilter || selectedMonthFilter) && "opacity-100 text-primary"
                          )}
                        >
                          <Icon name="mixer" />
                        </button>
                      </DropdownMenuTrigger>
                    </div>

                    <DropdownMenuContent className="w-56" align="end" sideOffset={10}>
                      <DropdownMenuGroup>
                        {availableSites.length > 0 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <span>Site / Project Location</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="p-0 max-h-60 overflow-y-auto">
                                {availableSites.map((site) => (
                                  <DropdownMenuCheckboxItem
                                    key={site}
                                    checked={selectedSiteFilter === site}
                                    onCheckedChange={() =>
                                      setSelectedSiteFilter((prev) => (prev === site ? "" : site))
                                    }
                                  >
                                    📍 {site}
                                  </DropdownMenuCheckboxItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        )}

                        {availableMonths.length > 0 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <span>Folder Month / Year</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="p-0 max-h-60 overflow-y-auto">
                                {availableMonths.map((mFolder) => (
                                  <DropdownMenuCheckboxItem
                                    key={mFolder}
                                    checked={selectedMonthFilter === mFolder}
                                    onCheckedChange={() =>
                                      setSelectedMonthFilter((prev) => (prev === mFolder ? "" : mFolder))
                                    }
                                  >
                                    📁 {mFolder}
                                  </DropdownMenuCheckboxItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                      Showing <span className="text-foreground font-semibold">{filteredInvoiceFiles.length}</span> of {pendingInvoiceFiles.length} invoices
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 border-border/70 text-muted-foreground hover:text-foreground"
                      title="Toggle Columns"
                    >
                      <Icon name="column" className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Data Table component styled like Image 2 */}
                <div className="flex-1 min-h-0 border border-border/70 rounded-md overflow-y-auto bg-card shadow-xs">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-card shadow-xs border-b border-border/70">
                      <tr className="h-10 bg-card">
                        <TableHead className="w-12 min-w-12 max-w-12 p-0 text-center align-middle sticky top-0 bg-card z-20 border-b border-border/70">
                          <div className="flex items-center justify-center w-full">
                            <Checkbox
                              checked={
                                isAllInvoicesSelected
                                  ? true
                                  : selectedInvoicePaths.length > 0
                                  ? "indeterminate"
                                  : false
                              }
                              onCheckedChange={toggleSelectAllInvoices}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[280px] sticky top-0 bg-card z-20 border-b border-border/70">
                          Invoice File Name
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[200px] sticky top-0 bg-card z-20 border-b border-border/70">
                          Folder Location
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle w-28 sticky top-0 bg-card z-20 border-b border-border/70">
                          Size
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-right align-middle w-28 sticky top-0 bg-card z-20 border-b border-border/70">
                          Action
                        </TableHead>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredInvoiceFiles.map((file) => {
                        const filePath = file.fullPath || file.id;
                        const isSelected = selectedInvoicePaths.includes(filePath);

                        return (
                          <TableRow
                            key={file.id}
                            data-state={isSelected ? "selected" : undefined}
                            onClick={() => toggleInvoiceSelection(filePath)}
                            className={cn(
                              "h-10 border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer select-none",
                              isSelected && "bg-primary/5"
                            )}
                          >
                            <TableCell
                              className="w-12 min-w-12 max-w-12 p-0 text-center align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center w-full">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleInvoiceSelection(filePath)}
                                />
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-2 align-middle">
                              <span
                                className="font-medium text-primary hover:underline truncate block"
                                title={file.name}
                              >
                                {file.name}
                              </span>
                            </TableCell>

                            <TableCell className="px-4 py-2 text-muted-foreground font-normal align-middle truncate">
                              {file.monthFolder
                                ? `${file.monthFolder} / ${file.dateFolder || "Root"}`
                                : file.relativePath}
                            </TableCell>

                            <TableCell className="px-4 py-2 text-muted-foreground font-normal align-middle">
                              {formatBytes(file.size)}
                            </TableCell>

                            <TableCell
                              className="px-4 py-2 text-right align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <InvoiceRowAction
                                filePath={filePath}
                                isSubmittingGlobal={isSubmitting}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </tbody >
                  </table>
                </div>
              </div>
            )}

            {/* Invoice Execution Results */}
            {actionData && actionData.type === "invoices" && (
              <div className="flex-shrink-0 max-h-48 overflow-y-auto mt-2 rounded-lg border border-primary/30 bg-primary/5 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                      <Icon name="check" className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Invoice Auto-Creation Results ({actionData.batchResult.timestamp})
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                    {actionData.batchResult.filesProcessed} /{" "}
                    {actionData.batchResult.filesFound} Created
                  </span>
                </div>

                <div className="space-y-2">
                  {(actionData.batchResult?.reports || []).map((report: ProcessInvoiceReport) => (
                    <div
                      key={report.filename + report.relativePath}
                      className="p-3 rounded border border-border/60 bg-card text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-foreground">
                          {report.filename}
                        </span>
                        {report.invoiceNumber && (
                          <span className="text-primary font-mono font-medium ml-2">
                            [#{report.invoiceNumber}]
                          </span>
                        )}
                        {report.companyName && (
                          <span className="text-muted-foreground ml-2">
                            ({report.companyName})
                          </span>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {report.message}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          report.status === "success"
                            ? "bg-primary/10 text-primary"
                            : report.status === "skipped"
                            ? "bg-blue-500/10 text-blue-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {report.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== MODULE 4: REIMBURSEMENTS ==================== */}
        {activeTab === "reimbursements" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
            {filteredReimbursementFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/10 rounded-lg border border-dashed border-border/60">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Icon name="file-text" className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  No Pending Reimbursement Sheets Found
                </p>
                <p className="text-xs text-muted-foreground max-w-md mt-1">
                  Place travelling expenses or staff reimbursement Excel workbooks inside Google Drive:
                  <br />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-mono mt-1 inline-block">
                    {reimbursementFolderPath}\[Company]\[Month]\*.xlsx
                  </code>
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Search Bar */}
                <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full md:w-auto">
                    <Icon
                      name="search"
                      className="absolute pointer-events-none left-3 top-[12.5px] opacity-70"
                    />
                    <Input
                      type="text"
                      placeholder="Search reimbursement file name or folder..."
                      value={reimbursementSearchQuery}
                      onChange={(e) => setReimbursementSearchQuery(e.target.value)}
                      className="pl-9 w-full h-10 md:w-[480px] pr-4 focus-visible:ring-0 placeholder:opacity-50 placeholder:focus-visible:opacity-70 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                      Showing <span className="text-foreground font-semibold">{filteredReimbursementFiles.length}</span> of {pendingReimbursementFiles?.length || 0} sheet(s)
                    </div>
                  </div>
                </div>

                {/* Data Table */}
                <div className="flex-1 min-h-0 border border-border/70 rounded-md overflow-y-auto bg-card shadow-xs">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-card shadow-xs border-b border-border/70">
                      <tr className="h-10 bg-card">
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle min-w-[280px] sticky top-0 bg-card z-20 border-b border-border/70">
                          Excel Spreadsheet
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle w-48 sticky top-0 bg-card z-20 border-b border-border/70">
                          Folder / Month
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-left align-middle w-28 sticky top-0 bg-card z-20 border-b border-border/70">
                          File Size
                        </TableHead>
                        <TableHead className="px-4 py-2 font-medium text-muted-foreground text-right align-middle w-56 sticky top-0 bg-card z-20 border-b border-border/70">
                          Action
                        </TableHead>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredReimbursementFiles.map((file) => (
                        <ReimbursementFileRow
                          key={file.id}
                          file={file}
                          onOpenReview={(f) => setSelectedReviewFile(f)}
                          isSubmittingGlobal={isSubmitting}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ReimbursementReviewDialog
        file={selectedReviewFile}
        isOpen={Boolean(selectedReviewFile)}
        onClose={() => setSelectedReviewFile(null)}
      />
    </div>
  );
}
