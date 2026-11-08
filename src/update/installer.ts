import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";

export interface Installer {
  program: string;
  args: string[];
}

/**
 * Updates with the package manager that installed this copy, found from where it lives. A pnpm
 * global install sits under a ".pnpm" or "pnpm/global" folder and a Bun one under ".bun".
 */
export const toInstaller = (projectDir: string, packageSpec: string): Installer => {
  const folders = projectDir.split(sep);
  if (folders.includes(".pnpm") || projectDir.includes(`${sep}pnpm${sep}global${sep}`)) {
    return { program: "pnpm", args: ["add", "--global", packageSpec] };
  }
  if (folders.includes(".bun")) {
    return { program: "bun", args: ["add", "--global", packageSpec] };
  }
  return { program: "npm", args: ["install", "--global", packageSpec] };
};

/**
 * npm installs into the global folder of the Node that runs it, so this prefers the npm next to
 * the Node running Redhot, which is the one that installed it.
 */
export const resolveProgram = (program: string, nodePath: string): string => {
  const besideNode = join(dirname(nodePath), program);
  return program === "npm" && existsSync(besideNode) ? besideNode : program;
};

export const toManualCommand = ({ program, args }: Installer): string =>
  [program, ...args].join(" ");
