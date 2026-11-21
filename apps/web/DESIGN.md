---
name: Syntra Dashboard
description: Dark-only operations console for Discord support bots, ink-violet surfaces, violet kept for what is active.
colors:
  primary: "#ad83ff"
  primary-hover: "#bd9bff"
  primary-deep: "#9057ff"
  ink: "#0b0a10"
  bg: "#0b0a10"
  surface-1: "#12111a"
  surface-2: "#181723"
  surface-3: "#201f2d"
  surface-hover: "#1c1b28"
  line: "#2a2938"
  line-strong: "#3a3950"
  text: "#f2f1f8"
  text-muted: "#a3a1b8"
  text-subtle: "#8b89a3"
  success: "#3ecf8e"
  warning: "#f5b544"
  danger: "#f2555a"
  info: "#5aa9ff"
typography:
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.625
  base:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25rem
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
  button-ghost:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
  button-danger:
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    height: "32px"
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  panel:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.lg}"
  badge-neutral:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  nav-item-active:
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
---

# Design System: Syntra Dashboard

## Overview

**Creative North Star: "The Night Console"**

A dark-only control room for people who moderate and configure Discord communities. Every surface is a near-black grey with a faint violet cast, so the single brand hue has somewhere to be quiet and somewhere to be loud. The system is dense but not cramped: 13px working text, 32px controls, 1px separators doing the work that shadows and cards do elsewhere.

Violet is a state, not a decoration. It marks what is active (current nav item, selected tab, switch on), what has focus (outline, input border), and the one primary action per view. Everything else is neutral ink, muted text and the four status hues. The only ornament in the product is the facet: a 3px slanted stripe lifted from the logo that flags the current page in the sidebar.

Panels are single-level. A panel sits on the page background and holds content directly; nothing nests a card inside a card. Motion exists only to confirm a state change (menu opens, sheet slides, content fades up) and is switched off for reduced-motion users.

