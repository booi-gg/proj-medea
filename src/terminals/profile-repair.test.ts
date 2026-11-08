import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProfileState, planProfileRepair } from "./profile-repair.ts";

const state = (ownName: string | undefined, names: string[], inUse: string[] = []) => ({
  defaultName: "Basic",
  names: ["Basic", ...names],
  inUse: ownName === undefined ? inUse : [ownName, ...inUse],
  ...(ownName === undefined ? {} : { ownName }),
});

test("a window on a numbered copy replaces the out-of-date profile and its unused copies", () => {
  const repair = planProfileRepair(
    "Redhot",
    state("Redhot 14", ["Redhot", "Redhot 1", "Redhot 13", "Redhot 14", "Redhot Dev"]),
  );
  assert.deepEqual(repair, { remove: ["Redhot", "Redhot 1", "Redhot 13"], renameOwn: true });
});

test("leaves profiles that open windows use, and the default profile", () => {
  const repair = planProfileRepair("Redhot", {
    ...state("Redhot 2", ["Redhot", "Redhot 1", "Redhot 2"], ["Redhot 1"]),
    defaultName: "Redhot",
  });
  assert.deepEqual(repair, { remove: [], renameOwn: false });
});

test("a window on the profile itself only removes unused copies", () => {
  const repair = planProfileRepair("Redhot", state("Redhot", ["Redhot", "Redhot 3"]));
  assert.deepEqual(repair, { remove: ["Redhot 3"], renameOwn: false });
});

test("never touches profiles in a window Redhot didn't open from its profile", () => {
  assert.deepEqual(planProfileRepair("Redhot", state("Basic", ["Redhot", "Redhot 1"])), {
    remove: [],
    renameOwn: false,
  });
  assert.deepEqual(planProfileRepair("Redhot", state(undefined, ["Redhot 1"])), {
    remove: [],
    renameOwn: false,
  });
});

test("a checkout's profile and an installed copy's never touch each other", () => {
  const names = ["Redhot", "Redhot 1", "Redhot Dev", "Redhot Dev 1"];
  assert.deepEqual(planProfileRepair("Redhot Dev", state("Redhot Dev 1", names)), {
    remove: ["Redhot Dev"],
    renameOwn: true,
  });
});

test("reads Terminal's answer", () => {
  const output = [
    "default\tBasic",
    "profile\tBasic",
    "profile\tRedhot 1",
    "used\tRedhot 1",
    "own\tRedhot 1",
  ].join("\n");
  assert.deepEqual(parseProfileState(output), {
    defaultName: "Basic",
    names: ["Basic", "Redhot 1"],
    inUse: ["Redhot 1"],
    ownName: "Redhot 1",
  });
});
