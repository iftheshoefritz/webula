import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    // public/ holds the built service worker, sw.js, and no source.
    ignores: [".next/**", "public/**", "node_modules/**", "coverage/**"],
  },
  ...nextCoreWebVitals,
  {
    // eslint-config-next 16 brings eslint-plugin-react-hooks 7, whose React Compiler rules
    // report errors across the practice table. They warn until #1302 fixes them.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
