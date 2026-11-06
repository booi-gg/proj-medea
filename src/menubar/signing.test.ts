import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSigningIdentity } from "./signing.ts";

const HASH = "0123456789ABCDEF0123456789ABCDEF01234567";

test("finds the identity, even when macOS doesn't trust it", () => {
  const listing = `Policy: Code Signing
  Matching identities
  1) ${HASH} "Medea Local Signing" (CSSMERR_TP_NOT_TRUSTED)
     1 identities found
`;
  assert.equal(parseSigningIdentity(listing), HASH);
});

test("ignores other identities", () => {
  const listing = `  1) ${HASH} "Apple Development: Someone"\n`;
  assert.equal(parseSigningIdentity(listing), undefined);
});

test("reads a listing with no identities", () => {
  assert.equal(parseSigningIdentity("0 valid identities found\n"), undefined);
});
