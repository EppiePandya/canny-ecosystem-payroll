import Papa from "papaparse";
import { useState, useEffect, useMemo } from "react";

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
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  calculateEmployerPfStatutoryBreakup,
  formatDateTime,
  roundToNearest,
} from "@canny_ecosystem/utils";
import type {
  SupabaseEnv,
  TypedSupabaseClient,
} from "@canny_ecosystem/supabase/types";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useSupabase } from "@canny_ecosystem/supabase/client";
import {
  getEmployeeStatutoryDetailsById,
  getEmployeeProvidentFundByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { useCompanyId } from "@/utils/company";
import { Label } from "@canny_ecosystem/ui/label";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";

export const prepareEpfFormat = async ({
  data,
  supabase,
  selectedEpf,
  selectedEpfFields,
}: {
  data: any[];
  supabase: TypedSupabaseClient;
  selectedEpf?: any;
  selectedEpfFields: string[];
}) => {
  const statutoryDetailsResults = await Promise.all(
    data.map(({ employee_id }) =>
      getEmployeeStatutoryDetailsById({ id: employee_id, supabase }),
    ),
  );

  const updatedData = data.map((entry, index) => ({
    ...entry,
    statutoryDetails: statutoryDetailsResults[index]?.data || null,
  }));

  const attendanceDate = new Date();
  attendanceDate.setMonth(attendanceDate.getMonth() - 1);

  const extractedData = updatedData.map((formatData) => {
    const baseAmount = Number(formatData?.amount) || 0;

    const isRestricted = selectedEpf
      ? selectedEpf.restrict_employee_contribution === true
      : false;

    const employeeRestrictValue = selectedEpf
      ? selectedEpf.employee_restrict_value
      : 15000;

    const employeeContribution = selectedEpf
      ? selectedEpf.employee_contribution
      : 0.12;

    const pfBreakup = calculateEmployerPfStatutoryBreakup({
      epfWageBase: baseAmount,
      statutoryPf: selectedEpf
        ? selectedEpf
        : {
            restrict_employer_contribution: isRestricted,
            employer_restrict_value: employeeRestrictValue,
          },
    });

    const epfContribution = roundToNearest(
      (pfBreakup.pfTotal / 0.12) * employeeContribution,
    );

    return {
      uan_number: formatData?.statutoryDetails?.uan_number || null,
      name:
        `${formatData?.employees?.first_name || ""} ${
          formatData?.employees?.middle_name || ""
        } ${formatData?.employees?.last_name || ""}`
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase() || null,
      gross_wages: roundToNearest(formatData?.gross),
      epf_wages: roundToNearest(pfBreakup.pfTotal / 0.12),
      eps_wages: Math.min(roundToNearest(pfBreakup.pfTotal / 0.12), 15000),
      edli_wages: Math.min(roundToNearest(pfBreakup.pfTotal / 0.12), 15000),
      epf_contribution: epfContribution,
      eps_contribution: pfBreakup.eps,
      diffEpf_Eps: pfBreakup.employerEpf,
      refund: 0,
      ncp_days: formatData.absentDays,
    };
  });

  return extractedData;
};

export const DownloadEpfFormat = ({
  env,
  data,
}: {
  env: SupabaseEnv;
  data: any[];
}) => {
  const { supabase } = useSupabase({ env });
  const { companyId } = useCompanyId();
  const [epfList, setEpfList] = useState<any[]>([]);
  const [selectedEpfId, setSelectedEpfId] = useState<string>("");
  const [selectedEpfFields, setSelectedEpfFields] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const earningFields = useMemo(() => {
    const fields = new Set<string>();
    for (const emp of data) {
      const fieldValues = emp.salary_entries?.salary_field_values || [];
      for (const f of fieldValues) {
        if (f.payroll_fields?.type === "earning" && f.payroll_fields?.name) {
          fields.add(f.payroll_fields.name);
        }
      }
    }
    return Array.from(fields).sort();
  }, [data]);

  useEffect(() => {
    const initialSelected: string[] = [];
    for (const emp of data) {
      const fieldValues = emp.salary_entries?.salary_field_values || [];
      for (const f of fieldValues) {
        if (f.payroll_fields?.type === "earning" && f.payroll_fields?.name) {
          const name = f.payroll_fields.name;
          if (!initialSelected.includes(name)) {
            if (
              name.toLowerCase().includes("basic") ||
              f.consider_for_epf === true ||
              f.payroll_fields?.consider_for_epf === true
            ) {
              initialSelected.push(name);
            }
          }
        }
      }
    }
    setSelectedEpfFields(initialSelected);
  }, [data]);

  useEffect(() => {
    if (!companyId) return;

    const fetchEpfList = async () => {
      setLoading(true);
      try {
        const { data: epfData, error } =
          await getEmployeeProvidentFundByCompanyId({
            supabase,
            companyId,
          });
        if (error) throw error;
        setEpfList(epfData || []);

        const defaultEpf =
          epfData?.find((e: any) => e.is_default) || epfData?.[0];
        if (defaultEpf) {
          setSelectedEpfId(String(defaultEpf.id));
        }
      } catch (err) {
        console.error("Error fetching EPF list:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEpfList();
  }, [companyId, supabase]);

  function transformSalaryData(data: any[], selectedEpf?: any) {
    return data.map((emp: any) => {
      const isRestricted = selectedEpf
        ? selectedEpf.restrict_employee_contribution === true
        : false;

      const employeeContribution = selectedEpf
        ? selectedEpf.employee_contribution
        : 0.12;

      const employeeRestrictValue = selectedEpf
        ? selectedEpf.employee_restrict_value
        : 15000;

      const gross = roundToNearest(
        emp.salary_entries.salary_field_values
          .filter((e: any) => e.payroll_fields.type === "earning")
          .reduce((sum: number, e: any) => sum + e.amount, 0),
      );

      const earnings = roundToNearest(
        emp.salary_entries.salary_field_values
          .filter(
            (e: any) =>
              e.payroll_fields.type === "earning" &&
              selectedEpfFields.includes(e.payroll_fields.name),
          )
          .reduce((sum: number, e: any) => sum + e.amount, 0),
      );

      return {
        amount: earnings,
        gross,
        isRestricted,
        employeeContribution,
        employeeRestrictValue,
        presentDays: emp?.present_days ?? 0,
        workingDays: emp?.working_days ?? 0,
        absentDays: emp?.absent_days ?? 0,
        employee_id: emp?.employee?.id,
        employees: {
          employee_code: emp.employee?.employee_code,
          first_name: emp.employee?.first_name,
          middle_name: emp.employee?.middle_name,
          last_name: emp.employee?.last_name,
        },
      };
    });
  }

  const generateEpfFormat = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    const selectedEpf = epfList.find((e) => String(e.id) === selectedEpfId);

    const transformedData = transformSalaryData(data, selectedEpf);

    const epfData = await prepareEpfFormat({
      data: transformedData,
      supabase,
      selectedEpf,
      selectedEpfFields,
    });

    const csv = Papa.unparse(epfData, { header: false }).replaceAll(",", "#~#");

    const blob = new Blob([csv], { type: "text" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", `Epf-Format - ${formatDateTime(Date.now())}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn("w-full flex justify-start items-center gap-2")}
      >
        <Icon name="import" />
        <p>Download Epf Format</p>
      </AlertDialogTrigger>

      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Epf Format</AlertDialogTitle>
          <AlertDialogDescription>
            Configure your EPF rule and eligible earning components before
            generating the EPF CSV.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-semibold">EPF Rule / Policy</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground py-2">
                Loading EPF configurations...
              </div>
            ) : epfList.length === 0 ? (
              <div className="text-sm text-destructive py-2">
                No EPF configurations found for this company. Please configure
                EPF settings first.
              </div>
            ) : (
              <Select value={selectedEpfId} onValueChange={setSelectedEpfId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select EPF Rule" />
                </SelectTrigger>
                <SelectContent>
                  {epfList.map((epf) => (
                    <SelectItem key={epf.id} value={String(epf.id)}>
                      {epf.epf_number ? `${epf.epf_number} ` : ""}
                      (Employee:{" "}
                      {((epf.employee_contribution || 0.12) * 100).toFixed(0)}%,{" "}
                      Employer:{" "}
                      {((epf.employer_contribution || 0.12) * 100).toFixed(0)}%
                      {epf.is_default ? " - Default" : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <Label className="text-sm font-semibold">
              EPF-Eligible Earning Fields
            </Label>
            {earningFields.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No earning fields found in payroll data.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-1">
                {earningFields.map((field) => {
                  const isChecked = selectedEpfFields.includes(field);
                  return (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        id={`field-${field}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedEpfFields((prev) => [...prev, field]);
                          } else {
                            setSelectedEpfFields((prev) =>
                              prev.filter((f) => f !== field),
                            );
                          }
                        }}
                      />
                      <label
                        htmlFor={`field-${field}`}
                        className="text-sm font-medium leading-none cursor-pointer select-none"
                      >
                        {field}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "default" }))}
            onClick={generateEpfFormat}
            disabled={
              !selectedEpfId || loading || selectedEpfFields.length === 0
            }
          >
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
