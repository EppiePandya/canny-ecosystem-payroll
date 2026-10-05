import { Button, buttonVariants } from "@canny_ecosystem/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@canny_ecosystem/ui/alert-dialog";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Combobox,
  type ComboboxSelectOption,
} from "@canny_ecosystem/ui/combobox";
import { useState } from "react";
import { GenerateLetterLoader } from "./generate-bulk-letters-dialog";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import { getLettersByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useCompanyId } from "@/utils/company";
import { DropdownMenuItem } from "@canny_ecosystem/ui/dropdown-menu";
import { BulkSalaryAssignmentDialog } from "./salary/bulk-salary-assignment-dialog";
import { DownloadDocumentsDialog } from "./download-documents-dialog";
import { GenerateStatutoryFormsDialog } from "./generate-statutory-forms-dialog";
import { DownloadSalarySlipsDialog } from "./download-salary-slips-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { Form16Dialog } from "./form-16-dialog";

export function EmployeesLetterMenu({
  selectedRows,
  className,
  env,
}: {
  selectedRows: any[];
  className?: string;
  env: SupabaseEnv;
}) {
  const [selectedLetter, setSelectedLetter] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "word">("pdf");
  const [dateSource, setDateSource] = useState<
    "joining_date" | "exit_date" | "custom"
  >("custom");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [downloadDocsDialogOpen, setDownloadDocsDialogOpen] = useState(false);
  const [salarySlipsDialogOpen, setSalarySlipsDialogOpen] = useState(false);
  const [statutoryFormsDialogOpen, setStatutoryFormsDialogOpen] =
    useState(false);
  const [form16Open, setForm16Open] = useState(false);
  const [resetKey, setResetKey] = useState(Date.now());
  const { toast } = useToast();

  const { companyId } = useCompanyId();
  const { supabase } = useSupabase({ env });

  const [letterOptions, setLetterOptions] = useState<ComboboxSelectOption[]>(
    [],
  );

  async function fetchAndDownload() {
    const letterId = selectedLetter;
    const employeeIds = selectedRows.map((e) => e.id).join(",");

    try {
      const formData = new FormData();
      formData.append("letterId", letterId);
      formData.append("employeeIds", employeeIds);
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
          description: errorData?.message || "Failed to generate letters",
        });
        setDialogOpen(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      const contentDisposition = res.headers.get("Content-Disposition");
      const downloadedLetterCount = res.headers.get("X-Employee-Count");
      let fileName = "letters.zip";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match?.[1]) fileName = match[1];
      }
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      const generatedCount = Number.parseInt(downloadedLetterCount ?? "0", 10);
      const requestedCount = selectedRows.length;
      const skippedCount = requestedCount - generatedCount;

      toast({
        title: "Success",
        description: `${
          skippedCount > 0
            ? ` ${skippedCount} employee(s) were skipped due to inactive status or missing work details.`
            : "Letters Generated Successfully"
        }`,
      });
      setResetKey(Date.now());
    } catch (error) {
      console.error(error);

      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      });
    }

    setDialogOpen(false);
  }

  async function fetchAndDownloadIdCards() {
    if (!selectedRows.length) return;

    try {
      const formData = new FormData();
      formData.append("employeeIds", selectedRows.map((e) => e.id).join(","));

      const res = await fetch("/employees/id-cards/generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: errorData?.message || "Failed to generate ID Cards",
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      const contentDisposition = res.headers.get("Content-Disposition");
      let fileName = "id_cards.pdf";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match?.[1]) fileName = match[1];
      }

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Successfully generated ID Cards.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      });
    }
  }

  async function fetchLetters() {
    try {
      const { data, error } = await getLettersByCompanyId({
        supabase,
        companyId: companyId!,
      });
      if (!data || error) throw new Error("Failed to fetch letters");

      setLetterOptions(
        data?.map((letter) => ({
          value: letter.id,
          label: letter.letter_name,
          pseudoLabel: letter.subject,
        })) || [],
      );
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch letters",
      });
      return { data: [] };
    }
  }

  return (
    <AlertDialog key={resetKey + 1}>
      <DropdownMenu>
        <DropdownMenuTrigger
          asChild
          className={cn(!selectedRows.length && "hidden", className)}
        >
          <Button variant="muted" size="icon" className="h-10 w-[2.5rem]">
            <Icon name="dots-vertical" className="h-[18px] w-[18px] " />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent sideOffset={10} align="end">
          <DropdownMenuItem
            className="flex items-center gap-2 font-semibold"
            onSelect={() => setSalaryDialogOpen(true)}
            disabled={!selectedRows.length}
          >
            <Icon name="rupees" className="h-4 w-4" />
            Assign Bulk Salary
          </DropdownMenuItem>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full px-2 flex flex-row justify-start gap-2"
              onClick={async () => {
                if (letterOptions.length) return;
                await fetchLetters();
              }}
            >
              <Icon name="plus-circled" />
              Create Letters
            </Button>
          </AlertDialogTrigger>
          <DropdownMenuItem
            className="flex items-center gap-2 font-semibold"
            onClick={() => {
              if (selectedRows.length !== 1) {
                toast({
                  variant: "destructive",
                  title: "Info",
                  description: "Please select exactly one employee to generate Form 16.",
                });
                return;
              }
              setForm16Open(true);
            }}
          >
            <Icon name="briefcase" className="h-4 w-4" />
            Create Form 16
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 font-semibold"
            onClick={fetchAndDownloadIdCards}
          >
            <Icon name="card" className="h-4 w-4" />
            Export ID Cards
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 font-semibold"
            onClick={() => setDownloadDocsDialogOpen(true)}
          >
            <Icon name="download" className="h-4 w-4" />
            Download Documents
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 font-semibold"
            onClick={() => setSalarySlipsDialogOpen(true)}
          >
            <Icon name="download" className="h-4 w-4" />
            Download Salary Slips
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 font-semibold"
            onClick={() => setStatutoryFormsDialogOpen(true)}
          >
            <Icon name="briefcase" className="h-4 w-4" />
            Generate Statutory Forms
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create Letters</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Selected employees: <b>{selectedRows.length}</b>
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
              onValueChange={(value: "joining_date" | "exit_date" | "custom") =>
                setDateSource(value)
              }
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
              Each employee's letter will be dated with their individual <b>Joining Date</b> (falls back to today if not recorded).
            </p>
          )}

          {dateSource === "exit_date" && (
            <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-border/50">
              Each employee's letter will be dated with their individual <b>Exit Date</b> (falls back to today if not recorded).
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Download Format</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="bulk-format"
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
                  name="bulk-format"
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
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedLetter}
            className={cn(buttonVariants({ variant: "ghost" }))}
            onClick={() => {
              setDialogOpen(true);
              fetchAndDownload();
            }}
            onSelect={() => {
              setDialogOpen(true);
              fetchAndDownload();
            }}
          >
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>

      <GenerateLetterLoader open={dialogOpen} />
      <BulkSalaryAssignmentDialog
        selectedRows={selectedRows}
        env={env}
        open={salaryDialogOpen}
        onOpenChange={setSalaryDialogOpen}
      />
      <DownloadDocumentsDialog
        selectedRows={selectedRows}
        open={downloadDocsDialogOpen}
        onOpenChange={setDownloadDocsDialogOpen}
      />
      <GenerateStatutoryFormsDialog
        selectedRows={selectedRows}
        env={env}
        open={statutoryFormsDialogOpen}
        onOpenChange={setStatutoryFormsDialogOpen}
      />
      <DownloadSalarySlipsDialog
        selectedRows={selectedRows}
        open={salarySlipsDialogOpen}
        onOpenChange={setSalarySlipsDialogOpen}
      />
      {selectedRows.length === 1 && (
        <Form16Dialog
          open={form16Open}
          onClose={() => setForm16Open(false)}
          employee={{
            id: selectedRows[0].id,
            is_active: selectedRows[0].is_active,
            companyId: companyId || "",
          }}
        />
      )}
    </AlertDialog>
  );
}
