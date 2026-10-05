import { Card, CardContent, CardHeader } from "@canny_ecosystem/ui/card";
import { Icon } from "@canny_ecosystem/ui/icon";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Link, useParams } from "@remix-run/react";
import type { EmployeeWorkDetailsDataType } from "@canny_ecosystem/supabase/queries";
import {
  createRole,
  formatDate,
  hasPermission,
  replaceUnderscore,
  updateRole,
} from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";

type DetailItemProps = {
  label: string;
  value: string | null | undefined;
};

export const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => {
  return (
    <div className="flex flex-col items-start">
      <h3 className="text-muted-foreground text-[13px] tracking-wide capitalize">
        {label}
      </h3>
      <p>{value ?? "--"}</p>
    </div>
  );
};

export const EmployeeWorkDetailsCard = ({
  workDetails,
}: {
  workDetails: EmployeeWorkDetailsDataType[];
}) => {
  const { role } = useUser();
  const { employeeId } = useParams();
  const workDetail = workDetails?.[0];

  return (
    <Card className="rounded w-full h-full p-4 flex flex-col gap-6">
      <div className="w-full flex items-center justify-between">
        <h2 className="text-xl font-semibold">Work Details</h2>
        <div className="flex gap-2">
          {workDetail && (
            <Link
              prefetch="intent"
              to={`/employees/${employeeId}/work-portfolio/${workDetail.employee_id}/update-work-details`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "bg-card",
                !hasPermission(
                  role,
                  `${updateRole}:${attribute.employeeWorkDetails}`,
                ) && "hidden",
              )}
            >
              <Icon name="edit" className="mr-2" />
              Edit
            </Link>
          )}
          {!workDetail && (
            <Link
              prefetch="intent"
              to={`/employees/${employeeId}/work-portfolio/add-work-details`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "bg-card",
                !hasPermission(
                  `${role}`,
                  `${createRole}:${attribute.employeeWorkDetails}`,
                ) && "hidden",
              )}
            >
              <Icon name="plus-circled" className="mr-2" />
              Add
            </Link>
          )}
        </div>
      </div>

      {workDetail ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <DetailItem label="Project Name" value={workDetail.projects?.name} />
          <DetailItem label="Site Name" value={workDetail?.sites?.name} />
          <DetailItem
            label="Department"
            value={workDetail?.departments?.name}
          />
          <DetailItem
            label="Assignment Type"
            value={replaceUnderscore(workDetail?.assignment_type)}
          />
          <DetailItem
            label="Position"
            value={replaceUnderscore(workDetail?.position)}
          />
          <DetailItem
            label="Skill Level"
            value={replaceUnderscore(workDetail?.skill_level)}
          />
          <DetailItem
            label="Start Date"
            value={formatDate(workDetail?.start_date)}
          />
          <DetailItem
            label="End Date"
            value={formatDate(workDetail?.end_date)}
          />
        </div>
      ) : (
        <div className="text-center py-8">
          <p>No Work details available.</p>
        </div>
      )}
    </Card>
  );
};
