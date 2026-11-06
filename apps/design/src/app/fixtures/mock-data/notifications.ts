import type { Note } from "@insyte/ui/app/lib/notifications";
import { byScenario, longName } from "../scenario";

/*
 * The notifications a workspace has had: a normal Tuesday's 26 for the owner, spread over today,
 * yesterday, the week and before; none on the first day; about 150 in the busy week. Times are
 * written relative to now, so "Vandaag" is always today. Records named here are the ones the mock
 * data holds (SO-12212 is ord_5012, TKT-0902 is tkt_4002), so a preview reads the live record.
 */

const MIN = 60_000;
/** `m` minutes ago. */
const ago = (m: number) => new Date(Date.now() - m * MIN).toISOString();
/** `days` ago at `hh:mm`. */
const dayAt = (days: number, hm: string) => {
	const d = new Date();
	d.setDate(d.getDate() - days);
	const [h, m] = hm.split(":").map(Number);
	d.setHours(h ?? 9, m ?? 0, 0, 0);
	return d.toISOString();
};

type Seed = Omit<Note, "persona" | "read" | "state"> & { read?: boolean; state?: Note["state"]; snoozeUntil?: string };
const admin = (s: Seed): Note => ({ persona: "admin", read: false, state: "inbox", ...s });

const sofia = { kind: "member", id: "mem_sofia", name: "Sofía Kim" } as const;
const ethan = { kind: "member", id: "mem_ethan", name: "Ethan Jeppesen" } as const;
const liam = { kind: "member", id: "mem_liam", name: "Liam Tucker" } as const;
const maya = { kind: "member", id: "mem_maya", name: "Maya Roy" } as const;
const insyte = { kind: "insyte" } as const;

