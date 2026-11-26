/*
 * A Verzending phrase ("Onderweg met {vervoerder}") set inside a sentence ("Je bestelling is nu: onderweg met PostNL").
 * Only the first letter changes, and only when the first word is an ordinary capitalised word. A phrase that opens with
 * the carrier keeps it as the carrier writes it ("Budbee heeft je pakket"): decided on the template, which then opens
 * with `{vervoerder}`, or, where only the filled-in phrase is left, on the carrier's name. An abbreviation that opens it
 * ("DHL") stays too. The Verzending preview and the reply draft's offline fake both say it this way.
 */

/**
 * "Onderweg met {vervoerder}" as "onderweg met {vervoerder}"; "{vervoerder} heeft je pakket" and "DHL" as they are.
 * `carrier`: for a phrase already filled in, the name that may open it ("Budbee heeft je pakket" stays).
 */
export const midSentence = (phrase: string, carrier?: string | null): string => {
  const name = carrier?.trim() ?? ""
  if (name !== "" && phrase.startsWith(name)) return phrase
  return /^\p{Lu}\p{Ll}*(?![\p{L}\p{N}])/u.test(phrase) ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : phrase
}
