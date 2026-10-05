import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { Icon } from "@canny_ecosystem/ui/icon";

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

export function MissingPayrollModal({
  isOpen,
  onOpenChange,
  missingEmployees,
  month,
  year,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  missingEmployees: Employee[];
  month: string;
  year: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery, selectedProject, selectedSite, selectedDepartment]);

  // Extract unique projects, sites and departments for dropdown options
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-6 max-h-[85vh] flex flex-col gap-4">
        <DialogHeader className="pb-2 border-b border-white/5">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Icon name="info" className="text-amber-500 h-5 w-5" />
            <span>
              Remaining Employees ({filteredEmployees.length}) - {month} {year}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Showing active employees who do not have a salary entry for this
            period.
          </p>
        </DialogHeader>

        {/* Filters Row */}
        <div className="flex flex-col gap-3">
          {/* Search Input */}
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

          {/* Project, Site & Department Select Dropdowns */}
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

        {/* List Section */}
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
                    className="flex flex-col gap-1 p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold tracking-wide">
                        {fullName}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
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
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
