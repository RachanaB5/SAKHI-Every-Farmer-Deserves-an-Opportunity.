// ESLint flat config: Next.js core-web-vitals + TypeScript rules, with
// Prettier last so formatting rules never fight the formatter.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**", "screenshots-tmp/**"]),
]);

export default eslintConfig;
