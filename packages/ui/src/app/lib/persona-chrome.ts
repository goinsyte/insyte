import type { Persona } from "./types/persona";

/**
 * What the chrome says for each persona. A supplier and an affiliate work FOR the brand but are not
 * in its workspace: they never see its store selector, its team, its proposals, its marketplace or
 * its settings. The bar names the brand they work with, read-only, and every link here stays inside
 * their own part of the product.
 */
export type PersonaChrome = {
	home: string;
	/** The brand the persona works with, and what the relationship is called. */
	partner?: { name: string; relation: string };
	search: string;
	menu: Array<{ label: string; to: string; icon: "profile" | "plug" | "wallet" | "building" | "users" | "card" | "download" | "shield" | "key" }>;
	/** Where "Wat je hoort, en wanneer" goes: the persona's own notification settings. */
	notifications: string;
	/** The full notifications page, which the dropdown's footer and `g n` open. */
	inbox: string;
};

export const PERSONA_CHROME: Record<Persona, PersonaChrome> = {
	admin: {
		home: "/dashboard",
		search: "Zoek bestellingen, klanten, tickets…",
		menu: [
			{ label: "Winkelinstellingen", to: "/settings", icon: "building" },
			{ label: "Team en rollen", to: "/settings/team", icon: "users" },
			{ label: "Facturatie", to: "/settings/billing", icon: "card" },
			{ label: "Data direct importeren", to: "/data", icon: "download" },
		],
		notifications: "/settings/notifications",
		inbox: "/notifications",
	},
	supplier: {
		home: "/supplier/dashboard",
		partner: { name: "Northwind Clothing Co.", relation: "Leverancier voor" },
		search: "Zoek bestellingen en producten…",
		menu: [
			{ label: "Bedrijfsprofiel", to: "/supplier/settings/profile", icon: "building" },
			{ label: "API-koppeling", to: "/supplier/settings/api-connection", icon: "plug" },
		],
		notifications: "/supplier/settings/notifications",
		inbox: "/supplier/notifications",
	},
	affiliate: {
		home: "/affiliate/dashboard",
		partner: { name: "Northwind Clothing Co.", relation: "Partnerprogramma van" },
		search: "Zoek links en uitbetalingen…",
		menu: [
			{ label: "Profiel", to: "/affiliate/settings/profile", icon: "profile" },
			{ label: "Uitbetaalgegevens", to: "/affiliate/settings/payment", icon: "wallet" },
		],
		notifications: "/affiliate/settings/profile",
		inbox: "/affiliate/notifications",
	},
};
