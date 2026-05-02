---
name: Technical Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#d8d9e3'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fd'
  surface-container: '#ecedf7'
  surface-container-high: '#e6e7f2'
  surface-container-highest: '#e1e2ec'
  on-surface: '#191b23'
  on-surface-variant: '#424754'
  inverse-surface: '#2e3038'
  inverse-on-surface: '#eff0fa'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#585d60'
  on-tertiary: '#ffffff'
  tertiary-container: '#707579'
  on-tertiary-container: '#fbfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dfe3e7'
  tertiary-fixed-dim: '#c3c7cb'
  on-tertiary-fixed: '#171c1f'
  on-tertiary-fixed-variant: '#43474b'
  background: '#f9f9ff'
  on-background: '#191b23'
  surface-variant: '#e1e2ec'
typography:
  h1:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  h2:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  data-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 11px
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

The design system is engineered for high-performance technical environments, prioritizing speed of comprehension and data density. The brand personality is "Bare-Metal"—it is direct, transparent, and unapologetically functional. It targets technical operators and analysts who require a tool that feels like a precision instrument rather than a consumer app.

The style leverages **Minimalism** with a **Corporate Modern** structural backbone. By removing all non-essential decorative elements, the design system focuses the user's cognitive load entirely on the data. The interface utilizes a distinct tri-panel architecture to separate navigation, execution, and context, ensuring a high-performance workflow.

## Colors

The palette is defined by structural contrast. The left navigation utilizes a deep, "Dark Mode" slate to recede into the periphery, while the central workspace remains high-contrast "Light Mode" for maximum text legibility. 

- **Primary Action:** Solvro Blue (#0058be) is reserved exclusively for interactive elements and active states.
- **Surface Logic:** The main canvas uses a crisp White/Off-white mix to define the workspace. The right-side context panel uses a light grey with subtle glassmorphism to indicate its role as a supplementary, floating layer of information.
- **Semantic Logic:** Status colors are high-saturation to ensure immediate recognition in high-density data tables. The AI Breakdown uses a specific Amber glow effect to distinguish machine-generated insights from hard system data.

## Typography

This design system employs a dual-font strategy to balance corporate reliability with technical precision.

- **Inter** is the workhorse for the majority of the UI, chosen for its systematic neutrality and exceptional legibility at small sizes in data tables.
- **Space Grotesk** is used for headlines and technical labels to provide a "scientific" and futuristic aesthetic.

To maintain high data density, line heights are kept tight, and a specialized `data-mono` style (using Inter's tabular features) is utilized for numerical values and IDs to ensure vertical alignment across columns.

## Layout & Spacing

The layout follows a rigid **Fixed-Fluid-Fixed** 3-panel architecture:
1. **Navigation (Fixed):** 260px width.
2. **Main Canvas (Fluid):** Expands to fill available viewport, utilizing an 8px base grid for internal component alignment.
3. **Context Panel (Fixed):** 320px width, anchored to the right.

The spacing rhythm is compact to accommodate complex dashboards. Gutters are strictly 16px, preventing visual fragmentation while maximizing the usable area for data visualization. Content blocks are separated by 24px margins to provide clear breathing room between distinct functional groups.

## Elevation & Depth

Hierarchy is established primarily through **Tonal Layering** and **Low-Contrast Outlines** rather than traditional shadows, maintaining the "bare-metal" feel.

- **Level 0 (Canvas):** Base background (#FFFFFF).
- **Level 1 (Cards/Sections):** Defined by a 1px border (#E2E8F0). No shadow.
- **Level 2 (Modals/Context Panel):** These elements use a backdrop blur (12px) and a subtle 10% opacity shadow to simulate floating over the canvas.
- **AI Breakdown:** Uses a specialized "Subtle Amber Glow"—an inner shadow or soft outer neon-tinted bloom (#F59E0B at 20% opacity) to denote AI-augmented content.

## Shapes

The design system uses **Soft (0.25rem)** roundedness to maintain a professional, technical edge. Sharp corners are avoided to prevent the UI from feeling "dated" or "aggressive," but large radii are strictly forbidden to ensure the interface feels like an industrial tool rather than a consumer toy. Buttons and input fields share this 4px (0.25rem) radius for total consistency across the toolkit.

## Components

- **Buttons:** Primary buttons are Solid Solvro Blue with white text. Ghost buttons use Blue text with no border unless hovered. All buttons use the 4px radius and Space Grotesk for labels.
- **Status Chips:** Small, pill-shaped indicators with a subtle background tint and high-contrast text. For example, "High" is a light red background with #EF4444 text.
- **Technical Lists:** Rows should have a fixed height (40px or 48px) with 1px bottom borders. Hover states should use #F8FAFC.
- **Input Fields:** Minimalist design with a 1px border. The focus state is a 2px Solvro Blue outline with no "glow" (to stay bare-metal).
- **AI Breakdown Cards:** These feature a specific amber left-border accent (4px width) and the subtle amber glow described in the elevation section.
- **Data Grids:** Must support "Compact" mode where row height reduces and font size shifts to 12px for maximum information density.