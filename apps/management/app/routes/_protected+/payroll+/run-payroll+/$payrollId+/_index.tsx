import { ErrorBoundary } from "@/components/error-boundary";

import { ImportDepartmentSalaryPayrollModal } from "@/components/payroll/import-export/import-department-salary-modal-payroll";
import { ImportSalaryPayrollModal } from "@/components/payroll/import-export/import-salary-modal-payroll";
import { ImportUpdateSalaryPayrollModal } from "@/components/payroll/import-export/import-modal-update-salary-payroll";
import { SalaryEntryComponent } from "@/components/payroll/salary-entry/salary-entry-component";
import { useSalaryEntriesStore } from "@/store/salary-entries";
import { cacheKeyPrefix } from "@/constant";
import {
  clearCacheEntry,
  clearExactCacheEntry,
  clientCaching,
} from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  recalculatePayrollTotals,
  updatePayroll,
} from "@canny_ecosystem/supabase/mutations";
import {
  getLocationsByCompanyId,
  getPayrollById,
  getPayrollFieldByPayrollId,
  getProjectNamesByCompanyId,
  getSiteNamesByCompanyId,
  getDepartmentsByCompanyId,
  getCompanyById,
  getPrimaryLocationByCompanyId,
  getRelationshipsByCompanyId,
  getEmployeesWithoutSalaryEntries,
  getCompanyEsicDetailsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type {
  PayrollDatabaseRow,
  SupabaseEnv,
} from "@canny_ecosystem/supabase/types";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { isGoodStatus } from "@canny_ecosystem/utils";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  type ClientLoaderFunctionArgs,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
  useSearchParams,
  useRevalidator,
  useFetcher,
} from "@remix-run/react";
import { useEffect, useState, useRef } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const payrollId = params.payrollId;
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  };
  const { supabase } = getSupabaseWithHeaders({ request });
  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);

  try {
    const url = new URL(request.url);
    const urlSearchParams = new URLSearchParams(url.searchParams);

    const siteIds =
      urlSearchParams.get("siteIds")?.split(",").filter(Boolean) ?? [];
    const projectIds =
      urlSearchParams.get("projectIds")?.split(",").filter(Boolean) ?? [];
    const departmentIds =
      urlSearchParams.get("departmentIds")?.split(",").filter(Boolean) ?? [];
    const esicIds =
      urlSearchParams.get("esicIds")?.split(",").filter(Boolean) ?? [];

    const { data: allProjectData, error: projectError } =
      await getProjectNamesByCompanyId({
        supabase,
        companyId,
      });
    if (projectError) throw projectError;

    const allProjectOptions = allProjectData?.map((siteData) => ({
      label: siteData.name?.toLowerCase(),
      value: siteData.id,
    }));

    const { data: allSiteData, error: siteError } =
      await getSiteNamesByCompanyId({
        supabase,
        companyId,
      });
    if (siteError) throw siteError;

    const allSiteOptions = allSiteData?.map((siteData) => ({
      label: siteData.name?.toLowerCase(),
      value: siteData.id,
      pseudoLabel: siteData?.projects?.name,
    }));

    const { data: allLocationData, error: locationError } =
      await getLocationsByCompanyId({
        supabase,
        companyId,
      });
    if (locationError) throw locationError;

    const allLocationOptions =
      allLocationData?.map((locationData) => ({
        label: locationData.name?.toLowerCase(),
        value: locationData.id,
      })) ?? [];

    const { data: allDepartmentData, error: departmentError } =
      await getDepartmentsByCompanyId({
        supabase,
        companyId,
      });
    if (departmentError) throw departmentError;

    const allDepartmentOptions = allDepartmentData?.map((deptData) => ({
      label: deptData.name?.toLowerCase(),
      value: deptData.id,
    }));

    const { data: allEsicData, error: esicError } =
      await getCompanyEsicDetailsByCompanyId({
        supabase,
        companyId,
      });
    if (esicError) throw esicError;

    const allEsicOptions =
      allEsicData?.map((esicData) => ({
        label: esicData.esic_site_name?.toLowerCase(),
        pseudoLabel: esicData.esic_id_number,
        value: esicData.id,
      })) ?? [];

    const { data: payrollData } = await getPayrollById({
      supabase,
      payrollId: payrollId ?? "",
    });

    const { data: companyData } = await getCompanyById({
      supabase,
      id: companyId,
    });

    const { data: companyLocation } = await getPrimaryLocationByCompanyId({
      supabase,
      companyId,
    });

    const { data: companyRelations } = await getRelationshipsByCompanyId({
      supabase,
      companyId,
    });

    const { data: payrollFields } = await getPayrollFieldByPayrollId({
      payrollId: payrollId ?? "",
      supabase,
    });

    const { data: holidayConfig } = await supabase
      .from("holiday_config")
      .select("type, multiplier, working_days, use_attendance_working_days")
      .eq("company_id", companyId as any);

    const { data: missingEmployees } = await getEmployeesWithoutSalaryEntries({
      supabase,
      companyId,
      payrollId: payrollId ?? "",
    });

    return json({
      payrollData,
      companyData,
      companyLocation:
        companyLocation ||
        (allLocationData && allLocationData.length > 0
          ? allLocationData[0]
          : null),
      companyRelations,
      allSiteOptions,
      allLocationOptions,
      allProjectOptions,
      allDepartmentOptions,
      allEsicOptions,
      payrollFields,
      holidayConfig: (holidayConfig as any) || [],
      initialFilters: { siteIds, projectIds, departmentIds, esicIds },
      missingEmployees: missingEmployees || [],
      error: null,
      env,
    });
  } catch (error) {
    console.error("Payroll Id Index Error", error);
    return json({
      payrollData: null,
      companyData: null,
      companyLocation: null,
      companyRelations: null,
      allSiteOptions: [],
      allLocationOptions: [],
      allProjectOptions: [],
      allDepartmentOptions: [],
      allEsicOptions: [],
      payrollFields: [],
      holidayConfig: [],
      initialFilters: {
        siteIds: [],
        projectIds: [],
        departmentIds: [],
        esicIds: [],
      },
      missingEmployees: [],
      error,
      env: null,
    });
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(
    `${cacheKeyPrefix.run_payroll_id}${args.params.payrollId}`,
    args,
  );
}

