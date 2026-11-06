import type { Note } from "../notifications";
import { byScenario } from "../../../data-source";

/*
 * What the workspace did that nobody was told about. Notifications are what reached the operator;
 * the activity feed is everything, so it adds the team's own work — a ticket answered, orders
 * accepted, stock corrected, a campaign sent — to the notifications and the orders arriving live.
 * The rows are written as notes so the feed reads them with the same lead and sentence as the
 * notifications page. Times are relative to now, so "this hour" is always this hour.
 */

const MIN = 60_000;
const ago = (m: number) => new Date(Date.now() - m * MIN).toISOString();

const member = (id: string, name: string) => ({ kind: "member", id, name }) as const;
const sofia = member("mem_sofia", "Sofía Kim");
const ethan = member("mem_ethan", "Ethan Jeppesen");
const liam = member("mem_liam", "Liam Tucker");
const maya = member("mem_maya", "Maya Roy");
const elena = member("mem_elena", "Elena Hart");

type Seed = Pick<Note, "id" | "source" | "event" | "actor" | "title" | "record" | "detail" | "to" | "search" | "tone"> & { m: number };
const row = (s: Seed): Note => ({ persona: "admin", read: true, state: "inbox", at: ago(s.m), ...s });

const SETTLED: ReadonlyArray<Seed> = [
	{ id: "a_sofia_5142", m: 4, source: "ticket", event: "ticket.reply", actor: sofia, title: "is een antwoord aan het schrijven op", record: "TKT-0905", detail: "Het tweede terugbetalingsverzoek, met het concept van Insyte als begin.", to: "/tickets" },
	{ id: "a_ethan_accept", m: 21, source: "order", event: "order.note", actor: ethan, title: "heeft 4 bestellingen doorgezet naar", record: "Allure Fulfillment", detail: "SO-12236, SO-12237, SO-12239 en SO-12241, overdracht donderdag.", to: "/orders" },
	{ id: "a_insyte_draft", m: 26, source: "insyte", event: "insyte.draft", actor: { kind: "insyte" }, title: "heeft een antwoord opgesteld voor", record: "Sofía Kim", detail: "Over een ontbrekend pakket: track & trace, en een vervanging als het vrijdag niet binnen is.", to: "/inbox" },
	{ id: "a_liam_stock", m: 47, source: "supplier", event: "supplier.stock", actor: liam, title: "heeft de voorraad bijgewerkt van", record: "Aurora fleece met capuchon", detail: "Maat M van 4 naar 36, na de levering van Kestrel Goods.", to: "/products/prod_2000" },
	{ id: "a_klaviyo", m: 63, source: "integration", event: "integration.sync", actor: { kind: "brand", brand: "klaviyo", name: "Klaviyo" }, title: "heeft de campagne verstuurd:", record: "Herfstjassen", detail: "Naar 12.480 ontvangers in de EU-winkel.", to: "/marketplace" },
	{ id: "a_maya_code", m: 88, source: "team", event: "automation.done", actor: maya, title: "heeft een kortingscode live gezet:", record: "HERFST15", detail: "15% op jassen, tot en met zondag.", to: "/products" },
	{ id: "a_marco_track", m: 112, source: "supplier", event: "supplier.message", actor: { kind: "person", name: "Marco Rossi", org: "Allure Fulfillment" }, title: "heeft track & trace geüpload voor", record: "SO-12224", detail: "DHL, verwacht maandag.", to: "/orders/ord_5024" },
	{ id: "a_auto_chase", m: 131, source: "automation", event: "automation.done", title: "Automatisering liep op 11 bestellingen:", record: "Late leverancier aansporen", tone: "green", to: "/automations" },
	{ id: "a_stripe_payout", m: 176, source: "payout", event: "integration.sync", actor: { kind: "brand", brand: "stripe", name: "Stripe" }, title: "heeft de uitbetaling bevestigd van", record: "€4.180,00", to: "/data" },
	{ id: "a_elena_refund", m: 201, source: "order", event: "order.refund", actor: elena, title: "heeft terugbetaald:", record: "SO-12229", detail: "Verkeerde maat, de jas is retour ontvangen.", to: "/orders/ord_5029" },
	{ id: "a_ethan_close", m: 26 * 60 + 15, source: "ticket", event: "ticket.reply", actor: ethan, title: "heeft gesloten:", record: "TKT-0903", to: "/tickets" },
	{ id: "a_shopify_sync", m: 27 * 60 + 40, source: "integration", event: "integration.sync", actor: { kind: "brand", brand: "shopify", name: "Shopify" }, title: "heeft 214 producten gesynchroniseerd met", record: "Northwind EU", to: "/data" },
];

export const seedActivity = (): Note[] => byScenario({ empty: [], settled: SETTLED.map(row) });
