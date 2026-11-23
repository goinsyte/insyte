import { useSyncExternalStore } from "react"
import { DIRECTIONS } from "./brand/directions.ts"
import { ACCENTS, ALL_ACCENTS, DEFAULT_ACCENT, isAccent, readTheme, setTheme, subscribeTheme } from "./ui/theme.ts"
import type { Accent, AccentOption, Mode } from "./ui/theme.ts"

/**
 * Varianten: versions of the founder's own direction, side by side on every screen. Each choice is
 * an attribute on `<html>` that re-points tokens (`tokens.css`, `v2.css`); no screen knows about it.
 * The accent and light or dark are the theme's own (`ui/theme.ts`), not a second theme system.
 *
 *   data-direction  the palette direction: the AI gradient's stops and the marks' colours
 *   data-accent     the accent (theme.ts): a customer theme or one of the direction's own
 *   data-theme      light or dark (theme.ts)
 *   data-rail       the icon rail: dark (no attribute), licht or kleur
 *   data-bar        the main bar: the menu's grey (no attribute) or inhoud, the work surface
 *   data-density    compact or ruim (no attribute: the kit's own heights)
 *   data-logo       the mark in the store switcher and the rail (no attribute: the store's letter)
 *
 * Remembered in this browser and written into the address as `?v=`, so a link carries the exact
 * variant: `?v=lagune.petrol.licht.ruim`. On load the address wins over what was remembered.
 */

export type DirectionId = "huis" | "spectrum" | "primair" | "markeerstift" | "koraal" | "lagune" | "drukinkt"
export type RailTone = "donker" | "licht" | "kleur"
export type BarTone = "menu" | "inhoud"
export type Density = "compact" | "standaard" | "ruim"
export type Logo = "winkel" | "insyte" | "insyte-mono" | "blend" | "magnus"

export type Variant = {
  readonly direction: DirectionId
  readonly accent: Accent
  readonly mode: Mode
  readonly rail: RailTone
  readonly bar: BarTone
  readonly density: Density
  readonly logo: Logo
}

export const DEFAULT_VARIANT: Variant = {
  direction: "huis",
  accent: DEFAULT_ACCENT,
  mode: "light",
  rail: "donker",
  bar: "menu",
  density: "standaard",
  logo: "winkel"
}

/**
 * Which accents a direction brings, its first being what choosing the direction sets. Blue, indigo,
 * violet and cyan are left out (no blue or violet in the chrome): Spectrum's Indigo and Violet,
 * Primair's Blauw, Drukinkt's Cyaan. Lagune's teal is the house teal.
 */
const DIRECTION_ACCENT: Readonly<Record<DirectionId, ReadonlyArray<Accent>>> = {
  huis: ["teal"],
  spectrum: ["magenta"],
  primair: ["groen", "geel"],
  markeerstift: ["markeer", "grafiet"],
  koraal: ["pruim", "koraal", "roos"],
  lagune: ["petrol", "teal", "limoen"],
  drukinkt: ["magenta", "zwart"]
}

export const DIRECTION_OPTIONS: ReadonlyArray<{ readonly value: DirectionId; readonly label: string }> = [
  { value: "huis", label: "Huisstijl" },
  ...DIRECTIONS.map((d) => ({ value: d.id as DirectionId, label: d.name }))
]

export const RAIL_OPTIONS: ReadonlyArray<{ readonly value: RailTone; readonly label: string }> = [
  { value: "donker", label: "Donker" },
  { value: "licht", label: "Licht" },
  { value: "kleur", label: "Kleur" }
]

export const BAR_OPTIONS: ReadonlyArray<{ readonly value: BarTone; readonly label: string }> = [
  { value: "menu", label: "Als menu" },
  { value: "inhoud", label: "Als inhoud" }
]

export const DENSITY_OPTIONS: ReadonlyArray<{ readonly value: Density; readonly label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "standaard", label: "Standaard" },
  { value: "ruim", label: "Ruim" }
]

export const LOGO_OPTIONS: ReadonlyArray<{ readonly value: Logo; readonly label: string }> = [
  { value: "winkel", label: "Letter van de winkel" },
  { value: "insyte", label: "Insyte" },
  { value: "insyte-mono", label: "Insyte, één kleur" },
  { value: "blend", label: "Blended data" },
  { value: "magnus", label: "Magnus" }
]

