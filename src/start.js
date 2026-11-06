#!/usr/bin/env node
import { enableCompileCache } from "node:module";
import { join } from "node:path";

// Plain JavaScript on purpose. The first .ts file makes Node set up its type stripper, which takes
// longer than the whole cached start, so the cache has to be on before any .ts file loads.
enableCompileCache(join(import.meta.dirname, "..", ".build", "compile-cache"));

await import("./index.ts");
