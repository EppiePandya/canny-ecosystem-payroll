import { useSalariesStore } from "@/store/salaries";
import { DeleteSalaryAssignments } from "./delete-salary-assignments";

export function BulkActionsBar() {
  const { selectedRows, rowSelection, setRowSelection } = useSalariesStore();
  const selectedCount = Object.keys(rowSelection).length;

  if (selectedCount === 0) return null;

  const selectedIds = selectedRows
    .map((row) => row.employee_salary_assignment?.[0]?.id)
    .filter(Boolean) as string[];

  return (
    <div className="z-40 fixed bottom-8 right-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <DeleteSalaryAssignments
        assignmentIds={selectedIds}
        isBulk
        onSuccess={() => setRowSelection({})}
      />
    </div>
  );
}
