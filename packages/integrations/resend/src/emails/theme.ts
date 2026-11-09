import { oklchToHex, oklchToRgb } from "@insyte/tokens/color"
import { colors, type ColorToken, darkColors, fonts, radius, text, type TextToken } from "@insyte/tokens/tokens"

/*
 * The mails' brand values, read from `@insyte/tokens` and nowhere else. Mail clients know no OKLCH and no custom
 * properties, so every colour leaves here as hex; a value written by hand in a template is a defect (the test reads the
 * rendered HTML for colours that are not in this palette).
 *
 * What the mails may use, and why only these: the three surfaces (`glacier` page, `paper` letter, `mist` well), the
 * three text inks, `arc-ink` for a link, `abyss` for the one button and the plate, the mesh ramp for ink on `abyss`,
 * and the amber signal pair for a warning that carries its word. No black (the ink ramp stops at `ink`, 0.28), no
 * pink or green on text, and nothing solid white on the blue: on `abyss` the brightest ink is `mesh-ink`.
 */

const hexOf = <K extends string>(map: Readonly<Record<K, string>>): Readonly<Record<K, string>> =>
  Object.fromEntries(Object.entries<string>(map).map(([key, value]) => [key, oklchToHex(value)])) as Record<K, string>

/** Daylight, the mails' own theme: what Gmail, Outlook and most clients show. */
export const light: Readonly<Record<ColorToken, string>> = hexOf(colors)

/** Night, for the clients that honour `prefers-color-scheme` (Apple Mail, Outlook for Mac, iOS Mail). */
export const dark: Readonly<Record<ColorToken, string>> = hexOf(darkColors)

/** `over` laid over `ground` at `alpha`, flattened to hex: the mark's translucent squares, for clients without alpha. */
export const mix = (over: ColorToken, ground: ColorToken, alpha: number): string => {
  const a = oklchToRgb(colors[over])
  const b = oklchToRgb(colors[ground])
  const byte = (x: number, y: number) => Math.round((x * alpha + y * (1 - alpha)) * 255).toString(16).padStart(2, "0")
  return `#${byte(a.r, b.r)}${byte(a.g, b.g)}${byte(a.b, b.b)}`
}

/**
 * The tokens' faces, with the fallbacks a mail client actually has. General Sans and Inter are not installed on most
 * machines and webfonts are not loaded (Gmail ignores them, and fetching a font from a third party tells it who opened
 * the mail), so the system sans carries the text: San Francisco on Apple, Segoe UI on Windows, then Helvetica, Arial.
 */
const SYSTEM = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif"
const withSystem = (stack: string) =>
  [...new Set(`${stack}, Inter, ${SYSTEM}`.split(",").map((face) => face.trim()))]
    .filter((face) => face !== "sans-serif")
    .concat("sans-serif")
    .join(", ")
export const font = {
  sans: withSystem(fonts.sans),
  display: withSystem(fonts.display)
} as const

/** A type role from the tokens' scale: size, line height and tracking together, as the console asks for them. */
export const type = (role: TextToken) => ({
  fontSize: text[role].size,
  lineHeight: text[role].line,
  letterSpacing: text[role].tracking
})

export const corner = radius

/** The letter's width: 65–75 characters of 15px body text. */
export const WIDTH = 560
