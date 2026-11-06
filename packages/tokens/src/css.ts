import { colors, darkColors, durations, easings, fonts, pattern, radius, text } from "./tokens.ts"

/**
 * The stylesheet, rendered from the tokens.
 *
 * Here rather than in `build.ts` so it can be tested without running the CLI, and so the one thing in
 * this package with logic in it is typed.
 */

/**
 * Which token each shadcn slot resolves to.
 *
 * Generated rather than hand-written, which is the whole point: the legacy stylesheet declared every
 * value three or four times — canonical, shadcn slot, a legacy alias, and a `@theme` re-export — and
 * nothing kept them agreeing. Here a slot is a pointer, so there is one value and several names for
 * where it is used.
 *
 * `accent` is the interesting one. shadcn uses `--accent` for hover backgrounds, not for a brand
 * colour, so it points at `arc-tint` — the informational tint — and never at `arc`. Pointing it at the
 * brand hue is how every shadcn project ends up with blue hover states it never asked for.
 */
export const slots = {
  background: "glacier",
  foreground: "ink",
  card: "paper",
  "card-foreground": "ink",
  popover: "paper",
  "popover-foreground": "ink",
  primary: "abyss",
  "primary-foreground": "mesh-ink",
  secondary: "mist",
  "secondary-foreground": "ink",
  muted: "mist",
  "muted-foreground": "ink-3",
  accent: "arc-tint",
  "accent-foreground": "ink",
  destructive: "signal-red",
  "destructive-foreground": "paper",
  border: "hairline",
  input: "hairline-strong",
  ring: "arc"
} as const satisfies Record<string, keyof typeof colors>

/**
 * Tailwind's radius scale, mapped onto the roles rather than sitting beside them.
 *
 * Exported because the brand kit names the utility beside each role, and a brand page that says
 * `rounded-lg` where the stylesheet says something else is the kind of wrong that outlives whoever
 * wrote it.
 */
export const radiusScale = {
  sm: "chip",
  md: "control",
  lg: "tile",
  xl: "tile-hero"
} as const satisfies Record<string, keyof typeof radius>

/** One `--name: value;` line per colour, at the indent the block it lands in wants. */
const declare = (map: Record<string, string>, indent: string): string =>
  Object.entries(map).map(([name, value]) => `${indent}--${name}: ${value};`).join("\n")

export const renderCss = (): string => {
  const values = declare(colors, "  ")
  const dark = declare(darkColors, "    ")
  const light = declare(colors, "  ")

  const slotDecls = Object.entries(slots).map(([slot, token]) => `  --${slot}: var(--${token});`).join("\n")

  const radii = Object.entries(radius).map(([name, value]) => `  --radius-${name}: ${value};`).join("\n")

  // Tailwind 4 reads `@theme inline` to build its utility classes, so every token appears twice: once
  // as the value, once as the utility it backs.
  const colorUtilities = Object.keys(colors).map((name) => `  --color-${name}: var(--${name});`).join("\n")
  const slotUtilities = Object.keys(slots).map((slot) => `  --color-${slot}: var(--${slot});`).join("\n")
  const radiusUtilities = Object.entries(radiusScale)
    .map(([name, role]) => `  --radius-${name}: ${radius[role]};`)
    .join("\n")
  // Tailwind reads all three sub-keys, so `text-sm` carries its own line-height and tracking and the
  // call site stops writing `text-[13px] leading-[18px] tracking-[-0.01em]` three utilities wide.
  const textUtilities = Object.entries(text)
    .map(([name, v]) =>
      `  --text-${name}: ${v.size};\n  --text-${name}--line-height: ${v.line};\n  --text-${name}--letter-spacing: ${v.tracking};`
    )
    .join("\n")

  const easingUtilities = Object.entries(easings).map(([name, value]) => `  --ease-${name}: ${value};`).join("\n")
  const durationUtilities = Object.entries(durations)
    .map(([name, value]) => `  --duration-${name}: ${value}ms;`)
    .join("\n")

  return `/* Generated from src/tokens.ts by \`bun build.ts\`. Do not edit. */

:root {
${values}

${slotDecls}

${radii}
  /* shadcn's own baseline, which its primitives read directly. The control radius is the one a
     button and an input use, so that is what it points at. */
  --radius: ${radius.control};

  /* The two drawn fields. Their pitch is a token because the brand kit states it and the stylesheet
     paints it, and the two disagreeing is how a pattern page goes stale. */
  --pattern-grid: ${pattern.grid};
  --pattern-hatch: ${pattern.hatch};
}

/* Both themes are equals, so the dark map is the same names at night rather than an override list.
   The media query is guarded by \`:not(.light)\` so an explicit daylight choice beats the system
   preference, and \`.dark\` sets it outright for an explicit night choice. Order matters: the class
   comes last so it wins at equal specificity. */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
${dark}
  }
}

.dark {
${dark}
}

/* And the mirror of it. \`.light\` has to RESTATE the daylight map rather than only negate the media
   query, because the two classes are used for two different jobs: at \`:root\` they choose the theme,
   but on an element they scope one — a thumbnail that previews the night theme while the app is in
   daylight, or the reverse. A \`.light\` that is only a negation cannot do the second. */
.light {
${light}
}

@theme inline {
${colorUtilities}

${slotUtilities}

  /* The type scale. Eleven steps and nothing between them, each carrying its own line-height and
     tracking so a call site asks for a ROLE rather than re-deriving three values. Tailwind's own
     default scale is overwritten here on purpose: two scales under one set of names is how the
     legacy stylesheet ended up with rounded-xl meaning two different things. */
${textUtilities}

  /* Tailwind's radius scale, mapped ONTO the five roles rather than sitting beside them. The legacy
     stylesheet shipped both ladders at once, so \`rounded-xl\` and \`rounded-tile\` were different
     things and no one could say which was correct. */
${radiusUtilities}

  --font-sans: ${fonts.sans};
  --font-display: ${fonts.display};

${easingUtilities}

${durationUtilities}
}
`
}
