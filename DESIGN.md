---
name: Insyte
description: De Blauwdruk — an operator console drawn like a technical plate: one blue, achromatic ink, surfaces instead of borders.
colors:
  glacier: "oklch(0.965 0 0)"
  mist: "oklch(0.984 0 0)"
  paper: "oklch(1 0 0)"
  arc: "oklch(0.48 0.215 270)"
  arc-soft: "oklch(0.84 0.078 270)"
  arc-tint: "oklch(0.94 0.028 270)"
  arc-ink: "oklch(0.48 0.215 270)"
  abyss: "oklch(0.284 0.186 270)"
  abyss-2: "oklch(0.322 0.21 270)"
  sky: "oklch(0.72 0.13 260)"
  powder: "oklch(0.82 0.04 270)"
  ink: "oklch(0.28 0 0)"
  ink-2: "oklch(0.4 0 0)"
  ink-3: "oklch(0.49 0 0)"
  ink-4: "oklch(0.68 0 0)"
  ink-5: "oklch(0.78 0 0)"
  hairline: "oklch(0.89 0 0)"
  hairline-strong: "oklch(0.83 0 0)"
  mesh-ink: "oklch(0.98 0.01 100)"
  mesh-ink-2: "oklch(0.86 0.025 270)"
  mesh-ink-3: "oklch(0.72 0.035 270)"
  mesh-hairline: "oklch(0.36 0.08 270)"
  person-1: "oklch(0.845 0.075 250)"
  person-2: "oklch(0.855 0.085 340)"
  person-3: "oklch(0.875 0.115 90)"
  person-4: "oklch(0.855 0.085 155)"
  person-5: "oklch(0.85 0.08 30)"
  person-6: "oklch(0.85 0.075 300)"
  person-ink: "oklch(0.3 0.015 270)"
  signal-green: "oklch(0.51 0.115 160)"
  signal-green-bg: "oklch(0.94 0.055 160)"
  signal-amber: "oklch(0.525 0.113 70)"
  signal-amber-bg: "oklch(0.94 0.048 75)"
  signal-red: "oklch(0.545 0.2 22)"
  signal-red-bg: "oklch(0.94 0.03 22)"
typography:
  2xs:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    lineHeight: "14px"
    letterSpacing: "0em"
  xs:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    lineHeight: "16px"
    letterSpacing: "-0.005em"
  sm:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    lineHeight: "18px"
    letterSpacing: "-0.01em"
  base:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
    letterSpacing: "-0.011em"
  md:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    lineHeight: "22px"
    letterSpacing: "-0.014em"
  lg:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    lineHeight: "24px"
    letterSpacing: "-0.018em"
  xl:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    lineHeight: "26px"
    letterSpacing: "-0.022em"
  2xl:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "24px"
    lineHeight: "30px"
    letterSpacing: "-0.026em"
  3xl:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    lineHeight: "34px"
    letterSpacing: "-0.03em"
  4xl:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "40px"
    lineHeight: "44px"
    letterSpacing: "-0.034em"
  5xl:
    fontFamily: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif"
    fontSize: "60px"
    lineHeight: "60px"
    letterSpacing: "-0.038em"
  figure:
    fontFamily: "\"Archivo Variable\", \"Inter Variable\", system-ui, sans-serif"
    fontSize: "60px"
    lineHeight: "0.82"
    letterSpacing: "-0.045em"
    fontVariation: "font-stretch: 88%"
    fontFeature: "tabular-nums lining-nums"
rounded:
  pill: "9999px"
  chip: "6px"
  control: "9px"
  tile: "12px"
  tile-hero: "16px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-default:
    backgroundColor: "{colors.abyss}"
    textColor: "{colors.mesh-ink}"
    typography: "{typography.sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-default-hover:
    backgroundColor: "{colors.abyss-2}"
    textColor: "{colors.mesh-ink}"
  button-primary-mesh:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.abyss}"
    typography: "{typography.sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "color-mix(in oklch, var(--ink) 4.5%, transparent)"
    textColor: "{colors.ink}"
    typography: "{typography.sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper}"
    typography: "{typography.sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "color-mix(in oklch, var(--ink) 4.5%, transparent)"
    textColor: "{colors.ink}"
    typography: "{typography.sm}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
    height: "36px"
  input-focus:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  badge-default:
    backgroundColor: "{colors.abyss}"
    textColor: "{colors.mesh-ink}"
    typography: "{typography.xs}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-secondary:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink-2}"
    typography: "{typography.xs}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-destructive:
    backgroundColor: "{colors.signal-red-bg}"
    textColor: "{colors.signal-red}"
    typography: "{typography.xs}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "24px 0"
  dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile-hero}"
    padding: "20px"
  table-head-cell:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink-3}"
    typography: "{typography.xs}"
    padding: "0 12px"
    height: "32px"
  table-row-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.sm}"
    padding: "0 12px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.arc-tint}"
    textColor: "{colors.arc-ink}"
    typography: "{typography.base}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "28px"
  rail-item-active:
    backgroundColor: "{colors.arc}"
    textColor: "{colors.mesh-ink}"
    rounded: "{rounded.control}"
    width: "34px"
    height: "30px"
  facet-chip:
    backgroundColor: "{colors.arc-tint}"
    textColor: "{colors.arc-ink}"
    typography: "{typography.xs}"
    rounded: "{rounded.chip}"
    padding: "0 6px 0 8px"
    height: "24px"
  plate:
    backgroundColor: "{colors.abyss}"
    textColor: "{colors.mesh-ink}"
    padding: "28px 24px"
---

# Design System: Insyte

## Overview

**Creative North Star: "De Blauwdruk"**

The cyanotype: the plan drawn in white on blue before anything is built. The console is a drawing
board, not a dashboard. A proposal the product is still deciding about is drawn as a _plate_ —
`abyss` ground, chalk line work, a 32px drafting grid, a title block at the foot — and once it
becomes a record it moves onto paper, where it is read as rows. That is the whole personality: the
blue is where the product is _proposing_, the paper is where the operator is _working_.

The system's one aesthetic commitment is that the canvas is colourless. The ink ramp is achromatic —
chroma exactly zero, both themes — so the only chromatic thing in a product surface is the brand
hue, Royal Azure at hue 270. Everything interactive is that hue and nothing decorative is. The
second commitment is that **separation is a surface change**: `glacier` → `mist` → `paper` is the
layering, panels are flat, and a hairline is reserved for a data boundary. Both themes ship as
equals, under the same token names (`packages/tokens/src/tokens.ts` carries a parallel `darkColors`
map, key-for-key).

Density is where it earns it. A table runs 32px heads, 36px rows, 12px gutters and 13px type; a
plate breathes. The type scale is fixed pixels at a ~1.15 ratio, eleven steps, because an operator
reads this at one DPI all day and a `clamp()` heading that shrinks inside a panel is worse, not
better.

**What this describes, and what it does not.** This is the system as built, read off
`packages/tokens/src/tokens.ts`, `packages/ui/src/app/app.css`, `packages/ui/src/components/`
and `packages/ui/src/app/` (the console's screens and parts, rendered by the reference `apps/design` at
`/app`), plus the landing page (`packages/ui/src/marketing/`, rendered by
`apps/marketing`), which was redesigned on these tokens on 28 October 2026 and is described under
**Landing page** below, and the brand book (`/brand`, `packages/ui/src/brand/book/`), rebuilt on these
tokens on 1 November 2026 and described under **Brand book**. What is still **ported** — held
byte-identical to the legacy app and excluded by name in `dprint.json`,
`packages/ui/test/discipline.test.ts` and `packages/ui/tsconfig.ported.json` — is the mark
(`packages/ui/src/brand/mark*.tsx`) and the console's remaining stand-ins: the auth and onboarding
routes, `_admin`/`_aff`/`_supplier` screens, and the shell pieces that have not been redrawn. Those
are not evidence for this system and the rules here are not applied to them. `docs/adr/0005`
records where the console left the port; the landing page's `port:diff` was retired with the
redesign, and the brand book's `brand:diff` with the rebuild (ADR-0026's addendum). Values live in `tokens.ts`, what the groups are _for_ lives in `families`, `radiusUse`,
`textUse`, `easingUse` and `durationUse` beside them, and product truth lives in `PRODUCT.md`; a
value stated in two of those will disagree with itself.

**Key Characteristics:**

- One hue (Royal Azure, 270) on an achromatic ground; chroma 0 everywhere else in product surfaces.
- Flat by default: surfaces separate, shadows are for things that have left the page.
- Filled, not outlined: a secondary button and an input are the same well.
- Fixed pixel type ramp, eleven steps, each carrying its own line-height and tracking.
- Sentence case, no uppercase micro-labels, no second face except the figure.
- Motion is a transition between two states, decelerating, and always gated on reduced motion.

## Colors

A true-neutral grey-white canvas with one committed brand hue doing all the interactive work, plus a
dark ground the product proposes from. Values are canonical in the frontmatter as OKLCH; eight legacy
values were out of sRGB and were repaired (identity colours to the nearest in-gamut match, status
colours by holding lightness and hue and clamping chroma), and `isInGamut` plus
`packages/tokens/test/tokens.test.ts` keep them there.

### Primary

- **Arc, Royal Azure** (`{colors.arc}`): every interactive moment — focus outline, selection,
  caret, the active rail tile, the thing you are meant to press. It is a _field_, never inline text.
- **Arc as ink** (`{colors.arc-ink}`): the brand used as text — links, active tab labels, the
  secondary action's label. It is the one brand value that moves between themes, because text is the
  one place it has to (daylight is identical to `arc`; at night it lifts to clear 4.5:1).
- **Arc soft** (`{colors.arc-soft}`): the outer halo of the focus bloom, nothing else.
- **Arc tint** (`{colors.arc-tint}`): the informational wash — the active row in the area panel, a
  facet chip, a surface under something the product is suggesting.

### Secondary

- **Abyss** (`{colors.abyss}`) and **Abyss 2** (`{colors.abyss-2}`, hover): the dark ground. The
  primary call to action, the 52px icon rail, and the plate a proposal is drawn on. Identical in both
  themes — a brand that changes hue when the lights go off is two brands.

### Tertiary

- **Sky** (`{colors.sky}`) and **Powder** (`{colors.powder}`): atmosphere only, the lit orbs of the
  mesh. Both are deliberately absent from the `pairs` table, which is the mechanical way of saying
  nothing may put text on them.
- **People** (`{colors.person-1}` … `{colors.person-6}` on `{colors.person-ink}`): six fields and
  one pinned ink for the disc that stands in for a person, assigned by hashing a name. They are told
  apart, not read: they carry no status and they do not move between themes.
- **Signals** (`{colors.signal-green}`/`{colors.signal-green-bg}`, amber, red): three states, each
  an ink on its own tint, never solid-on-solid.

### Neutral

- **Glacier** (`{colors.glacier}`): the operator canvas, and `html`/`body` background.
- **Mist** (`{colors.mist}`): a field lifted off the canvas — the area panel, the top bar, a table
  head, a compact empty state.
- **Paper** (`{colors.paper}`): the brightest surface. Panels, menus, dialogs, table rows, and what
  a focused input turns into.
- **Ink** (`{colors.ink}`) / **Ink 2** (`{colors.ink-2}`) / **Ink 3** (`{colors.ink-3}`): the only
  three steps that may carry text — body, mid emphasis, and every placeholder, caption, hint and unit
  label.
- **Ink 4** (`{colors.ink-4}`) / **Ink 5** (`{colors.ink-5}`): not text. Disabled glyphs, gridlines,
  ticks, breadcrumb chevrons, the scrollbar thumb.
- **Hairline** (`{colors.hairline}`) / **Hairline strong** (`{colors.hairline-strong}`): a data
  boundary and an input edge, respectively.
- **Mesh ink** (`{colors.mesh-ink}`, `{colors.mesh-ink-2}`, `{colors.mesh-ink-3}`,
  `{colors.mesh-hairline}`): the ink ramp for dark grounds — the plate, the rail, a filled `arc`
  tile. Fixed in both themes, which is why text on `abyss` reads at night.

### Named Rules

**The One Hue Rule.** Product surfaces carry exactly one chromatic family: hue 270. The ink ramp is
chroma 0 in both themes, so a coloured grey anywhere is a defect, not a choice.

**The Arc Is State Rule.** The `arc` family is interactive state and the brand. It is never
decoration: no arc-tinted section backgrounds, no arc borders for emphasis, no arc icon that is not
a control. One exception, chosen by the owner: a home-board widget may sit on `arc-tint` as one of
its grounds, and the area panel's weekly report card is a filled `arc` field, once a week.

**The Three Inks Rule.** Only `ink`, `ink-2` and `ink-3` carry text. `ink-4` and `ink-5` are marks —
gridlines, ticks, disabled glyphs — and putting a word in them fails the contrast the product
commits to.

**The Pinned Field Rule.** A field that is an identity (`arc`, `abyss`, `person-1…6`) holds its
value in both themes, and the ink on it is pinned (`mesh-ink`, `person-ink`) rather than inherited.

**The Word With The Colour Rule.** A status is a signal ink on its own signal tint _and_ a word.
Colour is never the only signal.

## Typography

**Display Font:** Archivo Variable at `font-stretch: 88%` (fallback Inter Variable, system-ui)
**Body Font:** General Sans, with Inter Variable as what actually loads
**Label/Mono Font:** none. The system ships no mono face and no `--font-mono`.

**Character:** A monoline, slightly narrow technical hand — ISO 3098 is the reference for the
display face — over a neutral grapho sans set tight. `cv11` is on in `body`, which turns off Inter's
single-storey 'a' so a dense column of codes and figures does not close up. Negative tracking grows
with size (0 at 11px, −0.038em at 60px); nothing is letter-spaced open.

### Hierarchy

The scale is the project's own eleven steps, and each Tailwind utility carries its own line-height
and tracking, so a call site asks for a role rather than re-deriving three values. Weight, not size,
is the main contrast: 400 for body and anything at `md` or below in prose, 500 (`font-medium`) for
headings, labels, buttons, table heads and nav items, 600 only on a dialog title.

- **2xs** (`{typography.2xs}`): a count in a badge, a tick on an axis. Never prose.
- **xs** (`{typography.xs}`): column heads, timestamps, units, pager text, the quiet half of a cell.
- **sm** (`{typography.sm}`): table rows, chips, menu items, buttons, inputs — anything the eye runs
  down.
- **base** (`{typography.base}`): the default. Body copy, rail and panel labels, empty-state body.
- **md** (`{typography.md}`): one sentence under a title, an empty-state heading. The largest size
  still set at 400.
- **lg** (`{typography.lg}`): the page title (`PageHeader`) and a dialog title. One per screen.
- **xl** / **2xl** (`{typography.xl}`, `{typography.2xl}`): a plate heading, the label beside a
  screen figure.
- **3xl** / **4xl** (`{typography.3xl}`, `{typography.4xl}`): a screen's figure, where it has one.
- **5xl** / **figure** (`{typography.5xl}`, `{typography.figure}`): the monumental figure. One
  shipped use, on the dashboard, via the `figure` utility.

### Named Rules

**The No Mono Rule.** Monospace is a claim that the characters are data. Figures line up because they
are `tabular-nums` on the sans — set globally on `td, th, output, time, data` — not because they wear
a typewriter. The console ships zero `font-mono` in markup and the stylesheet defines no
`--font-mono`, so the utility cannot be reached for.

**The Two Places Rule.** The display face is allowed on the monumental figure and on plate numbers.
Nowhere else; a second face without a job costs a token and buys nothing.

**The Sentence Case Rule.** Sentence case everywhere — headings, buttons, column labels, nav,
status pills. No uppercase eyebrows, no track-spaced micro labels, no kickers. Measured: zero
`uppercase` utilities in authored console or primitive code.

**The Scale Or Nothing Rule.** Eleven steps and nothing between them. A half-pixel size
(`text-[12.5px]`) is a value nudged until one screen looked right.

## Layout

The console is a three-field window, left to right: a **52px icon rail** in `abyss`, a **224px area
panel** (`w-56`) in `mist`, then the work area on `glacier` with panels of `paper` inside it. The
rail, the panel and the top bar are the same field as each other where they can be, and the boundary
between two regions is where the field stops — no rail border, no panel ring, no header underline.

A screen is one `PageHeader` row (min 52px, `px-5 py-2.5`: trail, title, one clause of meta,
actions) and then content. Lists are a single `DataTable` on the page, banded and unframed;
the toolbar above it is search plus facet menus, and the facets collapse to chips. A record opens as
a modal over its list when a row was clicked (`max-h-[88vh]`, up to 1120px wide) and as a page on a
cold URL — same route, same URL, chosen from history state.

**Spacing.** There is no spacing token in `tokens.ts` and none rendered to CSS; the rhythm is
Tailwind's own 0.25rem step scale, used in a narrow band. Measured across the authored furniture the
recurring steps are 6px (`gap-1.5`, the default gap between controls), 8px, 10px, 12px (table
gutters and panel padding), 16px, 20px (page gutters) and 24px. Control heights are the ladder that
actually governs density: 24px (chip), 28–30px (panel row, well), 32px (table head, small button),
36px (default control and table row), 40px (large button).

