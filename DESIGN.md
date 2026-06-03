---
name: Technical Precision
colors:
  # --- DARK MODE (default) ---
  surface: '#232321'
  surface-dim: '#1a1a18'
  surface-bright: '#2a2a28'
  surface-container-lowest: '#1a1a18'
  surface-container-low: '#232321'
  surface-container: '#2a2a28'
  surface-container-high: '#323230'
  surface-container-highest: '#3a3a37'
  on-surface: '#f0ede8'
  on-surface-variant: '#b0ada8'
  inverse-surface: '#f0ede8'
  inverse-on-surface: '#232321'
  outline: '#4a4a47'
  outline-variant: '#3a3a37'
  surface-tint: '#3aae51'

  # --- PRIMARY (Elitery Green) ---
  primary: '#3aae51'
  on-primary: '#0f2b16'
  primary-container: '#2d9042'
  on-primary-container: '#e8f7eb'
  inverse-primary: '#2d9042'

  # --- SECONDARY ---
  secondary: '#888780'
  on-secondary: '#1a1a18'
  secondary-container: '#323230'
  on-secondary-container: '#b0ada8'

  # --- TERTIARY ---
  tertiary: '#707570'
  on-tertiary: '#f0ede8'
  tertiary-container: '#3a3a37'
  on-tertiary-container: '#d0cdc8'

  # --- SEMANTIC ---
  error: '#f87171'
  on-error: '#2a0a0a'
  error-container: '#3d1212'
  on-error-container: '#fca5a5'

  # --- BACKGROUND ---
  background: '#1a1a18'
  on-background: '#f0ede8'
  surface-variant: '#2a2a28'

  # --- LIGHT MODE OVERRIDES (applied when data-theme="light") ---
  # surface: '#f9f9f7'
  # surface-dim: '#e8e8e4'
  # surface-bright: '#ffffff'
  # surface-container-lowest: '#ffffff'
  # surface-container-low: '#f2f2ee'
  # surface-container: '#ebebе7'
  # surface-container-high: '#e4e4e0'
  # surface-container-highest: '#dededa'
  # on-surface: '#1a1a18'
  # on-surface-variant: '#4a4a47'
  # outline: '#9a9a97'
  # outline-variant: '#d0d0cc'
  # background: '#f9f9f7'
  # on-background: '#1a1a18'
  # primary: '#2d9042'
  # on-primary: '#ffffff'

typography:
  h1:
    fontFamily: Source Sans 3
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  h2:
    fontFamily: Source Sans 3
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Source Sans 3
    fontSize: 16px
    fontWeight: '450'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Source Sans 3
    fontSize: 15px
    fontWeight: '450'
    lineHeight: '1.5'
  data-mono:
    fontFamily: Source Sans 3
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  label-caps:
    fontFamily: Source Sans 3
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar_width: 260px
  context_panel_width: 320px
  gutter: 16px
  margin: 24px
  stack_sm: 4px
  stack_md: 8px
  stack_lg: 16px
---

## Brand & Style

The design system is engineered for high-performance technical environments, prioritizing speed of comprehension and data density. The brand personality is "Bare-Metal" — direct, transparent, and unapologetically functional. It targets technical operators (TAMs) who require a tool that feels like a precision instrument rather than a consumer app.

The style is **dark-first**. The default experience uses a warm charcoal palette derived from Elitery's brand identity. Light mode is a first-class supported variant, not an afterthought — it uses the same design language on white surfaces. The accent color in both modes is **Elitery Green (#3aae51)**, providing brand continuity across themes.

## Colors

### Dark mode (default)

The palette is built on warm charcoal surfaces — not pure black. This avoids the harshness of full black while maintaining a professional, tool-like aesthetic that matches Elitery's brand identity.

- **Base**: `#1a1a18` (deepest background — page, sidebar well)
- **Surface**: `#232321` (sidebar, panels)
- **Surface raised**: `#2a2a28` (cards, inputs, modals)
- **Surface high**: `#3a3a37` (hover states, dividers)
- **Primary accent**: Elitery Green `#3aae51` — used for active states, CTAs, active sidebar icons, focus rings, and interactive highlights. This is the single accent color across the entire app.
- **On-surface text**: `#f0ede8` (primary), `#b0ada8` (secondary/muted)
- **Outlines**: `#3a3a37` (default borders), `#4a4a47` (emphasis borders)

### Light mode

Light mode flips the surface stack to white/off-white while keeping the same structural logic. Elitery Green darkens slightly to `#2d9042` for sufficient contrast on white backgrounds.

- **Base**: `#f9f9f7`
- **Surface**: `#f2f2ee`
- **Cards**: `#ffffff` with `1px border #e2e5ea`
- **Primary accent**: `#2d9042` (darkened green for WCAG contrast on white)
- **On-surface text**: `#1a1a18` (primary), `#4a4a47` (secondary)

### Semantic colors

Status colors remain high-saturation for immediate recognition in dense data tables:

