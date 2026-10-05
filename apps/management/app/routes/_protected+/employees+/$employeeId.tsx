import { FooterTabs } from "@/components/footer-tabs";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { SecondaryMenu } from "@canny_ecosystem/ui/secondary-menu";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  Link,
  Outlet,
  useLocation,
  useParams,
  useLoaderData,
} from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  getEmployeeBankDetailsById,
  getEmployeeStatutoryDetailsById,
  getEmployeeWorkDetailsByEmployeeId,
  getEmployeeAddressesByEmployeeId,
  getEmployeeGuardiansByEmployeeId,
  getEmployeeById,
} from "@canny_ecosystem/supabase/queries";
import { getEmployeeProfileCompleteness } from "@canny_ecosystem/utils";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseWithHeaders({ request });
  const employeeId = params.employeeId ?? "";

  const [
    statutoryData,
    bankData,
    workData,
    addressData,
    guardianData,
    employeeData,
  ] = await Promise.all([
    getEmployeeStatutoryDetailsById({ supabase, id: employeeId }),
    getEmployeeBankDetailsById({ supabase, id: employeeId }),
    getEmployeeWorkDetailsByEmployeeId({ supabase, employeeId }),
    getEmployeeAddressesByEmployeeId({ supabase, employeeId }),
    getEmployeeGuardiansByEmployeeId({ supabase, employeeId }),
    getEmployeeById({ supabase, id: employeeId }),
  ]);

  const employeeName = [
    employeeData?.data?.first_name,
    employeeData?.data?.middle_name,
    employeeData?.data?.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return json({
    ...getEmployeeProfileCompleteness({
      employee_statutory_details: statutoryData?.data,
      employee_bank_details: bankData?.data,
      work_details: workData?.data,
      employee_addresses: (addressData?.data as any[]) || [],
      employee_guardians: (guardianData?.data as any[]) || [],
      first_name: employeeData?.data?.first_name,
      middle_name: employeeData?.data?.middle_name,
      last_name: employeeData?.data?.last_name,
      primary_mobile_number: employeeData?.data?.primary_mobile_number,
    }),
    employeeName,
    employeeCode: employeeData?.data?.employee_code || "",
  });
}

export default function Employee() {
  const { employeeId } = useParams();
  const { pathname } = useLocation();
  const { isIncomplete, missingFields, employeeName } =
    useLoaderData<typeof loader>();

  const items = [
    { label: "Overview", path: `/employees/${employeeId}/overview` },
    {
      label: "Work Portfolio",
      path: `/employees/${employeeId}/work-portfolio`,
    },
    {
      label: "Salary",
      path: `/employees/${employeeId}/salary`,
    },
    {
      label: "Salary Slips",
      path: `/employees/${employeeId}/salary/slips`,
    },
    { label: "Attendance", path: `/employees/${employeeId}/attendance` },
    {
      label: "Reimbursements",
      path: `/employees/${employeeId}/reimbursements`,
    },
    { label: "Documents", path: `/employees/${employeeId}/documents` },
    {
      label: "Leaves",
      path: `/employees/${employeeId}/leaves`,
    },
    {
      label: "Loans",
      path: `/employees/${employeeId}/loans`,
    },
    {
      label: "Advance",
      path: `/employees/${employeeId}/advances`,
    },
    {
      label: "Letters",
      path: `/employees/${employeeId}/letters`,
    },
    {
      label: "Exit",
      path: `/employees/${employeeId}/payments`,
    },
  ];

  const showBreadcrumbs = pathname.split("/").filter(Boolean).length >= 4;

  return (
    <section className="relative">
      <div className="flex items-center gap-4 py-2.5 px-4 border-b">
        <div className="hidden md:flex md:items-center md:gap-4 w-full">
          <Link
            prefetch="intent"
            to="/employees"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "bg-card w-9 h-9 px-0 rounded-full",
            )}
          >
            <Icon name="chevron-left" size="sm" />
          </Link>
          <SecondaryMenu items={items} pathname={pathname} Link={Link} />
        </div>
        <FooterTabs items={items} pathname={pathname} Link={Link} />
      </div>

      {showBreadcrumbs && (
        <div className="pt-2 pb-1 px-4 hidden md:block">
          <Breadcrumbs
            labels={{ [employeeId as string]: employeeName }}
            minSegments={4}
          />
        </div>
      )}

      {isIncomplete && pathname.endsWith("/overview") && (
        <div className="w-full bg-primary/15 border-b px-4 py-2.5 flex items-center gap-2 overflow-hidden">
          <Icon
            name="exclaimation-triangle"
            className="h-4 w-4 text-yellow-500 flex-shrink-0"
          />
          <p className="text-sm text-primary font-medium">
            Incomplete Profile: Please add {missingFields.join(", ")} to
            complete the profile.
          </p>
        </div>
      )}

      <div className="px-4">
        <Outlet />
      </div>
    </section>
  );
}
