/*
 * Rekenbladen (PLAN 40): the operator's own calculations, on Insyte's figures.
 *
 * A sheet has tabs, a tab has cells, a cell holds what was typed: a value, or a formula after "=".
 * Formulas are written the way a Dutch spreadsheet writes them — `=SOM(B2:B6)`, arguments split by
 * ";", a decimal comma — and the English names work too. `=INSYTE("omzet"; "2026-04")` reads a
 * figure Insyte already has, the same number Analyse shows, so a sheet never holds a pasted copy
 * that goes stale.
 *
 * An error is a value like any other, and it carries a sentence saying what went wrong, because
 * "#WAARDE!" on its own tells nobody anything.
 */

export type Fmt = "general" | "money" | "percent" | "number" | "integer";
export type Align = "left" | "center" | "right";
export type Cell = { v: string; fmt?: Fmt; bold?: boolean; align?: Align };
export type Tab = { id: string; name: string; cells: Record<string, Cell>; widths: Record<string, number> };
export type Folder = { id: string; name: string };
export type Sheet = {
	id: string;
	title: string;
	folderId?: string;
	pinned: boolean;
	archived: boolean;
	ownerId: string;
	/** Member ids the owner shared it with. */
	shared: string[];
	createdAt: string;
	updatedAt: string;
	openedAt?: string;
	tabs: Tab[];
};
export type SheetsSeed = { folders: Folder[]; sheets: Sheet[] };

export type ErrCode = "#DEEL/0!" | "#WAARDE!" | "#VERW!" | "#NAAM?" | "#CIRC!" | "#N/B";
export type SheetError = { error: ErrCode; why: string };
export type Value = number | string | boolean | SheetError | null;

export const isErr = (v: unknown): v is SheetError => typeof v === "object" && v !== null && "error" in v;
const err = (error: ErrCode, why: string): SheetError => ({ error, why });

export const COLS = 12;
export const ROWS = 40;

/* ── addresses ─────────────────────────────────────────────────────────────────────────────── */

export function colName(i: number): string {
	let s = "";
	let n = i + 1;
	while (n > 0) {
		const m = (n - 1) % 26;
		s = String.fromCharCode(65 + m) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}

export function colIndex(name: string): number {
	let n = 0;
	for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
}

export const addr = (c: number, r: number) => `${colName(c)}${r + 1}`;

export function parseAddr(a: string): { c: number; r: number } | null {
	const m = /^\$?([A-Za-z]{1,2})\$?(\d{1,4})$/.exec(a);
	if (!m) return null;
	return { c: colIndex(m[1]!), r: Number(m[2]) - 1 };
}

/* ── typed values ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a typed value is: "1.234,50" is a number (Dutch: a dot groups, a comma is the decimal),
 * "12%" is 0,12, "€ 49" or "$49" is 49 in money. Anything else stays text.
 */
export function parseTyped(raw: string): { value: Value; fmt?: Fmt | undefined } {
	const t = raw.trim();
	if (t === "") return { value: null };
	const up = t.toUpperCase();
	if (up === "WAAR" || up === "TRUE") return { value: true };
	if (up === "ONWAAR" || up === "FALSE") return { value: false };
	const m = /^(-)?\s*([€$])?\s*([\d.,]+)\s*(%)?$/.exec(t);
	if (m) {
		const n = toNumber(m[3]!);
		if (n !== null) {
			const signed = m[1] ? -n : n;
			if (m[4]) return { value: signed / 100, fmt: "percent" };
			return { value: signed, fmt: m[2] ? "money" : undefined };
		}
	}
	return { value: t };
}

/** "1.234,5" → 1234.5, "1234.5" → 1234.5, "1.234" → 1234, "1,5" → 1.5. */
function toNumber(s: string): number | null {
	let x = s;
	if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
	else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, "");
	if (!/^\d*\.?\d+$/.test(x)) return null;
	return Number(x);
}

/* ── the formula language ──────────────────────────────────────────────────────────────────── */

type Tok =
	| { t: "num"; v: number }
	| { t: "str"; v: string }
	| { t: "ref"; tab?: string | undefined; a: string }
	| { t: "range"; tab?: string | undefined; a: string; b: string }
	| { t: "id"; v: string }
	| { t: "op"; v: string }
	| { t: "(" }
	| { t: ")" }
	| { t: ";" };

