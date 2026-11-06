export type Persona = "admin" | "supplier" | "affiliate";

export type AffiliateState = "approved" | "pending" | "rejected";

export type PersonaSelection =
	| "admin"
	| "supplier"
	| "affiliate"
	| "affiliate-pending"
	| "affiliate-rejected";

export const PERSONA_OPTIONS: Array<{
	value: PersonaSelection;
	label: string;
	persona: Persona;
	affiliateState?: AffiliateState;
	landing: string;
}> = [
	{ value: "admin", label: "Admin", persona: "admin", landing: "/dashboard" },
	{
		value: "supplier",
		label: "Leverancier",
		persona: "supplier",
		landing: "/supplier/dashboard",
	},
	{
		value: "affiliate",
		label: "Affiliate (goedgekeurd)",
		persona: "affiliate",
		affiliateState: "approved",
		landing: "/affiliate/dashboard",
	},
	{
		value: "affiliate-pending",
		label: "Affiliate (in afwachting)",
		persona: "affiliate",
		affiliateState: "pending",
		landing: "/affiliate/dashboard",
	},
	{
		value: "affiliate-rejected",
		label: "Affiliate (afgewezen)",
		persona: "affiliate",
		affiliateState: "rejected",
		landing: "/affiliate/dashboard",
	},
];
