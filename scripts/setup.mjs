// One-command local setup (works on Windows, macOS, Linux):
//   1. creates .env from .env.example with a random SESSION_SECRET (if missing)
//   2. applies the Prisma migrations to the local SQLite database
//   3. seeds the Bengaluru pilot demo data
// Usage: npm run setup
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (!fs.existsSync(".env")) {
  const example = fs.readFileSync(".env.example", "utf8");
  const secret = randomBytes(32).toString("hex");
  fs.writeFileSync(".env", example.replace(/SESSION_SECRET=".*"/, `SESSION_SECRET="${secret}"`));
  console.log("✓ Created .env (with a fresh SESSION_SECRET)");
} else {
  console.log("• .env already exists — leaving it as is");
}

console.log("→ Creating the database…");
run("npx prisma migrate deploy");
console.log("→ Seeding demo data…");
run("npx prisma db seed");
console.log("\n✓ Ready. Start the app with:  npm run dev  → http://localhost:3000\n");
