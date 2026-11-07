// Long code scores this or more, and text that isn't code never did on samples.
const SURE_RELEVANCE = 5;
// Short code scores as low as sentences do, so below the sure score it must also look like code.
const MIN_RELEVANCE = 2;
// Lines ending in a brace or semicolon, a call like foo(x), and operators prose doesn't use.
const CODE_SHAPE = /[{};]\s*$|\w\(.*\)\s*$|=>|===|!==|&&|\|\|/m;
// These match almost anything with an "=" or a keyword, so they beat the real language.
const NOISY_LANGUAGES = new Set(["arduino", "ini", "vbnet"]);
// About a third of a second. Longer text would make opening it feel stuck.
const MAX_LENGTH = 50_000;

export type Highlight = (text: string) => string;

/** Loaded only when needed, because the CLI also starts on every copy. */
export const createHighlighter = async (): Promise<Highlight> => {
  const { common, createEmphasize } = await import("emphasize");
  const emphasize = createEmphasize(common);
  const subset = Object.keys(common).filter((language) => !NOISY_LANGUAGES.has(language));

  return (text) => {
    if (text.length > MAX_LENGTH) {
      return text;
    }
    const { relevance, value } = emphasize.highlightAuto(text, { subset });
    const score = relevance ?? 0;
    const isCode = score >= SURE_RELEVANCE || (score >= MIN_RELEVANCE && CODE_SHAPE.test(text));
    return isCode ? value : text;
  };
};