const SETTLED: Note[] = [
	/* today */
	admin({
		id: "n_mention_cs",
		source: "mention",
		event: "chat.mention",
		reason: "mention",
		actor: sofia,
		title: "heeft je vermeld in",
		record: "#customer-service",
		detail: "Kunnen we de klant van SO-12212 vandaag nog een leverdatum geven? Ze belt om 14:00 terug.",
		quote: true,
		to: "/chats",
		search: { id: "conv_customer_service" },
		ref: { type: "conversation", id: "conv_customer_service", name: "#customer-service" },
		at: ago(6),
	}),
	admin({
		id: "n_proposal_2214",
		source: "insyte",
		event: "insyte.proposal",
		actor: insyte,
		title: "heeft het bewijs verzameld voor",
		record: "DSP-2214",
		detail: "Vier documenten, klaar om in te dienen bij Klarna vóór 18:00.",
		to: "/dashboard",
		ref: { type: "proposal", id: "q_cb_2214" },
		at: ago(14),
	}),
	admin({
		id: "n_assign_0902",
		source: "ticket",
		event: "ticket.assigned",
		reason: "assign",
		actor: ethan,
		title: "heeft je toegewezen aan",
		record: "TKT-0902",
		detail: "Leverancier wacht op bevestiging voor SO-12943.",
		to: "/tickets/tkt_4002",
		ref: { type: "ticket", id: "tkt_4002" },
		at: ago(32),
	}),
	admin({
		id: "n_deadline_2214",
		source: "chargeback",
		event: "chargeback.deadline",
		actor: { kind: "brand", brand: "klarna", name: "Klarna" },
		title: "Bewijsdeadline nadert voor",
		record: "DSP-2214",
		detail: "Vandaag om 18:00 indienen, anders vervalt het geschil in het voordeel van de klant.",
		tone: "amber",
		to: "/chargebacks/cb_2214",
		ref: { type: "chargeback", id: "cb_2214" },
		at: ago(50),
	}),
	admin({
		id: "n_delay_12218",
		source: "supplier",
		event: "supplier.delay",
		via: "assigned",
		actor: { kind: "person", name: "Marco Rossi", org: "Allure Fulfillment" },
		title: "meldt een vertraging voor",
		record: "SO-12218",
		detail: "Nieuwe overdrachtsdatum donderdag. Twee andere bestellingen lopen mogelijk ook uit.",
		to: "/orders/ord_5018",
		ref: { type: "order", id: "ord_5018" },
		at: ago(76),
	}),
	admin({
		id: "n_auto_failed_1",
		source: "automation",
		event: "automation.failed",
		title: "Uitvoering mislukt in",
		record: "Vertraagde bestelling → e-mail + ticket",
		detail: "Stap 2, e-mail versturen, kreeg geen verbinding met Gmail. Drie bestellingen wachten.",
		tone: "red",
		to: "/automations/auto_1",
		ref: { type: "automation", id: "auto_1" },
		at: ago(95),
	}),
	admin({
		id: "n_late_12231",
		source: "order",
		event: "order.late",
		title: "Staat 52 uur zonder verzending:",
		record: "SO-12231",
		detail: "Bij DPC Apparel. De drempel voor een late bestelling is 48 uur.",
		tone: "amber",
		to: "/orders/ord_5031",
		ref: { type: "order", id: "ord_5031" },
		at: ago(124),
	}),
	admin({
		id: "n_outlook",
		source: "integration",
		event: "integration.disconnected",
		actor: { kind: "brand", brand: "outlook", name: "Outlook" },
		title: "is ontkoppeld:",
		record: "support@northwindclothing.co",
		detail: "Nieuwe e-mails komen niet meer binnen in de inbox tot je opnieuw koppelt.",
		to: "/settings/integrations",
		ref: { type: "integration", key: "outlook" },
		at: ago(141),
		read: true,
	}),
	admin({
		id: "n_invite_amber",
		source: "team",
		event: "team.invite",
		title: "Uitnodiging verloopt morgen voor",
		record: "Amber Lewis",
		detail: "Uitgenodigd als Klantenservice en nog niet geopend.",
		to: "/settings/team",
		ref: { type: "member", id: "mem_amber" },
		facts: [
			["E-mail", "amber@northwindclothing.co"],
			["Rol", "Klantenservice"],
		],
		at: ago(182),
	}),
	admin({
		id: "n_reply_0900",
		source: "ticket",
		event: "ticket.reply",
		via: "assigned",
		actor: { kind: "person", name: "Daniel Brown" },
		title: "antwoordde op",
		record: "TKT-0900",
		detail: "Het pakket kwam beschadigd aan. De foto's zitten in de bijlage.",
		quote: true,
		to: "/tickets/tkt_4000",
		ref: { type: "ticket", id: "tkt_4000" },
		at: ago(214),
		read: true,
	}),

	/* yesterday */
	admin({
		id: "n_mention_12240",
		source: "mention",
		event: "chat.mention",
		reason: "mention",
		actor: liam,
		title: "heeft je vermeld bij",
		record: "SO-12240",
		detail: "Deze klant heeft al twee keer gebeld. Kun jij de terugbetaling goedkeuren?",
		quote: true,
		to: "/orders/ord_5040",
		ref: { type: "order", id: "ord_5040" },
		at: dayAt(1, "17:42"),
	}),
	admin({
		id: "n_refund_12229",
		source: "order",
		event: "order.refund",
		via: "created",
		actor: maya,
		title: "heeft de terugbetaling afgerond voor",
		record: "SO-12229",
		detail: "Het volledige bedrag gaat via Stripe terug naar de klant.",
		to: "/orders/ord_5029",
		ref: { type: "order", id: "ord_5029" },
		at: dayAt(1, "15:08"),
		read: true,
	}),
	admin({
		id: "n_drafts",
		source: "insyte",
		event: "insyte.draft",
		actor: insyte,
		title: "heeft 4 antwoorden opgesteld in",
		record: "de inbox",
		detail: "Alle vier over levertijden. Klaar om na te lezen en te versturen.",
		to: "/inbox",
		facts: [
			["Concepten", "4"],
			["Onderwerp", "Levertijden"],
			["Mailbox", "support@northwindclothing.co"],
		],
		at: dayAt(1, "11:20"),
		read: true,
	}),
	admin({
		id: "n_supplier_dpc",
		source: "supplier",
		event: "supplier.message",
		actor: { kind: "person", name: "Priya Patel", org: "DPC Apparel" },
		title: "stuurde een bericht in",
		record: "#dpc-apparel",
		detail: "De nieuwe stoffen voor het Coastline bomberjack komen maandag binnen.",
		quote: true,
		to: "/chats",
		search: { id: "conv_supplier_dpc" },
		ref: { type: "conversation", id: "conv_supplier_dpc", name: "#dpc-apparel" },
		at: dayAt(1, "09:34"),
	}),
	admin({
		id: "n_paused_10",
		source: "automation",
		event: "automation.done",
		actor: ethan,
		title: "heeft een flow gepauzeerd:",
		record: "Chargebacks binnenhalen",
		detail: "Gepauzeerd tot de PayPal-koppeling weer werkt.",
		to: "/automations/auto_10",
		ref: { type: "automation", id: "auto_10" },
		at: dayAt(1, "08:51"),
		read: true,
	}),

	/* this week */
	admin({
		id: "n_new_2213",
		source: "chargeback",
		event: "chargeback.new",
		actor: { kind: "brand", brand: "klarna", name: "Klarna" },
		title: "Nieuwe chargeback boven je drempel:",
		record: "DSP-2213",
		detail: "Product niet zoals beschreven. Insyte begint met het bewijs.",
		to: "/chargebacks/cb_2213",
		ref: { type: "chargeback", id: "cb_2213" },
		at: dayAt(2, "16:20"),
		read: true,
	}),
	admin({
		id: "n_won_2211",
		source: "chargeback",
		event: "chargeback.result",
		actor: { kind: "brand", brand: "paypal", name: "PayPal" },
		title: "Geschil gewonnen:",
		record: "DSP-2211",
		detail: "Het bedrag blijft bij Northwind EU. Het bewijs van Insyte is geaccepteerd.",
		tone: "green",
		to: "/chargebacks/cb_2211",
		ref: { type: "chargeback", id: "cb_2211" },
		at: dayAt(2, "10:02"),
		read: true,
	}),
	admin({
		id: "n_sla_0909",
		source: "ticket",
		event: "ticket.sla",
		title: "Termijn voor eerste antwoord verloopt over 3 uur:",
		record: "TKT-0909",
		detail: "Inkomende chat, al 21 uur onbeantwoord.",
		tone: "amber",
		to: "/tickets/tkt_4009",
		ref: { type: "ticket", id: "tkt_4009" },
		at: dayAt(3, "13:15"),
		state: "later",
		snoozeUntil: new Date(Date.now() + 20 * 3_600_000).toISOString(),
	}),
	admin({
		id: "n_stock_aurora",
		source: "supplier",
		event: "supplier.stock",
		actor: { kind: "person", name: "Kestrel Goods" },
		title: "Bijna op:",
		record: "Aurora fleece met capuchon",
		detail: "Nog 14 stuks, genoeg voor ongeveer vier dagen.",
		tone: "amber",
		to: "/products",
		facts: [
			["Leverancier", "Kestrel Goods"],
			["Op voorraad", "14 stuks"],
			["Tempo", "3,5 per dag"],
		],
		at: dayAt(3, "09:40"),
	}),
	admin({
		id: "n_maya_joined",
		source: "team",
		event: "team.invite",
		actor: maya,
		title: "heeft je uitnodiging geaccepteerd en werkt mee als",
		record: "Marketing",
		to: "/settings/team",
		ref: { type: "member", id: "mem_maya" },
		at: dayAt(4, "14:12"),
		read: true,
	}),
	admin({
		id: "n_sync_shopify",
		source: "integration",
		event: "integration.sync",
		actor: { kind: "brand", brand: "shopify", name: "Shopify" },
		title: "Synchronisatie klaar met 2 fouten in",
		record: "Northwind UK",
		detail: "Twee producten zonder SKU zijn overgeslagen.",
		to: "/settings/integrations",
		ref: { type: "integration", key: "shopify" },
		at: dayAt(4, "06:30"),
		read: true,
	}),
	admin({
		id: "n_report",
		source: "insyte",
		event: "insyte.report",
		actor: insyte,
		title: "Je weekrapport staat klaar:",
		record: "week 43",
		detail: "Omzet, levering en geschillen van vorige week, in vijf zinnen.",
		to: "/analytics",
		facts: [["Periode", "Vorige week"]],
		at: dayAt(5, "07:00"),
		read: true,
	}),

	/* earlier */
	admin({
		id: "n_mention_ops",
		source: "mention",
		event: "chat.mention",
		reason: "mention",
		actor: ethan,
		title: "heeft je vermeld in",
		record: "#operations",
		detail: "Wil jij de nieuwe retourvoorwaarden nalezen voordat ze live gaan?",
		quote: true,
		to: "/chats",
		search: { id: "conv_team_ops" },
		ref: { type: "conversation", id: "conv_team_ops", name: "#operations" },
		at: dayAt(8, "10:45"),
		read: true,
	}),
	admin({
		id: "n_note_12205",
		source: "order",
		event: "order.note",
		via: "created",
		actor: sofia,
		title: "zette het label vip op",
		record: "SO-12205",
		to: "/orders/ord_5005",
		ref: { type: "order", id: "ord_5005" },
		at: dayAt(9, "15:30"),
		read: true,
	}),
	admin({
		id: "n_flow_on_3",
		source: "automation",
		event: "automation.done",
		actor: ethan,
		title: "heeft een flow aangezet:",
		record: "Feedback vragen",
		to: "/automations/auto_3",
		ref: { type: "automation", id: "auto_3" },
		at: dayAt(11, "11:05"),
		read: true,
	}),
	admin({
		id: "n_lost_2209",
		source: "chargeback",
		event: "chargeback.result",
		actor: { kind: "brand", brand: "stripe", name: "Stripe" },
		title: "Geschil verloren:",
		record: "DSP-2209",
		detail: "De kaartuitgever volgde de klant. Het bedrag is afgeschreven.",
		tone: "red",
		to: "/chargebacks/cb_2209",
		ref: { type: "chargeback", id: "cb_2209" },
		at: dayAt(13, "09:12"),
		read: true,
	}),

	/* cleared, so Gewist shows what it keeps */
	admin({
		id: "n_cleared_assign",
		source: "ticket",
		event: "ticket.assigned",
		reason: "assign",
		actor: sofia,
		title: "heeft je toegewezen aan",
		record: "TKT-0905",
		detail: "Klant tevreden met oplossing voor SO-12340.",
		to: "/tickets/tkt_4005",
		ref: { type: "ticket", id: "tkt_4005" },
		at: dayAt(2, "11:40"),
		read: true,
		state: "cleared",
	}),
	admin({
		id: "n_cleared_late",
		source: "order",
		event: "order.late",
		title: "Staat 49 uur zonder verzending:",
		record: "SO-12214",
		tone: "amber",
		to: "/orders/ord_5014",
		ref: { type: "order", id: "ord_5014" },
		at: dayAt(6, "08:20"),
		read: true,
		state: "cleared",
	}),
];

