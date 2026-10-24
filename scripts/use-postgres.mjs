// Switches prisma/schema.prisma from SQLite to Postgres for deploys.
// Runs only when DATABASE_URL is a postgres URL, so local builds are
// untouched. Adds `directUrl` when DIRECT_URL is set (Neon / Supabase
// pooled connections). Idempotent.
//
// Usage: node scripts/use-postgres.mjs            (used by `npm run vercel-build`)
//        node scripts/use-postgres.mjs --force    (switch regardless of DATABASE_URL)
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
const url = process.env.DATABASE_URL ?? "";
const force = process.argv.includes("--force");

if (!force && !/^postgres(ql)?:\/\//.test(url)) {
  console.log("use-postgres: DATABASE_URL is not a Postgres URL — keeping SQLite.");
  process.exit(0);
}

let schema = fs.readFileSync(schemaPath, "utf8");
const datasource = /datasource db \{[\s\S]*?\}/;
if (!datasource.test(schema)) {
  console.error("use-postgres: no `datasource db` block found in schema.prisma");
  process.exit(1);
}
const lines = ['  provider = "postgresql"', '  url      = env("DATABASE_URL")'];
if (process.env.DIRECT_URL) lines.push('  directUrl = env("DIRECT_URL")');
schema = schema.replace(datasource, `datasource db {\n${lines.join("\n")}\n}`);
fs.writeFileSync(schemaPath, schema);
console.log(`use-postgres: schema provider set to postgresql${process.env.DIRECT_URL ? " (with directUrl)" : ""}.`);
