import { byScenario } from "../scenario";
import type { Affiliate } from "@insyte/ui/app/lib/types/domain";

const SEED_AFFILIATES: Affiliate[] = [
	{
		id: "aff_priya",
		user_id: "user_affiliate_priya",
		name: "Priya Singh",
		email: "priya@creators.studio",
		status: "approved",
		referral_code: "PRIYA10",
		tier: "gold",
		commission_rate: 15,
		created_at: "2025-11-01T10:00:00Z",
		approved_at: "2025-11-04T10:00:00Z",
	},
	{
		id: "aff_jordan",
		user_id: "user_affiliate_jordan",
		name: "Jordan Reeves",
		email: "jordan@reeves.tv",
		status: "approved",
		referral_code: "JORDAN",
		tier: "silver",
		commission_rate: 12,
		created_at: "2026-01-08T10:00:00Z",
		approved_at: "2026-01-12T10:00:00Z",
	},
	{
		id: "aff_amara",
		user_id: "user_affiliate_amara",
		name: "Amara Idris",
		email: "amara.id@gmail.com",
		status: "pending",
		referral_code: "AMARA",
		tier: "bronze",
		commission_rate: 10,
		created_at: "2026-05-18T10:00:00Z",
	},
	{
		id: "aff_kai",
		user_id: "user_affiliate_kai",
		name: "Kai Tanaka",
		email: "kai@stylelab.jp",
		status: "rejected",
		referral_code: "KAI",
		tier: "bronze",
		commission_rate: 10,
		created_at: "2026-05-10T10:00:00Z",
		rejection_reason:
			"Je publiek overlapt met dat van een bestaande affiliate in dezelfde regio · probeer het over 6 maanden opnieuw.",
	},
];

export const affiliates: Affiliate[] = byScenario({ empty: [], settled: SEED_AFFILIATES });

export const currentAffiliateByState = {
	approved: SEED_AFFILIATES[0],
	pending: SEED_AFFILIATES[2],
	rejected: SEED_AFFILIATES[3],
};
