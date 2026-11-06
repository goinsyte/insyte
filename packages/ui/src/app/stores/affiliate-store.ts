import { create } from "zustand";
import { persist } from "zustand/middleware";
import { currentAffiliateByState } from "../../data-source";
import type { ReferralLink } from "../lib/types/domain";

/*
 * What the affiliate changes in the demo: links it made, where payouts go and its profile. The
 * mock data stays the seed; this store holds the affiliate's own edits on top of it, persisted per
 * browser.
 */

export type PayoutMethod = "paypal" | "bank" | "wise";
export type PaymentSettings = { method: PayoutMethod; account: string; tax_id: string };
export type AffiliateProfile = { name: string; email: string; referral_code: string };

export const METHOD_LABEL: Record<PayoutMethod, string> = {
	paypal: "PayPal",
	bank: "Bankoverschrijving",
	wise: "Wise",
};

export const TIER_LABEL: Record<"bronze" | "silver" | "gold", string> = {
	bronze: "Brons",
	silver: "Zilver",
	gold: "Goud",
};


const SEED = currentAffiliateByState.approved;

type AffiliateState = {
	links: ReferralLink[];
	payment: PaymentSettings;
	profile: AffiliateProfile;
	addLink: (l: ReferralLink) => void;
	removeLink: (id: string) => void;
	savePayment: (p: PaymentSettings) => void;
	saveProfile: (p: AffiliateProfile) => void;
};

export const useAffiliate = create<AffiliateState>()(
	persist(
		(set) => ({
			links: [],
			payment: { method: "paypal", account: SEED.email, tax_id: "" },
			profile: { name: SEED.name, email: SEED.email, referral_code: SEED.referral_code },
			addLink: (l) => set((s) => ({ links: [l, ...s.links] })),
			removeLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),
			savePayment: (payment) => set({ payment }),
			saveProfile: (profile) => set({ profile }),
		}),
		{ name: "insyte:affiliate:v1", version: 1 },
	),
);
