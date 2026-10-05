import { replaceUnderscore } from "@canny_ecosystem/utils";
import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import type { LetterDataType } from "@canny_ecosystem/supabase/queries";
import { Link } from "@remix-run/react";
import { LetterOptionsDropDown } from "../letter-options-dropdown";

export const columns: ColumnDef<LetterDataType>[] = [
  {
    accessorKey: "letter_name",
    header: "Letter Name",
    cell: ({ row }) => {
      return (
        <Link
          to={`/modules/letters/${row.original.id}`}
          prefetch="intent"
          className="group"
        >
          <p className="truncate text-primary/80 group-hover:text-primary w-38 capitalize">{`${replaceUnderscore(row.original?.letter_name)}`}</p>
        </Link>
      );
    },
  },
  {
    accessorKey: "date",
    header: "Created at",
    cell: ({ row }) => {
      return (
        <p className="truncate w-20">
          {new Date(row.original?.created_at).toLocaleDateString("en-IN") ??
            "--"}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "subject",
    header: "Subject",
    cell: ({ row }) => {
      return (
        <p className="truncate w-96 capitalize">
          {replaceUnderscore(row.original?.subject ?? "")}
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
        <LetterOptionsDropDown
          key={row.original.id}
          letterIds={{
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
