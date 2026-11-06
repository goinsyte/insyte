import type { AgentLogEntry, LogSource } from "@insyte/ui/data-source";
import { byScenario, longName } from "../scenario";

/*
 * What the Insyte-agent did, as the activity log reads it (PLAN 30, ADR-0027 `agent_actions`).
 *
 * Times are measured back from now when the module loads, so "today" stays today: the three newest
 * rows are inside the five-minute window and can still be undone; the rest are past it. On a normal
 * Tuesday that is 31 actions — assigns, labels, notes, snoozes and 17 website-chat replies — one
 * of them undone by Sofía and one that failed. Every record id is an existing fixture's.
 */

const MIN = 60_000;
const WINDOW = 5 * MIN;
const ago = (minutes: number) => Date.now() - minutes * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

const MODEL = "claude-sonnet · insyte-agent";
const PROMPT = "agent-v14";

const POLICY: LogSource = { kind: "policy", title: "Zelfstandigheid", detail: "Versie 3 · Toewijzen staat op Zelf doen", to: "/settings/ai/autonomy" };
const kb = (title: string, v: number): LogSource => ({ kind: "knowledge", title: `Kennisbank: ${title}`, detail: `Gepubliceerde versie ${v}`, to: "/settings/ai/knowledge" });
const order = (n: number): LogSource => ({ kind: "order", title: `SO-${12200 + n}`, detail: "Status, artikelen en track & trace", to: `/orders/ord_${5000 + n}` });

type Row = Omit<AgentLogEntry, "id" | "at" | "policyVersion" | "model" | "promptVersion" | "undoUntil"> & { minutes: number; undoable?: boolean };

const base = (r: Row, i: number): AgentLogEntry => {
	const { minutes, undoable, ...rest } = r;
	const t = ago(minutes);
	return {
		...rest,
		id: `act_${String(9000 - i)}`,
		at: iso(t),
		policyVersion: 3,
		model: MODEL,
		promptVersion: PROMPT,
		undoUntil: undoable === false ? undefined : t + WINDOW,
	};
};

/* The webchat replies: who asked, about what, and what the answer read. */
const CHATS: ReadonlyArray<[name: string, about: string, order: number | null, kbTitle: string]> = [
	["Hannah Schmidt", "de levertijd naar Duitsland", null, "Verzending en levertijden"],
	["Felix Müller", "de status van SO-12218", 18, "Verzending en levertijden"],
	["Olivier Dubois", "de maten van de Cascade pufferjas", null, "Maten"],
	["Maria Garcia", "retourneren binnen 30 dagen", null, "Retourneren"],
	["Astrid Berg", "de status van SO-12224", 24, "Verzending en levertijden"],
	["Soren Nilsson", "betalen met Klarna", null, "Betalen"],
	["Nina Petrova", "verzending naar Polen", null, "Verzending en levertijden"],
	["Luca Romano", "de wasvoorschriften van de Aurora fleece", null, "Over de producten"],
	["Renata Costa", "de status van SO-12230", 30, "Verzending en levertijden"],
	["Liam O'Connor", "een kortingscode die niet werkte", null, "Betalen"],
	["Hannah Schmidt", "een tweede bestelling samenvoegen", null, "Verzending en levertijden"],
	["Yuki Tanaka", "de maten van de Harbor regenjas", null, "Maten"],
	["Sage Ferreira", "de status van SO-12212", 12, "Verzending en levertijden"],
	["Felix Müller", "ruilen naar een grotere maat", null, "Retourneren"],
	["Mei Lin", "de voorraad van de Field broek · olijf", null, "Over de producten"],
	["Tariq Hassan", "een adreswijziging", 9, "Verzending en levertijden"],
	["Olivier Dubois", "de status van SO-12226", 26, "Verzending en levertijden"],
];

const webchat = (i: number, minutes: number): Row => {
	const [name, about, o, kbTitle] = CHATS[i % CHATS.length]!;
	return {
		minutes,
		action: "SendReply",
		sentence: `Websitechat beantwoord: ${name} vroeg naar ${about}`,
		record: { kind: "thread", label: `Websitechat · ${name}`, to: "/inbox", search: { channel: "webchat" } },
		level: "auto",
		trigger: "Websitechat op Northwind EU",
		status: "done",
		sources: [kb(kbTitle, 4), ...(o === null ? [] : [order(o)])],
		reason: o === null ? `Het antwoord staat in de kennisbank (${kbTitle}).` : `Bestelling en track & trace opgezocht met het e-mailadres van ${name}.`,
		effect: { kind: "send", channel: "webchat", to: name },
	};
};

