import React from "react";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Link, useSearchParams } from "@remix-run/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { DeleteManpowerVersion } from "./delete-manpower-version";
import { DeleteRelationship } from "./delete-relationship";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import {
  formatDate,
  hasPermission,
  replaceUnderscore,
  updateRole,
  createRole,
  deleteRole,
} from "@canny_ecosystem/utils";
import type { RelationshipWithCompany } from "@canny_ecosystem/supabase/queries";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useUser } from "@/utils/user";

const DetailItem = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col items-start">
      <h3 className="text-muted-foreground text-[13px] tracking-wide capitalize">
        {label}
      </h3>
      <p className="text-sm font-medium">{value ?? "--"}</p>
    </div>
  );
};

export function RelationshipCard({
  relationship,
}: {
  relationship: Omit<RelationshipWithCompany, "created_at">;
}) {
  const { role } = useUser();
  const [searchParams] = useSearchParams();
  const expandedId = searchParams.get("expanded");
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isManpowerExpanded, setIsManpowerExpanded] = React.useState(
    String(expandedId) === String(relationship.id),
  );

  React.useEffect(() => {
    if (expandedId && String(expandedId) === String(relationship.id)) {
      setIsManpowerExpanded(true);
      setTimeout(() => {
        cardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [expandedId, relationship.id]);

  return (
    <Card
      ref={cardRef}
      key={relationship.id}
      className={cn(
        "rounded w-full h-full p-4 flex flex-col gap-6 shadow-none",
      )}
    >
      <div className="w-full flex items-center justify-between">
        <h2 className="text-xl font-semibold">Relationship Details</h2>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Link
                  prefetch="intent"
                  to={`/settings/relationships/${relationship.id}/update-relationship`}
                  className={cn(
                    "p-2 rounded-md bg-secondary grid place-items-center",
                    !hasPermission(
                      role,
                      `${updateRole}:${attribute.settingRelationships}`,
                    ) && "hidden",
                  )}
                >
                  <Icon name="edit" size="sm" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "p-2 rounded-md bg-secondary grid place-items-center",
                !hasPermission(
                  role,
                  `${deleteRole}:${attribute.settingRelationships}`,
                ) && "hidden",
              )}
            >
              <Icon name="dots-vertical" size="sm" />
            </DropdownMenuTrigger>

            <DropdownMenuContent sideOffset={8} align="end">
              <DropdownMenuGroup>
                <DeleteRelationship
                  role={role}
                  relationshipId={relationship.id}
                />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <DetailItem
          label="Relationship Type"
          value={replaceUnderscore(relationship.relationship_type ?? "--")}
        />
        <DetailItem
          label="Status"
          value={relationship.is_active ? "Active" : "Inactive"}
        />
      </div>

      <Card
        className={cn(
          "rounded w-full h-full p-4 flex flex-col gap-6 shadow-none border",
          relationship.relationship_type !== "Manpower" && "hidden",
        )}
      >
        <div
          className="w-full flex items-center justify-between cursor-pointer group select-none"
          onClick={() => setIsManpowerExpanded(!isManpowerExpanded)}
        >
          <div className="flex items-center gap-2">
            <Icon
              name="chevron-right"
              className={cn(
                "transition-transform duration-200 text-muted-foreground group-hover:text-foreground",
                isManpowerExpanded && "rotate-90",
              )}
            />
            <h4 className="text-lg font-semibold text-primary">
              Manpower Versions
            </h4>
          </div>

          <div
            className="flex items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              to={
                hasPermission(
                  role,
                  `${createRole}:${attribute.settingRelationships}`,
                )
                  ? `/settings/relationships/${relationship.id}/create-manpower-version`
                  : "#"
              }
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "bg-card",
                !hasPermission(
                  role,
                  `${createRole}:${attribute.settingRelationships}`,
                ) && "hidden",
              )}
            >
              <Icon name="plus-circled" className="mr-2" />
              Add
            </Link>
          </div>
        </div>

        <div
          className={cn(
            "w-full overflow-x-auto no-scrollbar pb-2 animate-in fade-in slide-in-from-top-2 duration-300",
            (!isManpowerExpanded ||
              !relationship.relationship_manpower_version?.length) &&
              "hidden",
          )}
        >
          <div className="flex items-stretch gap-4 min-w-max">
            {[...(relationship.relationship_manpower_version || [])]
              .sort(
                (a, b) =>
                  new Date(a.start_date).getTime() -
                  new Date(b.start_date).getTime(),
              )
              .reverse()
              .map((version: any, idx: number) => {
                const versionNumber =
                  relationship.relationship_manpower_version!.length - idx;

                return (
                  <Card
                    key={version.id}
                    className="w-[420px] max-sm:w-11/12 shadow-none select-text cursor-auto dark:border-[1.5px] h-full flex flex-col justify-start"
                  >
                    <CardHeader className="flex flex-row space-y-0 items-center justify-between p-4 bg-muted/20 border-b">
                      <CardTitle className="text-lg tracking-wide">
                        Version {versionNumber}
                      </CardTitle>

                      <div className="flex items-center gap-3">
                        <TooltipProvider>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <Link
                                prefetch="intent"
                                to={
                                  hasPermission(
                                    role,
                                    `${updateRole}:${attribute.settingRelationships}`,
                                  )
                                    ? `/settings/relationships/${relationship.id}/update-manpower-version/${version.id}`
                                    : "#"
                                }
                                className={cn(
                                  buttonVariants({ variant: "muted" }),
                                  "px-2.5 h-min",
                                  !hasPermission(
                                    role,
                                    `${updateRole}:${attribute.settingRelationships}`,
                                  ) && "hidden",
                                )}
                              >
                                <Icon name="edit" size="xs" />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <DeleteManpowerVersion
                          role={role}
                          relationshipId={relationship.id}
                          versionId={version.id}
                        />
                      </div>
                    </CardHeader>

                    <CardContent className="grid grid-cols-2 gap-4 p-4">
                      <DetailItem
                        label="Service Charge"
                        value={
                          version.service_charge
                            ? String(version.service_charge)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="Reimbursement Charge"
                        value={
                          version.reimbursement_charge
                            ? String(version.reimbursement_charge)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="Exit Charge"
                        value={
                          version.exit_charge
                            ? String(version.exit_charge)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="Statutory Charge"
                        value={
                          version.statutory_charge
                            ? String(version.statutory_charge)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="Service Charges On"
                        value={
                          version.service_charges_on
                            ? String(version.service_charges_on)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="Start Date"
                        value={
                          version.start_date
                            ? formatDate(version.start_date)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="End Date"
                        value={
                          version.end_date ? formatDate(version.end_date) : "--"
                        }
                      />

                      <div
                        className={cn(
                          "col-span-2",
                          !version.agreement_upload && "hidden",
                        )}
                      >
                        <DetailItem
                          label="Agreement Document"
                          value={
                            <a
                              href={version.agreement_upload}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              <Icon name="info" size="xs" />
                              View Document
                            </a>
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>

        <div
          className={cn(
            "text-center py-8",
            (!isManpowerExpanded ||
              relationship.relationship_manpower_version?.length) &&
              "hidden",
          )}
        >
          <p className="text-muted-foreground text-sm">
            No manpower versions available.
          </p>
        </div>
      </Card>
    </Card>
  );
}
