import { homedir } from "node:os";
import { join } from "node:path";

export const projectDir = join(import.meta.dirname, "..");
export const cliEntryPath = join(projectDir, "src", "index.ts");
export const swiftSourcePath = join(projectDir, "native", "StatusItem.swift");

export const buildDir = join(projectDir, ".build");
export const helperPath = join(buildDir, "medea-status");
export const helperLogPath = join(buildDir, "helper.log");
export const launcherPath = join(buildDir, "open-medea.command");
export const socketPath = join(buildDir, "cli.sock");

export const configPath = join(homedir(), ".config", "medea", "config.json");
