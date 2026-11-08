import { defineConfig } from "vite-plus";

export default defineConfig({
  // Before each commit, the hook formats, lints and type-checks the staged files.
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // node:test's runner awaits every test() and describe() itself.
      "typescript/no-floating-promises": [
        "warn",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["test", "describe", "it", "suite"] },
          ],
        },
      ],
    },
    options: { typeAware: true, typeCheck: true },
  },
});
