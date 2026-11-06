import { useNavigate } from "@tanstack/react-router";
import { EmptyPage } from "./empty-page";
import type { EmptyKind } from "./empty-icon";
import { type Area, useListStarts } from "../marketing-sections/closings";

/**
 * A list on the first day: the area's `EmptyPage`, worded for the area, with the list's own closing
 * rows as the places to start. The page passes its own primary action (the button that adds a
 * record there); the secondary is where the records will come from.
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

export function AreaEmpty({ area, action, onInvite }: { area: Area; action?: { label: string; onClick: () => void }; onInvite?: () => void }) {
	const navigate = useNavigate();
	const starts = useListStarts(area, onInvite);
	const c = COPY[area];
	const source = { label: c.source.label, onClick: () => void navigate({ to: c.source.to }) };
	return (
		<EmptyPage
			kind={c.kind}
			count={`0 ${c.noun}`}
			title={c.title}
			body={c.body}
			action={action ?? source}
			secondary={action ? source : undefined}
			starts={starts}
		/>
	);
}
