import { Schema } from "effect"

/*
 * Profiles that look like one person (M7.4; the console's `lib/duplicates.ts`, moved to the server). A second store, a
 * guest checkout or a typo makes a customer twice; the review asks the operator, and nothing is merged on a guess.
 * Strongest first: the same email; the same name in the same country; the same name alone. Names compare without
 * accents, case or extra spaces. A group is named by who is in it, so "not the same person" holds even when a weaker
 * rule would find the same profiles again.
 */

export const Match = Schema.Literals(["same email", "same name and country", "same name"])
export const DuplicateGroup = Schema.Struct({ key: Schema.String, ids: Schema.Array(Schema.String), match: Match })
export type DuplicateGroup = typeof DuplicateGroup.Type

export interface Candidate {
  readonly id: string
  readonly name: string
  readonly email: string | null
  readonly country: string | null
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

/** The groups among `customers`, leaving out those said to be different people (`dismissed`, by key). */
export function findDuplicates(
  customers: ReadonlyArray<Candidate>,
  dismissed: ReadonlySet<string> = new Set()
): Array<DuplicateGroup> {
  const groups: Array<DuplicateGroup> = []
  const taken = new Set<string>()
  const add = (members: ReadonlyArray<Candidate>, match: DuplicateGroup["match"]) => {
    const ids = members.map((c) => c.id).filter((id) => !taken.has(id))
    const key = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(",")
    if (ids.length < 2 || dismissed.has(key)) return
    for (const id of ids) taken.add(id)
    groups.push({ key, ids, match })
  }
  const by = (f: (c: Candidate) => string) => {
    const m = new Map<string, Array<Candidate>>()
    for (const c of customers) {
      const k = f(c)
      if (k === "") continue
      m.set(k, [...(m.get(k) ?? []), c])
    }
    return m
  }
  // Guest checkouts share a processor's address and are not a person.
  const person = (c: Candidate) => c.name.trim() !== "" && !c.name.startsWith("Anonymous")
  for (const [, cs] of by((c) => (person(c) ? norm(c.email ?? "") : ""))) add(cs, "same email")
  for (const [, cs] of by((c) => (person(c) ? `${norm(c.name)}|${c.country ?? ""}` : ""))) {
    add(cs, "same name and country")
  }
  for (const [, cs] of by((c) => (person(c) ? norm(c.name) : ""))) add(cs, "same name")
  return groups
}
