import { ArrowLeft, ArrowRight, ArrowUpRight, Loader, X } from "../../icons";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { createContext, type ReactNode, useEffect, useRef, useState } from "react";
import { InsyteMark } from "../../brand/mark";
import { ContactEmail } from "../../lib/contact-email";
import { FormError } from "../common/form-error";
import { cn } from "../lib/utils";
import { brandLine } from "./brand-copy";
import type { OnboardingPersona } from "./use-onboarding-state";

/* ─────────────────────────────────────────────────────────────────────
   OnboardingShell — the same two halves as /login.

   The form half is /login's: the grey ground, a 400px column, a 24px
   title over one quiet line, white fields. The brand half is /login's
   too — Abyss field, wordmark, the 56px headline — but the headline
   changes with the step (`brand-copy.ts`), so the half that used to
   repeat one tagline says why the current question is worth answering.

   Steps move along a direction: forward slides in from the right, Back
   from the left, so the flow reads as a sequence rather than a fade
   between unrelated cards. A primary action that does work shows it —
   a spinner and the verb in progress — and an error shakes once.

   StepDef API unchanged so step builders don't move; `busyLabel` is new
   and optional.
   ───────────────────────────────────────────────────────────────────── */

export type StepDef = {
	id: string;
	title: string;
	subtitle?: string;
	optional?: boolean;
	canContinue?: boolean;
	primaryLabel?: string;
	/** What the primary button says while its work runs: "Creating your account". */
	busyLabel?: string;
	onPrimary?: () => void | Promise<void>;
	hidePrimary?: boolean;
	content: ReactNode;
};

/* The shell's Back, for step content that offers its own way back ("Wrong address?") without
   every step builder taking it as an argument. */
export const OnboardingBackContext = createContext<() => void>(() => {});

export const PERSONA_LABEL: Record<OnboardingPersona, string> = {
	admin: "Admin",
	supplier: "Leverancier",
	affiliate: "Affiliate",
};


/* The least a piece of work should look like it takes. Without it a mocked call resolves in the
   same frame and the button flickers; with it the spinner reads as work being done. */
const MIN_BUSY_MS = 550;

export function OnboardingShell({
	persona,
	steps,
	stepIndex,
	onBack,
	onChangeRole,
	onExit,
}: {
	/** `null` while the shared head (account → verify → role pick) runs;
	    set once the user picks a role and the persona-specific tail loads. */
	persona: OnboardingPersona | null;
	steps: StepDef[];
	stepIndex: number;
	onBack: () => void;
	onChangeRole: () => void;
	onExit: () => void;
}) {
	const still = useReducedMotion();
	const total = steps.length;
	const safeIndex = Math.min(Math.max(stepIndex, 0), total - 1);
	const step = steps[safeIndex];
	const minutesLeft = Math.max(1, Math.round((total - safeIndex) * 1.2));

	/* Which way the flow is moving, for the slide. Read from the previous index on each change. */
	const previous = useRef(safeIndex);
	const direction = safeIndex >= previous.current ? 1 : -1;
	useEffect(() => {
		previous.current = safeIndex;
	}, [safeIndex]);

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [shake, setShake] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: clear the error when the step changes.
	useEffect(() => setError(null), [step.id]);
	async function runPrimary() {
		if (busy || !step.onPrimary) return;
		setError(null);
		setBusy(true);
		try {
			await new Promise((r) => setTimeout(r, MIN_BUSY_MS));
			await step.onPrimary();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Er ging iets mis. Probeer het opnieuw.");
			setShake((n) => n + 1);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="grid min-h-svh grid-rows-[auto_1fr] bg-background text-ink lg:grid-cols-2 lg:grid-rows-1">
			<BrandHalf
				persona={persona}
				stepId={step.id}
				minutesLeft={minutesLeft}
				onChangeRole={persona ? onChangeRole : undefined}
			/>

			<section className="onboarding-form relative flex flex-col">
				<header className="flex items-center gap-4 px-6 pt-5 sm:px-10">
					<Progress index={safeIndex} total={total} />
					<button
						type="button"
						aria-label="Onboarding sluiten"
						onClick={onExit}
						className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						<X className="size-4" strokeWidth={1.75} />
					</button>
				</header>

				<main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col px-6 pt-[clamp(32px,11vh,120px)] pb-12 sm:px-0">
					<AnimatePresence mode="wait" initial={false} custom={direction}>
						<motion.div
							key={step.id}
							custom={direction}
							variants={still ? undefined : STEP_MOTION}
							initial="enter"
							animate="center"
							exit="leave"
							className="flex flex-col"
						>
							<header className="mb-6 flex flex-col gap-1.5">
								<h1 className="font-medium text-2xl text-ink leading-tight">{step.title}</h1>
								{step.subtitle ? <p className="text-sm text-ink-2 leading-normal">{step.subtitle}</p> : null}
							</header>

							<OnboardingBackContext.Provider value={onBack}>
								<div className="flex flex-col gap-3">{step.content}</div>
							</OnboardingBackContext.Provider>

							<AnimatePresence>
								{error ? (
									<motion.div
										key={`error-${shake}`}
										className="mt-4"
										initial={still ? false : { opacity: 0, x: 0 }}
										animate={still ? { opacity: 1 } : { opacity: 1, x: [0, -6, 5, -3, 2, 0] }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.36 }}
									>
										<FormError message={error} />
									</motion.div>
								) : null}
							</AnimatePresence>

							{!step.hidePrimary ? (
								<footer className="mt-8 flex items-center justify-between gap-3">
									<button
										type="button"
										onClick={onBack}
										disabled={safeIndex === 0 || busy}
										className="-ml-2 flex h-11 items-center gap-1.5 rounded-lg px-2 font-medium text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-0"
									>
										<ArrowLeft className="size-4" strokeWidth={1.75} />
										Terug
									</button>
									<div className="flex items-center gap-1">
										{step.optional ? (
											<button
												type="button"
												onClick={runPrimary}
												disabled={busy}
												className="flex h-11 items-center justify-center rounded-lg px-3 font-medium text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-50"
											>
												Overslaan
											</button>
										) : null}
										<PrimaryButton
											busy={busy}
											disabled={step.canContinue === false}
											label={step.primaryLabel ?? "Doorgaan"}
											busyLabel={step.busyLabel ?? "Bezig met opslaan"}
											onClick={runPrimary}
										/>
									</div>
								</footer>
							) : null}
						</motion.div>
					</AnimatePresence>
				</main>
			</section>
		</div>
	);
}

