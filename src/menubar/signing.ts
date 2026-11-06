import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { helperPath } from "../paths.ts";
import { runCommand } from "../shell.ts";

const IDENTITY_NAME = "Medea Local Signing";
const HELPER_IDENTIFIER = "medea.status";
const CERTIFICATE_DAYS = "3650";
// The key file only exists for a moment, in a folder only you can read.
const BUNDLE_PASSWORD = "medea";
// Homebrew's OpenSSL writes bundles that the macOS keychain can't import.
const SYSTEM_OPENSSL = "/usr/bin/openssl";
const IDENTITY_LINE = /^\s*\d+\)\s+([0-9A-F]{40})\s+"Medea Local Signing"/m;

const CERTIFICATE_CONFIG = `[req]
distinguished_name = dn
x509_extensions = extensions
prompt = no
[dn]
CN = ${IDENTITY_NAME}
[extensions]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
`;

/** Reads "security find-identity", which also lists identities macOS doesn't trust. */
export const parseSigningIdentity = (identityList: string): string | undefined =>
  IDENTITY_LINE.exec(identityList)?.[1];

const findSigningIdentity = async (): Promise<string | undefined> => {
  const { stdout } = await runCommand("security", ["find-identity", "-p", "codesigning"]);
  return parseSigningIdentity(stdout);
};

const createSigningIdentity = async (): Promise<void> => {
  const folder = await mkdtemp(join(tmpdir(), "medea-signing-"));
  const configPath = join(folder, "certificate.cnf");
  const keyPath = join(folder, "key.pem");
  const certificatePath = join(folder, "certificate.pem");
  const bundlePath = join(folder, "identity.p12");
  try {
    await writeFile(configPath, CERTIFICATE_CONFIG);
    await runCommand(SYSTEM_OPENSSL, [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      CERTIFICATE_DAYS,
      "-config",
      configPath,
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
    ]);
    await runCommand(SYSTEM_OPENSSL, [
      "pkcs12",
      "-export",
      "-inkey",
      keyPath,
      "-in",
      certificatePath,
      "-out",
      bundlePath,
      "-passout",
      `pass:${BUNDLE_PASSWORD}`,
    ]);
    await runCommand("security", [
      "import",
      bundlePath,
      "-P",
      BUNDLE_PASSWORD,
      "-T",
      "/usr/bin/codesign",
      "-k",
      join(homedir(), "Library", "Keychains", "login.keychain-db"),
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
};

/**
 * macOS ties an Accessibility grant to the signature. An ad-hoc signature changes with every build,
 * and this one doesn't. Without the identity the helper keeps its ad-hoc signature and still runs.
 */
export const signHelper = async (): Promise<boolean> => {
  const identity = await findSigningIdentity();
  if (identity === undefined) {
    return false;
  }
  await runCommand("codesign", [
    "--force",
    "--sign",
    identity,
    "--identifier",
    HELPER_IDENTIFIER,
    helperPath,
  ]);
  return true;
};

/** Run by hand, once, because it adds a certificate to the login keychain. */
export const setUpSigning = async (): Promise<void> => {
  if ((await findSigningIdentity()) === undefined) {
    await createSigningIdentity();
  }
};
