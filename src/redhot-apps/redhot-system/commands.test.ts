import assert from "node:assert/strict";
import { test } from "node:test";
import stringWidth from "string-width";
import { SYSTEM_COMMANDS, runSystemCommand, toEjectMessage } from "./commands.ts";
import type { SystemCommand, SystemTools } from "./commands.ts";

const MAX_HINT_LENGTH = 36;
const CONFIRMED_COMMANDS = ["restart", "shut-down", "log-out"];

interface Call {
  file: string;
  args: readonly string[];
}

const toTools = (
  outputs: Record<string, string | Error> = {},
  helperReply = "ok",
): { tools: SystemTools; calls: Call[]; helperRequests: string[] } => {
  const calls: Call[] = [];
  const helperRequests: string[] = [];
  return {
    calls,
    helperRequests,
    tools: {
      run: (file, args) => {
        calls.push({ file, args });
        const output = outputs[`${file} ${args[0]}`] ?? outputs[file] ?? "";
        return output instanceof Error
          ? Promise.reject(output)
          : Promise.resolve({ stdout: output });
      },
      askHelper: (request) => {
        helperRequests.push(request);
        return Promise.resolve(helperReply);
      },
    },
  };
};

const findCommand = (id: string): SystemCommand => {
  const command = SYSTEM_COMMANDS.find((candidate) => candidate.id === id);
  assert.ok(command, id);
  return command;
};

const approve = (): Promise<boolean> => Promise.resolve(true);
const decline = (): Promise<boolean> => Promise.resolve(false);

const toScript = ({ args }: Call): string => args.filter((arg) => arg !== "-e").join("\n");

test("IDs and names are unique", () => {
  assert.equal(new Set(SYSTEM_COMMANDS.map(({ id }) => id)).size, SYSTEM_COMMANDS.length);
  assert.equal(new Set(SYSTEM_COMMANDS.map(({ name }) => name)).size, SYSTEM_COMMANDS.length);
});

test("every icon is its own single-column symbol", () => {
  const symbols = SYSTEM_COMMANDS.map(({ symbol }) => symbol);
  assert.equal(new Set(symbols).size, symbols.length);
  for (const symbol of symbols) {
    assert.equal(stringWidth(symbol), 1, symbol);
  }
});

test("hints stay short enough for an 80-column window", () => {
  for (const { id, hint } of SYSTEM_COMMANDS) {
    assert.ok(hint.length <= MAX_HINT_LENGTH, id);
  }
});

test("only restart, shut down and log out ask first", () => {
  const confirmed = SYSTEM_COMMANDS.filter(({ confirmation }) => confirmation !== undefined);
  assert.deepEqual(
    confirmed.map(({ id }) => id),
    CONFIRMED_COMMANDS,
  );
});

test("declining the question runs nothing", async () => {
  for (const id of CONFIRMED_COMMANDS) {
    const { tools, calls } = toTools();
    assert.equal(await runSystemCommand(findCommand(id), tools, decline), "");
    assert.deepEqual(calls, []);
  }
});

test("approving the question tells System Events what to do", async () => {
  const actions = { restart: "restart", "shut-down": "shut down", "log-out": "log out" };
  for (const [id, action] of Object.entries(actions)) {
    const { tools, calls } = toTools();
    await runSystemCommand(findCommand(id), tools, approve);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.file, "osascript");
    assert.equal(
      toScript(calls[0] as Call),
      `tell application "System Events"\n${action}\nend tell`,
    );
  }
});

test("sleep and sleep displays use pmset", async () => {
  for (const [id, mode] of [
    ["sleep", "sleepnow"],
    ["sleep-displays", "displaysleepnow"],
  ] as const) {
    const { tools, calls } = toTools();
    await runSystemCommand(findCommand(id), tools, decline);
    assert.deepEqual(calls, [{ file: "pmset", args: [mode] }]);
  }
});