/* ── the busy week ───────────────────────────────────────────────────────────────────────── */

const TEAM = [sofia, ethan, liam, maya];
const BRANDS = [
	{ kind: "brand", brand: "klarna", name: "Klarna" },
	{ kind: "brand", brand: "stripe", name: "Stripe" },
	{ kind: "brand", brand: "paypal", name: "PayPal" },
] as const;
const SUPPLIERS = ["Allure Fulfillment", "DPC Apparel", "Kestrel Goods", "Black Cedar Studio"];

function busyNote(i: number): Note {
	const order = 5000 + ((i * 7) % 320);
	const so = `SO-${12200 + (order - 5000)}`;
	const ticket = (i * 5) % 73;
	const tkt = `TKT-${String(900 + ticket).padStart(4, "0")}`;
	const who = TEAM[i % TEAM.length] ?? sofia;
	const customer = longName(i);
	const base = { id: `nb_${i}`, at: ago(9 + i * 131), read: i > 14 && i % 4 !== 0, state: i % 23 === 7 ? ("cleared" as const) : ("inbox" as const) };
	switch (i % 11) {
		case 0:
			return admin({ ...base, source: "mention", event: "chat.mention", reason: "mention", actor: who, title: "heeft je vermeld bij", record: so, detail: `${customer} vraagt voor de derde keer waar het pakket blijft. Kun jij hiernaar kijken voordat de klant een chargeback opent?`, quote: true, to: `/orders/ord_${order}`, ref: { type: "order", id: `ord_${order}` } });
		case 1:
			return admin({ ...base, source: "ticket", event: "ticket.assigned", reason: "assign", actor: who, title: "heeft je toegewezen aan", record: tkt, detail: `${customer} vraagt waar bestelling ${so} blijft, die volgens de bevestiging al vorige week geleverd had moeten zijn.`, to: `/tickets/tkt_${4000 + ticket}`, ref: { type: "ticket", id: `tkt_${4000 + ticket}` } });
		case 2:
			return admin({ ...base, source: "order", event: "order.late", title: `Staat ${49 + (i % 30)} uur zonder verzending:`, record: so, detail: `Bij ${SUPPLIERS[i % 4]}. ${customer} wacht op ${1 + (i % 3)} artikelen.`, tone: "amber", to: `/orders/ord_${order}`, ref: { type: "order", id: `ord_${order}` } });
		case 3:
			return admin({ ...base, source: "chargeback", event: "chargeback.new", actor: BRANDS[i % 3], title: "Nieuwe chargeback geopend voor", record: `DSP-${2300 + i}`, detail: `${customer} betwist de betaling voor ${so}: artikel niet ontvangen.`, to: "/chargebacks", facts: [["Klant", customer], ["Bestelling", so], ["Reden", "Artikel niet ontvangen"]] });
		case 4:
			return admin({ ...base, source: "supplier", event: "supplier.delay", via: "assigned", actor: { kind: "person", name: "Marco Rossi", org: SUPPLIERS[i % 4] }, title: "meldt een vertraging voor", record: so, detail: "Nieuwe overdrachtsdatum over drie werkdagen; de stof voor deze maat is nog niet binnen.", to: `/orders/ord_${order}`, ref: { type: "order", id: `ord_${order}` } });
		case 5:
			return admin({ ...base, source: "insyte", event: "insyte.draft", actor: insyte, title: `heeft ${2 + (i % 6)} antwoorden opgesteld in`, record: "de inbox", detail: "Over levertijden en track & trace die al dagen stilstaat.", to: "/inbox" });
		case 6:
			return admin({ ...base, source: "ticket", event: "ticket.reply", via: "assigned", actor: { kind: "person", name: customer }, title: "antwoordde op", record: tkt, detail: "Ik heb nog steeds niets ontvangen en de track & trace staat al vijf dagen op in transit. Wanneer krijg ik mijn geld terug?", quote: true, to: `/tickets/tkt_${4000 + ticket}`, ref: { type: "ticket", id: `tkt_${4000 + ticket}` } });
		case 7:
			return admin({ ...base, source: "automation", event: "automation.failed", title: "Uitvoering mislukt in", record: "Vertraagde bestelling → e-mail + ticket", detail: `Stap 2 kon ${customer} niet mailen: het adres weigert berichten.`, tone: "red", to: "/automations/auto_1", ref: { type: "automation", id: "auto_1" } });
		case 8:
			return admin({ ...base, source: "order", event: "order.refund", via: "created", actor: who, title: "heeft de terugbetaling afgerond voor", record: so, to: `/orders/ord_${order}`, ref: { type: "order", id: `ord_${order}` } });
		case 9:
			return admin({ ...base, source: "supplier", event: "supplier.message", actor: { kind: "person", name: "Priya Patel", org: "DPC Apparel" }, title: "stuurde een bericht in", record: "#dpc-apparel", detail: `Over ${so}: de nieuwe stoffen komen pas volgende week binnen, kunnen we de klant iets anders aanbieden?`, quote: true, to: "/chats", search: { id: "conv_supplier_dpc" }, ref: { type: "conversation", id: "conv_supplier_dpc", name: "#dpc-apparel" } });
		default:
			return admin({ ...base, source: "ticket", event: "ticket.sla", title: "Termijn voor eerste antwoord verloopt over 2 uur:", record: tkt, detail: `${customer} wacht al 22 uur.`, tone: "amber", to: `/tickets/tkt_${4000 + ticket}`, ref: { type: "ticket", id: `tkt_${4000 + ticket}` } });
	}
}

