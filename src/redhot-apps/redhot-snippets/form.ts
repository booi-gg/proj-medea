import { isCancel, multiline, text } from "@clack/prompts";
import { findKeywordProblem, findNameProblem, findTextProblem } from "./store.ts";
import type { Snippet, SnippetDraft } from "./store.ts";

const TRAILING_LINE_BREAKS = /[\r\n]+$/;

/** Asks for a snippet's details. Returns undefined when cancelled. */
export const askForSnippet = async (
  current: Snippet | undefined,
  snippets: readonly Snippet[],
): Promise<SnippetDraft | undefined> => {
  const name = await text({
    message: "Name",
    placeholder: "Home address",
    initialValue: current?.name ?? "",
    validate: (value) => findNameProblem(value ?? "", current?.id, snippets),
  });
  if (isCancel(name)) {
    return undefined;
  }
  const keyword = await text({
    message: "Keyword to type in any app (optional)",
    placeholder: ";addr",
    initialValue: current?.keyword ?? "",
    validate: (value) => findKeywordProblem(value ?? "", current?.id, snippets),
  });
  if (isCancel(keyword)) {
    return undefined;
  }
  const body = await multiline({
    message: "Text, with {date} {time} {clipboard} {cursor} if you like. Enter twice to save",
    initialValue: current?.text ?? "",
    validate: (value) => findTextProblem(value ?? ""),
  });
  if (isCancel(body)) {
    return undefined;
  }
  const trimmedKeyword = keyword.trim();
  return {
    name: name.trim(),
    ...(trimmedKeyword === "" ? {} : { keyword: trimmedKeyword }),
    text: body.replace(TRAILING_LINE_BREAKS, ""),
  };
};
