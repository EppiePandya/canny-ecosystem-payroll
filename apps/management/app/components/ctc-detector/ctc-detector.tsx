import { useCallback, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@canny_ecosystem/ui/card";
import { Button } from "@canny_ecosystem/ui/button";
import { Input } from "@canny_ecosystem/ui/input";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Label } from "@canny_ecosystem/ui/label";

import { cn } from "@canny_ecosystem/ui/utils/cn";
import { CTCSummaryPanel } from "./ctc-summary-panel";
import { calculateCTC } from "./calculations";
import { CTC_DETECTOR_DEFAULTS } from "./constants";
import type {
  BasicComponent,
  CTCFormValues,
  EarningRow,
  PercentageComponentRow,
  StatutorySettings,
} from "./types";

function FieldGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function InlineCheckbox({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
      />
      <Label htmlFor={id} className="text-xs font-normal cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
  );
}

export function CTCDetector() {
  const [workingDays, setWorkingDays] = useState(
    CTC_DETECTOR_DEFAULTS.working_days,
  );
  const [basic, setBasic] = useState<BasicComponent>(
    CTC_DETECTOR_DEFAULTS.basic,
  );
  const [earnings, setEarnings] = useState<EarningRow[]>(
    CTC_DETECTOR_DEFAULTS.earnings,
  );
  const [percentageComponents, setPercentageComponents] = useState<
    PercentageComponentRow[]
  >(CTC_DETECTOR_DEFAULTS.percentage_components);
  const [statutory, setStatutory] = useState<StatutorySettings>(
    CTC_DETECTOR_DEFAULTS.statutory,
  );

  const values = useMemo<CTCFormValues>(
    () => ({
      working_days: workingDays,
      basic,
      earnings,
      percentage_components: percentageComponents,
      statutory,
    }),
    [workingDays, basic, earnings, percentageComponents, statutory],
  );

  const result = useMemo(() => calculateCTC(values), [values]);

  const addEarning = useCallback(() => {
    setEarnings((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        amount: 0,
        is_monthly: true,
        consider_for_pf: false,
        consider_for_esic: false,
      },
    ]);
  }, []);

  const removeEarning = useCallback((id: string) => {
    setEarnings((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateEarning = useCallback(
    (id: string, patch: Partial<EarningRow>) => {
      setEarnings((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );
    },
    [],
  );

  const addPC = useCallback(() => {
    setPercentageComponents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        percentage: 0,
        based_on: "basic" as const,
        consider_for_pf: false,
        consider_for_esic: false,
      },
    ]);
  }, []);

  const removePC = useCallback((id: string) => {
    setPercentageComponents((prev) => prev.filter((pc) => pc.id !== id));
  }, []);

  const updatePC = useCallback(
    (id: string, patch: Partial<PercentageComponentRow>) => {
      setPercentageComponents((prev) =>
        prev.map((pc) => (pc.id === id ? { ...pc, ...patch } : pc)),
      );
    },
    [],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-6 px-4 lg:px-10 xl:px-14 2xl:px-40 py-6 items-start">
      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Working Days</CardTitle>
            <CardDescription>
              Number of actual working days for pro-rata calculations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup label="Working Days" className="max-w-[180px]">
              <Input
                type="number"
                min={1}
                max={31}
                value={workingDays}
                onChange={(e) =>
                  setWorkingDays(Math.max(1, Number(e.target.value) || 1))
                }
                className="h-9"
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Basic Component</CardTitle>
            <CardDescription>
              Define the basic salary amount and how it should be calculated.
              Effective Basic = Amount when monthly; else (Amount ÷ Formula
              Days) × Working Days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Basic Amount (₹)">
                <Input
                  type="number"
                  min={0}
                  value={basic.basic_amount || ""}
                  onChange={(e) =>
                    setBasic((b) => ({
                      ...b,
                      basic_amount: Number(e.target.value) || 0,
                    }))
                  }
                  placeholder="e.g. 15000"
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground italic mt-1 px-1">
                  {basic.is_monthly
                    ? `₹${basic.basic_amount} ÷ ${workingDays} days = ₹${(basic.basic_amount / workingDays).toFixed(2)} / day`
                    : `₹${basic.basic_amount} × ${workingDays} days = ₹${(basic.basic_amount * workingDays).toFixed(2)} total`}
                </p>
              </FieldGroup>
            </div>
            <div className="flex flex-wrap gap-5 pt-1">
              <InlineCheckbox
                id="basic-is-monthly"
                label="Is Monthly"
                checked={basic.is_monthly}
                onCheckedChange={(v) =>
                  setBasic((b) => ({ ...b, is_monthly: v }))
                }
              />
              <InlineCheckbox
                id="basic-pf"
                label="Consider For PF"
                checked={basic.consider_for_pf}
                onCheckedChange={(v) =>
                  setBasic((b) => ({ ...b, consider_for_pf: v }))
                }
              />
              <InlineCheckbox
                id="basic-esic"
                label="Consider For ESIC"
                checked={basic.consider_for_esic}
                onCheckedChange={(v) =>
                  setBasic((b) => ({ ...b, consider_for_esic: v }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Earnings</CardTitle>
            <CardDescription>
              Add salary components. Monthly = full amount; Non-monthly =
              (Amount ÷ Formula Days) × Working Days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {earnings.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No earnings added yet.
              </p>
            )}
            {earnings.map((earning, index) => (
              <div
                key={earning.id}
                className="rounded border bg-muted/30 p-4 space-y-3 relative"
              >
                <div className="absolute top-3 right-3">
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => removeEarning(earning.id)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-20">
                  <FieldGroup label="Name">
                    <Input
                      type="text"
                      value={earning.name}
                      onChange={(e) =>
                        updateEarning(earning.id, { name: e.target.value })
                      }
                      placeholder={`Earning ${index + 1}`}
                      className="h-9"
                    />
                  </FieldGroup>
                  <FieldGroup label="Amount (₹)">
                    <Input
                      type="number"
                      min={0}
                      value={earning.amount || ""}
                      onChange={(e) =>
                        updateEarning(earning.id, {
                          amount: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground italic mt-1 px-1">
                      {earning.is_monthly
                        ? `₹${earning.amount} ÷ ${workingDays} days = ₹${(earning.amount / workingDays).toFixed(2)} / day`
                        : `₹${earning.amount} × ${workingDays} days = ₹${(earning.amount * workingDays).toFixed(2)} total`}
                    </p>
                  </FieldGroup>
                </div>
                <div className="flex flex-wrap gap-5">
                  <InlineCheckbox
                    id={`earning-${earning.id}-monthly`}
                    label="Is Monthly"
                    checked={earning.is_monthly}
                    onCheckedChange={(v) =>
                      updateEarning(earning.id, { is_monthly: v })
                    }
                  />
                  <InlineCheckbox
                    id={`earning-${earning.id}-pf`}
                    label="Consider For PF"
                    checked={earning.consider_for_pf}
                    onCheckedChange={(v) =>
                      updateEarning(earning.id, { consider_for_pf: v })
                    }
                  />
                  <InlineCheckbox
                    id={`earning-${earning.id}-esic`}
                    label="Consider For ESIC"
                    checked={earning.consider_for_esic}
                    onCheckedChange={(v) =>
                      updateEarning(earning.id, { consider_for_esic: v })
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="primary-outline"
              size="sm"
              onClick={addEarning}
            >
              + Add Earning
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Percentage Components</CardTitle>
            <CardDescription>
              Components calculated as % of Effective Basic (e.g. HRA 50%).
              Non-monthly: value = (Basic × %) ÷ 30 × Working Days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {percentageComponents.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No percentage components added yet.
              </p>
            )}
            {percentageComponents.map((pc, index) => (
              <div
                key={pc.id}
                className="rounded border bg-muted/30 p-4 space-y-3 relative"
              >
                <div className="absolute top-3 right-3">
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => removePC(pc.id)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-20">
                  <FieldGroup label="Name">
                    <Input
                      type="text"
                      value={pc.name}
                      onChange={(e) =>
                        updatePC(pc.id, { name: e.target.value })
                      }
                      placeholder={`Component ${index + 1}`}
                      className="h-9"
                    />
                  </FieldGroup>
                  <FieldGroup label="Percentage (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={pc.percentage || ""}
                      onChange={(e) =>
                        updatePC(pc.id, {
                          percentage: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="e.g. 50"
                      className="h-9"
                    />
                  </FieldGroup>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Based on: <span className="font-medium">Effective Basic</span>
                </p>
                <div className="flex flex-wrap gap-5">
                  <InlineCheckbox
                    id={`pc-${pc.id}-pf`}
                    label="Consider For PF"
                    checked={pc.consider_for_pf}
                    onCheckedChange={(v) =>
                      updatePC(pc.id, { consider_for_pf: v })
                    }
                  />
                  <InlineCheckbox
                    id={`pc-${pc.id}-esic`}
                    label="Consider For ESIC"
                    checked={pc.consider_for_esic}
                    onCheckedChange={(v) =>
                      updatePC(pc.id, { consider_for_esic: v })
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="primary-outline"
              size="sm"
              onClick={addPC}
            >
              + Add Percentage Component
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Statutory Settings</CardTitle>
            <CardDescription>
              Configure employer PF, ESIC, and PTAX contributions that add to
              the final CTC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-4 pb-2 border-b">
                <SectionHeading title="Provident Fund (PF)" />
                <InlineCheckbox
                  id="pf-enabled"
                  label="Enabled"
                  checked={statutory.pf_enabled}
                  onCheckedChange={(v) =>
                    setStatutory((s) => ({ ...s, pf_enabled: v }))
                  }
                />
              </div>
              <div
                className={cn(
                  "transition-opacity",
                  !statutory.pf_enabled &&
                    "opacity-40 pointer-events-none select-none",
                )}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="PF Percentage (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={statutory.pf_percentage}
                      onChange={(e) =>
                        setStatutory((s) => ({
                          ...s,
                          pf_percentage: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-9"
                    />
                  </FieldGroup>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 mt-6">
                      <InlineCheckbox
                        id="pf-limit-enabled"
                        label="Enable PF Limit"
                        checked={statutory.pf_limit_enabled}
                        onCheckedChange={(v) =>
                          setStatutory((s) => ({ ...s, pf_limit_enabled: v }))
                        }
                      />
                    </div>
                    {statutory.pf_limit_enabled && (
                      <FieldGroup label="PF Wage Ceiling (₹)">
                        <Input
                          type="number"
                          min={0}
                          value={statutory.pf_limit}
                          onChange={(e) =>
                            setStatutory((s) => ({
                              ...s,
                              pf_limit: Number(e.target.value) || 0,
                            }))
                          }
                          className="h-9"
                        />
                      </FieldGroup>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Applied on PF-eligible wages. Mark components with "Consider
                  For PF".
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4 pb-2 border-b">
                <SectionHeading title="Employee State Insurance (ESIC)" />
                <InlineCheckbox
                  id="esic-enabled"
                  label="Enabled"
                  checked={statutory.esic_enabled}
                  onCheckedChange={(v) =>
                    setStatutory((s) => ({ ...s, esic_enabled: v }))
                  }
                />
              </div>
              <div
                className={cn(
                  "transition-opacity",
                  !statutory.esic_enabled &&
                    "opacity-40 pointer-events-none select-none",
                )}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="ESIC Percentage (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={statutory.esic_percentage}
                      onChange={(e) =>
                        setStatutory((s) => ({
                          ...s,
                          esic_percentage: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-9"
                    />
                  </FieldGroup>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 mt-6">
                      <InlineCheckbox
                        id="esic-limit-enabled"
                        label="Enable ESIC Threshold"
                        checked={statutory.esic_limit_enabled}
                        onCheckedChange={(v) =>
                          setStatutory((s) => ({ ...s, esic_limit_enabled: v }))
                        }
                      />
                    </div>
                    {statutory.esic_limit_enabled && (
                      <FieldGroup label="ESIC Threshold (₹)">
                        <Input
                          type="number"
                          min={0}
                          value={statutory.esic_limit}
                          onChange={(e) =>
                            setStatutory((s) => ({
                              ...s,
                              esic_limit: Number(e.target.value) || 0,
                            }))
                          }
                          className="h-9"
                        />
                      </FieldGroup>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Applied on ESIC-eligible wages. Mark components with "Consider
                  For ESIC". If wages exceed threshold, deduction is 0.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="pb-2 border-b">
                <SectionHeading
                  title="Professional Tax (PTAX)"
                  description="Fixed monthly amount added directly to employer contributions."
                />
              </div>
              <FieldGroup label="PTAX Amount (₹)" className="max-w-[200px]">
                <Input
                  type="number"
                  min={0}
                  value={statutory.ptax_amount || ""}
                  onChange={(e) =>
                    setStatutory((s) => ({
                      ...s,
                      ptax_amount: Number(e.target.value) || 0,
                    }))
                  }
                  placeholder="e.g. 200"
                  className="h-9"
                />
              </FieldGroup>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-full">
        <CTCSummaryPanel result={result} />
      </div>
    </div>
  );
}
