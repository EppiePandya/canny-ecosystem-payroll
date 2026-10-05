import type { SalaryEntriesDatabaseRow } from "@canny_ecosystem/supabase/types";
import type { RowSelectionState, Updater } from "@tanstack/react-table";
import { create } from "zustand";

interface SalaryEntriesState {
  columns: any[];
  columnVisibility: Record<string, boolean>;
  setColumnVisibility: (updater: Updater<Record<string, boolean>>) => void;
  setColumns: (columns: any[]) => void;
  setRowSelection: (updater: Updater<RowSelectionState>) => void;
  rowSelection: Record<string, boolean>;
  selectedRows: SalaryEntriesDatabaseRow[];
  setSelectedRows: (updater: Updater<SalaryEntriesDatabaseRow[]>) => void;
}

export const useSalaryEntriesStore = create<SalaryEntriesState>()((set) => ({
  columns: [],
  columnVisibility: {},
  rowSelection: {},
  selectedRows: [],
  setColumnVisibility: (updater) =>
    set((state) => ({
      columnVisibility:
        typeof updater === "function"
          ? updater(state.columnVisibility)
          : updater,
    })),
  setColumns: (columns) => set({ columns }),
  setRowSelection: (updater: Updater<RowSelectionState>) =>
    set((state) => {
      return {
        rowSelection:
          typeof updater === "function" ? updater(state.rowSelection) : updater,
      };
    }),
  setSelectedRows: (updater) =>
    set((state) => {
      return {
        selectedRows:
          typeof updater === "function" ? updater(state.selectedRows) : updater,
      };
    }),
}));
