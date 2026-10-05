import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { Icon } from "@canny_ecosystem/ui/icon";

interface Form16DialogProps {
  open: boolean;
  onClose: () => void;
  employee: {
    id: string;
    is_active: boolean;
    companyId: string;
  };
}

export function Form16Dialog({ open, onClose, employee }: Form16DialogProps) {
  const { toast } = useToast();

  const getCurrentFinancialYear = () => {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr
    const currentYear = today.getFullYear();
    if (currentMonth >= 3) {
      return `${currentYear - 1}-${String(currentYear).slice(-2)}`;
    }
    return `${currentYear - 2}-${String(currentYear - 1).slice(-2)}`;
  };

  const getFinancialYearOptions = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    const options: string[] = [];
    for (let i = 0; i < 5; i++) {
      const year = currentStartYear - i;
      options.push(`${year}-${String(year + 1).slice(-2)}`);
    }
    return options;
  };

  const [financialYear, setFinancialYear] = useState(getCurrentFinancialYear());
  const [activeTab, setActiveTab] = useState<
    "details" | "tds" | "salary" | "chapterVia" | "verification"
  >("details");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form Fields State
  const [formData, setFormData] = useState({
    employerName: "",
    employerAddress: "",
    employerPan: "",
    employerTan: "",
    employeeName: "",
    employeeDesignation: "",
    employeePan: "",
    employeeAddressLine1: "",
    employeeAddressLine2: "",
    assessmentYear: "",
    periodFrom: "",
    periodTo: "",
    q1Receipt: "",
    q1TaxDeducted: 0,
    q1TaxDeposited: 0,
    q2Receipt: "",
    q2TaxDeducted: 0,
    q2TaxDeposited: 0,
    q3Receipt: "",
    q3TaxDeducted: 0,
    q3TaxDeposited: 0,
    q4Receipt: "",
    q4TaxDeducted: 0,
    q4TaxDeposited: 0,
    salary17_1: 0,
    salary17_2: 0,
    salary17_3: 0,
    fixedAllowance: 0,
    bonus: 0,
    leave: 0,
    conveyance: 0,
    entertainmentAllowance: 0,
    professionalTax: 0,
    otherIncomeText: "",
    otherIncome: 0,
    providentFund: 0,
    esic: 0,
    lwf: 0,
    other80c: 0,
    other80ccc: 0,
    other80ccd: 0,
    otherChapterVia: 0,
    taxOnTotalIncome: 0,
    educationCess: 0,
    lessRelief89: 0,
    verifierName: "",
    verifierFathersName: "",
    verifierCapacity: "Director",
    place: "AHMEDABAD",
    date: "",
  });

  // Fetch pre-populated data
  useEffect(() => {
    if (!open) return;

    async function fetchPrepopulatedData() {
      setLoading(true);
      try {
        const res = await fetch(
          `/employees/form-16/generate?employeeId=${employee.id}&financialYear=${financialYear}`,
        );
        if (!res.ok) {
          throw new Error("Failed to fetch pre-populated details");
        }
        const data = await res.json();
        setFormData(data);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load pre-populated employee details.",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchPrepopulatedData();
  }, [open, employee.id, financialYear, toast]);

  const handleInputChange = (
    field: keyof typeof formData,
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const formPayload = new FormData();
      formPayload.append("data", JSON.stringify(formData));

      const res = await fetch("/employees/form-16/generate", {
        method: "POST",
        body: formPayload,
      });

      if (!res.ok) {
        throw new Error("Failed to generate Form 16");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Form_16_${formData.employeeName.replace(/\s+/g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Form 16 generated and downloaded successfully.",
      });
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate Form 16 Excel sheet.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const tabs = [
    { id: "details", label: "Basic Info", icon: "user" as const },
    { id: "tds", label: "TDS Summary", icon: "table" as const },
    { id: "salary", label: "Part B: Salary", icon: "input" as const },
    { id: "chapterVia", label: "Chapter VI-A", icon: "check-circle" as const },
    { id: "verification", label: "Verification", icon: "setting" as const },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">
                Generate Form 16
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Customize and generate the statutory Form 16 Excel report.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mr-6">
              <span className="text-xs font-semibold text-muted-foreground select-none">
                FY:
              </span>
              <Select value={financialYear} onValueChange={setFinancialYear}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getFinancialYearOptions().map((fy) => (
                    <SelectItem key={fy} value={fy}>
                      {fy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">
              Pre-populating employee data from payroll...
            </p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden min-h-[350px] py-4">
            {/* Sidebar Tabs */}
            <div className="w-48 flex flex-col gap-1 pr-4 border-r overflow-y-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors text-left",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-accent text-muted-foreground",
                  )}
                >
                  <Icon name={tab.icon} size="sm" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 pl-6 overflow-y-auto pr-2">
              {/* TAB 1: BASIC INFO */}
              {activeTab === "details" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      Employer (Deductor) details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Employer Name
                        </label>
                        <Input
                          value={formData.employerName}
                          onChange={(e) =>
                            handleInputChange("employerName", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Employer Address
                        </label>
                        <Input
                          value={formData.employerAddress}
                          onChange={(e) =>
                            handleInputChange("employerAddress", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          PAN of Deductor
                        </label>
                        <Input
                          value={formData.employerPan}
                          onChange={(e) =>
                            handleInputChange("employerPan", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          TAN of Deductor
                        </label>
                        <Input
                          value={formData.employerTan}
                          onChange={(e) =>
                            handleInputChange("employerTan", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      Employee details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Employee Name
                        </label>
                        <Input
                          value={formData.employeeName}
                          onChange={(e) =>
                            handleInputChange("employeeName", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Designation
                        </label>
                        <Input
                          value={formData.employeeDesignation}
                          onChange={(e) =>
                            handleInputChange(
                              "employeeDesignation",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-xs font-semibold text-muted-foreground">
                          PAN of Employee
                        </label>
                        <Input
                          value={formData.employeePan}
                          onChange={(e) =>
                            handleInputChange("employeePan", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Address Line 1
                        </label>
                        <Input
                          value={formData.employeeAddressLine1}
                          onChange={(e) =>
                            handleInputChange(
                              "employeeAddressLine1",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Address Line 2 (City, State, Pincode)
                        </label>
                        <Input
                          value={formData.employeeAddressLine2}
                          onChange={(e) =>
                            handleInputChange(
                              "employeeAddressLine2",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      Assessment & Period details
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Assessment Year
                        </label>
                        <Input
                          value={formData.assessmentYear}
                          onChange={(e) =>
                            handleInputChange("assessmentYear", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Period From
                        </label>
                        <Input
                          value={formData.periodFrom}
                          onChange={(e) =>
                            handleInputChange("periodFrom", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Period To
                        </label>
                        <Input
                          value={formData.periodTo}
                          onChange={(e) =>
                            handleInputChange("periodTo", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TDS SUMMARY */}
              {activeTab === "tds" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
                    Quarterly TDS Statements & Deposits
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Fill original statement receipt numbers and quarterly TDS
                    amounts.
                  </p>

                  {["q1", "q2", "q3", "q4"].map((qKey) => {
                    const label = qKey.toUpperCase();
                    return (
                      <div
                        key={qKey}
                        className="p-3 border rounded-md grid grid-cols-3 gap-4"
                      >
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-muted-foreground">
                            {label} Receipt Number
                          </label>
                          <Input
                            placeholder="Receipt No."
                            value={(formData as any)[`${qKey}Receipt`]}
                            onChange={(e) =>
                              handleInputChange(
                                `${qKey}Receipt` as any,
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Tax Deducted (Rs.)
                          </label>
                          <Input
                            type="number"
                            value={(formData as any)[`${qKey}TaxDeducted`]}
                            onChange={(e) =>
                              handleInputChange(
                                `${qKey}TaxDeducted` as any,
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Tax Deposited (Rs.)
                          </label>
                          <Input
                            type="number"
                            value={(formData as any)[`${qKey}TaxDeposited`]}
                            onChange={(e) =>
                              handleInputChange(
                                `${qKey}TaxDeposited` as any,
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 3: PART B: SALARY */}
              {activeTab === "salary" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      1. Gross Salary (Sec 17)
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Salary u/s 17(1) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.salary17_1}
                          onChange={(e) =>
                            handleInputChange(
                              "salary17_1",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Perquisites u/s 17(2) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.salary17_2}
                          onChange={(e) =>
                            handleInputChange(
                              "salary17_2",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Profits in lieu u/s 17(3) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.salary17_3}
                          onChange={(e) =>
                            handleInputChange(
                              "salary17_3",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      2. Less: Allowances Exempt u/s 10
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Fixed Allowance (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.fixedAllowance}
                          onChange={(e) =>
                            handleInputChange(
                              "fixedAllowance",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Bonus (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.bonus}
                          onChange={(e) =>
                            handleInputChange("bonus", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Leave (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.leave}
                          onChange={(e) =>
                            handleInputChange("leave", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Conveyance (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.conveyance}
                          onChange={(e) =>
                            handleInputChange(
                              "conveyance",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      4. Deductions (Sec 16) & 7. Other Income
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Entertainment Allowance (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.entertainmentAllowance}
                          onChange={(e) =>
                            handleInputChange(
                              "entertainmentAllowance",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Tax on Employment (PT) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.professionalTax}
                          onChange={(e) =>
                            handleInputChange(
                              "professionalTax",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Other Income Text
                        </label>
                        <Input
                          placeholder="e.g. Interest Income"
                          value={formData.otherIncomeText}
                          onChange={(e) =>
                            handleInputChange("otherIncomeText", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Other Income Amount (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.otherIncome}
                          onChange={(e) =>
                            handleInputChange(
                              "otherIncome",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: CHAPTER VI-A DEDUCTIONS */}
              {activeTab === "chapterVia" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      9. Chapter VI-A Deductions
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Provident Fund (80C) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.providentFund}
                          onChange={(e) =>
                            handleInputChange(
                              "providentFund",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          ESIC (80C) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.esic}
                          onChange={(e) =>
                            handleInputChange("esic", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          LWF (80C) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.lwf}
                          onChange={(e) =>
                            handleInputChange("lwf", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Other Section 80C (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.other80c}
                          onChange={(e) =>
                            handleInputChange(
                              "other80c",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Section 80CCC (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.other80ccc}
                          onChange={(e) =>
                            handleInputChange(
                              "other80ccc",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Section 80CCD (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.other80ccd}
                          onChange={(e) =>
                            handleInputChange(
                              "other80ccd",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Other Chapter VI-A (e.g. 80D, 80E) (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.otherChapterVia}
                          onChange={(e) =>
                            handleInputChange(
                              "otherChapterVia",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      Tax & Cess Details
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Tax on Total Income (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.taxOnTotalIncome}
                          onChange={(e) =>
                            handleInputChange(
                              "taxOnTotalIncome",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Education Cess (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.educationCess}
                          onChange={(e) =>
                            handleInputChange(
                              "educationCess",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Relief u/s 89 (Rs.)
                        </label>
                        <Input
                          type="number"
                          value={formData.lessRelief89}
                          onChange={(e) =>
                            handleInputChange(
                              "lessRelief89",
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: VERIFICATION */}
              {activeTab === "verification" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                      Certificate & Signatory Verification
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Verifier Full Name
                        </label>
                        <Input
                          value={formData.verifierName}
                          onChange={(e) =>
                            handleInputChange("verifierName", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Verifier Father Name
                        </label>
                        <Input
                          value={formData.verifierFathersName}
                          onChange={(e) =>
                            handleInputChange(
                              "verifierFathersName",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Capacity
                        </label>
                        <Input
                          value={formData.verifierCapacity}
                          onChange={(e) =>
                            handleInputChange(
                              "verifierCapacity",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Place
                        </label>
                        <Input
                          value={formData.place}
                          onChange={(e) =>
                            handleInputChange("place", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Verification Date
                        </label>
                        <Input
                          value={formData.date}
                          onChange={(e) =>
                            handleInputChange("date", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 border-t flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground italic select-none">
            All 3 parts will download in a single Excel sheet.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={loading || generating}
              onClick={handleGenerate}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {generating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </div>
              ) : (
                "Generate Excel"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
