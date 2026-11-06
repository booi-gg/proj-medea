import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, join } from "node:path";
import { addAbortSignal } from "node:stream";
import { text } from "node:stream/consumers";
import { promisify } from "node:util";

const runCommand = promisify(execFile);

const REQUEST_TIMEOUT_MS = 1000;
const QUIT_REQUEST = "quit";
const FOCUS_REQUEST = "focus";
// Un-minimize, then raise. Terminal honours this with no Automation permission.
const RAISE_WINDOW_SEQUENCE = "\u001B[1t\u001B[5t";
const SHOW_CURSOR_SEQUENCE = "\u001B[?25h";

const socketPath = join(import.meta.dirname, ".build", "cli.sock");

const getOwnTtyPath = async (): Promise<string> => {
  const { stdout } = await runCommand("ps", ["-o", "tty=", "-p", String(process.pid)]);
  return `/dev/${stdout.trim()}`;
};

/** While the CLI is open it answers on this socket. A dead CLI refuses the connection. */
export const listenForRequests = async (): Promise<() => void> => {
  await mkdir(dirname(socketPath), { recursive: true });
  await rm(socketPath, { force: true });
  const ttyPath = await getOwnTtyPath();

  const server = createServer((connection) => {
    // A caller that disconnects early must not crash the open CLI.
    connection.on("error", () => connection.destroy());
    connection.once("data", (request) => {
      if (String(request).trim() === QUIT_REQUEST) {
        process.stdout.write(SHOW_CURSOR_SEQUENCE);
        connection.end(() => process.exit(0));
        return;
      }
      process.stdout.write(RAISE_WINDOW_SEQUENCE);
      connection.end(ttyPath);
    });
  });
  server.listen(socketPath);
  await once(server, "listening");
  server.unref();

  return () => {
    server.close();
  };
};

/** Returns the running CLI's reply, or undefined when none answers. */
const sendRequest = async (request: string): Promise<string | undefined> => {
  const connection = addAbortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS), connect(socketPath));
  try {
    connection.write(`${request}\n`);
    return await text(connection);
  } catch {
    return undefined;
  } finally {
    connection.destroy();
  }
};

/** Asks a running CLI to raise its window. Returns its tty path, or undefined if none runs. */
export const focusRunningCli = (): Promise<string | undefined> => sendRequest(FOCUS_REQUEST);

export const quitRunningCli = async (): Promise<void> => {
  await sendRequest(QUIT_REQUEST);
};
