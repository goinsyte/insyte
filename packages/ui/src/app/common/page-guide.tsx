import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Compass, X } from "../../icons";
import { cn } from "../lib/utils";
import { type GuideArt, GuideIllustration } from "./guide-art";

/*
 * The page's explanation, kept off the page. A settings screen used to open with a paragraph, give
 * every section a sentence under its heading and end with a list of how things work: read once,
 * then scrolled past every day after. That text now lives here: a small popup that rises in the
 * bottom-right corner, shows a few short steps, each with a moving sketch of what it means, and folds
 * back into a button. The button stays, so the
 * explanation is one click away and never in the way. It never touches the page itself: no ring
 * round a section, no scrolling.
 *
 * It rises on its own sparingly: once per page ever, at most one page per browser session, and only
 * after someone has stayed on the page a moment. Clicking through the app should not be a string of
 * popups; the ones not shown yet wait for a later day, and the button is always there.
 */

export type GuideStep = {
	title: string;
	body: string;
	/** The sketch shown above the words. */
	art?: GuideArt;
};

type GuideState = { seen: Record<string, true>; markSeen: (id: string) => void };

const useGuides = create<GuideState>()(
	persist(
		(set) => ({
			seen: {},
			markSeen: (id) => set((s) => (s.seen[id] ? s : { seen: { ...s.seen, [id]: true } })),
		}),
		{ name: "insyte:guides:v1" },
	),
);

const EASE = [0.16, 1, 0.3, 1] as const;

const SESSION_KEY = "insyte:guides:auto";

function autoShownThisSession() {
	try {
		return window.sessionStorage.getItem(SESSION_KEY) === "1";
	} catch {
		return true;
	}
}

function markAutoShown() {
	try {
		window.sessionStorage.setItem(SESSION_KEY, "1");
	} catch {
		/* No storage, no auto-open next time either: the check above fails closed. */
	}
}

export function PageGuide({ id, title, steps }: { id: string; title: string; steps: ReadonlyArray<GuideStep> }) {
	const seen = useGuides((s) => s.seen[id] === true);
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const [mounted, setMounted] = useState(false);
	const reduce = useReducedMotion() ?? false;
	const headingId = useId();
	const cardRef = useRef<HTMLDivElement>(null);
	const launcherRef = useRef<HTMLButtonElement>(null);
	const current = steps[step] ?? steps[0];
	const last = step === steps.length - 1;

	useEffect(() => setMounted(true), []);

	// Rise on its own once the page has settled, without taking focus, if this session has not had one.
	useEffect(() => {
		if (seen || autoShownThisSession()) return;
		const t = window.setTimeout(() => {
			if (autoShownThisSession()) return;
			markAutoShown();
			useGuides.getState().markSeen(id);
			setOpen(true);
		}, 1600);
		return () => window.clearTimeout(t);
	}, [seen, id]);

	const close = useCallback(() => {
		setOpen(false);
		setStep(0);
		useGuides.getState().markSeen(id);
		launcherRef.current?.focus({ preventScroll: true });
	}, [id]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, close]);

	const go = (i: number) => setStep(i);

	if (!mounted || steps.length === 0 || !current) return null;

	return createPortal(
		<>
			<div className="pointer-events-none fixed right-3 bottom-14 z-40 flex flex-col items-end sm:right-5 sm:bottom-5">
				<AnimatePresence initial={false} mode="popLayout">
					{open ? (
						<motion.div
							key="card"
							ref={cardRef}
							role="dialog"
							aria-modal="false"
							aria-labelledby={headingId}
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94, filter: "blur(6px)" }}
							animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94, filter: "blur(4px)" }}
							transition={{ duration: reduce ? 0.12 : 0.42, ease: EASE }}
							style={{ transformOrigin: "100% 100%" }}
							onKeyDown={(e) => {
								if (e.key === "ArrowRight" && !last) go(step + 1);
								if (e.key === "ArrowLeft" && step > 0) go(step - 1);
							}}
							className="pointer-events-auto flex w-[min(368px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-paper shadow-[0_18px_40px_-12px_rgb(0_0_0/0.22),0_2px_6px_rgb(0_0_0/0.06)]"
						>
							<div className="relative">
								<GuideIllustration art={current.art} step={step} />
								<button
									type="button"
									onClick={close}
									aria-label="Uitleg sluiten"
									className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-mesh-ink/12 text-mesh-ink-2 transition-colors hover:bg-mesh-ink/20 hover:text-mesh-ink"
								>
									<X className="size-3.5" strokeWidth={2} />
								</button>
							</div>

							<div className="relative min-h-[112px] px-5 pt-4 pb-4">
								<AnimatePresence mode="wait" initial={false}>
									<motion.div
										key={step}
										initial={reduce ? { opacity: 0 } : { opacity: 0, x: 10, filter: "blur(3px)" }}
										animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
										exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(3px)" }}
										transition={{ duration: reduce ? 0.1 : 0.22, ease: EASE }}
										className="flex flex-col gap-1.5"
									>
										<h2 id={headingId} className="text-balance font-medium text-ink text-lg leading-snug">
											{current.title}
										</h2>
										<p className="text-pretty text-ink-2 text-sm leading-normal">{current.body}</p>
									</motion.div>
								</AnimatePresence>
							</div>

							<div className="flex flex-col gap-3 px-5 pb-5">
								<button
									type="button"
									onClick={() => (last ? close() : go(step + 1))}
									className="flex h-10 w-full items-center justify-center rounded-lg bg-abyss font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2"
								>
									{last ? "Begrepen" : "Volgende"}
								</button>
								{steps.length > 1 ? (
									<div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Stappen">
										{steps.map((s, i) => (
											<button
												key={s.title}
												type="button"
												role="tab"
												aria-selected={i === step}
												aria-label={`Stap ${i + 1} van ${steps.length}`}
												onClick={() => go(i)}
												className="group flex h-4 items-center"
											>
												<motion.span
													className={cn("block h-1.5 rounded-full", i === step ? "bg-arc" : "bg-ink/15 group-hover:bg-ink/30")}
													initial={false}
													animate={{ width: i === step ? 18 : 6 }}
													transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
												/>
											</button>
										))}
									</div>
								) : null}
							</div>
						</motion.div>
					) : (
						<motion.button
							key="launcher"
							ref={launcherRef}
							type="button"
							onClick={() => setOpen(true)}
							aria-label={`Uitleg: ${title}`}
							title="Uitleg bij deze pagina"
							initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
							transition={{ duration: reduce ? 0.1 : 0.3, ease: EASE }}
							whileHover={reduce ? undefined : { y: -1 }}
							className={cn(
								"pointer-events-auto flex size-10 items-center justify-center rounded-full bg-paper text-ink-2 shadow-[0_8px_20px_-8px_rgb(0_0_0/0.25),0_1px_3px_rgb(0_0_0/0.08)] transition-colors hover:text-arc-ink",
								"focus-visible:outline-2 focus-visible:outline-arc focus-visible:outline-offset-2",
							)}
						>
							<Compass className="size-[18px]" strokeWidth={1.75} />
						</motion.button>
					)}
				</AnimatePresence>
			</div>
		</>,
		document.body,
	);
}
