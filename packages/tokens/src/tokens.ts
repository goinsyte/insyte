/**
 * The design system's values, and the only place they are written down.
 *
 * TypeScript rather than CSS because four consumers need to read them and only one speaks CSS: the
 * stylesheet through generated custom properties, the brand kit through this module directly, Figma
 * through the variable exporter, and — later — transactional email, which needs hex. A palette that
 * lives in a stylesheet can be read by exactly one of those.
 *
 * `src/tokens.css` is generated from this file by `bun build.ts`, and a test fails if the two drift.
 *
 * ## Why these values are not the legacy stylesheet's values
 *
 * Eight of the legacy palette's twenty-six colours were **outside sRGB**, so the browser clipped them
 * and what rendered had never been what was written. `abyss` — the primary call to action and the mesh
 * ground — asked for chroma 0.23 at lightness 0.22 on hue 270, where the sRGB ceiling is 0.144. Its
 * green channel clamped to exactly zero.
 *
 * Two repairs were applied, and the reason differs by what the colour is for:
 *
 * - **Identity colours match what the stylesheet painted.** `abyss` and `abyss-2` are the brand as
 *   anyone has actually seen it, so the in-gamut value nearest the painted one wins: RGB distance
 *   0.019 and 0.005, which is no visible change. The token stops lying; the brand does not move.
 * - **Everything else holds lightness and hue and clamps chroma.** For a status colour the lightness
 *   is the contrast budget and the hue is the meaning; chroma is the part that can give. Two of the
 *   six land on an identical hex anyway.
 *
 * `isInGamut` is what found all of this, and `test/tokens.test.ts` keeps it found.
 */

/**
 * Royal Azure on neutral grey.
 *
 * The canvas and the ink ramp are achromatic — chroma exactly zero — so the only colour in the system
 * is the brand. That is the whole palette decision, and it is why `arc` can carry every interactive
 * moment without competing with anything.
 */
