import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname } from "node:path";
import { addAbortSignal } from "node:stream";
import { text } from "node:stream/consumers";
import { socketPath } from "../paths.ts";
import { getOwnTtyPath } from "../shell.ts";
import { closeOwnWindow } from "./close-window.ts";
import { getSelectedLauncher } from "./terminals.ts";

const REQUEST_TIMEOUT_MS = 1000;
const QUIT_REQUEST = "quit";
const FOCUS_REQUEST = "focus";
// Un-minimize, then raise. Terminal honours this with no Automation permission.
const RAISE_WINDOW_SEQUENCE = "\u001B[1t\u001B[5t";
const SHOW_CURSOR_SEQUENCE = "\u001B[?25h";

// A terminal that can't be focused must not take the open CLI down with it.
const focusOwnWindow = async (ttyPath: string): Promise<void> => {
  try {
    const launcher = await getSelectedLauncher();
    await launcher.focus(ttyPath);
  } catch {
    // The escape sequence has already raised the window where the terminal honours it.
  }
};

/** While the CLI is open it answers on this socket. A dead CLI refuses the connection. */
export const listenForRequests = async (): Promise<() => void> => {
  await mkdir(dirname(socketPath), { recursive: true });
  await rm(socketPath, { force: true });
  const ttyPath = await getOwnTtyPath();

  const server = createServer((connection) => {
    // A caller that disconnects early must not crash the open CLI.
    connection.on("error", () => connection.destroy());
    connection.once("data", async (request) => {
      if (String(request).trim() === QUIT_REQUEST) {
        process.stdout.write(SHOW_CURSOR_SEQUENCE);
        // Replies first, so whoever asked isn't kept waiting while the window is found.
        connection.end();
        await closeOwnWindow();
        process.exit(0);
      }
      process.stdout.write(RAISE_WINDOW_SEQUENCE);
      // Replies first, so the helper's request is over as soon as the CLI has it.
      connection.end();
      await focusOwnWindow(ttyPath);
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

/** Asks a running CLI to raise its window. Returns false when none runs. */
export const focusRunningCli = async (): Promise<boolean> => {
  const reply = await sendRequest(FOCUS_REQUEST);
  return reply !== undefined;
};

export const quitRunningCli = async (): Promise<void> => {
  await sendRequest(QUIT_REQUEST);
};