test("lock screen asks the helper", async () => {
  const { tools, helperRequests, calls } = toTools();
  assert.equal(await runSystemCommand(findCommand("lock-screen"), tools, decline), "");
  assert.deepEqual(helperRequests, ["lock-screen"]);
  assert.deepEqual(calls, []);
});

test("lock screen says what to do when the helper can't help", async () => {
  const lock = findCommand("lock-screen");
  const noHelper: SystemTools = {
    ...toTools().tools,
    askHelper: () => Promise.resolve(undefined),
  };
  await assert.rejects(runSystemCommand(lock, noHelper, decline), /Add Menu Bar Item/u);
  await assert.rejects(
    runSystemCommand(lock, toTools({}, "bad-command").tools, decline),
    /redhot restart/u,
  );
  await assert.rejects(
    runSystemCommand(lock, toTools({}, "lock-unavailable").tools, decline),
    /didn't let Redhot/u,
  );
});

test("empty trash tells Finder", async () => {
  const { tools, calls } = toTools();
  const notice = await runSystemCommand(findCommand("empty-trash"), tools, decline);
  assert.equal(notice, "Emptied the Trash");
  assert.equal(toScript(calls[0] as Call), `tell application "Finder"\nempty trash\nend tell`);
});

test("dark mode reports the state it ended up in", async () => {
  const toggle = findCommand("toggle-dark-mode");
  const on = await runSystemCommand(toggle, toTools({ osascript: "true\n" }).tools, decline);
  const off = await runSystemCommand(toggle, toTools({ osascript: "false\n" }).tools, decline);
  assert.equal(on, "Dark mode on");
  assert.equal(off, "Dark mode off");
});

test("a Mac that never set hidden files starts hidden, so the first toggle shows them", async () => {
  const { tools, calls } = toTools({ "defaults read": new Error("does not exist") });
  const notice = await runSystemCommand(findCommand("toggle-hidden-files"), tools, decline);
  assert.equal(notice, "Showing hidden files");
  assert.deepEqual(calls.slice(1), [
    {
      file: "defaults",
      args: ["write", "com.apple.finder", "AppleShowAllFiles", "-bool", "true"],
    },
    { file: "killall", args: ["Finder"] },
  ]);
});

test("hidden files turn off from any way macOS stores on", async () => {
  for (const stored of ["1\n", "YES\n", "true\n", "TRUE\n"]) {
    const { tools, calls } = toTools({ "defaults read": stored });
    const notice = await runSystemCommand(findCommand("toggle-hidden-files"), tools, decline);
    assert.equal(notice, "Hiding hidden files", stored);
    assert.equal(calls[1]?.args.at(-1), "false", stored);
  }
});

test("eject counts what happened", async () => {
  const { tools } = toTools({ osascript: "2 1\n" });
  assert.equal(
    await runSystemCommand(findCommand("eject-all-disks"), tools, decline),
    "Ejected 2 disks. 1 disk couldn't be ejected and may be in use",
  );
});

test("eject messages cover nothing to do, all done and all stuck", () => {
  assert.equal(toEjectMessage(0, 0), "No disks to eject");
  assert.equal(toEjectMessage(1, 0), "Ejected 1 disk");
  assert.equal(toEjectMessage(0, 2), "2 disks couldn't be ejected and may be in use");
});

test("a denied Automation permission says where to allow it", async () => {
  const denied = Object.assign(new Error("failed"), {
    stderr: "execution error: Not authorized to send Apple events to Finder. (-1743)",
  });
  await assert.rejects(
    runSystemCommand(findCommand("empty-trash"), toTools({ osascript: denied }).tools, decline),
    /Privacy & Security, Automation/u,
  );
});

test("any other failure names what didn't happen", async () => {
  await assert.rejects(
    runSystemCommand(
      findCommand("empty-trash"),
      toTools({ osascript: new Error("boom") }).tools,
      decline,
    ),
    /The Trash couldn't be emptied/u,
  );
});