const STEP_MOTION: Variants = {
	enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
	center: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
	leave: (dir: number) => ({ opacity: 0, x: dir * -20, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }),
};

/*
 * The primary action. Its width springs between the label and the busy state so the button does
 * not jump, and the label and the spinner cross-fade instead of swapping in one frame.
 */
function PrimaryButton({
	busy,
	disabled,
	label,
	busyLabel,
	onClick,
}: {
	busy: boolean;
	disabled: boolean;
	label: string;
	busyLabel: string;
	onClick: () => void;
}) {
	const still = useReducedMotion();
	return (
		<motion.button
			type="button"
			layout={!still}
			transition={{ type: "spring", stiffness: 500, damping: 38 }}
			onClick={onClick}
			disabled={disabled || busy}
			aria-busy={busy}
			className={cn(
				"group/cta flex h-11 items-center gap-2 overflow-hidden rounded-lg bg-abyss px-4 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2",
				"disabled:cursor-not-allowed",
				disabled && !busy && "opacity-50",
			)}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				{busy ? (
					<motion.span
						key="busy"
						className="flex items-center gap-2"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.16 }}
					>
						<Loader className="size-4 animate-spin" strokeWidth={2} />
						{busyLabel}
					</motion.span>
				) : (
					<motion.span
						key="idle"
						className="flex items-center gap-2"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.16 }}
					>
						{label}
						<ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={2} />
					</motion.span>
				)}
			</AnimatePresence>
		</motion.button>
	);
}

/* One segment per step: the done ones filled, the current one filling, the rest waiting. Counts
   the way the visitor does — "Step 4 of 9" — rather than a zero-padded counter. */
function Progress({ index, total }: { index: number; total: number }) {
	return (
		<div className="flex flex-1 items-center gap-3">
			<div className="flex flex-1 items-center gap-1" aria-hidden>
				{Array.from({ length: total }, (_, i) => (
					<span key={i} className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink/8">
						<motion.span
							className="absolute inset-0 origin-left rounded-full bg-arc"
							initial={false}
							animate={{ scaleX: i <= index ? 1 : 0 }}
							transition={{ type: "spring", stiffness: 260, damping: 30, delay: i === index ? 0.12 : 0 }}
						/>
					</span>
				))}
			</div>
			<span className="shrink-0 font-medium text-xs text-ink-2 tabular-nums">
				Stap {index + 1} van {total}
			</span>
		</div>
	);
}

