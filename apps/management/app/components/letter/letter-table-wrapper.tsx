import { useEffect, useMemo, useState } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { columns } from "./table/columns";
import type { LetterDataType } from "@canny_ecosystem/supabase/queries";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { DataTable } from "./table/data-table";

const sortData = (data: LetterDataType[], sortType: string) => {
  if (!sortType) return data;

  const sortedData = [...data];

  switch (sortType) {
    case "created_at:desc":
      return sortedData.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    case "letter_type:desc":
      return sortedData.sort((a, b) =>
        b.letter_type.localeCompare(a.letter_type),
      );
    case "created_at:asc":
      return sortedData.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    case "letter_type:asc":
      return sortedData.sort((a, b) =>
        a.letter_type.localeCompare(b.letter_type),
      );
    default:
      return sortedData;
  }
};

export function LetterTableWrapper({
  data,
  error,
  searchString,
}: {
  data: LetterDataType[] | null;
  error: Error | null | { message: string };
  searchString: string;
}) {
  const { toast } = useToast();
  const [sortType, setSortType] = useState("");

  useEffect(() => {
    if (error) {
      clearExactCacheEntry(`${cacheKeyPrefix.letters}`);
      toast({
        title: "Error",
        description: error?.message || "Failed to load",
        variant: "destructive",
      });
    }
  }, [error]);

  const filterData = (data: LetterDataType[]) => {
    return data.filter((item) =>
      Object.values(item).some((value) =>
        String(value).toLowerCase().includes(searchString.toLowerCase()),
      ),
    );
  };

  const tableData = useMemo(() => {
    if (!data) return [];

    const filteredData = filterData(data);

    return sortData(filteredData, sortType);
  }, [data, searchString, sortType]);

  return (
    <>
      <DataTable
        columns={columns}
        data={tableData}
        sortType={sortType}
        handleSortType={setSortType}
      />
    </>
  );
}
