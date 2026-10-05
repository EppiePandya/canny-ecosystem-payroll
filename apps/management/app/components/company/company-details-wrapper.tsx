import { useEffect } from "react";
import { CompanyDetails } from "./company-details";
import { CompanyConfig } from "./company-config";
import { CompanyLogo } from "./company-logo";
import { toast } from "@canny_ecosystem/ui/use-toast";
import type {
  CompanyConfigDatabaseRow,
  CompanyDatabaseUpdate,
} from "@canny_ecosystem/supabase/types";
import { ErrorBoundary } from "../error-boundary";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export function CompanyDetailsWrapper({
  data,
  error,
  configData,
}: {
  data: CompanyDatabaseUpdate | null;
  error: Error | null | { message: string };
  configData: CompanyConfigDatabaseRow | null;
}) {
  useEffect(() => {
    if (error) {
      clearExactCacheEntry(cacheKeyPrefix.general);
      toast({
        title: "Error",
        description: error.message || "Failed to load",
        variant: "destructive",
      });
    }
  }, [error]);

  if (!data) {
    clearExactCacheEntry(cacheKeyPrefix.general);
    return (
      <ErrorBoundary error={error} message="Failed to load company details" />
    );
  }

  return (
    <>
      <CompanyLogo name={data?.name ?? ""} logo={data.logo ?? undefined} />
      <CompanyDetails updateValues={data} />
      <CompanyConfig
        configValues={configData}
        companyId={data.id as string}
        companyType={data.company_type ?? undefined}
      />
    </>
  );
}
