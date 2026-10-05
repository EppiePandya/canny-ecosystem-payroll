import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canny_ecosystem/ui/sheet";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useState } from "react";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Label } from "@canny_ecosystem/ui/label";
import { Input } from "@canny_ecosystem/ui/input";
import { Button } from "@canny_ecosystem/ui/button";
import { useSubmit, useLocation } from "@remix-run/react";
import {
  componentTypeArray,
  transformStringArrayIntoOptions,
} from "@canny_ecosystem/utils";
import { Icon } from "@canny_ecosystem/ui/icon";

export function AddPayrollFieldSheet({
  payrollId,
  triggerChild,
}: {
  triggerChild: React.ReactNode;
  payrollId: string;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const submit = useSubmit();
  const location = useLocation();
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [fieldAmount, setFieldAmount] = useState(0);

  const handleFinalSubmit = () => {
    const finalData = {
      name: fieldName,
      type: fieldType,
      default_amount: fieldAmount,
    };
    submit(
      {
        payrollId: payrollId,
        payrollFieldData: JSON.stringify(finalData),
      },
      {
        method: "POST",
        action: `/payroll/run-payroll/${payrollId}/add-payroll-field${location.search}`,
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className={cn("cursor-pointer py-2")}>
        {triggerChild}
      </SheetTrigger>
      <SheetContent className="flex flex-col w-[600px] max-sm:w-full h-full">
        <SheetHeader className="px-6 pt-4 pb-8 flex-shrink-0">
          <SheetTitle className="flex justify-between">
            <div>
              <h1 className="text-primary text-3xl">Add Payroll Field</h1>
            </div>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="flex items-start gap-3 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/50 p-4 rounded-lg text-sm text-amber-800 dark:text-amber-400 mb-6">
            <Icon
              name="exclaimation-triangle"
              className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-500"
            />
            <div>
              Before creating a payroll field, you must submit at least one
              employee entry in every site.
            </div>
          </div>
          <div className="w-full grid grid-cols-2 max-sm:grid-cols-1 gap-4 mb-8">
            <div className="mb-8 flex flex-col gap-1">
              <Label className="text-sm font-medium">Field Name</Label>
              <Input
                placeholder="Enter the field name"
                onChange={(e) => setFieldName(e.target.value)}
              />
            </div>
            <div className="mb-8 flex flex-col gap-1">
              <Label className="text-sm font-medium">Type</Label>
              <Combobox
                options={transformStringArrayIntoOptions(
                  componentTypeArray as unknown as string[],
                )}
                placeholder="Select Type"
                value={fieldType}
                onChange={(value: string) => {
                  setFieldType(value);
                }}
              />
            </div>
          </div>
          <div className="mb-8 flex flex-col gap-1">
            <Label className="text-sm font-medium">Field Amount</Label>
            <Input
              placeholder="Enter the default field amount"
              value={fieldAmount}
              onChange={(e) => setFieldAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <SheetFooter className="mt-auto flex-shrink-0">
          <SheetClose asChild>
            <Button variant={"default"} onClick={handleFinalSubmit}>
              Add
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
