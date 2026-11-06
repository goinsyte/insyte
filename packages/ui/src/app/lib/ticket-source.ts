import type { Ticket, TicketSource } from "./types/domain";

/*
 * Where a ticket came from. Tickets are not mail: they arrive from the connected services — a
 * customer email through Gmail or Outlook, an order event from Shopify, a dispute from Klarna, a
 * chat, one of Insyte's own automations — or are written by hand. The board, the list and the area
 * panel's Sources all read it from here. A ticket made in the console carries its source; one from
 * the seed data is read from what it is about.
 */

export const SOURCE: Record<TicketSource, { label: string; brand?: string }> = {
	gmail: { label: "Gmail", brand: "gmail" },
	outlook: { label: "Outlook", brand: "outlook" },
	shopify: { label: "Shopify", brand: "shopify" },
	klarna: { label: "Klarna", brand: "klarna" },
	chat: { label: "Chat" },
	insyte: { label: "Insyte-automatiseringen" },
	manual: { label: "Handmatig toegevoegd" },
	supplier: { label: "Leveranciersportaal" },
};

export function sourceOf(t: Ticket): TicketSource {
	if (t.source) return t.source;
	const text = `${t.title} ${t.tags.join(" ")}`.toLowerCase();
	if (/klarna|chargeback|dispute|geschil/.test(text)) return "klarna";
	if (/chat/.test(text)) return "chat";
	if (/inventory|stock|voorraad/.test(text)) return "insyte";
	if (/refund|supplier|order confirmation|terugbetal|leverancier|bestelbevestiging/.test(text)) return "shopify";
	if (/translate|localization|vertal/.test(text)) return "manual";
	return "gmail";
}

export const isSnoozed = (t: Ticket, now = Date.now()) => t.snoozed_until !== undefined && Date.parse(t.snoozed_until) > now;
export const isArchived = (t: Ticket) => t.archived_at !== undefined;

/** The views a ticket list can show, and which tickets each holds. */
export type TicketView = "open" | "mine" | "unassigned" | "snoozed" | "done" | "archived" | "trash" | "spam";

export function inView(t: Ticket, view: TicketView, isMine: (t: Ticket) => boolean): boolean {
	if (view === "trash") return t.deleted_at !== undefined;
	if (t.deleted_at !== undefined) return false;
	if (view === "spam") return t.spam_at !== undefined;
	if (t.spam_at !== undefined) return false;
	if (view === "archived") return isArchived(t);
	if (isArchived(t)) return false;
	if (view === "snoozed") return isSnoozed(t);
	if (view === "done") return t.status === "done";
	if (isSnoozed(t)) return false;
	if (view === "mine") return t.status !== "done" && isMine(t);
	if (view === "unassigned") return t.status !== "done" && t.assignee_ids.length === 0;
	// Open is the board: every column, Done included, minus what is snoozed or archived.
	return true;
}

export const VIEW_LABEL: Record<TicketView, string> = {
	open: "Alle tickets",
	mine: "Aan mij toegewezen",
	unassigned: "Niet toegewezen",
	snoozed: "Uitgesteld",
	done: "Klaar",
	archived: "Gearchiveerd",
	trash: "Prullenbak",
	spam: "Spam",
};
