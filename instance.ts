import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, join } from "node:path";

const FOCUS_TIMEOUT_MS = 1000;
// Un-minimize, then raise. Sent to our own terminal, so no Automation permission is needed.
const RAISE_WINDOW_SEQUENCE = "\u001B[1t\u001B[5t";

const socketPath = join(import.meta.dirname, ".build", "cli.sock");

/** While the CLI is open it answers on this socket. A dead CLI refuses the connection. */
export const listenForFocusRequests = async (): Promise<() => void> => {
  await mkdir(dirname(socketPath), { recursive: true });
  await rm(socketPath, { force: true });

  const server = createServer((connection) => {
    // A caller that disconnects early must not crash the open CLI.
    connection.on("error", () => connection.destroy());
    process.stdout.write(RAISE_WINDOW_SEQUENCE);
    connection.end();
  });
  server.listen(socketPath);
  await once(server, "listening");
  server.unref();

  return () => {
    server.close();
  };
};

/** Asks a running CLI to raise its window. Returns false when none answers. */
export const focusRunningCli = async (): Promise<boolean> => {
  const connection = connect(socketPath);
  try {
    await once(connection, "connect", { signal: AbortSignal.timeout(FOCUS_TIMEOUT_MS) });
    connection.resume();
    await once(connection, "close", { signal: AbortSignal.timeout(FOCUS_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  } finally {
    connection.destroy();
  }
};
