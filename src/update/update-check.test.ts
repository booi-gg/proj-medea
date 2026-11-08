import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import {
  compareVersions,
  fetchLatestVersion,
  isSavedCheckFresh,
  toUpdateStatus,
} from "./update-check.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

test("compares release numbers as numbers", () => {
  assert.ok(compareVersions("0.1.10", "0.1.9") > 0);
  assert.ok(compareVersions("1.0.0", "0.9.9") > 0);
  assert.ok(compareVersions("0.1.2", "0.2.0") < 0);
  assert.equal(compareVersions("0.1.2", "v0.1.2"), 0);
});

test("a release is newer than its pre-releases", () => {
  assert.ok(compareVersions("0.1.0", "0.1.0-beta.2") > 0);
  assert.ok(compareVersions("0.1.0-beta.10", "0.1.0-beta.2") > 0);
  assert.ok(compareVersions("0.1.0", "0.0.0-stage") > 0);
});

test("a version it can't read is never offered as an update", () => {
  assert.equal(compareVersions("latest", "0.1.0"), 0);
  assert.deepEqual(toUpdateStatus("0.1.0", "nightly"), {
    current: "0.1.0",
    latest: "nightly",
    updateAvailable: false,
  });
});

test("offers an update only when npm has a newer version", () => {
  assert.equal(toUpdateStatus("0.1.2", "0.1.3").updateAvailable, true);
  assert.equal(toUpdateStatus("0.1.3", "0.1.3").updateAvailable, false);
  assert.equal(toUpdateStatus("0.1.4", "0.1.3").updateAvailable, false);
  assert.deepEqual(toUpdateStatus("0.1.2", undefined), {
    current: "0.1.2",
    updateAvailable: false,
  });
});

test("reuses a check for one day", () => {
  const now = Date.now();
  assert.equal(isSavedCheckFresh(undefined, now), false);
  assert.equal(isSavedCheckFresh({ checkedAt: now - DAY_MS + 1000, latest: "1.0.0" }, now), true);
  assert.equal(isSavedCheckFresh({ checkedAt: now - DAY_MS, latest: "1.0.0" }, now), false);
  // A clock set back would otherwise keep an old answer for ever.
  assert.equal(isSavedCheckFresh({ checkedAt: now + DAY_MS, latest: "1.0.0" }, now), false);
});

const withRegistry = async (
  handler: RequestListener,
  run: (registryUrl: string) => Promise<void>,
): Promise<void> => {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
};

test("reads the latest version from the registry", async () => {
  let requestedPath = "";
  await withRegistry(
    (request, response) => {
      requestedPath = request.url ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ name: "@booi-gg/redhot", version: "0.2.0" }));
    },
    async (registryUrl) => {
      assert.equal(await fetchLatestVersion("@booi-gg/redhot", registryUrl), "0.2.0");
    },
  );
  assert.equal(requestedPath, "/@booi-gg/redhot/latest");
});

test("fails on a broken answer, an error status or a slow registry", async () => {
  await withRegistry(
    (_request, response) => {
      response.end("not json");
    },
    async (registryUrl) => {
      await assert.rejects(fetchLatestVersion("redhot", registryUrl));
    },
  );
  await withRegistry(
    (_request, response) => {
      response.statusCode = 404;
      response.end("{}");
    },
    async (registryUrl) => {
      await assert.rejects(fetchLatestVersion("redhot", registryUrl), /404/u);
    },
  );
  await withRegistry(
    () => {
      // Never answers.
    },
    async (registryUrl) => {
      await assert.rejects(fetchLatestVersion("redhot", registryUrl, 50), { name: "TimeoutError" });
    },
  );
});
