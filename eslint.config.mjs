import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15 ships only an eslintrc config, so FlatCompat brings it in.
// Config 16 has a flat config of its own, and the Next.js 16 upgrade (#372) swaps
// this for its direct import.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    // public/ holds the built service worker, sw.js, and no source.
    ignores: [".next/**", "public/**", "node_modules/**", "coverage/**"],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
