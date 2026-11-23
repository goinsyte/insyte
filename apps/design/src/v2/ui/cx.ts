/** Joins class names, dropping the falsy ones. No merging: variants here never fight over a property. */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
