/*
 * One palette for the disc that stands in for a person.
 *
 * Six files each carried their own copy before this: `routes/_admin/customers/index.tsx` and
 * `$customerId.tsx`, and the three ticket components. The copies disagreed — one had five hues, one
 * had seven — and between them they did two things the system forbids.
 *
 * They hardcoded hex (`#ffda4c`, `#f891b2`, `#9cc3f8`) that belonged to no palette and did not move
 * at night, under `text-ink` that did: near-white on a pale yellow disc, about 1.8:1. And they
 * reached for `var(--signal-green)` and `var(--signal-amber)` as identity colours, which makes a
 * green colleague look like a resolved one. Status colour means a state; it may not also mean a
 * person.
 *
 * So identity gets its own six fields and its own pinned ink, both in `@insyte/tokens`, and every
 * site reads them from here.
 */

/** The six identity fields, in the order the hash walks them. */
const PERSON_FIELDS = [
  "var(--person-1)",
  "var(--person-2)",
  "var(--person-3)",
  "var(--person-4)",
  "var(--person-5)",
  "var(--person-6)",
] as const;

/**
 * The ink every one of the six carries. Pinned, not inherited — the field does not follow the
 * theme, so neither may the text on it.
 */
export const PERSON_INK = "var(--person-ink)";

/**
 * The field for a seed — a name, an id, an initial. Same seed, same colour, in both themes and on
 * every screen, which is the whole point of an identity colour.
 */
export function personColor(seed: string): string {
	let sum = 0;
	for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
	return PERSON_FIELDS[Math.abs(sum) % PERSON_FIELDS.length] as string;
}

/** The inline style a person disc wears: its own field, and the one ink that reads on all six. */
export function personStyle(seed: string): { backgroundColor: string; color: string } {
	return { backgroundColor: personColor(seed), color: PERSON_INK };
}
