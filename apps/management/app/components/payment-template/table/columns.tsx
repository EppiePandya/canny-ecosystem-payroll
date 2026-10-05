import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import { PaymentTemplateOptionsDropdown } from "../payment-template-options-dropdown";
import { useState } from "react";
import { ViewPaymentTemplateComponentsDialog } from "../view-payment-template-components-dialog";
import { LinkedEmployeesDialog } from "../linked-employees-dialog";
import { cn } from "@canny_ecosystem/ui/utils/cn";

function TemplateNameCell({ row }: { row: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const latestVersion = row.original?.payment_template_versions?.[0];
  const components = latestVersion?.payment_template_components ?? [];
  const hasComponents = components.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (hasComponents) setIsOpen(true);
        }}
        className="group text-left"
      >
        <p className="truncate text-primary/80 group-hover:text-primary capitalize w-48 hover:underline underline-offset-4">
          {row.original?.name}
        </p>
      </button>

      <ViewPaymentTemplateComponentsDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        template={row.original}
      />
    </>
  );
}

function LinkedEmployeesCell({ row, env }: { row: any; env: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const count = row.original?.linked_employees_count ?? 0;

  return (
    <>
      <button
        type="button"
        disabled={count === 0}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(true);
        }}
        className={cn(
          "font-medium tabular-nums",
          count > 0
            ? "text-primary hover:underline hover:text-primary/80 cursor-pointer"
            : "text-muted-foreground cursor-default",
        )}
      >
        {count}
      </button>

      <LinkedEmployeesDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        templateId={row.original.id}
        templateName={row.original.name}
        env={env}
      />
    </>
  );
}

export const getColumns = (env: any): ColumnDef<any>[] => [
  {
    accessorKey: "name",
    header: "Template Name",
    cell: ({ row }) => <TemplateNameCell row={row} />,
  },
  {
    id: "monthly_ctc",
    header: "Monthly Ctc",
    cell: ({ row }) => {
      return (
        <p>
          {row.original?.payment_template_versions?.[0]?.monthly_ctc ?? "--"}
        </p>
      );
    },
  },
  {
    id: "basic_percent",
    header: "Basic %",
    cell: ({ row }) => {
      return (
        <p>
          {row.original?.payment_template_versions?.[0]?.basic_percent
            ? `${row.original.payment_template_versions[0].basic_percent}%`
            : "--"}
        </p>
      );
    },
  },
  {
    id: "effective_date",
    header: "Effective Date",
    cell: ({ row }) => {
      return (
        <p>
          {row.original?.payment_template_versions?.[0]?.effective_date ?? "--"}
        </p>
      );
    },
  },

  {
    id: "components_count",
    header: "Components Count",
    cell: ({ row }) => {
      const latestVersion = row.original?.payment_template_versions?.[0];
      const components = latestVersion?.payment_template_components ?? [];
      return <p>{components.length}</p>;
    },
  },
  {
    id: "linked_employees_count",
    header: "Linked Employees",
    cell: ({ row }) => <LinkedEmployeesCell row={row} env={env} />,
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <PaymentTemplateOptionsDropdown
          key={row.original.id}
          template={row.original}
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
