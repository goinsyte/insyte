import { byScenario, longEmail, longName } from "../scenario";
import type { Customer } from "@insyte/ui/app/lib/types/domain";

const RAW: Array<
	[name: string, email: string, ltv: number, orders: number, country: string]
> = [
	["Daniel Brown", "daniel.brown@example.com", 1842, 12, "US"],
	["Maria Garcia", "maria.garcia@example.com", 2310, 8, "ES"],
	["Emily White", "emily.white@example.com", 940, 4, "GB"],
	["Anonymous (Stripe)", "checkout+1@stripe.com", 75, 1, "US"],
	["Chris Lee", "chris.lee@example.com", 4129, 22, "US"],
	["John Doe", "john.doe@example.com", 320, 2, "CA"],
	["Alex Johnson", "alex.j@example.com", 156, 1, "US"],
	["Anonymous (PayPal)", "checkout+2@paypal.com", 58, 1, "DE"],
	["Sofía Méndez", "sofia.m@example.com", 1280, 6, "MX"],
	["Yuki Tanaka", "yuki@example.com", 2980, 14, "JP"],
	["Aisha Khan", "aisha@example.com", 510, 3, "AE"],
	["Olivier Dubois", "olivier@example.com", 980, 5, "FR"],
	["Hannah Schmidt", "hannah@example.com", 1740, 9, "DE"],
	["Luca Romano", "luca.r@example.com", 230, 2, "IT"],
	["Priya Patel", "priya.patel@example.com", 690, 4, "IN"],
	["Liam O'Connor", "liam@example.com", 1140, 7, "IE"],
	["Nina Petrova", "nina@example.com", 380, 2, "PL"],
	["Carlos Mendes", "carlos@example.com", 845, 5, "BR"],
	["Aiyana Redcloud", "aiyana@example.com", 1620, 8, "US"],
	["Soren Nilsson", "soren@example.com", 2210, 11, "SE"],
	["Mei Lin", "mei.lin@example.com", 540, 3, "TW"],
	["Jacob Hill", "jacob.hill@example.com", 195, 1, "US"],
	["Astrid Berg", "astrid@example.com", 880, 4, "NO"],
	["Tariq Hassan", "tariq@example.com", 1340, 6, "EG"],
	["Renata Costa", "renata@example.com", 470, 3, "PT"],
	["Felix Müller", "felix@example.com", 2750, 13, "DE"],
	["Bea Williams", "bea@example.com", 320, 2, "AU"],
	["Quinn Adams", "quinn@example.com", 90, 1, "US"],
	["Devon Park", "devon@example.com", 1980, 10, "KR"],
	["Sage Ferreira", "sage@example.com", 660, 4, "PT"],
	// The same people twice, as a second store or a guest checkout makes them: the duplicate review's work.
	["Daniel Brown", "dan.brown@gmail.com", 210, 2, "US"],
	["Chris Lee", "chris.lee@example.com", 140, 1, "US"],
	["Felix Muller", "felix.muller@example.com", 330, 2, "DE"],
	["Yuki Tanaka", "yuki.t@example.com", 95, 1, "JP"],
];

const build = (raw: typeof RAW): Customer[] => raw.map(
	([name, email, ltv, orders, country], i) => ({
		id: `cust_${1000 + i}`,
		shopify_id: `gid://shopify/Customer/${5000000 + i}`,
		email,
		name,
		phone: undefined,
		address: {
			line1: `${100 + i} Sample St`,
			city: country === "US" ? "Brooklyn" : "Berlin",
			region: country === "US" ? "NY" : "BE",
			postal_code: "10001",
			country,
		},
		lifetime_value: ltv,
		orders_count: orders,
		tags: i % 5 === 0 ? ["vip"] : i % 7 === 0 ? ["wholesale"] : [],
		created_at: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}T10:00:00Z`,
	}),
);

const BUSY: typeof RAW = Array.from({ length: 180 }, (_, i) => [longName(i), longEmail(i), 80 + ((i * 137) % 3200), 1 + (i % 9), ["NL", "BE", "DE", "FR", "GB"][i % 5]!]);

export const customers: Customer[] = byScenario({ empty: [], settled: build(RAW), busy: () => build([...RAW, ...BUSY]) });
