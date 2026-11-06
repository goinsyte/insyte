import type { QualitySeed } from "@insyte/ui/data-source";
import { products } from "./products";
import { byScenario } from "../scenario";

/*
 * Quality checks and complaints (PLAN 26, design §3), on the workspace's own products and suppliers.
 *
 * A normal Tuesday: the Harbor regenjas has had three checks — two approved, one rejected for the
 * seam — four complaints, two of them from returns (R-1040 and R-1034), a complaint rate of 6,2% on
 * 65 sold in 90 days, and is under watch. Allure has an open check for the Aurora fleece, due
 * Friday; Kestrel's check for the Meridian rugzak is overdue. Photos are the catalogue's own.
 */

const D = 86_400_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const img = (id: string, i = 0) => products.find((p) => p.id === id)?.images[i] ?? "";
/** The coming Friday at 17:00, so "vóór vrijdag" reads true whatever day the demo opens. */
const friday = () => {
	const d = new Date(now);
	d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
	d.setHours(17, 0, 0, 0);
	return d.toISOString();
};

const SETTLED: QualitySeed = {
	checks: [
		{
			id: "qc_301",
			productId: "prod_2010",
			supplierId: "sup_allure",
			kind: "sample",
			variants: [],
			deliver: ["photos", "measurements"],
			due: iso(now - 80 * D),
			status: "approved",
			requestedAt: iso(now - 86 * D),
			requestedBy: "Elena Hart",
			note: "Monster van de eerste productie: voorkant, achterkant, naden en de rits van dichtbij.",
			submission: { at: iso(now - 82 * D), by: "Marco Rossi", photos: [img("prod_2010", 0), img("prod_2010", 1)], video: false, note: "Naden dubbel gestikt zoals afgesproken." },
			verdict: { at: iso(now - 81 * D), by: "Elena Hart" },
		},
		{
			id: "qc_302",
			productId: "prod_2010",
			supplierId: "sup_allure",
			kind: "batch",
			variants: ["Middel", "Groot"],
			deliver: ["photos", "batch"],
			due: iso(now - 30 * D),
			status: "rejected",
			requestedAt: iso(now - 36 * D),
			requestedBy: "Sofía Kim",
			note: "Batch van oktober: foto's van de schoudernaad bij Middel en Groot.",
			submission: { at: iso(now - 31 * D), by: "Marco Rossi", photos: [img("prod_2010", 1), img("prod_2010", 0)], video: false, batch: "AL-2609" },
			verdict: { at: iso(now - 30 * D), by: "Sofía Kim", reason: "Naad bij de linkerschouder loopt niet door tot de zoom; zelfde plek als de klachten." },
		},
		{
			id: "qc_303",
			productId: "prod_2010",
			supplierId: "sup_allure",
			kind: "batch",
			variants: ["Middel", "Groot"],
			deliver: ["photos", "batch", "video"],
			due: iso(now - 12 * D),
			status: "approved",
			requestedAt: iso(now - 20 * D),
			requestedBy: "Sofía Kim",
			note: "Herstelde batch: dezelfde foto's, plus een korte video van de naad onder spanning.",
			submission: { at: iso(now - 13 * D), by: "Marco Rossi", photos: [img("prod_2010", 0)], video: true, batch: "AL-2610", note: "Naad nu doorgestikt tot de zoom." },
			verdict: { at: iso(now - 12 * D), by: "Sofía Kim" },
		},
		{
			id: "qc_304",
			productId: "prod_2000",
			supplierId: "sup_allure",
			kind: "batch",
			variants: ["Klein", "Middel", "Groot"],
			deliver: ["photos", "batch"],
			due: friday(),
			status: "requested",
			requestedAt: iso(now - 1 * D),
			requestedBy: "Elena Hart",
			note: "Voor we opschalen: zes foto's van de nieuwe batch, binnen en buiten, en het batchnummer.",
		},
		{
			id: "qc_305",
			productId: "prod_2013",
			supplierId: "sup_kestrel",
			kind: "test_order",
			variants: [],
			deliver: ["photos", "video"],
			due: iso(now - 3 * D),
			status: "requested",
			requestedAt: iso(now - 10 * D),
			requestedBy: "Ethan Jeppesen",
			note: "Testbestelling naar ons kantoor: hoe komt hij aan, en houden de gespen.",
		},
	],
	complaints: [
		{ id: "cmp_1", productId: "prod_2010", variant: "Middel", at: iso(now - 6 * 3_600_000), text: "De naad bij de linkerschouder is gescheurd na twee keer dragen.", source: "return", returnId: "ret_1040", customer: "Felix Müller" },
		{ id: "cmp_2", productId: "prod_2010", variant: "Middel", at: iso(now - 11 * D), text: "Rits trekt los van de stof na een week.", source: "return", returnId: "ret_1034", customer: "Chris Lee" },
		{ id: "cmp_3", productId: "prod_2010", variant: "Groot", at: iso(now - 33 * D), text: "Lekt bij de schouders bij harde regen.", source: "message", customer: "Astrid Berg" },
		{ id: "cmp_4", productId: "prod_2010", variant: "Groot", at: iso(now - 40 * D), text: "Naad bij de schouder laat los.", source: "message", customer: "Soren Nilsson" },
	],
	phases: { prod_2010: "watch", prod_2000: "active", prod_2013: "test", prod_2018: "active" },
	sold90: { prod_2010: 65, prod_2000: 412, prod_2013: 38, prod_2018: 120, prod_2003: 140 },
	threshold: 0.05,
};

/* The busy week: forty products, each with a check in some state, and a few over the threshold. */
const busy = (): QualitySeed => {
	const statuses = ["requested", "submitted", "approved", "approved", "rejected"] as const;
	const sups = ["sup_allure", "sup_dpc", "sup_kestrel", "sup_blackcedar"];
	const list = products.slice(0, 40);
	return {
		...SETTLED,
		checks: [
			...SETTLED.checks,
			...list.map((p, i) => ({
				id: `qc_b${i}`,
				productId: p.id,
				supplierId: p.supplier_id ?? sups[i % 4]!,
				kind: (["sample", "batch", "test_order"] as const)[i % 3]!,
				variants: i % 2 ? ["Middel"] : [],
				deliver: ["photos", "batch"] as QualitySeed["checks"][number]["deliver"],
				due: iso(now + ((i % 9) - 3) * D),
				status: statuses[i % 5]!,
				requestedAt: iso(now - (i + 2) * D),
				requestedBy: "Elena Hart",
				note: "Wekelijkse batchcontrole met foto's van binnen- en buitenkant, de labels en het batchnummer, voordat we de advertenties opschalen voor de feestdagen.",
				submission: statuses[i % 5] === "requested" ? undefined : { at: iso(now - i * D), by: "Leverancier", photos: [p.images[0] ?? ""], video: false, batch: `B-${2600 + i}` },
				verdict: statuses[i % 5] === "approved" || statuses[i % 5] === "rejected" ? { at: iso(now - i * D), by: "Elena Hart", reason: statuses[i % 5] === "rejected" ? "Kleur wijkt af van het goedgekeurde monster." : undefined } : undefined,
			})),
		],
		phases: Object.fromEntries(list.map((p, i) => [p.id, (["active", "watch", "test", "active", "phased_out"] as const)[i % 5]!])),
		sold90: Object.fromEntries(list.map((p, i) => [p.id, 40 + ((i * 37) % 400)])),
	};
};

export const qualitySeed: QualitySeed = byScenario({ empty: { checks: [], complaints: [], phases: {}, sold90: {}, threshold: 0.05 }, settled: SETTLED, busy });
