const TOKENS = /\d+\.?\d*|\.\d+|[-+*/%^()]/g;
const SPACES = /\s/g;
// Enough to keep real digits, and few enough to drop the error in sums like 0.1 + 0.2.
const SIGNIFICANT_DIGITS = 15;

const SUM_OPERATORS = ["+", "-"] as const;
const PRODUCT_OPERATORS = ["*", "/", "%"] as const;

type Operator = (typeof SUM_OPERATORS)[number] | (typeof PRODUCT_OPERATORS)[number];

const OPERATIONS: Record<Operator, (left: number, right: number) => number> = {
  "+": (left, right) => left + right,
  "-": (left, right) => left - right,
  "*": (left, right) => left * right,
  "/": (left, right) => left / right,
  "%": (left, right) => left % right,
};

const isNumber = (token: string | undefined): boolean =>
  token !== undefined && !Number.isNaN(Number(token));

interface Parsed {
  result: number;
  hasOperation: boolean;
}

/** Text that doesn't add up as a sum throws, which is the normal case for search text. */
const parseTokens = (tokens: readonly string[]): Parsed => {
  let position = 0;
  let hasOperation = false;

  const takeToken = <Token extends string>(allowed: readonly Token[]): Token | undefined => {
    const token = allowed.find((candidate) => candidate === tokens[position]);
    if (token !== undefined) {
      position += 1;
    }
    return token;
  };

  // Runs left to right, so 10 - 3 - 2 is 5.
  const parseChain = (takeOperator: () => Operator | undefined, parseOperand: () => number) => {
    let result = parseOperand();
    let operator = takeOperator();
    while (operator !== undefined) {
      hasOperation = true;
      result = OPERATIONS[operator](result, parseOperand());
      operator = takeOperator();
    }
    return result;
  };

  // A bracket touching a value multiplies it, so 4(4) is 16 and (2)3 is 6. This runs just after a
  // finished value, so the token before it is a number or a closing bracket.
  const takeProductOperator = (): Operator | undefined => {
    const next = tokens[position];
    const touchesBracket = next === "(" || (tokens[position - 1] === ")" && isNumber(next));
    return touchesBracket ? "*" : takeToken(PRODUCT_OPERATORS);
  };

  const parseSum = (): number => parseChain(() => takeToken(SUM_OPERATORS), parseProduct);

  const parseProduct = (): number => parseChain(takeProductOperator, parseSigned);

  // A leading minus applies after a power, so -2 ^ 2 is -4.
  const parseSigned = (): number => {
    const sign = takeToken(SUM_OPERATORS);
    if (sign === undefined) {
      return parsePower();
    }
    return sign === "-" ? -parseSigned() : parseSigned();
  };

  // Runs right to left, so 2 ^ 3 ^ 2 is 512.
  const parsePower = (): number => {
    const base = parseValue();
    if (takeToken(["^"]) === undefined) {
      return base;
    }
    hasOperation = true;
    return base ** parseSigned();
  };

  const parseValue = (): number => {
    if (takeToken(["("]) !== undefined) {
      const result = parseSum();
      if (takeToken([")"]) === undefined) {
        throw new Error("A bracket isn't closed");
      }
      return result;
    }
    const value = Number(tokens[position] ?? Number.NaN);
    if (Number.isNaN(value)) {
      throw new Error("Expected a number");
    }
    position += 1;
    return value;
  };

  const result = parseSum();
  if (position < tokens.length) {
    throw new Error("Text is left over after the sum");
  }
  return { result, hasOperation };
};

const formatAnswer = (answer: number): string =>
  String(Number.isInteger(answer) ? answer : Number(answer.toPrecision(SIGNIFICANT_DIGITS)));

const toTokens = (text: string): string[] | undefined => {
  const tokens = text.match(TOKENS) ?? [];
  const coversAllText = tokens.join("") === text.replaceAll(SPACES, "");
  return coversAllText ? tokens : undefined;
};

/**
 * The answer to a sum like "2 * 4", or undefined for anything else. Parsed by hand, because search
 * text must never run as code.
 */
export const calculate = (text: string): string | undefined => {
  const tokens = toTokens(text);
  if (tokens === undefined || tokens.length === 0) {
    return undefined;
  }
  try {
    const { result, hasOperation } = parseTokens(tokens);
    return hasOperation && Number.isFinite(result) ? formatAnswer(result) : undefined;
  } catch {
    return undefined;
  }
};
