import { numberToWords, roundToNearest } from "@canny_ecosystem/utils";
import {
  isESIField,
  isPFField,
  type InvoicePayrollItem,
  type InvoiceTotals,
} from "./types";

export function calculateInvoiceTotals({
  payrollData,
  type,
  chargeAmount,
  includeCgst,
  includeSgst,
  includeIgst,
}: {
  payrollData: InvoicePayrollItem[];
  type: string;
  chargeAmount: number;
  includeCgst: boolean;
  includeSgst: boolean;
  includeIgst: boolean;
}): InvoiceTotals {
  const savedChargeRate = Number(chargeAmount || 0);

  const totalGross =
    payrollData
      ?.filter((item) => item.type === "earning")
      ?.reduce((sum, item) => sum + Number(item.amount || 0), 0) ?? 0;

  const pfItem = payrollData?.find((item) => isPFField(item.field));
  const esiItem = payrollData?.find((item) => isESIField(item.field));

  const pfAmount = pfItem ? Number(pfItem.amount || 0) : 0;
  const esiAmount = esiItem ? Number(esiItem.amount || 0) : 0;

  const beforeService =
    roundToNearest(totalGross) +
    roundToNearest(pfAmount) +
    roundToNearest(esiAmount);

  let sum =
    payrollData
      ?.filter((item) => item.in_service_charge === true)
      ?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) ?? 0;

  if (sum === 0 && savedChargeRate > 0 && type === "salary") {
    const defaultFields = [
      "basic",
      "hra",
      "other allowance",
      "other allowances",
      "vda",
      "da",
    ];
    sum =
      payrollData
        ?.filter((item) =>
          defaultFields.includes((item.field || "").trim().toLowerCase()),
        )
        ?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) ?? 0;
  }

  const serviceCharge =
    savedChargeRate > 0
      ? type === "salary"
        ? roundToNearest((sum * savedChargeRate) / 100)
        : roundToNearest(
            (Number(
              payrollData.reduce(
                (acc, item) => acc + Number(item.amount || 0),
                0,
              ),
            ) *
              savedChargeRate) /
              100,
          )
      : 0;

  const subtotal =
    type === "salary"
      ? roundToNearest(beforeService) + roundToNearest(serviceCharge)
      : roundToNearest(
          Number(payrollData?.[0]?.amount || 0) + serviceCharge,
        );

  const cgst = includeCgst ? roundToNearest((subtotal * 9) / 100) : 0;
  const sgst = includeSgst ? roundToNearest((subtotal * 9) / 100) : 0;
  const igst = includeIgst ? roundToNearest((subtotal * 18) / 100) : 0;

  const totalGst = igst === 0 ? cgst + sgst : igst;
  const grandTotal = subtotal + cgst + sgst + igst;

  let words = "Zero";
  try {
    words = numberToWords(grandTotal);
  } catch (e) {
    words = "";
  }

  return {
    totalGross,
    beforeService,
    serviceChargeBasis: sum,
    serviceCharge,
    subtotal,
    cgst,
    sgst,
    igst,
    totalGst,
    grandTotal,
    words: words ? `${words.charAt(0).toUpperCase() + words.slice(1)} Only` : "",
  };
}
