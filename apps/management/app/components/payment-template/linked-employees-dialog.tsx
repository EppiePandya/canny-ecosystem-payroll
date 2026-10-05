import { useState, useEffect } from "react";
import { Link } from "@remix-run/react";
import { useInView } from "react-intersection-observer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { ScrollArea } from "@canny_ecosystem/ui/scroll-area";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Input } from "@canny_ecosystem/ui/input";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { getLinkedEmployeesByTemplateId } from "@canny_ecosystem/supabase/queries";

const PAGE_SIZE = 20;

export function LinkedEmployeesDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  env,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
  env: any;
}) {
  const { supabase } = useSupabase({ env });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [from, setFrom] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const { ref, inView } = useInView();

  useEffect(() => {
    if (open && templateId) {
      setFrom(0);
      setEmployees([]);
      setHasMore(true);
      loadEmployees(0, searchQuery, true);
    }
  }, [open, templateId, searchQuery]);

  useEffect(() => {
    if (inView && hasMore && !loading && !loadingMore && employees.length > 0) {
      const nextFrom = from + PAGE_SIZE;
      setFrom(nextFrom);
      loadEmployees(nextFrom, searchQuery, false);
    }
  }, [inView, hasMore, loading, loadingMore]);

  async function loadEmployees(
    start: number,
    query: string,
    isInitial: boolean,
  ) {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const { data, error } = await getLinkedEmployeesByTemplateId({
        supabase: supabase as any,
        templateId,
        params: {
          from: start,
          to: start + PAGE_SIZE - 1,
          searchQuery: query,
        },
      });

      if (error) throw error;

      setEmployees((prev) => (isInitial ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error("LinkedEmployeesDialog error:", err);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setSearchQuery(inputValue);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Linked Employees - {templateName}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Icon
              name="magnifying-glass"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size="sm"
            />
            <Input
              placeholder="Search by name or code and press Enter..."
              className="pl-9 h-9"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {loading ? (
          <div className="w-full h-[60vh] flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <ScrollArea className="h-[60vh] px-6 pb-6">
            {employees.length === 0 ? (
              <p className="text-center p-8 text-muted-foreground">
                No linked employees found.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp) => (
                      <TableRow key={emp.employee_code}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {emp.employee_code}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/employees/${emp.id}/salary`}
                            className="hover:underline text-primary"
                          >
                            {[emp.first_name, emp.middle_name, emp.last_name]
                              .filter(Boolean)
                              .join(" ")}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {hasMore && (
                  <div ref={ref} className="flex justify-center p-4">
                    <LoadingSpinner className="h-6 w-6" />
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
