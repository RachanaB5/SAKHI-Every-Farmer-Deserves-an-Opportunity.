// Vitest global setup: build a fresh, throwaway SQLite test database
// (prisma/test.db, gitignored) from the Prisma schema before the suite runs.
// The dev database (prisma/dev.db) is never touched.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DB = path.join(process.cwd(), "prisma", "test.db");

/** Removes the previous test DB file and pushes the schema to a new one. */
export default function setup() {
  for (const f of [TEST_DB, `${TEST_DB}-journal`]) fs.rmSync(f, { force: true });
  execSync("npx prisma db push --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
