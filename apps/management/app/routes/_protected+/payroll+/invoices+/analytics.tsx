import {
  getCannyCompanyIdByName,
  getRelationshipsByCompanyId,
  type InvoiceDataType,
} from "@canny_ecosystem/supabase/queries";
import { useLocalStorage } from "@canny_ecosystem/utils/hooks/local-storage";
import { useEffect } from "react";
import { useInvoiceStore } from "@/store/invoices";
import { InvoiceTrend } from "@/components/invoice/analytics/invoice-trend";
import { useLoaderData } from "@remix-run/react";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { CANNY_NAME } from "../run-payroll+/$payrollId+/_reports+/create-invoice";
import { InvoicePaidUnpaid } from "@/components/invoice/analytics/paid-unpaid-invoice";
import { InvoicesByLocations } from "@/components/invoice/analytics/invoices-by-locations";
import { InvoicesByType } from "@/components/invoice/analytics/invoice-by-type";

const getDataSource = (
  selectedRows: InvoiceDataType[],
  storedValue: InvoiceDataType[],
) => {
  return selectedRows.length > 0 ? selectedRows : storedValue;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );
  const { data: cannyData, error } = await getCannyCompanyIdByName({
    name: CANNY_NAME,
    supabase: supabase as any,
  });
  if (error) {
    throw new Error("Error fetching company ID");
  }

  let companyRelations = null;
  if (cannyData?.id) {
    const { data } = await getRelationshipsByCompanyId({
      companyId,
      supabase: supabase as any,
    });
    // Assuming we want the latest active relationship's latest manpower version
    const activeRelationship = data?.find((r) => r.is_active);
    if (activeRelationship?.relationship_manpower_version?.length) {
      // Sort by start_date descending if multiple versions exist
      companyRelations = activeRelationship.relationship_manpower_version.sort(
        (a, b) =>
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
      )[0];
    }
  }

  return {
    companyRelations,
  };
}

export default function InvoicesAnalytics() {
  const { companyRelations } = useLoaderData<typeof loader>();

  const { selectedRows } = useInvoiceStore();
  const [storedValue, setValue] = useLocalStorage<InvoiceDataType[]>(
    "analyticsArray",
    [],
  );

  useEffect(() => {
    if (selectedRows.length > 0) {
      setValue(selectedRows);
    }
  }, [selectedRows, setValue]);

  const dataSource: InvoiceDataType[] = getDataSource(
    selectedRows,
    storedValue,
  );

  return (
    <div className="w-full p-4 m-auto flex flex-col gap-4">
      <div className="w-full">
        <InvoiceTrend
          chartData={dataSource}
          companyRelations={companyRelations}
        />
      </div>

      <div className="flex flex-col lg:flex-row w-full  gap-3">
        <InvoicesByLocations
          chartData={dataSource}
          companyRelations={companyRelations}
        />
        <InvoicesByType
          chartData={dataSource}
          companyRelations={companyRelations}
        />
        <InvoicePaidUnpaid chartData={dataSource} />
      </div>
    </div>
  );
}
