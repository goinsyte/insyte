import type { StockIndicator } from "../stores/supplier-store";

/** How a supplier reports stock to the brand, in the words it picks them by. */
export const INDICATOR_LABEL: Record<StockIndicator, { label: string; detail: string }> = {
	live: { label: "Live", detail: "Je API stuurt de voorraad door, elke vijf minuten." },
	in_stock_out_of_stock: { label: "Op voorraad of niet", detail: "Northwind ziet alleen of het er is, niet hoeveel." },
	none: { label: "Handmatig", detail: "Je werkt de aantallen hier zelf bij." },
};

/** A supplier's default lead time, in days from order to hand-off, until it sets one per product. */
export const DEFAULT_LEAD_DAYS = 2;
