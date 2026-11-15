import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { currentUserByPersona } from "../../data-source";
import type { ProposalAction } from "../lib/ask/types";
import { undoable } from "../lib/undo";
import { useAgentEntries } from "../stores/agent-log-store";
import { useAsk } from "../stores/ask-store";
import { useWorkspace } from "../stores/workspace-store";
import { ticketsStore } from "../tickets/tickets-store";
import { type AskSource, AskSourceProvider, useHostedAskSource } from "./ask-source";

/**
 * The design app's Vraag Insyte: the scripted conversations in the browser (`ask-store.ts`), over the workspace on
 * screen, and a proposal filed doing the real thing to that workspace, with Undo.
 */
export function useDemoAskSource(): AskSource {
	const conversations = useAsk((s) => s.conversations);
	const active = useAsk((s) => s.active);
	const ask = useAsk((s) => s.ask);
	const start = useAsk((s) => s.start);
	const open = useAsk((s) => s.open);
	const remove = useAsk((s) => s.remove);
	const settle = useAsk((s) => s.settle);
	const decide = useAsk((s) => s.decide);
	const navigate = useNavigate();
	const needs = useWorkspace((s) => s.queue.filter((q) => q.state === "open" && (q.signal === "red" || q.signal === "amber")).length);
	const orders = useWorkspace((s) => s.orders);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const actions = useAgentEntries().length;
	return {
		conversations,
		active,
		turns: conversations.find((c) => c.id === active)?.turns,
		ask,
		start,
		open,
		remove: (id) => {
			const c = conversations.find((x) => x.id === id);
			remove(id);
			if (c !== undefined) undoable("Gesprek verwijderd", () => useAsk.setState((s) => ({ conversations: [c, ...s.conversations] })));
		},
		settle,
		decide,
		welcome: { name: currentUserByPersona.admin.name.split(" ")[0] ?? "", needs },
		mentions: [
			...orders.filter((o) => o.tags.includes("at_risk")).map((o) => ({ ref: o.number, hint: `${o.customer_name} · vertraagd`, kind: "order" as const })),
			...chargebacks.map((c) => ({ ref: c.case_number, hint: `${c.customer_name} · ${c.provider}`, kind: "chargeback" as const })),
			...orders.filter((o) => !o.tags.includes("at_risk")).map((o) => ({ ref: o.number, hint: o.customer_name, kind: "order" as const })),
		],
		file: (action) => run(action, navigate),
		actions,
	};
}

/** The scripted Vraag Insyte around `children`, unless the host provides its own. */
export function DemoAskSource({ children }: { children: ReactNode }) {
	const hosted = useHostedAskSource();
	const demo = useDemoAskSource();
	return <AskSourceProvider value={hosted ?? demo}>{children}</AskSourceProvider>;
}

/** Filing a proposal does the real thing to the workspace, with Undo where there is one. */
function run(action: ProposalAction | undefined, navigate: ReturnType<typeof useNavigate>) {
	if (!action) return;
	const ws = useWorkspace.getState();
	if (action.kind === "file-queue") {
		const before = ws.fileQueue(action.queueId);
		if (before !== undefined) undoable(action.label, () => useWorkspace.getState().restoreQueue(action.queueId, before));
	} else if (action.kind === "supplier-ticket") {
		const id = `ticket_ask_${Date.now()}`;
		const now = new Date().toISOString();
		ticketsStore.add({
			id,
			number: `TKT-${String(900 + ws.tickets.length + 1).padStart(4, "0")}`,
			title: `Nieuwe overdrachtsdata van ${action.supplier}`,
			description: `${action.supplier} gevraagd om nieuwe overdrachtsdata voor ${action.orders.join(", ")}.`,
			status: "awaiting_reply",
			priority: "medium",
			tags: ["Leverancier"],
			assignee_ids: [],
			created_at: now,
			updated_at: now,
		});
		undoable(`Ticket geopend voor ${action.supplier}`, () => ticketsStore.remove(id), "Het staat op het bord onder Wacht op antwoord.");
	} else if (action.kind === "send-reply") {
		// The email is simulated; what the workspace keeps is the conversation, as a ticket waiting on them.
		const ticket = ws.createTicket({
			title: `Wacht op ${action.to}`,
			description: `Beantwoord: ${action.body}`,
			priority: "low",
			status: "awaiting_reply",
			tags: ["Klant"],
		});
		undoable(`Antwoord verstuurd naar ${action.to}`, () => ticketsStore.remove(ticket.id), `Gevolgd als ${ticket.number} onder Wacht op antwoord.`);
	} else {
		void navigate({ to: action.to });
	}
}

