# Vendored ReUI sources

One row per vendored file: the upstream registry item, when it was retrieved (from the
file's own header), and a sha256 of the upstream file content. Hashes are of the `content`
field of the registry item's file, computed from the registry JSON. Only `autocomplete`
has a hash: it was computed on 2026-11-19 against the live registry, which may be newer
than the 2026-07-27 vendored copy. Rows marked `unknown` were not hashed; re-fetch the
registry item and diff before trusting a "verbatim" claim.

| Local file | Registry item | Retrieved | Upstream sha256 |
|---|---|---|---|
| `autocomplete.tsx` | `https://reui.io/r/new-york/autocomplete.json` | 2026-07-27 | `2cabcf78db03fb04c504e38f6b231210399d1eba7f6c5e1457de1ac5c8de700d` (registry at 2026-11-19) |
| `badge.tsx` | `https://reui.io/r/badge.json` | 2026-08-01 | unknown |
| `filters.tsx` | `https://reui.io/r/styles/base-nova/filters.json` | 2026-07-31 | unknown |
| `data-grid/*.tsx` (10 files) | `https://reui.io/r/data-grid.json` | 2026-08-01 | unknown |

Not listed by the vendoring header (no registry source recorded): `alert.tsx`, `frame.tsx`,
`icon-stack.tsx`, `icon-tile.tsx`, `kanban.tsx`, `sortable.tsx`, `timeline.tsx`, `gantt/*`.

## autocomplete.tsx: local patches (5)

1. `import * as React from "react"` added (registry source omits it).
2. `cn` import path: registry `"cn"` becomes `"@/lib/utils"`.
3. `IconPlaceholder` replaced by lucide-react `XIcon` and `ChevronsUpDownIcon`.
4. Input focus treatment: `focus-visible:border-ring ring-ring/50 ring-3` becomes the DESIGN.md §4 primary ring.
5. `scrollFade` / `scrollbarGutter` destructured and discarded in the list scroll-area wrapper.

Drift against the registry as of 2026-11-19 that is not a deliberate patch: upstream has since
added a `has-[[data-slot=autocomplete-list]:empty]:hidden` rule on the list scroll area, and
the item class string in this repo carries a mangled run of `([class*='size-'])]:size-4`
fragments where upstream has a single `[&_svg:not([class*='size-'])]:size-4`.
