import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@canny_ecosystem/ui/dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { getSitesByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useCompanyId } from "@/utils/company";
import type { TypedSupabaseClient } from "@canny_ecosystem/supabase/types";
import { MultiSelectCombobox } from "@canny_ecosystem/ui/multi-select-combobox";
import { useNavigate } from "@remix-run/react";

export function SiteSelectorDialog({
  payrollId,
  supabase,
}: {
  payrollId: string;
  supabase: TypedSupabaseClient;
}) {
  const { companyId } = useCompanyId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);

  async function fetchSites() {
    if (sites.length) return;

    try {
      setLoading(true);

      const { data, error } = await getSitesByCompanyId({
        supabase,
        companyId: companyId!,
      });

      if (error) throw error;

      setSites(data || []);
    } catch (error) {
      console.error("Failed to fetch sites", error);
    } finally {
      setLoading(false);
    }
  }

  function handleOk() {
    const basePath = `/payroll/run-payroll/${payrollId}`;

    const query = new URLSearchParams({
      siteIds: selectedSites.join(","),
    });

    navigate(`${basePath}?${query.toString()}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        setOpen(state);
        if (state) fetchSites();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "primary-outline" }),
            "border border-primary/60 flex-1 w-full justify-between",
          )}
        >
          Select Site {selectedSites.length > 0 && `(${selectedSites.length})`}
          <span className="text-sm opacity-70">▾</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Sites</DialogTitle>
        </DialogHeader>

        {loading && <div className="py-6 text-center">Loading sites...</div>}

        {!loading && (
          <MultiSelectCombobox
            label="Sites"
            options={sites.map((site) => ({
              label: site.name,
              value: String(site.id),
            }))}
            value={selectedSites}
            onChange={setSelectedSites}
            renderItem={(option) => <div>{option.label}</div>}
            renderSelectedItem={(values) => (
              <div className="flex gap-1 flex-wrap">
                {values
                  .map((v) => sites.find((s) => String(s.id) === v)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          />
        )}

        <div className="flex justify-end mt-6">
          <button type="button" className={buttonVariants()} onClick={handleOk}>
            OK
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
