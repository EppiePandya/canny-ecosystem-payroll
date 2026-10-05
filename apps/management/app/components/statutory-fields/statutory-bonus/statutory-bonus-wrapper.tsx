import type { StatutoryBonusDatabaseRow } from "@canny_ecosystem/supabase/types";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@canny_ecosystem/ui/command";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Link } from "@remix-run/react";
import { StatutoryBonusCard } from "./statutory-bonus-card";
import { attribute } from "@canny_ecosystem/utils/constant";
import { hasPermission, createRole } from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { useEffect } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";

export function StatutoryBonusWrapper({
  data,
  error,
}: {
  data: Omit<StatutoryBonusDatabaseRow, "created_at">[] | null;
  error: Error | null | { message: string };
}) {
  const { role } = useUser();
  const { isDocument } = useIsDocument();
  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      clearExactCacheEntry(cacheKeyPrefix.statutory_bonus);
      toast({
        title: "Error",
        description:
          (error as any)?.message ||
          (error as any)?.error?.message ||
          "Failed to load",
        variant: "destructive",
      });
    }
  }, [error]);

  return (
    <section className="p-4 h-[calc(90vh-72px)] flex flex-col overflow-hidden">
      <div className="w-full flex-1 flex flex-col min-h-0">
        <Command className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent">
          <div className="w-full flex items-center gap-4 mb-4">
            <CommandInput
              divClassName="border border-input rounded-md h-12 flex-1"
              className="h-full"
              placeholder="Search Statutory Bonus"
              autoFocus={true}
            />
            <Link
              to="create-statutory-bonus"
              className={cn(
                buttonVariants({ variant: "primary-outline" }),
                "flex items-center gap-1 h-12",
                !hasPermission(
                  role,
                  `${createRole}:${attribute.statutoryFieldsStatutoryBonus}`,
                ) && "hidden",
              )}
            >
              <span>Add</span>
              <span className="hidden md:flex justify-end">
                Statutory Bonus
              </span>
            </Link>
          </div>
          <CommandEmpty
            className={cn(
              "w-full py-40 capitalize text-lg tracking-wide text-center",
              !isDocument && "hidden",
            )}
          >
            No records found.
          </CommandEmpty>
          <CommandList className="flex-1 max-h-none overflow-y-auto py-2">
            <CommandGroup className="p-0">
              <div className="w-full grid gap-8 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
                {data?.map((bonus) => (
                  <CommandItem
                    key={bonus.id}
                    value={
                      bonus.name +
                      bonus.payment_frequency +
                      bonus.percentage +
                      bonus.payout_month +
                      bonus.consider_for_esic
                    }
                    className="data-[selected=true]:bg-inherit data-[selected=true]:text-foreground px-0 py-0"
                  >
                    <StatutoryBonusCard data={bonus} />
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
