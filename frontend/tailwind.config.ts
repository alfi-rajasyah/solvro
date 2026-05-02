import type { Config } from "tailwindcss";

// All semantic colors are routed through CSS custom properties defined in
// src/index.css. Light values live under :root, dark values under .dark.
// `rgb(var(--token) / <alpha-value>)` preserves Tailwind opacity utilities
// like `bg-primary/10` and `border-outline-variant/40`.
const c = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: c("--surface"),
        "surface-dim": c("--surface-dim"),
        "surface-bright": c("--surface-bright"),
        "surface-container-lowest": c("--surface-container-lowest"),
        "surface-container-low": c("--surface-container-low"),
        "surface-container": c("--surface-container"),
        "surface-container-high": c("--surface-container-high"),
        "surface-container-highest": c("--surface-container-highest"),
        "on-surface": c("--on-surface"),
        "on-surface-variant": c("--on-surface-variant"),
        "inverse-surface": c("--inverse-surface"),
        "inverse-on-surface": c("--inverse-on-surface"),
        outline: c("--outline"),
        "outline-variant": c("--outline-variant"),
        primary: c("--primary"),
        "on-primary": c("--on-primary"),
        "primary-container": c("--primary-container"),
        "on-primary-container": c("--on-primary-container"),
        "inverse-primary": c("--inverse-primary"),
        secondary: c("--secondary"),
        "on-secondary": c("--on-secondary"),
        "secondary-container": c("--secondary-container"),
        "on-secondary-container": c("--on-secondary-container"),
        tertiary: c("--tertiary"),
        "on-tertiary": c("--on-tertiary"),
        error: c("--error"),
        "on-error": c("--on-error"),
        "error-container": c("--error-container"),
        "on-error-container": c("--on-error-container"),
        background: c("--background"),
        "on-background": c("--on-background"),
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
      fontFamily: {
        display: ['"Source Sans 3"', "system-ui", "sans-serif"],
        body: ['"Source Sans 3"', "system-ui", "sans-serif"],
      },
      fontSize: {
        h1: ["32px", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "data-mono": [
          "13px",
          { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "500" },
        ],
        "label-caps": [
          "11px",
          { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "700" },
        ],
      },
      spacing: {
        sidebar: "260px",
        "context-panel": "320px",
      },
    },
  },
  plugins: [],
};

export default config;
