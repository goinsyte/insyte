import type { AgentActionId, AutonomyLevel } from "./autonomy.ts";

/*
 * The agent's activity log (ADR-0027, `agent_actions`): one row per thing the Insyte-agent did, with
 * the setting it ran under, what started it, what it read, why, and — while the server's window is
 * open — the way back. Types and pure helpers only; the store is `stores/agent-log-store.ts`.
 */

export type LogRecordKind = "ticket" | "order" | "customer" | "thread" | "return" | "product" | "supplier" | "chat";

export type LogRecord = { kind: LogRecordKind; label: string; to: string; search?: Record<string, string>; id?: string };

export type LogSourceKind = "ticket" | "order" | "customer" | "thread" | "knowledge" | "policy" | "product" | "supplier" | "return";

export type LogSource = { kind: LogSourceKind; title: string; detail: string; to?: string };

/**
 * What an action changed, said precisely enough to take it back. Each kind is idempotent (it sets
 * a field to a value), so applying an undo twice, or again after a reload, changes nothing more.
 */
export type AgentEffect =
	| { kind: "ticket.assign"; ticketId: string; from: string[]; to: string[] }
	| { kind: "ticket.status"; ticketId: string; from: string; to: string }
	| { kind: "ticket.priority"; ticketId: string; from: string; to: string }
	| { kind: "ticket.label"; ticketId: string; label: string }
	| { kind: "ticket.snooze"; ticketId: string; until: string }
	| { kind: "order.label"; orderId: string; label: string }
	| { kind: "thread.label"; threadId: string; label: string }
	| { kind: "thread.assign"; threadId: string; from: string | null; to: string | null }
	| { kind: "send"; channel: string; to: string }
	| { kind: "order.forward"; keys: string[] }
	| { kind: "return.status"; returnId: string; from: string; to: string }
	| { kind: "note"; target: string };

export type AgentLogStatus = "done" | "sending" | "undone" | "failed";

export type AgentLogEntry = {
	id: string;
	at: string;
	action: AgentActionId;
	/** The action in one Dutch sentence: "Ticket TKT-0901 toegewezen aan Sofía Kim". */
	sentence: string;
	record?: LogRecord;
	/** The level it ran under. `ask` means a person approved the proposal first. */
	level: AutonomyLevel;
	approvedBy?: string;
	/** What started it: "Nieuwe e-mail", "Websitechat", "Vraag Insyte door Maya Roy", an API key's name. */
	trigger: string;
	status: AgentLogStatus;
	undoneBy?: string;
	failReason?: string;
	sources: LogSource[];
	/** One line on why, in Dutch. */
	reason: string;
	before?: string;
	after?: string;
	policyVersion: number;
	model: string;
	promptVersion: string;
	/** Until when the server can still take it back. */
	undoUntil?: number;
	/** What a person can still do by hand once the window has closed: "Heropenen", "Toewijzing weghalen". */
	compensation?: string;
	effect?: AgentEffect;
};

export const STATUS_LABEL: Record<AgentLogStatus, string> = {
	done: "Gedaan",
	sending: "Wordt verstuurd…",
	undone: "Ongedaan gemaakt",
	failed: "Mislukt",
};

export const RECORD_LABEL: Record<LogRecordKind, string> = {
	ticket: "Ticket",
	order: "Bestelling",
	customer: "Klant",
	thread: "Gesprek",
	return: "Retour",
	product: "Product",
	supplier: "Leverancier",
	chat: "Chat",
};

/** "Zelf gedaan · Zelfstandigheid: Zelf doen", or who approved it. */
export function ranUnder(e: Pick<AgentLogEntry, "level" | "approvedBy">): string {
	return e.level === "auto" ? "Zelf doen" : e.approvedBy ? `Na goedkeuring van ${e.approvedBy}` : "Eerst vragen";
}

/** Whether a row can still be taken back from the log at `now`. */
export function canUndo(e: Pick<AgentLogEntry, "status" | "undoUntil" | "effect">, now: number): boolean {
	return (e.status === "done" || e.status === "sending") && e.effect !== undefined && e.undoUntil !== undefined && e.undoUntil > now;
}

/** "nog 4 min", "nog 40 s". */
export function leftLabel(ms: number): string {
	const s = Math.ceil(ms / 1000);
	return s >= 60 ? `nog ${Math.ceil(s / 60)} min` : `nog ${s} s`;
}
