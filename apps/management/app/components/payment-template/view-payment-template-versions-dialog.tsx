import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { formatDate, roundToNearest } from "@canny_ecosystem/utils";
import { useFetcher } from "@remix-run/react";
import { useEffect, useState, useMemo } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Button } from "@canny_ecosystem/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canny_ecosystem/ui/tooltip";

type Version = {
  id: string;
  monthly_ctc: number | null;
  basic_percent: number | null;
  basic_amount?: number | null;
  effective_date: string | null;
  is_pro_rata: boolean;
  created_at: string | null;
  payment_template_components: any[];
  payment_statutory_components: any;
};

export function ViewPaymentTemplateVersionsDialog({
  open,
  onOpenChange,
  templateName,
  templateId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  templateId: string;
}) {
  const fetcher = useFetcher<{ versions: Version[] }>();
  const deleteFetcher = useFetcher<{ success?: boolean; error?: string }>();

  const versions = fetcher.data?.versions || [];
  const isLoading = fetcher.state === "loading";
  const isDeleting = deleteFetcher.state !== "idle";

  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadVersions = () => {
    if (templateId) {
      fetcher.load(`/api/payment-templates/${templateId}/versions`);
    }
  };

  useEffect(() => {
    if (open && templateId) {
      loadVersions();
    }
  }, [open, templateId]);

  useEffect(() => {
    if (deleteFetcher.data?.success) {
      setConfirmDeleteId(null);
      loadVersions();
    }
  }, [deleteFetcher.data]);

  const sortedVersions = useMemo(() => {
    if (!Array.isArray(versions)) return [];
    return [...versions].sort((a, b) => {
      const dateA = new Date(a.effective_date || 0).getTime();
      const dateB = new Date(b.effective_date || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });
  }, [versions]);

  const isOnlyVersion = sortedVersions.length <= 1;

  const handleDeleteVersion = (versionId: string) => {
    const formData = new FormData();
    formData.append("versionId", versionId);
    deleteFetcher.submit(formData, {
      method: "DELETE",
      action: `/api/payment-templates/${templateId}/versions`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Versions - {templateName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <LoadingSpinner />
              <p className="text-muted-foreground animate-pulse text-sm">
                Fetching version history...
              </p>
            </div>
          ) : sortedVersions.length === 0 ? (
            <div className="text-center py-20 border rounded-lg border-dashed">
              <p className="text-muted-foreground text-sm">
                No versions found.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {deleteFetcher.data?.error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                  <Icon name="exclaimation-triangle" size="sm" />
                  {deleteFetcher.data.error}
                </div>
              )}

              {sortedVersions.map((version, index) => {
                const isExpanded = expandedVersion === version.id;
                const isConfirming = confirmDeleteId === version.id;
                return (
                  <div
                    key={version.id || `version-${index}`}
                    className="border rounded-lg overflow-hidden transition-all duration-200"
                  >
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVersion(isExpanded ? null : version.id)
                        }
                        className="flex-1 hover:bg-muted/50 transition-colors py-4 px-4 flex items-center justify-between text-left"
                      >
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 w-full">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              Effective Date
                            </span>
                            <span className="font-semibold">
                              {version.effective_date
                                ? formatDate(version.effective_date)
                                : "—"}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              Monthly CTC
                            </span>
                            <span className="font-semibold">
                              ₹{roundToNearest(version.monthly_ctc ?? 0)}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              Basic %
                            </span>
                            <span className="font-semibold text-primary">
                              {version.basic_percent
                                ? `${version.basic_percent}%`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              Basic Amount
                            </span>
                            <span className="font-semibold text-primary">
                              ₹{version.basic_amount
                                ? roundToNearest(version.basic_amount)
                                : version.monthly_ctc && version.basic_percent
                                  ? roundToNearest((version.monthly_ctc * version.basic_percent) / 100)
                                  : "—"}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              Pro-Rata
                            </span>
                            <Badge
                              variant={
                                version.is_pro_rata ? "default" : "secondary"
                              }
                              className="w-fit h-5 px-1.5 text-[10px]"
                            >
                              {version.is_pro_rata ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "ml-4 transition-transform duration-200",
                            isExpanded ? "rotate-180" : "",
                          )}
                        >
                          <Icon name="chevron-down" size="sm" />
                        </div>
                      </button>

                      <div className="px-3 flex items-center gap-2 shrink-0">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                            <span className="text-xs text-muted-foreground">
                              Delete?
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={isDeleting}
                              onClick={() => handleDeleteVersion(version.id)}
                            >
                              {isDeleting ? (
                                <LoadingSpinner className="h-3 w-3" />
                              ) : (
                                "Confirm"
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
                                      isOnlyVersion &&
                                        "opacity-40 cursor-not-allowed pointer-events-none",
                                    )}
                                    disabled={isOnlyVersion}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(version.id);
                                    }}
                                  >
                                    <Icon name="trash" size="sm" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {isOnlyVersion && (
                                <TooltipContent side="left">
                                  <p className="text-xs">
                                    Cannot delete the only version
                                  </p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-6 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4 border-t pt-6">
                          <div className="space-y-4">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              Salary Components
                            </h4>
                            <div className="border rounded-lg overflow-hidden shadow-sm">
                              <Table>
                                <TableHeader className="bg-muted/50">
                                  <TableRow>
                                    <TableHead className="h-8 text-[10px] font-bold">
                                      Field
                                    </TableHead>
                                    <TableHead className="h-8 text-[10px] font-bold text-right">
                                      Amount
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {version.payment_template_components &&
                                  version.payment_template_components.length >
                                    0 ? (
                                    version.payment_template_components.map(
                                      (comp) => (
                                        <TableRow
                                          key={comp.id}
                                          className="hover:bg-transparent"
                                        >
                                          <TableCell className="py-2.5">
                                            <div className="flex flex-col">
                                              <span className="font-medium text-sm">
                                                {comp.payment_fields
                                                  ?.display_name ||
                                                  comp.payment_fields?.name}
                                              </span>
                                              <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                                {comp.payment_fields?.type}
                                              </span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right py-2.5 font-medium text-sm">
                                            ₹{roundToNearest(comp.amount || 0)}
                                          </TableCell>
                                        </TableRow>
                                      ),
                                    )
                                  ) : (
                                    <TableRow>
                                      <TableCell
                                        colSpan={2}
                                        className="text-center text-xs text-muted-foreground py-6 italic"
                                      >
                                        No custom components.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">
                              Statutory Configuration
                            </h4>
                            <div className="grid gap-2">
                              {[
                                {
                                  label: "EPF",
                                  data: version.payment_statutory_components
                                    ?.pf,
                                },
                                {
                                  label: "ESIC",
                                  data: version.payment_statutory_components
                                    ?.esi,
                                },
                                {
                                  label: "PT",
                                  data: version.payment_statutory_components
                                    ?.pt,
                                },
                                {
                                  label: "Bonus",
                                  data: version.payment_statutory_components
                                    ?.bonus,
                                },
                                {
                                  label: "LWF",
                                  data: version.payment_statutory_components
                                    ?.lwf,
                                },
                              ].map((stat) => (
                                <div
                                  key={stat.label}
                                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                                >
                                  <span className="text-sm font-semibold">
                                    {stat.label}
                                  </span>
                                  {stat.data ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-background font-bold border-primary/20"
                                    >
                                      {stat.data.name || "Configured"}
                                    </Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground font-medium italic">
                                      Not applicable
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-8 pt-4 border-t text-[9px] text-muted-foreground flex justify-between items-center italic">
                          <span>Version ID: {version.id}</span>
                          <span>
                            Created:{" "}
                            {version.created_at
                              ? formatDate(version.created_at)
                              : "—"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
