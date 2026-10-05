import { useImportStoreForExit } from "@/store/import";
import type { ImportExitDataType } from "@canny_ecosystem/supabase/queries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { Combobox } from "@canny_ecosystem/ui/combobox";
import { Field } from "@canny_ecosystem/ui/forms";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import {
  getValidDateForInput,
  ImportSingleExitDataSchema,
  reasonForExitArray,
  transformStringArrayIntoOptions,
} from "@canny_ecosystem/utils";
import { useState } from "react";

export const UpdateImportedExit = ({
  indexToUpdate,
  dataToUpdate,
}: {
  indexToUpdate: number;
  dataToUpdate: ImportExitDataType;
}) => {
  const { importData, setImportData } = useImportStoreForExit();
  const [data, setData] = useState(dataToUpdate);

  const onChange = (
    key: keyof typeof dataToUpdate,
    value: string | boolean,
  ) => {
    setData((prevData) => ({ ...prevData, [key]: value }));
  };

  const handleUpdate = () => {
    const parsedResult = ImportSingleExitDataSchema.safeParse(data);

    if (parsedResult.success) {
      setImportData({
        data: importData.data?.map((item, index) =>
          index === indexToUpdate ? data : item,
        ),
      });
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "full" }),
          "text-[13px] h-9",
        )}
      >
        Update Exit
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update the data here</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-1 gap-3">
            <Field
              inputProps={{
                type: "date",
                value: getValidDateForInput(data.last_working_day!),
                onChange: (e) => onChange("last_working_day", e.target.value),
                placeholder: "Last Working Day",
              }}
            />
          </div>
          <div className="grid grid-cols-1 mb-2">
            <Combobox
              options={transformStringArrayIntoOptions(
                reasonForExitArray as unknown as string[],
              )}
              value={data.exit_reason ?? reasonForExitArray[0]}
              onChange={(value: string) => {
                onChange("exit_reason", value);
              }}
              placeholder={"Select reason"}
              className="capitalize"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Field
              inputProps={{
                type: "text",
                value: data.note ?? "",
                onChange: (e) => onChange("note", e.target.value),
                placeholder: "Note",
              }}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "default" }))}
            onClick={handleUpdate}
            onSelect={handleUpdate}
          >
            Update
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