/** The accents to offer under a direction: its own first, then the customer themes. */
export function accentsFor(direction: DirectionId): ReadonlyArray<AccentOption> {
  const own = DIRECTION_ACCENT[direction]
  const first = own.map((value) => ALL_ACCENTS.find((a) => a.value === value)).filter((a) => a !== undefined)
  return [...first, ...ACCENTS.filter((a) => !own.includes(a.value))]
}

const isOf = <T extends string>(options: ReadonlyArray<{ readonly value: T }>) => (v: unknown): v is T =>
  options.some((o) => o.value === v)

const isDirection = isOf(DIRECTION_OPTIONS)
const isRail = isOf(RAIL_OPTIONS)
const isBar = isOf(BAR_OPTIONS)
const isDensity = isOf(DENSITY_OPTIONS)
const isLogo = isOf(LOGO_OPTIONS)

/* ── the address ──────────────────────────────────────────────────────────────────────────────── */

/*
 * `?v=` is four places and then extras, Dutch words throughout:
 *
 *   richting . accent . licht|donker . compact|standaard|ruim [. iconen-licht|iconen-kleur] [. balk-inhoud] [. logo-…]
 *
 * The first four are always written, so a link reads the same way every time; the extras only when
 * they are not the default. A part that is not understood falls back to its default.
 */

const MODE_WORD: Readonly<Record<Mode, string>> = { light: "licht", dark: "donker" }

export function encodeVariant(v: Variant): string | null {
  if (isDefault(v)) return null
  const parts: Array<string> = [v.direction, v.accent, MODE_WORD[v.mode], v.density]
  if (v.rail !== "donker") parts.push(`iconen-${v.rail}`)
  if (v.bar !== "menu") parts.push(`balk-${v.bar}`)
  if (v.logo !== "winkel") parts.push(`logo-${v.logo}`)
  return parts.join(".")
}

export function decodeVariant(text: string): Variant {
  const [direction, accent, mode, density, ...extras] = text.trim().toLowerCase().split(".")
  const extra = (prefix: string) => extras.find((e) => e.startsWith(prefix))?.slice(prefix.length)
  const rail = extra("iconen-")
  const bar = extra("balk-")
  const logo = extra("logo-")
  return {
    direction: isDirection(direction) ? direction : DEFAULT_VARIANT.direction,
    accent: isAccent(accent) ? accent : DEFAULT_VARIANT.accent,
    mode: mode === "donker" ? "dark" : "light",
    density: isDensity(density) ? density : DEFAULT_VARIANT.density,
    rail: isRail(rail) ? rail : DEFAULT_VARIANT.rail,
    bar: isBar(bar) ? bar : DEFAULT_VARIANT.bar,
    logo: isLogo(logo) ? logo : DEFAULT_VARIANT.logo
  }
}

export const isDefault = (v: Variant) =>
  (Object.keys(DEFAULT_VARIANT) as Array<keyof Variant>).every((k) => v[k] === DEFAULT_VARIANT[k])

/** The address of this page with the variant in it (or without `v` when it is the default). */
export function variantHref(v: Variant, href = window.location.href): string {
  const url = new URL(href)
  const code = encodeVariant(v)
  if (code === null) url.searchParams.delete("v")
  else url.searchParams.set("v", code)
  return url.toString()
}

/** Keeps the address in step without a new history entry and without telling the router. */
export function syncAddress(v: Variant) {
  const next = variantHref(v)
  if (next !== window.location.href) window.history.replaceState(window.history.state, "", next)
}

/* ── the root ─────────────────────────────────────────────────────────────────────────────────── */

const KEY = "insyte:v2:varianten"
const CHANGE = "v2:varianten"

type Rest = Pick<Variant, "direction" | "rail" | "bar" | "density" | "logo">

/** Writes the attributes; a default removes its attribute, so the tokens' own values stand. */
function applyRoot(v: Rest) {
  const root = document.documentElement
  const set = (name: string, value: string, fallback: string) => {
    if (value === fallback) delete root.dataset[name]
    else root.dataset[name] = value
  }
  set("direction", v.direction, DEFAULT_VARIANT.direction)
  set("rail", v.rail, DEFAULT_VARIANT.rail)
  set("bar", v.bar, DEFAULT_VARIANT.bar)
  set("density", v.density, DEFAULT_VARIANT.density)
  set("logo", v.logo, DEFAULT_VARIANT.logo)
}

