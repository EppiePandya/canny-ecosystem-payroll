import { useExitsStore } from "@/store/exits";
import { ColumnVisibility } from "./column-visibility";
import { ExitAddOption } from "./exit-add-option";

export function ExitActions({ isEmpty, env }: { isEmpty: boolean; env: any }) {
  const { selectedRows } = useExitsStore();

  return (
    <div className="gap-4 flex max-sm:justify-end max-sm:w-full ">
      <div className="flex gap-2">
        <ColumnVisibility disabled={isEmpty} />
        <ExitAddOption />
      </div>
    </div>
  );
}
