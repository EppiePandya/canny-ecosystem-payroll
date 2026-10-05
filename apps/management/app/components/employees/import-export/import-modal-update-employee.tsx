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
import { useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useEffect } from "react";

export const ImportUpdateEmployeeModal = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligibleFileSize, setEligibleFileSize] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);

  const navigate = useNavigate();

  const MAX_FILE_SIZE_LIMIT = SIZE_1MB * 500;

  const isOpen =
    searchParams.get("step") === modalSearchParamNames.import_update_employee;

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
      navigate("/employees/import-employee-details", {
        state: { file: selectedFile, intent: "overwrite" },
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
      // Employee Details
      employee_code: "",
      department: "",
      first_name: "",
      middle_name: "",
      last_name: "",
      gender: "",
      marital_status: "",
      date_of_birth: "",
      education: "",
      is_active: "",
      personal_email: "",
      primary_mobile_number: "",
      secondary_mobile_number: "",
      // Work Details
      assignment_type: "",
      position: "",
      start_date: "",
      end_date: "",
      skill_level: "",
      site: "",
      project: "",
      // Statutory Details
      aadhaar_number: "",
      pan_number: "",
      uan_number: "",
      pf_number: "",
      esic_number: "",
      esic_site_name: "",
      driving_license_number: "",
      driving_license_expiry: "",
      passport_number: "",
      passport_expiry: "",
      // Bank Details
      account_holder_name: "",
      account_number: "",
      ifsc_code: "",
      account_type: "",
      bank_name: "",
      branch_name: "",
      // Address
      address_type: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      pincode: "",
      state: "",
      country: "",
      is_primary: "",
      latitude: "",
      longitude: "",
      // Guardian / Emergency Contact
      guardian_first_name: "",
      guardian_last_name: "",
      relationship: "",
      guardian_date_of_birth: "",
      guardian_gender: "",
      guardian_email: "",
      mobile_number: "",
      alternate_mobile_number: "",
      is_emergency_contact: "",
      address_same_as_employee: "",
    },
  ];
  const downloadDemoCsv = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    const csv = Papa.unparse(demo);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;

    link.setAttribute("download", "Employee-Update-Format");

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
  };

  const downloadDemoExcel = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    const worksheet = XLSX.utils.json_to_sheet(demo);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Format");
    XLSX.writeFile(workbook, "Employee-Update-Format.xlsx");
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>Choose the file to be updated</DialogTitle>
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <DialogDescription>
              Only .csv, .xlsx, .xls formats are supported!
            </DialogDescription>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="text-primary cursor-pointer hover:underline font-medium bg-transparent border-none p-0"
                onClick={downloadDemoCsv}
              >
                Download CSV format
              </button>
              <span className="text-muted-foreground/30">|</span>
              <button
                type="button"
                className="text-primary cursor-pointer hover:underline font-medium bg-transparent border-none p-0"
                onClick={downloadDemoExcel}
              >
                Download Excel format
              </button>
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
