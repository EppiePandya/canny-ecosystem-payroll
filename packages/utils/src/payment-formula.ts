// Safe formula engine for payment field custom formulas (Zoho-style).
// Supports: numbers, components (names may contain spaces), + - * / % ( ) ,
// comparisons (> < >= <= == !=) and functions like MIN, MAX, ROUND, IF.

export const FORMULA_FUNCTIONS = [
  {
    name: "MIN",
    label: "MIN(a, b, ...)",
    description: "Smallest of the given values",
  },
  {
    name: "MAX",
    label: "MAX(a, b, ...)",
    description: "Largest of the given values",
  },
  {
    name: "ROUND",
    label: "ROUND(value)",
    description: "Round to the nearest integer",
  },
  {
    name: "ROUNDUP",
    label: "ROUNDUP(value)",
    description: "Round up to the next integer",
  },
  {
    name: "ROUNDDOWN",
    label: "ROUNDDOWN(value)",
    description: "Round down to the previous integer",
  },
  { name: "ABS", label: "ABS(value)", description: "Absolute value" },
  {
    name: "IF",
    label: "IF(condition, then, else)",
    description: "Conditional value, e.g. IF(Gross > 21000, 0, Gross * 0.0075)",
  },
] as const;

export const FORMULA_OPERATORS = [
  { symbol: "+", description: "Add" },
  { symbol: "-", description: "Subtract" },
  { symbol: "*", description: "Multiply" },
  { symbol: "/", description: "Divide" },
  { symbol: "%", description: "Modulo (remainder)" },
  { symbol: "(", description: "Open bracket" },
  { symbol: ")", description: "Close bracket" },
  { symbol: ",", description: "Argument separator" },
  { symbol: ">", description: "Greater than" },
  { symbol: "<", description: "Less than" },
  { symbol: ">=", description: "Greater than or equal" },
  { symbol: "<=", description: "Less than or equal" },
  { symbol: "==", description: "Equal to" },
  { symbol: "!=", description: "Not equal to" },
] as const;

// Derived components always available besides the company's own payment fields
export const DERIVED_FORMULA_COMPONENTS = [
  { name: "Gross", description: "Sum of all earning components" },
  { name: "Basic", description: "Calculated basic amount" },
  { name: "Base Basic", description: "Base basic amount (un-prorated)" },
  { name: "Base HRA", description: "Base HRA amount (un-prorated)" },
  { name: "Monthly CTC", description: "Monthly CTC of the salary" },
  { name: "Working Days", description: "Working days of the month" },
  { name: "Present Days", description: "Present days from attendance" },
  { name: "Paid Holidays", description: "Paid holiday (PH) days" },
  { name: "PH Days", description: "Paid holiday (PH) days" },
  { name: "PH", description: "Paid holiday (PH) days" },
  { name: "Overtime Hours", description: "Overtime hours worked" },
  { name: "OT Hours", description: "Overtime hours worked" },
  { name: "Overtime", description: "Overtime hours worked" },
  { name: "OT", description: "Overtime hours worked" },
  {
    name: "Configured Amount",
    description: "Component amount configured in Employee Salary setup",
  },
] as const;

const normalizeName = (name: string) => name.trim().toLowerCase();

type Token =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "function"; name: string }
  | { kind: "operator"; value: string };

const MULTI_CHAR_OPERATORS = [">=", "<=", "==", "!="];
const SINGLE_CHAR_OPERATORS = [
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  ",",
  ">",
  "<",
];

