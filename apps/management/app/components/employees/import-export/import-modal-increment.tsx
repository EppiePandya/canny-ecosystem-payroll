import { Button } from "@canny_ecosystem/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Input } from "@canny_ecosystem/ui/input";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { SIZE_1KB, SIZE_1MB } from "@canny_ecosystem/utils";
import { modalSearchParamNames } from "@canny_ecosystem/utils/constant";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useEffect } from "react";

export const ImportEmployeeIncrementModal = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligibleFileSize, setEligibleFileSize] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);

  const navigate = useNavigate();

  const MAX_FILE_SIZE_LIMIT = SIZE_1MB * 500;

  const isOpen =
    searchParams.get("step") === modalSearchParamNames.import_employee_increment;

  const onClose = () => {
    searchParams.delete("step");
    setSearchParams(searchParams);
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(undefined);
      setEligibleFileSize(true);
    }
  }, [isOpen]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event?.target?.files?.[0];
    if (file) {
      setSelectedFile(file);
      setEligibleFileSize(file.size <= MAX_FILE_SIZE_LIMIT);
    } else {
      setSelectedFile(undefined);
      setEligibleFileSize(true);
    }
  };

  const handleFileSubmit = () => {
    if (eligibleFileSize && selectedFile) {
      searchParams.delete("step");
      setSearchParams(searchParams);
      navigate("/payment-components/salaries/import-salaries?isIncrement=true", {
        state: { file: selectedFile, isIncrement: true },
      });
    }
  };

  const formatFileSize = (size: number) => {
    if (size < SIZE_1KB) return `${size} Bytes`;
    if (size < SIZE_1MB) return `${(size / SIZE_1KB).toFixed(2)} KB`;
    return `${(size / SIZE_1MB).toFixed(2)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>Choose the Excel file to be imported</DialogTitle>
        <div className="flex justify-between">
          <DialogDescription className="text-muted-foreground">
            Only .xlsx and .xls formats are supported for increment import!
            <p className="mt-1">Maximum upload size is 500MB!</p>
          </DialogDescription>
          <div className="flex flex-col justify-end">
            <Button
              className={cn(selectedFile ? "flex" : "hidden")}
              onClick={handleFileSubmit}
              disabled={!eligibleFileSize}
            >
              Confirm file
            </Button>
          </div>
        </div>

        <Input
          type="file"
          accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={handleFileSelect}
        />

        <p
          className={cn(
            "text-sm",
            selectedFile ? "flex" : "hidden",
            !eligibleFileSize ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {!eligibleFileSize
            ? "File size exceeds the 500MB limit"
            : `Your file size: ${formatFileSize(selectedFile?.size ?? 0)}`}
        </p>
      </DialogContent>
    </Dialog>
  );
};
