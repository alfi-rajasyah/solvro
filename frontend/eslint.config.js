import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Hooks rules only (ISS-143). Type-aware and style rules are deliberately not enabled.
export default [
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    // Disable comments for rules this config does not enable (vendored files) stay valid and silent.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
