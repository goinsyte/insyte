/*
 * A customer-facing phrase ("Onderweg met PostNL") set inside a sentence ("Je bestelling is nu: onderweg met PostNL").
 * Only the first letter changes, and only when the first word is an ordinary capitalised word: a name or an
 * abbreviation that opens the phrase ("PostNL heeft je pakket", "DHL") keeps its capitals. The Verzending preview and
 * the customer agent's offline draft both say it this way.
 */

/** "Onderweg met PostNL" as "onderweg met PostNL"; "PostNL heeft je pakket" and "DHL" as they are. */
export const midSentence = (phrase: string): string =>
  /^\p{Lu}\p{Ll}*(?![\p{L}\p{N}])/u.test(phrase) ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : phrase
