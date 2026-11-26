import type { Ticket } from "../lib/types/domain.ts";

/*
 * The ticket modal's answer to the shopper ("Antwoord aan de klant"). One modal shows ticket after ticket, so what
 * comes back late (Insyte's draft, a mail that went, its undo) lands only while the ticket it was for is still the one
 * open: another ticket's draft never stands one click from mailing this ticket's shopper. `put` sets the composer:
 * words opens it with them, null closes it.
 */

type Put = (text: string | null) => void;

/** Insyte's draft for `ticketId`, in the composer if that ticket is still open. Answers whether it is. */
export async function draftFor(
	ticketId: string,
	openNow: () => string | null,
	ask: (ticketId: string) => Promise<string | undefined>,
	put: Put,
): Promise<boolean> {
	const text = await ask(ticketId);
	if (openNow() !== ticketId) return false;
	if (text !== undefined) put(text);
	return true;
}

/**
 * The answer mailed (`body`; absent, Insyte's short update): the composer closes once it went, and when the mail is
 * undone the words come back, for the ticket still open. Answers whether it went.
 */
export async function sendFor(
	ticket: Ticket,
	body: string | undefined,
	openNow: () => string | null,
	send: (ticket: Ticket, body: string | undefined, onUndone: () => void) => Promise<boolean>,
	put: Put,
): Promise<boolean> {
	const went = await send(ticket, body, () => {
		if (openNow() === ticket.id) put(body ?? "");
	});
	if (went && openNow() === ticket.id) put(null);
	return went;
}
