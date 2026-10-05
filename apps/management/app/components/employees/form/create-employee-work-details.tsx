import { Fragment, useState } from "react";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import type { ComboboxSelectOption } from "@canny_ecosystem/ui/combobox";
import {
  assignmentTypeArray,
  getValidDateForInput,
  positionArray,
  replaceUnderscore,
  skillLevelArray,
  transformStringArrayIntoOptions,
  type EmployeeWorkDetailsSchema,
} from "@canny_ecosystem/utils";
import { getInputProps, type FieldMetadata } from "@conform-to/react";
import {
  CheckboxField,
  Field,
  SearchableSelectField,
} from "@canny_ecosystem/ui/forms";
import { useSearchParams } from "@remix-run/react";
import { cn } from "@canny_ecosystem/ui/utils/cn";

type FieldsType = {
  [K in keyof typeof EmployeeWorkDetailsSchema.shape]: FieldMetadata<
    (typeof EmployeeWorkDetailsSchema.shape)[K]["_type"],
    (typeof EmployeeWorkDetailsSchema.shape)[K],
    string[]
  >;
};

export const SITE_PARAM = "site";

export const CreateEmployeeWorkDetails = ({
  fields,
  isUpdate = false,
  projectOptions,
  siteOptions,
  departmentOptions,
  autoCode,
}: {
  fields: FieldsType;
  isUpdate?: boolean;
  projectOptions: ComboboxSelectOption[] | null | undefined;
  siteOptions: ComboboxSelectOption[] | null | undefined;
  departmentOptions: ComboboxSelectOption[] | null | undefined;
  autoCode?: string;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [site, setSite] = useState(false);

  return (
    <Fragment>
      <CardHeader>
        <CardTitle className="text-3xl capitalize">
          {isUpdate ? "Update" : "Add"} Employee Work Details
        </CardTitle>
        <CardDescription>
          {isUpdate ? "Update" : "Add"} work details of the employee
        </CardDescription>
      </CardHeader>
      <CardContent>
        <input {...getInputProps(fields.employee_id, { type: "hidden" })} />

        <div className="grid grid-cols-2 max-sm:grid-cols-1 max-sm:gap-2 place-content-center justify-between gap-6">
          <SearchableSelectField
            className="capitalize"
            options={projectOptions ?? []}
            inputProps={{
              ...getInputProps(fields.project_id, { type: "text" }),
              defaultValue:
                searchParams.get("project") ??
                fields.project_id.initialValue ??
                undefined,
            }}
            onChange={(project) => {
              if (project?.length) {
                searchParams.set("project", project);
                searchParams.delete("site");
              } else {
                searchParams.delete("project");
                searchParams.delete("site");
              }
              setSearchParams(searchParams);
            }}
            placeholder={"Select Project"}
            labelProps={{
              children: "Project",
            }}
            errors={fields.project_id.errors}
          />
          <SearchableSelectField
            className="capitalize"
            options={siteOptions ?? []}
            inputProps={{
              ...getInputProps(fields.site_id, { type: "text" }),
              defaultValue: fields.site_id.initialValue ?? undefined,
            }}
            onChange={(site) => {
              setSite(true);
            }}
            placeholder={"Select Site"}
            labelProps={{
              children: "Site",
            }}
            errors={fields.site_id.errors}
          />
          <SearchableSelectField
            className="capitalize"
            options={departmentOptions ?? []}
            inputProps={{
              ...getInputProps(fields.department_id, { type: "text" }),
              defaultValue: fields.department_id.initialValue ?? undefined,
            }}
            placeholder={"Select Department"}
            labelProps={{
              children: "Departments",
            }}
            errors={fields.department_id.errors}
          />
          <SearchableSelectField
            className="capitalize"
            options={transformStringArrayIntoOptions(
              assignmentTypeArray as unknown as string[],
            )}
            inputProps={{
              ...getInputProps(fields.assignment_type, { type: "text" }),
            }}
            placeholder={`Select ${replaceUnderscore(
              fields.assignment_type.name,
            )}`}
            labelProps={{
              children: replaceUnderscore(fields.assignment_type.name),
            }}
            errors={fields.assignment_type.errors}
          />
          <SearchableSelectField
            className="capitalize"
            options={transformStringArrayIntoOptions(
              positionArray as unknown as string[],
            )}
            inputProps={{
              ...getInputProps(fields.position, { type: "text" }),
            }}
            placeholder={`Select ${fields.position.name}`}
            labelProps={{
              children: fields.position.name,
            }}
            errors={fields.position.errors}
          />
          <SearchableSelectField
            className="capitalize"
            options={transformStringArrayIntoOptions(
              skillLevelArray as unknown as string[],
            )}
            inputProps={{
              ...getInputProps(fields.skill_level, { type: "text" }),
            }}
            placeholder={`Select ${replaceUnderscore(fields.skill_level.name)}`}
            labelProps={{
              children: replaceUnderscore(fields.skill_level.name),
            }}
            errors={fields.skill_level.errors}
          />
          <Field
            inputProps={{
              ...getInputProps(fields.start_date, { type: "date" }),
              placeholder: `Enter ${replaceUnderscore(fields.start_date.name)}`,
              max: getValidDateForInput(new Date().toISOString()),
              defaultValue: getValidDateForInput(
                String(fields.start_date.initialValue),
              ),
            }}
            labelProps={{
              children: replaceUnderscore(fields.start_date.name),
            }}
            errors={fields.start_date.errors}
          />
          <Field
            inputProps={{
              ...getInputProps(fields.end_date, {
                type: "date",
              }),
              placeholder: `Enter ${replaceUnderscore(fields.end_date.name)}`,
              min: getValidDateForInput(String(fields.start_date.value)),
              defaultValue: getValidDateForInput(
                String(fields.end_date.initialValue),
              ),
            }}
            labelProps={{
              children: replaceUnderscore(fields.end_date.name),
            }}
            errors={fields.end_date.errors}
          />
        </div>
      </CardContent>
    </Fragment>
  );
};
