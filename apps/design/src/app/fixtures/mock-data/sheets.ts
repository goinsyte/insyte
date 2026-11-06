import type { Sheet, SheetsSeed } from "@insyte/ui/data-source";
import { adsTab, profitTab, tabFrom } from "@insyte/ui/app/lib/sheet-templates";
import { byScenario } from "../scenario";

/*
 * Rekenbladen (PLAN 40): Northwind's own calculations. Two sheets on Insyte's figures in Financiën,
 * a purchasing sheet typed in by hand (one price still missing, so one margin cannot be worked out
 * yet), one Sofía shared, and last year's Black Friday plan in the archive.
 */

const D = 86_400_000;
const at = (days: number, h = 10) => new Date(Date.now() - days * D + (h - 10) * 3_600_000).toISOString();

const sheet = (s: Partial<Sheet> & Pick<Sheet, "id" | "title" | "tabs">): Sheet => ({ pinned: false, archived: false, ownerId: "mem_elena", shared: [], createdAt: at(30), updatedAt: at(2), ...s });

const purchase = tabFrom(
	"tab_allure",
	"Allure",
	[
		["Product", "Stuks", "Inkoopprijs", "Inkoop totaal", "Verkoopprijs", "Marge"],
		["Aurora Hooded Fleece", "240", ["18,40", "money"], ["=B2*C2", "money"], ["64", "money"], ["=(E2-C2)/E2", "percent"]],
		["Summit Rain Shell", "120", ["31,20", "money"], ["=B3*C3", "money"], ["119", "money"], ["=(E3-C3)/E3", "percent"]],
		["Ridge Beanie", "400", ["3,10", "money"], ["=B4*C4", "money"], ["24", "money"], ["=(E4-C4)/E4", "percent"]],
		["Trailhead Daypack", "80", ["22,75", "money"], ["=B5*C5", "money"], null, ["=(E5-C5)/E5", "percent"]],
		[["Totaal", undefined, true], ["=SOM(B2:B5)", "integer", true], null, ["=SOM(D2:D5)", "money", true]],
		[],
		["Prijs daypack nog niet vastgesteld met Allure."],
	],
	{ A: 180, D: 120, E: 110 },
);

const returnsTab = tabFrom(
	"tab_ret",
	"Retouren",
	[
		["Product", "Retouren", "Kosten per retour", "Totaal"],
		["Aurora Hooded Fleece", "38", ["6,95", "money"], ["=B2*C2", "money"]],
		["Summit Rain Shell", "21", ["6,95", "money"], ["=B3*C3", "money"]],
		["Ridge Beanie", "9", ["4,95", "money"], ["=B4*C4", "money"]],
		[["Totaal", undefined, true], ["=SOM(B2:B4)", "integer", true], null, ["=SOM(D2:D4)", "money", true]],
	],
	{ A: 180, C: 130 },
);

const SETTLED: SheetsSeed = {
	folders: [
		{ id: "fld_fin", name: "Financiën" },
		{ id: "fld_inkoop", name: "Inkoop" },
	],
	sheets: [
		sheet({ id: "sh_profit", title: "Winst per maand", folderId: "fld_fin", pinned: true, tabs: [profitTab("tab_profit")], updatedAt: at(0, 9), openedAt: at(0, 9) }),
		sheet({ id: "sh_ads", title: "Advertenties per kanaal", folderId: "fld_fin", tabs: [adsTab("tab_ads")], updatedAt: at(3), openedAt: at(1) }),
		sheet({ id: "sh_allure", title: "Inkoop Allure, voorjaar", folderId: "fld_inkoop", tabs: [purchase], updatedAt: at(6), openedAt: at(5) }),
		sheet({ id: "sh_returns", title: "Retourkosten per product", ownerId: "mem_sofia", shared: ["mem_elena"], tabs: [returnsTab], updatedAt: at(4), openedAt: at(4) }),
		sheet({ id: "sh_bf", title: "Black Friday 2025", archived: true, tabs: [tabFrom("tab_bf", "Plan", [["Actie", "Korting"], ["Fleece", ["30%", "percent"]], ["Mutsen", ["2 voor 1"]]])], updatedAt: at(340), createdAt: at(360) }),
	],
};

export const sheetsSeed: SheetsSeed = byScenario({ empty: { folders: [], sheets: [] }, settled: SETTLED });
