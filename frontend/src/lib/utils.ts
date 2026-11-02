import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// SOLVRO PATCH (reui-data-grid.md pilot fix round) — plain `twMerge` ships a
// hardcoded default `theme.text` scale (xs/sm/base/lg/xl/2xl/...) that has no
// knowledge of this project's seven named `@theme` typography roles
// (`index.css`: h1, h2, body-lg, body-sm, data-mono, label-caps, meta).
// Two concrete bugs followed from that gap, found live while building the
// Tasks.tsx DataGrid pilot:
//   1. `text-label-caps` didn't dedupe against a stock `text-sm`/`text-xs`
//      sibling in the same `cn()` call — both survived, and the actual
//      winner depended on Tailwind's generated stylesheet order, not the
//      call-site's class-list order.
//   2. Worse: twMerge's `font-size` classGroup only matches suffixes shaped
//      like a t-shirt size, so an unmatched `text-{name}` falls through to
//      the NEXT registered validator for the same `text-` prefix —
//      `text-color`, whose default `theme.color` validator is `isAny`
//      (matches literally anything, since twMerge can't know a project's
//      real color palette without help). So `text-label-caps` was silently
//      filed as a COLOR utility, meaning it deduped against (and evicted)
//      genuine text-color classes like `text-muted-foreground` in the same
//      `cn()` call — a two-tone DataGrid header was the observable symptom.
// `extendTailwindMerge`'s `theme.text` extension point is exactly the list
// `font-size`'s validator checks against (`from-theme.ts` + the `font-size`
// classGroup in `default-config.ts`) — registering these seven names there
// makes twMerge recognize them as font-size utilities FIRST, so they never
// reach the color fallback, and standard `text-{size}` conflict resolution
// (already proven safe via `text-xs` overriding Button's `text-sm`) now
// applies to them too. No visual/behavioral change for any existing
// `text-h1`/`text-h2`/etc. usage — they were never combined with a
// conflicting `text-{size}`/`text-{color}` class in the same `cn()` call
// before, so this only fixes latent conflicts, it doesn't introduce new
// ones.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["h1", "h2", "body-lg", "body-sm", "data-mono", "label-caps", "meta"],
    },
  },
});

/** shadcn-convention class combiner — vendored ui components import this. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The one focus treatment for form controls (docs/DESIGN.md §4, reduced form):
 * a 2px primary ring on keyboard focus, no border change, no glow. Append it to
 * an input/select/textarea's class list. Use `FIELD_FOCUS_WITHIN` on a wrapper
 * when the focusable element sits inside it
 * (docs/archive/plans/design-drift-fixes-spec.md, Fix 11).
 */
export const FIELD_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/** Wrapper variant of {@link FIELD_FOCUS} for controls nested in a styled box. */
export const FIELD_FOCUS_WITHIN = "focus-within:ring-2 focus-within:ring-primary/30";
