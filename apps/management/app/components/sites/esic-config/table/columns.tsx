import { formatDate } from "@canny_ecosystem/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { CompanyEsicDetailsDatabaseRow } from "@canny_ecosystem/supabase/types";
import { EsicConfigOptionsDropdown } from "./esic-config-options-dropdown";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export const columns: ColumnDef<CompanyEsicDetailsDatabaseRow>[] = [
  {
    accessorKey: "esic_site_name",
    header: "ESIC Site Name",
    cell: ({ row }) => {
      return (
        <p className="truncate min-w-32">{`${row.original?.esic_site_name ?? ""}`}</p>
      );
    },
  },
  {
    accessorKey: "esic_id_number",
    header: "ESIC ID Number",
    cell: ({ row }) => {
      return (
        <p className="truncate min-w-32">{`${row.original?.esic_id_number ?? ""}`}</p>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }) => {
      return (
        <p className="truncate min-w-32">
          {(formatDate(row.original?.created_at) ?? "--").toString()}
        </p>
      );
    },
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <EsicConfigOptionsDropdown
          key={row.original.id}
          id={row.original.id}
          triggerChild={
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("h-8 w-8 p-0")}>
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
