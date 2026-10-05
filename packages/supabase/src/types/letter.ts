import type { LetterDatabaseRow } from ".";

export type LetterBaseDataType = Omit<LetterDatabaseRow, "created_at"> & {
  font_size?: number;
  include_salary_structure?: boolean | null;
  date?: string | Date | null;
  employees?: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
  };
  salary_structure_data?: {
    monthlyCtc: number;
    monthlyGross: number;
    monthlyBasicDa: number;
  };
};