clientLoader.hydrate = true;

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();
    const payrollId = params.payrollId;
    const intent = formData.get("intent");

    if (intent === "delete-entries") {
      const entryIds = JSON.parse(formData.get("entryIds") as string);

      const { error, status } = await supabase
        .from("salary_entries")
        .delete()
        .in("id", entryIds);

      if (isGoodStatus(status)) {
        await recalculatePayrollTotals({
          supabase,
          payrollId: payrollId!,
        });

        return json({
          status: "success",
          message: "Selected salary entries deleted successfully",
        });
      }

      return json(
        { status: "error", message: "Failed to delete entries", error },
        { status: 500 },
      );
    }

    if (intent === "submit-entries") {
      const submissionData = JSON.parse(formData.get("data") as string);

      const result = await supabase
        .from("payroll_fields")
        .select("id, name")
        .eq("payroll_id", payrollId! as any);

      const fieldMap = new Map<string, string>(
        !result.error && Array.isArray(result.data)
          ? result.data.map((f: any) => [f.name.toLowerCase(), f.id])
          : [],
      );

      for (const entry of submissionData) {
        let salaryEntryId: string;
        const entryResult = await supabase
          .from("salary_entries")
          .select("id")
          .eq("payroll_id", payrollId! as any)
          .eq("monthly_attendance_id", entry.monthly_attendance_id)
          .maybeSingle();

        if (
          !entryResult.error &&
          entryResult.data &&
          "id" in entryResult.data
        ) {
          salaryEntryId = (entryResult.data as any).id;
          await supabase
            .from("salary_entries")
            .update({ monthly_ctc: Math.round(Number(entry.monthly_ctc || 0)) } as any)
            .eq("id", salaryEntryId);
        } else {
          const entryInsertResult = await supabase
            .from("salary_entries")
            .insert({
              payroll_id: payrollId!,
              monthly_attendance_id: entry.monthly_attendance_id,
              monthly_ctc: Math.round(Number(entry.monthly_ctc || 0)),
            })
            .select()
            .single();
          if (
            entryInsertResult.error ||
            !entryInsertResult.data ||
            !("id" in entryInsertResult.data)
          ) {
            throw (
              entryInsertResult.error ||
              new Error("Failed to create salary entry")
            );
          }
          salaryEntryId = (entryInsertResult.data as any).id;
        }

        const fieldValuesToInsert = [];

        for (const field of entry.fields) {
          let fieldId = fieldMap.get(field.name.toLowerCase());

          if (!fieldId) {
            const fieldInsertResult = await supabase
              .from("payroll_fields")
              .insert({
                payroll_id: payrollId!,
                name: field.name,
                type: field.type,
              })
              .select()
              .single();
            if (
              fieldInsertResult.error ||
              !fieldInsertResult.data ||
              !("id" in fieldInsertResult.data)
            ) {
              throw (
                fieldInsertResult.error ||
                new Error("Failed to create payroll field")
              );
            }
            fieldId = (fieldInsertResult.data as any).id as string;
            fieldMap.set(field.name.toLowerCase(), fieldId);
          }

          const existingValueResult = await supabase
            .from("salary_field_values")
            .select("id")
            .eq("salary_entry_id", salaryEntryId as any)
            .eq("payroll_field_id", fieldId as any)
            .maybeSingle();

          if (
            !existingValueResult.error &&
            existingValueResult.data &&
            "id" in existingValueResult.data
          ) {
            const { error: updateError } = await supabase
              .from("salary_field_values")
              .update({
                amount: field.amount,
                consider_for_epf: field.consider_for_epf ?? false,
              } as any)
              .eq("id", (existingValueResult.data as any).id);
            if (updateError) throw updateError;
          } else {
            fieldValuesToInsert.push({
              salary_entry_id: salaryEntryId,
              payroll_field_id: fieldId,
              amount: field.amount,
              consider_for_epf: field.consider_for_epf ?? false,
            });
          }
        }

        if (fieldValuesToInsert.length > 0) {
          const { error: valuesError } = await supabase
            .from("salary_field_values")
            .insert(fieldValuesToInsert as any);
          if (valuesError) throw valuesError;
        }
      }

      await recalculatePayrollTotals({
        supabase,
        payrollId: payrollId!,
      });

      return json({
        status: "success",
        message: "Entries submitted successfully",
      });
    }

    const parsedData = JSON.parse(formData.get("data") as string);

    const redirectUrl =
      (formData.get("redirectUrl") as string) ??
      `/payroll/run-payroll/${payrollId}`;

    const data = {
      id: (parsedData.id ?? payrollId) as PayrollDatabaseRow["id"],
      status: parsedData.status as PayrollDatabaseRow["status"],
      run_date: new Date().toISOString() as PayrollDatabaseRow["run_date"],
    };

    const { status, error } = await updatePayroll({
      supabase,
      data,
    });
    if (isGoodStatus(status)) {
      if (parsedData.status === "approved") {
        const { data: loanField, error: loanFieldError } = await supabase
          .from("payroll_fields")
          .select("id")
          .eq("payroll_id", payrollId!)
          .ilike("name", "Loan")
          .maybeSingle();

        if (loanFieldError) throw loanFieldError;

        if (loanField) {
          const { data: salaryData, error: salaryError } = await supabase
            .from("salary_entries")
            .select(
              "id, monthly_attendance(employee_id), salary_field_values(id, amount, payroll_field_id)",
            )
            .eq("payroll_id", payrollId!);

          if (salaryError) throw salaryError;

          const { data: payrollInfo, error: payrollInfoError } = await supabase
            .from("payroll")
            .select("month, year, company_id")
            .eq("id", payrollId!)
            .single();

          if (payrollInfoError) throw payrollInfoError;

          if (salaryData && payrollInfo) {
            const { data: loansData, error: loansError } = await supabase
              .from("employee_loan_details" as any)
              .select("*, loan_deduction(salary_field_values(amount))")
              .eq("company_id", payrollInfo.company_id as string)
              .or("is_paid.eq.false,is_paid.is.null");

            if (loansError) throw loansError;

            const loanDeductionsToInsert = [];
            const loansToUpdate = [];

            for (const entry of salaryData) {
              const employeeId =
                (entry as any).monthly_attendance?.employee_id ||
                (Array.isArray((entry as any).monthly_attendance)
                  ? (entry as any).monthly_attendance[0]?.employee_id
                  : undefined);

              if (!employeeId) continue;

              const loanFieldValue = entry.salary_field_values.find(
                (v: any) => v.payroll_field_id === loanField.id,
              );
              if (loanFieldValue && Number(loanFieldValue.amount) > 0) {
                const employeeLoans =
                  loansData?.filter((l: any) => l.employee_id === employeeId) ||
                  [];
                for (const loan of employeeLoans) {
                  const loanDate = new Date(loan.loan_date);
                  const startYear = loanDate.getFullYear();
                  const startMonth = loanDate.getMonth() + 1;
                  const monthsSinceStart =
                    (payrollInfo.year - startYear) * 12 +
                    (payrollInfo.month - startMonth);

                  if (
                    monthsSinceStart >= 0 &&
                    monthsSinceStart < (loan.number_of_months || 0)
                  ) {
                    loanDeductionsToInsert.push({
                      salary_field_values_id: loanFieldValue.id,
                      loan_id: loan.id,
                    });

                    const currentReceived = (loan.loan_deduction || []).reduce(
                      (sum: number, d: any) =>
                        sum + (Number(d?.salary_field_values?.amount) || 0),
                      0,
                    );
                    const newReceivedAmount =
                      currentReceived + Number(loanFieldValue.amount);
                    const isPaid =
                      newReceivedAmount >= (Number(loan.amount) || 0);

                    loansToUpdate.push({
                      id: loan.id,
                      is_paid: isPaid,
                    });

                    // Stop after applying to the first active loan to prevent double deduction applying to multiple loans
                    break;
                  }
                }
              }
            }
            if (loanDeductionsToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from("loan_deduction" as any)
                .insert(loanDeductionsToInsert as any);
              if (insertError) throw insertError;
            }

            for (const loanUpdate of loansToUpdate) {
              const { error: updateError } = await supabase
                .from("employee_loan_details" as any)
                .update({
                  is_paid: loanUpdate.is_paid,
                } as any)
                .eq("id", loanUpdate.id);

              if (updateError) throw updateError;
            }
          }
        }

        // --- Process Advance Deductions ---
        const { data: advanceField, error: advanceFieldError } = await supabase
          .from("payroll_fields")
          .select("id")
          .eq("payroll_id", payrollId!)
          .ilike("name", "Advance")
          .maybeSingle();

        if (advanceFieldError) throw advanceFieldError;

        if (advanceField) {
          const { data: salaryData, error: salaryError } = await supabase
            .from("salary_entries")
            .select(
              "id, monthly_attendance(employee_id), salary_field_values(id, amount, payroll_field_id)",
            )
            .eq("payroll_id", payrollId!);

          if (salaryError) throw salaryError;

          const { data: payrollInfo, error: payrollInfoError } = await supabase
            .from("payroll")
            .select("month, year, company_id")
            .eq("id", payrollId!)
            .single();

          if (payrollInfoError) throw payrollInfoError;

          if (salaryData && payrollInfo) {
            const { data: advancesData, error: advancesError } = await supabase
              .from("employee_advance_details")
              .select("*, advance_deduction(salary_field_values(amount))")
              .eq("company_id", payrollInfo.company_id as string)
              .or("is_paid.eq.false,is_paid.is.null");

            if (advancesError) throw advancesError;

            const advanceDeductionsToInsert = [];
            const advancesToUpdate = [];

            for (const entry of salaryData) {
              const employeeId =
                (entry as any).monthly_attendance?.employee_id ||
                (Array.isArray((entry as any).monthly_attendance)
                  ? (entry as any).monthly_attendance[0]?.employee_id
                  : undefined);

              if (!employeeId) continue;

              const advanceFieldValue = entry.salary_field_values.find(
                (v: any) => v.payroll_field_id === advanceField.id,
              );
              if (advanceFieldValue && Number(advanceFieldValue.amount) > 0) {
                const employeeAdvances =
                  advancesData?.filter(
                    (a: any) => a.employee_id === employeeId,
                  ) || [];
                for (const advance of employeeAdvances) {
                  const advanceDate = new Date(
                    advance.advance_date || advance.created_at,
                  );
                  const startYear = advanceDate.getFullYear();
                  const startMonth = advanceDate.getMonth() + 1;
                  const monthsSinceStart =
                    (payrollInfo.year - startYear) * 12 +
                    (payrollInfo.month - startMonth);

                  if (monthsSinceStart >= 0) {
                    advanceDeductionsToInsert.push({
                      salary_field_values_id: advanceFieldValue.id,
                      advance_id: advance.id,
                    });

                    const currentReceived = (
                      advance.advance_deduction || []
                    ).reduce(
                      (sum: number, d: any) =>
                        sum + (Number(d?.salary_field_values?.amount) || 0),
                      0,
                    );
                    const newReceivedAmount =
                      currentReceived + Number(advanceFieldValue.amount);
                    const isPaid =
                      newReceivedAmount >= (Number(advance.amount) || 0);

                    advancesToUpdate.push({
                      id: advance.id,
                      is_paid: isPaid,
                    });

                    // Stop after applying to the first active advance
                    break;
                  }
                }
              }
            }

            if (advanceDeductionsToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from("advance_deduction" as any)
                .insert(advanceDeductionsToInsert as any);
              if (insertError) throw insertError;
            }

            for (const advanceUpdate of advancesToUpdate) {
              const { error: updateError } = await supabase
                .from("employee_advance_details")
                .update({
                  is_paid: advanceUpdate.is_paid,
                } as any)
                .eq("id", advanceUpdate.id);

              if (updateError) throw updateError;
            }
          }
        }
      }

      return json({
        status: "success",
        message: "Payroll updated successfully",
        redirectUrl,
        error: null,
      });
    }
    return json(
      { status: "error", message: "Payroll update failed", redirectUrl, error },
      { status: 500 },
    );
  } catch (error) {
    console.error("Payroll Id Action error", error);
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        redirectUrl: `/payroll/run-payroll/${params.payrollId}`,
        error,
        data: null,
      },
      { status: 500 },
    );
  }
}

