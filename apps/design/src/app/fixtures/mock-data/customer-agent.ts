import type { CustomerAgentSeed } from "@insyte/ui/data-source";
import { byScenario } from "../scenario";

/*
 * The customer agent (PLAN 28, design §5). First day: off. A normal Tuesday: on for the website chat
 * on Northwind EU, drafts on WhatsApp, open Monday to Friday 9–18; 23 conversations today, 17 handled
 * on its own, 4 handed over, 2 still waiting. The busy week: on for three stores, 400 a day.
 */

const week = (sat: boolean) => [
	...Array.from({ length: 5 }, () => ({ open: true, from: "09:00", to: "18:00" })),
	{ open: sat, from: "10:00", to: "16:00" },
	{ open: false, from: "10:00", to: "16:00" },
];

const HANDOVER = "Hier kijkt een collega graag even naar. Je hoort {wanneer} van ons, hier in de chat of per mail.";

export const customerAgentSeed: CustomerAgentSeed = byScenario<CustomerAgentSeed>({
	empty: {
		settings: { on: false, channels: { webchat: "off", whatsapp: "off", instagram: "off", email: "drafts" }, hours: week(false), outside: "take", handover: { unsure: true, asksPerson: true, topics: ["klachten", "chargebacks", "juridisch"], afterMessages: 8 }, tone: "brand", handoverMessage: HANDOVER },
		today: { conversations: 0, handled: 0, handedOver: 0, waiting: 0, avgSeconds: 0 },
	},
	settled: {
		settings: { on: true, channels: { webchat: "auto", whatsapp: "drafts", instagram: "off", email: "drafts" }, hours: week(false), outside: "take", handover: { unsure: true, asksPerson: true, topics: ["klachten", "chargebacks", "juridisch"], afterMessages: 8 }, tone: "brand", handoverMessage: HANDOVER },
		today: { conversations: 23, handled: 17, handedOver: 4, waiting: 2, avgSeconds: 4 },
	},
	busy: () => ({
		settings: { on: true, channels: { webchat: "auto", whatsapp: "drafts", instagram: "drafts", email: "drafts" }, hours: week(true), outside: "answer", handover: { unsure: true, asksPerson: true, topics: ["klachten", "chargebacks", "juridisch", "groothandel"], afterMessages: 6 }, tone: "short", handoverMessage: HANDOVER },
		today: { conversations: 412, handled: 331, handedOver: 64, waiting: 17, avgSeconds: 6 },
	}),
});
