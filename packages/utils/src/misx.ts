import { z } from "zod";
import { months } from "../constant";

export function isGoodStatus(status: number | string) {
  const statusString = status.toString();
  return statusString.startsWith("2");
}

export function replaceDash(str: string | null | undefined) {
  if (typeof str !== "string") {
    return str;
  }
  return str?.replaceAll("-", " ");
}

export function replaceUnderscore(str: string | null | undefined) {
  if (typeof str !== "string") {
    return str;
  }
  const replaced = str.replaceAll("_", " ");
  if (replaced.toLowerCase() === "iti") {
    return "ITI";
  }
  return replaced;
}

export const pipe =
  (...fns: any[]) =>
  (val: any) =>
    fns.reduce((prev, fn) => fn(prev), val);

export function getInitialValueFromZod<T extends z.ZodTypeAny>(
  schema: T,
): z.infer<T> {
  let unwrappedSchema = schema;
  while (unwrappedSchema instanceof z.ZodEffects) {
    unwrappedSchema = unwrappedSchema._def.schema;
  }

  if (!(unwrappedSchema instanceof z.ZodObject)) {
    throw new Error("Schema must be a ZodObject or wrapped ZodObject");
  }

  return Object.fromEntries(
    Object.entries(unwrappedSchema.shape).map(([key, value]) => {
      if (value instanceof z.ZodDefault) {
        return [key, value._def.defaultValue()];
      }
      return [key, undefined];
    }),
  ) as z.infer<T>;
}

export function transformStringArrayIntoOptions(
  arr: string[],
): { value: string; label: string }[] {
  return arr?.map((str) => ({
    value: String(str),
    label: String(str).toLowerCase() === "iti" ? "ITI" : String(str),
  }));
}

export function getOrdinalSuffix(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = n % 100;

  return (
    n + (suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0])
  );
}

export function deepEqualCheck(
  obj1: { [x: string]: any } | null | undefined,
  obj2: { [x: string]: any } | null | undefined,
) {
  if (obj1 === obj2) {
    return true;
  }

  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  ) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqualCheck(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}

export function convertToNull<T extends Record<any, any> | null>(obj: T) {
  for (const key in obj) {
    if (obj[key] === undefined) {
      obj[key] = null;
    }
    if (obj[key] === "null") {
      obj[key] = null;
    }
  }
  return obj as T;
}

export const parseStringValue = (value: string) => {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (!Number.isNaN(Number(value))) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export function debounce<
  Callback extends (...args: Parameters<Callback>) => void,
>(fn: Callback, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<Callback>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export function getCurrentMonthIndex() {
  const date = new Date();
  return date.getMonth() + 1;
}

export function toCamelCase(str: string) {
  return str
    .toLowerCase()
    .split(" ")
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
}

export function getWorkingDaysInCurrentMonth({
  working_days,
}: {
  working_days: number[];
}): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let workingDayCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (working_days.includes(dayOfWeek)) workingDayCount++;
  }

  return workingDayCount;
}

export const searchInObject = (obj: any, searchString: string): any => {
  if (!obj || typeof obj !== "object") {
    return String(obj).toLowerCase().includes(searchString.toLowerCase());
  }

  return Object.values(obj).some((value) =>
    searchInObject(value, searchString),
  );
};

export const capitalizeFirstLetter = (val: any) => {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
};

export function extractKeys<T extends Record<string, any>, K extends string>(
  arr: T[],
  keys: K[],
): Partial<Record<K, any>>[] {
  return arr.map((obj) =>
    keys.reduce(
      (acc, key) => {
        acc[key] = key.split(".").reduce((o, k) => o?.[k], obj);
        return acc;
      },
      {} as Partial<Record<K, any>>,
    ),
  );
}

export function getMonthNameFromNumber(
  monthNumber: number,
  shortName = false,
): string {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month number must be between 1 and 12");
  }

  return shortName
    ? monthNames[monthNumber - 1].slice(0, 3)
    : monthNames[monthNumber - 1];
}

export function getMonthNumberFromName(monthName: string): number {
  if (!monthName) return 1;
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const clean = monthName.trim().toLowerCase();
  const idx = monthNames.findIndex(
    (m) =>
      m === clean ||
      m.startsWith(clean) ||
      clean.startsWith(m.slice(0, 3)),
  );
  return idx !== -1 ? idx + 1 : 1;
}

