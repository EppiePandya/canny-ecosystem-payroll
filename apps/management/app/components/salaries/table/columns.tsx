import { formatDate } from "@canny_ecosystem/utils";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Button } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { DeleteSalaryAssignments } from "../delete-salary-assignments";
import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@remix-run/react";

export const columns = (): ColumnDef<any>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "employee_code",
    header: "Code",
    cell: ({ row }) => (
      <Link
        to={`/employees/${row.original.id}`}
        className="text-primary/80 hover:text-primary transition-colors"
      >
        {row.original.employee_code}
      </Link>
    ),
  },
  {
    id: "full_name",
    header: "Employee Name",
    cell: ({ row }) => (
      <span>
        {`${row.original.first_name} ${row.original.middle_name ?? ""} ${row.original.last_name ?? ""}`}
      </span>
    ),
  },
  {
    id: "monthly_ctc",
    header: "Monthly CTC",
    cell: ({ row }) => {
      const assignment = row.original.employee_salary_assignment?.[0];
      if (!assignment) return null;

      return (
        <span className="tabular-nums">
          ₹{Number(assignment.monthly_ctc).toLocaleString("en-IN")}
        </span>
      );
    },
  },
  {
    id: "basic_percent",
    header: "Basic %",
    cell: ({ row }) => {
      const assignment = row.original.employee_salary_assignment?.[0];
      if (!assignment) return null;
      return <span className="tabular-nums">{assignment.basic_percent}%</span>;
    },
  },
  {
    id: "basic_amount",
    header: "Basic Amount",
    cell: ({ row }) => {
      const assignment = row.original.employee_salary_assignment?.[0];
      if (!assignment) return null;
      const amount =
        assignment.basic_amount ||
        Math.round(
          (Number(assignment.monthly_ctc) * Number(assignment.basic_percent)) /
            100,
        );
      return (
        <span className="tabular-nums">
          ₹{Number(amount).toLocaleString("en-IN")}
        </span>
      );
    },
  },
  {
    id: "is_pro_rata",
    header: "Pro-rata",
    cell: ({ row }) => {
      const assignment = row.original.employee_salary_assignment?.[0];
      if (!assignment) return null;
      return (
        <Badge
          variant="outline"
          className={
            assignment.is_pro_rata
              ? "border-amber-200 text-amber-700 bg-amber-50"
              : "text-muted-foreground"
          }
        >
          {assignment.is_pro_rata ? "Yes" : "No"}
        </Badge>
      );
    },
  },
  {
    id: "template",
    header: "Template / Custom",
    cell: ({ row }) => {
      const assignment = row.original.employee_salary_assignment?.[0];
      if (!assignment) return null;

      return (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0",
            assignment.use_payment_template
              ? "border-blue-200 text-blue-700 bg-blue-50"
              : "border-purple-200 text-purple-700 bg-purple-50",
          )}
        >
          {assignment.use_payment_template
            ? assignment.payment_templates?.name || "Template"
            : "Custom"}
        </Badge>
      );
    },
  },
  {
    id: "sites",
    header: "Sites",
    cell: ({ row }) => {
      const siteName = row.original.work_details?.sites?.name;
      if (!siteName)
        return <span className="text-muted-foreground text-xs">-</span>;

      return <span className="text-xs">{siteName}</span>;
    },
  },
  {
    id: "effective_date",
    header: "Effective From",
    cell: ({ row }) => {
      const assignment = row.original.employee_salary_assignment?.[0];
      if (!assignment) return null;
      return (
        <span className="text-xs">{formatDate(assignment.effective_date)}</span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <Icon name="dots-vertical" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link
              to={`/employees/${row.original.id}/salary`}
              className="cursor-pointer w-full"
            >
              <span>Edit Salary</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              to={`/employees/${row.original.id}`}
              className="cursor-pointer w-full"
            >
              <span>View Profile</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            className="p-0"
          >
            <DeleteSalaryAssignments
              assignmentIds={
                [row.original.employee_salary_assignment?.[0]?.id].filter(
                  Boolean,
                ) as string[]
              }
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
