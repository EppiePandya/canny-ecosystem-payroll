import { ColumnVisibility } from "@/components/employees/column-visibility";
import { AddEmployeeDialog } from "./add-employee-dialog";
import { useEmployeesStore } from "@/store/employees";
import { EmployeesLetterMenu } from "./employees-letter-menu";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";

export function EmployeesActions({
  isEmpty,
  env,
}: {
  isEmpty: boolean;
  env: SupabaseEnv;
}) {
  const { selectedRows } = useEmployeesStore();

  return (
    <div className="gap-4 flex max-sm:justify-end max-sm:w-full items-center">
      <div className="flex items-center gap-2">
        <ColumnVisibility disabled={isEmpty} />
        <AddEmployeeDialog />
        <EmployeesLetterMenu selectedRows={selectedRows} env={env} />
      </div>
    </div>
  );
}
