import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { contrast, isInGamut, oklchToHex, oklchToRgb, UnparseableColor } from "../src/color.ts"
import { renderCss } from "../src/css.ts"
import {
  colors,
  darkColors,
  durations,
  durationUse,
  easings,
  easingUse,
  families,
  pairs,
  pattern,
  patternUse,
  radius,
  radiusUse
} from "../src/tokens.ts"

describe("the palette survives sRGB", () => {
  /*
   * The gate for the whole design phase, and it is not hypothetical here.
   *
   * EIGHT of the legacy palette's twenty-six colours were outside sRGB, so the browser clipped them
   * and what rendered had never been what was written — `abyss`, the primary call to action, among
   * them, with its green channel clamped to exactly zero. Every value in this file was re-derived
   * against this assertion.
   */
  it.each(Object.entries(colors))("%s is inside the gamut", (name, value) => {
    expect(isInGamut(value), `${name} (${value} -> ${oklchToHex(value)}) is clipped by the browser`).toBe(true)
  })

  it("rejects anything that is not an oklch colour, rather than guessing", () => {
    expect(() => oklchToRgb("#ff0000")).toThrow(UnparseableColor)
    expect(() => oklchToRgb("rgb(1 2 3)")).toThrow(UnparseableColor)
  })
})

describe("every declared pair is readable", () => {
  /*
   * 4.5:1 is the floor PRODUCT.md commits to for body text, and status inks are only ever seen as
   * small text on their own tint, so they are held to the same bar rather than to the 3:1 for large
   * text. Two of the three failed it after their chroma was clamped into gamut — amber at 3.39:1 —
   * which is why their lightness moved.
   */
  it.each(pairs)("%s carries %s at AA", (surface, ink) => {
    const ratio = contrast(colors[surface], colors[ink])

    expect(ratio, `${surface} / ${ink} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })

  it("pairs only name tokens that exist", () => {
    for (const [surface, ink] of pairs) {
      expect(colors).toHaveProperty(surface)
      expect(colors).toHaveProperty(ink)
    }
  })

  it("leaves the atmosphere colours unpaired, because nothing may put text on them", () => {
    /*
     * Widened to `string` on purpose. `pairs.flat()` is narrowed to exactly the tokens that appear in
     * it, so `paired.has("sky")` is a COMPILE error rather than a passing assertion — which is the
     * stronger guarantee, and also why this has to be loosened to test it at all. If `sky` is ever
     * added to a pair, the compiler fails on this line before the test does.
     */
    const paired: ReadonlySet<string> = new Set<string>(pairs.flat())

    expect(paired.has("sky")).toBe(false)
    expect(paired.has("powder")).toBe(false)
  })
})

describe("the system stays small", () => {
  it("has no two names for one colour", () => {
    // The legacy stylesheet carried roughly 150 tokens for about 40 values: a canonical name, a
    // shadcn slot, a legacy alias and a `@theme` re-export each. Slots are generated now, so a
    // duplicate value here means a genuine second name for one colour.
    //
    // Two names are the same name only if they agree in BOTH themes. `arc` and `arc-ink` are one
    // value by day and two by night, and that IS the distinction: `arc` is a field and holds still
    // so the brand does not change hue when the lights go off, while `arc-ink` is the brand used as
    // text and has to lift to stay legible on a dark ground. A check that read the daylight map
    // alone would call that an alias and push the product back to `text-arc` at 2.24:1.
    const seen = new Map<string, string>()

    for (const [name, value] of Object.entries(colors)) {
      const key = `${value} / ${(darkColors as Record<string, string>)[name]}`
      const existing = seen.get(key)
      expect(existing, `${name} and ${existing} are the same colour in both themes`).toBeUndefined()
      seen.set(key, name)
    }
  })

  it("keeps one radius ladder, mapped onto the five roles", () => {
    expect(Object.keys(radius)).toHaveLength(5)

    const css = renderCss()
    // Tailwind's scale must POINT AT the roles, never introduce a sixth value beside them.
    expect(css).toContain(`--radius-sm: ${radius.chip};`)
    expect(css).toContain(`--radius-md: ${radius.control};`)
    expect(css).toContain(`--radius-lg: ${radius.tile};`)
    expect(css).toContain(`--radius-xl: ${radius["tile-hero"]};`)
    expect(css).not.toContain("--radius-2xl")
    expect(css).not.toContain("--radius-3xl")
  })

  it("documents every easing it ships", () => {
    expect(Object.keys(easingUse).toSorted()).toEqual(Object.keys(easings).toSorted())
  })

  it("keeps the durations ordered, so a bigger name is never a shorter time", () => {
    const values = Object.values(durations)

    expect(values.toSorted((a, b) => a - b)).toEqual(values)
  })
})

describe("the generated stylesheet", () => {
  it("is in sync with the tokens", () => {
    const onDisk = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8")

    expect(onDisk, "src/tokens.css is stale. Run `bun run --filter @insyte/tokens build:css`.").toBe(renderCss())
  })

  it("points shadcn's accent at the informational tint, not at the brand hue", () => {
    // shadcn uses --accent for hover backgrounds. Pointing it at `arc` is how a project ends up with
    // blue hover states nobody asked for.
    expect(renderCss()).toContain("--accent: var(--arc-tint);")
  })

  it("declares every colour exactly once per theme block", () => {
    // The guard is against one NAME carrying two values in the same scope, which is how the legacy
    // stylesheet reached ~150 tokens. It is not against a name appearing in several scopes: `:root`,
    // `.light` and `.dark` each state the whole palette by design, which is what lets a subtree be
    // scoped to one theme while the page is in the other. So count within a block, not across the
    // file — the earlier version counted by indent and silently assumed only `:root` used two spaces.
    const css = renderCss()
    const blocks = [...css.matchAll(/(?:^|\n)(:root|\.light|\.dark) \{\n([\s\S]*?)\n\}/g)]

    expect(blocks.map((b) => b[1])).toEqual([":root", ".dark", ".light"])

    for (const [, selector, body] of blocks) {
      for (const name of Object.keys(colors)) {
        const declarations = body!.match(new RegExp(`^\\s*--${name}: `, "gm")) ?? []

        expect(declarations, `${selector} declares --${name} ${declarations.length} times`)
          .toHaveLength(1)
      }
    }
  })
})

describe("the palette is documented", () => {
  /*
   * The brand kit renders a family at a time, so a colour in no family is a colour the page that
   * documents the system silently leaves out — and a colour in two is a page that contradicts
   * itself. Both are the failure the legacy brand book had: nineteen marks, a two-generations-stale
   * palette, and no way to tell.
   */
  it("puts every colour in exactly one family", () => {
    const placed = families.flatMap((family) => family.members)

    expect(placed.toSorted()).toEqual(Object.keys(colors).toSorted())
    expect(new Set(placed).size, "a colour appears in two families").toBe(placed.length)
  })

  it("gives every family a stated use", () => {
    for (const family of families) {
      expect(family.use.length, `${family.name} has no stated use`).toBeGreaterThan(20)
      expect(family.members.length, `${family.name} is empty`).toBeGreaterThan(0)
    }
  })
})

describe("the roles are documented too", () => {
  // Same guarantee `easingUse` gets: the brand kit renders these, so a role without a use renders
  // as a number with nothing beside it, and a stale entry outlives the token it described.
  it("documents every radius, and no radius that does not exist", () => {
    expect(Object.keys(radiusUse).toSorted()).toEqual(Object.keys(radius).toSorted())
  })

  it("documents every duration, and no duration that does not exist", () => {
    expect(Object.keys(durationUse).toSorted()).toEqual(Object.keys(durations).toSorted())
  })
})

describe("the night theme is the day theme's equal, not its override", () => {
  /*
   * The whole reason the dark values are a parallel map under the same names rather than a set of
   * `-dark` tokens: this assertion is possible. A colour added to one map and forgotten in the other
   * fails here, instead of silently rendering its daylight value on a dark ground — which is what an
   * override list does, and which nobody notices until a customer does.
   */
  it("carries exactly the same names", () => {
    expect(Object.keys(darkColors).toSorted()).toEqual(Object.keys(colors).toSorted())
  })

  it.each(Object.entries(darkColors))("%s is inside the gamut", (name, value) => {
    expect(isInGamut(value), `${name} (${value} -> ${oklchToHex(value)}) is clipped by the browser`).toBe(true)
  })

  it.each(pairs)("%s still carries %s at AA", (surface, ink) => {
    const ratio = contrast(darkColors[surface], darkColors[ink])

    expect(ratio, `${surface} / ${ink} is ${ratio.toFixed(2)}:1 at night`).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps the brand still", () => {
    // A brand that changes hue when the lights go off is two brands. `arc` is only ever a filled
    // field here, never inline text, so it has no legibility reason to lift: the ink on it does,
    // and that ink is `mesh-ink`, which is near-white in both maps for exactly this reason.
    for (const token of ["arc", "abyss", "abyss-2", "mesh-ink"] as const) {
      expect(darkColors[token], `${token} moved at night`).toBe(colors[token])
    }
  })

  it("inverts the surfaces rather than tinting them", () => {
    // The ladder still runs canvas -> lifted -> brightest; it runs upward from dark instead of
    // downward from white, and every neutral stays chroma 0 so the only colour is still the brand.
    const lightness = (value: string) => Number(value.slice("oklch(".length).split(" ")[0])

    expect(lightness(darkColors.glacier)).toBeLessThan(lightness(darkColors.mist))
    expect(lightness(darkColors.mist)).toBeLessThan(lightness(darkColors.paper))
    expect(lightness(darkColors.paper)).toBeLessThan(lightness(colors.glacier))

    for (const token of ["glacier", "mist", "paper", "ink", "ink-2", "ink-3", "ink-4", "ink-5"] as const) {
      expect(darkColors[token], `${token} picked up a hue at night`).toContain(" 0 0)")
    }
  })

  it("renders both themes into the stylesheet, with an explicit choice beating the system", () => {
    const css = renderCss()

    // Guarded so a visitor who has chosen daylight gets daylight on a machine set to dark, and the
    // class comes last so it wins at equal specificity.
    expect(css).toContain("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {")
    expect(css.indexOf(".dark {")).toBeGreaterThan(css.indexOf("@media (prefers-color-scheme: dark)"))
    expect(css).toContain(`    --glacier: ${darkColors.glacier};`)
  })
})

describe("the drawn fields", () => {
  it("documents every pattern, and no pattern that does not exist", () => {
    expect(Object.keys(patternUse).toSorted()).toEqual(Object.keys(pattern).toSorted())
  })

  it("keeps the two pitches from beating against each other", () => {
    // `grid` is four hatch steps less one, so the drafting grid and the mark's hatch never line up
    // into a third, accidental pattern where they overlap.
    const px = (value: string) => Number(value.replace("px", ""))

    expect(px(pattern.grid) % px(pattern.hatch)).not.toBe(0)
    expect(px(pattern.hatch) % px(pattern.grid)).not.toBe(0)
  })

  it("ships no monospace face, because nothing is allowed to claim its characters are data", () => {
    expect(renderCss()).not.toContain("--font-mono")
    expect(renderCss()).toContain("--font-display")
  })
})

/*
 * The ramp's own rule, which `pairs` cannot express.
 *
 * `pairs` names surface-and-ink combinations somebody chose to declare. It says nothing about the
 * ink ramp's five steps landing on the three neutral grounds, which is where almost all the text in
 * the product actually sits — and that is exactly where it was failing: `ink-4` at 2.60:1 and
 * `ink-5` at 1.84:1 against `glacier`, used as text in 280 places, with `ink-3` at 3.87:1 feeding
 * `--muted-foreground` and therefore every secondary line on every screen.
 *
 * So the rule is written down as a test rather than as a comment. The first three steps carry text
 * and must clear AA on every ground in both themes; the last two must NOT, because a step that
 * passes is a step somebody will reach for, and the ramp needs a bottom that is honestly non-text.
 */
describe("only three of the five ink steps may carry text", () => {
  const grounds = ["glacier", "mist", "paper"] as const
  const text = ["ink", "ink-2", "ink-3"] as const
  const notText = ["ink-4", "ink-5"] as const

  describe.each([["day", colors], ["night", darkColors]] as const)("%s", (_, map) => {
    it.each(text.flatMap((ink) => grounds.map((ground) => [ink, ground] as const)))(
      "%s clears AA on %s",
      (ink, ground) => {
        expect(contrast(map[ink], map[ground])).toBeGreaterThanOrEqual(4.5)
      }
    )

    it.each(notText)("%s is below AA on at least one ground, so it is not text", (ink) => {
      const worst = Math.min(...grounds.map((ground) => contrast(map[ink], map[ground])))
      expect(worst).toBeLessThan(4.5)
    })
  })

  it("says in the source which steps are not text", () => {
    const source = readFileSync(new URL("../src/tokens.ts", import.meta.url), "utf8")
    for (const ink of notText) {
      const declaration = source.indexOf(`"${ink}":`)
      expect(declaration).toBeGreaterThan(-1)
      // The docstring immediately above it, which is the only place a reader looks.
      expect(source.slice(declaration - 220, declaration)).toContain("NOT text")
    }
  })
})
