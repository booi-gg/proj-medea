export const MAX_ARGUMENTS = 3;

const PLACEHOLDER = /\{(argument|clipboard|query)((?:\s+[a-z]+="[^"]*")*)\s*\}/g;
const ATTRIBUTE = /([a-z]+)="([^"]*)"/g;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const CLIPBOARD_PLACEHOLDER = "clipboard";
// {query} is shorthand for {argument name="query"}.
const QUERY_PLACEHOLDER = "query";

export interface LinkArgument {
  key: string;
  label: string;
  defaultValue?: string;
}

const readAttributes = (attributes: string): Map<string, string> =>
  new Map([...attributes.matchAll(ATTRIBUTE)].map(([, name = "", value = ""]) => [name, value]));

const readArgumentName = (type: string | undefined, values: Map<string, string>) =>
  type === QUERY_PLACEHOLDER ? QUERY_PLACEHOLDER : values.get("name");

// Arguments with a name share one value. Each unnamed one is its own question.
const toArgumentKey = (name: string | undefined, unnamedCount: number): string =>
  name ?? `#${unnamedCount}`;

/** The questions this link needs answered, in the order they appear. */
export const findArguments = (link: string): LinkArgument[] => {
  const linkArguments = new Map<string, LinkArgument>();
  let unnamedCount = 0;
  for (const [, type, attributes = ""] of link.matchAll(PLACEHOLDER)) {
    if (type !== CLIPBOARD_PLACEHOLDER) {
      const values = readAttributes(attributes);
      const name = readArgumentName(type, values);
      unnamedCount += name === undefined ? 1 : 0;
      const key = toArgumentKey(name, unnamedCount);
      const defaultValue = values.get("default") ?? linkArguments.get(key)?.defaultValue;
      const label = name ?? `Argument ${unnamedCount}`;
      linkArguments.set(key, {
        key,
        label,
        ...(defaultValue === undefined ? {} : { defaultValue }),
      });
    }
  }
  return [...linkArguments.values()];
};

export const usesClipboard = (link: string): boolean =>
  [...link.matchAll(PLACEHOLDER)].some(([, type]) => type === CLIPBOARD_PLACEHOLDER);

export const hasUrlScheme = (link: string): boolean => URL_SCHEME.test(link);

interface LinkValues {
  answers: ReadonlyMap<string, string>;
  clipboard: string;
}

/** Puts the values into the link. They are encoded in URLs and left alone in file paths. */
export const fillLink = (link: string, { answers, clipboard }: LinkValues): string => {
  const prepare = hasUrlScheme(link) ? encodeURIComponent : (value: string): string => value;
  let unnamedCount = 0;
  return link.replaceAll(PLACEHOLDER, (_match, type: string, attributes: string) => {
    if (type === CLIPBOARD_PLACEHOLDER) {
      return prepare(clipboard);
    }
    const name = readArgumentName(type, readAttributes(attributes));
    unnamedCount += name === undefined ? 1 : 0;
    return prepare(answers.get(toArgumentKey(name, unnamedCount)) ?? "");
  });
};
