import { homedir } from "node:os";
import { join, sep } from "node:path";

// The same folder runs from src/ in a checkout and from dist/ once published.
export const projectDir = join(import.meta.dirname, "..");
export const cliEntryPath = join(import.meta.dirname, "start.js");
// swiftc only allows top-level code in a file named main.swift.
export const helperSourcePaths = [
  "main.swift",
  "StatusItem.swift",
  "HelperSocket.swift",
  "WindowGeometry.swift",
  "WindowManager.swift",
  "ScreenLock.swift",
  "SnippetMatcher.swift",
  "SnippetExpander.swift",
  "PasteBack.swift",
  "MenuSearch.swift",
  "NoticePanel.swift",
  "Countdown.swift",
  "Log.swift",
].map((name) => join(projectDir, "native", name));
export const recorderSourcePath = join(projectDir, "native", "HotkeyRecorder.swift");
export const imagePreviewSourcePath = join(projectDir, "native", "ImagePreview.swift");
export const colourSamplerSourcePath = join(projectDir, "native", "ColourSampler.swift");
export const dictionaryLookupSourcePath = join(projectDir, "native", "DictionaryLookup.swift");

// An installed copy can't write to its own folder, which may be root-owned and is replaced on every
// upgrade. A checkout keeps its own .build, so testing it never touches the installed copy.
// start.js repeats this, because it can't import a .ts file.
export const isInstalled = projectDir.split(sep).includes("node_modules");
// Tells a checkout's windows apart from the installed copy's when both are open.
export const APP_NAME = isInstalled ? "Redhot" : "Redhot (dev)";
export const buildDir = isInstalled
  ? join(homedir(), "Library", "Application Support", "Redhot")
  : join(projectDir, ".build");
export const helperPath = join(buildDir, "redhot-status");
export const recorderPath = join(buildDir, "redhot-record");
export const imagePreviewPath = join(buildDir, "redhot-image-preview");
export const colourSamplerPath = join(buildDir, "redhot-colour-sampler");
export const dictionaryLookupPath = join(buildDir, "redhot-dictionary");
export const helperLogPath = join(buildDir, "helper.log");
export const launcherPath = join(buildDir, "open-redhot.command");
export const socketPath = join(buildDir, "cli.sock");
export const helperSocketPath = join(buildDir, "helper.sock");

export const configDir = join(homedir(), ".config", "redhot");
export const configPath = join(configDir, "config.json");
export const quicklinksPath = join(configDir, "redhot-quicklinks.json");
export const snippetsPath = join(configDir, "redhot-snippets.json");
export const emojiRecentsPath = join(configDir, "redhot-emoji-recents.json");
export const colourHistoryPath = join(configDir, "redhot-colour-history.json");
export const scriptsDir = join(configDir, "scripts");
export const syncStatePath = join(configDir, "sync-state.json");
export const syncOutboxDir = join(configDir, "sync-outbox");
export const loginItemPath = join(homedir(), "Library", "LaunchAgents", "redhot.menu-bar.plist");
export const clipboardHistoryPath = join(configDir, "redhot-clipboard-history.json");
export const clipboardImagesDir = join(configDir, "redhot-clipboard-history");
export const currencyRatesPath = join(configDir, "redhot-currency-rates.json");
export const logDir = join(homedir(), "Library", "Logs", "Redhot");
export const logPath = join(logDir, "redhot.log");
