import { byScenario } from "../scenario";
import type { ReferralLink } from "@insyte/ui/app/lib/types/domain";

const SEED_REFERRALLINKS: ReferralLink[] = [
	{
		id: "ref_1",
		affiliate_id: "aff_priya",
		label: "Instagram bio",
		url: "northwind.co/p/priya10",
		clicks: 4218,
		conversions: 312,
		revenue: 18420,
		created_at: "2025-11-04T10:00:00Z",
	},
	{
		id: "ref_2",
		affiliate_id: "aff_priya",
		label: "Lookbook voorjaar",
		url: "northwind.co/lb/priya-spring",
		clicks: 1822,
		conversions: 148,
		revenue: 9210,
		created_at: "2026-03-12T10:00:00Z",
	},
	{
		id: "ref_3",
		affiliate_id: "aff_priya",
		label: "YouTube-video · Aurora-review",
		url: "northwind.co/r/aurora-yt",
		clicks: 894,
		conversions: 41,
		revenue: 3650,
		created_at: "2026-04-22T10:00:00Z",
	},
];

export const referralLinks: ReferralLink[] = byScenario({ empty: [], settled: SEED_REFERRALLINKS });

export const referralStats = {
	total_clicks: 6934,
	total_conversions: 501,
	conversion_rate: 7.2,
	total_revenue: 31280,
	pending_payout: 4692,
	lifetime_payout: 18420,
};

export const referralPerformance = [
	{ label: "28 mrt", clicks: 410, conversions: 28 },
	{ label: "4 apr", clicks: 482, conversions: 33 },
	{ label: "11 apr", clicks: 521, conversions: 38 },
	{ label: "18 apr", clicks: 612, conversions: 44 },
	{ label: "25 apr", clicks: 698, conversions: 51 },
	{ label: "2 mei", clicks: 740, conversions: 56 },
	{ label: "9 mei", clicks: 802, conversions: 62 },
	{ label: "16 mei", clicks: 891, conversions: 69 },
];
