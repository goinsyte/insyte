import { byScenario } from "../scenario";
import { chargebacks } from "./chargebacks";
import { stores } from "./stores";
import type { Signal, QueueRow, Plate } from "@insyte/ui/data-source";
export type { Signal, QueueRow, Plate };

/**
 * The queue, and the plates drawn from it.
 *
 * A "plate" is a proposal Insyte has drawn but not filed: what the record is now, what it becomes,
 * and what that is worth. The dashboard's whole job is to show the operator how many of those are
 * waiting and let them file, redraw or discard each one. Nothing changes until they do.
 *
 * The rows below are the same fixtures the rest of the console runs on — `chargebacks`, `stores`,
 * and the supplier, ticket and automation events the other screens already carry — restated as one
 * ranked list, because an operator does not open "the chargebacks screen" first. They open the day.
 */




const eu = stores[1]?.name ?? "Northwind EU";
const us = stores[0]?.name ?? "Northwind US";
const uk = stores[2]?.name ?? "Northwind UK";
const all = "Alle winkels";

/** The Klarna case the AI gathered evidence for, which is the one the dashboard opens on. */
const klarna = chargebacks.find((c) => c.case_number === "DSP-2214");

const SEED_QUEUE: QueueRow[] = [
	{
		id: "q_cb_2214",
		signal: "red",
		title: `Chargeback ${klarna?.case_number ?? "DSP-2214"} · Klarna, bewijs verzameld`,
		store: eu,
		value: "€248,00",
		due: "4u 10m",
		plate: {
			number: klarna?.case_number ?? "DSP-2214",
			heading: "Klarna-bewijs indienen",
			body:
				"Getekend zoals het wordt ingediend. Vier documenten verzameld: scan van de vervoerder, bezorgfoto, twee antwoorden van de klant, oorspronkelijke factuur.",
			dimension: "4u 10m tot 18:00",
			before: { label: "Zoals het record nu is", value: "Open · geen bewijs ingediend · €248,00 op het spel" },
			after: { label: "Zoals getekend", value: "Ingediend · 4 documenten · €248,00 betwist" },
			change: "wat dit voorstel verandert",
			witness: eu,
			state: "getekend, niet uitgevoerd",
			confidence: "zekerheid 4,2",
			fileLabel: "Uitvoeren zoals getekend"
		}
	},
	{
		id: "q_supplier_allure",
		signal: "red",
		title: "3 bestellingen dreigen te laat te komen · leverancier Allure",
		store: us,
		value: "€612,40",
		due: "vandaag",
		plate: {
			number: "SUP-0318",
			heading: "Allure aansporen over drie bestellingen",
			body:
				"Getekend op basis van de vertragingsmelding van de leverancier zelf voor SKU-2148. Eén bericht, de drie bestelnummers en een leverdatum om te bevestigen.",
			dimension: "tot 17:00 vandaag",
			before: { label: "Zoals het record nu is", value: "In afwachting · geen contact met leverancier · €612,40 risico" },
			after: { label: "Zoals getekend", value: "Aangespoord · datum gevraagd · klanten op de hoogte" },
			change: "wat dit voorstel verandert",
			witness: us,
			state: "getekend, niet uitgevoerd",
			confidence: "zekerheid 3,8",
			fileLabel: "Versturen zoals getekend"
		}
	},
	{
		id: "q_ticket_5142",
		signal: "amber",
		title: "Ticket #5142 · twee keer om terugbetaling gevraagd, geen antwoord verstuurd",
		store: eu,
		value: "€89,95",
		due: "1d",
		plate: {
			number: "TKT-5142",
			heading: "Het tweede terugbetalingsverzoek beantwoorden",
			body:
				"Getekend op basis van de bestelling en beide berichten. De terugbetaling valt binnen het beleid, dus het antwoord keurt die goed en zegt wanneer het geld binnen is.",
			dimension: "1d tot de termijn voor eerste antwoord verloopt",
			before: { label: "Zoals het record nu is", value: "Open · twee verzoeken · 31u geen antwoord" },
			after: { label: "Zoals getekend", value: "€89,95 terugbetaald · antwoord verstuurd · ticket gesloten" },
			change: "wat dit voorstel verandert",
			witness: eu,
			state: "getekend, niet uitgevoerd",
			confidence: "zekerheid 4,0",
			fileLabel: "Versturen zoals getekend"
		}
	},
	{
		id: "q_cust_parcel",
		signal: "amber",
		title: "Klant Sofía Kim vroeg naar een ontbrekend pakket",
		store: eu,
		value: "€72,50",
		due: "6u"
	},
	{
		id: "q_sku_2148",
		signal: "amber",
		title: "Voorraad van SKU-2148 is over 2 dagen op",
		store: us,
		value: "€1.204,00",
		due: "2d"
	},
	{
		id: "q_template_refund",
		signal: "amber",
		title: "Sjabloon voor terugbetalingen krijgt 18% minder reacties dan gemiddeld",
		store: all,
		value: "—",
		due: "1d"
	},
	{
		id: "q_order_10418",
		signal: "green",
		title: "Bestelling #10418 verzonden · DHL, track & trace verstuurd",
		store: eu,
		value: "€134,00",
		due: "—"
	},
	{
		id: "q_payout",
		signal: "green",
		title: "Uitbetaling €4.180,00 bevestigd door Stripe",
		store: all,
		value: "€4.180,00",
		due: "—"
	},
	{
		id: "q_uk_unconnected",
		signal: "idle",
		title: `${uk} is nog niet gekoppeld`,
		store: uk,
		value: "—",
		due: "—"
	},
	{
		id: "q_automation_chase",
		signal: "green",
		title: "Automatisering “Late leverancier aansporen” liep op 11 bestellingen",
		store: all,
		value: "—",
		due: "—"
	}
];

export const queue: QueueRow[] = byScenario({ empty: [], settled: SEED_QUEUE });

/** The rows that need the operator before the day ends — the one number the dashboard opens with. */
export const needsYou = queue.filter((r) => r.signal === "red" || r.signal === "amber");

/** The rows Insyte has already drawn a plate for. The top bar counts these. */
export const drawnPlates = queue.filter((r) => r.plate !== undefined);

export const queueFilters = [
	{ id: "needs-you", label: "Wacht op jou", count: needsYou.length },
	{ id: "drawn", label: "Getekend", count: drawnPlates.length },
	{ id: "everything", label: "Alles", count: queue.length }
] as const;

export type QueueFilterId = (typeof queueFilters)[number]["id"];

export const rowsForFilter = (id: QueueFilterId): QueueRow[] =>
	id === "needs-you" ? needsYou : id === "drawn" ? drawnPlates : queue;
