import { useSyncExternalStore } from "react"

/**
 * The workspace's look: which accent the customer chose and whether it is light or dark. Two
 * attributes on `<html>` (`data-accent`, `data-theme`) and nothing else: every token in `tokens.css`
 * reads them, so switching repaints the whole page without a component knowing. Remembered per
 * browser in the demo; in the product it belongs to the workspace (accent) and the person (mode).
 */

/** A customer theme (the picker in the avatar menu offers these four). */
export type CustomerAccent = "teal" | "petrol" | "pruim" | "grafiet"
/**
 * A palette direction's own accent (`brand/directions.ts`), for comparing directions in the
 * Varianten panel (`shell/variants.tsx`). Same mechanism, same tokens; not offered to customers.
 */
export type DirectionAccent = "magenta" | "groen" | "geel" | "markeer" | "koraal" | "roos" | "limoen" | "zwart"
export type Accent = CustomerAccent | DirectionAccent
export type Mode = "light" | "dark"

export type AccentOption = {
  readonly value: Accent
  readonly label: string
  /** The hue in words, for the picker's title and the kit. */
  readonly note: string
}

export const ACCENTS: ReadonlyArray<AccentOption & { readonly value: CustomerAccent }> = [
  { value: "teal", label: "Teal", note: "Insytes eigen rustige blauwgroen, de standaard" },
  { value: "petrol", label: "Petrol", note: "Diep, gedempt blauwgroen" },
  { value: "pruim", label: "Pruim", note: "Diep paarsrood" },
  { value: "grafiet", label: "Grafiet", note: "Geen kleur: een donkergrijs accent" }
]

/**
 * The directions' accents, as blocks in `tokens.css` like the four above. Blue, indigo, violet and
 * cyan are left out on purpose (Spectrum's Indigo and Violet, Primair's Blauw, Drukinkt's Cyaan):
 * no blue or violet in the chrome. A light fill (Geel, Markeergeel, Limoen) cannot be text or a
 * ring, so its accent is the direction's ink and its wash the light colour itself.
 */
export const DIRECTION_ACCENTS: ReadonlyArray<AccentOption> = [
  { value: "magenta", label: "Magenta", note: "Spectrum en Drukinkt" },
  { value: "groen", label: "Groen", note: "Primair" },
  { value: "geel", label: "Geel", note: "Primair: oker als tekst, geel als vlak" },
  { value: "markeer", label: "Markeergeel", note: "Markeerstift: grafiet-olijf als tekst, markeergeel als vlak" },
  { value: "koraal", label: "Koraal", note: "Koraal" },
  { value: "roos", label: "Roos", note: "Koraal" },
  { value: "limoen", label: "Limoen", note: "Lagune: olijf als tekst, limoen als vlak" },
  { value: "zwart", label: "Zwart", note: "Drukinkt: de zwarte inkt" }
]

/** Every accent the tokens define, customer themes first. */
export const ALL_ACCENTS: ReadonlyArray<AccentOption> = [...ACCENTS, ...DIRECTION_ACCENTS]

export const MODES: ReadonlyArray<{ readonly value: Mode; readonly label: string }> = [
  { value: "light", label: "Licht" },
  { value: "dark", label: "Donker" }
]

export const DEFAULT_ACCENT: Accent = "teal"

const KEY = "insyte:v2:theme"
const CHANGE = "v2:theme"

export type Theme = { readonly accent: Accent; readonly mode: Mode }

export const isAccent = (v: unknown): v is Accent => ALL_ACCENTS.some((a) => a.value === v)
export const isMode = (v: unknown): v is Mode => v === "light" || v === "dark"

/** The theme on the root now. */
export function readTheme(): Theme {
  const root = document.documentElement
  const accent = root.dataset["accent"]
  const mode = root.dataset["theme"]
  return { accent: isAccent(accent) ? accent : DEFAULT_ACCENT, mode: isMode(mode) ? mode : "light" }
}

function apply({ accent, mode }: Theme) {
  const root = document.documentElement
  root.dataset["accent"] = accent
  root.dataset["theme"] = mode
  root.classList.toggle("dark", mode === "dark")
  root.classList.toggle("light", mode === "light")
}

/** Puts the remembered theme on the root before the first paint (called from `main.tsx`). */
export function applyStoredTheme() {
  let theme: Theme = { accent: DEFAULT_ACCENT, mode: "light" }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === "object" && parsed !== null) {
        const p = parsed as Record<string, unknown>
        theme = {
          accent: isAccent(p["accent"]) ? p["accent"] : DEFAULT_ACCENT,
          mode: isMode(p["mode"]) ? p["mode"] : "light"
        }
      }
    }
  } catch {
    // Storage blocked or garbled: the default theme.
  }
  apply(theme)
}

/** Puts a theme on the root, remembers it and tells every picker (the Varianten panel uses it). */
export function setTheme(next: Theme) {
  apply(next)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Not remembered; the page still switches.
  }
  window.dispatchEvent(new Event(CHANGE))
}

/** For a store that follows the theme (`variants.ts`). */
export function subscribeTheme(onChange: () => void) {
  window.addEventListener(CHANGE, onChange)
  return () => window.removeEventListener(CHANGE, onChange)
}

const snapshot = () => {
  const { accent, mode } = readTheme()
  return `${accent}:${mode}`
}

export function useTheme() {
  const key = useSyncExternalStore(subscribeTheme, snapshot)
  const [accent, mode] = key.split(":") as [Accent, Mode]
  return {
    accent,
    mode,
    setAccent: (next: Accent) => setTheme({ accent: next, mode }),
    setMode: (next: Mode) => setTheme({ accent, mode: next })
  } as const
}
