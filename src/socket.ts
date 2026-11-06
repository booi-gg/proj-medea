import { connect } from "node:net";
import { addAbortSignal } from "node:stream";
import { text } from "node:stream/consumers";

/** Returns the reply, or undefined when nothing answers. */
export const sendSocketRequest = async (
  path: string,
  request: string,
  timeoutMs: number,
): Promise<string | undefined> => {
  const connection = addAbortSignal(AbortSignal.timeout(timeoutMs), connect(path));
  try {
    connection.write(`${request}\n`);
    return await text(connection);
  } catch {
    return undefined;
  } finally {
    connection.destroy();
  }
};