/* ── the partners ────────────────────────────────────────────────────────────────────────── */

/* A supplier hears about the work the brand sends them; an affiliate about what their links earn.
   Neither ever hears about the brand's own workspace. */
const SUPPLIER: Note[] = [
	{ id: "s1", persona: "supplier", source: "order", event: "partner.work", reason: "assign", title: "Nieuwe bestelling om te accepteren:", record: "SO-12228", detail: "2 artikelen, overdragen vóór donderdag.", to: "/supplier/orders", at: ago(18), read: false, state: "inbox" },
	{ id: "s2", persona: "supplier", source: "mention", event: "partner.work", reason: "mention", actor: { kind: "member", id: "mem_elena", name: "Elena Hart" }, title: "stuurde een bericht over", record: "SO-12224", detail: "Kun je de nieuwe overdrachtsdatum bevestigen?", quote: true, to: "/supplier/chats", at: ago(41), read: false, state: "inbox" },
	{ id: "s3", persona: "supplier", source: "order", event: "partner.work", title: "Vandaag overdragen om op tijd te zijn:", record: "3 bestellingen", tone: "amber", to: "/supplier/orders", at: ago(150), read: true, state: "inbox" },
	{ id: "s4", persona: "supplier", source: "payout", event: "partner.money", title: "Afrekening staat klaar voor", record: "Allure Fulfillment", detail: "Verzonden regels tegen kostprijs, betaald op de 15e.", tone: "green", to: "/supplier/statements", at: dayAt(1, "16:10"), read: true, state: "inbox" },
];

