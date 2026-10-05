import { replaceUnderscore } from "@canny_ecosystem/utils";
import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import type { PaymentFieldDataType } from "@canny_ecosystem/supabase/queries";
import { PaymentFieldOptionsDropdown } from "../payment-field-options-dropdown";
import { Link } from "@remix-run/react";

export const columns: ColumnDef<PaymentFieldDataType>[] = [
  {
    accessorKey: "name",
    header: "Field Name",
    cell: ({ row }) => {
      return (
        <Link
          to={`${row.original.id}/update-payment-field`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80 group-hover:text-primary capitalize w-48">{`${row.original?.name}`}</p>
        </Link>
      );
    },
  },
  {
    accessorKey: "display_name",
    header: "Display Name",
    cell: ({ row }) => {
      return (
        <p className="truncate w-48 capitalize">
          {row.original?.display_name ?? "--"}
        </p>
      );
    },
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      return row.original?.amount ?? "--";
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      return (
        <p className="truncate w-20 capitalize">
          {replaceUnderscore(row.original?.type ?? "")}
        </p>
      );
    },
  },
  {
    accessorKey: "calculation_type",
    header: "Calculation Type",
    cell: ({ row }) => {
      return (
        <p className="truncate w-32 capitalize">
          {replaceUnderscore(row.original?.calculation_type)}
        </p>
      );
    },
  },
  {
    accessorKey: "fixed_type",
    header: "Fixed Type",
    cell: ({ row }) => {
      return <p className="capitalize">{row.original?.fixed_type ?? "--"}</p>;
    },
  },
  {
    accessorKey: "display_order",
    header: "Order",
    cell: ({ row }) => {
      return <p>{row.original?.display_order ?? "--"}</p>;
    },
  },
  {
    accessorKey: "consider_for_epf",
    header: "Consider for EPF",
    cell: ({ row }) => {
      return (
        <p className="capitalize">
          {row.original?.consider_for_epf ? "Yes" : "No"}
        </p>
      );
    },
  },
  {
    accessorKey: "consider_for_esic",
    header: "Consider for ESIC",
    cell: ({ row }) => {
      return (
        <p className="capitalize">
          {row.original?.consider_for_esic ? "Yes" : "No"}
        </p>
      );
    },
  },
  {
    accessorKey: "is_pro_rata",
    header: "Is pro rata",
    cell: ({ row }) => {
      return (
        <p className="capitalize">{row.original?.is_pro_rata ? "Yes" : "No"}</p>
      );
    },
  },
  {
    accessorKey: "is_overtime",
    header: "Is overtime",
    cell: ({ row }) => {
      return (
        <p className="capitalize">{row.original?.is_overtime ? "Yes" : "No"}</p>
      );
    },
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <PaymentFieldOptionsDropdown
          key={row.original.id}
          paymentField={{
            id: row.original.id,
          }}
          triggerChild={
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
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
