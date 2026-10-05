import { Card } from "@canny_ecosystem/ui/card";
import { Link } from "@remix-run/react";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import type { EmployeeExitRow } from "@canny_ecosystem/supabase/types";
import {
  createRole,
  deleteRole,
  formatDate,
  hasPermission,
  replaceUnderscore,
  updateRole,
  exitLetterTypesArray,
} from "@canny_ecosystem/utils";
import { useUser } from "@/utils/user";
import { attribute } from "@canny_ecosystem/utils/constant";
import { ExitsDropdown } from "../exits-dropdown";
import { DropdownMenuTrigger } from "@canny_ecosystem/ui/dropdown-menu";
import { DeathExitDropdown } from "../death-exit-dropdown";

import { useState } from "react";
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
import { getLettersByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import { useCompanyId } from "@/utils/company";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import type { SupabaseEnv } from "@canny_ecosystem/supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { GenerateLetterLoader } from "../generate-bulk-letters-dialog";
type DetailItemProps = {
  label: string;
  value?: string | null;
  linkText?: string;
  to?: string;
  onClick?: () => void;
};

const DetailItem: React.FC<DetailItemProps> = ({
  label,
  value,
  linkText,
  to,
  onClick,
}) => {
  return (
    <div className="flex flex-col items-start min-w-0">
      <h3 className="text-muted-foreground text-[13px] tracking-wide capitalize truncate w-full">
        {label}
      </h3>

      {to ? (
        <Link
          to={to}
          className="text-primary cursor-pointer truncate w-full hover:underline"
        >
          {linkText}
        </Link>
      ) : onClick ? (
        <span
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          }}
          className="text-primary cursor-pointer truncate w-80 hover:underline hover:text-primary/80"
        >
          {linkText}
        </span>
      ) : (
        <p className="truncate w-full">{value ?? "--"}</p>
      )}
    </div>
  );
};

const booleanToText = (value?: boolean | null) =>
  value === true ? "Yes" : value === false ? "No" : "--";

