import type { Customer } from "./types/domain";

/*
 * Profiles that look like one person. A second store, a guest checkout or a typo in a name makes a
 * customer twice; the review on the customers list puts each group in front of the operator, who
 * says whether it is the same person. Nothing is merged on a guess.
 *
 * The rules, strongest first: the same email is the same person; the same name in the same country
 * is very likely; the same name alone is only possible. Names are compared without accents, case or
 * extra spaces, so "Felix Müller" and "felix muller" meet.
 */

export type Match = "same email" | "same name and country" | "same name";
export type DuplicateGroup = { key: string; ids: string[]; match: Match };

const norm = (s: string) =>
	s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();

export function findDuplicates(customers: ReadonlyArray<Customer>, dismissed: ReadonlyArray<string> = []): DuplicateGroup[] {
	const groups: DuplicateGroup[] = [];
	const taken = new Set<string>();
	// A group is named by who is in it, not by the rule that found it, so "not the same person"
	// holds even when a weaker rule would find the same profiles again.
	const add = (members: Customer[], match: Match) => {
		const ids = members.map((c) => c.id).filter((id) => !taken.has(id));
		const key = [...ids].sort().join(",");
		if (ids.length < 2 || dismissed.includes(key)) return;
		for (const id of ids) taken.add(id);
		groups.push({ key, ids, match });
	};
	const by = (f: (c: Customer) => string) => {
		const m = new Map<string, Customer[]>();
		for (const c of customers) {
			const k = f(c);
			if (k === "") continue;
			m.set(k, [...(m.get(k) ?? []), c]);
		}
		return m;
	};
	// Guest checkouts share a processor's address and are not a person.
	for (const [, cs] of by((c) => (c.name.startsWith("Anonymous") ? "" : norm(c.email)))) add(cs, "same email");
	for (const [, cs] of by((c) => (c.name.startsWith("Anonymous") ? "" : `${norm(c.name)}|${c.address?.country ?? ""}`)))
		add(cs, "same name and country");
	for (const [, cs] of by((c) => (c.name.startsWith("Anonymous") ? "" : norm(c.name)))) add(cs, "same name");
	return groups;
}
