import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SCENARIO, type Scenario } from "../../data-source";
import { nodesFrom, workflowStore } from "../automations/workflow-store";
import type { AutonomyLevel, AgentActionId } from "../lib/autonomy";
import { newId } from "../lib/courses";
import { hoursFor, type OfflineWindow, type PreparedId } from "../lib/first-analysis";
import { type Spec, tabFrom } from "../lib/sheet-templates";
import { useAutonomy } from "./autonomy-store";
import { useCustomerAgent } from "./customer-agent-store";
import { useSheets } from "./sheets-store";

/*
 * What the first analysis left behind (PLAN 45): which of its prepared items were made, where they
 * are, and the offline plan that was agreed. Start reads it for the first days (PLAN 46).
 *
 * Preparing makes real records in the stores the rest of the demo reads: the automation is a draft
 * under Automatiseringen, the agent is the customer agent on drafts for e-mail, the sheet is a
 * rekenblad. Nothing is switched on that the operator did not see listed.
 */

type Made = { automationId?: string; sheetId?: string; agent?: boolean };

type State = {
	scenario: Scenario;
	at?: string;
	made: Made;
	offline?: { window: OfflineWindow; levels: Partial<Record<AgentActionId, AutonomyLevel>> };
	answers: Record<string, string>;
	prepare: (ids: ReadonlyArray<PreparedId>, titles: Record<PreparedId, string>, by: string) => Made;
	agreeOffline: (window: OfflineWindow, levels: Partial<Record<AgentActionId, AutonomyLevel>>, by: string) => void;
	answer: (id: string, value: string) => void;
};

/** The sheet the finding prepares: what the store promises next to what delivery takes. */
const deliveryRows: Spec = [
	["Land", "Belofte (dagen)", "Werkelijk (mediaan)", "Verschil", "Zendingen"],
	["Verenigde Staten", ["7", "integer"], ["9,4", "number"], ["=C2-B2", "number"], ["238", "integer"]],
	["Duitsland", ["7", "integer"], ["6,1", "number"], ["=C3-B3", "number"], ["412", "integer"]],
	["Nederland", ["5", "integer"], ["4,2", "number"], ["=C4-B4", "number"], ["1106", "integer"]],
	["Frankrijk", ["7", "integer"], ["7,8", "number"], ["=C5-B5", "number"], ["187", "integer"]],
	["Verenigd Koninkrijk", ["7", "integer"], ["8,6", "number"], ["=C6-B6", "number"], ["94", "integer"]],
];

export const useFirstAnalysis = create<State>()(
	persist(
		(set, get) => ({
			scenario: SCENARIO,
			made: {},
			answers: {},
			prepare: (ids, titles, by) => {
				const made: Made = { ...get().made };
				if (ids.includes("automation") && !made.automationId) {
					const id = workflowStore.create({
						name: titles.automation,
						nodes: nodesFrom([
							["trigger.shipping_delay", { summary: "5 dagen onderweg en nog niet bezorgd" }],
							[
								"action.send_email",
								{
									subject: "Je bestelling is onderweg",
									body: "Hoi {{customer.first_name}},\n\nJe bestelling {{order.number}} is onderweg. Je volgt hem hier: {{order.tracking}}. We verwachten hem op {{order.expected_delivery}}.",
								},
							],
							["action.tag_customer", { tag: "levertijd-update" }],
						]),
					});
					workflowStore.updateMeta(id, { description: "Klaargezet door de eerste analyse. Zet hem aan wanneer je de mail hebt gelezen." });
					workflowStore.save(id);
					made.automationId = id;
				}
				if (ids.includes("sheet") && !made.sheetId) {
					const sheet = useSheets.getState().create(titles.sheet, "blank", by);
					useSheets.getState().setTabs(sheet.id, [tabFrom(newId("tab"), "Per land", deliveryRows, { A: 170, B: 120, C: 150 })]);
					made.sheetId = sheet.id;
				}
				if (ids.includes("agent") && !made.agent) {
					const agent = useCustomerAgent.getState();
					agent.save({ ...agent.settings, on: true, channels: { ...agent.settings.channels, email: "drafts" } });
					made.agent = true;
				}
				set({ made, at: new Date().toISOString() });
				return made;
			},
			agreeOffline: (window, levels, by) => {
				const autonomy = useAutonomy.getState();
				autonomy.savePolicy({ ...autonomy.policy, ...levels }, by);
				// The agent's opening hours are when someone is online; outside them it answers only
				// if status replies may go out on their own.
				const agent = useCustomerAgent.getState();
				agent.save({ ...agent.settings, hours: hoursFor(window), outside: levels.SendReply === "auto" ? "answer" : "take" });
				set({ offline: { window, levels } });
			},
			answer: (id, value) => set((s) => ({ answers: { ...s.answers, [id]: value } })),
		}),
		{
			name: "insyte:first-analysis:v1",
			version: 1,
			partialize: (s) => ({ scenario: s.scenario, at: s.at, made: s.made, offline: s.offline, answers: s.answers }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p };
			},
		},
	),
);
