import { formatDate } from "@canny_ecosystem/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { SalaryAssignmentOptionsDropdown } from "../salary-assignment-options-dropdown";

export type SalaryAssignmentTableRow = {
  id: string;
  effective_date: string;
  monthly_ctc: number;
  basic_percent: number;
  basic_amount?: number | null;
  created_at: string;
  payment_templates?: {
    name: string;
  } | null;
  employee_salary_components?:
    | {
        count: number;
      }[]
    | null;
  use_payment_template: boolean;
};

export const getColumns = (
  activeId: string | null,
  env: any,
): ColumnDef<SalaryAssignmentTableRow>[] => [
  {
    accessorKey: "effective_date",
    header: "Effective Date",
    cell: ({ row }) => formatDate(row.original.effective_date),
  },
  {
    accessorKey: "monthly_ctc",
    header: "Monthly CTC",
    cell: ({ row }) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(row.original.monthly_ctc);
    },
  },
  {
    accessorKey: "basic_percent",
    header: "Basic %",
    cell: ({ row }) => `${row.original.basic_percent}%`,
  },
  {
    accessorKey: "basic_amount",
    header: "Basic Amount",
    cell: ({ row }) => {
      const amount =
        row.original.basic_amount ||
        Math.round(
          (row.original.monthly_ctc * row.original.basic_percent) / 100,
        );
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount);
    },
  },
  {
    id: "template",
    header: "Template",
    cell: ({ row }) =>
      row.original.use_payment_template
        ? row.original.payment_templates?.name || "N/A"
        : "Manual",
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.original.id === activeId;
      const isFuture = new Date(row.original.effective_date) > new Date();

      return (
        <Badge
          variant={isActive ? "default" : isFuture ? "secondary" : "outline"}
        >
          {isActive ? "Active" : isFuture ? "Future" : "Past"}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <SalaryAssignmentOptionsDropdown
          assignmentId={row.original.id}
          data={row.original}
          env={env}
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
