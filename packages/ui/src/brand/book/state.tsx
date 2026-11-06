import { durations, easings } from "@insyte/tokens/tokens"
import { createContext, useContext } from "react"
import type { ChapterId } from "./registry.ts"

/*
 * The book's shared state, and its motion read from the tokens.
 *
 * Every transition in the book is a token: `IN_OUT` is the system's one symmetric curve (`mesh`
 * in `tokens.ts`), which is what a page leaving and a page arriving share; `OUT_EXPO` is for a
 * specimen arriving on its own. The durations are the token set's, in seconds for motion/react.
 */

const bezier = (value: string): [number, number, number, number] => {
  const [a = 0, b = 0, c = 1, d = 1] = (value.match(/-?[\d.]+/g) ?? []).map(Number)
  return [a, b, c, d]
}

export const IN_OUT = bezier(easings.mesh)
export const OUT_EXPO = bezier(easings["out-expo"])
export const OUT_QUART = bezier(easings["out-quart"])

export const sec = (key: keyof typeof durations): number => durations[key] / 1000

export type Via = "menu" | "link"

export type Book = {
  /** Motion off, for the whole book: the reader's setting or the toggle in Beweging. */
  readonly still: boolean
  readonly setStill: (still: boolean) => void
  readonly menuOpen: boolean
  readonly openMenu: () => void
  readonly closeMenu: () => void
  /** Go to a chapter (or the cover), saying how, so the transition can be chosen. */
  readonly go: (to: ChapterId | "cover", via: Via) => void
}

export const BookContext = createContext<Book>({
  still: false,
  setStill: () => {},
  menuOpen: false,
  openMenu: () => {},
  closeMenu: () => {},
  go: () => {}
})

export const useBook = (): Book => useContext(BookContext)

/** What a specimen's controls say: paused (frozen where it stands) and still (drawn at rest). */
export type SpecimenState = {
  readonly paused: boolean
  /** True when paused, when still is on for the specimen, or for the whole book. */
  readonly still: boolean
  readonly ground: SpecimenGround
}

export type SpecimenGround = "mist" | "glacier" | "paper" | "abyss"

export const SpecimenContext = createContext<SpecimenState>({ paused: false, still: false, ground: "mist" })

export const useSpecimen = (): SpecimenState => useContext(SpecimenContext)

export const darkGround = (g: SpecimenGround): boolean => g === "abyss"
