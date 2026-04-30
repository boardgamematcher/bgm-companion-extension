import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        normalizeName: "readonly",
        PatternMatcher: "writable",
        Storage: "writable",
        YucataMapper: "writable",
        module: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_|^e$", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  {
    ignores: ["node_modules/", "docs/", "tests/"],
  },
];
