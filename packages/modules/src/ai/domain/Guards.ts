/*
 * What a model's words are checked against before a person sees them (ai.md §6.2, §6.5), as pure functions: the
 * runtime runs them where a wrong figure would mislead (an evidence pack), and the evals run them on every case.
 */

/** Every run of digits in a text, "€ 49,95" as `49` and `95`, "12 oktober 2026" as `12` and `2026`. */
const digitRuns = (text: string): Array<string> => [...text.matchAll(/\d+/g)].map((m) => m[0].replace(/^0+(?=\d)/, ""))

/**
 * Figures are SQL, not prose (§6.2): every number the output states must be in what it was given. A number the input
 * never had is one the model made up; the output is then not shown.
 */
export const untracedFigures = (output: string, input: string): Array<string> => {
  const given = new Set(digitRuns(input))
  return [...new Set(digitRuns(output))].filter((n) => !given.has(n))
}

const APOLOGY = /\b(sorry|excuses|het spijt (?:ons|me|mij)|onze excuses|mijn excuses)\b/i
const FORMAL = /\b(u|uw)\b/i

/**
 * The voice (§6.5): Dutch, je and jij, no exclamation marks, no apologies. What the lint finds, by name; none is
 * clean.
 */
export const voiceFaults = (text: string): Array<"exclamation" | "formal" | "apology" | "empty"> => {
  const faults: Array<"exclamation" | "formal" | "apology" | "empty"> = []
  if (text.trim() === "") faults.push("empty")
  if (text.includes("!")) faults.push("exclamation")
  if (FORMAL.test(text)) faults.push("formal")
  if (APOLOGY.test(text)) faults.push("apology")
  return faults
}

/** Text the model reads, with every angle bracket defused: nothing in it can open or close a block. */
export const defused = (text: string): string => text.replaceAll("<", "‹").replaceAll(">", "›")

/** A customer's or supplier's words, as data the model reads and never obeys (§6.3). Tags in the text are defused. */
export const dataBlock = (name: string, text: string): string => `<${name}>\n${defused(text)}\n</${name}>`

/** A first name only: the minimum a reply needs to greet someone (§6.4). */
export const firstName = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? ""
