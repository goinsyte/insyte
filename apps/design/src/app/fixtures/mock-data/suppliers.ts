import { byScenario } from "../scenario";
import type { Supplier } from "@insyte/ui/app/lib/types/domain";

const SEED_SUPPLIERS: Supplier[] = [
	{
		id: "sup_allure",
		name: "Allure Fulfillment",
		contact_email: "ops@allurefulfillment.com",
		contact_phone: "+39 02 1234 5678",
		status: "active",
		api_connected: true,
		stock_indicator: "live",
		assigned_product_count: 8,
		created_at: "2024-09-10T08:00:00Z",
	},
	{
		id: "sup_dpc",
		name: "DPC Apparel",
		contact_email: "team@dpcapparel.com",
		status: "active",
		api_connected: false,
		stock_indicator: "in_stock_out_of_stock",
		assigned_product_count: 5,
		created_at: "2024-11-04T09:30:00Z",
	},
	{
		id: "sup_kestrel",
		name: "Kestrel Goods",
		contact_email: "hi@kestrelgoods.co",
		status: "active",
		api_connected: true,
		stock_indicator: "live",
		assigned_product_count: 4,
		created_at: "2025-02-18T11:00:00Z",
	},
	{
		id: "sup_blackcedar",
		name: "Black Cedar Studio",
		contact_email: "studio@blackcedar.co",
		status: "pending",
		api_connected: false,
		stock_indicator: "none",
		assigned_product_count: 0,
		created_at: "2026-04-01T15:00:00Z",
	},
];

export const suppliers: Supplier[] = byScenario({ empty: [], settled: SEED_SUPPLIERS });

/** The supplier the supplier portal is signed in as, which exists in every state. */
export const ownSupplier: Supplier = SEED_SUPPLIERS[0]!;
