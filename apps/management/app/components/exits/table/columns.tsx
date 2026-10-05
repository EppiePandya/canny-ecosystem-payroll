import type { ExitDataType } from "@canny_ecosystem/supabase/queries";
import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { formatDate } from "@canny_ecosystem/utils";
import type { EmployeeExitRow } from "@canny_ecosystem/supabase/types";
import { Link } from "@remix-run/react";
import DeathExitDetailsDialog from "../death-exit-details-dialog";

export const ExitPaymentColumns: ColumnDef<EmployeeExitRow & ExitDataType>[] = [
  {
    enableSorting: false,
    enableHiding: false,
    id: "select",
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
  },
  {
    enableSorting: false,
    accessorKey: "employee_code",
    header: "Employee Code",
    cell: ({ row }) => {
      return (
        <Link
          to={`/employees/${row.original.employee_id}`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80 group-hover:text-primary cursor-pointer">
            {row.original?.employees?.employee_code ?? "--"}
          </p>
        </Link>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "employee_name",
    header: "Employee Name",
    cell: ({ row }) => {
      return (
        <Link
          to={`/employees/${row.original.employee_id}`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80 group-hover:text-primary cursor-pointer">
            {`${row.original?.employees?.first_name} ${
              row.original?.employees?.middle_name ?? ""
            }
          ${row.original?.employees?.last_name ?? ""}`}
          </p>
        </Link>
      );
    },
  },
  {
    accessorKey: "last_working_day",
    header: "Last Working Day ",
    cell: ({ row }) => {
      return (
        <p className="truncate capitalize">{`${
          formatDate(row.original?.last_working_day) ?? "--"
        }`}</p>
      );
    },
  },
  {
    accessorKey: "esic_exit_date",
    header: "ESIC Exit Date",
    cell: ({ row }) => {
      return (
        <p className="truncate capitalize">{`${
          formatDate(row.original?.esic_exit_date) ?? "--"
        }`}</p>
      );
    },
  },

  {
    accessorKey: "exit_reason",
    header: "Exit Reason",
    cell: ({ row }) => {
      return (
        <p className="truncate capitalize">
          {row.original?.exit_reason ?? "--"}
        </p>
      );
    },
  },

  {
    enableSorting: false,
    accessorKey: "death_case",
    header: "Death Case",
    cell: ({ row }) => {
      const deathExit = row.original.death_exit;

      if (!deathExit) {
        return (
          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-green-500/15">
            No
          </span>
        );
      }

      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DeathExitDetailsDialog exit={row.original}></DeathExitDetailsDialog>
        </div>
      );
    },
  },

  {
    accessorKey: "note",
    header: "Note",
    cell: ({ row }) => {
      return (
        <p className="capitalize truncate">{row.original?.note ?? "--"}</p>
      );
    },
  },
];