const settled = (): AgentLogEntry[] => {
	const rows: Row[] = [
		{
			minutes: 1,
			action: "AssignTicket",
			sentence: "Ticket TKT-0900 toegewezen aan Sofía Kim",
			record: { kind: "ticket", label: "TKT-0900", to: "/tickets/tkt_4000", id: "tkt_4000" },
			level: "auto",
			trigger: "Nieuwe e-mail van Hannah Schmidt",
			status: "done",
			sources: [{ kind: "thread", title: "Re: Beschadigd aangekomen", detail: "Hannah Schmidt · vandaag 09:12", to: "/inbox" }, order(49), POLICY],
			reason: "Sofía behandelt retouren en beschadigde leveringen; ze heeft nu 4 open tickets, minder dan de rest.",
			before: "Elena Hart, Liam Tucker, Maya Roy",
			after: "Elena Hart, Sofía Kim, Liam Tucker, Maya Roy",
			compensation: "Toewijzing weghalen",
			effect: { kind: "ticket.assign", ticketId: "tkt_4000", from: ["e", "l", "m"], to: ["e", "s", "l", "m"] },
		},
		{
			minutes: 1,
			action: "ApplyLabel",
			sentence: "Label Retour toegevoegd aan ticket TKT-0900",
			record: { kind: "ticket", label: "TKT-0900", to: "/tickets/tkt_4000", id: "tkt_4000" },
			level: "auto",
			trigger: "Nieuwe e-mail van Hannah Schmidt",
			status: "done",
			sources: [{ kind: "thread", title: "Re: Beschadigd aangekomen", detail: "“Ik wil hem graag terugsturen”", to: "/inbox" }],
			reason: "De klant schrijft dat ze het artikel wil terugsturen.",
			before: "Productontwerp, Feedback",
			after: "Productontwerp, Feedback, Retour",
			compensation: "Label weghalen",
			effect: { kind: "ticket.label", ticketId: "tkt_4000", label: "Retour" },
		},
		{
			minutes: 2,
			action: "AddNote",
			sentence: "Notitie bij ticket TKT-0900: gekoppeld aan SO-12249",
			record: { kind: "ticket", label: "TKT-0900", to: "/tickets/tkt_4000", id: "tkt_4000" },
			level: "auto",
			trigger: "Nieuwe e-mail van Hannah Schmidt",
			status: "done",
			sources: [order(49), kb("Retourneren", 6)],
			reason: "Bezorgd 12 dagen geleden, dus binnen de retourtermijn van 30 dagen. Eerste retour van deze klant.",
			after: "Gekoppeld aan SO-12249. Bezorgd 12 dagen geleden, binnen de termijn van 30 dagen.",
			compensation: "Notitie verwijderen",
			effect: { kind: "note", target: "tkt_4000" },
		},
		webchat(0, 3),
		{
			minutes: 14,
			action: "ApplyLabel",
			sentence: "Label cadeau toegevoegd aan bestelling SO-12201",
			record: { kind: "order", label: "SO-12201", to: "/orders/ord_5001", id: "ord_5001" },
			level: "auto",
			trigger: "Websitechat op Northwind EU",
			status: "done",
			sources: [{ kind: "thread", title: "Websitechat · Maria Garcia", detail: "“Kan er een cadeaubon bij, zonder prijs?”", to: "/inbox" }, order(1)],
			reason: "De klant vroeg in de chat om de bestelling als cadeau te verpakken.",
			after: "cadeau",
			compensation: "Label weghalen",
			effect: { kind: "order.label", orderId: "ord_5001", label: "cadeau" },
		},
		{
			minutes: 15,
			action: "AddNote",
			sentence: "Notitie bij bestelling SO-12201: pakbon zonder prijzen",
			record: { kind: "order", label: "SO-12201", to: "/orders/ord_5001", id: "ord_5001" },
			level: "auto",
			trigger: "Websitechat op Northwind EU",
			status: "done",
			sources: [order(1)],
			reason: "Zodat de leverancier de pakbon zonder prijzen meestuurt.",
			after: "Cadeau: pakbon zonder prijzen meesturen.",
			compensation: "Notitie verwijderen",
			effect: { kind: "note", target: "ord_5001" },
		},
		{
			minutes: 38,
			action: "AssignTicket",
			sentence: "Ticket TKT-0905 toegewezen aan Liam Tucker",
			record: { kind: "ticket", label: "TKT-0905", to: "/tickets/tkt_4005", id: "tkt_4005" },
			level: "auto",
			trigger: "Nieuw ticket uit Gmail",
			status: "undone",
			undoneBy: "Sofía Kim",
			sources: [POLICY],
			reason: "Liam had het eerdere ticket over SO-12340.",
			before: "Sofía Kim",
			after: "Liam Tucker",
			effect: { kind: "ticket.assign", ticketId: "tkt_4005", from: ["s"], to: ["l"] },
		},
		{
			minutes: 52,
			action: "AssignTicket",
			sentence: "Ticket TKT-0910 kon niet worden toegewezen aan Ethan Jeppesen",
			record: { kind: "ticket", label: "TKT-0910", to: "/tickets/tkt_4010", id: "tkt_4010" },
			level: "auto",
			trigger: "Lage voorraad: Aurora fleece met capuchon",
			status: "failed",
			failReason: "Ticket kon niet worden toegewezen: Ethan is gedeactiveerd.",
			sources: [{ kind: "product", title: "Aurora fleece met capuchon", detail: "Lage voorraad bij Allure Fulfillment", to: "/products/prod_2000" }, POLICY],
			reason: "Ethan beheert de voorraad van Allure Fulfillment.",
			undoable: false,
		},
		{
			minutes: 66,
			action: "SetTicketStatus",
			sentence: "Ticket TKT-0902 op Wacht op antwoord gezet",
			record: { kind: "ticket", label: "TKT-0902", to: "/tickets/tkt_4002", id: "tkt_4002" },
			level: "ask",
			approvedBy: "Elena Hart",
			trigger: "Vraag Insyte door Elena Hart",
			status: "done",
			sources: [{ kind: "supplier", title: "Allure Fulfillment", detail: "Vraagt welke vervoerder we willen", to: "/suppliers" }],
			reason: "Allure wacht op ons antwoord over de vervoerder.",
			before: "Bezig",
			after: "Wacht op antwoord",
			compensation: "Status terugzetten",
			effect: { kind: "ticket.status", ticketId: "tkt_4002", from: "in_progress", to: "awaiting_reply" },
		},
		{
			minutes: 80,
			action: "SnoozeThread",
			sentence: "Gesprek over de groothandelsaanvraag van Allure Boutique uitgesteld tot maandag",
			record: { kind: "thread", label: "Groothandelsaanvraag · Allure Boutique", to: "/inbox" },
			level: "auto",
			trigger: "Nieuwe e-mail",
			status: "done",
			sources: [{ kind: "thread", title: "Groothandelsaanvraag · Allure Boutique", detail: "“We horen graag na het weekend”", to: "/inbox" }],
			reason: "De afzender vraagt zelf om na het weekend terug te komen.",
			compensation: "Weer tonen",
			effect: { kind: "thread.label", threadId: "th_2", label: "Uitgesteld" },
		},
		{
			minutes: 95,
			action: "AssignTicket",
			sentence: "Ticket TKT-0909 toegewezen aan Sofía Kim",
			record: { kind: "ticket", label: "TKT-0909", to: "/tickets/tkt_4009", id: "tkt_4009" },
			level: "auto",
			trigger: "Websitechat op Northwind EU",
			status: "done",
			sources: [POLICY],
			reason: "Een chat die langer dan 24 uur open stond hoort bij klantenservice.",
			compensation: "Toewijzing weghalen",
			effect: { kind: "ticket.assign", ticketId: "tkt_4009", from: [], to: ["s"] },
		},
		{
			minutes: 120,
			action: "SnoozeThread",
			sentence: "Gesprek over Abonnement pauzeren uitgesteld tot morgen 09:00",
			record: { kind: "thread", label: "Abonnement pauzeren", to: "/inbox" },
			level: "auto",
			trigger: "Nieuwe e-mail",
			status: "done",
			sources: [{ kind: "thread", title: "Abonnement pauzeren", detail: "Buiten openingstijden binnengekomen", to: "/inbox" }],
			reason: "Binnengekomen na 18:00; het team is er morgen om 09:00.",
			compensation: "Weer tonen",
			effect: { kind: "thread.label", threadId: "th_7", label: "Uitgesteld" },
		},
		{
			minutes: 150,
			action: "AssignTicket",
			sentence: "Ticket TKT-0906 toegewezen aan Liam Tucker",
			record: { kind: "ticket", label: "TKT-0906", to: "/tickets/tkt_4006", id: "tkt_4006" },
			level: "auto",
			trigger: "Leveranciersportaal",
			status: "done",
			sources: [{ kind: "supplier", title: "Allure Fulfillment", detail: "Wacht op de vervoerder", to: "/suppliers" }, POLICY],
			reason: "Liam volgt Allure Fulfillment op.",
			compensation: "Toewijzing weghalen",
			effect: { kind: "ticket.assign", ticketId: "tkt_4006", from: ["e"], to: ["e", "l"] },
		},
		{
			minutes: 190,
			action: "AssignTicket",
			sentence: "Ticket TKT-0911 toegewezen aan Maya Roy",
			record: { kind: "ticket", label: "TKT-0911", to: "/tickets/tkt_4011", id: "tkt_4011" },
			level: "auto",
			trigger: "Nieuw ticket",
			status: "done",
			sources: [POLICY],
			reason: "Vertalingen van producttekst liggen bij marketing.",
			compensation: "Toewijzing weghalen",
			effect: { kind: "ticket.assign", ticketId: "tkt_4011", from: [], to: ["m"] },
		},
		{
			minutes: 230,
			action: "ApplyLabel",
			sentence: "Label Levering toegevoegd aan ticket TKT-0908",
			record: { kind: "ticket", label: "TKT-0908", to: "/tickets/tkt_4008", id: "tkt_4008" },
			level: "auto",
			trigger: "Nieuwe e-mail",
			status: "done",
			sources: [{ kind: "thread", title: "Re: Waar is mijn bestelling?", detail: "Daniel Brown", to: "/inbox" }],
			reason: "De klant vraagt waar zijn bestelling blijft.",
			compensation: "Label weghalen",
			effect: { kind: "ticket.label", ticketId: "tkt_4008", label: "Levering" },
		},
	];
	// Sixteen more website-chat replies, spread over the morning since 09:00.
	for (let i = 1; i < 17; i++) rows.push(webchat(i, 20 + i * 13));
	return rows.sort((a, b) => a.minutes - b.minutes).map(base);
};

