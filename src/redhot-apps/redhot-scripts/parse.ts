/** Reads script command headers: comments like "# @redhot.title Kill Port" near the top. */

export const SCRIPT_MODES = ["silent", "compact", "fullOutput", "inline"] as const;
export type ScriptMode = (typeof SCRIPT_MODES)[number];
export const MAX_SCRIPT_ARGUMENTS = 3;

export interface DropdownChoice {
  title: string;
  value: string;
}

export interface ScriptArgument {
  type: "text" | "password" | "dropdown";
  placeholder: string;
  optional: boolean;
  percentEncoded: boolean;
  choices: DropdownChoice[];
}

export interface ScriptCommand {
  title: string;
  mode: ScriptMode;
  icon?: string;
  packageName?: string;
  description?: string;
  /** Where the script runs. Defaults to the script's own folder. */
  currentDirectoryPath?: string;
  needsConfirmation: boolean;
  arguments: ScriptArgument[];
  /** Set when the headers are broken, so the script can say what's wrong instead of running. */
  problem?: string;
}

// A header is a comment in any common language: "# @redhot.title Hi", "// ...", "-- ...".
// "@raycast." is read the same way, so scripts written in Raycast's identical format run as they are.
const HEADER_LINE = /^\s*(?:#|\/\/|--|;|%)\s*@(?:redhot|raycast)\.([A-Za-z0-9]+)(?:\s+(.*?))?\s*$/u;
// Headers sit at the top, so a long script isn't read to the end.
export const HEADER_SCAN_LINES = 100;
const ARGUMENT_KEY = /^argument([1-9])$/u;
const ARGUMENT_TYPES = new Set(["text", "password", "dropdown"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isScriptMode = (value: string): value is ScriptMode =>
  SCRIPT_MODES.some((mode) => mode === value);

const isArgumentType = (value: unknown): value is ScriptArgument["type"] =>
  typeof value === "string" && ARGUMENT_TYPES.has(value);

const toChoices = (data: unknown): DropdownChoice[] =>
  Array.isArray(data)
    ? data
        .filter(isObject)
        .flatMap(({ title, value }) =>
          typeof value === "string"
            ? [{ title: typeof title === "string" ? title : value, value }]
            : [],
        )
    : [];

/** Reads one argument's JSON. Returns a sentence saying what's wrong when it can't be used. */
export const parseScriptArgument = (json: string): ScriptArgument | string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return "isn't valid JSON";
  }
  if (!isObject(parsed)) {
    return "must be a JSON object";
  }
  const type = parsed.type ?? "text";
  if (!isArgumentType(type)) {
    return 'needs a type of "text", "password" or "dropdown"';
  }
  const choices = toChoices(parsed.data);
  if (type === "dropdown" && choices.length === 0) {
    return 'needs a "data" list of { "title", "value" } choices';
  }
  return {
    type,
    placeholder: typeof parsed.placeholder === "string" ? parsed.placeholder : "",
    optional: parsed.optional === true,
    percentEncoded: parsed.percentEncoded === true,
    choices,
  };
};

const readHeaders = (text: string): Map<string, string> => {
  const headers = new Map<string, string>();
  for (const line of text.split("\n").slice(0, HEADER_SCAN_LINES)) {
    const match = HEADER_LINE.exec(line);
    const [, key, value = ""] = match ?? [];
    if (key !== undefined && !headers.has(key)) {
      headers.set(key, value);
    }
  }
  return headers;
};

const readArguments = (headers: ReadonlyMap<string, string>): ScriptArgument[] | string => {
  const found: ScriptArgument[] = [];
  for (let position = 1; position <= MAX_SCRIPT_ARGUMENTS; position += 1) {
    const json = headers.get(`argument${position}`);
    if (json === undefined) {
      break;
    }
    const argument = parseScriptArgument(json);
    if (typeof argument === "string") {
      return `argument${position} ${argument}`;
    }
    found.push(argument);
  }
  const skipped = [...headers.keys()].find((key) => {
    const position = Number(ARGUMENT_KEY.exec(key)?.[1] ?? 0);
    return position > found.length;
  });
  if (skipped !== undefined) {
    return Number(skipped.slice("argument".length)) > MAX_SCRIPT_ARGUMENTS
      ? `Scripts take at most ${MAX_SCRIPT_ARGUMENTS} arguments`
      : `${skipped} needs the arguments before it`;
  }
  return found;
};

type OptionalText = "icon" | "packageName" | "description" | "currentDirectoryPath";
const OPTIONAL_TEXT: readonly OptionalText[] = [
  "icon",
  "packageName",
  "description",
  "currentDirectoryPath",
];

const readOptionalText = (headers: ReadonlyMap<string, string>): Partial<ScriptCommand> => {
  const values: Partial<Record<OptionalText, string>> = {};
  for (const key of OPTIONAL_TEXT) {
    const value = headers.get(key)?.trim() ?? "";
    if (value !== "") {
      values[key] = value;
    }
  }
  return values;
};

/**
 * Reads a script's headers. Returns undefined for a file that isn't a script command at all,
 * which is one without a title.
 */
export const parseScriptCommand = (text: string): ScriptCommand | undefined => {
  const headers = readHeaders(text);
  const title = headers.get("title")?.trim() ?? "";
  if (title === "") {
    return undefined;
  }
  const mode = headers.get("mode")?.trim() ?? "";
  const scriptArguments = readArguments(headers);
  const problems = [
    isScriptMode(mode) ? undefined : `Set @redhot.mode to ${SCRIPT_MODES.join(", ")}`,
    typeof scriptArguments === "string" ? scriptArguments : undefined,
  ].filter((problem) => problem !== undefined);
  return {
    title,
    mode: isScriptMode(mode) ? mode : "compact",
    ...readOptionalText(headers),
    needsConfirmation: headers.get("needsConfirmation")?.trim() === "true",
    arguments: typeof scriptArguments === "string" ? [] : scriptArguments,
    ...(problems.length === 0 ? {} : { problem: problems.join(". ") }),
  };
};

/** Encodes an answer when its argument asks for it, so it can go straight into a URL. */
export const prepareAnswer = (argument: ScriptArgument, answer: string): string =>
  argument.percentEncoded ? encodeURIComponent(answer) : answer;
