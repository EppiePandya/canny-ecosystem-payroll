import React from "react";
import { MultiSelectCombobox } from "@canny_ecosystem/ui/multi-select-combobox";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canny_ecosystem/ui/popover";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";

interface FilterControlsProps {
  searchString: string;
  onSearchChange: (value: string) => void;
  siteOptions: ComboboxSelectOption[];
  departmentOptions: ComboboxSelectOption[];
  projectOptions: ComboboxSelectOption[];
  esicOptions?: ComboboxSelectOption[];
  selectedSiteIds: string[];
  selectedDeptIds: string[];
  selectedProjectIds: string[];
  selectedEsicIds?: string[];
  updateSites: (ids: string[]) => void;
  updateDepts: (ids: string[]) => void;
  updateProjects: (ids: string[]) => void;
  updateEsics?: (ids: string[]) => void;
}

export const FilterControls = React.memo<FilterControlsProps>(
  ({
    siteOptions,
    departmentOptions,
    projectOptions,
    esicOptions = [],
    selectedSiteIds,
    selectedDeptIds,
    selectedProjectIds,
    selectedEsicIds = [],
    updateSites,
    updateDepts,
    updateProjects,
    updateEsics,
  }) => {
    return (
      <div className="flex flex-wrap items-center gap-3 w-full">
        {projectOptions.length > 0 && (
          <div className="flex-1 min-w-[180px] flex items-center gap-1.5">
            <div className="flex-1">
              <MultiSelectCombobox
                label="Projects"
                options={projectOptions}
                value={selectedProjectIds}
                onChange={updateProjects}
                renderItem={(option) => (
                  <div
                    role="option"
                    aria-selected={selectedProjectIds.includes(
                      String(option.value),
                    )}
                  >
                    {option.label}
                  </div>
                )}
                renderSelectedItem={(values) =>
                  values.length > 0
                    ? values.length <= 2
                      ? projectOptions
                          .filter((o) => values.includes(String(o.value)))
                          .map((o) => o.label)
                          .join(", ")
                      : `${values.length} Projects`
                    : ""
                }
              />
            </div>
            {selectedProjectIds.length > 0 && (
              <Button
                type="button"
                variant="muted"
                size="icon"
                onClick={() => updateProjects([])}
                className="h-10 w-10 shrink-0 rounded-md transition-colors"
                title="Clear Projects Filter"
              >
                <Icon name="cross" className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {siteOptions.length > 0 && (
          <div className="flex-1 min-w-[180px] flex items-center gap-1.5">
            <div className="flex-1">
              <MultiSelectCombobox
                label="Sites"
                options={siteOptions}
                value={selectedSiteIds}
                onChange={updateSites}
                renderItem={(option) => (
                  <div
                    role="option"
                    aria-selected={selectedSiteIds.includes(
                      String(option.value),
                    )}
                  >
                    {option.label}
                  </div>
                )}
                renderSelectedItem={(values) =>
                  values.length > 0
                    ? values.length <= 2
                      ? siteOptions
                          .filter((o) => values.includes(String(o.value)))
                          .map((o) => o.label)
                          .join(", ")
                      : `${values.length} Sites`
                    : ""
                }
              />
            </div>
            {selectedSiteIds.length > 0 && (
              <Button
                type="button"
                variant="muted"
                size="icon"
                onClick={() => updateSites([])}
                className="h-10 w-10 shrink-0 rounded-md transition-colors"
                title="Clear Sites Filter"
              >
                <Icon name="cross" className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {departmentOptions.length > 0 && (
          <div className="flex-1 min-w-[180px] flex items-center gap-1.5">
            <div className="flex-1">
              <MultiSelectCombobox
                label="Departments"
                options={departmentOptions}
                value={selectedDeptIds}
                onChange={updateDepts}
                renderItem={(option) => (
                  <div
                    role="option"
                    aria-selected={selectedDeptIds.includes(
                      String(option.value),
                    )}
                  >
                    {option.label}
                  </div>
                )}
                renderSelectedItem={(values) =>
                  values.length > 0
                    ? values.length <= 2
                      ? departmentOptions
                          .filter((o) => values.includes(String(o.value)))
                          .map((o) => o.label)
                          .join(", ")
                      : `${values.length} Depts`
                    : ""
                }
              />
            </div>
            {selectedDeptIds.length > 0 && (
              <Button
                type="button"
                variant="muted"
                size="icon"
                onClick={() => updateDepts([])}
                className="h-10 w-10 shrink-0 rounded-md transition-colors"
                title="Clear Departments Filter"
              >
                <Icon name="cross" className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {esicOptions.length > 0 && (
          <div className="flex-1 min-w-[180px] flex items-center gap-1.5">
            <div className="flex-1">
              <MultiSelectCombobox
                label="Company ESIC"
                options={esicOptions}
                value={selectedEsicIds}
                onChange={updateEsics || (() => {})}
                renderItem={(option) => (
                  <div
                    role="option"
                    aria-selected={selectedEsicIds.includes(
                      String(option.value),
                    )}
                  >
                    {option.label}
                  </div>
                )}
                renderSelectedItem={(values) =>
                  values.length > 0
                    ? values.length <= 2
                      ? esicOptions
                          .filter((o) => values.includes(String(o.value)))
                          .map((o) => o.label)
                          .join(", ")
                      : `${values.length} ESIC IDs`
                    : ""
                }
              />
            </div>
            {selectedEsicIds.length > 0 && (
              <Button
                type="button"
                variant="muted"
                size="icon"
                onClick={() => updateEsics?.([])}
                className="h-10 w-10 shrink-0 rounded-md transition-colors"
                title="Clear ESIC Filter"
              >
                <Icon name="cross" className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 border border-input rounded-md hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors"
            >
              <Icon name="info" size="sm" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4" align="end">
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Icon name="info" className="text-primary h-4 w-4" />
                <h4 className="font-semibold text-sm leading-none">
                  Table Legend
                </h4>
              </div>
              <div className="grid gap-3 pt-1">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-sm bg-purple-600/10 border border-purple-600/30" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Auto Generated
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-sm bg-blue-600/20 border border-blue-600/40" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Invoice Created
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-sm bg-card border border-border" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Database Entries
                  </span>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
