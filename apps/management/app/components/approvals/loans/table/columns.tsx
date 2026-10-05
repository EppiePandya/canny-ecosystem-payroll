import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { formatDate } from "@canny_ecosystem/utils";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Link } from "@remix-run/react";
import LoanReimbursementDetailsDialog from "../reimbursement-details-dialog";
import { DeductionDetailsDialog } from "../../deduction-details-dialog";

export const columns = (): ColumnDef<any>[] => [
  {
    id: "select",
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    enableSorting: false,
    accessorKey: "employee_name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <p className="truncate">
          {row.original.employee_id
            ? `${row.original.employees?.first_name} ${
                row.original.employees?.middle_name ?? ""
              } ${row.original.employees?.last_name ?? ""}`
            : `--`}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "employee_code",
    header: "Employee Code",
    cell: ({ row }) => {
      return row.original.employee_id ? (
        <Link
          to={`/employees/${row.original.employee_id}/loans`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80 group-hover:text-primary ">
            {row.original?.employees?.employee_code ?? "--"}
          </p>
        </Link>
      ) : (
        <p>--</p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "project_name",
    header: "Project",
    cell: ({ row }) => {
      const workDetail = Array.isArray(row.original.employees?.work_details)
        ? row.original.employees?.work_details[0]
        : row.original.employees?.work_details;
      return <p className="truncate ">{workDetail?.projects?.name ?? "--"}</p>;
    },
  },
  {
    enableSorting: false,
    accessorKey: "site_name",
    header: "Site",
    cell: ({ row }) => {
      const workDetail = Array.isArray(row.original.employees?.work_details)
        ? row.original.employees?.work_details[0]
        : row.original.employees?.work_details;
      return <p className="truncate ">{workDetail?.sites?.name ?? "--"}</p>;
    },
  },
  {
    accessorKey: "loan_name",
    header: "Loan Name",
    cell: ({ row }) => {
      return (
        <p className="truncate w-32 font-medium">{`${row.original?.loan_name}`}</p>
      );
    },
  },
  {
    accessorKey: "loan_date",
    header: "Loan Date",
    cell: ({ row }) => {
      return (
        <p className="truncate w-28">
          {formatDate(row.original?.loan_date || row.original?.created_at) ??
            "--"}
        </p>
      );
    },
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      return <p className="truncate w-24">{`₹${row.original?.amount}`}</p>;
    },
  },

  {
    id: "received_amount",
    header: "Received Amount",
    cell: ({ row }) => {
      const received = (row.original?.loan_deduction || []).reduce(
        (acc: number, curr: any) =>
          acc + (Number(curr.salary_field_values?.amount) || 0),
        0,
      );
      return (
        <p className="truncate w-32">{received ? `₹${received}` : "₹0"}</p>
      );
    },
  },
  {
    id: "deductions",
    header: "Deductions",
    cell: ({ row }) => {
      const deductions = (row.original as any)?.loan_deduction || [];
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DeductionDetailsDialog deductions={deductions} />
        </div>
      );
    },
  },
  {
    accessorKey: "monthly_installment",
    header: "Monthly Installment",
    cell: ({ row }) => {
      return (
        <p className="truncate w-32">
          {row.original?.monthly_installment
            ? `₹${row.original?.monthly_installment}`
            : "--"}
        </p>
      );
    },
  },
  {
    id: "reimbursement",
    header: "Reimb.",
    cell: ({ row }) => {
      const reimbursement = row.original?.reimbursements;

      if (!reimbursement) {
        return (
          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-green-500/15">
            No
          </span>
        );
      }

      return (
        <div onClick={(e) => e.stopPropagation()}>
          <LoanReimbursementDetailsDialog loan={row.original} />
        </div>
      );
    },
  },
  {
    accessorKey: "is_paid",
    header: "Status",
    cell: ({ row }) => {
      const isPaid = row.original?.is_paid;
      return (
        <div
          className={cn(
            "px-2 py-1 rounded text-[10px] font-bold w-fit uppercase tracking-wider",
            isPaid
              ? "bg-green/20 text-green border border-green/30"
              : "bg-muted text-muted-foreground border border-border",
          )}
        >
          {isPaid ? "PAID" : "PENDING"}
        </div>
      );
    },
  },
];
