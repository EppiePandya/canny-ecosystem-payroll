import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import { Fragment, useState } from "react";
import {
  educationArray,
  genderArray,
  getValidDateForInput,
  maritalStatusArray,
  replaceUnderscore,
  transformStringArrayIntoOptions,
  type EmployeeSchema,
} from "@canny_ecosystem/utils";
import {
  CheckboxField,
  Field,
  SearchableSelectField,
} from "@canny_ecosystem/ui/forms";
import { type FieldMetadata, getInputProps } from "@conform-to/react";

type FieldsType = {
  [K in keyof typeof EmployeeSchema.shape]: FieldMetadata<
    (typeof EmployeeSchema.shape)[K]["_type"],
    (typeof EmployeeSchema.shape)[K],
    string[]
  >;
};

export function CreateEmployeeDetails({
  fields,
  isUpdate = false,
  autoCode,
  companyPrefixes,
  prefixCodeMap,
  defaultPrefix,
}: {
  fields: FieldsType;
  isUpdate?: boolean;
  autoCode?: string;
  companyPrefixes?: any[];
  prefixCodeMap?: Record<string, string>;
  defaultPrefix?: string;
}) {
  const [selectedPrefix, setSelectedPrefix] = useState(defaultPrefix || "");
  const [empCode, setEmpCode] = useState(
    fields.employee_code.value ?? autoCode ?? "",
  );

  const prefixOptions = [
    {
      label: "No Prefix",
      value: "NO_PREFIX",
      pseudoLabel: "Manual Entry",
    },
    ...(companyPrefixes?.map((p) => {
      const isDefault = p.is_default === true || p.name === defaultPrefix;
      return {
        label: p.name ?? "",
        value: p.name ?? "",
        pseudoLabel: `${p.site?.name ? p.site.name : "Global"}${
          isDefault ? " (Default)" : ""
        }`,
      };
    }) || []),
  ];

  if (
    defaultPrefix &&
    !prefixOptions.some((opt) => opt.value === defaultPrefix)
  ) {
    prefixOptions.push({
      label: defaultPrefix,
      value: defaultPrefix,
      pseudoLabel: "Default",
    });
  }

  const handlePrefixChange = (newPrefix: string) => {
    setSelectedPrefix(newPrefix);
    if (newPrefix && newPrefix !== "NO_PREFIX" && prefixCodeMap && prefixCodeMap[newPrefix]) {
      setEmpCode(prefixCodeMap[newPrefix]);
    } else if (!newPrefix || newPrefix === "NO_PREFIX") {
      setEmpCode("");
    }
  };

  const isManualCode = !selectedPrefix || selectedPrefix === "NO_PREFIX";

  return (
    <Fragment>
      <CardHeader>
        <CardTitle className="text-3xl capitalize">
          {isUpdate ? "Update" : "Create"} Employee
        </CardTitle>
        <CardDescription>
          {isUpdate ? "Update" : "Create"} an employee that will be central in
          all of canny apps
        </CardDescription>
      </CardHeader>
      <CardContent>
        <input {...getInputProps(fields.id, { type: "hidden" })} />
        <input {...getInputProps(fields.company_id, { type: "hidden" })} />
        <div className="grid grid-cols-3 max-sm:grid-cols-1 max-sm:gap-2 place-content-center justify-between gap-6">
          <Field
            inputProps={{
              ...getInputProps(fields.first_name, { type: "text" }),
              autoFocus: true,
              placeholder: `Enter ${replaceUnderscore(fields.first_name.name)}`,
              onKeyDown: (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                }
              },
            }}
            labelProps={{ children: replaceUnderscore(fields.first_name.name) }}
            errors={fields.first_name.errors}
          />
          <Field
            inputProps={{
              ...getInputProps(fields.middle_name, { type: "text" }),
              placeholder: `Enter ${replaceUnderscore(
                fields.middle_name.name,
              )}`,
              onKeyDown: (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                }
              },
            }}
            labelProps={{
              children: replaceUnderscore(fields.middle_name.name),
            }}
            errors={fields.middle_name.errors}
          />
          <Field
            inputProps={{
              ...getInputProps(fields.last_name, { type: "text" }),
              placeholder: `Enter ${replaceUnderscore(fields.last_name.name)}`,
              onKeyDown: (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                }
              },
            }}
            labelProps={{ children: replaceUnderscore(fields.last_name.name) }}
            errors={fields.last_name.errors}
          />
        </div>
        <div className="grid grid-cols-3 max-sm:grid-cols-1 max-sm:gap-2 place-content-center justify-between gap-6">
          {prefixOptions.length > 0 ? (
            <Fragment>
              <SearchableSelectField
                key={selectedPrefix}
                className="w-full capitalize flex-1"
                options={prefixOptions}
                placeholder="Prefix"
                labelProps={{ children: "Choose Prefix" }}
                onChange={(val) => {
                  handlePrefixChange(val ?? "");
                }}
                inputProps={{
                  name: "choose_prefix",
                  form: fields.employee_code.formId,
                  defaultValue: selectedPrefix,
                }}
              />
              <Field
                inputProps={{
                  ...getInputProps(fields.employee_code, { type: "text" }),
                  value: empCode,
                  onChange: (e) => setEmpCode(e.target.value),
                  placeholder: "Enter Employee Code",
                  onKeyDown: (e) => {
                    if (e.key === " ") {
                      e.preventDefault();
                    }
                  },
                  readOnly: !isUpdate && !isManualCode,
                }}
                labelProps={{
                  children: replaceUnderscore(fields.employee_code.name),
                }}
                errors={fields.employee_code.errors}
              />
            </Fragment>
          ) : (
            <div className="col-span-2">
              <Field
                inputProps={{
                  ...getInputProps(fields.employee_code, { type: "text" }),
                  defaultValue: fields.employee_code.value ?? autoCode ?? "",
                  placeholder: `${
                    !autoCode
                      ? "Failed to auto-generate code"
                      : `Enter ${replaceUnderscore(fields.employee_code.name)}`
                  }`,
                  onKeyDown: (e) => {
                    if (e.key === " ") {
                      e.preventDefault();
                    }
                  },
                  readOnly: !isUpdate && !isManualCode,
                }}
                labelProps={{
                  children: replaceUnderscore(fields.employee_code.name),
                }}
                errors={fields.employee_code.errors}
              />
            </div>
          )}

          <Field
            inputProps={{
              ...getInputProps(fields.date_of_birth, { type: "date" }),
              placeholder: `Enter ${replaceUnderscore(
                fields.date_of_birth.name,
              )}`,
              max: getValidDateForInput(new Date().toISOString()),
            }}
            labelProps={{
              children: replaceUnderscore(fields.date_of_birth.name),
            }}
            errors={fields.date_of_birth.errors}
          />
        </div>
        <div className="grid grid-cols-3 max-sm:grid-cols-1 max-sm:gap-2 place-content-center justify-between gap-6">
          <SearchableSelectField
            className="w-full capitalize flex-1"
            options={transformStringArrayIntoOptions(
              genderArray as unknown as string[],
            )}
            inputProps={{
              ...getInputProps(fields.gender, { type: "text" }),
            }}
            placeholder={`Select ${fields.gender.name}`}
            labelProps={{
              children: fields.gender.name,
            }}
            errors={fields.gender.errors}
          />
          <SearchableSelectField
            className="w-full capitalize flex-1"
            options={transformStringArrayIntoOptions(
              educationArray as unknown as string[],
            )}
            inputProps={{
              ...getInputProps(fields.education, { type: "text" }),
            }}
            placeholder={`Select ${fields.education.name}`}
            labelProps={{
              children: fields.education.name,
            }}
            errors={fields.education.errors}
          />
          <SearchableSelectField
            className="w-full capitalize flex-1"
            options={transformStringArrayIntoOptions(
              maritalStatusArray as unknown as string[],
            )}
            inputProps={{
              ...getInputProps(fields.marital_status, { type: "text" }),
            }}
            placeholder={`Select ${replaceUnderscore(
              fields.marital_status.name,
            )}`}
            labelProps={{
              children: replaceUnderscore(fields.marital_status.name),
            }}
            errors={fields.marital_status.errors}
          />
        </div>
        <CheckboxField
          className="mt-0.5 mb-3"
          buttonProps={getInputProps(fields.is_active, {
            type: "checkbox",
          })}
          labelProps={{
            htmlFor: fields.is_active.id,
            children: "Is this employee active?",
          }}
        />
        <div className="grid grid-cols-3 max-sm:grid-cols-1 max-sm:gap-2 place-content-center justify-between gap-6">
          <Field
            inputProps={{
              ...getInputProps(fields.primary_mobile_number, { type: "text" }),
              placeholder: `Enter ${replaceUnderscore(
                fields.primary_mobile_number.name,
              )}`,
              onKeyDown: (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                }
              },
            }}
            labelProps={{
              children: replaceUnderscore(fields.primary_mobile_number.name),
            }}
            errors={fields.primary_mobile_number.errors}
          />
          <Field
            inputProps={{
              ...getInputProps(fields.secondary_mobile_number, {
                type: "text",
              }),
              placeholder: `Enter ${replaceUnderscore(
                fields.secondary_mobile_number.name,
              )}`,
              onKeyDown: (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                }
              },
            }}
            labelProps={{
              children: replaceUnderscore(fields.secondary_mobile_number.name),
            }}
            errors={fields.secondary_mobile_number.errors}
          />
          <Field
            inputProps={{
              ...getInputProps(fields.personal_email, {
                type: "text",
              }),
              placeholder: `Enter ${replaceUnderscore(
                fields.personal_email.name,
              )}`,
              onKeyDown: (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                }
              },
            }}
            labelProps={{
              children: replaceUnderscore(fields.personal_email.name),
            }}
            errors={fields.personal_email.errors}
          />
        </div>
      </CardContent>
    </Fragment>
  );
}
