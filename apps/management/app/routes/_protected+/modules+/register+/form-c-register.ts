import type ExcelJS from "exceljs";

export function addFormCRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  cleanSiteName: string,
) {
  const sheetC = workbook.addWorksheet("FORM C");

  sheetC.mergeCells("A2:O2");
  sheetC.getCell("A2").value = "FORM C";
  sheetC.getCell("A2").font = { bold: true, size: 12 };
  sheetC.getCell("A2").alignment = { horizontal: "center" };

  sheetC.mergeCells("A3:O3");
  sheetC.getCell("A3").value = "REGISTER OF LOAN/RECOVERIES AND DAMAGE OR LOSS";
  sheetC.getCell("A3").font = { bold: true, size: 14 };
  sheetC.getCell("A3").alignment = { horizontal: "center" };

  sheetC.mergeCells("A5:O5");
  sheetC.getCell("A5").value =
    `Name of Establishment: Canny Management Services Pvt. Ltd.   Site: ${cleanSiteName}`;
  sheetC.getCell("A5").font = { bold: true, size: 10 };

  const headersC = [
    "Sl. No.",
    "Employee Code",
    "Employee Name",
    "Recovery Type *(Damage/Loss/Loan)*",
    "Particulars",
    "Date of Damage/Loss/Loan",
    "Amount",
    "Show Cause *(Yes/No)*",
    "Explanation *(Yes/No)*",
    "Number of Instalments",
    "First Month",
    "Last Month",
    "Date of Complete Recovery",
    "Remarks",
  ];
  const headerRowC = sheetC.addRow(headersC);
  headerRowC.height = 30;
  headerRowC.eachCell((cell) => {
    cell.font = { bold: true, size: 9 };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  const indexesC = Array.from({ length: 14 }, (_, i) => String(i + 1));
  const indexRowC = sheetC.addRow(indexesC);
  indexRowC.eachCell((cell) => {
    cell.font = { italic: true, size: 8 };
    cell.alignment = { horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  dataToExport.forEach((emp, index) => {
    const rowData = [
      index + 1,
      emp.code,
      emp.fullName,
      emp.recoveryType,
      emp.recoveryParticulars,
      emp.recoveryDate,
      emp.loanAmount,
      emp.showCause,
      emp.explanation,
      emp.instalments,
      emp.firstMonth,
      emp.lastMonth,
      emp.completeDate,
      emp.remarks,
    ];
    const added = sheetC.addRow(rowData);
    added.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });
  sheetC.columns.forEach((col, idx) => {
    if (idx === 2) {
      col.width = 35;
    } else if (idx === 1 || idx === 3 || idx === 5) {
      col.width = 18;
    } else if (idx === 12) {
      col.width = 22;
    } else {
      col.width = 16;
    }
  });
}
