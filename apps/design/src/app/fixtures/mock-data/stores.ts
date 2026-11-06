import type { Store } from "@insyte/ui/app/lib/types/domain";

export const stores: Store[] = [
	{
		id: "store_us",
		name: "Northwind US",
		domain: "northwind-clothing.myshopify.com",
		platform: "shopify",
		connected: true,
		country: "US",
		currency: "USD",
		created_at: "2024-08-12T10:00:00Z",
	},
	{
		id: "store_eu",
		name: "Northwind EU",
		domain: "northwind-eu.myshopify.com",
		platform: "shopify",
		connected: true,
		country: "DE",
		currency: "EUR",
		created_at: "2024-09-04T12:30:00Z",
	},
	{
		id: "store_uk",
		name: "Northwind UK",
		domain: "northwind-uk.myshopify.com",
		platform: "shopify",
		connected: false,
		country: "GB",
		currency: "GBP",
		created_at: "2025-01-22T15:00:00Z",
	},
];
