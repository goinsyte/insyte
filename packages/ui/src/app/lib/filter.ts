/*
 * The filter a list is cut by: rules joined by And or Or, and groups of rules inside that, the way
 * ClickUp's filter builder works. Pure data and pure functions, so the table, the home queue and a
 * saved view all mean the same thing by "Status is any of Delayed, Paid".
 *
 * A field knows its own type, and the type decides what can be asked of it: an option is or is not
 * one of a set, text contains, a number is above or below, a date is within the last few days or
 * before or after a day. A rule with nothing filled in yet matches everything, so adding a row never
 * empties the list before the operator has said what they meant.
 */

export type FieldType = "option" | "text" | "number" | "date";

export type FilterField<T> = {
	id: string;
	label: string;
	type: FieldType;
	/** For option fields. Counts come from the rows. */
	options?: ReadonlyArray<{ value: string; label: string }>;
	get: (row: T) => unknown;
};

export type Op =
	| "any"
	| "none"
	| "contains"
	| "not_contains"
	| "is"
	| "gt"
	| "lt"
	| "last_days"
	| "before"
	| "after"
	| "empty"
	| "not_empty";

export type Rule = { kind: "rule"; id: string; field: string; op: Op; value: ReadonlyArray<string> | string };
export type Group = { kind: "group"; id: string; join: "and" | "or"; children: ReadonlyArray<Rule | Group> };
export type FilterNode = Rule | Group;

export const OPS: Record<FieldType, ReadonlyArray<{ op: Op; label: string }>> = {
	option: [
		{ op: "any", label: "is een van" },
		{ op: "none", label: "is geen van" },
		{ op: "empty", label: "is leeg" },
		{ op: "not_empty", label: "is ingevuld" },
	],
	text: [
		{ op: "contains", label: "bevat" },
		{ op: "not_contains", label: "bevat niet" },
		{ op: "is", label: "is precies" },
		{ op: "empty", label: "is leeg" },
		{ op: "not_empty", label: "is ingevuld" },
	],
	number: [
		{ op: "gt", label: "is hoger dan" },
		{ op: "lt", label: "is lager dan" },
		{ op: "is", label: "is gelijk aan" },
	],
	date: [
		{ op: "last_days", label: "in de afgelopen" },
		{ op: "after", label: "is na" },
		{ op: "before", label: "is voor" },
	],
};

/** Operators that need no value: the rule is complete as soon as they are picked. */
export const VALUELESS: ReadonlySet<Op> = new Set(["empty", "not_empty"]);

let seq = 0;
export const nodeId = (): string => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyGroup = (join: "and" | "or" = "and"): Group => ({ kind: "group", id: nodeId(), join, children: [] });

export function ruleFor<T>(field: FilterField<T>): Rule {
	const first = OPS[field.type][0]?.op ?? "contains";
	// A date starts at "in the last 30 days", which filters at once; every other type waits for a value.
	const value = field.type === "option" ? [] : field.type === "date" ? "30" : "";
	return { kind: "rule", id: nodeId(), field: field.id, op: first, value };
}

/** Whether a rule says anything yet. An unfinished rule is shown but does not filter. */
export function isComplete(rule: Rule): boolean {
	if (VALUELESS.has(rule.op)) return true;
	return Array.isArray(rule.value) ? rule.value.length > 0 : String(rule.value).trim() !== "";
}

function matchRule<T>(row: T, rule: Rule, fields: ReadonlyArray<FilterField<T>>): boolean {
	const field = fields.find((f) => f.id === rule.field);
	if (field === undefined || !isComplete(rule)) return true;
	const raw = field.get(row);
	const blank = raw === undefined || raw === null || raw === "";
	if (rule.op === "empty") return blank;
	if (rule.op === "not_empty") return !blank;
	const values = Array.isArray(rule.value) ? rule.value : [String(rule.value)];
	switch (rule.op) {
		case "any":
			return values.includes(String(raw));
		case "none":
			return !values.includes(String(raw));
		case "contains":
			return String(raw ?? "").toLowerCase().includes(String(rule.value).toLowerCase());
		case "not_contains":
			return !String(raw ?? "").toLowerCase().includes(String(rule.value).toLowerCase());
		case "is":
			return field.type === "number"
				? Number(raw) === Number(rule.value)
				: String(raw ?? "").toLowerCase() === String(rule.value).toLowerCase();
		case "gt":
			return Number(raw) > Number(rule.value);
		case "lt":
			return Number(raw) < Number(rule.value);
		case "last_days": {
			const t = Date.parse(String(raw));
			return Number.isFinite(t) && t >= Date.now() - Number(rule.value) * 86_400_000;
		}
		case "after":
			return Date.parse(String(raw)) > Date.parse(String(rule.value));
		case "before":
			return Date.parse(String(raw)) < Date.parse(String(rule.value));
	}
}

export function matches<T>(row: T, node: FilterNode, fields: ReadonlyArray<FilterField<T>>): boolean {
	if (node.kind === "rule") return matchRule(row, node, fields);
	const live = node.children.filter((c) => c.kind === "group" || isComplete(c));
	if (live.length === 0) return true;
	return node.join === "and" ? live.every((c) => matches(row, c, fields)) : live.some((c) => matches(row, c, fields));
}

export function applyFilter<T>(rows: ReadonlyArray<T>, root: Group, fields: ReadonlyArray<FilterField<T>>): T[] {
	return countRules(root) === 0 ? [...rows] : rows.filter((r) => matches(r, root, fields));
}

/** Rules that actually filter, at any depth. */
export function countRules(node: FilterNode): number {
	if (node.kind === "rule") return isComplete(node) ? 1 : 0;
	return node.children.reduce((n, c) => n + countRules(c), 0);
}

/* ── editing, immutably ── */

export function updateNode(root: Group, id: string, fn: (n: FilterNode) => FilterNode | null): Group {
	const walk = (g: Group): Group => ({
		...g,
		children: g.children.flatMap((c) => {
			if (c.id === id) {
				const next = fn(c);
				return next === null ? [] : [next];
			}
			return c.kind === "group" ? [walk(c)] : [c];
		}),
	});
	if (root.id === id) {
		const next = fn(root);
		return next !== null && next.kind === "group" ? next : emptyGroup(root.join);
	}
	return walk(root);
}

export function appendTo(root: Group, groupId: string, node: FilterNode): Group {
	return updateNode(root, groupId, (g) => (g.kind === "group" ? { ...g, children: [...g.children, node] } : g));
}

/** One line for a rule, as a chip says it: "Status is any of Delayed, Paid". */
export function describeRule<T>(rule: Rule, fields: ReadonlyArray<FilterField<T>>): { field: string; op: string; value: string } {
	const field = fields.find((f) => f.id === rule.field);
	const op = field ? (OPS[field.type].find((o) => o.op === rule.op)?.label ?? rule.op) : rule.op;
	let value = "";
	if (Array.isArray(rule.value)) {
		const labels = rule.value.map((v) => field?.options?.find((o) => o.value === v)?.label ?? v);
		value = labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
	} else if (!VALUELESS.has(rule.op)) {
		value = rule.op === "last_days" ? `${rule.value} dagen` : String(rule.value);
	}
	return { field: field?.label ?? rule.field, op, value };
}
