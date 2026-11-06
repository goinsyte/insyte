import { useState } from "react";

export type OnboardingPersona = "admin" | "supplier" | "affiliate";

export type OnboardingData = Record<string, unknown>;

/* In-memory onboarding state.

   Earlier versions persisted to localStorage so a half-finished flow
   could be resumed. That's intentionally gone: every fresh page visit
   returns to the start so users can change role any time. State lives
   only as long as the route is mounted.

   The `initial` argument lets the route seed state from the URL on
   first render (deep links, invite emails, browser back). Without it,
   stepIndex=0 on mount would race with URL→state effects and reset the
   URL before the deep link could apply. */

export function useOnboardingState(initial?: {
	persona?: OnboardingPersona | null;
	stepIndex?: number;
}) {
	const [persona, setPersonaState] = useState<OnboardingPersona | null>(
		initial?.persona ?? null,
	);
	const [stepIndex, setStepIndexState] = useState(initial?.stepIndex ?? 0);
	const [data, setDataState] = useState<OnboardingData>({});

	return {
		// `hydrated` is kept on the surface (the route reads it) but it's
		// always true now since there's no async hydration. Callers can
		// short-circuit cleanly without a flash of blank.
		hydrated: true,
		persona,
		setPersona: (p: OnboardingPersona | null) => {
			setPersonaState(p);
			setStepIndexState(0);
			// The account belongs to the person, not the role: switching role keeps who they are
			// (and the drawing keeps its owner) and drops only what the old role asked for.
			setDataState((d) => ({ email: d.email, name: d.name, password: d.password }));
		},
		stepIndex,
		setStepIndex: setStepIndexState,
		// Atomic resume: set persona + step (+ payload) together. `setPersona`
		// resets the step to 0, so resuming via it would race; this doesn't.
		resumeTo: (
			p: OnboardingPersona | null,
			idx: number,
			d?: OnboardingData,
		) => {
			setPersonaState(p);
			setStepIndexState(idx);
			setDataState(d ?? {});
		},
		next: () => setStepIndexState((i) => i + 1),
		back: () => setStepIndexState((i) => Math.max(0, i - 1)),
		data,
		patch: (p: OnboardingData) => setDataState((d) => ({ ...d, ...p })),
		reset: () => {
			setPersonaState(null);
			setStepIndexState(0);
			setDataState({});
		},
	};
}
