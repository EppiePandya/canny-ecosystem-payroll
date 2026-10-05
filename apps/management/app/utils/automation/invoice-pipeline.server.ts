import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "@canny_ecosystem/utils";
import type { TypedSupabaseClient } from "@canny_ecosystem/supabase/types";
import {
  listPendingInvoiceFiles,
  readInvoiceFileBuffer,
  archiveInvoiceFile,
  getCompanyFileFilter,
  type StorageInvoiceFileItem,
} from "@/utils/server/folder-storage.server";
import { GEMINI_MAIN, } from "@/utils/ai/chat/constant";
import { createInvoice } from "@canny_ecosystem/supabase/mutations";
import type { InvoiceDatabaseInsert } from "@canny_ecosystem/supabase/types";

export const InvoiceLineItemSchema = z.object({
  sr_no: z.number().default(1),
  field: z.string().describe("Field name or component (e.g. Basic, Other Allw., Fixed Allow., Acco/Food, P.F. 13.00%, ESIC 3.25%, Bonus 8.33%)"),
  particulars: z.string().optional().describe("Description or particulars string"),
  type: z.enum(["earning", "deduction", "reimbursement"]).default("earning"),
  amount: z.number().describe("Amount in Rupees"),
  in_service_charge: z.boolean().default(true).describe("Whether this component is subject to service charge calculation"),
});

export const ExtractedInvoiceSchema = z.object({
  invoice_number: z.string().describe("Invoice number extracted from the document, e.g. CMS/2024-25/1124 or 24-25_1255"),
  date: z.string().describe("Invoice date in YYYY-MM-DD format"),
  company_name: z.string().describe("Client / Customer / Buyer company name (e.g. COTECNA INSPECTION INDIA PVT LTD)"),
  site_location: z.string().optional().describe("Site, project or branch location name (e.g. KARAIKAL, CHENNAI, TUTICORIN, NAGPUR, SOLAPUR, MAHARASHTRA, GANDHIDHAM)"),
  client_address_line_1: z.string().optional().describe("Client street address line 1 (e.g. Plot No. 4, Ground, 1st & 2nd Floor)"),
  client_address_line_2: z.string().optional().describe("Client street address line 2 (e.g. Palayakkaran Street, Ekkattuthangal)"),
  client_city: z.string().optional().describe("Client city (e.g. Chennai)"),
  client_state: z.string().optional().describe("Client state (e.g. Tamilnadu)"),
  client_pincode: z.string().optional().describe("Client pincode (e.g. 600032)"),
  client_gstin: z.string().optional().describe("Client GSTIN number (e.g. 33AACCC4428K1ZS)"),
  subject: z.string().describe("Particulars description or invoice subject"),
  base_amount: z.number().describe("Subtotal amount of allowances before service charge and taxes (e.g. 602205)"),
  charge_percent: z.number().default(5).describe("Service charge percentage rate (e.g. 5 for 5%)"),
  charge_amount: z.number().default(0).describe("Service charge amount in Rupees (e.g. 26242)"),
  include_cgst: z.boolean().default(false).describe("Whether CGST tax (9%) is included"),
  cgst_amount: z.number().default(0).describe("CGST amount in Rupees"),
  include_sgst: z.boolean().default(false).describe("Whether SGST tax (9%) is included"),
  sgst_amount: z.number().default(0).describe("SGST amount in Rupees"),
  include_igst: z.boolean().default(true).describe("Whether IGST tax (18%) is included"),
  igst_amount: z.number().default(0).describe("IGST amount in Rupees (e.g. 113120)"),
  grand_total: z.number().describe("Grand total invoice amount including service charge and GST (e.g. 741567)"),
  hsn_code: z.string().optional().describe("HSN / SAC Code (e.g. 9985)"),
  gstin: z.string().optional().describe("Vendor GSTIN number (e.g. 24AADCC6596P1ZZ)"),
  line_items: z.array(InvoiceLineItemSchema).optional().describe("Individual payroll allowance / breakdown line items (Basic, Other Allw., Fixed Allow., P.F. 13.00%, ESIC 3.25%, Bonus 8.33%, etc.)"),
  confidence: z.number().describe("Confidence score between 0.0 and 1.0"),
});

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

