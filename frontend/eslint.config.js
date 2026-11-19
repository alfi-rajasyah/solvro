import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Hooks rules only (ISS-143). Type-aware and style rules are deliberately not enabled.
export default [
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // Vendored files carry disables for rules this config does not enable.
    files: ["src/components/{ui,reui}/**/*.{ts,tsx}"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
];