**Responsive.** Desktop-first, as a tool somebody lives in. The one systemic concession is
`table-scroll`: below ~760px a wide table slides as one piece under a stationary rounded frame
rather than reflowing or clipping, because columns that must line up do not reflow. The plate is a
436px column from `lg` up and full width below it.

### Named Rules

**The Field Stops Rule.** Two adjacent regions are told apart by their surfaces meeting, not by a
line between them. If two regions share a surface and need to be distinguished, one of them is in
the wrong place.

**The One Row Rule.** A list screen spends one row before the data: title, trail, meta, actions. No
eyebrow, no standing description, no KPI strip. Anything true to say on first run is said in the
table's empty state.

## Elevation & Depth

Flat, with one exception. Depth is tone plus one inset line: `panel` is `paper` with a 1px inset
edge mixed from `ink` at 9% — one declaration that is correct in both themes — and no drop shadow at
all. The only things that cast a real shadow are the things that have genuinely left the page: a
menu, a popover, a select, a dialog, a sheet. On dark grounds a shadow is a smudge, so `panel`
carries none and `panel-raised` keeps its shadow in both themes because a floating surface has to
read as floating on any ground.

### Shadow Vocabulary

- **Hairline** (`box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ink) 9%, transparent)`): the
  one line this system draws. Costs no layout and follows whatever radius the caller names.
- **Panel-raised** (`inset 0 0 0 1px …ink 9%`, `0 2px 6px …black 8%`, `0 28px 70px -24px …black
  30%`): a surface that has left the page.
- **Field edge** (`inset 0 0 0 1px color-mix(in oklch, var(--ink) 7%, transparent)`): the lip of a
  well — inputs, selects, the `outline` button.
- **Ring-focus** (`0 0 0 1px var(--arc)`, `0 0 0 4px var(--arc-soft)`): the focus bloom on a control
  that takes one, beside the document-level 2px `arc` outline.
- **Shadow-primary** (`0 1px 2px color-mix(in oklch, var(--abyss) 18%, transparent)`): a single hair
  of weight under a primary button. Flattened from the legacy two-stop shadow and kept at one stop.

### Named Rules

**The Flat Panel Rule.** A panel is a surface and an edge. If it needs a drop shadow to be found, it
is on the wrong ground.

**The Nested Panel Rule.** A panel inside a panel drops its ground and its shadow and keeps only its
padding — enforced off the DOM in `Card`, so the double-framed box fails quietly instead of
shipping.

## Shapes

Five radii, one role each, and no sixth: pill for status pills only (a pill is never a button), chip
(6px) for the smallest affordances, **control (9px)** for anything you operate — buttons, inputs,
selects, menu items, nav rows — tile (12px) for panels and the frame around a table, and tile-hero
(16px) for a modal. Tailwind's `sm`/`md`/`lg`/`xl` are mapped _onto_ those five rather than sitting
beside them, so `rounded-md` and the control role are the same thing. `rounded-2xl` and up resolve to
sizes this system never chose and are outside the ladder.