/* The busy week: about 2.000 actions over seven days, most of them website-chat replies. */
const busy = (): AgentLogEntry[] => {
	const kinds = ["SendReply", "SendReply", "SendReply", "AssignTicket", "ApplyLabel", "AddNote", "SnoozeThread", "SetTicketStatus", "SetPriority", "CreateTicket"] as const;
	return Array.from({ length: 2000 }, (_, i): AgentLogEntry => {
		const action = kinds[i % kinds.length]!;
		const minutes = 1 + i * 5;
		const who = longName(i);
		const ticket = `TKT-${String(900 + (i % 72)).padStart(4, "0")}`;
		const row: Row =
			action === "SendReply"
				? { ...webchat(i, minutes), sentence: `Websitechat beantwoord: ${who} vroeg naar de status van SO-${12200 + (i % 320)} en of de levering vóór het weekend nog lukt` }
				: {
						minutes,
						action,
						sentence:
							action === "AssignTicket"
								? `Ticket ${ticket} toegewezen aan ${longName(i + 20)}`
								: action === "ApplyLabel"
									? `Label Levering vertraagd toegevoegd aan ticket ${ticket}`
									: action === "AddNote"
										? `Notitie bij ticket ${ticket}: track & trace staat vijf dagen op onderweg`
										: action === "SnoozeThread"
											? `Gesprek met ${who} uitgesteld tot morgen 09:00`
											: action === "SetTicketStatus"
												? `Ticket ${ticket} op Wacht op antwoord gezet`
												: action === "SetPriority"
													? `Prioriteit van ticket ${ticket} op hoog gezet`
													: `Ticket aangemaakt uit de e-mail van ${who}`,
						record: { kind: "ticket", label: ticket, to: `/tickets/tkt_${4000 + (i % 72)}` },
						level: "auto",
						trigger: i % 4 === 0 ? "Nieuwe e-mail" : i % 4 === 1 ? "Websitechat op Northwind EU" : i % 4 === 2 ? "Nieuw ticket uit Gmail" : `Vraag Insyte door ${longName(i + 21)}`,
						status: i % 97 === 5 ? "undone" : i % 131 === 7 ? "failed" : "done",
						undoneBy: i % 97 === 5 ? "Sofía Kim" : undefined,
						failReason: i % 131 === 7 ? "Ticket kon niet worden toegewezen: deze collega is gedeactiveerd." : undefined,
						sources: [POLICY],
						reason: "Volgens de regels van de werkruimte voor klantenservice in de drukke week.",
						compensation: "Terugzetten",
						effect: { kind: "note", target: ticket },
					};
		return { ...base(row, i), policyVersion: 9 };
	});
};

export const agentActionsSeed: AgentLogEntry[] = byScenario({ empty: [], settled: settled(), busy });