export const EmployeeExitItem = ({
  exitsData,
  employeeId,
  env,
}: {
  exitsData: Omit<EmployeeExitRow, "created_at">;
  employeeId: string;
  env: SupabaseEnv;
}) => {
  const [createLetterOpen, setCreateLetterOpen] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "word">("pdf");
  const [dateSource, setDateSource] = useState<
    "joining_date" | "exit_date" | "custom"
  >("exit_date");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [letterOptions, setLetterOptions] = useState<ComboboxSelectOption[]>(
    [],
  );
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
  const { toast } = useToast();
  const { companyId } = useCompanyId();
  const { supabase } = useSupabase({ env });

  const siteProjectLabel = exitsData.work_details
    ? `${exitsData.work_details.sites?.name ?? "--"} — ${exitsData.work_details.sites?.projects?.name ?? "--"}`
    : "--";

  async function fetchLetters() {
    try {
      const { data, error } = await getLettersByCompanyId({
        supabase,
        companyId: companyId!,
      });
      if (!data || error) throw new Error("Failed to fetch letters");
      setLetterOptions(
        data
          .filter((letter) =>
            exitLetterTypesArray.includes(letter.letter_type as any),
          )
          .map((letter) => ({
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
      formData.append("employeeIds", employeeId);
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
      <section className="w-full select-text cursor-auto h-full flex flex-col justify-start p-4">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <li>
            <DetailItem
              label="Last Working Day"
              value={formatDate(exitsData?.last_working_day)}
            />
          </li>

          <li>
            <DetailItem
              label="ESIC Exit Date"
              value={
                exitsData?.esic_exit_date
                  ? formatDate(exitsData.esic_exit_date)
                  : "--"
              }
            />
          </li>

          <li>
            <DetailItem
              label="Exit Reason"
              value={replaceUnderscore(exitsData.exit_reason)}
            />
          </li>

          <li>
            <DetailItem label="Note" value={exitsData.note} />
          </li>

          <li>
            <DetailItem
              label="Gratuity Document(1)"
              linkText="Gratuity Form I"
              to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exitsData.id}/gratuity-form-i`}
            />
          </li>
          <li>
            <DetailItem
              label="Gratuity Document(2)"
              linkText="Gratuity Form L"
              to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exitsData.id}/gratuity-form-l`}
            />
          </li>
          <li>
            <DetailItem
              label="Gratuity Document(3)"
              linkText="Full & Final Form"
              to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exitsData.id}/full-and-final-form`}
            />
          </li>
          <li>
            <DetailItem
              label="Download Letters"
              linkText="Create Letter"
              onClick={async () => {
                if (!letterOptions.length) await fetchLetters();
                setCreateLetterOpen(true);
              }}
            />
          </li>
        </ul>
      </section>

      <AlertDialog open={createLetterOpen} onOpenChange={setCreateLetterOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Letter</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Generate an exit letter for this employee.
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
                  <SelectItem value="exit_date">
                    Employee Exit Date
                  </SelectItem>
                  <SelectItem value="joining_date">
                    Employee Joining Date
                  </SelectItem>
                  <SelectItem value="custom">Manual / Specific Date</SelectItem>
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

            {dateSource === "exit_date" && (
              <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-border/50">
                Letter will be dated with the employee's <b>Exit Date</b> (falls back to today if not recorded).
              </p>
            )}

            {dateSource === "joining_date" && (
              <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-border/50">
                Letter will be dated with the employee's <b>Joining Date</b> (falls back to today if not recorded).
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Download Format</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="exit-format"
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
                    name="exit-format"
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
    </>
  );
};

export const EmployeeExitsCard = ({
  exitsData,
  employeeId,
  env,
}: {
  exitsData:
  | Omit<EmployeeExitRow, "created_at">
  | Omit<EmployeeExitRow, "created_at">[]
  | null
  | undefined;
  deathExit?: any[] | null;
  employeeId: string;
  env: SupabaseEnv;
}) => {
  const { role } = useUser();

  const exitsArray = Array.isArray(exitsData)
    ? exitsData
    : exitsData
      ? [exitsData]
      : [];

  return (
    <Card className="rounded w-full h-full p-4 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Exits</h2>
        <div className="flex gap-2">
          {exitsArray.length > 0 && (
            <>
              <Link
                to={`/employees/${employeeId}/payments/${exitsArray[0].id}/update-employee-exit`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "bg-card",
                  !hasPermission(
                    `${role}` as any,
                    `${updateRole}:${attribute.employeeExit}`,
                  ) && "hidden",
                )}
              >
                <Icon name="edit" className="mr-2" />
                Update
              </Link>

              <ExitsDropdown
                exitId={exitsArray[0].id}
                employeeId={employeeId}
                hasDeathExit={exitsArray.some((e) => !!e.death_exit)}
                triggerChild={
                  <DropdownMenuTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "bg-card",
                      !hasPermission(
                        `${role}` as any,
                        `${deleteRole}:${attribute.employeeExit}`,
                      ) && "hidden",
                    )}
                  >
                    <Icon name="dots-vertical" size="xs" /> <p>More Options</p>
                  </DropdownMenuTrigger>
                }
              />
            </>
          )}

          {exitsArray.length === 0 && (
            <Link
              to={`/employees/${employeeId}/payments/create-employee-exit`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "bg-card",
                !hasPermission(
                  `${role}` as any,
                  `${createRole}:${attribute.employeeExit}`,
                ) && "hidden",
              )}
            >
              <Icon name="plus-circled" className="mr-2" />
              Create
            </Link>
          )}
        </div>
      </div>

      {exitsArray.length === 0 ? (
        <div className="text-center py-6">Exit data not found</div>
      ) : (
        <div className="flex flex-col gap-6">
          {exitsArray.map((exit) => {
            const deathExitForThis = exit.death_exit;

            return (
              <div key={exit.id} className="flex flex-col gap-6">
                <EmployeeExitItem
                  exitsData={exit}
                  employeeId={employeeId}
                  env={env}
                />

                {deathExitForThis && (
                  <Card className="border shadow-none">
                    <div className="flex items-center justify-between px-4 py-3 ">
                      <h4 className="font-semibold">Death Exit Details</h4>

                      <div className="flex gap-3">
                        <Link
                          to={`/employees/${employeeId}/payments/${deathExitForThis.exit_id}/update-employee-death-exit`}
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "bg-card",
                            !hasPermission(
                              `${role}` as any,
                              `${updateRole}:${attribute.deathExit}`,
                            ) && "hidden",
                          )}
                        >
                          <Icon name="edit" className="mr-2" />
                          Update
                        </Link>

                        <DeathExitDropdown
                          exitId={deathExitForThis.exit_id}
                          employeeId={employeeId}
                          triggerChild={
                            <DropdownMenuTrigger
                              className={cn(
                                buttonVariants({ variant: "outline" }),
                                "bg-card",
                                !hasPermission(
                                  `${role}` as any,
                                  `${deleteRole}:${attribute.deathExit}`,
                                ) && "hidden",
                              )}
                            >
                              <Icon name="dots-vertical" size="xs" />{" "}
                              <p>More Options</p>
                            </DropdownMenuTrigger>
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-4">
                      <div className="flex flex-col">
                        <p className="text-muted-foreground text-[13px] tracking-wide">
                          Cause Of Death
                        </p>
                        <p>
                          {replaceUnderscore(
                            deathExitForThis.death_reason ?? "--",
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <p className="text-muted-foreground text-[13px] tracking-wide">
                          Date Of Death
                        </p>
                        <p>
                          {deathExitForThis.date_of_death
                            ? formatDate(deathExitForThis.date_of_death)
                            : "--"}
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <p className="text-muted-foreground text-[13px] tracking-wide">
                          On Duty (ESIC)
                        </p>
                        <p>{booleanToText(deathExitForThis.on_duty_esic)}</p>
                      </div>

                      <div className="flex flex-col">
                        <DetailItem
                          label="Death Form(1)"
                          linkText="EPF Form 5 & 10"
                          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/EPF_form_5_10`}
                        />
                      </div>
                      <div className="flex flex-col">
                        <DetailItem
                          label="Death Form(2)"
                          linkText="ESIC Claim(accident)"
                          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/ESIC_claim_form`}
                        />
                      </div>
                      <div className="flex flex-col">
                        <DetailItem
                          label="Death Form(3)"
                          linkText="Form 20_10D"
                          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/form_20_10D`}
                        />
                      </div>
                      <div className="flex flex-col">
                        <DetailItem
                          label="Death Form(4)"
                          linkText="LSM"
                          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/LSM`}
                        />
                      </div>
                      <div className="flex flex-col">
                        <DetailItem
                          label="Death Form(5)"
                          linkText="Particulars Of The Member"
                          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/particulars-member`}
                        />
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
