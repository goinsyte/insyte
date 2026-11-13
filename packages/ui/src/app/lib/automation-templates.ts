import { TEMPLATES as DOMAIN_TEMPLATES, type Template } from "@insyte/domain/automations/Templates";
import { stockOf } from "./catalog";
import type { Chargeback, Customer, Order, Product, Ticket } from "./types/domain";

/**
 * The automation library. The first five are the example flows the original product spec names
 * (`../insyte/docs/mvp-functies.md`, "Voorbeeldautomations"); the rest cover the triggers that
 * spec lists. A template is only steps: using it makes a draft, and nothing runs until the
 * operator turns it on. The templates are the domain's (`@insyte/domain/automations/Templates`), the
 * one list the server makes drafts from; the design app adds what its own records say to them.
 */
export type { TemplateStep } from "@insyte/domain/automations/Templates";

export type AutomationTemplate = Template & {
	/** Whether the workspace's own records say this flow would have work to do, and how much. */
	evidence?: (w: WorkspaceFacts) => { count: number; line: string } | null;
};

export type WorkspaceFacts = {
	orders: ReadonlyArray<Order>;
	products: ReadonlyArray<Product>;
	customers: ReadonlyArray<Customer>;
	chargebacks: ReadonlyArray<Chargeback>;
	tickets: ReadonlyArray<Ticket>;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`;

const EVIDENCE: Record<string, AutomationTemplate["evidence"]> = {
	tpl_shipped: ({ orders }) => {
		const n = orders.filter((o) => o.status === "shipped").length;
		return n === 0 ? null : { count: n, line: `${plural(n, "bestelling is", "bestellingen zijn")} nu onderweg.` };
	},
	tpl_late: ({ orders }) => {
		const n = orders.filter((o) => o.tags.includes("at_risk") && o.status !== "delivered" && o.status !== "cancelled").length;
		return n === 0 ? null : { count: n, line: `${plural(n, "bestelling staat", "bestellingen staan")} op Vertraagd en ${n === 1 ? "wacht" : "wachten"} op iemand.` };
	},
	tpl_vip: ({ customers }) => {
		const n = customers.filter((c) => c.lifetime_value > 1000).length;
		return n === 0 ? null : { count: n, line: `${plural(n, "klant heeft", "klanten hebben")} meer dan €1.000 uitgegeven.` };
	},
	tpl_stock: ({ products }) => {
		const n = products.filter((p) => p.status === "active" && stockOf(p) !== "available").length;
		return n === 0 ? null : { count: n, line: `${plural(n, "actief product heeft", "actieve producten hebben")} lage voorraad of ${n === 1 ? "is" : "zijn"} uitverkocht.` };
	},
	tpl_chargeback: ({ chargebacks }) => {
		const n = chargebacks.filter((c) => c.status === "open" || c.status === "awaiting_evidence").length;
		return n === 0 ? null : { count: n, line: `${plural(n, "geschil staat", "geschillen staan")} open.` };
	},
};

export const TEMPLATES: ReadonlyArray<AutomationTemplate> = DOMAIN_TEMPLATES.map((t) => {
	const evidence = EVIDENCE[t.id];
	return evidence ? { ...t, evidence } : t;
});
