import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ownSupplier } from "../../data-source";
import type { Supplier } from "../lib/types/domain";

/*
 * What the supplier changes in the demo that the brand does not need to see: how each product
 * reports stock, the API connection, its business details and what it wants to hear about. Work on
 * orders, stock counts and shared media live in the workspace, because the brand sees those.
 */

export type StockIndicator = Supplier["stock_indicator"];
export type ConnectionTest = { ok: boolean; at: string; ms: number };
export type SupplierProfile = { name: string; contact_email: string; contact_phone: string; description: string; logo: string | null };
export type Platform = "custom" | "aliexpress" | "cj" | "spocket" | "modalyst" | "none";
export type NotifyPrefs = { newOrder: boolean; digest: boolean; message: boolean; late: boolean };

const SEED = ownSupplier;

type SupplierState = {
	indicators: Record<string, StockIndicator>;
	api: { enabled: boolean; platform: Platform; url: string; key: string; lastTest: ConnectionTest | null };
	profile: SupplierProfile;
	notify: NotifyPrefs;
	setIndicator: (productId: string, mode: StockIndicator) => void;
	patchApi: (p: Partial<SupplierState["api"]>) => void;
	saveProfile: (p: SupplierProfile) => void;
	setNotify: (p: Partial<NotifyPrefs>) => void;
};

const DEFAULT_PROFILE: SupplierProfile = {
	name: SEED.name,
	contact_email: SEED.contact_email,
	contact_phone: SEED.contact_phone ?? "",
	description: "Jassen, truien en broeken. Gemiddeld twee dagen tot overdracht, minimale afname 20 stuks per variant.",
	logo: null,
};
const DEFAULT_NOTIFY: NotifyPrefs = { newOrder: true, digest: true, message: true, late: true };

export const useSupplier = create<SupplierState>()(
	persist(
		(set) => ({
			indicators: {},
			api: { enabled: true, platform: "custom", url: "https://allure.example/insyte/webhook", key: "sk_live_allure_4f9a", lastTest: null },
			profile: DEFAULT_PROFILE,
			notify: DEFAULT_NOTIFY,
			setIndicator: (productId, mode) => set((st) => ({ indicators: { ...st.indicators, [productId]: mode } })),
			patchApi: (p) => set((st) => ({ api: { ...st.api, ...p } })),
			saveProfile: (profile) => set({ profile }),
			setNotify: (p) => set((st) => ({ notify: { ...st.notify, ...p } })),
		}),
		{
			name: "insyte:supplier:v1",
			version: 2,
			// Version 2 added the description, logo, platform and notification preferences.
			migrate: (old) => {
				const s = old as Partial<SupplierState>;
				return {
					...s,
					profile: { ...DEFAULT_PROFILE, ...s.profile },
					api: { ...(s.api as SupplierState["api"]), platform: (s.api as Partial<SupplierState["api"]> | undefined)?.platform ?? "custom" },
					notify: { ...DEFAULT_NOTIFY, ...s.notify },
				} as SupplierState;
			},
		},
	),
);
