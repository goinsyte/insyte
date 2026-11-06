import type { Ticket, TicketStatus } from "../lib/types/domain";
import { useWorkspace } from "../stores/workspace-store";

/*
 * The ticket board's store, now a face on the workspace's tickets.
 *
 * It used to hold its own copy of the fixtures, so a ticket drafted anywhere else in the console —
 * "Draft message" on a delayed order, "New ticket" on a customer — went into a list the board never
 * read. The board's API is unchanged; the tickets behind it are the same ones every screen sees.
 */
const set = (next: (tickets: Ticket[]) => Ticket[]) =>
	useWorkspace.setState((s) => ({ tickets: next(s.tickets) }));

export const ticketsStore = {
	get: () => useWorkspace.getState().tickets,
	update(id: string, patch: Partial<Ticket>) {
		set((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
	},
	move(id: string, toStatus: TicketStatus) {
		set((all) => all.map((t) => (t.id === id ? { ...t, status: toStatus } : t)));
	},
	reorder(status: TicketStatus, ids: string[]) {
		set((all) => {
			const others = all.filter((t) => t.status !== status);
			const reordered = ids.map((id) => all.find((t) => t.id === id)).filter((t): t is Ticket => Boolean(t));
			return [...others, ...reordered];
		});
	},
	add(t: Ticket) {
		set((all) => [t, ...all]);
	},
	remove(id: string) {
		set((all) => all.filter((t) => t.id !== id));
	},
};

export function useTickets(): Ticket[] {
	return useWorkspace((s) => s.tickets);
}
