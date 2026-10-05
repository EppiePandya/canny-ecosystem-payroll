import {
  deleteRole,
  formatDate,
  hasPermission,
  updateRole,
} from "@canny_ecosystem/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { DeductionDetailsDialog } from "../../../approvals/deduction-details-dialog";
import AdvanceReimbursementDetailsDialog from "../../../approvals/advances/reimbursement-details-dialog";
import { AdvanceOptionsDropdown } from "./advance-options-dropdown";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import type { EmployeeAdvanceDetailsDatabaseRow } from "@canny_ecosystem/supabase/types";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";

export const columns: ColumnDef<EmployeeAdvanceDetailsDatabaseRow>[] = [
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
    accessorKey: "advance_name",
    header: "Advance Name",
    cell: ({ row }) => {
      return (
        <p className="truncate w-32 font-medium">{`${row.original?.advance_name}`}</p>
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
    accessorKey: "received_amount",
    header: "Received Amount",
    cell: ({ row }) => {
      const received = ((row.original as any)?.advance_deduction || []).reduce(
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
      const deductions = (row.original as any)?.advance_deduction || [];
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DeductionDetailsDialog deductions={deductions} />
        </div>
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
          <AdvanceReimbursementDetailsDialog advance={row.original} />
        </div>
      );
    },
  },
  {
    accessorKey: "is_paid",
    header: "Status",
    cell: ({ row }) => {
      const isPaid = (row.original as any)?.is_paid;
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
  {
    accessorKey: "advance_date",
    header: "Advance Date",
    cell: ({ row }) => {
      return (
        <p className="truncate w-28">
          {(
            formatDate(
              (row.original as any)?.advance_date || row.original?.created_at,
            ) ?? "--"
          ).toString()}
        </p>
      );
    },
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const isPaid = !!row.original?.is_paid;
      if (isPaid) return <div className="h-8 w-8" />; // Return empty placeholder

      const { role } = useUser();
      const amount = Number(row.original?.amount) || 0;

      return (
        <AdvanceOptionsDropdown
          key={row.original.id}
          id={row.original.id}
          reimbursementId={row.original.reimbursement_id}
          amount={amount}
          advanceName={row.original.advance_name as string}
          isPaid={!!row.original.is_paid}
          triggerChild={
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-8 w-8 p-0",
                  !hasPermission(
                    role,
                    `${updateRole}:${attribute.employees}`,
                  ) &&
                    !hasPermission(
                      role,
                      `${deleteRole}:${attribute.employees}`,
                    ) &&
                    "hidden",
                )}
              >
                <span className="sr-only">Open menu</span>
                <Icon name="dots-vertical" />
              </Button>
            </DropdownMenuTrigger>
          }
        />
      );
    },
  },
];