function lex(src: string): Tok[] | SheetError {
	const out: Tok[] = [];
	let i = 0;
	const ref = /^(?:('([^']+)'|[A-Za-zÀ-ÿ][\wÀ-ÿ]*)!)?(\$?[A-Za-z]{1,2}\$?\d{1,4})(?::(\$?[A-Za-z]{1,2}\$?\d{1,4}))?/;
	while (i < src.length) {
		const ch = src[i]!;
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (/\d/.test(ch) || (ch === "." && /\d/.test(src[i + 1] ?? ""))) {
			const m = /^\d*(?:[.,]\d+)?/.exec(src.slice(i))!;
			out.push({ t: "num", v: Number(m[0].replace(",", ".")) });
			i += m[0].length;
			continue;
		}
		if (ch === '"') {
			const end = src.indexOf('"', i + 1);
			if (end < 0) return err("#WAARDE!", "Er staat een aanhalingsteken zonder het tweede.");
			out.push({ t: "str", v: src.slice(i + 1, end) });
			i = end + 1;
			continue;
		}
		const r = ref.exec(src.slice(i));
		if (r && !/[\wÀ-ÿ(]/.test(src[i + r[0].length] ?? "")) {
			const tab = r[2] ?? r[1];
			const a = r[3]!.replace(/\$/g, "").toUpperCase();
			if (r[4]) out.push({ t: "range", tab, a, b: r[4].replace(/\$/g, "").toUpperCase() });
			else out.push({ t: "ref", tab, a });
			i += r[0].length;
			continue;
		}
		const id = /^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*/.exec(src.slice(i));
		if (id) {
			out.push({ t: "id", v: id[0].toUpperCase() });
			i += id[0].length;
			continue;
		}
		const two = src.slice(i, i + 2);
		if (two === "<=" || two === ">=" || two === "<>") {
			out.push({ t: "op", v: two });
			i += 2;
			continue;
		}
		if ("+-*/^&=<>%".includes(ch)) {
			out.push({ t: "op", v: ch });
			i++;
			continue;
		}
		if (ch === "(" || ch === ")") {
			out.push({ t: ch });
			i++;
			continue;
		}
		if (ch === ";" || ch === ",") {
			out.push({ t: ";" });
			i++;
			continue;
		}
		return err("#WAARDE!", `Insyte begrijpt het teken “${ch}” niet.`);
	}
	return out;
}

type Node =
	| { k: "num"; v: number }
	| { k: "str"; v: string }
	| { k: "bool"; v: boolean }
	| { k: "ref"; tab?: string | undefined; a: string }
	| { k: "range"; tab?: string | undefined; a: string; b: string }
	| { k: "call"; name: string; args: Node[] }
	| { k: "un"; op: string; x: Node }
	| { k: "bin"; op: string; l: Node; r: Node }
	| { k: "pct"; x: Node };

function parse(toks: Tok[]): Node | SheetError {
	let i = 0;
	const peek = () => toks[i];
	const isOp = (v: string) => {
		const t = peek();
		return t?.t === "op" && t.v === v;
	};
	const fail = (why: string): never => {
		throw err("#WAARDE!", why);
	};

	const primary = (): Node => {
		const t = toks[i++];
		if (!t) return fail("De formule houdt te vroeg op.");
		if (t.t === "num") return { k: "num", v: t.v };
		if (t.t === "str") return { k: "str", v: t.v };
		if (t.t === "ref") return { k: "ref", tab: t.tab, a: t.a };
		if (t.t === "range") return { k: "range", tab: t.tab, a: t.a, b: t.b };
		if (t.t === "(") {
			const x = compare();
			if (peek()?.t !== ")") fail("Er mist een sluithaakje.");
			i++;
			return x;
		}
		if (t.t === "id") {
			if (peek()?.t === "(") {
				i++;
				const args: Node[] = [];
				if (peek()?.t !== ")") {
					for (;;) {
						args.push(compare());
						if (peek()?.t === ";") {
							i++;
							continue;
						}
						break;
					}
				}
				if (peek()?.t !== ")") fail(`Er mist een sluithaakje na ${t.v}(…`);
				i++;
				return { k: "call", name: t.v, args };
			}
			if (t.v === "WAAR" || t.v === "TRUE") return { k: "bool", v: true };
			if (t.v === "ONWAAR" || t.v === "FALSE") return { k: "bool", v: false };
			throw err("#NAAM?", `“${t.v}” is geen functie of cel die Insyte kent.`);
		}
		return fail("Hier verwachtte Insyte een getal, een cel of een functie.");
	};
	const postfix = (): Node => {
		let x = primary();
		while (isOp("%")) {
			i++;
			x = { k: "pct", x };
		}
		return x;
	};
	const unary = (): Node => {
		if (isOp("-") || isOp("+")) {
			const op = (toks[i++] as { v: string }).v;
			return { k: "un", op, x: unary() };
		}
		return postfix();
	};
	const power = (): Node => {
		let l = unary();
		while (isOp("^")) {
			i++;
			l = { k: "bin", op: "^", l, r: unary() };
		}
		return l;
	};
	const term = (): Node => {
		let l = power();
		while (isOp("*") || isOp("/")) {
			const op = (toks[i++] as { v: string }).v;
			l = { k: "bin", op, l, r: power() };
		}
		return l;
	};
	const additive = (): Node => {
		let l = term();
		while (isOp("+") || isOp("-")) {
			const op = (toks[i++] as { v: string }).v;
			l = { k: "bin", op, l, r: term() };
		}
		return l;
	};
	const concat = (): Node => {
		let l = additive();
		while (isOp("&")) {
			i++;
			l = { k: "bin", op: "&", l, r: additive() };
		}
		return l;
	};
	const compare = (): Node => {
		const l = concat();
		const t = peek();
		if (t?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.v)) {
			i++;
			return { k: "bin", op: t.v, l, r: concat() };
		}
		return l;
	};

	try {
		const n = compare();
		if (i < toks.length) fail("Na het einde van de formule staat nog iets.");
		return n;
	} catch (e) {
		if (isErr(e)) return e;
		throw e;
	}
}

