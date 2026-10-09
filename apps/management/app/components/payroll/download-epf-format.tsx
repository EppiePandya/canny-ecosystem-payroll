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
  EMPLOYEE_EPF_PERCENTAGE,
  EMPLOYEE_RESTRICTED_VALUE,
  EMPLOYER_RESTRICTED_VALUE,
  EDLI_RESTRICTED_VALUE,
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

  // 1. Employee EPF settings fetched from selectedEpf configuration
  const rawEmpContrib =
    Number(selectedEpf?.employee_contribution) || EMPLOYEE_EPF_PERCENTAGE;
  const employeeContributionRate =
    rawEmpContrib > 1 ? rawEmpContrib / 100 : rawEmpContrib;

  const isEmployeeRestricted = selectedEpf
    ? selectedEpf.restrict_employee_contribution === true
    : false;
  const employeeRestrictValue = selectedEpf
    ? Number(selectedEpf.employee_restrict_value) || EMPLOYEE_RESTRICTED_VALUE
    : EMPLOYEE_RESTRICTED_VALUE;

  // 2. Employer EPF settings fetched from selectedEpf configuration
  const isEmployerRestricted = selectedEpf
    ? selectedEpf.restrict_employer_contribution === true
    : false;
  const employerRestrictValue = selectedEpf
    ? Number(selectedEpf.employer_restrict_value) || EMPLOYER_RESTRICTED_VALUE
    : EMPLOYER_RESTRICTED_VALUE;
  const edliRestrictValue = selectedEpf
    ? Number(selectedEpf.edli_restrict_value) || employerRestrictValue
    : EDLI_RESTRICTED_VALUE;

  const extractedData = updatedData.map((formatData) => {
    const pfDeduction = Number(formatData?.pfAmount) || 0;
    const baseAmount = Number(formatData?.amount) || 0;

    let epfContribution = pfDeduction;
    let epfWageBase = baseAmount;

    if (pfDeduction > 0) {
      epfContribution = pfDeduction;
      if (
        !epfWageBase ||
        Math.abs(roundToNearest(epfWageBase * employeeContributionRate) - pfDeduction) > 5
      ) {
        epfWageBase = roundToNearest(
          pfDeduction / (employeeContributionRate || EMPLOYEE_EPF_PERCENTAGE),
        );
      }
    } else if (baseAmount > 0) {
      const cappedBase = isEmployeeRestricted
        ? Math.min(baseAmount, employeeRestrictValue)
        : baseAmount;
      epfContribution = roundToNearest(cappedBase * employeeContributionRate);
      epfWageBase = cappedBase;
    }

    if (isEmployeeRestricted && epfWageBase > employeeRestrictValue) {
      epfWageBase = employeeRestrictValue;
    }

    const epsWages = isEmployerRestricted
      ? Math.min(roundToNearest(epfWageBase), employerRestrictValue)
      : roundToNearest(epfWageBase);

    const edliWages = isEmployerRestricted
      ? Math.min(roundToNearest(epfWageBase), edliRestrictValue)
      : roundToNearest(epfWageBase);

    // Calculate employer statutory breakup dynamically from selectedEpf
    const employerBreakup = calculateEmployerPfStatutoryBreakup({
      epfWageBase,
      statutoryPf: selectedEpf,
    });

    const epsContribution = epfContribution > 0 ? employerBreakup.eps : 0;
    const diffEpf_Eps = epfContribution > 0 ? employerBreakup.employerEpf : 0;

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
      epf_wages: roundToNearest(epfWageBase),
      eps_wages: epsWages,
      edli_wages: edliWages,
      epf_contribution: epfContribution,
      eps_contribution: epsContribution,
      diffEpf_Eps: diffEpf_Eps,
      ncp_days: Number(formatData?.absentDays || 0),
      refund: 0,
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
        : EMPLOYEE_EPF_PERCENTAGE;

      const employeeRestrictValue = selectedEpf
        ? selectedEpf.employee_restrict_value
        : EMPLOYEE_RESTRICTED_VALUE;

      const cleanUpper = (s: string) =>
        String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const isNetField = (n: string) =>
        [
          "NET",
          "NETPAY",
          "NETSALARY",
          "NETAMOUNT",
          "NETPAYABLE",
          "NETPAYABLEAMOUNT",
          "NETWAGE",
          "NETWAGES",
        ].includes(cleanUpper(n));
      const isSubtotalField = (n: string) =>
        [
          "ACTUALWAGES",
          "ACTUALWAGE",
          "GROSS",
          "GROSSSALARY",
          "GROSSWAGES",
          "GROSSINCOME",
        ].includes(cleanUpper(n));

      const sfvs = emp.salary_entries?.salary_field_values || [];

      // 1. Gross wages directly from calculation or subtotal or true individual earnings
      let gross = 0;
      if (
        emp?.calculation?.grossAmount != null &&
        Number(emp.calculation.grossAmount) > 0
      ) {
        gross = Number(emp.calculation.grossAmount);
      } else {
        const actualWagesField = sfvs.find((e: any) =>
          isSubtotalField(e.payroll_fields?.name || ""),
        );
        if (actualWagesField && Number(actualWagesField.amount) > 0) {
          gross = Number(actualWagesField.amount);
        } else {
          gross = sfvs
            .filter(
              (e: any) =>
                e.payroll_fields?.type === "earning" &&
                !isNetField(e.payroll_fields?.name) &&
                !isSubtotalField(e.payroll_fields?.name),
            )
            .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
        }
      }

      // 2. Actual PF deduction from sheet/table
      const isPfField = (e: any) =>
        ["PF", "EPF", "PROVIDENTFUND"].includes(
          cleanUpper(e?.payroll_fields?.name || ""),
        );
      const pfEntry = sfvs.find(isPfField);
      const pfAmount = pfEntry && pfEntry.amount != null ? Number(pfEntry.amount) : 0;

      // 3. EPF eligible wages
      const earnings = roundToNearest(
        sfvs
          .filter(
            (e: any) =>
              e.payroll_fields?.type === "earning" &&
              !isNetField(e.payroll_fields?.name) &&
              !isSubtotalField(e.payroll_fields?.name) &&
              selectedEpfFields.includes(e.payroll_fields?.name),
          )
          .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0),
      );

      const workingDays = Number(emp?.working_days || 0);
      const presentDays = Number(emp?.present_days || 0);
      const paidLeaves = Number(emp?.paid_leaves || 0);
      const casualLeaves = Number(emp?.casual_leaves || 0);
      const paidHolidays = Number(emp?.paid_holidays || 0);
      const totalPaidDays =
        presentDays + paidLeaves + casualLeaves + paidHolidays;

      let absentDays = Number(emp?.absent_days || 0);
      if (absentDays === 0 && workingDays > 0 && totalPaidDays < workingDays) {
        absentDays = Math.max(0, workingDays - totalPaidDays);
      }

      return {
        amount: earnings,
        pfAmount,
        gross: roundToNearest(gross),
        isRestricted,
        employeeContribution,
        employeeRestrictValue,
        presentDays,
        workingDays,
        absentDays,
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
    link.setAttribute(
      "download",
      `Epf-Format - ${formatDateTime(Date.now())}.txt`,
    );
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