export function tokenizeFormula(
  formula: string,
  componentNames: string[],
): Token[] {
  // Longest names first so "Basic Pay Amount" wins over "Basic"
  const sortedComponents = [...componentNames].sort(
    (a, b) => b.length - a.length,
  );
  const functionNames: string[] = FORMULA_FUNCTIONS.map((f) => f.name);
  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const char = formula[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    const twoChar = formula.slice(i, i + 2);
    if (MULTI_CHAR_OPERATORS.includes(twoChar)) {
      tokens.push({ kind: "operator", value: twoChar });
      i += 2;
      continue;
    }

    if (SINGLE_CHAR_OPERATORS.includes(char)) {
      tokens.push({ kind: "operator", value: char });
      i++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const match = formula.slice(i).match(/^\d*\.?\d+/);
      if (!match) throw new Error(`Invalid number at position ${i + 1}`);
      tokens.push({ kind: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const rest = formula.slice(i);
      // Component names first (longest match, case-insensitive, word boundary)
      const component = sortedComponents.find((name) => {
        if (rest.slice(0, name.length).toLowerCase() !== name.toLowerCase())
          return false;
        const after = rest[name.length];
        return after === undefined || !/[A-Za-z0-9_]/.test(after);
      });
      if (component) {
        tokens.push({ kind: "variable", name: component });
        i += component.length;
        continue;
      }

      const wordMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      const word = wordMatch![0];
      if (functionNames.includes(word.toUpperCase())) {
        tokens.push({ kind: "function", name: word.toUpperCase() });
        i += word.length;
        continue;
      }

      tokens.push({ kind: "variable", name: word });
      i += word.length;
      continue;
    }

    throw new Error(`Unexpected character "${char}" in formula`);
  }

  return tokens;
}

class FormulaParser {
  private tokens: Token[];
  private pos = 0;

  constructor(
    tokens: Token[],
    private variables: Record<string, number>,
  ) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private peekOperator(): string | null {
    const token = this.peek();
    return token?.kind === "operator" ? token.value : null;
  }

  private expectOperator(value: string) {
    const token = this.next();
    if (!token || token.kind !== "operator" || token.value !== value) {
      throw new Error(`Expected "${value}" in formula`);
    }
  }

  parse(): number {
    const result = this.parseComparison();
    if (this.pos < this.tokens.length) {
      const token = this.peek()!;
      const shown =
        token.kind === "operator"
          ? token.value
          : token.kind === "number"
            ? token.value
            : token.name;
      throw new Error(`Unexpected "${shown}" in formula`);
    }
    return result;
  }

  private parseComparison(): number {
    let left = this.parseAdditive();
    const operator = this.peekOperator();
    if (operator && [">", "<", ">=", "<=", "==", "!="].includes(operator)) {
      this.next();
      const right = this.parseAdditive();
      switch (operator) {
        case ">":
          left = left > right ? 1 : 0;
          break;
        case "<":
          left = left < right ? 1 : 0;
          break;
        case ">=":
          left = left >= right ? 1 : 0;
          break;
        case "<=":
          left = left <= right ? 1 : 0;
          break;
        case "==":
          left = left === right ? 1 : 0;
          break;
        case "!=":
          left = left !== right ? 1 : 0;
          break;
      }
    }
    return left;
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    let operator = this.peekOperator();
    while (operator === "+" || operator === "-") {
      this.next();
      const right = this.parseMultiplicative();
      left = operator === "+" ? left + right : left - right;
      operator = this.peekOperator();
    }
    return left;
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();
    let operator = this.peekOperator();
    while (operator === "*" || operator === "/" || operator === "%") {
      this.next();
      const right = this.parseUnary();
      if (operator === "*") left *= right;
      else if (operator === "/") left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
      operator = this.peekOperator();
    }
    return left;
  }

  private parseUnary(): number {
    if (this.peekOperator() === "-") {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.next();
    if (!token) throw new Error("Formula ended unexpectedly");

    if (token.kind === "number") return token.value;

    if (token.kind === "variable") {
      const value = this.variables[normalizeName(token.name)];
      return Number.isFinite(value) ? value : 0;
    }

    if (token.kind === "function") {
      this.expectOperator("(");
      const args: number[] = [];
      if (this.peekOperator() !== ")") {
        args.push(this.parseComparison());
        while (this.peekOperator() === ",") {
          this.next();
          args.push(this.parseComparison());
        }
      }
      this.expectOperator(")");
      return applyFunction(token.name, args);
    }

    if (token.kind === "operator" && token.value === "(") {
      const value = this.parseComparison();
      this.expectOperator(")");
      return value;
    }

    throw new Error(
      `Unexpected "${token.kind === "operator" ? token.value : ""}" in formula`,
    );
  }
}

function applyFunction(name: string, args: number[]): number {
  const requireArgs = (count: number) => {
    if (args.length !== count)
      throw new Error(`${name} expects ${count} argument(s)`);
  };
  switch (name) {
    case "MIN":
      if (args.length < 1) throw new Error("MIN expects at least 1 argument");
      return Math.min(...args);
    case "MAX":
      if (args.length < 1) throw new Error("MAX expects at least 1 argument");
      return Math.max(...args);
    case "ROUND":
      requireArgs(1);
      return Math.round(args[0]);
    case "ROUNDUP":
      requireArgs(1);
      return Math.ceil(args[0]);
    case "ROUNDDOWN":
      requireArgs(1);
      return Math.floor(args[0]);
    case "ABS":
      requireArgs(1);
      return Math.abs(args[0]);
    case "IF":
      requireArgs(3);
      return args[0] !== 0 ? args[1] : args[2];
    default:
      throw new Error(`Unknown function ${name}`);
  }
}

export function evaluateFormula(
  formula: string,
  variables: Record<string, number>,
): number {
  const componentNames = Object.keys(variables);
  const tokens = tokenizeFormula(formula, componentNames);
  if (tokens.length === 0) throw new Error("Formula is empty");
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(variables)) {
    normalized[normalizeName(key)] = value;
  }
  const result = new FormulaParser(tokens, normalized).parse();
  if (!Number.isFinite(result)) {
    throw new Error("Formula did not produce a valid number");
  }
  return result;
}

// Component names actually referenced by the formula (for test previews)
export function getUsedFormulaComponents(
  formula: string,
  componentNames: string[],
): string[] {
  try {
    const tokens = tokenizeFormula(formula, componentNames);
    const used = new Set<string>();
    for (const token of tokens) {
      if (token.kind === "variable") used.add(token.name);
    }
    return [...used];
  } catch {
    return [];
  }
}

export function validateFormula(
  formula: string,
  componentNames: string[],
): { valid: boolean; error: string | null } {
  if (!formula.trim()) return { valid: false, error: "Formula is empty" };
  try {
    const variables: Record<string, number> = {};
    for (const name of componentNames) variables[name] = 1;
    evaluateFormula(formula, variables);
    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid formula",
    };
  }
}
