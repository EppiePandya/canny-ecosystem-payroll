import { useMemo, useCallback } from "react";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import { useSearchParams } from "@remix-run/react";

export const useSalaryData = (
  data: any[],
  options?: {
    siteOptions?: ComboboxSelectOption[];
    departmentOptions?: ComboboxSelectOption[];
    projectOptions?: ComboboxSelectOption[];
    esicOptions?: ComboboxSelectOption[];
  },
) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.get("search") || "";
  const setSearchString = useCallback(
    (val: string) => {
      const newParams = new URLSearchParams(searchParams);
      if (!val) newParams.delete("search");
      else newParams.set("search", val);
      newParams.set("page", "1");
      setSearchParams(newParams, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  const selectedSiteIds =
    searchParams.get("siteIds")?.split(",").filter(Boolean) || [];
  const selectedDeptIds =
    searchParams.get("departmentIds")?.split(",").filter(Boolean) || [];
  const selectedProjectIds =
    searchParams.get("projectIds")?.split(",").filter(Boolean) || [];
  const selectedEsicIds =
    searchParams.get("esicIds")?.split(",").filter(Boolean) || [];

  const { siteOptions, departmentOptions, projectOptions, esicOptions } =
    useMemo(() => {
      if (
        options?.siteOptions ||
        options?.departmentOptions ||
        options?.projectOptions ||
        options?.esicOptions
      ) {
        return {
          siteOptions: options.siteOptions || [],
          departmentOptions: options.departmentOptions || [],
          projectOptions: options.projectOptions || [],
          esicOptions: options.esicOptions || [],
        };
      }

      const siteMap = new Map<string, ComboboxSelectOption>();
      const deptMap = new Map<string, ComboboxSelectOption>();
      const projectMap = new Map<string, ComboboxSelectOption>();

      for (const entry of data) {
        const salaryEntry = entry.employee?.work_details;
        if (!salaryEntry) continue;

        const { site, site_id } = salaryEntry;
        if (site && site_id && !siteMap.has(site_id)) {
          siteMap.set(site_id, {
            label: site.name,
            value: site_id,
          });
        }

        const { department, department_id } = salaryEntry;
        if (department && department_id && !deptMap.has(department_id)) {
          deptMap.set(department_id, {
            label: department.name,
            value: department_id,
          });
        }

        const { project, project_id } = salaryEntry;
        if (project && project_id && !projectMap.has(project_id)) {
          projectMap.set(project_id, {
            label: project.name,
            value: project_id,
          });
        }
      }

      return {
        siteOptions: Array.from(siteMap.values()),
        departmentOptions: Array.from(deptMap.values()),
        projectOptions: Array.from(projectMap.values()),
        esicOptions: [],
      };
    }, [data, options]);

  const filteredData = useMemo(() => {
    return data;
  }, [data]);

  const updateSites = useCallback(
    (ids: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      if (!ids.length) newParams.delete("siteIds");
      else newParams.set("siteIds", ids.join(","));
      newParams.set("page", "1");
      setSearchParams(newParams, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  const updateDepts = useCallback(
    (ids: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      if (!ids.length) newParams.delete("departmentIds");
      else newParams.set("departmentIds", ids.join(","));
      newParams.set("page", "1");
      setSearchParams(newParams, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  const updateProjects = useCallback(
    (ids: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      if (!ids.length) newParams.delete("projectIds");
      else newParams.set("projectIds", ids.join(","));
      newParams.set("page", "1");
      setSearchParams(newParams, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  const updateEsics = useCallback(
    (ids: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      if (!ids.length) newParams.delete("esicIds");
      else newParams.set("esicIds", ids.join(","));
      newParams.set("page", "1");
      setSearchParams(newParams, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  return {
    siteOptions,
    departmentOptions,
    projectOptions,
    esicOptions,
    filteredData,
    searchString,
    setSearchString,
    selectedSiteIds,
    selectedDeptIds,
    selectedProjectIds,
    selectedEsicIds,
    updateSites,
    updateDepts,
    updateProjects,
    updateEsics,
  };
};
