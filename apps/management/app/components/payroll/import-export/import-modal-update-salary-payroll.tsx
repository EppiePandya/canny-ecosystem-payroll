import { Button } from "@canny_ecosystem/ui/button";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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
import { useNavigate, useParams, useSearchParams } from "@remix-run/react";
import { useState, useEffect } from "react";

export const ImportUpdateSalaryPayrollModal = () => {
  const { payrollId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligibleFileSize, setEligibleFileSize] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);

  const navigate = useNavigate();

  const MAX_FILE_SIZE_LIMIT = SIZE_1MB * 500;

  const isOpen =
    searchParams.get("step") ===
    modalSearchParamNames.import_update_salary_payroll;

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
      const url =
        payrollId && payrollId !== "undefined"
          ? `/payroll/run-payroll/import-salary-payroll?payrollId=${payrollId}`
          : "/payroll/run-payroll/import-salary-payroll";
      navigate(url, {
        state: {
          file: selectedFile,
          payrollId:
            payrollId && payrollId !== "undefined" ? payrollId : undefined,
          intent: "overwrite",
        },
      });
    }
  };

  const formatFileSize = (size: number) => {
    if (size < SIZE_1KB) return `${size} Bytes`;
    if (size < SIZE_1MB) return `${(size / SIZE_1KB).toFixed(2)} KB`;
    return `${(size / SIZE_1MB).toFixed(2)} MB`;
  };

  const demo: any[] | Papa.UnparseObject<any> = [
    {
      employee_code: null,
      total_days: null,
      present_days: null,
      basic: null,
      da: null,
      hra: null,
      lta: null,
      ot_amount: null,
      bonus: null,
      leave_salary: null,
      pf: null,
      esic: null,
      pt: null,
    },
  ];
  const downloadDemoCsv = (
    e: React.MouseEvent<HTMLButtonElement | HTMLSpanElement, MouseEvent>,
  ) => {
    e.preventDefault();
    const csv = Papa.unparse(demo);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;

    link.setAttribute("download", "Salary-Payroll-Format");

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
  };

  const downloadDemoExcel = (
    e: React.MouseEvent<HTMLButtonElement | HTMLSpanElement, MouseEvent>,
  ) => {
    e.preventDefault();
    const worksheet = XLSX.utils.json_to_sheet(demo);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Salary Format");
    XLSX.writeFile(workbook, "Salary-Payroll-Format.xlsx");
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>Choose the file to be imported for update</DialogTitle>
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <DialogDescription>
              Only .csv, .xlsx, .xls formats are supported!
            </DialogDescription>
            <div className="flex items-center gap-2 text-sm">
              <span
                className="text-primary cursor-pointer hover:underline font-medium"
                onClick={downloadDemoCsv}
              >
                Download CSV format
              </span>
              <span className="text-muted-foreground/30">|</span>
              <span
                className="text-primary cursor-pointer hover:underline font-medium"
                onClick={downloadDemoExcel}
              >
                Download Excel format
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Maximum upload size is 500MB!
            </p>
          </div>
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
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
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
