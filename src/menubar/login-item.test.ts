import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOGIN_ITEM_LABEL,
  isDisabledByLaunchd,
  isSwitchedOffInSettings,
  toLaunchAgentPlist,
} from "./login-item.ts";

const plist = toLaunchAgentPlist(["/a/redhot-status", "/b/node", "/c/index.ts"], "/a/helper.log");

test("names the item and starts it at login", () => {
  assert.ok(plist.includes(`<string>${LOGIN_ITEM_LABEL}</string>`));
  assert.match(plist, /<key>RunAtLoad<\/key>\s+<true\/>/);
});

test("doesn't relaunch after Exit", () => {
  assert.ok(!plist.includes("KeepAlive"));
});

test("runs the helper first, then the CLI it should call", () => {
  assert.match(plist, /redhot-status.*\n.*node.*\n.*index\.ts/);
});

test("escapes special characters in paths", () => {
  const escaped = toLaunchAgentPlist(["/Tom & <Jerry>/x"], "/log");
  assert.ok(escaped.includes("/Tom &amp; &lt;Jerry&gt;/x"));
});

test("spots this item in the disabled list", () => {
  assert.equal(isDisabledByLaunchd(`"${LOGIN_ITEM_LABEL}" => disabled`), true);
  assert.equal(isDisabledByLaunchd(`"${LOGIN_ITEM_LABEL}" => enabled`), false);
  assert.equal(isDisabledByLaunchd('"other.item" => disabled'), false);
});

const toRecord = (number: number, disposition: string, identifier: string): string => `
 #${number}:
                 UUID: B64B49F4-2A8B-4E00-AC8E-26FF7AE9FF3A
                 Name: redhot-status
                 Type: legacy agent (0x10008)
          Disposition: [${disposition}] (0xb)
           Identifier: ${identifier}
                  URL: file:///Users/me/Library/LaunchAgents/x.plist
`;

test("sees the System Settings switch turned off", () => {
  const dump = toRecord(1, "disabled, allowed, notified", `8.${LOGIN_ITEM_LABEL}`);
  assert.equal(isSwitchedOffInSettings(dump), true);
});

test("sees the System Settings switch turned on", () => {
  const dump = toRecord(1, "enabled, allowed, notified", `8.${LOGIN_ITEM_LABEL}`);
  assert.equal(isSwitchedOffInSettings(dump), false);
});

test("ignores other apps that are switched off", () => {
  const dump = [
    toRecord(1, "disabled, allowed, not notified", "8.us.zoom.updater"),
    toRecord(2, "enabled, allowed, notified", `8.${LOGIN_ITEM_LABEL}`),
  ].join("");
  assert.equal(isSwitchedOffInSettings(dump), false);
});

test("an unreadable dump means not blocked", () => {
  assert.equal(isSwitchedOffInSettings(""), false);
});
