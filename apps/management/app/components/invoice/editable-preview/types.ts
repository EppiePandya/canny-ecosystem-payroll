export interface InvoicePayrollItem {
  field: string;
  amount: number;
  type?: "earning" | "deduction" | string;
  in_service_charge?: boolean;
  order?: number;
}

export interface EditableInvoiceState {
  id?: string;
  invoice_number: string;
  date: string;
  subject: string;
  additional_text?: string | null;
  employee_count?: number | string | null;
  include_employee_count?: boolean;
  user_id?: string | null;
  company_address_id?: string | null;
  company_id?: string;
  type: "salary" | "reimbursement" | "exit";
  payroll_data: InvoicePayrollItem[];
  include_charge: boolean;
  charge_amount: number;
  include_cgst: boolean;
  include_sgst: boolean;
  include_igst: boolean;
  include_header: boolean;
  include_sign_stamp: boolean;
}

export interface InvoiceTotals {
  totalGross: number;
  beforeService: number;
  serviceChargeBasis: number;
  serviceCharge: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grandTotal: number;
  words: string;
}

export const isPFField = (name: string): boolean => {
  const lower = (name || "").trim().toLowerCase();
  return (
    lower === "pf" ||
    lower === "epf" ||
    lower.includes("provident fund") ||
    lower.includes("provident_fund") ||
    lower.includes("pf contribution")
  );
};

export const isESIField = (name: string): boolean => {
  const lower = (name || "").trim().toLowerCase();
  return (
    lower === "esi" ||
    lower === "esic" ||
    lower.includes("esic contribution") ||
    lower.includes("esi contribution") ||
    lower.includes("state insurance")
  );
};
