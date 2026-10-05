import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Button, buttonVariants } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { clearCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";

interface Employee {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  employee_code: string;
  work_details?: {
    employee_id: string;
    projects?: { id: string; name: string } | null;
    sites?: { id: string; name: string } | null;
    departments?: { id: string; name: string } | null;
  }[];
}

export function MissingAttendanceModal({
  missingEmployees,
  month,
  year,
  error,
}: {
  missingEmployees: Employee[];
  month: string;
  year: string;
  error?: any;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  const fetcher = useFetcher();
  const { toast } = useToast();
  const [employeeToDeactivate, setEmployeeToDeactivate] =
    useState<Employee | null>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as {
        status: string;
        message?: string;
        error?: any;
      };
      if (data.status === "success") {
        clearCacheEntry(cacheKeyPrefix.attendance);
        clearCacheEntry(cacheKeyPrefix.employees);
        toast({
          title: "Success",
          description: data.message || "Employee marked as inactive",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to update employee status",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, toast]);

  const handleDeactivate = () => {
    if (!employeeToDeactivate) return;
    fetcher.submit(
      {
        id: employeeToDeactivate.id,
        is_active: "false",
      },
      {
        method: "POST",
        action: `/employees/${employeeToDeactivate.id}/update-active`,
      },
    );
    setEmployeeToDeactivate(null);
  };

  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery, selectedProject, selectedSite, selectedDepartment]);

  const projectOptions = Array.from(
    new Set(
      missingEmployees
        .map((emp) => emp.work_details?.[0]?.projects?.name)
        .filter(Boolean),
    ),
  ).sort() as string[];

  const siteOptions = Array.from(
    new Set(
      missingEmployees
        .map((emp) => emp.work_details?.[0]?.sites?.name)
        .filter(Boolean),
    ),
  ).sort() as string[];

  const departmentOptions = Array.from(
    new Set(
      missingEmployees
        .map((emp) => emp.work_details?.[0]?.departments?.name)
        .filter(Boolean),
    ),
  ).sort() as string[];

  const filteredEmployees = missingEmployees.filter((emp) => {
    const empProject = emp.work_details?.[0]?.projects?.name || "";
    const empSite = emp.work_details?.[0]?.sites?.name || "";
    const empDept = emp.work_details?.[0]?.departments?.name || "";

    if (selectedProject && empProject !== selectedProject) return false;
    if (selectedSite && empSite !== selectedSite) return false;
    if (selectedDepartment && empDept !== selectedDepartment) return false;

    const fullName =
      `${emp.first_name} ${emp.middle_name || ""} ${emp.last_name}`.toLowerCase();
    const code = emp.employee_code.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || code.includes(query);
  });

  const visibleEmployees = filteredEmployees.slice(0, visibleCount);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 15) {
      if (visibleCount < filteredEmployees.length) {
        setVisibleCount((prev) => prev + 20);
      }
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium">
        <Icon name="exclaimation-triangle" className="h-3.5 w-3.5" />
        <span>Failed to check missing attendance</span>
      </div>
    );
  }

  if (missingEmployees.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-medium">
        <Icon name="check-circle" className="h-3.5 w-3.5" />
        <span>
          All attendances added for {month} {year}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setSelectedProject("");
          setSelectedSite("");
          setSelectedDepartment("");
          setSearchQuery("");
        }}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:border-amber-500/30 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm hover:shadow active:scale-95"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span>
          {missingEmployees.length} employees attendance remaining to add
        </span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[480px] p-6 max-h-[85vh] flex flex-col gap-4">
          <DialogHeader className="pb-2 border-b border-white/5">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Icon name="info" className="text-amber-500 h-5 w-5" />
              <span>
                Missing Attendance ({filteredEmployees.length}) - {month} {year}
              </span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Showing employees who do not have a monthly attendance record.
            </p>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4"
              />
              <Input
                placeholder="Search by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-muted/30"
                >
                  <option value="" className="dark:bg-background">
                    All Projects
                  </option>
                  {projectOptions.map((proj) => (
                    <option
                      key={proj}
                      value={proj}
                      className="dark:bg-background"
                    >
                      {proj}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Site
                </label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-muted/30"
                >
                  <option value="" className="dark:bg-background">
                    All Sites
                  </option>
                  {siteOptions.map((site) => (
                    <option
                      key={site}
                      value={site}
                      className="dark:bg-background"
                    >
                      {site}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Dept
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-muted/30"
                >
                  <option value="" className="dark:bg-background">
                    All Depts
                  </option>
                  {departmentOptions.map((dept) => (
                    <option
                      key={dept}
                      value={dept}
                      className="dark:bg-background"
                    >
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto border border-white/5 rounded-lg bg-muted/20 divide-y divide-white/5 pr-1 max-h-[40vh]"
          >
            {filteredEmployees.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No matching employees found.
              </div>
            ) : (
              <>
                {visibleEmployees.map((emp) => {
                  const fullName = [
                    emp.first_name,
                    emp.middle_name,
                    emp.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const empProject = emp.work_details?.[0]?.projects?.name;
                  const empSite = emp.work_details?.[0]?.sites?.name;
                  const empDept = emp.work_details?.[0]?.departments?.name;

                  return (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/40 transition-colors gap-4"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold tracking-wide truncate">
                            {fullName}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono shrink-0">
                            {emp.employee_code}
                          </span>
                        </div>
                        {(empProject || empSite || empDept) && (
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {empProject && (
                              <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500 dark:text-amber-400 border border-amber-500/20">
                                {empProject}
                              </span>
                            )}
                            {empSite && (
                              <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500 dark:text-blue-400 border border-blue-500/20">
                                {empSite}
                              </span>
                            )}
                            {empDept && (
                              <span className="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-500 dark:text-purple-400 border border-purple-500/20">
                                {empDept}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEmployeeToDeactivate(emp)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-[11px] font-semibold py-1 px-2 h-7 flex items-center gap-1 rounded border border-white/5 hover:border-destructive/20 transition-all duration-200 cursor-pointer shadow-sm hover:shadow active:scale-95 shrink-0"
                      >
                        <Icon name="cross" className="h-3 w-3" />
                        <span>Make as Inactive</span>
                      </Button>
                    </div>
                  );
                })}
                {visibleCount < filteredEmployees.length && (
                  <div className="p-3 text-center text-[11px] text-muted-foreground bg-muted/10">
                    Scroll down to load more (showing {visibleCount} of{" "}
                    {filteredEmployees.length})
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={employeeToDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setEmployeeToDeactivate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to make{" "}
              <span className="font-semibold text-foreground">
                {employeeToDeactivate
                  ? `${employeeToDeactivate.first_name} ${
                      employeeToDeactivate.middle_name || ""
                    } ${employeeToDeactivate.last_name}`.replace(/\s+/g, " ")
                  : ""}
              </span>{" "}
              inactive?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className={cn(buttonVariants({ variant: "destructive" }))}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