export function numberToWords(num: number): string {
  if (num === 0) return "zero";

  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];
  const teens = [
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];

  const units = [
    { value: 10000000, str: "crore" },
    { value: 100000, str: "lakh" },
    { value: 1000, str: "thousand" },
    { value: 100, str: "hundred" },
  ];

  function convert(n: number): string {
    let words = "";

    for (const unit of units) {
      if (n >= unit.value) {
        words += `${convert(Math.floor(n / unit.value))} ${unit.str} `;
        n %= unit.value;
      }
    }

    if (n >= 20) {
      words += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    }

    if (n >= 10 && n <= 19) {
      words += `${teens[n - 10]} `;
      return words.trim();
    }

    if (n > 0 && n < 10) {
      words += `${ones[n]} `;
    }

    return words.trim();
  }

  // Split integer and decimal parts
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let words = convert(integerPart);

  if (decimalPart > 0) {
    words += " point";
    for (const digit of decimalPart.toString().split("")) {
      words += ` ${ones[Number.parseInt(digit)]}`;
    }
  }

  return words.replace(/\s+/g, " ").trim();
}
export const getMonthName = (value: number): string | undefined => {
  return Object.keys(months).find((key) => months[key] === value);
};

export function roundToNearest(num: number): number {
  return Math.floor(num) + (num % 1 >= 0.5 ? 1 : 0);
}

export function roundValue(num: any): number {
  return Math.round(Number(num) || 0);
}

export const normalizeNames = (name: string) => {
  if (!name) return "";
  return (
    name
      .normalize("NFKC")
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: <explanation>
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
};

export function formatNumber(num: number): string | number {
  return Number.isInteger(num) ? num.toString() : num?.toFixed(2);
}

export function generatePrefix(siteName: string): string {
  const words = siteName
    .trim()
    .split(/\s+/)
    .map((w) => w.toUpperCase());

  if (words.length === 1) {
    return words[0].slice(0, 4);
  }

  let prefix = "";
  const totalNeeded = 4;
  const perWord = Math.floor(totalNeeded / words.length);
  let extra = totalNeeded % words.length;

  for (const word of words) {
    let take = perWord;
    if (extra > 0) {
      take++;
      extra--;
    }
    prefix += word.slice(0, take);
  }

  return prefix;
}

export function generateCompanyPrefix(companyName: string): string {
  const cleanName = companyName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleanName.length >= 3) {
    return cleanName.slice(0, 3);
  }
  return cleanName.padEnd(3, "X");
}

export function generateEmployeeCodes(
  sitePrefix: string,
  count: number,
  lastCode?: string,
): string[] {
  let startNumber = 0;
  let prefix = sitePrefix;

  if (lastCode?.toLowerCase().startsWith(sitePrefix.toLowerCase())) {
    const match = lastCode.match(/\d+$/);
    if (match) {
      startNumber = Number.parseInt(match[0], 10);
      prefix = lastCode.slice(0, lastCode.length - match[0].length);
    } else {
      prefix = lastCode;
    }
  }

  const codes: string[] = [];
  for (let i = 1; i <= count; i++) {
    codes.push(`${prefix}${startNumber + i}`);
  }

  return codes;
}

export function getCurrentFinancialYear(date: Date = new Date()): string {
  const calendarYear = date.getFullYear();
  const calendarMonth = date.getMonth(); // 0-indexed (0 is Jan, 2 is Mar, 3 is Apr)

  const startYear = calendarMonth >= 3 ? calendarYear : calendarYear - 1;
  const endYear = startYear + 1;
  const endYearSuffix = String(endYear).slice(-2);
  return `${startYear}-${endYearSuffix}`;
}

export function generateInvoiceNumber(
  prefix: string,
  lastInvoiceNumber?: string | null,
): string {
  const cleanPrefix = prefix ? prefix.trim() : "";
  const currentFYStr = getCurrentFinancialYear();

  let nextSequence = 1;
  if (lastInvoiceNumber) {
    // Strictly match format ending with /YYYY-YY/Sequence
    const formatMatch = lastInvoiceNumber.match(/\/(\d{4}-\d{2})\/(\d+)$/);
    if (formatMatch) {
      const lastFYStr = formatMatch[1];
      const lastSequence = Number.parseInt(formatMatch[2], 10);

      // If the financial year has not changed, increment the sequence. Otherwise, reset to 1.
      if (lastFYStr === currentFYStr) {
        nextSequence = lastSequence + 1;
      }
    }
  }

  return cleanPrefix
    ? `${cleanPrefix}/${currentFYStr}/${nextSequence}`
    : `${currentFYStr}/${nextSequence}`;
}

export function generateRandomCode(prefix: string) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";

  const numLetters = Math.floor(Math.random() * 4) + 1;
  const numDigits = 5 - numLetters;

  let suffix = "";

  for (let i = 0; i < numLetters; i++) {
    const randIndex = Math.floor(Math.random() * letters.length);
    suffix += letters[randIndex];
  }

  for (let i = 0; i < numDigits - 1; i++) {
    const randIndex = Math.floor(Math.random() * digits.length);
    suffix += digits[randIndex];
  }

  suffix += digits[Math.floor(Math.random() * digits.length)];

  return `${prefix}${suffix}`;
}

export function fixedDecimal(amount: number) {
  return amount.toFixed(2);
}

