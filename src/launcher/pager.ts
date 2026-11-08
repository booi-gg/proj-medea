import { spawn } from "node:child_process";
import { once } from "node:events";
import { trackSpawn } from "../log.ts";
import { UTF8_ENVIRONMENT } from "../shell.ts";

// Terminals send the second or third of these, depending on the cursor key mode they're in. Secure
// mode turns key bindings off unless they're allowed, and everything else it blocks stays blocked.
const LEFT_ARROW_GOES_BACK = {
  LESSKEY_CONTENT: "#command\n\\kl quit\n\\e[D quit\n\\eOD quit\n",
  LESSSECURE_ALLOW: "lesskey",
};

interface PagerOptions {
  /** For text already wrapped to the window. Otherwise the left arrow scrolls long lines back. */
  leftArrowGoesBack?: boolean;
}

/**
 * Shows text in less until q is pressed. Less needs -R to show colours, which would also run any
 * escape codes in the text, so anything that didn't come from Redhot must be cleaned first. Less
 * draws short text at the bottom of the window unless -c and -~ say otherwise.
 */
export const showInPager = async (
  cleanText: string,
  { leftArrowGoesBack = false }: PagerOptions = {},
): Promise<void> => {
  const prompt = leftArrowGoesBack ? "-Ps(← or q to go back)" : "-Ps(q to go back)";
  const pager = trackSpawn(
    spawn("less", ["-RS", "-c", "-~", prompt], {
      env: {
        ...UTF8_ENVIRONMENT,
        LESSCHARSET: "utf-8",
        LESSSECURE: "1",
        ...(leftArrowGoesBack ? LEFT_ARROW_GOES_BACK : {}),
      },
      stdio: ["pipe", "inherit", "inherit"],
    }),
    "less",
  );
  // Quitting before less has read everything closes the pipe, which is fine.
  pager.stdin.on("error", () => {});
  pager.stdin.end(cleanText);
  await once(pager, "close");
};
