import { useMemo, useState } from "react";
import { recommendations } from "../automations/library";
import { useWorkflows } from "../automations/workflow-store";
import { useCustomers, useProducts } from "../hooks/use-operator-data";
import { TEMPLATES } from "../lib/automation-templates";
import { formatCurrency } from "../lib/format";
import { affiliateResources } from "../../data-source";
import { suppliers } from "../../data-source";
import { statementsFor } from "../lib/supplier-statements";
import { ME_SUPPLIER } from "../lib/supplier-work";
import { useSupplier } from "../stores/supplier-store";
import { useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";
import { ChangelogDialog } from "./changelog";
import { type IndexItem, LinkIndex } from "./link-index";
import { ApiPreview, FlowPreview, LinkQrPreview } from "./previews";
import { Spotlight } from "./spotlight";

/*
 * The closing sections, page by page. The look lives in `link-index.tsx` and `spotlight.tsx`; this
 * file is only what each page says and where it points, read off the workspace so a row says "4
 * bestellingen staan op Vertraagd" when they do and something general when they do not.
 *
 * They close a page and never open one: each sits after the page's own content, separated by space,
 * and on a list it is a step quieter than the table it follows.
 */

const TEMPLATES_VIEW = { to: "/automations", search: { view: "templates" } } as const;
const RECOMMENDED_VIEW = { to: "/automations", search: { view: "recommended" } } as const;

/** What the records say a template would have to do, or null when they say nothing. */
function useEvidence() {
	const orders = useWorkspace((s) => s.orders);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const tickets = useWorkspace((s) => s.tickets);
	const { data: products } = useProducts();
	const { data: customers } = useCustomers();
	const workflows = useWorkflows();
	return useMemo(() => {
		const facts = { orders, products, customers, chargebacks, tickets };
		return {
			of: (id: string) => TEMPLATES.find((t) => t.id === id)?.evidence?.(facts) ?? null,
			top: recommendations(facts, workflows)[0] ?? null,
		};
	}, [orders, products, customers, chargebacks, tickets, workflows]);
}

/* ── Start ───────────────────────────────────────────────────────────────────────────────────── */

/** How the dashboard's spotlight sells each template it might recommend. */
const SELL: Record<string, { title: string; body: string }> = {
	tpl_late: {
		title: "Laat Insyte vertraagde bestellingen opvolgen",
		body: "Een flow vraagt de leverancier de verzending te bevestigen, stelt de excuses aan de klant op en geeft 10% korting. Er draait niets tot jij hem aanzet.",
	},
	tpl_shipped: {
		title: "Track & trace, voordat de klant erom vraagt",
		body: "Zodra Shopify een bestelling als verzonden markeert, krijgt de klant via Klaviyo de link, een merkfoto en de retourstappen.",
	},
	tpl_vip: {
		title: "Herken je beste klanten als ze terugkomen",
		body: "Bestelt iemand die al meer dan €1.000 uitgaf opnieuw, dan krijgt hij het label VIP en hoor jij het meteen.",
	},
	tpl_stock: {
		title: "Pauzeer campagnes voordat iets uitverkoopt",
		body: "Komt een product onder de 60 stuks, dan hoort operations het en zet Klaviyo de campagnes die het verkopen stil.",
	},
	tpl_chargeback: {
		title: "Begin aan het bewijs zodra een geschil opent",
		body: "Insyte koppelt de bestellingen van de klant, begint aan het bewijspakket en opent een ticket met de deadline erop.",
	},
};

/**
 * The foot of Overzicht, and of the first-day page: one spotlight for the flow the workspace's
 * records most need and no running flow does yet (the library's own Recommended list), then the
 * index of everywhere else worth going. On the first day the records say nothing, so it shows the
 * late-delivery flow, and the index leaves out Automatiseringen, which the setup list already offers.
 */
export function DashboardClosing({ firstDay = false }: { firstDay?: boolean }) {
	const [changelog, setChangelog] = useState(false);
	const { top } = useEvidence();
	const portal = useTeam((s) => s.portal);
	const id = top && SELL[top.template.id] ? top.template.id : "tpl_late";
	const sell = SELL[id] ?? SELL.tpl_late!;
	const joined = suppliers.filter((s) => portal[s.id]?.status === "active").length;

	const items: IndexItem[] = [
		...(firstDay ? [] : [{ id: "automations", label: "Automatiseringen", body: "Flows voor het werk dat terugkomt. Er draait niets tot jij het aanzet.", to: "/automations" }]),
		{ id: "marketplace", label: "Marketplace", body: "Klaviyo, Gorgias, AfterShip en de rest van je stapel, op één plek gekoppeld.", to: "/marketplace" },
		{
			id: "portal",
			label: "Leveranciersportaal",
			body:
				suppliers.length === 0
					? "Leveranciers accepteren, verzenden en melden problemen zelf."
					: `${joined} van ${suppliers.length} leveranciers werken er al in. Ze accepteren, verzenden en melden problemen zelf.`,
			to: "/suppliers",
		},
		{ id: "partners", label: "Partnerprogramma", body: "Affiliates, hun links en de commissie die ze verdienen.", to: "/affiliates" },
		{ id: "changelog", label: "Nieuw in Insyte", body: "Wat er de afgelopen weken bij kwam.", onClick: () => setChangelog(true) },
		{ id: "help", label: "Help en documentatie", body: "Handleidingen en antwoorden, op goinsyte.com.", href: "https://goinsyte.com/help" },
	];

	return (
		<div className="mt-8 flex flex-col gap-10">
			<Spotlight
				id="closing-flow"
				title={sell.title}
				body={sell.body}
				cta={{ label: top ? "Sjabloon instellen" : "Sjablonen bekijken", ...(top ? RECOMMENDED_VIEW : TEMPLATES_VIEW) }}
				preview={<FlowPreview templateId={id} note={top?.evidence.line} />}
			/>
			<LinkIndex heading="Meer in Insyte" items={items} />
			<ChangelogDialog open={changelog} onOpenChange={setChangelog} />
		</div>
	);
}

/* ── the lists ───────────────────────────────────────────────────────────────────────────────── */

export type { Area } from "../common/area-empty";
import { type Area, AreaEmpty } from "../common/area-empty";

/** A list's first day in the design app: the area's empty page, with the closings' rows as its places to start. */
export function DemoAreaEmpty({ area, action, onInvite }: { area: Area; action?: { label: string; onClick: () => void } | undefined; onInvite?: () => void }) {
	const starts = useListStarts(area, onInvite);
	return <AreaEmpty area={area} action={action} starts={starts} />;
}

const AREA_LABEL: Record<Area, string> = {
	orders: "Bestellingen",
	customers: "Klanten",
	products: "Producten",
	tickets: "Tickets",
	chargebacks: "Chargebacks",
	suppliers: "Leveranciers",
};

/**
 * The foot of a list. With records, two or three index rows to the feature that does more with them,
 * set a step below the table. On the first day it draws nothing: the list is then an `AreaEmpty`,
 * which lists the same rows as its places to start.
 */
export function ListClosing({ area, empty, onInvite }: { area: Area; empty: boolean; onInvite?: () => void }) {
	const rows = useListStarts(area, onInvite);
	/* On the first day the list is its `AreaEmpty`, which carries these rows itself. */
	if (empty) return null;
	return (
		<div className="px-5 pt-6 pb-10">
			<LinkIndex size="md" label={`Verder vanuit ${AREA_LABEL[area]}`} items={rows} />
		</div>
	);
}

/** Where a list leads: two or three rows to the feature that does more with its records. */
export function useListStarts(area: Area, onInvite?: () => void): IndexItem[] {
	const ev = useEvidence();
	const portal = useTeam((s) => s.portal);
	const line = (id: string, fallback: string) => ev.of(id)?.line ?? fallback;
	const flow = (id: string) => (ev.of(id) ? RECOMMENDED_VIEW : TEMPLATES_VIEW);
	const outside = suppliers.filter((s) => portal[s.id]?.status !== "active").length;
	const rows: Record<Area, IndexItem[]> = {
		orders: [
			{ id: "late", label: "Vertraagde bestellingen laten opvolgen", body: line("tpl_late", "Een flow die de leverancier aanspoort en de klant op de hoogte houdt."), ...flow("tpl_late") },
			{ id: "tracking", label: "Track & trace vanzelf versturen", body: "Zodra Shopify verzendt, krijgt de klant de link en de retourstappen.", ...TEMPLATES_VIEW },
			{ id: "suppliers", label: "Leveranciers en hun levertijden", body: "Op tijd, vertraagd en open, per leverancier.", to: "/suppliers" },
		],
		tickets: [
			{ id: "inbox", label: "Inbox en mailboxen", body: "Elke gekoppelde mailbox op één plek, toe te wijzen aan een collega.", to: "/inbox" },
			{ id: "connect", label: "Een mailbox koppelen", body: "Gmail of Outlook. Insyte stelt dan voor elke vraag een antwoord op.", to: "/settings/integrations" },
			{ id: "negative", label: "Ontevreden klanten escaleren", body: "Het ticket naar de CX-lead, met een voorgesteld antwoord erbij.", ...TEMPLATES_VIEW },
		],
		chargebacks: [
			{ id: "evidence", label: "Bewijs automatisch verzamelen", body: line("tpl_chargeback", "Bij elk nieuw geschil de bestellingen koppelen en een ticket met de deadline."), ...flow("tpl_chargeback") },
			{ id: "providers", label: "Betaalproviders koppelen", body: "Stripe en Klarna, zodat elk geschil hier binnenkomt.", to: "/settings/integrations" },
		],
		products: [
			{ id: "portal", label: "Leveranciers houden de voorraad bij", body: "In het leveranciersportaal werken ze voorraad en levertijd zelf bij.", to: "/suppliers" },
			{ id: "stock", label: "Campagnes pauzeren bij lage voorraad", body: line("tpl_stock", "Operations inlichten en Klaviyo-campagnes stilzetten als iets bijna op is."), ...flow("tpl_stock") },
			{ id: "marketplace", label: "Voorraad en verzending koppelen", body: "ShipBob, AfterShip en meer in de Marketplace.", to: "/marketplace" },
		],
		customers: [
			{ id: "klaviyo", label: "Klaviyo-lijsten bijhouden", body: "Kies klanten in de lijst en zet ze met hun labels in een Klaviyo-lijst.", to: "/settings/integrations" },
			{ id: "vip", label: "Je beste klanten herkennen", body: line("tpl_vip", "Het label VIP zodra een grote klant opnieuw bestelt."), ...flow("tpl_vip") },
			{ id: "winback", label: "Terugwinnen na 90 dagen stilte", body: "Klanten die drie maanden niet bestelden op de terugwinlijst.", ...TEMPLATES_VIEW },
		],
		suppliers: [
			...(outside > 0 && onInvite
				? [{ id: "invite", label: "Leveranciers uitnodigen voor het portaal", body: `${outside} van ${suppliers.length} werken er nog niet in. Dan accepteren en verzenden ze zelf.`, onClick: onInvite }]
				: []),
			{ id: "late", label: "Late leveringen laten opvolgen", body: line("tpl_late", "De leverancier vragen de verzending te bevestigen, vanzelf."), ...flow("tpl_late") },
			{ id: "chat", label: "Een kanaal per leverancier", body: "Afspraken in de chat, gedeeld met je team, zoals #allure-fulfillment.", to: "/chats" },
		],
	};

	return rows[area];
}


/* ── the partner portals ─────────────────────────────────────────────────────────────────────── */

/** The supplier's start, closed: its own API connection, then its statements and the shared thread. */
export function SupplierClosing() {
	const api = useSupplier((s) => s.api);
	const open = statementsFor(ME_SUPPLIER.id).find((s) => s.status !== "paid");
	const linked = api.enabled && api.lastTest?.ok === true;
	return (
		<div className="flex flex-col gap-10">
			<Spotlight
				id="closing-api"
				tone="grey"
				title={linked ? "Je eigen systeem is gekoppeld" : "Koppel je eigen systeem aan Insyte"}
				body="Insyte stuurt elke nieuwe bestelling naar je webhook en leest je voorraad. Werk je met AliExpress, CJ Dropshipping, Spocket of Modalyst, dan kan dat ook. Alles werkt ook met de hand."
				cta={{ label: linked ? "API-koppeling bekijken" : "API-koppeling instellen", to: "/supplier/settings/api-connection" }}
				preview={<ApiPreview />}
			/>
			<LinkIndex
				heading="Verder in het portaal"
				items={[
					{
						id: "statements",
						label: "Afrekeningen",
						body: open ? `${open.label}: ${formatCurrency(open.total)}, wordt op de 15e betaald.` : "Per maand, regel voor regel, met een factuur.",
						to: "/supplier/statements",
					},
					{ id: "chat", label: "Chat met Northwind", body: "Het gedeelde kanaal #allure-fulfillment, voor alles wat niet in een bestelling past.", to: "/supplier/chats" },
				]}
			/>
		</div>
	);
}

/** The affiliate's start, closed: its links to share, then the material and the next tier. */
export function AffiliateClosing({ tier, next, quarter }: { tier: { label: string; rate: number }; next?: { label: string; rate: number; from: number }; quarter: number }) {
	return (
		<div className="flex flex-col gap-10">
			<Spotlight
				id="closing-links"
				tone="grey"
				side="left"
				title="Deel je links waar je volgers zijn"
				body="Elke link krijgt een eigen QR-code voor een story of een flyer, en telt zijn kliks en conversies apart. Zo zie je welk kanaal verkoopt."
				cta={{ label: "Je links delen", to: "/affiliate/referrals" }}
				preview={<LinkQrPreview />}
			/>
			<LinkIndex
				heading="Verder in het programma"
				items={[
					{
						id: "resources",
						label: "Materiaal downloaden",
						body: `${affiliateResources.length} pakketten van Northwind: logo's, foto's, video's en teksten.`,
						to: "/affiliate/resources",
					},
					next
						? { id: "tier", label: `Naar ${next.label}: ${next.rate}% commissie`, body: `Nog ${Math.max(0, next.from - quarter)} conversies dit kwartaal.`, to: "/affiliate/referrals" }
						: { id: "tier", label: `${tier.label}: ${tier.rate}% commissie`, body: "Je zit op het hoogste niveau. Bekijk wat er wordt uitbetaald.", to: "/affiliate/payouts" },
				]}
			/>
		</div>
	);
}
