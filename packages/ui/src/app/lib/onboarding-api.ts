import { api } from "./api";

/**
 * Server step names for the admin onboarding flow → their index in the composed
 * step list (shared head: account/verify/role at 0/1/2, then the admin tail).
 * `role` has no server step; the server jumps verify → organization.
 */
export const SERVER_STEP_TO_INDEX: Record<string, number> = {
	account: 0,
	verify: 1,
	organization: 3,
	plan: 4,
	store: 5,
	sync: 6,
	optional: 7,
	ready: 8,
	dashboard: 8,
};

/**
 * Persist a completed onboarding step to the server state machine. Best-effort:
 * the in-memory flow advances regardless, so a network hiccup never blocks
 * signup, and the server is idempotent so a retry or resume reconciles.
 */
export function persistStep(
	step: string,
	data?: Record<string, unknown>,
): void {
	void api.onboarding.advance.post({ step, data }).catch(() => {});
}
