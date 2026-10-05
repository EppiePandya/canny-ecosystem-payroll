import type { ImportEmployeeBankDetailsDataType } from "@canny_ecosystem/supabase/queries";
import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import { ImportedEmployeeOptionsDropdown } from "./imported-table-options";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";

const ChangedValueCell = ({
  row,
  accessorKey,
  value,
}: {
  row: any;
  accessorKey: string;
  value: any;
}) => {
  const meta = row.getModule?.()?.meta || (row.table?.options?.meta as any);
  const finalData = meta?.finalData;
  const conflictingRecords = meta?.conflictingRecords;

  const rowFinalData = finalData?.[row.index];
  const employeeId = rowFinalData?.employee_id;
  const accountNumber = rowFinalData?.account_number;

  const existingRecord = conflictingRecords?.find(
    (r: any) =>
      (employeeId && r.employee_id === employeeId) ||
      (accountNumber && r.account_number === accountNumber),
  );

  const existingValue = existingRecord?.[accessorKey];
  const isChanged =
    existingValue !== undefined &&
    existingValue !== null &&
    String(existingValue).trim() !== String(value || "").trim();

  if (isChanged) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="truncate text-amber-500 font-medium cursor-help">
              {value || "--"}
            </p>
          </TooltipTrigger>
          <TooltipContent>
            <p>Existing: {existingValue || "Empty"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <p className="truncate">{value || "--"}</p>;
};

export const ImportedDataColumns: ColumnDef<ImportEmployeeBankDetailsDataType>[] =
  [
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
      accessorKey: "account_holder_name",
      header: "Account Holder Name",
      cell: ({ row }) => {
        return (
          <ChangedValueCell
            row={row}
            accessorKey="account_holder_name"
            value={row.original.account_holder_name}
          />
        );
      },
    },
    {
      accessorKey: "account_number",
      header: "Account Number",
      cell: ({ row }) => {
        return (
          <ChangedValueCell
            row={row}
            accessorKey="account_number"
            value={row.original?.account_number}
          />
        );
      },
    },

    {
      accessorKey: "ifsc_code",
      header: "ifsc Code",
      cell: ({ row }) => {
        return (
          <ChangedValueCell
            row={row}
            accessorKey="ifsc_code"
            value={row.original?.ifsc_code}
          />
        );
      },
    },

    {
      accessorKey: "account_type",
      header: "Account Type",
      cell: ({ row }) => {
        return (
          <ChangedValueCell
            row={row}
            accessorKey="account_type"
            value={row.original?.account_type}
          />
        );
      },
    },
    {
      accessorKey: "bank_name",
      header: "Bank Name",
      cell: ({ row }) => {
        return (
          <ChangedValueCell
            row={row}
            accessorKey="bank_name"
            value={row.original?.bank_name}
          />
        );
      },
    },
    {
      accessorKey: "branch_name",
      header: "Branch Name",
      cell: ({ row }) => {
        return (
          <ChangedValueCell
            row={row}
            accessorKey="branch_name"
            value={row.original?.branch_name}
          />
        );
      },
    },
  ];