export const colors = {
  /* Surfaces, lightest to deepest. Layering is a surface change, never a border. */
  /** The operator canvas, and the page behind everything. */
  glacier: "oklch(0.965 0 0)",
  /** A tile lifted off the canvas. */
  mist: "oklch(0.984 0 0)",
  /** The brightest surface. Named rather than written as `#fff` so the ladder has three rungs. */
  paper: "oklch(1 0 0)",

  /* The brand, and the only chromatic colour in the product surfaces. */
  /** Every interactive moment: links, focus, selection, the thing you are meant to press. */
  arc: "oklch(0.48 0.215 270)",
  /** The outer focus halo. Chroma clamped from 0.08; the hex is unchanged. */
  "arc-soft": "oklch(0.84 0.078 270)",
  /** Informational tint: a pill background, the surface under something the product is suggesting. */
  "arc-tint": "oklch(0.94 0.028 270)",
  /**
   * The brand AS TEXT, which `arc` itself may never be.
   *
   * `arc` is a field: it holds its value in both themes, so by night it is a dark blue sitting on a
   * dark ground — 2.24:1 on `paper`, 1.92:1 on `arc-tint`. The console had reached for `text-arc`
   * 73 times anyway, for links, for the Ask Insyte label, for every active tab. This token is what
   * those call sites meant: the same blue by day, and the blue lifted far enough at night to still
   * be read. It is the one brand value that moves, because text is the one place it has to.
   */
  "arc-ink": "oklch(0.48 0.215 270)",
  /** Primary action, and the mesh ground. Matched to what the legacy stylesheet painted. */
  abyss: "oklch(0.284 0.186 270)",
  /** Primary action, hovered. Matched the same way. */
  "abyss-2": "oklch(0.322 0.21 270)",

  /**
   * Atmosphere only, and forbidden as product UI colour.
   *
   * These are the two stops of the mesh gradient. Nothing may take text on them, which is why neither
   * appears in `pairs`.
   */
  sky: "oklch(0.72 0.13 260)",
  powder: "oklch(0.82 0.04 270)",

  /*
   * The ink ramp. Achromatic, five steps, high emphasis to low — but only the first THREE may carry
   * text, and that is the whole point of the comments below.
   *
   * The ramp used to read "tertiary: placeholders and hints" at `ink-4` and "captions and micro
   * copy" at `ink-5`, and 281 places in the product took it at its word. Measured against the three
   * grounds they actually sit on, `ink-4` is 2.60:1 on `glacier` and `ink-5` is 1.84:1 — text at
   * half the legible minimum, in a tool somebody reads all day. `ink-3` was 3.87:1, which also
   * failed, and it is what `--muted-foreground` resolves to, so it failed on every screen at once.
   *
   * Two ways out: flatten the ramp until every step passes, which leaves no hierarchy; or keep the
   * spread and say plainly which steps are text. This is the second. `ink-3` moved to clear 4.5:1 on
   * the darkest ground it sits on, and the call sites that used the last two steps for text were
   * swept up to `ink-3`. What `ink-4` and `ink-5` are for is below.
   */
  /** Body text. */
  ink: "oklch(0.28 0 0)",
  /** Mid emphasis. Headings on a panel, a label above a filled field. 8.44:1 on `glacier`. */
  "ink-2": "oklch(0.4 0 0)",
  /**
   * The lowest step that may carry text, and therefore every placeholder, caption, hint and unit
   * label in the product.
   *
   * It moved down, from 0.535, for two reasons that turned out to be the same reason. The comment
   * this replaces claimed 4.67 / 4.94 / 5.17 on the three grounds; measured, it was 4.74 on
   * `glacier`, 5.17 on `paper` and **4.40 on `mist`** — under the 4.5 this product commits to, on
   * the surface the area panel and the top bar are painted in. And the console reaches for this
   * step 408 times against 96 for `ink-2`, so the lightest readable ink was doing four times the
   * work of the middle one, which is what "everything looks grey" actually is.
   *
   * At 0.49 it clears every ground with room — 5.72 on `glacier`, 5.31 on `mist`, 6.22 on `paper`
   * — and the ramp steps evenly: 0.28, 0.40, 0.49.
   */
  "ink-3": "oklch(0.49 0 0)",
  /** NOT text. Disabled glyphs, chart gridlines, the scrollbar thumb, an icon that is off. */
  "ink-4": "oklch(0.68 0 0)",
  /** NOT text. The faintest a mark can be and still be deliberate: rules, ticks, dividers. */
  "ink-5": "oklch(0.78 0 0)",

  /* Borders. A hairline marks a data boundary — a table row, an input — never a section edge. */
  hairline: "oklch(0.89 0 0)",
  "hairline-strong": "oklch(0.83 0 0)",

  /* Ink for the mesh surfaces, where the ground is `abyss` rather than the canvas. */
  /** High emphasis on mesh. Warm, deliberately: it is the one place the system is not neutral. */
  "mesh-ink": "oklch(0.98 0.01 100)",
  "mesh-ink-2": "oklch(0.86 0.025 270)",
  "mesh-ink-3": "oklch(0.72 0.035 270)",
  "mesh-hairline": "oklch(0.36 0.08 270)",

  /**
   * Identity colours. Six fields and one ink, for the disc that stands in for a person.
   *
   * These are the one set whose job is to be TOLD APART rather than to mean something, so they are
   * assigned by hashing a name and they carry no status. The product had six of them already —
   * `#9cc3f8`, `#f891b2`, `#ffda4c` and three more — copied by hand into six files, every copy pale
   * and every copy paired with `text-ink`. That reads at night as near-white on a pale yellow disc,
   * 1.8:1, and it is the same defect `arc-ink` was added to fix: a field was being treated as if it
   * followed the theme.
   *
   * So they follow the brand's rule instead. A field holds its value — a colleague is the same
   * colour at 09:00 and at 23:00, because the colour IS the identity — and the ink on it is pinned
   * rather than inherited, exactly as `mesh-ink` is pinned to `abyss`. `person-ink` clears 8.3:1 on
   * all six.
   */
  "person-1": "oklch(0.845 0.075 250)",
  "person-2": "oklch(0.855 0.085 340)",
  "person-3": "oklch(0.875 0.115 90)",
  "person-4": "oklch(0.855 0.085 155)",
  "person-5": "oklch(0.85 0.08 30)",
  "person-6": "oklch(0.85 0.075 300)",
  /** The ink every one of the six carries, in both themes. Never used on a theme surface. */
  "person-ink": "oklch(0.3 0.015 270)",

  /**
   * The signal trio, as tonal pairs.
   *
   * Always a tint behind its own ink, never solid-on-solid, and never the only signal — a status pairs
   * its colour with a word.
   *
   * Hue is as written. Lightness is **not**, and that is an accessibility repair rather than a taste
   * change: clamping chroma into sRGB dropped the amber pair to 3.39:1 and the green to 4.44:1 against
   * their own tints, under the 4.5:1 this product commits to for body text. Each ink's lightness was
   * walked down until its pair cleared it — amber moved furthest, 0.6 to 0.525. The pair, not the
   * colour, is what the test asserts, because a status ink is only ever seen on its own tint.
   */
  "signal-green": "oklch(0.51 0.115 160)",
  "signal-green-bg": "oklch(0.94 0.055 160)",
  "signal-amber": "oklch(0.525 0.113 70)",
  "signal-amber-bg": "oklch(0.94 0.048 75)",
  "signal-red": "oklch(0.545 0.2 22)",
  "signal-red-bg": "oklch(0.94 0.03 22)"
} as const

