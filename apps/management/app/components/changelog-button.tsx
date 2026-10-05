import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Badge } from "@canny_ecosystem/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import type { AuditLogDatabaseRow } from "@canny_ecosystem/supabase/types";
import { useCompanyId } from "@/utils/company";

import { cn } from "@canny_ecosystem/ui/utils/cn";

function formatFieldName(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderValue(val: any, fieldName?: string, lookups?: any): string {
  if (val === null || val === undefined) return "—";
  if (lookups && typeof val === "string") {
    if (fieldName === "site_id" && lookups.sites?.[val]) {
      return lookups.sites[val];
    }
    if (fieldName === "project_id" && lookups.projects?.[val]) {
      return lookups.projects[val];
    }
    if (fieldName === "department_id" && lookups.departments?.[val]) {
      return lookups.departments[val];
    }
    if (fieldName === "employee_id" && lookups.employees?.[val]) {
      return lookups.employees[val];
    }
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function ChangelogButton({ className }: { className?: string } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const { companyId } = useCompanyId();
  const fetcher = useFetcher<{
    logs: AuditLogDatabaseRow[];
    lookups: Record<string, Record<string, string>>;
  }>();

  // Load audit logs only when the modal opens
  useEffect(() => {
    if (isOpen) {
      const url = companyId ? `/api/changelog?companyId=${companyId}` : "/api/changelog";
      fetcher.load(url);
    }
  }, [isOpen, companyId]);

  const logs = fetcher.data?.logs || [];
  const lookups = fetcher.data?.lookups || {
    sites: {},
    projects: {},
    departments: {},
    employees: {},
  };
  const isLoading = isOpen && fetcher.state === "loading";


  return (
    <>
      <Button
        variant="outline"
        className={cn(
          "bg-card truncate justify-between capitalize rounded pl-1.5 pr-3 w-auto py-1 h-full",
          className,
        )}
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-center gap-2">
          <div className="w-14 h-11 border border-muted-foreground/30 shadow-sm rounded-sm flex items-center justify-center bg-muted/20">
            <Icon name="clock" size="md" className="text-foreground/80" />
          </div>
          <p className="hidden md:flex text-start truncate font-normal">
            Changelog
          </p>
        </div>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Icon name="clock" size="md" className="text-primary" />
              <span>Recent System Activity</span>
            </DialogTitle>
            <DialogDescription>
              Displaying the latest 30 changes recorded across database tables.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
            {isLoading ? (
              <LoadingSpinner className="my-10" />
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No activity found. Triggers might not be active.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const actionBadgeVariant =
                    log.action === "INSERT"
                      ? "default"
                      : log.action === "UPDATE"
                        ? "secondary"
                        : "destructive";

                  return (
                    <div key={log.id} className="py-3 flex flex-col gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedLogId(isExpanded ? null : log.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedLogId(isExpanded ? null : log.id);
                          }
                        }}
                        className="flex items-center justify-between cursor-pointer hover:bg-muted/10 p-1.5 rounded transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={actionBadgeVariant}
                            className="uppercase font-semibold text-[10px] px-1.5"
                          >
                            {log.action}
                          </Badge>
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">
                            {log.table_name}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {log.changed_by_email || "System / API"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <span>
                            {new Date(log.changed_at).toLocaleTimeString(
                              "en-IN",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                          <Icon
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size="xs"
                          />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pl-6 pr-2 py-2 bg-muted/20 border border-border rounded mt-1 text-xs">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground">
                              <span>Record UUID: {log.record_id || "N/A"}</span>
                              <span>
                                {new Date(log.changed_at).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                            </div>

                            {log.action === "INSERT" && log.new_data && (
                              <div className="mt-2 grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                                {Object.entries(log.new_data).map(([k, v]) => (
                                  <div
                                    key={k}
                                    className="flex flex-col border-b border-border/50 py-1"
                                  >
                                    <span className="font-semibold text-[10px] text-muted-foreground font-mono">
                                      {formatFieldName(k)}
                                    </span>
                                    <span className="font-mono break-all text-foreground mt-0.5">
                                      {renderValue(v, k, lookups)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {log.action === "DELETE" && log.old_data && (
                              <div className="mt-2 grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1 bg-destructive/5 p-2 rounded">
                                {Object.entries(log.old_data).map(([k, v]) => (
                                  <div
                                    key={k}
                                    className="flex flex-col border-b border-border/50 py-1"
                                  >
                                    <span className="font-semibold text-[10px] text-muted-foreground font-mono">
                                      {formatFieldName(k)}
                                    </span>
                                    <span className="font-mono break-all text-foreground/80 line-through mt-0.5">
                                      {renderValue(v, k, lookups)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {log.action === "UPDATE" &&
                              log.old_data &&
                              log.new_data && (
                                <div className="mt-2 flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                                  {Object.keys({
                                    ...log.old_data,
                                    ...log.new_data,
                                  })
                                    .filter(
                                      (key) =>
                                        !["updated_at", "created_at"].includes(
                                          key,
                                        ),
                                    )
                                    .filter(
                                      (key) =>
                                        JSON.stringify(log.old_data[key]) !==
                                        JSON.stringify(log.new_data[key]),
                                    )
                                    .map((field) => (
                                      <div
                                        key={field}
                                        className="flex flex-col border-b border-border/50 pb-1.5"
                                      >
                                        <span className="font-bold text-[10px] text-foreground font-mono">
                                          {formatFieldName(field)}
                                        </span>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                          <div className="bg-destructive/5 p-1 rounded">
                                            <span className="text-[9px] uppercase text-muted-foreground">
                                              Before
                                            </span>
                                            <div className="font-mono text-destructive break-all mt-0.5">
                                              {renderValue(
                                                log.old_data[field],
                                                field,
                                                lookups,
                                              )}
                                            </div>
                                          </div>
                                          <div className="bg-success/5 p-1 rounded">
                                            <span className="text-[9px] uppercase text-muted-foreground">
                                              After
                                            </span>
                                            <div className="font-mono text-success break-all mt-0.5">
                                              {renderValue(
                                                log.new_data[field],
                                                field,
                                                lookups,
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
