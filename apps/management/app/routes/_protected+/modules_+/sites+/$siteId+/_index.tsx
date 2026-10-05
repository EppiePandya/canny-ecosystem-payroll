import {
  SiteAddressCard,
  SiteHeaderCard,
  SiteMetaCard,
} from "@/components/sites";
import { getSiteById } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const siteId = params.siteId;
  if (!siteId) {
    throw new Response("Site ID missing", { status: 400 });
  }

  const { data, error } = await getSiteById({ supabase, id: siteId });

  if (error) {
    throw new Response("Failed to load site", { status: 500 });
  }

  return { site: data };
}

export default function SiteOverviewPage() {
  const { site } = useLoaderData<typeof loader>();

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <h2 className="text-xl font-semibold text-red-600">Site Not Found</h2>
        <p className="mt-2 text-muted-foreground">
          The requested site could not be loaded. Please check the ID and try
          again.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="md:col-span-2">
        <SiteHeaderCard name={site.name} isActive={site.is_active ?? false} />
      </div>

      <SiteAddressCard
        addressLine1={site.address_line_1}
        addressLine2={site.address_line_2}
        city={site.city}
        state={site.state}
        pincode={site.pincode}
        companyLocationName={site.company_location?.name}
      />

      <SiteMetaCard
        projectId={site.project_id}
        companyId={site.company_id}
        capacity={site.capacity}
      />
    </div>
  );
}
