import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal, standalone Vitest config — deliberately NOT merged with
// vite.config.ts (which pulls in the Tailwind/React/PWA plugins that pure
// node-environment function tests don't need). Only the `@` alias is
// mirrored so modules under test can import `@/lib/...` the same way the
// app does. Node environment by default, no globals — see
// docs/archive/plans/kanban-reui-swap/plan.md Task 4. Component and hook
// tests are `.test.tsx` files that opt into a DOM with a
// `// @vitest-environment jsdom` first line and use @testing-library/react.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
});
