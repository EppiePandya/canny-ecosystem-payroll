import { LetterFooter } from "@canny_ecosystem/ui/letter-footer";
import { LetterHeader } from "@canny_ecosystem/ui/letter-header";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  getCannyCompanyIdByName,
  getCompanyById,
  getInvoiceById,
  getReimbursementEntriesByInvoiceIdForInvoicePreview,
  getRelationshipsByParentAndChildCompanyId,
  type EmployeeWorkDetailsDataType,
  getExitEntriesByPayrollIdForInvoicePreview,
  getLocationById,
  getSalaryEntriesForInvoiceByInvoiceId,
  getUserById,
  getPrimaryLocationByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type {
  CompanyDatabaseRow,
  EmployeeDatabaseRow,
  EmployeeStatutoryDetailsDatabaseRow,
  InvoiceDatabaseRow,
  LocationDatabaseRow,
  PayrollDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import { Dialog, DialogContent } from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import {
  formatDateToSlash,
  formatNumber,
  getMonthNameFromNumber,
  numberToWords,
  replaceUnderscore,
  roundToNearest,
} from "@canny_ecosystem/utils";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  CANNY_MANAGEMENT_SERVICES_GSTIN,
  CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER,
  CANNY_MANAGEMENT_SERVICES_PAN_NUMBER,
  CANNY_MANAGEMENT_SERVICES_NAME,
  CANNY_NAME,
} from "@/constant";

type DataTypeForRegister = {
  month?: string;
  year?: number;
  payrollData: PayrollDatabaseRow;
  companyData: CompanyDatabaseRow & LocationDatabaseRow;
  employeeData: {
    attendance?: {
      working_days: number;
      weekly_off: number;
      paid_holidays: number;
      paid_days: number;
      paid_leaves: number;
      casual_leaves: number;
      absents: number;
    };
    employeeData: EmployeeDatabaseRow;
    employeeProjectAssignmentData?: EmployeeWorkDetailsDataType;
    employeeStatutoryDetails?: EmployeeStatutoryDetailsDatabaseRow;
    invoiceFields?: {
      name: string;
      amount: number;
    }[];
    earnings: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
  }[];
  invoiceDetails: InvoiceDatabaseRow & { payroll_data: any[] };
};

