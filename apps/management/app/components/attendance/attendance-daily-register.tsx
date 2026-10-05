import ExcelJS from "exceljs";
import saveAs from "file-saver";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@canny_ecosystem/ui/alert-dialog";
import { buttonVariants } from "@canny_ecosystem/ui/button";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { formatDateTime } from "@canny_ecosystem/utils";
import type {
  CompanyDatabaseRow,
  LocationDatabaseRow,
} from "@canny_ecosystem/supabase/types";
import {
  CANNY_MANAGEMENT_SERVICES_ADDRESS,
  CANNY_MANAGEMENT_SERVICES_NAME,
} from "@/constant";
import { Icon } from "@canny_ecosystem/ui/icon";

export const prepareDailyAttendanceWorkbook = async ({
  selectedRows,
  companyName,
  companyAddress,
}: {
  selectedRows: any[];
  companyName?: CompanyDatabaseRow;
  companyAddress?: LocationDatabaseRow;
}) => {
  const workbook = new ExcelJS.Workbook();

  // Determine selected month and year
  const firstRow = selectedRows[0];
  const monthNum =
    firstRow?.monthly_attendance?.month ?? new Date().getMonth() + 1;
  const yearNum =
    firstRow?.monthly_attendance?.year ?? new Date().getFullYear();

  // Find min and max date from daily_records across all selected employees to make it fully database-driven
  let minDateStr = "";
  let maxDateStr = "";
  for (const emp of selectedRows) {
    const dailyRecords = emp.monthly_attendance?.daily_records || [];
    for (const r of dailyRecords) {
      if (r.date) {
        if (!minDateStr || r.date < minDateStr) minDateStr = r.date;
        if (!maxDateStr || r.date > maxDateStr) maxDateStr = r.date;
      }
    }
  }

  let datesArray: Date[] = [];
  if (minDateStr && maxDateStr) {
    let curr = new Date(minDateStr);
    const end = new Date(maxDateStr);
    while (curr <= end) {
      datesArray.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
  } else {
    // Fallback to the calendar month (1 to 30/31) of the selected month/year if no database records are found
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      datesArray.push(new Date(yearNum, monthNum - 1, i));
    }
  }

  // Format dates for display
  const formatDateDD = (d: Date) => d.getDate().toString();
  const formatRegisterDate = (date: Date) => {
    const d = date.getDate().toString().padStart(2, "0");
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  };

  const periodStart = datesArray[0] ? formatRegisterDate(datesArray[0]) : "";
  const periodEnd = datesArray[datesArray.length - 1]
    ? formatRegisterDate(datesArray[datesArray.length - 1])
    : "";

  const monthNames = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  const monthName = monthNames[monthNum - 1];

  const datesColCount = datesArray.length;
  const lastDateColIndex = 2 + datesColCount;
  const summaryStartColIndex = lastDateColIndex + 1;
  const summaryEndColIndex = summaryStartColIndex + 5;
  const totalPaidDaysColIndex = summaryEndColIndex + 1;
  const otHoursColIndex = totalPaidDaysColIndex + 1;
  const remarksColIndex = otHoursColIndex + 1;
  const sigColIndex = remarksColIndex + 1;

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: "FF000000" } },
    left: { style: "thin" as const, color: { argb: "FF000000" } },
    bottom: { style: "thin" as const, color: { argb: "FF000000" } },
    right: { style: "thin" as const, color: { argb: "FF000000" } },
  };

  // Group employees by site name
  const siteGroupMap = new Map<string, any[]>();
  for (const emp of selectedRows) {
    const sName = emp?.work_details?.[0]?.sites?.name || "";
    if (!siteGroupMap.has(sName)) {
      siteGroupMap.set(sName, []);
    }
    siteGroupMap.get(sName)!.push(emp);
  }

  // If no employees are selected, add one blank default worksheet
  if (siteGroupMap.size === 0) {
    workbook.addWorksheet("Daily Attendance Register");
  }

  // Create a separate sheet for each unique site name
  let sheetIdx = 0;
  for (const [groupSite, groupEmployees] of siteGroupMap) {
    // Generate safe sheet name (max 31 characters, clean formatting)
    let cleanSheetName = groupSite.replace(/[:\\/?*\[\]]/g, "").trim();
    if (!cleanSheetName) {
      cleanSheetName = "Standard";
    }
    if (cleanSheetName.length > 25) {
      cleanSheetName = cleanSheetName.substring(0, 25);
    }
    const finalSheetName = `${cleanSheetName} (${sheetIdx + 1})`;
    const worksheet = workbook.addWorksheet(finalSheetName);
    sheetIdx++;

    // Row 1
    worksheet.getCell("A1").value = "FORM D";
    worksheet.getCell("A1").font = { bold: true, name: "Calibri", size: 10 };

    worksheet.mergeCells(1, 17, 1, 29); // Q1:AC1
    worksheet.getCell("Q1").value = companyName?.name || "SGS India Pvt. Ltd.";
    worksheet.getCell("Q1").font = { bold: true, name: "Calibri", size: 12 };
    worksheet.getCell("Q1").alignment = { horizontal: "center" };

    worksheet.mergeCells(1, 39, 1, 42); // AM1:AP1
    worksheet.getCell("AM1").value = CANNY_MANAGEMENT_SERVICES_NAME;
    worksheet.getCell("AM1").font = { bold: true, name: "Calibri", size: 9 };
    worksheet.getCell("AM1").alignment = { horizontal: "right" };

    // Row 2
    worksheet.getCell("A2").value = "FORMAT OF ATTENDANCE REGISTER";
    worksheet.getCell("A2").font = { bold: true, name: "Calibri", size: 10 };

    worksheet.mergeCells(2, 17, 2, 29); // Q2:AC2
    const addressLine1 = companyAddress
      ? `${companyAddress.address_line_1 || ""}, ${companyAddress.address_line_2 || ""}`
      : "201, Sumel - II, Nr. Gurudwara,";
    worksheet.getCell("Q2").value = addressLine1;
    worksheet.getCell("Q2").font = { name: "Calibri", size: 9 };
    worksheet.getCell("Q2").alignment = { horizontal: "center" };

    worksheet.mergeCells(2, 39, 2, 42); // AM2:AP2
    worksheet.getCell("AM2").value = "No 502,503,Girivar Glean";
    worksheet.getCell("AM2").font = { name: "Calibri", size: 9 };
    worksheet.getCell("AM2").alignment = { horizontal: "right" };

    // Row 3
    worksheet.mergeCells(3, 17, 3, 29); // Q3:AC3
    const addressLine2 = companyAddress
      ? `${companyAddress.city || ""}, ${companyAddress.state || ""} ${companyAddress.pincode || ""}`
      : "S.G. Road, Ahmedabad";
    worksheet.getCell("Q3").value = addressLine2;
    worksheet.getCell("Q3").font = { name: "Calibri", size: 9 };
    worksheet.getCell("Q3").alignment = { horizontal: "center" };

    worksheet.mergeCells(3, 39, 3, 42); // AM3:AP3
    worksheet.getCell("AM3").value = "Nr.Palm Hotel,S.P.Ring Road,";
    worksheet.getCell("AM3").font = { name: "Calibri", size: 9 };
    worksheet.getCell("AM3").alignment = { horizontal: "right" };

    // Row 4
    worksheet.getCell("A4").value =
      `For the Period . ${periodStart} to ${periodEnd}`;
    worksheet.getCell("A4").font = { bold: true, name: "Calibri", size: 10 };

    worksheet.mergeCells(4, 17, 4, 29); // Q4:AC4
    worksheet.getCell("Q4").value =
      `Attendance For the Month of ${monthName}-${yearNum}`;
    worksheet.getCell("Q4").font = { bold: true, name: "Calibri", size: 10 };
    worksheet.getCell("Q4").alignment = { horizontal: "center" };

    worksheet.mergeCells(4, 39, 4, 42); // AM4:AP4
    worksheet.getCell("AM4").value = "Odhav, Ahmedabad - 382415,";
    worksheet.getCell("AM4").font = { name: "Calibri", size: 9 };
    worksheet.getCell("AM4").alignment = { horizontal: "right" };

    // Row 5 & 6: Headers
    worksheet.mergeCells("A5:A6");
    worksheet.getCell("A5").value = "Sl.\nNumber\nin\nEmployee\nregister";
    worksheet.getCell("A5").font = { bold: true, name: "Calibri", size: 9 };
    worksheet.getCell("A5").alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    worksheet.mergeCells("B5:B6");
    worksheet.getCell("B5").value = "Name";
    worksheet.getCell("B5").font = { bold: true, name: "Calibri", size: 10 };
    worksheet.getCell("B5").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.mergeCells(5, 3, 5, lastDateColIndex);
    worksheet.getCell(5, 3).value = "Place of work* Date";
    worksheet.getCell(5, 3).font = { bold: true, name: "Calibri", size: 10 };
    worksheet.getCell(5, 3).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    // Day columns (Row 6)
    datesArray.forEach((date, i) => {
      const colIndex = 3 + i;
      worksheet.getCell(6, colIndex).value = Number(formatDateDD(date));
      worksheet.getCell(6, colIndex).font = {
        bold: true,
        name: "Calibri",
        size: 9,
      };
      worksheet.getCell(6, colIndex).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    });

    // Summary columns (Row 5 & 6)
    worksheet.mergeCells(5, summaryStartColIndex, 5, summaryEndColIndex);
    worksheet.getCell(5, summaryStartColIndex).value = "Summary No. of Days";
    worksheet.getCell(5, summaryStartColIndex).font = {
      bold: true,
      name: "Calibri",
      size: 10,
    };
    worksheet.getCell(5, summaryStartColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    const summaryHeaders = ["Present", "CL", "PH", "A", "WOF", "H"];
    summaryHeaders.forEach((sh, i) => {
      const colIndex = summaryStartColIndex + i;
      worksheet.getCell(6, colIndex).value = sh;
      worksheet.getCell(6, colIndex).font = {
        bold: true,
        name: "Calibri",
        size: 9,
      };
      worksheet.getCell(6, colIndex).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    });

    // Total paid days (Row 5 & 6)
    worksheet.mergeCells(5, totalPaidDaysColIndex, 6, totalPaidDaysColIndex);
    worksheet.getCell(5, totalPaidDaysColIndex).value = "Total\npaid\ndays";
    worksheet.getCell(5, totalPaidDaysColIndex).font = {
      bold: true,
      name: "Calibri",
      size: 9,
    };
    worksheet.getCell(5, totalPaidDaysColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // OT Hours (Row 5 & 6)
    worksheet.mergeCells(5, otHoursColIndex, 6, otHoursColIndex);
    worksheet.getCell(5, otHoursColIndex).value = "OT\n(Hrs)";
    worksheet.getCell(5, otHoursColIndex).font = {
      bold: true,
      name: "Calibri",
      size: 9,
    };
    worksheet.getCell(5, otHoursColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // Remarks No. of hours (Row 5 & 6)
    worksheet.mergeCells(5, remarksColIndex, 6, remarksColIndex);
    worksheet.getCell(5, remarksColIndex).value = "Remarks\nks No.\nof\nhours";
    worksheet.getCell(5, remarksColIndex).font = {
      bold: true,
      name: "Calibri",
      size: 9,
    };
    worksheet.getCell(5, remarksColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // Signature (Row 5 & 6)
    worksheet.mergeCells(5, sigColIndex, 6, sigColIndex);
    worksheet.getCell(5, sigColIndex).value =
      "**Signature\nof\nRegister\nKeeper";
    worksheet.getCell(5, sigColIndex).font = {
      bold: true,
      name: "Calibri",
      size: 9,
    };
    worksheet.getCell(5, sigColIndex).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // Row 7: Column Indexes
    worksheet.getCell("A7").value = 1;
    worksheet.getCell("A7").alignment = { horizontal: "center" };
    worksheet.getCell("A7").font = { name: "Calibri", size: 8 };

    worksheet.getCell("B7").value = 2;
    worksheet.getCell("B7").alignment = { horizontal: "center" };
    worksheet.getCell("B7").font = { name: "Calibri", size: 8 };

    worksheet.mergeCells(7, 3, 7, lastDateColIndex);
    worksheet.getCell(7, 3).value = 4;
    worksheet.getCell(7, 3).alignment = { horizontal: "center" };
    worksheet.getCell(7, 3).font = { name: "Calibri", size: 8 };

    worksheet.mergeCells(7, summaryStartColIndex, 7, summaryEndColIndex);
    worksheet.getCell(7, summaryStartColIndex).value = 5;
    worksheet.getCell(7, summaryStartColIndex).alignment = {
      horizontal: "center",
    };
    worksheet.getCell(7, summaryStartColIndex).font = {
      name: "Calibri",
      size: 8,
    };

    worksheet.getCell(7, remarksColIndex).value = 6;
    worksheet.getCell(7, remarksColIndex).alignment = { horizontal: "center" };
    worksheet.getCell(7, remarksColIndex).font = { name: "Calibri", size: 8 };

    worksheet.getCell(7, sigColIndex).value = 7;
    worksheet.getCell(7, sigColIndex).alignment = { horizontal: "center" };
    worksheet.getCell(7, sigColIndex).font = { name: "Calibri", size: 8 };

    // Add borders to headers (Rows 5, 6, 7)
    for (let r = 5; r <= 7; r++) {
      for (let c = 1; c <= sigColIndex; c++) {
        worksheet.getCell(r, c).border = thinBorder;
      }
    }

    // Populate data rows starting from Row 8
    let currentRowNum = 8;
    groupEmployees.forEach((employee, idx) => {
      const slNo = idx + 1;
      const name =
        `${employee.first_name || ""} ${employee.middle_name || ""} ${employee.last_name || ""}`
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase();

      worksheet.getCell(currentRowNum, 1).value = slNo;
      worksheet.getCell(currentRowNum, 1).alignment = { horizontal: "center" };
      worksheet.getCell(currentRowNum, 1).font = { name: "Calibri", size: 9 };
      worksheet.getCell(currentRowNum, 1).border = thinBorder;

      worksheet.getCell(currentRowNum, 2).value = name;
      worksheet.getCell(currentRowNum, 2).alignment = { horizontal: "left" };
      worksheet.getCell(currentRowNum, 2).font = { name: "Calibri", size: 9 };
      worksheet.getCell(currentRowNum, 2).border = thinBorder;

      // Daily records mapping
      const dailyRecords = employee.monthly_attendance?.daily_records || [];

      datesArray.forEach((date, dateIdx) => {
        const colIndex = 3 + dateIdx;
        const dateStr = date.toLocaleDateString("en-CA"); // YYYY-MM-DD
        const record = dailyRecords.find((r: any) => r.date === dateStr);

        let val = "-";
        if (record) {
          if (record.holiday) {
            const ht = record.holiday_type?.toLowerCase() || "";
            if (ht === "weekly" || ht === "wof" || ht === "week off") {
              val = "W";
            } else if (ht === "casual_leave" || ht === "cl") {
              val = "CL";
            } else if (ht === "paid_leave" || ht === "pl") {
              val = "L";
            } else if (ht === "paid_holiday" || ht === "ph") {
              val = "PH";
            } else {
              val = "H";
            }
          } else if (record.present) {
            val = "P";
          } else {
            val = "A";
          }
        }

        worksheet.getCell(currentRowNum, colIndex).value = val;
        worksheet.getCell(currentRowNum, colIndex).alignment = {
          horizontal: "center",
        };
        worksheet.getCell(currentRowNum, colIndex).font = {
          name: "Calibri",
          size: 9,
        };
        worksheet.getCell(currentRowNum, colIndex).border = thinBorder;

        const cell = worksheet.getCell(currentRowNum, colIndex);
        if (val === "P") {
          cell.font = {
            color: { argb: "FF3B82F6" },
            name: "Calibri",
            size: 9,
            bold: true,
          };
        } else if (val === "A") {
          cell.font = {
            color: { argb: "FFEF4444" },
            name: "Calibri",
            size: 9,
            bold: true,
          };
        } else if (val === "W") {
          cell.font = {
            color: { argb: "FFF59E0B" },
            name: "Calibri",
            size: 9,
            bold: true,
          };
        } else if (val === "CL" || val === "L" || val === "PH" || val === "H") {
          cell.font = {
            color: { argb: "FF10B981" },
            name: "Calibri",
            size: 9,
            bold: true,
          };
        }
      });

      // Build the date cell range for this row (e.g. C8:AF8)
      const dateRangeStart = worksheet.getCell(currentRowNum, 3).address;
      const dateRangeEnd = worksheet.getCell(
        currentRowNum,
        lastDateColIndex,
      ).address;
      const dateRange = `${dateRangeStart}:${dateRangeEnd}`;

      // Summary columns — use COUNTIF formulas so editing the sheet auto-updates counts
      // Present = P
      worksheet.getCell(currentRowNum, summaryStartColIndex).value = {
        formula: `COUNTIF(${dateRange},"P")`,
      };
      // CL
      worksheet.getCell(currentRowNum, summaryStartColIndex + 1).value = {
        formula: `COUNTIF(${dateRange},"CL")`,
      };
      // PH
      worksheet.getCell(currentRowNum, summaryStartColIndex + 2).value = {
        formula: `COUNTIF(${dateRange},"PH")`,
      };
      // Absent = A
      worksheet.getCell(currentRowNum, summaryStartColIndex + 3).value = {
        formula: `COUNTIF(${dateRange},"A")`,
      };
      // WOF = W, WOF or WO
      worksheet.getCell(currentRowNum, summaryStartColIndex + 4).value = {
        formula: `COUNTIF(${dateRange},"W")+COUNTIF(${dateRange},"WOF")+COUNTIF(${dateRange},"WO")`,
      };
      // H = H or L (paid leave)
      worksheet.getCell(currentRowNum, summaryStartColIndex + 5).value = {
        formula: `COUNTIF(${dateRange},"H")+COUNTIF(${dateRange},"L")`,
      };

      for (let i = 0; i < 6; i++) {
        const colIndex = summaryStartColIndex + i;
        worksheet.getCell(currentRowNum, colIndex).alignment = {
          horizontal: "center",
        };
        worksheet.getCell(currentRowNum, colIndex).font = {
          name: "Calibri",
          size: 9,
        };
        worksheet.getCell(currentRowNum, colIndex).border = thinBorder;
      }

      // Total paid days = P + CL + PH + L (paid leave) — formula references summary cells
      const pAddr = worksheet.getCell(
        currentRowNum,
        summaryStartColIndex,
      ).address;
      const clAddr = worksheet.getCell(
        currentRowNum,
        summaryStartColIndex + 1,
      ).address;
      const phAddr = worksheet.getCell(
        currentRowNum,
        summaryStartColIndex + 2,
      ).address;
      worksheet.getCell(currentRowNum, totalPaidDaysColIndex).value = {
        formula: `${pAddr}+${clAddr}+${phAddr}+COUNTIF(${dateRange},"L")`,
      };
      worksheet.getCell(currentRowNum, totalPaidDaysColIndex).alignment = {
        horizontal: "center",
      };
      worksheet.getCell(currentRowNum, totalPaidDaysColIndex).font = {
        name: "Calibri",
        size: 9,
        bold: true,
      };
      worksheet.getCell(currentRowNum, totalPaidDaysColIndex).border =
        thinBorder;

      // OT Hours
      const otHours = employee.monthly_attendance?.overtime_hours ?? 0;
      worksheet.getCell(currentRowNum, otHoursColIndex).value = otHours;
      worksheet.getCell(currentRowNum, otHoursColIndex).alignment = {
        horizontal: "center",
      };
      worksheet.getCell(currentRowNum, otHoursColIndex).font = {
        name: "Calibri",
        size: 9,
        bold: true,
      };
      worksheet.getCell(currentRowNum, otHoursColIndex).border = thinBorder;

      // Remarks No. of hours
      worksheet.getCell(currentRowNum, remarksColIndex).value = "";
      worksheet.getCell(currentRowNum, remarksColIndex).border = thinBorder;

      // Signature
      worksheet.getCell(currentRowNum, sigColIndex).value = "";
      worksheet.getCell(currentRowNum, sigColIndex).border = thinBorder;

      currentRowNum++;
    });

    // Legend at bottom
    currentRowNum += 2;

    worksheet.mergeCells(currentRowNum, 1, currentRowNum, sigColIndex);
    worksheet.getCell(currentRowNum, 1).value =
      "#Relay and *Place of Work in case of Mines only (Underground/Opencast/Surface)";
    worksheet.getCell(currentRowNum, 1).font = {
      name: "Calibri",
      size: 9,
      italic: true,
    };
    worksheet.getCell(currentRowNum, 1).alignment = { horizontal: "left" };

    currentRowNum++;
    worksheet.mergeCells(currentRowNum, 1, currentRowNum, sigColIndex);
    worksheet.getCell(currentRowNum, 1).value =
      "In case an employee is not present the following to be entered: (R for Rest/L for Paid Leave/A for absent/W for Weekly Off/C for Establishment Closed)";
    worksheet.getCell(currentRowNum, 1).font = {
      name: "Calibri",
      size: 9,
      italic: true,
    };
    worksheet.getCell(currentRowNum, 1).alignment = { horizontal: "left" };

    currentRowNum++;
    worksheet.mergeCells(currentRowNum, 1, currentRowNum, sigColIndex);
    worksheet.getCell(currentRowNum, 1).value =
      "** Not necessary in case of E Form maintenance.";
    worksheet.getCell(currentRowNum, 1).font = {
      name: "Calibri",
      size: 9,
      italic: true,
    };
    worksheet.getCell(currentRowNum, 1).alignment = { horizontal: "left" };

    // Set column widths
    worksheet.getColumn(1).width = 12; // A
    worksheet.getColumn(2).width = 25; // B

    for (let i = 0; i < datesColCount; i++) {
      worksheet.getColumn(3 + i).width = 4.5;
    }

    for (let i = 0; i < 6; i++) {
      worksheet.getColumn(summaryStartColIndex + i).width = 8;
    }

    worksheet.getColumn(totalPaidDaysColIndex).width = 10;
    worksheet.getColumn(otHoursColIndex).width = 8;
    worksheet.getColumn(remarksColIndex).width = 12;
    worksheet.getColumn(sigColIndex).width = 15;
  }

  return await workbook.xlsx.writeBuffer();
};

export const AttendanceDailyRegister = ({
  selectedRows,
  companyName,
  companyAddress,
  className,
}: {
  selectedRows: any[];
  companyName?: CompanyDatabaseRow;
  companyAddress?: LocationDatabaseRow;
  className?: string;
}) => {
  const generateDailyAttendanceExcel = async (selectedRows: any[]) => {
    if (!selectedRows.length) return;

    const workbook = await prepareDailyAttendanceWorkbook({
      selectedRows,
      companyName,
      companyAddress,
    });

    saveAs(
      new Blob([workbook], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `Daily-Attendance-Register ${formatDateTime(Date.now())}.xlsx`,
    );
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn(
          buttonVariants({ variant: "muted" }),
          "w-full justify-start text-[13px] h-9 px-2 gap-2",
          className,
        )}
      >
        <Icon name="plus-circled" />
        <p>Daily Register (Form D)</p>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Daily Attendance Register (Form D)
          </AlertDialogTitle>
          <AlertDialogDescription>
            Create the exact Form D Attendance Register for{" "}
            {selectedRows.length} employees.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "ghost" }))}
            onClick={() => generateDailyAttendanceExcel(selectedRows)}
            onSelect={() => generateDailyAttendanceExcel(selectedRows)}
          >
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
