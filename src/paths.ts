import { homedir } from "node:os";
import { join } from "node:path";

export const projectDir = join(import.meta.dirname, "..");
export const cliEntryPath = join(projectDir, "src", "start.js");
// swiftc only allows top-level code in a file named main.swift.
export const helperSourcePaths = [
  "main.swift",
  "StatusItem.swift",
  "HelperSocket.swift",
  "WindowGeometry.swift",
  "WindowManager.swift",
].map((name) => join(projectDir, "native", name));
export const recorderSourcePath = join(projectDir, "native", "HotkeyRecorder.swift");
export const imagePreviewSourcePath = join(projectDir, "native", "ImagePreview.swift");

export const buildDir = join(projectDir, ".build");
export const helperPath = join(buildDir, "medea-status");
export const recorderPath = join(buildDir, "medea-record");
export const imagePreviewPath = join(buildDir, "medea-image-preview");
export const helperLogPath = join(buildDir, "helper.log");
export const launcherPath = join(buildDir, "open-medea.command");
export const socketPath = join(buildDir, "cli.sock");
export const helperSocketPath = join(buildDir, "helper.sock");

const configDir = join(homedir(), ".config", "medea");
export const configPath = join(configDir, "config.json");
export const quicklinksPath = join(configDir, "medea-quicklinks.json");
export const loginItemPath = join(homedir(), "Library", "LaunchAgents", "medea.menu-bar.plist");
export const clipboardHistoryPath = join(configDir, "medea-clipboard-history.json");
export const clipboardImagesDir = join(configDir, "medea-clipboard-history");
