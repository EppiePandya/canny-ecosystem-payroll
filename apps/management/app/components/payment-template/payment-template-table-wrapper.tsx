import { DataTable } from "@/components/payment-field/table/data-table";
import { useEffect, useState, useMemo } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getColumns } from "./table/columns";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

export function PaymentTemplateTableWrapper({
  data,
  error,
  searchString,
  env,
}: {
  data: any[] | null;
  error: Error | null | { message: string };
  searchString: string;
  env: any;
}) {
  const [tableData, setTableData] = useState(data);
  const { toast } = useToast();

  const columns = useMemo(() => getColumns(env), [env]);
  useEffect(() => {
    if (error) {
      clearExactCacheEntry(cacheKeyPrefix.payment_templates);
      toast({
        title: "Error",
        description: error?.message || "Failed to load",
        variant: "destructive",
      });
    }

    const filteredData = data?.filter((item) => {
      if (!searchString) return true;
      return item.name?.toLowerCase().includes(searchString.toLowerCase());
    });

    setTableData(filteredData ?? []);
  }, [searchString, data, toast, error]);

  return <DataTable columns={columns} data={tableData ?? []} />;
}
