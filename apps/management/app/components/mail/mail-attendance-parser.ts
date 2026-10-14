export function parseAttendanceGrid(rawGrid: any[][]): Array<{
  employee_code?: string;
  uan_number?: string;
  name?: string;
  attendance: Record<number, string>;
}> {
  if (!rawGrid || rawGrid.length === 0) return [];

  let headerRowIndex = -1;
  let codeColIdx = -1;
  let uanColIdx = -1;
  let nameColIdx = -1;
  let dayCols: Array<{ colIdx: number; dayNum: number }> = [];

  for (let r = 0; r < Math.min(rawGrid.length, 15); r++) {
    const row = rawGrid[r];
    if (!row || !Array.isArray(row)) continue;

    let foundCode = -1;
    let foundUan = -1;
    let foundName = -1;
    const tempDays: Array<{ colIdx: number; dayNum: number }> = [];

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || "").trim();
      const cellLower = cellVal.toLowerCase();

      if (/employee\s*code|emp\s*code|emp\s*id|^code$/i.test(cellLower)) {
        foundCode = c;
      } else if (/uan\s*number|uan\s*no|^uan$/i.test(cellLower)) {
        foundUan = c;
      } else if (/employee\s*name|emp\s*name|^name$|manpower/i.test(cellLower)) {
        foundName = c;
      }

      const dayNumMatch = cellVal.match(/^(?:0?([1-9]|[12]\d|3[01]))$/);
      if (dayNumMatch) {
        const dNum = parseInt(dayNumMatch[1], 10);
        if (dNum >= 1 && dNum <= 31) {
          tempDays.push({ colIdx: c, dayNum: dNum });
        }
      } else {
        const dateMatch = cellVal.match(/\b([0-3]?\d)[-/\s]([A-Za-z]{3}|\d{1,2})[-/\s]?(\d{2,4})?\b/);
        if (dateMatch) {
          const dNum = parseInt(dateMatch[1], 10);
          if (dNum >= 1 && dNum <= 31) {
            tempDays.push({ colIdx: c, dayNum: dNum });
          }
        }
      }
    }

    if ((foundCode !== -1 || foundUan !== -1 || foundName !== -1) && tempDays.length >= 3) {
      headerRowIndex = r;
      codeColIdx = foundCode;
      uanColIdx = foundUan;
      nameColIdx = foundName;
      dayCols = tempDays;
      break;
    }
  }

  if (headerRowIndex === -1) {
    for (let r = 0; r < Math.min(rawGrid.length, 15); r++) {
      const row = rawGrid[r];
      if (!row || !Array.isArray(row)) continue;
      const tempDays: Array<{ colIdx: number; dayNum: number }> = [];

      for (let c = 0; c < row.length; c++) {
        const cellVal = String(row[c] || "").trim();
        const dMatch = cellVal.match(/^(?:0?([1-9]|[12]\d|3[01]))$/);
        if (dMatch) {
          const dNum = parseInt(dMatch[1], 10);
          tempDays.push({ colIdx: c, dayNum: dNum });
        }
      }

      if (tempDays.length >= 10) {
        headerRowIndex = r;
        dayCols = tempDays;
        const minDayCol = Math.min(...tempDays.map((d) => d.colIdx));
        for (let c = 0; c < minDayCol; c++) {
          const sampleVal = String(rawGrid[r + 1]?.[c] || "").trim();
          if (/[a-zA-Z]{3,}\d+/.test(sampleVal) && codeColIdx === -1) {
            codeColIdx = c;
          } else if (/\d{12}/.test(sampleVal) && uanColIdx === -1) {
            uanColIdx = c;
          } else if (/[a-zA-Z\s]{3,}/.test(sampleVal) && nameColIdx === -1) {
            nameColIdx = c;
          }
        }
        if (nameColIdx === -1 && codeColIdx === -1) nameColIdx = 1;
        break;
      }
    }
  }

  if (headerRowIndex === -1) return [];

  const results: Array<{
    employee_code?: string;
    uan_number?: string;
    name?: string;
    attendance: Record<number, string>;
  }> = [];

  for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    if (!row || !Array.isArray(row)) continue;

    const empCode = codeColIdx !== -1 ? String(row[codeColIdx] || "").trim() : "";
    const uanNum = uanColIdx !== -1 ? String(row[uanColIdx] || "").trim() : "";
    const empName = nameColIdx !== -1 ? String(row[nameColIdx] || "").trim() : "";

    if (!empCode && !uanNum && !empName) continue;
    if (
      /total|sub-staff|monthly salary|grand total|summary|page \d/i.test(
        `${empCode} ${uanNum} ${empName}`
      )
    ) {
      continue;
    }

    const attendance: Record<number, string> = {};
    let hasAnyValue = false;

    for (const { colIdx, dayNum } of dayCols) {
      const rawVal = String(row[colIdx] || "").trim().toUpperCase();
      let status = "P";

      if (/^\(WOF\)$|^WOF$|^WO$|^WEEKLY OFF$|^W$|^OFF$|^SUNDAY$|^SUN$/.test(rawVal)) {
        status = "W";
      } else if (/^A$|^ABSENT$/.test(rawVal)) {
        status = "A";
      } else if (/^CL$/.test(rawVal)) {
        status = "CL";
      } else if (/^PL$/.test(rawVal)) {
        status = "PL";
      } else if (/^PH$/.test(rawVal)) {
        status = "PH";
      } else if (rawVal && rawVal !== "-" && rawVal !== "0") {
        status = "P";
        hasAnyValue = true;
      }

      attendance[dayNum] = status;
    }

    if (hasAnyValue || empCode || uanNum || empName) {
      results.push({
        employee_code: empCode,
        uan_number: uanNum,
        name: empName,
        attendance,
      });
    }
  }

  return results;
}