export default function RunPayrollId() {
  const {
    payrollData,
    companyData,
    companyLocation,
    companyRelations,
    env,
    allSiteOptions,
    allLocationOptions,
    allProjectOptions,
    allDepartmentOptions,
    allEsicOptions,
    holidayConfig,
    missingEmployees,
    payrollFields,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { payrollId } = useParams();
  const { toast } = useToast();

  const fetcher = useFetcher<{
    data: any[];
    count: number;
  }>();

  const pendingToastRef = useRef<{
    title: string;
    description: string;
    variant?: "default" | "destructive" | "success";
  } | null>(null);

  const [entries, setEntries] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const [searchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 100);
  const siteIds = searchParams.get("siteIds") ?? "";
  const projectIds = searchParams.get("projectIds") ?? "";
  const departmentIds = searchParams.get("departmentIds") ?? "";
  const esicIds = searchParams.get("esicIds") ?? "";
  const search = searchParams.get("search") ?? "";
  const sortField = searchParams.get("sortField") ?? "";
  const sortOrder = searchParams.get("sortOrder") ?? "asc";

  useEffect(() => {
    if (!payrollData || revalidator.state !== "idle") return;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      month: String(payrollData.month),
      year: String(payrollData.year),
      siteIds,
      projectIds,
      departmentIds,
      esicIds,
      search,
      sortField,
      sortOrder,
    });

    fetcher.load(
      `/payroll/run-payroll/${payrollId}/salary-entries?${params.toString()}`,
    );
  }, [
    page,
    limit,
    siteIds,
    projectIds,
    departmentIds,
    esicIds,
    search,
    sortField,
    sortOrder,
    revalidator.state,
  ]);

  useEffect(() => {
    if (fetcher.data?.data) {
      setEntries(fetcher.data.data);
      setTotalCount(fetcher.data.count || 0);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        useSalaryEntriesStore.getState().setSelectedRows([]);
        useSalaryEntriesStore.getState().setRowSelection({});
        clearExactCacheEntry(cacheKeyPrefix.run_payroll);
        clearExactCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
        clearExactCacheEntry(cacheKeyPrefix.payroll_history);
        revalidator.revalidate();
        pendingToastRef.current = {
          title: "Success",
          description: actionData?.message || "Payroll updated",
          variant: "success",
        };
      } else {
        toast({
          title: "Error",
          description:
            (actionData?.error as any)?.message ||
            actionData?.message ||
            "Payroll update failed",
          variant: "destructive",
        });
      }
      if ((actionData as any).redirectUrl) {
        navigate((actionData as any).redirectUrl, { replace: true });
      }
    }
  }, [actionData]);

  useEffect(() => {
    if (
      pendingToastRef.current &&
      fetcher.state === "idle" &&
      revalidator.state === "idle"
    ) {
      toast(pendingToastRef.current);
      pendingToastRef.current = null;
    }
  }, [fetcher.state, revalidator.state, fetcher.data, toast]);

  if (!payrollData) {
    clearExactCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
    return (
      <ErrorBoundary
        error={null}
        message="Failed to load Payroll Data in Run Payroll Id"
      />
    );
  }

  return (
    <>
      <SalaryEntryComponent
        payrollData={payrollData as any}
        companyData={companyData}
        companyLocation={companyLocation}
        companyRelations={companyRelations}
        data={entries}
        env={env as SupabaseEnv}
        allSiteOptions={allSiteOptions as ComboboxSelectOption[]}
        allProjectOptions={allProjectOptions as ComboboxSelectOption[]}
        allDepartmentOptions={allDepartmentOptions as ComboboxSelectOption[]}
        allEsicOptions={allEsicOptions as ComboboxSelectOption[]}
        fromWhere="runpayroll"
        allLocationOptions={allLocationOptions as ComboboxSelectOption[]}
        holidayConfig={holidayConfig}
        totalCount={totalCount}
        page={page}
        limit={limit}
        isLoading={fetcher.state !== "idle"}
        missingEmployees={missingEmployees}
        payrollFields={payrollFields}
      />
      <ImportDepartmentSalaryPayrollModal />
      <ImportSalaryPayrollModal />
      <ImportUpdateSalaryPayrollModal />
    </>
  );
}