export type ColorToken = keyof typeof colors

/**
 * What each group of colours is for.
 *
 * This is the one thing about the palette a reader cannot derive from it: `arc-tint` and `mist` are
 * both pale and only one of them means "informational". The brand kit groups its swatches from this
 * list rather than from prose beside them, and a test asserts the grouping is total and disjoint — so
 * a colour added without a family fails, instead of quietly not appearing on the page that is
 * supposed to document every colour.
 */
export const families = [
  {
    name: "Surfaces",
    use: "The layering, lightest to darkest step. Separation on this site is a surface change, not a border.",
    members: ["glacier", "mist", "paper"]
  },
  {
    name: "Brand",
    use: "Royal azure, hue 270. It carries every interactive moment and decorates nothing.",
    members: ["arc", "arc-ink", "arc-soft", "arc-tint"]
  },
  {
    name: "Depth",
    use: "The dark ground: the primary call to action, and the mesh the brand speaks from.",
    members: ["abyss", "abyss-2"]
  },
  {
    name: "Atmosphere",
    use: "The mesh's lit orbs. Decorative, never a surface for text — which is why neither is paired.",
    members: ["sky", "powder"]
  },
  {
    name: "Ink",
    use: "Five achromatic steps, on light surfaces. Chroma 0, so the only colour in the system is the brand.",
    members: ["ink", "ink-2", "ink-3", "ink-4", "ink-5"]
  },
  {
    name: "Lines",
    use: "A hairline is a data boundary — a table row, an input. Never a section edge.",
    members: ["hairline", "hairline-strong"]
  },
  {
    name: "On dark",
    use: "Ink and lines for the mesh surfaces, measured against the vignette rather than the lit regions.",
    members: ["mesh-ink", "mesh-ink-2", "mesh-ink-3", "mesh-hairline"]
  },
  {
    name: "People",
    use: "Six fields and one pinned ink, assigned by hashing a name. Told apart, not read: they carry no status.",
    members: ["person-1", "person-2", "person-3", "person-4", "person-5", "person-6", "person-ink"]
  },
  {
    name: "Status",
    use: "Three states, each an ink on its own tint. Colour is never the only signal: a status carries a word.",
    members: [
      "signal-green",
      "signal-green-bg",
      "signal-amber",
      "signal-amber-bg",
      "signal-red",
      "signal-red-bg"
    ]
  }
] as const satisfies ReadonlyArray<{
  readonly name: string
  readonly use: string
  readonly members: ReadonlyArray<ColorToken>
}>

/**
 * Which ink goes on which surface.
 *
 * Declared rather than inferred from a naming convention, because this is the list a contrast check
 * iterates over and the list the Figma exporter pairs variables from. A surface absent from it is a
 * surface nothing may put text on — which is the point for `sky` and `powder`.
 */
