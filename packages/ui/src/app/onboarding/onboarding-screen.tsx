import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { adminSteps } from "./admin-steps";
import { affiliateSteps } from "./affiliate-steps";
import { OnboardingShell } from "./onboarding-shell";
import { sharedHeadSteps } from "./shared-steps";
import { supplierSteps } from "./supplier-steps";
import {
	type OnboardingPersona,
	useOnboardingState,
} from "./use-onboarding-state";
import { setPersonaSelection } from "../hooks/use-persona";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { SERVER_STEP_TO_INDEX } from "../lib/onboarding-api";

const Route = getRouteApi("/onboarding/");

export function OnboardingPage() {
	const navigate = useNavigate({ from: "/onboarding/" });
	const searchParams = Route.useSearch();
	// Seed from the URL on first mount so a deep link or invite-email
	// landing renders the correct step immediately, without a first-frame
	// flash of step 0.
	const state = useOnboardingState({
		persona: searchParams.persona ?? null,
		stepIndex: typeof searchParams.step === "number" ? searchParams.step : 0,
	});

	// Sync URL → state for deep links + back/forward. The appliedFromUrl ref
	// prevents this from fighting the state→URL effect — each one records
	// the version it just wrote so the other can recognize an echo and skip.
	const appliedFromUrl = useRef<{ persona: string | null; step: number }>({
		persona: null,
		step: -1,
	});
	useEffect(() => {
		const last = appliedFromUrl.current;
		const desiredPersona = searchParams.persona ?? null;
		const desiredStep =
			typeof searchParams.step === "number" ? searchParams.step : null;
		if (
			desiredPersona === last.persona &&
			(desiredStep === null || desiredStep === last.step)
		) {
			return;
		}
		if (desiredPersona && desiredPersona !== state.persona) {
			state.setPersona(desiredPersona);
		}
		if (desiredStep !== null && desiredStep !== state.stepIndex) {
			state.setStepIndex(desiredStep);
		}
		appliedFromUrl.current = {
			persona: desiredPersona,
			step: desiredStep ?? state.stepIndex,
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams.persona, searchParams.step]);

	// Sync state → URL (shareable + back-button friendly).
	useEffect(() => {
		appliedFromUrl.current = {
			persona: state.persona,
			step: state.stepIndex,
		};
		navigate({
			search: {
				...(state.persona ? { persona: state.persona } : {}),
				step: state.stepIndex,
			},
			replace: true,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.persona, state.stepIndex]);

	// Resume from the server's saved progress on first mount (authenticated
	// users only — the server owns which step). New visitors with no session
	// start fresh at the account step. Admin persona only for now.
	const resumed = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: resume runs once on mount.
	useEffect(() => {
		if (resumed.current) return;
		resumed.current = true;
		void (async () => {
			const { data: sess } = await authClient.getSession();
			if (!sess) return;
			const { data } = await api.onboarding.me.get();
			const step = data?.nextStep;
			const idx = step ? SERVER_STEP_TO_INDEX[step] : undefined;
			if (idx === undefined || idx === 0) return;
			const payload =
				data?.payload && typeof data.payload === "object"
					? (data.payload as Record<string, unknown>)
					: undefined;
			state.resumeTo("admin", idx, payload);
		})();
	}, []);

	const persona = state.persona;

	const finishToDashboard = () => {
		state.reset();
		// A partner who has just applied is waiting on review, not approved.
		setPersonaSelection(persona === "affiliate" ? "affiliate-pending" : (persona ?? "admin"));
		const dest =
			persona === "supplier"
				? "/supplier/dashboard"
				: persona === "affiliate"
					? "/affiliate/dashboard"
					: "/dashboard";
		toast.success("Welkom bij Insyte.");

		// Cinematic exit via View Transitions where supported.
		const reduced =
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const supportsVT =
			!reduced && typeof document?.startViewTransition === "function";
		if (supportsVT) {
			document.startViewTransition(() => {
				navigate({ to: dest, search: {} as never });
			});
		} else {
			navigate({ to: dest, search: {} as never });
		}
	};

	// The flow is composed: shared head (account + verify + role pick),
	// then persona-specific steps once the user has chosen a role. Picking
	// a role from the shared head step sets state.persona AND advances
	// state.stepIndex past the head so the next render lands on step 4.
	const setPersonaFromRolePick = (p: OnboardingPersona) => {
		state.setPersona(p);
		state.setStepIndex(3);
	};

	const steps = useMemo(() => {
		const head = sharedHeadSteps({
			data: state.data,
			patch: state.patch,
			next: state.next,
			setPersona: setPersonaFromRolePick,
		});
		if (!persona) return head;
		const args = [
			state.data,
			state.patch,
			state.next,
			finishToDashboard,
		] as const;
		const tail =
			persona === "admin"
				? adminSteps(...args)
				: persona === "supplier"
					? supplierSteps(...args)
					: affiliateSteps(...args);
		return [...head, ...tail];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [persona, state.data, state.next, state.patch, finishToDashboard]);

	return (
		<OnboardingShell
			persona={(persona ?? null) as OnboardingPersona | null}
			steps={steps}
			stepIndex={state.stepIndex}
			onBack={() => {
				// Going back past the role-pick step clears persona so the user
				// lands on the role picker fresh, with the previously chosen tail
				// dropped from the step list.
				if (state.stepIndex === 3 && state.persona) {
					state.setPersona(null);
					state.setStepIndex(2);
					return;
				}
				state.back();
			}}
			onChangeRole={() => {
				state.setPersona(null);
				state.setStepIndex(2);
			}}
			onExit={() => {
				state.reset();
				navigate({ to: "/", search: {} as never });
			}}
		/>
	);
}