- **Success / Active**: Green family — use primary `#3aae51`
- **Warning / At risk**: Amber `#f59e0b`
- **Error / Blocked**: Red `#ef4444`
- **Info / Planning**: Blue `#3b82f6`
- **AI Breakdown**: Amber glow `#f59e0b` at 20% opacity inner border — **reserved exclusively for machine-generated content**. Do not reuse for any other purpose.

### What changed from the previous spec

- Primary color changed from Solvro Blue `#0058be` → Elitery Green `#3aae51`
- All surface tokens now reflect the dark-first charcoal palette
- Light mode tokens documented as explicit overrides
- Blue is no longer the primary action color — green is. Blue may still appear as a semantic info color only.

## Typography

Single typeface app-wide: **Source Sans 3** (Adobe's rebrand of Source Sans Pro, full 100–900 weight range) via `font-display` and `font-body` Tailwind aliases — both resolve to the same family.

- `data-mono`: Source Sans 3 at 13px, weight 500, -0.01em tracking, `font-feature-settings: "tnum"` for tabular numerics in IDs and data columns
- `label-caps`: 11px, weight 700, 0.05em tracking — used for section labels and column headers
- `font-mono` is **not** remapped — keeps Tailwind's default monospace stack for code blocks

Line heights are kept tight for data density. No decorative type treatments.

## Layout & Spacing

Rigid **Fixed-Fluid-Fixed** 3-panel architecture:

1. **Sidebar (Fixed, 260px)**: Dark charcoal `#232321`. Recedes into the periphery. Active icon uses Elitery Green accent dot/highlight.
2. **Main Canvas (Fluid)**: Dark mode `#1a1a18`, Light mode `#f9f9f7`. High-contrast workspace — the primary work surface.
3. **Context Panel (Fixed, 320px)**: Slightly raised surface (`#2a2a28` dark / `#f2f2ee` light) with 12px backdrop blur. Glassmorphic — floats over the canvas.

This layout is rigid. Do not collapse panels or reorganize the three-panel structure without explicit instruction.

Spacing rhythm: 16px gutters, 24px margins between functional groups, 8px base grid for internal component alignment.

## Elevation & Depth

Hierarchy via **tonal layering** and **low-contrast outlines** — not shadows. This maintains the bare-metal feel in both dark and light modes.

- **Level 0 (Canvas)**: `#1a1a18` dark / `#f9f9f7` light
- **Level 1 (Cards/Sections)**: 1px border (`#3a3a37` dark / `#e2e5ea` light). No shadow.
- **Level 2 (Modals/Context Panel)**: 12px backdrop blur + subtle surface lift. One shadow allowed: `box-shadow: 0 4px 24px rgba(0,0,0,0.4)` dark / `rgba(0,0,0,0.08)` light.
- **AI Breakdown**: Amber inner border (4px) + subtle outer glow `#f59e0b` at 20% opacity. Reserved exclusively for blueprint-generated task cards.

Do not add drop shadows to regular cards. Do not apply AI Breakdown styling to status chips or any non-AI content.

## Shapes

**Soft (0.25rem default)** roundedness throughout. Professional and precise — not consumer-app bubbly. Large radii are forbidden. Buttons, inputs, and chips all share the 4px radius for total consistency.

Full radius (`9999px`) is allowed only for pill-shaped status chips and avatar circles.

## Components

### Buttons
- **Primary**: Elitery Green `#3aae51` background, dark `#0f2b16` text. 4px radius.
- **Ghost**: Green text, no border at rest, green border on hover.
- **Destructive**: Red `#ef4444` background, white text.
- All buttons use Source Sans 3, weight 500.

### Sidebar
- Background: `#232321` in both modes (sidebar stays dark even in light mode — intentional, matches Elitery brand)
- Active item: Elitery Green accent indicator (dot or left border)
- Inactive icons: `#888780`
- Nav order: Overview → Projects → Customers → Daily Review → Reports → Settings → Admin

### Status Chips
Pill-shaped, subtle background tint, high-contrast text:
- Active: green tint + green text
- Planning: blue tint + blue text
- At risk: amber tint + amber text
- Blocked: red tint + red text

### Input Fields
1px border (`#3a3a37` dark / `#d0d0cc` light). Focus state: 2px Elitery Green outline, no glow (bare-metal). Background: `#1e1e1c` dark / `#ffffff` light.

### Data Grids
Fixed row height 40px or 48px, 1px bottom borders. Hover: `#2a2a28` dark / `#f8f9fa` light. Must support **Compact mode**: 12px font, reduced row height. Build grids with compact mode in mind from day one.

### AI Breakdown Cards
Amber left-border accent (4px) + amber glow `#f59e0b` at 20% opacity. Applied only to tasks generated via the Secure Ingestion Port (blueprint-sourced). Never apply to manually created tasks or status highlights.

## Dark / Light Mode Implementation

- Default theme: **dark**
- Toggle: user preference, persisted via `frontend/src/lib/theme.tsx`
- The sidebar **always stays dark** regardless of theme — it is a fixed brand element
- Theme is applied via `data-theme` attribute on `<html>` — Tailwind `dark:` classes handle the flip
- When adding new components, always define both dark and light variants — never assume one mode only