export function countWorkingDaysInMonth({
  year,
  month,
  working_days,
}: {
  year: number;
  month: number;
  working_days: number[];
}): number {
  const jsMonth = month - 1;

  const daysInMonth = new Date(year, jsMonth + 1, 0).getDate();
  let workingDayCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, jsMonth, day);
    const dayOfWeek = date.getDay();

    if (working_days.includes(dayOfWeek)) {
      workingDayCount++;
    }
  }

  return workingDayCount;
}

export function workingDaysInMonth({
  year,
  month,
  weeklyOff = 0,
}: {
  year: number;
  month: number;
  weeklyOff?: number;
}): number {
  const totalDays = new Date(year, month, 0).getDate();
  let workingDays = 0;

  return workingDays;
}

export function getEmployeeProfileCompleteness(data: {
  employee_statutory_details?: any;
  employee_bank_details?: any;
  work_details?: any;
  employee_addresses?: any[];
  employee_guardians?: any[];
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  primary_mobile_number?: string | null;
}) {
  const statutory = data?.employee_statutory_details;
  const bank = data?.employee_bank_details;
  const work = Array.isArray(data?.work_details)
    ? data?.work_details[0]
    : data?.work_details;
  const addresses = data?.employee_addresses || [];
  const guardians = data?.employee_guardians || [];

  const isFirstNameMissing = !data?.first_name;
  const isMiddleNameMissing = !data?.middle_name;
  const isLastNameMissing = !data?.last_name;
  const isMobileNumberMissing = !data?.primary_mobile_number;
  const isUanMissing = !statutory?.uan_number;
  const isBankMissing = !bank?.account_number;
  const isEsicApplicable = statutory?.is_esic_applicable === true;
  const isEsicMissing = isEsicApplicable && !statutory?.esic_number;
  const isWorkMissing = !work || !work.position || !work.start_date;
  const isAadharMissing = !statutory?.aadhaar_number;
  const isPanMissing = !statutory?.pan_number;
  const isPfMissing = !statutory?.pf_number;
  const isAddressMissing = !addresses.some((a: any) => a.is_primary);
  const isGuardianMissing = guardians.length === 0;

  const missingFields: string[] = [];
  if (isFirstNameMissing) missingFields.push("first name");
  if (isMiddleNameMissing) missingFields.push("middle name");
  if (isLastNameMissing) missingFields.push("last name");
  if (isMobileNumberMissing) missingFields.push("mobile number");
  if (isWorkMissing) missingFields.push("work details");
  if (isAadharMissing) missingFields.push("aadhar number");
  if (isPanMissing) missingFields.push("pan number");
  if (isBankMissing) missingFields.push("bank details");
  if (isAddressMissing) missingFields.push("primary address");
  if (isGuardianMissing) missingFields.push("guardians details");
  if (isPfMissing) missingFields.push("pf number");
  if (isUanMissing) missingFields.push("uan number");
  if (isEsicMissing) missingFields.push("esic number");

  return {
    isIncomplete: missingFields.length > 0,
    missingFields,
  };
}

export const stateMapping: Record<string, string> = {
  "andhra pradesh": "AP",
  "arunachal pradesh": "AR",
  assam: "AS",
  bihar: "BR",
  chhattisgarh: "CT",
  goa: "GA",
  gujarat: "GJ",
  haryana: "HR",
  "himachal pradesh": "HP",
  jharkhand: "JH",
  karnataka: "KA",
  kerala: "KL",
  "madhya pradesh": "MP",
  maharashtra: "MH",
  manipur: "MN",
  meghalaya: "ML",
  mizoram: "MZ",
  nagaland: "NL",
  odisha: "OR",
  punjab: "PB",
  rajasthan: "RJ",
  sikkim: "SK",
  "tamil nadu": "TN",
  telangana: "TG",
  tripura: "TR",
  "uttar pradesh": "UP",
  uttarakhand: "UT",
  "west bengal": "WB",
  "andaman and nicobar islands": "AN",
  chandigarh: "CH",
  "dadra and nagar haveli and daman and diu": "DN",
  delhi: "DL",
  "jammu and kashmir": "JK",
  ladakh: "LA",
  lakshadweep: "LD",
  puducherry: "PY",
};

export function normalizeState(state: string | null | undefined): string {
  if (!state) return "";
  const cleanState = state.trim().toLowerCase();
  if (stateMapping[cleanState]) {
    return stateMapping[cleanState];
  }
  // If it's already an abbreviation (e.g. "MP"), return it uppercase
  if (Object.values(stateMapping).includes(state.toUpperCase())) {
    return state.toUpperCase();
  }
  return state; // Fallback to original
}

export function normalizeSuperFuzzy(val: any): string {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function isPlaceholder(val: any): boolean {
  const s = String(val || "")
    .trim()
    .toLowerCase();
  return (
    !s ||
    s === "--" ||
    s === "-" ||
    s === "." ||
    s === "n/a" ||
    s === "null" ||
    s === "undefined" ||
    s === "nan"
  );
}