const AFFILIATE: Note[] = [
	{ id: "a1", persona: "affiliate", source: "order", event: "partner.money", title: "Nieuwe conversie via", record: "Instagram bio", detail: "US$ 89, jouw commissie US$ 13,35.", tone: "green", to: "/affiliate/referrals", at: ago(22), read: false, state: "inbox" },
	{ id: "a2", persona: "affiliate", source: "payout", event: "partner.money", title: "Je volgende uitbetaling staat gepland voor", record: "15 november", detail: "US$ 4.692 naar PayPal.", to: "/affiliate/payouts", at: ago(170), read: false, state: "inbox" },
	{ id: "a3", persona: "affiliate", source: "brand", event: "partner.work", actor: { kind: "member", id: "mem_maya", name: "Maya Roy" }, title: "heeft nieuw materiaal klaargezet:", record: "Lookbook winter", to: "/affiliate/resources", at: dayAt(1, "14:30"), read: true, state: "inbox" },
];

/** Every persona's notifications for the current design state. */
export const seedNotifications = (): Note[] =>
	byScenario({
		empty: [],
		settled: [...SETTLED, ...SUPPLIER, ...AFFILIATE],
		busy: () => [...SETTLED, ...Array.from({ length: 124 }, (_, i) => busyNote(i)), ...SUPPLIER, ...AFFILIATE],
	});
