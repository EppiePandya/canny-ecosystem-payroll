import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";
import { Link } from "@remix-run/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import type { EmployeeProvidentFundDatabaseRow } from "@canny_ecosystem/supabase/types";
import { DeleteEmployeeProvidentFund } from "./delete-employee-provident-fund";
import {
  deleteRole,
  hasPermission,
  replaceUnderscore,
  updateRole,
} from "@canny_ecosystem/utils";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import {
  attribute,
  EMPLOYEE_EPF_PERCENTAGE,
  EMPLOYER_EPF_PERCENTAGE,
} from "@canny_ecosystem/utils/constant";

type DetailItemProps = {
  label: string;
  value: React.ReactNode;
};

const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => {
  return (
    <div className="grid grid-cols-[310px_1fr] gap-3 text-xs w-full items-start">
      <h3 className="text-muted-foreground capitalize leading-snug">{label}</h3>
      <div className="font-medium flex items-start">{value ?? "--"}</div>
    </div>
  );
};

export function EPFCard({
  data,
}: {
  data: Omit<EmployeeProvidentFundDatabaseRow, "created_at">;
}) {
  const { role } = useUser();

  const employeeContributionRate =
    (data?.employee_contribution ?? EMPLOYEE_EPF_PERCENTAGE) * 100;

  const employerContributionRate =
    (data?.employer_contribution ?? EMPLOYER_EPF_PERCENTAGE) * 100;

  const epsRate = 8.33;
  const epfRate = Number((employerContributionRate - epsRate).toFixed(2));

  return (
    <Card className="w-full dark:border-[1.5px]">
      <CardHeader className="flex flex-row items-center justify-between px-4 py-2">
        <CardTitle className="text-sm font-medium">
          Employees' Provident Fund
        </CardTitle>

        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Link
                  prefetch="intent"
                  to={`${data.id}/update-epf`}
                  className={cn(
                    "p-1.5 rounded-md bg-secondary",
                    !hasPermission(
                      `${role}`,
                      `${updateRole}:${attribute.statutoryFieldsEpf}`,
                    ) && "hidden",
                  )}
                >
                  <Icon name="edit" size="xs" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "p-1.5 rounded-md bg-secondary",
                !hasPermission(
                  `${role}`,
                  `${deleteRole}:${attribute.statutoryFieldsEpf}`,
                ) && "hidden",
              )}
            >
              <Icon name="dots-vertical" size="xs" />
            </DropdownMenuTrigger>

            <DropdownMenuContent sideOffset={8} align="end">
              <DropdownMenuGroup>
                <DeleteEmployeeProvidentFund
                  employeeProvidentFundId={data.id}
                />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5 px-4 pb-3 text-xs">
        <DetailItem label="EPF Number" value={data.epf_number} />

        <DetailItem
          label="Cycle"
          value={replaceUnderscore(data.deduction_cycle)}
        />

        <DetailItem
          label="Employee Contribution"
          value={`${employeeContributionRate}%`}
        />

        <DetailItem
          label="Employer Contribution"
          value={
            <div className="flex flex-col items-start leading-tight">
              <span>{employerContributionRate}%</span>
              <span className="text-[10px] text-muted-foreground">
                EPF: {epfRate}% | EPS: {epsRate}%
              </span>
            </div>
          }
        />

        <DetailItem
          label="Restrict employee's contribution to ₹15,000 of PF Wage"
          value={
            <Icon
              name={data.restrict_employee_contribution ? "check" : "cross"}
              size="sm"
              className={cn(
                "dark:mt-[1px]",
                data.restrict_employee_contribution
                  ? "text-green"
                  : "text-destructive",
              )}
            />
          }
        />

        <DetailItem
          label="Restrict employer's contribution to ₹15,000 of PF Wage"
          value={
            <Icon
              name={data.restrict_employer_contribution ? "check" : "cross"}
              size="sm"
              className={cn(
                "dark:mt-[1px]",
                data.restrict_employer_contribution
                  ? "text-green"
                  : "text-destructive",
              )}
            />
          }
        />
      </CardContent>
    </Card>
  );
}
