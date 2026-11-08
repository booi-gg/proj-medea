#!/usr/bin/env node
import { enableCompileCache } from "node:module";
import { homedir } from "node:os";
import { join, sep } from "node:path";

// Redhot drives AppKit and Terminal, so stop before touching anything on other systems.
// The "os" field in package.json blocks most installs, but `npm --force` and some package managers
// still let one through.
const PLATFORM_NAMES = { win32: "Windows", linux: "Linux" };
if (process.platform !== "darwin") {
  const platformName = PLATFORM_NAMES[process.platform] ?? process.platform;
  process.stderr.write(`Redhot only runs on macOS, and this computer runs ${platformName}.\n`);
  process.exit(1);
}

// Plain JavaScript on purpose. The first .ts file makes Node set up its type stripper, which takes
// longer than the whole cached start, so the cache has to be on before any .ts file loads.
// Mirrors buildDir in paths.ts.
const projectDir = join(import.meta.dirname, "..");
const buildDir = projectDir.split(sep).includes("node_modules")
  ? join(homedir(), "Library", "Application Support", "Redhot")
  : join(projectDir, ".build");
enableCompileCache(join(buildDir, "compile-cache"));

// The published build rewrites this to ./index.js.
await import("./index.ts");
