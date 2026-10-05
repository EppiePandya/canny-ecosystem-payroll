import {
  deleteRole,
  formatDate,
  hasPermission,
  replaceUnderscore,
  updateRole,
} from "@canny_ecosystem/utils";
import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";

import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@remix-run/react";
import { EmployeeOptionsDropdown } from "../employee-option-dropdown";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { IncompleteProfileTooltip } from "../incomplete-profile-tooltip";

export const columns = ({
  env,
  companyId,
}: {
  env: SupabaseEnv;
  companyId: string;
}): ColumnDef<any>[] => [
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
    accessorKey: "employee_code",
    header: "Employee Code",
    cell: ({ row }) => {
      return (
        <Link to={`${row.original.id}`} prefetch="intent" className="group">
          <p className="truncate text-primary/80 group-hover:text-primary w-28">
            {row.original?.employee_code}
          </p>
        </Link>
      );
    },
  },
  {
    accessorKey: "first_name",
    header: "Full Name",
    cell: ({ row }) => {
      const statutory = row.original?.employee_statutory_details;
      const bank = row.original?.employee_bank_details;
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;

      const isFirstNameMissing = !row.original?.first_name;
      const isLastNameMissing = !row.original?.last_name;
      const isMobileNumberMissing = !row.original?.primary_mobile_number;
      const isUanMissing = !statutory?.uan_number;
      const isBankMissing = !bank?.account_number;
      const isEsicApplicable = statutory?.is_esic_applicable === true;
      const isEsicMissing = isEsicApplicable && !statutory?.esic_number;
      const isWorkMissing = !work || !work.position || !work.start_date;
      const isAadharMissing = !statutory?.aadhaar_number;
      const isPanMissing = !statutory?.pan_number;
      const isPfMissing = !statutory?.pf_number;
      const isAddressMissing = !row.original?.employee_addresses?.some(
        (a: any) => a.is_primary,
      );
      const isGuardianMissing = !row.original?.employee_guardians?.length;

      const missingFields = [];
      if (isFirstNameMissing) missingFields.push("first name");
      if (isLastNameMissing) missingFields.push("last name");
      if (isMobileNumberMissing) missingFields.push("mobile number");
      if (isWorkMissing) missingFields.push("work details");
      if (isAadharMissing) missingFields.push("aadhar number");
      if (isPanMissing) missingFields.push("pan number");
      if (isBankMissing) missingFields.push("bank details");
      if (isAddressMissing) missingFields.push("primary address");
      if (isGuardianMissing) missingFields.push("guardians details");
      if (isPfMissing) missingFields.push("pf number");
      if (isUanMissing) missingFields.push("uan number");
      if (isEsicMissing) missingFields.push("esic number");

      return (
        <div className="flex items-center gap-1 group w-full overflow-hidden">
          <Link
            to={`${row.original.id}`}
            prefetch="intent"
            className="flex-1 min-w-0"
          >
            <p className="truncate text-primary/80 group-hover:text-primary z-40">{`${
              row.original?.first_name
            } ${row.original?.middle_name ?? ""} ${
              row.original?.last_name ?? ""
            }`}</p>
          </Link>
          <IncompleteProfileTooltip missingFields={missingFields} />
        </div>
      );
    },
  },
  {
    accessorKey: "primary_mobile_number",
    header: "Mobile Number",
    cell: ({ row }) => {
      return row.original?.primary_mobile_number;
    },
  },
  {
    accessorKey: "date_of_birth",
    header: "Date of Birth",
    cell: ({ row }) => {
      return formatDate(row.original?.date_of_birth);
    },
  },
  {
    accessorKey: "education",
    header: "Education",
    cell: ({ row }) => {
      return (
        <p className="truncate w-20 capitalize">
          {replaceUnderscore(row.original?.education ?? "")}
        </p>
      );
    },
  },
  {
    accessorKey: "gender",
    header: "Gender",
    cell: ({ row }) => {
      return <p className="capitalize">{row.original?.gender}</p>;
    },
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      return (
        <p className="capitalize">
          {row.original?.is_active ? "Active" : "Inactive"}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "project_name",
    header: "Project",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return <p className="truncate capitalize">{work?.projects?.name}</p>;
    },
  },
  {
    enableSorting: false,
    accessorKey: "site_name",
    header: "Site",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return <p className="truncate capitalize">{work?.sites?.name}</p>;
    },
  },
  {
    enableSorting: false,
    accessorKey: "assignment_type",
    header: "Assignment Type",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return (
        <p className="capitalize">
          {replaceUnderscore(work?.assignment_type ?? "")}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "position",
    header: "Position",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return (
        <p className=" truncate capitalize">
          {replaceUnderscore(work?.position ?? "")}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "skill_level",
    header: "Skill Level",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return (
        <p className="w-max capitalize truncate">
          {replaceUnderscore(work?.skill_level ?? "")}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "start_date",
    header: "Date of joining",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return (
        <p className="w-max capitalize truncate">
          {work?.start_date && (formatDate(work?.start_date) as any)}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "end_date",
    header: "Date of leaving",
    cell: ({ row }) => {
      const work = Array.isArray(row.original?.work_details)
        ? row.original?.work_details[0]
        : row.original?.work_details;
      return (
        <p className="w-max capitalize truncate">
          {work?.end_date && (formatDate(work?.end_date) as any)}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "account_number",
    header: "Account Number",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate">
          {row.original?.employee_bank_details?.account_number}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "bank_name",
    header: "Bank Name",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate ">
          {row.original?.employee_bank_details?.bank_name}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "aadhaar_number",
    header: "Aadhaar Number",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate ">
          {row.original?.employee_statutory_details?.aadhaar_number}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "pan_number",
    header: "Pan Number",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate">
          {row.original?.employee_statutory_details?.pan_number}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "uan_number",
    header: "UAN Number",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate">
          {row.original?.employee_statutory_details?.uan_number}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "pf_number",
    header: "PF Number",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate">
          {row.original?.employee_statutory_details?.pf_number}
        </p>
      );
    },
  },
  {
    enableSorting: false,
    accessorKey: "esic_number",
    header: "ESIC Number",
    cell: ({ row }) => {
      return (
        <p className="w-max capitalize truncate">
          {row.original?.employee_statutory_details?.esic_number}
        </p>
      );
    },
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const { role } = useUser();
      return (
        <EmployeeOptionsDropdown
          key={row.original.id}
          employee={{
            id: row.original.id,
            is_active: row.original.is_active ?? false,
            companyId,
          }}
          env={env}
          triggerChild={
            <DropdownMenuTrigger
              asChild
              className={cn(
                !hasPermission(role, `${updateRole}:${attribute.employees}`) &&
                  !hasPermission(
                    role,
                    `${deleteRole}:${attribute.employees}`,
                  ) &&
                  "hidden",
              )}
            >
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
