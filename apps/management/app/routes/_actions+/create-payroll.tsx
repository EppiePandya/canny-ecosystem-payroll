import { DEFAULT_ROUTE, cacheKeyPrefix } from "@/constant";
import { clearCacheEntry } from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import {
  createAttendanceByPayrollImportAndGiveID,
  createPayrollFields,
  createSalaryFieldValues,
  createSalaryPayroll,
  createSalaryPayrollByDepartment,
} from "@canny_ecosystem/supabase/mutations";
import { recalculatePayrollTotals } from "@canny_ecosystem/supabase/mutations";
import {
  getPayrollById,
  getPayrollFieldByPayrollId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import type {
  EmployeeMonthlyAttendanceDatabaseInsert,
  EmployeeMonthlyAttendanceDatabaseUpdate,
  PayrollFieldsDatabaseRow,
  SalaryEntriesDatabaseInsert,
  SalaryFieldValuesDatabaseInsert,
} from "@canny_ecosystem/supabase/types";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { calculateSalaryTotalNetAmount } from "@canny_ecosystem/utils";

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigate } from "@remix-run/react";
import { useEffect } from "react";

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
    const formData = await request.formData();
    const payrollTitle = formData.get("title") as string;
    const skipped = formData.get("skipped") as string;
    const updated = formData.get("updated") as string;
    const type = formData.get("type") as string;
    const different = formData.get("different") as string;
    const site = formData.get("site") as string;
    const project = formData.get("project") as string;

    const failedRedirect = formData.get("failedRedirect") as string;

    const successMessage =
      updated && skipped
        ? `Salary entries imported: ${updated} updated, ${skipped} skipped`
        : undefined;
    let error = null;

    if (type === "salary-import") {
      const salaryImportData = JSON.parse(
        formData.get("salaryImportData") as string,
      );

      const transformedSalaryEntries: any[] = [];
      const uniqueComponentsSet = new Map();
      const baseTimestamp = Date.now();

      for (let i = 0; i < salaryImportData.length; i++) {
        const entry = salaryImportData[i];
        const rowCreatedAt = new Date(baseTimestamp + i * 1000).toISOString();
        const { month, year, employee_id, ...rest } = entry;

        const attendanceFieldKeys = [
          "working_days",
          "present_days",
          "working_hours",
          "overtime_hours",
          "absent_days",
          "paid_holidays",
          "paid_leaves",
          "casual_leaves",
        ];

        const attendance: Record<string, any> = { created_at: rowCreatedAt };
        const components: Record<string, any> = {};

        for (const key in rest) {
          if (attendanceFieldKeys.includes(key)) {
            attendance[key] = rest[key];
          } else {
            components[key] = rest[key];

            if (
              components[key] &&
              typeof components[key] === "object" &&
              "type" in components[key]
            ) {
              const fieldName = key.toUpperCase();
              const type = components[key].type;

              if (!uniqueComponentsSet.has(fieldName)) {
                uniqueComponentsSet.set(fieldName, {
                  type,
                  consider_for_epf: components[key].consider_for_epf ?? false,
                  consider_for_esic: components[key].consider_for_esic ?? false,
                });
              }
            }
          }
        }

        const { error: attendanceError, data: attendanceData } =
          await createAttendanceByPayrollImportAndGiveID({
            employee_id,
            month,
            supabase,
            insertData:
              attendance as unknown as EmployeeMonthlyAttendanceDatabaseInsert,
            year,
          });

        if (attendanceError || !attendanceData) {
          console.error("Failed to insert attendance", attendanceError);
          return json({
            status: "error",
            message:
              "Salary Payroll Creation failed as conflict in attendance data",
            failedRedirect,
            error: attendanceError,
          });
        }

        const monthly_attendance_id = attendanceData.id;

        transformedSalaryEntries.push({
          monthly_attendance_id,
          monthly_ctc: entry.monthly_ctc,
          created_at: rowCreatedAt,
        });
      }

      const payrollFields = Array.from(uniqueComponentsSet.entries()).map(
        ([name, config]: [string, any]) => ({
          name,
          type: config.type,
        }),
      );

      let totalNetAmount = 0;

      totalNetAmount = calculateSalaryTotalNetAmount(salaryImportData);

      if (different === "different") {
        const payrollId = formData.get("payrollId") as string;

        const { data } = await getPayrollById({ payrollId, supabase });

        const { error: salaryError, message } =
          await createSalaryPayrollByDepartment({
            supabase,
            data: {
              payrollId,
              salaryEntryData: transformedSalaryEntries,
              oldTotalEmployees: data?.total_employees ?? 0,
              totalEmployees:
                Number(salaryImportData.length) + Number(data?.total_employees),
              oldTotalNetAmount: data?.total_net_amount ?? 0,
              totalNetAmount:
                Number(totalNetAmount) + Number(data?.total_net_amount),
              payrollFieldsData:
                payrollFields as unknown as PayrollFieldsDatabaseRow[],
              rawData: salaryImportData,
            },
          });
        if (!salaryError) {
          return json({
            status: "success",
            message:
              successMessage ??
              message ??
              "Salary entries imported successfully",
            payrollId,
            failedRedirect,
            error: null,
          });
        }

        error = salaryError;
      } else {
        const {
          error: salaryError,
          message,
          data: createdPayroll,
        } = await createSalaryPayroll({
          supabase,
          data: {
            title: payrollTitle,
            type: "salary",
            site,
            project,
            rawData: salaryImportData,
            salaryEntryData: transformedSalaryEntries,
            totalEmployees: salaryImportData.length,
            totalNetAmount,
            month: Number(salaryImportData[0]?.month),
            year: Number(salaryImportData[0]?.year),
            run_date: salaryImportData[0].run_date,
            payrollFieldsData:
              payrollFields as unknown as PayrollFieldsDatabaseRow[],
          },
          companyId: companyId ?? "",
        });

        if (!salaryError) {
          return json({
            status: "success",
            message:
              successMessage ??
              message ??
              "Salary entries imported successfully",
            payrollId: (createdPayroll as any)?.id,
            failedRedirect,
            error: null,
          });
        }

        error = salaryError;
      }
    }

    if (type === "salary-update-import") {
      const salaryImportData = JSON.parse(
        formData.get("salaryImportData") as string,
      );
      const payrollId = formData.get("payrollId") as string;
      const failedRedirect = formData.get("failedRedirect") as string;

      if (!payrollId) {
        return json({
          status: "error",
          error: "Payroll ID is required for update",
        });
      }

      const uniqueComponentsSet = new Map();
      for (const entry of salaryImportData) {
        const { ...rest } = entry;
        for (const key in rest) {
          if (
            ![
              "working_days",
              "present_days",
              "working_hours",
              "overtime_hours",
              "absent_days",
              "paid_holidays",
              "paid_leaves",
              "casual_leaves",
              "employee_id",
              "month",
              "year",
              "run_date",
            ].includes(key)
          ) {
            if (
              rest[key] &&
              typeof rest[key] === "object" &&
              "type" in rest[key]
            ) {
              uniqueComponentsSet.set(key.toUpperCase(), {
                type: rest[key].type,
                consider_for_epf: rest[key].consider_for_epf ?? false,
                consider_for_esic: rest[key].consider_for_esic ?? false,
              });
            }
          }
        }
      }

      const payrollFieldsToUpsert = Array.from(
        uniqueComponentsSet.entries(),
      ).map(([name, config]: [string, any]) => ({
        name,
        type: config.type,
        payroll_id: payrollId,
      }));

      const { data: payrollFieldsData, error: fieldsError } =
        await createPayrollFields({
          supabase,
          data: payrollFieldsToUpsert as any[],
          onConflict: "name, payroll_id",
        });

      if (fieldsError || !payrollFieldsData) {
        console.error("Failed to resolve payroll fields", fieldsError);
        return json({ status: "error", error: fieldsError, failedRedirect });
      }

      const { data: existingFields } = await getPayrollFieldByPayrollId({
        supabase,
        payrollId,
      });

      const payrollFieldMap: Record<string, string> = {};
      const normalize = (name: string) =>
        name.trim().toUpperCase().replace(/[_\s]/g, "");

      if (existingFields) {
        for (const field of existingFields) {
          payrollFieldMap[normalize(field.name)] = field.id;
        }
      }

      for (const field of payrollFieldsData) {
        payrollFieldMap[normalize(field.name)] = field.id;
      }

      const attendanceFields = [
        "working_days",
        "present_days",
        "working_hours",
        "overtime_hours",
        "absent_days",
        "paid_holidays",
        "paid_leaves",
        "casual_leaves",
      ];

      const baseTimestamp = Date.now();
      for (let i = 0; i < salaryImportData.length; i++) {
        const entry = salaryImportData[i];
        const rowCreatedAt = new Date(baseTimestamp + i * 1000).toISOString();
        const { month, year, employee_id, ...rest } = entry;

        const attendanceInsert: Record<string, any> = {
          created_at: rowCreatedAt,
        };
        for (const k of attendanceFields) {
          if (rest[k] !== undefined) attendanceInsert[k] = rest[k];
        }

        const { error: attendanceError, data: attendanceData } =
          await createAttendanceByPayrollImportAndGiveID({
            employee_id,
            month,
            supabase,
            insertData: attendanceInsert,
            year,
          });

        if (attendanceError || !attendanceData) {
          console.error(`Failed for employee ${employee_id}`, attendanceError);
          continue;
        }

        const attendUpdate: EmployeeMonthlyAttendanceDatabaseUpdate = {
          created_at: rowCreatedAt,
        };
        for (const k of attendanceFields) {
          if (rest[k] !== undefined) (attendUpdate as any)[k] = rest[k];
        }
        if (Object.keys(attendUpdate).length > 0) {
          await supabase
            .from("monthly_attendance")
            .update(attendUpdate)
            .eq("id", attendanceData.id);
        }

        const { data: salaryEntry, error: seError } = await supabase
          .from("salary_entries")
          .upsert(
            {
              monthly_attendance_id: attendanceData.id,
              payroll_id: payrollId,
              monthly_ctc: Math.round(Number(entry.monthly_ctc || 0)),
              created_at: rowCreatedAt,
            } as SalaryEntriesDatabaseInsert,
            {
              onConflict: "monthly_attendance_id, payroll_id",
            },
          )
          .select("id")
          .single();

        if (seError || !salaryEntry) {
          console.error("Failed to resolve salary entry", seError);
          continue;
        }

        const fieldValuesToUpsert: SalaryFieldValuesDatabaseInsert[] = [];
        for (const [key, value] of Object.entries(rest)) {
          const fieldId = payrollFieldMap[normalize(key)];
          if (
            fieldId &&
            typeof value === "object" &&
            value !== null &&
            "amount" in value
          ) {
            fieldValuesToUpsert.push({
              salary_entry_id: (salaryEntry as { id: string }).id,
              payroll_field_id: fieldId,
              amount: (value as any).amount,
              consider_for_epf: (value as any).consider_for_epf ?? false,
            });
          }
        }

        if (fieldValuesToUpsert.length > 0) {
          await createSalaryFieldValues({
            supabase,
            data: fieldValuesToUpsert,
          });
        }
      }

      await recalculatePayrollTotals({ supabase, payrollId });

      return json({
        status: "success",
        message: successMessage ?? "Salary Import Updated Successfully",
        failedRedirect,
        error: null,
      });
    }

    return json(
      {
        status: "error",
        message: "Failed to Create payroll",
        failedRedirect,
        error,
      },
      { status: 500 },
    );
  } catch (error) {
    console.error("Create Payroll error", error);
    return json({
      status: "error",
      message: "An unexpected error occurred in create payroll",
      failedRedirect: null,
      error,
    });
  }
}

export default function CreatePayroll() {
  const actionData = useActionData<typeof action>();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(cacheKeyPrefix.run_payroll);
        clearCacheEntry(cacheKeyPrefix.run_payroll_id);
        toast({
          title: "Success",
          description: actionData?.message || "Payroll Created",
          variant: "success",
        });
        navigate(actionData?.failedRedirect ?? "payroll/run-payroll");
      } else {
        toast({
          title: "Error",
          description:
            actionData?.error?.message ||
            actionData?.error ||
            "Payroll Creation failed",
          variant: "destructive",
        });
        navigate(actionData?.failedRedirect ?? DEFAULT_ROUTE);
      }
    }
  }, [actionData, navigate, toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
      <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-card/95 border rounded-2xl shadow-2xl max-w-sm text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon
              name="update"
              size="md"
              className="text-primary animate-spin"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-foreground">
            Processing Payroll Import
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Saving attendance records and generating salary entries...
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Please wait while calculations are being finalized.
          </p>
        </div>
        <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
          <div className="bg-primary h-full rounded-full animate-pulse w-3/4" />
        </div>
      </div>
    </div>
  );
}
