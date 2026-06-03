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
        // Chip / status tones — flip with the theme via CSS vars.
        "chip-emerald-bg": c("--emerald-bg"),
        "chip-emerald-text": c("--emerald-text"),
        "chip-amber-bg": c("--amber-bg"),
        "chip-amber-text": c("--amber-text"),
        "chip-rose-bg": c("--rose-bg"),
        "chip-rose-text": c("--rose-text"),
        "chip-violet-bg": c("--violet-bg"),
        "chip-violet-text": c("--violet-text"),
        // Fixed brand "ink" — a near-black that does NOT flip with the theme.
        // Used for always-dark brand chrome (login hero panel, dark CTA, the
        // wordmark glyph on the green logo tile). Literal, not CSS-var-routed.
        ink: "#191919",
        "ink-hover": "#2e2e2e",
        // Sidebar charcoal — DESIGN.md fixes this at #232321 in BOTH themes
        // (the rail stays dark even in light mode). Fixed, not theme-flipping.
        sidebar: "#232321",
      },
      // Radius scale is canonical per DESIGN.md `rounded` frontmatter.
      // 0.25rem default; large radii are forbidden. `full` is reserved for
      // pill chips and avatars only. (No 2xl/3xl — DESIGN.md defines none.)
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      fontFamily: {
        display: ['"Source Sans 3"', "system-ui", "sans-serif"],
        body: ['"Source Sans 3"', "system-ui", "sans-serif"],
      },
      fontSize: {
        // Override Tailwind's default scale: +1px across the board for a
        // slightly more readable default. Line-heights kept proportional.
        xs: ["13px", { lineHeight: "1.35" }],
        sm: ["15px", { lineHeight: "1.45" }],
        base: ["17px", { lineHeight: "1.55" }],
        lg: ["19px", { lineHeight: "1.55" }],
        xl: ["21px", { lineHeight: "1.5" }],
        "2xl": ["25px", { lineHeight: "1.4" }],
        "3xl": ["31px", { lineHeight: "1.3" }],
        "4xl": ["37px", { lineHeight: "1.2" }],
        // App-specific tokens — canonical per DESIGN.md `typography`
        // frontmatter. Keep these exact; they are the named roles the spec
        // defines (the xs..4xl scale above is a separate non-DESIGN override).
        h1: ["32px", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "1.5", fontWeight: "450" }],
        "body-sm": ["15px", { lineHeight: "1.5", fontWeight: "450" }],
        "data-mono": [
          "13px",
          { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "500" },
        ],
        "label-caps": [
          "12px",
          { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "700" },
        ],
      },
      // DESIGN.md: elevation is 1px outlines + tonal shifts, NOT drop shadows.
      // The single sanctioned exception is the floating overlay layer — modals,
      // drawer, dropdown menus, context panel. Regular cards use borders only,
      // so there is deliberately no `card` token.
      boxShadow: {
        overlay: "0 4px 24px rgba(0,0,0,0.18)",
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
