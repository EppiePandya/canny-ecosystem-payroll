import type { ImportEmployeeDetailsDataType } from "@canny_ecosystem/supabase/queries";
import { Button } from "@canny_ecosystem/ui/button";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import type { ColumnDef } from "@tanstack/react-table";
import { ImportedEmployeeOptionsDropdown } from "./imported-table-options";
import { cn } from "@canny_ecosystem/ui/utils/cn";

const renderChangedValue = (newValue: any, existingValue: any) => {
  const cleanNew = String(
    newValue === undefined || newValue === null ? "" : newValue,
  ).trim();
  const cleanExisting = String(
    existingValue === undefined || existingValue === null ? "" : existingValue,
  ).trim();

  const isChanged =
    !!cleanExisting && cleanNew.toLowerCase() !== cleanExisting.toLowerCase();

  return (
    <p
      className={cn(
        "truncate text-sm",
        isChanged && "text-blue-600 font-bold dark:text-blue-400",
      )}
    >
      {cleanNew || "--"}
    </p>
  );
};

export const ImportedDataColumns: ColumnDef<ImportEmployeeDetailsDataType>[] = [
  {
    accessorKey: "sr_no",
    header: "Sr No.",
    cell: ({ row }) => {
      return <p className="w-10 text-center text-sm">{row.index + 1}</p>;
    },
  },
  {
    accessorKey: "employee_code",
    header: "Employee Code",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.employee_code,
        (row.original as any).existing_employee_code,
      );
    },
  },
  {
    accessorKey: "first_name",
    header: "First Name",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.first_name,
        (row.original as any).existing_first_name,
      );
    },
  },
  {
    accessorKey: "middle_name",
    header: "Middle Name",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.middle_name,
        (row.original as any).existing_middle_name,
      );
    },
  },
  {
    accessorKey: "last_name",
    header: "Last Name",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.last_name,
        (row.original as any).existing_last_name,
      );
    },
  },
  {
    accessorKey: "gender",
    header: "Gender",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.gender,
        (row.original as any).existing_gender,
      );
    },
  },
  {
    accessorKey: "education",
    header: "Education",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.education,
        (row.original as any).existing_education,
      );
    },
  },
  {
    accessorKey: "marital_status",
    header: "Marital Status",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.marital_status,
        (row.original as any).existing_marital_status,
      );
    },
  },
  {
    accessorKey: "is_active",
    header: "Is Active",
    cell: ({ row }) => {
      const val =
        row.original.is_active === undefined
          ? ""
          : String(row.original.is_active);
      const existingVal =
        (row.original as any).existing_is_active === undefined
          ? ""
          : String((row.original as any).existing_is_active);
      return renderChangedValue(val, existingVal);
    },
  },
  {
    accessorKey: "date_of_birth",
    header: "DOB",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.date_of_birth,
        (row.original as any).existing_date_of_birth,
      );
    },
  },
  {
    accessorKey: "personal_email",
    header: "Email",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.personal_email,
        (row.original as any).existing_personal_email,
      );
    },
  },
  {
    accessorKey: "primary_mobile_number",
    header: "Primary Mobile Number",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.primary_mobile_number,
        (row.original as any).existing_primary_mobile_number,
      );
    },
  },
  {
    accessorKey: "secondary_mobile_number",
    header: "Secondary Mobile Number",
    cell: ({ row }) => {
      return renderChangedValue(
        row.original.secondary_mobile_number,
        (row.original as any).existing_secondary_mobile_number,
      );
    },
  },
  {
    accessorKey: "department",
    header: "Department",
    cell: ({ row }) => {
      const departmentName = (row.original as any)?.department;
      const departmentId = (row.original as any)?.department_id;
      const isMatched = !!departmentId;

      return (
        <p
          className={cn(
            "truncate text-sm",
            !isMatched && departmentName && "text-red-500 line-through",
          )}
        >
          {departmentName || "--"}
        </p>
      );
    },
  },
  {
    accessorKey: "assignment_type",
    header: "Assignment Type",
    cell: ({ row }) => {
      return (
        <p className="truncate text-sm">
          {row.original?.assignment_type ?? "--"}
        </p>
      );
    },
  },
  {
    accessorKey: "start_date",
    header: "Start Date",
    cell: ({ row }) => {
      return (
        <p className="truncate text-sm">{row.original?.start_date ?? "--"}</p>
      );
    },
  },
  {
    accessorKey: "end_date",
    header: "End Date",
    cell: ({ row }) => {
      return (
        <p className="truncate text-sm">{row.original?.end_date ?? "--"}</p>
      );
    },
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ row }) => {
      return (
        <p className="truncate text-sm">{row.original?.position ?? "--"}</p>
      );
    },
  },
  {
    accessorKey: "skill_level",
    header: "Skill Level",
    cell: ({ row }) => (
      <p className="truncate text-sm">{row.original?.skill_level ?? "--"}</p>
    ),
  },
  {
    accessorKey: "site",
    header: "Site",
    cell: ({ row }) => {
      const siteName = (row.original as any)?.site;
      const siteId = (row.original as any)?.site_id;
      const isMatched = !!siteId;

      return (
        <p
          className={cn(
            "truncate text-sm",
            !isMatched && siteName && "text-red-500 line-through",
          )}
        >
          {siteName || "--"}
        </p>
      );
    },
  },
  {
    accessorKey: "project",
    header: "Project",
    cell: ({ row }) => {
      const projectName = (row.original as any)?.project;
      const projectId = (row.original as any)?.project_id;
      const isMatched = !!projectId;

      return (
        <p
          className={cn(
            "truncate text-sm",
            !isMatched && projectName && "text-red-500 line-through",
          )}
        >
          {projectName || "--"}
        </p>
      );
    },
  },

  // Statutory
  {
    accessorKey: "aadhaar_number",
    header: "Aadhaar",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.aadhaar_number,
        (row.original as any)?.existing_aadhaar_number,
      ),
  },
  {
    accessorKey: "pan_number",
    header: "PAN",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.pan_number,
        (row.original as any)?.existing_pan_number,
      ),
  },
  {
    accessorKey: "uan_number",
    header: "UAN",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.uan_number,
        (row.original as any)?.existing_uan_number,
      ),
  },
  {
    accessorKey: "pf_number",
    header: "PF Number",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.pf_number,
        (row.original as any)?.existing_pf_number,
      ),
  },
  {
    accessorKey: "esic_number",
    header: "ESIC Number",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.esic_number,
        (row.original as any)?.existing_esic_number,
      ),
  },
  {
    accessorKey: "esic_site_name",
    header: "ESIC Site Name",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.esic_site_name,
        (row.original as any)?.existing_esic_site_name,
      ),
  },
  {
    accessorKey: "driving_license_number",
    header: "DL Number",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.driving_license_number,
        (row.original as any)?.existing_driving_license_number,
      ),
  },
  {
    accessorKey: "driving_license_expiry",
    header: "DL Expiry",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.driving_license_expiry,
        (row.original as any)?.existing_driving_license_expiry,
      ),
  },
  {
    accessorKey: "passport_number",
    header: "Passport Number",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.passport_number,
        (row.original as any)?.existing_passport_number,
      ),
  },
  {
    accessorKey: "passport_expiry",
    header: "Passport Expiry",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.passport_expiry,
        (row.original as any)?.existing_passport_expiry,
      ),
  },
  // Bank
  {
    accessorKey: "account_number",
    header: "Bank Account No",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.account_number,
        (row.original as any)?.existing_account_number,
      ),
  },
  {
    accessorKey: "bank_name",
    header: "Bank Name",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.bank_name,
        (row.original as any)?.existing_bank_name,
      ),
  },
  {
    accessorKey: "ifsc_code",
    header: "IFSC",
    cell: ({ row }) =>
      renderChangedValue(
        (row.original as any)?.ifsc_code,
        (row.original as any)?.existing_ifsc_code,
      ),
  },

  {
    accessorKey: "address_line_1",
    header: "Address",
    cell: ({ row }) => (
      <div className="max-w-[400px]">
        <p
          className="truncate text-sm"
          title={(row.original as any)?.address_line_1}
        >
          {(row.original as any)?.address_line_1 ?? "--"}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "city",
    header: "City",
    cell: ({ row }) => (
      <p className="truncate text-sm">{(row.original as any)?.city ?? "--"}</p>
    ),
  },
  {
    accessorKey: "permanent_address_line_1",
    header: "Permanent Address",
    cell: ({ row }) => (
      <div className="max-w-[400px]">
        <p
          className="truncate text-sm"
          title={(row.original as any)?.permanent_address_line_1}
        >
          {(row.original as any)?.permanent_address_line_1 ?? "--"}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "permanent_city",
    header: "Permanent City",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.permanent_city ?? "--"}
      </p>
    ),
  },
  {
    accessorKey: "guardian_first_name",
    header: "Guardian Name",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.guardian_first_name ?? "--"}
      </p>
    ),
  },
  {
    accessorKey: "relationship",
    header: "Relationship",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.relationship ?? "--"}
      </p>
    ),
  },
  // Loans
  {
    accessorKey: "loan_name",
    header: "Loan Name",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.loan_name ?? "--"}
      </p>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.amount ?? "--"}
      </p>
    ),
  },

  {
    accessorKey: "monthly_installment",
    header: "Monthly Installment",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.monthly_installment ?? "--"}
      </p>
    ),
  },
  {
    accessorKey: "loan_date",
    header: "Loan Date",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.loan_date ?? "--"}
      </p>
    ),
  },
  {
    accessorKey: "number_of_months",
    header: "Months",
    cell: ({ row }) => (
      <p className="truncate text-sm">
        {(row.original as any)?.number_of_months ?? "--"}
      </p>
    ),
  },
];