**Key Characteristics:**
- Dark only (`color-scheme: dark`); no light theme exists.
- Ink-violet neutral ladder: bg, surface-1, surface-2, surface-3, each one step lighter.
- Violet (#ad83ff light, #9057ff deep) reserved for active, focus and primary.
- Geist for interface, Geist Mono for ids, slugs, times and counts; tabular numerals globally.
- 6 / 10 / 14px radii, 1px separators, soft shadow only on floating layers.
- Skeleton loading (shimmer), plus error and not-found boundaries.

## Colors

A cool, near-black neutral ladder with one violet voice and four functional status colors.

### Primary
- **Facet Violet** (#ad83ff): primary button fill, active nav icon and facet stripe, focus outline, selected-state text on tinted chips, input focus border and caret.
- **Facet Violet Hover** (#bd9bff): primary button hover only.
- **Deep Violet** (#9057ff): switch track when on, native checkbox accent, text selection tint, the 16% accent-soft wash behind active nav and brand badges, and the focus glow.
- **Ink** (#0b0a10): the text color on any violet fill. Light violet with ink text is the contrast pair; white on #ad83ff is not used.

### Neutral
- **Void** (#0b0a10): page background.
- **Panel Ink** (#12111a): panels, inputs, sidebar (at 60% alpha), dialogs.
- **Raised Ink** (#181723): secondary buttons, dropdown menus, icon tiles, selects.
- **Lifted Ink** (#201f2d): neutral badges, switch track off, hovered secondary buttons, skeleton highlight.
- **Hover Ink** (#1c1b28): hover wash on ghost buttons, nav items, menu items.
- **Hairline** (#2a2938): panel borders and row separators.
- **Hairline Strong** (#3a3950): control borders (inputs, secondary buttons), dialog and menu borders.
- **Bright Text** (#f2f1f8): primary text.
- **Muted Text** (#a3a1b8): descriptions, inactive nav, secondary labels.
- **Subtle Text** (#8b89a3): hints, timestamps, placeholders; passes 4.5:1 on every surface.

### Status
- **Signal Green** (#3ecf8e), **Amber** (#f5b544), **Alert Red** (#f2555a), **Info Blue** (#5aa9ff). Used as 12% tinted badge fills with full-strength text, as 6px dots, and (danger) as a 40% border with 10% fill on destructive buttons. Color never carries meaning alone: dots and badges always sit beside a label.

### Named Rules
**The Violet Is A State Rule.** Violet appears only where something is active, focused or the primary action. A decorative violet surface, gradient or border is out of system. (`--brand-gradient` exists in tokens.css and is not used by the app.)

**The Ink On Violet Rule.** Any element filled with #ad83ff takes ink (#0b0a10) text. This applies to the primary button and to avatar initials.

**The Own Palette Rule.** The Discord preview deliberately uses Discord's own palette (#313338 and neighbors) because fidelity is the point. That block is the only place off-palette colors are allowed, and it must stay inside the preview component.

## Typography

**Display Font:** none; the product has no display face.
**Body Font:** Geist (with ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (with ui-monospace)

**Character:** A single neutral grotesque used at small, tight sizes, with a monospace for anything that is an identifier or a clock. Hierarchy comes from weight and color (fg, muted, subtle), not from size jumps.

### Hierarchy
- **Title** (600, 20px, tight tracking -0.025em): page title in `PageHeader`, one per page.
- **Headline** (600, 15px): empty-state titles, dialog titles, wordmark.
- **Panel Title** (600, 13px): `PanelHeader` and form section headings.
- **Body** (400, 13px, relaxed ~1.625): descriptions, control text, nav, table cells. Descriptions cap at 68ch, empty-state copy at 46ch.
- **Base** (400, 14px, 1.5): the document default; transcript message text.
- **Label** (500, 12px, 20px line): badges, hints (12px subtle), dropdown group labels. Sentence case.
- **Mono** (400, 11-12px): slugs, ids, timestamps, guild kinds, via `Mono`.

### Named Rules
**The Quiet Ramp Rule.** The ramp tops out at 20px. New screens do not introduce larger display type; they get emphasis from weight (600) and the fg/muted/subtle color steps.

**The Tabular Rule.** Tabular numerals are on for the whole body so data columns align; do not turn them off per component.

## Layout

A fixed 264px sidebar rail at 1024px and up, with content in a max 1180px column centered in the remaining space. Below 1024px the rail becomes a 48px top bar with a left-sliding drawer (86vw, max 19rem). Content padding steps 16px, 24px, 40px by breakpoint (vertical 24px, then 36px on desktop). `PageHeader` sits above content with 24px bottom margin and right-aligned actions that wrap under the title on narrow widths.

Spacing is a 4px grid used densely: 8px gaps between actions, 12-16px panel padding (px-4, py-3 headers), 20px dialog padding, 24px page gutters. Controls are 28 / 32 / 40px tall (sm / md / lg), 32px being the default everywhere.

## Elevation & Depth

Tonal layering, not shadows. Depth is the surface ladder (bg, surface-1, surface-2, surface-3) plus 1px hairlines. Panels are flat and bordered. Shadow appears only on layers that float above the page, and then it is a soft, wide, dark drop with a black scrim, never a hard offset.

### Shadow Vocabulary
- **Dialog** (`box-shadow: 0 24px 60px -12px rgb(0 0 0 / 0.6)`): centered dialogs and side sheets, over a `bg-black/60` scrim with 2px blur.
- **Menu** (`box-shadow: 0 16px 40px -8px rgb(0 0 0 / 0.6)`): dropdown menus.
- **Switch thumb** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.4)`): the only micro shadow.
- **Focus glow** (`--ring: 0 0 0 3px` deep violet at 35%): defined as a token; inputs use a 2px brand/30 ring instead.

### Named Rules
**The Flat Panel Rule.** Panels never carry a shadow and never nest. A second grouping inside a panel is a hairline divider or a `surface-2` tile, not another bordered card.

## Shapes

Three radii and a pill. 6px (`sm`) for small marks; 10px (`md`) for every control, button, input, menu item and nav item; 14px (`lg`) for panels, dialogs, menus and icon tiles; full for badges, dots, avatars and the switch. All borders are 1px. The one non-rounded form is the facet: a clip-path slant (`facet-tab`, 3px wide stripe) beside the active nav item, and a `facet-cut` 10px corner chamfer defined for future use. Keyboard focus never changes shape: a 2px brand outline with 2px offset, set in the base layer so rounded forms keep their silhouette.

## Components

### Buttons
- **Shape:** 10px radius, medium weight, 13px text, 150ms color transition, 1px press-down on active.
- **Primary:** Facet Violet fill, ink text, hover to #bd9bff. One per view.
- **Secondary (default):** Raised Ink fill, 1px Hairline Strong border, bright text; hover lifts to Lifted Ink.
- **Ghost:** transparent, muted text, Hover Ink wash on hover. Used for cancel and toolbar actions.
- **Danger:** 10% red fill, 40% red border, red text; hover 20% fill.
- **Sizes:** sm 28px, md 32px (default), lg 40px, icon 32px square. Disabled at 45% opacity; `loading` swaps in a spinner and sets `aria-busy`.

### Inputs / Fields
- **Style:** Panel Ink fill, 1px Hairline Strong border, 10px radius, 32px high, 13px text, subtle placeholder. Labels sit above at 13px medium; hints below at 12px subtle.
- **Focus:** border turns Facet Violet plus a 2px brand/30 ring. Invalid sets a red border via `aria-invalid`. Disabled at 50%.
- **Switch:** 36x20 pill, track Lifted Ink off and Deep Violet on, thumb muted grey off and white on.

### Panels
- **Corner Style:** 14px. **Background:** Panel Ink, 1px Hairline border, no shadow.
- **Header:** `PanelHeader`, 13px semibold title, optional 12px subtle description, actions on the right, a hairline beneath, 16px by 12px padding.

### Badges and dots
- Pill, 12px medium, 2px by 8px. Neutral = Lifted Ink with muted text; brand = 16% deep violet with Facet Violet text; status tones = 12% tint with full-strength text. `Dot` is a 6px circle, always paired with a label.

### Navigation
- Sidebar rail on Panel Ink at 60%, right hairline. Project switcher is a bordered control; Discord server switcher is a borderless row with status dot. Nav items: 13px, 10px radius, muted with subtle icon at rest, Hover Ink wash on hover. **Active:** 16% violet wash, bright text, brand-colored icon, and the **facet**, a 3px slanted brand stripe hung 12px left of the item.
- Below 1024px the same content opens in a left drawer from a 32px menu button in the top bar.

### Empty states
- A centered column: 44px icon tile (Raised Ink fill, Hairline Strong border, 14px radius, 20px muted Lucide icon), 15px semibold title, muted 13px explanation, optional action 20px below. Empty states teach and offer the next step. No illustration.

### Dialogs and confirmation
- Centered dialog (min 92vw / 34rem) or side sheet, Panel Ink, Hairline Strong border, header with hairline and a 28px close button. Entry is a 160ms pop (or 200ms slide for the left drawer).
- Destructive actions go through `ConfirmDialog`: names the item, states the consequence, Ghost "Annuler" plus Danger confirm with pending spinner. No native browser confirms.

### Transcript (signature)
- A support conversation rendered Discord-style with four-way author distinction, each non-color-only: **player** (tinted per-name name color, neutral Joueur chip), **staff** (bright name, violet Staff chip, violet avatar), **anonymous staff** (grey avatar, violet chip carrying the pole name), **internal note** (dashed amber border, 6% amber fill, lock avatar, "Note interne · invisible du joueur" chip). System events are a single muted line with a short rule. Day separators are centered hairlines. Consecutive messages from one author within 5 minutes collapse and reveal the time on hover.

### Discord preview
- Intentionally Discord's own palette and geometry (3-4px radii, #5865f2 blurple, #313338 ground), contained in one component so fidelity does not leak into the dashboard.

### Loading and failure
- `skeleton` is a surface-2 to surface-3 shimmer (1.4s linear) used in `loading.tsx`; `error.tsx` and `not-found.tsx` exist as route boundaries.

## Do's and Don'ts

### Do:
- **Do** keep violet for active, focus and the single primary action, and put ink (#0b0a10) text on any #ad83ff fill.
- **Do** build depth from the surface ladder and 1px hairlines; use `Panel` as a single flat level.
- **Do** use the 6 / 10 / 14px radii: 10px on controls, 14px on containers, pill on badges and dots.
- **Do** pair every status color with a label or icon, and use the 12% tint for badges.
- **Do** put identifiers, slugs and times in Geist Mono; keep sentence case everywhere.
- **Do** route destructive actions through `ConfirmDialog` and say what will be lost.
- **Do** teach in empty states with an icon tile, a plain explanation and a next action.
- **Do** keep motion to 150-200ms state confirmations and honor `prefers-reduced-motion`.

### Don't:
- **Don't** nest a bordered card inside a panel; use a divider or a surface-2 tile.
- **Don't** use violet decoratively: no gradients, glows or tinted section backgrounds.
- **Don't** add illustration to empty or error states; the icon tile is the pattern.
- **Don't** introduce a light theme, a display face, or type larger than 20px.
- **Don't** extend the facet to other elements; it marks the active page only.
- **Don't** use the Discord palette outside the preview component.
- **Don't** use native `confirm()` or `alert()` dialogs.