export const pairs = [
  ["glacier", "ink"],
  ["mist", "ink"],
  ["paper", "ink"],
  ["arc-tint", "ink"],
  ["arc", "mesh-ink"],
  /* `arc-ink` is the brand used as text, so it is declared against every ground text sits on. */
  ["glacier", "arc-ink"],
  ["mist", "arc-ink"],
  ["paper", "arc-ink"],
  ["arc-tint", "arc-ink"],
  ["abyss", "mesh-ink"],
  /*
   * The plate's secondary and tertiary inks, declared because the product paints text in them and a
   * pair that is not declared is not tested.
   *
   * This is the exact hole the first build fell into. `abyss` is identical in both maps — it is a
   * brand surface, not a theme surface — while `powder` and `arc-soft` move with the theme, so
   * `powder` on `abyss` is 8.84:1 by day and 1.98:1 at night, and `arc-soft` 9.41:1 then 4.15:1. The
   * plate used both for its body copy. The mesh ramp is fixed in both maps, which is why it exists
   * and why it is what the plate reads from now.
   */
  ["abyss", "mesh-ink-2"],
  ["abyss", "mesh-ink-3"],
  ["abyss-2", "mesh-ink"],
  ["person-1", "person-ink"],
  ["person-2", "person-ink"],
  ["person-3", "person-ink"],
  ["person-4", "person-ink"],
  ["person-5", "person-ink"],
  ["person-6", "person-ink"],
  ["signal-green-bg", "signal-green"],
  ["signal-amber-bg", "signal-amber"],
  ["signal-red-bg", "signal-red"]
] as const satisfies ReadonlyArray<readonly [ColorToken, ColorToken]>

/**
 * The same palette at night, under the same names.
 *
 * Both themes ship as equals, which is the honest answer for a tool somebody has open at 23:00
 * chasing a supplier in another timezone. Legacy shipped an empty `.dark {}` block, so there was
 * nothing to inherit and this is authored.
 *
 * It is a parallel map rather than a set of `-dark` suffixed tokens, and that is the whole decision:
 * a suffix doubles the number of NAMES, which is the sprawl the legacy stylesheet died of, while a
 * second map keeps one name per value and lets a test assert the two are key-for-key identical. A
 * colour added to one and forgotten in the other fails, instead of silently falling back to its
 * daylight value on a dark ground.
 *
 * Three groups deliberately do not move:
 *
 * - **The brand.** `arc`, `abyss` and `abyss-2` are the same values in both themes. A brand that
 *   changes hue when the lights go off is two brands. `arc` is only ever a filled field in this
 *   system, never inline text, so it does not need to lift for legibility — the ink on it does, and
 *   that ink is `mesh-ink`, which is near-white in both themes for exactly this reason.
 * - **Ink on dark grounds.** `mesh-ink` and its steps already describe text on a dark surface, and
 *   `arc` and `abyss` are dark surfaces whatever the theme.
 * - **Nothing else.** Surfaces inverse, the ink ramp inverts, lines lift, and the status pairs swap
 *   which half is the tint — a dark tint under a light ink rather than the reverse.
 *
 * One value here is a gamut repair rather than a choice: `signal-red` was written at chroma 0.145 and
 * clipped, so it holds its lightness and hue and gives up chroma, at 0.125. Same rule as daylight —
 * for a status colour the lightness is the contrast budget and the hue is the meaning.
 */
