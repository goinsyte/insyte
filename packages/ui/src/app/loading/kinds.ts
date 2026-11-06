/*
 * Which shape of skeleton a route takes, and what its loader costs (ADR-0028). Kept apart from the
 * skeletons themselves so it can be tested without rendering anything.
 */

export type SkeletonKind =
	| "table"
	| "board"
	| "split"
	| "channel"
	| "dashboard"
	| "overview"
	| "analytics"
	| "settings"
	| "document"
	| "canvas"
	| "cards"
	| "conversation"
	| "list"
	| "grid"
	| "map";

/** Which shape a route takes, read from its route id (`/_admin/orders/$orderId`). */
export function skeletonFor(routeId: string): SkeletonKind {
	const id = routeId.replace(/^\/_(admin|supplier|aff)/, "");
	if (/\/automations\/\$/.test(id)) return "canvas";
	if (/\/sheets\/\$/.test(id)) return "grid";
	if (/\/\$[A-Za-z]+$/.test(id) || /learn\.\$/.test(id)) return "document";
	if (id.startsWith("/settings") || /\/(supplier|affiliate)\/settings/.test(id)) return "settings";
	if (id === "/dashboard") return "dashboard";
	if (/\/(supplier|affiliate)\/dashboard/.test(id)) return "overview";
	if (id === "/analytics") return "analytics";
	if (id.startsWith("/tickets")) return "board";
	if (id.startsWith("/inbox")) return "split";
	if (/chats/.test(id)) return "channel";
	if (id === "/ask") return "conversation";
	if (id === "/live") return "map";
	if (id === "/sheets" || id === "/marketplace" || id === "/affiliate/resources") return "cards";
	if (/notifications|\/ask\/activity|\/courses|training/.test(id)) return "list";
	return "table";
}

/** How long a kind's loader takes on a first visit, in ms at the live pace. Heavier shapes, longer. */
export const COST: Record<SkeletonKind, number> = {
	table: 520,
	board: 560,
	split: 600,
	channel: 540,
	dashboard: 420,
	overview: 480,
	analytics: 680,
	settings: 380,
	document: 480,
	canvas: 620,
	cards: 500,
	conversation: 360,
	list: 440,
	grid: 640,
	map: 360,
};
