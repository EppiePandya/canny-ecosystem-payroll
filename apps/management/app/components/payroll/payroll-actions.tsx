import type {
  PayrollDatabaseRow,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { Button, buttonVariants } from "@canny_ecosystem/ui/button";
import { getMonthNameFromNumber } from "@canny_ecosystem/utils";
import { MissingPayrollModal } from "./missing-payroll-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useNavigate } from "@remix-run/react";
import { DownloadBankAdvice } from "./download-bank-advice";
import { DownloadEsiFormat } from "./download-esi-format";
import { DownloadEpfFormat } from "./download-epf-format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { Label } from "@canny_ecosystem/ui/label";
import {
  Combobox,
  type ComboboxSelectOption,
} from "@canny_ecosystem/ui/combobox";
import { useState } from "react";
import { useUser } from "@/utils/user";

export function PayrollActions({
  payrollId,
  className,
  env,
  data,
  fromWhere,
  status,
  allLocationOptions,
  payrollData,
  selectedProjectNames = [],
  missingEmployees = [],
}: {
  data: any[];
  env: SupabaseEnv;
  payrollId: string;
  className?: string;
  fromWhere: "runpayroll" | "payrollhistory";
  status: string;
  payrollData: Omit<PayrollDatabaseRow, "created_at"> & {
    site?: { name: string } | null;
    project?: { name: string } | null;
  };
  allLocationOptions: ComboboxSelectOption[];
  selectedProjectNames?: string[];
  missingEmployees?: any[];
}) {
  const [locations, setLocations] = useState("");
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const newParams = new URLSearchParams();
  const navigate = useNavigate();
  const { role } = useUser();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="muted"
            size="icon"
            className={cn(
              "h-10 w-12 px-2 bg-muted border border-input",
              className,
            )}
          >
            <Icon name="dots-vertical" className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          sideOffset={10}
          align="end"
          className="flex flex-row"
        >
          <div className="flex flex-col">
            <div>
              <Button
                variant={"ghost"}
                className={cn("px-2 w-full flex flex-row justify-start gap-2 ")}
                onClick={() =>
                  navigate(`/payroll/run-payroll/${payrollId}/create-invoice`)
                }
              >
                <Icon name="plus-circled" />
                Create Invoice
              </Button>
            </div>

            {status !== "approved" && (
              <div>
                <Button
                  variant={"ghost"}
                  className={cn(
                    "w-full flex flex-row justify-start gap-2 px-2 text-amber-600 dark:text-amber-400 font-semibold",
                  )}
                  onClick={() => setIsMissingModalOpen(true)}
                >
                  <Icon name="info" />
                  Remaining Employees ({missingEmployees.length})
                </Button>
              </div>
            )}

            {role !== "executive" && (
              <DropdownMenuSeparator
                className={cn(
                  "flex",
                  role === "executive" && "hidden",
                )}
              />
            )}

            <Button
              variant={"ghost"}
              className={cn(
                "w-full px-2",
                role === "executive" && "hidden",
              )}
            >
              <DownloadBankAdvice
                env={env}
                data={data}
                selectedProjectNames={selectedProjectNames}
              />
            </Button>

            <Button
              variant={"ghost"}
              className={cn(
                "w-full px-2",
                role === "executive" && "hidden",
              )}
            >
              <DownloadEpfFormat env={env} data={data} />
            </Button>

            <Button
              variant={"ghost"}
              className={cn(
                "w-full px-2",
                role === "executive" && "hidden",
              )}
            >
              <DownloadEsiFormat
                env={env}
                data={data}
                payrollData={payrollData}
              />
            </Button>

            <Button
              variant={"ghost"}
              className={cn(
                "w-full px-2 flex flex-row justify-start items-center gap-2",
                role === "executive" && "hidden",
              )}
              onClick={() =>
                fromWhere.toLowerCase() === "runpayroll"
                  ? navigate(`/payroll/run-payroll/${payrollId}/salary-slips`)
                  : navigate(
                      `/payroll/payroll-history/${payrollId}/salary-slips`,
                    )
              }
            >
              <Icon name="import" />
              <p>Download Bulk Salary Slips</p>
            </Button>

            <div>
              <AlertDialog>
                <AlertDialogTrigger
                  className={cn("w-full", role === "executive" && "hidden")}
                >
                  <Button
                    variant={"ghost"}
                    className={cn(
                      "w-full flex flex-row justify-start items-center gap-2 px-2",
                    )}
                  >
                    <Icon name="import" />
                    <p>Download Salary Register</p>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Select Company Locations
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Select Company Locations here
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex flex-col gap-1">
                    <Label className="text-sm font-medium">Locations</Label>
                    <Combobox
                      options={allLocationOptions}
                      value={locations}
                      onChange={(e) => setLocations(e)}
                    />
                  </div>

                  <AlertDialogFooter className="pt-2">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className={cn(buttonVariants({ variant: "default" }))}
                      onClick={() => {
                        newParams.set("location", locations);
                        fromWhere.toLowerCase() === "runpayroll"
                          ? navigate(
                              `/payroll/run-payroll/${payrollId}/salary-register?${newParams.toString()}`,
                            )
                          : navigate(
                              `/payroll/payroll-history/${payrollId}/salary-register?${newParams.toString()}`,
                            );
                      }}
                    >
                      Set
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <MissingPayrollModal
        isOpen={isMissingModalOpen}
        onOpenChange={setIsMissingModalOpen}
        missingEmployees={missingEmployees}
        month={getMonthNameFromNumber(payrollData.month ?? 0)}
        year={String(payrollData.year ?? "")}
      />
    </>
  );
}
