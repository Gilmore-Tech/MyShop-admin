import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next v15 still ships legacy eslintrc-style shareable configs
// ({ extends: [...] }), not flat config. Bridge them into ESLint 9 flat config
// with FlatCompat — spreading the eslintrc objects directly throws
// "nextVitals is not iterable".
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The API layer deliberately uses `any` for raw-JSON normalisers
      // (`normaliseX(raw: any)`) — see CLAUDE.md §6.3 (loose typing is allowed
      // for JSON parsing). Keep it visible as a warning, not a build-breaking error.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Vendored / generated / infra files — not part of the Next.js source tree.
      "public/**",        // bundled assets, e.g. pdf.worker.min.mjs (minified)
      "_chk.cjs",         // one-line build/deploy check script
      "server.js",        // CommonJS Passenger entry point (cPanel)
    ],
  },
];

export default eslintConfig;
