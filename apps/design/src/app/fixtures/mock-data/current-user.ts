import type { CurrentUser } from "@insyte/ui/app/lib/types/domain";
import type { Persona } from "@insyte/ui/app/lib/types/persona";

export const currentUserByPersona: Record<Persona, CurrentUser> = {
	admin: {
		id: "user_admin_elena",
		name: "Elena Hart",
		email: "elena@northwindclothing.co",
		role: "Eigenaar",
		avatar_url:
			"https://api.dicebear.com/9.x/avataaars/svg?seed=elena&backgroundColor=d1e7fa",
	},
	supplier: {
		id: "user_supplier_marco",
		name: "Marco Rossi",
		email: "marco@allurefulfillment.com",
		role: "Leverancier",
		avatar_url:
			"https://api.dicebear.com/9.x/avataaars/svg?seed=marco&backgroundColor=faead1",
	},
	affiliate: {
		id: "user_affiliate_priya",
		name: "Priya Singh",
		email: "priya@creators.studio",
		role: "Affiliate",
		avatar_url:
			"https://api.dicebear.com/9.x/avataaars/svg?seed=priya&backgroundColor=fde7f7",
	},
};