export function InvoiceHTMLPreview({
  data,
  location,
  type,
}: {
  data: DataTypeForRegister;
  location: LocationDatabaseRow;
  type: string;
}) {
  const details = data?.invoiceDetails;
  const rawPayroll = Array.isArray(details?.payroll_data)
    ? details.payroll_data
    : typeof details?.payroll_data === "string"
      ? JSON.parse(details.payroll_data || "[]")
      : [];

  const parsedPayroll = [...rawPayroll].sort((a: any, b: any) => {
    const orderA =
      a?.order != null && a?.order !== "" ? Number(a.order) : Infinity;
    const orderB =
      b?.order != null && b?.order !== "" ? Number(b.order) : Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return 0;
  });

  const subtotal = parsedPayroll.reduce(
    (sum: number, item: any) => sum + Number(item.amount || 0),
    0,
  );
  const chargeRate = Number(details?.charge_amount || 0);
  const serviceCharge =
    chargeRate > 0 ? roundToNearest((subtotal * chargeRate) / 100) : 0;
  const taxableTotal = subtotal + serviceCharge;

  const cgst = details?.include_cgst
    ? roundToNearest((taxableTotal * 9) / 100)
    : 0;
  const sgst = details?.include_sgst
    ? roundToNearest((taxableTotal * 9) / 100)
    : 0;
  const igst = details?.include_igst
    ? roundToNearest((taxableTotal * 18) / 100)
    : 0;
  const grandTotal = taxableTotal + cgst + sgst + igst;

  let words = "";
  try {
    words = numberToWords(grandTotal);
  } catch (e) {
    words = "";
  }

  return (
    <div className="bg-white text-black p-8 max-w-4xl mx-auto shadow-sm text-xs font-sans space-y-6">
      {details?.include_header && (
        <div className="mb-4">
          <LetterHeader />
        </div>
      )}

      <div className="text-center font-bold text-sm tracking-wider uppercase border-b pb-2">
        Tax Invoice
      </div>

      <div className="flex justify-between items-start text-[11px]">
        <div>
          <div className="font-bold text-xs">{CANNY_MANAGEMENT_SERVICES_NAME}</div>
          <div className="text-neutral-600">GSTIN: {CANNY_MANAGEMENT_SERVICES_GSTIN}</div>
          <div className="text-neutral-600">PAN: {CANNY_MANAGEMENT_SERVICES_PAN_NUMBER}</div>
          <div className="text-neutral-600">HSN: {CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER}</div>
        </div>
        <div className="text-right">
          <div><span className="font-bold">Invoice No:</span> {details?.invoice_number}</div>
          <div><span className="font-bold">Date:</span> {details?.date ? formatDateToSlash(details.date) : "--"}</div>
        </div>
      </div>

      <div className="border border-neutral-300 rounded p-3 text-[11px]">
        <div className="font-bold text-xs text-neutral-800 mb-1">Bill To:</div>
        <div className="font-semibold">{data.companyData?.name}</div>
        <div className="text-neutral-600">
          {location?.address_line_1} {location?.city} {location?.state} {location?.pincode}
        </div>
        {location?.gst_number && (
          <div className="text-neutral-600 font-medium mt-1">GSTIN: {location.gst_number}</div>
        )}
      </div>

      {details?.subject && (
        <div className="font-bold text-xs text-center my-2">
          Sub: {details.subject}
        </div>
      )}

      <table className="w-full border-collapse border border-neutral-300 text-xs">
        <thead>
          <tr className="bg-neutral-100 border-b border-neutral-300 font-bold">
            <th className="p-2 border-r border-neutral-300 text-left">Description</th>
            <th className="p-2 text-right w-36">Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          {parsedPayroll.map((item: any, i: number) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="p-2 border-r border-neutral-300">{item.field}</td>
              <td className="p-2 text-right">{formatNumber(item.amount)}</td>
            </tr>
          ))}
          {serviceCharge > 0 && (
            <tr className="border-b border-neutral-200">
              <td className="p-2 border-r border-neutral-300 font-medium">Service Charge @ {chargeRate}%</td>
              <td className="p-2 text-right">{formatNumber(serviceCharge)}</td>
            </tr>
          )}
          <tr className="border-b border-neutral-300 font-semibold bg-neutral-50">
            <td className="p-2 border-r border-neutral-300">Sub Total</td>
            <td className="p-2 text-right">{formatNumber(taxableTotal)}</td>
          </tr>
          {cgst > 0 && (
            <tr className="border-b border-neutral-200">
              <td className="p-2 border-r border-neutral-300">C.G.S.T @ 9%</td>
              <td className="p-2 text-right">{formatNumber(cgst)}</td>
            </tr>
          )}
          {sgst > 0 && (
            <tr className="border-b border-neutral-200">
              <td className="p-2 border-r border-neutral-300">S.G.S.T @ 9%</td>
              <td className="p-2 text-right">{formatNumber(sgst)}</td>
            </tr>
          )}
          {igst > 0 && (
            <tr className="border-b border-neutral-200">
              <td className="p-2 border-r border-neutral-300">I.G.S.T @ 18%</td>
              <td className="p-2 text-right">{formatNumber(igst)}</td>
            </tr>
          )}
          <tr className="font-bold text-sm bg-neutral-100 border-t-2 border-neutral-400">
            <td className="p-2 border-r border-neutral-300">Grand Total</td>
            <td className="p-2 text-right">₹{formatNumber(grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      {words && (
        <div className="text-[11px] font-semibold text-neutral-700">
          Amount in Words: {words.charAt(0).toUpperCase() + words.slice(1)} Only
        </div>
      )}

      <div className="flex justify-between items-end pt-8">
        <div className="text-[10px] text-neutral-500">
          This is a computer generated invoice.
        </div>
        <div className="text-right text-xs">
          <div className="font-bold">For {CANNY_MANAGEMENT_SERVICES_NAME}</div>
          <div className="mt-8 font-medium">Authorized Signatory</div>
        </div>
      </div>

      <div className="pt-6 border-t">
        <LetterFooter />
      </div>
    </div>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const invoiceId = params.invoiceId as string;
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  const { data: invoiceData } = await getInvoiceById({
    supabase,
    id: invoiceId,
  });

  const { data: cannyData } = await getCannyCompanyIdByName({
    supabase,
    name: CANNY_NAME,
  });

  const { data: userData } = await getUserById({
    supabase,
    userId: invoiceData?.user_id || "",
  });

  const { data: employeeCompanyData } = await getCompanyById({
    supabase,
    id: invoiceData?.company_id || companyId,
  });

  const { data: companyAddress } = await getPrimaryLocationByCompanyId({
    supabase,
    companyId: cannyData?.id || "",
  });

  const { data: locationData } = await getLocationById({
    supabase,
    id: invoiceData?.company_address_id || "",
  });

  let payrollDataAndOthers: any[] = [];
  if (invoiceData?.type === "salary") {
    const { data: entries } = await getSalaryEntriesForInvoiceByInvoiceId({
      supabase,
      invoiceId,
    });
    payrollDataAndOthers = entries || [];
  } else if (invoiceData?.type === "reimbursement") {
    const { data: entries } =
      await getReimbursementEntriesByInvoiceIdForInvoicePreview({
        supabase,
        invoiceId,
      });
    payrollDataAndOthers = entries || [];
  } else if (invoiceData?.type === "exit") {
    const { data: entries } = await getExitEntriesByPayrollIdForInvoicePreview({
      supabase,
      invoiceId,
    });
    payrollDataAndOthers = entries || [];
  }

  return {
    data: {
      invoiceData,
      employeeCompanyData,
      payrollDataAndOthers,
    },
    companyAddress,
    userData,
    locationData,
  };
}

export default function PreviewInvoice() {
  const { data, locationData, userData } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { isDocument } = useIsDocument();

  const invoice = data?.invoiceData;

  const registerData = {
    companyData: {
      name: data?.employeeCompanyData?.name,
      address_line_1: locationData?.address_line_1,
      city: locationData?.city,
      state: locationData?.state,
      pincode: locationData?.pincode,
    },
    employeeData: [],
    invoiceDetails: invoice as any,
  };

  if (!isDocument) return <div>Loading...</div>;

  const handleOpenChange = () => {
    navigate("/payroll/invoices");
  };

  return (
    <Dialog defaultOpen={true} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-4xl h-[92vh] border border-gray-200 rounded-lg p-0 flex flex-col overflow-hidden bg-background"
        disableIcon={true}
      >
        <div className="flex justify-between items-center px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <div className="text-sm font-semibold">
            Invoice Preview - {invoice?.invoice_number || ""}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print Invoice
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4">
          <InvoiceHTMLPreview
            data={registerData as unknown as DataTypeForRegister}
            location={locationData as unknown as LocationDatabaseRow}
            type={invoice?.type || "salary"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
