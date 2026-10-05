import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Fragment, useState, useEffect } from "react";
import { statesAndUTs } from "@canny_ecosystem/utils/constant";
import { Label } from "@canny_ecosystem/ui/label";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canny_ecosystem/ui/select";
import { ScrollArea } from "@canny_ecosystem/ui/scroll-area";
import { Badge } from "@canny_ecosystem/ui/badge";
import { Icon } from "@canny_ecosystem/ui/icon";

type StateConfig = {
  value: string;
  label: string;
  zone: "A" | "B" | "C";
  isCentral: boolean;
};

type CentralConfig = {
  type: string;
  label: string;
  zone: "A" | "B" | "C";
};

const centralRuleTypes = [
  { value: "construction", label: "Construction" },
  { value: "mining", label: "Mining" },
  { value: "agriculture", label: "Agriculture" },
  { value: "sweeping", label: "Sweeping/Cleaning" },
  { value: "watch", label: "Watch & Ward" },
  { value: "loading", label: "Loading/Unloading" },
  { value: "stone_breaking", label: "Stone Breaking" },
  { value: "non_scheduled", label: "Non-Scheduled Employment" },
];

export function CreateCompanyRegionalDetails() {
  const [selectedStateValues, setSelectedStateValues] = useState<string[]>([]);
  const [selectedCentralValues, setSelectedCentralValues] = useState<string[]>(
    [],
  );
  const [stateConfigs, setStateConfigs] = useState<StateConfig[]>([]);
  const [centralConfigs, setCentralConfigs] = useState<CentralConfig[]>([]);

  useEffect(() => {
    setStateConfigs((prev) => {
      const newConfigs = selectedStateValues.map((val) => {
        const existing = prev.find((p) => p.value === val);
        if (existing) return existing;
        const state = statesAndUTs.find((s) => s.value === val);
        return {
          value: val,
          label: state?.label || val,
          zone: "A" as const,
          isCentral: false,
        };
      });
      return newConfigs;
    });
  }, [selectedStateValues]);

  useEffect(() => {
    setCentralConfigs((prev) => {
      const newConfigs = selectedCentralValues.map((val) => {
        const existing = prev.find((p) => p.type === val);
        if (existing) return existing;
        const type = centralRuleTypes.find((c) => c.value === val);
        return {
          type: val,
          label: type?.label || val,
          zone: "A" as const,
        };
      });
      return newConfigs;
    });
  }, [selectedCentralValues]);

  const toggleState = (value: string) => {
    setSelectedStateValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const toggleCentral = (value: string) => {
    setSelectedCentralValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const updateZone = (value: string, zone: "A" | "B" | "C") => {
    setStateConfigs((prev) =>
      prev.map((p) => (p.value === value ? { ...p, zone } : p)),
    );
  };

  const updateCentralZone = (type: string, zone: "A" | "B" | "C") => {
    setCentralConfigs((prev) =>
      prev.map((p) => (p.type === type ? { ...p, zone } : p)),
    );
  };

  return (
    <Fragment>
      <input
        type="hidden"
        name="manual_states_json"
        value={JSON.stringify({
          states: stateConfigs.map((c) => ({ name: c.label, zone: c.zone })),
          centralRules: centralConfigs.map((c) => ({
            type: c.type,
            label: c.label,
            zone: c.zone,
          })),
        })}
      />

      <CardHeader>
        <CardTitle className="text-3xl capitalize">
          Regional & Statutory Settings
        </CardTitle>
        <CardDescription>
          Configure states and central categories individually for automated
          payroll compliance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-6">
          <Label className="text-xl font-bold">1. Select Rules & States</Label>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Operating States
              </Label>
              <ScrollArea className="h-[200px] w-full border rounded-xl p-4 bg-muted/5 shadow-inner">
                <div className="grid grid-cols-2 gap-3">
                  {statesAndUTs.map((state) => (
                    <div
                      key={state.value}
                      className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded transition-colors group"
                    >
                      <Checkbox
                        id={`state-${state.value}`}
                        checked={selectedStateValues.includes(state.value)}
                        onCheckedChange={() => toggleState(state.value)}
                        className="group-hover:border-primary"
                      />
                      <Label
                        htmlFor={`state-${state.value}`}
                        className="text-xs font-medium cursor-pointer flex-1"
                      >
                        {state.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Central Government Rules
              </Label>
              <ScrollArea className="h-[200px] w-full border rounded-xl p-4 bg-muted/5 shadow-inner">
                <div className="grid grid-cols-1 gap-3">
                  {centralRuleTypes.map((rule) => (
                    <div
                      key={rule.value}
                      className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded transition-colors group"
                    >
                      <Checkbox
                        id={`central-${rule.value}`}
                        checked={selectedCentralValues.includes(rule.value)}
                        onCheckedChange={() => toggleCentral(rule.value)}
                      />
                      <Label
                        htmlFor={`central-${rule.value}`}
                        className="text-xs font-medium cursor-pointer flex-1"
                      >
                        {rule.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <hr className="border-muted/50" />

        <div className="space-y-4">
          <Label className="text-lg font-bold">
            2. Assign Zones for Minimum Wages
          </Label>
          <div className="space-y-3">
            {selectedStateValues.length === 0 &&
              selectedCentralValues.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/5">
                  No states or rules selected. Please select them above to
                  configure their zones.
                </div>
              )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stateConfigs.map((config) => (
                <div
                  key={config.value}
                  className="flex flex-col gap-3 p-4 border rounded-xl bg-background hover:border-primary/50 transition-all shadow-sm relative group animate-in zoom-in duration-200"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="border-primary/30 max-w-[150px] truncate"
                    >
                      {config.label}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => toggleState(config.value)}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Icon name="cross" size="sm" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Minimum Wage Zone
                    </Label>
                    <Select
                      value={config.zone}
                      onValueChange={(v: any) => updateZone(config.value, v)}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Zone A (Major Cities)</SelectItem>
                        <SelectItem value="B">
                          Zone B (Industrial Hubs)
                        </SelectItem>
                        <SelectItem value="C">
                          Zone C (Rural / Other)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {centralConfigs.length > 0 && (
              <div className="pt-6 mt-2 border-t border-muted/50 space-y-4">
                <Label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  Central Rules Configuration
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {centralConfigs.map((config) => (
                    <div
                      key={config.type}
                      className="flex flex-col gap-3 p-4 border rounded-xl bg-background hover:border-primary/50 transition-all shadow-sm relative group animate-in zoom-in duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className="border-primary/30 max-w-[150px] truncate"
                        >
                          {config.label}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => toggleCentral(config.type)}
                          className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Icon name="cross" size="sm" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                          Minimum Wage Zone
                        </Label>
                        <Select
                          value={config.zone}
                          onValueChange={(v: any) =>
                            updateCentralZone(config.type, v)
                          }
                        >
                          <SelectTrigger className="w-full h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">Zone A</SelectItem>
                            <SelectItem value="B">Zone B</SelectItem>
                            <SelectItem value="C">Zone C</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Fragment>
  );
}
