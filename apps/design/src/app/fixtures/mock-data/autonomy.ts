import type { AutonomySeed } from "@insyte/ui/data-source";
import { byScenario, longName } from "../scenario";

/*
 * The workspace's autonomy policy and AI budget, per design state (ADR-0027, PLAN 29).
 *
 * First day: the defaults, where everything asks first, and a budget nobody has used. A normal
 * Tuesday: Elena let Insyte assign, note, label and snooze on its own on 28 October; €38 of €120
 * spent, Liam at 85% of his €20. The busy week: €410 of €500, and one person at their limit.
 */

const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

const SETTLED: AutonomySeed = {
	policy: { AssignTicket: "auto", AddNote: "auto", ApplyLabel: "auto", SnoozeThread: "auto" },
	version: 3,
	budget: { limit: 120, used: 38.4 },
	people: [
		{ memberId: "mem_elena", limit: null, used: 11.8 },
		{ memberId: "mem_sofia", limit: 30, used: 9.6 },
		{ memberId: "mem_liam", limit: 20, used: 17 },
		{ memberId: "mem_ethan", limit: 20, used: 4.1 },
		{ memberId: "mem_maya", limit: 10, used: 1.9 },
	],
	background: 4,
	history: [
		{ id: "pol_3", at: at(4), by: "Elena Hart", version: 3, changes: [{ id: "SnoozeThread", from: "ask", to: "auto" }, { id: "ApplyLabel", from: "ask", to: "auto" }] },
		{ id: "pol_2", at: at(19), by: "Elena Hart", version: 2, changes: [{ id: "AssignTicket", from: "ask", to: "auto" }, { id: "AddNote", from: "ask", to: "auto" }] },
		{ id: "pol_1", at: at(62), by: "Insyte", version: 1, changes: [] },
	],
};

const BUSY: AutonomySeed = {
	policy: {
		AssignTicket: "auto",
		AddNote: "auto",
		ApplyLabel: "auto",
		SnoozeThread: "auto",
		SetTicketStatus: "auto",
		SetPriority: "auto",
		CreateTicket: "auto",
		PostChatMessage: "never",
	},
	version: 9,
	budget: { limit: 500, used: 410 },
	people: [
		{ memberId: "mem_elena", limit: null, used: 64 },
		{ memberId: "mem_sofia", limit: 60, used: 60 },
		{ memberId: "mem_liam", limit: 40, used: 22.5 },
		{ memberId: "mem_ethan", limit: 40, used: 31 },
		{ memberId: "mem_maya", limit: 20, used: 8.2 },
		...Array.from({ length: 5 }, (_, i) => ({ memberId: `mem_busy_${i}`, limit: 40, used: [18, 33.5, 12, 39, 6][i]! })),
	],
	background: 115.8,
	history: Array.from({ length: 8 }, (_, i) => ({
		id: `pol_${9 - i}`,
		at: at(2 + i * 6),
		by: i % 3 === 2 ? longName(20) : "Elena Hart",
		version: 9 - i,
		changes: [{ id: (["PostChatMessage", "CreateTicket", "SetPriority", "SetTicketStatus", "SnoozeThread", "ApplyLabel", "AddNote", "AssignTicket"] as const)[i]!, from: "ask" as const, to: i === 0 ? ("never" as const) : ("auto" as const) }],
	})),
};

const EMPTY: AutonomySeed = {
	policy: {},
	version: 1,
	budget: { limit: 120, used: 0 },
	people: [{ memberId: "mem_elena", limit: null, used: 0 }],
	background: 0,
	history: [{ id: "pol_1", at: at(0), by: "Insyte", version: 1, changes: [] }],
};

export const autonomySeed: AutonomySeed = byScenario({ empty: EMPTY, settled: SETTLED, busy: () => BUSY });
