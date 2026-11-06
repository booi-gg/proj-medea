import { autocomplete, isCancel, text } from "@clack/prompts";
import { listApps } from "../../launcher/apps.ts";
import { findLinkProblem, normalizeLink } from "./open-link.ts";
import type { LinkArgument } from "./placeholders.ts";
import { findNameProblem } from "./store.ts";
import type { Quicklink, QuicklinkDraft } from "./store.ts";

const DEFAULT_APP = "";
const MAX_VISIBLE_APPS = 6;

const askForOpenWith = async (current: string | undefined): Promise<string | undefined> => {
  const apps = await listApps();
  const choice = await autocomplete({
    message: "Open with",
    maxItems: MAX_VISIBLE_APPS,
    initialValue: current ?? DEFAULT_APP,
    options: [
      { value: DEFAULT_APP, label: "Default app" },
      ...apps.map(({ name, path }) => ({ value: path, label: name })),
    ],
  });
  return isCancel(choice) ? undefined : choice;
};

/** Asks for a link's details. Returns undefined when cancelled. */
export const askForQuicklink = async (
  current: Quicklink | undefined,
  links: readonly Quicklink[],
): Promise<QuicklinkDraft | undefined> => {
  const name = await text({
    message: "Name",
    placeholder: "GitHub Search",
    initialValue: current?.name ?? "",
    validate: (value) => findNameProblem(value ?? "", current?.id, links),
  });
  if (isCancel(name)) {
    return undefined;
  }
  const link = await text({
    message: "Link",
    placeholder: 'https://github.com/search?q={argument name="query"}',
    initialValue: current?.link ?? "",
    validate: (value) => findLinkProblem(value ?? ""),
  });
  if (isCancel(link)) {
    return undefined;
  }
  const openWith = await askForOpenWith(current?.openWith);
  if (openWith === undefined) {
    return undefined;
  }
  return {
    name: name.trim(),
    link: normalizeLink(link),
    ...(openWith === DEFAULT_APP ? {} : { openWith }),
  };
};

const isBlank = (value: string | undefined): boolean => (value ?? "").trim() === "";

/** Asks for each argument. Returns undefined when cancelled. */
export const askForAnswers = async (
  linkName: string,
  linkArguments: readonly LinkArgument[],
): Promise<Map<string, string> | undefined> => {
  const answers = new Map<string, string>();
  for (const { key, label, defaultValue } of linkArguments) {
    const answer = await text({
      message: `${linkName}: ${label}`,
      placeholder: defaultValue ?? "",
      validate: (value) =>
        isBlank(value) && defaultValue === undefined ? "Enter a value" : undefined,
    });
    if (isCancel(answer)) {
      return undefined;
    }
    answers.set(key, isBlank(answer) ? (defaultValue ?? "") : answer.trim());
  }
  return answers;
};