/* ── evaluation ───────────────────────────────────────────────────────────────────────────── */

/** How a sheet reads Insyte: a metric for a month, or a sentence saying why it cannot. */
export type Figures = (metric: string, month: string | undefined) => number | SheetError;

export type Book = { tabs: ReadonlyArray<Tab>; figures: Figures };

type Arr = { arr: Value[] };
const isArr = (v: unknown): v is Arr => typeof v === "object" && v !== null && "arr" in v;

/**
 * Evaluates every formula of a tab on demand, remembering what it computed during one pass, and
 * stopping a cell that refers back to itself with #CIRC! rather than spinning.
 */
export function evaluator(book: Book, tabId: string) {
	const memo = new Map<string, Value>();
	const busy = new Set<string>();
	const parsed = new Map<string, Node | SheetError>();

	const tabOf = (name: string | undefined, here: Tab): Tab | undefined => (name ? book.tabs.find((t) => t.name.toLowerCase() === name.toLowerCase()) : here);

	const cellValue = (tab: Tab, a: string): Value => {
		const key = `${tab.id}!${a}`;
		if (memo.has(key)) return memo.get(key)!;
		if (busy.has(key)) return err("#CIRC!", `De formule verwijst via ${a} naar zichzelf terug.`);
		const raw = tab.cells[a]?.v ?? "";
		let v: Value;
		if (raw.startsWith("=")) {
			busy.add(key);
			let node = parsed.get(raw);
			if (!node) {
				const toks = lex(raw.slice(1));
				node = isErr(toks) ? toks : parse(toks);
				parsed.set(raw, node);
			}
			v = isErr(node) ? node : scalar(run(node, tab));
			busy.delete(key);
		} else v = parseTyped(raw).value;
		memo.set(key, v);
		return v;
	};

	const scalar = (v: Value | Arr): Value => (isArr(v) ? (v.arr.length === 1 ? v.arr[0]! : err("#WAARDE!", "Hier hoort één cel, geen bereik.")) : v);

	const num = (v: Value): number | SheetError => {
		if (isErr(v)) return v;
		if (v === null || v === "") return 0;
		if (typeof v === "number") return v;
		if (typeof v === "boolean") return v ? 1 : 0;
		const p = parseTyped(v).value;
		return typeof p === "number" ? p : err("#WAARDE!", `“${v}” is tekst; hier hoort een getal.`);
	};

	const flat = (vs: Array<Value | Arr>): Value[] => vs.flatMap((v) => (isArr(v) ? v.arr : [v]));
	/* Aggregates skip text and empty cells in a range, as spreadsheets do, but stop on an error. */
	const numbers = (vs: Array<Value | Arr>): number[] | SheetError => {
		const out: number[] = [];
		for (const v of flat(vs)) {
			if (isErr(v)) return v;
			if (typeof v === "number") out.push(v);
			else if (typeof v === "boolean") out.push(v ? 1 : 0);
		}
		return out;
	};

	const run = (n: Node, tab: Tab): Value | Arr => {
		switch (n.k) {
			case "num":
				return n.v;
			case "str":
				return n.v;
			case "bool":
				return n.v;
			case "ref": {
				const t = tabOf(n.tab, tab);
				if (!t) return err("#VERW!", `Er is geen tabblad “${n.tab}”.`);
				const p = parseAddr(n.a);
				if (!p || p.c >= COLS || p.r >= ROWS) return err("#VERW!", `${n.a} valt buiten het blad.`);
				return cellValue(t, n.a);
			}
			case "range": {
				const t = tabOf(n.tab, tab);
				if (!t) return err("#VERW!", `Er is geen tabblad “${n.tab}”.`);
				const a = parseAddr(n.a);
				const b = parseAddr(n.b);
				if (!a || !b) return err("#VERW!", `${n.a}:${n.b} is geen bereik.`);
				const arr: Value[] = [];
				for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) arr.push(cellValue(t, addr(c, r)));
				return { arr };
			}
			case "pct": {
				const x = num(scalar(run(n.x, tab)));
				return isErr(x) ? x : x / 100;
			}
			case "un": {
				const x = num(scalar(run(n.x, tab)));
				return isErr(x) ? x : n.op === "-" ? -x : x;
			}
			case "bin": {
				const l = scalar(run(n.l, tab));
				const r = scalar(run(n.r, tab));
				if (n.op === "&") {
					if (isErr(l)) return l;
					if (isErr(r)) return r;
					return `${l ?? ""}${r ?? ""}`;
				}
				if (["=", "<>", "<", ">", "<=", ">="].includes(n.op)) {
					if (isErr(l)) return l;
					if (isErr(r)) return r;
					const a = typeof l === "string" && typeof r === "string" ? l.toLowerCase() : num(l);
					const b = typeof l === "string" && typeof r === "string" ? r.toLowerCase() : num(r);
					if (isErr(a)) return a;
					if (isErr(b)) return b;
					return n.op === "=" ? a === b : n.op === "<>" ? a !== b : n.op === "<" ? a < b : n.op === ">" ? a > b : n.op === "<=" ? a <= b : a >= b;
				}
				const a = num(l);
				const b = num(r);
				if (isErr(a)) return a;
				if (isErr(b)) return b;
				if (n.op === "+") return a + b;
				if (n.op === "-") return a - b;
				if (n.op === "*") return a * b;
				if (n.op === "^") return a ** b;
				if (b === 0) return err("#DEEL/0!", "Hier wordt door nul gedeeld. Staat er in de noemer een lege cel of een 0?");
				return a / b;
			}
			case "call":
				return call(n.name, n.args, tab);
		}
	};

	const call = (name: string, args: Node[], tab: Tab): Value | Arr => {
		const ev = () => args.map((a) => run(a, tab));
		const fn = ALIAS[name] ?? name;
		switch (fn) {
			case "SOM": {
				const xs = numbers(ev());
				return isErr(xs) ? xs : xs.reduce((s, x) => s + x, 0);
			}
			case "GEMIDDELDE": {
				const xs = numbers(ev());
				if (isErr(xs)) return xs;
				return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : err("#DEEL/0!", "Er staan geen getallen in het bereik om een gemiddelde van te nemen.");
			}
			case "MIN":
			case "MAX": {
				const xs = numbers(ev());
				if (isErr(xs)) return xs;
				return xs.length ? (fn === "MIN" ? Math.min(...xs) : Math.max(...xs)) : 0;
			}
			case "AANTAL": {
				const xs = numbers(ev());
				return isErr(xs) ? xs : xs.length;
			}
			case "AFRONDEN": {
				const [x, d] = ev().map(scalar);
				const a = num(x ?? null);
				const b = num(d ?? 0);
				if (isErr(a)) return a;
				if (isErr(b)) return b;
				const f = 10 ** Math.trunc(b);
				return Math.round(a * f) / f;
			}
			case "ABS": {
				const a = num(scalar(ev()[0] ?? null));
				return isErr(a) ? a : Math.abs(a);
			}
			case "ALS": {
				if (args.length < 2) return err("#WAARDE!", "ALS heeft een voorwaarde en minstens een uitkomst nodig: =ALS(B2>0; \"ja\"; \"nee\").");
				const c = scalar(run(args[0]!, tab));
				if (isErr(c)) return c;
				const yes = typeof c === "boolean" ? c : !isErr(num(c)) && num(c) !== 0;
				return yes ? scalar(run(args[1]!, tab)) : args[2] ? scalar(run(args[2], tab)) : false;
			}
			case "ALS.FOUT": {
				const v = scalar(run(args[0] ?? { k: "num", v: 0 }, tab));
				return isErr(v) ? scalar(run(args[1] ?? { k: "str", v: "" }, tab)) : v;
			}
			case "INSYTE": {
				const [m, p] = ev().map(scalar);
				if (typeof m !== "string") return err("#WAARDE!", "INSYTE wil eerst de naam van een cijfer, tussen aanhalingstekens: =INSYTE(\"omzet\"; \"2026-04\").");
				if (isErr(p ?? null)) return p as SheetError;
				return book.figures(m, p === undefined || p === null ? undefined : String(p));
			}
			default:
				return err("#NAAM?", `Insyte kent de functie ${name} niet. Probeer SOM, GEMIDDELDE, MIN, MAX, AANTAL, AFRONDEN, ALS of INSYTE.`);
		}
	};

	const tab = book.tabs.find((t) => t.id === tabId) ?? book.tabs[0]!;
	return {
		value: (a: string) => cellValue(tab, a),
		/** Whether the cell reads one of Insyte's figures, and which. */
		link: (a: string) => {
			const raw = tab.cells[a]?.v ?? "";
			const m = /INSYTE\(\s*"([^"]+)"\s*(?:[;,]\s*"([^"]+)")?/i.exec(raw);
			return m ? { metric: m[1]!, month: m[2] } : null;
		},
	};
}