export interface ProcessInvoiceReport {
  filename: string;
  relativePath: string;
  status: "success" | "skipped" | "error";
  message: string;
  invoiceId?: string;
  invoiceNumber?: string;
  companyName?: string;
  grandTotal?: number;
  archived: boolean;
  error?: any;
}

export interface InvoiceSyncBatchResult {
  success: boolean;
  message: string;
  timestamp: string;
  filesFound: number;
  filesProcessed: number;
  reports: ProcessInvoiceReport[];
}

/**
 * Extract structured invoice data from PDF buffer using Gemini AI
 */
export async function extractInvoiceDetailsWithAI({
  fileBuffer,
  filename,
  mimeType = "application/pdf",
}: {
  fileBuffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<ExtractedInvoice> {
  try {
    const result = await generateObject({
      model: google(GEMINI_MAIN),
      system: `You are an expert financial invoice OCR AI. Analyze the provided Tax Invoice document and extract all key fields with high precision.
Follow these rules:
1. Extract invoice_number, date (formatted YYYY-MM-DD), client/buyer company_name, site_location, subject/particulars.
2. Extract exact client address fields: client_address_line_1, client_address_line_2, client_city, client_state, client_pincode, client_gstin (under M/S. section).
3. Extract exact line_items from the Particulars table breakdown (e.g. Basic, Other Allw., Fixed Allow., Acco/Food, P.F. 13.00%, ESIC 3.25%, Bonus 8.33%). Set type="earning" for all components.
4. Extract charge_percent (e.g. 5 if Service Charge @ 5%) and charge_amount (e.g. 26242).
5. Extract GST flags: include_cgst, include_sgst, include_igst, and exact amounts (cgst_amount, sgst_amount, igst_amount).
6. Extract base_amount, grand_total, hsn_code, and gstin.
7. Determine confidence score from 0.0 to 1.0.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: fileBuffer,
              mimeType: mimeType.endsWith("pdf") ? "application/pdf" : mimeType,
            },
            {
              type: "text",
              text: `Please extract all invoice details, buyer address lines, GSTIN, and line items from this document file "${filename}".`,
            },
          ],
        },
      ],
      schema: ExtractedInvoiceSchema,
    });

    return result.object;
  } catch (err) {
    console.error("Gemini AI Invoice Extraction Error:", err);
    // Fallback heuristic if AI fails
    const matchInv = filename.match(/\b\d{4}[-_]\d{2}[-_]\d{3,4}\b/);
    const dateStr = new Date().toISOString().split("T")[0];
    return {
      invoice_number: matchInv ? matchInv[0].replace(/_/g, "-") : `INV-${Date.now().toString().slice(-6)}`,
      date: dateStr,
      company_name: "Unknown Company",
      subject: "Tax Invoice Ingestion",
      base_amount: 0,
      charge_percent: 5,
      charge_amount: 0,
      include_cgst: false,
      cgst_amount: 0,
      include_sgst: false,
      sgst_amount: 0,
      include_igst: true,
      igst_amount: 0,
      grand_total: 0,
      confidence: 0.3,
    };
  }
}

/**
 * Extract site / location hint from filename or folder path
 */
export function extractSiteHint(filename: string, relativePath: string): string {
  const text = `${filename} ${relativePath}`.toUpperCase();
  const knownSites = [
    "KARAIKAL", "CHENNAI", "TUTICORIN", "NAGPUR", "SOLAPUR",
    "MAHARASHTRA", "AHMEDABAD", "PORBANDAR", "GANDHIDHAM", "THANE",
    "TNPL", "VISHAKAPATNAM", "MADHYA PRADESH"
  ];
  for (const s of knownSites) {
    if (text.includes(s)) return s;
  }
  return "";
}

/**
 * Find matching Company and Company Address ID from database
 */
export async function findMatchingCompany({
  companyName,
  siteLocation,
  extractedData,
  filename,
  relativePath,
  supabase,
  defaultCompanyId,
}: {
  companyName: string;
  siteLocation?: string;
  extractedData?: ExtractedInvoice;
  filename?: string;
  relativePath?: string;
  supabase: TypedSupabaseClient;
  defaultCompanyId: string;
}): Promise<{ companyId: string; addressId: string }> {
  const { data: companies } = await supabase
    .from("companies")
    .select("id, company_name");

  let matchedCompanyId = defaultCompanyId;

  if (companyName && companies && companies.length > 0) {
    const cleanExtracted = companyName.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const found = companies.find((c) => {
      const cleanDB = c.company_name.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return cleanDB.includes(cleanExtracted) || cleanExtracted.includes(cleanDB);
    });
    if (found) {
      matchedCompanyId = found.id;
    }
  }

  // Determine target site location name
  const locHint =
    siteLocation ||
    extractedData?.client_city ||
    (filename && relativePath ? extractSiteHint(filename, relativePath) : "") ||
    "Main Office";

  const targetGstin = extractedData?.client_gstin || "";

  // Fetch company locations for matched company
  const { data: locations } = await supabase
    .from("company_locations")
    .select("id, name, city, gst_number, address_line_1")
    .eq("company_id", matchedCompanyId);

  let addressId = "";
  if (locations && locations.length > 0) {
    // 1. Try matching by GSTIN
    if (targetGstin) {
      const gstMatch = locations.find(
        (l) => l.gst_number && l.gst_number.trim().toUpperCase() === targetGstin.trim().toUpperCase()
      );
      if (gstMatch) {
        addressId = gstMatch.id;
      }
    }

    // 2. Try matching by location name or city
    if (!addressId) {
      const cleanLoc = locHint.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const siteMatch = locations.find((l) => {
        const nameClean = (l.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const cityClean = (l.city || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        return (
          nameClean.includes(cleanLoc) ||
          cleanLoc.includes(nameClean) ||
          cityClean.includes(cleanLoc) ||
          cleanLoc.includes(cityClean)
        );
      });
      if (siteMatch) {
        addressId = siteMatch.id;
      }
    }
  }

  // If a location was matched, update its address lines and GSTIN if provided
  if (addressId && extractedData) {
    const updateObj: any = {};
    if (extractedData.client_address_line_1) updateObj.address_line_1 = extractedData.client_address_line_1;
    if (extractedData.client_address_line_2) updateObj.address_line_2 = extractedData.client_address_line_2;
    if (extractedData.client_city) updateObj.city = extractedData.client_city;
    if (extractedData.client_state) updateObj.state = extractedData.client_state;
    if (extractedData.client_pincode) updateObj.pincode = extractedData.client_pincode;
    if (extractedData.client_gstin) updateObj.gst_number = extractedData.client_gstin;

    if (Object.keys(updateObj).length > 0) {
      await supabase.from("company_locations").update(updateObj).eq("id", addressId);
    }
  }

  // If no matching location exists, create a new company location record with exact extracted address details
  if (!addressId) {
    const { data: newLoc } = await supabase
      .from("company_locations")
      .insert({
        company_id: matchedCompanyId,
        name: locHint.toUpperCase(),
        address_line_1: extractedData?.client_address_line_1 || `${locHint.toUpperCase()} Site Office`,
        address_line_2: extractedData?.client_address_line_2 || "",
        city: extractedData?.client_city || locHint.toUpperCase(),
        state: extractedData?.client_state || locHint.toUpperCase(),
        pincode: extractedData?.client_pincode || "000000",
        gst_number: extractedData?.client_gstin || "",
      })
      .select("id")
      .single();

    if (newLoc) {
      addressId = newLoc.id;
    }
  }

  return { companyId: matchedCompanyId, addressId };
}

/**
 * Process a single PDF invoice file and create record in database
 */
export async function processSingleInvoice({
  fileItem,
  supabase,
  activeCompanyId,
}: {
  fileItem: StorageInvoiceFileItem;
  supabase: TypedSupabaseClient;
  activeCompanyId: string;
}): Promise<ProcessInvoiceReport> {
  try {
    const fileBuffer = await readInvoiceFileBuffer(fileItem);
    const mimeType = fileItem.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : fileItem.name.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    const extracted = await extractInvoiceDetailsWithAI({
      fileBuffer,
      filename: fileItem.name,
      mimeType,
    });

    let { companyId, addressId } = await findMatchingCompany({
      companyName: extracted.company_name,
      siteLocation: extracted.site_location,
      extractedData: extracted,
      filename: fileItem.name,
      relativePath: fileItem.relativePath,
      supabase,
      defaultCompanyId: activeCompanyId,
    });

    let finalAddressId = addressId;

    if (!finalAddressId) {
      // Fallback 1: fetch default location for active company
      const { data: fallbackLoc } = await supabase
        .from("company_locations")
        .select("id")
        .eq("company_id", activeCompanyId)
        .limit(1);

      if (fallbackLoc && fallbackLoc.length > 0) {
        finalAddressId = fallbackLoc[0].id;
      } else {
        // Fallback 2: fetch any location in the entire database
        const { data: anyLoc } = await supabase
          .from("company_locations")
          .select("id, company_id")
          .limit(1);

        if (anyLoc && anyLoc.length > 0) {
          finalAddressId = anyLoc[0].id;
        } else {
          // Fallback 3: Create default location for company
          const { data: newLoc, error: createLocErr } = await supabase
            .from("company_locations")
            .insert({
              company_id: activeCompanyId,
              name: "HEAD OFFICE",
              address_line_1: "Main Office Address",
              city: "HEAD OFFICE",
              state: "HEAD OFFICE",
              pincode: "000000",
            })
            .select("id")
            .single();

          if (createLocErr || !newLoc) {
            return {
              filename: fileItem.name,
              relativePath: fileItem.relativePath,
              status: "error",
              message: `No company location found: ${createLocErr?.message || "Unknown error"}`,
              archived: false,
            };
          }
          finalAddressId = newLoc.id;
        }
      }
    }

    const { data: existingInv } = await supabase
      .from("invoice")
      .select("id, invoice_number")
      .eq("company_id", companyId)
      .eq("invoice_number", extracted.invoice_number)
      .limit(1);

    if (existingInv && existingInv.length > 0) {
      // Invoice already exists in database
      await archiveInvoiceFile(fileItem);
      return {
        filename: fileItem.name,
        relativePath: fileItem.relativePath,
        status: "skipped",
        message: `Invoice #${extracted.invoice_number} already exists in database. File archived.`,
        invoiceId: existingInv[0].id,
        invoiceNumber: extracted.invoice_number,
        companyName: extracted.company_name,
        grandTotal: extracted.grand_total,
        archived: true,
      };
    }

    const finalLineItems =
      extracted.line_items && extracted.line_items.length > 0
        ? extracted.line_items.map((item, idx) => {
            const fName = item.field || "Basic";
            const lowerF = fName.toLowerCase();
            const isGovtDeduction = lowerF.includes("p.f") || lowerF.includes("esic") || lowerF.includes("bonus");
            return {
              sr_no: idx + 1,
              particulars: extracted.subject,
              field: fName,
              type: item.type || "earning",
              amount: item.amount,
              in_service_charge: !isGovtDeduction,
            };
          })
        : [
            {
              sr_no: 1,
              particulars: extracted.subject || "Providing Manpower Services",
              field: "Basic",
              type: "earning",
              amount: extracted.base_amount || extracted.grand_total,
              in_service_charge: true,
            },
          ];

    // Determine service charge percentage rate (e.g. 5)
    let serviceChargeRate = extracted.charge_percent || 5;
    if (!extracted.charge_percent && extracted.charge_amount > 0 && extracted.base_amount > 0) {
      serviceChargeRate = Math.round((extracted.charge_amount / extracted.base_amount) * 100);
    }

    const invoicePayload: InvoiceDatabaseInsert = {
      company_id: companyId,
      company_address_id: finalAddressId,
      invoice_number: extracted.invoice_number,
      date: extracted.date,
      subject: extracted.subject || "Tax Invoice",
      type: "salary",
      include_charge: serviceChargeRate > 0,
      charge_amount: serviceChargeRate,
      include_cgst: extracted.include_cgst || extracted.cgst_amount > 0,
      include_sgst: extracted.include_sgst || extracted.sgst_amount > 0,
      include_igst: extracted.include_igst || extracted.igst_amount > 0,
      is_paid: false,
      payroll_data: finalLineItems,
    };

    const { data: createdInvoice, error: createError } = await createInvoice({
      supabase,
      data: invoicePayload,
      bypassAuth: true,
    });

    if (createError || !createdInvoice) {
      return {
        filename: fileItem.name,
        relativePath: fileItem.relativePath,
        status: "error",
        message: createError?.message || "Database insert failed",
        archived: false,
        error: createError,
      };
    }

    let archived = false;
    try {
      await archiveInvoiceFile(fileItem);
      archived = true;
    } catch (archErr) {
      console.error("Failed to archive invoice file:", archErr);
    }

    return {
      filename: fileItem.name,
      relativePath: fileItem.relativePath,
      status: "success",
      message: `Successfully ingested Invoice #${extracted.invoice_number}`,
      invoiceId: createdInvoice.id,
      invoiceNumber: extracted.invoice_number,
      companyName: extracted.company_name,
      grandTotal: extracted.grand_total,
      archived,
    };
  } catch (err: any) {
    console.error("processSingleInvoice Error:", err);
    return {
      filename: fileItem.name,
      relativePath: fileItem.relativePath,
      status: "error",
      message: err.message || String(err),
      archived: false,
      error: err,
    };
  }
}

/**
 * Process all or selected pending invoice files in batch
 */
export async function processAllPendingInvoices({
  supabase,
  companyId,
  filePathsFilter,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  filePathsFilter?: string[];
}): Promise<InvoiceSyncBatchResult> {
  const rawFiles = await listPendingInvoiceFiles();
  const filterUtil = await getCompanyFileFilter({
    supabase,
    activeCompanyId: companyId,
  });
  const allFiles = await filterUtil.filterInvoiceFiles(rawFiles);
  const cleanFilters = filePathsFilter?.map((p) => p.replace(/\\/g, "/").toLowerCase());
  const files =
    cleanFilters && cleanFilters.length > 0
      ? allFiles.filter((f) => {
          const cleanId = (f.id || "").replace(/\\/g, "/").toLowerCase();
          const cleanFull = (f.fullPath || "").replace(/\\/g, "/").toLowerCase();
          const cleanRel = (f.relativePath || "").replace(/\\/g, "/").toLowerCase();
          return (
            filePathsFilter?.includes(f.id) ||
            filePathsFilter?.includes(f.fullPath) ||
            cleanFilters.includes(cleanId) ||
            cleanFilters.includes(cleanFull) ||
            cleanFilters.includes(cleanRel)
          );
        })
      : allFiles;

  const reports: ProcessInvoiceReport[] = [];

  for (const file of files) {
    const rep = await processSingleInvoice({
      fileItem: file,
      supabase,
      activeCompanyId: companyId,
    });
    reports.push(rep);
  }

  const processedCount = reports.filter(
    (r) => r.status === "success" || r.status === "skipped"
  ).length;

  return {
    success: true,
    message: `Batch processed ${processedCount}/${files.length} invoice files.`,
    timestamp: new Date().toLocaleTimeString(),
    filesFound: files.length,
    filesProcessed: processedCount,
    reports,
  };
}

