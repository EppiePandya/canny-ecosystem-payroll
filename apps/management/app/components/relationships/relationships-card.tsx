import { Card } from "@canny_ecosystem/ui/card";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Link } from "@remix-run/react";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useUser } from "@/utils/user";
import type { RelationshipWithCompany } from "@canny_ecosystem/supabase/queries";

import { RelationshipCard } from "./relationship-card";

export const RelationshipsCard = ({
  relationships,
}: {
  relationships: Omit<RelationshipWithCompany, "created_at">[] | null;
}) => {
  const { role } = useUser();

  return (
    <div className="flex flex-col  w-full">
      <div className="flex justify-between items-center px-1">
        <Link
          to={
            hasPermission(
              role,
              `${createRole}:${attribute.settingRelationships}`,
            )
              ? "create-relationship"
              : "#"
          }
          className={cn(
            buttonVariants({ variant: "outline" }),
            "bg-card",
            (!hasPermission(
              role,
              `${createRole}:${attribute.settingRelationships}`,
            ) ||
              (relationships && relationships.length > 0)) &&
              "hidden",
          )}
        >
          <Icon name="plus-circled" className="mr-2" />
          Add
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {relationships?.length ? (
          relationships.map((relationship, index) => (
            <RelationshipCard
              key={relationship?.id + index.toString()}
              relationship={relationship}
            />
          ))
        ) : (
          <Card className="p-12 text-center bg-muted/20 border-2 border-dashed">
            <p className="text-muted-foreground font-medium">
              No relationships available.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};
