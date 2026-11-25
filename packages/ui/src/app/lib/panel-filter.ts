/*
 * The area panel's filter ("Zoek in instellingen"): its links whose name, or one of the settings inside the page
 * (`keywords`), has a word starting with every word typed. Case and accents aside, so "rol" finds Rollen and "2fa"
 * the page that has it; from the start of a word, so "ai" is not found inside "e-mail". A section keeps only its
 * matching links, and goes when none match.
 */

type Findable = { readonly label: string; readonly keywords?: ReadonlyArray<string> | undefined }

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Where a word starts: the text's start, or after a space, a hyphen or other punctuation. */
const startsAWord = (text: string, word: string) => {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1] ?? "")) return true
  }
  return false
}

export function filterSections<S extends { readonly items: ReadonlyArray<Findable> }>(
  sections: ReadonlyArray<S>,
  query: string
): Array<S> {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...sections]
  return sections.flatMap((section) => {
    const items = section.items.filter((item) => {
      const text = fold([item.label, ...(item.keywords ?? [])].join(" · "))
      return words.every((w) => startsAWord(text, w))
    })
    return items.length === 0 ? [] : [{ ...section, items } as S]
  })
}
