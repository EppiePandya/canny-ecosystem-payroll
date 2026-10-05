import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useSubmit } from "@remix-run/react";
import { DeleteEmployee } from "./delete-employee";
import {
  createRole,
  deleteRole,
  hasPermission,
  updateRole,
} from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useState } from "react";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";
import {
  Combobox,
  type ComboboxSelectOption,
} from "@canny_ecosystem/ui/combobox";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { GenerateLetterLoader } from "./generate-bulk-letters-dialog";
import { getLettersByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { Form16Dialog } from "./form-16-dialog";

export const EmployeeOptionsDropdown = ({
  employee,
  triggerChild,
  env,
}: {
  employee: {
    id: string;
    is_active: boolean;
    returnTo?: string;
    companyId: string;
  };
  triggerChild: React.ReactElement;
  env: SupabaseEnv;
}) => {
  const submit = useSubmit();
  const { role } = useUser();
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [createLetterOpen, setCreateLetterOpen] = useState(false);
  const [form16Open, setForm16Open] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "word">("pdf");
  const [dateSource, setDateSource] = useState<
    "joining_date" | "exit_date" | "custom"
  >("custom");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [letterOptions, setLetterOptions] = useState<ComboboxSelectOption[]>(
    [],
  );
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
  const { supabase } = useSupabase({ env });

  async function handleDownloadIdCard() {
    setIsDownloading(true);
    try {
      const formData = new FormData();
      formData.append("employeeIds", employee.id);

      const res = await fetch("/employees/id-cards/generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to generate ID Card");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "id_card.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate ID Card",
      });
    }
    setIsDownloading(false);
  }

  const handleMarkAsActive = () => {
    submit(
      {
        id: employee.id,
        is_active: true,
        returnTo: employee.returnTo ?? "/employees",
      },
      {
        method: "POST",
        action: `/employees/${employee.id}/update-active`,
      },
    );
  };

  const handleMarkAsInactive = () => {
    submit(
      {
        id: employee.id,
        is_active: false,
        returnTo: employee.returnTo ?? "/employees",
      },
      {
        method: "POST",
        action: `/employees/${employee.id}/update-active`,
      },
    );
  };

  const handleIncident = () => {
    submit(
      {
        id: employee.id,
      },
      {
        method: "POST",
        action: `/events/incidents/${employee.id}/create-incident`,
      },
    );
  };
  const handleAttendance = () => {
    submit(
      {
        id: employee.id,
      },
      {
        method: "POST",
        action: `/employees/${employee.id}/add-attendance`,
      },
    );
  };

  async function fetchLetters() {
    try {
      const { data, error } = await getLettersByCompanyId({
        supabase,
        companyId: employee.companyId,
      });
      if (!data || error) throw new Error("Failed to fetch letters");

      setLetterOptions(
        data.map((letter) => ({
          value: letter.id,
          label: letter.letter_name,
          pseudoLabel: letter.subject,
        })),
      );
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch letters",
      });
    }
  }

  async function handleCreateLetter() {
    setCreateLetterOpen(false);
    setIsGeneratingLetter(true);
    try {
      const formData = new FormData();
      formData.append("letterId", selectedLetter);
      formData.append("employeeIds", employee.id);
      formData.append("format", selectedFormat);
      formData.append("dateSource", dateSource);
      formData.append("letterDate", selectedDate);

      const res = await fetch("/employees/letters/generate-bulk", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: errorData?.message || "Failed to generate letter",
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = res.headers.get("Content-Disposition");
      let fileName = "letter.pdf";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match?.[1]) fileName = match[1];
      }
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: "Success", description: "Letter generated successfully" });
      setSelectedLetter("");
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      });
    } finally {
      setIsGeneratingLetter(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        {triggerChild}
        <DropdownMenuContent sideOffset={10} align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              className={cn(
                employee.is_active && "hidden",
                !hasPermission(role, `${updateRole}:${attribute.employees}`) &&
                "hidden",
              )}
              onClick={handleMarkAsActive}
            >
              Make as Active
            </DropdownMenuItem>
            <DropdownMenuItem
              className={cn(
                !employee.is_active && "hidden",
                !hasPermission(role, `${updateRole}:${attribute.employees}`) &&
                "hidden",
              )}
              onClick={handleMarkAsInactive}
            >
              Make as Inactive
            </DropdownMenuItem>
            <DropdownMenuSeparator
              className={cn(
                !hasPermission(role, `${updateRole}:${attribute.employees}`) &&
                !hasPermission(
                  role,
                  `${deleteRole}:${attribute.employees}`,
                ) &&
                "hidden",
              )}
            />
            <DropdownMenuItem
              className={cn(
                !hasPermission(role, `${createRole}:${attribute.incidents}`) &&
                "hidden",
              )}
              onClick={handleIncident}
            >
              Report Incident
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn(
                !hasPermission(role, `${createRole}:${attribute.incidents}`) &&
                "hidden",
              )}
              onClick={handleAttendance}
            >
              Add Attendance
            </DropdownMenuItem>
            <DropdownMenuSeparator
              className={cn(
                "hidden",
                hasPermission(role, `${deleteRole}:${attribute.incidents}`) &&
                "flex",
              )}
            />
            <DropdownMenuItem
              onClick={handleDownloadIdCard}
              disabled={isDownloading}
            >
              {isDownloading ? "Generating..." : "Generate ID Card"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                if (!letterOptions.length) await fetchLetters();
                setCreateLetterOpen(true);
              }}
            >
              Create Letter
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setForm16Open(true);
              }}
            >
              Create Form 16
            </DropdownMenuItem>
            <DropdownMenuSeparator
              className={cn(
                "hidden",
                hasPermission(role, `${deleteRole}:${attribute.incidents}`) &&
                "flex",
              )}
            />
            <DeleteEmployee employeeId={employee.id} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={createLetterOpen} onOpenChange={setCreateLetterOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Letter</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Generate a letter for this employee.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Letter Template</label>
              <Combobox
                className="w-full"
                dialogClassName="w-max"
                options={letterOptions}
                value={selectedLetter}
                onChange={(value) => setSelectedLetter(value)}
                placeholder="Select a letter template"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Letter Date</label>
              <Select
                value={dateSource}
                onValueChange={(
                  value: "joining_date" | "exit_date" | "custom",
                ) => setDateSource(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Date Option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Manual / Specific Date</SelectItem>
                  <SelectItem value="joining_date">
                    Employee Joining Date
                  </SelectItem>
                  <SelectItem value="exit_date">
                    Employee Exit Date
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateSource === "custom" && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Select Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}

            {dateSource === "joining_date" && (
              <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-border/50">
                Letter will be dated with the employee's <b>Joining Date</b> (falls back to today if not recorded).
              </p>
            )}

            {dateSource === "exit_date" && (
              <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-border/50">
                Letter will be dated with the employee's <b>Exit Date</b> (falls back to today if not recorded).
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Download Format</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="single-format"
                    value="pdf"
                    checked={selectedFormat === "pdf"}
                    onChange={() => setSelectedFormat("pdf")}
                    className="accent-primary"
                  />
                  <span className="text-sm">PDF</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="single-format"
                    value="word"
                    checked={selectedFormat === "word"}
                    onChange={() => setSelectedFormat("word")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Word (.docx)</span>
                </label>
              </div>
            </div>
          </div>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel
              type="button"
              onClick={() => {
                setCreateLetterOpen(false);
                setSelectedLetter("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedLetter}
              className={cn(buttonVariants({ variant: "ghost" }))}
              onClick={handleCreateLetter}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GenerateLetterLoader open={isGeneratingLetter} />

      <Form16Dialog
        open={form16Open}
        onClose={() => setForm16Open(false)}
        employee={employee}
      />
    </>
  );
};
