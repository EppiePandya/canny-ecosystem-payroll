import type { RowSelectionState, Updater } from "@tanstack/react-table";
import { create } from "zustand";

interface SalariesState {
  columns: string[];
  rowSelection: Record<string, boolean>;
  selectedRows: any[];
  setColumns: (columns?: any[]) => void;
  setRowSelection: (updater: Updater<RowSelectionState>) => void;
  setSelectedRows: (updater: Updater<any[]>) => void;
}

export const useSalariesStore = create<SalariesState>()((set) => ({
  columns: [],
  rowSelection: {},
  selectedRows: [],
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
