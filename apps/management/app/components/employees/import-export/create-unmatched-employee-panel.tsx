import { useState, useEffect, useRef } from "react";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import {
  generateCompanyPrefix,
  generateEmployeeCodes,
} from "@canny_ecosystem/utils";
import { getLatestEmployeeByCompanyId } from "@canny_ecosystem/supabase/queries";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";

interface UnmatchedEmployee {
  employee_name?: string;
  employee_code?: string;
  uan_number?: string;
  site_id?: string;
  site_name?: string;
  sheet_name?: string;
}

interface CreateUnmatchedEmployeePanelProps {
  unmatchedList: UnmatchedEmployee[];
  companyId: string;
  supabase: any;
  onSuccess: () => void;
  onClose: () => void;
  onSkip?: (emp: UnmatchedEmployee) => void;
  onSkipAll?: () => void;
  siteId?: string;
  siteName?: string;
  existingMatchedEmployeeIds?: string[];
}

export function isValidEmployeeCode(code?: string) {
  if (!code) return false;
  const s = code.trim().toLowerCase();
  return (
    s !== "" &&
    s !== "null" &&
    s !== "undefined" &&
    s !== "n/a" &&
    s !== "na" &&
    s !== "none" &&
    s !== "auto" &&
    s !== "-" &&
    s !== "--" &&
    s !== "." &&
    s !== "new" &&
    s !== "new employee" &&
    s !== "new_employee"
  );
}

