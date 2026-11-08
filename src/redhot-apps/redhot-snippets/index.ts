import { confirm } from "@clack/prompts";
import { saveAliases } from "../../launcher/aliases.ts";
import { saveHotkey } from "../../launcher/hotkeys.ts";
import { drawScreen } from "../../launcher/screen.ts";
import {
  askForWindowAccess,
  readWindowAccess,
  reloadSnippets,
  sendHelperRequest,
} from "../../menubar/helper-socket.ts";
import { reloadHotkeys } from "../../menubar/helper.ts";
import { UTF8_ENVIRONMENT, copyText, runCommand } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp, SettingsAction } from "../types.ts";
import { askForSnippet } from "./form.ts";
import { fillSnippet, usesClipboard } from "./placeholders.ts";
import {
  SNIPPETS_APP_ID,
  addSnippet,
  readSnippetsSync,
  removeSnippet,
  toSnippetValue,
  updateSnippet,
} from "./store.ts";
import type { Snippet, SnippetDraft } from "./store.ts";

// Reserved, so no saved snippet can end up with the same value as the create command.
const CREATE_ID = "create";
const ICON = toRedhotIcon("¶");
const CREATE_NAME = "Snippet, Create";
const PAUSE_REQUEST = "snippets pause";
const RESUME_REQUEST = "snippets resume";

type ExpansionAccess = "ready" | "no-helper" | "asked";

// Not readClipboard() from quicklinks, because that trims and a snippet should paste it as copied.
const readRawClipboard = async (): Promise<string> => {
  const { stdout } = await runCommand("pbpaste", { env: UTF8_ENVIRONMENT });
  return stdout;
};

const copySnippet = async ({ name, text }: Snippet): Promise<string> => {
  const clipboard = usesClipboard(text) ? await readRawClipboard() : "";
  await copyText(fillSnippet(text, { now: new Date(), clipboard }));
  return `Copied ${name}`;
};

// The helper is told to stop expanding while the form is open, or typing an existing keyword into
// it would expand there. If this process dies first, the pause runs out by itself.
const askWithExpansionPaused = async (
  current: Snippet | undefined,
): Promise<SnippetDraft | undefined> => {
  await sendHelperRequest(PAUSE_REQUEST);
  try {
    return await askForSnippet(current, readSnippetsSync());
  } finally {
    await sendHelperRequest(RESUME_REQUEST);
  }
};

/** Adds the helper to the list in System Settings when a keyword needs it and it isn't allowed. */
const ensureExpansionAccess = async (): Promise<ExpansionAccess> => {
  const access = await readWindowAccess();
  if (access === "missing") {
    await askForWindowAccess();
    return "asked";
  }
  return access === "granted" ? "ready" : "no-helper";
};

const describeSaved = async ({ name, keyword }: SnippetDraft): Promise<string> => {
  if (keyword === undefined) {
    return `Saved ${name}`;
  }
  const access = await ensureExpansionAccess();
  if (access === "ready") {
    return `Saved ${name}. Type ${keyword} in any app to use it`;
  }
  return access === "asked"
    ? `Saved ${name}. Turn on redhot-status under Accessibility so ${keyword} can expand`
    : `Saved ${name}. ${keyword} needs the menu bar item to expand, so add that first`;
};

const createSnippet = async (): Promise<string> => {
  drawScreen({ title: CREATE_NAME, icon: ICON });
  const draft = await askWithExpansionPaused(undefined);
  if (draft === undefined) {
    return "";
  }
  await addSnippet(draft, [CREATE_ID]);
  await reloadSnippets();
  return describeSaved(draft);
};

const toItem = (snippet: Snippet): LauncherItem => ({
  value: toSnippetValue(snippet.id),
  name: snippet.name,
  icon: ICON,
  kind: snippet.keyword === undefined ? "Snippet" : `Snippet ${snippet.keyword}`,
  run: () => copySnippet(snippet),
});

const createItem: LauncherItem = {
  value: toSnippetValue(CREATE_ID),
  name: CREATE_NAME,
  icon: ICON,
  kind: "Command",
  needsWindow: true,
  run: createSnippet,
};

const editSnippet = async (snippet: Snippet): Promise<boolean> => {
  drawScreen({ title: `Edit ${snippet.name}`, icon: ICON });
  const draft = await askWithExpansionPaused(snippet);
  if (draft === undefined) {
    return true;
  }
  await updateSnippet(snippet.id, draft);
  await reloadSnippets();
  if (draft.keyword !== undefined) {
    await ensureExpansionAccess();
  }
  return true;
};

const deleteSnippet = async ({ id, name }: Snippet): Promise<boolean> => {
  const answer = await confirm({
    message: `Delete ${name}?`,
    initialValue: false,
  });
  if (answer !== true) {
    return true;
  }
  await removeSnippet(id);
  await reloadSnippets();
  await saveAliases(toSnippetValue(id), []);
  await saveHotkey(toSnippetValue(id), "");
  await reloadHotkeys();
  return false;
};

const listSettingsActions = (itemValue: string): SettingsAction[] => {
  const snippet = readSnippetsSync().find(({ id }) => toSnippetValue(id) === itemValue);
  if (snippet === undefined) {
    return [];
  }
  return [
    { label: "Edit snippet", run: () => editSnippet(snippet) },
    { label: "Delete snippet", run: () => deleteSnippet(snippet) },
  ];
};

export const snippets: RedhotApp = {
  id: SNIPPETS_APP_ID,
  listItems: () => [createItem, ...readSnippetsSync().map(toItem)],
  listSettingsActions,
};
