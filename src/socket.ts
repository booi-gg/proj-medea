import { connect } from "node:net";
import { addAbortSignal } from "node:stream";
import { text } from "node:stream/consumers";
import { endAction, startAction } from "./log.ts";

/** Returns the reply, or undefined when nothing answers. */
export const sendSocketRequest = async (
  path: string,
  request: string,
  timeoutMs: number,
): Promise<string | undefined> => {
  const words = request.split(" ", 4);
  const kind = words[0] === "trace" ? (words[2] ?? "unknown") : (words[0] ?? "unknown");
  const action = startAction("socket.request", { kind });
  const connection = addAbortSignal(AbortSignal.timeout(timeoutMs), connect(path));
  try {
    connection.write(`${request}\n`);
    const response = await text(connection);
    endAction(action, true);
    return response;
  } catch (error) {
    const isExpectedMiss = kind === "focus" || kind === "run" || kind === "quit";
    endAction(
      action,
      isExpectedMiss,
      isExpectedMiss ? undefined : error,
      isExpectedMiss ? { kind: "unanswered" } : {},
    );
    return undefined;
  } finally {
    connection.destroy();
  }
};
