import type { ActionFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import { generateIdCardsPdf } from "@/components/employees/pdf/id-card-pdf";
import {
  getEmployeesByIds,
  getCompanyById,
  getLocationsByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const employeeIdsRaw = formData.get("employeeIds")?.toString();

  if (!employeeIdsRaw) {
    return new Response(
      JSON.stringify({ message: "Employee IDs are required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { supabase } = getSupabaseWithHeaders({ request });
  const employeeIds = employeeIdsRaw.split(",");

  const { companyId } = await getCompanyIdOrFirstCompany(request, supabase);
  if (!companyId) throw new Error("Company ID Not Found");

  const { data: companyDetails } = await getCompanyById({
    supabase,
    id: companyId,
  });
  const { data: companyLocation } = await getLocationsByCompanyId({
    supabase,
    companyId: companyId,
  });

  if (!companyDetails) throw new Error("Company Details Not Found");

  const { data: employees, error } = await getEmployeesByIds({
    supabase,
    employeeIds,
  });

  if (error || !employees) {
    return new Response(
      JSON.stringify({ message: "Failed to fetch employees" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const employeesData = employees.map((employee) => {
    const employeeFullName = [
      employee.first_name,
      employee.middle_name,
      employee.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    const primaryAddress =
      employee.employee_addresses?.find((a: any) => a.is_primary) ??
      employee.employee_addresses?.[0];

    const formattedAddress = primaryAddress
      ? `${[
          primaryAddress.address_line_1,
          primaryAddress.city,
          primaryAddress.state,
        ]
          .filter(Boolean)
          .join(", ")} - ${primaryAddress.pincode || ""}`
      : "Not Found";

    const today = new Date().toISOString().split("T")[0];
    const workDetailsArray = Array.isArray(employee.work_details)
      ? employee.work_details
      : employee.work_details
        ? [employee.work_details]
        : [];

    const activeWorkDetail = workDetailsArray.find(
      (wd: any) =>
        wd.start_date <= today && (!wd.end_date || wd.end_date >= today),
    );

    const workDetails = activeWorkDetail || workDetailsArray[0];
    const site = workDetails?.sites;

    return {
      id: employee.id,
      name: employeeFullName,
      employeeCode: employee.employee_code,
      photoUrl: employee.photo || null,
      dateOfBirth: employee.date_of_birth,
      dateOfJoining: workDetails?.start_date || null,
      designation: workDetails?.position || null,
      mobileNumber: employee.primary_mobile_number,
      address: formattedAddress,
      contractLocation: site?.name || null,
      companyName: companyDetails.name || "Company Name",
      companyPrimaryNumber: companyDetails.primary_number,
      companySecondaryNumber: companyDetails.secondary_number,
      companyAddress:
        `${companyLocation?.[0]?.address_line_1 || "Company Address"} ${companyLocation?.[0]?.pincode || ""}, ${companyLocation?.[0]?.city || ""}`.trim(),
    };
  });

  if (employeesData.length === 0) {
    return new Response(
      JSON.stringify({ message: "No valid employees found" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  try {
    const pdfBuffer = await generateIdCardsPdf(employeesData);

    return new Response(pdfBuffer as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=id_cards.pdf`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return new Response(JSON.stringify({ message: "Error generating PDF" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