export const darkColors = {
  /* Surfaces. The ladder still runs canvas -> lifted -> brightest; it just runs upward from dark. */
  glacier: "oklch(0.185 0 0)",
  mist: "oklch(0.225 0 0)",
  paper: "oklch(0.255 0 0)",

  /* The brand. Unmoved, except the halo and the tint, which are surfaces and must invert. */
  arc: "oklch(0.48 0.215 270)",
  "arc-soft": "oklch(0.62 0.14 270)",
  "arc-tint": "oklch(0.305 0.055 270)",
  /* Lifted to clear 4.5:1 on all three dark grounds and on the dark tint: 6.74 on `paper`, 5.77 on
     `arc-tint`. Chroma stays high enough that it still reads as the brand and not as a grey. */
  "arc-ink": "oklch(0.74 0.12 270)",
  abyss: "oklch(0.284 0.186 270)",
  "abyss-2": "oklch(0.322 0.21 270)",

  /* Atmosphere. Dimmer, because a lit orb in a dark room is a lamp and reads as a mistake. */
  sky: "oklch(0.56 0.14 260)",
  powder: "oklch(0.44 0.05 270)",

  /*
   * The ink ramp, inverted. Still chroma 0: the only colour in the system is still the brand.
   *
   * The same three-step rule as the daylight ramp, and it binds harder here. A dark theme's grounds
   * run the other way — `paper` is the LIGHTEST surface, so it is the hardest ground, not the
   * easiest — and `ink-4` lands at 4.00:1 against it. So the night ramp's last two steps are not
   * text either, and the three that are clear 4.5:1 against `paper` with room to spare.
   */
  ink: "oklch(0.965 0 0)",
  "ink-2": "oklch(0.84 0 0)",
  /** Lifted with its daylight twin, for the same reason. 7.34:1 on `paper`, the night's worst case. */
  "ink-3": "oklch(0.76 0 0)",
  /** NOT text. Same roles as its daylight counterpart. */
  "ink-4": "oklch(0.6 0 0)",
  /** NOT text. */
  "ink-5": "oklch(0.5 0 0)",

  /* Lines lift off the ground rather than darkening into it. */
  hairline: "oklch(0.3 0 0)",
  "hairline-strong": "oklch(0.38 0 0)",

  /* Unmoved: these already describe ink on a dark ground. */
  "mesh-ink": "oklch(0.98 0.01 100)",
  "mesh-ink-2": "oklch(0.86 0.025 270)",
  "mesh-ink-3": "oklch(0.72 0.035 270)",
  "mesh-hairline": "oklch(0.36 0.08 270)",

  /* Unmoved, and for the same reason as the brand: a person's colour IS their identity. */
  "person-1": "oklch(0.845 0.075 250)",
  "person-2": "oklch(0.855 0.085 340)",
  "person-3": "oklch(0.875 0.115 90)",
  "person-4": "oklch(0.855 0.085 155)",
  "person-5": "oklch(0.85 0.08 30)",
  "person-6": "oklch(0.85 0.075 300)",
  "person-ink": "oklch(0.3 0.015 270)",

  /* The status pairs swap halves: a dark tint carrying a light ink. */
  "signal-green": "oklch(0.8 0.14 160)",
  "signal-green-bg": "oklch(0.3 0.055 160)",
  "signal-amber": "oklch(0.84 0.13 85)",
  "signal-amber-bg": "oklch(0.3 0.05 75)",
  "signal-red": "oklch(0.78 0.125 22)",
  "signal-red-bg": "oklch(0.31 0.06 22)"
} as const satisfies Record<ColorToken, string>

/**
 * The two drawn fields, as pitches.
 *
 * First-class because two consumers read them and neither can derive the other's: the stylesheet
 * paints them as repeating gradients, and the brand kit has to state the pitch beside the swatch. A
 * pattern documented at a different pitch than it is drawn at is the same class of wrong as a
 * palette page two generations stale.
 *
 * Both derive from the mark. `hatch` is the Drift mark's three offset squares at the step they offset
 * by; `grid` is the drafting grid a plate is drawn on, at four hatch steps less one so the two never
 * beat against each other.
 */
export const pattern = {
  /** The drafting grid, on plate grounds only. */
  grid: "32px",
  /** The Drift hatch, filling a cell that has nothing to say. */
  hatch: "24px"
} as const

export type PatternToken = keyof typeof pattern

/** What each field is for. See `radiusUse`. */
export const patternUse: Record<PatternToken, string> = {
  grid: "The drafting grid a plate is drawn on. Plate grounds only, never the canvas.",
  hatch: "The mark's three offset squares, filling a cell that has nothing to say."
}

/**
 * Five radii, one role each, and no sixth.
 *
 * The legacy stylesheet had two competing ladders — these five plus a seven-step Tailwind override —
 * so a component could be `rounded-xl` or `rounded-tile` and nobody could say which was right. Only
 * these exist now, and `css.ts` maps Tailwind's scale onto them rather than beside them.
 */
export const radius = {
  /** Status pills only. A pill is never a button. */
  pill: "9999px",
  /** Chips and the smallest affordances. */
  chip: "6px",
  /**
   * Buttons, inputs, selects, menu items — anything you operate. Also the shadcn baseline.
   *
   * 9px rather than 8. The number is not taste: the top bar wrote `rounded-[9px]` by hand on every
   * one of its wells, which is a component telling you the token was a pixel tight. A control that
   * has to be nudged at the call site is a token that is wrong.
   */
  control: "9px",
  /** Tiles, panels, the frame around a table. */
  tile: "12px",
  /** A hero tile, a modal, and nothing smaller. */
  "tile-hero": "16px"
} as const

