import { DataTable } from "@/components/payment-field/table/data-table";
import { useEffect, useState } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { getColumns, type SalaryAssignmentTableRow } from "./table/columns";
import { determineActiveSalary } from "@canny_ecosystem/utils";

export function SalaryAssignmentTable({
  data,
  error,
  searchString,
  env,
}: {
  data: SalaryAssignmentTableRow[] | null;
  error: Error | null | { message: string };
  searchString: string;
  env: any;
}) {
  const [tableData, setTableData] = useState<SalaryAssignmentTableRow[]>(
    data || [],
  );
  const { toast } = useToast();

  const activeId = determineActiveSalary(data || []);

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load salary history",
        variant: "destructive",
      });
    }

    const filteredData = (data || []).filter((item) => {
      if (!searchString) return true;
      const search = searchString.toLowerCase();
      const monthlyCtc = String(item.monthly_ctc);
      const templateName = item.payment_templates?.name?.toLowerCase() || "";
      const effectiveDate = item.effective_date.toLowerCase();

      return (
        monthlyCtc.includes(search) ||
        templateName.includes(search) ||
        effectiveDate.includes(search)
      );
    });

    setTableData(filteredData);
  }, [searchString, data, toast, error]);

  const columns = getColumns(activeId, env);

  return <DataTable columns={columns} data={tableData} />;
}
