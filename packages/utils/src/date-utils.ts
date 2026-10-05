import { UTCDate } from "@date-fns/utc";
import {
  isValid,
  format,
  differenceInYears,
  differenceInMonths,
  differenceInDays,
  addYears,
  addMonths,
  addDays,
  subYears,
  subMonths,
  subDays,
  endOfMonth,
} from "date-fns";
import { months } from "../constant";

export { UTCDate } from "@date-fns/utc";
export { formatDateRange } from "little-date";

export const defaultDay = new Date().getUTCDate();
export const defaultMonth = new Date().getUTCMonth() + 1;
export const defaultYear = new Date().getUTCFullYear();

// Previous month helpers for attendance default filter
const _now = new Date();
export const previousMonth = _now.getUTCMonth() === 0 ? 12 : _now.getUTCMonth();
export const previousMonthYear =
  _now.getUTCMonth() === 0 ? _now.getUTCFullYear() - 1 : _now.getUTCFullYear();

export function parseMonthNumber(
  m: string | number | undefined | null,
  fallback: number = previousMonth,
): number {
  if (m === undefined || m === null || m === "") return fallback;
  if (typeof m === "number") return Number.isNaN(m) ? fallback : m;
  const num = Number(m);
  if (!Number.isNaN(num) && num >= 1 && num <= 12) return num;
  const cleaned = String(m).toLowerCase().trim();
  const key = Object.keys(months).find((k) => k.toLowerCase() === cleaned);
  return key ? months[key] : fallback;
}

export function formatUTCDate(date?: string): string | undefined {
  return date ? new UTCDate(date).toISOString() : undefined;
}

export function getValidDateForInput(date: string | Date | undefined): string {
  let dateObject: Date | null = null;

  if (date instanceof Date && isValid(date)) {
    dateObject = date;
  } else if (typeof date === "string") {
    dateObject = new Date(date);

    if (!isValid(dateObject)) {
      return "";
    }
  }

  if (dateObject && isValid(dateObject)) {
    return format(dateObject, "yyyy-MM-dd");
  }

  return "";
}

export function getAutoTimeDifference(
  startDate: string | Date | undefined | null,
  endDate: string | Date | undefined | null,
  unit: "days" | "months" | "years" = "days",
): number | null {
  const start = startDate
    ? startDate instanceof Date && isValid(startDate)
      ? startDate
      : new Date(startDate)
    : null;
  const end = endDate
    ? endDate instanceof Date && isValid(endDate)
      ? endDate
      : new Date(endDate)
    : null;

  if (!isValid(start) || !isValid(end) || start === null || end === null) {
    return null;
  }

  switch (unit) {
    case "days":
      return differenceInDays(end, start);
    case "months":
      return differenceInMonths(end, start);
    case "years":
      return differenceInYears(end, start);
    default:
      return differenceInDays(end, start);
  }
}

export function formatMonthYearDate(date: Date | string | number) {
  return format(new Date(date), "MMM yyyy");
}

export function formatDate(date: Date | string | number | null): any {
  if (!date || typeof date === "number") {
    return date;
  }

  if (typeof date === "string") {
    const trimmed = date.trim();
    if (!trimmed.length) return date;

    const parsedDate = new Date(trimmed);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      !trimmed.match(/^\d{4}-\d{2}-\d{2}/)
    ) {
      return date;
    }

    return format(parsedDate, "dd MMM yyyy");
  }

  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return format(date, "dd MMM yyyy");
  }

  return date;
}

export function formatDateToSlash(date: Date | string | number | null): any {
  if (!date || typeof date === "number") {
    return date;
  }

  if (typeof date === "string") {
    const trimmed = date.trim();
    if (!trimmed.length) return date;

    const parsedDate = new Date(trimmed);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      !trimmed.match(/^\d{4}-\d{2}-\d{2}/)
    ) {
      return date;
    }

    return format(parsedDate, "dd/MM/yyyy");
  }

  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return format(date, "dd/MM/yyyy");
  }

  return date;
}

export function formatDateToDash(date: Date | string | number | null): any {
  if (!date || typeof date === "number") {
    return date;
  }

  if (typeof date === "string") {
    const trimmed = date.trim();
    if (!trimmed.length) return date;

    const parsedDate = new Date(trimmed);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      !trimmed.match(/^\d{4}-\d{2}-\d{2}/)
    ) {
      return date;
    }

    return format(parsedDate, "dd-MM-yyyy");
  }

  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return format(date, "dd-MM-yyyy");
  }

  return date;
}

export function formatDateTime(date: Date | string | number) {
  return format(new Date(date), "dd MMM yyyy, hh:mm a");
}

export function getYears(
  numberOfYears = 30,
  currentYear: number | null = defaultYear,
) {
  if (numberOfYears <= 0) {
    throw new Error("Number of years must be greater than 0");
  }

  const years: number[] = [];

  for (let i = 0; i < numberOfYears; i++) {
    years.push((currentYear ?? defaultYear) - i);
  }

  return years;
}

export const formatDateToMonthYear = (dateString: string | number | Date) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
};