const ALIAS: Record<string, string> = { SUM: "SOM", AVERAGE: "GEMIDDELDE", COUNT: "AANTAL", ROUND: "AFRONDEN", IF: "ALS", IFERROR: "ALS.FOUT" };

export const FUNCTIONS: ReadonlyArray<{ name: string; hint: string }> = [
	{ name: "SOM", hint: "=SOM(B2:B6) telt op" },
	{ name: "GEMIDDELDE", hint: "=GEMIDDELDE(B2:B6)" },
	{ name: "MIN", hint: "=MIN(B2:B6)" },
	{ name: "MAX", hint: "=MAX(B2:B6)" },
	{ name: "AANTAL", hint: "=AANTAL(B2:B6) telt de getallen" },
	{ name: "AFRONDEN", hint: "=AFRONDEN(B2; 0)" },
	{ name: "ALS", hint: "=ALS(B2>0; \"winst\"; \"verlies\")" },
	{ name: "ALS.FOUT", hint: "=ALS.FOUT(B2/C2; 0)" },
	{ name: "INSYTE", hint: "=INSYTE(\"omzet\"; \"2026-04\") leest een cijfer uit Insyte" },
];

/* ── formatting ───────────────────────────────────────────────────────────────────────────── */

export function display(v: Value, fmt: Fmt | undefined, currency: string, compact = false): string {
	if (v === null) return "";
	if (isErr(v)) return v.error;
	if (typeof v === "boolean") return v ? "WAAR" : "ONWAAR";
	if (typeof v === "string") return v;
	const f = fmt ?? "general";
	if (f === "money") return new Intl.NumberFormat("nl-NL", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 0 : 2 }).format(v);
	if (f === "percent") return new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 }).format(v);
	if (f === "integer") return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(v);
	if (f === "number") return new Intl.NumberFormat("nl-NL", { minimumFractionDigits: compact ? 1 : 2, maximumFractionDigits: compact ? 1 : 2 }).format(v);
	return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(v);
}

