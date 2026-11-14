import type { StoreHealth, SyncLine } from "../lib/types/sync-health";

/*
 * Sync health in the design app (the console's comes from `Connections.health`): every connected store read through
 * this quarter hour, except the second, whose order webhooks stopped at 03:12 and whose changes Insyte has been reading
 * itself since. One store is enough to show the line, the row and what Insyte already tried, and the line agrees with
 * Winkels.
 */

const GAP: StoreHealth = {
	tone: "warning",
	label: "Let op",
	synced: "Gesynchroniseerd om 09:15",
	reconnect: false,
	incidents: [
		{
			id: "inc_demo_gap",
			tone: "warning",
			finding: "Er komen sinds 03:12 geen webhooks van Shopify binnen.",
			next: "Insyte haalt de wijzigingen zelf op",
			since: "Sinds 05:15",
			told: "Gemeld aan jou",
			resolved: null,
			tried: [{ at: "05:15", text: "Haalt de wijzigingen sinds 03:12 zelf op bij Shopify" }],
		},
		{
			id: "inc_demo_rate",
			tone: "warning",
			finding: "De limiet van Shopify voor verzoeken is bijna bereikt.",
			next: null,
			since: "Sinds ma 11:30",
			told: null,
			resolved: "Opgelost ma 12:00",
			tried: [{ at: "11:30", text: "Remde zijn eigen verzoeken af en leest de rest het volgende kwartier" }],
		},
	],
};

const FINE: StoreHealth = { tone: "success", label: "Gesynchroniseerd", synced: "Gesynchroniseerd om 09:15", reconnect: false, incidents: [] };

/** Each demo store's health: the second connected store has the gap. */
export function demoHealth(stores: ReadonlyArray<{ id: string; status: string }>): Record<string, StoreHealth> {
	const connected = stores.filter((s) => s.status === "connected");
	return Object.fromEntries(connected.map((s, n) => [s.id, n === 1 ? GAP : FINE]));
}

/** The top bar's line over the same stores. */
export function demoSyncLine(stores: ReadonlyArray<{ id: string; name: string; status: string }>): SyncLine | null {
	const connected = stores.filter((s) => s.status === "connected");
	if (connected.length === 0) return null;
	const gap = connected[1];
	if (gap === undefined) {
		return {
			tone: "ok",
			label: connected.length === 1 ? "Winkel gesynchroniseerd" : "Winkels gesynchroniseerd",
			detail: "Alles is om 09:15 gesynchroniseerd.",
			href: "/settings/stores",
		};
	}
	return {
		tone: "warning",
		label: `${gap.name}: webhooks achter`,
		detail: `${gap.name}: er komen sinds 03:12 geen webhooks van Shopify binnen. Insyte haalt de wijzigingen zelf op.`,
		href: `/settings/stores?store=${gap.id}`,
	};
}
