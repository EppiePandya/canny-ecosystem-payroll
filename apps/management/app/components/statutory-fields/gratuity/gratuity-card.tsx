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
import type { GratuityDatabaseRow } from "@canny_ecosystem/supabase/types";
import { DeleteGratuity } from "./delete-gratuity";
import { deleteRole, hasPermission, updateRole } from "@canny_ecosystem/utils";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";

type DetailItemProps = {
  label: string;
  value: string | number | null | undefined;
};

const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => {
  return (
    <div className="flex flex-row items-start gap-4 text-base w-full">
      <h3 className="text-muted-foreground tracking-wide capitalize w-48 shrink-0">
        {label}
      </h3>
      <p className="flex-1 min-w-0 font-medium break-words">{value ?? "--"}</p>
    </div>
  );
};

export function GratuityCard({
  data,
}: {
  data: Omit<GratuityDatabaseRow, "created_at">;
}) {
  const { role } = useUser();

  return (
    <Card
      key={data.id}
      className="w-full select-text cursor-auto dark:border-[1.5px] h-full flex flex-col justify-start"
    >
      <CardHeader className="flex flex-row space-y-0 items-center justify-between p-4">
        <CardTitle className="text-lg tracking-wide capitalize">
          {data.name}
        </CardTitle>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Link
                  prefetch="intent"
                  to={`${data.id}/update-gratuity`}
                  className={cn(
                    "p-2 rounded-md bg-secondary grid place-items-center",
                    !hasPermission(
                      `${role}`,
                      `${updateRole}:${attribute.statutoryFieldsGraduity}`,
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
                "p-2 py-2 rounded-md bg-secondary grid place-items-center",
                !hasPermission(
                  `${role}`,
                  `${deleteRole}:${attribute.statutoryFieldsGraduity}`,
                ) && "hidden",
              )}
            >
              <Icon name="dots-vertical" size="xs" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={10} align="end">
              <DropdownMenuGroup>
                <DeleteGratuity gratuityId={data.id} />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 py-2 pb-4 px-4 overflow-hidden">
        <DetailItem label="Eligibility Years" value={data.eligibility_years} />
        <DetailItem
          label="Present days/year"
          value={data.present_day_per_year}
        />
        <DetailItem
          label="Payment days/year"
          value={data.payment_days_per_year}
        />
        <DetailItem label="Max Amount Limit" value={data.max_amount_limit} />
      </CardContent>
    </Card>
  );
}
