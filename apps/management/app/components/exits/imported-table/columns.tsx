import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import { ImportedExitOptionsDropdown } from "./imported-table-options";
import type { ImportExitDataType } from "@canny_ecosystem/supabase/queries";

export const ImportedDataColumns: ColumnDef<ImportExitDataType>[] = [
  {
    accessorKey: "sr_no",
    header: "Sr No.",
    cell: ({ row }) => {
      return <p className="truncate ">{row.index + 1}</p>;
    },
  },
  {
    accessorKey: "employee_code",
    header: "Employee Code",
    cell: ({ row }) => {
      return (
        <p className="truncate group-hover:text-primary">
          {row.original.employee_code}
        </p>
      );
    },
  },

  {
    accessorKey: "last_working_day",
    header: "Last working day",
    cell: ({ row }) => {
      return (
        <p className="truncate ">{row.original?.last_working_day ?? "--"}</p>
      );
    },
  },
  {
    accessorKey: "exit_reason",
    header: "Exit Reason",
    cell: ({ row }) => {
      return <p className="truncate ">{row.original?.exit_reason ?? "--"}</p>;
    },
  },

  {
    accessorKey: "note",
    header: "Note",
    cell: ({ row }) => {
      return <p className="truncate ">{row.original?.note ?? "--"}</p>;
    },
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <ImportedExitOptionsDropdown
          key={JSON.stringify(row.original)}
          index={row.index}
          data={row.original}
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
