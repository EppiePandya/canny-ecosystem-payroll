import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getStorageMode,
  listInputFiles,
  readExcelFile,
  archiveInputFile,
  getLocalPayrollBasePath,
  getCompanyFileFilter,
  type StorageMode,
} from "@/utils/server/folder-storage.server";
import {
  processPayrollExcel,
  type ProcessPayrollResult,
} from "@/utils/automation/excel-pipeline.server";

export interface SyncFileReport {
  filename: string;
  payrollResult: ProcessPayrollResult;
  movedToProcessed: boolean;
}

export interface SyncResponseData {
  success: boolean;
  message: string;
  mode: StorageMode;
  folderPath: string;
  timestamp: string;
  filesFound: number;
  filesProcessed: number;
  reports: SyncFileReport[];
}

/**
 * Main execution handler for Payroll Folder Sync (Supports Local Desktop & OneDrive)
 */
async function handleSync(request: Request): Promise<Response> {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const mode = getStorageMode();
  const folderDescription =
    mode === "onedrive"
      ? (process.env.ONEDRIVE_INPUT_FOLDER || "Payroll/Input")
      : `${getLocalPayrollBasePath()}\\Input`;

  try {
    // 1. List input Excel files (from Local Desktop Folder or OneDrive)
    const rawFiles = await listInputFiles();
    const filterUtil = await getCompanyFileFilter({
      supabase,
      activeCompanyId: companyId,
    });
    const excelFiles = await filterUtil.filterFiles(rawFiles);

    if (excelFiles.length === 0) {
      return json<SyncResponseData>({
        success: true,
        message: `No new Excel files detected for ${filterUtil.activeCompanyName || "current company"} in folder: ${folderDescription}`,
        mode,
        folderPath: folderDescription,
        timestamp: new Date().toISOString(),
        filesFound: 0,
        filesProcessed: 0,
        reports: [],
      });
    }

    const reports: SyncFileReport[] = [];

    for (const file of excelFiles) {
      try {
        // 2. Read file buffer (Local fs or OneDrive Graph)
        const fileBuffer = await readExcelFile(file);

        // 3. Process through Excel pipeline (Source of Truth)
        const payrollResult = await processPayrollExcel({
          fileBuffer,
          filename: file.name,
          supabase,
          overrideCompanyId: companyId || undefined,
        });

        let movedToProcessed = false;

        // 4. If payroll imported successfully into database, archive & rename input file
        if (payrollResult.status === "success") {
          try {
            const archiveRes = await archiveInputFile(file, {
              suggestedTitle: payrollResult.payrollTitle,
            });
            movedToProcessed = archiveRes.success;
            if (!archiveRes.success) {
              console.error(`Failed to rename file ${file.name} to processed:`, archiveRes.error);
            }
          } catch (moveErr) {
            console.error(`Failed to move file ${file.name} to processed:`, moveErr);
          }
        }

        reports.push({
          filename: file.name,
          payrollResult,
          movedToProcessed,
        });
      } catch (fileErr: any) {
        console.error(`Error processing file ${file.name}:`, fileErr);
        reports.push({
          filename: file.name,
          payrollResult: {
            status: "error",
            message: fileErr.message || String(fileErr),
            month: 0,
            year: 0,
            totalEmployees: 0,
            totalNetAmount: 0,
            variances: [],
            error: fileErr,
          },
          movedToProcessed: false,
        });
      }
    }

    const successCount = reports.filter((r) => r.payrollResult.status === "success").length;

    return json<SyncResponseData>({
      success: true,
      message: `Processed ${successCount} of ${excelFiles.length} Excel file(s).`,
      mode,
      folderPath: folderDescription,
      timestamp: new Date().toISOString(),
      filesFound: excelFiles.length,
      filesProcessed: successCount,
      reports,
    });
  } catch (err: any) {
    console.error("handleSync exception:", err);
    return json<SyncResponseData>(
      {
        success: false,
        message: `Sync execution failed: ${err.message || String(err)}`,
        mode,
        folderPath: folderDescription,
        timestamp: new Date().toISOString(),
        filesFound: 0,
        filesProcessed: 0,
        reports: [],
      },
      { status: 500 }
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return handleSync(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleSync(request);
}
