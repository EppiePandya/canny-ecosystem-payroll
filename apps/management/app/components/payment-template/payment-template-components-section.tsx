import { Button } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@canny_ecosystem/ui/card";
import { Field, SearchableSelectField } from "@canny_ecosystem/ui/forms";
import { Icon } from "@canny_ecosystem/ui/icon";
import { getInputProps } from "@conform-to/react";
import type { FieldMetadata } from "@conform-to/react";
import type { PaymentFieldDataType } from "@canny_ecosystem/supabase/queries";
type SelectOption = { label: string; value: string };

export function PaymentTemplateComponentsSection({
  form,
  componentsConfig,
  paymentFieldsOptions,
  paymentFieldsData,
  resetKey,
}: {
  form: any;
  componentsConfig: FieldMetadata<
    {
      payment_field_id: string;
      amount?: number;
    }[]
  >;
  paymentFieldsOptions: SelectOption[];
  paymentFieldsData: PaymentFieldDataType[];
  resetKey: number;
}) {
  const componentList = componentsConfig.getFieldList();

  const selectedIds = componentList
    .map((component: any) => {
      const fields = component.getFieldset();
      return fields.payment_field_id.value;
    })
    .filter(Boolean);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl">Template Components</CardTitle>
          <CardDescription>
            Add the dynamic components forming the template.
          </CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          {...form.insert.getButtonProps({
            name: componentsConfig.name,
            defaultValue: {},
          })}
        >
          <Icon name="plus" size="sm" className="mr-2" />
          Add Component
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {componentList.map((component: any, index: number) => {
          const componentFields = component.getFieldset();
          const currentValue = componentFields.payment_field_id.value;

          const filteredOptions = paymentFieldsOptions.filter((option) => {
            if (option.value === currentValue) return true;

            return !selectedIds.includes(option.value);
          });

          const selectedFieldId = componentFields.payment_field_id.value;
          const selectedPaymentField = selectedFieldId
            ? paymentFieldsData.find((f) => f.id === selectedFieldId)
            : null;

          const isPercentageOfBasic =
            selectedPaymentField?.calculation_type === "percentage_of_basic";

          return (
            <div
              key={component.key || index}
              className="relative border rounded-md p-3 pt-3"
            >
              <input
                {...getInputProps(componentFields.id, { type: "hidden" })}
              />

              <Button
                type="button"
                variant="destructive-outline"
                size="icon"
                className="absolute top-1.5 right-3 h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  form.remove({
                    name: componentsConfig.name,
                    index,
                  });
                }}
              >
                <Icon name="trash" className="h-4 w-4" />
              </Button>

              <div
                className="
        grid grid-cols-3 max-sm:grid-cols-1 max-md:grid-cols-2 gap-4 items-start

        [&_.min-h-6]:min-h-0
        [&_.min-h-6]:p-0
      "
              >
                <SearchableSelectField
                  key={`field-${resetKey}-${component.key}`}
                  labelProps={{ children: "Payment Field" }}
                  options={filteredOptions}
                  inputProps={{
                    ...getInputProps(componentFields.payment_field_id, {
                      type: "text",
                    }),
                  }}
                  onChange={(value: string) => {
                    const selectedField = paymentFieldsData.find(
                      (f) => f.id === value,
                    );

                    if (!selectedField) return;

                    const prevFieldId = componentFields.payment_field_id.value;

                    if (prevFieldId !== value) {
                      form.update({
                        name: componentFields.amount.name,
                        value: String(selectedField.amount ?? ""),
                      });
                    }

                    form.update({
                      name: componentFields.payment_field_id.name,
                      value,
                    });
                  }}
                  placeholder="Select Payment Field"
                  errors={componentFields.payment_field_id.errors}
                />

                <Field
                  labelProps={{
                    children: isPercentageOfBasic
                      ? "Amount (%) - Max 100"
                      : "Amount (Rs)",
                  }}
                  inputProps={{
                    ...getInputProps(componentFields.amount, {
                      type: "number",
                    }),
                    placeholder: isPercentageOfBasic ? "Max 100" : "Amount",
                  }}
                  errors={componentFields.amount.errors}
                />
              </div>
            </div>
          );
        })}
        {componentList.length === 0 && (
          <div className="text-center py-8 text-neutral-500 border rounded-lg bg-neutral-50/50">
            No components added yet. Click "Add Component" to get started.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