/** The text a cell export or a copy carries: the shown value, without currency grouping noise. */
export function plain(v: Value): string {
	if (v === null) return "";
	if (isErr(v)) return v.error;
	if (typeof v === "boolean") return v ? "WAAR" : "ONWAAR";
	return typeof v === "number" ? String(v).replace(".", ",") : v;
}

/** A guess at the format a formula's result wants, from what it reads. */
export function inferFmt(raw: string): Fmt | undefined {
	const m = /INSYTE\(\s*"([^"]+)"/i.exec(raw);
	if (!m) return undefined;
	return METRICS.find((x) => x.id === m[1]!.toLowerCase())?.fmt;
}

/** The figures INSYTE() can read, in the words the operator uses. */
export const METRICS: ReadonlyArray<{ id: string; label: string; fmt: Fmt; group: "Verkoop" | "Kosten" | "Resultaat" | "Kanalen" }> = [
	{ id: "omzet", label: "Omzet", fmt: "money", group: "Verkoop" },
	{ id: "bestellingen", label: "Betaalde bestellingen", fmt: "integer", group: "Verkoop" },
	{ id: "gemiddelde_bestelling", label: "Gemiddelde bestelling", fmt: "money", group: "Verkoop" },
	{ id: "terugbetaald", label: "Terugbetaald", fmt: "money", group: "Verkoop" },
	{ id: "chargebacks", label: "Onder geschil", fmt: "money", group: "Verkoop" },
	{ id: "advertentiekosten", label: "Advertentiekosten", fmt: "money", group: "Kosten" },
	{ id: "overige_kosten", label: "Overige kosten", fmt: "money", group: "Kosten" },
	{ id: "kosten", label: "Alle kosten", fmt: "money", group: "Kosten" },
	{ id: "nettowinst", label: "Nettowinst", fmt: "money", group: "Resultaat" },
	{ id: "marge", label: "Nettomarge", fmt: "percent", group: "Resultaat" },
	{ id: "roas", label: "ROAS", fmt: "number", group: "Resultaat" },
	{ id: "omzet_meta", label: "Omzet via Meta ads", fmt: "money", group: "Kanalen" },
	{ id: "omzet_google", label: "Omzet via Google", fmt: "money", group: "Kanalen" },
	{ id: "omzet_klaviyo", label: "Omzet via Klaviyo", fmt: "money", group: "Kanalen" },
	{ id: "omzet_organisch", label: "Omzet zonder kanaal", fmt: "money", group: "Kanalen" },
	{ id: "advertenties_meta", label: "Meta Ads", fmt: "money", group: "Kanalen" },
	{ id: "advertenties_google", label: "Google Ads", fmt: "money", group: "Kanalen" },
];

