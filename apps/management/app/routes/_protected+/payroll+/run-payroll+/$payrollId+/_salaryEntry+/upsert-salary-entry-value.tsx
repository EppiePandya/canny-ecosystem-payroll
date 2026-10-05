import { cacheKeyPrefix } from "@/constant";
import { clearCacheEntry, clearExactCacheEntry } from "@/utils/cache";
import {
  recalculateAndPersistSalaryEntriesForAttendances,
  recalculatePayrollTotals,
} from "@canny_ecosystem/supabase/mutations";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { getSalaryEntriesByPayrollId } from "@canny_ecosystem/supabase/queries";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { SalaryEntrySchema, roundValue } from "@canny_ecosystem/utils";
import { parseWithZod } from "@conform-to/zod";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigate,
  useParams,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const formData = await request.formData();

    const rawData = formData.get("fieldsData");
    if (rawData) {
      const payrollId = params.payrollId;
      if (!payrollId) {
        return json(
          { status: "error", success: false, message: "Payroll ID missing" },
          { status: 400 },
        );
      }

      const parsed = JSON.parse(rawData as string);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      if (items.length === 0) {
        return json(
          { status: "error", success: false, message: "No fields data provided" },
          { status: 400 },
        );
      }

      const attendanceIdsToRecalculate = new Set<string>();
      const savedPayrollFieldIds = new Set<string>();

      for (const item of items) {
        const {
          monthly_attendance_id,
          salary_entries_id,
          fields,
          is_monthly_ctc,
          amount,
          present_days,
        } = item;
        if (!monthly_attendance_id) continue;
        attendanceIdsToRecalculate.add(monthly_attendance_id);

        if (present_days != null) {
          await supabase
            .from("monthly_attendance")
            .update({ present_days: Number(present_days) })
            .eq("id", monthly_attendance_id);
        }

        let finalSalaryEntryId = salary_entries_id;
        if (!finalSalaryEntryId) {
          const { data: salaryEntry, error: entryError } = await supabase
            .from("salary_entries")
            .upsert(
              {
                payroll_id: payrollId,
                monthly_attendance_id,
                ...(is_monthly_ctc ? { monthly_ctc: roundValue(amount) } : {}),
              },
              { onConflict: "payroll_id,monthly_attendance_id" },
            )
            .select()
            .single();

          if (entryError || !salaryEntry) {
            return json(
              {
                status: "error",
                success: false,
                message: "Failed to create salary entry",
                error: entryError,
              },
              { status: 500 },
            );
          }
          finalSalaryEntryId = salaryEntry.id;
        } else if (is_monthly_ctc && amount != null) {
          await supabase
            .from("salary_entries")
            .update({ monthly_ctc: roundValue(amount) })
            .eq("id", finalSalaryEntryId);
        }

        if (fields && Array.isArray(fields) && fields.length > 0) {
          for (const field of fields) {
            let finalPayrollFieldId = field.payrollFields_id;

            if (!finalPayrollFieldId) {
              const { data: existingField } = await supabase
                .from("payroll_fields")
                .select("id")
                .eq("payroll_id", payrollId)
                .eq("name", field.name)
                .single();

              if (existingField) {
                finalPayrollFieldId = existingField.id;
              } else {
                const { data: newField, error: fieldError } = await supabase
                  .from("payroll_fields")
                  .upsert(
                    {
                      payroll_id: payrollId,
                      name: field.name,
                      type: field.type,
                    },
                    { onConflict: "name,payroll_id" },
                  )
                  .select()
                  .single();

                if (fieldError || !newField) {
                  return json(
                    {
                      status: "error",
                      success: false,
                      message: `Failed to upsert payroll field: ${field.name}`,
                      error: fieldError,
                    },
                    { status: 500 },
                  );
                }
                finalPayrollFieldId = newField.id;
              }
            }

            if (finalPayrollFieldId) {
              savedPayrollFieldIds.add(finalPayrollFieldId);
            }

            const { error: salaryFieldValuesError } = await supabase
              .from("salary_field_values")
              .upsert(
                {
                  id: field.salaryFieldValues_id || undefined,
                  salary_entry_id: finalSalaryEntryId,
                  payroll_field_id: finalPayrollFieldId,
                  amount: roundValue(field.amount),
                },
                { onConflict: "salary_entry_id,payroll_field_id" },
              );

            if (salaryFieldValuesError) {
              return json(
                {
                  status: "error",
                  success: false,
                  message: `Failed to update value for: ${field.name}`,
                  error: salaryFieldValuesError,
                },
                { status: 500 },
              );
            }
          }
        }
      }

      if (attendanceIdsToRecalculate.size > 0) {
        await recalculateAndPersistSalaryEntriesForAttendances({
          supabase,
          attendanceIds: Array.from(attendanceIdsToRecalculate),
          payrollId,
          preserveFieldIds: savedPayrollFieldIds,
        });
      }

      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });

      return json({
        success: true,
        status: "success",
        message: "Salary Entries updated successfully",
        error: null,
      });
    }

    const submission = parseWithZod(formData, {
      schema: SalaryEntrySchema,
    });

    if (submission.status !== "success") {
      return json(
        {
          status: "error",
          message: "Salary Entry upsert failed",
          error: submission.error,
        },
        { status: 400 },
      );
    }
    const payrollId = submission.value.payroll_id;

    if (!payrollId) {
      return json(
        {
          status: "error",
          message: "Payroll ID missing",
          error: null,
        },
        { status: 400 },
      );
    }

    let finalSalaryEntryId = submission.value.salary_entries_id;

    if (submission.value.is_monthly_ctc) {
      if (!submission.value.monthly_attendance_id) {
        return json(
          {
            status: "error",
            message: "Monthly attendance id is required to update monthly ctc",
            error: null,
          },
          { status: 400 },
        );
      }

      const { data: salaryEntry, error: entryError } = await supabase
        .from("salary_entries")
        .upsert(
          {
            id: finalSalaryEntryId || undefined,
            payroll_id: payrollId,
            monthly_attendance_id: submission.value.monthly_attendance_id,
            monthly_ctc: roundValue(submission.value.amount),
          },
          { onConflict: "payroll_id,monthly_attendance_id" },
        )
        .select()
        .single();

      if (entryError || !salaryEntry) {
        return json(
          {
            status: "error",
            message: "Failed to update monthly ctc",
            error: entryError,
          },
          { status: 500 },
        );
      }

      const attendanceId = salaryEntry.monthly_attendance_id;

      if (attendanceId) {
        await recalculateAndPersistSalaryEntriesForAttendances({
          supabase,
          attendanceIds: [attendanceId],
          payrollId,
        });
      }

      await recalculatePayrollTotals({
        supabase,
        payrollId,
      });

      const { data: payroll } = await supabase
        .from("payroll")
        .select("company_id")
        .eq("id", payrollId)
        .single();

      if (!payroll) {
        return json(
          { status: "error", success: false, message: "Payroll not found" },
          { status: 404 },
        );
      }

      const { data: attendanceRecord } = await supabase
        .from("monthly_attendance")
        .select("month, year")
        .eq("id", attendanceId)
        .single();

      if (!attendanceRecord) {
        return json(
          {
            status: "error",
            success: false,
            message: "Attendance record not found",
          },
          { status: 404 },
        );
      }

      const { data: updatedData, error: queryError } =
        await getSalaryEntriesByPayrollId({
          supabase,
          payrollId,
          month: attendanceRecord.month,
          year: attendanceRecord.year,
          companyId: payroll.company_id,
          attendanceId,
        });

      if (queryError) {
        console.error("Error querying updated salary entry:", queryError);
        return json(
          {
            status: "error",
            success: false,
            message: "Failed to query updated salary entry",
            error: queryError,
          },
          { status: 500 },
        );
      }

      const updatedEntry = updatedData?.[0] || null;

      return json({
        success: true,
        status: "success",
        message: "Monthly CTC updated successfully",
        updatedEntry,
        error: null,
      });
    }

    if (!finalSalaryEntryId) {
      if (!submission.value.monthly_attendance_id) {
        return json(
          {
            status: "error",
            message:
              "Monthly attendance id is required to create a new salary entry",
            error: null,
          },
          { status: 400 },
        );
      }

      const { data: salaryEntry, error: entryError } = await supabase
        .from("salary_entries")
        .upsert(
          {
            payroll_id: payrollId,
            monthly_attendance_id: submission.value.monthly_attendance_id,
          },
          { onConflict: "payroll_id,monthly_attendance_id" },
        )
        .select()
        .single();

      if (entryError || !salaryEntry) {
        return json(
          {
            status: "error",
            message: "Failed to create salary entry",
            error: entryError,
          },
          { status: 500 },
        );
      }
      finalSalaryEntryId = salaryEntry.id;
    }

    let finalPayrollFieldId = submission.value.payrollFields_id;

    if (!finalPayrollFieldId) {
      const { data: newField, error: fieldError } = await supabase
        .from("payroll_fields")
        .upsert(
          {
            payroll_id: payrollId,
            name: submission.value.name,
            type: submission.value.type,
          },
          {
            onConflict: "name,payroll_id",
          },
        )
        .select()
        .single();

      if (fieldError || !newField || !("id" in newField)) {
        return json(
          {
            status: "error",
            message: "Failed to upsert payroll field",
            error: fieldError,
          },
          { status: 500 },
        );
      }

      finalPayrollFieldId = (newField as any).id;
    } else {
      const { error: updateError } = await supabase
        .from("payroll_fields")
        .update({
          name: submission.value.name,
          type: submission.value.type,
        } as any)
        .eq("id", finalPayrollFieldId as any);

      if (updateError) {
        return json(
          {
            status: "error",
            message: "Failed to update payroll field",
            error: updateError,
          },
          { status: 500 },
        );
      }
    }

    let attendanceId = submission.value.monthly_attendance_id;
    if (!attendanceId && finalSalaryEntryId) {
      const result = await supabase
        .from("salary_entries")
        .select("monthly_attendance_id")
        .eq("id", finalSalaryEntryId as any)
        .single();

      if (
        !result.error &&
        result.data &&
        "monthly_attendance_id" in result.data
      ) {
        attendanceId = (result.data as any).monthly_attendance_id ?? undefined;
      }
    }

    const { error: salaryFieldValuesError } = await supabase
      .from("salary_field_values")
      .upsert(
        {
          id: submission.value.salaryFieldValues_id || undefined,
          salary_entry_id: finalSalaryEntryId,
          payroll_field_id: finalPayrollFieldId,
          amount: roundValue(submission.value.amount),
        },
        { onConflict: "salary_entry_id,payroll_field_id" },
      );

    if (salaryFieldValuesError) {
      return json(
        {
          status: "error",
          message: "Salary field value upsert failed",
          error: salaryFieldValuesError,
        },
        { status: 500 },
      );
    }

    if (attendanceId) {
      const savedPayrollFieldIds = new Set<string>();
      if (finalPayrollFieldId) {
        savedPayrollFieldIds.add(finalPayrollFieldId);
      }
      await recalculateAndPersistSalaryEntriesForAttendances({
        supabase,
        attendanceIds: [attendanceId],
        payrollId,
        preserveFieldIds: savedPayrollFieldIds,
      });
    }

    await recalculatePayrollTotals({
      supabase,
      payrollId,
    });

    const { data: payroll } = await supabase
      .from("payroll")
      .select("company_id")
      .eq("id", payrollId)
      .single();

    if (!payroll) {
      return json(
        { status: "error", success: false, message: "Payroll not found" },
        { status: 404 },
      );
    }

    if (!attendanceId) {
      return json(
        {
          status: "error",
          success: false,
          message: "Attendance ID is missing",
        },
        { status: 400 },
      );
    }

    const { data: attendanceRecord } = await supabase
      .from("monthly_attendance")
      .select("month, year")
      .eq("id", attendanceId)
      .single();

    if (!attendanceRecord) {
      return json(
        {
          status: "error",
          success: false,
          message: "Attendance record not found",
        },
        { status: 404 },
      );
    }

    const { data: updatedData, error: queryError } =
      await getSalaryEntriesByPayrollId({
        supabase,
        payrollId,
        month: attendanceRecord.month,
        year: attendanceRecord.year,
        companyId: payroll.company_id,
        attendanceId,
      });

    if (queryError) {
      console.error("Error querying updated salary entry:", queryError);
      return json(
        {
          status: "error",
          success: false,
          message: "Failed to query updated salary entry",
          error: queryError,
        },
        { status: 500 },
      );
    }

    const updatedEntry = updatedData?.[0] || null;

    return json({
      success: true,
      status: "success",
      message: "Salary Entry updated successfully",
      updatedEntry,
      error: null,
    });
  } catch (error) {
    return json(
      {
        status: "error",
        message: "An unexpected error occurred",
        error,
        data: null,
      },
      { status: 500 },
    );
  }
}

export default function UpsertSalaryEntry() {
  const actionData = useActionData<typeof action>();
  const { payrollId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (actionData) {
      if (actionData?.status === "success") {
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_id}${payrollId}`);
        clearCacheEntry(`${cacheKeyPrefix.run_payroll_client_id}${payrollId}`);
        clearExactCacheEntry(cacheKeyPrefix.run_payroll);
        toast({
          title: "Success",
          description: actionData?.message,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description:
            (actionData?.error as any)?.message || actionData?.message,
          variant: "destructive",
        });
        console.error(actionData?.error);
      }
      navigate(`/payroll/run-payroll/${payrollId}${location.search}`, {
        replace: true,
      });
    }
  }, [actionData, location, payrollId, toast, navigate]);

  return null;
}
