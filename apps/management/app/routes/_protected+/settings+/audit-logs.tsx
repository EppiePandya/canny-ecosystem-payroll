import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getAuditLogs } from "@canny_ecosystem/supabase/queries";
import type { AuditLogDatabaseRow } from "@canny_ecosystem/supabase/queries";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Icon } from "@canny_ecosystem/ui/icon";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  const url = new URL(request.url);

  const page = Number(url.searchParams.get("page") || "1");
  const limit = Number(url.searchParams.get("limit") || "15");
  const tableName = url.searchParams.get("table") || undefined;
  const recordId = url.searchParams.get("recordId") || undefined;

  const offset = (page - 1) * limit;

  const { data, count, error } = await getAuditLogs({
    supabase,
    tableName,
    recordId,
    limit,
    offset,
    companyId: companyId || undefined,
  });

  return json({
    logs: data || [],
    totalCount: count || 0,
    page,
    limit,
    tableName: tableName || "",
    recordId: recordId || "",
    error: error ? error.message : null,
  });
}

// Helper to format field names nicely (e.g. first_name -> First Name)
function formatFieldName(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Helper to render values safely as strings
function renderValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function AuditLogsRoute() {
  const { logs, totalCount, page, limit, tableName, recordId, error } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Dialog State
  const [selectedLog, setSelectedLog] = useState<AuditLogDatabaseRow | null>(
    null,
  );

  // Filter States
  const [tempTable, setTempTable] = useState(tableName);
  const [tempRecordId, setTempRecordId] = useState(recordId);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams);
    if (tempTable) {
      params.set("table", tempTable);
    } else {
      params.delete("table");
    }
    if (tempRecordId) {
      params.set("recordId", tempRecordId);
    } else {
      params.delete("recordId");
    }
    params.set("page", "1"); // Reset to page 1 on new filter
    setSearchParams(params);
  };

  const clearFilters = () => {
    setTempTable("");
    setTempRecordId("");
    const params = new URLSearchParams(searchParams);
    params.delete("table");
    params.delete("recordId");
    params.set("page", "1");
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    setSearchParams(params);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Extract changes for UPDATE actions
  const getDiffs = (oldData: any, newData: any) => {
    const diffs: { field: string; oldVal: any; newVal: any }[] = [];
    if (!oldData || !newData) return diffs;

    const allKeys = Array.from(
      new Set([...Object.keys(oldData), ...Object.keys(newData)]),
    );
    for (const key of allKeys) {
      // Skip system metadata fields from polluting audit view
      if (["updated_at", "created_at"].includes(key)) continue;

      const oldVal = oldData[key];
      const newVal = newData[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diffs.push({ field: key, oldVal, newVal });
      }
    }
    return diffs;
  };

  return (
    <section className="flex flex-col gap-6 py-4 h-full w-full">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Audit Logs
        </h1>
        <p className="text-sm text-muted-foreground">
          View history of inserts, updates, and deletes across key database
          tables.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-card rounded-lg border border-border">
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label className="text-xs font-semibold text-muted-foreground">
            Database Table
          </label>
          <Select value={tempTable} onValueChange={setTempTable}>
            <SelectTrigger className="w-full bg-background border-input">
              <SelectValue placeholder="All Tables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL_TABLES">All Tables</SelectItem>
              <SelectItem value="employees">Employees</SelectItem>
              <SelectItem value="work_details">Work Details</SelectItem>
              <SelectItem value="daily_attendance">Daily Attendance</SelectItem>
              <SelectItem value="monthly_attendance">
                Monthly Attendance
              </SelectItem>
              <SelectItem value="payroll">Payroll</SelectItem>
              <SelectItem value="salary_entries">Salary Entries</SelectItem>
              <SelectItem value="leaves">Leaves</SelectItem>
              <SelectItem value="companies">Companies</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[250px] flex-[2]">
          <label className="text-xs font-semibold text-muted-foreground">
            Record ID (UUID)
          </label>
          <Input
            placeholder="Search by UUID..."
            value={tempRecordId}
            onChange={(e) => setTempRecordId(e.target.value)}
            className="w-full bg-background border-input"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={applyFilters} variant="default" className="gap-2">
            <Icon name="search" size="sm" />
            Filter
          </Button>
          {(tableName || recordId || tempTable || tempRecordId) && (
            <Button onClick={clearFilters} variant="outline" className="gap-2">
              <Icon name="cross" size="sm" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-destructive/15 border border-destructive/30 text-destructive rounded-lg text-sm">
          Failed to load audit logs: {error}
        </div>
      )}

      {/* Main Table */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Action</TableHead>
              <TableHead className="w-[180px]">Table</TableHead>
              <TableHead className="w-[200px]">Record ID</TableHead>
              <TableHead className="min-w-[200px]">Performed By</TableHead>
              <TableHead className="w-[180px]">Time</TableHead>
              <TableHead className="w-[100px] text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-48 text-center text-muted-foreground"
                >
                  No audit logs found. Make sure the database triggers are
                  installed.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const actionBadgeVariant =
                  log.action === "INSERT"
                    ? "default"
                    : log.action === "UPDATE"
                      ? "secondary"
                      : "destructive";

                return (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Badge
                        variant={actionBadgeVariant}
                        className="font-semibold uppercase"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
                        {log.table_name}
                      </code>
                    </TableCell>
                    <TableCell>
                      {log.record_id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground truncate w-24">
                            {log.record_id}
                          </span>
                          <button
                            onClick={() => handleCopy(log.record_id!)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Copy Record ID"
                          >
                            <Icon name="copy" size="xs" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs text-accent-foreground font-bold">
                          {log.changed_by_email
                            ? log.changed_by_email[0].toUpperCase()
                            : "S"}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {log.changed_by_email || "System / API"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.changed_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-xs text-muted-foreground">
            Showing Page <strong>{page}</strong> of{" "}
            <strong>{totalPages}</strong> ({totalCount} logs total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="gap-1.5"
            >
              <Icon name="chevron-left" size="sm" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="gap-1.5"
            >
              Next
              <Icon name="chevron-right" size="sm" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Inspector Modal */}
      <Dialog
        open={selectedLog !== null}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <DialogContent className="max-w-2xl bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge
                variant={
                  selectedLog?.action === "INSERT"
                    ? "default"
                    : selectedLog?.action === "UPDATE"
                      ? "secondary"
                      : "destructive"
                }
                className="uppercase"
              >
                {selectedLog?.action}
              </Badge>
              <span>Change Inspector</span>
            </DialogTitle>
            <DialogDescription>
              Table:{" "}
              <strong className="font-mono text-foreground">
                {selectedLog?.table_name}
              </strong>{" "}
              | Record:{" "}
              <span className="font-mono">
                {selectedLog?.record_id || "N/A"}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
            {selectedLog?.action === "INSERT" && selectedLog.new_data && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created Fields
                </span>
                <div className="border rounded-md divide-y overflow-hidden bg-background">
                  {Object.entries(selectedLog.new_data).map(([key, val]) => (
                    <div
                      key={key}
                      className="grid grid-cols-3 gap-4 p-2.5 text-sm"
                    >
                      <span className="font-medium text-muted-foreground font-mono text-xs">
                        {formatFieldName(key)}
                      </span>
                      <span className="col-span-2 text-foreground font-mono text-xs break-all">
                        {renderValue(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedLog?.action === "DELETE" && selectedLog.old_data && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Removed Fields
                </span>
                <div className="border rounded-md divide-y overflow-hidden bg-background">
                  {Object.entries(selectedLog.old_data).map(([key, val]) => (
                    <div
                      key={key}
                      className="grid grid-cols-3 gap-4 p-2.5 text-sm bg-destructive/5"
                    >
                      <span className="font-medium text-muted-foreground font-mono text-xs">
                        {formatFieldName(key)}
                      </span>
                      <span className="col-span-2 text-foreground font-mono text-xs break-all line-through opacity-80">
                        {renderValue(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedLog?.action === "UPDATE" &&
              selectedLog.old_data &&
              selectedLog.new_data && (
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Modified Fields
                  </span>
                  {getDiffs(selectedLog.old_data, selectedLog.new_data)
                    .length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No fields were modified (only system timestamps/metadata
                      changed).
                    </p>
                  ) : (
                    <div className="border rounded-md divide-y overflow-hidden bg-background">
                      {getDiffs(selectedLog.old_data, selectedLog.new_data).map(
                        ({ field, oldVal, newVal }) => (
                          <div
                            key={field}
                            className="p-3 text-sm flex flex-col gap-1 hover:bg-muted/10"
                          >
                            <span className="font-semibold text-foreground text-xs">
                              {formatFieldName(field)}
                            </span>
                            <div className="grid grid-cols-2 gap-4 mt-1 bg-muted/20 p-2 rounded border border-border">
                              <div className="flex flex-col gap-1 border-r border-border pr-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                  Before
                                </span>
                                <span className="font-mono text-xs text-destructive break-all bg-destructive/5 px-1 py-0.5 rounded">
                                  {renderValue(oldVal)}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 pl-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                  After
                                </span>
                                <span className="font-mono text-xs text-success break-all bg-success/5 px-1 py-0.5 rounded">
                                  {renderValue(newVal)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setSelectedLog(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
