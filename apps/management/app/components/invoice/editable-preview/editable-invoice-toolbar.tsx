import { Button } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import { Label } from "@canny_ecosystem/ui/label";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Spinner } from "@canny_ecosystem/ui/spinner";
import type { EditableInvoiceState } from "./types";

interface EditableInvoiceToolbarProps {
  viewMode: "edit" | "pdf";
  onViewModeChange: (mode: "edit" | "pdf") => void;
  state: EditableInvoiceState;
  onChange: (updates: Partial<EditableInvoiceState>) => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
  isSaving: boolean;
  isDirty: boolean;
  canEdit: boolean;
}

export function EditableInvoiceToolbar({
  viewMode,
  onViewModeChange,
  state,
  onChange,
  onSave,
  onReset,
  onClose,
  onDownload,
  onPrint,
  isSaving,
  isDirty,
  canEdit,
}: EditableInvoiceToolbarProps) {
  return (
    <header aria-label="Invoice Preview Toolbar" className="sticky top-0 z-20 flex flex-col gap-2.5 border-b bg-background/95 backdrop-blur px-4 py-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: View Mode Switcher */}
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
            <button
              type="button"
              onClick={() => onViewModeChange("edit")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs sm:text-sm font-medium transition-all gap-1.5 cursor-pointer",
                viewMode === "edit"
                  ? "bg-background text-foreground shadow-xs"
                  : "hover:text-foreground",
              )}
            >
              <Icon name="edit" className="h-3.5 w-3.5" />
              <span>Document Editor</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("pdf")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs sm:text-sm font-medium transition-all gap-1.5 cursor-pointer",
                viewMode === "pdf"
                  ? "bg-background text-foreground shadow-xs"
                  : "hover:text-foreground",
              )}
            >
              <Icon name="report" className="h-3.5 w-3.5" />
              <span>PDF Preview</span>
            </button>
          </div>

          {isDirty && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 animate-pulse">
              Unsaved Changes
            </span>
          )}
        </div>

        {/* Right: Actions (Save, Reset, Close) */}
        <div className="flex items-center gap-2">

          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={!isDirty || isSaving}
                className="text-xs h-8"
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={onSave}
                disabled={!isDirty || isSaving}
                className="text-xs h-8 flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <>
                    <Spinner className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Icon name="check" className="h-3.5 w-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <Icon name="cross" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Settings Bar: Header, Sign/Stamp, GST, Service Charge Rate */}
      {viewMode === "edit" && canEdit && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-2 text-xs text-muted-foreground bg-muted/30 -mx-4 -mb-3 px-4 py-2">
          {/* Header Toggle */}
          <div className="flex items-center space-x-1.5">
            <Checkbox
              id="include_header_toggle"
              checked={state.include_header}
              onCheckedChange={(checked) =>
                onChange({ include_header: Boolean(checked) })
              }
            />
            <Label
              htmlFor="include_header_toggle"
              className="cursor-pointer text-xs font-normal select-none"
            >
              Letterhead Header & Footer
            </Label>
          </div>

          {/* Stamp & Signature Toggle */}
          <div className="flex items-center space-x-1.5">
            <Checkbox
              id="include_sign_stamp_toggle"
              checked={state.include_sign_stamp}
              onCheckedChange={(checked) =>
                onChange({ include_sign_stamp: Boolean(checked) })
              }
            />
            <Label
              htmlFor="include_sign_stamp_toggle"
              className="cursor-pointer text-xs font-normal select-none"
            >
              Stamp & Signature
            </Label>
          </div>

          {/* Taxes Toggles */}
          <div className="h-3.5 w-px bg-border hidden sm:block" />

          <div className="flex items-center space-x-1.5">
            <Checkbox
              id="include_cgst_toggle"
              checked={state.include_cgst}
              onCheckedChange={(checked) => {
                const nextCgst = Boolean(checked);
                onChange({
                  include_cgst: nextCgst,
                  include_sgst: nextCgst ? true : state.include_sgst,
                  include_igst: nextCgst ? false : state.include_igst,
                });
              }}
            />
            <Label
              htmlFor="include_cgst_toggle"
              className="cursor-pointer text-xs font-normal select-none"
            >
              CGST (9%)
            </Label>
          </div>

          <div className="flex items-center space-x-1.5">
            <Checkbox
              id="include_sgst_toggle"
              checked={state.include_sgst}
              onCheckedChange={(checked) => {
                const nextSgst = Boolean(checked);
                onChange({
                  include_sgst: nextSgst,
                  include_cgst: nextSgst ? true : state.include_cgst,
                  include_igst: nextSgst ? false : state.include_igst,
                });
              }}
            />
            <Label
              htmlFor="include_sgst_toggle"
              className="cursor-pointer text-xs font-normal select-none"
            >
              SGST (9%)
            </Label>
          </div>

          <div className="flex items-center space-x-1.5">
            <Checkbox
              id="include_igst_toggle"
              checked={state.include_igst}
              onCheckedChange={(checked) => {
                const nextIgst = Boolean(checked);
                onChange({
                  include_igst: nextIgst,
                  include_cgst: nextIgst ? false : state.include_cgst,
                  include_sgst: nextIgst ? false : state.include_sgst,
                });
              }}
            />
            <Label
              htmlFor="include_igst_toggle"
              className="cursor-pointer text-xs font-normal select-none"
            >
              IGST (18%)
            </Label>
          </div>

          <div className="h-3.5 w-px bg-border hidden sm:block" />

          {/* Service Charge Rate Input */}
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="charge_rate_input"
              className="text-xs font-normal whitespace-nowrap"
            >
              Service Charge %:
            </Label>
            <Input
              id="charge_rate_input"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={state.charge_amount || 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange({
                  charge_amount: isNaN(val) ? 0 : val,
                  include_charge: val > 0,
                });
              }}
              className="h-6 w-16 px-1.5 py-0 text-xs text-center"
            />
          </div>
        </div>
      )}
    </header>
  );
}
