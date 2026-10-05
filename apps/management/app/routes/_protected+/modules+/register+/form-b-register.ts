import type ExcelJS from "exceljs";
import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";

export async function addFormBRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  activeMonthName: string,
  selectedYear: string,
  companyName: any,
  companyAddress: any,
  stampBase64: string | null,
  signatureBase64: string | null,
) {
  const sheetB = workbook.addWorksheet("FORM B");

  // Row 1
  sheetB.getCell("A1").value = "FORM B";
  sheetB.getCell("A1").font = { bold: true, name: "Calibri", size: 10 };

  sheetB.mergeCells(1, 12, 1, 18);
  sheetB.getCell("L1").value = companyName?.name || "";
  sheetB.getCell("L1").font = { bold: true, name: "Calibri", size: 11 };
  sheetB.getCell("L1").alignment = { horizontal: "center" };

  sheetB.mergeCells(1, 21, 1, 25);
  sheetB.getCell("U1").value = CANNY_MANAGEMENT_SERVICES_NAME;
  sheetB.getCell("U1").font = { bold: true, name: "Calibri", size: 9 };
  sheetB.getCell("U1").alignment = { horizontal: "right" };

  // Row 2
  sheetB.getCell("A2").value = "FORMAT FOR WAGE REGISTER";
  sheetB.getCell("A2").font = { bold: true, name: "Calibri", size: 10 };

  sheetB.mergeCells(2, 12, 2, 18);
  const addressLine1 =
    companyAddress && (companyAddress.address_line_1 || companyAddress.address_line_2)
      ? `${companyAddress.address_line_1 || ""}, ${companyAddress.address_line_2 || ""}`
          .trim()
          .replace(/,\s*$/, "")
      : "";
  sheetB.getCell("L2").value = addressLine1;
  sheetB.getCell("L2").font = { name: "Calibri", size: 9 };
  sheetB.getCell("L2").alignment = { horizontal: "center" };

  sheetB.mergeCells(2, 21, 2, 25);
  sheetB.getCell("U2").value = "No 502,503,Girivar Glean";
  sheetB.getCell("U2").font = { name: "Calibri", size: 9 };
  sheetB.getCell("U2").alignment = { horizontal: "right" };

  // Row 3
  sheetB.mergeCells("A3:E3");
  const rateTitleCell = sheetB.getCell("A3");
  rateTitleCell.value = "Rate of Minimum Wages and since the date From....";
  rateTitleCell.font = { bold: true, size: 9, name: "Calibri" };
  rateTitleCell.alignment = { horizontal: "left", vertical: "middle" };
  for (let col = 1; col <= 5; col++) {
    sheetB.getCell(3, col).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  sheetB.mergeCells(3, 12, 3, 18);
  const addressLine2 =
    companyAddress && (companyAddress.city || companyAddress.state || companyAddress.pincode)
      ? `${companyAddress.city || ""}, ${companyAddress.state || ""} ${companyAddress.pincode || ""}`.trim()
      : "";
  sheetB.getCell("L3").value = addressLine2;
  sheetB.getCell("L3").font = { name: "Calibri", size: 9 };
  sheetB.getCell("L3").alignment = { horizontal: "center" };

  sheetB.mergeCells(3, 21, 3, 25);
  sheetB.getCell("U3").value = "Nr.Palm Hotel,S.P.Ring Road,";
  sheetB.getCell("U3").font = { name: "Calibri", size: 9 };
  sheetB.getCell("U3").alignment = { horizontal: "right" };

  // Row 4
  sheetB.getCell("A4").value = "";
  sheetB.getCell("B4").value = "Highly Skilled";
  sheetB.getCell("C4").value = "Skilled";
  sheetB.getCell("D4").value = "Semi Skilled";
  sheetB.getCell("E4").value = "Un Skilled";
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(4, col);
    cell.font = { bold: true, size: 9, name: "Calibri" };
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
  }

  sheetB.mergeCells(4, 12, 4, 18);
  sheetB.getCell("L4").value =
    `Salary For the Month of ${activeMonthName.toUpperCase()} ${selectedYear}`;
  sheetB.getCell("L4").font = { bold: true, name: "Calibri", size: 10 };
  sheetB.getCell("L4").alignment = { horizontal: "center" };

  sheetB.mergeCells(4, 21, 4, 25);
  sheetB.getCell("U4").value = "Odhav, Ahmedabad - 382415.";
  sheetB.getCell("U4").font = { name: "Calibri", size: 9 };
  sheetB.getCell("U4").alignment = { horizontal: "right" };

  // Row 5
  sheetB.getCell("A5").value = "Minimum";
  sheetB.getCell("B5").value = 577;
  sheetB.getCell("C5").value = 509;
  sheetB.getCell("D5").value = 509;
  sheetB.getCell("E5").value = 487;
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(5, col);
    cell.font = { size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Row 6
  sheetB.getCell("A6").value = "DA";
  sheetB.getCell("B6").value = 206;
  sheetB.getCell("C6").value = 68;
  sheetB.getCell("D6").value = 49;
  sheetB.getCell("E6").value = 24;
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(6, col);
    cell.font = { size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Row 7
  sheetB.getCell("A7").value = "total";
  sheetB.getCell("B7").value = 783;
  sheetB.getCell("C7").value = 577;
  sheetB.getCell("D7").value = 558;
  sheetB.getCell("E7").value = 511;
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(7, col);
    cell.font = { size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Main Headers: Rows 9 and 10
  const r9 = sheetB.getRow(9);
  const r10 = sheetB.getRow(10);
  r9.height = 25;
  r10.height = 25;

  // Standalone left headers: Cols 1 to 5 (merged vertically across rows 9 & 10)
  const standaloneLeftHeaders = [
    "Sl. No. in Employee register",
    "Name",
    "Rate of Wage",
    "No. of Days worked",
    "Overtime hours worked",
  ];
  for (let i = 0; i < standaloneLeftHeaders.length; i++) {
    sheetB.getCell(9, i + 1).value = standaloneLeftHeaders[i];
    sheetB.mergeCells(9, i + 1, 10, i + 1);
  }

  // Earnings Group in Row 9, Cols 6 to 12
  sheetB.getCell(9, 6).value = "Earnings";
  sheetB.mergeCells(9, 6, 9, 12);

  // Subheaders for Earnings in Row 10, Cols 6 to 12
  const subHeadersEarnings = [
    "Basic",
    "DA",
    "O.T",
    "LEAVE ENCASH",
    "HRA",
    "Allowa.",
    "Bonus",
  ];
  for (let i = 0; i < subHeadersEarnings.length; i++) {
    sheetB.getCell(10, 6 + i).value = subHeadersEarnings[i];
  }

  // Total Earnings (Col 13, merged vertically across rows 9 & 10)
  sheetB.getCell(9, 13).value = "Total";
  sheetB.mergeCells(9, 13, 10, 13);

  // Deductions Group in Row 9, Cols 14 to 20
  sheetB.getCell(9, 14).value = "Deductions";
  sheetB.mergeCells(9, 14, 9, 20);

  // Subheaders for Deductions in Row 10, Cols 14 to 20
  const subHeadersDeductions = [
    "PF",
    "ESIC",
    "Society",
    "P. Tax",
    "Insurance /L.W.F",
    "Others",
    "ADVAN CE",
  ];
  for (let i = 0; i < subHeadersDeductions.length; i++) {
    sheetB.getCell(10, 14 + i).value = subHeadersDeductions[i];
  }

  // Total Deductions (Col 21, merged vertically across rows 9 & 10)
  sheetB.getCell(9, 21).value = "Total";
  sheetB.mergeCells(9, 21, 10, 21);

  const mainHeadersRight = [
    "Net Payment",
    "Employer Share PF Welfare Found",
    "Transaction A/C NO.",
    "Date of Payment Remarks",
  ];
  for (let i = 0; i < mainHeadersRight.length; i++) {
    const colIdx = 22 + i;
    sheetB.getCell(9, colIdx).value = mainHeadersRight[i];
    sheetB.mergeCells(9, colIdx, 10, colIdx);
  }

  // Format Rows 9 and 10
  for (let r = 9; r <= 10; r++) {
    for (let c = 1; c <= 25; c++) {
      const cell = sheetB.getCell(r, c);
      cell.font = { bold: true, size: 9, name: "Calibri" };
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
    }
  }

  // Row 11: Index numbers
  const indexesB = Array.from({ length: 25 }, (_, i) => String(i + 1));
  const indexRowB = sheetB.getRow(11);
  indexRowB.height = 18;
  for (let i = 0; i < indexesB.length; i++) {
    const cell = indexRowB.getCell(i + 1);
    cell.value = indexesB[i];
    cell.font = { italic: true, size: 8, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  const groupedBySite: { [key: string]: any[] } = {};
  for (const emp of dataToExport) {
    const sn = emp.siteName || "DEFAULT SITE";
    if (!groupedBySite[sn]) groupedBySite[sn] = [];
    groupedBySite[sn].push(emp);
  }

  let slNo = 0;
  let firstDataRow: number | null = null;
  let lastDataRow: number | null = null;

  for (const siteName of Object.keys(groupedBySite)) {
    const siteRow = sheetB.addRow([]);
    sheetB.mergeCells(siteRow.number, 1, siteRow.number, 25);
    const siteCell = sheetB.getCell(siteRow.number, 1);
    siteCell.value = siteName.toUpperCase();
    siteCell.font = {
      bold: true,
      color: { argb: "FFFF0000" },
      name: "Calibri",
      size: 10,
    };
    siteCell.alignment = {
      horizontal: "left",
      vertical: "middle",
    };

    for (const emp of groupedBySite[siteName]) {
      slNo++;
      const basic =
        typeof emp.basic === "number"
          ? emp.basic
          : emp.basic
            ? Math.round(Number(emp.basic))
            : Math.round(emp.rateBasic * emp.daysWorked);
      const da =
        typeof emp.da === "number"
          ? emp.da
          : emp.da
            ? Math.round(Number(emp.da))
            : Math.round(emp.rateDa * emp.daysWorked);
      const estimatedTotalEarnings =
        basic +
        da +
        emp.specialBasic +
        emp.leaveEncash +
        emp.yearlyBonus +
        emp.hra +
        emp.allowances;

      const pf =
        typeof emp.pf === "number"
          ? emp.pf
          : emp.pf
            ? Math.round(Number(emp.pf))
            : Math.round(basic * 0.12);
      const esi =
        typeof emp.esi === "number"
          ? emp.esi
          : emp.esi
            ? Math.round(Number(emp.esi))
            : Math.round(estimatedTotalEarnings * 0.0075);
      const pt =
        typeof emp.pt === "number"
          ? emp.pt
          : emp.pt
            ? Math.round(Number(emp.pt))
            : estimatedTotalEarnings > 20000
              ? 200
              : 150;
      const employerPf = Math.round(basic * 0.13);

      const fmt = (v: any) => (v && Number(v) !== 0 ? v : "");

      const rowData = [
        slNo,
        emp.fullName,
        fmt(emp.rateBasic + emp.rateDa),
        fmt(emp.daysWorked),
        fmt(emp.otHours),
        fmt(basic),
        fmt(da),
        fmt(emp.specialBasic),
        fmt(emp.leaveEncash),
        fmt(emp.hra),
        fmt(emp.allowances),
        fmt(emp.yearlyBonus),
        0,
        fmt(pf),
        fmt(esi),
        "",
        fmt(pt),
        fmt(emp.lwf),
        fmt(emp.advance),
        fmt(emp.loan),
        0,
        0,
        "",
        emp.bankAc || "",
        emp.completeDate || "",
      ];

      const added = sheetB.addRow(rowData);
      added.height = 20;
      const rowNum = added.number;
      if (firstDataRow === null) firstDataRow = rowNum;
      lastDataRow = rowNum;

      added.getCell(13).value = { formula: `SUM(F${rowNum}:L${rowNum})` };
      added.getCell(21).value = { formula: `SUM(N${rowNum}:T${rowNum})` };
      added.getCell(22).value = { formula: `M${rowNum}-U${rowNum}` };

      added.eachCell((cell, colNum) => {
        cell.font = { name: "Calibri", size: 9 };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 2 || colNum === 24 || colNum === 25 ? "left" : "center",
        };
      });
    }
  }

  const totalRowData = [
    "TOTAL",
    "",
    "",
    "",
    "",
    firstDataRow && lastDataRow
      ? { formula: `SUM(F${firstDataRow}:F${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(H${firstDataRow}:H${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(I${firstDataRow}:I${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(J${firstDataRow}:J${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(K${firstDataRow}:K${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(L${firstDataRow}:L${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(M${firstDataRow}:M${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(N${firstDataRow}:N${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(O${firstDataRow}:O${lastDataRow})` }
      : 0,
    0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(Q${firstDataRow}:Q${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(R${firstDataRow}:R${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(S${firstDataRow}:S${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(T${firstDataRow}:T${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(U${firstDataRow}:U${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(V${firstDataRow}:V${lastDataRow})` }
      : 0,
    "",
    "",
    "",
  ];
  const totalRowAdded = sheetB.addRow(totalRowData);
  totalRowAdded.height = 20;
  totalRowAdded.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "double", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    if (colNum >= 6 && colNum <= 22) {
      cell.numFmt = '#,##0;-#,##0;"-"';
    }
  });

  if (signatureBase64) {
    try {
      const signatureId = workbook.addImage({
        base64: signatureBase64,
        extension: "png",
      });
      sheetB.addImage(signatureId, {
        tl: { col: 20.0, row: totalRowAdded.number + 1.5 },
        ext: { width: 180, height: 80 },
      });
    } catch (e) {
      console.error("Error adding signature image:", e);
    }
  }

  for (let idx = 0; idx < sheetB.columns.length; idx++) {
    const col = sheetB.columns[idx];
    if (col) {
      col.width = idx === 1 ? 35 : idx === 23 ? 25 : 14;
    }
  }

  for (let i = 1; i <= 100; i++) {
    sheetB.getColumn(i).protection = { locked: false };
  }
  sheetB.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.protection = { locked: false };
    });
  });

  sheetB.protect("", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertColumns: true,
    insertRows: true,
    insertHyperlinks: true,
    deleteColumns: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
    pivotTables: true,
    objects: false,
  });
}

export async function addFormBSimplianceRegisterSheet(
  workbook: ExcelJS.Workbook,
  dataToExport: any[],
  activeMonthName: string,
  selectedYear: string,
  companyName: any,
  companyAddress: any,
  stampBase64: string | null,
  signatureBase64: string | null,
) {
  const sheetB = workbook.addWorksheet("FORM B");

  // Row 1
  sheetB.getCell("A1").value = "FORM B";
  sheetB.getCell("A1").font = { bold: true, name: "Calibri", size: 10 };

  sheetB.mergeCells(1, 12, 1, 18);
  sheetB.getCell("L1").value = companyName?.name || "";
  sheetB.getCell("L1").font = { bold: true, name: "Calibri", size: 11 };
  sheetB.getCell("L1").alignment = { horizontal: "center" };

  sheetB.mergeCells(1, 21, 1, 25);
  sheetB.getCell("U1").value = CANNY_MANAGEMENT_SERVICES_NAME;
  sheetB.getCell("U1").font = { bold: true, name: "Calibri", size: 9 };
  sheetB.getCell("U1").alignment = { horizontal: "right" };

  // Row 2
  sheetB.getCell("A2").value = "FORMAT FOR WAGE REGISTER";
  sheetB.getCell("A2").font = { bold: true, name: "Calibri", size: 10 };

  sheetB.mergeCells(2, 12, 2, 18);
  const addressLine1 =
    companyAddress && (companyAddress.address_line_1 || companyAddress.address_line_2)
      ? `${companyAddress.address_line_1 || ""}, ${companyAddress.address_line_2 || ""}`
          .trim()
          .replace(/,\s*$/, "")
      : "";
  sheetB.getCell("L2").value = addressLine1;
  sheetB.getCell("L2").font = { name: "Calibri", size: 9 };
  sheetB.getCell("L2").alignment = { horizontal: "center" };

  sheetB.mergeCells(2, 21, 2, 25);
  sheetB.getCell("U2").value = "No 502,503,Girivar Glean";
  sheetB.getCell("U2").font = { name: "Calibri", size: 9 };
  sheetB.getCell("U2").alignment = { horizontal: "right" };

  // Row 3
  sheetB.mergeCells("A3:E3");
  const rateTitleCell = sheetB.getCell("A3");
  rateTitleCell.value = "Rate of Minimum Wages and since the date From....";
  rateTitleCell.font = { bold: true, size: 9, name: "Calibri" };
  rateTitleCell.alignment = { horizontal: "left", vertical: "middle" };
  for (let col = 1; col <= 5; col++) {
    sheetB.getCell(3, col).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  sheetB.mergeCells(3, 12, 3, 18);
  const addressLine2 =
    companyAddress && (companyAddress.city || companyAddress.state || companyAddress.pincode)
      ? `${companyAddress.city || ""}, ${companyAddress.state || ""} ${companyAddress.pincode || ""}`.trim()
      : "";
  sheetB.getCell("L3").value = addressLine2;
  sheetB.getCell("L3").font = { name: "Calibri", size: 9 };
  sheetB.getCell("L3").alignment = { horizontal: "center" };

  sheetB.mergeCells(3, 21, 3, 25);
  sheetB.getCell("U3").value = "Nr.Palm Hotel,S.P.Ring Road,";
  sheetB.getCell("U3").font = { name: "Calibri", size: 9 };
  sheetB.getCell("U3").alignment = { horizontal: "right" };

  // Row 4
  sheetB.getCell("A4").value = "";
  sheetB.getCell("B4").value = "Highly Skilled";
  sheetB.getCell("C4").value = "Skilled";
  sheetB.getCell("D4").value = "Semi Skilled";
  sheetB.getCell("E4").value = "Un Skilled";
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(4, col);
    cell.font = { bold: true, size: 9, name: "Calibri" };
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
  }

  sheetB.mergeCells(4, 12, 4, 18);
  sheetB.getCell("L4").value =
    `Salary For the Month of ${activeMonthName.toUpperCase()} ${selectedYear}`;
  sheetB.getCell("L4").font = { bold: true, name: "Calibri", size: 10 };
  sheetB.getCell("L4").alignment = { horizontal: "center" };

  sheetB.mergeCells(4, 21, 4, 25);
  sheetB.getCell("U4").value = "Odhav, Ahmedabad - 382415.";
  sheetB.getCell("U4").font = { name: "Calibri", size: 9 };
  sheetB.getCell("U4").alignment = { horizontal: "right" };

  // Row 5
  sheetB.getCell("A5").value = "Minimum";
  sheetB.getCell("B5").value = 577;
  sheetB.getCell("C5").value = 509;
  sheetB.getCell("D5").value = 509;
  sheetB.getCell("E5").value = 487;
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(5, col);
    cell.font = { size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Row 6
  sheetB.getCell("A6").value = "DA";
  sheetB.getCell("B6").value = 206;
  sheetB.getCell("C6").value = 68;
  sheetB.getCell("D6").value = 49;
  sheetB.getCell("E6").value = 24;
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(6, col);
    cell.font = { size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Row 7
  sheetB.getCell("A7").value = "total";
  sheetB.getCell("B7").value = 783;
  sheetB.getCell("C7").value = 577;
  sheetB.getCell("D7").value = 558;
  sheetB.getCell("E7").value = 511;
  for (let col = 1; col <= 5; col++) {
    const cell = sheetB.getCell(7, col);
    cell.font = { size: 9, name: "Calibri" };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Main Headers: Rows 9 and 10
  const r9 = sheetB.getRow(9);
  const r10 = sheetB.getRow(10);
  r9.height = 25;
  r10.height = 25;

  // Standalone left headers: Cols 1 to 5 (merged vertically across rows 9 & 10)
  const standaloneLeftHeaders = [
    "Sl. No. in Employee register",
    "Name",
    "Rate of Wage",
    "No. of Days worked",
    "Overtime hours worked",
  ];
  for (let i = 0; i < standaloneLeftHeaders.length; i++) {
    sheetB.getCell(9, i + 1).value = standaloneLeftHeaders[i];
    sheetB.mergeCells(9, i + 1, 10, i + 1);
  }

  // Earnings Group in Row 9, Cols 6 to 12
  sheetB.getCell(9, 6).value = "Earnings";
  sheetB.mergeCells(9, 6, 9, 12);

  // Subheaders for Earnings in Row 10, Cols 6 to 12
  const subHeadersEarnings = [
    "Basic",
    "DA",
    "O.T",
    "LEAVE ENCASH",
    "HRA",
    "Allowa.",
    "Bonus",
  ];
  for (let i = 0; i < subHeadersEarnings.length; i++) {
    sheetB.getCell(10, 6 + i).value = subHeadersEarnings[i];
  }

  // Total Earnings (Col 13, merged vertically across rows 9 & 10)
  sheetB.getCell(9, 13).value = "Total";
  sheetB.mergeCells(9, 13, 10, 13);

  // Deductions Group in Row 9, Cols 14 to 20
  sheetB.getCell(9, 14).value = "Deductions";
  sheetB.mergeCells(9, 14, 9, 20);

  // Subheaders for Deductions in Row 10, Cols 14 to 20
  const subHeadersDeductions = [
    "PF",
    "ESIC",
    "Society",
    "P. Tax",
    "Insurance /L.W.F",
    "Others",
    "ADVAN CE",
  ];
  for (let i = 0; i < subHeadersDeductions.length; i++) {
    sheetB.getCell(10, 14 + i).value = subHeadersDeductions[i];
  }

  // Total Deductions (Col 21, merged vertically across rows 9 & 10)
  sheetB.getCell(9, 21).value = "Total";
  sheetB.mergeCells(9, 21, 10, 21);

  const mainHeadersRight = [
    "Net Payment",
    "Employer Share PF Welfare Found",
    "Transaction A/C NO.",
    "Date of Payment Remarks",
  ];
  for (let i = 0; i < mainHeadersRight.length; i++) {
    const colIdx = 22 + i;
    sheetB.getCell(9, colIdx).value = mainHeadersRight[i];
    sheetB.mergeCells(9, colIdx, 10, colIdx);
  }

  // Format Rows 9 and 10
  for (let r = 9; r <= 10; r++) {
    for (let c = 1; c <= 25; c++) {
      const cell = sheetB.getCell(r, c);
      cell.font = { bold: true, size: 9, name: "Calibri" };
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
    }
  }

  // Row 11: Index numbers
  const indexesB = Array.from({ length: 25 }, (_, i) => String(i + 1));
  const indexRowB = sheetB.getRow(11);
  indexRowB.height = 18;
  for (let i = 0; i < indexesB.length; i++) {
    const cell = indexRowB.getCell(i + 1);
    cell.value = indexesB[i];
    cell.font = { italic: true, size: 8, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  let firstDataRow: number | null = null;
  let lastDataRow: number | null = null;

  const groupedBySite: { [key: string]: any[] } = {};
  for (const emp of dataToExport) {
    const sn = emp.siteName || "DEFAULT SITE";
    if (!groupedBySite[sn]) groupedBySite[sn] = [];
    groupedBySite[sn].push(emp);
  }

  let slNo = 0;
  for (const siteName of Object.keys(groupedBySite)) {
    const siteRow = sheetB.addRow([]);
    sheetB.mergeCells(siteRow.number, 1, siteRow.number, 25);
    const siteCell = sheetB.getCell(siteRow.number, 1);
    siteCell.value = siteName.toUpperCase();
    siteCell.font = {
      bold: true,
      color: { argb: "FFFF0000" },
      name: "Calibri",
      size: 10,
    };
    siteCell.alignment = {
      horizontal: "left",
      vertical: "middle",
    };

    for (const emp of groupedBySite[siteName]) {
      slNo++;
      const basic =
        typeof emp.basic === "number"
          ? emp.basic
          : emp.basic
            ? Math.round(Number(emp.basic))
            : Math.round(emp.rateBasic * emp.daysWorked);
      const da =
        typeof emp.da === "number"
          ? emp.da
          : emp.da
            ? Math.round(Number(emp.da))
            : Math.round(emp.rateDa * emp.daysWorked);
      const estimatedTotalEarnings =
        basic +
        da +
        emp.specialBasic +
        emp.leaveEncash +
        emp.yearlyBonus +
        emp.hra +
        emp.allowances;

      const pf =
        typeof emp.pf === "number"
          ? emp.pf
          : emp.pf
            ? Math.round(Number(emp.pf))
            : Math.round(basic * 0.12);
      const esi =
        typeof emp.esi === "number"
          ? emp.esi
          : emp.esi
            ? Math.round(Number(emp.esi))
            : Math.round(estimatedTotalEarnings * 0.0075);
      const pt =
        typeof emp.pt === "number"
          ? emp.pt
          : emp.pt
            ? Math.round(Number(emp.pt))
            : estimatedTotalEarnings > 20000
              ? 200
              : 150;
      const employerPf = Math.round(basic * 0.13);

      const fmt = (v: any) => (v && Number(v) !== 0 ? v : "");

      const rowData = [
        slNo,
        emp.fullName,
        fmt(emp.rateBasic + emp.rateDa),
        fmt(emp.daysWorked),
        fmt(emp.otHours),
        fmt(basic),
        fmt(da),
        fmt(emp.specialBasic),
        fmt(emp.leaveEncash),
        fmt(emp.hra),
        fmt(emp.allowances),
        fmt(emp.yearlyBonus),
        0,
        fmt(pf),
        fmt(esi),
        "",
        fmt(pt),
        fmt(emp.lwf),
        fmt(emp.advance),
        fmt(emp.loan),
        0,
        0,
        "",
        emp.bankAc || "",
        emp.completeDate || "",
      ];
      const added = sheetB.addRow(rowData);
      added.height = 20;
      const rowNum = added.number;
      if (firstDataRow === null) firstDataRow = rowNum;
      lastDataRow = rowNum;

      added.getCell(13).value = { formula: `SUM(F${rowNum}:L${rowNum})` };
      added.getCell(21).value = { formula: `SUM(N${rowNum}:T${rowNum})` };
      added.getCell(22).value = { formula: `M${rowNum}-U${rowNum}` };

      added.eachCell((cell, colNum) => {
        cell.font = { name: "Calibri", size: 9 };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 2 || colNum === 24 || colNum === 25 ? "left" : "center",
        };
      });
    }
  }

  const totalRowData = [
    "TOTAL",
    "",
    "",
    "",
    "",
    firstDataRow && lastDataRow
      ? { formula: `SUM(F${firstDataRow}:F${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(H${firstDataRow}:H${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(I${firstDataRow}:I${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(J${firstDataRow}:J${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(K${firstDataRow}:K${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(L${firstDataRow}:L${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(M${firstDataRow}:M${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(N${firstDataRow}:N${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(O${firstDataRow}:O${lastDataRow})` }
      : 0,
    0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(Q${firstDataRow}:Q${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(R${firstDataRow}:R${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(S${firstDataRow}:S${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(T${firstDataRow}:T${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(U${firstDataRow}:U${lastDataRow})` }
      : 0,
    firstDataRow && lastDataRow
      ? { formula: `SUM(V${firstDataRow}:V${lastDataRow})` }
      : 0,
    "",
    "",
    "",
  ];
  const totalRowAdded = sheetB.addRow(totalRowData);
  totalRowAdded.height = 20;
  totalRowAdded.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 9, name: "Calibri" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "double", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    if (colNum >= 6 && colNum <= 22) {
      cell.numFmt = '#,##0;-#,##0;"-"';
    }
  });

  if (signatureBase64) {
    try {
      const signatureId = workbook.addImage({
        base64: signatureBase64,
        extension: "png",
      });
      sheetB.addImage(signatureId, {
        tl: { col: 20.0, row: totalRowAdded.number + 1.5 },
        ext: { width: 180, height: 80 },
      });
    } catch (e) {
      console.error("Error adding signature image:", e);
    }
  }

  for (let idx = 0; idx < sheetB.columns.length; idx++) {
    const col = sheetB.columns[idx];
    if (col) {
      col.width = idx === 1 ? 35 : idx === 23 ? 25 : 14;
    }
  }

  for (let i = 1; i <= 100; i++) {
    sheetB.getColumn(i).protection = { locked: false };
  }
  sheetB.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.protection = { locked: false };
    });
  });

  await sheetB.protect("", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertColumns: true,
    insertRows: true,
    insertHyperlinks: true,
    deleteColumns: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
    pivotTables: true,
    objects: false,
  });
}

