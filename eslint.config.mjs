import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    // public/ holds the built service worker, sw.js, and no source.
    ignores: [".next/**", "public/**", "node_modules/**", "coverage/**"],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
