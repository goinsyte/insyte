import { addr, type Cell, type Fmt, type Tab } from "./sheets";

/*
 * Starting points for a new rekenblad. Each is a real sheet on Insyte's figures, not a picture of
 * one: the cells read INSYTE() and the totals are formulas, so a new sheet is right on day one.
 */

/** One row of cells: a string is a value or formula; a tuple adds a format and bold. */
export type Spec = ReadonlyArray<ReadonlyArray<string | readonly [string, Fmt?, boolean?] | null>>;

export function tabFrom(id: string, name: string, rows: Spec, widths: Record<string, number> = {}): Tab {
	const cells: Record<string, Cell> = {};
	rows.forEach((row, r) =>
		row.forEach((x, c) => {
			if (x === null || x === "") return;
			const [v, fmt, bold] = typeof x === "string" ? [x] : x;
			cells[addr(c, r)] = { v, ...(fmt ? { fmt } : {}), ...(bold || r === 0 ? { bold: true } : {}) };
		}),
	);
	return { id, name, cells, widths };
}

export const MONTH_ROWS = [
	["januari", "2026-01"],
	["februari", "2026-02"],
	["maart", "2026-03"],
	["april", "2026-04"],
	["mei", "2026-05"],
] as const;

export function profitTab(id: string): Tab {
	const n = MONTH_ROWS.length;
	const last = n + 1;
	return tabFrom(
		id,
		"Overzicht",
		[
			["Maand", "Omzet", "Bestellingen", "Advertenties", "ROAS", "Overige kosten", "Nettowinst", "Marge"],
			...MONTH_ROWS.map(([label, m], i) => {
				const r = i + 2;
				return [
					label,
					[`=INSYTE("omzet"; "${m}")`, "money"],
					[`=INSYTE("bestellingen"; "${m}")`, "integer"],
					[`=INSYTE("advertentiekosten"; "${m}")`, "money"],
					[`=B${r}/D${r}`, "number"],
					[`=INSYTE("overige_kosten"; "${m}")`, "money"],
					[`=B${r}-D${r}-F${r}`, "money"],
					[`=G${r}/B${r}`, "percent"],
				] as const;
			}),
			[
				["Totaal", undefined, true],
				[`=SOM(B2:B${last})`, "money", true],
				[`=SOM(C2:C${last})`, "integer", true],
				[`=SOM(D2:D${last})`, "money", true],
				[`=B${last + 1}/D${last + 1}`, "number", true],
				[`=SOM(F2:F${last})`, "money", true],
				[`=SOM(G2:G${last})`, "money", true],
				[`=G${last + 1}/B${last + 1}`, "percent", true],
			],
			[],
			["Doel nettomarge", ["25%", "percent"]],
			["Haalt mei het doel?", `=ALS(H${last}>=B${last + 3}; "ja"; "nee")`],
		],
		{ A: 150, B: 120, D: 120, F: 130, G: 120 },
	);
}

export function adsTab(id: string): Tab {
	return tabFrom(
		id,
		"Per kanaal",
		[
			["Maand", "Meta Ads", "Omzet via Meta", "ROAS Meta", "Google Ads", "Omzet via Google", "ROAS Google"],
			...MONTH_ROWS.map(([label, m], i) => {
				const r = i + 2;
				return [
					label,
					[`=INSYTE("advertenties_meta"; "${m}")`, "money"],
					[`=INSYTE("omzet_meta"; "${m}")`, "money"],
					[`=ALS.FOUT(C${r}/B${r}; 0)`, "number"],
					[`=INSYTE("advertenties_google"; "${m}")`, "money"],
					[`=INSYTE("omzet_google"; "${m}")`, "money"],
					[`=ALS.FOUT(F${r}/E${r}; 0)`, "number"],
				] as const;
			}),
		],
		{ A: 120, B: 110, C: 130, E: 110, F: 140 },
	);
}

export type TemplateId = "blank" | "profit" | "ads";

export const TEMPLATES: ReadonlyArray<{ id: TemplateId; title: string; body: string }> = [
	{ id: "profit", title: "Winst per maand", body: "Omzet, advertenties, overige kosten en nettowinst, met de marge tegen je doel." },
	{ id: "ads", title: "Advertenties per kanaal", body: "Wat Meta en Google kostten en opleverden, en de ROAS per maand." },
	{ id: "blank", title: "Leeg rekenblad", body: "Begin met een leeg blad. Koppel cellen aan Insyte wanneer je wilt." },
];

export function templateTabs(t: TemplateId, id: (p: string) => string): Tab[] {
	if (t === "profit") return [profitTab(id("tab"))];
	if (t === "ads") return [adsTab(id("tab"))];
	return [{ id: id("tab"), name: "Blad1", cells: {}, widths: {} }];
}