export const calculateDateRange = (
  range: string,
  monthName: string | number | null | undefined,
  yearValue: string | number | undefined,
) => {
  const rangeNumber = Number.parseInt(String(range), 10);
  const monthNumber = monthName ? months[monthName] : defaultMonth;
  const yearToUse = Number.parseInt(yearValue as string) || defaultYear;

  if (rangeNumber > 0) {
    const endDateObj = new Date(yearToUse, monthNumber, rangeNumber + 1);
    let targetMonth = monthNumber - 1;
    let targetYear = yearToUse;
    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    }
    const startDateObj = new Date(targetYear, targetMonth, rangeNumber + 2);
    return {
      startDate: startDateObj.toISOString().split("T")[0],
      endDate: endDateObj.toISOString().split("T")[0],
    };
  }
  const monthStr = monthNumber.toString().padStart(2, "0");
  const lastDay = new Date(yearToUse, monthNumber, 0).getDate();
  return {
    startDate: `${yearToUse}-${monthStr}-01`,
    endDate: `${yearToUse}-${monthStr}-${lastDay}`,
  };
};

export function formatPdfDate(date: Date | string | number | null): string {
  const formatted = formatDate(date);

  if (typeof formatted !== "string") return "";

  const monthMap: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };

  return formatted.replace(
    /(\d{2}) ([A-Za-z]{3}) (\d{4})/,
    (_, day, month, year) => {
      return `${day}/${monthMap[month]}/${year}`;
    },
  );
}

export function wrapText(text: string, maxLength: number) {
  if (!text) return [];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxLength) {
      lines.push(currentLine.trim());
      currentLine = `${word} `;
    } else {
      currentLine += `${word} `;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
}

export function formatDateToOrdinal(
  date: Date | string | number | null | undefined,
): string {
  if (!date) return "";

  let parsedDate: Date;

  if (typeof date === "string") {
    const trimmed = date.trim();
    if (!trimmed.length) return "";

    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      parsedDate = new Date(
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10) - 1,
        Number.parseInt(match[3], 10),
      );
    } else {
      parsedDate = new Date(trimmed);
    }
  } else if (date instanceof Date) {
    parsedDate = date;
  } else if (typeof date === "number") {
    parsedDate = new Date(date);
  } else {
    return "";
  }

  if (!isValid(parsedDate) || Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const day = parsedDate.getDate();
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = day % 100;
  const suffix =
    suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0];
  const dayOrdinal = `${day}${suffix}`;
  const monthStr = format(parsedDate, "MMM");
  const yearStr = format(parsedDate, "yyyy");

  return `${dayOrdinal} ${monthStr} ${yearStr}`;
}

export function resolveDynamicDate(
  rawDate: Date | string | number | null,
  formula: string,
): string {
  if (!rawDate) return "";

  let date: Date;
  if (typeof rawDate === "string") {
    const trimmed = rawDate.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      date = new Date(
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10) - 1,
        Number.parseInt(match[3], 10),
      );
    } else {
      date = new Date(trimmed);
    }
  } else {
    date = new Date(rawDate);
  }

  if (!isValid(date) || Number.isNaN(date.getTime())) return "";

  let isOrdinal = false;
  let cleanFormula = formula ? formula.trim() : "";

  if (
    cleanFormula.toLowerCase() === "ordinal" ||
    cleanFormula.toLowerCase() === "format:ordinal"
  ) {
    return formatDateToOrdinal(date);
  }

  if (/[:|]ordinal$/i.test(cleanFormula)) {
    isOrdinal = true;
    cleanFormula = cleanFormula.replace(/[:|]ordinal$/i, "");
  } else if (/^ordinal[:|]/i.test(cleanFormula)) {
    isOrdinal = true;
    cleanFormula = cleanFormula.replace(/^ordinal[:|]/i, "");
  }

  let dayAdjustment = 0;
  let shouldRoundToPreviousMonthEnd = false;

  if (cleanFormula.endsWith("-round")) {
    shouldRoundToPreviousMonthEnd = true;
    cleanFormula = cleanFormula.replace(/-round$/, "");
  }

  const match = cleanFormula.match(/^(.*?)([-+]\d+):day$/);

  if (match) {
    cleanFormula = match[1];
    dayAdjustment = Number.parseInt(match[2], 10);
  }

  const parts = cleanFormula.split(":");
  let resultDate = new Date(date);

  if (parts.length === 3) {
    const [operation, amountStr, unit] = parts;
    const amount = Number.parseInt(amountStr, 10);

    if (!Number.isNaN(amount)) {
      switch (operation) {
        case "add":
          if (unit === "year") resultDate = addYears(resultDate, amount);
          else if (unit === "month") resultDate = addMonths(resultDate, amount);
          else if (unit === "day") resultDate = addDays(resultDate, amount);
          break;

        case "sub":
          if (unit === "year") resultDate = subYears(resultDate, amount);
          else if (unit === "month") resultDate = subMonths(resultDate, amount);
          else if (unit === "day") resultDate = subDays(resultDate, amount);
          break;
      }
    }
  }

  if (shouldRoundToPreviousMonthEnd) {
    resultDate = endOfMonth(subMonths(resultDate, 1));
  }

  if (dayAdjustment !== 0) {
    resultDate = addDays(resultDate, dayAdjustment);
  }

  return isOrdinal
    ? formatDateToOrdinal(resultDate)
    : formatDateToSlash(resultDate);
}
