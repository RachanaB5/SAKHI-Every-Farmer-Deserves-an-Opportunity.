// Vitest config: Node environment, "@/" path alias, and a stub for the
// `server-only` guard (which deliberately throws outside Next's server build).
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Some Windows shells report the cwd with a lowercase drive letter, which
// breaks test-file globbing — normalise it.
const root = path.dirname(fileURLToPath(import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    // DB-backed tests run against a throwaway SQLite file (prisma/test.db).
    env: { DATABASE_URL: "file:./test.db", SESSION_SECRET: "test-secret-test-secret-test-secret-123" },
  },
});
