import { formatDateToSlash } from "@canny_ecosystem/utils";
import { MarkdownRenderer } from "../markdown-renderer";
import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";
import { CompanyStamp } from "./company-stamp";
import { Signature } from "./signature";
import type { LetterBaseDataType } from "@canny_ecosystem/supabase/letter";
import { LetterFooter } from "@canny_ecosystem/ui/letter-footer";
import { LetterHeader } from "@canny_ecosystem/ui/letter-header";
import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";
import { SalaryStructureDocument } from "./salary-structure-document";

export function LetterDocument({
  data,
}: {
  data: LetterBaseDataType | null;
  baseUrl?: string;
}) {
  if (!data) return null;

  // Clean salary structure token from standard letter body so it is always rendered on its dedicated page
  const contentWithoutSalary = data.content
    ? data.content.replace(
        /(?:<p>)?\s*(?:<[^>]+>|\*\*)*\$\{(?:<[^>]+>)*\s*salaryStructure\s*(?:<[^>]+>)*\}(?:<[^>]+>|\*\*)*\s*(?:<\/p>)?/gi,
        "",
      )
    : "";

  const pages = contentWithoutSalary
    ? contentWithoutSalary
        .split(
          /(?:<p>)?\s*(?:<[^>]+>|\*\*)*\$\{(?:<[^>]+>)*\s*pagebreak\s*(?:<[^>]+>)*\}(?:<[^>]+>|\*\*)*\s*(?:<\/p>)?/gi,
        )
        .filter((p, i) => i === 0 || p.trim().length > 0)
    : [""];

  const hasSalaryStructure = Boolean(
    (data.include_salary_structure ||
      data.content?.includes("${salaryStructure}")) &&
      data.salary_structure_data,
  );

  return (
    <div className="space-y-8 print:space-y-0">
      {/* Letter Pages */}
      {pages.map((pageContent, index) => {
        const isFirstPage = index === 0;
        const isLastPage = index === pages.length - 1;

        return (
          <div
            key={index}
            className={`bg-white text-black p-10 max-w-3xl mx-auto shadow-md print:shadow-none min-h-[1050px] flex flex-col justify-between relative print:min-h-screen ${
              !isFirstPage ? "break-before-page" : ""
            }`}
          >
            <div>
              {isFirstPage ? (
                data.include_letter_header ? (
                  <div className="-mx-10 -mt-10 mb-10 overflow-hidden">
                    <LetterHeader />
                  </div>
                ) : (
                  <div className="h-16" />
                )
              ) : (
                <div className="pt-6" />
              )}

              {isFirstPage && (
                <div className="text-right text-xs font-semibold text-neutral-600 mb-6">
                  Date: {formatDateToSlash(data.date ?? new Date())}
                </div>
              )}

              <div className="space-y-3">
                <MarkdownRenderer content={pageContent} data={data} />
              </div>

              {isLastPage && (
                <div className="mt-8 pt-4 flex justify-between items-end">
                  {data?.include_signatuory && (
                    <div className="text-left relative">
                      <p className="font-bold text-xs">Yours truly,</p>
                      <p className="font-bold text-xs mb-1">
                        {CANNY_MANAGEMENT_SERVICES_NAME}
                      </p>
                      <div className="my-1">
                        <Signature
                          src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/signature.png`}
                        />
                      </div>
                      <p className="text-xs">Director</p>
                    </div>
                  )}

                  {data?.include_employee_signature && (
                    <div className="text-left">
                      <p className="font-bold text-xs mb-6">
                        I accept the contract of employment with the terms and
                        conditions contained thereto
                      </p>
                      <p className="text-xs">_______________________________</p>
                      <p className="font-bold text-xs">
                        {[
                          data.employees?.first_name?.toUpperCase(),
                          data.employees?.last_name?.toUpperCase(),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                      <p className="text-xs">
                        Date: {formatDateToSlash(data.date ?? new Date())}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              {isFirstPage && data.include_letter_footer && (
                <div className="-mx-10 -mb-10 mt-6 overflow-hidden">
                  <LetterFooter />
                </div>
              )}
              {!isLastPage && (
                <div className="absolute bottom-16 right-10">
                  <CompanyStamp />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Salary Structure Page (dedicated separate page) */}
      {hasSalaryStructure && (
        <div className="bg-white text-black p-10 max-w-3xl mx-auto shadow-md print:shadow-none min-h-[1050px] flex flex-col justify-between relative print:min-h-screen break-before-page">
          <div>
            <SalaryStructureDocument
              salaryData={data.salary_structure_data}
              employeeData={data.employees}
              date={data.date}
            />
          </div>
        </div>
      )}
    </div>
  );
}
