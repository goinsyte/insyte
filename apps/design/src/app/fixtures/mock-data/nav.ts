import { RotateCcw, Bot, Box, Briefcase, Building, ChartLine, CornerDownLeft, CreditCard, FileText, Home, Inbox, Link2, MessagesSquare, Settings, Shield, ShoppingBag, Sparkle, Store, Ticket, Users, Wallet, Workflow } from "@insyte/ui/icons";
import type { NavConfig } from "@insyte/ui/app/lib/types/nav";
import type { Persona } from "@insyte/ui/app/lib/types/persona";

export const navByPersona: Record<Persona, NavConfig> = {
	admin: {
		sections: [
			{
				label: "Werkruimte",
				items: [
					{ to: "/dashboard", label: "Dashboard", icon: Home },
					{ to: "/orders", label: "Bestellingen", icon: ShoppingBag },
					{ to: "/returns", label: "Retouren", icon: RotateCcw },
					{ to: "/customers", label: "Klanten", icon: Users },
					{ to: "/products", label: "Producten", icon: Box },
					{ to: "/inbox", label: "Inbox", icon: Inbox },
					{ to: "/tickets", label: "Tickets", icon: Ticket },
					{ to: "/chargebacks", label: "Chargebacks", icon: CornerDownLeft },
				],
			},
			{
				label: "Tools",
				items: [
					{ to: "/analytics", label: "Analyse", icon: ChartLine },
					{ to: "/automations", label: "Automatiseringen", icon: Workflow },
					{ to: "/marketplace", label: "Marketplace", icon: Store },
					{ to: "/settings", label: "Instellingen", icon: Settings },
				],
			},
			{
				label: "Insyte AI",
				items: [
					{ to: "/ask/activity", label: "Wat Insyte deed", icon: Sparkle },
					{ to: "/settings/ai/autonomy", label: "Zelfstandigheid", icon: Shield },
					{ to: "/settings/ai/customer-agent", label: "Klantagent", icon: MessagesSquare },
					{ to: "/settings/ai/knowledge", label: "Kennisbank", icon: FileText },
					{ to: "/settings/ai/limits", label: "AI-limieten", icon: Wallet },
					{ to: "/settings/agents", label: "Agents en MCP", icon: Bot },
				],
			},
		],
	},
	supplier: {
		sections: [
			{
				label: "Werkruimte",
				items: [
					{ to: "/supplier/dashboard", label: "Dashboard", icon: Home },
					{ to: "/supplier/products", label: "Producten", icon: Box },
					{ to: "/supplier/orders", label: "Bestellingen", icon: ShoppingBag },
					{ to: "/supplier/chats", label: "Chats", icon: MessagesSquare },
					{ to: "/supplier/statements", label: "Afrekeningen", icon: Wallet },
					{ to: "/supplier/settings", label: "Instellingen", icon: Settings },
				],
			},
		],
	},
	affiliate: {
		sections: [
			{
				label: "Werkruimte",
				items: [
					{ to: "/affiliate/dashboard", label: "Dashboard", icon: Home },
					{ to: "/affiliate/referrals", label: "Doorverwijzingen", icon: Link2 },
					{ to: "/affiliate/payouts", label: "Uitbetalingen", icon: Wallet },
					{ to: "/affiliate/resources", label: "Materiaal", icon: FileText },
					{ to: "/affiliate/settings", label: "Instellingen", icon: Settings },
				],
			},
		],
	},
};

export const settingsNav = [
	{ to: "/settings/profile", label: "Account", icon: Users },
	{ to: "/settings/team", label: "Team", icon: Users },
	{ to: "/settings/roles", label: "Rollen", icon: Briefcase },
	{ to: "/settings/stores", label: "Winkels", icon: Building },
	{ to: "/settings/integrations", label: "Koppelingen", icon: Bot },
	{ to: "/settings/billing", label: "Facturatie", icon: CreditCard },
];
