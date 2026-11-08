import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUSY_CUSTOM, completeRole, type RoleDef, SEED_CUSTOM, SYSTEM_DEFAULTS, SYSTEM_ORDER } from "../lib/permissions";
import { byScenario, SCENARIO, type Scenario } from "../../data-source";

/*
 * The settings the demo keeps once they are changed: the plan and the card on file, the sign-in
 * rules, the roles and what each may do, how long a closed store's records stay readable, the alert thresholds,
 * and the scopes taken back from installed apps. Persisted per browser, like the board, so a change
 * made on one settings page is still there after the operator walks to another.
 */

export type PlanTier = "starter" | "growth" | "scale";
export type BillingCycle = "monthly" | "annual";
export type Card = { brand: string; last4: string; expiry: string };
export type Role = RoleDef;
export type RetentionDays = 30 | 90 | 180;
export type Alerts = { delayHours: number; disputeAmount: number };
export type Feedback = { category: string; message: string; at: number };

const ROLE_SEED = (): Role[] => [
	...SYSTEM_ORDER.map((id) => SYSTEM_DEFAULTS[id]!),
	...byScenario({ empty: [] as Role[], settled: SEED_CUSTOM, busy: () => BUSY_CUSTOM }),
];

export type SettingsState = {
	plan: PlanTier;
	cycle: BillingCycle;
	/** The date the subscription stops, once the operator has cancelled it. */
	cancelsOn: string | null;
	card: Card;
	mfa: boolean;
	enforceMfa: boolean;
	sso: boolean;
	revokedSessions: string[];
	roles: Role[];
	/** The design state the roles were seeded under; a copy from another state is dropped on load. */
	rolesScenario: Scenario;
	retentionDays: RetentionDays;
	alerts: Alerts;
	/** Scopes an installed app no longer has, by app id. */
	revokedScopes: Record<string, string[]>;
	/** The simulated settings inside an opened app, by app id then setting. */
	appSettings: Record<string, Record<string, boolean>>;
	feedback: Feedback[];

	setPlan: (plan: PlanTier, cycle: BillingCycle) => void;
	setCancelsOn: (date: string | null) => void;
	setCard: (card: Card) => void;
	setAuth: (patch: Partial<Pick<SettingsState, "mfa" | "enforceMfa" | "sso">>) => void;
	revokeSession: (id: string) => void;
	restoreSession: (id: string) => void;
	addRole: (role: Role, index?: number) => void;
	updateRole: (id: string, patch: Partial<Role>) => void;
	/** Takes a role out and says where it stood, for the undo. */
	removeRole: (id: string) => { role: Role; index: number } | undefined;
	resetRole: (id: string) => void;
	setRetention: (days: RetentionDays) => void;
	setAlerts: (alerts: Alerts) => void;
	setRevokedScopes: (appId: string, scopes: string[]) => void;
	setAppSetting: (appId: string, key: string, value: boolean) => void;
	addFeedback: (f: Feedback) => void;
};

export const useSettings = create<SettingsState>()(
	persist(
		(set, get) => ({
			plan: "scale",
			cycle: "monthly",
			cancelsOn: null,
			card: { brand: "Visa", last4: "4242", expiry: "06/2028" },
			mfa: true,
			enforceMfa: false,
			sso: true,
			revokedSessions: [],
			roles: ROLE_SEED(),
			rolesScenario: SCENARIO,
			retentionDays: 90,
			alerts: { delayHours: 48, disputeAmount: 250 },
			revokedScopes: {},
			appSettings: {},
			feedback: [],

			setPlan: (plan, cycle) => set({ plan, cycle }),
			setCancelsOn: (cancelsOn) => set({ cancelsOn }),
			setCard: (card) => set({ card }),
			setAuth: (patch) => set(patch),
			revokeSession: (id) => set((s) => ({ revokedSessions: [...s.revokedSessions, id] })),
			restoreSession: (id) => set((s) => ({ revokedSessions: s.revokedSessions.filter((r) => r !== id) })),
			addRole: (role, index) =>
				set((s) => {
					const roles = s.roles.filter((r) => r.id !== role.id);
					roles.splice(index ?? roles.length, 0, role);
					return { roles };
				}),
			updateRole: (id, patch) => set((s) => ({ roles: s.roles.map((r) => (r.id === id && id !== "owner" ? { ...r, ...patch } : r)) })),
			removeRole: (id) => {
				const index = get().roles.findIndex((r) => r.id === id);
				const role = get().roles[index];
				if (!role?.custom) return undefined;
				set((s) => ({ roles: s.roles.filter((r) => r.id !== id) }));
				return { role, index };
			},
			resetRole: (id) => {
				const base = SYSTEM_DEFAULTS[id];
				if (base) set((s) => ({ roles: s.roles.map((r) => (r.id === id ? base : r)) }));
			},
			setRetention: (retentionDays) => set({ retentionDays }),
			setAlerts: (alerts) => set({ alerts }),
			setRevokedScopes: (appId, scopes) => set((s) => ({ revokedScopes: { ...s.revokedScopes, [appId]: scopes } })),
			setAppSetting: (appId, key, value) =>
				set((s) => ({ appSettings: { ...s.appSettings, [appId]: { ...s.appSettings[appId], [key]: value } } })),
			addFeedback: (f) => set((s) => ({ feedback: [f, ...s.feedback] })),
		}),
		{
			name: "insyte:settings:v1",
			version: 7,
			/*
			 * Version 4 is roles with levels: an area at Geen, Bekijken, Bewerken or Beheren, special
			 * actions, a refund limit and store scope, instead of nine yes-or-no rights. The old matrix
			 * cannot be read into that, so the roles start again from the seed; a custom role the
			 * operator made keeps its name and id, so the people holding it keep it, and starts from
			 * Alleen lezen.
			 */
			migrate: (old, version) => {
				const s = old as Partial<SettingsState> & { matrix?: unknown };
				if (version < 4) {
					const { matrix: _old, ...rest } = s;
					const seed = ROLE_SEED();
					const kept = (s.roles ?? [])
						.filter((r) => r.custom && !seed.some((x) => x.id === r.id))
						.map((r): Role => ({ ...SYSTEM_DEFAULTS.view!, id: r.id, label: r.label, system: false, custom: true, basedOn: "view", description: undefined }));
					return { ...rest, roles: [...seed, ...kept], rolesScenario: SCENARIO } as SettingsState;
				}
				// Version 5 added Zelfstandigheid van Insyte instellen (ai.autonomy), version 6 the Retouren
				// area and Retouren goedkeuren (returns.approve), version 7 Kwaliteit goedkeuren and
				// Productfase wijzigen; every later catalogue
				// addition is filled the same way, so a stored role never has a hole in it.
				return { ...s, roles: (s.roles ?? []).map(completeRole) } as SettingsState;
			},
			// Roles seeded under another design state belong to that state.
			merge: (persisted, current) => {
				const p = persisted as Partial<SettingsState> | undefined;
				if (!p) return current;
				if (p.rolesScenario !== SCENARIO) return { ...current, ...p, roles: current.roles, rolesScenario: SCENARIO };
				return { ...current, ...p };
			},
		},
	),
);