function readRoot(): Rest {
  const d = document.documentElement.dataset
  return {
    direction: isDirection(d["direction"]) ? d["direction"] : DEFAULT_VARIANT.direction,
    rail: isRail(d["rail"]) ? d["rail"] : DEFAULT_VARIANT.rail,
    bar: isBar(d["bar"]) ? d["bar"] : DEFAULT_VARIANT.bar,
    density: isDensity(d["density"]) ? d["density"] : DEFAULT_VARIANT.density,
    logo: isLogo(d["logo"]) ? d["logo"] : DEFAULT_VARIANT.logo
  }
}

function readStored(): Rest | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return null
    const p: unknown = JSON.parse(raw)
    if (typeof p !== "object" || p === null) return null
    const r = p as Record<string, unknown>
    return {
      direction: isDirection(r["direction"]) ? r["direction"] : DEFAULT_VARIANT.direction,
      rail: isRail(r["rail"]) ? r["rail"] : DEFAULT_VARIANT.rail,
      bar: isBar(r["bar"]) ? r["bar"] : DEFAULT_VARIANT.bar,
      density: isDensity(r["density"]) ? r["density"] : DEFAULT_VARIANT.density,
      logo: isLogo(r["logo"]) ? r["logo"] : DEFAULT_VARIANT.logo
    }
  } catch {
    return null
  }
}

function store(v: Rest) {
  try {
    if (isDefault({ ...DEFAULT_VARIANT, ...v })) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // Not remembered; the page still switches.
  }
}

/** The variant on the root now. */
export function readVariant(): Variant {
  return { ...readRoot(), ...readTheme() }
}

/**
 * Before the first paint (`main.tsx`, after the theme): a `?v=` in the address wins and is
 * remembered; otherwise what this browser remembered.
 */
export function applyInitialVariant() {
  let fromAddress: string | null = null
  try {
    fromAddress = new URLSearchParams(window.location.search).get("v")
  } catch {
    // No address to read: what was remembered.
  }
  if (fromAddress !== null) {
    const v = decodeVariant(fromAddress)
    applyRoot(v)
    store(v)
    setTheme({ accent: v.accent, mode: v.mode })
    syncAddress(v)
    return
  }
  const remembered = readStored()
  if (remembered !== null) applyRoot(remembered)
}

/** Changes part of the variant. A new direction brings its own first accent unless one is given. */
export function setVariant(patch: Partial<Variant>) {
  const now = readVariant()
  const direction = patch.direction ?? now.direction
  const accent = patch.accent
    ?? (patch.direction !== undefined && patch.direction !== now.direction
      ? DIRECTION_ACCENT[direction][0] ?? DEFAULT_ACCENT
      : now.accent)
  const next: Variant = { ...now, ...patch, direction, accent }
  applyRoot(next)
  store(next)
  if (next.accent !== now.accent || next.mode !== now.mode) setTheme({ accent: next.accent, mode: next.mode })
  syncAddress(next)
  window.dispatchEvent(new Event(CHANGE))
}

/** Terug naar standaard: every attribute off, the house teal in light, nothing in the address. */
export function resetVariant() {
  setVariant(DEFAULT_VARIANT)
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange)
  const off = subscribeTheme(onChange)
  return () => {
    window.removeEventListener(CHANGE, onChange)
    off()
  }
}

let cache: { readonly key: string; readonly value: Variant } | null = null

function snapshot(): Variant {
  const v = readVariant()
  const key = Object.values(v).join("|")
  if (cache?.key !== key) cache = { key, value: v }
  return cache.value
}

export function useVariant(): Variant {
  return useSyncExternalStore(subscribe, snapshot)
}

/* ── in words ─────────────────────────────────────────────────────────────────────────────────── */

const label = <T extends string>(options: ReadonlyArray<{ readonly value: T; readonly label: string }>, v: T) =>
  options.find((o) => o.value === v)?.label ?? v

/** One line of what is on: "Lagune · Petrol · licht · ruim · iconenbalk licht". */
export function describeVariant(v: Variant): string {
  const parts = [
    label(DIRECTION_OPTIONS, v.direction),
    ALL_ACCENTS.find((a) => a.value === v.accent)?.label ?? v.accent,
    MODE_WORD[v.mode]
  ]
  if (v.density !== "standaard") parts.push(v.density)
  if (v.rail !== "donker") parts.push(v.rail === "licht" ? "iconenbalk licht" : "iconenbalk in kleur")
  if (v.bar !== "menu") parts.push("hoofdbalk als inhoud")
  if (v.logo !== "winkel") parts.push(`logo ${label(LOGO_OPTIONS, v.logo)}`)
  return parts.join(" · ")
}
