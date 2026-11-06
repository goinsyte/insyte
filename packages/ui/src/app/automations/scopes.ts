import { flatNodes, VARIANTS_BY_ID, type WorkflowNode, type WorkflowSettings } from "./node-types";

/**
 * The rights a flow's service account can hold. A flow acts as itself, never as a person, so what it
 * may touch is listed here and granted per flow; a step whose right is switched off fails, and says so.
 */
export const SCOPES: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "orders.read", label: "Bestellingen lezen" },
	{ id: "orders.write", label: "Bestellingen bewerken" },
	{ id: "customers.read", label: "Klanten lezen" },
	{ id: "customers.write", label: "Klanten labelen" },
	{ id: "customers.email", label: "Klanten mailen" },
	{ id: "tickets.write", label: "Tickets maken" },
	{ id: "team.notify", label: "Collega's berichten" },
	{ id: "suppliers.message", label: "Leveranciers berichten" },
	{ id: "refunds.write", label: "Terugbetalen" },
	{ id: "payments.read", label: "Betalingen lezen" },
	{ id: "disputes.write", label: "Geschillen beantwoorden" },
	{ id: "stock.read", label: "Voorraad lezen" },
	{ id: "marketing.write", label: "Campagnes beheren" },
	{ id: "accounting.write", label: "Boekhouding boeken" },
	{ id: "files.write", label: "Bestanden bewerken" },
	{ id: "ai.draft", label: "AI laten opstellen" },
];

export const SCOPE_LABEL: Record<string, string> = Object.fromEntries(SCOPES.map((s) => [s.id, s.label]));

/** For each right, the steps that need it, by their label. */
export function scopeNeeds(nodes: ReadonlyArray<WorkflowNode>): Map<string, Array<{ nodeId: string; label: string }>> {
	const out = new Map<string, Array<{ nodeId: string; label: string }>>();
	for (const n of flatNodes(nodes)) {
		const v = VARIANTS_BY_ID[n.variantId];
		if (!v?.scope) continue;
		const list = out.get(v.scope) ?? [];
		list.push({ nodeId: n.id, label: (n.config.title_override as string | undefined) ?? v.label });
		out.set(v.scope, list);
	}
	return out;
}

/** The right a node needs that this flow does not hold, if any. */
export function missingScope(node: WorkflowNode, settings: WorkflowSettings): string | null {
	const scope = VARIANTS_BY_ID[node.variantId]?.scope;
	return scope && settings.scopesOff.includes(scope) ? scope : null;
}