export function CreateUnmatchedEmployeePanel({
  unmatchedList,
  companyId,
  supabase,
  onSuccess,
  onClose,
  onSkip,
  onSkipAll,
  siteId,
  siteName,
  existingMatchedEmployeeIds,
}: CreateUnmatchedEmployeePanelProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);
  const [selectedEmp, setSelectedEmp] = useState<UnmatchedEmployee | null>(
    unmatchedList[0] || null,
  );
  const [isOpen, setIsOpen] = useState(false);

  const handleAutoCreateAll = async () => {
    if (unmatchedList.length === 0) return;
    if (creatingRef.current) return;
    creatingRef.current = true;
    setIsCreating(true);

    try {
      // 1. Fetch Company Prefixes
      const { data: companyPrefixes, error: prefixErr } = await supabase
        .from("company_prefix")
        .select("name, is_default, site_id")
        .eq("company_id", companyId);

      if (prefixErr) {
        console.error("Error fetching company prefix:", prefixErr);
      }

      // 2. Fetch Company Name (for fallback prefix generation)
      const { data: companyData, error: companyErr } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .single();

      if (companyErr) {
        console.error("Error fetching company:", companyErr);
      }

      // 3. Find/generate company prefix
      const defaultPrefixRow =
        companyPrefixes?.find((p: any) => p.is_default === true) ||
        companyPrefixes?.find((p: any) => p.site_id === null) ||
        companyPrefixes?.[0];

      const companyPrefix =
        defaultPrefixRow?.name ||
        (companyData?.name ? generateCompanyPrefix(companyData.name) : "EMP");

      // 4. Fetch the latest employee code
      const { data: latestCodeData, error: codeErr } =
        await getLatestEmployeeByCompanyId({
          supabase,
          companyId,
          prefix: companyPrefix,
        });

      if (codeErr) {
        console.error("Error getting latest employee code:", codeErr);
      }

      // 5. Generate employee codes
      const generatedCodes = generateEmployeeCodes(
        companyPrefix,
        unmatchedList.length,
        latestCodeData ?? undefined,
      );

      const splitName = (fullName: string) => {
        const cleanName = (fullName || "Unknown").trim().replace(/\s+/g, " ");
        const parts = cleanName.split(" ");
        let firstName = parts[0] || "Unknown";
        let middleName = "";
        let lastName = "";

        if (parts.length > 2) {
          middleName = parts[1];
          lastName = parts.slice(2).join(" ");
        } else if (parts.length === 2) {
          lastName = parts[1];
        } else {
          lastName = firstName;
        }

        // Satisfy zString.min(3)
        if (firstName.length < 3) firstName = firstName.padEnd(3, ".");
        if (lastName.length < 3) lastName = lastName.padEnd(3, ".");

        return { firstName, middleName, lastName };
      };

      const usedCodes = new Set<string>();
      let genIndex = 0;

      const employeesToInsert = unmatchedList.map((emp) => {
        const { firstName, middleName, lastName } = splitName(
          emp.employee_name || "Unknown",
        );
        let code = emp.employee_code?.trim();

        if (
          !code ||
          !isValidEmployeeCode(code) ||
          usedCodes.has(code.toLowerCase())
        ) {
          while (
            genIndex < generatedCodes.length &&
            usedCodes.has(generatedCodes[genIndex].toLowerCase())
          ) {
            genIndex++;
          }
          if (genIndex < generatedCodes.length) {
            code = generatedCodes[genIndex];
            genIndex++;
          } else {
            code = `${companyPrefix}${Date.now()}_${Math.floor(
              Math.random() * 1000,
            )}`;
          }
        }

        usedCodes.add(code.toLowerCase());

        return {
          company_id: companyId,
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
          employee_code: code,
          is_active: true,
          gender: "male",
          marital_status: "unmarried",
          nationality: "Indian",
        };
      });

      // 7. Insert employees
      const { data: insertedEmployees, error: insertErr } = await supabase
        .from("employees")
        .insert(employeesToInsert)
        .select("id, employee_code, first_name, middle_name, last_name");

      if (insertErr) {
        throw insertErr;
      }

      if (!insertedEmployees || insertedEmployees.length === 0) {
        throw new Error("No employees were created.");
      }

      // Create a map to reliably associate inserted employees back to their original import item
      const codeToOriginalMap = new Map<string, any>();
      unmatchedList.forEach((unmatched, i) => {
        const code = employeesToInsert[i]?.employee_code;
        if (code) {
          codeToOriginalMap.set(code.toLowerCase(), unmatched);
        }
      });

      // 8. Insert statutory details (like UAN)
      const statutoryDetailsToInsert = insertedEmployees
        ?.map((emp: any) => {
          const original = codeToOriginalMap.get(emp.employee_code.toLowerCase());
          if (original?.uan_number && original.uan_number.trim() !== "") {
            return {
              employee_id: emp.id,
              uan_number: original.uan_number.trim(),
              is_esic_applicable: false,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (statutoryDetailsToInsert && statutoryDetailsToInsert.length > 0) {
        const { error: statutoryErr } = await supabase
          .from("employee_statutory_details")
          .insert(statutoryDetailsToInsert);
        if (statutoryErr) {
          console.error("Failed to insert statutory details:", statutoryErr);
        }
      }

      // 9. Determine target site for work details
      const { data: allSites } = await supabase
        .from("sites")
        .select("id, name")
        .eq("company_id", companyId);

      const normalizeStr = (str?: string) =>
        String(str || "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]/g, "");

      let batchTargetSiteId: string | null = siteId || null;

      if (!batchTargetSiteId && siteName && allSites && allSites.length > 0) {
        const normName = normalizeStr(siteName);
        const match = allSites.find((s: any) => {
          const normS = normalizeStr(s.name);
          return (
            normS &&
            normName &&
            (normS === normName ||
              normS.includes(normName) ||
              normName.includes(normS))
          );
        });
        if (match) batchTargetSiteId = match.id;
      }

      if (
        !batchTargetSiteId &&
        existingMatchedEmployeeIds &&
        existingMatchedEmployeeIds.length > 0 &&
        allSites &&
        allSites.length > 0
      ) {
        const validIds = existingMatchedEmployeeIds.filter(Boolean);
        if (validIds.length > 0) {
          const { data: matchedWorkDetails } = await supabase
            .from("work_details")
            .select("site_id")
            .in("employee_id", validIds);

          if (matchedWorkDetails && matchedWorkDetails.length > 0) {
            const siteCounts: Record<string, number> = {};
            matchedWorkDetails.forEach((wd: any) => {
              if (wd.site_id) {
                siteCounts[wd.site_id] = (siteCounts[wd.site_id] || 0) + 1;
              }
            });
            const sorted = Object.entries(siteCounts).sort(
              (a, b) => b[1] - a[1],
            );
            if (sorted.length > 0) {
              batchTargetSiteId = sorted[0][0];
            }
          }
        }
      }

      if (allSites && allSites.length > 0) {
        const fallbackSiteId = batchTargetSiteId || allSites[0].id;

        const workDetailsToInsert = insertedEmployees.map((emp: any) => {
          const original = codeToOriginalMap.get(emp.employee_code.toLowerCase());
          let empSiteId = fallbackSiteId;

          const empSiteHint =
            original?.site_id || original?.site_name || original?.sheet_name;
          if (empSiteHint) {
            const directMatch = allSites.find((s: any) => s.id === empSiteHint);
            if (directMatch) {
              empSiteId = directMatch.id;
            } else {
              const normHint = normalizeStr(empSiteHint);
              const textMatch = allSites.find((s: any) => {
                const normS = normalizeStr(s.name);
                return (
                  normS &&
                  normHint &&
                  (normS === normHint ||
                    normS.includes(normHint) ||
                    normHint.includes(normS))
                );
              });
              if (textMatch) empSiteId = textMatch.id;
            }
          }

          return {
            employee_id: emp.id,
            site_id: empSiteId,
            position: "sampler",
            skill_level: "unskilled",
            assignment_type: "full_time",
            start_date: new Date().toISOString().split("T")[0],
          };
        });

        const { error: workErr } = await supabase
          .from("work_details")
          .insert(workDetailsToInsert);
        if (workErr) {
          console.error("Failed to insert work details:", workErr);
        }
      }

      toast({
        title: "Success",
        description: `Successfully auto-created ${insertedEmployees.length} employee(s).`,
        variant: "success",
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Auto-creation error:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to auto-create employees.",
        variant: "destructive",
      });
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (
      unmatchedList.length > 0 &&
      (!selectedEmp || !unmatchedList.includes(selectedEmp))
    ) {
      setSelectedEmp(unmatchedList[0]);
    }
  }, [unmatchedList, selectedEmp]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "EMPLOYEE_CREATED") {
        onSuccess();
        setIsOpen(false);
        const next = unmatchedList.find(
          (e) =>
            e.employee_code !== event.data.employeeCode &&
            e.employee_code !== selectedEmp?.employee_code,
        );
        if (next) {
          setSelectedEmp(next);
        } else {
          setSelectedEmp(null);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [unmatchedList, selectedEmp, onSuccess]);

  if (isOpen) {
    return (
      <div className="flex flex-col gap-4 h-[75vh] max-h-[700px] w-full">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="font-semibold text-lg text-amber-800 dark:text-amber-400">
              Register Employee Profile
            </h3>
            <p className="text-xs text-muted-foreground">
              Registering:{" "}
              <span className="font-bold text-foreground">
                {selectedEmp?.employee_name || "Unknown"}
              </span>
              {selectedEmp?.employee_code &&
                ` (Code: ${selectedEmp.employee_code})`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-left" size="sm" className="mr-1.5" />
            Back to List
          </Button>
        </div>
        <div className="flex-1 min-h-0 relative bg-background rounded-lg border">
          <iframe
            src={`/employees/create-employee?embed=true`}
            className="w-full h-full border-none"
            title="Create Employee Form"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/50 p-5 rounded-xl shadow-sm w-full">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-semibold text-lg flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            Unmatched Employees Found ({unmatchedList.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            We found {unmatchedList.length} employee(s) in your spreadsheet that
            do not have profiles in the system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isCreating}
          >
            Close Preview
          </Button>
          {onSkipAll && (
            <Button
              variant="outline"
              size="sm"
              className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-100/50"
              onClick={onSkipAll}
              disabled={isCreating}
            >
              Skip All
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
            onClick={() => setIsOpen(true)}
            disabled={isCreating}
          >
            Register Missing Staff
          </Button>
          <Button
            variant="default"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1.5"
            onClick={handleAutoCreateAll}
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <LoadingSpinner className="h-4 w-4 text-white animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Icon name="plus" size="sm" />
                Auto-Create All
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {unmatchedList.map((emp, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-2xs relative group"
          >
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {emp.employee_name || "Unknown Name"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Code:{" "}
                {emp.employee_code && isValidEmployeeCode(emp.employee_code)
                  ? emp.employee_code
                  : "Auto-generate"}{" "}
                | UAN: {emp.uan_number || "N/A"}
              </p>
            </div>
            {onSkip && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-500 shrink-0"
                onClick={() => onSkip(emp)}
                title="Skip this employee"
                disabled={isCreating}
              >
                <Icon name="cross" size="xs" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
