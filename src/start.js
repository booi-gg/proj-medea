#!/usr/bin/env node
import { enableCompileCache } from "node:module";
import { homedir } from "node:os";
import { join, sep } from "node:path";

// Plain JavaScript on purpose. The first .ts file makes Node set up its type stripper, which takes
// longer than the whole cached start, so the cache has to be on before any .ts file loads.
// Mirrors buildDir in paths.ts.
const projectDir = join(import.meta.dirname, "..");
const buildDir = projectDir.split(sep).includes("node_modules")
  ? join(homedir(), "Library", "Application Support", "Medea")
  : join(projectDir, ".build");
enableCompileCache(join(buildDir, "compile-cache"));

// The published build rewrites this to ./index.js.
await import("./index.ts");
