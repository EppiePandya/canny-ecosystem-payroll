import type { VehicleUsageDataType } from "@canny_ecosystem/supabase/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import { formatDate, getMonthName } from "@canny_ecosystem/utils";
import { Link } from "@remix-run/react";

type Props = {
  usage: VehicleUsageDataType;
};

export default function VehicleReimbursementDetailsDialog({ usage }: Props) {
  const reimbursementData = usage?.reimbursements;
  const reimbursement = Array.isArray(reimbursementData)
    ? reimbursementData[0]
    : reimbursementData;

  if (!reimbursement) return null;

  return (
    <Dialog>
      <DialogTrigger
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center px-2 py-1 rounded-md text-primary font-semibold cursor-pointer"
      >
        Yes
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">
            Vehicle Usage Reimbursement Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <Detail label="Vehicle Number">
            {usage?.vehicles?.registration_number ?? "--"}
          </Detail>

          <Detail label="Site">{usage?.vehicles?.sites?.name ?? "--"}</Detail>

          <Detail label="Period">
            {`${getMonthName(usage?.month)} ${usage?.year}`}
          </Detail>

          <Detail label="Kilometers">{usage?.kilometers ?? "--"}</Detail>

          <Detail label="Fuel Amount">
            {usage?.fuel_amount ? `₹${usage.fuel_amount}` : "--"}
          </Detail>

          <Detail label="Reimbursement Amount">
            {`₹${reimbursement?.amount ?? "--"}`}
          </Detail>

          <Detail label="Status">
            <span className="capitalize">{reimbursement?.status ?? "--"}</span>
          </Detail>

          <Detail label="Submitted Date">
            {formatDate(reimbursement?.submitted_date)}
          </Detail>

          <Detail label="Approved By">
            {reimbursement?.users?.email ?? "--"}
          </Detail>

          {(() => {
            const invoiceData = (reimbursement as any)?.invoice;
            const invoice = Array.isArray(invoiceData)
              ? invoiceData[0]
              : invoiceData;
            const invoiceId = reimbursement?.invoice_id;

            return (
              <Detail label="Invoice">
                {invoice ? (
                  <Link
                    to={`/payroll/invoices/${invoice.id}/preview-invoice`}
                    className="text-primary font-semibold hover:underline"
                  >
                    {invoice.invoice_number ?? "View Invoice"}{" "}
                    <span className="text-muted-foreground">
                      (Click to View)
                    </span>
                  </Link>
                ) : invoiceId ? (
                  <span className="text-muted-foreground">
                    Linked (ID: {invoiceId})
                  </span>
                ) : (
                  "--"
                )}
              </Detail>
            );
          })()}

          <Detail label="Note">{reimbursement?.note ?? "--"}</Detail>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 border-b pb-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{children || "--"}</p>
    </div>
  );
}
