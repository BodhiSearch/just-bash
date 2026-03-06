import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/comparison-tests/**",
      "**/python3/**",
      "**/python-scripting*",
    ],
    setupFiles: [resolve(__dirname, "src/vitest-setup.ts")],
    // vi.mock("node:worker_threads") is unreliable in threads pool
    // because Vitest itself uses worker_threads for its thread pool.
    poolMatchGlobs: [["forks", "**/sqlite3.worker-protocol-abuse.test.ts"]],
  },
});
