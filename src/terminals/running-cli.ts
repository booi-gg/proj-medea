import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { socketPath } from "../paths.ts";
import { writeLog } from "../log.ts";
import { sendSocketRequest } from "../socket.ts";
import { closeOwnWindow } from "./close-window.ts";
import { raiseTerminal } from "./terminals.ts";

const REQUEST_TIMEOUT_MS = 1000;
const QUIT_REQUEST = "quit";
const FOCUS_REQUEST = "focus";
const RUN_REQUEST_PREFIX = "run ";
// Un-minimize, then raise. Terminal honours this with no Automation permission.
const RAISE_WINDOW_SEQUENCE = "\u001B[1t\u001B[5t";
const SHOW_CURSOR_SEQUENCE = "\u001B[?25h";

// Terminal failing to come forward must not take the open CLI down with it.
const focusOwnWindow = async (): Promise<void> => {
  try {
    await raiseTerminal();
  } catch (error) {
    writeLog("terminal.focus-failed", { error }, { level: "warn" });
    // The escape sequence has already raised the window.
  }
};

export interface RequestHandlers {
  onFocus: () => void;
  onRunItem: (itemValue: string) => void;
  onQuit: () => void;
}

/** While the CLI is open it answers on this socket. A dead CLI refuses the connection. */
export const listenForRequests = async ({
  onFocus,
  onRunItem,
  onQuit,
}: RequestHandlers): Promise<() => void> => {
  await mkdir(dirname(socketPath), { recursive: true });
  await rm(socketPath, { force: true });
  const server = createServer((connection) => {
    // A caller that disconnects early must not crash the open CLI.
    connection.on("error", () => connection.destroy());
    connection.once("data", async (request) => {
      const message = String(request).trim();
      if (message === QUIT_REQUEST) {
        onQuit();
        process.stdout.write(SHOW_CURSOR_SEQUENCE);
        // Replies first, so whoever asked isn't kept waiting while the window is found.
        connection.end();
        await closeOwnWindow();
        process.exit(0);
      }
      process.stdout.write(RAISE_WINDOW_SEQUENCE);
      // Finishes replying before acting. Starting an item can keep this thread busy past the
      // caller's timeout, and the caller would then think nothing is open and open a second window.
      await new Promise<void>((resolve) => {
        connection.end(resolve);
      });
      if (message.startsWith(RUN_REQUEST_PREFIX)) {
        onRunItem(message.slice(RUN_REQUEST_PREFIX.length));
      } else {
        onFocus();
      }
      await focusOwnWindow();
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
const sendRequest = (request: string): Promise<string | undefined> =>
  sendSocketRequest(socketPath, request, REQUEST_TIMEOUT_MS);

/** Asks a running CLI to raise its window. Returns false when none runs. */
export const focusRunningCli = async (): Promise<boolean> => {
  const reply = await sendRequest(FOCUS_REQUEST);
  return reply !== undefined;
};

/** Hands an item to the running CLI, so it needs no new window. Returns false when none runs. */
export const runInRunningCli = async (itemValue: string): Promise<boolean> => {
  const reply = await sendRequest(`${RUN_REQUEST_PREFIX}${itemValue}`);
  return reply !== undefined;
};

export const quitRunningCli = async (): Promise<void> => {
  await sendRequest(QUIT_REQUEST);
};