Form language otherwise: rectangles with soft corners, filled; strokes only in drawn marks (empty
icons, plate line work), where a filled glyph turns into a blot the moment the theme goes dark. Two
drawn fields are tokenised as pitches — the 32px drafting `grid` on plate and board grounds, and the
24px `hatch` (the mark's three offset squares) filling a cell that has nothing to say.

## Components

### Buttons

- **Shape:** control radius (9px); `xs` and the icon-xs size drop to chip (6px).
- **Default / Primary:** `abyss` carrying `mesh-ink`, hover `abyss-2`, active back to `abyss`; the
  `primary` variant adds `shadow-primary`. One per view earns it.
- **Primary on mesh:** on a plate the ground is already dark, so the loud button is the light one —
  `paper` with `abyss` ink.
- **Outline:** not an outline. It is the `field` well (`field hover:field-hover active:bg-ink/10`),
  because a secondary action and an editable slot have the same standing on this floor.
- **Secondary / Ghost:** `mist` with `ink`, and transparent with `ink` over an `ink/6` hover wash.
- **Destructive:** `signal-red` with `paper` ink; `link` is `arc` with a 35%-opacity underline that
  goes solid on hover.
- **Sizes:** 24 / 32 / 36 / 40px tall (`xs`, `sm`, default, `lg`), plus square icon equivalents.
- **Hover / Focus:** transitions are `background-color, box-shadow, color` at 160ms on the out-quart
  curve. No variant draws its own focus ring; the document puts one 2px `arc` outline at 1px offset
  on everything focusable.

### Chips

- **Badge:** pill, filled, `tabular-nums`, 12px text, `px-2 py-0.5`. No borders and no uppercase;
  the `outline` variant paints a quiet `ink/6` well, because an outlined pill beside a filled one is
  two ways of saying the same thing.
- **Facet chip (table toolbar):** 24px tall, chip radius, `arc-tint` with `arc-ink`, a count in
  tabular figures and an `X` to clear. This is how a cut of the data is shown — not a tab strip.

### Cards / Containers

- **Corner Style:** tile (12px); a modal is tile-hero (16px).
- **Background:** `paper` on `glacier`; a compact or quiet container uses `mist`.
- **Shadow Strategy:** `panel` — surface plus inset hairline, no drop shadow. See Elevation.
- **Border:** none. The inset hairline is the edge.
- **Internal Padding:** 24px vertical with 24px gutters in `Card`; 12–20px in the console's own
  panels and table frames.

### Inputs / Fields

- **Style:** filled, not outlined. `field` is a 4.5% `ink` wash with a 7% inset edge, control
  radius, 36px tall (30px in the shell's wells), 13px text, placeholder in `ink-3`.
- **Hover / Focus:** `field-hover` lifts the wash to 7%; focus turns the fill to `paper`, so the slot
  being typed into is the lightest thing on the form. `ring-focus` is the named halo where a control
  wants one.
- **Error:** `aria-invalid` tints the well from `signal-red-bg` — never a red border, which would be
  a layout shift and a second edge language.
- **Caret and selection:** `arc` caret in every input; `::selection` is `arc` carrying `mesh-ink`.

### Navigation

- **Icon rail:** 52px of `abyss`, the mark at its head (which answers hover with a spring tilt, the
  one thing in the rail that is not a destination), destinations as 30×34px tiles, the avatar at the
  foot. Active is a filled `arc` tile and it is **one** tile: a `layoutId` element travels between
  icons rather than fading one in as another goes out. One hairline, above the Manage tile, marking a
  group boundary.
- **Area panel:** 224px of `mist`, the organisation's name at its head, then the area filter well,
  then groups with 12px `ink-3` labels. Active row is the `arc-tint` wash with `arc-ink` — again one
  `layoutId` element, so moving between segments reads as the marker sliding down the list. Never a
  left border and never a ring. Counts sit at the end in tabular figures.
- **Breadcrumb:** `ink-3` 13px crumbs separated by an `ink-4` chevron, the `lg` title as the last
  crumb, so the trail costs no extra row.

### Data table (signature component)

One component for every list in the console (`packages/ui/src/app/table/data-table.tsx`, on
TanStack Table), drawn in the home queue's grammar so every list reads like the screen the operator
opens first. No frame and no rule between rows: the head is a line of 12px `ink-3` labels at 32px,
and the 36px rows are banded `mist` / `paper` with soft (control-radius) ends, at 13px `ink-2` with
12px gutters. Sorting is an arrow that appears at 60% opacity on hover of the head; filtering is
the filter builder below; column choice is a Columns menu of
checkbox items; row selection is optional and washed `arc-tint`, its header checkbox tri-state with
a dash for "some". The loading state
is `ink/8` bars on the same bands, not a spinner.

**Selection bar and actions menu.** A screen hands the table its `actions` (`RowAction` in
`components/table/selection-bar.tsx`) and gets the checkbox column with them. Picking a row raises an
`abyss` bar at the bottom centre: the count with a clear button, two or three `bar` actions with their
single-key shortcut, and **Actions ⌘K**. ⌘K opens a command menu scoped to the selection; it takes
the shortcut ahead of the app-wide palette while rows are picked. An action that only fits some of
the picked rows says "2 of 3", and one that fits none is disabled. Bulk changes go through `patchMany`
in `lib/bulk.ts`, so one Undo restores every row. A page header never has a "Bulk action" menu.

### Filters and views

One system for every list (`components/filters/filter-bar.tsx`, engine in `lib/filter.ts`), built
the way ClickUp builds filters and kept compact. A **Filter** button (with an `arc` count when
something is applied) opens a 620px builder of rows that read as sentences: "Where · Status · is any
of · Delayed", "And · Total · is above · 150". The second row's join switches between And and Or for
the group. **Add group** nests a `mist` group with its own join, for "(this or that) and the other".
The field picker is searchable and marks each field's type with its glyph. The operators follow the
type: an option is any of, none of, empty or set; text contains, does not contain or is exactly; a
number is above, below or equal; a date is in the last N days, after or before. A rule with no value
yet does not filter. Option values come with their counts over the whole list.

What is applied stays visible as 24px `arc-tint` chips under the toolbar, one per rule or group,
joined by "and"/"or". A chip opens that one rule for editing where it sits, and its X removes it.
**Save as view** names the filter and makes it a tab over the list ("All orders", then the saved
views). Changing a view's filter offers "Save changes to …". A view's ⋯ pins it to the area panel or
deletes it with Undo.

The table derives its fields from its columns, so every list gets the builder without extra code: a
facet keeps its order and labels as an option list, numbers become number fields, ISO strings date
fields, and a text column with a handful of distinct values across many rows an option list. The
queue and the tickets board declare their own fields; the tickets board and list share one filter.
Filters, views and the active view persist per browser in `stores/views-store.ts`.

### Orders: the forwarding queue

The dropship step is three views of Bestellingen (`?view=to_forward|awaiting|forward_error`), in the
area panel's group _Doorsturen_ with live counts, one row per order × supplier
(`lib/forwarding.ts`, `stores/forwarding-store.ts`, `orders/forwarding.tsx`). Columns are what a
hand-off is judged by: the order, the supplier, its lines as stacked `ProductThumb`s, what was paid,
how long it has waited (red and medium once a supplier has not confirmed in 24 hours) and the
state as a word on its tint — Te versturen, Wordt doorgestuurd… (amber, while a send waits out the
six-second window), Wacht op bevestiging, Te laat · 1 d 7 u, or the reason in red with the
supplier's own line under it. A failed row carries its next step inline: Andere leverancier (a
picker, back to Te versturen with "was DPC Apparel" under the new name), Klant mailen (Insyte's
draft in the brand's words; the send waits out the window and lands on the order's timeline) and
Annuleren (an alert dialog naming the amount; no Undo).

**Doorsturen** is one dialog for any number of rows: a `mist` block per supplier with its orders and
lines and a segmented Leveranciersportaal · E-mail · API, an optional note, and a primary that says
the outcome ("6 bestellingen naar 3 leveranciers doorsturen"). Each supplier keeps its default and
"Betaalde bestellingen meteen doorsturen" on its dialog under Leveranciers. The supplier's work wins
over the leg: accepting in the portal confirms it, reporting a stock or address problem puts it in
error, so the two sides cannot disagree; a leg not yet forwarded does not exist in the supplier's
portal. Above Te versturen the agent's `ForwardOrder` is a wide plate with the orders per supplier as
its evidence; at Zelf doen the same place shows its log row with Ongedaan maken.

**Verwerking** on an order sits above the lines: Betaald → Naar leverancier → Bevestigd → Verzonden →
Bezorgd, one track per supplier when the order has two, each step an `abyss` disc with a check once
reached, its time and who did it under it, a failed hand-off a red disc with the reason. Below `sm`
the steps stack. Start's Bestellingen tile reads "8 vertraagd · 6 te versturen · 1 wacht >24 u".

### Returns and claims

Retouren (`/returns`, `returns/`) sits in the rail directly after Bestellingen: returns (the shopper
sends something back) and claims (something arrived wrong; nothing may need to come back) in one
house table, cut by the area panel — Te doen (Te beoordelen, Wacht op pakket, Ontvangen, Klaar om af
te handelen), Afgerond, Soort — each counted live, and with "Retour starten" as the panel's button
(an order picker, then the start dialog). Columns are the R-number, order, customer, Retour or Claim
(a claim's word on the amber tint), reason, status, amount in the order's currency, created and the
review deadline, red once 48 hours have passed. Status words are one family (`ReturnStatusBadge`):
Te beoordelen in amber, waiting in `arc-tint`, Afgehandeld on the green pair, Afgewezen quiet.

A return opens as a modal over the list, like an order (`DetailShell`): the agent's plate when it
may propose ("Goedkeuren en ruilen naar Middel", the three checks it rests on as its evidence) or an
amber line when the window has closed and Insyte proposes nothing; the items with their
photographs; what the shopper said as a quote, their photos as 96px tiles; the label with the
carrier's real mark (PostNL, DHL, DPD, UPS) and a simulated carrier scan; the history as a ruled
timeline (shopper on `arc-tint`, team and carrier on `mist`, Insyte's star) with the agent's rows
under it; and a sidebar of facts — the window as "Dag 6 van 30, sluit 25 november", the review
deadline, who has it, where the parcel goes. The actions are the state's: Goedkeuren / Afwijzen (a
reason the shopper reads), Goedkeuren zonder terugsturen for a claim, Label versturen (waits out the
window), Ontvangen markeren, Gecontroleerd, Afhandelen. Afhandelen is the `ResolutionPicker`: five
rows with their glyph, what the shopper gets and the amount (a gift card with its bonus, an
exchange's fee or Gratis), Gevraagd on what was asked. Ruilen and Nieuw artikel make a replacement
order with Undo; a refund asks first in an alert dialog naming the amount and the role's limit, and
has none. On a phone the actions move to a bar at the foot.

Settings → Retouren is the grey sheet: Termijnen (with special periods), Productregels as a
`BandedList` with the rule as a pill and the sentence the shopper reads, Redenen with Foto verplicht,
Telt mee voor kwaliteit and an own window, Oplossingen as toggles with the gift-card bonus and the
exchange fee, Adressen en vervoerders with the carrier marks, Claimstappen, and the portal with its
texts. It changes what every shopper is told, so it takes Retouren · Beheren (a new area in the roles
catalogue, with the special Retouren goedkeuren). The order carries a Retouren card with Retour
starten, the customer their returns, the product its return rate and reasons (amber above 10%), and
Start a Retouren tile.

### The returns portal

`/retour/$storeHandle` (`returns/portal/`) is the store's page, not the console's: no rail, panel or
gates, the store's name centred at the head, "Mogelijk gemaakt door Insyte" small at the foot, a
480px column of white cards on `glacier`, designed at 390px first. One question per card — order
number and e-mail; Iets terugsturen or Een probleem melden; which items; why (the reasons the store
set, "foto nodig" beside those that need one); photos for a claim (a `mist` well to pick or shoot, 80px
previews with a remove); what you want (exchange asks the size as three wells); Klopt dit?; done —
each with Terug, and a claim says "Stap 2 van 3 · …" from the store's claim steps. Steps slide 12px
in the direction of travel. Every refusal is a sentence on the item or the card that says why and
what still can be done: not found (red well, where to find the number), already requested (the
R-number and its status on `arc-tint`), not delivered yet, the window closed ("De retourtermijn van
30 dagen sloot op 18 september"), a product rule (the store's own sentence). The done card gives the
R-number and three numbered next steps worded for what was asked. Controls are 48px; the primary is
`abyss`. The request lands in Retouren at once, with a notification, and the same rules decide what
the console shows.

### Customers

The line beside the title is counted, not written: customers, new ones, and how many look like
duplicates. Duplicates are found by comparing profiles (`lib/duplicates.ts`): the same email, the
same name in the same country, or the same name alone, compared without accents or case; guest
checkouts through a payment provider are never a person. When any exist, an `arc-tint` band above
the table says how many people appear more than once and opens the review.

The review asks one group at a time, "Are these the same person?", with how they matched as a chip
(amber when it is only the name). Each profile is a `mist` column with its country, orders, lifetime
value and first order; the one to keep is ringed in `arc` and defaults to the one with the most
history. A `mist` band says what the merged profile will be before anything merges. The foot offers
"Not the same person" (remembered, by the profiles in the group, so a weaker rule cannot ask again),
Skip, and Merge, which has Undo. The last screen counts what was merged, kept apart and skipped.

Bulk actions on picked rows add Apply tag (G): add or remove, from tags in use or a new one, each
tag showing how many of the picked already carry it; Merge into one profile; and Sync to Klaviyo
(K), which picks a list, can send tags as profile properties, leaves out guest checkouts and says
so, then counts the profiles across and records the list and time on each. Without Klaviyo
connected it says so and goes to Integrations. Merges, tags and syncs are laid over the API's
profiles (`customerEdits`, `applyCustomerEdits`), so the list, the detail and every count agree.

### Products and suppliers

The catalogue's facts are computed from the records (`lib/catalog.ts`): a product's stock from its
variants (out at zero, low under 60 units or with a variant out), its SKU from its first variant, its
category from what it is called, its pace from the units the last 30 days of orders carried, and the
shelf value as cost times units on hand. The list, the product page, the advice and the supplier
scorecard read the same functions, so they cannot disagree.

**Low-stock advice is a plate** (`low-stock-plate.tsx`, reusing Ask Insyte's `ProposalPlate`) above
the table, at most 720px wide: the product that runs out soonest at its own pace, the evidence
(units left, the pace, open orders that carry it), confidence measured from how much it sold, and
File, which pauses its ads and asks the supplier for a restock as an Awaiting reply ticket, with
Undo. Discard leaves everything as it was.

Bulk actions add Recalculate margins (P), which prices the picked products for a target margin over
cost with every row's price and margin shown now and after, products without a cost named and left
alone; and Set active, Set to draft and Archive under Status, each with one Undo. The area panel's
Categories view groups the catalogue with counts, how many need restocking and the average margin
on one shared bar; a group opens the list cut to it.

**The product page edits in place.** A value with a dotted underline is a field: click it and it
becomes an input of the same size where it was, Enter or leaving keeps it, Escape drops it. Status
and supplier are native selects drawn the same way. Margin recalculates as price or cost change,
amber under 30%. Changes are a draft until the unsaved-changes bar saves them, with Undo; Shopify
takes them on the next sync, and Open in Shopify stays for media and variants.

**Suppliers** (`/suppliers`, under the Products panel) is a scorecard: products, open orders,
delayed orders in red, on time as a bar and figure (amber under 80%), stock feed and API, scored
from the orders that carry each supplier's products. A supplier opens as a modal with the facts in
one `mist` band, their products with stock, their delayed orders as red chips that open the order,
and Pause new orders, Ask to restock (for what is low) and Message, which opens the supplier channel
when there is one.

### Product quality

The product page has two sections now, Overzicht and Kwaliteit (`?tab=quality`), as a row of
labels with an `arc` underline; Kwaliteit carries "Onder toezicht" on the amber tint when it is, and
a count of checks waiting to be judged. Kwaliteit (`quality/quality-tab.tsx`, `lib/quality.ts`)
leads with one white band of figures — the complaint rate (amber over the 5% threshold, "4 van 65
verkocht in 90 dagen" under it), checks approved, rejected and running — and the phase as a
segmented well (Test, Actief, Onder toezicht on amber, Uitgefaseerd), changed with Undo by the special
_Productfase wijzigen_. Then Controle aanvragen and Monster bestellen, and a size filter. Over the
threshold and not yet watched, the agent's `RequestQualityCheck` plate proposes a batch check and the
watch, with the complaints as its evidence; after it, its log row stands there. The timeline is one
ruled line, newest first: requests and submissions as quiet `mist` glyphs, a verdict as an `abyss`
check or a red cross, complaints on the amber tint with "Uit retour" linking the return. A check
opens a 520px drawer: what was asked and by when (red once overdue), the gallery, the batch and the
video tile, the supplier's note, and Goedkeuren (Undo) or Afkeuren, which asks a reason the supplier
reads and can open a supplier ticket and set the watch in one move. Judging is a person's call
(_Kwaliteit goedkeuren_); it is not in the agent's catalogue. Quality-marked returns count as
complaints the moment they arrive.

The supplier sees its own products' checks at the head of the product page, as white cards: what
Northwind asked, what to deliver, by when, the reason when it was rejected, and an upload well, the
batch and a note, then Controle insturen; open checks lead its start's "Eerst dit". The products panel
gains Aandacht (Retour boven 10%, Open klachten, Controle loopt) and the supplier scorecard
Klachten and Controles (approved of judged).

### Tags

One tag dialog (`components/common/tag-dialog.tsx`) serves every list that has tags — customers and
orders so far: Add or Remove, the tags already in use as chips with "n of m" for how many picked
records carry them, and a well to type a new one (stored lower case, hyphenated). The screen says
what applying means, and every apply has Undo.

Orders carry two kinds of tag (`lib/order-tags.ts`). Insyte's own markers — Delayed, Tracking sent,
Draft — read as words, sit as quiet `ink/5` chips titled "Set by Insyte", and change only through
the action that set them. The operator's tags are `arc-tint` chips with an X on the order page,
added from a well that offers the tags other orders use as you type, so a word is not spelled three
ways; each change applies at once with Undo. In the list an order's first tag sits beside its
number (+n for more), and a hidden Tags column lets the filter builder ask "Tags contains".

### Tickets: views and sources

Tickets are not an email client, and the area panel says so: Tickets (All, Assigned to me,
Unassigned, Snoozed), Closed (Done, Archived, Spam, Trash) and Sources, all counted live from the
tickets (`lib/ticket-source.ts`). Sources lists where tickets come from, each with its own mark
(`components/tickets/source-mark.tsx`): a connected service's logo on its tile (Gmail, Outlook,
Shopify, Klarna), or Insyte's glyph for chat, its automations, and tickets added by hand. The same
mark leads every card and list row, and Source is a column and a filter field.

Snoozed, archived, spam and trashed tickets are all kept and leave every other view. Those views
are lists, not boards, since a board's columns are for work in progress, and each one's empty state
says what lands there and how it comes back. Every set-aside action has Undo, and "Bring back now"
in the selection bar restores any of them.

Comments take @mentions (`components/tickets/mention-field.tsx`): "@" opens the team, arrow keys
and Enter pick, ⌘Enter posts. Mentions read back as `arc-tint` marks, and the toast names who is
notified.

### Inbox: mailboxes

The inbox reads connected mailboxes (`lib/mailboxes.ts`), each an email integration's account.
The list is grouped by mailbox under a sticky band: the provider's logo, the address, the count,
and either "Synced …" with a green dot or an amber Reconnect link to Integrations. A disconnected
mailbox keeps its threads, but its letter shows an amber band saying nothing sends from it and Send
is disabled. Threads are assigned to a teammate from the letter's toolbar (with Undo), and the
assignee's initial sits on the row. Unassigned and Assigned to me read the assignee. The panel
lists Mailboxes with their logos and counts, plus Connect a mailbox.

**Channels** (PLAN 27, `inbox/channel-parts.tsx`, `lib/channels.ts`). WhatsApp, Instagram and the
website chat sit beside the mailboxes: the panel's group is _Kanalen_ — each mailbox, then each chat
channel that is connected or needs attention, with its mark (the vendor's logo; Insyte's glyph on
`abyss` for the website chat) and its count, then Kanaal koppelen. The list groups chat threads under
the same sticky band as a mailbox (mark, name, account, a green dot or an amber Opnieuw koppelen), and
a row carries its channel's mark and Insyte's star when the agent handled it. A chat's letter is
bubbles: the customer on the left on `mist`, the team on the right on `ink/7`, Insyte's own replies
on `arc-tint` under "Insyte · automatisch", with Afgeleverd or Gelezen under what was sent. Above the
composer the 24-hour window speaks: `mist` while there is time ("Nog 6 uur om vrij te antwoorden;
daarna alleen een goedgekeurd sjabloon"), amber in the last six hours and once closed; past it
WhatsApp takes only an approved template (chosen as chips, filled with the name and order) and
Instagram nothing. A send waits out the window with Undo. A disconnected channel keeps its threads
under an amber band and disables the composer. Instellingen → Koppelingen has a _Kanalen_ group whose
Koppelen opens the provider's steps (Meta business account, number, name and a first template;
Instagram's permission; the theme app embed with a drawing of the widget and its greeting).

### Chats: the composer

The composer (`routes/_admin/chats/index.tsx`) writes plain marks that `components/chats/message-body.tsx`
reads back: **bold** (⌘B), _italic_ (⌘I), ~~struck~~ (⌘⇧X), `code` (⌘E), "- " lists, [links](https://…)
and bare https links. The toolbar has the same formats as Insyte glyphs (`Bold`, `Italic`,
`Strikethrough`, `Code` in `@insyte/ui/icons`), then a hairline, then attach, mention, emoji and
the Insyte draft. "@" opens the team above the field, as in ticket comments, and a sent mention
names who is notified.

Files are attached from the picker or dropped on the composer, which turns `arc-tint` with "Drop to
attach". They wait as removable chips, send with or without text, and show as the image itself or a
file tile (kind and size). Nothing is uploaded, so after a reload an image's tile says its preview
was not kept. The emoji picker (`components/chats/emoji-picker.tsx`) is searchable by name, grouped
by use (Answers, Work, How it went), with this browser's recent picks first. It serves the composer
and reactions alike, and reactions work on messages sent from here.

### Automations: library, builder and runs

The panel's views are counted from the workflows: Alle workflows, Concepten, Met AI-stappen,
Aanbevolen and Geschiedenis. Under them (`components/automations/panel-extras.tsx`) sit three
templates that fold away with Alle sjablonen, the last five runs across every flow (a signal dot,
the flow, "vandaag 10:42" or the date), and one template worth starting with on a small `abyss`
plate ("Sjabloon · name · Begin hiermee"), which can be put away for good. Pins follow, as in every
area. Templates (`lib/automation-templates.ts`) are the five example flows the original spec names,
plus the triggers it lists, grouped by Orders, Customers, Support, Stock and Disputes: a row with no
card, the steps as chips with their marks, and "Use template", which makes a saved draft. Nothing
turns on by itself. Recommended shows a template only when the workspace's records say it has work
to do, the reason written as a fact in `arc-ink` with the spark, and names a draft or paused flow
with that trigger. The list itself reads each flow as its steps' marks, then its name, with the
logos of the services it touches.

**A step's mark** (`step-tile.tsx`) says what kind of step it is before the label does: a
connected service shows its real logo (`BrandLogo`; Shopify, Klaviyo, Gmail, Outlook, Slack,
Microsoft Teams and 365, Stripe, Klarna, PayPal, DHL, PostNL, Sendcloud, Exact Online, Google
Sheets, Gorgias), Insyte's own actions and AI steps are a chalk glyph on `abyss`, a trigger is
tinted green, and logic (wait, filter, splitsing) is a quiet `ink` well. Every action names the
right it needs (`scopes.ts`).

**The builder** is one header and four tabs. The header: the trail and the name (editable in
place), a status dot and word, the live version as a chip ("v4"), the tabs centred as a segmented
control (Overzicht, Workflow, Runs with its count, Instellingen), then Test met voorbeeld (the
flask) and Publiceren. Publishing is the only way an edit goes live: the button is disabled until
the canvas differs from the live version (an amber dot on it says it does), asks one line about
what changed, bumps the version, and has Undo. A draft's first publication turns it on. The work
on the canvas that is not published yet is kept across a reload, apart from the live version, so
"Wijzigingen terugdraaien" in the menu still goes back to it (`workflow-store.ts`, storage v3).

- **Workflow.** Stappen on the left, 240px of `paper`: a search and groups that fold (Triggers 11,
  Insyte, Logica, AI, then each service under its logo), a row per step with a 20px mark, and the
  footnote "Sleep een stap op een + in het canvas, of klik erop om hem achteraan toe te voegen." The
  canvas is `glacier` with the ink dot grid. Steps are 300px cards about 64px tall: a 24px strip with
  the mark and the kind ("Trigger · als" on green, "AI-stap" on `abyss`, the service's name, or
  "Insyte" on `mist`), the title, and one line read off its settings in which a record's field is a
  soft `arc-tint` chip in the sans face ("Aan klant.email"). Every connector carries a +: drop a step
  on it, or click it for a searchable picker. A Ja/nee-splitsing draws its two lanes side by side,
  labelled on their first connector, and merges back into the main line. At the top an `abyss` line
  ("AI · Beschrijf het en Insyte zet de stappen neer") turns a sentence into steps, scripted so the
  same sentence gives the same flow; what was there comes back with Undo. Zoom sits bottom left
  (−, the percentage, +, fit), and the flow opens fitted, never below 75%. Clicking a step opens its
  settings on the right (288px), with fields as chips under the input, the right it uses, and
  Delete with Undo.
- **Test met voorbeeld** walks the flow against a sample record, lighting each step, and answers in
  a dark toast: "Test geslaagd, niets opgeslagen of verstuurd", the sample ("Voorbeeld SO-12224 ·
  Daniel Brown"), a bar that drains while it stays, and Sluiten. A step with an empty required field
  or a right switched off stops the test there; the toast says why and the card stays red until
  the flow is edited. Nothing is logged.
- **Runs.** One `DataTable`: Event (record number and name), Gestart, Duur, Status (dot and word:
  Geslaagd, Wacht op voorstel, Dubbel, overgeslagen, Mislukt) and Versie, with cuts as pills in the
  toolbar (Alle, Mislukt, Wacht, Dubbel). A run opens a 440px drawer: the record as a link, Opnieuw,
  the facts in one `mist` band, the idempotency line ("Sleutel run-8835 en de stap: opnieuw proberen
  doet niets dubbel"), what went wrong on `signal-red-bg` in plain Dutch with the fix, the steps with
  a check, a cross or a clock and their time (the lane not taken marked overgeslagen), and Invoer.
  Runs are made up per flow from its own steps (`runs.ts`), the same ones on every load; Opnieuw adds
  a run with the same key that goes through.
- **Instellingen.** The flow acts as its own service account, never as a person: "Workflow: name",
  when it was made and who owns it, and its audit trail. Rechten lists the rights the steps use,
  each with its id as a soft chip and the steps that need it; a right no step uses is off and
  folded away, and switching off a needed one turns its row red and names the step that will fail
  (and that card says "Recht uit"). Then on or off, the rate limit, who hears about a failure, and
  Delete with Undo.
- **Overzicht.** The flow in one sentence at 17px, the facts in one `mist` band (owner, trigger,
  status, live version, runs), runs per day over the last 30 days with the success rate and the
  hand work saved, said as an estimate with its rule (1,5 minutes per action), every version with
  who published it, when and why (Terugzetten puts it on the canvas, unpublished), and the records
  the flow ran for.

All three design states hold: on the first day every list, tab and the panel's runs have their
own empty state, and a new draft opens on a choice of trigger; the busy week adds thirty flows
with long names and longer run histories. History is every run of every flow in one table; a
failed run is a fact on the row, not a toast.

### Analytics

The numbers first, then what Insyte read in them. Every figure is computed from the store's
history (`lib/analytics/history.ts`, about 8,800 orders since 1 January with their deliveries,
refunds and disputes, and the support tickets) by `lib/analytics/engine.ts`. Two periods are
compared over the same days, and delivery is read by the day a parcel arrived.

- **The numbers are the page's one plate.** `abyss` with the drafting grid, full width of the
  1180px container: "Analytics", then the sentence carrying the periods ("Insyte's reading of _May
  to date_ against _April_", each month an inline chalk picker), then six figures in the display
  face at 40px (revenue, paid orders, on time, refunded, disputes, hours to resolve). Each has a
  change pill on its signal pair (`signal-green-bg` / `signal-red-bg`, with an arrow, so the
  direction never rests on colour) and "from" the value before. Six across on wide screens with
  chalk hairlines between them, three or two below. Each figure opens its finding in the drawer.
- **A sticky sidebar** (232px, from `lg`). "What Insyte found" is an index of every finding with
  number, metric and tone dot; the one being read is marked in `arc-tint` as you scroll, and a click
  scrolls the page's own scroll area there (never the shell), opening the fold if needed. Under it
  are the ask field and the source line.
- **The column** fills the rest. Answers to questions land at its head on `mist` panels. Then
  three findings, each a sentence (17px, held to 62ch) with the chart no other finding uses: revenue
  by day with Insyte's estimate band, parcels per supplier against the promise line, or refunds,
  disputes or weekday support hours with the one at issue lit. Where there is something to do,
  one `arc-tint` line proposes it, with Discard and the action on `abyss`. The other findings fold
  away under "N more findings".
- On narrow screens the sidebar goes and the ask field sits above the findings.

Everything opens the explain drawer (`components/analytics/explain-drawer.tsx`): the figure,
Insyte's reading, what moved it, and every order it counts. Periods and proposal decisions persist
in `stores/analytics-store.ts`.

### Supplier and affiliate

**Chrome.** A supplier or affiliate works for the brand but is not in its workspace
(`lib/persona-chrome.ts`). The top bar shows the brand they work with, read-only ("Leverancier voor
Northwind Clothing Co.", "Partnerprogramma van …"), plus their own search and their own
notifications. It has no store selector, team, proposals count, Vraag Insyte, marketplace or new
menu. The rail has no installed apps and no Beheren. The avatar menu holds only their own settings,
and the area panel only their navigation: no pins, report, day ruler or Aanpassen.

**Supplier orders** (`lib/supplier-work.ts`, `hooks/use-supplier-orders.ts`). A supplier sees only
its own lines. The amount is what Northwind pays for them (cost, not the shelf price), and the
customer is a name and shipping address only. The statuses are its own: Te accepteren, Te
verzenden, Probleem gemeld, Verzonden, Afgesloten. Each open order has a hand-off date ("Overdragen
vóór") with a Te laat or Vandaag badge. The panel cuts by what to do next, with live counts. In bulk
a supplier can accept, ship with tracking per order (typed, or pasted from the carrier export),
download packing slips (no prices) and export. The detail page holds its lines, parcels, what
happened, the address, Northwind's note and a link to ask Northwind about the order. All work lives in
the workspace (`supplierWork`), so the brand sees it too: the order moves to Bij leverancier or
Verzonden with the tracking on its timeline. A reported problem becomes a ticket from
"Leveranciersportaal" and marks the order Vertraagd. Every action has Undo.

**Supplier start.** The brand's plate carries the greeting, one sentence about what is due, and four
figures: Te accepteren, Vandaag overdragen, Te laat (with a red dot when there are any) and on time
over 30 days. Each links to its cut of the orders. "Eerst dit" lists the work in the order it has to
be done (late, today, waiting to be accepted), with Accepteren or Verzenden inline. Beside it are
"Bijna op" (its products that are low or out) and the last word in the shared thread. "Hoe je
levert" shows on time per week from the supplier's own parcels only. A week under 90% turns amber,
and no other supplier's figures appear.

**Supplier products.** Stock, the orders it sits in, lead time and how stock is reported. There are
no shelf prices. On the detail page, stock per variant (with steppers and the old value) and lead
time are a draft until Opslaan. Saving updates the brand's own product page, which also shows the
lead time "volgens" the supplier. Photos and videos dropped here are shared with the brand and
appear on its product page as "Van Allure Fulfillment".

**Supplier chat.** One thread, the brand's own #allure-fulfillment, so a message from either side
shows on both. Order numbers become links to the reader's side of that order. Quick lines are
built from the supplier's actual orders, files can be attached, @ mentions the brand's team, and
opening from an order pre-fills "Over SO-…".

**Supplier settings and statements.** Settings uses the same grey sheet as the brand's: Bedrijfsprofiel
(logo, what it supplies, contact), API-koppeling (the spec's adapters, a webhook, the key, a
connection test) and Meldingen. Afrekeningen gives a month at a time: shipped lines at cost, less
returns that were the supplier's fault, paid on the 15th. The month being processed leads in the
display face, and each month opens line by line with an invoice to download.

**Affiliate start and links.** The affiliate's start mirrors the supplier's: the brand's plate with a
greeting, the discount code to copy and four figures (owed, next payout, conversions and rate over 30
days), then commission per week, the orders that just came in, the tier ladder with the way to the
next tier, and the best links. Links is one table with copy and QR download as row actions; a new
link names its use, picks a destination and a channel, and shows the tagged address and its QR code
before it is made. Each link opens on its figures, its weeks and every order it brought in, with the
QR code to download beside them.

**Affiliate payouts.** Nothing to request: each month's commission is paid on the 15th of the next,
after a 14-day return window, to the method in settings. The running month leads in the display face
with what is approved and what is still inside the window; every month opens on its orders, with
returned ones struck through as reversed, and an overview to download.

### Team, invites and workspaces

**Seats lead.** The team page opens on the plan's seats as one line: a tick per seat (`abyss` for a
person, `arc` for an invitation still open, all amber once full), the count, and what fills it
(`stores/team-store.ts`, `useSeats`). A full plan says "vol" in words, and the page's invite button,
the switcher's invite row and the invite dialog's send all become "Plek bijkopen", which lands on
Billing's seat line. A deactivated person frees their seat; a lapsed invitation does too.

**Inviting.** Addresses are typed or pasted into one well and become chips; a chip that cannot go
(not an address, already in the team, already invited) turns red and says why. The role comes from
Settings → Rollen, with what it may do written under it in the sentences Rollen writes for it, the stores are
picked one by one, and the foot counts the seats after sending. Many at once come from a CSV,
pasted or dropped, and every row is read and shown with what will happen to it before anything goes
out. Pending invitations are their own list, never rows in the people table: what they grant, who
sent them, when they lapse. A lapsed one stays, marked, until it is sent again or revoked. One
shareable link carries one role and an expiry, and can be replaced (the old one dies, with Undo) or
switched off.

**A person.** A row opens the person: who invited them, since when, last active, their role as a
row of chips and their stores. Everything applies at once with Undo; handing the workspace over is
the one thing that asks first, because the owner gives up the right to take it back.

**The landing.** `/invitations/$id` is /login's two halves: the mesh names the workspace being
joined, not Insyte, and the form half always says whose workspace, who asked (with their message),
and the role with what it may do, before the one thing to do. Every state has an id in the persona
chip: new account (account, photo or initials, notifications, then the workspace with a note hanging
from the switcher), existing account, the wrong account signed in, via the link, SSO required, full,
lapsed, revoked, already accepted, supplier and affiliate. The last two make the account here and
carry on into their own onboarding.

**Several workspaces.** The switcher lists every workspace the person is in, and an invitation to
another as an `arc-tint` row with Weigeren and Accepteren. Switching lays a glacier veil over the
console for about three quarters of a second with the new mark and name, and the chrome's name
changes underneath. The demo has one workspace's data, so another workspace shows it under its own
name, and the toast says so. A workspace you do not own can be left, behind an alert dialog; "Nieuwe
werkruimte" runs onboarding's admin steps and adds the result.

**Partners.** Leveranciers carries a Portaal column (Actief, Uitgenodigd, Niet uitgenodigd) and, on
the supplier, what they will see, ticked per part; orders with their own products are always in.
Affiliates is the brand's side of the programme: the people with tier, commission and earned, the
applications as a list with a reading pane (decide from the row, read the pitch, links and history
in the pane), the month's payouts to approve after the return window, and invitations.

### Roles and permissions

**One catalogue.** What anyone may do is `lib/permissions.ts`: fourteen areas (Bestellingen, Klanten,
Producten, Klantenservice, Chargebacks, Leveranciers, Affiliates, Automatiseringen, Analyse, Data en
export, Instellingen, Team en rollen, Facturatie, Koppelingen en API), each held at a level — Geen,
Bekijken, Bewerken, Beheren, and only the levels that mean something there (Analyse is read or
nothing) — plus six special actions that let money or trust leave the building: terugbetalen up to a
limit per order, chargeback-bewijs indienen, exporteren, klanten samenvoegen, automatiseringen
publiceren, facturen bekijken. A special action only counts beside the area level it needs. A role
also names its stores. The ids are the automation scopes' where they overlap (`orders.read`,
`refunds.write`, `disputes.write`), so a key, a flow and a person are described in one vocabulary.
Everything asks `useCan()` (`stores/access-store.ts`), which reads the current person's role.

**Rollen** lists the five roles every workspace has (Eigenaar, locked; Beheerder, Klantenservice,
Financiën, Alleen lezen, which can be changed and put back with Standaard herstellen) and then the
team's own, each row with what it adds up to ("Beheert 2 · bewerkt 3 · ziet 4 · Northwind EU") and
the people who hold it as discs. A role opens on the same page (`?role=`). The matrix is the data
table's grammar on a white card: areas down, levels across, and each row draws the ladder — an
`arc-tint` track from Bekijken up to the chosen step, the step itself the `arc` knob — because a
level includes the ones below it. A column head sets every area to that level. Beside it, on the
right, "Wat deze rol kan" says the role in plain sentences as it is edited, and under that what is
different from the role it was made from (or from the default, for a system role), a quiet arrow
up for more and an amber one for less. Changes are a draft until the unsaved bar keeps them, with
Undo. Creating starts from the nearest role; duplicating opens the copy with its name in a field;
deleting a role someone holds first asks where they go, and the delete has Undo that puts the role
and every person back. Vergelijk rollen sets two to four roles side by side with the level mark
(three small squares, filled to the level) beside each word, and can show only the rows that differ.

**No access.** The rail leaves out a destination the role cannot open — the rail is where you can
go — and the area panel keeps such links, dimmed in `ink-3` with a lock where the count would be, so
it still says what is there. A page the role cannot open renders the no-access state in its place:
the empty-state slot with a lock in it, the area and the permission it takes as one chip, the people
who can grant it by face, Toegang vragen (it lands as a notification for them and as a row on Rollen
with Toekennen and Weigeren) and Link kopiëren, then the places this role can go instead. A control
the role may not use stays where it is, disabled, and its tooltip names the role and what it lacks
("Je rol Klantenservice mag tot €100 per bestelling terugbetalen"); a row action in the selection bar
does the same in the ⌘K menu. A settings page the role may read but not change says "Alleen lezen"
in one `mist` line, and a page that is only a form becomes one disabled fieldset. A role limited to
stores sees only those in the store switcher and the order list.

**Denied in place** (`access/denied.tsx`, `access/denial.ts`). Between the whole page and the single
control sit the parts of a page the role may open: a card, a table's rows, a dialog's body. Each
keeps its frame and title and puts one compact panel where its content would be, on `mist`, left-
aligned like the compact empty state: the locked mark at 48px, a title in the part's own words ("Je
rol kan de uitnodigingslink niet zien"), then one sentence with the permission as a chip on `paper`
("Daarvoor is [Team en rollen · Bewerken] nodig. Je rol Klantenservice heeft dat niet; Beheerder en
Eigenaar hebben het wel."), the people who can grant it as up to three overlapping discs and their
names, Toegang vragen (`abyss`, small) or "Gevraagd zojuist" in the green pill once asked, with Undo,
and a quiet Details that folds out the permission's id (`team.manage`), the refused action and the
time in mono on `paper`, for support. A table keeps its header and toolbar and takes the panel as its
one row, without the `mist`. When the server refuses what the screen offered (the role changed, or
the screen did not know), the refusal is said where it was asked, not in a toast: an amber notice
with the lock, "Dat ging niet door.", the same sentence and chip, then Toegang vragen in `arc-ink`,
Opnieuw proberen and Details, dismissable. The whole page keeps the no-access page above. Nothing
denied ever covers the work, shakes, or turns red.

**Looking through a role.** The persona chip has "Bekijk als rol": the console then is exactly what
someone in that role sees, with one `abyss` line across the top of the work — "Je bekijkt Insyte als
Klantenservice · Terug". It persists per browser until Terug.

### Design states

The persona chip at the foot of the panel also picks the Ontwerpstaat: Eerste dag (every list empty,
the owner alone, one #algemeen channel), Gewone dinsdag (the demo) and Drukke week (hundreds of
orders, 60 open tickets, long Dutch names and product titles). `lib/scenario.ts` is read once at load
from `?scenario=` or the last pick; every mock-data module picks its rows by it, and switching
reloads and clears the workspace's own edits. Sidebar counts are counted from the same rows as the
lists, every table without its own empty state says "Nog geen …", and a screen whose whole point is
comparison (Analyse) shows one empty state instead of a page of zeros. The chip also lists the
signed-out screens: inloggen, registreren, every state of an invitation, inrichten per rol.

Products carry real photographs (Unsplash, `lib/mock-data/product-catalog.ts`) and Dutch titles and
copy; `ProductThumb` shows them in lists and order lines, a gallery on the product page.

### Banded list

`BandedList` / `BandedRow` in `components/settings/setting-card.tsx`: the same bands for lists that
are not tables — stores, integrations, keys, webhooks. A leading mark (a logo tile, a glyph tile), a
title and one line of detail, the status and the row's actions at the end. Nothing is drawn between
two rows.

### Home board

Home is four views of one day under a tighter head. The greeting is one 30px line, "Goedenavond,
Elena.", with the date and a sun or moon glyph beside it in `ink-3`; its words rising in is the
screen's one authored entrance. Under it one sentence: the rolling figure in `arc-ink` Archivo with
"zaken wachten op jou voordat de dag om is", then up to three links for what else needs knowing
(chargebacks waiting on evidence, delayed orders, urgent tickets). On the first day the sentence says
the workspace is ready instead of counting zeros.

Then the view row, as ClickUp's home has it: **Overzicht · Mijn werk · Agenda · Activiteit**, each a
glyph and a label with an `arc` underline that travels between them (`layoutId`), Mijn werk and
Agenda carrying a count of what is due or still ahead today. The view is `?view=` in the address and
the last one read persists, so `/dashboard` reopens where the operator left it. At the right sit the
board's clock — "Bijgewerkt zojuist", counting up from the last read and refreshing on click, with an
Automatisch switch that re-reads the workspace every minute and lets the live orders keep arriving —
then on Overzicht the window and currency as one menu ("30 dagen · EUR"), Aanpassen, and "Kaart
toevoegen" as the view's one `abyss` button (`components/dashboard/toolbar.tsx`).

**Overzicht** is three bands on `glacier`:

- **The pulse** (`pulse.tsx`, `lib/home/pulse.ts`): six figures on one white band, not six tiles —
  omzet, bestellingen, open tickets, in geschil, op tijd geleverd, eerste reactie — each with a 44px
  `arc` contour of its window, the change on the window before as a signal ink on its tint with a sign
  (lower is good for reply time), and a link to the screen that explains it. They read the same
  history Analyse reads, over the board's window ending on its last day, so the two agree by
  construction; open tickets and money in dispute read the live workspace. The window before the
  history began compares nothing and shows no change. Figures count up once on arrival. It lays out
  by container width: two, three or six across.
- **The board**: everything a widget, the queue included, moved, recoloured or removed as before.
  The first screen is the queue beside today's agenda, then the compact cards in ClickUp's density
  (`cards.tsx`, 36–44px rows, the record's glyph and "in Bestellingen", a time at the end):
  **Agenda vandaag** (today on a ruled line, the past in `ink-3`, an `arc` now-line, all-day to-dos
  as `arc-tint` chips), **Vermeldingen en toegewezen** (the notification store's mentions and
  assignments, unread dotted in `arc`, one click to read them all with Undo), **Live bestellingen**
  (orders arriving every 20–30 seconds, simulated in `stores/live-store.ts` so the dated widgets keep
  their window; a new row opens in and its band fades from `arc-tint`, pausable, still under reduced
  motion), **Wat Insyte deed** (on `arc-tint`, the board's one light-blue card: voorstellen getekend,
  antwoorden opgesteld and waiting to be read, runs by the automations, and the time it took off the
  operator as a sum with its rates beside it), **Recent** (seeded on a normal Tuesday, then every
  record opened), **Bestsellers** (photographs, units, revenue and the stock left, amber under 40),
  **Bladwijzers** (pins and favourites with a pin or star mark, removable with Undo, and "Bladwijzer
  toevoegen" searching every record that has a page), **Team nu**, **Bestellingen per land** (ranked
  bars with flags in `arc` at 10%) and **Ongelezen chats**. The earlier business widgets — Omzet,
  stages, chargebacks, supplier delays, tickets, low stock, automations, my tickets, your list — are
  one click away in Kaart toevoegen, with Undo.
- **Overal in Insyte** (`areas.tsx`): nine white tiles, one per area, each a glyph, its name, one
  live number and one state as a signal dot and a word ("5 vertraagd", "2 wachten op bewijs", "1
  vraagt actie"). Three across, nine across on a wide board.

Masonry packs in one to four columns by the board's own width (four from 1540px), and "Volledige
breedte" always spans the row; Grid stays the free 12-column board at 28px rows. Customize, the two
engines, Herstellen with Undo, widget grounds (white, light blue, grey; the queue keeps the Abyss
mesh), `bg-band` rows, the queue's tabs, Filter, plate panel and J K E R D keys are as they were —
the keys only listen on Overzicht. `?row=` opens a queue row's plate on arrival, which is how the
agenda and My work hand a proposal to the queue.

**Mijn werk** (`my-work.tsx`, `lib/home/day.ts`) is ClickUp's My Work: Te laat (heading in
`signal-red`), Vandaag, Volgende, Later (folded), Zonder datum and Klaar vandaag, each a white
section of banded rows. It mixes the operator's own to-dos with the tickets assigned to them, the
queue rows waiting on them, the suppliers to chase, chargeback evidence deadlines and invitations to
follow up — each with its kind's glyph in its signal ink, the record in medium, "in Tickets", and the
day. A tick does the real thing where there is one (a ticket closes, a queue row leaves the queue),
a drawn proposal shows an `arc-tint` star instead of a box and opens its plate, because filing is a
decision; anything can be put off to tomorrow, the day after or next week, with Undo. The quick add
reads the date off the end of the line ("morgen", "vrijdag", "volgende week", "over 3 dagen", "12
nov") and shows it as a chip while typing.

**Agenda** (`agenda.tsx`) puts every dated thing on one clock: the queue's deadlines measured from
now as the queue states them, evidence deadlines, supplier hand-offs, the customer call Sofía flagged,
the automations at their schedule, the morning digest at the hour settings send it, Friday's payout
and Monday's report. A day is a white sheet with hours down the left at 52px, blocks on their signal
tint, side by side when they overlap, and an `arc` now-line with the time; a week is seven columns of
the same items, today in `arc-ink`, automations quiet. The kinds along the top switch off and on.

**Activiteit** (`activity.tsx`, `lib/home/activity.ts`) is the workspace's feed: notifications, the
team's own work, what Insyte drafted, what services and suppliers did, and the live orders, grouped by
the hour today and by day before, in white sections with the notification lead (person disc with
presence, service logo, Insyte's star on `abyss`). Filter by who and by source; more loads in sixties.

**The first day** (`first-run.tsx`) is not a board of zeros. Overzicht becomes a setup page: the
setup plate (see Empty states, First-day home); "Je werkruimte inrichten" with the onboarding
checklist, the next task as the one `abyss` button; the queue's own mesh ground, empty, saying what
will arrive there and the mechanism in three lines; "Je eerste week" as four links; the area tiles;
and "Toch het bord tonen" for the operator who wants the board.

The layout, tones, grid boxes, view, auto refresh, agenda span, to-dos with their days, snoozes and
ticks persist per browser in `stores/home-store.ts`; version 6 puts every board on the new first
screen once and dates the seeded to-dos from today. Pins, favourites and Recent persist in
`stores/pins-store.ts` (version 4 seeds Recent). The workspace store still resets on every load.

### Onboarding

Onboarding has the same two halves as `/login`. The form half uses the grey ground, a 400px column, a
24px title over one `ink-2` line, and white fields; `.onboarding-form` makes the shared `field` paper.
Steps slide in the direction of travel (forward from the right, Back from the left). The progress is
one segment per step plus "Step 4 of 9". A primary action shows a spinner and the verb in progress
("Creating your workspace") for at least 550ms, and an error shakes once. Shopify connect and the
first sync are simulated, with the same steps as the real flow. The brand half is /login's, with
the 56px headline and one sentence changing at every step (`brand-copy.ts`): the words rise in with a
light blur, one phrase in `arc-ink`, and the opening line returns as the closing one.

### Area panel shortcuts and Customize

The area panel has three sections, in an order the operator chooses: Navigation (the area's pages),
Weekly report, and Shortcuts. **Customize**, at the foot of the panel as in ClickUp, opens a dialog
with four tabs: Navigation (drag the rail's destinations into order, hide one with the eye),
Home (Masonry or Grid, and which widgets are on the board), Sections (drag the panel's sections,
hide or show them, and pick the shortcut style from three drawn previews), and Density (compact or
comfortable rows, set as `data-density` on `html` and read by `.density-cell` in tables and
`.density-row` in the panel). Changes apply as they are made. Rows in the dialog are `mist` wells;
choices are `mist` cards with an `arc` ring when chosen.

The three shortcut styles (`components/app-shell/panel-shortcuts.tsx`):

- **Today ruler**, the default and the one that is Insyte's own: pinned records and pinned views
  as a wrap of small white square chips, then "Today" as a ruled line. Each thing with a time hangs
  a tick from it with the time beside it: Monday's report (an `arc` tick), what is due before the
  day ends from the queue (red or amber ticks), and records opened today (an `ink-4` tick). An `arc`
  "now" rule, drawn in from the left, splits the past (in `ink-3`) from what is ahead.
- **Drawer**: the report as one line with an `arc` square and Read, and one list whose heading is
  its switch: Pinned, Views, Recent.
- **Classic**: the report as a quiet white card, Pinned, and a Favourites / Recent switch.

Recent is real: every record opened goes to the head of it with its time. Pins, favourites and the
dismissed report persist in `stores/pins-store.ts`; the panel's arrangement in
`stores/panel-store.ts`.

### Ask Insyte

A white drawer (460px) and a full page (`/ask`) on one shared thread (`stores/ask-store.ts`). The
drawer's head is a 56px `abyss` band: the star mark, "Vraag Insyte" over "Werkt binnen jouw regels.", New
conversation, Open the full page, Close. The page has conversations on a `mist` rail at the left, the
thread at a 680px measure in the middle, and on `glacier` at the right what the latest answer read
and the tools it ran, so every figure can be traced.

The agent parts (`components/ask/`) follow beautifului.dev's agent kit, drawn in this system:

- **Turn sequence.** The star mark breathes in `arc` while working. A thinking trace hangs its steps
  from a ruled hairline, each starting on a one-quarter `arc` spinner and settling to a check. Its
  label shimmers ("Thinking") and settles to "Thought for 2 s", and the trace collapses but can be
  reopened. The answer then streams two words at a time, the newest resolving out of a 4px blur,
  with an `arc` caret held while it writes. Only once it settles do the tool chips, the proposal, the
  sources and the follow-ups rise in. A finished turn never replays.
- **Record chips.** Records named in an answer are `arc-tint` chips with their kind's glyph, and they
  open the record.
- **The proposal is a plate:** `abyss` with the drafting grid, wiped in from the right; title, one
  paragraph, confidence measured on a dimension line with end ticks and a word (High, Good, Fair), the
  reason in `mesh-ink-3`, then File (paper on Abyss, named for what it does), Edit (puts it in the
  composer) and Discard. Filing does the real thing: it files the queue row, opens the supplier
  ticket, or sends the reply, with Undo. A decided plate is stamped Filed or Discarded and desaturates.
- **Composer.** A white well that grows with its text: `@` lists records (delayed orders first),
  `/` lists commands, both worked with the arrows and Enter. A toolbar line says what Insyte can see
  from the current page and that it works within the operator's rules ("werkt binnen jouw regels").

Answers are scripted from the live workspace (`lib/ask/scripts.ts`) while the model is mocked, and
say so when a question cannot be tied to a record.

**The agent acts within the operator's rules** (since 2026-11-01, [ADR-0027](docs/adr/0027-the-ai-acts-within-operator-set-autonomy.md);
until then this section said nothing changes until a person files). The plate above is the _Eerst
vragen_ experience and stays. What the agent does on its own (_Zelf doen_) is drawn as a log row,
never as a plate: the time, the action in a sentence, the record, the setting it ran under as a
`mist` tag, then what it read as check chips, a one-line reason, and an outlined Ongedaan maken while
the server's window is open. Locked actions (an evidence submission) show a lock and "Vraagt altijd"
instead of the three-way setting. In the reference demo the settings, the log and the agent's
touchpoints are drawn and working (below, _Insyte AI_); in the product they are still planned
(`docs/PLAN.md` Phase 4).

### Insyte AI: autonomy, limits and the log

One policy every touchpoint asks (`lib/autonomy.ts`, `stores/autonomy-store.ts`): the catalogue of
eighteen agent actions in six groups, a level per action, and `decide(action)` returning run,
propose or refuse. Locked actions (refund, cancel after payment, submit evidence, accept a dispute)
never run, whatever is stored; a spent workspace budget turns every run into a proposal. The demo
reads it live, so a row flipped on Zelfstandigheid flips a touchpoint between a plate and a log row
(`AgentSuggestion`, `ask/agent-parts.tsx`): at Zelf doen the agent does it once and shows its row;
at Eerst vragen it draws the `ProposalPlate`, with "Waarom vraagt Insyte dit?" under it linking to
the row that makes it ask; at Nooit nothing is drawn.

- **Zelfstandigheid** (`/settings/ai/autonomy`, `ai/autonomy-matrix.tsx`). The roles matrix's
  grammar with three levels across — Zelf doen, Eerst vragen, Nooit — and the chosen one the `arc`
  knob. It is not a ladder, so there is no track. Groups are `mist` rows inside the white card. A
  locked row has a lock in the Zelf doen cell and says why under its label ("Vraagt altijd. Kan bij
  Klarna, Stripe en PayPal niet worden teruggedraaid."). Beside it "Wat Insyte zelf mag" in
  sentences and "Anders dan de standaard" with the roles' arrows; below it what no setting reaches
  and the history of versions. A draft until the unsaved bar keeps it (a new version, with Undo);
  Standaard herstellen with Undo. `?actie=` scrolls to a row and washes it `arc-tint` for two
  seconds. Below `sm` each row becomes a segmented well. Changing it needs Instellingen · Beheren
  and the special _Zelfstandigheid van Insyte instellen_ (`ai.autonomy`); everyone else reads it
  under the Alleen lezen line.
- **Limieten** (`/settings/ai/limits`). The month's budget as a `FieldRow` euro well, the spend as a
  `BudgetBar` (`ai/budget-bar.tsx`: a 6px track, `arc` fill, amber from 80%, red at 100%, the figure
  beside it in the same signal ink), what the background agent spent, then the people as a
  `BandedList` with their bar and their own limit, then what happens at 100% as plain sentences
  (stated, not settable). At 80% a notification goes to the person and the owner once a month
  (`insyte.budget`). The avatar menu carries the month's spend as one line that opens the page.
- **The log** (`/ask/activity`, "Wat Insyte deed"). The house `DataTable`: time, the star and the
  sentence with the setting as a `mist` tag, the record as an `arc-tint` chip, the status (Gedaan;
  Wordt verstuurd… in amber while a send waits out its window; Ongedaan gemaakt door …; Mislukt in
  red with its glyph) and the outlined Ongedaan maken with the time left ("nog 4 min"). After the
  window: "Niet meer terug te draaien" and the compensation by hand as a link ("Toewijzing
  weghalen"), which is the person's own action with its own Undo. Its panel (Vraag Insyte) counts
  Kan nog terug, Zelf gedaan, Ongedaan gemaakt and Mislukt live. A row opens a 520px drawer on the
  delivery drawer's grammar: the facts in one band, before and after (`mist` beside `arc-tint`),
  Waarom with the sources it read, and the policy, model and prompt versions small at the foot.
- **On records.** A ticket and an order show "Wat Insyte hier deed" as compact log rows
  (`RecordAgentRows`); Start's "Wat Insyte deed" card leads with the actions it took today and lists
  the last three with their Undo; the Activiteit view lists every row with Insyte's star under the
  Insyte source. The agent never toasts; a failed action is its one notification.

The undo window for an agent action is five minutes, the same server window as a person's
(ADR-0023), shown in the log rather than in a toast. Seeded rows are rebuilt relative to now on every
load; what persists (`insyte:agent-log:v1`) is what happened to them and the rows the session added,
and every effect is idempotent and laid onto the workspace once at load.

### Insyte AI: the knowledge base

Instellingen → Insyte AI → Kennisbank (`ai/knowledge-screen.tsx`, `lib/knowledge.ts`). When the agent
handed a question over because nothing covered it, it waits at the head as _Nog niet beantwoord_: the
question in quotes, who asked and where, a link to the conversation, Toevoegen aan… (pick the chapter;
it opens with the question as a new heading) and dismiss with Undo. Under it the chapters as a
`BandedList`: title, who it is for and who edited it when, the status as a pill (Gepubliceerd quiet,
Concept in `arc-tint`, Wijzigingen niet gepubliceerd in amber), the length as a thin bar against the
40.000-teken limit (amber past 90%) with the count, and how often it was cited this week. The first
day offers five suggested chapters as one-click drafts.

A chapter opens on the same sheet: the title in place, the audience as a segmented well (Klantagent,
Vraag Insyte, Beide), the status and which version the agents read; then the Markdown well — a `mist`
toolbar with Kop, Lijst and Voorbeeld (a plain reading of `##`, lists and paragraphs), the text, and a
`mist` foot with the count bar (red over the limit, which blocks saving), Opslaan als concept and
Publiceren. Publishing answers the gap being written. Versies opens a 560px drawer: every version with
who and when, the published one marked, and the chosen one as a line diff against the one before it
(added on `arc-tint`, removed struck on the red tint), with Terugzetten, which publishes it again as a
new version, with Undo. Insyte may draft a first text for a gap into the well; publishing is always a
person's (design question 6). Reading needs Instellingen · Bekijken, changing Beheren.

### Insyte AI: the customer agent

Instellingen → Insyte AI → Klantagent (`ai/customer-agent-screen.tsx`, `lib/customer-agent.ts`). Off,
it is a first-day column: what it does, what it never does, Aanzetten voor de websitechat. On, the
page leads with a notice when it matters — `arc-tint` outside opening hours saying what happens
("Insyte neemt nieuwe vragen aan en zegt dat een collega morgen vanaf 9:00 antwoordt"), amber when the
budget is spent ("Alle nieuwe gesprekken gaan naar het team") — then today's figures as one band of
five, then the sections: Kanalen (per channel Zelf antwoorden · Alleen concepten · Uit; Zelf antwoorden
is the website chat's alone in this phase, the others carry a dashed _Binnenkort_ chip), Openingstijden
(seven rows, a switch and from–to), what happens outside them, Overdragen wanneer (switches, topics
as removable chips, after N messages), Toon and the handover message with its `{wanneer}`, and Wat
Insyte nooit doet as locked rows into Zelfstandigheid. Beside it (a full-height sheet on a phone)
Proberen: a drawing of the shopper's widget and a chat that answers from the published chapters,
citing "Uit Kennisbank: … · versie 4", and hands money and "a person, please" over in the operator's
words, labelled "Test · er wordt niets verstuurd". Changing it takes Instellingen · Beheren and
_Zelfstandigheid van Insyte instellen_.

In the inbox the agent's work is its own group, _Insyte_ — Overgedragen, Door Insyte afgehandeld —
counted live. A handled conversation opens with one `mist` line and its summary; a handover with an
`arc-tint` band: why, the summary, Overnemen (assigns you; Insyte stays quiet) and Teruggeven aan
Insyte (the composer then says Insyte is answering). Where the shopper asked for money, the agent's
`RefundOrder` is a plate under the band — locked, "Vraagt altijd" — and filing it asks again in an
alert dialog with the amount, then leaves its log row. Start gains Klantagent vandaag and Retouren in
Kaart toevoegen.

### Courses

`/courses` (PLAN 39), how the team learns the shop's way of working, in chapters, modules and
courses (`lib/courses.ts`, `stores/courses-store.ts`).

- **The catalogue** is a chapter heading (`lg`) per topic, a module label in `ink-3` under it,
  and the module's courses as banded rows inside one paper frame: a drag handle that appears on
  hover (motion's `Reorder`, handle only, so a click still opens the row), the course's badge, the
  title with blocks, minutes and audience, its status pill, how many of the people it reaches are
  done, and the deadline (signal red once passed). An empty module is a `hatch` strip that adds a
  course. From `xl` a 300px aside carries the two things that need the owner: open questions and
  who is near or past a deadline, each with a reminder.
- **The badge** is a small plate: `abyss`, the drafting grid at a pitch the size can carry, a tick
  at each corner, the glyph in chalk. Not earned, it is a dashed slot in `ink-4`. On a plate it is
  lifted onto `abyss-2` with a chalk edge.
- **The editor** is one document, not a wizard: the title and one sentence, where it sits, the
  blocks in reading order (text, video, image, quiz question; each a paper panel with a `mist` head),
  and the settings as label-beside-control rows. The left column is the outline (it follows the
  scroll) and "Klaar om te publiceren", the list of what still stands between the draft and
  publishing it. Changes raise the house's unsaved bar; Publiceren is the header's one primary.
  "Vragen laten voorstellen" puts Insyte's quiz questions on a plate, drawn from sentences in the
  text with a figure in them; each is added or thrown away, never written in by itself.
- **The player** reads one block at a time in a 680px column beside the outline (done ticks,
  locks in a fixed order). A quiz question is checked, not just picked: the right answer goes
  `signal-green-bg` with the word Goed, a wrong pick `signal-red-bg` with Niet goed, then the
  explanation. Answers to earlier questions about a block stay under it.
- **The end is a plate**: the badge, Gehaald or the pass mark missed, the score in the figure
  face, and a title block at the foot with course, name, date, score and number, the way a
  drawing carries its identity.
- **Voortgang** is a matrix of people against live courses: a status pill per cell, `hatch` where
  the course is not for that person, a popover with blocks, attempts and score, Herinneren and
  Opnieuw laten doen (with Undo). Suppliers a course is open to get a row beside the team; they
  take it in their own portal under Training.

### Rekenbladen

`/sheets` (PLAN 40): the operator's own calculations on Insyte's figures. The engine is
`lib/sheets.ts` (tested in `test/sheets.test.ts`): Dutch formulas (`=SOM(B2:B6)`, `;` between
arguments, a decimal comma) with the English names as aliases, references across tabs, and
`=INSYTE("omzet"; "2026-04")`, which reads the same figure Analyse shows. Costs and ad spend come
from `lib/costs.ts`.

- **Errors say why.** An error is a value that carries a sentence. The selected cell's error sits
  under the formula bar on `signal-red-bg`: the code in signal red, then what went wrong and where
  to look.
- **The hub** is a templates row (each drawn as the shape of the sheet, label bars and figure bars,
  with an Arc square on every cell that reads Insyte) and then the sheets as cards whose preview is
  their own first cells, computed. Linked sheets carry an `arc-tint` Insyte chip.
- **The editor** is one paper frame: a `mist` toolbar (undo, redo, formats, bold, Som, and Koppelen
  aan Insyte on `arc-tint`), the formula bar with the name box, the grid, and a `mist` foot with the
  tabs and the selection's Som, Gemiddelde and Aantal. Heads turn `arc-tint` with `arc-ink` for the
  selected range; the range is an `arc-tint` wash; the active cell is a full `arc-tint` with a 2px
  Arc rule along its foot, the one place the field gets a line, because a spreadsheet's active cell
  must be found at a glance. A cell that reads Insyte has a 4px Arc square in its corner.
- **The keyboard is a spreadsheet's**: arrows, Shift to extend, Enter and F2 to edit, typing to
  replace, Tab across, ⌘C ⌘X ⌘V (formulas shift with the paste), ⌘D fills down, ⌘B, ⌘Z and ⇧⌘Z.
  While a formula is being written, clicking a cell or dragging a range writes its address in.
- **Koppelen aan Insyte** puts a figure in every selected cell, for one month or, when column A
  holds month names, for "the month in column A" (`$A2`), so the formula fills down.

### Live

`/live` (PLAN 41), reached from the Dashboard panel: who is on the store right now, simulated in
`stores/visitors-store.ts` like the home's order ticker. The page's one plate holds the funnel in
the plate's own figures (op de winkel → met iets in het mandje → rekent af, with the rate between
each step, then gekocht in the last ten minutes and omzet vandaag) and the world as a dot matrix:
land in chalk at 17%, sampled from Natural Earth per view (`lib/world-dots.ts`: the world at 2,5°,
Europe at 0,625°, North America at 1,25°) so each view stays a crisp field of square dots. A visitor
is a square mark coloured by stage (chalk, `sky`, `powder`, paper for a sale; the legend in the
plate's foot carries the words) that rings once with a widening square when it arrives or moves a
step (`.live-ping`, off under reduced motion); hovering one shows city, stage, page, source and
time on the store. Under the plate: "Wat er gebeurt" as banded sentences with sales on
`signal-green-bg`, and three ranked lists with meters — what they look at, where they are, where
they came from.

### Kosten

`/costs` (PLAN 42), linked from Analyse's plate and the Rekenbladen panel: one sentence that says
what the latest month left over and how that compares, then one table of cost lines against the
months, grouped by kind (deel van de omzet, per bestelling, vast per maand, advertenties). Fixed
amounts and ad spend are typed in their cell (a quiet well on hover, paper with an Arc edge while
typing, Dutch numbers, Enter keeps and Esc leaves it); a connected ad account fills its own row in
`ink-2` with its logo and "Uit Meta Ads", and a typed amount overrides it with a way back in the
row's menu. The foot is a `mist` band: omzet, alle kosten, nettowinst (signal red if negative) and
marge. These are the figures `INSYTE("nettowinst")` and Analyse read.

### Settings depth

Nine pages added in PLAN 43, on the settings sheet and its rules (`settings/depth/`, state in
`stores/settings-depth-store.ts`). Each edits a draft behind the house's unsaved bar, and saving
writes what changed — field, what it was, what it became — into the **Logboek**, which shows it as
a struck `signal-red-bg` value, an arrow and a `signal-green-bg` value, filterable by period,
person and page, and exportable.

- **Verzending**: the carrier's status beside the sentence the customer reads, with where it shows;
  a sticky preview beside the table draws the order status page and the customer agent's answer for
  the row being edited.
- **Sjablonen**: the fixed links reply templates use, each with its variable and a preview mail; an
  empty link drops its sentence rather than leaving a hole.
- **Huisstijl**: logo, brand colour (checked against white as it is set, in words and ratio),
  mail font, sender, and the chat button's corner, with a live mail and website preview.
- **E-mail en domein**: an amber or green line that says plainly where sending stands, the four DNS
  records with copy buttons and their state, a recheck, and instructions to copy for whoever runs
  the domain.
- **Btw**: per store currency, VAT on shipping and on refunds; the OSS registration.
- **Gegevens en privacy**: a retention period per kind of data, "Nu tellen" before anything is
  removed, and only then a destructive "Verwijderen aanzetten" behind an alert dialog.
- **Prullenbak**: 30 days to restore, a meter per item that turns red in the last three, restore
  with Undo, permanent removal behind a confirm.
- **Sneltoetsen**: G then a key goes to an area (`shell/goto-keys.ts`, never while typing); each key
  is changed by clicking it and pressing the new one, and a key in use says where it already goes.
  The shortcuts dialog lists the same keys.

### Arriving (loading, ADR-0028)

What the operator sees while data is on its way. Five moments, in order, each with one rule.

- **Cold start.** The Drift mark on glacier, at the exact centre; its back squares fold onto the front one
  and drift out again. The workspace name sits under it in `ink-3`. When the screen is ready the squares
  settle into one, which shows the destination's glyph in chalk, and the sheet fades off the shell (300ms).
  Once per page load, never on navigation.
- **First visit to a screen.** That screen's kind of skeleton (fifteen kinds: table, board, split, channel,
  dashboard, overview, analytics, settings, document, canvas, cards, conversation, list, grid, map), with
  the arc navigation line (2px, top of the work column) running. A second visit is instant.
- **A part that is late.** A dashboard card, the KPI strip or a record's body streams in under a frame that
  is already drawn (the card's glyph and name, the record's header). Its box is reserved from the start, so
  the board does not repack and the dialog opens at its final size.
- **What only the browser draws.** A chart shows its gridlines, the live map its land without anyone on it
  ("Verbinden"), the sheet its grid with the letters and row numbers before the values.
- **Arrival.** Content settles in once: an opacity fade and a 2px rise, 260ms, `ease-out-quart`.

The bone:

- `bone` is a tinted well (`ink` at 6.5%) at the height of what it stands for: 9px, fully rounded, for a
  line of 14px text; the pill's own 20px for a status; the control's own height for a button or a field.
- On a plate it is `bone-plate`, chalk on abyss, with the plate's scanning rule still running.
- Every bone on the page shares one light band. The gradient is fixed to the viewport, so it is a single
  scan crossing the whole drawing, never forty shimmers out of step. It rests between passes (2.1s cycle).
- Line widths come from one run of lengths, so a column of bones reads as text, not as bars.
- What the product knows without the server is drawn as itself, never boned: page names, board columns,
  a sheet's letters, a greeting's place.
- A skeleton is one `role="status"` with a Dutch label ("Bestellingen laden…"); its bones are hidden from
  assistive tech.
- Under reduced motion the band and the settle are off. The bones stay, and so do the waits.
- Never a spinner on a page. Never a grey card with three grey lines. Never a skeleton for something that
  is already in the cache.

### Plate (signature component)

A proposal drawn before it is a record: `abyss` ground, `mesh-ink` line work, the 32px drafting grid,
dimension and leader lines in which every mark measures something, and the identity of the drawing —
number, state, confidence — in a **title block at the foot**, where a technical drawing puts it. One
faint rule travels down it (`plate-scan`, 6s, the mesh curve), which is the only ambient motion in
the product. Entry is two authored moments in order on one curve: `unroll` wipes the ground in from
the right (240ms, out-expo), then `draw` masks the drawing from the top down (420ms) so the line
appears ruled rather than faded up.

### Empty states

Sixteen hand-drawn marks (`EmptyKind`: orders, customers, products, automations, chargebacks,
tickets, people, notifications, locked, inbox, chats, suppliers, analytics, tasks, calendar,
activity), one grammar: a dashed slot where the records would be, the record's own glyph inside it in
strokes, and a single `arc` accent. The caller names a `kind`, not an icon, so the sixteen read as a
set. The motion is the slot — a slow march around the dashed edge — never the
glyph pulsing, and `useReducedMotion` stops all of it while leaving the drawing fully legible. A
compact variant sits inside a panel on `mist`, left-aligned.

**First-day pages** (`empty-page.tsx`, `area-empty.tsx`). An area that has never held a record is
not a table with a hole in it: the table, its toolbar and the closing spotlight all give way to one
left-aligned column (680px, set high) read top to bottom. The hatch band on `mist`, fading to the
right, with the area's mark on a paper tile at its start, the count it would show at its end, and
one Arc point travelling the hatch every few seconds (dropped under reduced motion). Then a plain
title ("Nog geen bestellingen"), two sentences on what arrives and from where, one primary
(`abyss`) and one quiet (`ink/6`) button, and "Om mee te beginnen": the list's own closing rows,
as hairline rows with the travelling arrow. No eyebrow above the title: the count lives in the band.
A filter that matches nothing keeps the compact `EmptyState` inside the table. The supplier and
affiliate starts use the same column under their plate, which drops its zero figures.

**The first-day home** opens on a plate: the setup count, "Nog 5 stappen, dan draait Insyte voor
…", one sentence on the next step, "Verder met inrichten" and "Bekijk een gewone dinsdag", and the
steps drawn as the Drift mark's offset squares filling in (done solid, next outlined and breathing,
the rest dashed). Below it the checklist, the empty queue on its mesh ground, Je eerste week, the
area tiles and the closing sections. Mijn werk, Agenda and Activiteit use the first-day page on a
paper panel, like the lists.

### Closing sections

A page can end the way a website section does (`components/marketing-sections/`): after its own
content, separated by space, never above or inside the work. Two forms, one family.

- **Link index** (`link-index.tsx`): a page's closing index is one brand plate (abyss, no scan
  line) with its heading and the destinations in a grid of three, each a compact link at reading
  size: a `base` medium label in `mesh-ink`, one `sm` line in `mesh-ink-2`, and the travelling arrow
  (it leaves right and a second arrives from the left; up and right for goinsyte.com, which opens a
  new tab; under reduced motion it ends where it began). Hover lifts the link to `mesh-ink/8`. An
  earlier version set the labels at 40px on the bare canvas; it read as a website shouting inside a
  tool. Under a list the `md` form is plain rows a step quieter than the table: `md` labels in
  `ink-2`, an `ink-3` line, `arc-tint` on hover.
- **Spotlight** (`spotlight.tsx`): headline, two sentences and one arrow on one side, a miniature of
  the destination on the other, sides alternating. The miniature (`previews.tsx`) is drawn with the
  destination's own parts (node cards with `StepTile`, the portal's status chips and `DueCell`,
  `QrCode`, `BrandLogo`) and the workspace's own records; with no records it keeps the chrome and
  draws `ink/8` bars, never an invented example. It is `inert` and `aria-hidden`, so the section has
  one thing to press, and its parts rise in once when scrolled to. `paper` on `glacier`, `grey`
  (`glacier`) on a paper page, and `plate` only for the one that sells a proposal (chargeback
  evidence). The arrow is a text action, so an empty state's own button stays the primary.

Where (`closings.tsx`): Start's Overzicht ends on the flow the library's
Recommended list ranks first and the index Meer in Insyte,
which holds **Nieuw in Insyte**, a dialog of dated entries that each open the feature they name.
Every list ends on two or three rows to what does more with its records, phrased from them ("5
bestellingen staan op Vertraagd") when they say something; on the first day the rows move into the
list's first-day page as its places to start. The supplier and affiliate starts end on their own:
API-koppeling, Afrekeningen and Chat met Northwind; links with their QR code, Materiaal and the next
tier. Copy claims nothing the product does not do.

### Landing page

"Abyss-blue hero, product first" (`packages/ui/src/marketing/`, its stylesheet `landing.css`, served
by `apps/marketing` and mirrored by the reference at `/site`), settled with the owner on 28 October 2026 and
extended on 31 October 2026 (the live console, the overview stage, how it works, the three portals,
pricing with its comparison, the full-width bar and banner, the closing band). The same De
Blauwdruk, set as a website: the product leads, drawn faithfully and moving, on flat brand grounds.
It reads the daylight token map only (`light` on `<html>`). There is no black, no glow and no
off-palette colour — every dark field is `abyss`/`abyss-2`, every ink on it is the mesh ramp, no pink
or green appears as a ground or on text, status inside a render is the brand blue and the ink ramp —
and the only other colours on the page are the vendors' own marks and the product photographs.

**Order and grounds.** Banner on `arc-tint` → the bar on `paper` → the rounded `abyss` hero wrapper
(16px radius, inset 8–12px) with the live console crossing out of it → the overview stage (an
`abyss` panel under a two-tone heading on `paper`) → the statement and how it works on `paper` → the
three portals on `paper` → bento on `glacier` → the reply tour on `paper` → the automation builder
tour on `glacier` → the integrations band in `abyss` (marks, then the six team controls) → pricing
on `paper` → questions on `glacier` → the closing band, an `abyss` wrapper holding the close and the
footer.

**The construction frame.** Every section draws it (`frame.tsx`): two dashed rails at the content
column's edges (5 on 5, ink at 14% on light grounds, chalk at 18% on abyss) that read as one line
down the page, a dashed rule across the full width at each section's top, and a small cross where
they meet; hidden on a phone. Inside sections the same dashed rule (`dash-x`, `dash-y` and their
`-chalk` pair) divides cells: how it works, the six controls, the pricing frame. The abyss grounds
carry the brand's own patterns from `pattern` in `tokens.ts` — the 32px drafting grid
(`drafting-chalk`) and the Drift hatch (`hatch-chalk`) — in chalk at a few percent, faded with a
mask. The one real shadow is `window-lift`, on surfaces that float.

**Nothing solid white on abyss.** On an `abyss` ground, cards, chips, badges, tabs and sheets are
translucent chalk: `mesh-ink` at 6–16% with the `chalk-line` inset hairline, chalk text, logos on
their own small tiles. A paper card on blue is a brand no-go (owner, 31 October 2026). The exceptions
are the product itself — a console window or miniature is drawn as the product is, light — and the
one primary action button on a dark wrapper.

**The mark.** The mark as the product draws it: `InsyteMark` (`MarkDrift`) at `tone="white"`, the
mark of the console's rail, sign-in and onboarding, served as the file rendered from that component
(`apps/marketing/public/brand/`, `BRON.md` there). On abyss it stands alone; on paper it sits on an
`abyss` tile, as on the console's rail. Beside it "insyte" in General Sans medium, lower case, as the
console's sign-in lockup. Never redrawn; the brand-tone variant with the visible bars is not used.

**Banner and bar** (`nav.tsx`). A full-width announcement banner on `arc-tint`
above everything: the Sparkles glyph, "Insyte is in private bèta voor Nederlandse dropshipstores."
and a paper chip "Toegang aanvragen →" (on a phone "Insyte is in private bèta." and "Aanvragen", one
line). Its ✕ ("Melding sluiten") folds it away and remembers that in `localStorage`
(`insyte:banner:beta`); it is always rendered by the server and the first client frame, so a first
visit never shifts. Its "Toegang aanvragen" is a plain `arc-ink` text link with an arrow that
nudges, never a chip. Under it the bar: full width on `paper`, 72px, flat, aligned to the hero
wrapper's edges (the same 8/12px inset, 24px inside it) — the wordmark, then Product ▾, Oplossingen ▾,
Koppelingen ▾, Beveiliging and Prijzen, spread left-aligned; at the right a quiet Vragen, "Inloggen ▾"
as a plain text item (the three portals: console, leveranciersportaal, partnerportaal) and the solid
abyss "Toegang aanvragen". Only the bar is sticky: once it holds the top it tightens to 64px and
takes a hairline and a soft shadow. Product, Oplossingen and Koppelingen are Harvey-style mega menus:
one full-width paper sheet flush under the bar with a hairline top, its content on the bar's
container. Product is two columns of titles with two-line descriptions (no icons) and a featured
abyss tile with the real Allure proposal; Oplossingen is columns split by full-height hairlines (Per
rol, Per werk, Eigen portalen) and a tile where Shopify, Gmail, Klarna and PostNL each draw a line
to the mark; Koppelingen is the vendors' marks by category. An abyss underline slides between the
open triggers at the bar's foot (`layoutId`); the sheet's height morphs between menus and its
content cross-fades in the direction of travel; hover opens after 120ms and closes after 200ms; a highlight slides between the items (`layoutId`), chevrons
turn, Escape returns focus to the trigger. Below `lg`: the wordmark, the primary action and a menu
button that opens a sheet with the same groups. The pill shape is gone; every control keeps the
control radius.

**Type.** General Sans throughout. Two display steps sit above the product's eleven, for headlines
only: `display-sm` 48/50 −0.036em and `display` 72/72 −0.04em. Archivo (`figure`) appears only on
figures. No eyebrows or kickers. A section headline may be two-tone: the first line in `ink`, the
second in `ink-3` (`mesh-ink` / `mesh-ink-2` on abyss), as one `h2`. Key words in a sentence may only
take `arc-ink`. A caption starts with its title in `ink` and runs on in `ink-3`.

**Sections.**

- **Hero.** Headline in one line in `mesh-ink`, one sentence. The primary action is "Toegang
  aanvragen met Google" (paper on abyss, Google's own G): Google sign-in is offered on the access
  request itself, so it opens that request and never creates an account on its own. Inloggen beside
  it. Under them "Of vraag aan met je werkmail · Geen creditcard nodig" (the onboarding's trial step
  says no card is needed), then three facts: the Shopify mark with "Koppelt met je Shopify-winkels",
  In het Nederlands, Private bèta op uitnodiging.
- **The live console** (`console-window.tsx`, records in `demo-data.ts`). The /dashboard of the
  settled persona, drawn at the console's own type size: the rail with Shopify, Gmail, Klarna and
  Slack pinned at its foot and Elena's disc, the area panel with icons, counts, pinned records and
  today's timeline, the top bar with the team's discs and presence, the greeting, five figures with
  sparklines, the queue plate (each row leads with the record's own logo, product photograph, person
  or house glyph; a two-line title so nothing truncates; store with the Shopify mark), today's agenda
  with the now line, and the live order ticker with product photographs. Below 1280 it is 1180px wide
  and zoomed to the column; from 1280 it takes the wrapper's width (32px gutter, at most 1640px) at
  the 1440 type size, and the extra room goes to the columns. It runs one authored loop while it is
  on screen and the tab is visible: a case arrives at the top of the queue (the count ticks, an order
  lands on the ticker and the orders figure rolls), "Voorstel klaar" appears, the pointer selects the
  row, Insyte's proposal opens over the queue with its sources, Versturen is pressed, the row leaves
  and a toast says what happened with Ongedaan maken. Three cases take turns, each one Insyte
  can take back (a chargeback submission cannot, so it is not in the loop). The server, reduced
  motion and a crawler get one still frame: the first case waiting with its proposal ready.
- **Overview stage** (`stage.tsx`, Calendly's pinned stage). A two-tone heading, then from 768px a
  600svh runway with a sticky stage (`top` under the bar, `100svh` minus the bar) that the page's
  scroll scrubs. Enter, the first 12%: the abyss panel opens from an inset card (14% a side and 7%
  top and bottom, 56px corner) to the wrapper's edges and 16px, on `cubicBezier(0.65, 0, 0.35, 1)`
  (clip-path only, `will-change` while pinned). The middle is split evenly over five tabs — Shopify
  (its mark), Automatiseringen, Bestellingen, Klantenservice, Chargebacks: crossing a boundary moves
  the translucent highlight (`layoutId`), the active tab's chalk tick fills with its segment, the
  card's text cross-fades in 250ms while the card stays put, the ground cross-fades between five
  abyss/abyss-2 tones with a faint `arc` wash at a different corner, and the miniature on the
  inset `glacier` screen plays its sequence scrubbed by the segment — the stores connect one by one
  and the counts run up; the chargeback template's steps light in order and its switch turns on;
  two late orders are flagged and the Allure proposal rises; the draft writes itself; the evidence
  ticks off while the deadline counts down. Scrolling back reverses it exactly; motion values write
  straight to styles and text, and React renders only when the tab changes. Exit, the last 10%:
  the panel eases back in a little. A tab click scrolls to the middle of its segment; arrow keys
  move along the tabs. On a phone and under reduced motion (CSS decides, so nothing shifts) there
  is no runway: an ordinary tabbed card with every miniature at its last frame.
- **Statement and how it works** (`statement.tsx`). The sentence that lights up word by word, then
  three columns split by dashed rules (Mora's row, with Calendly's expanding step): Koppel je winkel
  (eight real marks turning slowly on a dashed ring around the mark), Insyte pakt het werk op
  (a Vraag Insyte box typing "Welke bestellingen lopen vandaag uit?" and its answer), Jij stelt de
  regels (May's revenue line drawing over April's, dashed). The open column widens and shows three checks;
  it moves on by itself on screen, and pointer or focus opens the one it is on. On a phone and under
  reduced motion all three are open.
- **Insyte AI** (`#ai`, `ai.tsx`, records in `ai-data.ts`, abyss with the patterns). "Insyte werkt
  voor je." over "Binnen jouw regels.", one line, then a live picture of /ask (no browser chrome): the
  conversations rail, the thread at a reading measure with the composer (@ and /), and "Wat Insyte
  las" and "Gebruikte tools" on the right. Three question chips take turns while it is on screen (a
  click stops the rotation), each running the console's own turn from `lib/ask/scripts.ts`: the star
  breathes, the thinking steps settle to checks ("2 s nagedacht"), the answer streams word by word
  out of a blur with record chips, then the tools, the proposal plate with its confidence on a
  dimension line and its three actions, and the follow-ups. A caption says the answers are scripted
  on the workspace's records, as the console says of its own Ask. Then the autonomy moment, under a
  dashed "binnenkort" tag because none of it is built: "Per actie bepaal jij hoe ver de agent gaat."
  beside two paper windows (`agent-panels.tsx`) — Zelfstandigheid, six actions on a three-way
  setting with the evidence row locked, and "Wat Insyte deed", the log. On screen "Ticket toewijzen"
  moves to Zelf doen, the assignment lands in the log on `arc-tint` with what it read, and Ongedaan
  maken takes it back; settled everywhere else. A line under the copy says agent-ready: the API and
  webhooks now, "MCP-server binnenkort". Under it one translucent sheet,
  3 × 2 by dashed chalk rules, each cell with a tiny visual — Voorstellen, Analyse,
  Concept-antwoorden, Bewijspakketten, AI-stappen in flows, Herkomst bij elk getal — and the trust
  line "Binnen jouw regels · Elk getal met bron · Ongedaan maken". Then `#analytics`: a
  picture of /analytics — the abyss plate of six figures with change pills (chalk, with arrows,
  not signal colours), the "Wat Insyte vond" index, the revenue finding whose line draws in over
  April's with Insyte's estimate band, and a "Vraag ernaar" answer with its bars.
- **Three portals** (`#oplossingen`, `personas.tsx`, `personas-screens.tsx`). A centred two-tone
  heading, then one row of three equal cards that together span the hero wrapper's width (8px gap;
  two and one at `md`, stacked on a phone): Voor operators on abyss with the drafting grid, Voor
  leveranciers on mist, Voor partners on paper. Each card reads top down — title (with "In de bèta"
  for leveranciers and partners, whose first public release is undecided), two lines, three points,
  an outlined button to the console or the portal through sign-in — and the real portal window
  (orders, supplier dashboard, affiliate dashboard) fills its foot, bleeding off the right and
  bottom edges. As the row enters the windows rise and settle, staggered 140ms apart. No carousel.
- **Bento** (`bento.tsx`). One composed object, no captions under it: six tiles on a 4-column grid
  in two rows whose heights follow their content (about 490px and 290px at 1440), with an 8px seam
  (2 columns at `md`, stacked on a phone), on three grounds — abyss, paper, mist; `arc` is an accent
  inside a tile, never a ground. Exactly one abyss tile per row, at opposite corners (the proposal
  top left, the hand-off bottom right), and side-neighbours never share a ground. Abyss carries the
  drafting grid, paper and mist small corner construction crosses. Every piece is straight, each tile
  has its title inside at the top left, one clear product moment, and its own small loop while seen,
  staggered. Top row: the proposal (abyss, wide: the chalk plate with € 89,95, one fact on a leader,
  confidence 92% on a dimension line, Indienen and Bewerken, and right under it the toast
  "Terugbetaling verstuurd · Ongedaan maken" once the pointer has pressed Indienen); revenue (paper:
  the hero's € 172.855 over 30 days on an honest zero baseline with headroom, the three-day average
  as a smooth monotone curve in `arc` over a filled area, scrubbable to each day's own figure); the
  evidence pack (mist: the Klarna case with a deadline ring, four files ticking in, then
  "Bewijspakket compleet"). Bottom row: Ask (paper: the whole turn at rest — question, "2 s nagedacht", the answer and the three
  supplier bars — the loop re-typing the answer, then sweeping the bars); the late orders
  (mist, wide: three rows with photographs and delay chips beside the drafted message to Allure,
  "Allure aansporen" pressed to "Verstuurd"); the hand-off (abyss: the truck moving down a vertical
  track past each stage's time and event, under the DHL mark).
- **Two tours** (`tours.tsx`, `tour-screens.tsx`). The reply Insyte drafts (`#tickets`) and the
  automation builder (`#automatiseringen`): the window takes 7/12 of the column and from 1280 bleeds
  48px past the frame on its outside side, sides alternating. Beside it the headline, the body and
  three steps (Calendly's expanding steps): the open one shows its two lines and a measuring `arc`
  line, and drives the window — the ticket arrives in the inbox (source marks, initials), Insyte
  reads order SO-12224 (photographed lines, the two missing ones marked, its sources), the draft
  types out; the builder takes a sentence, lays out its steps with the services' marks (ghosts
  until then), and passes a test run step by step. Steps advance on their own in view and stop
  under the pointer or focus.
- **Integrations band** (`#koppelingen`, abyss; the blue automations band the owner asked to keep),
  one composed section in three movements. A centred two-tone headline, one line and "Alle
  koppelingen ↗"; then Calendly's chain: two rows of 112px chalk tiles joined by short necks, the
  second set half a tile in, drifting slowly in opposite directions past the column to the page's
  edges, a tile lifting under the pointer; then four suite cards (Shopify, Google, Microsoft,
  Betalingen), each with its marks, two lines and a ↗ corner. Under a dashed chalk rule the
  automation library as a two-row marquee (each template a chip with its services' marks); under
  another (`#beveiliging`) "Met rechten die kloppen." and the six controls in a translucent sheet
  ruled 3 × 2 by dashed chalk lines over a chalk chart axis.
- **Pricing** (`pricing.tsx`, `plans.ts`). A two-tone heading and a billing-cycle switch that changes
  every price. A dashed frame with corner crosses: the claim and the indicative label on the left, a
  fit meter on the right (stores as cells, orders per month as a slider) that names the plan that
  fits and marks its column. The three plans in one dashed frame: name, for whom, price, limits, the
  included capabilities as outlined chips (SAML and OIDC only as a dashed "binnenkort" chip), Bekijk
  and Toegang aanvragen. A full comparison opens below, grouped per area, with the vendors' marks in
  the integrations rows. Prices and the split across plans are an open decision and labelled
  indicative.
- **Questions.** Relume's accordion with hairline rows.
- **Closing band** (`closing.tsx`, Mora's close). An `abyss` wrapper like the hero's: the mark on a
  chalk tile, "Het werk is gedaan." over "Binnen jouw regels." in two tones, the Google action and
  Inloggen, then four link columns (Product, Oplossingen, Gebruik, Bedrijf) under a dashed rule and
  a last row under another. Every link is an anchor here, the product through sign-in, or a page the
  old site serves; ↗ marks the ones that leave.

**Vendor marks.** Each the vendor's own published logo or app icon (`apps/marketing/public/logos/`,
provenance in `BRON.md`): Shopify, Gmail, Outlook, Stripe, Klarna, PayPal, Klaviyo, Slack, Microsoft
Teams, Microsoft 365, Google Sheets, DHL, PostNL, AfterShip, Zapier, and Google's G on the sign-in
action. Product photographs are the console's Unsplash images at thumbnail width (96px, cropped
square, lazy, with width and height set).

**Motion** (`motion/react`, `motion.tsx`). One rule: the server renders a finished frame.

- The hero text staggers in on transform only, so the headline is the LCP on the first frame.
- The console window tilts back and lies flat as it scrolls in, and runs its loop while seen.
- The stage pins and scrubs: it opens on scroll (clip-path), its tabs, ground and miniatures follow
  the scroll, and it eases back as it leaves.
- How it works widens the open column (`grid-template-columns`), the orbit turns once a minute (CSS,
  still under reduced motion), the question types and the line draws.
- Sections and grids reveal once (`Reveal`, `RevealItem`, `usePlay`); figures count up; cards lift
  a few pixels; arrows travel; the nav highlight slides.
- Every loop and auto-advance pauses off screen (`useInView`) and stops when the reader chooses.
- `MotionConfig reducedMotion="user"` plus `useReducedMotion` give reduced motion a still page:
  no loop, no auto-advance, every miniature at its last frame.

**Product renders** carry no browser chrome: no traffic lights, no address bar. A window is the
app itself with its corner, `window-lift` and, on abyss, a chalk outline.

**Proof.** Only the mechanism and real integration marks. No customers, testimonials, statistics or
trusted-by rows; Northwind Clothing Co. is labelled as the console's demo workspace under the
window and on the stage.

### Marketing pages

The rest of the site (31 October 2026), one drawing with the homepage rather than a set of
templates. Every page is `MarketingPage` (`packages/ui/src/marketing/pages/shell.tsx`): the banner and
the full-width bar, a `PageHero`, sections on flat grounds framed by `Frame`'s dashed rails, and the
closing band with the footer. The route in `apps/marketing/src/routes` owns only the head tags
(`meta()`) and `siteLinks` (`src/links.ts`); every page path is in `site.routes`, which keeps
`links.page()` local and fills the sitemap.

**The hero system** (`PageHero`, 1 November 2026). One family in four forms, each a rounded block
inset 8/12px under the unchanged bar, with a two-tone `h1` (painted on the first frame, transform
only), one sentence, the actions as a **pill bar** (`HeroBar`: paper with an `abyss` primary on a
light hero; chalk-tint with an `arc` primary on abyss — nothing solid white on the blue), and a
drawing's **title block** at its foot (chalk-ruled cells whose dashed rules draw in once; never an
eyebrow). The grounds are still: the drafting grid (`drafting-chalk`, or its ink twin
`drafting-ink`) and the Drift hatch, masked; nothing in a live hero's background moves.

- `notch`: the abyss block with a notch at the top centre (two page-coloured corners, each a
  square with a quarter disc taken out, so the block reads as cut); a `bleed` render rises out of
  its foot. Used by `/oplossingen/*`.
- `light`: a mist or glacier block with the ink grid, the copy left or centred. `/vragen` (mist,
  left), `/prijzen` (glacier, centred), the legal pages (glacier, left), `/koppelingen` (mist, the
  logo ring beside), `/changelog` (glacier, left), `/roadmap` (mist, centred).
- `split`: light, the copy left and an abyss panel right holding one live product moment drawn
  bare (no `MomentFrame`). Every `/product/*` page and `/beveiliging` (the six controls).
- `form`: a calm glacier block whose foot the form card overlaps (`window-lift`). `/toegang`,
  `/partners/aanmelden`.

Neighbouring pages differ (product split → personas notch → koppelingen light with the ring →
beveiliging split → prijzen light centred → vragen light left), one family by the block, the
type, the pill bar and the title block. The homepage hero is not part of this system and was left
as it is.

**The background lab** (`/variants`, `pages/variants/`). Moving hero backgrounds are tried there
first, never on a live page: eight variants (the still control, a schematic of rounded component
outlines with pulses running its connectors, a light band across the grid, the Drift hatch
drifting, nodes drawing lines to the mark, the grid as a scroll-tilted floor, a single scan line,
a constellation of the vendors' marks), each a component behind the same headline and pill bar,
on abyss or light by a toggle, flipped through full-screen with `?v=<n>`. Every animation is CSS
paused off screen and in a hidden tab (`data-run`) and stopped under reduced motion. The route is
unlinked, not in `site.routes` (so not in the sitemap) and `noindex`. A chosen variant is promoted
by importing its component into `PageHero`.

**The product template** (`product.tsx`, content in `product-data.tsx`, one config per area). Every
`/product/*` page is the same structure in the same order: the split hero with one render, the
four-step `StickySteps`, six features in a sheet ruled 3 × 2 by dashed lines, the rest of the
product as a ruled row of links, and the close. Only the words and the renders differ.

**Shared moments.** `StickySteps` (`steps.tsx`) is the pages' sticky scroll sequence: steps run down
one column, the other holds one product moment that changes at the reading line (rising out of a
6px blur, the old one sinking), a ruled index under it fills its segment with the reading, and the
inactive steps dim to 35%. Below `lg` each moment sits under its step. `moments.tsx` and
`product-moments.tsx` are the moments: each a small faithful piece of the console or a portal on
the demo workspace, running one loop only while it is the step being read, on screen and in a
visible tab (`useRunning`), and showing its last frame everywhere else.

**Each page's signature moment.**

- `/vragen`: a sticky index whose dashed rail fills with an abyss line as you read and whose square
  marker slides to the group on screen; search folds non-matching rows and groups away, marks
  matches in `arc-tint`, and opens answers that matched in their text; answers open with height,
  opacity and a 3px de-blur; `#id` opens and scrolls; FAQPage JSON-LD. Questions live in
  `faq-data.ts`, which the homepage's short list also reads.
- `/prijzen`: the homepage's switch, fit meter and plans, then the whole comparison open, its plan
  header sticking under the bar with the group being read cross-fading in its first cell and an
  abyss line filling under it; each group's checks draw in as it arrives (`.draw-check`).
- `/beveiliging`: the role matrix scrubbed by the scroll (each role's column fills in turn, then
  CX-lead is drawn from Klantenservice and its changed cells re-set, the refund limit going
  € 100 → € 250), a 2FA code typing in, an audit log taking new lines, and a signed webhook
  delivery running from the mark to the endpoint.
- `/privacy`, `/voorwaarden`, `/verwerkersovereenkomst` (Read): a 68ch column, a sticky table of
  contents with scroll-spy (an abyss bar springs to the article on screen, a line fills with the
  reading), article numbers kept because contracts are cited by them, and a dashed
  "Concepttekst — juridisch nog te controleren" note wherever the ported text promised something
  the product cannot back.
- `/oplossingen/*`: the persona's own portal rising out of the hero, then `StickySteps` with four
  moments from that portal, and the other two personas as cards with their portals cropped in.
- `/product/*`: the template above; the hero render is the area's own moment (the orders list,
  the inbox, the evidence pack, the template library, Vraag Insyte with a streamed turn and its
  proposal plate), the steps are four moments from the area (for Insyte AI: the Ask turn, what it
  read, the proposal, the analysis drawing May over April).
- `/koppelingen`: twelve marks on paper tiles around the mark on a dashed ring, drawing their
  lines to it in turn (the one moving hero figure, a product picture rather than a background); the
  directory reflows on every search and category (cards slide to their places); a card opens a
  drawer (from the right, abyss head, `#id` deep link). Kinds are `Kern`, `Via de API` and
  `Binnenkort` from `docs/backend/integrations.md`.
- `/changelog`: the console's "Nieuw in Insyte" entries on a dated rail that draws down as you read,
  dots turning in as each entry passes, each with its moment. `/roadmap`: the docs' "Later" items as
  construction outlines whose dashed edges draw in; no dates.
- `/toegang`, `/partners/aanmelden`: a form beside a ruled index of its parts that fills as fields
  become valid; errors are an ink outline, a warning glyph and a sentence naming the fix (no red);
  success folds the form away and draws its check. Neither sends anything, and both say so.

### Brand book

"De Blauwdruk, bound" (`/brand` in the reference, `packages/ui/src/brand/book/`, rebuilt 1 November
2026; the one-to-one port and `brand:diff` are retired, ADR-0026's addendum). Internal and `noindex`;
it is not published on the marketing site. Dutch, sentence case, and every specimen live: values
read from `tokens.ts`, parts rendered from `packages/ui`, never a picture. It reads the daylight map
only and keeps the site's rules: no black (dark is `abyss`), nothing solid white on abyss, no pink or
green (one small "alleen in het product" signal note in Kleur is the exception), no glow, no
gradient ground, no mono, no eyebrow.

**Seven chapters** behind a cover: 01 Merk, 02 Logo, 03 Kleur, 04 Typografie, 05 Patronen &
oppervlakken, 06 Iconen & illustraties, 07 Beweging. `registry.ts` names every chapter and page and
numbers the pages continuously through the book (the cover is page 1); the bar, the menu, the in-page
index, "Pagina NN" and the chapter footer all read it.

- **Cover.** Full-bleed `abyss`: "Merkrichtlijnen" in the display face (`figure`) top left, the mark
  top right, the cover's one picture in the lower right — the Drift mark drawn as a halftone of its
  own squares, which unrolls in once and is still after — and "Insyte · Merkrichtlijnen" at the
  foot. Under it the chapter index and a title block.
- **Chapter hero.** A numbered plate per chapter: the number very large in the display face (the
  book's own steps `text-plate` 128px and `text-numeral` 240px, both only in `figure`), the title in
  two tones, one sentence and a title block. Grounds differ from their neighbours: Merk abyss, Logo
  arc, Kleur paper, Typografie mist, Patronen abyss, Iconen arc, Beweging paper, each with the
  drafting grid and the Drift hatch, still and masked.
- **Section page**, the book's main pattern: a slide. A narrow column (~22%: the mark on its tile,
  the title, one paragraph, Live / Lab / Alleen in het product, the source file, "Gebruik als" and
  "Niet", and "Pagina NN · Insyte / Merkrichtlijnen" at its foot) beside one large panel (mist,
  glacier, paper or abyss) holding one live specimen with air round it. One viewport tall on a
  desktop, stacked on a phone; a catalogue may grow past it. Cells inside a panel are dashed
  construction cells (`ruled`), not cards on cards. A moving specimen has Pauzeren and Zonder
  beweging (CSS frozen through `data-paused`/`data-still`, motion/react through the specimen's
  context), some a ground switch and Opnieuw.
- **The bar** is the site's: `paper`, 72px tightening to 64px with a hairline, the mark on its tile
  with "insyte" and "Merkrichtlijnen", the current chapter's number and title in the centre, and
  one "Hoofdstukken" trigger. Under it, on a chapter, the in-page index: every section page, the
  one under the reading line marked by an abyss bar that slides (scroll-spy), and a line filling
  with the reading.
- **The menu** is full screen on flat `abyss` with the drafting grid in chalk: the chapter list
  (number in the display face, title at 48px) beside a live miniature of the hovered or focused
  chapter's hero, and a title block at the foot. It unrolls down (`slow`, in-out), its rows rise
  12px in a 30ms stagger, the preview fades in last; it closes the other way, quicker. A modal:
  focus on the current chapter, Tab held inside, the page behind `inert` and still, Escape back to
  the trigger, ↑/↓ moving focus and the preview together, Home/End, 1–7. On a phone it is a sheet:
  the list with each chapter's description and a small chalk thumbnail of its ground, a second
  Sluiten at the thumb, and a downward swipe closes it.
- **Transitions** (motion/react, the tokens only, the symmetric `mesh` curve as in-and-out). From a
  link the page leaves 12px up in `base`, the window goes to the top, the next arrives 12px from
  below in `slow`. From the menu the swap underneath is immediate and the chosen chapter's number
  and title travel from their row into the new hero (`layoutId`) while the menu fades. Reduced
  motion — the reader's, or the book's own switch in Beweging — is an 80ms cross-fade and every
  drawing at rest.

The logo chapter shows one mark only — `InsyteMark` = `MarkDrift`, as the rail and the site draw it —
with its lockup, tones (white on abyss and arc, on paper on its abyss tile, `mono` and `ink`; the
`brand` tone is not used), sizes, the app icon and favicon sizes, construction and clear space (one
11-unit step), what not to do, and the one file that exists (`insyte-mark-white.svg` with `BRON.md`).
The Iconen chapter shows every drawn thing: the pen's rules, all of `icons.tsx` searchable, the
glyph's draw-in and seven gestures, the sixteen empty marks and the hatch band, step tiles and every
node icon, the setup squares and the AI star tile, the orbit, the koppelingen ring and the
connections tile, the integrations chain, the eight `/variants` backgrounds as a gallery (`/variants`
stays the lab), and the vendors' own marks grouped by where each file came from.

### Overlays

Menus, popovers, selects, tooltips, dialogs and sheets are `panel-raised` on `paper`, tile or
tile-hero radius, 4px padding around 36px items, `sideOffset` 4. Motion is one shared string
(`popupMotion` / `centredPopupMotion` / `backdropMotion`): a 150ms out-quart transition on opacity,
scale (0.98 → 1) and a 4px translate, growing from `--transform-origin` so the surface comes out of
its trigger. Because Base UI marks the first and last frame as state rather than firing keyframes,
every open/close is interruptible and reversible halfway through. The backdrop is `black/40`.

**Notifications** are a popover, not a menu: "Notifications" at 17px with Mark all read, then
three tabs on a well (All, For me, AI) with unread counts, the selected one an `abyss` pill that
slides between them. Rows are grouped by day. A row leads with the person (their disc, a presence
dot, or a small @ or plus badge for why it reached you), or with Insyte's star on an `abyss` tile when
the AI did it, or with the subject's glyph on its signal tint. The sentence names the actor in medium
weight and the record in tabular figures, a quote follows in `ink-2`, then the time. Unread rows have
full ink and an `arc` dot, which is also the read/unread toggle; read rows step back to `ink-2`. The
foot is a `mist` band with "Wat je hoort, en wanneer" (the persona's own settings) and Alle meldingen,
which opens the notifications page. It shows only what is in the inbox, at most 40 rows.

**Records open as plain modals.** A record opened from a list row opens with the same fade and
scale as every other dialog. Focus lands on the record itself, not its first control. A row-to-modal
morph was tried and dropped because it was too much for a surface that opens dozens of times an hour.

**Dialog anatomy.** A medium-weight 17px title with a 14px `ink-2` description. The close button is
a 32px ghost icon button. The actions sit on a `mist` band at the foot, with a ghost Cancel and an
`abyss` primary, and no rule above them. Facts the user compares, such as rating, installs or
pricing, go in one `mist` band rather than a row of chips.

**Undo over confirm.** An action the operator can take back — filing, discarding, archiving,
removing a teammate, disconnecting — happens at once and offers Undo for six seconds in a toast at
the bottom centre. An action that cannot be taken back — a refund, submitting evidence to a
provider — asks first, in an alert dialog that names the
consequence and the amount.

### Icons

Insyte's own set, `packages/ui/src/icons.tsx`, drawn rather than taken from a kit: a 24-unit field
with an 18-unit live area, one 1.75 stroke, **square caps and mitred joins**, straight segments and
right angles before curves, rectangles on the 2-unit Drift radius, and the mark's offset-square device
wherever the subject is one of several (copy, apps, customers, chats). Dots are filled squares.
Settings is sliders, not a gear; automations is two nodes and a ruled connector; the AI mark is a
four-point star with straight concave sides and a ruled spark. Every glyph exports under the name
Lucide gave the same subject; `IconComponent` is the type.

Every stroke has `pathLength` 1, so `Glyph` (`components/common/glyph.tsx`) can draw any icon in:
the pen runs over its lines once when it first appears (420ms, out-expo, strokes in order) and its
square dots scale in after. Hovering the glyph's host (any ancestor marked `glyph-host`) plays one
gesture chosen for the subject: a truck drives, a bell swings, a rocket or box lifts, a refresh or
workflow turns, a check pops, an arrow nudges. That is used in the filter field picker and in
notifications. Home does not use it: its glyphs are still and in `ink-3`, because a board of moving
icons is noise, and the only drawn stroke there is a tick being checked. Reduced motion paints every glyph drawn
and still.

Lucide is gone from the repo: its last user was the ported brand book (removed 1 November 2026).

### Integration logos

Real marks for every service the product connects to, as files in `apps/design/public/logos/` with
their provenance in `BRON.md` (CC0 from gilbarbara/logos and Simple Icons, otherwise each vendor's
site icon). `BrandLogo` sets each on the same tile: `mesh-ink` with the inset hairline, pinned in
both themes because a vendor draws its mark for a white ground. Full-bleed app icons fill the tile;
bare marks sit at 64%. The tile's corner follows its size (chip below 24px, control to 40px, tile
above). No initial-on-a-colour stand-ins: a service without a file shows its initials on the same
neutral tile.

### Settings

One grey sheet per page: `glacier`, tile-hero radius, at most 1120px wide, the full height of the
window and centred on the `paper` content area, whose margin carries /login's dot grid in ink
(`bg-dot-grid-ink`), faded toward the middle. The page title is 24px beside its glyph on a white tile, and every section heading has
its own glyph in `ink-3`. Sections are a heading and what is under it, separated by space, never
framed. A field sits beside its label (`FieldRow`: 200px label column with an optional one-line
hint, control capped at 380px). Inputs on the sheet are white with a 7% inset edge, as on /login's
grey half (`.settings-sheet .field`).

Lists of things (stores, integrations, keys, links elsewhere) are one white card per list
(`BandedList`), rows divided by a hairline. A row that goes somewhere is a `SettingsItem`: a 36px tile
with its glyph (neutral `mist`, `arc-tint` for a place in the product, green for a download, `abyss`
for the one that cannot be undone), a title, one `ink-3` line, and a chevron that nudges on hover.
Account has two such lists: around the workspace (team, stores, billing) and your data (download,
what happens when a store closes, delete the workspace behind an alert dialog).

There is no Save button waiting at the foot of a form: the moment something changes, an `abyss` bar
rises from the bottom of the page — "You have unsaved changes · Discard · Save changes" — and goes
once the change is kept or undone. A section's one action is the brand's primary button beside its
heading.

### API keys and webhooks

Settings → API-sleutels and Settings → Webhooks are where code that is not a person gets in, and
both read off one store (`stores/developer-store.ts`) and one model (`lib/developer.ts`). Ids,
prefixes, secrets, paths and event names are data, but there is still no typewriter face: they are
`Token`s, a soft `ink/6` chip in the sans with tabular figures, `arc-tint` when a scope writes.

**A key** holds either a role from Rollen — and changes when the role does — or its own scopes, per
area, none, read or read and write, in the ids an automation's rights use (`orders.read`,
`orders.write`). Team, facturatie and the API itself are never reachable with a key. It also names
its stores, how long it lives (30 dagen, 90 dagen, 1 jaar, nooit) and the addresses it may come
from, as chips in one well that turn the well red when one is not an address. A key that is not a
whole role in every store from anywhere is marked Beperkt. The list reads name and prefix, what it
reaches, who made it and when it was last used; one about to lapse within 14 days says so in amber,
a lapsed one in red, and revoked keys fold away under one link.

**The secret is shown once.** Creating a key moves the dialog to an `abyss` band with the full
secret and Kopiëren, and the dialog cannot be closed until "Ik heb hem opgeslagen" is ticked;
trying turns the tick's band amber and says why. After that only the prefix is ever shown.

**A key's detail** is a dialog: the facts in one `mist` band, requests per day for 14 days as quiet
`ink-4` bars with errors as a red cap, its scopes, the recent requests (method as a signal-tinted
tag, path, status, duration, address, time) and its name and addresses, editable in place. Rotating
asks how long the old secret may keep working — 1 uur, 24 uur, 7 dagen — shows the new one once,
and leaves an amber line naming the old prefix and when it stops, with "Oude nu stoppen". Revoking
happens at once with Undo; the key stops when the toast goes.

**An endpoint** is a URL, a sentence about what it is for, events picked by area (searchable, a
whole area in one click, a count of what is picked), an API version that shapes the payload,
stores, extra headers, a retry schedule (geen, 3, 5 or 8 attempts with growing gaps) and a switch.
The list leads with health — the share of the last day's deliveries that got a 2xx — because that
is the one thing to know about an endpoint you are not looking at. Its page shows the facts in one
band, the signing secret masked with Tonen, Kopiëren and Roteren (with Undo), the events, and the
delivery log as banded rows: event, status, attempts, duration, next attempt, time, cut by Alle,
Mislukt and Wacht op poging. A run of failures is an amber line that counts down — "Na nog 2
mislukte leveringen zetten we dit endpoint uit" — red when two are left, and after five in a row
Insyte switches it off and says so, with Weer aanzetten. Testevent sturen picks one of its events
and appends the simulated result to the log.

**A delivery** opens in a 520px drawer: the answer, attempts, duration and time across the top, the
headers Insyte signed with, the body and the endpoint's answer. JSON is drawn as a readable document
in the sans, one key a line, keys in `ink-2`, strings in `arc-ink`, figures in `ink`, punctuation
in `ink-3`, on `mist`. Opnieuw versturen sends the same body as a new attempt and moves the drawer
to it; one that goes through ends the run of failures.

A role without Koppelingen en API · Bewerken sees all of this and changes none of it: every control
stays where it is, disabled, with the tooltip naming what is missing, and the signing secret cannot
be revealed or copied.

### Agents en MCP, and the Binnenkort chip

Settings → Technisch → Agents en MCP (`/settings/agents`, `ai/agents-screen.tsx`) says what
agent-ready means without claiming what is not built: the operator's own agents are API keys marked
"Gebruiken met een agent" in the key dialog (a `mist` row with a switch; the key then carries a quiet
Agent pill in the list), listed here with their rights and last use; the MCP server is a section with
the dashed _Binnenkort_ chip, its address in a greyed well beside "Nog niet beschikbaar", and only
"Laat het me weten" (remembered per browser); then how rights work and links to API-sleutels,
Webhooks, Zelfstandigheid and Wat Insyte deed. It reads the same in every design state.

`SoonChip` (`common/soon-chip.tsx`) is the console's one mark for planned things: a 20px pill with a
dashed `ink/25` edge and `ink-3` words, never a button, the marketing site's coming-soon chip drawn for
the console. It is used where the product is designed but not built — MCP, the customer agent
answering on its own on WhatsApp and Instagram — and nowhere else.

## Do's and Don'ts

### Do:

- **Do** take every value from `packages/tokens/src/tokens.ts`. It is the only place a colour,
  radius, type step, easing or duration is written down; the stylesheet, the brand kit and the Figma
  exporter all read it.
- **Do** separate regions with a surface change: `glacier` → `mist` → `paper`.
- **Do** keep a hairline for data boundaries only — a table row, an input, a group break in the
  rail.
- **Do** fill, don't outline: a secondary button is the same well as an input.
- **Do** ask for a type role (`text-sm`, `text-lg`), which carries its own line-height and tracking.
- **Do** spend `arc` on state — focus, selection, active, link — and `arc-ink` when the brand has to
  be text.
- **Do** write sentence case, and let weight and colour carry hierarchy rather than size.
- **Do** line figures up with `tabular-nums` on the sans.
- **Do** gate every animation on `useReducedMotion` (or the stylesheet's reduced-motion block) and
  make sure the end state is what shows when motion is off.
- **Do** use one named motion token: out-quart for state, out-expo for an arrival, 80/160/240/420ms.

- **Do** make every control act on the workspace (`stores/workspace-store.ts`): a button that only
  raises a toast saying something happened is a defect, not a placeholder.
- **Do** offer Undo for anything reversible, and ask first only for what is not.
- **Do** use the house icon set and `BrandLogo` for third parties; their marks, on a light tile.

### Don't:

- **Don't** use `font-mono` or declare a mono face. Figures are tabular, not typewritten.
- **Don't** put a border on a section, a card or a page header.
- **Don't** write an arbitrary type or tracking value (`text-[12.5px]`, `tracking-[-0.01em]`); if a
  step is missing, the scale is what changes.
- **Don't** reach outside the radius ladder (`rounded-2xl` and up), and don't put a `rounded-*` class
  on `field` or `panel`-less utilities that already decide radius — the caller names it once.
- **Don't** put text on `sky`, `powder`, `ink-4` or `ink-5`.
- **Don't** use `arc` as decoration: no arc-washed sections, no brand-coloured icon that is not a
  control, no `text-arc` (use `arc-ink`).
- **Don't** mark selection or the active state with a ring, an outline or a left border. The field
  takes the colour.
- **Don't** stack atmosphere. One mesh per page at most, and only where the brand actually speaks;
  the `plate`'s scanning rule is the product's single piece of ambient motion.
- **Don't** add an eyebrow, a kicker or a standing description above a heading, and don't add a
  second explanatory row to a list screen.
- **Don't** use a Lucide glyph in a grey disc as an empty state; name a `kind` and let the drawn mark
  do it.
- **Don't** bring back `lucide-react` or any other kit's glyphs; draw the icon in `icons.tsx`.
- **Don't** frame a list or a settings section, and don't rule between rows; band them.
- **Don't** reach for a shadcn slot name (`bg-card`, `border-border`) in new work. The slots exist so
  vendored primitives resolve; authored surfaces name the token.
