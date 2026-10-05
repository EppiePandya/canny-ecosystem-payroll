import {
  CANNY_MANAGEMENT_SERVICES_GSTIN,
  CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER,
  CANNY_MANAGEMENT_SERVICES_PAN_NUMBER,
  CANNY_MANAGEMENT_SERVICES_NAME,
} from "@/constant";
import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";
import { formatDateToSlash } from "@canny_ecosystem/utils";
import { Icon } from "@canny_ecosystem/ui/icon";
import { calculateInvoiceTotals } from "./calculator";
import { isESIField, isPFField } from "./types";
import type { EditableInvoiceState, InvoicePayrollItem } from "./types";

interface EditableInvoiceDocumentProps {
  state: EditableInvoiceState;
  onChange: (updates: Partial<EditableInvoiceState>) => void;
  companyName?: string;
  location?: {
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    pincode?: string | null;
    state?: string | null;
    gst_number?: string | null;
  } | null;
  employeeCount?: number;
  canEdit?: boolean;
}

const SERIF_FONT = '"Times New Roman", Times, Georgia, "Liberation Serif", serif';

const formatFieldName = (field: string): string => {
  const raw = (field || "").trim();
  const upper = raw.toUpperCase();
  if (
    [
      "PF",
      "EPF",
      "ESI",
      "ESIC",
      "DA",
      "VDA",
      "HRA",
      "PT",
      "BONUS",
      "NPS",
      "TDS",
      "GST",
      "CGST",
      "SGST",
      "IGST",
    ].includes(upper)
  ) {
    return upper;
  }
  return raw
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

const getOrderedPayrollItems = (items: InvoicePayrollItem[]) => {
  const hasCustomOrder = items.some(
    (i) => i.order != null && i.order !== "" && !Number.isNaN(Number(i.order)),
  );

  if (hasCustomOrder) {
    return [...items].sort((a, b) => {
      const orderA =
        a?.order != null && a?.order !== "" ? Number(a.order) : Infinity;
      const orderB =
        b?.order != null && b?.order !== "" ? Number(b.order) : Infinity;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });
  }

  const earningOrder = [
    "basic",
    "da",
    "vda",
    "hra",
    "allowance",
    "overtime",
    "leave salary",
    "leave_salary",
    "bonus",
  ];

  const earnings = items.filter(
    (i) => i.type === "earning" && (Number(i.amount) > 0 || i.field),
  );
  earnings.sort((a, b) => {
    const aField = (a.field || "").toLowerCase().trim();
    const bField = (b.field || "").toLowerCase().trim();
    const aIdx = earningOrder.findIndex((k) => aField.includes(k));
    const bIdx = earningOrder.findIndex((k) => bField.includes(k));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return (Number(a.order) || 0) - (Number(b.order) || 0);
  });

  const statutoryDeductions = items.filter(
    (i) =>
      i.type === "deduction" &&
      (isPFField(i.field) || isESIField(i.field)) &&
      Number(i.amount) > 0,
  );
  statutoryDeductions.sort((a, b) => {
    const aField = (a.field || "").toLowerCase();
    const bField = (b.field || "").toLowerCase();
    if (aField.includes("pf") && bField.includes("esi")) return -1;
    if (aField.includes("esi") && bField.includes("pf")) return 1;
    return 0;
  });

  return [...earnings, ...statutoryDeductions];
};

export function EditableInvoiceDocument({
  state,
  onChange,
  companyName = "Company Name",
  location,
  employeeCount = 0,
  canEdit = true,
}: EditableInvoiceDocumentProps) {
  const totals = calculateInvoiceTotals({
    payrollData: state.payroll_data,
    type: state.type,
    chargeAmount: state.charge_amount,
    includeCgst: state.include_cgst,
    includeSgst: state.include_sgst,
    includeIgst: state.include_igst,
  });

  const handleRowChange = (
    index: number,
    fieldUpdates: Partial<InvoicePayrollItem>,
  ) => {
    const updated = [...state.payroll_data];
    updated[index] = { ...updated[index], ...fieldUpdates };
    onChange({ payroll_data: updated });
  };

  const handleAddRow = () => {
    const newOrder = state.payroll_data.length + 1;
    const updated = [
      ...state.payroll_data,
      {
        field: "New Allowance",
        amount: 0,
        type: "earning",
        in_service_charge: true,
        order: newOrder,
      },
    ];
    onChange({ payroll_data: updated });
  };

  const handleDeleteRow = (index: number) => {
    const updated = state.payroll_data.filter((_, i) => i !== index);
    onChange({ payroll_data: updated });
  };

  const displayPayrollData = (canEdit
    ? state.payroll_data
    : getOrderedPayrollItems(state.payroll_data)
  ).filter((item) => item.field !== "__meta__");

  return (
    <div
      className="w-full flex justify-center py-6 px-2 sm:px-4 bg-neutral-200 dark:bg-neutral-900 min-h-full overflow-y-auto"
      style={{ fontFamily: SERIF_FONT }}
    >
      <article
        aria-label="Tax-Invoice Document"
        className="invoice-document-root w-full max-w-[780px] bg-white text-black shadow-xl border border-neutral-300 px-8 py-8 sm:px-10 sm:py-9 flex flex-col justify-between select-text"
        style={{
          fontFamily: SERIF_FONT,
          color: "#000000",
        }}
      >
        <style>{`
          .invoice-document-root,
          .invoice-document-root * {
            font-family: "Times New Roman", Times, Georgia, "Liberation Serif", serif !important;
            color: #000000 !important;
          }
          .invoice-document-root input,
          .invoice-document-root textarea {
            font-family: "Times New Roman", Times, Georgia, "Liberation Serif", serif !important;
            color: #000000 !important;
          }
        `}</style>

        {/* Top Section */}
        <div style={{ fontFamily: SERIF_FONT, color: "#000000" }}>
          {/* Letterhead Header / Top Spacing */}
          {state.include_header ? (
            <div className="mb-4">
              <img
                src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/letters-header.png`}
                alt="Letterhead Header"
                className="w-full h-auto object-contain pointer-events-none"
              />
            </div>
          ) : (
            <div className="h-24 sm:h-28" />
          )}

          {/* Document Title */}
          <div className="text-center mt-1 mb-5">
            <h1
              className="text-[22px] font-bold text-black tracking-normal"
              style={{ fontFamily: SERIF_FONT }}
            >
              Tax-Invoice
            </h1>
          </div>

          {/* Invoice No & Date */}
          <div
            className="flex flex-row justify-between items-center text-[13px] font-bold mb-3 text-black"
            style={{ fontFamily: SERIF_FONT }}
          >
            <div className="flex items-center gap-1">
              <span>Invoice no :</span>
              {canEdit ? (
                <input
                  type="text"
                  value={state.invoice_number}
                  onChange={(e) => onChange({ invoice_number: e.target.value })}
                  placeholder="CMS/2026-27/451"
                  style={{ fontFamily: SERIF_FONT }}
                  className="font-bold text-[13px] px-1 py-0.5 bg-transparent hover:bg-neutral-50 focus:bg-white border-0 focus:outline-hidden rounded w-40 sm:w-48 text-black"
                />
              ) : (
                <span className="font-bold">{state.invoice_number}</span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span>Date :</span>
              {canEdit ? (
                <input
                  type="date"
                  value={
                    state.date
                      ? new Date(state.date).toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) => onChange({ date: e.target.value })}
                  style={{ fontFamily: SERIF_FONT }}
                  className="font-bold text-[13px] px-1 py-0.5 bg-transparent hover:bg-neutral-50 focus:bg-white border-0 focus:outline-hidden rounded text-black"
                />
              ) : (
                <span className="font-bold">
                  {state.date ? formatDateToSlash(state.date) : "--"}
                </span>
              )}
            </div>
          </div>

          {/* M/S Company Details */}
          <div
            className="flex items-start gap-1 text-[13px] mb-3 text-black leading-tight"
            style={{ fontFamily: SERIF_FONT }}
          >
            <span
              className="font-bold text-[13px] w-10 shrink-0 pt-[1px]"
              style={{ fontFamily: SERIF_FONT }}
            >
              M/S.
            </span>
            <div
              className="flex-1 space-y-[2px]"
              style={{ fontFamily: SERIF_FONT }}
            >
              {/* Company Name with full width bottom border */}
              <div
                className="font-bold border-b border-black pb-[1px] text-[13px]"
                style={{ fontFamily: SERIF_FONT }}
              >
                {companyName}
              </div>

              {/* Address Line 1 with bottom border */}
              <div
                className="border-b border-black pb-[1px] text-black text-[13px]"
                style={{ fontFamily: SERIF_FONT }}
              >
                {location?.address_line_1 || "\u00A0"}
              </div>

              {/* Address Line 2 with bottom border if present */}
              {location?.address_line_2 ? (
                <div
                  className="border-b border-black pb-[1px] text-black text-[13px]"
                  style={{ fontFamily: SERIF_FONT }}
                >
                  {location.address_line_2}
                </div>
              ) : null}

              {/* City, State with bottom border */}
              <div
                className="border-b border-black pb-[1px] text-black text-[13px]"
                style={{ fontFamily: SERIF_FONT }}
              >
                {[location?.city, location?.pincode]
                  .filter(Boolean)
                  .join("-")}
                {location?.state ? `, ${location.state.toUpperCase()}` : "\u00A0"}
              </div>

              {/* GSTIN with bottom border */}
              <div
                className="border-b border-black pb-[1px] font-bold text-black text-[13px]"
                style={{ fontFamily: SERIF_FONT }}
              >
                GSTIN : {location?.gst_number || ""}
              </div>

              {/* Contact Person (NO bottom border) */}
              <div
                className="pt-[2px] flex items-center justify-between text-[13px]"
                style={{ fontFamily: SERIF_FONT }}
              >
                <div className="flex items-center gap-1 font-bold">
                  <span>Contact Person :-</span>
                  {canEdit ? (
                    <input
                      type="text"
                      value={state.user_id || ""}
                      onChange={(e) => onChange({ user_id: e.target.value })}
                      placeholder="Contact Name..."
                      style={{ fontFamily: SERIF_FONT }}
                      className="px-1 py-0 bg-transparent hover:bg-neutral-50 focus:bg-white border-0 focus:outline-hidden font-normal text-[13px] w-52 text-black"
                    />
                  ) : (
                    <span className="font-normal">{state.user_id || ""}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Invoice Table Box */}
          <div
            className="border border-black mt-2 text-[13px] text-black"
            style={{ fontFamily: SERIF_FONT }}
          >
            {/* Header Row */}
            <div
              className="flex flex-row border-b border-black font-bold text-center text-[13px]"
              style={{ fontFamily: SERIF_FONT }}
            >
              <div className="w-[54px] border-r border-black py-1.5 px-1 flex items-center justify-center">
                <span>Sr No.</span>
              </div>
              <div className="flex-1 border-r border-black py-1.5 px-2 flex items-center justify-center">
                <span>Particulars</span>
              </div>
              <div className="w-[110px] border-r border-black py-1.5 px-2 flex items-center justify-center">
                <span>Amount Rs.</span>
              </div>
              <div className="w-[42px] py-1.5 px-1 flex items-center justify-center">
                <span>Ps</span>
              </div>
            </div>

            {/* Table Body */}
            <div
              className="flex flex-row min-h-[440px] border-b border-black text-[13px]"
              style={{ fontFamily: SERIF_FONT }}
            >
              {/* Sr No Column */}
              <div
                className="w-[54px] border-r border-black py-2.5 text-center font-normal text-[13px]"
                style={{ fontFamily: SERIF_FONT }}
              >
                1
              </div>

              {/* Particulars Column */}
              <div
                className="flex-1 border-r border-black p-2.5 flex flex-col justify-between"
                style={{ fontFamily: SERIF_FONT }}
              >
                {/* Top: Subject & Line Item Labels */}
                <div>
                  {/* Subject Description */}
                  <div
                    className="leading-snug text-[13px] min-h-[36px]"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {canEdit ? (
                      <textarea
                        rows={2}
                        value={state.subject}
                        onChange={(e) => onChange({ subject: e.target.value })}
                        placeholder="Providing Manpower on Labour contract basis at your Porbandar Adani Office for Month of August 2026"
                        style={{ fontFamily: SERIF_FONT }}
                        className="w-full resize-none bg-transparent hover:bg-neutral-50 focus:bg-white border-0 focus:outline-hidden p-0 text-[13px] leading-snug text-black"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap">{state.subject}</div>
                    )}
                  </div>

                  {/* Total Employees & Line Items */}
                  <div
                    className="flex flex-row justify-between items-start mt-2"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {/* Left: Total Employees & Additional Details / Notes */}
                    <div
                      className="flex-1 pr-3 flex flex-col"
                      style={{ fontFamily: SERIF_FONT }}
                    >
                      {/* Total Employees Row */}
                      {state.include_employee_count ?? (state.type === "salary") ? (
                        <div className="flex items-center gap-1.5 font-bold text-[13px] group">
                          <span>Total Employees :</span>
                          {canEdit ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={
                                  state.employee_count !== undefined && state.employee_count !== null
                                    ? state.employee_count
                                    : employeeCount
                                }
                                onChange={(e) =>
                                  onChange({
                                    employee_count: e.target.value === "" ? 0 : Number(e.target.value),
                                  })
                                }
                                style={{ fontFamily: SERIF_FONT }}
                                className="w-16 px-1 py-0.5 font-bold text-[13px] bg-transparent hover:bg-neutral-50 focus:bg-white border border-transparent hover:border-neutral-300 focus:border-black rounded focus:outline-hidden text-black transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => onChange({ include_employee_count: false })}
                                className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 text-xs transition-opacity cursor-pointer p-0.5"
                                title="Remove Total Employees"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <span>
                              {state.employee_count !== undefined && state.employee_count !== null
                                ? state.employee_count
                                : employeeCount}
                            </span>
                          )}
                        </div>
                      ) : (
                        canEdit && (
                          <div className="mb-1">
                            <button
                              type="button"
                              onClick={() =>
                                onChange({
                                  include_employee_count: true,
                                  employee_count:
                                    state.employee_count !== undefined && state.employee_count !== null
                                      ? state.employee_count
                                      : employeeCount,
                                })
                              }
                              className="text-[11.5px] text-muted-foreground hover:text-foreground underline decoration-dotted cursor-pointer"
                            >
                              + Add Total Employees
                            </button>
                          </div>
                        )
                      )}

                      {/* Additional Multiline Notes / Next Lines */}
                      {canEdit ? (
                        <div className="mt-1.5 flex-1">
                          <textarea
                            rows={3}
                            value={state.additional_text || ""}
                            onChange={(e) =>
                              onChange({ additional_text: e.target.value })
                            }
                            placeholder="Write additional details, notes, or descriptions here (press Enter for next line)..."
                            style={{ fontFamily: SERIF_FONT }}
                            className="w-full resize-y min-h-[50px] bg-transparent hover:bg-neutral-50 focus:bg-white border border-dashed border-transparent hover:border-neutral-300 focus:border-neutral-400 rounded p-1 text-[12px] leading-snug text-black focus:outline-hidden whitespace-pre-wrap transition-colors"
                          />
                        </div>
                      ) : (
                        state.additional_text && (
                          <div className="mt-1.5 text-[12px] leading-snug whitespace-pre-wrap text-black">
                            {state.additional_text}
                          </div>
                        )
                      )}
                    </div>

                    {/* Right: Line Items Labels */}
                    <div
                      className="w-[130px] sm:w-[140px] flex flex-col"
                      style={{ fontFamily: SERIF_FONT }}
                    >
                      {displayPayrollData.map((item, idx) => (
                        <div
                          key={idx}
                          className="h-[20px] flex items-center justify-between group text-[13px] leading-none"
                          style={{ fontFamily: SERIF_FONT }}
                        >
                          {canEdit ? (
                            <input
                              type="text"
                              value={item.field}
                              onChange={(e) =>
                                handleRowChange(idx, { field: e.target.value })
                              }
                              style={{ fontFamily: SERIF_FONT }}
                              className="w-full px-0 py-0 bg-transparent hover:bg-neutral-50 focus:bg-white border-0 focus:outline-hidden rounded text-[13px] text-black h-full leading-none"
                            />
                          ) : (
                            <span
                              className="text-[13px] leading-none"
                              style={{ fontFamily: SERIF_FONT }}
                            >
                              {formatFieldName(item.field)}
                            </span>
                          )}

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(idx)}
                              className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-1"
                              title="Delete"
                            >
                              <Icon name="trash" className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}

                      {canEdit && (
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={handleAddRow}
                            style={{ fontFamily: SERIF_FONT }}
                            className="text-[11px] text-primary hover:underline"
                          >
                            + Add line
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom: Statutory Details & Totals Labels */}
                <div
                  className="flex flex-row justify-between items-end pt-4"
                  style={{ fontFamily: SERIF_FONT }}
                >
                  {/* Left: Statutory */}
                  <div
                    className="space-y-[2px] text-[12px] font-bold leading-tight"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    <div>
                      HSN CODE NO. :- {CANNY_MANAGEMENT_SERVICES_HSN_CODE_NUMBER}
                    </div>
                    <div>
                      PAN NO. :- {CANNY_MANAGEMENT_SERVICES_PAN_NUMBER}
                    </div>
                    <div>
                      GSTIN :- {CANNY_MANAGEMENT_SERVICES_GSTIN}
                    </div>
                    <div>
                      TOTAL GSTIN AMOUNT :- {Math.round(totals.totalGst)}
                    </div>
                  </div>

                  {/* Right: Totals Labels */}
                  <div
                    className="w-[130px] sm:w-[140px] flex flex-col text-[13px]"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    <div className="h-[20px] flex items-center whitespace-nowrap leading-none text-[13px]">
                      {state.type === "reimbursement"
                        ? "Reimbursement Charge"
                        : state.type === "exit"
                          ? "Exit Charge"
                          : "Service Charge"}{" "}
                      @ {state.charge_amount || 0}%
                    </div>
                    <div className="h-[20px] flex items-center font-bold whitespace-nowrap leading-none text-[13px]">
                      Total
                    </div>
                    <div className="h-[20px] flex items-center whitespace-nowrap leading-none text-[13px]">
                      C.G.S.T @ 9%
                    </div>
                    <div className="h-[20px] flex items-center whitespace-nowrap leading-none text-[13px]">
                      S.G.S.T @ 9%
                    </div>
                    <div className="h-[20px] flex items-center whitespace-nowrap leading-none text-[13px]">
                      I.G.S.T @ 18%
                    </div>
                    <div className="h-[22px] flex items-center font-bold text-[13.5px] whitespace-nowrap leading-none">
                      Grand Total
                    </div>
                  </div>
                </div>
              </div>

              {/* Amount Rs. Column */}
              <div
                className="w-[110px] border-r border-black p-2.5 px-0 flex flex-col justify-between"
                style={{ fontFamily: SERIF_FONT }}
              >
                {/* Top: Item Amounts */}
                <div>
                  {/* Invisible spacer to match subject height */}
                  <div className="min-h-[36px] leading-snug select-none pointer-events-none" />
                  <div
                    className="mt-2 flex flex-col"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {displayPayrollData.map((item, idx) => (
                      <div
                        key={idx}
                        className="h-[20px] flex items-center justify-end text-right pr-4 text-[13px] leading-none"
                        style={{ fontFamily: SERIF_FONT }}
                      >
                        {canEdit ? (
                          <input
                            type="number"
                            step="any"
                            value={item.amount || 0}
                            onChange={(e) =>
                              handleRowChange(idx, {
                                amount: Number(e.target.value),
                              })
                            }
                            style={{ fontFamily: SERIF_FONT }}
                            className="w-full text-right bg-transparent hover:bg-neutral-50 focus:bg-white border-0 focus:outline-hidden p-0 text-[13px] text-black h-full leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        ) : (
                          <span
                            className="text-[13px] leading-none"
                            style={{ fontFamily: SERIF_FONT }}
                          >
                            {Math.round(Number(item.amount || 0))}
                          </span>
                        )}
                      </div>
                    ))}
                    {canEdit && <div className="h-[20px]" />}
                  </div>
                </div>

                {/* Bottom: Totals Amounts */}
                <div
                  className="flex flex-col text-[13px]"
                  style={{ fontFamily: SERIF_FONT }}
                >
                  <div
                    className="h-[20px] flex items-center justify-end text-right pr-4 leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {Math.round(totals.serviceCharge)}
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-end text-right pr-4 font-bold border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {Math.round(totals.subtotal)}
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-end text-right pr-4 border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {Math.round(totals.cgst)}
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-end text-right pr-4 border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {Math.round(totals.sgst)}
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-end text-right pr-4 border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {Math.round(totals.igst)}
                  </div>
                  <div
                    className="h-[22px] flex items-center justify-end text-right pr-4 font-bold text-[13.5px] border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {Math.round(totals.grandTotal)}
                  </div>
                </div>
              </div>

              {/* Ps Column */}
              <div
                className="w-[42px] p-2.5 px-0 flex flex-col justify-between"
                style={{ fontFamily: SERIF_FONT }}
              >
                {/* Top: Item Ps */}
                <div>
                  <div className="min-h-[36px] leading-snug select-none pointer-events-none" />
                  <div
                    className="mt-2 flex flex-col"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {displayPayrollData.map((_, idx) => (
                      <div
                        key={idx}
                        className="h-[20px] flex items-center justify-center text-center text-[13px] leading-none"
                        style={{ fontFamily: SERIF_FONT }}
                      >
                        0
                      </div>
                    ))}
                    {canEdit && <div className="h-[20px]" />}
                  </div>
                </div>

                {/* Bottom: Totals Ps */}
                <div
                  className="flex flex-col text-[13px]"
                  style={{ fontFamily: SERIF_FONT }}
                >
                  <div
                    className="h-[20px] flex items-center justify-center text-center leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    0
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-center text-center font-bold border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    0
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-center text-center border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    0
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-center text-center border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    0
                  </div>
                  <div
                    className="h-[20px] flex items-center justify-center text-center border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    0
                  </div>
                  <div
                    className="h-[22px] flex items-center justify-center text-center font-bold text-[13.5px] border-t border-black leading-none"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    0
                  </div>
                </div>
              </div>
            </div>

            {/* Full-width Rupees Row */}
            <div
              className="px-3 py-1.5 font-bold text-[13px] leading-snug"
              style={{ fontFamily: SERIF_FONT }}
            >
              <span>Rupees :- </span>
              <span className="capitalize">{totals.words}</span>
            </div>
          </div>

          {/* Footer: Notes & Signatures Section */}
          <div
            className="mt-3 text-black"
            style={{ fontFamily: SERIF_FONT, color: "#000000" }}
          >
            {/* Top Row: Note on Left, Company Header on Right */}
            <div className="flex flex-row justify-between items-end text-[12px]">
              {/* Note Line */}
              <div className="text-[12px] leading-tight">
                <p>Note :- Payment made only cross Cheque or DD favour of</p>
                <div className="ml-6 font-bold text-[12px] mt-0.5">
                  {CANNY_MANAGEMENT_SERVICES_NAME}{" "}
                  <span className="font-normal text-black">
                    payable at Ahmedabad
                  </span>
                </div>
              </div>

              {/* Right: For Company Header */}
              <div className="font-bold text-black text-[12px] whitespace-nowrap text-right relative">
                For. {CANNY_MANAGEMENT_SERVICES_NAME.toUpperCase()}
                {state.include_sign_stamp && (
                  <div className="absolute top-4 right-0 w-44 h-12 flex items-center justify-end pointer-events-none z-10">
                    <img
                      src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/company-stamp.png`}
                      alt="Stamp"
                      className="w-12 h-12 object-contain opacity-90 absolute right-4 -top-1"
                    />
                    <img
                      src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/signature.png`}
                      alt="Signature"
                      className="w-20 h-auto object-contain absolute right-0 top-0 z-10"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Receiver Signature on Left, Authorized Signature on Right */}
            <div className="mt-8 sm:mt-10 flex flex-row justify-between items-end text-[12px]">
              {/* Left: Receiver Signature */}
              <div className="space-y-1">
                <div className="w-44 border-b border-black" />
                <div className="font-normal text-black">
                  Receiver's signature with seal
                </div>
              </div>

              {/* Right: Authorized Signature */}
              <div className="font-normal text-black text-[12px] text-right">
                Authorized signature
              </div>
            </div>

            {/* Letterhead Footer */}
            {state.include_header && (
              <div className="mt-4 -mx-8 sm:-mx-10 -mb-8 sm:-mb-9 overflow-hidden">
                <img
                  src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/letters-footer.png`}
                  alt="Letterhead Footer"
                  className="w-full h-auto object-contain pointer-events-none"
                />
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

