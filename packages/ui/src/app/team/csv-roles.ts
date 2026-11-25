/*
 * The role a row of a CSV import names, read the way a person types it: case, accents and extra spaces aside
 * ("financien" is Financiën). A name that is no role, or the owner's, is a problem on that row and never a quiet
 * fallback: the person would otherwise join with a role nobody meant. Pure, so the import's reading is tested.
 */

/** Lower case, no accents, single spaces: "  Financiën " and "financien" read the same. */
export function foldName(text: string) {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type CsvRole = { ok: true; id: string } | { ok: false; reason: string };

/**
 * The role a cell names, by its label or its id, among every role of the workspace (the owner's included, so it is
 * recognised and refused by name). An empty cell names none: the dialog's own choice for rows without a role holds.
 */
export function roleForCell(roles: ReadonlyArray<{ id: string; label: string }>, cell: string): CsvRole | undefined {
	const wanted = foldName(cell);
	if (wanted === "") return undefined;
	const role = roles.find((r) => foldName(r.label) === wanted || foldName(r.id) === wanted);
	if (role === undefined) return { ok: false, reason: `Rol "${cell.trim()}" bestaat niet, kies een rol uit Rollen` };
	if (role.id === "owner") return { ok: false, reason: `${role.label} kun je niet uitnodigen, kies een andere rol` };
	return { ok: true, id: role.id };
}