/* ──────────────────────────────────────────────────────────────────────
   BrandHalf — /login's brand half, with the drawing where the headline was.
   ────────────────────────────────────────────────────────────────────── */

function BrandHalf({
	persona,
	stepId,
	minutesLeft,
	onChangeRole,
}: {
	persona: OnboardingPersona | null;
	stepId: string;
	minutesLeft: number;
	onChangeRole?: () => void;
}) {
	const still = useReducedMotion();
	const line = brandLine(persona, stepId);
	/* Two steps can share a line (the bookend opens and closes the flow); keying on the words rather
	   than the step means the same line never animates out and back in. */
	const key = `${line.lead}|${line.accent}|${line.body}`;
	return (
		<>
			<aside className="relative isolate hidden flex-col overflow-hidden bg-stripe-mesh-dark px-12 py-12 text-mesh-ink lg:flex xl:px-16">
				<Atmosphere />
				<div className="relative z-10 flex items-center gap-2.5">
					<InsyteMark size={22} tone="white" />
					<span className="font-medium text-lg tracking-tight">insyte</span>
				</div>

				<div className="relative z-10 my-auto flex min-h-[300px] flex-col justify-center gap-5 py-8">
					<AnimatePresence mode="wait" initial={false}>
						<motion.div key={key} className="flex flex-col gap-5">
							<h1 className="font-medium text-[56px] leading-[1.02] tracking-[-2px]" aria-live="polite">
								{[line.lead, null, line.accent, line.tail].map((part, i) =>
									part === null ? (
										<br key="br" />
									) : part ? (
										<motion.span
											key={i}
											className={cn("inline-block", i === 2 && "text-arc-ink")}
											initial={still ? false : { opacity: 0, y: 18, filter: "blur(6px)" }}
											animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
											exit={still ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.16 } }}
											transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: i * 0.06 }}
										>
											{part}
											{i === 2 && line.tail ? "\u00a0" : null}
										</motion.span>
									) : null,
								)}
							</h1>
							<motion.p
								className="max-w-[42ch] text-md text-mesh-ink/75 leading-relaxed"
								initial={still ? false : { opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, transition: { duration: 0.12 } }}
								transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}
							>
								{line.body}
							</motion.p>
						</motion.div>
					</AnimatePresence>
					{persona ? <span className="text-sm text-mesh-ink-2 tabular-nums">nog ~{minutesLeft} min</span> : null}
				</div>

				<div className="relative z-10 flex items-center justify-between text-xs">
					<ContactEmail name="support" className="font-medium text-mesh-ink/70 transition-colors hover:text-mesh-ink" />
					{onChangeRole ? (
						<button
							type="button"
							onClick={onChangeRole}
							className="group inline-flex items-center gap-1 font-medium text-mesh-ink/70 transition-colors hover:text-mesh-ink"
						>
							Rol wijzigen
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
						</button>
					) : null}
				</div>
			</aside>

			{/* Mobile: the wordmark and where you are, without the drawing. */}
			<aside className="relative isolate flex items-center justify-between overflow-hidden bg-stripe-mesh-dark px-5 py-4 text-mesh-ink lg:hidden">
				<div className="relative z-10 flex items-center gap-2">
					<InsyteMark size={20} tone="white" />
					<span className="font-medium text-md tracking-tight">insyte</span>
				</div>
				{persona ? (
					<div className="relative z-10 flex items-center gap-3 text-xs text-mesh-ink-2">
						<span className="tabular-nums">
							{PERSONA_LABEL[persona]} · ~{minutesLeft} min
						</span>
						{onChangeRole ? (
							<button type="button" onClick={onChangeRole} className="font-medium text-mesh-ink transition-colors hover:text-mesh-ink-2">
								Wijzigen
							</button>
						) : null}
					</div>
				) : null}
			</aside>
		</>
	);
}

/* /login's weather, lighter: one arc orb, one sky orb and the dot grid, so the headline in front of
   it stays the subject. */
function Atmosphere() {
	return (
		<>
			<div
				className="glow-orb glow-orb--arc anim-orb-drift"
				style={{ width: 680, height: 680, top: -260, left: -220, opacity: 0.8 }}
				aria-hidden
			/>
			<div
				className="glow-orb glow-orb--sky anim-orb-drift-slow"
				style={{ width: 520, height: 520, bottom: -220, right: -180, opacity: 0.55 }}
				aria-hidden
			/>
			<div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-40" aria-hidden />
			<div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />
		</>
	);
}
