import assert from "node:assert/strict";
import { test } from "node:test";
import { toInstaller, toManualCommand } from "./installer.ts";

const SPEC = "@booi-gg/redhot@0.2.0";

test("updates an npm install with npm", () => {
  const installer = toInstaller("/usr/local/lib/node_modules/@booi-gg/redhot", SPEC);
  assert.equal(toManualCommand(installer), `npm install --global ${SPEC}`);
});

test("updates a pnpm install with pnpm", () => {
  const paths = [
    "/Users/a/Library/pnpm/global/5/.pnpm/@booi-gg+redhot@0.1.2/node_modules/@booi-gg/redhot",
    "/Users/a/Library/pnpm/global/5/node_modules/@booi-gg/redhot",
  ];
  for (const path of paths) {
    assert.equal(toManualCommand(toInstaller(path, SPEC)), `pnpm add --global ${SPEC}`);
  }
});

test("updates a Bun install with Bun", () => {
  const installer = toInstaller("/Users/a/.bun/install/global/node_modules/@booi-gg/redhot", SPEC);
  assert.equal(toManualCommand(installer), `bun add --global ${SPEC}`);
});