export type RadiusToken = keyof typeof radius

/**
 * What each radius is for, in the same shape as `easingUse` and for the same reason: the brand kit
 * documents the system, and a JSDoc comment is not something a page can render.
 */
export const radiusUse: Record<RadiusToken, string> = {
  pill: "Status pills only. A pill is never a button.",
  chip: "Chips, and the smallest affordances.",
  control: "Buttons, inputs, selects, menu items — anything you operate.",
  tile: "Tiles, panels, the frame around a table.",
  "tile-hero": "A hero tile, a modal, and nothing smaller."
}

/**
 * The type faces.
 *
 * `display` exists now, and earns it. The legacy system declared `--font-display` and `--font-sans` as
 * byte-identical stacks, with a `.font-display` class whose only effect was `letter-spacing: -0.02em`,
 * and applied it across every marketing page — a distinction that cost a token and bought nothing.
 * This system's second face is not that: it is a different face with a different width, set only on
 * the monumental figure and on plate numbers, and `mono` is gone because nothing in the product is
 * allowed to claim its characters are data by wearing a typewriter.
 *
 * General Sans leads the stack as a statement of intent, not as a loaded font: the legacy app fetched
 * it from `api.fontshare.com` as a render-blocking third-party stylesheet, and whether ITF's licence
 * permits self-hosting is unresolved. Until it is, Inter is what actually loads, and the fallback is
 * metric-close enough that resolving it later does not reflow the page.
 */
/**
 * The type scale. Eleven steps, and nothing between them.
 *
 * The console had no scale at all: 27 distinct sizes written as arbitrary utilities, including
 * `text-[12.5px]`, `text-[11.5px]`, `text-[13.5px]`, `text-[10.5px]` and `text-[9px]`. Half-pixel
 * sizes are the signature of a value nudged until one screen looked right, and they do not survive
 * contact with a second screen. DESIGN.md already bans arbitrary values in `packages/ui/marketing`;
 * the console was never held to the same rule, so this is that rule given something to point at.
 *
 * Two deliberate choices, both from Operate mode:
 *
 * - **Fixed px, not fluid.** An operator reads this at one DPI all day. A `clamp()` heading that
 *   shrinks inside a panel looks worse, not better, and a figure that changes size between two
 *   screens is a figure somebody has to re-read.
 * - **A tight ratio, about 1.15.** There are more type roles in a tool than on a page, so wide
 *   steps turn into noise. The contrast that matters here is weight and colour, not size.
 *
 * The bottom of the scale moved UP. `sm` was carrying dense rows at 12px and `base` was 13px, both
 * under `ink-3`, which is the combination that reads as thin and grey. Density is bought back in
 * row height and padding, where it belongs: ClickUp and Linear both run 13–14px text in 32–36px
 * rows. Small type is not what makes a table compact; a tall row is what makes it loose.
 */
export const text = {
  /** A count in a badge, a tick on an axis. Not prose, ever. */
  "2xs": { size: "11px", line: "14px", tracking: "0em" },
  /** Column heads, timestamps, units, the quiet half of a two-line cell. */
  xs: { size: "12px", line: "16px", tracking: "-0.005em" },
  /** Dense rows, chips, menu items, anything in a list the eye runs down. */
  sm: { size: "13px", line: "18px", tracking: "-0.01em" },
  /** The default. Body, inputs, buttons, the line of a row that carries the record. */
  base: { size: "14px", line: "20px", tracking: "-0.011em" },
  /** One sentence under a title, and the largest size still set at 400. */
  md: { size: "15px", line: "22px", tracking: "-0.014em" },
  /** A section heading inside a page or a modal. */
  lg: { size: "17px", line: "24px", tracking: "-0.018em" },
  /** The page title. One per screen. */
  xl: { size: "20px", line: "26px", tracking: "-0.022em" },
  /** A modal's title, and the label beside a screen figure. */
  "2xl": { size: "24px", line: "30px", tracking: "-0.026em" },
  /** A screen's figure, where the screen has one. */
  "3xl": { size: "30px", line: "34px", tracking: "-0.03em" },
  /** Between the figure and the monument. */
  "4xl": { size: "40px", line: "44px", tracking: "-0.034em" },
  /** The monumental figure on the dashboard, set in the display face. Nothing else. */
  "5xl": { size: "60px", line: "60px", tracking: "-0.038em" }
} as const

