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
import { getProjectsByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useCompanyId } from "@/utils/company";
import type { TypedSupabaseClient } from "@canny_ecosystem/supabase/types";
import { MultiSelectCombobox } from "@canny_ecosystem/ui/multi-select-combobox";
import { useNavigate } from "@remix-run/react";

export function ProjectSelectorDialog({
  payrollId,
  supabase,
  className,
}: {
  payrollId: string;
  supabase: TypedSupabaseClient;
  className?: string;
}) {
  const { companyId } = useCompanyId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  async function fetchProjects() {
    if (projects.length) return;

    try {
      setLoading(true);

      const { data, error } = await getProjectsByCompanyId({
        supabase,
        companyId: companyId!,
      });

      if (error) throw error;

      setProjects(data || []);
    } catch (error) {
      console.error("Failed to fetch projects", error);
    } finally {
      setLoading(false);
    }
  }

  function handleOk() {
    const basePath = `/payroll/run-payroll/${payrollId}`;

    const query = new URLSearchParams({
      projectIds: selectedProjects.join(","),
    });

    navigate(`${basePath}?${query.toString()}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        setOpen(state);
        if (state) fetchProjects();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "primary-outline" }),
            "border border-primary/60 flex-1 w-full justify-between",
            className,
          )}
        >
          Select Project{" "}
          {selectedProjects.length > 0 && `(${selectedProjects.length})`}
          <span className="text-sm opacity-70">▾</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Projects</DialogTitle>
        </DialogHeader>

        {loading && <div className="py-6 text-center">Loading projects...</div>}

        {!loading && (
          <MultiSelectCombobox
            label="Projects"
            options={projects.map((project) => ({
              label: project.name,
              value: String(project.id),
            }))}
            value={selectedProjects}
            onChange={setSelectedProjects}
            renderItem={(option) => <div>{option.label}</div>}
            renderSelectedItem={(values) => (
              <div className="flex gap-1 flex-wrap">
                {values
                  .map((v) => projects.find((p) => String(p.id) === v)?.name)
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
