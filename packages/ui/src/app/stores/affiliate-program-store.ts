import { create } from "zustand";
import {
	type AffiliateInvite,
	type Application,
	type PayoutLine,
	type ProgramAffiliate,
	seedAffiliateInvites,
	seedApplications,
	seedPayouts,
	seedProgramAffiliates,
	type Tier,
	tierOf,
} from "../../data-source";

/*
 * The brand's side of the partner programme, in memory like the rest of the workspace. Every action
 * hands back what was there before, so the caller can offer Undo by putting it back.
 */

type Snapshot = Pick<ProgramState, "applications" | "affiliates" | "payouts" | "approved" | "invites">;

type ProgramState = {
	applications: Application[];
	affiliates: ProgramAffiliate[];
	payouts: PayoutLine[];
	/** Affiliate ids whose payout for the month has been approved, with when. */
	approved: Record<string, number>;
	invites: AffiliateInvite[];

	snapshot: () => Snapshot;
	restore: (s: Snapshot) => void;
	approve: (appId: string, tier: Tier) => void;
	reject: (appId: string, reason: string) => void;
	setTier: (affiliateId: string, tier: Tier) => void;
	togglePause: (affiliateId: string) => void;
	approvePayouts: (affiliateIds: string[]) => void;
	addInvite: (invite: AffiliateInvite) => void;
	removeInvite: (id: string) => void;
	resendInvite: (id: string) => void;
	acceptInvite: (id: string) => void;
};

const DAY = 86_400_000;
const code = (name: string) => (name.split(" ")[0] ?? name).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "PARTNER";

export const useProgram = create<ProgramState>()((set, get) => ({
	applications: seedApplications(),
	affiliates: seedProgramAffiliates(),
	payouts: seedPayouts(),
	approved: {},
	invites: seedAffiliateInvites(),

	snapshot: () => {
		const { applications, affiliates, payouts, approved, invites } = get();
		return { applications, affiliates, payouts, approved, invites };
	},
	restore: (s) => set(s),
	approve: (appId, tier) => {
		const app = get().applications.find((a) => a.id === appId);
		if (!app) return;
		const t = tierOf(tier);
		set((s) => ({
			applications: s.applications.map((a) => (a.id === appId ? { ...a, status: "approved", decidedAt: Date.now() } : a)),
			affiliates: [{ id: app.id, name: app.name, email: app.email, code: code(app.name), tier, rate: t.rate, joinedAt: Date.now(), conversions: 0, earned: 0 }, ...s.affiliates],
		}));
	},
	reject: (appId, reason) =>
		set((s) => ({ applications: s.applications.map((a) => (a.id === appId ? { ...a, status: "rejected", reason, decidedAt: Date.now() } : a)) })),
	setTier: (affiliateId, tier) => set((s) => ({ affiliates: s.affiliates.map((a) => (a.id === affiliateId ? { ...a, tier, rate: tierOf(tier).rate } : a)) })),
	togglePause: (affiliateId) => set((s) => ({ affiliates: s.affiliates.map((a) => (a.id === affiliateId ? { ...a, paused: !a.paused } : a)) })),
	approvePayouts: (ids) => set((s) => ({ approved: { ...s.approved, ...Object.fromEntries(ids.map((id) => [id, Date.now()])) } })),
	addInvite: (invite) => set((s) => ({ invites: [invite, ...s.invites.filter((i) => i.id !== invite.id)] })),
	removeInvite: (id) => set((s) => ({ invites: s.invites.filter((i) => i.id !== id) })),
	resendInvite: (id) => set((s) => ({ invites: s.invites.map((i) => (i.id === id ? { ...i, sentAt: Date.now(), expiresAt: Date.now() + 14 * DAY } : i)) })),
	acceptInvite: (id) => {
		const inv = get().invites.find((i) => i.id === id);
		if (!inv) return;
		set((s) => ({
			invites: s.invites.filter((i) => i.id !== id),
			affiliates: [{ id: `aff_${id}`, name: inv.name, email: inv.email, code: code(inv.name), tier: inv.tier, rate: tierOf(inv.tier).rate, joinedAt: Date.now(), conversions: 0, earned: 0 }, ...s.affiliates],
		}));
	},
}));
