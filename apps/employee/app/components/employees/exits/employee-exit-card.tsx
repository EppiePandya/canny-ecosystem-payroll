import { Card } from "@canny_ecosystem/ui/card";
import { Link } from "@remix-run/react";
import type { EmployeeExitRow } from "@canny_ecosystem/supabase/types";
import { formatDate, replaceUnderscore } from "@canny_ecosystem/utils";

type DeathExit = {
  id: string;
  death_reason?: string | null;
  date_of_death?: string | null;
  on_duty_esic?: boolean | null;
};

type WorkDetails = {
  sites?: {
    name?: string | null;
    projects?: {
      name?: string | null;
    } | null;
  } | null;
};

type ExitWithRelations = Omit<EmployeeExitRow, "created_at"> & {
  death_exit?: DeathExit | null;
  work_details?: WorkDetails | null;
};

type DetailItemProps = {
  label: string;
  value?: string | number | null;
  linkText?: string;
  to?: string;
};

const DetailItem = ({ label, value, linkText, to }: DetailItemProps) => {
  return (
    <div className="flex flex-col">
      <p className="text-muted-foreground text-[13px] tracking-wide capitalize">
        {label}
      </p>

      {to ? (
        <Link
          to={to}
          className="text-primary cursor-pointer truncate w-72 hover:underline"
        >
          {linkText}
        </Link>
      ) : (
        <p className="truncate w-72">{value ?? "--"}</p>
      )}
    </div>
  );
};

const booleanToText = (value?: boolean | null) =>
  value === true ? "Yes" : value === false ? "No" : "--";

export const ExitsItem = ({
  exitsData,
  employeeId,
}: {
  exitsData: ExitWithRelations;
  employeeId: string;
}) => {
  const siteProjectLabel = exitsData.work_details
    ? `${exitsData.work_details?.sites?.name ?? "--"} — ${
        exitsData.work_details?.sites?.projects?.name ?? "--"
      }`
    : "--";

  return (
    <section className="w-full p-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="Site / Project" value={siteProjectLabel} />
        <DetailItem
          label="Exit Reason"
          value={replaceUnderscore(exitsData.exit_reason)}
        />
        <DetailItem label="Note" value={exitsData.note} />

        <DetailItem
          label="Gratuity Form I"
          linkText="Open"
          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exitsData.id}/gratuity-form-i`}
        />
        <DetailItem
          label="Gratuity Form L"
          linkText="Open"
          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exitsData.id}/gratuity-form-l`}
        />
        <DetailItem
          label="Full & Final Form"
          linkText="Open"
          to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exitsData.id}/full-and-final-form`}
        />
      </div>
    </section>
  );
};

export const EmployeeExitsCard = ({
  exitsData,
  employeeId,
}: {
  exitsData: ExitWithRelations | ExitWithRelations[] | null | undefined;
  employeeId: string;
}) => {
  const exitsArray: ExitWithRelations[] = Array.isArray(exitsData)
    ? exitsData
    : exitsData
      ? [exitsData]
      : [];

  return (
    <Card className="rounded w-full p-2">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Exits</h2>
      </div>

      {exitsArray.length === 0 ? (
        <div className="text-center py-4">Exit data not found</div>
      ) : (
        <div className="flex flex-col gap-4">
          {exitsArray.map((exit, index) => (
            <Card key={exit.id} className="border shadow-none p-2">
              <h3 className="font-semibold mb-2">Exit {index + 1}</h3>
              <ExitsItem exitsData={exit} employeeId={employeeId} />

              {exit.death_exit && (
                <div className="mt-2">
                  <Card className="border shadow-none p-2">
                    <h4 className="font-semibold mb-2">Death Exit Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      <DetailItem
                        label="Cause Of Death"
                        value={replaceUnderscore(
                          exit.death_exit.death_reason ?? "--",
                        )}
                      />
                      <DetailItem
                        label="Date Of Death"
                        value={
                          exit.death_exit.date_of_death
                            ? formatDate(exit.death_exit.date_of_death)
                            : "--"
                        }
                      />
                      <DetailItem
                        label="On Duty (ESIC)"
                        value={booleanToText(exit.death_exit.on_duty_esic)}
                      />
                      <DetailItem
                        label="EPF Form 5 & 10"
                        linkText="Open"
                        to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/EPF_form_5_10`}
                      />
                      <DetailItem
                        label="ESIC Claim (Accident)"
                        linkText="Open"
                        to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/ESIC_claim_form`}
                      />
                      <DetailItem
                        label="Form 20_10D"
                        linkText="Open"
                        to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/form_20_10D`}
                      />
                      <DetailItem
                        label="LSM"
                        linkText="Open"
                        to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/LSM`}
                      />
                      <DetailItem
                        label="Particulars Of The Member"
                        linkText="Open"
                        to={`/employees/${employeeId}/payments/pdf-preview?file=/employees/${employeeId}/payments/${exit.id}/particulars-member`}
                      />
                    </div>
                  </Card>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
};
