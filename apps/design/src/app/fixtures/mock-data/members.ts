import { byScenario, longEmail, longName } from "../scenario";
import type { Member } from "@insyte/ui/app/lib/types/domain";
import type { Presence } from "@insyte/ui/data-source";
export type { Presence };


/**
 * Hand-tuned demo presence so the topbar friends cluster and the dashboard
 * `Team online` card start with a varied team state on first load. Real wiring
 * would derive this from a heartbeat / WebSocket subscription.
 */
export const presenceById: Record<string, Presence> = {
	mem_elena: "online",
	mem_sofia: "online",
	mem_ethan: "online",
	mem_liam: "away",
	mem_maya: "offline",
	mem_amber: "offline",
};

export const lastActionById: Record<string, string> = {
	mem_elena: "schrijft een document",
	mem_sofia: "beantwoordt ticket #5142",
	mem_ethan: "in de bestellingenwachtrij",
	mem_liam: "18 min geleden actief",
	mem_maya: "gisteren voor het laatst gezien",
	mem_amber: "uitnodiging verstuurd",
};

const SEED_MEMBERS: Member[] = [
	{
		id: "mem_elena",
		user_id: "user_admin_elena",
		name: "Elena Hart",
		email: "elena@northwindclothing.co",
		role: "Eigenaar",
		status: "active",
		last_active_at: "2026-05-22T09:30:00Z",
	},
	{
		id: "mem_sofia",
		user_id: "user_sofia",
		name: "Sofía Kim",
		email: "sofia@northwindclothing.co",
		role: "CX-lead",
		status: "active",
		last_active_at: "2026-05-22T08:42:00Z",
	},
	{
		id: "mem_ethan",
		user_id: "user_ethan",
		name: "Ethan Jeppesen",
		email: "ethan@northwindclothing.co",
		role: "Operations",
		status: "active",
		last_active_at: "2026-05-22T07:00:00Z",
	},
	{
		id: "mem_liam",
		user_id: "user_liam",
		name: "Liam Tucker",
		email: "liam@northwindclothing.co",
		role: "Operations",
		status: "active",
		last_active_at: "2026-05-21T19:00:00Z",
	},
	{
		id: "mem_maya",
		user_id: "user_maya",
		name: "Maya Roy",
		email: "maya@northwindclothing.co",
		role: "Marketing",
		status: "active",
		last_active_at: "2026-05-21T17:00:00Z",
	},
	{
		id: "mem_amber",
		user_id: "user_amber",
		name: "Amber Lewis",
		email: "amber@northwindclothing.co",
		role: "Klantenservice",
		status: "invited",
	},
];

/** In the busy week the team has filled the plan, and some of its names are long. */
const BUSY_ROLES = ["Klantenservice", "Klantenservice", "Financiën", "Operations", "Marketing"];
const busyMembers = (): Member[] => [
	...SEED_MEMBERS.slice(0, 5),
	...BUSY_ROLES.map((role, i) => ({
		id: `mem_busy_${i}`,
		user_id: `user_busy_${i}`,
		name: longName(i + 20),
		email: longEmail(i + 20),
		role,
		status: "active" as const,
		last_active_at: new Date(Date.parse("2026-05-22T09:30:00Z") - (i + 1) * 5_400_000).toISOString(),
	})),
	SEED_MEMBERS[5]!,
];

/** On the first day the owner is the whole team. */
export const members: Member[] = byScenario({ empty: SEED_MEMBERS.slice(0, 1), settled: SEED_MEMBERS, busy: busyMembers });

export const roles = [
	{
		id: "role_admin",
		name: "Beheerder",
		description: "Volledige toegang tot alles in de werkruimte.",
		built_in: true,
		permissions: {
			orders: "edit",
			customers: "edit",
			products: "edit",
			tickets: "edit",
			chats: "edit",
			emails: "edit",
			chargebacks: "edit",
			automations: "edit",
			analytics: "view",
			marketplace: "edit",
			suppliers: "edit",
			stores: "edit",
			settings: "edit",
		} as Record<string, "none" | "view" | "edit">,
		special: {
			"members.add": true,
			"stores.add": true,
			"marketplace.purchase": true,
		},
	},
	{
		id: "role_cx_lead",
		name: "CX-lead",
		description: "Beheert tickets, inbox en chats · financiën alleen lezen.",
		built_in: false,
		permissions: {
			orders: "view",
			customers: "edit",
			products: "view",
			tickets: "edit",
			chats: "edit",
			emails: "edit",
			chargebacks: "view",
			automations: "view",
			analytics: "view",
			marketplace: "none",
			suppliers: "view",
			stores: "view",
			settings: "none",
		} as Record<string, "none" | "view" | "edit">,
		special: {
			"members.add": false,
			"stores.add": false,
			"marketplace.purchase": false,
		},
	},
	{
		id: "role_member",
		name: "Teamlid",
		description: "Beperkt zicht · voor de meeste onderdelen alleen lezen.",
		built_in: true,
		permissions: {
			orders: "view",
			customers: "view",
			products: "view",
			tickets: "view",
			chats: "view",
			emails: "none",
			chargebacks: "none",
			automations: "view",
			analytics: "view",
			marketplace: "none",
			suppliers: "none",
			stores: "view",
			settings: "none",
		} as Record<string, "none" | "view" | "edit">,
		special: {
			"members.add": false,
			"stores.add": false,
			"marketplace.purchase": false,
		},
	},
	{
		id: "role_supplier",
		name: "Leverancier",
		description:
			"Ziet alleen de eigen toegewezen producten en de bestellingen met die producten.",
		built_in: true,
		permissions: {
			orders: "view",
			customers: "none",
			products: "edit",
			tickets: "none",
			chats: "edit",
			emails: "none",
			chargebacks: "none",
			automations: "none",
			analytics: "none",
			marketplace: "none",
			suppliers: "none",
			stores: "none",
			settings: "view",
		} as Record<string, "none" | "view" | "edit">,
		special: {
			"members.add": false,
			"stores.add": false,
			"marketplace.purchase": false,
		},
	},
];

export const permissionFeatures = [
	{ key: "orders", label: "Bestellingen" },
	{ key: "customers", label: "Klanten" },
	{ key: "products", label: "Producten" },
	{ key: "tickets", label: "Tickets" },
	{ key: "chats", label: "Chats" },
	{ key: "emails", label: "Inbox / e-mail" },
	{ key: "chargebacks", label: "Chargebacks" },
	{ key: "automations", label: "Automatiseringen" },
	{ key: "analytics", label: "Analyse" },
	{ key: "marketplace", label: "Marketplace" },
	{ key: "suppliers", label: "Leveranciers" },
	{ key: "stores", label: "Winkels" },
	{ key: "settings", label: "Instellingen" },
];

export const specialActions = [
	{ key: "members.add", label: "Teamleden uitnodigen" },
	{ key: "stores.add", label: "Gekoppelde winkel toevoegen" },
	{ key: "marketplace.purchase", label: "Betaalde marketplace-apps installeren" },
];
