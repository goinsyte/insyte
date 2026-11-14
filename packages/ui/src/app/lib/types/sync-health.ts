/*
 * Sync health's shapes as the screens read them (M17 step 6), in the host's words: the top bar's line and a store's
 * incidents on Winkels. Plain types, so a host's logic can make them without importing a screen.
 */

/**
 * The top bar's one line on the stores' sync (sync health), in the host's words: quiet while every store is read
 * through, amber while Insyte is handling something, red when the operator must act. Links to Winkels.
 */
export type SyncLine = {
	tone: "ok" | "warning" | "danger";
	/** The line itself: "Winkels gesynchroniseerd", "Noorderlicht: webhooks achter". */
	label: string;
	/** The longer sentence, for the tooltip and screen readers. */
	detail: string;
	href: string;
};

/** One incident on a store's connection (sync health), in the host's words. */
export interface StoreIncident {
	id: string;
	/** `danger` when only the operator can mend it, `warning` while Insyte is handling it. */
	tone: "warning" | "danger";
	/** What is wrong: "Er komen sinds 03:12 geen webhooks van Shopify binnen." */
	finding: string;
	/** What Insyte does while it lasts, or what the operator can do; `null` when there is nothing to add. */
	next: string | null;
	/** What Insyte already did, oldest first: when, and what. */
	tried: ReadonlyArray<{ at: string; text: string }>;
	/** Since when: "Sinds 03:12". */
	since: string;
	/** Who heard of it: "Gemeld aan Sanne"; `null` while nobody has. */
	told: string | null;
	/** When it ended by itself: "Opgelost om 05:40"; `null` while it is open. */
	resolved: string | null;
}

/** A store's sync as Winkels shows it: a word, the last sync, and the incidents open now or lately. */
export interface StoreHealth {
	tone: "success" | "warning" | "danger" | "info";
	label: string;
	/** "Gesynchroniseerd om 14:15"; `null` before the first sync. */
	synced: string | null;
	/** Open ones first, then those resolved lately. */
	incidents: ReadonlyArray<StoreIncident>;
	/** Whether the store must be connected again for the sync to go on. */
	reconnect: boolean;
}
