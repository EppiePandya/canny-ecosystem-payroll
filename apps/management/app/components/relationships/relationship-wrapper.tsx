import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@canny_ecosystem/ui/command";
import { RelationshipCard } from "./relationship-card";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import type { RelationshipWithCompany } from "@canny_ecosystem/supabase/queries";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { hasPermission, createRole } from "@canny_ecosystem/utils";
import { Link } from "@remix-run/react";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";

export function RelationshipWrapper({
  data,
  error,
}: {
  data: Omit<RelationshipWithCompany, "created_at">[] | null;
  error: Error | null | { message: string };
}) {
  const { role } = useUser();
  const { isDocument } = useIsDocument();
  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load",
        variant: "destructive",
      });
    }
  }, [error]);

  return (
    <section className="py-2.5">
      <div className="w-full flex items-end justify-between">
        <Command className="overflow-visible">
          <div className="w-full lg:w-3/5 2xl:w-1/3 flex items-center gap-4">
            <CommandInput
              divClassName="border border-input rounded-md h-10 flex-1"
              placeholder="Search Relationships"
              autoFocus={true}
            />
            <Link
              to="/settings/relationships/create-relationship"
              className={cn(
                buttonVariants({ variant: "primary-outline" }),
                "flex items-center gap-1",
                !hasPermission(
                  role,
                  `${createRole}:${attribute.settingRelationships}`,
                ) && "hidden",
              )}
            >
              <span>Add</span>
              <span className="hidden md:flex justify-end">Relationship</span>
            </Link>
          </div>
          <CommandEmpty
            className={cn(
              "w-full py-40 capitalize text-lg tracking-wide text-center",
              !isDocument && "hidden",
            )}
          >
            No relationship found.
          </CommandEmpty>
          <CommandList className="max-h-full py-6 overflow-x-visible overflow-y-visible">
            <CommandGroup className="p-0 overflow-visible">
              <div className="w-full flex flex-col gap-6">
                {data?.map((relationship, index) => (
                  <CommandItem
                    key={relationship?.id}
                    value={
                      relationship?.relationship_type +
                      relationship?.company?.name
                    }
                    className="data-[selected=true]:bg-inherit data-[selected=true]:text-foreground p-0"
                  >
                    <RelationshipCard relationship={relationship} />
                  </CommandItem>
                ))}
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </section>
  );
}