export type TextToken = keyof typeof text

/** What each step is for, for the brand kit's type page. */
export const textUse: Record<TextToken, string> = {
  "2xs": "A count in a badge, a tick on an axis. Never prose.",
  xs: "Column heads, timestamps, units, the quiet half of a two-line cell.",
  sm: "Dense rows, chips, menu items — anything in a list the eye runs down.",
  base: "The default: body, inputs, buttons, the line of a row that carries the record.",
  md: "One sentence under a title. The largest size still set at 400.",
  lg: "A section heading inside a page or a modal.",
  xl: "The page title. One per screen.",
  "2xl": "A modal's title, and the label beside a screen figure.",
  "3xl": "A screen's figure, where the screen has one.",
  "4xl": "Between the figure and the monument.",
  "5xl": "The monumental figure, in the display face. Nothing else."
}

export const fonts = {
  sans: "\"General Sans\", \"Inter Variable\", system-ui, -apple-system, sans-serif",
  /**
   * The monumental figure, and plate numbers. Archivo at a narrow width setting, because the world
   * this product is drawn in is a technical drawing and its lettering is monoline and slightly
   * narrow — ISO 3098, in a face that is obtainable and self-hostable.
   *
   * It is a second face with a real job, which is what the note above says the system has to earn
   * before it has one. It is used at two places and nowhere else.
   */
  display: "\"Archivo Variable\", \"Inter Variable\", system-ui, sans-serif"
} as const

/**
 * Motion, tokenised for the same reason colour is: the stylesheet, the components and the brand kit
 * all state these, and a brand page that documents a different curve than the product uses is worse
 * than no brand page.
 *
 * Exponential ease-out. No bounce, no elastic, and everything built on these honours
 * `prefers-reduced-motion`.
 */
export const easings = {
  /** The default for anything arriving or changing state. */
  "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
  /** A longer arrival: something crossing a meaningful distance. */
  "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Ambient only — the mesh drift. Symmetrical because it never arrives. */
  mesh: "cubic-bezier(0.4, 0, 0.6, 1)"
} as const

export type EasingToken = keyof typeof easings

/** What each curve is for, so the brand kit reads it rather than restating it. */
export const easingUse: Record<EasingToken, { readonly name: string; readonly use: string }> = {
  "out-quart": { name: "Out, quart", use: "The default: anything arriving or changing state." },
  "out-expo": { name: "Out, expo", use: "A longer arrival, crossing a meaningful distance." },
  mesh: { name: "Mesh", use: "Ambient only — the drifting mesh. Symmetrical because it never arrives." }
}

/**
 * Milliseconds.
 *
 * Six, and the last two are not siblings of the first four: `scan` is six seconds and `ambient` is
 * eighteen, because both describe something ambient rather than something arriving. They are in the
 * same object so that nothing invents a seventh value inline.
 */
export const durations = {
  /** A tap, immediate feedback. */
  instant: 80,
  /** A hover, a state shift on something already on screen. */
  quick: 160,
  /** The default for anything entering or leaving. */
  base: 240,
  /** An enter animation, a fade-up. */
  slow: 420,
  /** The rule travelling down a plate's drafting grid. */
  scan: 6_000,
  /** Ambient drift only. */
  ambient: 18_000
} as const

export type DurationToken = keyof typeof durations

/** What each duration is for. See `radiusUse`. */
export const durationUse: Record<DurationToken, string> = {
  instant: "A tap: immediate feedback.",
  quick: "A hover, or a state shift on something already on screen.",
  base: "The default for anything entering or leaving.",
  slow: "An enter animation, a fade-up.",
  scan: "The rule travelling down a plate's drafting grid, like a drawing being scanned.",
  ambient: "Ambient drift only — the mesh, which never arrives."
}
