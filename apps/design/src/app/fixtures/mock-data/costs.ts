import type { CostsSeed } from "@insyte/ui/data-source";
import { byScenario } from "../scenario";

/*
 * Costs (PLAN 42): Northwind's month. Meta Ads is connected and reports its own spend; Google Ads is
 * not, so its spend was typed in from the invoices. The first day has no lines at all.
 */

const each = (n: number) => ({ "2026-01": n, "2026-02": n, "2026-03": n, "2026-04": n, "2026-05": n });

const SETTLED: CostsSeed = {
	lines: [
		{ id: "cost_purchase", name: "Inkoop bij leveranciers", kind: "percent", amounts: {}, rate: 38, source: "manual" },
		{ id: "cost_fees", name: "Betaalkosten (Stripe, Klarna)", kind: "percent", amounts: {}, rate: 2.9, source: "manual" },
		{ id: "cost_pack", name: "Verpakking", kind: "per_order", amounts: {}, rate: 1.4, source: "manual" },
		{ id: "cost_team", name: "Team", kind: "fixed", amounts: { "2026-01": 16_800, "2026-02": 16_800, "2026-03": 18_400, "2026-04": 18_400, "2026-05": 18_400 }, rate: 0, source: "manual" },
		{ id: "cost_shopify", name: "Shopify Advanced", kind: "fixed", amounts: each(399), rate: 0, source: "manual" },
		{ id: "cost_apps", name: "Apps en abonnementen", kind: "fixed", amounts: { "2026-01": 584, "2026-02": 584, "2026-03": 612, "2026-04": 612, "2026-05": 640 }, rate: 0, source: "manual" },
		{ id: "cost_meta", name: "Meta Ads", kind: "ads", amounts: {}, rate: 0, source: "meta", channel: "Meta ads" },
		{ id: "cost_google", name: "Google Ads", kind: "ads", amounts: { "2026-01": 3_150, "2026-02": 2_980, "2026-03": 3_420, "2026-04": 3_610, "2026-05": 2_890 }, rate: 0, source: "google-ads", channel: "Google" },
	],
};

export const costsSeed: CostsSeed = byScenario({ empty: { lines: [] }, settled: SETTLED });