/** The cells of a tab as CSV, values as shown, with a semicolon the way Dutch Excel reads it. */
export function toCsv(rows: string[][]): string {
	return rows.map((r) => r.map((x) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(";")).join("\n");
}

/** A CSV pasted or imported, split on whichever of ; , or tab it uses. */
export function fromCsv(text: string): string[][] {
	const first = text.split(/\r?\n/)[0] ?? "";
	const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = "";
	let q = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (q) {
			if (ch === '"' && text[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (ch === '"') q = false;
			else cur += ch;
		} else if (ch === '"') q = true;
		else if (ch === sep) {
			row.push(cur);
			cur = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cur);
			rows.push(row);
			row = [];
			cur = "";
		} else cur += ch;
	}
	if (cur !== "" || row.length) {
		row.push(cur);
		rows.push(row);
	}
	return rows;
}

/** Moves a formula's relative references by a number of columns and rows, for fill and paste. */
export function shift(raw: string, dc: number, dr: number): string {
	if (!raw.startsWith("=")) return raw;
	return raw.replace(/("[^"]*")|(\$?)([A-Z]{1,2})(\$?)(\d{1,4})(?![\w(])/g, (m, str, dc$, col, dr$, row) => {
		if (str) return m;
		const c = dc$ ? colIndex(col) : colIndex(col) + dc;
		const r = dr$ ? Number(row) : Number(row) + dr;
		if (c < 0 || r < 1) return "#VERW!";
		return `${dc$}${colName(c)}${dr$}${r}`;
	});
}
