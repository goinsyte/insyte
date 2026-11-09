import { useNavigate } from "@tanstack/react-router";
import type { IndexItem } from "../marketing-sections/link-index";
import { EmptyPage } from "./empty-page";
import type { EmptyKind } from "./empty-icon";

export type Area = "orders" | "customers" | "products" | "tickets" | "chargebacks" | "suppliers";

/**
 * A list on the first day: the area's `EmptyPage`, worded for the area, with the list's own closing
 * rows as the places to start. The page passes its own primary action (the button that adds a
 * record there); the secondary is where the records will come from.
 *
 * Store-free: the places to start are the host's (`starts`); the design app's lists read them from the
 * closings (`DemoAreaEmpty` in `marketing-sections/closings.tsx`), the console has none yet.
 */

const COPY: Record<Area, { kind: EmptyKind; noun: string; title: string; body: string; source: { label: string; to: string } }> = {
	orders: {
		kind: "orders",
		noun: "bestellingen",
		title: "Nog geen bestellingen",
		body: "Koppel je Shopify-winkel en bestellingen staan hier binnen een minuut.",
		source: { label: "Winkel koppelen", to: "/settings/stores" },
	},
	customers: {
		kind: "customers",
		noun: "klanten",
		title: "Nog geen klanten",
		body: "Elke klant die in een gekoppelde winkel bestelt, komt hier vanzelf.",
		source: { label: "Winkel koppelen", to: "/settings/stores" },
	},
	products: {
		kind: "products",
		noun: "producten",
		title: "Nog geen producten",
		body: "Importeer je catalogus uit Shopify: producten, varianten, foto's en voorraad.",
		source: { label: "Uit Shopify importeren", to: "/settings/stores" },
	},
	tickets: {
		kind: "tickets",
		noun: "tickets",
		title: "Nog geen tickets",
		body: "Koppel je support-mailbox en elke klantvraag komt hier binnen.",
		source: { label: "Mailbox koppelen", to: "/settings/integrations" },
	},
	chargebacks: {
		kind: "chargebacks",
		noun: "chargebacks",
		title: "Nog geen chargebacks",
		body: "Koppel Stripe of Klarna en elk geschil komt hier binnen, met de deadline.",
		source: { label: "Betaalprovider koppelen", to: "/settings/integrations" },
	},
	suppliers: {
		kind: "suppliers",
		noun: "leveranciers",
		title: "Nog geen leveranciers",
		body: "Koppel een leverancier via de Marketplace of zijn API.",
		source: { label: "Marketplace bekijken", to: "/marketplace" },
	},
};

export function AreaEmpty({
	area,
	action,
	starts,
	body,
	source: from,
}: {
	area: Area;
	action?: { label: string; onClick: () => void } | undefined;
	starts?: IndexItem[] | undefined;
	/** The host's own line on where the records come from, where the area's does not hold for it. */
	body?: string | undefined;
	/** The host's own secondary, or `null` for none (a host without the area's source screen). */
	source?: { label: string; onClick: () => void } | null | undefined;
}) {
	const navigate = useNavigate();
	const c = COPY[area];
	const source = from === undefined ? { label: c.source.label, onClick: () => void navigate({ to: c.source.to }) } : from;
	return (
		<EmptyPage
			kind={c.kind}
			count={`0 ${c.noun}`}
			title={c.title}
			body={body ?? c.body}
			action={action ?? source ?? undefined}
			secondary={action ? (source ?? undefined) : undefined}
			starts={starts}
		/>
	);
}
